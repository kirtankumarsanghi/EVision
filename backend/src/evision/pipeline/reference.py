"""Shared lookups for the collected-data pipeline.

Kept separate so pipeline.market and pipeline.supply can use the RTO mapping
without importing pipeline.userdata (which imports them).

The RTO codes are stored normalised to Vahan's unpadded form ('DL-01' -> 'DL1')
because city configs and the Vahan exports spell them differently.
"""

from __future__ import annotations

import os
from pathlib import Path

from ..config import BACKEND_ROOT, target_cities
from ..sources.vahan import canonical_rto_code

DEFAULT_DATA_DIR = BACKEND_ROOT / "data" / "source"


def user_data_dir() -> Path:
    """Where the collected inputs live (override with EVISION_USER_DATA)."""
    return Path(os.getenv("EVISION_USER_DATA", str(DEFAULT_DATA_DIR)))


def rto_city_lookup() -> dict[str, str]:
    """canonical RTO code -> city name."""
    lookup: dict[str, str] = {}
    for city in target_cities():
        for code in city["rto_codes"]:
            lookup[canonical_rto_code(code)] = city["name"]
    return lookup


def city_state_lookup() -> dict[str, str]:
    return {c["name"]: c["state"] for c in target_cities()}


def city_meta() -> dict[str, dict]:
    return {c["name"]: c for c in target_cities()}
