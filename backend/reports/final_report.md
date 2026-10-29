# EVision — Public EV charging demand and hotspot ranking

**Prepared from the processed outputs in `backend/data/processed/`.**
**Panel:** 3,519 city-months · 51 cities · January 2021 – September 2026.
**Models:** M1 negative binomial, M2 logistic/LDA, M3 SARIMA/Holt-Winters, CDS.

---

## Executive summary

India's public charging network is thin relative to the vehicle fleet, and the
gap is unevenly distributed. Charge Point Operators need to decide where the
next tranche of chargers should go. The obvious metric — total EVs divided by
total chargers — is misleading, because personal two-wheelers mostly charge at
home while commercial three-wheelers and four-wheelers depend on public
infrastructure. EVision replaces that ratio with a weighted demand measure and
ranks cities by a composite Charging Demand Score.

The analysis covers **51 cities** and **3,519 city-months** from January 2021 to
September 2026. Of the 68 configured cities, 51 have the full covariate set;
the other 17 have registrations but no city-level chargers, census, or petrol
and are excluded by default. The panel is **96.9% observed**. Nine cities were
added to the universe after 2021 and have no cached 2021 responses, which
accounts for 108 of the 109 empty rows; the remaining row is a long interior
gap. No values are imputed after filtering and 72 IQR outliers are flagged and
winsorised rather than dropped.

The four model outputs are:

- **M1 (drivers):** non-EV market size is the dominant correlate of monthly EV
  registrations (IRR 2.72, p < 0.001). Income is negative (IRR 0.56), which is
  consistent with early adoption concentrating in younger, higher-density
  markets but is not a causal estimate. The provisional policy score is
  positive (IRR 1.35, p = 0.001) but rests on unverified scores.
- **M2 (classifier):** logistic regression and LDA separate High from Low
  demand with cross-validated AUC of 0.822 and 0.818 respectively. The
  train–CV gap is about 0.06, and leave-one-out accuracy is 76.5–78.4%. There is
  no label leakage: EV stock, chargers, and growth are excluded.
- **M3 (forecasts):** all 51 cities are forecast with SARIMA or Holt-Winters;
  28 cities select SARIMA and 23 select Holt-Winters. Every forecast passes a
  holdout quality gate after the numerical fix described in Section 8.
- **CDS:** Bengaluru, Jaipur, Delhi, Pune and Rajkot lead the ranking. Two cities
  are Critical and two High. The top-15 shortlist is stable under weight
  perturbations (14–15 of 15 cities retained).

The main caveats are data-bound: policy scores are unverified, seven cities use
municipal boundaries rather than urban agglomerations (their populations are now
verified), eight cities show a large 2021→2022 level step, and chargers are a
single snapshot. Section 11 lists them
and Section 12 gives the order in which to close them.

---

## 1. Introduction

### 1.1 The siting problem

India has millions of registered EVs and a public charging network that is both
small and unevenly distributed. The policy question is not whether to build
chargers but where the next ones should go. A CPO choosing between Patna,
Bhubaneswar and Nashik needs a defensible ordering, not an anecdote.

### 1.2 Why a raw EV-per-charger ratio fails

A two-wheeler owner typically charges at home or at work. A three-wheeler
operator and a four-wheeler fleet rely on public charging. A city with a large
two-wheeler fleet and few chargers can therefore look "underserved" on a raw
ratio while having little public demand. The effective-demand metric weights
the fleet by its reliance on public infrastructure, then divides by the
comparable charger count.

### 1.3 What this project delivers

EVision provides: a reproducible 2021–2026 city × month panel; a documented
source lineage; a weighted demand metric; three statistical models; a composite
score; a choropleth; and a shortlist. The code is organised so that each output
can be regenerated from the source files and tested offline.

---

## 2. Objectives and scope

The five objectives are:

1. **Quantify effective public demand** with 2W/3W/4W weights.
2. **Identify adoption drivers** with a negative binomial count model.
3. **Classify High/Low demand** with logistic regression and LDA.
4. **Forecast 12-month growth** per city with SARIMA (Holt-Winters as the
   holdout baseline).
