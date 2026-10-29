# EVision — Backend

City-level EV charging-demand analytics for India. Ingests Vahan registration
exports, builds a 51-city × month panel, engineers demand features, fits M1/M2/M3,
and serves the Charging Demand Score over HTTP.

```
EVision/
├── backend/     data, pipeline, models, API   ← this
└── frontend/    dashboard (placeholder)
```

## Quick start

```bash
cd backend
pip install -r requirements.txt

python scripts/build_user_dataset.py    # panel + features  (~30 s)
python scripts/build_master_panel.py    # merged analysis panel
python scripts/run_models.py            # M1 / M2 / M3 (all cities) / CDS
python scripts/make_map.py              # reports/cds_map.html
python scripts/run_api.py               # http://127.0.0.1:8000/docs
```

`build_vehicle_split.py` regenerates the measured 2W/3W/4W split from the Vahan
dashboard. It is optional — `run_models.py` uses the existing
`vehicle_split.csv` — and currently blocked because the dashboard rate-limits
this IP.

## Layout

```
config/
  cities.yaml            city universe + RTO codes + corridor flag
  city_coordinates.yaml  city centroids for the climate query
  vahan_codes.yaml       fuel/vehicle/state codes read off the dashboard
src/evision/
  config.py  http.py  provenance.py
  sources/    vahan, datagov, mospi, openmeteo
  pipeline/   userdata (build), clean (grid/impute/outliers), derive (growth), build_panel (split)
  models/     m1_count, m2_classify, m3_forecast, cds, split
  api/        FastAPI app
scripts/
  build_user_dataset.py  build_master_panel.py  run_models.py
  make_map.py  run_api.py  build_vehicle_split.py  check_rto_config.py
data/
  README.md      data map: what is input, cache, output
  source/        inputs, grouped by domain
    registrations/  supply/  demographics/  prices/  policy/  geo/
    _archive/       lineage-only files, never read by code
  raw/            upstream response cache (gitignored, regenerable)
  processed/      every output the pipeline writes
  provenance/     ledger.json
docs/VAHAN_NOTES.md
reports/cds_map.html
tests/
```

All data lives under `backend/data/`. There is no second `data/` at the repo root.

## Dataset

| | |
|---|---|
| Cities | **51 analysed / 68 configured** |
| Period | 2021-01 → 2026-09 (69 months; 9 late cities start 2022-01) |
| Rows | 3,519 city-months |
| Coverage | 96.9% observed (109 empty leading months), 0 imputed after filtering |
| Outliers flagged | 72 (kept, winsorised) |
| Negative stock months | 0 |
| Sources | 2021 `dashboard_cache`; 2022+ `vahan_export` |
| Vehicle split | 42 measured, 6 state-proxy, 3 national-proxy |

All 68 configured cities have registrations, but chargers, census, and petrol
cover only 51. The default build analyses those 51 and lists the other 17 in
`manifest.json`; `--all` keeps their registration rows with `has_chargers`,
`has_census`, and `has_petrol` flags set to false.

Full column dictionary: [`data/USER_DATASET.md`](data/USER_DATASET.md).
Source-file lineage: [`data/source/README.md`](data/source/README.md).

## Outputs

| File | Contents |
|---|---|
| `user_city_month_panel.csv` | city × month registrations + cleaning flags + derived columns |
| `user_city_features.csv` | one row per city, 73 columns |
| `master_ev_panel.csv` | the monthly panel joined to every city covariate, monthly petrol, and the effective demand ratios |
| `features_model.csv` | the above plus the 2W/3W/4W split columns |
| `vehicle_split.csv` | city × year × 2W/3W/4W/COMM |
| `model_m1_coefficients.csv` | driver IRRs (between-city NegBin) |
| `model_m1_sensitivity.csv` | with/without fuel price |
| `model_m1_policy_sensitivity.csv` | without the provisional policy score |
| `model_m1_demographics_sensitivity.csv` | 44 cities with verified demographics |
| `model_m2_comparison.csv` | Logistic vs LDA under repeated CV |
| `model_m2_sensitivity.csv` | policy and demographic variants |
| `model_m3_summary.csv` | per-city SARIMA vs Holt-Winters, quality flags |
| `model_m3_2022only.csv` | 2021-seam forecast sensitivity |
| `cds_ranking.csv` | 51-city Charging Demand Score |
| `cds_ranking_top15.csv` | deployment shortlist |
| `cds_sensitivity.csv` | weight-perturbation robustness |
| `manifest.json` | build metadata |

## Models

**M1a — drivers.** Negative binomial on one row per city (n=51). This is the only
specification where city-constant predictors are identifiable. Poisson
dispersion (657) justifies the NegBin upgrade.

**M1b — expected level.** Panel model with city fixed effects, used for the CDS
level. A pooled model without fixed effects over-predicted Kolkata by 18.6×
because it cannot separate Delhi (6,264/month) from Kolkata (217/month).

