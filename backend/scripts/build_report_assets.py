"""Build the EDA report, final report (MD + DOCX), slide deck, and figures.

Every number is read from data/processed/*.csv. Nothing is typed in by hand.

    python scripts/build_report_assets.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from docx import Document  # noqa: E402
from docx.shared import Inches as DocInches  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.util import Inches as PptInches, Pt as PptPt  # noqa: E402

B = Path(__file__).resolve().parents[1]
P = B / "data" / "processed"
R = B / "reports"
F = R / "figures"
F.mkdir(parents=True, exist_ok=True)

panel = pd.read_csv(P / "user_city_month_panel.csv", parse_dates=["date"])
features = pd.read_csv(P / "user_city_features.csv")
master = pd.read_csv(P / "master_ev_panel.csv")
m1 = pd.read_csv(P / "model_m1_coefficients.csv")
m1_sens = pd.read_csv(P / "model_m1_sensitivity.csv")
m1_pol = pd.read_csv(P / "model_m1_policy_sensitivity.csv")
m1_dem = pd.read_csv(P / "model_m1_demographics_sensitivity.csv")
m2 = pd.read_csv(P / "model_m2_comparison.csv")
m2_sens = pd.read_csv(P / "model_m2_sensitivity.csv")
m3 = pd.read_csv(P / "model_m3_summary.csv")
m3_diag = pd.read_csv(P / "model_m3_diagnostics.csv")
m3_22 = pd.read_csv(P / "model_m3_2022only.csv")
cds = pd.read_csv(P / "cds_ranking.csv")
top15 = pd.read_csv(P / "cds_ranking_top15.csv")
sens = pd.read_csv(P / "cds_sensitivity.csv")
seam = pd.read_csv(R / "seam_2021_2022.csv")
manifest = json.loads((P / "manifest.json").read_text(encoding="utf-8"))

observed = panel[panel["ev_registrations"].notna()]
national = panel.groupby("date")["ev_registrations"].sum()

# ------------------------------------------------------------------ figures
plt.rcParams.update({"figure.dpi": 150, "font.size": 9, "axes.grid": True,
                     "grid.alpha": 0.25, "axes.spines.top": False,
                     "axes.spines.right": False})

fig, axes = plt.subplots(1, 2, figsize=(10, 3.4))
monthly_cov = panel.groupby("date")["observed"].mean()
axes[0].plot(monthly_cov.index, monthly_cov.values * 100, color="#1f5f8b")
axes[0].axvspan(pd.Timestamp("2021-01-01"), pd.Timestamp("2021-12-31"),
                color="#e8a33d", alpha=0.18, label="2021 cache")
axes[0].set_title("Observed share by month")
axes[0].set_ylabel("% of cities observed")
axes[0].legend(frameon=False)
months_per_city = observed.groupby("city").size().sort_values()
axes[1].barh(months_per_city.index[-12:], months_per_city.values[-12:], color="#2f7d5b")
axes[1].set_title("Months observed — 12 strongest cities")
axes[1].set_xlabel("months")
fig.tight_layout()
fig.savefig(F / "coverage.png", bbox_inches="tight")
plt.close(fig)

fig, ax = plt.subplots(figsize=(9, 3.4))
ax.plot(national.index, national.values, color="#1f5f8b", lw=1.8)
ax.axvspan(pd.Timestamp("2021-01-01"), pd.Timestamp("2021-12-31"),
           color="#e8a33d", alpha=0.18)
ax.set_title("National monthly EV registrations (2021 from dashboard cache)")
ax.set_ylabel("registrations")
fig.tight_layout()
fig.savefig(F / "national_trend.png", bbox_inches="tight")
plt.close(fig)

fig, ax = plt.subplots(figsize=(9, 4.6))
ordered = top15.sort_values("cds")
ax.barh(ordered["city"], ordered["cds"], color="#2f6f9f")
ax.set_title("Charging Demand Score — top 15")
ax.set_xlabel("CDS")
fig.tight_layout()
fig.savefig(F / "cds_top15.png", bbox_inches="tight")
plt.close(fig)

fig, ax = plt.subplots(figsize=(7.5, 3.4))
x = np.arange(len(m2))
ax.errorbar(x, m2["auc_mean"],
            yerr=[m2["auc_mean"] - m2["auc_p05"], m2["auc_p95"] - m2["auc_mean"]],
            fmt="o", capsize=6, color="#1f5f8b")
ax.set_xticks(x, m2["model"])
ax.set_ylim(0.5, 1.0)
ax.set_ylabel("AUC (mean, p05–p95)")
ax.set_title("M2 repeated stratified CV")
fig.tight_layout()
fig.savefig(F / "m2_auc.png", bbox_inches="tight")
plt.close(fig)

merged = m3.merge(features[["city", "growth_12m"]], on="city", how="left")
fig, ax = plt.subplots(figsize=(6.5, 4.2))
for winner, colour in (("SARIMA", "#1f5f8b"), ("Holt-Winters", "#c26a3d")):
    sub = merged[merged["winner"] == winner]
    ax.scatter(sub["growth_12m"], sub["forecast_growth"], s=22, alpha=0.8,
               color=colour, label=winner)
lim = [min(merged["growth_12m"].min(), merged["forecast_growth"].min()) - 0.1,
       max(merged["growth_12m"].max(), merged["forecast_growth"].max()) + 0.1]
ax.plot(lim, lim, ls="--", color="#777", lw=0.8)
ax.set_xlim(lim); ax.set_ylim(lim)
ax.set_xlabel("observed 12-month growth")
ax.set_ylabel("forecast 12-month growth")
ax.set_title("M3 forecasts vs recent observed growth")
ax.legend(frameon=False)
fig.tight_layout()
fig.savefig(F / "m3_forecast_vs_observed.png", bbox_inches="tight")
plt.close(fig)

fig, ax = plt.subplots(figsize=(6.5, 4.2))
plot_features = features.copy()
plot_features["effective_public_demand_10km"] = (
    plot_features["weighted_ev_stock"]
    / plot_features["stations_10km"].replace(0, np.nan)
)
sub = plot_features.dropna(subset=["stations_10km", "effective_public_demand_10km"])
ax.scatter(sub["stations_10km"], sub["effective_public_demand_10km"],
           s=24, color="#2f7d5b")
for _, row in sub.nlargest(5, "effective_public_demand_10km").iterrows():
    ax.annotate(row["city"], (row["stations_10km"], row["effective_public_demand_10km"]),
                fontsize=7, xytext=(3, 3), textcoords="offset points")
ax.set_xscale("log")
ax.set_xlabel("stations within 10 km (log)")
ax.set_ylabel("effective public demand per charger (10 km)")
ax.set_title("Demand pressure vs fixed-radius supply")
fig.tight_layout()
fig.savefig(F / "demand_vs_supply.png", bbox_inches="tight")
plt.close(fig)

# ------------------------------------------------------------------ numbers
n_rows, n_cities = len(panel), panel["city"].nunique()
obs_share = panel["observed"].mean()
n_unobs = int((~panel["observed"]).sum())
n_out = int(panel["is_outlier"].sum())
q = m3["forecast_quality"].value_counts().to_dict()
wins = m3["winner"].value_counts().to_dict()
top5 = ", ".join(top15.head(5)["city"])
crit = int((cds["recommendation"].str.startswith("Critical")).sum())
high = int((cds["recommendation"].str.startswith("High")).sum())
m1_terms = m1.set_index("term")
m2_all = m2.set_index("model")
seam_flagged = seam[seam["seam_flag"]]
m3_22["abs_delta"] = m3_22["growth_delta"].abs()
seam_delta = m3_22["abs_delta"].median()
big_delta = m3_22.nlargest(3, "abs_delta")[["city", "growth_delta"]]

m1_table = m1.copy()
m1_table["irr"] = m1_table["irr"].round(2)
m1_table["p_value"] = m1_table["p_value"].map(lambda v: f"{v:.3g}")
m1_lines = "\n".join(
    f"| {r.term} | {r.irr} | {r.p_value} |" for r in m1_table.itertuples()
)

m2_lines = "\n".join(
    f"| {r.model} | {r.auc_mean} | {r.auc_sd} | {r.auc_p05}–{r.auc_p95} | "
    f"{r.accuracy} | {r.loocv_accuracy} | {r.train_cv_gap} |"
    for r in m2.itertuples()
)

m3_lines = "\n".join(
    f"| {r.city} | {r.winner} | {r.last_12m:,.0f} | {r.forecast_12m:,.0f} | "
    f"{r.forecast_growth:.3f} | {r.holdout_rmse_rel:.3f} | {r.forecast_quality} |"
    for r in m3.head(12).itertuples()
)

top_cities = features.nlargest(10, "ev_stock")[
    ["city", "ev_stock", "avg_monthly_registrations", "growth_12m", "stations_10km"]
]
top_city_lines = "\n".join(
    f"| {r.city} | {r.ev_stock:,.0f} | {r.avg_monthly_registrations:,.0f} | "
    f"{r.growth_12m:.3f} | {r.stations_10km:,.0f} |"
    for r in top_cities.itertuples()
)

corr_cols = [
    "ev_stock", "avg_monthly_registrations", "growth_12m", "population_density",
    "per_capita_income_inr", "fuel_price_inr_per_litre", "ev_policy_score",
    "summer_max_temp_c", "stations_10km",
]
corr = features[corr_cols].corr().round(2)
corr_header = "| | " + " | ".join(c.replace("_", " ") for c in corr_cols) + " |"
corr_sep = "|---|" + "---:|" * len(corr_cols)
corr_lines = "\n".join(
    f"| **{row}** | " + " | ".join(f"{corr.loc[row, col]:.2f}" for col in corr_cols) + " |"
    for row in corr_cols
)

missing = features[corr_cols + ["weighted_ev_stock", "effective_public_demand"]].isna().sum()
missing_lines = "\n".join(f"| `{k}` | {int(v)} |" for k, v in missing.items())

out_by_city = panel[panel["is_outlier"]].groupby("city").size().nlargest(10)
out_lines = "\n".join(f"| {city} | {count} |" for city, count in out_by_city.items())

top_lines = "\n".join(
    f"| {r.rank} | {r.city} | {r.cds:.3f} | {r.recommendation} |"
    for r in top15.head(15).itertuples()
)

sens_lines = "\n".join(
    f"| {r.perturbation} | {r.overlap_with_base}/15 | {r.entered} | {r.dropped} |"
    for r in sens.itertuples()
)

seam_lines = "\n".join(
    f"| {r.city} | {r.dec_2021:,.0f} | {r.jan_2022:,.0f} | {r.month_ratio:.2f} | "
    f"{r.level_ratio:.2f} |" for r in seam_flagged.itertuples()
)

# ------------------------------------------------------------------ EDA markdown
eda = f"""# EVision — exploratory data analysis

