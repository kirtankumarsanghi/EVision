"""Offline tests for the parsing rules that are easy to get wrong.

These run against cached Vahan responses and pure functions — no network.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from evision.pipeline.derive import canonical_state_name  # noqa: E402
from evision.sources.vahan import (  # noqa: E402
    VahanClient,
    canonical_rto_code,
    parse_count,
)


class TestParseCount:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("1,54,964", 154964),
            ("720", 720),
            ("1,076", 1076),
            ("0", 0),
            ("", None),
            ("-", None),
            ("NA", None),
        ],
    )
    def test_indian_grouping(self, raw, expected):
        assert parse_count(raw) == expected


class TestCanonicalRtoCode:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("DL-01", "DL1"),
            ("DL-13", "DL13"),
            ("KA-05", "KA5"),
            ("MH-12", "MH12"),
            ("KA-51", "KA51"),
            ("MH12", "MH12"),
            ("dl-01", "DL1"),
            ("GJ-27", "GJ27"),
        ],
    )
    def test_vahan_uses_unpadded_codes(self, raw, expected):
        assert canonical_rto_code(raw) == expected


class TestStateCanonicalisation:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            # PPAC really does ship these spellings
            ("Maharastra", "maharashtra"),
            ("Chhatisgarh", "chhattisgarh"),
            ("Orissa", "odisha"),
            ("Pondicherry", "puducherry"),
            ("Uttaranchal", "uttarakhand"),
            ("Jammu & Kashmir", "jammu and kashmir"),
            ("Andaman & Nicobar Islands", "andaman and nicobar islands"),
            ("Karnataka", "karnataka"),
        ],
    )
    def test_legacy_spellings_resolve(self, raw, expected):
        assert canonical_state_name(raw) == expected


def _bucket_client(mapping: dict[str, str]) -> VahanClient:
    client = VahanClient.__new__(VahanClient)  # bypass __init__: no network
    client.codes = {"category_buckets": mapping}
    return client


class TestVehicleBucket:
    def test_abbreviated_categories(self):
        client = _bucket_client(
            {
                "2WIC": "2W", "2WN": "2W", "2WT": "2W",
                "3WIC": "3W", "3WN": "3W", "3WT": "3W",
                "4WIC": "4W", "LMV": "4W", "LPV": "4W", "MPV": "4W",
                "LGV": "COMM", "HGV": "COMM", "HMV": "COMM",
                "HPV": "COMM", "MGV": "COMM", "MMV": "COMM", "OTH": "OTHER",
            }
        )
        assert client.vehicle_bucket("2WN") == "2W"
        assert client.vehicle_bucket("3WT") == "3W"
        assert client.vehicle_bucket("LMV") == "4W"
        assert client.vehicle_bucket("HGV") == "COMM"
        assert client.vehicle_bucket("OTH") == "OTHER"

    def test_long_form_fallback(self):
        client = _bucket_client({})
        assert client.vehicle_bucket("TWO WHEELER(NT)") == "2W"
        assert client.vehicle_bucket("THREE WHEELER (PASSENGER)") == "3W"
        assert client.vehicle_bucket("MOTOR CAR") == "4W"


CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "raw" / "vahan"


@pytest.mark.skipif(
    not any(CACHE_DIR.glob("*fuel_mw_*.xml")),
    reason="no cached Vahan responses yet — run scripts/test_vahan_client.py",
)
class TestParsePanelAgainstCache:
    def _load(self) -> str:
        path = sorted(CACHE_DIR.glob("*fuel_mw_*.xml"))[0]
        xml = path.read_text(encoding="utf-8")
        start = xml.index("<![CDATA[") + len("<![CDATA[")
        end = xml.index("]]></update>", start)
        return xml[start:end]

    def test_months_are_mapped(self):
        report = VahanClient._parse_panel(
            self._load(), y_axis="Fuel", x_axis="Month Wise", year=2024, state="MH", rto="-1"
        )
        assert report.rows, "parser returned no rows"
        assert set(report.columns) == {
            "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
            "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
        }
        electric = [r for r in report.rows if r.label == "ELECTRIC(BOV)"]
        assert electric, "ELECTRIC(BOV) row missing"
        assert electric[0].total > 0

    def test_ev_fuel_rows_picks_both_codes(self):
        report = VahanClient._parse_panel(
            self._load(), y_axis="Fuel", x_axis="Month Wise", year=2024, state="MH", rto="-1"
        )
        client = VahanClient.__new__(VahanClient)
        client.codes = {"ev_fuel_labels": ["ELECTRIC(BOV)", "PURE EV"]}
        labels = {r.label for r in client.ev_fuel_rows(report.rows)}
        assert "ELECTRIC(BOV)" in labels
