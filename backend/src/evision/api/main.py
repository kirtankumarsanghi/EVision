"""FastAPI service over the processed EVision dataset.

Serves the 51-city panel, the modelling feature table, the SARIMA forecasts and
the Charging Demand Score ranking. Reads only from data/processed.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from ..config import PROCESSED_DIR, PROVENANCE_DIR

log = logging.getLogger(__name__)

app = FastAPI(
    title="EVision API",
    description="Indian city-level EV charging demand analytics",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PANEL_PATH = PROCESSED_DIR / "user_city_month_panel.csv"
FEATURES_PATH = PROCESSED_DIR / "user_city_features.csv"
CDS_PATH = PROCESSED_DIR / "cds_ranking.csv"
M3_PATH = PROCESSED_DIR / "model_m3_summary.csv"
SPLIT_PATH = PROCESSED_DIR / "vehicle_split.csv"
MANIFEST_PATH = PROCESSED_DIR / "manifest.json"
LEDGER_PATH = PROVENANCE_DIR / "ledger.json"


@lru_cache(maxsize=4)
def _load_csv(path_str: str) -> pd.DataFrame | None:
    path = Path(path_str)
    if not path.exists():
        return None
    frame = pd.read_csv(path)
    if "date" in frame.columns:
        frame["date"] = pd.to_datetime(frame["date"], errors="coerce")
    return frame


def _require(path: Path, name: str, hint: str) -> pd.DataFrame:
    frame = _load_csv(str(path))
    if frame is None:
        raise HTTPException(status_code=503, detail=f"{name} not built — run {hint}")
    return frame


def _panel() -> pd.DataFrame:
    return _require(PANEL_PATH, "city panel", "scripts/build_user_dataset.py")


def _features() -> pd.DataFrame:
    return _require(FEATURES_PATH, "city features", "scripts/build_user_dataset.py")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "datasets": {
            "panel": PANEL_PATH.exists(),
            "features": FEATURES_PATH.exists(),
            "cds_ranking": CDS_PATH.exists(),
            "forecasts": M3_PATH.exists(),
            "vehicle_split": SPLIT_PATH.exists(),
        },
    }


@app.get("/meta")
def meta() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    panel = _panel()
    return {
        "built_at": None,
        "rows": int(len(panel)),
        "cities": int(panel["city"].nunique()),
        "date_min": str(panel["date"].min().date()),
        "date_max": str(panel["date"].max().date()),
    }


@app.get("/provenance")
def provenance() -> dict:
    if not LEDGER_PATH.exists():
        raise HTTPException(status_code=503, detail="no provenance ledger yet")
    records = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
    summary: dict[str, int] = {}
    for record in records:
        summary[record["status"]] = summary.get(record["status"], 0) + 1
    return {"summary": summary, "records": records[-200:]}


@app.get("/cities")
def cities() -> dict:
    frame = _panel()
    summary = (
        frame.groupby(["city", "state_code"], as_index=False)
        .agg(
            first_month=("date", "min"),
            last_month=("date", "max"),
            months=("date", "nunique"),
            total_ev=("ev_registrations", "sum"),
        )
        .sort_values("total_ev", ascending=False)
    )
    summary["first_month"] = summary["first_month"].dt.strftime("%Y-%m")
    summary["last_month"] = summary["last_month"].dt.strftime("%Y-%m")
    return {"count": len(summary), "cities": summary.to_dict("records")}


@app.get("/panel")
def panel(
    city: str | None = Query(default=None),
    start: str | None = Query(default=None, description="YYYY-MM"),
    end: str | None = Query(default=None, description="YYYY-MM"),
    limit: int = Query(default=3000, le=20000),
) -> dict:
    frame = _panel()
    if city:
        frame = frame[frame["city"].str.lower() == city.lower()]
        if frame.empty:
            raise HTTPException(status_code=404, detail=f"unknown city: {city}")
    if start:
        frame = frame[frame["date"] >= pd.Timestamp(start)]
    if end:
        frame = frame[frame["date"] <= pd.Timestamp(end)]

    frame = frame.sort_values(["city", "date"]).head(limit).copy()
    frame["date"] = frame["date"].dt.strftime("%Y-%m-%d")
    return {"count": len(frame), "rows": frame.to_dict("records")}


@app.get("/registrations/{city}")
def registrations(city: str) -> dict:
    frame = _panel()
    subset = frame[frame["city"].str.lower() == city.lower()].sort_values("date")
    if subset.empty:
        raise HTTPException(status_code=404, detail=f"unknown city: {city}")

    subset = subset.copy()
    subset["date"] = subset["date"].dt.strftime("%Y-%m")
    columns = [
        c
        for c in (
            "date",
            "ev_registrations",
            "ev_stock",
            "mom_growth",
            "yoy_growth",
            "observed",
            "imputed",
            "is_outlier",
        )
        if c in subset.columns
    ]
    return {
        "city": subset["city"].iloc[0],
        "state_code": subset["state_code"].iloc[0],
        "months": len(subset),
        "series": subset[columns].to_dict("records"),
    }


@app.get("/features")
def features() -> dict:
    frame = _features()
    return {"count": len(frame), "rows": frame.to_dict("records")}


@app.get("/chargers")
def chargers() -> dict:
    frame = _features()
    cols = [
        c
        for c in (
            "city",
            "stations_within_radius",
            "connectors",
            "fast_stations",
            "share_fast_pct",
            "radius_km",
            "ev_to_charger_ratio",
        )
        if c in frame.columns
    ]
    out = frame[cols].sort_values("stations_within_radius", ascending=False)
    return {
        "note": "single snapshot; radius varies by city (15-30 km)",
        "count": len(out),
        "rows": out.to_dict("records"),
    }


@app.get("/stats")
def stats() -> dict:
    """Descriptive statistics plus city-level z-scores (Objective 1)."""
    frame = _panel()
    values = frame["ev_registrations"].dropna()

    per_city = frame.groupby(["city", "state_code"])["ev_registrations"].agg(
        ["mean", "median", "std", "var", "sum", "count"]
    )
    per_city.columns = [f"{c}_monthly" for c in per_city.columns]
    overall_mean = float(per_city["mean_monthly"].mean())
    overall_sd = float(per_city["mean_monthly"].std(ddof=0))
    per_city["z_score"] = (
        (per_city["mean_monthly"] - overall_mean) / overall_sd if overall_sd else 0.0
    )
    per_city["is_outlier_city"] = per_city["z_score"].abs() > 2.5
    per_city = per_city.reset_index().sort_values("z_score", ascending=False)

    national = frame.groupby("date")["ev_registrations"].sum()
    return {
        "city_months": int(len(values)),
        "mean": round(float(values.mean()), 2),
        "median": round(float(values.median()), 2),
        "variance": round(float(values.var()), 2),
        "std_dev": round(float(values.std()), 2),
        "skew": round(float(values.skew()), 3),
        "p95": round(float(values.quantile(0.95)), 2),
        "city_z_scores": per_city.round(3).to_dict("records"),
        "national_monthly": {
            d.strftime("%Y-%m"): int(v) for d, v in national.items() if pd.notna(v)
        },
    }


@app.get("/demand")
def demand() -> dict:
    """Weighted public-charging demand per city — the gap metric (Objective 1)."""
    frame = _features()
    cols = [
        c
        for c in (
            "city",
            "weighted_ev_stock",
            "stations_within_radius",
            "effective_public_demand",
            "split_method",
            "charger_scope",
            "has_chargers",
            "stations_10km",
            "fast_10km",
            "ev_to_charger_ratio_10km",
        )
        if c in frame.columns
    ]
    out = frame[cols].sort_values("effective_public_demand", ascending=False)
    return {"count": len(out), "rows": out.to_dict("records")}


@app.get("/forecasts")
def forecasts() -> dict:
    """Per-city 12-month forecast and model comparison (Objective 4)."""
    frame = _require(M3_PATH, "forecasts", "scripts/run_models.py")
    return {"count": len(frame), "rows": frame.to_dict("records")}


@app.get("/hotspots")
def hotspots(top: int = Query(default=15, le=51)) -> dict:
    """Charging Demand Score ranking (Objective 5)."""
    frame = _require(CDS_PATH, "CDS ranking", "scripts/run_models.py")
    ranked = frame.head(top).copy()
    ranked["model_score"] = ranked["cds"]
    return {
        "count": len(ranked),
        "scored_by": "Charging Demand Score",
        "formula": "0.4*z(M1 expected monthly) + 0.3*P(high demand) + 0.3*z(M3 growth)",
        "rows": ranked.to_dict("records"),
    }


@app.get("/forecasts/monthly")
def forecasts_monthly(city: str | None = Query(default=None)) -> dict:
    """Per-city 12-month forward forecast curve (monthly)."""
    monthly_path = PROCESSED_DIR / "model_m3_forecasts.csv"
    frame = _require(monthly_path, "monthly forecasts", "scripts/run_models.py")
    if city:
        frame = frame[frame["city"].str.lower() == city.lower()]
    frame = frame.copy()
    frame["date"] = pd.to_datetime(frame["date"]).dt.strftime("%Y-%m-%d")
    return {"count": len(frame), "rows": frame.to_dict("records")}


@app.get("/models/summary")
def models_summary() -> dict:
    """Statistical summary of M1 (NegBin drivers) and M2 (exogenous classifier)."""
    from ..config import BACKEND_ROOT

    m1_path = PROCESSED_DIR / "model_m1_coefficients.csv"
    m2_comp_path = PROCESSED_DIR / "model_m2_comparison.csv"
    m2_conf_path = PROCESSED_DIR / "model_m2_confusion.csv"
    m1 = pd.read_csv(m1_path).to_dict("records") if m1_path.exists() else []
    m2_comp = pd.read_csv(m2_comp_path).to_dict("records") if m2_comp_path.exists() else []
    m2_conf = pd.read_csv(m2_conf_path).to_dict("records") if m2_conf_path.exists() else []
    return {
        "m1_coefficients": m1,
        "m2_comparison": m2_comp,
        "m2_confusion": m2_conf,
    }


@app.get("/seam")
def seam() -> dict:
    """2021->2022 source boundary diagnostics for cities with large ratio steps."""
    from ..config import BACKEND_ROOT

    seam_path = BACKEND_ROOT / "reports" / "seam_2021_2022.csv"
    if not seam_path.exists():
        return {"count": 0, "rows": []}
    frame = pd.read_csv(seam_path)
    return {"count": len(frame), "rows": frame.to_dict("records")}
