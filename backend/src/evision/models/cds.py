"""Charging Demand Score (CDS) and hotspot ranking.

    CDS = 0.4 * z(M1 expected monthly registrations)
        + 0.3 * P(High demand from M2)
        + 0.3 * z(M3 forecast 12-month growth)

z() standardises across cities. The weights are a policy choice, not an
estimate, so the output includes a sensitivity check: each weight is perturbed
by ±0.10 and we report how much the top-15 membership moves.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

WEIGHTS = {"m1": 0.40, "m2": 0.30, "m3": 0.30}


def _z(series: pd.Series) -> pd.Series:
    sd = series.std(ddof=0)
    if not np.isfinite(sd) or sd == 0:
        return pd.Series(np.zeros(len(series)), index=series.index)
    return (series - series.mean()) / sd


def _recommend(score: float) -> str:
    if score >= 1.5:
        return "Critical — immediate fast-charger deployment"
    if score >= 0.75:
        return "High — prioritise in the next wave"
    if score >= 0.0:
        return "Moderate — monitor and plan"
    return "Low — defer"


def build(
    m1_fitted: pd.DataFrame,
    m2_predictions: pd.DataFrame,
    m3_summary: pd.DataFrame,
    features: pd.DataFrame,
) -> pd.DataFrame:
    """Combine the three model outputs into a ranked table."""
    m1 = (
        m1_fitted.groupby("city", as_index=False)["fitted"].mean()
        .rename(columns={"fitted": "m1_expected_monthly"})
    )
    m2 = m2_predictions[["city", "p_high"]].copy()
    m3_cols = [
        c for c in ("city", "forecast_growth", "forecast_12m", "winner", "forecast_quality")
        if c in m3_summary.columns
    ]
    m3 = m3_summary[m3_cols].copy()

    df = (
        features[
            [
                c
                for c in (
                    "city", "state_code", "ev_stock",
                    "ev_to_charger_ratio", "ev_to_charger_ratio_10km",
                    "effective_public_demand", "effective_public_demand_10km",
                    "stations_10km", "fast_10km", "ev_share_pct",
                    "split_method", "growth_12m",
                )
                if c in features.columns
            ]
        ]
        .merge(m1, on="city", how="left")
        .merge(m2, on="city", how="left")
        .merge(m3, on="city", how="left")
    )

    # only forecasts that passed the holdout quality gate drive the CDS;
    # everything else falls back to observed 12-month growth and says so
    usable = df["winner"].notna()
    if "forecast_quality" in df.columns:
        usable = usable & df["forecast_quality"].eq("ok")
    else:
        usable = usable & df["forecast_growth"].notna()

    df["forecast_growth"] = df["forecast_growth"].where(usable)
    if "growth_12m" in features.columns:
        fallback = features.set_index("city")["growth_12m"]
        df["forecast_growth"] = df["forecast_growth"].fillna(df["city"].map(fallback))
    df["m3_source"] = np.where(
        usable, "SARIMA/HW forecast", "observed 12-month growth"
    )

    for col in ("m1_expected_monthly", "p_high", "forecast_growth"):
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["z_m1"] = _z(df["m1_expected_monthly"].fillna(df["m1_expected_monthly"].median()))
    df["z_m3"] = _z(df["forecast_growth"].fillna(df["forecast_growth"].median()))
    df["p_high"] = df["p_high"].fillna(df["p_high"].median())

    df["cds"] = (
        WEIGHTS["m1"] * df["z_m1"]
        + WEIGHTS["m2"] * df["p_high"]
        + WEIGHTS["m3"] * df["z_m3"]
    )

    df = df.sort_values("cds", ascending=False).reset_index(drop=True)
    df.insert(0, "rank", range(1, len(df) + 1))
    df["recommendation"] = df["cds"].apply(_recommend)
    return df


def sensitivity(ranked: pd.DataFrame, top_n: int = 15) -> pd.DataFrame:
    """How stable is the top-15 under ±0.10 perturbations of each weight?"""
    base_top = set(ranked.head(top_n)["city"])
    rows = []

    for key in WEIGHTS:
        for delta in (-0.10, 0.10):
            w = dict(WEIGHTS)
            w[key] = round(w[key] + delta, 2)
            total = sum(w.values())
            w = {k: v / total for k, v in w.items()}

            score = (
                w["m1"] * ranked["z_m1"]
                + w["m2"] * ranked["p_high"]
                + w["m3"] * ranked["z_m3"]
            )
            top = set(ranked.assign(score=score).nlargest(top_n, "score")["city"])
            rows.append(
                {
                    "perturbation": f"{key} {delta:+.2f}",
                    "weights": ", ".join(f"{k}={v:.2f}" for k, v in w.items()),
                    "overlap_with_base": len(base_top & top),
                    "entered": ", ".join(sorted(top - base_top)) or "-",
                    "dropped": ", ".join(sorted(base_top - top)) or "-",
                }
            )
    return pd.DataFrame(rows)
