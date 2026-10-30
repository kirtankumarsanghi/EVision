# EVision

Quantifying where India's next public EV chargers should go.

India has millions of registered EVs and a public charging network that is
thin and unevenly distributed. This project builds the data layer for a
statistical framework that ranks Indian cities by charging demand.

```
EVision/
├── backend/     data, pipeline, API   <- active
│   └── data/    all data lives here
└── frontend/    requirements-first planner + evidence explorer
```

## Status

| Component | State |
|---|---|
| City × month EV panel | **51 analysed of 68 configured, 2021-01 → 2026-09, 96.9% observed** |
| Chargers, census, fuel price, income, temperature | merged, 51/51 coverage |
| EV split 2W/3W/4W | 42 measured, 6 state-proxy, 3 national-proxy |
| Cleaning, feature engineering, validation | working, with offline tests |
| FastAPI service | working |
| M1 NegBin / M2 Logistic+LDA / M3 SARIMA | fitted; M3 covers all 51 cities |
| Composite demand score | built (`cds_ranking.csv`, `cds_sensitivity.csv`) |
| Frontend | **requirements-first planner + evidence explorer (React 18, Vite, Tailwind, Recharts)** |

**Universe:** `config/cities.yaml` defines 68 cities and every one has Vahan
registrations, but chargers, census, and petrol cover only 51. The build
analyses 51 by default and records the other 17 in
`data/processed/manifest.json` (`cities_without_covariates`); `--all` keeps
their registration rows with coverage flags.

**Sources:** 2021 comes from cached Vahan dashboard responses (`data/raw/vahan`),
2022-01 onward from the Vahan export. `panel_source` labels every row
(`dashboard_cache`, `vahan_export`, `imputed`). Nine cities were added to the
universe after 2021 and legitimately have no 2021 data; their 12 leading months
stay empty rather than back-filled.

## Run it

```bash
cd backend
pip install -r requirements.txt
python scripts/build_user_dataset.py     # builds the 51-city dataset
python scripts/run_api.py
```

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
npm run verify:scenario  # CDS parity + allocation invariants
```

The dashboard opens in **Plan rollout** mode: enter budget, charger target and
requirements to get a ranked deployment brief. The analytical views live under
**Explore the evidence**. It works without the API by falling back to bundled
snapshots.

Deliverables: [`backend/reports/final_report.md`](backend/reports/final_report.md) ·
[`backend/reports/final_deck.pptx`](backend/reports/final_deck.pptx) ·
[`backend/notebooks`](backend/notebooks).

Full documentation: [`backend/README.md`](backend/README.md) ·
Dataset dictionary: [`backend/data/USER_DATASET.md`](backend/data/USER_DATASET.md) ·
Source files: [`backend/data/source/README.md`](backend/data/source/README.md) ·
Vahan notes: [`backend/docs/VAHAN_NOTES.md`](backend/docs/VAHAN_NOTES.md)

## Principles

1. **No invented data.** Gaps stay gaps and are flagged. Every value traces to
   a file in `backend/data/source/` or a fetch in
   `backend/data/provenance/ledger.json`.
2. **Panel, not snapshot.** 51 cities is too few to classify; 51 cities × 57
   months is a dataset.
3. **Annotate, don't delete.** Outliers are flagged and winsorised, never
   silently dropped.
4. **Say when the data is stale.** Census is 2011, policy scores are
   provisional, chargers are one snapshot. Each carries its vintage in the
   schema.
