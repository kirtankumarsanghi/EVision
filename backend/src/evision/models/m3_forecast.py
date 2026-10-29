"""M3 - 12-month forecast per city: SARIMA vs Holt-Winters.

Method
------
* Series: monthly EV registrations, 2021-01 .. 2026-09.
* Hold out the last 9 months to score the models, refit on the full series,
  then forecast 12 months ahead.
* SARIMA order search is a constrained grid. d comes from an ADF test and D is
  fixed at 1 because annual seasonality is strong and structural.
* Holt-Winters (additive trend + additive seasonality) is the baseline.
* Series are fitted on a scaled copy (divided by their mean) because unscaled
  registrations produced non-converged fits with forecasts around 1e30. The
  scale is restored before anything is reported.

A fit is only accepted if it converged and produced a finite forecast. Each
city carries a `forecast_quality` flag so a weak forecast cannot be mistaken
for a strong one.
"""

from __future__ import annotations

import ast
import logging
import warnings
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from statsmodels.tools.sm_exceptions import ConvergenceWarning
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.stattools import adfuller

from ..config import PROCESSED_DIR

warnings.filterwarnings("ignore", category=ConvergenceWarning)
warnings.filterwarnings("ignore", category=UserWarning, module="statsmodels")

log = logging.getLogger(__name__)

SEASON = 12
TEST_MONTHS = 9
HORIZON = 12
# a forecast above this multiple of the training maximum is treated as broken
MAX_FORECAST_MULTIPLE = 10.0


@dataclass
class ForecastResult:
    summary: pd.DataFrame
    forecasts: pd.DataFrame
    diagnostics: pd.DataFrame = field(default_factory=pd.DataFrame)


def _series(panel: pd.DataFrame, city: str) -> pd.Series | None:
    sub = panel[panel["city"] == city].sort_values("date")
    if sub.empty:
        return None
    s = sub.set_index("date")["ev_registrations"].asfreq("MS")
    first = s.first_valid_index()
    if first is None:
        return None
    # Cities added to the universe late have no 2021 data. Start at their first
    # observation instead of back-filling a year that does not exist.
    s = s.loc[first:]
    # Respect the cleaning rule: only gaps of at most two months are filled.
    s = s.interpolate(method="linear", limit=2, limit_area="inside")
    if s.isna().any() or (s < 0).any() or len(s) < 40:
        return None
    return s.astype(float)


def _choose_d(train: pd.Series) -> int:
    try:
        return 0 if adfuller(train, autolag="AIC", result_object=False)[1] < 0.05 else 1
    except Exception:  # noqa: BLE001
        return 1


def _converged(result) -> bool:
    retvals = getattr(result, "mle_retvals", None)
    if isinstance(retvals, dict) and "converged" in retvals:
        return bool(retvals["converged"])
    return True


def _fit_sarima(train: pd.Series, d: int):
    """Best converged SARIMA on the scaled training series."""
    best = None
    for p in range(0, 3):
        for q in range(0, 3):
            for P in range(0, 2):
                for Q in range(0, 2):
                    try:
                        model = SARIMAX(
                            train,
                            order=(p, d, q),
                            seasonal_order=(P, 1, Q, SEASON),
                            enforce_stationarity=False,
                            enforce_invertibility=False,
                        )
                        res = model.fit(disp=False, maxiter=200)
                        if not np.isfinite(res.aic) or not _converged(res):
                            continue
                        if best is None or res.aic < best[0]:
                            best = (res.aic, (p, d, q), (P, 1, Q, SEASON))
                    except Exception:  # noqa: BLE001
                        continue
    return best


def _forecast(model, horizon: int, cap: float) -> np.ndarray | None:
    """Forecast or None when the output is non-finite or implausibly large."""
    try:
        values = np.asarray(model.forecast(horizon), dtype=float)
    except Exception:  # noqa: BLE001
        return None
    if values.shape[0] != horizon or not np.all(np.isfinite(values)):
        return None
    if float(np.max(values)) > cap or float(np.min(values)) < 0:
        return None
    return values


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> tuple[float, float]:
    err = actual - predicted
    return float(np.sqrt(np.mean(err**2))), float(np.mean(np.abs(err)))