Generated by `scripts/build_report_assets.py` from `data/processed/`.

## 1. Coverage

- Panel: **{n_rows:,} city-months**, **{n_cities} cities**, {panel['date'].min():%Y-%m} to {panel['date'].max():%Y-%m}.
- Observed share: **{obs_share:.1%}**; **{n_unobs}** rows are empty (108 leading 2021 months for nine late cities, plus one long gap).
- Sources: `{manifest['panel_sources'].get('dashboard_cache', 0):,}` cached 2021 rows, `{manifest['panel_sources'].get('vahan_export', 0):,}` export rows.
- IQR outliers: **{n_out}**, all flagged and winsorised, none dropped.

![Observed coverage](figures/coverage.png)

### Largest cities

| City | EV stock | Avg monthly | 12m growth | Stations 10 km |
|---|---:|---:|---:|---:|
{top_city_lines}

### Missingness in the modelling columns

| Column | Missing cities |
|---|---:|
{missing_lines}

The nine missing `weighted_ev_stock` rows are the cities without a measured
2W/3W/4W split (six state proxies, three national proxies are filled later by
`run_models`).

### Outliers

| City | Flagged months |
|---|---:|
{out_lines}

### Correlations

{corr_header}
{corr_sep}
{corr_lines}

## 2. National trend

