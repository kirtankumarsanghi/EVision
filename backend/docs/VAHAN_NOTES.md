# Vahan dashboard — reverse-engineering notes

Everything here was established empirically against
`https://vahan.parivahan.gov.in/vahan4dashboard/vahan/view/reportview.xhtml`
on 2026-10-28. Keep this file in sync with `src/evision/sources/vahan.py`; if
Vahan redesigns the page, this is where to start debugging.

## The page is PrimeFaces 8 / JSF

- Form id: `masterLayout_formlogin`, POST-only, carries
  `javax.faces.ViewState` (~1.7 KB).
- Every request must replay the full form snapshot **plus** the current view
  state. The client keeps one session and rotates the view state from each
  response (`j_id1:javax.faces.ViewState:0`).

## Selecting a state is an AJAX call, not a page load

```
source           = j_idt40
partial.execute  = j_idt40
partial.render   = selectedRto yaxisVar
j_idt40_input    = MH
```

This repopulates the RTO dropdown. **Do not use `partial.execute=@all` here** —
it returns a dropdown containing only "All Vahan4 Running Office". That
mistake costs an hour.

## The data table is summoned by `irclay`

```
source           = irclay
partial.execute  = @all
partial.render   = tablePnl
```

`combTablePnl` is a decoy: it holds only a `BlockUI` loading spinner. The
actual report HTML arrives in **`tablePnl`** as
`<update id="tablePnl"><![CDATA[ ... ]]></update>`.

## RTO codes are unpadded

The dropdown lists offices as `PUNE - MH12( 25-JAN-2017 )`. Vahan's code is
`MH12`, never `MH-12`. Delhi is `DL1`..`DL13`. Any comparison must run through
`canonical_rto_code()`, which strips the hyphen and leading zeros.

The dropdown `value` is an **internal numeric office id**, not the RTO number —
though they often coincide (`45` → `MH45`). Never hardcode them; resolve them
per state at ingest time.

## The checkbox filters do not work

Selecting fuel checkboxes and submitting `fuel=4&fuel=23` produces a report
identical, byte for byte, to submitting no filter at all. Verified three ways:
no filter / `fuel=4` / `fuel=4,23` all returned the all-vehicle state table
(16,507,791 registrations for 2024).

**Workaround:** set `yaxisVar=Fuel` and read the electric rows directly. The
report then contains one row per fuel for the chosen state/RTO.

## EV is two fuel codes, not one

```
 4  ELECTRIC(BOV)
23  PURE EV
```

Circular for 2024, Maharashtra: `ELECTRIC(BOV)` runs 18,892 → 29,830 → 3,899
across Jan→Dec while `PURE EV` runs 0 → 0 → 13,958. Summing both gives a
smooth series totalling 241,797. Summing either alone produces a fake collapse.

## Axis quirks

- `yaxisVar` ∈ {Vehicle Category, Vehicle Class, Norms, Fuel, Maker, State}
- `xaxisVar` ∈ {Vehicle Category, Norms, Fuel, VCG, Financial Year, Calendar
  Year, Month Wise}
- The column header lives in a **different `<table>`** from the data rows, so
  header discovery must scan every table on the panel, not just the data one.
- When used as an x-axis, vehicle categories render abbreviated
  (`2WN`, `3WT`, `LMV`) — mapped in `vahan_codes.yaml:category_buckets`.

## Rate limiting

The dashboard tolerates ~1 request/second. The client throttles to 1.5 s per
host and caches every response under `data/raw/vahan/`, so a re-run is free and
an interrupted scrape resumes.

## Status

The dashboard has been rate-limiting this IP since the initial scrape: the RTO
dropdown comes back with only the "All offices" entry, so `list_rtos()` returns
empty. The cached responses under `data/raw/vahan/` are still usable, which is
why `build_vehicle_split.py` can regenerate `vehicle_split.csv` offline.

## Quick smoke test

When the dashboard is reachable:

```python
from evision.sources.vahan import VahanClient

client = VahanClient()
print(len(client.list_states()))          # 36
print(len(client.list_rtos("MH")))        # 61
```

Expected: 36 states, 61 Maharashtra offices (Pune → `rto_id=12`), Maharashtra
2024 EV total 241,797, Pune 2024 EV total 34,403.
