"""Charging supply measured at fixed radii from each city's centre.

city_chargers.csv collapses 29,070 stations into one circle per city, and that
circle's radius varies 15-30 km. Comparing a 30 km count for Bengaluru with a
15 km count for Agra is apples to oranges.

stations_clean.csv carries `dist_km` (distance from the assigned city centre) for
every station, so the same stations can be re-counted on a fixed radius. We use
5 km and 10 km because those are inside every city's assignment radius, which
makes the numbers genuinely comparable.

A caveat that must travel with this: a station is only listed for the nearest
target city within that city's radius, so a 10 km count is complete for all 51
cities, but a 20 km count would be truncated wherever the radius is 15 km. Only
5 and 10 km are used here.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from .derive import state_code_for
from .reference import user_data_dir

log = logging.getLogger(__name__)

RADII = (5, 10)
STATE_CHARGER_SOURCE = "EV_PCS_Data_29277.pdf"


def load_supply_metrics(data_dir: Path | None = None) -> pd.DataFrame:
    """One row per city with station/connector counts at 5 and 10 km."""
    data_dir = data_dir or user_data_dir()
    path = data_dir / "supply" / "stations_clean.csv"
    if not path.exists():
        log.warning("%s missing — fixed-radius supply metrics unavailable", path.name)
        return pd.DataFrame()

    frame = pd.read_csv(path)
    frame = frame[frame["city_within_51"].notna()].copy()
    if frame.empty:
        return pd.DataFrame()

    frame["fast"] = frame["fast"].astype(bool)
    frame["connectors"] = pd.to_numeric(frame["connectors"], errors="coerce").fillna(0)
    frame["max_kw"] = pd.to_numeric(frame["max_kw"], errors="coerce")

    rows = []
    for city, group in frame.groupby("city_within_51"):
        row: dict[str, object] = {"city": city, "stations_assigned": len(group)}
        for r in RADII:
            near = group[group["dist_km"] <= r]
            row[f"stations_{r}km"] = int(len(near))
            row[f"connectors_{r}km"] = float(near["connectors"].sum())
            row[f"fast_{r}km"] = int(near["fast"].sum())
            row[f"cpos_{r}km"] = int(near["cpo"].nunique())
            row[f"max_kw_p90_{r}km"] = (
                float(near["max_kw"].quantile(0.90)) if len(near) else float("nan")
            )
            row[f"share_fast_{r}km"] = (
                round(float(near["fast"].mean()) * 100, 2) if len(near) else float("nan")
            )
        rows.append(row)

    out = pd.DataFrame.from_records(rows)
    log.info(
        "supply: %d cities, median stations_10km=%.0f",
        len(out), out["stations_10km"].median(),
    )
    return out


def load_state_chargers(data_dir: Path | None = None) -> pd.DataFrame:
    """State-level public charger totals from the E-Amrit PCS statement.

    A state total is not a city figure. It is returned separately so callers can
    use it as an explicit, labelled fallback and keep it out of city ratios.
    """
    data_dir = data_dir or user_data_dir()
    path = data_dir / "supply" / "state_chargers_from_pdf.csv"
    if not path.exists():
        log.warning("%s missing — no state-level charger fallback", path.name)
        return pd.DataFrame()

    frame = pd.read_csv(path).rename(
        columns={
            "stations": "state_stations",
            "connectors": "state_connectors",
            "fast_stations": "state_fast_stations",
        }
    )
    frame["state_code"] = frame["state"].map(state_code_for)
    frame["state_charger_source"] = f"snapshot: {STATE_CHARGER_SOURCE}"
    if frame["state_code"].isna().any():
        missing = frame.loc[frame["state_code"].isna(), "state"].tolist()
        log.warning("state charger rows with no matching code: %s", missing)
    return frame.drop(columns=["state"])