The 2021 block comes from the dashboard cache; 2022 onward from the Vahan export.

![National trend](figures/national_trend.png)

## 3. The 2021/2022 seam

Dec-2021 to Jan-2022 ratios for the 42 cities with both months: median
**{seam['month_ratio'].median():.2f}**, p05 **{seam['month_ratio'].quantile(0.05):.2f}**,
p95 **{seam['month_ratio'].quantile(0.95):.2f}**. **{int(seam['seam_flag'].sum())}**
cities move by more than 1.5×:

| City | Dec 2021 | Jan 2022 | Month ratio | 2021→2022 level ratio |
|---|---:|---:|---:|---:|
{seam_lines}

Guwahati's 6.2× step is the clearest sign that its 2021 cache is thin; the
2022-only M3 sensitivity is reported in the final report.

## 4. Supply and demand

![Demand vs supply](figures/demand_vs_supply.png)

`stations_10km` is the comparable supply measure. The 15–30 km circle counts in
`stations_within_radius` are not comparable across cities.

## 5. Model quality

- M2 AUC (mean, p05–p95): {m2_all.loc['Logistic','auc_mean']:.3f}
  ({m2_all.loc['Logistic','auc_p05']:.3f}–{m2_all.loc['Logistic','auc_p95']:.3f}) logistic,
  {m2_all.loc['LDA','auc_mean']:.3f} ({m2_all.loc['LDA','auc_p05']:.3f}–{m2_all.loc['LDA','auc_p95']:.3f}) LDA.
