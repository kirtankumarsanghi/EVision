"""Full metric report for M1, M2, M3 and the CDS.

    python scripts/model_metrics_report.py

Writes:
    data/processed/model_m2_metrics.csv
    data/processed/model_m2_confusion.csv
    data/processed/model_m1_metrics.csv
    data/processed/model_m3_metrics.csv
    reports/model_metrics.md
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    brier_score_loss,
    cohen_kappa_score,
    confusion_matrix,
    f1_score,
    log_loss,
    matthews_corrcoef,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import LeaveOneOut, RepeatedStratifiedKFold

from evision.config import PROCESSED_DIR
from evision.models import m1_count, m2_classify

REPORTS = Path(__file__).resolve().parents[1] / "reports"
REPORTS.mkdir(exist_ok=True)

# features_model has the 2W/3W/4W proxy fill and the 10 km demand label for all
# 51 cities; user_city_features leaves 9 cities without a split.
features = pd.read_csv(PROCESSED_DIR / "features_model.csv")
panel = pd.read_csv(PROCESSED_DIR / "user_city_month_panel.csv", parse_dates=["date"])


# ---------------------------------------------------------------- M2 metrics
def binary_metrics(y_true, proba, threshold: float = 0.5) -> dict:
    pred = (np.asarray(proba) >= threshold).astype(int)
    y_true = np.asarray(y_true)
    tn, fp, fn, tp = confusion_matrix(y_true, pred, labels=[0, 1]).ravel()
    precision = tp / (tp + fp) if tp + fp else np.nan
    recall = tp / (tp + fn) if tp + fn else np.nan
    specificity = tn / (tn + fp) if tn + fp else np.nan
    npv = tn / (tn + fn) if tn + fn else np.nan
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else np.nan
    return {
        "accuracy": accuracy_score(y_true, pred),
        "precision": precision,
        "recall_sensitivity": recall,
        "specificity": specificity,
        "npv": npv,
        "f1": f1,
        "balanced_accuracy": balanced_accuracy_score(y_true, pred),
        "mcc": matthews_corrcoef(y_true, pred),
        "kappa": cohen_kappa_score(y_true, pred),
        "roc_auc": roc_auc_score(y_true, proba),
        "pr_auc": average_precision_score(y_true, proba),
        "brier": brier_score_loss(y_true, proba),
        "log_loss": log_loss(y_true, proba, labels=[0, 1]),
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
        "n": int(len(y_true)),
    }


def bootstrap_ci(y_true, proba, metric: str, n_boot: int = 2000) -> tuple[float, float]:
    rng = np.random.default_rng(42)
    values = []
    y_true = np.asarray(y_true)
    proba = np.asarray(proba)
    for _ in range(n_boot):
        idx = rng.integers(0, len(y_true), len(y_true))
        if len(np.unique(y_true[idx])) < 2:
            continue
        if metric == "accuracy":
            values.append(accuracy_score(y_true[idx], (proba[idx] >= 0.5).astype(int)))
        else:
            values.append(roc_auc_score(y_true[idx], proba[idx]))
    return float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5))


use_fixed = (
    m2_classify.LABEL_PREFERRED in features.columns
    and features[m2_classify.LABEL_PREFERRED].notna().sum() > 0
)
label_col = m2_classify.LABEL_PREFERRED if use_fixed else m2_classify.LABEL_FALLBACK
df, X, y, threshold = m2_classify._prepare(features, label_col, m2_classify.EXOGENOUS)

metric_rows = []
conf_rows = []

# leave-one-out: one prediction per city, the cleanest out-of-sample view
for name in ("Logistic", "LDA"):
    loo_proba = np.zeros(len(y))
    for train_idx, test_idx in LeaveOneOut().split(X):
        model = m2_classify._models()[name]
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        loo_proba[test_idx] = model.predict_proba(X.iloc[test_idx])[:, 1]
    metrics = binary_metrics(y, loo_proba)
    metrics.update({
        "model": name, "evaluation": "LOOCV",
        "acc_ci_low": bootstrap_ci(y, loo_proba, "accuracy")[0],
        "acc_ci_high": bootstrap_ci(y, loo_proba, "accuracy")[1],
        "auc_ci_low": bootstrap_ci(y, loo_proba, "auc")[0],
        "auc_ci_high": bootstrap_ci(y, loo_proba, "auc")[1],
    })
    metric_rows.append(metrics)
    conf_rows.append({
        "model": name, "evaluation": "LOOCV",
        "tn": metrics["tn"], "fp": metrics["fp"], "fn": metrics["fn"], "tp": metrics["tp"],
    })

# repeated stratified 5-fold: aggregate confusion + per-repeat mean/sd
cv = RepeatedStratifiedKFold(n_splits=5, n_repeats=20, random_state=42)
for name in ("Logistic", "LDA"):
    all_proba = np.zeros(len(y))
    counts = np.zeros(len(y))
    per_repeat = []
    repeat_pred = {r: {} for r in range(20)}
    for split_index, (train_idx, test_idx) in enumerate(cv.split(X, y)):
        repeat = split_index // 5
        model = m2_classify._models()[name]
        model.fit(X.iloc[train_idx], y.iloc[train_idx])
        proba = model.predict_proba(X.iloc[test_idx])[:, 1]
        for idx, value in zip(test_idx, proba):
            repeat_pred[repeat][int(idx)] = float(value)
    for repeat, preds in repeat_pred.items():
        idx = sorted(preds)
        per_repeat.append(
            binary_metrics(y.iloc[idx], np.array([preds[i] for i in idx]))
        )
    # aggregate confusion over every fold prediction (each city appears 20x)
    agg_pred = []
    agg_true = []
    for repeat, preds in repeat_pred.items():
        for idx, value in preds.items():
            agg_pred.append(value >= 0.5)
            agg_true.append(int(y.iloc[idx]))
    agg_pred = np.array(agg_pred, dtype=int)
    agg_true = np.array(agg_true, dtype=int)
    tn, fp, fn, tp = confusion_matrix(agg_true, agg_pred, labels=[0, 1]).ravel()
    summary = {
        "model": name,
        "evaluation": "Repeated 5-fold (20 repeats), mean across repeats",
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
        "n": int(len(agg_true)),
    }
    for key in ("accuracy", "precision", "recall_sensitivity", "specificity", "npv",
                "f1", "balanced_accuracy", "mcc", "kappa", "roc_auc", "pr_auc",
                "brier", "log_loss"):
        summary[key] = float(np.nanmean([row[key] for row in per_repeat]))
        summary[f"{key}_sd"] = float(np.nanstd([row[key] for row in per_repeat]))
    metric_rows.append(summary)
    conf_rows.append({
        "model": name, "evaluation": "Repeated CV (aggregated folds)",
        "tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp),
    })

# in-sample fit (reported only to show optimism)
for name in ("Logistic", "LDA"):
    model = m2_classify._models()[name]
    model.fit(X, y)
    proba = model.predict_proba(X)[:, 1]
    metrics = binary_metrics(y, proba)
    metrics.update({"model": name, "evaluation": "In-sample (optimistic)"})
    metric_rows.append(metrics)

m2_metrics = pd.DataFrame(metric_rows)
m2_confusion = pd.DataFrame(conf_rows)
m2_metrics.to_csv(PROCESSED_DIR / "model_m2_metrics.csv", index=False)
m2_confusion.to_csv(PROCESSED_DIR / "model_m2_confusion.csv", index=False)

# ---------------------------------------------------------------- M1 metrics
m1 = m1_count.fit(panel, features)
m1_rows = [
    {"metric": "M1a_n_cities", "value": m1.drivers.n},
    {"metric": "M1a_alpha", "value": m1.drivers.alpha},
    {"metric": "M1a_aic_negbin", "value": m1.drivers.aic},
    {"metric": "M1a_aic_poisson", "value": m1.drivers.poisson_aic},
    {"metric": "M1a_poisson_dispersion", "value": m1.drivers.poisson_dispersion},
    {"metric": "M1a_pseudo_r2", "value": m1.drivers.pseudo_r2},
    {"metric": "M1b_n_obs", "value": m1.level.n_obs},
    {"metric": "M1b_n_cities", "value": m1.level.n_cities},
    {"metric": "M1b_alpha", "value": m1.level.alpha},
    {"metric": "M1b_corr_fitted_observed", "value": m1.level.corr_with_observed},
]
m1_metrics = pd.DataFrame(m1_rows)
m1_metrics.to_csv(PROCESSED_DIR / "model_m1_metrics.csv", index=False)

# ---------------------------------------------------------------- M3 metrics
m3 = pd.read_csv(PROCESSED_DIR / "model_m3_summary.csv")
diag = pd.read_csv(PROCESSED_DIR / "model_m3_diagnostics.csv")
m3 = m3.merge(diag[["city", "test_actual_sum", "sarima_test_sum", "hw_test_sum"]], on="city", how="left")
m3["winner_rmse"] = np.where(m3["winner"] == "SARIMA", m3["sarima_rmse"], m3["hw_rmse"])
m3["winner_mae"] = np.where(m3["winner"] == "SARIMA", m3["sarima_mae"], m3["hw_mae"])
m3["winner_test_sum"] = np.where(
    m3["winner"] == "SARIMA", m3["sarima_test_sum"], m3["hw_test_sum"]
)
m3["bias"] = m3["winner_test_sum"] - m3["test_actual_sum"]
m3["bias_pct"] = m3["bias"] / m3["test_actual_sum"].replace(0, np.nan)
m3_out = m3[[
    "city", "winner", "forecast_quality", "holdout_rmse_rel",
    "sarima_rmse", "hw_rmse", "sarima_mae", "hw_mae",
    "winner_rmse", "winner_mae", "test_actual_sum", "winner_test_sum",
    "bias", "bias_pct", "last_12m", "forecast_12m", "forecast_growth",
]]
m3_out.to_csv(PROCESSED_DIR / "model_m3_metrics.csv", index=False)

# ---------------------------------------------------------------- markdown
def fmt(value, digits=3):
    if value is None or (isinstance(value, float) and not np.isfinite(value)):
        return "—"
    return f"{value:.{digits}f}"

lines = ["# Model metrics", ""]
lines.append("Generated by `scripts/model_metrics_report.py` from the processed outputs.")
lines.append("")
lines.append("## M2 — High/Low demand classifier")
lines.append("")
lines.append("| Model | Evaluation | Acc | Precision | Recall | Specificity | F1 | ROC AUC | PR AUC |")
lines.append("|---|---|---:|---:|---:|---:|---:|---:|---:|")
for _, r in m2_metrics.iterrows():
    lines.append(
        f"| {r['model']} | {r['evaluation']} | {fmt(r['accuracy'])} | "
        f"{fmt(r['precision'])} | {fmt(r['recall_sensitivity'])} | "
        f"{fmt(r['specificity'])} | {fmt(r['f1'])} | {fmt(r['roc_auc'])} | "
        f"{fmt(r['pr_auc'])} |"
    )
lines += ["", "### Confusion matrices", "", "| Model | Evaluation | TN | FP | FN | TP |", "|---|---|---:|---:|---:|---:|"]
for _, r in m2_confusion.iterrows():
    lines.append(f"| {r['model']} | {r['evaluation']} | {r['tn']} | {r['fp']} | {r['fn']} | {r['tp']} |")
lines += ["", "### Additional classification metrics", "",
          "| Model | Evaluation | Balanced acc | MCC | Kappa | NPV | Brier | Log loss |",
          "|---|---|---:|---:|---:|---:|---:|---:|"]
for _, r in m2_metrics.iterrows():
    lines.append(
        f"| {r['model']} | {r['evaluation']} | {fmt(r['balanced_accuracy'])} | "
        f"{fmt(r['mcc'])} | {fmt(r['kappa'])} | {fmt(r['npv'])} | "
        f"{fmt(r['brier'])} | {fmt(r['log_loss'])} |"
    )
lines += ["", f"Label: `{label_col}`; threshold = median = {threshold:.2f}.", ""]

lines += ["## M1 — negative binomial", "", "| Metric | Value |", "|---|---:|"]
for _, r in m1_metrics.iterrows():
    value = r["value"]
    lines.append(f"| {r['metric']} | {value:.4g} |")
lines += ["", "Coefficient table: `model_m1_coefficients.csv` (IRR, 95% CI, p).", ""]

lines += ["## M3 — forecast accuracy", "",
          f"- Cities: {len(m3)}; winners: {m3['winner'].value_counts().to_dict()}",
          f"- Quality: {m3['forecast_quality'].value_counts().to_dict()}",
          f"- Median holdout RMSE/level: {m3['holdout_rmse_rel'].median():.3f}; max: {m3['holdout_rmse_rel'].max():.3f}",
          f"- Median winner bias: {m3['bias'].median():.1f}; median bias %: {m3['bias_pct'].median():.2%}",
          "", "| City | Winner | RMSE | MAE | RMSE/level | Bias | Bias % |",
          "|---|---|---:|---:|---:|---:|---:|"]
for _, r in m3.sort_values("holdout_rmse_rel", ascending=False).head(15).iterrows():
    lines.append(
        f"| {r['city']} | {r['winner']} | {r['winner_rmse']:.0f} | "
        f"{r['winner_mae']:.0f} | {r['holdout_rmse_rel']:.3f} | "
        f"{r['bias']:.0f} | {r['bias_pct']:.1%} |"
    )
lines += ["", "Full per-city table: `data/processed/model_m3_metrics.csv`.", ""]

cds = pd.read_csv(PROCESSED_DIR / "cds_ranking.csv")
sens = pd.read_csv(PROCESSED_DIR / "cds_sensitivity.csv")
lines += ["## CDS", "",
          f"- Ranked cities: {len(cds)}; Critical {int(cds['recommendation'].str.startswith('Critical').sum())}; "
          f"High {int(cds['recommendation'].str.startswith('High').sum())}.",
          f"- Weight sensitivity overlap: {sens['overlap_with_base'].min()}–{sens['overlap_with_base'].max()} of 15.",
          "", "| Rank | City | CDS |", "|---:|---|---:|"]
for _, r in cds.head(15).iterrows():
    lines.append(f"| {r['rank']} | {r['city']} | {r['cds']:.3f} |")

(REPORTS / "model_metrics.md").write_text("\n".join(lines), encoding="utf-8")
print("wrote reports/model_metrics.md and the metric CSVs")
print(m2_metrics[["model", "evaluation", "accuracy", "precision", "recall_sensitivity",
                  "specificity", "f1", "roc_auc", "pr_auc"]].to_string(index=False))
