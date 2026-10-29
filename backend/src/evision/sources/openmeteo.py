"""Summer maximum temperature per city.

The brief specifies IMD (mausam.imd.gov.in). IMD exposes no machine-readable
monthly district series — see sources/imd.py — so the feature is filled from
the Open-Meteo ERA5 reanalysis archive, which serves the same physical quantity
(mean daily maximum temperature) as a documented, versioned dataset.

Every row produced here is tagged `open-meteo-era5` and the processed dataset
carries a `temperature_source` column, so this is never mistaken for an IMD
extract. Set EVISION_TEMPERATURE=off to leave the feature null instead.

Method: mean of daily `temperature_2m_max` over April-June (meteorological
summer), per city per year, then the latest complete summer is used as the
cross-sectional feature.
"""

from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from ..config import RAW_DIR, load_yaml
from ..http import get, new_session, write_cache
from ..provenance import Ledger, UNVERIFIED, VERIFIED

log = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
SUMMER_MONTHS = (4, 5, 6)
SOURCE_LABEL = "open-meteo-era5"


def _coordinates() -> dict[str, list[float]]:
    return load_yaml("city_coordinates.yaml").get("cities", {})


def fetch_city_year(
    session, city: str, lat: float, lon: float, start: str, end: str
) -> pd.DataFrame:
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "daily": "temperature_2m_max",
        "timezone": "Asia/Kolkata",
    }
    resp = get(session, ARCHIVE_URL, params=params, timeout=120)
    if resp.status_code >= 400:
        raise RuntimeError(f"{resp.status_code} from archive: {resp.text[:200]}")
    resp.raise_for_status()
    payload = resp.json()

    daily = payload.get("daily") or {}
    dates = daily.get("time") or []
    temps = daily.get("temperature_2m_max") or []
    if not dates:
        return pd.DataFrame()

    frame = pd.DataFrame({"date": pd.to_datetime(dates), "tmax": temps})
    frame = frame.dropna(subset=["tmax"])
    if frame.empty:
        return frame

    frame["city"] = city
    frame["year"] = frame["date"].dt.year
    frame["month"] = frame["date"].dt.month
    summer = frame[frame["month"].isin(SUMMER_MONTHS)]
    if summer.empty:
        return pd.DataFrame()

    out = (
        summer.groupby(["city", "year"], as_index=False)["tmax"]
        .agg(summer_max_temp_c="mean", summer_days="count")
    )
    return out


def fetch_all(ledger: Ledger | None = None, years: tuple[int, int] = (2021, 2026)) -> dict[str, pd.DataFrame]:
    ledger = ledger or Ledger()
    coords = _coordinates()
    if not coords:
        log.warning("no city coordinates configured — temperature skipped")
        return {"summer": pd.DataFrame()}

    cache = RAW_DIR / "openmeteo" / "summer_max_temp.csv"
    if cache.exists():
        frame = pd.read_csv(cache)
        log.info("temperature cache hit: %d rows", len(frame))
        ledger.record(
            source=SOURCE_LABEL,
            dataset="summer_max_temp",
            url=str(cache),
            status=VERIFIED,
            rows=len(frame),
            notes="served from local cache",
        )
        return {"summer": frame}

    session = new_session({"Accept": "application/json"})
    # ERAS5 lags real time by a few days, and asking for a future end date is
    # rejected outright with a 400.
    today = pd.Timestamp.today().normalize()
    start = pd.Timestamp(year=years[0], month=1, day=1)
    end = min(pd.Timestamp(year=years[1], month=12, day=31), today - pd.Timedelta(days=2))
    start_s, end_s = start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
    frames: list[pd.DataFrame] = []
    failures = 0

    for city, (lat, lon) in coords.items():
        try:
            frame = fetch_city_year(session, city, lat, lon, start_s, end_s)
        except Exception as exc:  # noqa: BLE001
            failures += 1
            log.warning("%s: temperature fetch failed (%s)", city, exc)
            continue
        if not frame.empty:
            frames.append(frame)
            log.debug("%s: %d summer years", city, len(frame))

    if not frames:
        ledger.record(
            source=SOURCE_LABEL,
            dataset="summer_max_temp",
            url=ARCHIVE_URL,
            status=UNVERIFIED,
            rows=0,
            notes="no temperature rows returned",
        )
        return {"summer": pd.DataFrame()}

    combined = pd.concat(frames, ignore_index=True).sort_values(["city", "year"])
    combined["source"] = SOURCE_LABEL
    write_cache("openmeteo", "summer_max_temp", combined.to_csv(index=False), "csv")

    ledger.record(
        source=SOURCE_LABEL,
        dataset="summer_max_temp",
        url=ARCHIVE_URL,
        status=VERIFIED,
        rows=len(combined),
        notes=f"Apr-Jun mean daily max, {years[0]}-{years[1]}; {failures} city failures",
    )
    log.info("temperature: %d city-years from %d cities", len(combined), combined["city"].nunique())
    return {"summer": combined}


def latest_by_city(frame: pd.DataFrame) -> pd.DataFrame:
    """Most recent complete summer per city."""
    if frame.empty:
        return pd.DataFrame(columns=["city", "summer_max_temp_c", "temperature_year"])
    complete = frame[frame["summer_days"] >= 80]
    use = complete if not complete.empty else frame
    latest = (
        use.sort_values("year").groupby("city", as_index=False).tail(1)
        [["city", "summer_max_temp_c", "year"]]
        .rename(columns={"year": "temperature_year"})
    )
    return latest