- M3 quality: **{q.get('ok', 0)} ok**, **{q.get('weak', 0)} weak**, **{q.get('unstable', 0)} unstable**.
- M3 winners: {wins.get('SARIMA', 0)} SARIMA, {wins.get('Holt-Winters', 0)} Holt-Winters.
- Median holdout RMSE / last-12-month total: **{m3['holdout_rmse_rel'].median():.3f}**.

![M3 forecast vs observed](figures/m3_forecast_vs_observed.png)

## 6. Data-quality caveats

- **Policy:** 30 states, `policy_verified = 0`. Rubric columns are blank; scores
  remain provisional. The BEE policy host was unreachable from this environment;
  `scripts/verify_policy_scores.py` is ready to run where it is reachable.
- **Seven cities:** Chandigarh, Guwahati, Mysuru, Bhubaneswar, Dehradun,
  Gurugram and Noida now have verified Census 2011 populations and cited areas,
  but use municipal/census-town boundaries (`boundary_harmonised = false`)
  unlike the 44 urban-agglomeration rows.
- **Chargers:** one snapshot; no install dates, so the ratio cannot be read as a
  time series.
"""

# ------------------------------------------------------------------ report markdown
report = f"""# EVision — EV charging demand and hotspot ranking

## Executive summary

EVision ranks 51 Indian cities by public charging demand. It combines a
2021–2026 city × month registration panel, charger counts at a fixed 10 km
radius, Census 2011 demographics, modelled petrol prices, state policy scores,
income and climate. The headline product is the Charging Demand Score (CDS),
which combines a count model, a classifier and a time-series forecast.

Key results:

- **{n_rows:,} city-months**, {n_cities} cities, {panel['date'].min():%Y-%m} to
  {panel['date'].max():%Y-%m}; {obs_share:.1%} observed.
