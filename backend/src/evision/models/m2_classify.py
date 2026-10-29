"""M2 - classify cities into High vs Low public-charging demand.

Two decisions that matter more than the algorithm:

1. **Predictors are exogenous only.** The label is derived from
   effective_public_demand, which is built from EV stock and charger counts.
   Feeding EV stock or charger counts back in as predictors would make the task
   nearly deterministic and inflate every metric.

2. **Validation matches the sample size.** With 51 cities a single 70/30 split
   leaves ~15 test rows, where AUC has a confidence interval of roughly ±0.25.
   We therefore use repeated stratified 5-fold CV (20 repeats) and report the
   spread, plus leave-one-out accuracy as a second view.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import LeaveOneOut, RepeatedStratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

log = logging.getLogger(__name__)

EXOGENOUS = [
    "log_density",
    "log_income",
    "fuel_price_inr_per_litre",
    "ev_policy_score",
    "highway_corridor",
    "summer_max_temp_c",
]


@dataclass
class ClassifierResult:
    n: int
    positives: int
    threshold: float
    label_col: str
    comparison: pd.DataFrame
    scores: pd.DataFrame = field(default_factory=pd.DataFrame)
    predictions: pd.DataFrame = field(default_factory=pd.DataFrame)


LABEL_PREFERRED = "effective_public_demand_10km"
LABEL_FALLBACK = "effective_public_demand"


def _prepare(
    features: pd.DataFrame,
    label_col: str,
    predictors: list[str],
) -> tuple[pd.DataFrame, pd.DataFrame, pd.Series, float]:
    df = features.copy()
    df["log_density"] = np.log(df["population_density"].clip(lower=1))
    df["log_income"] = np.log(df["per_capita_income_inr"].clip(lower=1))

    df = df.dropna(subset=[label_col, *predictors])
    threshold = float(df[label_col].median())
    y = (df[label_col] > threshold).astype(int)
    X = df[predictors].astype(float)
    return df, X, y, threshold


def _models() -> dict[str, Pipeline]:
    return {
        "Logistic": Pipeline(
            [
                ("scale", StandardScaler()),
                ("clf", LogisticRegression(C=1.0, max_iter=2000, solver="liblinear")),
            ]
        ),
        "LDA": Pipeline(
            [("scale", StandardScaler()), ("clf", LinearDiscriminantAnalysis())]
        ),
    }


def fit(
    features: pd.DataFrame,
    repeats: int = 20,
    predictors: list[str] | None = None,
) -> ClassifierResult:
    """Fit the classifier.

    ``predictors`` defaults to EXOGENOUS; pass a subset for sensitivity runs
    (e.g. without the provisional policy score).
    """
    predictors = list(predictors or EXOGENOUS)
    # prefer the fixed-10km denominator: comparable across cities, unlike the
    # 15-30 km circle that city_chargers.csv uses
    use_fixed = (
        LABEL_PREFERRED in features.columns
        and features[LABEL_PREFERRED].notna().sum() > 0
    )
    label_col = LABEL_PREFERRED if use_fixed else LABEL_FALLBACK

    df, X, y, threshold = _prepare(features, label_col, predictors)
    n, pos = len(df), int(y.sum())
    log.info("M2: n=%d positives=%d label=%s", n, pos, label_col)

    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=repeats, random_state=42)
    loo = LeaveOneOut()

    rows = []
    for name, model in _models().items():
        aucs, accs, f1s, precs, recs = [], [], [], [], []
        for train_idx, test_idx in cv.split(X, y):
            if y.iloc[train_idx].nunique() < 2 or y.iloc[test_idx].nunique() < 2:
                continue
            m = model.fit(X.iloc[train_idx], y.iloc[train_idx])
            proba = m.predict_proba(X.iloc[test_idx])[:, 1]
            pred = (proba >= 0.5).astype(int)
            aucs.append(roc_auc_score(y.iloc[test_idx], proba))
            accs.append(accuracy_score(y.iloc[test_idx], pred))
            f1s.append(f1_score(y.iloc[test_idx], pred, zero_division=0))
            precs.append(precision_score(y.iloc[test_idx], pred, zero_division=0))
            recs.append(recall_score(y.iloc[test_idx], pred, zero_division=0))

        # leave-one-out accuracy: nearly unbiased at this sample size
        loo_correct = 0
        for train_idx, test_idx in loo.split(X):
            m = model.fit(X.iloc[train_idx], y.iloc[train_idx])
            loo_correct += int(m.predict(X.iloc[test_idx])[0] == y.iloc[test_idx].values[0])
        loo_acc = loo_correct / n

        # in-sample AUC, reported only to expose the optimism gap
        model.fit(X, y)
        train_auc = float(roc_auc_score(y, model.predict_proba(X)[:, 1]))

        aucs_arr = np.asarray(aucs)
        cv_auc = float(aucs_arr.mean())
        rows.append(
            {
                "model": name,
                "auc_mean": round(cv_auc, 3),
                "auc_sd": round(float(aucs_arr.std()), 3),
                "auc_p05": round(float(np.percentile(aucs_arr, 5)), 3),
                "auc_p95": round(float(np.percentile(aucs_arr, 95)), 3),
                "train_auc": round(train_auc, 3),
                "train_cv_gap": round(train_auc - cv_auc, 3),
                "accuracy": round(float(np.mean(accs)), 3),
                "f1": round(float(np.mean(f1s)), 3),
                "precision": round(float(np.mean(precs)), 3),
                "recall": round(float(np.mean(recs)), 3),
                "loocv_accuracy": round(float(loo_acc), 3),
            }
        )

    comparison = pd.DataFrame(rows).sort_values("auc_mean", ascending=False)

    # fit both on everything, for interpretation and for the CDS probability
    predictions = df[["city", "state_code"]].copy()
    for name, model in _models().items():
        model.fit(X, y)
        predictions[f"p_high_{name.lower()}"] = model.predict_proba(X)[:, 1]

    chosen = comparison.iloc[0]["model"].lower()
    predictions["p_high"] = predictions[f"p_high_{chosen}"]
    predictions["label"] = y.to_numpy()
    predictions["demand_metric"] = df[label_col].to_numpy()
    predictions = predictions.sort_values("p_high", ascending=False).reset_index(drop=True)

    return ClassifierResult(
        n=n,
        positives=pos,
        threshold=threshold,
        label_col=label_col,
        comparison=comparison.reset_index(drop=True),
        predictions=predictions,
    )