5. **Synthesise and rank hotspots** with a Charging Demand Score and an
   interactive India map.

Scope: 51 cities with covariates (68 configured), monthly data from January
2021 to September 2026, and 2W/3W/4W segmentation where measured. Street-level
siting, private home chargers, and battery swapping are out of scope.

---

## 3. Data and provenance

### 3.1 Inputs

| Input | Rows | Grain | Role |
|---|---:|---|---|
| `registrations/vehicle-registrations-by-fuel-type.csv` | 563,642 | RTO × month × fuel | EV registrations (`Electric(BOV)` + `Pure EV`) |
| `registrations/registrations-by-vehicle-category.csv` | 577,339 | RTO × month × category | total market and 2W/3W/4W mix |
| `registrations/registrations-by-vehicle-class.csv` | 870,785 | RTO × month × class | transport vs non-transport |
| `supply/city_chargers.csv` | 51 | city | 15–30 km charger circle |
| `supply/stations_clean.csv` | 29,070 | station | fixed 5/10 km supply |
| `supply/state_chargers_from_pdf.csv` | 36 | state | labelled fallback |
| `demographics/city_population_density.csv` | 51 | city | Census 2011 + 2023 estimate |
| `prices/city_month_petrol_51.csv` | 3,570 | city × month | petrol price |
| `policy/state_ev_policy_scores.csv` | 30 | state | provisional policy score |
| `geo/india_state.geojson` | 35 polygons | state | choropleth |

The three registration files all have a column called `registration_type`, but
it means different things: **fuel** in the fuel export, **vehicle category** in
the category export, and **vehicle class** in the class export. Misreading that
is the easiest way to get a wrong answer from this data.

### 3.2 The 2021/2022 source seam

The Vahan export starts in February 2022. January–December 2021 is recovered
from cached dashboard responses and labelled `panel_source = dashboard_cache`;
2022 onward is `vahan_export`. This is a source boundary, not a continuous
series. Nine cities were added to the universe after 2021 and have no cached
responses; their 12 leading months are left empty rather than back-filled.

The seam is visible. Comparing December 2021 with January 2022 for the 42
cities with both months, the median ratio is 1.00, but **eight cities move by
more than 1.5×**:

| City | Dec 2021 | Jan 2022 | Month ratio | 2021→2022 level ratio |
|---|---:|---:|---:|---:|
| Guwahati | 14 | 87 | 6.21 | 20.20 |
| Jabalpur | 44 | 97 | 2.21 | 7.71 |
| Vijayawada | 51 | 91 | 1.78 | 2.13 |
| Kozhikode | 56 | 97 | 1.73 | 4.09 |
| Thiruvananthapuram | 60 | 99 | 1.65 | 6.76 |
| Coimbatore | 90 | 140 | 1.56 | 3.55 |
| Tiruchirappalli | 49 | 74 | 1.51 | 2.75 |
| Rajkot | 298 | 120 | 0.40 | 4.27 |

Guwahati's 6.2× step and 20× level change indicate a thin 2021 cache, not a
genuine one-month surge. The 2022-only M3 sensitivity is reported in Section 8.5.

### 3.3 Coverage and the 68/51 distinction

`config/cities.yaml` defines 68 cities and every one has registrations.
Chargers, census, and petrol cover only 51. The build analyses 51 by default
and records the other 17 in `manifest.json` under
`cities_without_covariates`. The nine cities without 2021 data are recorded
separately under `cities_without_2021`. The distinction matters because the
109 dropped model rows are **not** the 17 excluded cities; they are 108 leading
2021 months plus one long gap.

### 3.4 Definitions and vintage

- **EV:** `Electric(BOV)` plus `Pure EV`. Vahan migrated labels during 2024;
  using one alone makes the series collapse mid-year.
- **Chargers:** `stations_clean.csv` contains 29,070 station records, not a
  headcount of unique public stations nationwide. Report the definition with the
  number.
- **Supply comparability:** the city circle radius varies 15–30 km. The fixed
  10 km count is the comparable measure; the circle count is retained only as a
  legacy feature.
