"""Central configuration: paths, settings, YAML loaders."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = BACKEND_ROOT / "config"
DATA_DIR = BACKEND_ROOT / "data"

RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
PROVENANCE_DIR = DATA_DIR / "provenance"

for _d in (RAW_DIR, PROCESSED_DIR, PROVENANCE_DIR):
    _d.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    """Runtime settings, overridable via EVISION_* environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="EVISION_", env_file=".env", extra="ignore"
    )

    # Network behaviour
    request_timeout: int = Field(default=60, description="Seconds per request")
    request_retries: int = Field(default=3, description="Retry attempts")
    request_delay: float = Field(
        default=1.5, description="Seconds between requests to the same host"
    )
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    )

    # data.gov.in public demo key (documented in their API docs)
    data_gov_api_key: str = "579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


@lru_cache(maxsize=None)
def load_yaml(name: str) -> dict[str, Any]:
    """Load a file from backend/config."""
    path = CONFIG_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"config file not found: {path}")
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def vahan_codes() -> dict[str, Any]:
    return load_yaml("vahan_codes.yaml")


def city_config() -> dict[str, Any]:
    return load_yaml("cities.yaml")


def target_cities() -> list[dict[str, Any]]:
    return city_config().get("cities", [])
