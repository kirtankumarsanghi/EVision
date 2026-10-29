"""Fit M1, M2, M3 and produce the Charging Demand Score ranking.

    python scripts/run_models.py
    python scripts/run_models.py --top-n 20 --repeats 30

Inputs : data/processed/user_city_month_panel.csv
         data/processed/user_city_features.csv
         data/processed/vehicle_split.csv   (measured 2W/3W/4W split)
Outputs: data/processed/model_*.csv, cds_ranking.csv, cds_sensitivity.csv
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from evision.config import PROCESSED_DIR  # noqa: E402
from evision.models import cds, m1_count, m2_classify, m3_forecast, split as splitmod  # noqa: E402


def load() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    panel = pd.read_csv(PROCESSED_DIR / "user_city_month_panel.csv", parse_dates=["date"])
    features = pd.read_csv(PROCESSED_DIR / "user_city_features.csv")
    split_path = PROCESSED_DIR / "vehicle_split.csv"
    split = pd.read_csv(split_path) if split_path.exists() else pd.DataFrame()
    return panel, features, split


DERIVED_COLS = (
    "weighted_ev_stock",
    "commercial_fleet_share",
    "split_method",
    "ref_year_ev",
    "split_donors",
    "effective_public_demand",
    "effective_public_demand_10km",
)


def apply_split(features: pd.DataFrame, panel: pd.DataFrame, split: pd.DataFrame) -> pd.DataFrame:
    """Add 2W/3W/4W coverage for every city, recording how each row was derived.

    Always starts from the columns this step owns being dropped, so the function
    is idempotent and can be re-run without creating _x/_y duplicates.
    """
    base = features.drop(columns=[c for c in DERIVED_COLS if c in features.columns])
    if split.empty:
        logging.warning("no measured split — objectives 1 and 5 will be incomplete")
        return base

    derived = splitmod.build_split(split, panel, all_cities=sorted(base["city"].unique()))
    out = base.merge(
        derived.drop(columns=["state_code"], errors="ignore"), on="city", how="left"
    )
    out["effective_public_demand"] = (
        out["weighted_ev_stock"] / out["stations_within_radius"].replace(0, pd.NA)
    )
    # fixed 10 km radius: comparable across cities, unlike the 15-30 km circle
    if "stations_10km" in out.columns:
        out["effective_public_demand_10km"] = (
            out["weighted_ev_stock"] / out["stations_10km"].replace(0, pd.NA)
        )
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--top-n", type=int, default=None,
        help="limit M3 to the N largest cities (default: every city)",
    )
    parser.add_argument("--repeats", type=int, default=20, help="CV repeats for M2")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    panel, features, split = load()
    top_n = args.top_n or int(panel["city"].nunique())
    features = apply_split(features, panel, split)
    # never overwrite the pristine build output; keep the model-ready copy apart
    features.to_csv(PROCESSED_DIR / "features_model.csv", index=False)
    logging.info("features: %d cities, split coverage %s",
                 len(features), features["split_method"].value_counts().to_dict())

    # ---------------------------------------------------------------- M1
    logging.info("fitting M1 negative binomial ...")
    m1 = m1_count.fit(panel, features)
    m1.coefficients.to_csv(PROCESSED_DIR / "model_m1_coefficients.csv", index=False)
    m1.fitted.to_csv(PROCESSED_DIR / "model_m1_fitted.csv", index=False)

    # fuel price is mostly the Delhi series times a city ratio; fit without it
    # so the report can show how much the other drivers move
    reduced = m1_count.fit_drivers(panel, features, exclude={"mean_fuel_price"})
    full_coef = m1.coefficients.set_index("term")[["coef", "irr", "p_value"]]
    reduced_coef = reduced.coefficients.set_index("term")[["coef", "irr", "p_value"]]
    comparison = full_coef.rename(
        columns={"coef": "coef_with_fuel", "irr": "irr_with_fuel", "p_value": "p_with_fuel"}
    ).join(
        reduced_coef.rename(
            columns={"coef": "coef_without_fuel", "irr": "irr_without_fuel",
                     "p_value": "p_without_fuel"}
        ),
        how="outer",
    )
    comparison["irr_delta"] = comparison["irr_with_fuel"] - comparison["irr_without_fuel"]
    comparison.reset_index().to_csv(
        PROCESSED_DIR / "model_m1_sensitivity.csv", index=False
    )

    # policy scores are provisional: show the model without them
    no_policy = m1_count.fit_drivers(panel, features, exclude={"ev_policy_score"})
    no_policy_frame = no_policy.coefficients.copy()
    no_policy_frame["n"] = no_policy.n
    no_policy_frame.to_csv(
        PROCESSED_DIR / "model_m1_policy_sensitivity.csv", index=False
    )

    # seven cities carry unverified demographics; refit without them
    if "boundary_harmonised" in features.columns:
        verified = features["boundary_harmonised"].fillna(False).astype(bool)
        verified_cities = set(features.loc[verified, "city"])
        verified_panel = panel[panel["city"].isin(verified_cities)]
        verified_features = features[features["city"].isin(verified_cities)]
        m1_verified = m1_count.fit_drivers(verified_panel, verified_features)
        verified_frame = m1_verified.coefficients.copy()
        verified_frame["n"] = m1_verified.n
        verified_frame.to_csv(
            PROCESSED_DIR / "model_m1_demographics_sensitivity.csv", index=False
        )

    # ---------------------------------------------------------------- M2
    logging.info("fitting M2 classifier ...")
    m2 = m2_classify.fit(features, repeats=args.repeats)
    m2.comparison.to_csv(PROCESSED_DIR / "model_m2_comparison.csv", index=False)
    m2.predictions.to_csv(PROCESSED_DIR / "model_m2_predictions.csv", index=False)

    # sensitivity: drop the provisional policy score and the unverified
    # demographics, one at a time
    sensitivity = [m2.comparison.assign(sample="all_51")]
    predictors = [
        p for p in m2_classify.EXOGENOUS if p != "ev_policy_score"
    ]
    m2_no_policy = m2_classify.fit(
        features, repeats=args.repeats, predictors=predictors
    )
    sensitivity.append(m2_no_policy.comparison.assign(sample="without_policy"))
    if "boundary_harmonised" in features.columns:
        verified = features["boundary_harmonised"].fillna(False).astype(bool)
        m2_verified = m2_classify.fit(features[verified], repeats=args.repeats)
        sensitivity.append(
            m2_verified.comparison.assign(sample="harmonised_demographics")
        )
    pd.concat(sensitivity, ignore_index=True).to_csv(
        PROCESSED_DIR / "model_m2_sensitivity.csv", index=False
    )

    # ---------------------------------------------------------------- M3
    logging.info("fitting M3 forecasts for %d cities ...", top_n)
    m3 = m3_forecast.run(panel, top_n=top_n)
    m3.summary.to_csv(PROCESSED_DIR / "model_m3_summary.csv", index=False)
    m3.forecasts.to_csv(PROCESSED_DIR / "model_m3_forecasts.csv", index=False)
    m3.diagnostics.to_csv(PROCESSED_DIR / "model_m3_diagnostics.csv", index=False)

    # ---------------------------------------------------------------- CDS
    logging.info("building Charging Demand Score ...")
    ranked = cds.build(m1.fitted, m2.predictions, m3.summary, features)
    ranked.to_csv(PROCESSED_DIR / "cds_ranking.csv", index=False)
    # the reviewer's scope: a shortlist rather than all 51
    ranked.head(min(15, len(ranked))).to_csv(
        PROCESSED_DIR / "cds_ranking_top15.csv", index=False
    )
    # the sensitivity question is always about the priority top; keep it
    # comparable even when the whole universe is forecast
    sens = cds.sensitivity(ranked, top_n=min(top_n, 15))
    sens.to_csv(PROCESSED_DIR / "cds_sensitivity.csv", index=False)

    # ------------------------------------------------------------- console
    print("\n" + "=" * 78)
    print("M1  Count models")
    print("=" * 78)
    d, lv = m1.drivers, m1.level
    print(f"  M1a drivers — between-city, n={d.n} cities")
    print(f"     Poisson dispersion = {d.poisson_dispersion:.1f}  (>>1 justifies Negative Binomial)")
    print(f"     alpha={d.alpha}  AIC poisson={d.poisson_aic:,.0f}  negbin={d.aic:,.0f}")
    print(f"     pseudo R2 = {d.pseudo_r2:.3f}")
    print(d.coefficients[["term", "irr", "irr_lo", "irr_hi", "p_value"]].to_string(index=False))
    print(f"\n  M1b levels — panel with city fixed effects")
    print(f"     n={lv.n_obs:,} city-months, {lv.n_cities} cities, alpha={lv.alpha}")
    print(f"     corr(fitted, observed) across cities = {lv.corr_with_observed:.3f}")

    print("\n" + "=" * 78)
    print("M2  High/Low demand classification")
    print("=" * 78)
    print(f"  n={m2.n} cities, {m2.positives} high-demand, threshold={m2.threshold:.1f}")
    print(m2.comparison.to_string(index=False))

    print("\n" + "=" * 78)
    print(f"M3  Forecast comparison ({top_n} cities)")
    print("=" * 78)
    if not m3.summary.empty:
        wins = m3.summary["winner"].value_counts().to_dict()
        print(f"  winners: {wins}")
        print(m3.summary[["city", "winner", "sarima_rmse", "hw_rmse",
                          "forecast_12m", "forecast_growth"]].head(10).to_string(index=False))

    print("\n" + "=" * 78)
    print("Charging Demand Score — top 15")
    print("=" * 78)
    cols = ["rank", "city", "m1_expected_monthly", "p_high", "forecast_growth", "cds", "recommendation"]
    print(ranked[cols].head(15).to_string(index=False))

    print("\n" + "=" * 78)
    print("Weight sensitivity (top-15 overlap)")
    print("=" * 78)
    print(sens[["perturbation", "overlap_with_base", "entered", "dropped"]].to_string(index=False))

    print(f"\nwrote model_*.csv and cds_*.csv to {PROCESSED_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
