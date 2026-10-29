"""Assemble the city x month EV registration panel from Vahan.

Design notes
------------
* Cities are grouped by state because resolving RTOs requires one AJAX round
  trip per state, not per city.
* A city may span several RTOs (Delhi has 13). Each RTO is queried separately
  and summed, because Vahan's report accepts exactly one office at a time.
* The scrape is network-bound (~2 s/request), so cities are fetched by a small
  thread pool. Each worker owns its own VahanClient/session — JSF view state is
  per-session and must not be shared.
* Every query is cached to data/raw/vahan, so an interrupted run resumes
  instead of re-scraping.
* EV = ELECTRIC(BOV) + PURE EV. Vahan migrated records between those two codes
  during 2024; summing is mandatory (see sources/vahan.py).
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import pandas as pd

from ..config import target_cities
from ..sources.vahan import MONTHS, VahanClient, canonical_rto_code, derive_rto_id

log = logging.getLogger(__name__)

PANEL_COLUMNS = [
    "city",
    "state_code",
    "tier",
    "rto_codes",
    "year",
    "month",
    "date",
    "ev_registrations",
    "rto_queries",
]

_local = threading.local()


def _worker_client(ledger=None) -> VahanClient:
    """One client (and therefore one JSF session) per thread.

    Workers share the caller's provenance ledger so every fetch is recorded.
    """
    client = getattr(_local, "client", None)
    if client is None:
        client = VahanClient(ledger)
        _local.client = client
    return client


def resolve_rto_ids(client: VahanClient, state_code: str) -> dict[str, str]:
    """Map printed RTO code (MH12) to Vahan's internal office id."""
    frame = client.list_rtos(state_code)
    if frame.empty:
        return {}
    return {
        str(row.rto_code).upper(): str(row.rto_id)
        for row in frame.itertuples(index=False)
        if getattr(row, "rto_code", "")
    }


def _fetch_city(
    *,
    city: dict[str, Any],
    rto_ids: list[str],
    years: list[int],
    with_split: bool,
    ledger=None,
) -> tuple[list[dict], list[dict]]:
    """Fetch one city across all years. Runs inside a worker thread."""
    client = _worker_client(ledger)
    name = city["name"]
    state_code = city["state"]
    records: list[dict] = []
    split_records: list[dict] = []

    for year in years:
        monthly_totals: dict[str, int | None] = {m: None for m in MONTHS}
        used = 0
        for rto_id in rto_ids:
            cache = f"{state_code}_{rto_id}_fuel_mw_{year}"
            try:
                report = client.query(
                    y_axis="Fuel",
                    x_axis="Month Wise",
                    year=year,
                    state_code=state_code,
                    rto_id=rto_id,
                    cache_name=cache,
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("%s/%s %s: query failed (%s)", name, rto_id, year, exc)
                continue
            used += 1
            for month, value in client.monthly_ev(report).items():
                if value is None:
                    continue
                monthly_totals[month] = (monthly_totals[month] or 0) + value

        if not used:
            continue

        for idx, month in enumerate(MONTHS, start=1):
            value = monthly_totals[month]
            if value is None:
                continue
            records.append(
                {
                    "city": name,
                    "state_code": state_code,
                    "tier": city["tier"],
                    "rto_codes": ",".join(city["rto_codes"]),
                    "year": year,
                    "month": idx,
                    "date": pd.Timestamp(year=year, month=idx, day=1),
                    "ev_registrations": value,
                    "rto_queries": used,
                }
            )

        if with_split:
            for rto_id in rto_ids:
                cache = f"{state_code}_{rto_id}_fuel_vcat_{year}"
                try:
                    cross = client.query(
                        y_axis="Fuel",
                        x_axis="Vehicle Category",
                        year=year,
                        state_code=state_code,
                        rto_id=rto_id,
                        cache_name=cache,
                    )
                except Exception as exc:  # noqa: BLE001
                    log.warning("%s/%s %s split failed (%s)", name, rto_id, year, exc)
                    continue
                for bucket, value in client.ev_by_vehicle_bucket(cross).items():
                    if value:
                        split_records.append(
                            {
                                "city": name,
                                "state_code": state_code,
                                "year": year,
                                "bucket": bucket,
                                "ev_registrations": value,
                            }
                        )

    log.info("%s: %d months collected", name, len(records))
    return records, split_records


def _run_tasks(tasks, workers: int):
    """Execute city fetch tasks, serially or via a thread pool."""
    if workers <= 1:
        for task in tasks:
            yield _fetch_city(**task)
        return

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch_city, **task): task["city"]["name"] for task in tasks}
        for future in as_completed(futures):
            label = futures[future]
            try:
                yield future.result()
            except Exception as exc:  # noqa: BLE001
                log.error("%s: worker failed (%s)", label, exc)


BUCKETS = ["2W", "3W", "4W", "COMM", "OTHER"]


def complete_split(frame: pd.DataFrame, keys: pd.DataFrame | None = None) -> pd.DataFrame:
    """Zero-fill the missing bucket rows for city-years that have any data.

    Vahan omits a vehicle category entirely when it has no registrations, so a
    raw pivot is full of holes. A missing (city, year, bucket) inside a year
    that did report is a genuine zero, not missing data.
    """
    if frame.empty:
        return frame

    if keys is None:
        keys = frame[["city", "state_code", "year"]].drop_duplicates()
    full = keys.merge(pd.DataFrame({"bucket": BUCKETS}), how="cross")
    out = full.merge(frame, on=["city", "state_code", "year", "bucket"], how="left")
    out["ev_registrations"] = out["ev_registrations"].fillna(0).astype(int)
    return out.sort_values(["city", "year", "bucket"]).reset_index(drop=True)


