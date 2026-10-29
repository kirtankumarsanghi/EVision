"""Generic client for the data.gov.in open data API.

Used as the verified fallback wherever a primary portal is unreachable
(E-Amrit and censusindia.gov.in were both down from our network) or where
data.gov.in hosts the same official release in a machine-readable form.
"""

from __future__ import annotations

import logging
from typing import Any

import pandas as pd

from ..config import RAW_DIR, get_settings
from ..http import get, new_session
from ..provenance import FAILED, Ledger, VERIFIED

log = logging.getLogger(__name__)

BASE = "https://api.data.gov.in"


class DataGovClient:
    def __init__(self, ledger: Ledger | None = None) -> None:
        self.session = new_session({"Accept": "application/json"})
        self.settings = get_settings()
        self.ledger = ledger or Ledger()

    def resource(
        self,
        resource_id: str,
        *,
        limit: int = 500,
        offset: int = 0,
        label: str = "",
        max_records: int = 5000,
        use_cache: bool = True,
    ) -> pd.DataFrame:
        """Fetch one resource, following pagination to the end.

        The shared demo API key silently caps every response at 10 records
        while reporting the true ``total``, so a single call truncates the
        dataset. We therefore page by the number of records actually returned
        rather than by ``limit``. Supply a registered key via
        EVISION_DATA_GOV_API_KEY to lift that cap.
        """
        records: list[dict] = []
        seen_titles: list[str] = []
        cursor = offset
        total: int | None = None
        checksum_source = ""

        cache = RAW_DIR / "datagov" / f"{resource_id}.csv"
        if use_cache and cache.exists():
            frame = pd.read_csv(cache)
            log.info("cache hit: %s (%d rows)", cache.name, len(frame))
            self.ledger.record(
                source="data.gov.in",
                dataset=label or resource_id,
                url=f"{BASE}/resource/{resource_id}",
                status=VERIFIED,
                payload=cache.read_text(encoding="utf-8"),
                rows=len(frame),
                notes="served from local cache",
            )
            return frame

        while True:
            params: dict[str, Any] = {
                "format": "json",
                "api-key": self.settings.data_gov_api_key,
                "limit": limit,
                "offset": cursor,
            }
            try:
                resp = get(self.session, f"{BASE}/resource/{resource_id}", params=params)
                resp.raise_for_status()
                payload = resp.json()
            except Exception as exc:  # noqa: BLE001
                self.ledger.record(
                    source="data.gov.in",
                    dataset=label or resource_id,
                    url=f"{BASE}/resource/{resource_id}",
                    status=FAILED,
                    notes=str(exc)[:300],
                    rows=len(records),
                )
                if not records:
                    raise RuntimeError(
                        f"data.gov.in resource {resource_id} failed: {exc}"
                    ) from exc
                log.warning("pagination stopped early at offset %d: %s", cursor, exc)
                break

            if total is None:
                total = payload.get("total")
                seen_titles.append(payload.get("title", resource_id))
            checksum_source += resp.text

            batch = payload.get("records", [])
            if not batch:
                break
            records.extend(batch)

            cursor += len(batch)
            if total is not None and cursor >= total:
                break
            if len(records) >= max_records:
                log.warning(
                    "%s: stopped at max_records=%d (total %s)", label, max_records, total
                )
                break

        frame = pd.DataFrame.from_records(records)
        frame = _normalise_columns(frame)

        if not frame.empty:
            cache.parent.mkdir(parents=True, exist_ok=True)
            frame.to_csv(cache, index=False)
            log.info("cached %s (%d rows)", cache.name, len(frame))

        self.ledger.record(
            source="data.gov.in",
            dataset=label or (seen_titles[0] if seen_titles else resource_id),
            url=f"{BASE}/resource/{resource_id}",
            status=VERIFIED,
            payload=checksum_source,
            rows=len(frame),
            notes=seen_titles[0] if seen_titles else "",
            extra={"total_available": total, "complete": total is None or len(frame) >= total},
        )
        log.info(
            "data.gov.in %s -> %d/%s rows", label or resource_id, len(frame), total
        )
        return frame


def _normalise_columns(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame
    frame = frame.copy()
    frame.columns = [
        "".join(ch if ch.isalnum() else "_" for ch in str(c)).strip("_").lower()
        for c in frame.columns
    ]
    return frame


def to_number(series: pd.Series) -> pd.Series:
    """Coerce a possibly comma-formatted column to numeric."""
    return pd.to_numeric(
        series.astype(str).str.replace(",", "", regex=False).str.strip(),
        errors="coerce",
    )
