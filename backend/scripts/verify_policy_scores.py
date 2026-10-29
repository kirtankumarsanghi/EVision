"""Extract policy-rubric evidence from the policy PDFs.

    python scripts/verify_policy_scores.py
    python scripts/verify_policy_scores.py --state Delhi --state Karnataka

Downloads each policy URL to data/raw/policy, extracts the text with pypdf,
and searches for the four rubric incentives. It writes a *proposal*, never
overwrites the scores:

    data/source/policy/policy_evidence.csv
    data/source/policy/state_ev_policy_scores_verified.csv

Every flag carries the page and a quoted snippet so a human can check it. A
flag is only set when the text contains a matching passage; absence of a match
is recorded as 0 with an explicit note, not treated as proof.
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pandas as pd  # noqa: E402
import requests  # noqa: E402
from pypdf import PdfReader  # noqa: E402

from evision.config import BACKEND_ROOT  # noqa: E402

SOURCE = BACKEND_ROOT / "data" / "source" / "policy" / "state_ev_policy_scores.csv"
EVIDENCE = BACKEND_ROOT / "data" / "source" / "policy" / "policy_evidence.csv"
PROPOSAL = BACKEND_ROOT / "data" / "source" / "policy" / "state_ev_policy_scores_verified.csv"
CACHE = BACKEND_ROOT / "data" / "raw" / "policy"

FLAGS = {
    "road_tax_waiver_0_1": [
        r"road\s*tax[^.]{0,160}(waiv|exempt|reimburse|refund)",
        r"(waiv|exempt|reimburse|refund)[^.]{0,160}road\s*tax",
    ],
    "purchase_subsidy_0_1": [
        r"(purchase|buyer|demand[-\s]?side)[^.]{0,160}subsid",
        r"subsid[^.]{0,160}(purchase|buyer|demand[-\s]?side)",
    ],
    "charger_incentive_0_1": [
        r"(charg|charging station)[^.]{0,160}(subsid|incentive|capital|grant)",
        r"(subsid|incentive|capital|grant)[^.]{0,160}(charg|charging station)",
    ],
    "scrappage_incentive_0_1": [
        r"scrapp?[^.]{0,160}(incentive|benefit|subsid)",
        r"(incentive|benefit|subsid)[^.]{0,160}scrapp?",
    ],
}


def _cache_path(url: str, state: str) -> Path:
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
    safe = re.sub(r"[^A-Za-z0-9]+", "_", state).strip("_")
    return CACHE / f"{safe}_{digest}.pdf"


def _download(url: str, state: str) -> Path | None:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = _cache_path(url, state)
    if path.exists() and path.stat().st_size > 1000:
        return path
    try:
        response = requests.get(url, timeout=90)
        response.raise_for_status()
        path.write_bytes(response.content)
        return path
    except Exception as exc:  # noqa: BLE001
        logging.warning("%s: download failed (%s)", state, exc)
        return None


def _pages(path: Path) -> list[str]:
    try:
        reader = PdfReader(str(path))
        return [(page.extract_text() or "") for page in reader.pages]
    except Exception as exc:  # noqa: BLE001
        logging.warning("%s: PDF parse failed (%s)", path.name, exc)
        return []


def _match(pages: list[str], patterns: list[str]) -> tuple[int | None, str]:
    for page_number, text in enumerate(pages, start=1):
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            if match:
                start = max(match.start() - 120, 0)
                end = min(match.end() + 120, len(text))
                snippet = re.sub(r"\s+", " ", text[start:end]).strip()
                return page_number, snippet
    return None, ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", action="append", help="limit to these states")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    policies = pd.read_csv(SOURCE)
    if args.state:
        policies = policies[policies["state"].isin(args.state)]

    evidence_rows = []
    proposal_rows = []

    for _, row in policies.iterrows():
        state = row["state"]
        url = row.get("policy_url")
        record = {"state": state, "policy_url": url}
        if not isinstance(url, str) or not url.strip():
            record["verification_status"] = "no policy URL"
            for flag in FLAGS:
                record[flag] = None
                record[f"{flag}_page"] = None
                record[f"{flag}_snippet"] = ""
            evidence_rows.append(record)
            continue

        path = _download(url, state)
        pages = _pages(path) if path else []
        if not pages:
            record["verification_status"] = "PDF unavailable or unreadable"
            for flag in FLAGS:
                record[flag] = None
                record[f"{flag}_page"] = None
                record[f"{flag}_snippet"] = ""
            evidence_rows.append(record)
            continue

        record["verification_status"] = "extracted"
        for flag, patterns in FLAGS.items():
            page, snippet = _match(pages, patterns)
            record[flag] = 1 if page else 0
            record[f"{flag}_page"] = page
            record[f"{flag}_snippet"] = snippet
        evidence_rows.append(record)

        total = sum(int(record[f]) for f in FLAGS if record[f] is not None)
        score = 1 if total <= 1 else 2 if total == 2 else 3
        proposal_rows.append(
            {
                "state": state,
                "rubric_total": total,
                "score_from_rubric": score,
                "score_used": score,
                "score_source": "read from policy PDF (see policy_evidence.csv)",
                "policy_verified": True,
                "verification_status": "extracted; human review required",
            }
        )

    pd.DataFrame(evidence_rows).to_csv(EVIDENCE, index=False)
    if proposal_rows:
        pd.DataFrame(proposal_rows).to_csv(PROPOSAL, index=False)
    print(f"wrote {EVIDENCE} ({len(evidence_rows)} states)")
    if proposal_rows:
        print(f"wrote {PROPOSAL} ({len(proposal_rows)} states, review before adopting)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
