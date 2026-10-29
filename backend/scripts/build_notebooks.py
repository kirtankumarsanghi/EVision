"""Generate and execute the analysis notebooks.

    python scripts/build_notebooks.py

The notebooks read data/processed and the model modules; they do not modify
anything. M1 and M2 are refit (fast); M3 is loaded because a full refit takes
minutes.
"""

from __future__ import annotations

from pathlib import Path

import nbformat as nbf
from nbclient import NotebookClient

B = Path(__file__).resolve().parents[1]
N = B / "notebooks"
N.mkdir(exist_ok=True)

SETUP = """\
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

BACKEND = Path.cwd()
if not (BACKEND / "src").exists():
    BACKEND = BACKEND.parent
sys.path.insert(0, str(BACKEND / "src"))
PROCESSED = BACKEND / "data" / "processed"
REPORTS = BACKEND / "reports"
"""


def notebook(cells: list[tuple[str, str]]) -> nbf.NotebookNode:
    nb = nbf.v4.new_notebook()
    nb.metadata["kernelspec"] = {
        "display_name": "Python 3", "language": "python", "name": "python3",
    }
    nb.cells = [
        nbf.v4.new_markdown_cell(text) if kind == "md" else nbf.v4.new_code_cell(text)
        for kind, text in cells
    ]
    return nb


notebooks = {}

notebooks["01_eda.ipynb"] = notebook([
    ("md", "# 01 — Exploratory data analysis\n\nCoverage, seam, outliers and the main distributions."),
    ("code", SETUP),
    ("code", """\
panel = pd.read_csv(PROCESSED / "user_city_month_panel.csv", parse_dates=["date"])
features = pd.read_csv(PROCESSED / "user_city_features.csv")
print("panel", panel.shape, "| features", features.shape)
print("period", panel["date"].min().date(), "->", panel["date"].max().date())
print("observed share", round(float(panel["observed"].mean()), 4))
print("sources", panel["panel_source"].value_counts(dropna=False).to_dict())
display(panel.head(3))"""),
    ("md", "## Coverage by year"),
    ("code", """\
coverage = panel.groupby(panel["date"].dt.year).agg(
    city_months=("ev_registrations", "size"),
    observed=("observed", "mean"),
    outliers=("is_outlier", "sum"),
)
display(coverage.round(3))
print("unobserved rows:", int((~panel["observed"]).sum()))
print("cities with no 2021 data:", int(panel[panel["date"].dt.year == 2021].groupby("city")["observed"].sum().eq(0).sum()))"""),
    ("md", "## National trend and the 2021/2022 seam"),
    ("code", """\
national = panel.groupby("date")["ev_registrations"].sum()
fig, ax = plt.subplots(figsize=(9, 3.2))
ax.plot(national.index, national.values, color="#1f5f8b")
ax.axvspan(pd.Timestamp("2021-01-01"), pd.Timestamp("2021-12-31"), color="#e8a33d", alpha=0.2)
ax.set_title("National monthly EV registrations")
plt.show()"""),
    ("code", """\
seam_path = REPORTS / "seam_2021_2022.csv"
if seam_path.exists():
    seam = pd.read_csv(seam_path)
    print("flag rate:", round(float(seam["seam_flag"].mean()), 3))
    display(seam.nlargest(8, "month_ratio"))
else:
    print("run scripts/diagnose_seam.py first")"""),
    ("md", "## Largest cities and missingness"),
    ("code", """\
display(features.nlargest(10, "ev_stock")[
    ["city", "ev_stock", "avg_monthly_registrations", "growth_12m", "stations_10km", "effective_public_demand"]
].round(2))
print("missing weighted_ev_stock:", int(features["weighted_ev_stock"].isna().sum()))
print("unverified demographics:", int((~features["demographic_verified"].astype(bool)).sum()))
print("verified policy rows:", int(features.get("policy_verified", pd.Series(False, index=features.index)).sum()))"""),
])

notebooks["02_m1_count.ipynb"] = notebook([
    ("md", "# 02 — M1 negative binomial\n\nBetween-city drivers (M1a) and panel levels with city fixed effects (M1b)."),
    ("code", SETUP),
    ("code", """\
from evision.models import m1_count
panel = pd.read_csv(PROCESSED / "user_city_month_panel.csv", parse_dates=["date"])
features = pd.read_csv(PROCESSED / "user_city_features.csv")
m1 = m1_count.fit(panel, features)
print("M1a n =", m1.drivers.n, "| pseudo R2 =", round(m1.drivers.pseudo_r2, 3))
print("M1b n =", m1.level.n_obs, "| cities =", m1.level.n_cities)
display(m1.coefficients.round(3))"""),
    ("md", "## Fuel-price sensitivity\n\nThe fuel series is mostly the Delhi series times a city ratio, so compare the model with and without it."),
    ("code", """\
display(pd.read_csv(PROCESSED / "model_m1_sensitivity.csv").round(3))"""),
    ("md", "## Provisional policy score\n\nAll policy scores are unverified; the model without policy is shown for comparison."),
    ("code", """\
display(pd.read_csv(PROCESSED / "model_m1_policy_sensitivity.csv").round(3))"""),
])

