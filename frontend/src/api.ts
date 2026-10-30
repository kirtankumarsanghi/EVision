import {
  CityRanking,
  CityRegistrationPoint,
  CityFeatures,
  DemandMetric,
  ForecastSummary,
  ForecastMonthlyPoint,
  StatsResponse,
  Manifest,
  VehicleSplit,
} from './types';

// Fallback snapshots for reliable offline / local preview
import hotspotsSnapshot from './data/snapshots/hotspots.json';
import forecastsSnapshot from './data/snapshots/forecasts.json';
import forecastsMonthlySnapshot from './data/snapshots/forecasts_monthly.json';
import featuresSnapshot from './data/snapshots/features.json';
import demandSnapshot from './data/snapshots/demand.json';
import manifestSnapshot from './data/snapshots/manifest.json';
import vehicleSplitSnapshot from './data/snapshots/vehicle_split.json';
import statsSnapshot from './data/snapshots/stats.json';
import citiesSnapshot from './data/snapshots/cities.json';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

/* Heavy snapshots (registrations, map geometry) are loaded on demand so they do
 * not sit in the initial bundle. */
let registrationsCache: Record<string, CityRegistrationPoint[]> | null = null;
async function loadRegistrations(): Promise<Record<string, CityRegistrationPoint[]>> {
  if (!registrationsCache) {
    const mod = await import('./data/snapshots/registrations.json');
    registrationsCache = mod.default as unknown as Record<string, CityRegistrationPoint[]>;
  }
  return registrationsCache;
}

export interface IndiaMapData {
  states: Array<{ name: string; path: string }>;
  city_coords: Record<string, [number, number]>;
}

let mapCache: IndiaMapData | null = null;

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
    try {
      const res = await fetch(`${API_BASE}/registrations/${encodeURIComponent(city)}`, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const json = await res.json();
        const series = json.series || (Array.isArray(json) ? json : []);
        if (series.length > 0) return { data: series, isLive: true };
      }
    } catch {
      /* fall through to snapshot */
    }

    const snapshot = await loadRegistrations();
    return { data: snapshot[city] || [], isLive: false };
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

  getVehicleSplit(city?: string): VehicleSplit[] {
    const data = vehicleSplitSnapshot as unknown as VehicleSplit[];
    if (city) {
      return data.filter((d) => d.city.toLowerCase() === city.toLowerCase());
    }
    return data;
  },

  async getMapStaticData(): Promise<IndiaMapData> {
    if (!mapCache) {
      const mod = await import('./data/india_map_data.json');
      mapCache = mod.default as unknown as IndiaMapData;
    }
    return mapCache;
  },
};
