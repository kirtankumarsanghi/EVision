# Improvement experiments — M1 and M2

## M2

| Label | Model | n | AUC | PR-AUC | Accuracy | F1 | Brier | Log loss | Cal. slope |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| extremes | Expanded ExtraTrees | 34 | 0.981 | 0.984 | 0.935 | 0.933 | 0.077 | 0.281 | 2.85 |
| extremes | Expanded logistic (elastic net) | 34 | 0.967 | 0.974 | 0.912 | 0.904 | 0.082 | 0.283 | 2.24 |
| extremes | Expanded LDA (shrinkage) | 34 | 0.953 | 0.968 | 0.909 | 0.900 | 0.074 | 0.402 | 0.49 |
| extremes | Baseline LDA (current features) | 34 | 0.911 | 0.924 | 0.829 | 0.816 | 0.130 | 0.438 | 0.54 |
| extremes | Expanded GradientBoosting | 34 | 0.904 | 0.889 | 0.868 | 0.874 | 0.126 | 1.201 | 0.20 |
| extremes | Baseline logistic (current features) | 34 | 0.897 | 0.907 | 0.771 | 0.761 | 0.134 | 0.398 | 1.06 |
| measured | Expanded ExtraTrees | 42 | 0.975 | 0.976 | 0.898 | 0.893 | 0.090 | 0.317 | 2.94 |
| measured | Expanded LDA (shrinkage) | 42 | 0.927 | 0.950 | 0.910 | 0.904 | 0.087 | 0.414 | 0.51 |
| measured | Expanded GradientBoosting | 42 | 0.923 | 0.926 | 0.910 | 0.909 | 0.089 | 0.778 | 0.24 |
| measured | Expanded logistic (elastic net) | 42 | 0.923 | 0.949 | 0.902 | 0.897 | 0.104 | 0.352 | 1.48 |
| measured | Baseline LDA (current features) | 42 | 0.871 | 0.898 | 0.848 | 0.836 | 0.134 | 0.488 | 0.62 |
| measured | Baseline logistic (current features) | 42 | 0.861 | 0.885 | 0.802 | 0.797 | 0.148 | 0.465 | 0.95 |
| median | Expanded ExtraTrees | 51 | 0.923 | 0.834 | 0.873 | 0.871 | 0.118 | 0.407 | 1.80 |
| median | Expanded LDA (shrinkage) | 51 | 0.903 | 0.850 | 0.882 | 0.877 | 0.110 | 0.504 | 0.48 |
| median | Expanded logistic (elastic net) | 51 | 0.902 | 0.866 | 0.875 | 0.868 | 0.125 | 0.412 | 1.16 |
| median | Expanded GradientBoosting | 51 | 0.871 | 0.793 | 0.818 | 0.820 | 0.152 | 0.682 | 0.36 |
| median | Baseline LDA (current features) | 51 | 0.833 | 0.773 | 0.800 | 0.780 | 0.165 | 0.589 | 0.55 |
| median | Baseline logistic (current features) | 51 | 0.809 | 0.752 | 0.769 | 0.753 | 0.177 | 0.564 | 0.72 |

Continuous demand model (GradientBoosting on log demand):

- R²: 0.539
- Spearman: 0.774
- AUC when thresholded at the median: 0.894

## M1

| Model | Terms | Offset | n | LOOCV MAE | RMSE | R² | Spearman |
|---|---:|---|---:|---:|---:|---:|---:|
| Baseline (8 core terms) | 8 | False | 51 | 404 | 757 | 0.600 | 0.819 |
| Structural (12 terms) | 12 | False | 51 | 391 | 710 | 0.648 | 0.846 |
| Production M1a (14 terms) | 14 | False | 51 | 288 | 397 | 0.890 | 0.838 |