- **Petrol:** only a few metros are observed; most city prices are modelled from
  state snapshots. The `price_basis` column says which.
- **Policy:** 30 states, all provisional, rubric columns blank.
- **Demographics:** all 51 populations are verified against Census 2011 city/MC
  figures with a cited area. 44 use urban-agglomeration boundaries; seven
  (Chandigarh, Guwahati, Mysuru, Bhubaneswar, Dehradun, Gurugram, Noida) use
  municipal/census-town boundaries.

Every fetch is recorded in `provenance/ledger.json` with URL, timestamp, row
count, and checksum.

![Observed coverage](figures/coverage.png)

![National trend](figures/national_trend.png)

---

## 4. Cleaning and feature engineering

### 4.1 Panel construction

The pipeline maps 129 printed RTO codes to 51 cities, sums EV registrations to
city × month, and reindexes onto a complete city × month grid. Gaps become
explicit `NaN` rows with `observed = false` rather than disappearing.

### 4.2 Missing values

Gaps of at most two months are linearly interpolated and marked `imputed`.
Longer gaps stay empty. No imputation survives into the 51-city analysis after
filtering, which is why `imputed_months = 0` in the final manifest. Missing
covariates are never filled with synthetic values; they are carried as `NaN`
and flagged.

### 4.3 Outliers

Outliers are detected per city with an IQR fence. When the IQR is degenerate
(common in small, flat series), the fence falls back to 0.25×–4× the median.
Outliers are flagged and winsorised in a separate column; the raw value is
preserved. **72 city-months** are flagged and none are deleted.

### 4.4 Derived features

The panel carries cumulative stock, month-on-month and year-on-year growth, a
three-month rolling mean, and stock-delta regressions. Market context adds total
registrations, transport/non-transport split, EV share of new sales, and
2W/3W/4W market shares.

Supply features come in two forms: the legacy 15–30 km circle and fixed 5/10 km
counts of stations, connectors, fast chargers, CPOs, and 90th-percentile power.
Demand ratios use the weighted stock divided by each denominator.

### 4.5 Coverage flags

`has_chargers`, `has_census`, `has_petrol`, and `has_policy` make a missing
input visible. `demographic_verified` and `policy_verified` record whether the
underlying source was checked. These flags prevent an absent or unverified input
from being read as observed.

### 4.6 Master panel

`master_ev_panel.csv` is the analysis-ready merge: **3,519 × 115**. It joins the
monthly panel to every city covariate, monthly petrol, and both demand ratios.
It is the single table used for descriptive work; the model scripts keep their
own narrower inputs.

---

## 5. Objective 1 — effective public demand

The metric is:

```
effective_public_demand = weighted_ev_stock / public_chargers
weighted_ev_stock = 0.15·2W + 0.70·3W + 1.00·4W + 0.60·COMM
```

The weights reflect reliance on public charging: two-wheelers mostly charge at
home, three-wheelers and four-wheelers rely on public points, and commercial
fleets sit in between. The comparable denominator is `stations_10km`; the
variable-radius circle is kept as `effective_public_demand` for continuity.

The split is measured for 42 cities, proxied from the state mix for 6, and from
the national mix for 3. A proxy is an estimate, not an observation, and
`split_method` travels with every row.

Highest effective demand per charger (fixed 10 km):

| City | EV stock | Stations within radius | Effective demand |
|---|---:|---:|---:|
| Patna | 76,429 | 25 | 390.3 |
| Lucknow | 137,931 | 58 | 304.4 |
| Meerut | 45,116 | 17 | 287.3 |
| Kanpur | 81,074 | 39 | 230.2 |
| Jabalpur | 47,220 | 26 | 201.1 |
| Bhubaneswar | 87,173 | 55 | 175.5 |
| Indore | 97,271 | 57 | 151.2 |
| Guwahati | 33,706 | 58 | 146.2 |
| Mysuru | 49,356 | 64 | 130.3 |
| Raipur | 75,344 | 56 | 123.0 |

