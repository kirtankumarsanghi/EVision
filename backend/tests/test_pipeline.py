"""Offline tests for the cleaning pipeline."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from evision.pipeline.clean import (  # noqa: E402
    check_cumulative_consistency,
    complete_grid,
    deduplicate,
    flag_outliers,
    impute_short_gaps,
)


def make_panel(city: str = "Test", months: int = 12, values=None) -> pd.DataFrame:
    dates = pd.date_range("2024-01-01", periods=months, freq="MS")
    values = values if values is not None else list(range(100, 100 + months))
    return pd.DataFrame(
        {
            "city": city,
            "state_code": "MH",
            "tier": "metro",
            "rto_codes": "MH-12",
            "year": dates.year,
            "month": dates.month,
            "date": dates,
            "ev_registrations": values,
            "rto_queries": 1,
        }
    )


class TestDeduplicate:
    def test_keeps_last_duplicate(self):
        frame = make_panel(months=3)
        dup = pd.concat([frame, frame.iloc[[1]]], ignore_index=True)
        out = deduplicate(dup)
        assert len(out) == 3


class TestGrid:
    def test_missing_month_becomes_explicit_nan(self):
        frame = make_panel(months=12)
        frame = frame.drop(index=5).reset_index(drop=True)  # remove JUN
        grid = complete_grid(frame)
        assert len(grid) == 12
        assert grid["observed"].sum() == 11
        assert grid.loc[grid["date"] == pd.Timestamp("2024-06-01"), "ev_registrations"].isna().all()


class TestImputation:
    def test_one_month_gap_is_filled(self):
        frame = make_panel(months=6, values=[100, 110, np.nan, 130, 140, 150])
        frame = complete_grid(frame)
        out = impute_short_gaps(frame)
        filled = out.loc[out["date"] == pd.Timestamp("2024-03-01"), "ev_registrations"].iloc[0]
        assert filled == pytest.approx(120.0)
        assert bool(out["imputed"].any())

    def test_long_gap_is_not_filled(self):
        values = [100, np.nan, np.nan, np.nan, 140, 150]
        frame = make_panel(months=6, values=values)
        frame = complete_grid(frame)
        out = impute_short_gaps(frame)
        assert out.loc[out["date"] == pd.Timestamp("2024-03-01"), "ev_registrations"].isna().all()
        assert not bool(out["imputed"].any())


class TestOutliers:
    def test_spike_is_flagged_not_dropped(self):
        values = [100] * 11 + [5000]
        frame = make_panel(months=12, values=values)
        frame = complete_grid(frame)
        out = flag_outliers(frame)
        assert len(out) == 12, "outliers must never be removed"
        spike = out.loc[out["date"] == pd.Timestamp("2024-12-01")]
        assert bool(spike["is_outlier"].iloc[0])
        assert spike["ev_registrations_winsorised"].iloc[0] < 5000


class TestStockConsistency:
    def test_monotonic_series_has_no_regression(self):
        frame = make_panel(months=12)
        out = check_cumulative_consistency(frame)
        assert not out["stock_regression"].any()
        assert out["ev_stock"].iloc[-1] == sum(range(100, 112))

    def test_negative_value_is_flagged(self):
        values = [100, 110, -5, 130, 140, 150]
        frame = make_panel(months=6, values=values)
        out = check_cumulative_consistency(frame)
        assert out["stock_regression"].any()
