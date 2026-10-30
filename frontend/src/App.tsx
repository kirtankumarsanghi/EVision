import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Navigation, TabType } from './components/Navigation';
import { OverviewView } from './components/OverviewView';
import { MapView } from './components/MapView';
import { AllocationsView } from './components/AllocationsView';
import { HotspotsView } from './components/HotspotsView';
import { DemandGapView } from './components/DemandGapView';
import { CityDetailView } from './components/CityDetailView';
import { ForecastView } from './components/ForecastView';
import { ModelsView } from './components/ModelsView';
import { DataProvenanceView } from './components/DataProvenanceView';
import {
  CityRanking,
  CityFeatures,
  DemandMetric,
  ForecastSummary,
  StatsResponse,
  Manifest,
  M1Coefficient,
  M2Comparison,
  M2Confusion,
  SeamRow,
} from './types';
import { api, BackendStatus } from './api';
import { FileText, Github, Zap } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedCity, setSelectedCity] = useState<string>('Delhi');

  // App data state
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({ online: false });
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [hotspots, setHotspots] = useState<CityRanking[]>([]);
  const [cities, setCities] = useState<Array<{ city: string; state_code: string }>>([]);
  const [demandData, setDemandData] = useState<DemandMetric[]>([]);
  const [featuresData, setFeaturesData] = useState<CityFeatures[]>([]);
  const [forecastsData, setForecastsData] = useState<ForecastSummary[]>([]);
  const [statsData, setStatsData] = useState<StatsResponse | null>(null);
  const [manifestData, setManifestData] = useState<Manifest | null>(null);
  const [m1Coefficients, setM1Coefficients] = useState<M1Coefficient[]>([]);
  const [m2Comparison, setM2Comparison] = useState<M2Comparison[]>([]);
  const [m2Confusion, setM2Confusion] = useState<M2Confusion[]>([]);
  const [seamData, setSeamData] = useState<SeamRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Check health and load primary datasets
  const loadInitialData = async () => {
    setIsCheckingHealth(true);
    try {
      const health = await api.checkHealth();
      setBackendStatus(health);

      const [
        hotspotsRes,
        citiesRes,
        demandRes,
        featuresRes,
        forecastsRes,
        statsRes,
        manifestRes,
        modelsRes,
        seamRes,
      ] = await Promise.all([
        api.getHotspots(51),
        api.getCities(),
        api.getDemand(),
        api.getFeatures(),
        api.getForecasts(),
        api.getStats(),
        api.getManifest(),
        api.getModelsSummary(),
        api.getSeam(),
      ]);

      setHotspots(hotspotsRes.data);
      setCities(citiesRes.data);
      setDemandData(demandRes.data);
      setFeaturesData(featuresRes.data);
      setForecastsData(forecastsRes.data);
      setStatsData(statsRes.data);
      setManifestData(manifestRes.data);
      setM1Coefficients(modelsRes.m1_coefficients);
      setM2Comparison(modelsRes.m2_comparison);
      setM2Confusion(modelsRes.m2_confusion);
      setSeamData(seamRes.data);
    } catch (e) {
      console.error('Initial data load error:', e);
    } finally {
      setIsCheckingHealth(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const handleNavigateCityDetail = (city: string) => {
    setSelectedCity(city);
    setActiveTab('city');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <Header
        backendStatus={backendStatus}
        isCheckingHealth={isCheckingHealth}
        onRefreshHealth={loadInitialData}
        selectedCity={selectedCity}
        onSelectCity={(city) => {
          setSelectedCity(city);
          setActiveTab('city');
        }}
        cities={cities}
      />

      {/* Navigation Sub-header */}
      <Navigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        selectedCityName={activeTab === 'city' ? selectedCity : undefined}
      />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center animate-spin">
              <Zap className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              Initializing EVision Analytics Engine...
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewView
                hotspots={hotspots}
                stats={statsData}
                onNavigateTab={setActiveTab}
                onSelectCity={handleNavigateCityDetail}
              />
            )}

            {activeTab === 'map' && (
              <MapView
                hotspots={hotspots}
                onSelectCity={setSelectedCity}
                onNavigateCityDetail={handleNavigateCityDetail}
              />
            )}

            {activeTab === 'allocation' && (
              <AllocationsView
                hotspots={hotspots}
                onSelectCity={setSelectedCity}
                onNavigateCityDetail={handleNavigateCityDetail}
              />
            )}

            {activeTab === 'hotspots' && (
              <HotspotsView
                hotspots={hotspots}
                onSelectCity={setSelectedCity}
                onNavigateCityDetail={handleNavigateCityDetail}
              />
            )}

            {activeTab === 'demand' && (
              <DemandGapView
                demandData={demandData}
                featuresData={featuresData}
                onSelectCity={setSelectedCity}
                onNavigateCityDetail={handleNavigateCityDetail}
              />
            )}

            {activeTab === 'city' && (
              <CityDetailView
                selectedCity={selectedCity}
                onSelectCity={setSelectedCity}
                hotspots={hotspots}
                featuresData={featuresData}
                forecastsData={forecastsData}
              />
            )}

            {activeTab === 'forecast' && (
              <ForecastView
                forecastsData={forecastsData}
                onSelectCity={setSelectedCity}
                onNavigateCityDetail={handleNavigateCityDetail}
              />
            )}

            {activeTab === 'models' && (
              <ModelsView
                m1Coefficients={m1Coefficients}
                m2Comparison={m2Comparison}
                m2Confusion={m2Confusion}
              />
            )}

            {activeTab === 'integrity' && (
              <DataProvenanceView manifest={manifestData} seamData={seamData} />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-xs text-slate-500 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-slate-800 text-sm">EVision</span>
              <span>—</span>
              <span>Quantifying where India's next public EV chargers should go</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-slate-400">Panel: 2021-01 → 2026-09</span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-400">51 Analysed Hubs</span>
              <span className="text-slate-400">·</span>
              <span className="font-semibold text-emerald-700">FastAPI backend port 8000</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 flex flex-col sm:flex-row justify-between items-center gap-1 border-t border-slate-100 pt-3">
            <span>
              Sources: MoRTH Vahan, Census 2011, Open-Meteo ERA5, BEE EV PCS snapshot.
            </span>
            <span>
              Deliverables: final_report.md · final_deck.pptx · cds_map.html
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