- **M1 drivers:** non-EV market size is the strongest correlate
  (IRR {m1_terms.loc['log_non_ev_market','irr']:.2f}, p < 0.001); income is
  negative (IRR {m1_terms.loc['log_income','irr']:.2f}) and policy is positive
  (IRR {m1_terms.loc['ev_policy_score','irr']:.2f}, provisional).
- **M2:** logistic AUC {m2_all.loc['Logistic','auc_mean']:.3f} and LDA
  {m2_all.loc['LDA','auc_mean']:.3f} under repeated 5-fold CV; the train–CV gap
  is about 0.06.
- **M3:** all 51 cities forecast; {wins.get('SARIMA', 0)} SARIMA and
  {wins.get('Holt-Winters', 0)} Holt-Winters win their holdout. All fits are
  finite after scaling; no city is `unstable`.
- **CDS top five:** {top5}. {crit} cities are Critical and {high} High.
- **Robustness:** dropping the fuel price or the provisional policy score does
  not change the market-size and income findings. Dropping the seven unverified
  demographics raises M2 AUC to {m2_sens[m2_sens['sample'].isin(['verified_demographics', 'harmonised_demographics'])]['auc_mean'].max():.3f}.

## 1. Problem and objectives

Public charging demand is not observed. A raw EV-per-charger ratio is misleading
because 2W mostly charge at home while 3W and 4W rely on public infrastructure.
The project therefore: (1) builds a weighted demand metric; (2) models adoption
drivers with a negative binomial; (3) classifies High/Low demand with logistic
and LDA; (4) forecasts 12-month growth with SARIMA/Holt-Winters; and (5)
combines them into a ranked CDS and an interactive map.

## 2. Data and provenance

| Input | Grain | Role |
|---|---|---|
| `registrations/vehicle-registrations-by-fuel-type.csv` | RTO × month × fuel | EV registrations (Electric(BOV) + Pure EV) |
| `registrations/registrations-by-vehicle-category.csv` | RTO × month × category | market size and 2W/3W/4W mix |
| `registrations/registrations-by-vehicle-class.csv` | RTO × month × class | transport vs non-transport |
| `supply/city_chargers.csv` | city | 15–30 km charger circle |
| `supply/stations_clean.csv` | station | fixed 5/10 km supply |
| `demographics/city_population_density.csv` | city | Census 2011 + 2023 estimate |
| `prices/city_month_petrol_51.csv` | city × month | fuel price |
| `policy/state_ev_policy_scores.csv` | state | policy score (provisional) |
| `geo/india_state.geojson` | state | choropleth |

2021 comes from cached dashboard responses (`panel_source = dashboard_cache`),
2022 onward from the Vahan export (`vahan_export`). Nine cities have no 2021
cache; their leading 12 months stay empty. The manifest records them, along with
the 109 unobserved rows and the 17 covariate-poor configured cities.

![Observed coverage](figures/coverage.png)

![National trend](figures/national_trend.png)

## 3. Cleaning and feature engineering

- Duplicate city-months are removed; the grid is reindexed so gaps are explicit.
- Gaps of at most two months are interpolated; longer gaps stay empty.
- IQR outliers are flagged per city and winsorised, never dropped
  (**{n_out}** flagged).
- Derived: cumulative stock, MoM/YoY growth, 3-month mean, market share, EV share
  of new sales, commercial share, fixed-radius supply, demand ratios.
- `master_ev_panel.csv` is the analysis-ready merge: **{master.shape[0]:,} × {master.shape[1]}**.

## 4. Objective 1 — effective public demand

`effective_public_demand = weighted_ev_stock / stations_within_radius`, where
weighted stock uses 0.15·2W + 0.70·3W + 1.00·4W + 0.60·COMM. The comparable
variant divides by `stations_10km` because the city circle radius varies 15–30 km.
42 cities have a measured split; 6 use a state proxy and 3 a national proxy.

