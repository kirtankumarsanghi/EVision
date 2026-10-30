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
import { DemandMetric } from '../types';
import { PageHeader } from './ui';
import { BarList } from './BarList';

interface DemandGapViewProps {
  demandData: DemandMetric[];
  onSelectCity: (city: string) => void;
  onNavigateCityDetail: (city: string) => void;
}

export const DemandGapView: React.FC<DemandGapViewProps> = ({
  demandData,
  onSelectCity,
  onNavigateCityDetail,
}) => {
  const [activeTab, setActiveTab] = useState<'ranking' | 'scatter'>('ranking');

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
    <div className="space-y-5 pb-12">
      <PageHeader
        eyebrow="Objective 1 · Siting gap"
        icon={ShieldAlert}
        title="Demand vs supply gap"
        description="Public demand is weighted by how much each vehicle class relies on shared charging, then divided by the chargers already available within the comparison radius."
        actions={
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5">
            <button
              onClick={() => setActiveTab('ranking')}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                activeTab === 'ranking'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Top gap shortlist
            </button>
            <button
              onClick={() => setActiveTab('scatter')}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all ${
                activeTab === 'scatter'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Supply vs fleet
            </button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-slate-200/70">
          <div className="space-y-1.5 lg:pl-4 lg:first:pl-0">
            <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              <Zap className="h-3.5 w-3.5 text-brand-600" />
              Weighting
            </span>
            <code className="block rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-[10.5px] text-slate-800 ring-1 ring-slate-200/70">
              0.15·2W + 0.70·3W + 1.00·4W + 0.60·COMM
            </code>
          </div>
          <div className="space-y-1 lg:pl-4">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">2W · 0.15</span>
            <p className="text-[11px] leading-relaxed text-slate-600">
              Two-wheelers charge mostly at home, so they add little public fast-charger load.
            </p>
          </div>
          <div className="space-y-1 lg:pl-4">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">3W · 0.70</span>
            <p className="text-[11px] leading-relaxed text-slate-600">
              Autos and cargo three-wheelers run long shifts and top up publicly through the day.
            </p>
          </div>
          <div className="space-y-1 lg:pl-4">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">4W & commercial · 1.00 / 0.60</span>
            <p className="text-[11px] leading-relaxed text-slate-600">
              Cars and commercial fleets depend on high-power public charging for range.
            </p>
          </div>
        </div>
      </PageHeader>

      {/* Main View Area */}
      {activeTab === 'ranking' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Constrained Cities Bar Chart */}
          <div className="lg:col-span-7 surface p-5 sm:p-6 space-y-4">
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

            <BarList
              items={topConstrained.slice(0, 12).map((city) => ({
                key: city.city,
                label: city.city,
                value: city.effective_public_demand,
                display: `${Math.round(city.effective_public_demand).toLocaleString()}`,
                hint: `${city.stations_within_radius} public stations`,
              }))}
              onSelect={(key) => onNavigateCityDetail(key)}
            />
            <p className="text-[10.5px] text-slate-400">
              Effective public demand per station. Click a row to open the city profile.
            </p>
          </div>

          {/* Side Shortlist Table */}
          <div className="lg:col-span-5 surface p-5 sm:p-6 space-y-4">
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
                      <div className="font-bold text-xs text-slate-900 group-hover:text-brand-600 transition-colors">
                        {c.city}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {c.stations_within_radius} stations · {Math.round(c.weighted_ev_stock).toLocaleString()} weighted EVs
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-extrabold text-xs text-slate-800 font-mono">
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
        <div className="surface p-5 sm:p-6 space-y-4">
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
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  type="number"
                  dataKey="weighted_stock"
                  name="Weighted EV Fleet"
                  tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                  label={{ value: 'Weighted EV Fleet (0.15·2W + 0.70·3W + 1.00·4W)', position: 'insideBottom', offset: -10, fontSize: 11, fill: 'var(--chart-axis)' }}
                />
                <YAxis
                  type="number"
                  dataKey="stations"
                  name="Public Stations"
                  tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
                  label={{ value: 'Public Stations', angle: -90, position: 'insideLeft', offset: -15, fontSize: 11, fill: 'var(--chart-axis)' }}
                />
                <ZAxis type="number" dataKey="demand_ratio" range={[50, 450]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-lg space-y-1">
                          <p className="font-bold text-sm text-brand-400">{d.city}</p>
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
                <Scatter isAnimationActive={false}
                  data={scatterData}
                  fill="var(--bar-3)"
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
                          ? 'var(--bar)'
                          : entry.demand_ratio > 100
                          ? 'var(--bar-2)'
                          : 'var(--bar-3)'
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
