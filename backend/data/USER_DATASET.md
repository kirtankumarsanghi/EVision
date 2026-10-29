# Merged dataset — dictionary and gap status

Built from `backend/data/source/` (your collection) by
`backend/scripts/build_user_dataset.py`.
Regenerate any time with:

```bash
cd backend
python scripts/build_user_dataset.py
```

---

## `user_city_month_panel.csv`

**3,519 rows — 51 cities × 69 months, 2021-01 → 2026-09. 96.9% observed.**

The build configures 68 cities and all of them have registrations. Chargers,
census, and petrol cover only 51, so the other 17 are excluded by default and
listed in `manifest.json` under `cities_without_covariates`. `--all` keeps
their rows and marks the missing inputs.

**Mixed sources.** 2021 is assembled from cached Vahan dashboard responses
(`data/raw/vahan`); 2022-01 onward comes from the Vahan export. `panel_source`
records which. Nine cities (Allahabad/Prayagraj, Faridabad, Ghaziabad,
Gurugram, Jamshedpur, Jodhpur, Kota, Noida, Srinagar) were added to the universe
after 2021 and have no cached 2021 responses; their 12 leading months are empty
rather than back-filled. That accounts for the 109 unobserved rows.

| Column | Source | Meaning |
|---|---|---|
| `city` | config + RTO map | analysis city |
| `state_code` | config | 2-letter state code |
| `date` | derived | first of month |
| `year`, `month` | derived | calendar parts |
| `ev_registrations` | export + 2021 cache | monthly EV counts, summed over the city's RTOs |
| `panel_source` | derived | `dashboard_cache` (2021), `vahan_export` (2022+), `imputed`, or empty |
| `non_ev_registrations` | derived | `total_registrations − ev_registrations` where market data exists |
| `observed` | derived | false where no row existed upstream |
| `gap_length` | derived | length of the missing run |
| `imputed` | derived | linear interpolation, gaps ≤ 2 months only |
| `iqr_lower`, `iqr_upper` | derived | per-city IQR fence |
| `is_outlier` | derived | outside the fence — **flagged, never deleted** |
| `ev_registrations_winsorised` | derived | clipped to the fence |
| `ev_stock` | derived | cumulative EV registrations |
| `mom_growth`, `yoy_growth` | derived | month-on-month / year-on-year % |
| `roll_3m_mean` | derived | 3-month rolling mean |
| `stock_delta`, `stock_regression` | derived | increment; `stock_regression` should always be false |

**EV definition:** `Electric(BOV)` + `Pure EV`. Vahan migrated records between
the two labels during 2024; using only one makes the series appear to collapse
mid-year. This is the single easiest way to get a wrong answer from this data.

**RTO mapping:** 129 RTO codes map to the 51 cities via `config/cities.yaml`.
Codes are matched unpadded (`DL1`, not `DL-01`).

---

## `master_ev_panel.csv`

**3,519 rows × 112 columns — the analysis-ready merge.**

Built by `scripts/build_master_panel.py`. It joins:

- `user_city_month_panel.csv` (registrations, cleaning flags, growth, market),
- every city-level feature from `user_city_features.csv` (chargers, fixed-radius
  supply, census, policy, income, climate, split, coverage flags),
- monthly petrol on `city` + `date`,
- derived monthly ratios `ev_to_charger_ratio_monthly` and
  `ev_per_fast_10km_monthly`,
- `effective_public_demand` and `effective_public_demand_10km`.

Cleaning is inherited, not repeated: **72** IQR outliers are flagged and
winsorised, **0** values are imputed after filtering, and the **109** leading
months for the nine late cities stay empty. `effective_public_demand` is
non-null for **2,898** city-months (42 cities with a measured split).

The charger denominator is one snapshot, so the demand ratios are
cross-sectional and constant within a city — they are not a monthly supply
series.

---

## `user_city_features.csv`

**51 rows × 73 columns — one row per city.**

### Volume and momentum
| Column | Meaning |
|---|---|
| `months_observed` | months with an actual observation |
| `ev_total_registrations` | cumulative EVs 2021-01 → 2026-09 (nine late cities start 2022-01) |
| `avg_monthly_registrations` | mean monthly EVs |
| `ev_stock` | cumulative EVs at `latest_month` |
| `latest_month`, `latest_month_registrations` | last observation |
| `ev_last_12m`, `ev_prev_12m` | trailing 12-month flow |
| `growth_12m` | `(last12 − prev12) / prev12` — the momentum feature |

### Supply side
| Column | Source | Meaning |
|---|---|---|
| `stations_within_radius` | `supply/city_chargers.csv` | public stations within the city radius |
| `connectors` | same | total connectors |
| `fast_stations` | same | stations with ≥1 fast connector |
| `share_fast_pct` | same | % of stations that are fast |
| `radius_km` | same | radius used (15–30 km, varies by city) |
| `ev_to_charger_ratio` | derived | `ev_stock / stations_within_radius` |
| `connectors_per_charger` | derived | connectors per station |
| `state_stations`, `state_connectors`, `state_fast_stations` | `supply/state_chargers_from_pdf.csv` | state-level fallback — **not a city figure** |
| `state_charger_source` | same | snapshot label for the fallback |
| `charger_scope` | derived | `city` when a city circle exists, otherwise `state` |

