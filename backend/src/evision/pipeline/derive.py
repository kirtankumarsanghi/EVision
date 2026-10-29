"""Derived metrics and feature engineering.

The effective-public-demand formula follows the project spec:
    (0.15 * 2W stock + 0.7 * 3W stock + 1.0 * 4W stock) / public chargers
Weights reflect that 2-wheelers mostly charge at home while 3W/4W rely on
public infrastructure. When the vehicle split is unavailable the function
returns NaN rather than silently substituting total stock.
"""

from __future__ import annotations

import difflib
import logging
import re

import pandas as pd

log = logging.getLogger(__name__)

PUBLIC_DEMAND_WEIGHTS = {"2W": 0.15, "3W": 0.70, "4W": 1.00, "COMM": 0.60}

_STATE_NAMES = {
    "AN": "Andaman and Nicobar Islands", "AP": "Andhra Pradesh", "AR": "Arunachal Pradesh",
    "AS": "Assam", "BR": "Bihar", "CG": "Chhattisgarh", "CH": "Chandigarh",
    "DD": "Dadra and Nagar Haveli and Daman and Diu", "DL": "Delhi", "GA": "Goa",
    "GJ": "Gujarat", "HP": "Himachal Pradesh", "HR": "Haryana", "JH": "Jharkhand",
    "JK": "Jammu and Kashmir", "KA": "Karnataka", "KL": "Kerala", "LA": "Ladakh",
    "LD": "Lakshadweep", "MH": "Maharashtra", "ML": "Meghalaya", "MN": "Manipur",
    "MP": "Madhya Pradesh", "MZ": "Mizoram", "NL": "Nagaland", "OR": "Odisha",
    "PB": "Punjab", "PY": "Puducherry", "RJ": "Rajasthan", "SK": "Sikkim",
    "TG": "Telangana", "TN": "Tamil Nadu", "TR": "Tripura", "UK": "Uttarakhand",
    "UP": "Uttar Pradesh", "WB": "West Bengal",
}


def _normalise_key(name: str) -> str:
    key = name.lower().replace("&", "and")
    key = re.sub(r"[^a-z ]", " ", key)
    return re.sub(r"\s+", " ", key).strip()


# Legacy / misspelled names seen in real government releases.
# PPAC for example ships "Maharastra" and "Chhatisgarh"; data.gov.in census
# tables still use "Orissa". Fuzzy matching below is the safety net for the
# ones we have not enumerated.
STATE_ALIASES = {
    "maharastra": "maharashtra",
    "chhatisgarh": "chhattisgarh",
    "orissa": "odisha",
    "pondicherry": "puducherry",
    "uttaranchal": "uttarakhand",
    "nct of delhi": "delhi",
    "delhi ut": "delhi",
    "andaman and nicobar": "andaman and nicobar islands",
    "andaman and nicobar island": "andaman and nicobar islands",
    "dadra and nagar haveli": "dadra and nagar haveli and daman and diu",
    "daman and diu": "dadra and nagar haveli and daman and diu",
    "dnh and dd": "dadra and nagar haveli and daman and diu",
}

KNOWN_STATES = {_normalise_key(v) for v in _STATE_NAMES.values()}


def canonical_state_name(name: str) -> str:
    """Normalise the many spellings of Indian states across sources."""
    if not isinstance(name, str):
        return ""
    key = _normalise_key(name)
    key = STATE_ALIASES.get(key, key)
    if key in KNOWN_STATES:
        return key
    close = difflib.get_close_matches(key, KNOWN_STATES, n=1, cutoff=0.86)
    return close[0] if close else key


_STATE_CODES = {canonical_state_name(v): k for k, v in _STATE_NAMES.items()}


def state_code_for(name: str) -> str | None:
    """Map a state/UT name in any spelling to its two-letter code."""
    return _STATE_CODES.get(canonical_state_name(name))


def add_growth_metrics(frame: pd.DataFrame, value_col: str = "ev_registrations") -> pd.DataFrame:
    """Momentum features: MoM, YoY, rolling mean, cumulative stock."""
    out = frame.sort_values(["city", "date"]).copy()
    grouped = out.groupby("city", sort=False)

    out["ev_stock"] = grouped[value_col].cumsum()
    out["mom_growth"] = grouped[value_col].pct_change()
    out["yoy_growth"] = grouped[value_col].pct_change(periods=12)
    out["roll_3m_mean"] = grouped[value_col].transform(
        lambda s: s.rolling(3, min_periods=1).mean()
    )

    prev_stock = grouped["ev_stock"].shift(1)
    out["stock_delta"] = out["ev_stock"] - prev_stock
    out["stock_regression"] = out["stock_delta"] < 0
    return out


def _state_name_for(code: str) -> str:
    return _STATE_NAMES.get(str(code).upper(), str(code))


