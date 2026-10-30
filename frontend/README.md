# EVision — Frontend

Requirements-first analytics dashboard for EV charger siting in India.

The product has two modes:

| Mode | Purpose |
|---|---|
| **Plan rollout** (default) | A company enters budget, charger target, segment focus and evidence bar; the app returns one ranked, defended deployment brief. |
| **Explore the evidence** | The full analytical record: demand map, rankings, city profiles, forecasts, models, and provenance. |

Built with React 18, Vite, TypeScript, Tailwind CSS, Recharts and Lucide icons.

---

## Plan rollout

Three steps → one report.

**1. Your capital** — company name, budget (₹ Cr), charger target, DC/AC hardware mix. The wizard shows what the budget actually buys at that mix and warns before an over-budget run.

**2. Your market** — city class (all / metro / tier-2), state multi-select, highway preference, supply comparison radius (5 km / 10 km / city circle), vehicle segment focus (2W / 3W / 4W / mixed), volume↔growth weighting, and allocation strategy (balanced / deficit / growth / volume).

**3. Your evidence bar** — measured vehicle split only, stable forecasts only, harmonised boundaries only, minimum fleet size, deployment horizon (6 / 12 / 24 months), and how many markets to include.

Five one-click playbooks (balanced national, metro blitz, highway corridor, 3W commercial, growth bet) seed the form.

### The recommendation

- Narrative summary plus KPI cards: markets, chargers, capex, addressable EVs, strong-evidence share.
- Charger allocation chart (DC vs AC) and a priority matrix (supply gap × growth, bubble = units).
- Ranked city table with expandable **“Why this city?”** panels showing the three weighted CDS terms, the plain-English evidence, and confidence badges.
- Every excluded city is listed with the exact requirement it failed.
- Exports: CSV, shareable scenario link (URL-encoded), and a print stylesheet for a one-page PDF brief.

### Scoring rules

`CDS = 0.4·z(M1 expected monthly) + 0.3·P(high demand) + 0.3·z(M3 12-month growth)`

- M1 and M3 use the **global** z-scores from the published ranking, so filtering never rescales the score.
- Company requirements **filter, allocate and set the hardware mix** — they never add terms to the CDS.
- Custom weighting only rebalances M1 and M3; M2 stays at 30%.
- Allocation uses **largest-remainder apportionment**, so per-city units always sum exactly to the target.

### Assumptions vs model output

Capex (₹12.5 lakh per DC unit, ₹1.8 lakh per AC point), 24 EVs per plug and the horizon scaling are **engineering assumptions**, collected in `src/lib/assumptions.ts` and shown in the Assumptions drawer. They are not model output and are labelled as such in the UI and the exported brief.

---

## Explore the evidence

The Overview opens with an editorial hero illustration (an EV charging station
and car, drawn as inline SVG) rather than a chart. Data visualisations use a
restrained ink/monochrome palette: bars, lines and areas are ink on paper (light
on charcoal in dark mode), with colour reserved for status dots.

The whole app supports **light and dark themes** (toggle in the header, stored
per browser). Both themes share the same semantic tokens, so charts, tables and
the map stay readable in either mode. A theme and view can be deep-linked, e.g.
`/?mode=explore&tab=hotspots&theme=dark`.

| Tab | Contents |
|---|---|
| Overview | Problem framing, hero illustration, headline KPIs, five objectives, national trend |
| Demand map | SVG India map, state choropleth, city bubbles (pan + zoom) |
| Rankings | 51-city CDS table, filters, live weight sensitivity simulator, CSV export |
| Demand gap | Ranked demand-per-station bars, supply-vs-fleet scatter |
| City profile | Registration history + 12-month forecast, vehicle mix, policy context |
| Forecasts | SARIMA vs Holt-Winters tournament, ranked growth bars and quality gate |

Model coefficients, confusion matrices, coverage exclusions and seam diagnostics
are documented in `backend/reports/final_report.md` rather than duplicated here.

---

## Running

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The backend is optional:

```bash
cd backend
python scripts/run_api.py    # http://127.0.0.1:8000
```

Vite proxies `/api` → `127.0.0.1:8000`. If the API is unavailable, the app falls back to bundled snapshots from `src/data/snapshots/` and the header switches to **Bundled snapshots**. `registrations.json` and `india_map_data.json` are code-split and only fetched when the city profile or map is opened.

```bash
npm run build      # tsc + vite build
npm run preview
npm run verify:scenario   # CDS parity + allocation invariants
```

`verify:scenario` checks that the default weighting reproduces the published CDS exactly, that every allocation strategy sums to the requested unit total, and that the requirement filters behave (including the honest empty plan).
