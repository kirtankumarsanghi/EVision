import {
  AllocationStrategy,
  CityAllocation,
  CityFeatures,
  CityRanking,
  DeploymentHorizon,
  ExcludedCity,
  ScenarioInput,
  ScenarioResult,
  SegmentFocus,
  SupplyScope,
  VehicleSplit,
  Weights,
} from '../types';
import { affordableUnits, capexCrFor, EVS_PER_PLUG } from './assumptions';
import { confidenceOf, truthy } from './confidence';

export const DEFAULT_SCENARIO: ScenarioInput = {
  company: '',
  budgetCr: 2500,
  targetUnits: 25000,
  dcPct: 35,
  cityClass: 'all',
  states: [],
  corridor: 'any',
  segment: 'mixed',
  supplyScope: '10km',
  strategy: 'balanced',
  weightM1: 0.4,
  weightM2: 0.3,
  weightM3: 0.3,
  measuredSplitOnly: false,
  stableForecastOnly: true,
  harmonisedOnly: false,
  minEvStock: 0,
  horizon: 12,
  topN: 10,
};

export interface ScenarioData {
  hotspots: CityRanking[];
  features: CityFeatures[];
  vehicleSplits: VehicleSplit[];
}

export function normalizeWeights(m1: number, m2: number, m3: number): Weights {
  const total = m1 + m2 + m3;
  if (!Number.isFinite(total) || total <= 0) return { m1: 1 / 3, m2: 1 / 3, m3: 1 / 3 };
  return { m1: m1 / total, m2: m2 / total, m3: m3 / total };
}

/**
 * Largest-remainder apportionment: every unit is assigned exactly once, so the
 * per-city allocation always sums to the requested total.
 */
