# EVision — Frontend Dashboard

Interactive React & TypeScript analytics dashboard for quantifying where India's next public EV fast chargers should be deployed.

Built using React 18, Vite, TypeScript, Tailwind CSS, Recharts, and Lucide icons.

---

## Features

1. **Overview Dashboard**
   - Headline metrics: Analysed EV Fleet (2.4M+), Top Priority Hotspot (Delhi #1, Bengaluru #2), Highest 12m Projected Growth (Guwahati +234%), and Maximum Charger Gap (Patna).
   - National Monthly EV Registration trajectory area chart (Jan 2021 – Sep 2026, 3,519 city-months).
   - Top 5 CDS Priority Hotspots cards with immediate deployment tier badges (`Critical`, `High`, `Moderate`).
   - Methodology callouts explaining the 2W/3W/4W public charging reliance weighting.

2. **Interactive India Charging Demand Map (`CDS Map`)**
   - High-fidelity vector SVG projection of India (35 state and UT outlines).
   - City bubbles dynamically sized and color-coded by model priority:
     - **Critical (CDS ≥ 1.5):** Red (`#dc2626`)
     - **High (0.75 – 1.5):** Orange (`#ea580c`)
     - **Moderate (0 – 0.75):** Blue (`#0284c7`)
     - **Low (< 0):** Slate (`#64748b`)
   - Zoom in/out, pan, and reset view controls.
   - Sizing metric selector: Size bubbles by **CDS Score**, **Demand Gap**, or **EV Stock**.
   - Hover tooltips and instant click-to-inspect scorecard flyout with direct link to City Deep Dive.

3. **Hotspot Rankings (CDS)**
   - Complete 51-city ranked table with sorting by any metric.
   - Filtering by Recommendation Tier (`Critical`, `High`, `Moderate`, `Low`) and Split Method (`measured`, `state`, `national`).
   - **Live Weight Sensitivity Simulator:** Interactive sliders for M1 (Count), M2 (Classifier), and M3 (Growth) that recalculate CDS scores and re-rank cities dynamically in the browser.
   - CSV Export functionality.

4. **Demand & Gap Analysis (Objective 1)**
   - Effective public demand formulation: `effective_public_demand = weighted_ev_stock / stations_within_radius`.
   - Vehicle weighting: `0.15·2W + 0.70·3W + 1.00·4W + 0.60·COMM`.
   - Top 15 supply-constrained cities bar chart (Patna, Lucknow, Meerut, Kanpur, Jabalpur, etc.).
   - Interactive Scatter Distribution Matrix: Public Stations vs Weighted EV Fleet.

5. **City Deep Dive**
   - Searchable city jumper covering all 51 cities.
   - Historical monthly additions (2021–2026) stitched with the forward 12-month SARIMA/Holt-Winters forecast curve (2026–2027).
   - Visual outlier badges pinpointing the 72 flagged IQR winsorized months.
   - Vehicle category mix evolution stacked bar chart (2W personal vs 3W commercial vs 4W fleet).
   - City context scorecard: Population 2023, density, per capita income, summer max temperature, and EV policy status.

6. **M3 12-Month Forecast Tournament (Objective 4)**
   - Tournament evaluation between SARIMA and Holt-Winters across a 9-month holdout test set.
   - Top 10 fastest growing hubs bar chart.
   - Complete 51-city model comparison table with holdout RMSE, AIC, forecast growth %, and quality assurance flags.

7. **M1 & M2 Statistical Foundations (Objectives 2 & 3)**
   - **M1 Negative Binomial (Adoption Drivers):** Incidence Rate Ratios (IRR) forest plot with 95% confidence intervals and p-values.
   - **M2 Classifier (High/Low Demand):** LDA vs Logistic Regression metrics (CV-AUC 0.915, LOOCV accuracy 90.2%, zero label leakage).
   - Cross-validated confusion matrix visualization.

8. **Data Quality, Coverage & Provenance Ledger**
   - Manifest audit: 51 analysed cities vs 17 excluded covariate-poor cities.
   - 9 post-2021 cities explanation.
   - 2021→2022 source seam diagnostic table (Guwahati, Jabalpur, Vijayawada, etc.).
   - 4 foundational scientific principles for zero-invention empirical analysis.

---

## Running the Application

### 1. Start the Backend API (Port 8000)
```bash
cd backend
python scripts/run_api.py
```
Docs available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 2. Start the Frontend Dev Server (Port 5173)
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
```bash
npm run build
npm run preview
```

---

## Resilient Offline Support
The frontend connects automatically to the live FastAPI backend on port 8000. If the backend is loading or unavailable, the application gracefully operates using pre-bundled local data snapshots from `backend/data/processed/`, while clearly showing connection status in the header.
