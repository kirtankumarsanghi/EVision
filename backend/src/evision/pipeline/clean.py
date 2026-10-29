"""Cleaning rules for the city-month registration panel.

Everything here annotates rather than deletes, except exact duplicates. Bulk
fleet registrations are real events, so outliers get flagged and winsorised
alongside a preserved raw column — the analyst decides, not the pipeline.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

log = logging.getLogger(__name__)

MAX_INTERPOLATION_GAP = 2  # months; longer gaps are flagged, not filled


def deduplicate(panel: pd.DataFrame) -> pd.DataFrame:
    before = len(panel)
    out = panel.drop_duplicates(subset=["city", "date"], keep="last")
    if len(out) != before:
        log.warning("dropped %d duplicate city-month rows", before - len(out))
    return out


def complete_grid(panel: pd.DataFrame) -> pd.DataFrame:
    """Reindex onto a full city x month grid so gaps become explicit NaN."""
    if panel.empty:
        return panel

    months = pd.date_range(
        panel["date"].min().replace(day=1),
        panel["date"].max().replace(day=1),
        freq="MS",
    )
    cities = (
        panel[["city", "state_code", "tier", "rto_codes"]]
        .drop_duplicates("city")
        .reset_index(drop=True)
    )

    index = pd.MultiIndex.from_product(
        [cities["city"], months], names=["city", "date"]
    )
    grid = panel.set_index(["city", "date"]).reindex(index).reset_index()

    # Fill city metadata for rows created by the reindex. Mapping rather than
    # merging keeps the frame free of duplicated *_meta columns.
    for column in ("state_code", "tier", "rto_codes"):
        lookup = cities.set_index("city")[column]
        grid[column] = grid[column].fillna(grid["city"].map(lookup))

    grid["year"] = grid["date"].dt.year
    grid["month"] = grid["date"].dt.month
    grid["observed"] = grid["ev_registrations"].notna()

    log.info(
        "grid: %d rows, %d observed (%.1f%% coverage)",
        len(grid),
        int(grid["observed"].sum()),
        100 * grid["observed"].mean(),
    )
    return grid


def impute_short_gaps(grid: pd.DataFrame) -> pd.DataFrame:
    """Linear interpolation across runs of <=2 missing months within a city."""
    out = grid.sort_values(["city", "date"]).copy()
    out["gap_length"] = 0
    out["imputed"] = False

    frames: list[pd.DataFrame] = []
    for city, group in out.groupby("city", sort=False):
        group = group.sort_values("date").copy()
        values = group["ev_registrations"]

        # measure the length of each NaN run
        is_na = values.isna().to_numpy()
        run_id = np.cumsum(~is_na)
        gap_lengths = pd.Series(is_na).groupby(run_id).transform("sum")
        group["gap_length"] = np.where(is_na, gap_lengths.to_numpy(), 0)

        fillable = group["gap_length"].between(1, MAX_INTERPOLATION_GAP)
        if fillable.any():
            interpolated = values.interpolate(method="linear", limit_area="inside")
            group.loc[fillable, "ev_registrations"] = interpolated[fillable]
            group.loc[fillable, "imputed"] = True

        frames.append(group)

    result = pd.concat(frames, ignore_index=True)
    imputed = int(result["imputed"].sum())
    long_gaps = int((result["gap_length"] > MAX_INTERPOLATION_GAP).sum())
    if imputed:
        log.info("imputed %d city-months (<=%d month gaps)", imputed, MAX_INTERPOLATION_GAP)
    if long_gaps:
        log.warning("%d city-months in gaps longer than %d months left as NaN", long_gaps, MAX_INTERPOLATION_GAP)
    return result


def flag_outliers(frame: pd.DataFrame, column: str = "ev_registrations") -> pd.DataFrame:
    """IQR flag per city. Never drops rows; adds flag + winsorised columns."""
    out = frame.copy()
    out["iqr_lower"] = np.nan
    out["iqr_upper"] = np.nan
    out["is_outlier"] = False

    for city, group in out.groupby("city", sort=False):
        observed = group[column].dropna()
        if len(observed) < 8:
            continue
        q1, q3 = observed.quantile([0.25, 0.75])
        iqr = q3 - q1
        if iqr == 0:
            # Degenerate spread (common in small cities with flat registrations).
            # The classic IQR fence collapses to a point here, so fall back to a
            # median-relative fence: 0.25x .. 4x the median.
            median = observed.median()
            if median <= 0:
                continue
            lower = median * 0.25
            upper = median * 4.0
        else:
            lower = q1 - 1.5 * iqr
            upper = q3 + 1.5 * iqr
        mask = group.index
        out.loc[mask, "iqr_lower"] = lower
        out.loc[mask, "iqr_upper"] = upper
        out.loc[mask, "is_outlier"] = (
            (out.loc[mask, column] > upper) | (out.loc[mask, column] < lower)
        )

    out["ev_registrations_winsorised"] = out[column].clip(
        lower=out["iqr_lower"], upper=out["iqr_upper"]
    )
    flagged = int(out["is_outlier"].sum())
    if flagged:
        log.info("%d city-months flagged as IQR outliers (kept, flagged)", flagged)
    return out


def check_cumulative_consistency(frame: pd.DataFrame) -> pd.DataFrame:
    """Cumulative stock must never decrease; flag any negative increment."""
    out = frame.sort_values(["city", "date"]).copy()
    out["ev_stock"] = out.groupby("city")["ev_registrations"].cumsum()
    out["stock_delta"] = out.groupby("city")["ev_stock"].diff()
    out["stock_regression"] = out["stock_delta"] < 0

    bad = int(out["stock_regression"].sum())
    if bad:
        log.warning("%d city-months show a negative month-on-month increment", bad)
    return out


