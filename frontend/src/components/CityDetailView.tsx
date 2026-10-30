import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart as LineChartIcon,
  TrendingUp,
  Zap,
  Building,
  Thermometer,
  FileText,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Activity,
  Layers,
  Fuel,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  CityRanking,
  CityRegistrationPoint,
  CityFeatures,
  ForecastSummary,
  ForecastMonthlyPoint,
  VehicleSplit,
} from '../types';
import { api } from '../api';
import { PageHeader, StatGroup, Tag, splitTone } from './ui';

interface CityDetailViewProps {
  selectedCity: string;
  onSelectCity: (city: string) => void;
  hotspots: CityRanking[];
  featuresData: CityFeatures[];
  forecastsData: ForecastSummary[];
}

export const CityDetailView: React.FC<CityDetailViewProps> = ({
  selectedCity,
  onSelectCity,
  hotspots,
  featuresData,
  forecastsData,
}) => {
  const [registrations, setRegistrations] = useState<CityRegistrationPoint[]>([]);
  const [monthlyForecasts, setMonthlyForecasts] = useState<ForecastMonthlyPoint[]>([]);
  const [vehicleSplits, setVehicleSplits] = useState<VehicleSplit[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [chartMode, setChartMode] = useState<'monthly' | 'stock'>('monthly');

  // Find active city's records
  const cityRanking = useMemo(
    () => hotspots.find((h) => h.city.toLowerCase() === selectedCity.toLowerCase()) || hotspots[0],
    [hotspots, selectedCity]
  );

  const cityFeatures = useMemo(
    () => featuresData.find((f) => f.city.toLowerCase() === selectedCity.toLowerCase()),
    [featuresData, selectedCity]
  );

  const cityForecast = useMemo(
    () => forecastsData.find((f) => f.city.toLowerCase() === selectedCity.toLowerCase()),
    [forecastsData, selectedCity]
  );

  // Fetch city-specific data when city changes
  useEffect(() => {
    let isCurrent = true;
    const fetchCityData = async () => {
      setLoading(true);
      try {
        const [regRes, fcRes] = await Promise.all([
          api.getCityRegistrations(selectedCity),
          api.getMonthlyForecasts(selectedCity),
        ]);
        if (isCurrent) {
          setRegistrations(regRes.data);
          setMonthlyForecasts(fcRes.data);
          setVehicleSplits(api.getVehicleSplit(selectedCity));
        }
      } catch (e) {
        console.error('Error fetching city data:', e);
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    fetchCityData();
    return () => {
      isCurrent = false;
    };
  }, [selectedCity]);

  // Combined historical registrations + 12m forward forecast curve
  const combinedSeries = useMemo(() => {
    const historical = registrations.map((r) => ({
      date: r.date,
      historical: r.ev_registrations,
      stock: r.ev_stock,
      forecast: null,
      is_outlier: r.is_outlier,
      observed: r.observed,
    }));

    // Connect forecast line from last historical point
    const lastHist = historical[historical.length - 1];
    const forecastPoints = monthlyForecasts.map((f, i) => ({
      date: f.date.substring(0, 7),
      historical: i === 0 && lastHist ? lastHist.historical : null,
      stock: null,
      forecast: Math.round(f.forecast),
      is_outlier: false,
      observed: false,
    }));

    return [...historical, ...forecastPoints];
  }, [registrations, monthlyForecasts]);

  // Aggregate vehicle split by category
  const vehicleSplitChartData = useMemo(() => {
    if (!vehicleSplits || vehicleSplits.length === 0) return [];
    const yearGroups: Record<number, Record<string, number>> = {};
    vehicleSplits.forEach((v) => {
      if (!yearGroups[v.year]) yearGroups[v.year] = { '2W': 0, '3W': 0, '4W': 0, COMM: 0 };
      yearGroups[v.year][v.bucket] = (yearGroups[v.year][v.bucket] || 0) + v.ev_registrations;
    });

    return Object.entries(yearGroups).map(([year, buckets]) => ({
      year,
      '2W (Personal)': buckets['2W'] || 0,
      '3W (Auto/Cargo)': buckets['3W'] || 0,
      '4W (Cars/Fleets)': buckets['4W'] || 0,
      'Commercial': buckets['COMM'] || 0,
    }));
  }, [vehicleSplits]);

  if (!cityRanking) {
    return <div>Select a city to analyze.</div>;
  }

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        eyebrow={`City profile · rank #${cityRanking.rank} of ${hotspots.length}`}
        icon={LineChartIcon}
        title={`${cityRanking.city} (${cityRanking.state_code})`}
        description={`Charging Demand Score ${cityRanking.cds.toFixed(3)} · ${cityRanking.recommendation}`}
        actions={
          <>
            <select
              value={selectedCity}
              onChange={(e) => onSelectCity(e.target.value)}
              aria-label="Choose a city"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {hotspots.map((h) => (
                <option key={h.city} value={h.city}>
                  {h.city} ({h.state_code}) — #{h.rank}
                </option>
              ))}
            </select>
            <Tag tone={splitTone(cityRanking.split_method)}>{cityRanking.split_method} split</Tag>
          </>
        }
      />

      {/* City Metrics Scorecard */}
      <div className="surface overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-slate-200/70">
        <div className="bg-white p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">EV Fleet Stock</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {Math.round(cityRanking.ev_stock).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Cumulative registered</div>
        </div>

        <div className="bg-white p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">12m Outlook</div>
          <div
            className={`text-xl font-extrabold mt-1 ${
              cityRanking.forecast_growth >= 0 ? 'text-slate-900' : 'text-slate-600'
            }`}
          >
            {(cityRanking.forecast_growth * 100).toFixed(0)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{cityRanking.winner} winner</div>
        </div>

        <div className="bg-white p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Public Stations</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {cityRanking.stations_10km || cityFeatures?.stations_within_radius || 0}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {cityRanking.fast_10km || 0} fast DC points
          </div>
        </div>

        <div className="bg-white p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">M1 Exp Monthly</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {Math.round(cityRanking.m1_expected_monthly).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Expected additions/mo</div>
        </div>

        <div className="bg-white p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Population (2023)</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {cityFeatures?.pop_estimate_2023
              ? `${(cityFeatures.pop_estimate_2023 / 1000000).toFixed(1)}M`
              : 'N/A'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {cityFeatures?.population_density
              ? `${Math.round(cityFeatures.population_density)}/km²`
              : 'Census 2011'}
          </div>
        </div>

        <div className="bg-white p-4">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Per Capita Income</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">
            {cityFeatures?.per_capita_income_inr
              ? `₹${Math.round(cityFeatures.per_capita_income_inr / 1000)}k`
              : 'N/A'}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">State domestic product</div>
        </div>
        </div>
      </div>

      {/* Main Historical & Forward Forecast Chart */}
      <div className="surface p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Activity className="w-4 h-4 text-brand-600" />
              <span>Historical Registrations (2021–2026) & 12-Month SARIMA/HW Forecast</span>
            </h3>
            <p className="text-xs text-slate-500">
              Solid ink line is observed Vahan registrations; the dashed line is the 12-month forecast.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <button
              onClick={() => setChartMode('monthly')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                chartMode === 'monthly'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Monthly Additions + Forecast
            </button>
            <button
              onClick={() => setChartMode('stock')}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                chartMode === 'stock'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Cumulative Fleet Stock
            </button>
          </div>
        </div>

        <div className="h-80 w-full pt-3">
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-xs">
              Loading {selectedCity} time-series...
            </div>
          ) : chartMode === 'monthly' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={combinedSeries} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--chart-border)' }}
                  interval={6}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : value)}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const point = payload[0].payload;
                    return (
                      <div className="rounded-md bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg">
                        <p className="font-medium text-slate-400">{point.date}</p>
                        {point.historical !== null && (
                          <p className="font-semibold text-white">
                            {Number(point.historical).toLocaleString()} observed
                          </p>
                        )}
                        {point.forecast !== null && (
                          <p className="font-semibold text-slate-300">
                            {Number(point.forecast).toLocaleString()} forecast
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line isAnimationActive={false}
                  type="monotone"
                  dataKey="historical"
                  name="Observed registrations"
                  stroke="var(--bar)"
                  strokeWidth={2.2}
                  dot={false}
                />
                <Line isAnimationActive={false}
                  type="monotone"
                  dataKey="forecast"
                  name="12-month forecast"
                  stroke="var(--bar-3)"
                  strokeWidth={2.2}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={registrations} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="stockGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--bar)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--bar)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--chart-border)' }}
                  interval={5}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--chart-border)' }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-lg space-y-1">
                          <p className="font-semibold text-slate-400">{d.date}</p>
                          <p className="font-bold text-white text-sm">
                            {Number(d.ev_stock).toLocaleString()} Cumulative EVs
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area isAnimationActive={false}
                  type="monotone"
                  dataKey="ev_stock"
                  name="Cumulative EV Stock"
                  stroke="var(--bar)"
                  strokeWidth={2.5}
                  fill="url(#stockGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Two Column Details: Vehicle Category Split + Policy/Context */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Vehicle Category Segmentation */}
        <div className="lg:col-span-7 surface p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <Layers className="w-4 h-4 text-brand-600" />
                <span>Vehicle Category Mix Evolution (2W / 3W / 4W / Commercial)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Segment mix governs true public charging reliance (0.15 2W · 0.70 3W · 1.00 4W · 0.60 COMM)
              </p>
            </div>
            <span className={`badge-${cityRanking.split_method}`}>
              {cityRanking.split_method}
            </span>
          </div>

          <div className="h-64 w-full pt-2">
            {vehicleSplitChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vehicleSplitChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={{ stroke: 'var(--chart-border)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} axisLine={{ stroke: 'var(--chart-border)' }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
                  <Tooltip />
                  <Legend />
                  <Bar isAnimationActive={false} dataKey="2W (Personal)" stackId="a" fill="var(--bar-4)" />
                  <Bar isAnimationActive={false} dataKey="3W (Auto/Cargo)" stackId="a" fill="var(--bar-3)" />
                  <Bar isAnimationActive={false} dataKey="4W (Cars/Fleets)" stackId="a" fill="var(--bar-2)" />
                  <Bar isAnimationActive={false} dataKey="Commercial" stackId="a" fill="var(--bar)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                No annual split series available for {selectedCity}.
              </div>
            )}
          </div>
        </div>

        {/* Policy, Supply & Environment Profile */}
        <div className="lg:col-span-5 surface p-5 sm:p-6 space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">Contextual & Policy Grounding</h3>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700">EV Policy Framework</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    cityFeatures?.policy_verified
                      ? 'bg-brand-100 text-brand-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {cityFeatures?.policy_verified ? 'Verified' : 'Provisional Score'}
                </span>
              </div>
              <p className="font-medium text-slate-900">{cityFeatures?.policy_name || 'State Policy'}</p>
              <p className="text-slate-500 text-[11px]">
                Score: <b>{cityFeatures?.ev_policy_score || 0} / 5.0</b> · Status: {cityFeatures?.policy_status || 'Notified'}
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700">Fuel & Environmental Pressure</span>
                <span className="font-mono text-slate-900 font-bold">
                  ₹{cityFeatures?.fuel_price_inr_per_litre?.toFixed(2)}/L
                </span>
              </div>
              <p className="text-slate-500 text-[11px]">
                Summer Max Temp: <b>{cityFeatures?.summer_max_temp_c?.toFixed(1)}°C</b> · Corridor:{' '}
                <b>{cityFeatures?.highway_corridor ? 'Yes' : 'No'}</b>
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-700">M3 Tournament Fitting</span>
                <span className="font-mono text-slate-700 font-bold">
                  {cityForecast?.winner} (RMSE {cityForecast?.holdout_rmse_rel?.toFixed(3)})
                </span>
              </div>
              <p className="text-slate-500 text-[11px]">
                SARIMA Order: <code>{cityForecast?.order || 'N/A'}</code> · Seasonal:{' '}
                <code>{cityForecast?.seasonal_order || 'N/A'}</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
