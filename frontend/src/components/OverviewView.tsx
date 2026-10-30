import React from 'react';
import {
  TrendingUp,
  MapPin,
  Zap,
  ShieldAlert,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Layers,
  HelpCircle,
  Building2,
  Calculator,
  Compass,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CityRanking, StatsResponse } from '../types';
import { TabType } from './Navigation';

interface OverviewViewProps {
  hotspots: CityRanking[];
  stats: StatsResponse | null;
  onNavigateTab: (tab: TabType) => void;
  onSelectCity: (city: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  hotspots,
  stats,
  onNavigateTab,
  onSelectCity,
}) => {
  const topFive = hotspots.slice(0, 5);

  const nationalSeries = React.useMemo(() => {
    if (!stats?.national_monthly) return [];
    return Object.entries(stats.national_monthly).map(([date, count]) => ({
      date,
      count,
    }));
  }, [stats]);

  const totalStockAcrossAnalysed = React.useMemo(() => {
    return hotspots.reduce((acc, h) => acc + (h.ev_stock || 0), 0);
  }, [hotspots]);

  return (
    <div className="space-y-8 pb-12">
      {/* Real-World Problem & Question Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white p-6 sm:p-10 shadow-2xl border border-slate-800">
        <div className="relative z-10 max-w-4xl space-y-5">
          {/* Tag */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold tracking-wide">
            <Zap className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>THE REAL-WORLD PROBLEM & SITING ENGINE</span>
          </div>

          {/* Heading */}
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            India has over <span className="text-emerald-400">3,000,000 EVs</span> on the road,
            but only about <span className="text-amber-400">12,000 public chargers</span>.
          </h1>

          {/* Problem Narrative & CPO Billions */}
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
            Major Charge Point Operators (CPOs) like <b className="text-white">Tata Power</b>,{' '}
            <b className="text-white">Ola Electric</b>, and <b className="text-white">Jio-bp</b> are
            spending billions of rupees to build out nationwide charging networks. But every planner
            faces one massive capital risk:
          </p>

          {/* The Million-Dollar Question Box */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white/10 backdrop-blur-md border border-emerald-400/30 shadow-inner flex items-start space-x-3">
            <span className="text-2xl">⚡</span>
            <div>
              <p className="text-base sm:text-lg font-bold text-emerald-200 italic">
                “Where should we install the next 100,000 chargers to make sure they get used and
                don't sit empty?”
              </p>
              <p className="text-xs text-slate-300 mt-1">
                Avoiding stranded assets and unutilized infrastructure through empirical demand modeling.
              </p>
            </div>
          </div>

          {/* Our Solution Summary */}
          <div className="pt-2 space-y-2">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-emerald-400">
              Our Solution
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              We built a statistical and machine learning system that analyzes <b>51 top Indian cities</b>.
              By combining monthly EV sales history (2021–2026), existing charger supply, Census 2011 demographics,
              petrol prices, and state policies, our system forecasts future EV growth and ranks cities
              from <b>#1 (highest charging demand)</b> to <b>#51 (lowest charging demand)</b>.
            </p>
          </div>

          {/* Direct CTA Buttons */}
          <div className="pt-4 flex flex-wrap gap-3">
            <button
              onClick={() => onNavigateTab('allocation')}
              className="inline-flex items-center space-x-2 px-5 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-emerald-500/25 transition-all"
            >
              <Calculator className="w-4 h-4" />
              <span>Launch Next 100k Siting Planner</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigateTab('map')}
              className="inline-flex items-center space-x-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm border border-white/20 transition-all"
            >
              <MapPin className="w-4 h-4" />
              <span>View Choropleth Map</span>
            </button>
            <button
              onClick={() => onNavigateTab('hotspots')}
              className="inline-flex items-center space-x-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm border border-white/20 transition-all"
            >
              <BarChart3 className="w-4 h-4" />
              <span>51-City Hotspot Ranking</span>
            </button>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 bottom-0 opacity-20 pointer-events-none transform translate-x-12 translate-y-12">
          <div className="w-[500px] h-[500px] rounded-full bg-emerald-500 blur-3xl"></div>
        </div>
      </div>

      {/* KPI Headline Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Analysed Fleet
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
              EV
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            {totalStockAcrossAnalysed.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1 flex items-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1 inline" />
            Across 51 top Indian urban centers
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              #1 Ranked Hub
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-50 text-red-700 flex items-center justify-center font-bold text-xs">
              #1
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-red-600 mt-2">Delhi</p>
          <p className="text-xs text-slate-500 mt-1">
            CDS <span className="font-bold text-slate-800">1.706</span> · Critical priority
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Fastest 12m Growth
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">Guwahati</p>
          <p className="text-xs text-purple-700 font-semibold mt-1">
            +234% 12m growth outlook (HW)
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Sharpest Charger Gap
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">Patna</p>
          <p className="text-xs text-amber-800 font-semibold mt-1">
            390 effective demand / station
          </p>
        </div>
      </div>

      {/* The 5 Core Objectives Interactive Grid */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <Compass className="w-5 h-5 text-emerald-600" />
            <span>The Five Core Analytical Objectives</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            How EVision systematically answers where chargers must go through quantitative modeling.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Objective 1 */}
          <div
            onClick={() => onNavigateTab('demand')}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-500 cursor-pointer transition-all group flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 font-bold flex items-center justify-center text-xs">
                Obj 1
              </div>
              <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">
                Quantify Effective Public Demand
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Formulate a weighted metric accounting for vehicle class charging behaviors (0.15·2W + 0.70·3W + 1.00·4W + 0.60·COMM) divided by comparable 10km supply.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-600 font-bold">
              <span>View Gap Analysis</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Objective 2 */}
          <div
            onClick={() => onNavigateTab('models')}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-500 cursor-pointer transition-all group flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 font-bold flex items-center justify-center text-xs">
                Obj 2
              </div>
              <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">
                Identify Adoption Drivers (Count Model)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Model monthly registration volumes against socioeconomic, density, and policy predictors using Negative Binomial Regression (IRR 2.13 non-EV market).
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-600 font-bold">
              <span>View M1 Drivers</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Objective 3 */}
          <div
            onClick={() => onNavigateTab('models')}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-500 cursor-pointer transition-all group flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center text-xs">
                Obj 3
              </div>
              <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">
                Classify High-Demand Zones
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Predict whether a city falls into "High" or "Low" demand buckets with 0.915 CV-AUC using Logistic Regression & LDA over exogenous demographic signals.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-600 font-bold">
              <span>View M2 Classifier</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Objective 4 */}
          <div
            onClick={() => onNavigateTab('forecast')}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-500 cursor-pointer transition-all group flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 font-bold flex items-center justify-center text-xs">
                Obj 4
              </div>
              <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">
                Forecast Growth Trajectories
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Forecast 12-month forward EV growth across all 51 cities using a rigorous tournament between SARIMA and Holt-Winters holdout evaluations.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-600 font-bold">
              <span>View M3 Forecasts</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>

          {/* Objective 5 */}
          <div
            onClick={() => onNavigateTab('hotspots')}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-500 cursor-pointer transition-all group flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center text-xs">
                Obj 5
              </div>
              <h3 className="font-extrabold text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">
                Synthesize & Rank Hotspots (CDS)
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Combine count, classification, and forecast outputs into the composite Charging Demand Score (CDS) and visualize priority corridors on the map.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-600 font-bold">
              <span>View CDS Rankings</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </div>

      {/* Top 5 Hotspot Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Current Top 5 Priority Hotspots</h2>
            <p className="text-xs text-slate-500">
              Immediate deployment focus based on composite Charging Demand Score
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('hotspots')}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center space-x-1"
          >
            <span>View all 51 cities</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {topFive.map((city) => {
            const isCritical = city.cds >= 1.5;
            const isHigh = city.cds >= 0.75 && city.cds < 1.5;
            return (
              <div
                key={city.city}
                onClick={() => {
                  onSelectCity(city.city);
                  onNavigateTab('city');
                }}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-500 cursor-pointer transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                    Rank #{city.rank}
                  </span>
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                      isCritical ? 'tag-critical' : isHigh ? 'tag-high' : 'tag-moderate'
                    }`}
                  >
                    {isCritical ? 'Critical' : isHigh ? 'High' : 'Moderate'}
                  </span>
                </div>

                <h3 className="font-extrabold text-base text-slate-900 group-hover:text-emerald-600 transition-colors">
                  {city.city}
                </h3>
                <p className="text-xs text-slate-500 font-medium mb-3">{city.state_code}</p>

                <div className="space-y-1.5 text-xs border-t border-slate-100 pt-2.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">CDS Score:</span>
                    <span className="font-extrabold text-slate-900 font-mono">
                      {city.cds.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">12m Outlook:</span>
                    <span
                      className={`font-semibold ${
                        city.forecast_growth >= 0 ? 'text-emerald-700' : 'text-slate-700'
                      }`}
                    >
                      {(city.forecast_growth * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fleet Stock:</span>
                    <span className="font-medium text-slate-700">
                      {Math.round(city.ev_stock).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Chargers (10km):</span>
                    <span className="font-medium text-slate-700">{city.stations_10km} stns</span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className={`badge-${city.split_method}`}>{city.split_method}</span>
                  <span className="text-[11px] text-emerald-600 font-bold group-hover:translate-x-0.5 transition-transform flex items-center">
                    Analyze →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* National Trend Chart */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              National Monthly EV Registration Trajectory (2021–2026)
            </h2>
            <p className="text-xs text-slate-500">
              Monitored across 51 major hubs (3,519 city-months · 96.9% observed empirical coverage)
            </p>
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full pt-2">
          {nationalSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={nationalSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="nationalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  interval={5}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white px-3 py-2 rounded-lg text-xs shadow-lg space-y-1">
                          <p className="text-slate-400 font-medium">{d.date}</p>
                          <p className="font-bold text-sm text-emerald-400">
                            {Number(d.count).toLocaleString()} EVs registered
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#059669"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#nationalGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs">
              Loading national trend data...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