These are supply-constrained cities: the numerator is meaningful only because
the denominator is small. That is precisely the siting signal, but it also
means the metric is sensitive to charger-count errors. The snapshot nature of
the charger data is the main limitation.

![Demand vs supply](figures/demand_vs_supply.png)

---

## 6. Objective 2 — adoption drivers (M1)

### 6.1 Two specifications

M1a aggregates to one row per city (n=51) and regresses mean monthly EV
registrations on city characteristics. This is the only specification in which
city-constant predictors are identifiable. M1b is a panel model with city fixed
effects and month dummies; it supplies the expected level used by the CDS. A
pooled model without fixed effects over-predicted Kolkata by 18× because it
cannot separate Delhi from a much smaller market.

### 6.2 Results

| Term | IRR | p-value |
|---|---:|---:|
| Non-EV market size (log) | 2.72 | < 0.001 |
| Per-capita income (log) | 0.56 | < 0.001 |
| Policy score (provisional) | 1.35 | 0.001 |
| Population density (log) | 0.80 | 0.054 |
| Population (log) | 1.10 | 0.31 |
| Fuel price | 1.01 | 0.15 |
| Summer temperature | 0.98 | 0.24 |
| Highway corridor | 0.94 | 0.70 |

### 6.3 Interpretation

Market size is the strongest correlate: a 1% larger non-EV market is associated
with a 2.7% higher EV registration rate. The negative income coefficient is
counterintuitive if read as "richer cities buy fewer EVs"; it more likely picks
up the age structure of the vehicle fleet, the availability of shared mobility,
and the fact that several high-income metros were early adopters with a
different mix. It should not be read causally.

The policy coefficient is positive but rests on provisional scores. The fuel
coefficient is effectively a time trend: most city prices are the Delhi series
multiplied by a constant, so the variable has little independent variation.

### 6.4 Sensitivity

- **Without fuel:** market IRR 2.64 (p < 0.001), income 0.61 (p < 0.001), policy
  1.28 (p = 0.056). The headline findings do not depend on the fuel term.
- **Without policy:** market IRR 2.54 (p < 0.001), income 0.64 (p < 0.001),
  density 0.81 (p = 0.23). The policy term is not carrying the model.
- **Verified demographics only (n=44):** market IRR 3.03 (p < 0.001), income
  0.59 (p < 0.001), density 0.70 (p = 0.005), policy 1.21 (p = 0.066). The
  density coefficient strengthens and becomes significant when the seven
  municipal-boundary rows are removed.

### 6.5 Limitations

n=51 limits the number of predictors; the model is a description, not a causal
design. City-constant predictors cannot be estimated in the fixed-effects panel,
which is why M1a and M1b answer different questions.

---

## 7. Objective 3 — High/Low demand classifier (M2)

### 7.1 Label

A city is High demand if its `effective_public_demand_10km` is above the sample
median. The label is derived from EV stock and charger counts, so those
variables cannot be predictors.

### 7.2 Predictors and leakage

Predictors are exogenous: log density, log income, fuel price, policy score,
highway corridor, and summer temperature. EV stock, charger counts, and growth
are excluded. A regression test asserts that none of the forbidden variables
enters `EXOGENOUS`.

### 7.3 Validation

With 51 rows a single 70/30 split leaves about 15 test rows, where AUC has a
confidence interval of roughly ±0.25. The model therefore uses repeated
stratified 5-fold cross-validation (20 repeats) and reports the spread, plus
leave-one-out accuracy as a second view. The in-sample AUC is reported only to
expose the optimism gap.

### 7.4 Results

| Model | AUC mean | SD | p05–p95 | Accuracy | LOOCV | Train–CV gap |
|---|---:|---:|---|---:|---:|---:|
| Logistic | 0.822 | 0.136 | 0.600–1.000 | 0.765 | 0.765 | 0.061 |
| LDA | 0.818 | 0.138 | 0.600–1.000 | 0.768 | 0.784 | 0.059 |

The two models are statistically indistinguishable at this sample size. LDA has
slightly better leave-one-out accuracy; logistic is easier to interpret. Neither
justifies reporting a single AUC without the spread.

