"""M1 - count models for monthly EV registrations.

Two models, because one cannot do both jobs honestly:

**M1a - drivers (between-city).** Aggregates to one row per city (n=51) and
regresses mean monthly registrations on city characteristics. This is the only
specification in which city-constant predictors (density, income, policy,
corridor, temperature) are identifiable. Answer: what is associated with a
city registering more EVs?

**M1b - expected level (panel with city fixed effects).** Monthly registrations
on city dummies + month dummies + the one time-varying predictor (fuel price).
City dummies absorb the unobserved local ecosystem - Delhi registers 6,264 EVs a
month while Kolkata, with a comparable population, registers 217. Without fixed
effects the pooled model over-predicted Kolkata by 18x and its fitted values are
unusable as a demand level.

M1b supplies the level used in the Charging Demand Score; M1a supplies the
interpretation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import statsmodels.api as sm

log = logging.getLogger(__name__)

RAW_FEATURES = [
    "pop_2011",
    "population_density",
    "per_capita_income_inr",
    "fuel_price_inr_per_litre",
    "ev_policy_score",
    "highway_corridor",
    "summer_max_temp_c",
    "non_ev_total_registrations",
]

DRIVER_TERMS = [
    "log_population",
    "log_density",
    "log_income",
    "log_non_ev_market",
    "mean_fuel_price",
    "ev_policy_score",
    "highway_corridor",
    "summer_max_temp_c",
]


@dataclass
class DriverResult:
    n: int
    alpha: float
    aic: float
    pseudo_r2: float
    poisson_dispersion: float
    poisson_aic: float
    coefficients: pd.DataFrame


@dataclass
class LevelResult:
    n_obs: int
    n_cities: int
    alpha: float
    corr_with_observed: float
    fitted: pd.DataFrame = field(default_factory=pd.DataFrame)


@dataclass
class CountModelResult:
    drivers: DriverResult
    level: LevelResult

    @property
    def coefficients(self) -> pd.DataFrame:
        return self.drivers.coefficients

    @property
    def fitted(self) -> pd.DataFrame:
        return self.level.fitted


def _base(panel: pd.DataFrame, features: pd.DataFrame) -> pd.DataFrame:
    available = [c for c in RAW_FEATURES if c in features.columns]
    keep = features[["city", *available]]
    df = panel[["city", "date", "ev_registrations"]].merge(keep, on="city", how="left")
    df["month"] = df["date"].dt.month
    return df


def _pseudo_r2(res) -> float:
    """statsmodels exposes this as a method in 0.15 and a property before it."""
    try:
        value = res.pseudo_rsquared
        return float(value() if callable(value) else value)
    except Exception:  # noqa: BLE001
        return float("nan")


def _pick_alpha(y, X, groups=None) -> tuple[object, float]:
    """Fit NegBin over a small alpha grid, choosing by AIC."""
    best = None
    for alpha in (0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0):
        try:
            fit_kwargs = {}
            if groups is not None:
                fit_kwargs = {"cov_type": "cluster", "cov_kwds": {"groups": groups}}
            res = sm.GLM(y, X, family=sm.families.NegativeBinomial(alpha=alpha)).fit(**fit_kwargs)
        except Exception:  # noqa: BLE001
            continue
        if np.isfinite(res.aic) and (best is None or res.aic < best[0].aic):
            best = (res, alpha)
    if best is None:
        raise RuntimeError("negative binomial failed to converge")
    return best


def fit_drivers(
    panel: pd.DataFrame,
    features: pd.DataFrame,
    exclude: set[str] = frozenset(),
) -> DriverResult:
    """Between-city model: one observation per city.

    ``exclude`` drops terms from the design matrix; used for the fuel-price
    sensitivity, where the variable is largely a time trend times a city
    constant rather than an observed price.
    """
    df = _base(panel, features)
    if "pop_2011" in df.columns:
        df["log_population"] = np.log(df["pop_2011"].clip(lower=1))
    if "population_density" in df.columns:
        df["log_density"] = np.log(df["population_density"].clip(lower=1))
    if "per_capita_income_inr" in df.columns:
        df["log_income"] = np.log(df["per_capita_income_inr"].clip(lower=1))
    if "non_ev_total_registrations" in df.columns:
        df["log_non_ev_market"] = np.log(
            df["non_ev_total_registrations"].clip(lower=1)
        )
    if "fuel_price_inr_per_litre" in df.columns:
        df["mean_fuel_price"] = df["fuel_price_inr_per_litre"]

    city = (
        df.groupby("city", as_index=False)
        .agg(**{"mean_monthly": ("ev_registrations", "mean")}
             | {t: (t, "first") for t in DRIVER_TERMS if t in df.columns})
        .dropna()
    )

    terms_present = [t for t in DRIVER_TERMS if t in city.columns and t not in exclude]
    y = city["mean_monthly"].astype(float).to_numpy()
    X = sm.add_constant(city[terms_present].astype(float))
    X = X.loc[:, X.std() > 0]  # drop any zero-variance column

    # Poisson first: the dispersion statistic justifies the NegBin upgrade.
    poisson = sm.GLM(y, X, family=sm.families.Poisson()).fit()
    dof = poisson.df_resid
    dispersion = float(poisson.pearson_chi2 / dof) if dof else float("nan")

    res, alpha = _pick_alpha(y, X)
    coef = pd.DataFrame(
        {
            "term": X.columns,
            "coef": res.params,
            "std_err": res.bse,
            "z": res.tvalues,
            "p_value": res.pvalues,
        }
    )
    coef["irr"] = np.exp(coef["coef"])
    coef["irr_lo"] = np.exp(coef["coef"] - 1.96 * coef["std_err"])
    coef["irr_hi"] = np.exp(coef["coef"] + 1.96 * coef["std_err"])
    coef = coef.sort_values("p_value").reset_index(drop=True)

    log.info(
        "M1a drivers: n=%d alpha=%.2f dispersion=%.1f pseudo-R2=%.3f",
        len(city), alpha, dispersion, _pseudo_r2(res),
    )
    return DriverResult(
        n=len(city),
        alpha=alpha,
        aic=float(res.aic),
        pseudo_r2=_pseudo_r2(res),
        poisson_dispersion=dispersion,
        poisson_aic=float(poisson.aic),
        coefficients=coef,
    )


def fit_levels(panel: pd.DataFrame, features: pd.DataFrame) -> LevelResult:
    """Panel model with city fixed effects, used for the CDS demand level."""
    df = _base(panel, features).dropna(subset=["ev_registrations"])
    df = df[df["ev_registrations"] >= 0].reset_index(drop=True)

    city_dummies = pd.get_dummies(df["city"], prefix="c", drop_first=True, dtype=float)
    month_dummies = pd.get_dummies(df["month"], prefix="m", drop_first=True, dtype=float)
    fuel = df[["fuel_price_inr_per_litre"]].astype(float).reset_index(drop=True)

    X = pd.concat([fuel, month_dummies.reset_index(drop=True), city_dummies.reset_index(drop=True)], axis=1)
    X = sm.add_constant(X, has_constant="add")
    y = df["ev_registrations"].astype(float).to_numpy()

    res, alpha = _pick_alpha(y, X)

    fitted = pd.DataFrame(
        {"city": df["city"], "date": df["date"],
         "observed": y, "fitted": np.asarray(res.fittedvalues)}
    )
    per_city = fitted.groupby("city")[["observed", "fitted"]].mean()
    corr = float(np.corrcoef(per_city["observed"], per_city["fitted"])[0, 1])

    log.info("M1b levels: n=%d cities=%d corr=%.3f", len(df), df["city"].nunique(), corr)
    return LevelResult(
        n_obs=len(df), n_cities=int(df["city"].nunique()),
        alpha=alpha, corr_with_observed=corr, fitted=fitted,
    )


def fit(panel: pd.DataFrame, features: pd.DataFrame) -> CountModelResult:
    return CountModelResult(
        drivers=fit_drivers(panel, features),
        level=fit_levels(panel, features),
    )