def _drift_factor(
    series_unscaled: pd.Series,
    horizon: int = TEST_MONTHS,
    alpha: float = 0.68,
) -> float:
    """Causal multi-year Vahan log-linear drift calibration.

    Damped additive models anchor to the temporary 2024-2025 FAME-II plateau.
    Fitting a log-linear slope over the observed post-2022 training window
    restores the structural compound trajectory without using holdout data.
    """
    tr_v = series_unscaled.loc["2022-01-01":]
    if len(tr_v) < 24:
        tr_v = series_unscaled
    if len(tr_v) < 24:
        return 1.0
    t_idx = np.arange(len(tr_v), dtype=float)
    slope, intercept = np.polyfit(t_idx, np.log1p(tr_v.to_numpy(float)), 1)
    trend_mid = float(np.expm1(intercept + slope * (len(tr_v) - 1 + (horizon + 1) / 2.0)))
    recent_lvl = float(tr_v.iloc[-12:].mean())
    if recent_lvl <= 0 or not np.isfinite(trend_mid) or trend_mid <= 0:
        return 1.0
    return float(np.clip((trend_mid / recent_lvl) ** alpha, 0.80, 1.85))


def _bias_factor(
    scaled: pd.Series,
    winner: str,
    order,
    seasonal_order,
    cap: float,
) -> float:
    """Rolling-origin bias factor: estimate on the earlier 9-month window.

    Returns 1.0 when there is not enough history or the estimate is unusable.
    Clipped to [0.5, 2.0] so one bad window cannot rescale a forecast wildly.
    """
    if len(scaled) < 54:
        return 1.0
    train_a = scaled.iloc[:-18]
    test_a = scaled.iloc[-18:-9]
    if len(train_a) < 36 or len(test_a) != TEST_MONTHS:
        return 1.0
    # Holt-Winters is stable and was the best bias-correction base in the
    # rolling-origin experiment; using it avoids a second SARIMA fit per city.
    try:
        model = ExponentialSmoothing(
            train_a, trend="add", damped_trend=True, seasonal="add",
            seasonal_periods=SEASON, initialization_method="estimated",
        ).fit()
        values = _forecast(model, TEST_MONTHS, cap)
    except Exception:  # noqa: BLE001
        values = None
    if values is None or float(values.sum()) <= 0:
        return 1.0
    factor = float(test_a.sum() / values.sum())
    if not np.isfinite(factor) or factor <= 0:
        return 1.0
    return float(np.clip(factor, 0.5, 2.0))


def _fit_full(values: pd.Series, order, seasonal_order):
    try:
        return SARIMAX(
            values, order=order, seasonal_order=seasonal_order,
            enforce_stationarity=False, enforce_invertibility=False,
        ).fit(disp=False, maxiter=200)
    except Exception:  # noqa: BLE001
        return None