### Demographics and drivers
| Column | Source | Vintage |
|---|---|---|
| `pop_2011`, `area_km2_2011` | `demographics/city_population_density.csv` | **Census 2011** |
| `population_density` | same | **2011** |
| `pop_estimate_2023` | same | 2023 (Demographia or projection) |
| `boundary_type` | same | agglomeration vs municipal limit — **read this** |
| `demographic_verified` | same | false for the seven user-supplied rows |
| `fuel_price_inr_per_litre` | `prices/city_month_petrol_51.csv` | latest month |
| `fuel_price_date` | same | which month |
| `ev_policy_score` | `policy/state_ev_policy_scores.csv` | 1–3, **provisional** |
| `policy_status` | same | Notified / Draft |
| `policy_verified` | same | whether the PDF was read (all false) |
| `verification_status` | same | reason the score is unverified |
| `highway_corridor` | manual coding | 1 if on a major NH corridor |
| `tier` | config | metro / tier2 |
| `summer_max_temp_c` | Open-Meteo ERA5 | Apr–Jun mean daily max |
| `temperature_year` | same | year used |
| `temperature_source` | — | IMD substitute, see note below |
| `per_capita_income_inr` | MOSPI NSDP (data.gov.in) | 2022-23 |
| `income_vintage` | — | which year |

### EV split (partial)
| Column | Meaning |
|---|---|
| `weighted_ev_stock` | `0.15·2W + 0.70·3W + 1.00·4W + 0.60·COMM` |
| `commercial_fleet_share` | 3W share of EV registrations (e-fleet proxy) |
| `effective_public_demand` | `weighted_ev_stock / stations_within_radius` |
| `vehicle_split_year` | year the split reflects |

**42 of 51 cities have this. The 9 missing are the cities added to the
universe late** (Allahabad, Faridabad, Ghaziabad, Gurugram, Jamshedpur,
Jodhpur, Kota, Noida, Srinagar). The split comes from the dashboard scraper
(`vehicle_split.csv`), which needs a fuel × vehicle-category cross-tab. Your
fuel and category exports are separate files and cannot be crossed. Leave null
rather than approximate — a state-level proxy would be an assumption, not data.

### Coverage flags
| Column | True when |
|---|---|
| `has_chargers` | a city charger circle exists (`stations_within_radius` present) |
| `has_census` | `pop_2011` is present |
| `has_petrol` | `fuel_price_inr_per_litre` is present |
| `has_policy` | `ev_policy_score` is present |
| `demographic_verified` | population/area was checked against a cited source |
| `boundary_harmonised` | true for the 44 urban-agglomeration rows, false for the 7 municipal rows |
| `policy_verified` | the policy score was read from the policy PDF |

All `has_*` are true in the default 51-city build. They exist so an `--all` run
cannot present an imputed or absent input as if it were observed.

**Verification status**

- **Demographics:** all 51 populations are verified against Census 2011
  city/MC figures with a cited area (`demographic_verified = true`). Seven —
  Chandigarh, Guwahati, Mysuru, Bhubaneswar, Dehradun, Gurugram, Noida — use
  municipal/census-town boundaries while the other 44 use urban agglomerations;
  those seven carry `boundary_harmonised = false`.
- **Policy:** all 30 states are `policy_verified = false`; the rubric columns are
  blank and `score_source` says the PDF was not read. The BEE host was
  unreachable from the build environment; run
  `scripts/verify_policy_scores.py` where it is reachable to produce
  `policy_evidence.csv` with page and snippet per flag.

---

## Status of the seven open items

| # | Item | Status |
|---|---|---|
| 1 | EV split 2W/3W/4W | **42/51 done.** 9 null — needs a fuel × category cross-tab; dashboard is rate-limiting us |
| 2 | Summer max temperature | **Done, 51/51.** Open-Meteo ERA5, Apr–Jun mean daily max. IMD has no machine-readable endpoint |
| 3 | State GDP per capita | **Done, 51/51.** MOSPI per-capita NSDP, 2022-23 |
| 4 | Highway corridor flag | **Done, 51/51.** In `config/cities.yaml` (`corridor`) |
| 5 | India shapefile | **Done.** `backend/data/source/geo/india_state.geojson`, 35 states, key `NAME_1` |
| 6 | Policy rubric columns | **Still blank.** `score_used` is provisional; the four rubric columns are empty |
| 7 | 7 added cities' population | **Still flagged.** Your file marks them `User-supplied, not yet verified` |

---

## Limitations to carry into the report

1. **Chargers are a single snapshot.** No install dates, so the
   "is EV-to-charger improving over time?" question cannot be answered.
   Replace it with a cross-city comparison.
2. **Charger boundary ≠ population boundary ≠ registration boundary.**
   Chargers are counted within a radius, population is a Census urban
   agglomeration, registrations are RTO areas. These three footprints do not
   coincide; say so.
3. **Fuel prices are modelled for most cities.** Only four metros are observed;
   the rest are snapshot-interpolated. `price_basis` in
   `prices/city_month_petrol_51.csv` marks which.
4. **Policy scores are provisional.** `score_source` says
   "provisional (not read from policy PDF)" for all 30 states.
5. **Two states are split across the data vintage.** Delhi's `growth_12m` is
   negative (−4.3%) which is worth checking before it goes in a model.
6. **Source boundary at 2022-01.** 2021 comes from the dashboard cache, 2022+
   from the export. Including 2021 changes 4 of the CDS top 15 (Agra,
   Aurangabad, Jabalpur, Rajkot out; Ahmedabad, Bhopal, Guwahati, Jaipur in).
   State which window a result uses.

---

## Cross-check against an independent extraction

An earlier scraper run pulled the same Vahan data directly from the dashboard for
2021–2026 (70 months). Comparing the two:

| City | Scraper (70 months, 2021–26) | This dataset (69 months, 2021–26) |
|---|---|---|
| Bengaluru | 462,367 | 439,450 |
| Delhi | 450,220 | 393,763 |
| Pune | 265,902 | 259,189 |

Adding the cached 2021 rows narrows the gap but does not close it. The residual
is not fully reconciled; the scraper window and office coverage differ slightly.
Treat cross-source totals as approximate and use one source per analysis.
