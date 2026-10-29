"""Apply the rolling-origin bias correction to the existing M3 forecasts.

    python scripts/apply_m3_correction.py

Reads model_m3_summary.csv and model_m3_forecasts.csv, estimates the factor on
the earlier 9-month window with Holt-Winters, and rewrites both files. No SARIMA
grid search is repeated, so this runs in seconds.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np
import pandas as pd

from evision.config import PROCESSED_DIR
from evision.models import m3_forecast

panel = pd.read_csv(PROCESSED_DIR / "user_city_month_panel.csv", parse_dates=["date"])
summary = pd.read_csv(PROCESSED_DIR / "model_m3_summary.csv")
forecasts = pd.read_csv(PROCESSED_DIR / "model_m3_forecasts.csv", parse_dates=["date"])

old_factor = summary.get("bias_correction_factor", pd.Series(1.0, index=summary.index))
old_factors = dict(zip(summary["city"], old_factor.fillna(1.0)))

factors = {}
for city in summary["city"]:
    s = m3_forecast._series(panel, city)
    if s is None:
        factors[city] = 1.0
        continue
    scale = max(float(s.mean()), 1.0)
    scaled = s / scale
    train = scaled.iloc[:-9]
    cap = max(float(train.max()) * m3_forecast.MAX_FORECAST_MULTIPLE, 1.0)
    raw = m3_forecast._bias_factor(scaled, "Holt-Winters", None, None, cap)
    # a city with a known 2021 seam must not receive an extreme correction
    factors[city] = float(np.clip(raw, 0.75, 1.5))

# undo any previous correction before applying the tighter factor
base_12m = summary["forecast_12m"] / summary["city"].map(old_factors).replace(0, 1.0)
summary["bias_correction_factor"] = summary["city"].map(factors).round(3)
summary["bias_corrected"] = summary["bias_correction_factor"] != 1.0
summary["forecast_12m"] = (base_12m * summary["bias_correction_factor"]).round(0)
summary["forecast_growth"] = (
    (summary["forecast_12m"] - summary["last_12m"]) / summary["last_12m"]
).round(4)

base_forecast = forecasts["forecast"] / forecasts["city"].map(old_factors).replace(0, 1.0)
forecasts["forecast"] = (
    base_forecast * forecasts["city"].map(factors)
).round(1)

summary.to_csv(PROCESSED_DIR / "model_m3_summary.csv", index=False)
forecasts.to_csv(PROCESSED_DIR / "model_m3_forecasts.csv", index=False)

print("corrected", int((summary["bias_correction_factor"] != 1.0).sum()), "of", len(summary))
print(summary[["city", "winner", "forecast_growth", "bias_correction_factor"]].head(8).to_string(index=False))
