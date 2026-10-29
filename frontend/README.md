# EVision — Frontend

Placeholder. The backend, data pipeline and models are complete; this folder is
intentionally empty until the dashboard is built.

## What will live here

A dashboard over the backend API (`backend/src/evision/api/main.py`):

- **Hotspot ranking** — top-15 table from `/hotspots`
- **Map** — the Charging Demand Score choropleth (a static version already exists
  at `backend/reports/cds_map.html`)
- **Gap analysis** — effective public demand per charger from `/demand`
- **City detail** — monthly series and cumulative stock from
  `/registrations/{city}`
- **Forecast** — 12-month SARIMA/Holt-Winters outlook from `/forecasts`

## API contract

Start the backend with `python scripts/run_api.py` (port 8000, docs at `/docs`).

| Endpoint | Purpose |
|---|---|
| `GET /health` | which datasets exist |
| `GET /meta` | build manifest |
| `GET /provenance` | source ledger |
| `GET /cities` | city summary with totals |
| `GET /panel?city=&start=&end=` | city-month rows |
| `GET /registrations/{city}` | time series for one city |
| `GET /stats` | descriptive statistics + city z-scores |
| `GET /features` | 40-column feature table |
| `GET /chargers` | charger snapshot |
| `GET /demand` | effective public demand per charger |
| `GET /forecasts` | per-city 12-month forecast |
| `GET /hotspots?top=15` | Charging Demand Score ranking |

`/hotspots` returns the fitted composite score:

```
CDS = 0.4·z(M1 expected monthly) + 0.3·P(high demand) + 0.3·z(M3 growth)
```

Each row also carries `split_method` (`measured` / `state` / `national`) so the
UI can badge cities whose 2W/3W/4W mix was inferred rather than observed.