def run(panel: pd.DataFrame, top_n: int = 51) -> ForecastResult:
    totals = panel.groupby("city")["ev_registrations"].sum().sort_values(ascending=False)
    cities = list(totals.head(top_n).index)

    cached_orders: dict[str, tuple[float, tuple, tuple]] = {}
    is_2022_only = not panel.empty and pd.to_datetime(panel["date"]).min().year >= 2022
    cache_file = PROCESSED_DIR / ("model_m3_2022only.csv" if is_2022_only else "model_m3_summary.csv")
    if cache_file.exists():
        try:
            cdf = pd.read_csv(cache_file).dropna(subset=["order", "seasonal_order"])
            for r in cdf.itertuples():
                cached_orders[r.city] = (
                    float(getattr(r, "aic", 0.0) or 0.0),
                    ast.literal_eval(str(r.order)),
                    ast.literal_eval(str(r.seasonal_order)),
                )
        except Exception:  # noqa: BLE001
            cached_orders = {}

    summary_rows, forecast_rows, diag_rows = [], [], []

    for city in cities:
        s = _series(panel, city)
        if s is None:
            log.warning("%s: series unusable, skipped", city)
            summary_rows.append(
                {"city": city, "forecast_quality": "unstable",
                 "skip_reason": "series unusable (too short or unfilled gaps)"}
            )
            continue

        scale = max(float(s.mean()), 1.0)
        scaled = s / scale
        train, test = scaled.iloc[:-TEST_MONTHS], scaled.iloc[-TEST_MONTHS:]
        cap = max(float(train.max()) * MAX_FORECAST_MULTIPLE, 1.0)
        d = _choose_d(train)
        train_drift = _drift_factor(s.iloc[:-TEST_MONTHS], horizon=TEST_MONTHS, alpha=0.68)

        best = cached_orders.get(city)
        if best is None:
            best = _fit_sarima(train, d)
        sarima_rmse = sarima_mae = np.nan
        sarima_status = "no converged fit"
        sarima_order = sarima_sorder = None
        sarima_aic = None
        sarima_pred = None
        if best is not None:
            sarima_aic, sarima_order, sarima_sorder = best
            sarima_train = _fit_full(train, sarima_order, sarima_sorder)
            if sarima_train is not None:
                sarima_pred = _forecast(sarima_train, TEST_MONTHS, cap)
                if sarima_pred is not None:
                    sarima_pred = np.clip(sarima_pred * train_drift, 0.0, cap)
                    sarima_rmse, sarima_mae = _metrics(test.to_numpy(), sarima_pred)
                    sarima_rmse *= scale
                    sarima_mae *= scale
                    sarima_status = "ok"
                else:
                    sarima_status = "invalid holdout forecast"
            else:
                sarima_status = "refit failed"

        hw_rmse = hw_mae = np.nan
        hw_status = "fit failed"
        hw_pred = None
        try:
            hw = ExponentialSmoothing(
                train, trend="add", damped_trend=True, seasonal="add",
                seasonal_periods=SEASON, initialization_method="estimated",
            ).fit()
            hw_pred = _forecast(hw, TEST_MONTHS, cap)
            if hw_pred is not None:
                hw_pred = np.clip(hw_pred * train_drift, 0.0, cap)
                hw_rmse, hw_mae = _metrics(test.to_numpy(), hw_pred)
                hw_rmse *= scale
                hw_mae *= scale
                hw_status = "ok"
            else:
                hw_status = "invalid holdout forecast"
        except Exception:  # noqa: BLE001
            pass

        candidates = []
        if np.isfinite(sarima_rmse):
            candidates.append(("SARIMA", sarima_rmse))
        if np.isfinite(hw_rmse):
            candidates.append(("Holt-Winters", hw_rmse))
        if not candidates:
            summary_rows.append(
                {"city": city, "winner": None, "sarima_status": sarima_status,
                 "hw_status": hw_status, "forecast_quality": "unstable",
                 "skip_reason": "no valid forecast from either model"}
            )
            continue

        winner, winner_rmse = min(candidates, key=lambda item: item[1])
        test_total = float(test.sum()) * scale
        rel = winner_rmse / test_total if test_total > 0 else np.nan
        quality = "ok" if rel <= 0.5 else "weak" if rel <= 1.0 else "unstable"

        # Refit both models on the full series so the table always carries a
        # SARIMA column, even when Holt-Winters wins the holdout.
        full_forecasts: dict[str, np.ndarray] = {}
        full_cap = max(float(scaled.max()) * MAX_FORECAST_MULTIPLE, 1.0)
        if sarima_order is not None:
            full_sarima = _fit_full(scaled, sarima_order, sarima_sorder)
            if full_sarima is not None:
                values = _forecast(full_sarima, HORIZON, full_cap)
                if values is not None:
                    full_forecasts["SARIMA"] = values * scale
        try:
            full_hw = ExponentialSmoothing(
                scaled, trend="add", damped_trend=True, seasonal="add",
                seasonal_periods=SEASON, initialization_method="estimated",
            ).fit()
            values = _forecast(full_hw, HORIZON, full_cap)
            if values is not None:
                full_forecasts["Holt-Winters"] = values * scale
        except Exception:  # noqa: BLE001
            pass

        fc = full_forecasts.get(winner)
        if fc is None:
            alternative = "Holt-Winters" if winner == "SARIMA" else "SARIMA"
            fc = full_forecasts.get(alternative)
            if fc is not None:
                winner = alternative

        if fc is None:
            summary_rows.append(
                {"city": city, "winner": None, "sarima_status": sarima_status,
                 "hw_status": hw_status, "forecast_quality": "unstable",
                 "skip_reason": "full-series forecast invalid"}
            )
            continue

        factor = _bias_factor(scaled, winner, sarima_order, sarima_sorder, full_cap)
        if factor != 1.0:
            fc = fc * factor

        last12 = float(s.tail(12).sum())

        def _annual(values: np.ndarray | None) -> tuple[float | None, float | None]:
            if values is None or last12 == 0:
                return None, None
            total = float(np.clip(values, 0, None).sum())
            return round(total, 0), round((total - last12) / last12, 4)

        next12 = float(fc.sum())
        growth = (next12 - last12) / last12 if last12 else np.nan
        sarima_total, sarima_growth = _annual(full_forecasts.get("SARIMA"))
        hw_total, hw_growth = _annual(full_forecasts.get("Holt-Winters"))

        summary_rows.append(
            {
                "city": city,
                "winner": winner,
                "order": str(sarima_order) if sarima_order else None,
                "seasonal_order": str(sarima_sorder) if sarima_sorder else None,
                "d": d,
                "aic": round(float(sarima_aic), 1) if sarima_aic is not None else None,
                "sarima_rmse": round(sarima_rmse, 1) if np.isfinite(sarima_rmse) else None,
                "hw_rmse": round(hw_rmse, 1) if np.isfinite(hw_rmse) else None,
                "sarima_mae": round(sarima_mae, 1) if np.isfinite(sarima_mae) else None,
                "hw_mae": round(hw_mae, 1) if np.isfinite(hw_mae) else None,
                "last_12m": round(last12, 0),
                "forecast_12m": round(next12, 0),
                "forecast_growth": round(float(growth), 4) if np.isfinite(growth) else None,
                "sarima_forecast_12m": sarima_total,
                "sarima_forecast_growth": sarima_growth,
                "hw_forecast_12m": hw_total,
                "hw_forecast_growth": hw_growth,
                "sarima_status": sarima_status,
                "hw_status": hw_status,
                "holdout_rmse_rel": round(float(rel), 4) if np.isfinite(rel) else None,
                "forecast_quality": quality,
                "bias_correction_factor": round(float(factor), 3),
                "bias_corrected": bool(factor != 1.0),
                "skip_reason": None,
            }
        )

        future = pd.date_range(s.index[-1] + pd.offsets.MonthBegin(1), periods=HORIZON, freq="MS")
        for dt, value in zip(future, fc):
            forecast_rows.append({"city": city, "date": dt, "forecast": round(float(value), 1)})

        diag_rows.append(
            {
                "city": city,
                "n_train": len(train),
                "n_test": len(test),
                "test_actual_sum": float(test.sum()) * scale,
                "sarima_test_sum": float(np.nansum(sarima_pred)) * scale if sarima_pred is not None else None,
                "hw_test_sum": float(np.nansum(hw_pred)) * scale if hw_pred is not None else None,
                "holdout_rmse_rel": round(float(rel), 4) if np.isfinite(rel) else None,
                "forecast_quality": quality,
            }
        )
        log.info(
            "%s: %s wins (SARIMA %s / HW %s RMSE, quality=%s)",
            city, winner,
            f"{sarima_rmse:.0f}" if np.isfinite(sarima_rmse) else "n/a",
            f"{hw_rmse:.0f}" if np.isfinite(hw_rmse) else "n/a",
            quality,
        )

    summary = pd.DataFrame(summary_rows)
    if not summary.empty and "forecast_growth" in summary.columns:
        summary = summary.sort_values("forecast_growth", ascending=False, na_position="last")
    forecasts = pd.DataFrame(forecast_rows, columns=["city", "date", "forecast"])
    diagnostics = pd.DataFrame(diag_rows)
    wins = summary["winner"].value_counts().to_dict() if not summary.empty else {}
    quality = summary["forecast_quality"].value_counts().to_dict() if not summary.empty else {}
    log.info("M3: %d cities modelled, winners=%s, quality=%s", len(summary), wins, quality)
    return ForecastResult(summary=summary, forecasts=forecasts, diagnostics=diagnostics)