notebooks["03_m2_classifier.ipynb"] = notebook([
    ("md", "# 03 — M2 High/Low classifier\n\nLogistic vs LDA, repeated stratified CV, and the leakage guard."),
    ("code", SETUP),
    ("code", """\
from evision.models import m2_classify
features = pd.read_csv(PROCESSED / "user_city_features.csv")
m2 = m2_classify.fit(features, repeats=5)
print("n =", m2.n, "| positives =", m2.positives, "| label =", m2.label_col)
display(m2.comparison.round(3))"""),
    ("md", "## Leakage check\n\nThe label is built from demand and chargers, so none of these may be predictors."),
    ("code", """\
forbidden = {"ev_stock", "stations_10km", "fast_10km", "growth_12m",
             "effective_public_demand", "effective_public_demand_10km"}
print("overlap:", forbidden & set(m2_classify.EXOGENOUS))
print("predictors:", m2_classify.EXOGENOUS)"""),
    ("md", "## Sensitivity: policy and unverified demographics"),
    ("code", """\
display(pd.read_csv(PROCESSED / "model_m2_sensitivity.csv").round(3))"""),
])

notebooks["04_m3_forecast.ipynb"] = notebook([
    ("md", "# 04 — M3 12-month forecasts\n\nSARIMA vs Holt-Winters, holdout quality, and the 2021/2022 sensitivity. The full refit takes minutes; this notebook reads the outputs."),
    ("code", SETUP),
    ("code", """\
summary = pd.read_csv(PROCESSED / "model_m3_summary.csv")
diag = pd.read_csv(PROCESSED / "model_m3_diagnostics.csv")
print("cities:", len(summary))
print(summary["winner"].value_counts(dropna=False).to_dict())
print(summary["forecast_quality"].value_counts(dropna=False).to_dict())
display(summary.head(10).round(3))"""),
    ("code", """\
print("median holdout RMSE / last-12m:", round(float(summary["holdout_rmse_rel"].median()), 3))
print("max |SARIMA forecast|:", float(summary["sarima_forecast_12m"].abs().max()))
print("non-finite forecasts:", int((~np.isfinite(summary["forecast_12m"].dropna())).sum()))"""),
    ("md", "## Forecast paths for the strongest cities"),
    ("code", """\
forecasts = pd.read_csv(PROCESSED / "model_m3_forecasts.csv", parse_dates=["date"])
top = summary.nlargest(3, "last_12m")["city"]
fig, ax = plt.subplots(figsize=(9, 3.4))
for city in top:
    sub = forecasts[forecasts["city"] == city]
    ax.plot(sub["date"], sub["forecast"], label=city)
ax.set_title("12-month forecast — three largest cities")
ax.legend(frameon=False)
plt.show()"""),
    ("md", "## 2021 vs 2022-only sensitivity"),
    ("code", """\
path = PROCESSED / "model_m3_2022only.csv"
if path.exists():
    sens = pd.read_csv(path)
    display(sens.reindex(sens["growth_delta"].abs().sort_values(ascending=False).index).head(8))
else:
    print("run scripts/diagnose_seam.py --with-m3")"""),
])

notebooks["05_cds_hotspots.ipynb"] = notebook([
    ("md", "# 05 — Charging Demand Score and hotspots\n\nHow the three model outputs become a ranked shortlist."),
    ("code", SETUP),
    ("code", """\
cds = pd.read_csv(PROCESSED / "cds_ranking.csv")
top15 = pd.read_csv(PROCESSED / "cds_ranking_top15.csv")
print("ranked:", len(cds), "| shortlist:", len(top15))
print(cds["m3_source"].value_counts().to_dict())
display(top15[["rank", "city", "m1_expected_monthly", "p_high", "forecast_growth", "cds", "recommendation"]].round(3))"""),
    ("md", "## Weight sensitivity"),
    ("code", """\
display(pd.read_csv(PROCESSED / "cds_sensitivity.csv"))"""),
    ("md", "## Map"),
    ("code", """\
map_path = REPORTS / "cds_map.html"
print("map:", map_path, "exists:", map_path.exists())
if map_path.exists():
    from IPython.display import HTML
    display(HTML(f'<a href="{map_path.as_uri()}" target="_blank">Open the interactive map</a>'))"""),
])

for name, nb in notebooks.items():
    path = N / name
    nbf.write(nb, path)
    try:
        client = NotebookClient(
            nb, timeout=600, kernel_name="python3",
            resources={"metadata": {"path": str(B)}},
        )
        client.execute()
        nbf.write(nb, path)
        print("executed", path.relative_to(B))
    except Exception as exc:  # noqa: BLE001
        print("WROTE (not executed)", path.relative_to(B), "|", exc)
