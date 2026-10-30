import React, { useState, useMemo } from 'react';
import {
  Zap,
  ShieldAlert,
  HelpCircle,
  BarChart2,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
} from 'recharts';
import { DemandMetric, CityFeatures } from '../types';

interface DemandGapViewProps {
  demandData: DemandMetric[];
  featuresData: CityFeatures[];
  onSelectCity: (city: string) => void;
  onNavigateCityDetail: (city: string) => void;
}

export const DemandGapView: React.FC<DemandGapViewProps> = ({
  demandData,
  featuresData,
  onSelectCity,
  onNavigateCityDetail,
}) => {
  const [activeTab, setActiveTab] = useState<'ranking' | 'scatter'>('ranking');
  const [metricScope, setMetricScope] = useState<'fixed10km' | 'circle'>('fixed10km');

  // Top supply-constrained cities (highest effective demand per station)
  const topConstrained = useMemo(() => {
    return [...demandData]
      .sort((a, b) => (b.effective_public_demand || 0) - (a.effective_public_demand || 0))
      .slice(0, 15);
  }, [demandData]);

  // Scatter plot data: Weighted Stock (X) vs Stations (Y) with Demand (Z)
  const scatterData = useMemo(() => {
    return demandData.map((d) => ({
      city: d.city,
      weighted_stock: Math.round(d.weighted_ev_stock || 0),
      stations: d.stations_10km || d.stations_within_radius || 1,
      demand_ratio: Math.round(d.effective_public_demand || 0),
      split_method: d.split_method,
    }));
  }, [demandData]);

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Introduction */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold mb-2">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>Objective 1 — Siting Gap Metric</span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Effective Public Demand & Infrastructure Gap Analysis
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Quantifying unobserved public charging demand by segmenting vehicle fleet charging behaviors.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('ranking')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'ranking'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Top Gap Shortlist
            </button>
            <button
              onClick={() => setActiveTab('scatter')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'scatter'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Supply vs Fleet Matrix
            </button>
          </div>
        </div>

        {/* Methodology explanation card */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="space-y-1">
            <span className="font-bold text-slate-800 flex items-center space-x-1">
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span>Weighting Formulation</span>
            </span>
            <code className="block bg-white p-2 rounded border border-slate-200 text-[11px] font-mono text-slate-800">
              weighted_stock = 0.15·2W + 0.70·3W + 1.00·4W + 0.60·COMM
            </code>
          </div>

          <div className="space-y-1">
            <span className="font-bold text-slate-800">2W Factor (0.15)</span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Two-wheeler owners overwhelmingly charge at home or workplace 15A sockets; negligible public DC fast charger load.
            </p>
          </div>

          <div className="space-y-1">
            <span className="font-bold text-slate-800">3W Factor (0.70)</span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Auto-rickshaws and cargo 3-wheelers operate on long shifts and frequently top up during midday breaks.
            </p>
          </div>

          <div className="space-y-1">
            <span className="font-bold text-slate-800">4W & Commercial (1.00 / 0.60)</span>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Private 4Ws and commercial passenger fleets require high-power public fast chargers (CCS2) for range reliability.
            </p>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      {activeTab === 'ranking' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Constrained Cities Bar Chart */}
          <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Top 15 Supply-Constrained Cities (Effective Demand / Station)
                </h3>
                <p className="text-xs text-slate-500">
                  Higher ratio indicates acute infrastructure shortfall
                </p>
              </div>
            </div>

            <div className="h-96 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topConstrained}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="city"
                    type="category"
                    tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickLine={false}
                    width={80}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload as DemandMetric;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-lg space-y-1">
                            <p className="font-bold text-sm text-amber-400">{d.city}</p>
                            <p>
                              Effective Demand:{' '}
                              <b>{Math.round(d.effective_public_demand).toLocaleString()}</b>
                            </p>
                            <p>
                              Stations within radius: <b>{d.stations_within_radius}</b>
                            </p>
                            <p>
                              Weighted EV Stock:{' '}
                              <b>{Math.round(d.weighted_ev_stock).toLocaleString()}</b>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="effective_public_demand"
                    fill="#f59e0b"
                    radius={[0, 4, 4, 0]}
                    onClick={(entry) => {
                      onSelectCity(entry.city);
                      onNavigateCityDetail(entry.city);
                    }}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Side Shortlist Table */}
          <div className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">Acute Deficit Hotspots</h3>
            <p className="text-xs text-slate-500">
              In these cities, high demand per charger is driven by an extremely small denominator (stations).
            </p>

            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
              {topConstrained.map((c, i) => (
                <div
                  key={c.city}
                  onClick={() => {
                    onSelectCity(c.city);
                    onNavigateCityDetail(c.city);
                  }}
                  className="py-2.5 flex items-center justify-between hover:bg-slate-50 cursor-pointer px-2 rounded-lg transition-colors group"
                >
                  <div className="flex items-center space-x-3">
                    <span className="w-5 text-xs font-bold text-slate-400">#{i + 1}</span>
                    <div>
                      <div className="font-bold text-xs text-slate-900 group-hover:text-emerald-600 transition-colors">
                        {c.city}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {c.stations_within_radius} stations · {Math.round(c.weighted_ev_stock).toLocaleString()} weighted EVs
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-extrabold text-xs text-amber-700 font-mono">
                      {c.effective_public_demand.toFixed(1)}
                    </div>
                    <span className={`badge-${c.split_method} text-[10px]`}>
                      {c.split_method}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Scatter Matrix: Supply vs Fleet */
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Supply vs Weighted EV Fleet Distribution Matrix
              </h3>
              <p className="text-xs text-slate-500">
                Logarithmic scale: X-axis is Weighted Fleet Stock, Y-axis is Total Stations. Bubble radius reflects Demand Shortfall.
              </p>
            </div>
          </div>

          <div className="h-96 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  dataKey="weighted_stock"
                  name="Weighted EV Fleet"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  label={{ value: 'Weighted EV Fleet (0.15·2W + 0.70·3W + 1.00·4W)', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#64748b' }}
                />
                <YAxis
                  type="number"
                  dataKey="stations"
                  name="Public Stations"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  label={{ value: 'Public Stations', angle: -90, position: 'insideLeft', offset: -15, fontSize: 11, fill: '#64748b' }}
                />
                <ZAxis type="number" dataKey="demand_ratio" range={[50, 450]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-lg space-y-1">
                          <p className="font-bold text-sm text-emerald-400">{d.city}</p>
                          <p>
                            Weighted EV Fleet: <b>{d.weighted_stock.toLocaleString()}</b>
                          </p>
                          <p>
                            Stations: <b>{d.stations}</b>
                          </p>
                          <p>
                            Effective Public Demand: <b>{d.demand_ratio}</b>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter
                  data={scatterData}
                  fill="#0ea5e9"
                  onClick={(entry) => {
                    onSelectCity(entry.city);
                    onNavigateCityDetail(entry.city);
                  }}
                  className="cursor-pointer"
                >
                  {scatterData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.demand_ratio > 200
                          ? '#dc2626'
                          : entry.demand_ratio > 100
                          ? '#ea580c'
                          : '#0284c7'
                      }
                      fillOpacity={0.8}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