**M2 — classification.** Logistic and LDA with repeated stratified 5-fold CV.
Predictors are exogenous only; feeding EV stock or charger counts back in would
make the label a deterministic function of its own inputs.

**M3 — forecast.** SARIMA vs Holt-Winters, 9-month holdout (2026-01 → 2026-09),
constrained order grid with `d` from ADF. Fitted for every analysed city by
default; `--top-n N` restricts it. Series are scaled before fitting and
non-converged or implausible forecasts are rejected. `model_m3_summary.csv`
stores both `sarima_forecast_growth` and `hw_forecast_growth`, a
`forecast_quality` flag (`ok`/`weak`/`unstable`), and `holdout_rmse_rel`;
`forecast_growth` is the holdout winner used by the CDS. The CDS only consumes
forecasts flagged `ok`; the rest fall back to observed growth and say so in
`m3_source`.

**CDS.** `0.4·z(M1) + 0.3·P(high) + 0.3·z(M3 growth)`, with a weight-perturbation
table rather than an unqualified point estimate.

**Source-window sensitivity.** Adding the cached 2021 rows changes 4 of the
top 15 relative to a 2022+ panel: Agra, Aurangabad, Jabalpur and Rajkot leave;
Ahmedabad, Bhopal, Guwahati and Jaipur enter. The ranking is sensitive to the
window, so report the boundary rather than presenting one ranking as absolute.

## Deliverables

| Path | Contents |
|---|---|
| `reports/final_report.md` / `.docx` | full report |
| `reports/final_deck.pptx` | 11-slide deck |
| `reports/eda.md` | exploratory analysis |
| `reports/figures/` | report figures |
| `reports/model_metrics.md` | all M1/M2/M3/CDS metrics and confusion matrices |
| `reports/improvement_m1_m2.md`, `reports/improvement_m3.md` | before/after improvement experiments |
| `data/processed/model_m2_metrics.csv`, `model_m2_confusion.csv`, `model_m3_metrics.csv` | metric tables |
| `reports/seam_2021_2022.csv` | Dec-2021 → Jan-2022 diagnostics |
| `notebooks/01_eda.ipynb` … `05_cds_hotspots.ipynb` | executed analysis notebooks |

## Verification status

- **Policy:** 30 states, `policy_verified = false`, rubric columns blank. Run
  `scripts/verify_policy_scores.py` on a connected machine; it writes an
  evidence table with page and snippet. Nothing is auto-adopted.
- **Demographics:** all 51 populations are now verified against Census 2011
  city/MC figures with a cited area. Seven cities (Chandigarh, Guwahati, Mysuru,
  Bhubaneswar, Dehradun, Gurugram, Noida) use municipal/census-town boundaries
  rather than urban agglomerations; `boundary_harmonised = false`. The 44-city
  sensitivity is in `model_m1_demographics_sensitivity.csv` and
  `model_m2_sensitivity.csv` (`harmonised_demographics`).
- **Corridor:** the flag lives in `config/cities.yaml` (`corridor: 0/1`) and is
  carried as `highway_corridor`.

## API

| Endpoint | Contents |
|---|---|
| `/health` `/meta` `/provenance` | status and lineage |
| `/cities` `/panel` `/registrations/{city}` | panel access |
| `/stats` | descriptive statistics + city z-scores |
| `/features` `/chargers` `/demand` | feature table and the gap metric |
| `/forecasts` | per-city 12-month forecast |
| `/hotspots?top=15` | the CDS ranking |

## Principles

1. **No invented data.** Gaps stay gaps and are flagged. Every input traces to
   `data/source/`.
2. **Annotate, don't delete.** Outliers are flagged and winsorised beside the raw
   value.
3. **Say how a value was derived.** `split_method` records measured vs state-proxy
   vs national-proxy; the manifest records coverage.
4. **State the vintage.** Census 2011, chargers one snapshot, policy scores
   provisional — each is a column, not a footnote.

## Known limitations

- **Vahan's fuel/vehicle-class checkbox filters are ignored** by the dashboard.
  EV counts come from pivoting on `yaxisVar=Fuel` — see `docs/VAHAN_NOTES.md`.
- **RTO codes are unpadded** (`DL1`, not `DL-01`); `canonical_rto_code()` is the
  single place that reconciles it.
- **Chargers are a single snapshot** with a radius that varies 15–30 km by city.
  The charger/EV ratio cannot be tracked over time.
- **Policy scores are provisional** — `score_source` says "not read from policy
  PDF" for all 30 states. The BEE policy host was unreachable from the build
  environment; run `scripts/verify_policy_scores.py` where it is reachable.
- **9 cities carry a proxied vehicle split**, not a measured one.

## Configuration

Copy `.env.example` to `.env`:

```
EVISION_USER_DATA=backend/data/source
EVISION_DATA_GOV_API_KEY=...
EVISION_REQUEST_DELAY=1.5
```
