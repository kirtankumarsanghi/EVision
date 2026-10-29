"""Check the 2021/2022 source seam.

    python scripts/diagnose_seam.py
    python scripts/diagnose_seam.py --with-m3

Writes:
    reports/seam_2021_2022.csv       per-city Dec-2021 -> Jan-2022 comparison
    data/processed/model_m3_2022only.csv   (only with --with-m3)
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402

from evision.config import BACKEND_ROOT, PROCESSED_DIR  # noqa: E402
from evision.models import m3_forecast  # noqa: E402

REPORTS = BACKEND_ROOT / "reports"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--with-m3", action="store_true",
                        help="also refit M3 on the 2022+ panel")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    panel = pd.read_csv(
        PROCESSED_DIR / "user_city_month_panel.csv", parse_dates=["date"]
    )
    observed = panel[panel["ev_registrations"].notna()]

    dec = observed[observed["date"] == "2021-12-01"].set_index("city")["ev_registrations"]
    jan = observed[observed["date"] == "2022-01-01"].set_index("city")["ev_registrations"]
    cities = sorted(dec.index.intersection(jan.index))

    rows = []
    for city in cities:
        before, after = float(dec[city]), float(jan[city])
        ratio = after / before if before else float("nan")
        y21 = observed[(observed["city"] == city) & (observed["date"].dt.year == 2021)]
        y22 = observed[(observed["city"] == city) & (observed["date"].dt.year == 2022)]
        mean21 = float(y21["ev_registrations"].mean()) if len(y21) else float("nan")
        mean22 = float(y22["ev_registrations"].mean()) if len(y22) else float("nan")
        level_ratio = mean22 / mean21 if mean21 else float("nan")
        rows.append(
            {
                "city": city,
                "dec_2021": before,
                "jan_2022": after,
                "month_ratio": round(ratio, 3) if pd.notna(ratio) else None,
                "mean_2021": round(mean21, 1) if pd.notna(mean21) else None,
                "mean_2022": round(mean22, 1) if pd.notna(mean22) else None,
                "level_ratio": round(level_ratio, 3) if pd.notna(level_ratio) else None,
                "seam_flag": bool(
                    pd.notna(ratio) and (ratio < 0.5 or ratio > 1.5)
                ),
            }
        )

    frame = pd.DataFrame(rows).sort_values("month_ratio", ascending=False)
    REPORTS.mkdir(parents=True, exist_ok=True)
    path = REPORTS / "seam_2021_2022.csv"
    frame.to_csv(path, index=False)

    print(f"cities compared: {len(frame)}")
    print(f"Dec-2021 -> Jan-2022 ratio: median {frame['month_ratio'].median():.3f}, "
          f"p05 {frame['month_ratio'].quantile(0.05):.3f}, "
          f"p95 {frame['month_ratio'].quantile(0.95):.3f}")
    print(f"flagged (outside 0.5-1.5): {int(frame['seam_flag'].sum())}")
    print(frame.head(8).to_string(index=False))
    print(f"wrote {path}")

    if args.with_m3:
        full = pd.read_csv(PROCESSED_DIR / "model_m3_summary.csv")
        short = panel[panel["date"] >= "2022-01-01"].reset_index(drop=True)
        result = m3_forecast.run(short, top_n=short["city"].nunique())
        subset = result.summary[
            ["city", "winner", "forecast_growth", "forecast_quality", "holdout_rmse_rel"]
        ].rename(
            columns={
                "winner": "winner_2022only",
                "forecast_growth": "growth_2022only",
                "forecast_quality": "quality_2022only",
                "holdout_rmse_rel": "rmse_rel_2022only",
            }
        )
        merged = full[["city", "forecast_growth", "forecast_quality"]].merge(
            subset, on="city", how="outer"
        )
        merged["growth_delta"] = merged["growth_2022only"] - merged["forecast_growth"]
        out = PROCESSED_DIR / "model_m3_2022only.csv"
        merged.to_csv(out, index=False)
        print(f"wrote {out} ({len(merged)} cities)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
