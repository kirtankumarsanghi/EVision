"""Build the analysis panel from the collected user data folder.

This is the primary pipeline now: the user's Vahan export covers every RTO in
the country for 2022-01 .. 2026-09, which is both broader and more recent than
what the dashboard scraper produced.

Inputs actually read from data/source/:
    registrations/vehicle-registrations-by-fuel-type.csv   RTO x month x fuel -> EV counts
    supply/city_chargers.csv                               chargers within a radius, 51 cities
    demographics/city_population_density.csv               Census 2011 + 2023 estimates
    prices/city_month_petrol_51.csv                        city x month petrol price
    policy/state_ev_policy_scores.csv                      state policy coding

EV is defined as `Electric(BOV)` + `Pure EV`, matching Vahan's own coding and
the mid-2024 migration between the two labels.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

import numpy as np
import pandas as pd

from ..config import RAW_DIR, target_cities, vahan_codes
from ..sources.vahan import MONTHS, VahanClient, canonical_rto_code
from .clean import complete_grid, flag_outliers, impute_short_gaps
from .derive import (
    PUBLIC_DEMAND_WEIGHTS,
    _state_name_for,
    add_growth_metrics,
    canonical_state_name,
)
from .market import load_market
from .reference import city_state_lookup, city_meta, rto_city_lookup, user_data_dir
from .supply import load_state_chargers, load_supply_metrics

log = logging.getLogger(__name__)

EV_FUEL_LABELS = {"Electric(BOV)", "Pure EV"}

# Re-exported so callers can keep using pipeline.userdata.user_data_dir()
__all__ = [
    "user_data_dir", "rto_city_lookup", "city_state_lookup",
    "build_panel", "build_features", "load_ev_monthly", "load_ev_split",
    "load_chargers", "load_population", "load_petrol", "load_policy",
]


# ------------------------------------------------------------------ loaders
_CACHE_RE = re.compile(r"^([A-Z]{2})_(\d+)_fuel_mw_(\d{4})\.xml$")


def _cached_city_lookup() -> dict[tuple[str, str], str]:
    """(state code, numeric RTO id) -> city, from config/cities.yaml.

    The dashboard keys offices by a numeric id, and Odisha's files are named
    with the state selector code (OR) while its RTO codes start OD, so match on
    the numeric part inside the configured state rather than on the prefix.
    """
    lookup: dict[tuple[str, str], str] = {}
    for city in target_cities():
        for code in city["rto_codes"]:
            match = re.match(r"^[A-Z]{2}(\d{1,3})$", canonical_rto_code(code))
            if match:
                lookup[(city["state"], str(int(match.group(1))))] = city["name"]
    return lookup


def _cached_years() -> list[int]:
    years = set()
    for path in (RAW_DIR / "vahan").glob("*_fuel_mw_*.xml"):
        match = re.search(r"_fuel_mw_(\d{4})\.xml$", path.name)
        if match:
            years.add(int(match.group(1)))
    return sorted(years)


def load_cached_ev_monthly(year: int) -> pd.DataFrame:
    """EV registrations for one year from cached dashboard responses.

    Used for 2021, which predates the Vahan export. Values come from the same
    parser as the live scraper; `panel_source` records that this year was
    assembled from the cache, not the export.
    """
    paths = sorted((RAW_DIR / "vahan").glob(f"*_fuel_mw_{year}.xml"))
    if not paths:
        return pd.DataFrame(
            columns=["city", "state_code", "date", "ev_registrations", "panel_source"]
        )

    client = VahanClient.__new__(VahanClient)  # no session, no network
    client.codes = vahan_codes()
    lookup = _cached_city_lookup()

    records: list[dict] = []
    unmatched: list[str] = []
    unreadable: list[str] = []
    for path in paths:
        match = _CACHE_RE.match(path.name)
        if not match:
            continue
        state, rto_id = match.group(1), str(int(match.group(2)))
        city = lookup.get((state, rto_id))
        if city is None:
            unmatched.append(path.name)
            continue

        text = path.read_text(encoding="utf-8", errors="ignore")
        try:
            start = text.index("<![CDATA[") + len("<![CDATA[")
            end = text.index("]]></update>", start)
            report = VahanClient._parse_panel(
                text[start:end], y_axis="Fuel", x_axis="Month Wise",
                year=year, state=state, rto=rto_id,
            )
            series = client.monthly_ev(report)
        except Exception as exc:  # noqa: BLE001
            unreadable.append(f"{path.name} ({exc})")
            continue

        for index, month in enumerate(MONTHS, start=1):
            value = series.get(month)
            if value is None:
                continue
            records.append(
                {
                    "city": city,
                    "date": pd.Timestamp(year=year, month=index, day=1),
                    "ev_registrations": int(value),
                }
            )

    if unmatched:
        log.warning("%s: %d cached offices have no city mapping: %s",
                    year, len(unmatched), ", ".join(unmatched))
    if unreadable:
        log.warning("%s: %d cached responses unreadable", year, len(unreadable))

    if not records:
        return pd.DataFrame(
            columns=["city", "state_code", "date", "ev_registrations", "panel_source"]
        )

    frame = pd.DataFrame.from_records(records)
    grouped = (
        frame.groupby(["city", "date"], as_index=False)["ev_registrations"].sum()
    )
    grouped["state_code"] = grouped["city"].map(city_state_lookup())
    grouped["year"] = grouped["date"].dt.year
    grouped["month"] = grouped["date"].dt.month
    grouped["panel_source"] = "dashboard_cache"
    log.info("%s: %d city-months from %d cached offices",
             year, len(grouped), len(paths) - len(unmatched) - len(unreadable))
    return grouped.sort_values(["city", "date"]).reset_index(drop=True)


def load_ev_monthly(data_dir: Path | None = None) -> pd.DataFrame:
    """Monthly EV registrations per city, summed over that city's RTOs."""
    data_dir = data_dir or user_data_dir()
    path = data_dir / "registrations" / "vehicle-registrations-by-fuel-type.csv"
    if not path.exists():
        raise FileNotFoundError(path)

    mapping = rto_city_lookup()
    states = city_state_lookup()

    parts: list[pd.DataFrame] = []
    for chunk in pd.read_csv(
        path,
        usecols=["date", "rto_code", "registration_type", "registrations"],
        chunksize=250_000,
    ):
        chunk["registration_type"] = chunk["registration_type"].astype(str)
        ev = chunk[chunk["registration_type"].isin(EV_FUEL_LABELS)]
        if ev.empty:
            continue
        ev = ev.copy()
        ev["rto_code"] = ev["rto_code"].astype(str).map(canonical_rto_code)
        ev["city"] = ev["rto_code"].map(mapping)
        ev = ev[ev["city"].notna()]
        if ev.empty:
            continue
        ev["registrations"] = pd.to_numeric(ev["registrations"], errors="coerce")
        parts.append(ev[["city", "rto_code", "date", "registrations"]])

    if not parts:
        raise RuntimeError("no EV registrations matched the configured RTOs")

    combined = pd.concat(parts, ignore_index=True)
    combined["date"] = pd.to_datetime(combined["date"], errors="coerce")
    combined = combined.dropna(subset=["date"])
    combined["date"] = combined["date"].values.astype("datetime64[M]").astype("datetime64[ns]")

    grouped = (
        combined.groupby(["city", "date"], as_index=False)["registrations"].sum()
        .rename(columns={"registrations": "ev_registrations"})
    )
    grouped["state_code"] = grouped["city"].map(states)
    grouped["year"] = grouped["date"].dt.year
    grouped["month"] = grouped["date"].dt.month
    grouped["panel_source"] = "vahan_export"

    # Years before the export are recovered from the dashboard cache. Never
    # overlap: an export year always wins over the cache.
    first_export = grouped["date"].min()
    cached_parts: list[pd.DataFrame] = []
    for year in _cached_years():
        if year >= first_export.year:
            continue
        extra = load_cached_ev_monthly(year)
        if not extra.empty:
            cached_parts.append(extra[extra["date"] < first_export])
    if cached_parts:
        cached = pd.concat(cached_parts, ignore_index=True)
        grouped = pd.concat([cached, grouped], ignore_index=True)
        log.info(
            "added %d cached city-months before %s (%s)",
            len(cached), first_export.date(),
            ", ".join(sorted(cached["panel_source"].unique())),
        )

    n_rto = combined["rto_code"].nunique()
    log.info(
        "EV monthly: %d city-months, %d cities, %d RTOs",
        len(grouped), grouped["city"].nunique(), n_rto,
    )
    return grouped.sort_values(["city", "date"]).reset_index(drop=True)


