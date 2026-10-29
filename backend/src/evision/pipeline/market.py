"""Total vehicle market per city per month, from the Vahan category and class exports.

These are all-fuel counts, not EV counts. Their value is the denominator:
EV registrations divided by total registrations gives EV *share of new sales*,
which is a cleaner adoption signal than a raw count (a big city registers more
of everything).

The two exports answer different questions:
    category -> composition by body type (2W / 3W / 4W / commercial)
    class    -> Transport vs Non-Transport, i.e. commercial vs private use
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from ..sources.vahan import canonical_rto_code
from .reference import rto_city_lookup, user_data_dir

log = logging.getLogger(__name__)

CATEGORY_TO_BUCKET = {
    "Two Wheeler(T)": "2W",
    "Two Wheeler(NT)": "2W",
    "Two Wheeler (Invalid Carriage)": "2W",
    "Three Wheeler(T)": "3W",
    "Three Wheeler(NT)": "3W",
    "Three Wheeler (Invalid Carriage)": "3W",
    "Four Wheeler (Invalid Carriage)": "4W",
    "Light Motor Vehicle": "4W",
    "Light Passenger Vehicle": "4W",
    "Medium Passenger Vehicle": "4W",
    "Light Goods Vehicle": "COMM",
    "Medium Goods Vehicle": "COMM",
    "Heavy Goods Vehicle": "COMM",
    "Heavy Motor Vehicle": "COMM",
    "Medium Motor Vehicle": "COMM",
    "Heavy Passenger Vehicle": "COMM",
    "Other Than Mentioned Above": "COMM",
}


def _month_key(series: pd.Series) -> pd.Series:
    dates = pd.to_datetime(series, errors="coerce")
    return dates.dt.to_period("M").dt.to_timestamp()


def load_market_monthly(data_dir: Path | None = None) -> pd.DataFrame:
    """City x month total registrations split into 2W / 3W / 4W / COMM."""
    data_dir = data_dir or user_data_dir()
    path = data_dir / "registrations" / "registrations-by-vehicle-category.csv"
    if not path.exists():
        log.warning("%s missing — market columns will be absent", path.name)
        return pd.DataFrame()

    mapping = rto_city_lookup()
    parts: list[pd.DataFrame] = []

    for chunk in pd.read_csv(
        path,
        usecols=["date", "rto_code", "registration_type", "registrations"],
        chunksize=250_000,
    ):
        chunk = chunk.copy()
        chunk["bucket"] = chunk["registration_type"].map(CATEGORY_TO_BUCKET)
        chunk = chunk[chunk["bucket"].notna()]
        if chunk.empty:
            continue
        chunk["city"] = chunk["rto_code"].astype(str).map(canonical_rto_code).map(mapping)
        chunk = chunk[chunk["city"].notna()]
        if chunk.empty:
            continue
        chunk["registrations"] = pd.to_numeric(chunk["registrations"], errors="coerce")
        chunk["date"] = _month_key(chunk["date"])
        parts.append(chunk[["city", "date", "bucket", "registrations"]])

    if not parts:
        return pd.DataFrame()

    combined = pd.concat(parts, ignore_index=True)
    pivot = (
        combined.groupby(["city", "date", "bucket"], as_index=False)["registrations"].sum()
        .pivot(index=["city", "date"], columns="bucket", values="registrations")
        .fillna(0)
        .reset_index()
    )
    pivot.columns = [str(c).lower() for c in pivot.columns]
    for col in ("2w", "3w", "4w", "comm"):
        if col not in pivot.columns:
            pivot[col] = 0.0

    pivot["total_registrations"] = pivot[["2w", "3w", "4w", "comm"]].sum(axis=1)
    pivot = pivot.rename(columns={"2w": "mkt_2w", "3w": "mkt_3w", "4w": "mkt_4w", "comm": "mkt_comm"})
    log.info("market: %d city-months", len(pivot))
    return pivot


def load_class_monthly(data_dir: Path | None = None) -> pd.DataFrame:
    """City x month registrations split into Transport and Non-Transport."""
    data_dir = data_dir or user_data_dir()
    path = data_dir / "registrations" / "registrations-by-vehicle-class.csv"
    if not path.exists():
        log.warning("%s missing — commercial share will be absent", path.name)
        return pd.DataFrame()

    mapping = rto_city_lookup()
    parts: list[pd.DataFrame] = []

    for chunk in pd.read_csv(
        path,
        usecols=["date", "rto_code", "vehicle_class", "registrations"],
        chunksize=250_000,
    ):
        chunk = chunk.copy()
        chunk["city"] = chunk["rto_code"].astype(str).map(canonical_rto_code).map(mapping)
        chunk = chunk[chunk["city"].notna()]
        if chunk.empty:
            continue
        chunk["registrations"] = pd.to_numeric(chunk["registrations"], errors="coerce")
        chunk["date"] = _month_key(chunk["date"])
        parts.append(chunk[["city", "date", "vehicle_class", "registrations"]])

    if not parts:
        return pd.DataFrame()

    combined = pd.concat(parts, ignore_index=True)
    grouped = (
        combined.groupby(["city", "date", "vehicle_class"], as_index=False)["registrations"]
        .sum()
        .pivot(index=["city", "date"], columns="vehicle_class", values="registrations")
        .fillna(0)
        .reset_index()
    )
    grouped.columns = [str(c).lower().replace(" ", "_") for c in grouped.columns]
    for col in ("transport", "non_transport"):
        if col not in grouped.columns:
            grouped[col] = 0.0
    grouped["transport_registrations"] = grouped["transport"]
    grouped["non_transport_registrations"] = grouped["non_transport"]
    grouped = grouped.drop(columns=["transport", "non_transport"])
    log.info("class: %d city-months", len(grouped))
    return grouped


def load_market(data_dir: Path | None = None) -> pd.DataFrame:
    """Market size and class split joined on city + month."""
    market = load_market_monthly(data_dir)
    classes = load_class_monthly(data_dir)
    if market.empty:
        return classes
    if classes.empty:
        return market
    return market.merge(classes, on=["city", "date"], how="outer")
