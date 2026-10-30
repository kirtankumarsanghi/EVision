import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { OverviewView } from './components/OverviewView';
import { MapView } from './components/MapView';
import { HotspotsView } from './components/HotspotsView';
import { DemandGapView } from './components/DemandGapView';
import { CityDetailView } from './components/CityDetailView';
import { ForecastView } from './components/ForecastView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PlanWizard } from './components/plan/PlanWizard';
import { ResultsView } from './components/plan/ResultsView';
import {
  CityRanking,
  CityFeatures,
  DemandMetric,
  ForecastSummary,
  Manifest,
  PlanMode,
  PlanStage,
  ScenarioInput,
  ScenarioResult,
  StatsResponse,
  TabType,
} from './types';
import { api, BackendStatus } from './api';
import { buildScenario, DEFAULT_SCENARIO, verifyPublishedParity } from './lib/scenario';
import { decodeScenario } from './lib/export';
import { APP_VERSION, DATA_SOURCES } from './lib/appMeta';
import { Zap } from 'lucide-react';

const STORAGE_KEY = 'evision:scenario';

const EXPLORE_TAB_IDS: TabType[] = ['overview', 'map', 'hotspots', 'demand', 'city', 'forecast'];

function readInitialMode(): PlanMode {
  const value = new URLSearchParams(window.location.search).get('mode');
  return value === 'explore' ? 'explore' : 'plan';
}

function readInitialTab(): TabType {
  const value = new URLSearchParams(window.location.search).get('tab');
  return EXPLORE_TAB_IDS.includes(value as TabType) ? (value as TabType) : 'overview';
}

function readStoredScenario(): ScenarioInput | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ScenarioInput) : null;
  } catch {
    return null;
  }
}

export const App: React.FC = () => {
  const [mode, setMode] = useState<PlanMode>(readInitialMode);
  const [planStage, setPlanStage] = useState<PlanStage>('wizard');
  const [activeTab, setActiveTab] = useState<TabType>(readInitialTab);
  const [selectedCity, setSelectedCity] = useState<string>('Delhi');

  const [scenarioInput, setScenarioInput] = useState<ScenarioInput>(DEFAULT_SCENARIO);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const initialScenarioRef = useRef<ScenarioInput | null>(null);

  // App data state
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({ online: false });
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [hotspots, setHotspots] = useState<CityRanking[]>([]);
  const [demandData, setDemandData] = useState<DemandMetric[]>([]);
  const [featuresData, setFeaturesData] = useState<CityFeatures[]>([]);
  const [forecastsData, setForecastsData] = useState<ForecastSummary[]>([]);
  const [statsData, setStatsData] = useState<StatsResponse | null>(null);
  const [manifestData, setManifestData] = useState<Manifest | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // A shared link opens directly on its recommendation; a local reload only
  // prefills the wizard so the user still deliberately runs the plan.
  useEffect(() => {
    const shared = decodeScenario(new URLSearchParams(window.location.search).get('scenario'));
    if (shared) {
      initialScenarioRef.current = shared;
      setScenarioInput(shared);
      return;
    }
    const stored = readStoredScenario();
    if (stored) setScenarioInput(stored);
  }, []);

  const loadInitialData = async () => {
    setIsCheckingHealth(true);
    try {
      const health = await api.checkHealth();
      setBackendStatus(health);

      const [
        hotspotsRes,
        demandRes,
        featuresRes,
        forecastsRes,
        statsRes,
        manifestRes,
      ] = await Promise.all([
        api.getHotspots(51),
        api.getDemand(),
        api.getFeatures(),
        api.getForecasts(),
        api.getStats(),
        api.getManifest(),
      ]);

      setHotspots(hotspotsRes.data);
      setDemandData(demandRes.data);
      setFeaturesData(featuresRes.data);
      setForecastsData(forecastsRes.data);
      setStatsData(statsRes.data);
      setManifestData(manifestRes.data);

      if (initialScenarioRef.current) {
        const result = buildScenario(initialScenarioRef.current, {
          hotspots: hotspotsRes.data,
          features: featuresRes.data,
          vehicleSplits: api.getVehicleSplit(),
        });
        setScenarioResult(result);
        setPlanStage('results');
        initialScenarioRef.current = null;
      }
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

  // Guard: the planner must reproduce the published CDS exactly.
  useEffect(() => {
    if (!import.meta.env.DEV || hotspots.length === 0) return;
    const drift = verifyPublishedParity(hotspots);
    if (drift > 1e-6) {
      console.warn(`[EVision] CDS parity drift of ${drift.toFixed(6)} — planner and published ranking disagree.`);
    }
  }, [hotspots]);

  const runScenario = (input: ScenarioInput) => {
    const result = buildScenario(input, {
      hotspots,
      features: featuresData,
      vehicleSplits: api.getVehicleSplit(),
    });
    setScenarioInput(input);
    setScenarioResult(result);
    setPlanStage('results');
    setMode('plan');
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
    } catch {
      /* storage unavailable — ignore */
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCity = (city: string) => {
    setSelectedCity(city);
    setActiveTab('city');
    setMode('explore');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Header
        mode={mode}
        onModeChange={setMode}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        planStage={planStage}
        onPlanStageChange={setPlanStage}
        hasResult={scenarioResult !== null}
        backendStatus={backendStatus}
        isCheckingHealth={isCheckingHealth}
        onRefreshHealth={loadInitialData}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <ErrorBoundary>
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div className="w-12 h-12 rounded-xl bg-brand-500/20 text-brand-600 flex items-center justify-center animate-spin">
              <Zap className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-600">
              Initializing EVision Analytics Engine...
            </p>
          </div>
        ) : mode === 'plan' ? (
          planStage === 'results' && scenarioResult ? (
            <ResultsView
              result={scenarioResult}
              onEdit={() => {
                setPlanStage('wizard');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenCity={openCity}
            />
          ) : (
            <PlanWizard
              key={JSON.stringify(scenarioInput)}
              initial={scenarioInput}
              features={featuresData}
              onRun={runScenario}
            />
          )
        ) : (
          <>
            {activeTab === 'overview' && (
              <OverviewView
                hotspots={hotspots}
                stats={statsData}
                onNavigateTab={setActiveTab}
                onSelectCity={openCity}
                onOpenPlanner={() => {
                  setMode('plan');
                  setPlanStage('wizard');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}

            {activeTab === 'map' && (
              <MapView hotspots={hotspots} onSelectCity={setSelectedCity} onNavigateCityDetail={openCity} />
            )}

            {activeTab === 'hotspots' && (
              <HotspotsView
                hotspots={hotspots}
                onSelectCity={setSelectedCity}
                onNavigateCityDetail={openCity}
              />
            )}

            {activeTab === 'demand' && (
              <DemandGapView
                demandData={demandData}
                onSelectCity={setSelectedCity}
                onNavigateCityDetail={openCity}
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
                onNavigateCityDetail={openCity}
              />
            )}
          </>
        )}
        </ErrorBoundary>
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
              <span className="text-slate-400">{manifestData?.cities ?? 51} analysed hubs</span>
              <span className="text-slate-400">·</span>
              <span className="font-semibold text-brand-700">
                {backendStatus.online ? 'FastAPI online' : 'Bundled snapshots'}
              </span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400 flex flex-col sm:flex-row justify-between items-center gap-1 border-t border-slate-100 pt-3">
            <span>Sources: {DATA_SOURCES}</span>
            <span>
              v{APP_VERSION} · CDS = 0.4·z(M1) + 0.3·P(high) + 0.3·z(M3)
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