def load_ev_split(data_dir: Path | None = None) -> pd.DataFrame:
    """EV registrations by city x year x 2W/3W/4W.

    NOTE: the fuel and vehicle-category exports are separate files, so they
    cannot be crossed to give EV-by-category. This loads the split produced by
    the dashboard scraper (data/processed/vehicle_split.csv) and is empty when
    that file is absent.
    """
    from ..config import PROCESSED_DIR

    path = PROCESSED_DIR / "vehicle_split.csv"
    if not path.exists():
        log.warning("vehicle_split.csv missing — EV split will be unavailable")
        return pd.DataFrame()
    frame = pd.read_csv(path)
    return frame[["city", "state_code", "year", "bucket", "ev_registrations"]]


def load_chargers(data_dir: Path | None = None) -> pd.DataFrame:
    data_dir = data_dir or user_data_dir()
    frame = pd.read_csv(data_dir / "supply" / "city_chargers.csv")
    frame["city"] = frame["city"].astype(str).str.strip()
    return frame


def load_population(data_dir: Path | None = None) -> pd.DataFrame:
    data_dir = data_dir or user_data_dir()
    frame = pd.read_csv(data_dir / "demographics" / "city_population_density.csv")
    frame["city"] = frame["city"].astype(str).str.strip()
    return frame


