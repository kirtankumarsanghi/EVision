"""Provenance ledger.

Every number that lands in the processed dataset must be traceable to a fetch:
which source, which URL, when, how many rows, and a checksum of the payload.
Anything we could not verify is recorded as UNVERIFIED so it can never be
mistaken for observed data.
"""

from __future__ import annotations

import json
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import PROVENANCE_DIR
from .http import digest

LEDGER_PATH = PROVENANCE_DIR / "ledger.json"

VERIFIED = "verified"
DERIVED = "derived"
UNVERIFIED = "unverified"
FAILED = "failed"


@dataclass
class ProvenanceRecord:
    source: str
    dataset: str
    url: str
    fetched_at: str
    status: str
    rows: int = 0
    checksum: str = ""
    notes: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def now(cls, **kwargs: Any) -> "ProvenanceRecord":
        return cls(
            fetched_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            **kwargs,
        )


class Ledger:
    def __init__(self, path: Path = LEDGER_PATH) -> None:
        self.path = path
        self.records: list[dict[str, Any]] = []
        self._lock = threading.Lock()
        if path.exists():
            try:
                self.records = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                self.records = []

    def add(self, record: ProvenanceRecord) -> None:
        with self._lock:
            self.records.append(asdict(record))

    def record(
        self,
        *,
        source: str,
        dataset: str,
        url: str,
        status: str,
        payload: str | bytes | None = None,
        rows: int = 0,
        notes: str = "",
        extra: dict[str, Any] | None = None,
    ) -> ProvenanceRecord:
        rec = ProvenanceRecord.now(
            source=source,
            dataset=dataset,
            url=url,
            status=status,
            rows=rows,
            checksum=digest(payload) if payload else "",
            notes=notes,
            extra=extra or {},
        )
        self.add(rec)
        return rec

    def save(self) -> Path:
        with self._lock:
            snapshot = list(self.records)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
        return self.path

    def summary(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for r in self.records:
            counts[r["status"]] = counts.get(r["status"], 0) + 1
        return counts
