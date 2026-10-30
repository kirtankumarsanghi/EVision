import {
  CityRanking,
  CityRegistrationPoint,
  CityFeatures,
  DemandMetric,
  ForecastSummary,
  ForecastMonthlyPoint,
  M1Coefficient,
  M2Comparison,
  M2Confusion,
  StatsResponse,
  Manifest,
  SeamRow,
  VehicleSplit,
} from './types';

// Fallback snapshots for reliable offline / local preview
import hotspotsSnapshot from './data/snapshots/hotspots.json';
import forecastsSnapshot from './data/snapshots/forecasts.json';
import forecastsMonthlySnapshot from './data/snapshots/forecasts_monthly.json';
import featuresSnapshot from './data/snapshots/features.json';
import demandSnapshot from './data/snapshots/demand.json';
import m1CoefSnapshot from './data/snapshots/m1_coefficients.json';
import m2CompSnapshot from './data/snapshots/m2_comparison.json';
import m2ConfSnapshot from './data/snapshots/m2_confusion.json';
import manifestSnapshot from './data/snapshots/manifest.json';
import seamSnapshot from './data/snapshots/seam.json';
import vehicleSplitSnapshot from './data/snapshots/vehicle_split.json';
import statsSnapshot from './data/snapshots/stats.json';
import registrationsSnapshot from './data/snapshots/registrations.json';
import citiesSnapshot from './data/snapshots/cities.json';
import indiaMapData from './data/india_map_data.json';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export interface BackendStatus {
  online: boolean;
  message?: string;
  datasets?: Record<string, boolean>;
}

async function safeFetch<T>(endpoint: string, fallbackData: T): Promise<{ data: T; isLive: boolean }> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const json = await res.json();
      return { data: (json.rows || json.cities || json) as T, isLive: true };
    }
  } catch (err) {
    // Backend offline or network failure, use fallback
  }
  return { data: fallbackData, isLive: false };
}

export const api = {
  async checkHealth(): Promise<BackendStatus> {
    try {
      const res = await fetch(`${API_BASE}/health`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const json = await res.json();
        return { online: true, datasets: json.datasets };
      }
    } catch (e) {
      // offline
    }
    return { online: false, message: 'Backend unreachable (using pre-built analytical datasets)' };
  },

  async getHotspots(top: number = 51): Promise<{ data: CityRanking[]; isLive: boolean }> {
    const res = await safeFetch<{ rows?: CityRanking[] } | CityRanking[]>(
      `/hotspots?top=${top}`,
      hotspotsSnapshot as unknown as CityRanking[]
    );
    const list = Array.isArray(res.data) ? res.data : (res.data as any).rows || [];
    return { data: list.slice(0, top), isLive: res.isLive };
  },

  async getCities(): Promise<{ data: Array<{ city: string; state_code: string; first_month: string; last_month: string; months: number; total_ev: number }>; isLive: boolean }> {
    const fallback = (citiesSnapshot as any).cities || [];
    const res = await safeFetch<any>('/cities', fallback);
    const list = Array.isArray(res.data) ? res.data : res.data.cities || fallback;
    return { data: list, isLive: res.isLive };
  },

  async getCityRegistrations(city: string): Promise<{ data: CityRegistrationPoint[]; isLive: boolean }> {
    const fallback = (registrationsSnapshot as Record<string, CityRegistrationPoint[]>)[city] || [];
    const res = await safeFetch<any>(`/registrations/${encodeURIComponent(city)}`, { series: fallback });
    const series = res.data.series || (Array.isArray(res.data) ? res.data : fallback);
    return { data: series, isLive: res.isLive };
  },

  async getDemand(): Promise<{ data: DemandMetric[]; isLive: boolean }> {
    const res = await safeFetch<any>('/demand', demandSnapshot as unknown as DemandMetric[]);
    const list = Array.isArray(res.data) ? res.data : res.data.rows || (demandSnapshot as unknown as DemandMetric[]);
    return { data: list, isLive: res.isLive };
  },

  async getFeatures(): Promise<{ data: CityFeatures[]; isLive: boolean }> {
    const res = await safeFetch<any>('/features', featuresSnapshot as unknown as CityFeatures[]);
    const list = Array.isArray(res.data) ? res.data : res.data.rows || (featuresSnapshot as unknown as CityFeatures[]);
    return { data: list, isLive: res.isLive };
  },

  async getForecasts(): Promise<{ data: ForecastSummary[]; isLive: boolean }> {
    const res = await safeFetch<any>('/forecasts', forecastsSnapshot as unknown as ForecastSummary[]);
    const list = Array.isArray(res.data) ? res.data : res.data.rows || (forecastsSnapshot as unknown as ForecastSummary[]);
    return { data: list, isLive: res.isLive };
  },

  async getMonthlyForecasts(city?: string): Promise<{ data: ForecastMonthlyPoint[]; isLive: boolean }> {
    const endpoint = city ? `/forecasts/monthly?city=${encodeURIComponent(city)}` : '/forecasts/monthly';
    const fallback = forecastsMonthlySnapshot as unknown as ForecastMonthlyPoint[];
    const res = await safeFetch<any>(endpoint, fallback);
    let list = Array.isArray(res.data) ? res.data : res.data.rows || fallback;
    if (city) {
      list = list.filter((p: ForecastMonthlyPoint) => p.city.toLowerCase() === city.toLowerCase());
    }
    return { data: list, isLive: res.isLive };
  },

  async getStats(): Promise<{ data: StatsResponse; isLive: boolean }> {
    const res = await safeFetch<StatsResponse>('/stats', statsSnapshot as unknown as StatsResponse);
    return { data: res.data, isLive: res.isLive };
  },

  async getManifest(): Promise<{ data: Manifest; isLive: boolean }> {
    const res = await safeFetch<Manifest>('/meta', manifestSnapshot as unknown as Manifest);
    return { data: res.data, isLive: res.isLive };
  },

  async getModelsSummary(): Promise<{
    m1_coefficients: M1Coefficient[];
    m2_comparison: M2Comparison[];
    m2_confusion: M2Confusion[];
    isLive: boolean;
  }> {
    const fallback = {
      m1_coefficients: m1CoefSnapshot as unknown as M1Coefficient[],
      m2_comparison: m2CompSnapshot as unknown as M2Comparison[],
      m2_confusion: m2ConfSnapshot as unknown as M2Confusion[],
    };
    const res = await safeFetch<any>('/models/summary', fallback);
    return {
      m1_coefficients: res.data.m1_coefficients || fallback.m1_coefficients,
      m2_comparison: res.data.m2_comparison || fallback.m2_comparison,
      m2_confusion: res.data.m2_confusion || fallback.m2_confusion,
      isLive: res.isLive,
    };
  },

  async getSeam(): Promise<{ data: SeamRow[]; isLive: boolean }> {
    const res = await safeFetch<any>('/seam', seamSnapshot as unknown as SeamRow[]);
    const list = Array.isArray(res.data) ? res.data : res.data.rows || (seamSnapshot as unknown as SeamRow[]);
    return { data: list, isLive: res.isLive };
  },

  getVehicleSplit(city?: string): VehicleSplit[] {
    const data = vehicleSplitSnapshot as unknown as VehicleSplit[];
    if (city) {
      return data.filter((d) => d.city.toLowerCase() === city.toLowerCase());
    }
    return data;
  },

  getMapStaticData() {
    return indiaMapData;
  },
};