def load_petrol(data_dir: Path | None = None) -> pd.DataFrame:
    data_dir = data_dir or user_data_dir()
    frame = pd.read_csv(data_dir / "prices" / "city_month_petrol_51.csv")
    frame["city"] = frame["city"].astype(str).str.strip()
    frame["date"] = pd.to_datetime(
        dict(year=frame["year"], month=frame["month"], day=1), errors="coerce"
    )
    return frame


def load_policy(data_dir: Path | None = None) -> pd.DataFrame:
    data_dir = data_dir or user_data_dir()
    frame = pd.read_csv(data_dir / "policy" / "state_ev_policy_scores.csv")
    frame["state"] = frame["state"].astype(str).str.strip()
    return frame


# ------------------------------------------------------------------- panel
def build_panel(data_dir: Path | None = None) -> pd.DataFrame:
    """City x month panel with cleaning annotations and derived columns.

    The grid, gap-filling and outlier rules live in pipeline/clean.py and are
    shared with the scraper pipeline, so both paths annotate data identically.
    """
    ev = load_ev_monthly(data_dir)

    meta = city_meta()
    ev = ev.copy()
    ev["tier"] = ev["city"].map(lambda c: meta.get(c, {}).get("tier"))
    ev["rto_codes"] = ev["city"].map(
        lambda c: ",".join(meta.get(c, {}).get("rto_codes", []))
    )

    panel = complete_grid(ev)
    panel = impute_short_gaps(panel)
    panel.loc[panel["imputed"], "panel_source"] = "imputed"
    panel = flag_outliers(panel)
    panel = add_growth_metrics(panel)

    # total market and fuel mix context per city-month
    market = load_market(data_dir)
    if not market.empty:
        panel = panel.merge(market, on=["city", "date"], how="left")
        panel["ev_share"] = (
            panel["ev_registrations"] / panel["total_registrations"].replace(0, np.nan)
        )
        panel["commercial_share"] = (
            panel["transport_registrations"]
            / (panel["transport_registrations"] + panel["non_transport_registrations"]).replace(0, np.nan)
        )
        panel["mkt_2w_share"] = panel["mkt_2w"] / panel["total_registrations"].replace(0, np.nan)
        panel["mkt_3w_share"] = panel["mkt_3w"] / panel["total_registrations"].replace(0, np.nan)
        panel["mkt_4w_share"] = panel["mkt_4w"] / panel["total_registrations"].replace(0, np.nan)
        # Market data starts with the export while EV counts can start earlier,
        # so subtract row by row. Aggregating the two totals separately would
        # mix periods and can make this negative.
        panel["non_ev_registrations"] = (
            panel["total_registrations"] - panel["ev_registrations"]
        )

    return panel.reset_index(drop=True)