### 7.5 Sensitivity

Dropping the provisional policy score improves CV AUC to 0.837 (LDA) and 0.832
(logistic). Restricting to the 44 boundary-harmonised cities raises AUC to 0.896
and 0.892. The second result is expected: the seven excluded rows use municipal
boundaries rather than urban agglomerations, which adds noise to density. The
first is evidence that the provisional policy score is not adding signal.

### 7.6 Interpretation

The classifier is a screening tool, not a decision rule. With n=51, a city near
the median can move between classes under small changes. The CDS uses the
probability rather than the binary class.

---

## 8. Objective 4 — 12-month forecasts (M3)

### 8.1 Method

Each city's monthly EV series is fitted with SARIMA and Holt-Winters. The last
nine months are held out (January–September 2026); the better model is refit on
the full series and forecast 12 months ahead. SARIMA orders are searched over a
constrained grid with `d` from an ADF test and seasonal differencing fixed at
one.

### 8.2 Numerical stability

An earlier run produced non-converged SARIMA fits with holdout RMSE around
1e29–1e84 for Jaipur, Mysuru, Indore, Dehradun, Kolkata, and Visakhapatnam.
Those forecasts were unusable. The fix is to fit each series on a scaled copy
(divided by its mean), reject non-converged fits, and reject any forecast that
is non-finite or more than 10× the training maximum. After the fix, all 51
cities produce finite forecasts and pass the quality gate.

### 8.3 Quality gate

Each city carries `holdout_rmse_rel` (holdout RMSE divided by the nine-month
holdout total) and `forecast_quality` (`ok` if ≤0.5, `weak` if ≤1.0, else
`unstable`). The maximum relative RMSE is 0.086, so all 51 are `ok`.

### 8.4 Results

| City | Winner | Last 12m | Forecast 12m | Growth | RMSE/level |
|---|---|---:|---:|---:|---:|
| Jaipur | Holt-Winters | 30,456 | 63,996 | 1.101 | 0.051 |
| Rajkot | SARIMA | 8,300 | 15,780 | 0.901 | 0.052 |
| Bhubaneswar | SARIMA | 36,036 | 60,525 | 0.680 | 0.049 |
| Guwahati | Holt-Winters | 14,543 | 24,258 | 0.668 | 0.044 |
| Pune | Holt-Winters | 67,754 | 107,179 | 0.582 | 0.044 |
| Madurai | SARIMA | 5,455 | 8,585 | 0.574 | 0.054 |
| Gurugram | SARIMA | 3,238 | 5,055 | 0.561 | 0.086 |
| Srinagar | SARIMA | 3,092 | 4,780 | 0.546 | 0.046 |
| Nashik | SARIMA | 29,344 | 45,007 | 0.534 | 0.038 |
| Noida | SARIMA | 22,049 | 33,496 | 0.519 | 0.025 |
| Vadodara | Holt-Winters | 11,872 | 17,612 | 0.484 | 0.051 |
| Coimbatore | Holt-Winters | 10,769 | 15,784 | 0.466 | 0.025 |

SARIMA wins 28 cities and Holt-Winters 23. The table carries both forecasts for
every city, so the SARIMA objective is satisfied even where Holt-Winters wins
the holdout.

### 8.5 The 2021 seam and forecast sensitivity

Refitting M3 on the 2022-only panel changes forecast growth by a median of
0.033. The largest moves are Bhopal +0.41, Guwahati −0.26, Rajkot −0.26, Pune
−0.24, and Agra +0.20. For cities with a large 2021→2022 step (Guwahati,
Jabalpur, Rajkot), the 2022-only forecast is the more defensible one. The full
sensitivity is in `model_m3_2022only.csv`.

### 8.6 Which forecasts to trust

All 51 pass the gate, but the gate is relative to each city's own level. Small
cities with fewer than 5,000 registrations per year have wider relative
uncertainty even when the metric looks acceptable. The top-15 shortlist is the
appropriate place to act; forecasts for small cities should be treated as
directional.

![M3 forecasts vs observed](figures/m3_forecast_vs_observed.png)

---