def resolve_city_rto_ids(
    rto_index: dict[str, str], state_code: str, codes: list[str]
) -> tuple[list[str], list[str]]:
    """Map configured RTO codes to Vahan office ids.

    Falls back to deriving the id from the code when the dropdown could not be
    loaded (the dashboard rate-limits after a burst). Returns (ids, missing).
    """
    ids: list[str] = []
    missing: list[str] = []
    derived = False
    for code in codes:
        rto_id = rto_index.get(code)
        if not rto_id:
            rto_id = derive_rto_id(code)
            if rto_id:
                derived = True
            else:
                missing.append(code)
                continue
        ids.append(rto_id)
    if derived:
        log.debug("%s: derived some office ids from codes", state_code)
    return ids, missing


def build_panel(
    *,
    years: list[int] | None = None,
    city_names: list[str] | None = None,
    with_vehicle_split: bool = False,
    client: VahanClient | None = None,
    workers: int = 3,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (city_month_panel, vehicle_split)."""
    years = years or list(range(2021, 2027))
    client = client or VahanClient()

    cities = target_cities()
    if city_names:
        wanted = {c.lower() for c in city_names}
        cities = [c for c in cities if c["name"].lower() in wanted]
    if not cities:
        raise ValueError("no cities selected")

    by_state: dict[str, list[dict]] = defaultdict(list)
    for city in cities:
        by_state[city["state"]].append(city)

    # --- resolve every RTO we need, one lookup per state (single client)
    rto_index: dict[str, dict[str, str]] = {}
    for state_code in by_state:
        log.info("resolving RTOs for state %s", state_code)
        try:
            rto_index[state_code] = resolve_rto_ids(client, state_code)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "could not load office list for %s (%s) — deriving ids from codes",
                state_code,
                exc,
            )
            rto_index[state_code] = {}

    tasks = []
    for state_code, state_cities in by_state.items():
        for city in state_cities:
            codes = [canonical_rto_code(c) for c in city["rto_codes"]]
            ids, missing = resolve_city_rto_ids(rto_index[state_code], state_code, codes)
            if missing:
                log.warning("%s: unresolvable RTO codes: %s", city["name"], missing)
            if not ids:
                log.error("%s: no resolvable RTOs, skipping", city["name"])
                continue
            tasks.append(
                {
                    "city": city,
                    "rto_ids": ids,
                    "years": years,
                    "with_split": with_vehicle_split,
                    "ledger": client.ledger,
                }
            )

    log.info("fetching %d cities with %d workers", len(tasks), workers)
    records: list[dict] = []
    split_records: list[dict] = []
    for rows, split_rows in _run_tasks(tasks, workers):
        records.extend(rows)
        split_records.extend(split_rows)

    panel = pd.DataFrame.from_records(records, columns=PANEL_COLUMNS)
    if not panel.empty:
        panel = panel.sort_values(["city", "date"]).reset_index(drop=True)

    split = pd.DataFrame.from_records(split_records)
    if not split.empty:
        split = (
            split.groupby(["city", "state_code", "year", "bucket"], as_index=False)[
                "ev_registrations"
            ]
            .sum()
            .sort_values(["city", "year", "bucket"])
            .reset_index(drop=True)
        )
        split = complete_split(split)

    n_cities = panel["city"].nunique() if not panel.empty else 0
    log.info("panel: %d city-months across %d cities", len(panel), n_cities)
    return panel, split


def build_vehicle_split(
    *,
    years: list[int] | None = None,
    city_names: list[str] | None = None,
    client: VahanClient | None = None,
    workers: int = 3,
) -> pd.DataFrame:
    """EV registrations by city x year x bucket, without rebuilding the panel."""
    years = years or [2024]
    client = client or VahanClient()

    cities = target_cities()
    if city_names:
        wanted = {c.lower() for c in city_names}
        cities = [c for c in cities if c["name"].lower() in wanted]

    by_state: dict[str, list[dict]] = defaultdict(list)
    for city in cities:
        by_state[city["state"]].append(city)

    tasks = []
    for state_code, state_cities in by_state.items():
        try:
            rto_index = resolve_rto_ids(client, state_code)
        except Exception as exc:  # noqa: BLE001
            log.warning("could not load office list for %s (%s)", state_code, exc)
            rto_index = {}
        for city in state_cities:
            codes = [canonical_rto_code(c) for c in city["rto_codes"]]
            ids, _missing = resolve_city_rto_ids(rto_index, state_code, codes)
            if not ids:
                log.error("%s: no resolvable RTOs, skipping split", city["name"])
                continue
            tasks.append(
                {
                    "city": city,
                    "rto_ids": ids,
                    "years": years,
                    "with_split": True,
                    "ledger": client.ledger,
                }
            )

    records: list[dict] = []
    for _rows, split_rows in _run_tasks(tasks, workers):
        records.extend(split_rows)

    frame = pd.DataFrame.from_records(records)
    if not frame.empty:
        frame = (
            frame.groupby(["city", "state_code", "year", "bucket"], as_index=False)[
                "ev_registrations"
            ]
            .sum()
            .sort_values(["city", "year", "bucket"])
            .reset_index(drop=True)
        )
        frame = complete_split(frame)
    log.info("vehicle split: %d rows", len(frame))
    return frame
