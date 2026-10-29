"""Data source adapters. Each module owns one upstream and its quirks."""

from .vahan import VahanClient

__all__ = ["VahanClient"]