## 9. Objective 5 — Charging Demand Score and hotspots

### 9.1 Formula

```
CDS = 0.40·z(M1 expected monthly)
    + 0.30·P(high demand)
    + 0.30·z(M3 forecast growth)
```

The weights are a policy choice, not an estimate. A forecast only enters the
score when `forecast_quality = ok`; otherwise observed 12-month growth is used
and `m3_source` records the fallback. In the current run all 51 forecasts pass,
so every city uses its model forecast.

### 9.2 Results

| Rank | City | CDS | Recommendation |
|---:|---|---:|---|
| 1 | Bengaluru | 1.702 | Critical — immediate fast-charger deployment |
| 2 | Jaipur | 1.513 | Critical — immediate fast-charger deployment |
| 3 | Delhi | 1.498 | High — prioritise in the next wave |
| 4 | Pune | 1.354 | High — prioritise in the next wave |
| 5 | Rajkot | 0.734 | Moderate — monitor and plan |
| 6 | Bhubaneswar | 0.719 | Moderate — monitor and plan |
| 7 | Hyderabad | 0.634 | Moderate — monitor and plan |
| 8 | Noida | 0.541 | Moderate — monitor and plan |
| 9 | Lucknow | 0.484 | Moderate — monitor and plan |
| 10 | Guwahati | 0.401 | Moderate — monitor and plan |
| 11 | Patna | 0.389 | Moderate — monitor and plan |
| 12 | Nashik | 0.365 | Moderate — monitor and plan |
| 13 | Gwalior | 0.232 | Moderate — monitor and plan |
| 14 | Indore | 0.219 | Moderate — monitor and plan |
| 15 | Ranchi | 0.169 | Moderate — monitor and plan |

Bengaluru and Jaipur are the only Critical cities: both combine a high expected
monthly level with strong forecast growth. Delhi and Pune are High. The
remainder of the shortlist is Moderate; the full 51-city ranking is in
`cds_ranking.csv`.

### 9.3 Sensitivity

Perturbing each weight by ±0.10 retains 14–15 of the top 15. The ranking is
therefore informative at the top but not knife-edge.

| Perturbation | Overlap | Entered | Dropped |
|---|---:|---|---|
| M1 −0.10 | 15/15 | – | – |
| M1 +0.10 | 14/15 | Surat | Ranchi |
| M2 −0.10 | 14/15 | Surat | Ranchi |
| M2 +0.10 | 14/15 | Allahabad (Prayagraj) | Ranchi |
| M3 −0.10 | 14/15 | Allahabad (Prayagraj) | Ranchi |
| M3 +0.10 | 14/15 | Madurai | Indore |

### 9.4 Map and use

`reports/cds_map.html` plots the 51 cities on the state polygons. The intended
use is a portfolio shortlist: the top 15 are where a CPO should conduct
site-level due diligence. The score ranks cities, not sites; it cannot choose a
street corner.

![CDS top 15](figures/cds_top15.png)

---

## 10. Robustness

The results survive four perturbations:

1. **Fuel price removed.** Market size and income retain their sign and
   significance; the policy coefficient moves to the edge of significance.
2. **Policy removed.** M1 market and income findings are unchanged, and M2 AUC
   rises, confirming that the provisional score is not carrying the result.
3. **Seven municipal-boundary cities removed.** M1 density becomes stronger and
   significant; M2 AUC rises to about 0.89.
4. **2021 removed from M3.** Forecast growth moves by a median of 0.033; the
   cities with the largest moves are exactly those with the largest seam flags.

The CDS top 15 is stable under weight perturbations. The main threat to the
ranking is not model choice but the charger snapshot: a single count error for a
small city can move its demand ratio substantially.

---

## 11. Limitations

1. **Policy scores are provisional for all 30 states.** The rubric columns are
   blank and no state has been verified against its policy PDF. The coefficient
   should be quoted as provisional or omitted. The BEE policy host
   (`evyatra.beeindia.gov.in`) was unreachable from the build environment;
   `scripts/verify_policy_scores.py` is ready to run where it is reachable.
