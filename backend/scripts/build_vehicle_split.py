"""Build only vehicle_split.csv (2W/3W/4W mix) without rebuilding the panel.

    python scripts/build_vehicle_split.py --years 2024
    python scripts/build_vehicle_split.py --years 2023 2024 --cities Pune Delhi

Uses the same Vahan cache as build_dataset.py, so it is cheap on a re-run.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from evision.config import PROCESSED_DIR  # noqa: E402
from evision.pipeline.build_panel import build_vehicle_split  # noqa: E402
from evision.provenance import Ledger  # noqa: E402
from evision.sources.vahan import VahanClient  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", nargs="+", type=int, default=[2024])
    parser.add_argument("--cities", nargs="+")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    ledger = Ledger()
    client = VahanClient(ledger)
    frame = build_vehicle_split(
        years=args.years,
        city_names=args.cities,
        client=client,
        workers=args.workers,
    )

    if frame.empty:
        print("no split data produced")
        return 1

    path = PROCESSED_DIR / "vehicle_split.csv"
    frame.to_csv(path, index=False)
    ledger.save()

    pivot = frame.pivot_table(
        index="city", columns="bucket", values="ev_registrations", aggfunc="sum"
    ).fillna(0)
    print(f"\nwrote {path} ({len(frame)} rows)")
    print(pivot.head(15).to_string())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
