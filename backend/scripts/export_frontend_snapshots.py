"""Regenerate the frontend's offline snapshots from the running API.

The dashboard prefers the live FastAPI service and falls back to committed JSON
snapshots when it is unavailable. Those snapshots must be reproducible, so this
script pulls every endpoint the frontend consumes and writes it to
`frontend/src/data/snapshots/`.

Usage
-----
    # terminal 1
    python scripts/run_api.py

    # terminal 2
    python scripts/export_frontend_snapshots.py            # write snapshots
    python scripts/export_frontend_snapshots.py --check    # fail if stale

`--check` is CI-friendly: it exits 1 when a committed snapshot no longer matches
what the API serves, which is exactly the drift that used to go unnoticed.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_ROOT.parent
SNAPSHOT_DIR = REPO_ROOT / "frontend" / "src" / "data" / "snapshots"
PROCESSED_DIR = BACKEND_ROOT / "data" / "processed"
MAP_FILE = REPO_ROOT / "frontend" / "src" / "data" / "india_map_data.json"

API_BASE = "http://127.0.0.1:8000"


def fetch(path: str, base: str) -> object:
    with urllib.request.urlopen(f"{base}{path}", timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def compact(payload) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def equivalent(snapshot, api) -> bool:
    """Compare snapshots to the API semantically.

    The API may return extra columns (for example ``model_score``) and floats
    can differ in the last digit after a CSV round-trip. Neither changes what
    the frontend displays, so they are not treated as drift.
    """
    if isinstance(snapshot, dict) and isinstance(api, dict):
        return all(key in api and equivalent(value, api[key]) for key, value in snapshot.items())
    if isinstance(snapshot, list) and isinstance(api, list):
        return len(snapshot) == len(api) and all(
            equivalent(left, right) for left, right in zip(snapshot, api)
        )
    if isinstance(snapshot, bool) or isinstance(api, bool):
        return snapshot is api
    if isinstance(snapshot, (int, float)) and isinstance(api, (int, float)):
        return math.isclose(snapshot, api, rel_tol=1e-9, abs_tol=1e-12)
    return snapshot == api


def write_snapshot(name: str, payload, check: bool) -> bool:
    path = SNAPSHOT_DIR / name
    text = compact(payload)

    if check:
        if not path.exists():
            print(f"  MISSING  {name}")
            return False
        current = json.loads(path.read_text(encoding="utf-8"))
        if not equivalent(current, payload):
            print(f"  STALE    {name}")
            return False
        print(f"  ok       {name}")
        return True

    path.write_text(text, encoding="utf-8")
    print(f"  wrote    {name}  ({len(text) / 1024:.1f} KB)")
    return True


def vehicle_split_rows() -> list[dict]:
    frame = pd.read_csv(PROCESSED_DIR / "vehicle_split.csv")
    return json.loads(frame.to_json(orient="records"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify instead of writing")
    parser.add_argument("--api", default=API_BASE, help="base URL of the API")
    args = parser.parse_args()

    base = args.api.rstrip("/")

    if not SNAPSHOT_DIR.exists():
        print(f"snapshot directory not found: {SNAPSHOT_DIR}", file=sys.stderr)
        return 2

    try:
        health = fetch("/health", base)
    except (urllib.error.URLError, ConnectionError) as exc:
        print(
            f"cannot reach the API at {base} ({exc}).\n"
            "Start it first:  python scripts/run_api.py",
            file=sys.stderr,
        )
        return 2

    missing = [name for name, present in health.get("datasets", {}).items() if not present]
    if missing:
        print(f"API is up but these datasets are missing: {', '.join(missing)}", file=sys.stderr)
        print("Run: python scripts/build_user_dataset.py && python scripts/run_models.py", file=sys.stderr)
        return 2

    print("Fetching endpoints…")
    hotspots = fetch("/hotspots?top=51", base)["rows"]
    cities = fetch("/cities", base)
    demand = fetch("/demand", base)["rows"]
    features = fetch("/features", base)["rows"]
    forecasts = fetch("/forecasts", base)["rows"]
    monthly = fetch("/forecasts/monthly", base)["rows"]
    stats = fetch("/stats", base)
    manifest = fetch("/meta", base)
    models = fetch("/models/summary", base)
    seam = fetch("/seam", base)["rows"]

    print(f"Fetching {len(features)} city series…")
    registrations: dict[str, list[dict]] = {}
    for row in features:
        city = row["city"]
        quote = urllib.parse.quote(city, safe="")
        registrations[city] = fetch(f"/registrations/{quote}", base)["series"]

    payloads: dict[str, object] = {
        "hotspots.json": hotspots,
        "cities.json": cities,
        "demand.json": demand,
        "features.json": features,
        "forecasts.json": forecasts,
        "forecasts_monthly.json": monthly,
        "stats.json": stats,
        "manifest.json": manifest,
        "m1_coefficients.json": models.get("m1_coefficients", []),
        "m2_comparison.json": models.get("m2_comparison", []),
        "m2_confusion.json": models.get("m2_confusion", []),
        "seam.json": seam,
        "registrations.json": registrations,
    }

    # vehicle_split has no API endpoint; read the processed output directly.
    payloads["vehicle_split.json"] = vehicle_split_rows()

    print("\nSnapshots:" if not args.check else "\nChecking snapshots:")
    ok = True
    for name, payload in payloads.items():
        ok = write_snapshot(name, payload, args.check) and ok

    # Cross-check the static map file against the analysed city universe.
    if MAP_FILE.exists():
        map_data = json.loads(MAP_FILE.read_text(encoding="utf-8"))
        coords = set(map_data.get("city_coords", {}))
        cities_in_panel = {row["city"] for row in features}
        uncovered = sorted(cities_in_panel - coords)
        if uncovered:
            print(f"\n  WARNING  map data lacks coordinates for: {', '.join(uncovered)}")
            ok = False
        else:
            print(f"\n  ok       india_map_data.json covers all {len(cities_in_panel)} cities")
    else:
        print(f"\n  WARNING  map file missing: {MAP_FILE}")
        ok = False

    if args.check:
        print("\nSnapshots are current." if ok else "\nSnapshots are stale — run without --check.")
        return 0 if ok else 1

    print("\nDone. The frontend fallback now matches the API.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
