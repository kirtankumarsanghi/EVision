"""Vahan 4 dashboard client.

Behaviour below was reverse-engineered against the live dashboard and verified
with real queries; see backend/docs/VAHAN_NOTES.md for the evidence trail.

Key facts this module relies on
-------------------------------
* The report form is a PrimeFaces 8 JSF form: ``masterLayout_formlogin``.
* Selecting a state does not reload the page; it fires an AJAX request that
  re-renders the RTO dropdown. Reproducing it requires
  ``source=j_idt40, partial.execute=j_idt40, partial.render="selectedRto yaxisVar"``
  — using ``@all`` here returns a dropdown containing only "All offices".
* The data table is summoned by clicking the element with client id ``irclay``
  and renders into ``tablePnl`` (NOT ``combTablePnl``, which only holds a
  loading spinner).
* The state/RTO selectors are honoured. The fuel and vehicle-class *checkbox
  filters are silently ignored* on submit, so EV figures are obtained by
  setting ``yaxisVar=Fuel`` and reading the electric rows instead of filtering.
* Vahan migrated registrations from ``ELECTRIC(BOV)`` to ``PURE EV`` during
  2024. Summing both is mandatory or the series appears to collapse mid-year.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Iterable

import pandas as pd
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

import warnings

from ..config import get_settings, vahan_codes
from ..http import get, new_session, post, write_cache
from ..provenance import Ledger, VERIFIED

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

log = logging.getLogger(__name__)

BASE_URL = "https://vahan.parivahan.gov.in/vahan4dashboard/vahan/view/reportview.xhtml"

MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]

_INDIAN_NUM = re.compile(r"^[\d,]+$")
_TABLE_UPDATE_RE = re.compile(
    r'<update id="tablePnl"><!\[CDATA\[(.*?)\]\]></update>', re.S
)

# Vahan renders RTO codes WITHOUT zero padding: Delhi is "DL1".."DL13", not
# "DL-01". Every RTO comparison must go through canonical_rto_code().
_RTO_RE = re.compile(r"^\s*([A-Za-z]{2})[-\s]?0*(\d{1,3})\s*$")


def canonical_rto_code(code: str) -> str:
    """Normalise an RTO code to Vahan's unpadded form: 'DL-01' -> 'DL1'."""
    match = _RTO_RE.match(str(code))
    if not match:
        return str(code).strip().upper().replace("-", "")
    return f"{match.group(1).upper()}{int(match.group(2))}"


def derive_rto_id(code: str) -> str:
    """Infer Vahan's internal office id from an RTO code.

    In every office list we observed, the id equals the numeric part of the
    code (MH12 -> '12', DL207 -> '207', KA51 -> '51'). Used only as a fallback
    when the dropdown cannot be loaded, so a run against cached responses stays
    possible when the dashboard is rate limiting.
    """
    normalised = canonical_rto_code(code)
    match = re.match(r"^[A-Z]{2}(\d{1,3})$", normalised)
    return str(int(match.group(1))) if match else ""


def parse_count(text: str) -> int | None:
    """Parse a Vahan cell. Supports Indian grouping (1,54,964)."""
    cleaned = text.strip().replace(",", "").replace("\u00a0", "")
    if not cleaned or cleaned in {"-", "NA", "N/A"}:
        return None
    if not cleaned.isdigit():
        return None
    return int(cleaned)


@dataclass
class ReportRow:
    """One y-axis row. ``values`` is keyed by the x-axis column label."""

    label: str
    values: dict[str, int | None]
    total: int | None

    @property
    def months(self) -> dict[str, int | None]:
        """Month-keyed view, only meaningful when x_axis is Month Wise."""
        return {m: self.values.get(m) for m in MONTHS if m in self.values}


@dataclass
class Report:
    y_axis: str
    x_axis: str
    year: int
    state: str
    rto: str
    columns: list[str] = field(default_factory=list)
    rows: list[ReportRow] = field(default_factory=list)

    @property
    def is_monthly(self) -> bool:
        return self.x_axis == "Month Wise"

    def as_frame(self) -> pd.DataFrame:
        records: list[dict[str, Any]] = []
        for row in self.rows:
            for column, value in row.values.items():
                if value is None:
                    continue
                record = {
                    "state_code": self.state,
                    "rto": self.rto,
                    "y_label": row.label,
                    "x_label": column,
                    "year": self.year,
                    "count": value,
                }
                if self.is_monthly:
                    record["month"] = MONTHS.index(column) + 1 if column in MONTHS else None
                records.append(record)
        return pd.DataFrame.from_records(records)