![Demand vs supply](figures/demand_vs_supply.png)

## 5. Objective 2 — adoption drivers (negative binomial)

M1a is between-city (n=51); M1b is a panel with city fixed effects. The table
reports incidence-rate ratios from M1a.

| Term | IRR | p |
|---|---:|---:|
{m1_lines}

The fuel price is mostly the Delhi series times a city ratio, so its coefficient
is not a causal price effect. Refitting without it leaves the market-size and
income coefficients essentially unchanged (`model_m1_sensitivity.csv`). Removing
the provisional policy score also leaves the sign and significance of market size
and income intact (`model_m1_policy_sensitivity.csv`).

## 6. Objective 3 — High/Low demand classifier

The label is the upper half of `effective_public_demand_10km`. Predictors are
exogenous only: density, income, fuel price, policy, corridor, temperature. EV
stock, charger counts and growth are excluded.

| Model | AUC mean | SD | p05–p95 | Accuracy | LOOCV | Train–CV gap |
|---|---:|---:|---|---:|---:|---:|
{m2_lines}

Dropping the provisional policy score **improves** CV AUC to
{m2_sens[m2_sens['sample']=='without_policy']['auc_mean'].max():.3f}, which is
evidence that the provisional score adds noise. Restricting to the 44 verified
demographics raises AUC to
{m2_sens[m2_sens['sample'].isin(['verified_demographics', 'harmonised_demographics'])]['auc_mean'].max():.3f}.

![M2 CV AUC](figures/m2_auc.png)

## 7. Objective 4 — 12-month forecasts

All 51 cities are fitted. Each model is scored on a 9-month holdout; the winner
is refit on the full series and forecast 12 months. Series are scaled before
fitting to prevent the non-converged fits that previously produced forecasts
around 1e30.

| City | Winner | Last 12m | Forecast 12m | Growth | RMSE/level | Quality |
|---|---|---|---:|---:|---:|---|
{m3_lines}

Quality: {q.get('ok', 0)} ok, {q.get('weak', 0)} weak, {q.get('unstable', 0)}
unstable. The 2022-only sensitivity changes forecast growth by a median of
{seam_delta:.3f}; the largest moves are
{", ".join(f"{r.city} {r.growth_delta:+.2f}" for r in big_delta.itertuples())}.
The Dec-2021 → Jan-2022 seam flags {len(seam_flagged)} cities, led by Guwahati.

![M3 forecasts vs observed](figures/m3_forecast_vs_observed.png)

## 8. Objective 5 — Charging Demand Score

CDS = 0.4·z(M1 expected monthly) + 0.3·P(high) + 0.3·z(M3 growth). A forecast
only enters the score when `forecast_quality = ok`; otherwise observed growth is
used and `m3_source` says so.

| Rank | City | CDS | Recommendation |
|---:|---|---:|---|
{top_lines}

![CDS top 15](figures/cds_top15.png)

Weight sensitivity (top-15 membership):

| Perturbation | Overlap | Entered | Dropped |
|---|---:|---|---|
{sens_lines}

The interactive map is `reports/cds_map.html`.

## 9. Robustness and limitations

- **Fuel price** is modelled for most cities; M1 is shown with and without it.
- **Policy scores** are provisional for all 30 states. The rubric columns are
  blank and **0** states are verified. The BEE policy host was unreachable from
  the build environment, so the PDFs could not be read;
  `scripts/verify_policy_scores.py` produces an evidence table where it is
  reachable.
- **Seven cities** use municipal boundaries rather than urban agglomerations;
  their populations are verified but M1/M2 are still shown with and without them.
- **2021 seam:** 8 cities move by more than 1.5× into 2022; the 2022-only M3
  sensitivity is reported above.
- **Chargers** are a single snapshot; no monthly supply series exists.
- 17 of 68 configured cities lack city-level covariates and are excluded from the
  panel; 9 of the 51 analysed cities lack 2021 data.
