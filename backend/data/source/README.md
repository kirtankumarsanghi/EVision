# Source data

Every input the pipeline reads lives here, grouped by domain. Nothing in
`data/processed/` is a source; it is all regenerable output.

```
source/
├── registrations/   Vahan fuel / category / class exports
├── supply/          charger circles, station snapshot, state PCS totals, PDF
├── demographics/    Census 2011 + 2023 estimates
├── prices/          city x month petrol
├── policy/          state EV policy scores
├── geo/             state polygons for the choropleth
└── _archive/        lineage-only files (not read by any code)
```

## Active inputs

| Path | Role | Read by |
|---|---|---|
| `registrations/vehicle-registrations-by-fuel-type.csv` | RTO × month × fuel; EV counts | `userdata.load_ev_monthly` |
| `registrations/registrations-by-vehicle-category.csv` | total registrations by category | `market.load_market_monthly` |
| `registrations/registrations-by-vehicle-class.csv` | transport vs non-transport | `market.load_class_monthly` |
| `supply/city_chargers.csv` | one charging circle per city, radius 15–30 km | `userdata.load_chargers` |
| `supply/stations_clean.csv` | 29,070 station records with distance from the city centre | `supply.load_supply_metrics` |
| `supply/state_chargers_from_pdf.csv` | state/UT charger totals (36 rows) | `supply.load_state_chargers` |
| `demographics/city_population_density.csv` | Census 2011 population/area + 2023 estimate | `userdata.load_population` |
| `prices/city_month_petrol_51.csv` | city × month petrol price | `userdata.load_petrol` |
| `policy/state_ev_policy_scores.csv` | provisional state policy scores | `userdata.load_policy` |
| `geo/india_state.geojson` | state shapes for the choropleth | `scripts/make_map.py` |

## Archive (lineage only — no code reads these)

| Path | Relation |
|---|---|
| `supply/EV_PCS_Data_29277.pdf` | source of `supply/state_chargers_from_pdf.csv` |
| `_archive/state_petrol_snapshots.csv` | observed state snapshots (Oct/Feb) |
| `_archive/state_month_petrol.csv` | state monthly prices modelled from the snapshots |
| `_archive/ev_final.xlsx` | 2,705 station records (Delhi-area sample), superseded by `supply/stations_clean.csv` |

Chain: `_archive/state_petrol_snapshots.csv` →
`_archive/state_month_petrol.csv` → `prices/city_month_petrol_51.csv`.

## Two counts that must not be conflated

- `supply/stations_clean.csv` contains **29,070 station records** from the
  E-Amrit extract. That is not a headcount of unique public charging stations
  nationwide (commonly quoted around 12,000 for an earlier vintage). Report the
  definition and vintage with either number.
- `supply/city_chargers.csv` collapses the extract into one circle per city.
  Because the radius varies 15–30 km, its counts are not comparable across
  cities; use `stations_5km` / `stations_10km` from `supply/stations_clean.csv`.

## Coverage gaps

- The Vahan fuel export starts in **2022-01**. 2021 is recovered from the
  dashboard-response cache in `data/raw/vahan` (118 offices, 59 cities) and
  labelled `panel_source = dashboard_cache`.
- Nine analysed cities were added to the universe after 2021 and have no cached
  2021 responses: Allahabad/Prayagraj, Faridabad, Ghaziabad, Gurugram,
  Jamshedpur, Jodhpur, Kota, Noida, Srinagar. Their leading 12 months are empty.
- Chargers, census, and petrol cover the same **51** cities. The other 17
  configured cities have registrations only, and are flagged in the build
  output rather than dropped silently.

## Verification status

- **Policy:** all 30 state scores are `policy_verified = false`. The four rubric
  columns are blank and the score is provisional. `scripts/verify_policy_scores.py`
  downloads the 28 available policy PDFs and writes an evidence table with page
  and snippet; it does not overwrite the scores.
- **Demographics:** all 51 populations are verified against Census 2011
  city/MC figures with a cited area. Seven use municipal/census-town boundaries
  (`boundary_harmonised = false`): Chandigarh, Guwahati, Mysuru, Bhubaneswar,
  Dehradun, Gurugram, Noida. The other 44 are urban agglomerations.
- **Highway corridor:** the flag is not a data file; it lives in
  `config/cities.yaml` (`corridor: 0/1`) and is carried as `highway_corridor`.
