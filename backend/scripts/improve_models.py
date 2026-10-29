"""Controlled improvement experiments for M1 and M2.

    python scripts/improve_models.py

Compares the current specifications with expanded features, regularised
models, threshold-free ranking (AUC/PR), calibration, and a continuous-demand
model. Writes reports/improvement_m1_m2.md and CSVs.
"""

from __future__ import annotations

import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore", category=FutureWarning)

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import spearmanr
from sklearn.base import clone
from sklearn.ensemble import ExtraTreesClassifier, GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score, average_precision_score, brier_score_loss, confusion_matrix,
    f1_score, log_loss, precision_score, recall_score, roc_auc_score, r2_score,
)
from sklearn.model_selection import GridSearchCV, RepeatedStratifiedKFold, KFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from evision.config import PROCESSED_DIR, target_cities
from evision.models import m1_count

REPORTS = Path(__file__).resolve().parents[1] / "reports"
REPORTS.mkdir(exist_ok=True)

features = pd.read_csv(PROCESSED_DIR / "features_model.csv")
panel = pd.read_csv(PROCESSED_DIR / "user_city_month_panel.csv", parse_dates=["date"])

rto_count = {c["name"]: len(c.get("rto_codes", [])) for c in target_cities()}
df = features.copy()
df["log_population"] = np.log(df["pop_2011"].clip(lower=1))
df["log_density"] = np.log(df["population_density"].clip(lower=1))
df["log_income"] = np.log(df["per_capita_income_inr"].clip(lower=1))
df["log_area"] = np.log(df["area_km2_2011"].clip(lower=1))
df["log_non_ev_market"] = np.log(df["non_ev_total_registrations"].clip(lower=1))
df["pop_growth"] = df["pop_estimate_2023"] / df["pop_2011"].clip(lower=1) - 1
df["tier_metro"] = (df["tier"].astype(str).str.lower() == "metro").astype(int)
df["rto_count"] = df["city"].map(rto_count).fillna(0)
df["log_rto_count"] = np.log(df["rto_count"].clip(lower=1))
df["density_x_income"] = df["log_density"] * df["log_income"]
df["corridor_x_market"] = df["highway_corridor"] * df["log_non_ev_market"]
df["temp_x_density"] = df["summer_max_temp_c"] * df["log_density"]
df["income_x_area"] = df["log_income"] * df["log_area"]
df["state_fast_share"] = df["state_fast_stations"] / df["state_stations"].clip(lower=1)
df["cpos_5km_log"] = np.log(df["cpos_5km"].clip(lower=1))
df["cpos_10km_log"] = np.log(df["cpos_10km"].clip(lower=1))
df["log_cpos_10km"] = np.log((df["cpos_10km"] + 1).clip(lower=1))
df["market_per_cpo"] = df["log_non_ev_market"] - df["cpos_10km_log"]
df["ev_share_log"] = np.log(df["ev_share_mean"].clip(lower=1e-4))
df["comm_fleet_log"] = np.log(df["commercial_fleet_share"].clip(lower=1e-4))
df["share_fast_10km"] = df["fast_10km"] / df["stations_10km"].clip(lower=1)
df["market_x_rto"] = df["log_non_ev_market"] * df["log_rto_count"]
df["mean_fuel_price"] = df["fuel_price_inr_per_litre"]
df["income_sq"] = df["log_income"] ** 2
df["density_sq"] = df["log_density"] ** 2

BASE = [
    "log_density", "log_income", "fuel_price_inr_per_litre",
    "ev_policy_score", "highway_corridor", "summer_max_temp_c",
]
EXPANDED = [
    "log_income", "income_x_area", "summer_max_temp_c",
    "state_fast_share", "log_rto_count", "cpos_5km_log",
    "ev_share_log", "comm_fleet_log", "ev_policy_score",
]

LABEL = "effective_public_demand_10km"


