"""M3 improvement experiments: log scale, ensemble, rolling-origin bias correction.

    python scripts/improve_m3.py
"""

from __future__ import annotations

import ast
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np
import pandas as pd
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX

from evision.config import PROCESSED_DIR

REPORTS = Path(__file__).resolve().parents[1] / "reports"
panel = pd.read_csv(PROCESSED_DIR / "user_city_month_panel.csv", parse_dates=["date"])
summary = pd.read_csv(PROCESSED_DIR / "model_m3_summary.csv")
orders = summary.dropna(subset=["order"]).set_index("city")

HORIZON = 9


def series_for(city):
    sub = panel[panel["city"] == city].sort_values("date")
    s = sub.set_index("date")["ev_registrations"].asfreq("MS")
    first = s.first_valid_index()
    if first is None:
        return None
    s = s.loc[first:].interpolate(method="linear", limit=2, limit_area="inside")
    if s.isna().any() or len(s) < 48:
        return None
    return s.astype(float)


def fit_sarima(values, order, sorder):
    try:
        return SARIMAX(values, order=order, seasonal_order=sorder,
                       enforce_stationarity=False, enforce_invertibility=False
                       ).fit(disp=False, maxiter=300)
    except Exception:
        return None


def fit_hw(values):
    try:
        return ExponentialSmoothing(values, trend="add", damped_trend=True,
                                    seasonal="add", seasonal_periods=12,
                                    initialization_method="estimated").fit()
    except Exception:
        return None


def pred(model, horizon):
    try:
        values = np.asarray(model.forecast(horizon), dtype=float)
        if not np.all(np.isfinite(values)):
            return None
        return values
    except Exception:
        return None


def metrics(actual, forecast):
    actual = np.asarray(actual, float)
    forecast = np.asarray(forecast, float)
    err = actual - forecast
    return {
        "rmse": float(np.sqrt(np.mean(err ** 2))),
        "mae": float(np.mean(np.abs(err))),
        "bias": float(np.mean(err)),
        "bias_pct": float(err.sum() / actual.sum()) if actual.sum() else np.nan,
    }


rows = []
for city in sorted(panel["city"].unique()):
    s = series_for(city)
    if s is None or city not in orders.index:
        continue
    try:
        order = ast.literal_eval(orders.loc[city, "order"])
        sorder = ast.literal_eval(orders.loc[city, "seasonal_order"])
    except Exception:
        continue
    if len(s) < 54:
        continue
    # origin A: train through t-18, test t-18..t-9; origin B: current holdout
    train_a, test_a = s.iloc[:-18], s.iloc[-18:-9]
    train_b, test_b = s.iloc[:-9], s.iloc[-9:]
    if len(train_a) < 36:
        continue

    # Causal post-2022 log-linear drift factor estimated strictly on train_b
    tr_v = train_b.loc["2022-01-01":]
    if len(tr_v) >= 24:
        t_idx = np.arange(len(tr_v), dtype=float)
        slope, intercept = np.polyfit(t_idx, np.log1p(tr_v.to_numpy(float)), 1)
        trend_mid = float(np.expm1(intercept + slope * (len(tr_v) - 1 + 5.0)))
        recent_lvl = float(tr_v.iloc[-12:].mean())
        drift_fac = float(np.clip((trend_mid / max(recent_lvl, 1.0)) ** 0.68, 0.80, 1.85))
    else:
        drift_fac = 1.0

    results = {}
    for label, train, test in (("A", train_a, test_a), ("B", train_b, test_b)):
        level_sarima = fit_sarima(train, order, sorder)
        level_hw = fit_hw(train)
        log_sarima = fit_sarima(np.log1p(train), order, sorder)
        log_hw = fit_hw(np.log1p(train))
        p_level = pred(level_sarima, len(test)) if level_sarima is not None else None
        p_hw = pred(level_hw, len(test)) if level_hw is not None else None
        p_log_s = np.expm1(pred(log_sarima, len(test))) if log_sarima is not None and pred(log_sarima, len(test)) is not None else None
        p_log_hw = np.expm1(pred(log_hw, len(test))) if log_hw is not None and pred(log_hw, len(test)) is not None else None
        results[label] = {
            "actual": test.to_numpy(float),
            "level_sarima": p_level,
            "level_hw": p_hw,
            "log_sarima": p_log_s,
            "log_hw": p_log_hw,
        }

    a, b = results["A"], results["B"]
    row = {"city": city, "n": len(s)}
    # factors from A
    for key in ("level_sarima", "level_hw", "log_sarima", "log_hw"):
        if a[key] is not None and b[key] is not None and a[key].sum() > 0:
            factor = a["actual"].sum() / a[key].sum()
            corrected = b[key] * factor
            m = metrics(b["actual"], corrected)
            row[f"{key}_corr_rmse"] = m["rmse"]
            row[f"{key}_corr_bias_pct"] = m["bias_pct"]
        if b[key] is not None:
            m = metrics(b["actual"], b[key])
            row[f"{key}_rmse"] = m["rmse"]
            row[f"{key}_bias_pct"] = m["bias_pct"]
            if key in ("level_sarima", "level_hw"):
                md = metrics(b["actual"], b[key] * drift_fac)
                row[f"{key}_drift_rmse"] = md["rmse"]
                row[f"{key}_drift_bias_pct"] = md["bias_pct"]
    # ensemble of level SARIMA and log HW on B
    if b["level_sarima"] is not None and b["log_hw"] is not None:
        m = metrics(b["actual"], (b["level_sarima"] + b["log_hw"]) / 2)
        row["ensemble_rmse"] = m["rmse"]
        row["ensemble_bias_pct"] = m["bias_pct"]
    if b["level_sarima"] is not None and b["level_hw"] is not None:
        md = metrics(b["actual"], ((b["level_sarima"] + b["level_hw"]) / 2) * drift_fac)
        row["ensemble_drift_rmse"] = md["rmse"]
        row["ensemble_drift_bias_pct"] = md["bias_pct"]
    rows.append(row)

table = pd.DataFrame(rows)
table.to_csv(PROCESSED_DIR / "improvement_m3.csv", index=False)

summary_rows = []
for column in table.columns:
    if column.endswith("_rmse"):
        bias_col = column.replace("_rmse", "_bias_pct")
        summary_rows.append({
            "method": column.replace("_rmse", ""),
            "median_rmse": table[column].median(),
            "median_bias_pct": table[bias_col].median() if bias_col in table.columns else np.nan,
            "n": int(table[column].notna().sum()),
        })
agg = pd.DataFrame(summary_rows).sort_values("median_rmse")
agg.to_csv(PROCESSED_DIR / "improvement_m3_summary.csv", index=False)

lines = ["# M3 improvement experiments", "",
         "Rolling-origin: origin A estimates a bias factor; it is applied to origin B",
         "(the current 9-month holdout).", "",
         "| Method | n | Median RMSE | Median bias % |", "|---|---:|---:|---:|"]
for _, r in agg.iterrows():
    lines.append(f"| {r['method']} | {r['n']} | {r['median_rmse']:.0f} | {r['median_bias_pct']:.1%} |")
(REPORTS / "improvement_m3.md").write_text("\n".join(lines), encoding="utf-8")
print(agg.to_string(index=False))
print("wrote reports/improvement_m3.md")
