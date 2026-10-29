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

from ..config import target_cities
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
    "log_income",
    "income_x_area",
    "summer_max_temp_c",
    "state_fast_share",
    "log_rto_count",
    "cpos_5km_log",
    "ev_share_log",
    "comm_fleet_log",
    "ev_policy_score",
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
    df["log_population"] = np.log(df["pop_2011"].clip(lower=1))
    df["log_area"] = np.log(df["area_km2_2011"].clip(lower=1))
    df["log_non_ev_market"] = np.log(df["non_ev_total_registrations"].clip(lower=1))
    df["pop_growth"] = df["pop_estimate_2023"] / df["pop_2011"].clip(lower=1) - 1
    df["tier_metro"] = (df["tier"].astype(str).str.lower() == "metro").astype(int)
    rto_counts = {c["name"]: len(c.get("rto_codes", [])) for c in target_cities()}
    df["rto_count"] = df["city"].map(rto_counts).fillna(0)
    df["log_rto_count"] = np.log(df["rto_count"].clip(lower=1))
    df["density_x_income"] = df["log_density"] * df["log_income"]
    df["corridor_x_market"] = df["highway_corridor"] * df["log_non_ev_market"]
    df["temp_x_density"] = df["summer_max_temp_c"] * df["log_density"]
    df["income_x_area"] = df["log_income"] * df["log_area"]
    if {"state_fast_stations", "state_stations"}.issubset(df.columns):
        df["state_fast_share"] = (
            df["state_fast_stations"] / df["state_stations"].clip(lower=1)
        )
    if "cpos_5km" in df.columns:
        df["cpos_5km_log"] = np.log(df["cpos_5km"].clip(lower=1))
    if "cpos_10km" in df.columns:
        df["cpos_10km_log"] = np.log(df["cpos_10km"].clip(lower=1))
        df["market_per_cpo"] = df["log_non_ev_market"] - df["cpos_10km_log"]
    if "ev_share_mean" in df.columns:
        df["ev_share_log"] = np.log(df["ev_share_mean"].clip(lower=1e-4))
    if "commercial_fleet_share" in df.columns:
        df["comm_fleet_log"] = np.log(df["commercial_fleet_share"].clip(lower=1e-4))

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
                ("clf", LogisticRegression(
                    C=0.3, max_iter=4000, solver="liblinear", penalty="l2",
                    random_state=42,
                )),
            ]
        ),
        "LDA": Pipeline(
            [
                ("scale", StandardScaler()),
                ("clf", LinearDiscriminantAnalysis(solver="lsqr", shrinkage="auto")),
            ]
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
