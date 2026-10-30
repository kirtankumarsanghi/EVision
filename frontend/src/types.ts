export type SplitMethod = 'measured' | 'state' | 'national';

export type RecommendationTier = 'Critical' | 'High' | 'Moderate' | 'Low';

export interface CityRanking {
  rank: number;
  city: string;
  state_code: string;
  ev_stock: number;
  ev_to_charger_ratio: number;
  ev_to_charger_ratio_10km: number;
  effective_public_demand: number;
  effective_public_demand_10km: number;
  stations_10km: number;
  fast_10km: number;
  ev_share_pct: number;
  split_method: SplitMethod;
  growth_12m: number;
  m1_expected_monthly: number;
  p_high: number;
  forecast_growth: number;
  forecast_12m: number;
  winner: 'SARIMA' | 'Holt-Winters';
  forecast_quality: 'ok' | 'weak' | 'unstable';
  m3_source: string;
  z_m1: number;
  z_m3: number;
  cds: number;
  recommendation: string;
}

export interface CityRegistrationPoint {
  date: string;
  ev_registrations: number;
  ev_stock: number;
  mom_growth?: number | null;
  yoy_growth?: number | null;
  observed?: boolean;
  imputed?: boolean;
  is_outlier?: boolean;
}

export interface CityFeatures {
  city: string;
  state_code: string;
  months_observed: number;
  ev_total_registrations: number;
  avg_monthly_registrations: number;
  ev_stock: number;
  latest_month: string;
  latest_month_registrations: number;
  ev_last_12m: number;
  ev_prev_12m: number;
  growth_12m: number;
  market_total_registrations: number;
  ev_share_mean: number;
  ev_share_latest: number;
  commercial_share_mean: number;
  market_2w_share: number;
  market_3w_share: number;
  market_4w_share: number;
  non_ev_total_registrations: number;
  ev_share_pct: number;
  stations_within_radius: number;
  connectors: number;
  fast_stations: number;
  share_fast_pct: number;
  radius_km: number;
  ev_to_charger_ratio: number;
  stations_10km: number;
  connectors_10km: number;
  fast_10km: number;
  cpos_10km: number;
  share_fast_10km: number;
  ev_to_charger_ratio_10km: number;
  /* Optional columns present in the processed feature table. */
  stations_5km?: number;
  connectors_5km?: number;
  fast_5km?: number;
  cpos_5km?: number;
  max_kw_p90_5km?: number;
  share_fast_5km?: number;
  max_kw_p90_10km?: number;
  ev_per_fast_10km?: number;
  effective_public_demand_10km?: number;
  pop_2011: number;
  area_km2_2011: number;
  population_density: number;
  pop_estimate_2023: number;
  boundary_type: string;
  demographic_verified: boolean;
  boundary_harmonised?: boolean | string;
  fuel_price_inr_per_litre: number;
  fuel_price_date: string;
  ev_policy_score: number;
  policy_name: string;
  policy_status: string;
  policy_verified: boolean | string;
  highway_corridor: number;
  tier: string;
  summer_max_temp_c: number;
  temperature_source: string;
  per_capita_income_inr: number;
  income_vintage: string;
  weighted_ev_stock: number;
  commercial_fleet_share: number;
  effective_public_demand: number;
  split_method: SplitMethod;
}

export interface DemandMetric {
  city: string;
  weighted_ev_stock: number;
  stations_within_radius: number;
  effective_public_demand: number;
  split_method: SplitMethod;
  charger_scope: string;
  has_chargers: boolean;
  stations_10km?: number;
  fast_10km?: number;
  ev_to_charger_ratio_10km?: number;
}

export interface ForecastSummary {
  city: string;
  winner: 'SARIMA' | 'Holt-Winters';
  order: string;
  seasonal_order: string;
  d: number;
  aic: number;
  sarima_rmse: number;
  hw_rmse: number;
  sarima_mae: number;
  hw_mae: number;
  last_12m: number;
  forecast_12m: number;
  forecast_growth: number;
  sarima_forecast_12m: number;
  sarima_forecast_growth: number;
  hw_forecast_12m: number;
  hw_forecast_growth: number;
  sarima_status: string;
  hw_status: string;
  holdout_rmse_rel: number;
  forecast_quality: 'ok' | 'weak' | 'unstable';
  bias_correction_factor: number;
  bias_corrected: boolean;
  skip_reason?: string;
}

export interface ForecastMonthlyPoint {
  city: string;
  date: string;
  forecast: number;
}

export interface M1Coefficient {
  term: string;
  coef: number;
  std_err: number;
  z: number;
  p_value: number;
  irr: number;
  irr_lo: number;
  irr_hi: number;
}

