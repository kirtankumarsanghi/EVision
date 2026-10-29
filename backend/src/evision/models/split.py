"""Complete the 2W/3W/4W EV split for cities without a measured breakdown.

The split comes from a fuel x vehicle-category cross-tab. For 42 cities we have
it measured; the rest were added to the universe after the dashboard started
rate-limiting us. Rather than leave holes, this fills them with a documented
proxy and records which method produced each row:

    measured   - from the dashboard cross-tab (preferred)
    state      - median bucket mix of measured cities in the same state
    national   - median bucket mix across all measured cities

A proxy row is an estimate, not an observation. `split_method` travels with the
data so it can be filtered or dropped.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from ..pipeline.derive import PUBLIC_DEMAND_WEIGHTS

log = logging.getLogger(__name__)

BUCKETS = ["2W", "3W", "4W", "COMM", "OTHER"]
WEIGHTS = {**PUBLIC_DEMAND_WEIGHTS, "OTHER": 0.0}
# Pool two full years so a single odd month cannot swing the mix.
REF_YEARS = (2024, 2025)


def _shares(frame: pd.DataFrame) -> pd.DataFrame:
    """bucket shares per city over the reference window."""
    window = frame[frame["year"].isin(REF_YEARS)]
    if window.empty:
        window = frame[frame["year"] == frame["year"].max()]
    totals = window.groupby(["city", "state_code", "bucket"], as_index=False)[
        "ev_registrations"
    ].sum()
    grand = totals.groupby("city")["ev_registrations"].transform("sum")
    totals["share"] = np.where(grand > 0, totals["ev_registrations"] / grand, np.nan)
    return totals


def build_split(
    split: pd.DataFrame,
    panel: pd.DataFrame,
    all_cities: list[str] | None = None,
) -> pd.DataFrame:
    """Return city-level split features for every city, with a method column.

    Columns: city, state_code, ref_year_ev, weighted_ev_stock,
             commercial_fleet_share, split_method, split_donors
    """
    if split.empty:
        raise RuntimeError("no measured split available")

    shares = _shares(split)
    measured_cities = set(shares["city"].unique())

    # reference-year EV total per city (same basis as the measured rows)
    window = panel[panel["date"].dt.year.isin(REF_YEARS)]
    ref_ev = (
        window.groupby("city", as_index=False)["ev_registrations"].sum()
        .rename(columns={"ev_registrations": "ref_year_ev"})
    )
    state_of = (
        panel[["city", "state_code"]].drop_duplicates().set_index("city")["state_code"]
    )

    if all_cities is None:
        all_cities = sorted(ref_ev["city"].unique())

    # state and national reference mixes, computed from measured cities only
    measured_share = shares[shares["city"].isin(measured_cities)].copy()
    measured_share["state_code"] = measured_share["city"].map(state_of)
    state_mix = (
        measured_share.groupby(["state_code", "bucket"])["share"].median()
        .unstack("bucket")
    )
    national_mix = measured_share.groupby("bucket")["share"].median()

    rows: list[dict] = []
    for city in all_cities:
        ev = ref_ev.loc[ref_ev["city"] == city, "ref_year_ev"]
        ev_total = float(ev.iloc[0]) if len(ev) else np.nan
        state = state_of.get(city)

        if city in measured_cities:
            city_shares = (
                shares[shares["city"] == city].set_index("bucket")["share"]
                .reindex(BUCKETS).fillna(0.0)
            )
            method = "measured"
            donors = "self"
        elif state in state_mix.index and state_mix.loc[state].notna().any():
            city_shares = state_mix.loc[state].reindex(BUCKETS).fillna(0.0)
            method = "state"
            donors = ", ".join(sorted(shares.loc[shares["city"].isin(
                measured_cities) & (shares["city"].map(state_of) == state), "city"].unique()))
        else:
            city_shares = national_mix.reindex(BUCKETS).fillna(0.0)
            method = "national"
            donors = f"all {len(measured_cities)} measured cities"

        weighted_share = float(sum(city_shares[b] * WEIGHTS[b] for b in BUCKETS))
        rows.append(
            {
                "city": city,
                "state_code": state,
                "ref_year_ev": ev_total,
                "weighted_ev_stock": ev_total * weighted_share,
                "commercial_fleet_share": float(city_shares.get("3W", 0.0)),
                "split_method": method,
                "split_donors": donors,
            }
        )

    frame = pd.DataFrame.from_records(rows)
    counts = frame["split_method"].value_counts().to_dict()
    log.info("split coverage: %s", counts)
    return frame