class VahanClient:
    """Stateful client. Reuse one instance so the JSF view state stays warm."""

    # The dashboard starts returning its default view after roughly a dozen
    # submits on one session, which looks like empty data. Recycling the
    # session well before that keeps results honest.
    RESET_EVERY = 8

    def __init__(self, ledger: Ledger | None = None) -> None:
        self.session = new_session()
        self.codes = vahan_codes()
        self.settings = get_settings()
        self.ledger = ledger or Ledger()
        self._view_state: str | None = None
        self._form_snapshot: dict[str, list[str]] | None = None
        self._queries = 0
        self._primed_state: str | None = None
        # Set when the dashboard is unreachable/rate limiting, so we stop
        # retrying the network for every remaining state and city.
        self._offline = False

    # ------------------------------------------------------------------ state

    def _bootstrap(self) -> tuple[dict[str, list[str]], str]:
        """Fetch the report page and snapshot the form so POSTs round-trip."""
        resp = get(self.session, BASE_URL, timeout=self.settings.request_timeout)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")

        form = soup.find("form", {"id": "masterLayout_formlogin"})
        if form is None:
            raise RuntimeError("Vahan report form not found — page layout changed")

        view_state_input = soup.find("input", {"name": "javax.faces.ViewState"})
        if view_state_input is None:
            raise RuntimeError("Vahan ViewState missing — session may be blocked")

        snapshot: dict[str, list[str]] = {"masterLayout_formlogin": ["masterLayout_formlogin"]}
        for inp in form.find_all("input"):
            name = inp.get("name")
            if not name or name == "javax.faces.ViewState":
                continue
            itype = (inp.get("type") or "text").lower()
            if itype in {"submit", "button", "reset", "image", "file"}:
                continue
            if itype in {"checkbox", "radio"} and not inp.has_attr("checked"):
                continue
            snapshot.setdefault(name, []).append(inp.get("value") or "")

        for sel in form.find_all("select"):
            name = sel.get("name")
            if not name:
                continue
            chosen = sel.find_all("option", selected=True)
            snapshot[name] = (
                [o.get("value") or "" for o in chosen] if chosen else [""]
            )

        state_sel = form.find("select", {"name": "j_idt40_input"})
        if state_sel is not None and "j_idt40_input" not in snapshot:
            snapshot["j_idt40_input"] = ["-1"]

        self._view_state = view_state_input["value"]
        self._form_snapshot = snapshot
        return snapshot, self._view_state

    def _ensure(self) -> tuple[dict[str, list[str]], str]:
        if self._view_state is None or self._form_snapshot is None:
            return self._bootstrap()
        return self._form_snapshot, self._view_state

    def reset(self) -> None:
        """Throw away the JSF session.

        The dashboard's view state goes stale after a failed submit; once that
        happens every later query on the same session returns an empty panel.
        Rebuilding is far cheaper than silently collecting zeros.
        """
        try:
            self.session.close()
        except Exception:  # noqa: BLE001
            pass
        self.session = new_session()
        self._view_state = None
        self._form_snapshot = None
        self._queries = 0
        self._primed_state = None

    def _cycle_if_due(self) -> None:
        """Recycle the JSF session before it starts returning default views."""
        self._queries += 1
        if self._queries >= self.RESET_EVERY:
            log.debug("cycling session after %d submits", self._queries)
            self.reset()

    def _ensure_state(self, state_code: str) -> None:
        """Load the state's office list into the session.

        The dashboard ignores an RTO id unless that state's dropdown has been
        populated in the current session, and silently renders its default view
        instead. Called before every report submit so it survives cycling.
        """
        if not state_code or state_code == "-1":
            return
        if self._primed_state == state_code:
            return
        try:
            self.list_rtos(state_code)
            self._primed_state = state_code
        except Exception as exc:  # noqa: BLE001
            log.warning("could not prime state %s (%s)", state_code, exc)

    def _fire(
        self,
        *,
        source: str,
        process: str,
        render: str,
        overrides: dict[str, str | list[str]],
        event: str | None = None,
    ) -> str:
        snapshot, view_state = self._ensure()
        data = {k: list(v) for k, v in snapshot.items()}
        for key, value in overrides.items():
            data[key] = list(value) if isinstance(value, (list, tuple)) else [str(value)]
        data["javax.faces.ViewState"] = [view_state]

        payload: list[tuple[str, str]] = [
            ("javax.faces.partial.ajax", "true"),
            ("javax.faces.source", source),
            ("javax.faces.partial.execute", process),
            ("javax.faces.partial.render", render),
            (source, source),
        ]
        if event:
            payload.append(("javax.faces.behavior.event", event))
            payload.append(("javax.faces.partial.event", event))
        for key, values in data.items():
            for value in values:
                payload.append((key, value))

        resp = post(
            self.session,
            BASE_URL,
            data=payload,
            headers={
                "Faces-Request": "partial/ajax",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": BASE_URL,
                "Origin": "https://vahan.parivahan.gov.in",
                "Accept": "application/xml, text/xml, */*; q=0.01",
            },
        )
        # rotate the view state so subsequent calls reuse this session
        vs_match = re.search(
            r'<update id="[^"]*ViewState[^"]*"><!\[CDATA\[(.*?)\]\]></update>', resp.text, re.S
        )
        if vs_match:
            self._view_state = vs_match.group(1).strip()
        return resp.text

    # ------------------------------------------------------------- selectors

    def list_states(self) -> dict[str, str]:
        """Return {code: name} straight from the live dropdown."""
        self._ensure()
        resp = get(self.session, BASE_URL, timeout=self.settings.request_timeout)
        soup = BeautifulSoup(resp.text, "lxml")
        sel = soup.find("select", {"name": "j_idt40_input"})
        if sel is None:
            return dict(self.codes.get("states", {}))
        result: dict[str, str] = {}
        for opt in sel.find_all("option"):
            value = opt.get("value") or ""
            if value and value != "-1":
                result[value] = opt.get_text(strip=True)
        return result

    def list_rtos(self, state_code: str, use_cache: bool = True) -> pd.DataFrame:
        """Resolve a state's offices: rto_id, rto_code, office, active_since.

        Cached to data/raw/vahan/rtos_<state>.csv. The office list changes a
        few times a year at most, so re-reading it costs nothing and keeps a
        re-run of the pipeline fully offline.
        """
        from ..config import RAW_DIR

        cache = RAW_DIR / "vahan" / f"rtos_{state_code}.csv"
        if use_cache and cache.exists():
            frame = pd.read_csv(cache, dtype={"rto_id": str, "rto_code": str})
            if not frame.empty:
                return frame

        if self._offline:
            return pd.DataFrame()

        try:
            xml = self._fire(
                source="j_idt40",
                process="j_idt40",
                render="selectedRto yaxisVar",
                overrides={"j_idt40_input": state_code},
                event="change",
            )
        except Exception:
            self._offline = True
            raise
        match = re.search(
            r'<update id="selectedRto"><!\[CDATA\[(.*?)\]\]></update>', xml, re.S
        )
        if not match:
            raise RuntimeError(f"RTO dropdown not returned for state {state_code}")

        soup = BeautifulSoup(match.group(1), "lxml")
        records: list[dict[str, Any]] = []
        for opt in soup.find_all("option"):
            rto_id = (opt.get("value") or "").strip()
            label = opt.get_text(" ", strip=True)
            if not rto_id or rto_id == "-1":
                continue
            code_match = re.search(r"-\s*([A-Z]{2}\d{1,3})", label)
            rto_code = canonical_rto_code(code_match.group(1)) if code_match else ""
            office = re.split(r"-\s*[A-Z]{2}\d{1,3}", label)[0].strip(" -")
            since = re.search(r"\(([^)]*)\)\s*$", label)
            records.append(
                {
                    "state_code": state_code,
                    "rto_id": rto_id,
                    "rto_code": rto_code,
                    "office": office,
                    "active_since": since.group(1) if since else "",
                    "raw_label": label,
                }
            )
        frame = pd.DataFrame.from_records(records)
        if not frame.empty:
            cache.parent.mkdir(parents=True, exist_ok=True)
            frame.to_csv(cache, index=False)
        return frame

    def _fetch_report(self, overrides: dict[str, str]) -> str:
        """Submit the report form, rebuilding the session if the submit throws."""
        if self._offline:
            raise RuntimeError("dashboard marked offline — using cache only")
        self._cycle_if_due()
        try:
            return self._fire(
                source="irclay",
                process="@all",
                render="tablePnl",
                overrides=overrides,
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("report submit failed (%s) — rebuilding session", exc)
            self.reset()
            return self._fire(
                source="irclay",
                process="@all",
                render="tablePnl",
                overrides=overrides,
            )

    # ----------------------------------------------------------------- query

    def query(
        self,
        *,
        y_axis: str,
        x_axis: str,
        year: int,
        year_type: str = "C",
        state_code: str = "-1",
        rto_id: str = "-1",
        cache_name: str | None = None,
        use_cache: bool = True,
    ) -> Report:
        """Run one report query and parse the rendered table.

        When ``cache_name`` is given the response XML is written to
        data/raw/vahan and, on later runs, read back instead of refetched. That
        makes a long multi-city scrape resumable.
        """
        from ..http import cache_path

        path = cache_path("vahan", cache_name, "xml") if cache_name else None

        cached = None
        if path is not None and use_cache and path.exists():
            text = path.read_text(encoding="utf-8")
            if _TABLE_UPDATE_RE.search(text):
                cached = text
                log.debug("cache hit: %s", path.name)
            else:
                # An earlier interrupted/failed submit may have written a
                # response with no report table. Never replay that.
                log.warning("discarding invalid cache entry %s", path.name)
                path.unlink(missing_ok=True)

        overrides = {
            "j_idt40_input": state_code,
            "selectedRto_input": rto_id,
            "yaxisVar_input": y_axis,
            "xaxisVar_input": x_axis,
            "selectedYearType_input": year_type,
            "selectedYear_input": str(year),
        }

        # Up to two attempts: replay cache, then fetch live. A response can
        # contain a table and still be wrong — the dashboard silently falls
        # back to its default axes when a submit is not accepted — so validate
        # the SHAPE of the report, not merely that a table came back.
        for attempt in (1, 2):
            if attempt == 1 and cached is not None:
                xml = cached
            else:
                if attempt == 2:
                    self.reset()
                # Priming touches the network, so only do it when we are
                # actually going to fetch (a cached replay needs no session).
                self._ensure_state(state_code)
                xml = self._fetch_report(overrides)
                if path is not None:
                    write_cache("vahan", cache_name, xml, "xml")

            panel = _TABLE_UPDATE_RE.search(xml)
            if panel is None:
                log.warning(
                    "no report table for %s/%s %s (attempt %d)",
                    state_code, rto_id, year, attempt,
                )
                continue

            report = self._parse_panel(
                panel.group(1),
                y_axis=y_axis,
                x_axis=x_axis,
                year=year,
                state=state_code,
                rto=rto_id,
            )

            if self._report_matches_axes(report, y_axis, x_axis):
                self._log_record(report, y_axis, x_axis, state_code, rto_id, year, panel.group(1))
                return report

            log.warning(
                "response for %s/%s %s has wrong axes (want y=%s x=%s, "
                "got rows=%s cols=%s) — cooling down and refetching",
                state_code, rto_id, year, y_axis, x_axis,
                report.rows[0].label if report.rows else None,
                report.columns[:3],
            )
            if path is not None:
                path.unlink(missing_ok=True)
                cached = None
            time.sleep(3.0)

        raise RuntimeError(
            f"no usable report for state={state_code}, rto={rto_id}, "
            f"y={y_axis}, x={x_axis}, year={year}"
        )

    def _report_matches_axes(self, report: "Report", y_axis: str, x_axis: str) -> bool:
        """True when the table actually reflects the requested axes.

        The dashboard reverts to its default view when a submit is not picked
        up, which yields a well-formed table of the wrong thing. Checking the
        column labels catches that before it becomes silent zeros.
        """
        if not report.rows:
            return False
        if x_axis == "Month Wise":
            # The current year legitimately returns a subset of months (Vahan
            # publishes up to the latest completed month), so accept any
            # non-empty subset rather than requiring all twelve.
            if not report.columns or not set(report.columns) <= set(MONTHS):
                return False
        if y_axis == "Fuel":
            known = {str(v).upper() for v in (self.codes.get("fuel") or {}).values()}
            return any(r.label.upper() in known for r in report.rows)
        if y_axis == "State":
            return any(len(r.label) > 3 for r in report.rows)
        return True

    def _log_record(self, report, y_axis, x_axis, state_code, rto_id, year, payload):
        self.ledger.record(
            source="vahan",
            dataset=f"report:{y_axis}x{x_axis}",
            url=BASE_URL,
            status=VERIFIED,
            payload=payload,
            rows=len(report.rows),
            notes=f"state={state_code} rto={rto_id} year={year}",
        )

    @staticmethod
    def _parse_panel(
        html: str, *, y_axis: str, x_axis: str, year: int, state: str, rto: str
    ) -> Report:
        soup = BeautifulSoup(html, "lxml")

        best: list[list[str]] = []
        best_score = -1
        for table in soup.find_all("table"):
            rows: list[list[str]] = []
            for tr in table.find_all("tr"):
                cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
                if cells:
                    rows.append(cells)
            score = sum(1 for r in rows for c in r if _INDIAN_NUM.match(c))
            if score > best_score:
                best_score, best = score, rows

        is_data_row = lambda r: bool(r) and bool(re.fullmatch(r"\d+\.?", r[0]))
        data_rows = [r for r in best if is_data_row(r)]
        if not data_rows:
            return Report(
                y_axis=y_axis, x_axis=x_axis, year=year, state=state, rto=rto, rows=[]
            )

        width = max(len(r) for r in data_rows)
        n_values = max(width - 3, 0)

        # The column header is rendered in a separate <table> from the data
        # rows, so scan every table on the panel for a row whose cell count
        # matches the number of value columns.
        all_rows: list[list[str]] = []
        for table in soup.find_all("table"):
            for tr in table.find_all("tr"):
                cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
                if cells:
                    all_rows.append(cells)

        columns: list[str] | None = None
        for row in all_rows:
            if is_data_row(row):
                continue
            cells = [c for c in row if c]
            if n_values and len(cells) == n_values:
                columns = cells
                break
        if columns is None:
            columns = MONTHS[:n_values] if x_axis == "Month Wise" else [
                f"col{i}" for i in range(n_values)
            ]

        parsed: list[ReportRow] = []
        for row in data_rows:
            values: dict[str, int | None] = {}
            for i, name in enumerate(columns):
                idx = 2 + i
                values[name] = parse_count(row[idx]) if idx < len(row) else None
            parsed.append(
                ReportRow(label=row[1], values=values, total=parse_count(row[-1]))
            )

        return Report(
            y_axis=y_axis,
            x_axis=x_axis,
            year=year,
            state=state,
            rto=rto,
            columns=columns,
            rows=parsed,
        )

    # --------------------------------------------------- project-level helpers

    def ev_fuel_rows(self, rows: Iterable[ReportRow]) -> list[ReportRow]:
        labels = {lbl.upper() for lbl in self.codes.get("ev_fuel_labels", [])}
        return [r for r in rows if r.label.upper() in labels]

    def monthly_ev(self, report: Report) -> dict[str, int | None]:
        """Sum the electric fuel rows into a single monthly EV series.

        Requires a Month Wise x-axis. ELECTRIC(BOV) and PURE EV are summed
        because Vahan migrated records between the two codes during 2024.
        """
        if not report.is_monthly:
            raise ValueError(
                f"monthly_ev needs x_axis='Month Wise', got {report.x_axis!r}"
            )
        totals: dict[str, int | None] = {m: None for m in MONTHS}
        for row in self.ev_fuel_rows(report.rows):
            for month in MONTHS:
                value = row.values.get(month)
                if value is None:
                    continue
                totals[month] = (totals[month] or 0) + value
        return totals

    def ev_by_column(self, report: Report) -> dict[str, int]:
        """Sum EV rows across whatever the x-axis columns are."""
        result: dict[str, int] = {}
        for row in self.ev_fuel_rows(report.rows):
            for column, value in row.values.items():
                if value:
                    result[column] = result.get(column, 0) + value
        return result

    def vehicle_bucket(self, label: str) -> str:
        """Collapse a Vahan vehicle-category label into 2W / 3W / 4W / COMM.

        The dashboard abbreviates categories when they appear as an x-axis
        (2WN, 3WT, LMV ...), so consult the verified mapping before falling
        back to keyword matching on the long form.
        """
        key = label.strip().upper()
        known = self.codes.get("category_buckets", {}) or {}
        if key in known:
            return known[key]

        upper = label.upper()
        if "TWO WHEELER" in upper or "MOTOR CYCLE" in upper or "SCOOTER" in upper or "MOPED" in upper:
            return "2W"
        if "THREE WHEELER" in upper or "RICKSHAW" in upper:
            return "3W"
        if "FOUR WHEELER" in upper or "MOTOR CAR" in upper or "QUADRICYCLE" in upper:
            return "4W"
        if "GOODS" in upper or "HEAVY" in upper or "MEDIUM" in upper:
            return "COMM"
        return "OTHER"

    def ev_by_vehicle_bucket(self, report: Report) -> dict[str, int]:
        """EV registrations split into 2W / 3W / 4W (needs x_axis=Vehicle Category)."""
        buckets: dict[str, int] = {}
        for row in self.ev_fuel_rows(report.rows):
            for column, value in row.values.items():
                if not value:
                    continue
                bucket = self.vehicle_bucket(column)
                buckets[bucket] = buckets.get(bucket, 0) + value
        return buckets
