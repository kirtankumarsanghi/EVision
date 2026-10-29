"""Build the merged master EV panel.

One row per city-month, combining:
  - the cleaned registration panel (2021 dashboard cache + 2022+ export)
  - city-level covariates (chargers, fixed-radius supply, census, policy,
    income, climate)
  - monthly petrol prices
  - the effective public charging demand ratio

Cleaning rules are inherited from pipeline.clean: IQR outliers are flagged and
winsorised (never dropped), gaps of at most two months are interpolated, and
longer gaps stay empty. Missing covariates remain missing and are recorded by
the has_* coverage flags — nothing is invented.

    python scripts/build_master_panel.py
    python scripts/build_master_panel.py --all
    python scripts/build_master_panel.py -v

Writes: data/processed/master_ev_panel.csv
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from evision.config import PROCESSED_DIR, target_cities  # noqa: E402
from evision.pipeline import userdata  # noqa: E402
from evision.provenance import Ledger  # noqa: E402
from evision.sources import mospi, openmeteo  # noqa: E402

KEY = ["city", "date"]
PETROL_COLS = ["petrol_price", "price_low", "price_high", "price_basis", "method"]


def build(data_dir: Path, include_all: bool) -> pd.DataFrame:
    ledger = Ledger()

    logging.info("fetching summer temperature ...")
    summer = openmeteo.fetch_all(ledger)["summer"]
    temperature = openmeteo.latest_by_city(summer)

    logging.info("fetching per-capita income ...")
    income = mospi.fetch_all(ledger)["income"]

    panel = userdata.build_panel(data_dir)
    features = userdata.build_features(
        panel, data_dir, temperature=temperature, income=income
    )

    if not include_all:
        covered = set(userdata.load_chargers(data_dir)["city"].str.strip())
        panel = panel[panel["city"].str.strip().isin(covered)].reset_index(drop=True)
        features = features[
            features["city"].str.strip().isin(covered)
        ].reset_index(drop=True)

    # every city-level column that is not already on the monthly panel
    panel_cols = set(panel.columns)
    feature_cols = [
        c for c in features.columns
        if c not in panel_cols and c not in {"city", "state_code"}
    ]
    master = panel.merge(
        features[["city", *feature_cols]], on="city", how="left", validate="many_to_one"
    )

    # monthly petrol, not just the latest value carried in the feature table
    petrol = userdata.load_petrol(data_dir)
    petrol = petrol[["city", "date", *[c for c in PETROL_COLS if c in petrol.columns]]]
    master = master.merge(petrol, on=KEY, how="left", validate="one_to_one")

    # the denominator is a snapshot, so these are cross-sectional ratios
    # repeated across months, not a monthly charger series
    master["ev_to_charger_ratio_monthly"] = (
        master["ev_stock"] / master["stations_within_radius"].replace(0, np.nan)
    )
    master["ev_per_fast_10km_monthly"] = (
        master["ev_stock"] / master["fast_10km"].replace(0, np.nan)
    )
    # the preferred, comparable demand denominator: fixed 10 km radius
    master["effective_public_demand_10km"] = (
        master["weighted_ev_stock"] / master["stations_10km"].replace(0, np.nan)
    )

    return master.sort_values(KEY).reset_index(drop=True)


def validate(master: pd.DataFrame) -> None:
    if master.duplicated(KEY).any():
        raise ValueError("master panel has duplicate city-month rows")

    observed = master[master["ev_registrations"].notna()]
    if (observed["ev_registrations"] < 0).any():
        raise ValueError("master panel has negative observed registrations")
    if master["stock_regression"].any():
        raise ValueError("master panel has unflagged stock regressions")
    if "effective_public_demand" not in master.columns:
        raise ValueError("effective_public_demand was not engineered")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--all", action="store_true",
        help="keep cities outside the 51 with covariates",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    configured = [c["name"] for c in target_cities()]
    master = build(userdata.user_data_dir(), include_all=args.all)
    validate(master)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    path = PROCESSED_DIR / "master_ev_panel.csv"
    master.to_csv(path, index=False)

    observed = master[master["ev_registrations"].notna()]
    print("\n" + "=" * 74)
    print(f"master   : {len(master):>6} rows x {master.shape[1]} columns")
    print(f"cities   : {master['city'].nunique():>6} analysed of {len(configured)} configured")
    print(f"period   : {master['date'].min():%Y-%m} .. {master['date'].max():%Y-%m}")
    print(f"coverage : {master['observed'].mean():.1%} observed, "
          f"{int(master['imputed'].sum())} imputed")
    print(f"outliers : {int(master['is_outlier'].sum())} flagged (kept, winsorised)")
    sources = master["panel_source"].value_counts(dropna=False).to_dict()
    print("sources  : " + ", ".join(f"{k}={v}" for k, v in sources.items()))
    print(f"demand   : effective_public_demand for "
          f"{int(observed['effective_public_demand'].notna().sum())} city-months")
    print(f"wrote    : {path}")
    print("=" * 74)

    print("\ncoverage flags:")
    for column in ("has_chargers", "has_census", "has_petrol", "has_policy"):
        if column in master.columns:
            print(f"   {column:<12} {int(master[column].sum()):>5} city-months")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
