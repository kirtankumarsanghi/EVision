"""Integrity checks for the built dataset and its shared constants.

These replace the one-off `scripts/_verify_*.py` and `_check_sources.py`
scripts. Data-dependent tests skip when the pipeline has not been run yet.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from evision.models.m2_classify import EXOGENOUS  # noqa: E402
from evision.models.split import WEIGHTS as SPLIT_WEIGHTS  # noqa: E402
from evision.pipeline.derive import PUBLIC_DEMAND_WEIGHTS, state_code_for  # noqa: E402
from evision.pipeline.supply import load_state_chargers  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
PROCESSED = BACKEND / "data" / "processed"
SOURCE = BACKEND / "data" / "source"


class TestSharedConstants:
    def test_split_weights_extend_the_pipeline_weights(self):
        assert {b: SPLIT_WEIGHTS[b] for b in PUBLIC_DEMAND_WEIGHTS} == PUBLIC_DEMAND_WEIGHTS
        assert SPLIT_WEIGHTS["OTHER"] == 0.0

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Maharastra", "MH"),
            ("Orissa", "OR"),
            ("Jammu & Kashmir", "JK"),
            ("Delhi", "DL"),
        ],
    )
    def test_state_names_resolve_to_codes(self, raw, expected):
        assert state_code_for(raw) == expected

    def test_state_charger_fallback_is_labelled_and_not_city_scoped(self):
        if not (SOURCE / "supply" / "state_chargers_from_pdf.csv").exists():
            pytest.skip("state charger source not present")
        frame = load_state_chargers()
        assert len(frame) == 36
        assert frame["state_code"].notna().all()
        assert frame["state_charger_source"].str.startswith("snapshot:").all()
        # a state total must never be exposed under the city radius column
        assert "stations_within_radius" not in frame.columns


def _processed(name: str) -> Path:
    path = PROCESSED / name
    if not path.exists():
        pytest.skip(f"{name} not built yet")
    return path


def test_manifest_matches_panel():
    manifest = json.loads(_processed("manifest.json").read_text(encoding="utf-8"))
    panel = pd.read_csv(_processed("user_city_month_panel.csv"))
    assert manifest["rows"] == len(panel)
    assert manifest["cities"] == panel["city"].nunique()
    assert manifest["configured_cities"] >= manifest["cities"]
    assert manifest["stock_regressions"] == 0


def test_features_carry_coverage_flags():
    features = pd.read_csv(_processed("user_city_features.csv"))
    for column in ("has_chargers", "has_census", "has_petrol", "has_policy", "charger_scope"):
        assert column in features.columns
    assert features["charger_scope"].isin(["city", "state"]).all()
    assert int(features["has_chargers"].sum()) == int(
        (features["charger_scope"] == "city").sum()
    )


def test_panel_has_no_unflagged_stock_regressions():
    panel = pd.read_csv(_processed("user_city_month_panel.csv"), parse_dates=["date"])
    assert not panel["stock_regression"].any()
    assert panel["observed"].mean() > 0.95


def test_panel_sources_are_labelled():
    panel = pd.read_csv(_processed("user_city_month_panel.csv"), parse_dates=["date"])
    assert "panel_source" in panel.columns
    assert set(panel["panel_source"].dropna().unique()) <= {
        "dashboard_cache", "vahan_export", "imputed",
    }
    early = panel[(panel["date"] < "2022-01-01") & panel["observed"]]
    assert not early.empty
    assert (early["panel_source"] == "dashboard_cache").all()


FORBIDDEN_M2_PREDICTORS = {
    "ev_stock", "ev_registrations", "stations_within_radius", "stations_10km",
    "fast_10km", "growth_12m", "weighted_ev_stock", "effective_public_demand",
    "effective_public_demand_10km",
}


def test_m2_has_no_label_leakage():
    assert not (set(EXOGENOUS) & FORBIDDEN_M2_PREDICTORS)


def test_row_counts_reconcile():
    manifest = json.loads(_processed("manifest.json").read_text(encoding="utf-8"))
    panel = pd.read_csv(_processed("user_city_month_panel.csv"), parse_dates=["date"])
    fitted = pd.read_csv(_processed("model_m1_fitted.csv"))
    assert len(panel) - len(fitted) == manifest["model_rows_dropped"]
    assert manifest["unobserved_rows"] == manifest["model_rows_dropped"]
    missing = manifest["cities_without_2021"]
    assert len(missing) == 9
    for city in missing:
        sub = panel[(panel["city"] == city) & (panel["date"].dt.year == 2021)]
        assert len(sub) == 12
        assert int(sub["observed"].sum()) == 0


def test_corridor_is_binary():
    features = pd.read_csv(_processed("user_city_features.csv"))
    assert features["highway_corridor"].notna().all()
    assert set(features["highway_corridor"].unique()) <= {0, 1}


def test_m3_forecasts_are_finite_and_flagged():
    summary = pd.read_csv(_processed("model_m3_summary.csv"))
    panel = pd.read_csv(_processed("user_city_month_panel.csv"))
    assert set(summary["city"]) == set(panel["city"].unique())
    for column in ("forecast_12m", "sarima_forecast_12m", "hw_forecast_12m"):
        values = summary[column].dropna()
        assert np.isfinite(values).all(), f"{column} has non-finite values"
        assert (values >= 0).all(), f"{column} has negative values"
    assert set(summary["forecast_quality"].dropna()) <= {"ok", "weak", "unstable"}


def test_verification_flags_are_explicit():
    features = pd.read_csv(_processed("user_city_features.csv"))
    assert int(features["demographic_verified"].astype(bool).sum()) == 51
    assert int((~features["boundary_harmonised"].astype(bool)).sum()) == 7
    assert int(features["policy_verified"].fillna(False).astype(bool).sum()) == 0


def test_sensitivity_and_shortlist_outputs_exist():
    for name in (
        "model_m1_sensitivity.csv",
        "model_m1_policy_sensitivity.csv",
        "model_m1_demographics_sensitivity.csv",
        "model_m2_sensitivity.csv",
        "model_m3_2022only.csv",
        "cds_ranking_top15.csv",
    ):
        assert _processed(name).exists()
    top = pd.read_csv(_processed("cds_ranking_top15.csv"))
    assert len(top) == 15
    assert top["rank"].tolist() == list(range(1, 16))


def test_m1_and_m2_report_sensitivity_columns():
    m1 = pd.read_csv(_processed("model_m1_sensitivity.csv"))
    assert {"irr_with_fuel", "irr_without_fuel"} <= set(m1.columns)
    m2 = pd.read_csv(_processed("model_m2_comparison.csv"))
    assert {"train_auc", "train_cv_gap"} <= set(m2.columns)


def test_master_panel_is_consistent():
    path = PROCESSED / "master_ev_panel.csv"
    if not path.exists():
        pytest.skip("master_ev_panel.csv not built yet")
    frame = pd.read_csv(path, parse_dates=["date"])
    assert not frame.duplicated(["city", "date"]).any()
    assert not frame["stock_regression"].any()
    observed = frame[frame["ev_registrations"].notna()]
    assert (observed["ev_registrations"] >= 0).all()
    assert "effective_public_demand" in frame.columns
    assert "effective_public_demand_10km" in frame.columns
    assert frame["effective_public_demand"].notna().any()
    assert frame["effective_public_demand_10km"].notna().any()


def test_m3_has_a_sarima_forecast_for_every_city():
    path = PROCESSED / "model_m3_summary.csv"
    if not path.exists():
        pytest.skip("model_m3_summary.csv not built yet")
    summary = pd.read_csv(path)
    panel = pd.read_csv(_processed("user_city_month_panel.csv"))
    assert set(summary["city"]) == set(panel["city"].unique())
    assert summary["sarima_forecast_12m"].notna().all()
    assert summary["sarima_forecast_growth"].notna().all()


def test_vehicle_split_methods_are_documented():
    path = PROCESSED / "features_model.csv"
    if not path.exists():
        pytest.skip("features_model.csv not built yet")
    frame = pd.read_csv(path)
    assert set(frame["split_method"].dropna().unique()) <= {"measured", "state", "national"}
    assert frame["effective_public_demand"].notna().any()