2. **Seven cities use municipal boundaries.** Chandigarh, Guwahati, Mysuru,
   Bhubaneswar, Dehradun, Gurugram, and Noida now have verified Census 2011
   city/MC populations and cited areas, but their footprints are municipal,
   while the other 44 are urban agglomerations. Mixing footprints is a real
   measurement problem; the 44-city boundary-harmonised sensitivity is the
   defensible alternative.
3. **Eight cities show a >1.5× step from 2021 to 2022.** Guwahati is the extreme
   case. The 2022-only forecast is preferable for those cities.
4. **Chargers are one snapshot.** There are no install dates, so the
   charger/EV ratio cannot be read as a monthly series. The 10 km count is
   comparable; the 15–30 km circle is not.
5. **Nine cities have no 2021 data.** Their series start in 2022; a 12-month
   leading gap is not imputed.
6. **Seventeen configured cities have no city-level covariates.** They are
   excluded from the panel rather than filled with state proxies.
7. **The vehicle split is measured for 42 cities, proxied for 9.** Proxy rows are
   estimates, not observations.
8. **n=51 is small for classification.** The CV spread is wide; a single AUC is
   not a reliable summary.
9. **Forecast quality is relative to each city's level.** Small cities have
   wider relative uncertainty even when the gate is passed.
10. **The 29,070 station records are not a national station headcount.** Report
    the definition and vintage with any charger number.

---

## 12. Recommendations

1. **Verify the policy rubric** from the 28 available PDFs, with a quoted
   snippet per flag. Until then, run M1 and M2 without the policy score.
2. **Harmonise the seven municipal rows** to urban-agglomeration boundaries, or
   publish the 44-city boundary-harmonised model as the primary result.
3. **Use the 10 km fixed-radius supply measure** for all comparisons. Do not
   compare the variable-radius circle counts across cities.
4. **Treat 2021 as a separate source.** Report the 2022-only forecast for cities
   flagged in `seam_2021_2022.csv`.
5. **Deploy against the top-15 shortlist**, and use the full ranking only for
   screening.
6. **Refresh the charger snapshot** before any deployment decision. The demand
   metric is a ratio; both numerator and denominator move.

---

## Appendix A — outputs

| File | Contents |
|---|---|
| `data/processed/master_ev_panel.csv` | 3,519 × 115 analysis panel |
| `data/processed/cds_ranking.csv` | 51-city CDS |
| `data/processed/cds_ranking_top15.csv` | shortlist |
| `data/processed/model_m1_coefficients.csv` | driver IRRs |
| `data/processed/model_m1_sensitivity.csv` | fuel sensitivity |
| `data/processed/model_m1_policy_sensitivity.csv` | policy sensitivity |
| `data/processed/model_m1_demographics_sensitivity.csv` | 44-city sensitivity |
| `data/processed/model_m2_comparison.csv` | logistic vs LDA |
| `data/processed/model_m2_sensitivity.csv` | policy and demographic variants |
| `data/processed/model_m3_summary.csv` | winner, forecast, quality |
| `data/processed/model_m3_2022only.csv` | seam sensitivity |
| `reports/cds_map.html` | interactive map |
| `reports/seam_2021_2022.csv` | seam diagnostics |
| `reports/eda.md` | exploratory analysis |
| `reports/final_deck.pptx` | 11-slide deck |

## Appendix B — reproduction

```bash
cd backend
python scripts/build_user_dataset.py
python scripts/build_master_panel.py
python scripts/run_models.py
python scripts/diagnose_seam.py --with-m3
python scripts/make_map.py
python scripts/build_report_assets.py
python scripts/build_notebooks.py
```

Offline tests: `python -m pytest -q`.

## Appendix C — glossary

- **RTO:** Regional Transport Office; the registration jurisdiction.
- **2W / 3W / 4W:** two-, three-, and four-wheeler.
- **COMM:** commercial vehicle bucket.
- **CDS:** Charging Demand Score.
- **Holdout:** the last nine months used to score a forecast.
- **IRR:** incidence-rate ratio.
- **AUC:** area under the ROC curve.
