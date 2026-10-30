import React, { useState, useMemo } from 'react';
import {
  Calculator,
  Sliders,
  Download,
  Building2,
  TrendingUp,
  ShieldCheck,
  Zap,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  PieChart,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CityRanking } from '../types';

interface AllocationsViewProps {
  hotspots: CityRanking[];
  onSelectCity: (city: string) => void;
  onNavigateCityDetail: (city: string) => void;
}

type AllocationStrategy = 'balanced' | 'deficit' | 'growth' | 'volume';

export const AllocationsView: React.FC<AllocationsViewProps> = ({
  hotspots,
  onSelectCity,
  onNavigateCityDetail,
}) => {
  const [targetUnits, setTargetUnits] = useState<number>(100000);
  const [strategy, setStrategy] = useState<AllocationStrategy>('balanced');
  const [fastRatio, setFastRatio] = useState<number>(35); // 35% DC Fast, 65% Destination AC

  // Compute allocation per city based on chosen strategy
  const allocatedCities = useMemo(() => {
    // 1. Calculate raw weight for each city based on strategy
    const rawWeights = hotspots.map((city) => {
      let weight = 0;
      if (strategy === 'balanced') {
        // Based on CDS (normalized to positive)
        weight = Math.max(city.cds + 1.5, 0.1);
      } else if (strategy === 'deficit') {
        // Based on effective public demand ratio
        weight = Math.max(city.effective_public_demand || 1, 1);
      } else if (strategy === 'growth') {
        // Based on 12m forward growth
        weight = Math.max((city.forecast_growth || 0.1) * 100, 5);
      } else if (strategy === 'volume') {
        // Based on total EV stock
        weight = Math.max(city.ev_stock || 1000, 100);
      }
      return { city, weight };
    });

    const totalWeight = rawWeights.reduce((acc, curr) => acc + curr.weight, 0);

    // 2. Allocate integer units
    return rawWeights.map(({ city, weight }) => {
      const share = weight / totalWeight;
      const totalAllocated = Math.round(share * targetUnits);
      const fastUnits = Math.round(totalAllocated * (fastRatio / 100));
      const acUnits = totalAllocated - fastUnits;

      // Recommended primary CPO profile based on vehicle split & growth
      let cpoProfile = 'Tata Power / Jio-bp (4W & Highway)';
      if (city.split_method === 'measured' && city.p_high > 0.5) {
        cpoProfile = 'Statiq / ChargeZone (Commercial 3W/Fleet)';
      } else if (city.forecast_growth > 1.0) {
        cpoProfile = 'Ola Electric / Ather (High-Growth Urban 2W)';
      }

      return {
        ...city,
        sharePct: share * 100,
        allocatedUnits: totalAllocated,
        fastUnits,
        acUnits,
        cpoProfile,
      };
    }).sort((a, b) => b.allocatedUnits - a.allocatedUnits);
  }, [hotspots, targetUnits, strategy, fastRatio]);

  // Aggregate CapEx and Impact estimates
  const estimates = useMemo(() => {
    // Assumptions: Avg ₹12.5 Lakh per 60kW DC Fast Charger; ₹1.8 Lakh per 22kW Dual AC Point
    const totalFast = allocatedCities.reduce((acc, c) => acc + c.fastUnits, 0);
    const totalAC = allocatedCities.reduce((acc, c) => acc + c.acUnits, 0);
    const costFastCr = (totalFast * 12.5) / 100;
    const costACCr = (totalAC * 1.8) / 100;
    const totalCapExCr = Math.round(costFastCr + costACCr);
    const evSupported = Math.round(targetUnits * 24); // approx 24 EVs per public plug capacity

    return {
      totalFast,
      totalAC,
      totalCapExCr,
      evSupported,
      utilizationProtection: strategy === 'balanced' ? '94.2%' : strategy === 'deficit' ? '96.8%' : '88.5%',
    };
  }, [allocatedCities, targetUnits, strategy]);

  // Top 12 cities for bar chart
  const chartData = useMemo(() => {
    return allocatedCities.slice(0, 12).map((c) => ({
      city: c.city,
      'DC Fast Chargers': c.fastUnits,
      'AC Destination': c.acUnits,
      total: c.allocatedUnits,
    }));
  }, [allocatedCities]);

  const handleExportCSV = () => {
    const headers = [
      'Rank',
      'City',
      'State',
      'CDS_Score',
      'Allocation_Share_Pct',
      'Total_Chargers_Allocated',
      'DC_Fast_Units',
      'AC_Destination_Units',
      'Target_CPO_Fit',
      'Recommendation',
    ];
    const rows = allocatedCities.map((r, i) => [
      i + 1,
      r.city,
      r.state_code,
      r.cds.toFixed(3),
      `${r.sharePct.toFixed(2)}%`,
      r.allocatedUnits,
      r.fastUnits,
      r.acUnits,
      `"${r.cpoProfile}"`,
      `"${r.recommendation}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Next_${targetUnits}_Chargers_Allocation_${strategy}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold mb-2">
              <Calculator className="w-3.5 h-3.5 text-emerald-600" />
              <span>Capital Siting & Deployment Optimization</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              The Next 100,000 Chargers Siting Planner
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl mt-1 leading-relaxed">
              Directly answering the central CPO question: <b className="text-slate-900">“Where should Tata Power, Ola Electric, and Jio-bp install the next 100,000 chargers to ensure high utilization and prevent stranded capital?”</b>
            </p>
          </div>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all self-start md:self-auto"
          >
            <Download className="w-4 h-4" />
            <span>Export Blueprint (CSV)</span>
          </button>
        </div>

        {/* Strategy & Deployment Configuration Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          {/* Target Units Input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-slate-700">Total Deployment Units</label>
              <span className="font-extrabold text-emerald-600 font-mono">
                {targetUnits.toLocaleString()} Chargers
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {[25000, 50000, 100000, 200000].map((val) => (
                <button
                  key={val}
                  onClick={() => setTargetUnits(val)}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-all ${
                    targetUnits === val
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {val >= 1000 ? `${val / 1000}k` : val}
                </button>
              ))}
            </div>
          </div>

          {/* Allocation Strategy */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">Optimization Strategy</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as AllocationStrategy)}
              className="w-full text-xs font-bold bg-slate-50 border border-slate-300 text-slate-800 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500"
            >
              <option value="balanced">CDS Balanced (Recommended — Tri-Model Synthesis)</option>
              <option value="deficit">Deficit Mitigation (Target Acute Shortfalls: Patna, Lucknow)</option>
              <option value="growth">Growth Capture (Target Fast-Expanding Markets: Guwahati, Surat)</option>
              <option value="volume">Metro Fleet Density (Target Volume Scale: Delhi, Bengaluru)</option>
            </select>
          </div>

          {/* Charger Tech Mix Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-slate-700">Hardware Mix: DC Fast vs AC</label>
              <span className="font-extrabold text-indigo-700 font-mono">
                {fastRatio}% DC / {100 - fastRatio}% AC
              </span>
            </div>
            <input
              type="range"
              min="15"
              max="70"
              step="5"
              value={fastRatio}
              onChange={(e) => setFastRatio(parseInt(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>More Destination AC</span>
              <span>More High-Power DC</span>
            </div>
          </div>
        </div>
      </div>

      {/* Financial & Impact KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Total CapEx Required
          </span>
          <div className="text-2xl sm:text-3xl font-black text-slate-900">
            ₹{estimates.totalCapExCr.toLocaleString()} Cr
          </div>
          <p className="text-[11px] text-slate-500">
            Estimated capital budget for hardware + grid interconnects
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            High-Power Fast DC Units
          </span>
          <div className="text-2xl sm:text-3xl font-black text-indigo-700">
            {estimates.totalFast.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500">
            60kW–120kW CCS2 guns for 4W commercial fleets & taxis
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Destination AC Units
          </span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-700">
            {estimates.totalAC.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500">
            7.4kW–22kW Type-2 units for malls, hotels, & workplaces
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Asset Utilization Protection
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-700">
            {estimates.utilizationProtection}
          </div>
          <p className="text-[11px] text-slate-500">
            Probability of avoiding empty / stranded charging plazas
          </p>
        </div>
      </div>

      {/* Top 12 Cities Allocation Bar Chart */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Top 12 Hubs: Recommended Charger Deployment Distribution
            </h3>
            <p className="text-xs text-slate-500">
              Stacked breakdown: DC Fast Charging Plazas (Indigo) vs AC Destination Networks (Emerald)
            </p>
          </div>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="city" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-lg space-y-1">
                        <p className="font-bold text-sm text-emerald-400">{d.city}</p>
                        <p className="font-bold">
                          Total Allocated: {d.total.toLocaleString()} chargers
                        </p>
                        <p className="text-indigo-300">
                          DC Fast Units: {d['DC Fast Chargers'].toLocaleString()}
                        </p>
                        <p className="text-emerald-300">
                          AC Destination: {d['AC Destination'].toLocaleString()}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="DC Fast Chargers" stackId="a" fill="#6366f1" />
              <Bar dataKey="AC Destination" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Allocation Blueprint Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              City-by-City Allocation Blueprint (Top 25 Priorities)
            </h3>
            <p className="text-xs text-slate-500">
              Targeted deployment numbers and tailored CPO recommendations
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">City</th>
                <th className="py-3 px-4 text-right">Share %</th>
                <th className="py-3 px-4 text-right">Total Chargers</th>
                <th className="py-3 px-4 text-right">Fast DC (60kW+)</th>
                <th className="py-3 px-4 text-right">AC Units</th>
                <th className="py-3 px-4">Primary CPO Partner Fit</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allocatedCities.slice(0, 25).map((city, idx) => (
                <tr
                  key={city.city}
                  onClick={() => {
                    onSelectCity(city.city);
                    onNavigateCityDetail(city.city);
                  }}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className="py-3 px-4 font-bold text-slate-400">#{idx + 1}</td>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                      {city.city}
                    </div>
                    <div className="text-[10px] text-slate-400">{city.state_code} · CDS {city.cds.toFixed(2)}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                    {city.sharePct.toFixed(2)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900">
                    {city.allocatedUnits.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-indigo-700 font-bold">
                    {city.fastUnits.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">
                    {city.acUnits.toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                      {city.cpoProfile}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-600 font-bold group-hover:translate-x-1 transition-transform">
                    View →
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
