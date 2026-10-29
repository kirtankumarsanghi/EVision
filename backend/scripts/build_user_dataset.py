"""Build the analysis dataset from the collected data folder.

    python scripts/build_user_dataset.py
    python scripts/build_user_dataset.py --all      # include cities outside the 51

Writes to backend/data/processed:
    user_city_month_panel.csv   city x month EV registrations + derived columns
    user_city_features.csv      one row per city with the modelling features
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from evision.config import PROCESSED_DIR, target_cities  # noqa: E402
from evision.pipeline import userdata  # noqa: E402
from evision.provenance import Ledger  # noqa: E402
from evision.sources import mospi, openmeteo  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="keep cities outside the 51")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    data_dir = userdata.user_data_dir()
    logging.info("reading %s", data_dir)

    configured = [c["name"] for c in target_cities()]
    covered = set(userdata.load_chargers(data_dir)["city"].str.strip())
    excluded = [name for name in configured if name not in covered]
    if excluded:
        logging.warning(
            "%d of %d configured cities have no covariates and are excluded: %s",
            len(excluded), len(configured), ", ".join(excluded),
        )

    ledger = Ledger()

    logging.info("fetching summer temperature ...")
    summer = openmeteo.fetch_all(ledger)["summer"]
    temperature = openmeteo.latest_by_city(summer)

    logging.info("fetching per-capita income ...")
    income = mospi.fetch_all(ledger)["income"]

    panel = userdata.build_panel(data_dir)
    features = userdata.build_features(panel, data_dir, temperature=temperature, income=income)

    if not args.all:
        covered_lower = {city.lower() for city in covered}
        panel = panel[panel["city"].str.lower().isin(covered_lower)].reset_index(drop=True)
        features = features[
            features["city"].str.lower().isin(covered_lower)
        ].reset_index(drop=True)

    unobserved = panel[~panel["observed"]]
    observed_2021 = (
        panel[panel["date"].dt.year == 2021]
        .groupby("city")["observed"].sum()
    )
    cities_without_2021 = sorted(observed_2021[observed_2021 == 0].index)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    panel_path = PROCESSED_DIR / "user_city_month_panel.csv"
    feat_path = PROCESSED_DIR / "user_city_features.csv"
    panel.to_csv(panel_path, index=False)
    features.to_csv(feat_path, index=False)

    manifest = {
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": str(data_dir),
        "rows": int(len(panel)),
        "cities": int(panel["city"].nunique()),
        "configured_cities": len(configured),
        "cities_without_covariates": sorted(excluded),
        "months_per_city": int(panel.groupby("city").size().min()),
        "date_min": str(panel["date"].min().date()),
        "date_max": str(panel["date"].max().date()),
        "observed_share": round(float(panel["observed"].mean()), 4),
        "imputed_months": int(panel["imputed"].sum()),
        "panel_sources": {
            str(k): int(v)
            for k, v in panel["panel_source"].value_counts(dropna=False).items()
        },
        "cities_without_2021": cities_without_2021,
        "unobserved_rows": int(len(unobserved)),
        "model_rows_dropped": int(len(unobserved)),
        "unobserved_by_city": {
            str(k): int(v) for k, v in unobserved.groupby("city").size().items()
        },
        "unobserved_reason": (
            "leading 2021 months for cities with no cached responses, "
            "plus long interior gaps"
        ),
        "outliers_flagged": int(panel["is_outlier"].sum()),
        "stock_regressions": int(panel["stock_regression"].sum()),
    }
    (PROCESSED_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("\n" + "=" * 70)
    print(f"panel    : {len(panel):>6} rows, {panel['city'].nunique()} cities, "
          f"{panel['date'].min():%Y-%m} .. {panel['date'].max():%Y-%m}")
    print(f"universe : {len(configured)} configured, {panel['city'].nunique()} analysed, "
          f"{len(excluded)} without covariates")
    print(f"coverage : {panel['observed'].mean():.1%} observed, {int(panel['imputed'].sum())} imputed")
    print("sources  : " + ", ".join(
        f"{k}={v}" for k, v in panel["panel_source"].value_counts(dropna=False).items()
    ))
    print(f"outliers : {int(panel['is_outlier'].sum())} flagged, "
          f"{int(panel['stock_regression'].sum())} stock regressions")
    print(f"features : {len(features)} rows x {features.shape[1]} cols")
    print(f"wrote    : {panel_path.name}, {feat_path.name}")
    print("=" * 70)

    print("\ntop 15 cities by cumulative EVs")
    cols = ["city", "ev_stock", "avg_monthly_registrations", "growth_12m",
            "stations_within_radius", "ev_to_charger_ratio", "ev_policy_score"]
    cols = [c for c in cols if c in features.columns]
    print(features[cols].head(15).to_string(index=False))

    nulls = features.isna().sum()
    print("\nfeature columns with nulls:")
    print(nulls[nulls > 0].to_string() if nulls.any() else "   none")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