export interface M2Comparison {
  model: 'LDA' | 'Logistic';
  auc_mean: number;
  auc_sd: number;
  auc_p05: number;
  auc_p95: number;
  train_auc: number;
  train_cv_gap: number;
  accuracy: number;
  f1: number;
  precision: number;
  recall: number;
  loocv_accuracy: number;
}

export interface M2Confusion {
  model: string;
  evaluation: string;
  tn: number;
  fp: number;
  fn: number;
  tp: number;
}

export interface StatsResponse {
  city_months: number;
  mean: number;
  median: number;
  variance: number;
  std_dev: number;
  skew: number;
  p95: number;
  city_z_scores: Array<{
    city: string;
    state_code: string;
    mean_monthly: number;
    median_monthly: number;
    std_monthly: number;
    var_monthly: number;
    sum_monthly: number;
    count_monthly: number;
    z_score: number;
    is_outlier_city: boolean;
  }>;
  national_monthly: Record<string, number>;
}

export interface Manifest {
  built_at: string;
  source: string;
  rows: number;
  cities: number;
  configured_cities: number;
  cities_without_covariates: string[];
  months_per_city: number;
  date_min: string;
  date_max: string;
  observed_share: number;
  imputed_months: number;
  panel_sources: Record<string, number>;
  cities_without_2021: string[];
  unobserved_rows: number;
  model_rows_dropped: number;
  unobserved_by_city: Record<string, number>;
  unobserved_reason: string;
  outliers_flagged?: number;
  stock_regressions?: number;
}

export interface SeamRow {
  city: string;
  dec_2021?: number;
  jan_2022?: number;
  month_ratio?: number;
  mean_2021?: number;
  mean_2022?: number;
  level_ratio?: number;
  seam_flag?: boolean;
}

export interface VehicleSplit {
  city: string;
  state_code: string;
  year: number;
  bucket: '2W' | '3W' | '4W' | 'COMM' | 'OTHER';
  ev_registrations: number;
}

/* ------------------------------------------------------------------ *
 * Requirements-first planner
 * ------------------------------------------------------------------ */

export type PlanMode = 'plan' | 'explore';
export type PlanStage = 'wizard' | 'results';
export type TabType =
  | 'overview'
  | 'map'
  | 'hotspots'
  | 'demand'
  | 'city'
  | 'forecast';
export type CityClass = 'all' | 'metro' | 'tier2';
export type CorridorPreference = 'any' | 'highway' | 'urban';
export type SegmentFocus = 'mixed' | '2W' | '3W' | '4W';
export type SupplyScope = '5km' | '10km' | 'circle';
export type AllocationStrategy = 'balanced' | 'deficit' | 'growth' | 'volume';
export type DeploymentHorizon = 6 | 12 | 24;

export interface ScenarioInput {
  company: string;
  budgetCr: number;
  targetUnits: number;
  dcPct: number;
  cityClass: CityClass;
  states: string[];
  corridor: CorridorPreference;
  segment: SegmentFocus;
  supplyScope: SupplyScope;
  strategy: AllocationStrategy;
  weightM1: number;
  weightM2: number;
  weightM3: number;
  measuredSplitOnly: boolean;
  stableForecastOnly: boolean;
  harmonisedOnly: boolean;
  minEvStock: number;
  horizon: DeploymentHorizon;
  topN: number;
}

export interface Weights {
  m1: number;
  m2: number;
  m3: number;
}

export interface CityConfidence {
  split: 'measured' | 'state' | 'national';
  forecast: 'ok' | 'weak' | 'unstable';
  boundary: 'harmonised' | 'estimated';
  policy: 'verified' | 'provisional';
}

export interface CityAllocation {
  rank: number;
  city: string;
  state_code: string;
  cds: number;
  recommendation: string;
  zM1: number;
  pHigh: number;
  zM3: number;
  contributions: { m1: number; m2: number; m3: number };
  evStock: number;
  demand: number;
  stations: number;
  growth: number;
  projectedGrowth: number;
  winner: string;
  segmentShare: number | null;
  segmentProxy: boolean;
  tier: string;
  highway: boolean;
  policyStatus: string;
  policyVerified: boolean;
  confidence: CityConfidence;
  units: number;
  fastUnits: number;
  acUnits: number;
  sharePct: number;
  capexCr: number;
  reasons: string[];
}

export interface ScenarioTotals {
  markets: number;
  considered: number;
  excluded: number;
  units: number;
  fastUnits: number;
  acUnits: number;
  capexCr: number;
  evServed: number;
  budgetCr: number;
  budgetLimited: boolean;
  requestedUnits: number;
  affordableUnits: number;
  avgGrowth: number;
  coveragePct: number;
}

export interface ExcludedCity {
  city: string;
  reason: string;
}

export interface ScenarioResult {
  input: ScenarioInput;
  weights: Weights;
  dcPct: number;
  cities: CityAllocation[];
  excluded: ExcludedCity[];
  totals: ScenarioTotals;
}
