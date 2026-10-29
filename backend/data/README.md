# Data

Everything the project reads or writes lives under this single folder.

```
data/
├── source/        inputs, grouped by domain  (see source/README.md)
│   ├── registrations/
│   ├── supply/
│   ├── demographics/
│   ├── prices/
│   ├── policy/
│   ├── geo/
│   └── _archive/  lineage-only files, never read by code
├── raw/           cached upstream responses (regenerable; 149 MB)
├── processed/     every pipeline output
├── provenance/    ledger.json — fetch log with checksums
├── USER_DATASET.md   column dictionary for the panels and features
└── source/README.md  source-file lineage
```

## Which files are what

| Folder | Keep in a submission? | Notes |
|---|---|---|
| `source/` | **Yes** | The only hand-curated inputs. |
| `source/_archive/` | Optional | Needed only to explain where derived files came from. |
| `raw/` | No | Regenerable cache, but required for offline rebuilds of 2021. |
| `processed/` | Yes | Deliverables: panels, features, model outputs, CDS. |
| `provenance/` | **Yes** | Every source fetch with a checksum. |

## Outputs, in build order

| File | Built by |
|---|---|
| `processed/user_city_month_panel.csv` | `scripts/build_user_dataset.py` |
| `processed/user_city_features.csv` | `scripts/build_user_dataset.py` |
| `processed/master_ev_panel.csv` | `scripts/build_master_panel.py` |
| `processed/vehicle_split.csv` | `scripts/build_vehicle_split.py` |
| `processed/features_model.csv` + `model_*.csv` + `cds_*.csv` | `scripts/run_models.py` |
| `processed/cds_ranking_top15.csv` | `scripts/run_models.py` |
| `processed/model_m*_sensitivity.csv` | `scripts/run_models.py` |
| `processed/model_m3_2022only.csv` | `scripts/diagnose_seam.py --with-m3` |
| `reports/seam_2021_2022.csv` | `scripts/diagnose_seam.py` |
| `reports/cds_map.html` | `scripts/make_map.py` |
| `reports/final_report.*`, `reports/eda.md`, `reports/final_deck.pptx` | reporting scripts |
| `notebooks/*.ipynb` | `scripts/build_notebooks.py` |