export function allocateLargestRemainder(total: number, shares: number[]): number[] {
  if (total <= 0 || shares.length === 0) return shares.map(() => 0);
  const sum = shares.reduce((acc, s) => acc + Math.max(s, 0), 0);
  if (sum <= 0) return shares.map(() => 0);

  const exact = shares.map((s) => (Math.max(s, 0) / sum) * total);
  const floors = exact.map((v) => Math.floor(v));
  let remaining = total - floors.reduce((acc, v) => acc + v, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  let cursor = 0;
  while (remaining > 0) {
    floors[order[cursor % order.length].i] += 1;
    remaining -= 1;
    cursor += 1;
  }
  return floors;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface SplitInfo {
  year: number;
  shares: Record<'2W' | '3W' | '4W' | 'COMM', number>;
  total: number;
}

/** Latest measured year of EV registrations by vehicle bucket, per city. */
export function segmentSharesByCity(rows: VehicleSplit[]): Record<string, SplitInfo> {
  const byCity: Record<string, Record<number, Record<string, number>>> = {};

  for (const row of rows) {
    if (row.bucket === 'OTHER') continue;
    const key = row.city.toLowerCase();
    byCity[key] ??= {};
    byCity[key][row.year] ??= { '2W': 0, '3W': 0, '4W': 0, COMM: 0 };
    byCity[key][row.year][row.bucket] += row.ev_registrations || 0;
  }

  const out: Record<string, SplitInfo> = {};
  for (const [key, years] of Object.entries(byCity)) {
    const latest = Math.max(...Object.keys(years).map(Number));
    const buckets = years[latest];
    const total = buckets['2W'] + buckets['3W'] + buckets['4W'] + buckets.COMM;
    if (total <= 0) continue;
    out[key] = {
      year: latest,
      total,
      shares: {
        '2W': buckets['2W'] / total,
        '3W': buckets['3W'] / total,
        '4W': buckets['4W'] / total,
        COMM: buckets.COMM / total,
      },
    };
  }
  return out;
}

/** Hardware mix nudges toward the segment the company is chasing. */
export function adjustedDcPct(base: number, segment: SegmentFocus): number {
  const delta = segment === '2W' ? -10 : segment === '3W' ? 5 : segment === '4W' ? 15 : 0;
  return Math.min(80, Math.max(10, Math.round(base + delta)));
}

export function projectedGrowth(growth12m: number, horizon: DeploymentHorizon): number {
  const years = horizon / 12;
  const base = 1 + (Number.isFinite(growth12m) ? growth12m : 0);
  if (base <= 0) return -1;
  return Math.pow(base, years) - 1;
}

function demandForScope(scope: SupplyScope, city: CityRanking, f?: CityFeatures): number {
  if (scope === 'circle') {
    return num(f?.effective_public_demand) ?? city.effective_public_demand ?? 0;
  }
  if (scope === '10km') {
    return num(f?.effective_public_demand_10km) ?? city.effective_public_demand_10km ?? 0;
  }
  const weighted = num(f?.weighted_ev_stock);
  const stations5 = num(f?.stations_5km);
  if (weighted !== null && stations5 !== null && stations5 > 0) return weighted / stations5;
  return num(f?.effective_public_demand_10km) ?? city.effective_public_demand_10km ?? 0;
}

function stationsForScope(scope: SupplyScope, city: CityRanking, f?: CityFeatures): number {
  if (scope === 'circle') return num(f?.stations_within_radius) ?? city.stations_10km ?? 0;
  if (scope === '10km') return num(f?.stations_10km) ?? city.stations_10km ?? 0;
  return num(f?.stations_5km) ?? city.stations_10km ?? 0;
}

function segmentShareFor(
  segment: SegmentFocus,
  splits: Record<string, SplitInfo>,
  city: string,
  f?: CityFeatures
): { share: number | null; proxy: boolean } {
  if (segment === 'mixed') return { share: null, proxy: false };

  const measured = splits[city.toLowerCase()];
  if (measured) return { share: measured.shares[segment] * 100, proxy: false };

  const fallback: Record<Exclude<SegmentFocus, 'mixed'>, unknown> = {
    '2W': f?.market_2w_share,
    '3W': f?.market_3w_share,
    '4W': f?.market_4w_share,
  };
  const n = num(fallback[segment]);
  return { share: n === null ? null : n * 100, proxy: true };
}

function exclusionReason(
  input: ScenarioInput,
  city: CityRanking,
  f: CityFeatures | undefined
): string | null {
  if (!f) return 'No city profile in the feature table';

  if (input.cityClass !== 'all' && String(f.tier).toLowerCase() !== input.cityClass) {
    return `City class is ${f.tier || 'unknown'}, not ${input.cityClass}`;
  }
  if (input.states.length > 0 && !input.states.includes(city.state_code)) {
    return `State ${city.state_code} outside the selected region`;
  }
  if (input.corridor === 'highway' && !truthy(f.highway_corridor)) {
    return 'Not on a highway corridor';
  }
  if (input.corridor === 'urban' && truthy(f.highway_corridor)) {
    return 'Highway corridor excluded by urban-only preference';
  }
  if (input.measuredSplitOnly && city.split_method !== 'measured') {
    return `Vehicle split is a ${city.split_method} proxy`;
  }
  if (input.stableForecastOnly && city.forecast_quality !== 'ok') {
    return `Forecast quality is ${city.forecast_quality}`;
  }
  if (input.harmonisedOnly && !truthy(f.boundary_harmonised)) {
    return 'City boundary is not harmonised';
  }
  if (city.ev_stock < input.minEvStock) {
    return `Fleet below ${input.minEvStock.toLocaleString()} EVs`;
  }
  return null;
}

function allocationWeight(c: CityAllocation, strategy: AllocationStrategy, minCds: number): number {
  switch (strategy) {
    case 'deficit':
      return Math.max(c.demand, 1);
    case 'growth':
      return Math.max(c.growth * 100, 5);
    case 'volume':
      return Math.max(c.evStock, 1000);
    case 'balanced':
    default:
      return Math.max(c.cds - minCds + 0.5, 0.05);
  }
}

export function buildScenario(input: ScenarioInput, data: ScenarioData): ScenarioResult {
  const weights = normalizeWeights(input.weightM1, input.weightM2, input.weightM3);
  const dcPct = adjustedDcPct(input.dcPct, input.segment);

  const featureByCity = new Map<string, CityFeatures>();
  for (const f of data.features) featureByCity.set(f.city.toLowerCase(), f);

  const splits = segmentSharesByCity(data.vehicleSplits);
  const excluded: ExcludedCity[] = [];
  const scored: CityAllocation[] = [];

  for (const city of data.hotspots) {
    const f = featureByCity.get(city.city.toLowerCase());
    const reason = exclusionReason(input, city, f);
    if (reason) {
      excluded.push({ city: city.city, reason });
      continue;
    }

    // Published CDS uses these same global z-scores; default weights reproduce it exactly.
    const zM1 = Number(city.z_m1) || 0;
    const pHigh = Number(city.p_high) || 0;
    const zM3 = Number(city.z_m3) || 0;
    const cds = weights.m1 * zM1 + weights.m2 * pHigh + weights.m3 * zM3;

    const timeseries = f as CityFeatures;
    const demand = demandForScope(input.supplyScope, city, timeseries);
    const stations = stationsForScope(input.supplyScope, city, timeseries);
    const seg = segmentShareFor(input.segment, splits, city.city, timeseries);
    const growth = Number(city.forecast_growth) || 0;
    const projected = projectedGrowth(growth, input.horizon);

    const recommendation =
      cds >= 1.5
        ? 'Critical — immediate fast-charger deployment'
        : cds >= 0.75
        ? 'High — prioritise in the next wave'
        : cds >= 0
        ? 'Moderate — monitor and plan'
        : 'Low — not enough activity yet';

    const reasons: string[] = [];
    reasons.push(
      `${Math.round(zM1 * 100) / 100} σ current volume, ${(pHigh * 100).toFixed(1)}% high-demand propensity, ${(zM3 * 100) / 100} σ forward growth`
    );
    reasons.push(
      `${Math.round(city.ev_stock).toLocaleString()} EVs against ${stations.toLocaleString()} public stations within ${
        input.supplyScope === 'circle' ? 'the city circle' : input.supplyScope
      }`
    );
    reasons.push(
      `${(growth * 100).toFixed(1)}% forecast over 12 months (${city.winner}${
        input.horizon === 12 ? '' : `, extrapolated to ${input.horizon}m`
      })`
    );
    if (input.segment !== 'mixed' && seg.share !== null) {
      reasons.push(
        `${seg.share.toFixed(1)}% of new EVs are ${input.segment}${seg.proxy ? ' (proxy)' : ' (measured)'}`
      );
    }

    scored.push({
      rank: 0,
      city: city.city,
      state_code: city.state_code,
      cds,
      recommendation,
      zM1,
      pHigh,
      zM3,
      contributions: { m1: weights.m1 * zM1, m2: weights.m2 * pHigh, m3: weights.m3 * zM3 },
      evStock: city.ev_stock,
      demand,
      stations,
      growth,
      projectedGrowth: projected,
      winner: city.winner,
      segmentShare: seg.share,
      segmentProxy: seg.proxy,
      tier: String(timeseries.tier || 'unknown'),
      highway: truthy(timeseries.highway_corridor),
      policyStatus: String(timeseries.policy_status || 'Unknown'),
      policyVerified: truthy(timeseries.policy_verified),
      confidence: confidenceOf(city, timeseries),
      units: 0,
      fastUnits: 0,
      acUnits: 0,
      sharePct: 0,
      capexCr: 0,
      reasons,
    });
  }

  scored.sort((a, b) => b.cds - a.cds);
  const selected = scored.slice(0, Math.max(1, input.topN)).map((c, i) => ({ ...c, rank: i + 1 }));

  const affordable = affordableUnits(input.budgetCr, dcPct);
  const requested = Math.max(0, input.targetUnits);
  const unitsToAllocate = Math.min(requested, affordable);
  const budgetLimited = affordable < requested;

  const minCds = selected.reduce((m, c) => Math.min(m, c.cds), Number.POSITIVE_INFINITY);
  const weightsForAllocation = selected.map((c) =>
    allocationWeight(c, input.strategy, Number.isFinite(minCds) ? minCds : 0)
  );
  const unitShares = allocateLargestRemainder(unitsToAllocate, weightsForAllocation);

  const cities = selected.map((c, i) => {
    const units = unitShares[i] || 0;
    const fastUnits = Math.round(units * (dcPct / 100));
    const acUnits = units - fastUnits;
    return {
      ...c,
      units,
      fastUnits,
      acUnits,
      sharePct: unitsToAllocate > 0 ? (units / unitsToAllocate) * 100 : 0,
      capexCr: capexCrFor(units, dcPct),
    };
  });

  const totalUnits = cities.reduce((a, c) => a + c.units, 0);
  const totalFast = cities.reduce((a, c) => a + c.fastUnits, 0);
  const totalAc = cities.reduce((a, c) => a + c.acUnits, 0);
  const totalCapex = cities.reduce((a, c) => a + c.capexCr, 0);
  const avgGrowth =
    cities.length > 0 ? cities.reduce((a, c) => a + c.growth, 0) / cities.length : 0;
  const strongConfidence = cities.filter(
    (c) => c.confidence.split === 'measured' && c.confidence.forecast === 'ok'
  ).length;

  return {
    input,
    weights,
    dcPct,
    cities,
    excluded,
    totals: {
      markets: cities.length,
      considered: data.hotspots.length,
      excluded: excluded.length,
      units: totalUnits,
      fastUnits: totalFast,
      acUnits: totalAc,
      capexCr: Math.round(totalCapex),
      evServed: Math.round(totalUnits * EVS_PER_PLUG),
      budgetCr: input.budgetCr,
      budgetLimited,
      requestedUnits: requested,
      affordableUnits: affordable,
      avgGrowth,
      coveragePct: cities.length > 0 ? (strongConfidence / cities.length) * 100 : 0,
    },
  };
}

/**
 * Development guard: the default weighting must reproduce the published CDS.
 * Logs once if any city drifts, which would mean the published ranking and the
 * planner disagree.
 */
export function verifyPublishedParity(hotspots: CityRanking[]): number {
  let worst = 0;
  for (const city of hotspots) {
    const computed =
      0.4 * (Number(city.z_m1) || 0) + 0.3 * (Number(city.p_high) || 0) + 0.3 * (Number(city.z_m3) || 0);
    worst = Math.max(worst, Math.abs(computed - Number(city.cds)));
  }
  return worst;
}