def metrics(y_true, proba, threshold=0.5):
    pred = (proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    precision = precision_score(y_true, pred, zero_division=0)
    recall = recall_score(y_true, pred, zero_division=0)
    specificity = tn / (tn + fp) if tn + fp else np.nan
    f1 = f1_score(y_true, pred, zero_division=0)
    # calibration slope: regress outcome on the logit of the forecast
    p = np.clip(proba, 1e-6, 1 - 1e-6)
    logit = np.log(p / (1 - p)).reshape(-1, 1)
    cal = LogisticRegression().fit(logit, y_true)
    return {
        "accuracy": accuracy_score(y_true, pred),
        "precision": precision,
        "recall": recall,
        "specificity": specificity,
        "f1": f1,
        "auc": roc_auc_score(y_true, proba),
        "pr_auc": average_precision_score(y_true, proba),
        "brier": brier_score_loss(y_true, proba),
        "log_loss": log_loss(y_true, proba, labels=[0, 1]),
        "cal_slope": float(cal.coef_[0][0]),
        "cal_intercept": float(cal.intercept_[0]),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    }


def evaluate(model, X, y, repeats=10, seed=42):
    cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=repeats, random_state=seed)
    pooled_proba, pooled_true = [], []
    for train_idx, test_idx in cv.split(X, y):
        fitted = clone(model).fit(X.iloc[train_idx], y.iloc[train_idx])
        pooled_proba.extend(fitted.predict_proba(X.iloc[test_idx])[:, 1])
        pooled_true.extend(y.iloc[test_idx].to_numpy())
    return metrics(np.array(pooled_true), np.array(pooled_proba))


def pipeline_logistic():
    return Pipeline([
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(max_iter=4000, solver="liblinear")),
    ])


def pipeline_enet():
    return Pipeline([
        ("scale", StandardScaler()),
        ("clf", LogisticRegression(
            penalty="l2", solver="liblinear", max_iter=4000, C=0.3, random_state=42,
        )),
    ])


def pipeline_lda():
    return Pipeline([
        ("scale", StandardScaler()),
        ("clf", LinearDiscriminantAnalysis(solver="lsqr", shrinkage="auto")),
    ])


def pipeline_et():
    return ExtraTreesClassifier(
        n_estimators=500, max_depth=4, min_samples_leaf=2,
        class_weight="balanced", random_state=42,
    )


def pipeline_gb():
    return GradientBoostingClassifier(
        n_estimators=200, max_depth=2, learning_rate=0.05, random_state=42,
    )


def dataset(frame, columns, label_mode="median"):
    use = frame.dropna(subset=[LABEL, *columns]).copy()
    if label_mode == "measured":
        use = use[use["split_method"] == "measured"]
    if label_mode == "extremes":
        lo, hi = use[LABEL].quantile([1 / 3, 2 / 3])
        use = use[(use[LABEL] <= lo) | (use[LABEL] >= hi)]
        y = (use[LABEL] > hi).astype(int)
        return use[columns], y, use
    threshold = use[LABEL].median()
    y = (use[LABEL] > threshold).astype(int)
    return use[columns], y, use


rows = []
for label_mode in ("median", "extremes", "measured"):
    Xb, yb, _ = dataset(df, BASE, label_mode)
    Xe, ye, _ = dataset(df, EXPANDED, label_mode)
    candidates = [
        ("Baseline logistic (current features)", pipeline_logistic(), Xb, yb),
        ("Baseline LDA (current features)", pipeline_lda(), Xb, yb),
        ("Expanded logistic (elastic net)", pipeline_enet(), Xe, ye),
        ("Expanded LDA (shrinkage)", pipeline_lda(), Xe, ye),
        ("Expanded ExtraTrees", pipeline_et(), Xe, ye),
        ("Expanded GradientBoosting", pipeline_gb(), Xe, ye),
    ]
    for name, model, X, y in candidates:
        result = evaluate(model, X, y, repeats=10)
        result.update({"model": name, "label": label_mode, "n": len(y)})
        rows.append(result)
        print(label_mode, name, "AUC", round(result["auc"], 3), "F1", round(result["f1"], 3))

m2_table = pd.DataFrame(rows)
m2_table.to_csv(PROCESSED_DIR / "improvement_m2.csv", index=False)

# ---------------------------------------------------------------- continuous demand
REG_COLS = EXPANDED + ["market_per_cpo"]
Xc, _, use = dataset(df, REG_COLS, "median")
target = np.log(use[LABEL].clip(lower=1.0))
cv = KFold(n_splits=5, shuffle=True, random_state=42)
pred_exp = np.zeros(len(target))
for train_idx, test_idx in cv.split(Xc):
    model = Pipeline([
        ("scale", StandardScaler()),
        ("reg", Ridge(alpha=4.0)),
    ])
    model.fit(Xc.iloc[train_idx], target.iloc[train_idx])
    res_train = target.iloc[train_idx] - model.predict(Xc.iloc[train_idx])
    smear = float(np.mean(np.exp(res_train)))
    pred_exp[test_idx] = np.exp(model.predict(Xc.iloc[test_idx])) * smear
rho = spearmanr(pred_exp, use[LABEL]).correlation
r2 = r2_score(use[LABEL], pred_exp)
auc_cont = roc_auc_score((use[LABEL] > use[LABEL].median()).astype(int), pred_exp)
continuous = {"r2": r2, "spearman": rho, "auc_from_continuous": auc_cont}
pd.DataFrame([continuous]).to_csv(PROCESSED_DIR / "improvement_m2_continuous.csv", index=False)

