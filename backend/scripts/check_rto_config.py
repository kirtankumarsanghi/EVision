"""Audit config/cities.yaml RTO codes against Vahan's live office list.

    python scripts/check_rto_config.py

Reports any configured code that Vahan does not publish, plus close matches,
so cities.yaml can be corrected rather than silently dropping cities.
"""

from __future__ import annotations

import difflib
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from evision.config import target_cities  # noqa: E402
from evision.sources.vahan import VahanClient, canonical_rto_code  # noqa: E402


def main() -> int:
    client = VahanClient()

    by_state: dict[str, list[dict]] = defaultdict(list)
    for city in target_cities():
        by_state[city["state"]].append(city)

    problems = 0
    for state, cities in by_state.items():
        frame = client.list_rtos(state)
        available = {str(c).upper(): str(i) for c, i in zip(frame["rto_code"], frame["rto_id"])}
        print(f"\n=== {state}: {len(available)} offices in Vahan ===")
        print("  available:", ", ".join(sorted(available)[:24]))

        for city in cities:
            configured = [canonical_rto_code(c) for c in city["rto_codes"]]
            missing = [c for c in configured if c not in available]
            resolved = [c for c in configured if c in available]
            if missing:
                problems += 1
                hint = ""
                for code in missing:
                    close = difflib.get_close_matches(code, available, n=2, cutoff=0.7)
                    hint += f"\n      {code} -> suggest {close}"
                status = "SKIPPED (none resolve!)" if not resolved else f"partial ({len(resolved)})"
                print(f"  [!] {city['name']:<22} {status}{hint}")

    print(f"\n{problems} cities have at least one unresolvable RTO code")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