# ---------------------------------------------------------------- features
def build_features(
    panel: pd.DataFrame,
    data_dir: Path | None = None,
    temperature: pd.DataFrame | None = None,
    income: pd.DataFrame | None = None,
) -> pd.DataFrame:
    data_dir = data_dir or user_data_dir()
    observed = panel[panel["ev_registrations"].notna()]

    agg = observed.groupby("city").agg(
        state_code=("state_code", "first"),
        months_observed=("ev_registrations", "count"),
        ev_total_registrations=("ev_registrations", "sum"),
        avg_monthly_registrations=("ev_registrations", "mean"),
        ev_stock=("ev_stock", "last"),
        latest_month=("date", "max"),
        latest_month_registrations=("ev_registrations", "last"),
    ).reset_index()

    growth = []
    for city, group in observed.groupby("city", sort=False):
        s = group.set_index("date")["ev_registrations"].asfreq("MS")
        last12, prev12 = s.tail(12).sum(min_count=1), s.tail(24).head(12).sum(min_count=1)
        growth.append(
            {
                "city": city,
                "ev_last_12m": last12,
                "ev_prev_12m": prev12,
                "growth_12m": (last12 - prev12) / prev12 if prev12 else np.nan,
            }
        )
    frame = agg.merge(pd.DataFrame.from_records(growth), on="city", how="left")

    # market context: EV share of new sales, and what the city actually buys
    if "total_registrations" in observed.columns:
        aggs = {
            "market_total_registrations": ("total_registrations", "sum"),
            "ev_share_mean": ("ev_share", "mean"),
            "ev_share_latest": ("ev_share", "last"),
            "commercial_share_mean": ("commercial_share", "mean"),
            "market_2w_share": ("mkt_2w_share", "mean"),
            "market_3w_share": ("mkt_3w_share", "mean"),
            "market_4w_share": ("mkt_4w_share", "mean"),
        }
        if "non_ev_registrations" in observed.columns:
            aggs["non_ev_total_registrations"] = ("non_ev_registrations", "sum")
        market = observed.groupby("city", as_index=False).agg(**aggs)
        frame = frame.merge(market, on="city", how="left")
        frame["ev_share_pct"] = (frame["ev_share_mean"] * 100).round(2)
        # Market size excluding EVs. Total registrations contain the EV
        # registrations, so using the total as a predictor of EV counts would be
        # partly regressing a variable on itself.
        if "non_ev_total_registrations" not in frame.columns:
            frame["non_ev_total_registrations"] = (
                frame["market_total_registrations"] - frame["ev_total_registrations"]
            )
        frame["non_ev_total_registrations"] = frame[
            "non_ev_total_registrations"
        ].clip(lower=1)

    # chargers — one circle per city, radius varies 15-30 km
    chargers = load_chargers(data_dir)
    charger_cols = [
        c for c in ("stations_within_radius", "connectors", "fast_stations",
                    "share_fast_pct", "radius_km")
        if c in chargers.columns
    ]
    frame = frame.merge(chargers[["city"] + charger_cols], on="city", how="left")
    frame["ev_to_charger_ratio"] = frame["ev_stock"] / frame["stations_within_radius"].replace(0, np.nan)
    frame["connectors_per_charger"] = frame["connectors"] / frame["stations_within_radius"].replace(0, np.nan)

    # chargers — re-counted on a FIXED radius so cities are comparable
    supply = load_supply_metrics(data_dir)
    if not supply.empty:
        frame = frame.merge(supply, on="city", how="left")
        frame["ev_to_charger_ratio_10km"] = (
            frame["ev_stock"] / frame["stations_10km"].replace(0, np.nan)
        )
        frame["ev_per_fast_10km"] = (
            frame["ev_stock"] / frame["fast_10km"].replace(0, np.nan)
        )
    else:
        for col in ("stations_5km", "stations_10km", "connectors_10km",
                    "fast_10km", "cpos_10km", "share_fast_10km", "max_kw_p90_10km"):
            frame[col] = np.nan
        frame["ev_to_charger_ratio_10km"] = np.nan
        frame["ev_per_fast_10km"] = np.nan

    # state-level totals: a labelled fallback for cities outside the charger
    # extract, never used as a city-level denominator
    state_chargers = load_state_chargers(data_dir)
    if not state_chargers.empty:
        frame = frame.merge(
            state_chargers[
                [
                    "state_code", "state_stations", "state_connectors",
                    "state_fast_stations", "state_charger_source",
                ]
            ],
            on="state_code",
            how="left",
        )
    else:
        for col in ("state_stations", "state_connectors", "state_fast_stations"):
            frame[col] = np.nan
        frame["state_charger_source"] = None

    frame["charger_scope"] = np.select(
        [frame["stations_within_radius"].notna(), frame["state_stations"].notna()],
        ["city", "state"],
        default=None,
    )

    # demographics
    pop = load_population(data_dir)
    pop_cols = [
        "city", "pop_2011", "area_km2_2011", "pop_density_per_km2_2011",
        "pop_estimate_2023", "boundary_type", "demographic_verified",
        "boundary_harmonised",
    ]
    frame = frame.merge(
        pop[[c for c in pop_cols if c in pop.columns]], on="city", how="left"
    )
    frame = frame.rename(columns={"pop_density_per_km2_2011": "population_density"})

    # petrol: latest month + 12-month mean
    petrol = load_petrol(data_dir)
    latest_price = (
        petrol.sort_values("date").groupby("city").tail(1)[["city", "petrol_price", "date"]]
        .rename(columns={"petrol_price": "fuel_price_inr_per_litre", "date": "fuel_price_date"})
    )
    frame = frame.merge(latest_price, on="city", how="left")

    # policy (keyed by state name, so normalise both sides)
    policy = load_policy(data_dir)
    if "score_used" in policy.columns:
        policy_cols = [
            "state", "score_used", "policy_name", "status",
            "policy_verified", "verification_status",
        ]
        use = policy[[c for c in policy_cols if c in policy.columns]].rename(
            columns={"score_used": "ev_policy_score", "status": "policy_status"}
        )
        use["state_key"] = use["state"].map(canonical_state_name)
        frame["state_key"] = frame["state_code"].map(
            lambda code: canonical_state_name(_state_name_for(code))
        )
        frame = frame.merge(use.drop(columns=["state"]), on="state_key", how="left")

    # corridor flag from config
    corridor = {c["name"]: c.get("corridor") for c in target_cities()}
    tier = {c["name"]: c.get("tier") for c in target_cities()}
    frame["highway_corridor"] = frame["city"].map(corridor)
    frame["tier"] = frame["city"].map(tier)

    # summer maximum temperature (Apr-Jun mean daily max)
    if temperature is not None and not temperature.empty:
        temp = temperature[["city", "summer_max_temp_c", "temperature_year"]].copy()
        frame = frame.merge(temp, on="city", how="left")
        frame["temperature_source"] = np.where(
            frame["summer_max_temp_c"].notna(),
            "open-meteo ERA5 (IMD has no machine-readable endpoint)",
            "unavailable",
        )
    else:
        frame["summer_max_temp_c"] = np.nan
        frame["temperature_year"] = np.nan
        frame["temperature_source"] = "unavailable"

    # per-capita income proxy (state NSDP)
    if income is not None and not income.empty:
        inc = income[["state_name", "per_capita_income_inr", "income_vintage"]].copy()
        inc["state_key"] = inc["state_name"].map(canonical_state_name)
        frame = frame.merge(
            inc.drop(columns=["state_name"]), on="state_key", how="left"
        )

    # EV split (from the scraper cache, where available)
    split = load_ev_split(data_dir)
    if not split.empty:
        latest_year = int(split["year"].max())
        current = split[split["year"] == latest_year]
        current = current.assign(
            weight=current["bucket"].map(PUBLIC_DEMAND_WEIGHTS).fillna(0.0),
            weighted=current["ev_registrations"]
            * current["bucket"].map(PUBLIC_DEMAND_WEIGHTS).fillna(0.0),
        )
        agg_split = current.groupby("city").agg(
            weighted_ev_stock=("weighted", "sum"),
            split_total=("ev_registrations", "sum"),
        ).reset_index()
        three = (
            current[current["bucket"] == "3W"]
            .groupby("city")["ev_registrations"].sum()
            .rename("three_w")
        )
        agg_split = agg_split.merge(three, on="city", how="left")
        agg_split["commercial_fleet_share"] = agg_split["three_w"] / agg_split["split_total"].replace(0, np.nan)
        agg_split["vehicle_split_year"] = latest_year
        frame = frame.merge(
            agg_split[["city", "weighted_ev_stock", "commercial_fleet_share", "vehicle_split_year"]],
            on="city", how="left",
        )
        frame["effective_public_demand"] = (
            frame["weighted_ev_stock"] / frame["stations_within_radius"].replace(0, np.nan)
        )
    else:
        frame["weighted_ev_stock"] = np.nan
        frame["commercial_fleet_share"] = np.nan
        frame["effective_public_demand"] = np.nan

    # coverage flags: a missing input must be visible, not silently NaN
    frame["has_chargers"] = frame["stations_within_radius"].notna()
    frame["has_census"] = frame["pop_2011"].notna()
    frame["has_petrol"] = frame["fuel_price_inr_per_litre"].notna()
    frame["has_policy"] = (
        frame["ev_policy_score"].notna()
        if "ev_policy_score" in frame.columns
        else False
    )

    return frame.sort_values("ev_stock", ascending=False).reset_index(drop=True)