# ---------------------------------------------------------------- M1
city = (
    df.dropna(subset=["log_non_ev_market"]).set_index("city")
)
monthly = panel.groupby("city", as_index=False)["ev_registrations"].mean().rename(
    columns={"ev_registrations": "mean_monthly"}
)
city = city.join(monthly.set_index("city"), how="inner").reset_index()

baseline_terms = [
    "log_population", "log_density", "log_income", "log_non_ev_market",
    "fuel_price_inr_per_litre", "ev_policy_score", "highway_corridor",
    "summer_max_temp_c",
]
structural_terms = baseline_terms + [
    "market_4w_share", "share_fast_10km", "tier_metro", "log_rto_count",
]
improved_terms = list(m1_count.DRIVER_TERMS)


def m1_loocv(terms, offset: bool):
    data = city.dropna(subset=terms + ["mean_monthly"]).reset_index(drop=True)
    y = data["mean_monthly"].to_numpy(float)
    X = sm.add_constant(data[terms].astype(float))
    # When testing an offset, center log_non_ev_market as the exposure scale
    offset_values = (
        0.5 * (data["log_non_ev_market"] - data["log_non_ev_market"].mean()).to_numpy(float)
        if offset else np.zeros(len(data))
    )
    predictions = np.zeros(len(data))
    for i in range(len(data)):
        train = np.arange(len(data)) != i
        try:
            fit = sm.GLM(
                y[train], X.iloc[train], family=sm.families.NegativeBinomial(alpha=0.1),
                offset=offset_values[train],
            ).fit(maxiter=200)
            eta = float(np.dot(X.iloc[i].to_numpy(), fit.params.to_numpy()) + offset_values[i])
            predictions[i] = float(np.exp(eta))
        except Exception:
            predictions[i] = np.nan
    mask = np.isfinite(predictions)
    mae = float(np.mean(np.abs(y[mask] - predictions[mask])))
    rmse = float(np.sqrt(np.mean((y[mask] - predictions[mask]) ** 2)))
    r2 = float(r2_score(y[mask], predictions[mask]))
    rho = float(spearmanr(y[mask], predictions[mask]).correlation)
    return {"terms": len(terms), "offset": offset, "n": int(mask.sum()),
            "mae": mae, "rmse": rmse, "r2": r2, "spearman": rho}


m1_rows = [
    {"model": "Baseline (8 core terms)", **m1_loocv(baseline_terms, False)},
    {"model": "Structural (12 terms)", **m1_loocv(structural_terms, False)},
    {"model": "Production M1a (14 terms)", **m1_loocv(improved_terms, False)},
]
m1_table = pd.DataFrame(m1_rows)
m1_table.to_csv(PROCESSED_DIR / "improvement_m1.csv", index=False)

# ---------------------------------------------------------------- markdown
lines = ["# Improvement experiments — M1 and M2", ""]
lines += ["## M2", "", "| Label | Model | n | AUC | PR-AUC | Accuracy | F1 | Brier | Log loss | Cal. slope |",
          "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
for _, r in m2_table.sort_values(["label", "auc"], ascending=[True, False]).iterrows():
    lines.append(
        f"| {r['label']} | {r['model']} | {r['n']} | {r['auc']:.3f} | "
        f"{r['pr_auc']:.3f} | {r['accuracy']:.3f} | {r['f1']:.3f} | "
        f"{r['brier']:.3f} | {r['log_loss']:.3f} | {r['cal_slope']:.2f} |"
    )
lines += ["", "Continuous demand model (GradientBoosting on log demand):", "",
          f"- R²: {continuous['r2']:.3f}",
          f"- Spearman: {continuous['spearman']:.3f}",
          f"- AUC when thresholded at the median: {continuous['auc_from_continuous']:.3f}", ""]
lines += ["## M1", "", "| Model | Terms | Offset | n | LOOCV MAE | RMSE | R² | Spearman |",
          "|---|---:|---|---:|---:|---:|---:|---:|"]
for _, r in m1_table.iterrows():
    lines.append(
        f"| {r['model']} | {r['terms']} | {r['offset']} | {r['n']} | "
        f"{r['mae']:.0f} | {r['rmse']:.0f} | {r['r2']:.3f} | {r['spearman']:.3f} |"
    )
(REPORTS / "improvement_m1_m2.md").write_text("\n".join(lines), encoding="utf-8")
print("wrote reports/improvement_m1_m2.md")
