"""Per-capita income (NSDP) by state.

Source: Ministry of Statistics & Programme Implementation (MOSPI) releases
mirrored on data.gov.in. Used as the "per-capita income proxy" feature.

Values are annual rupees at current prices. The series runs 2019-20 to 2022-23;
2022-23 is the latest and is carried forward as a cross-sectional proxy, with
`income_vintage` recording which year was used so the staleness is explicit.
"""

from __future__ import annotations

import logging

import pandas as pd

from .datagov import DataGovClient, to_number
from ..provenance import Ledger

log = logging.getLogger(__name__)

RESOURCE = "c9bfd3c0-b9de-4a5b-8752-f72a4f2932ad"
YEAR_COLUMNS = ["2019_20", "2020_21", "2021_22", "2022_23"]


def fetch_per_capita_income(client: DataGovClient | None = None) -> pd.DataFrame:
    client = client or DataGovClient()
    raw = client.resource(RESOURCE, label="mospi:per_capita_nsdp_current")
    if raw.empty:
        return raw

    state_col = next((c for c in raw.columns if "state" in c), None)
    if not state_col:
        raise RuntimeError(f"unexpected NSDP schema: {list(raw.columns)}")

    available = [c for c in YEAR_COLUMNS if c in raw.columns]
    if not available:
        raise RuntimeError(f"no year columns in NSDP resource: {list(raw.columns)}")

    out = pd.DataFrame({"state_name": raw[state_col].astype(str).str.strip()})
    for column in available:
        out[column] = to_number(raw[column])

    # Latest non-null year per state, so states with a missing final year still
    # get a value (and the vintage column says which).
    stacked = out[available].ffill(axis=1)
    latest_column = available[-1]
    out["per_capita_income_inr"] = stacked[latest_column]

    # If the newest column is NA for a state, fall back to its last non-null.
    for idx, row in out.iterrows():
        if pd.isna(out.at[idx, "per_capita_income_inr"]):
            for column in reversed(available):
                if pd.notna(row[column]):
                    out.at[idx, "per_capita_income_inr"] = row[column]
                    out.at[idx, "income_vintage"] = column.replace("_", "-")
                    break

    out["income_vintage"] = out.get(
        "income_vintage", pd.Series([latest_column.replace("_", "-")] * len(out))
    )
    out["income_unit"] = "INR per person per year (current prices)"
    return out.reset_index(drop=True)


def fetch_all(ledger: Ledger | None = None) -> dict[str, pd.DataFrame]:
    ledger = ledger or Ledger()
    client = DataGovClient(ledger)
    try:
        return {"income": fetch_per_capita_income(client)}
    except RuntimeError as exc:
        log.warning("income source failed: %s", exc)
        return {"income": pd.DataFrame()}
