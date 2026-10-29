# M3 improvement experiments

Rolling-origin: origin A estimates a bias factor; it is applied to origin B
(the current 9-month holdout).

| Method | n | Median RMSE | Median bias % |
|---|---:|---:|---:|
| level_hw_drift | 51 | 293 | 5.7% |
| ensemble_drift | 51 | 306 | 4.4% |
| level_sarima_drift | 51 | 316 | 1.5% |
| log_sarima | 51 | 353 | 22.2% |
| level_hw_corr | 51 | 365 | 16.4% |
| level_sarima_corr | 51 | 378 | 17.0% |
| log_sarima_corr | 51 | 383 | 6.3% |
| level_hw | 51 | 415 | 25.1% |
| level_sarima | 51 | 425 | 23.5% |
| log_hw_corr | 51 | 433 | 17.8% |
| ensemble | 51 | 471 | 27.5% |
| log_hw | 51 | 512 | 30.6% |