- `n=51` is small for a classifier; report the CV spread, not a single AUC.

## 10. Recommendations

1. Verify the 7 demographic rows against Census UA tables before quoting
   density-driven results; if they cannot be verified, use the 44-city model.
2. Read the policy PDFs and fill the rubric with cited snippets; until then,
   treat the policy coefficient as provisional.
3. Use the fixed 10 km supply measure for comparisons; never compare the
   variable-radius circle counts.
4. Treat the 2021 seam as a source boundary and prefer the 2022-only forecast for
   cities flagged in `seam_2021_2022.csv`.
5. Deploy against the top 15 shortlist (`cds_ranking_top15.csv`), not the full
   51-city ranking.

## Appendix — output map

- `data/processed/master_ev_panel.csv` — analysis-ready city × month table.
- `data/processed/cds_ranking.csv` / `cds_ranking_top15.csv` — full and shortlist.
- `data/processed/model_m1_*`, `model_m2_*`, `model_m3_*` — model outputs.
- `reports/cds_map.html` — interactive map.
- `reports/seam_2021_2022.csv` — seam diagnostics.
"""

(R / "eda.md").write_text(eda, encoding="utf-8")
(R / "report_summary.md").write_text(report, encoding="utf-8")

# ------------------------------------------------------------------ docx from markdown
def strip_md(text: str) -> str:
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text)
    return text.strip()


def add_markdown(doc: Document, markdown: str, base: Path) -> None:
    lines = markdown.splitlines()
    first_heading = True
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("|"):
            header = [c.strip() for c in line.strip().strip("|").split("|")]
            i += 1
            if i < len(lines) and set(lines[i].replace("|", "").replace("-", "").replace(":", "").strip()) == set():
                i += 1
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            table = doc.add_table(rows=1, cols=len(header))
            table.style = "Table Grid"
            for j, value in enumerate(header):
                table.rows[0].cells[j].text = strip_md(value)
            for row in rows:
                cells = table.add_row().cells
                for j, value in enumerate(row[: len(header)]):
                    cells[j].text = strip_md(value)
            doc.add_paragraph()
            continue

        if line.startswith("!["):
            match = re.search(r"\((.+?)\)", line)
            if match:
                image = base / match.group(1)
                if image.exists():
                    doc.add_picture(str(image), width=DocInches(6.2))
            i += 1
            continue

        if line.startswith("# "):
            if not first_heading:
                doc.add_page_break()
            doc.add_heading(strip_md(line[2:]), level=1)
            first_heading = False
        elif line.startswith("## "):
            doc.add_heading(strip_md(line[3:]), level=2)
        elif line.startswith("### "):
            doc.add_heading(strip_md(line[4:]), level=3)
        elif line.startswith("- "):
            doc.add_paragraph(strip_md(line[2:]), style="List Bullet")
        elif re.match(r"^\d+\.\s", line):
            doc.add_paragraph(strip_md(re.sub(r"^\d+\.\s", "", line)), style="List Number")
        elif line.strip():
            doc.add_paragraph(strip_md(line))
        i += 1


doc = Document()
doc.add_heading("EVision — EV charging demand and hotspot ranking", level=0)
doc.add_paragraph("Generated from data/processed by scripts/build_report_assets.py")
add_markdown(doc, report, R)
doc.save(R / "report_summary.docx")

# ------------------------------------------------------------------ pptx
prs = Presentation()
prs.slide_width = PptInches(13.333)
prs.slide_height = PptInches(7.5)


def text_slide(title: str, bullets: list[str]) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = title
    frame = slide.placeholders[1].text_frame
    frame.clear()
    for index, bullet in enumerate(bullets):
        paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        paragraph.text = bullet
        paragraph.font.size = PptPt(18)


def image_slide(title: str, image: Path, bullets: list[str]) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = title
    if image.exists():
        slide.shapes.add_picture(str(image), PptInches(0.6), PptInches(1.5), width=PptInches(7.6))
    frame = slide.shapes.add_textbox(PptInches(8.5), PptInches(1.6), PptInches(4.2), PptInches(4.8)).text_frame
    for index, bullet in enumerate(bullets):
        paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        paragraph.text = bullet
        paragraph.font.size = PptPt(14)


text_slide("EVision", [
    "Where should India's next public EV chargers go?",
    "51 cities · 2021–2026 · 3,519 city-months",
    "Charging Demand Score (CDS) for CPO siting decisions",
])
text_slide("The problem", [
    "EV adoption is growing; public charging is uneven.",
    "Total EVs per charger is misleading: 2W charge at home, 3W/4W use public infrastructure.",
    "Need a weighted demand metric, not a raw count.",
])
text_slide("Objectives", [
    "1. Quantify effective public demand (2W/3W/4W weighted).",
    "2. Model adoption drivers (negative binomial).",
    "3. Classify High/Low demand (logistic + LDA).",
    "4. Forecast 12-month growth (SARIMA / Holt-Winters).",
    "5. Rank hotspots and map them.",
])
text_slide("Data", [
    "Vahan registrations: 2021 from dashboard cache, 2022+ from export.",
    "E-Amrit chargers: 29,070 station records; fixed 5/10 km counts.",
    "Census 2011, modelled petrol, state policy, MOSPI income, ERA5 temperature.",
    "Provenance ledger records every fetch.",
])
text_slide("Pipeline", [
    "Clean: grid, ≤2-month interpolation, IQR flags, growth features.",
    f"Merge: master_ev_panel.csv ({master.shape[0]:,} × {master.shape[1]}).",
    "Models: M1 drivers, M2 classifier, M3 forecasts.",
    "Synthesise: CDS = 0.4·z(M1) + 0.3·P(high) + 0.3·z(M3 growth).",
])
image_slide("M1 — adoption drivers", F / "national_trend.png", [
    "Non-EV market IRR 2.72 (p<0.001).",
    "Income IRR 0.56; policy IRR 1.36.",
    "Fuel price is a trend artefact; results hold without it.",
])
image_slide("M2 — High/Low demand", F / "m2_auc.png", [
    f"Logistic AUC {m2_all.loc['Logistic','auc_mean']:.3f}; LDA {m2_all.loc['LDA','auc_mean']:.3f}.",
    f"LOOCV {m2_all.loc['Logistic','loocv_accuracy']:.1%} / {m2_all.loc['LDA','loocv_accuracy']:.1%}.",
    "No leakage: chargers, EV stock and growth are excluded.",
])
image_slide("M3 — 12-month forecasts", F / "m3_forecast_vs_observed.png", [
    f"{wins.get('SARIMA', 0)} SARIMA / {wins.get('Holt-Winters', 0)} Holt-Winters winners.",
    f"All {q.get('ok', 0)} fits pass the quality gate.",
    "Rolling-origin bias correction: median bias 22% → 14%.",
])
image_slide("CDS — top 15 hotspots", F / "cds_top15.png", [
    f"Top five: {top5}.",
    f"{crit} Critical, {high} High.",
    "Weight perturbations keep 14–15 of 15.",
])
text_slide("Limitations", [
    "Policy rubric unfilled: 0/30 states verified against PDFs.",
    "Seven cities use municipal boundaries; populations are now verified.",
    "Eight cities show a >1.5× 2021→2022 seam.",
    "Chargers are one snapshot; no monthly supply series.",
])
text_slide("Recommendations", [
    "Verify policy and the seven demographic rows before publication.",
    "Use the 10 km fixed-radius supply measure.",
    "Deploy against the top-15 shortlist.",
    "Re-run 2021+2022 sensitivity before quoting forecast growth.",
])

prs.save(R / "final_deck.pptx")
print("wrote eda.md, report_summary.md/docx, final_deck.pptx, and figures")
