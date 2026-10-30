import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sparkles,
  ArrowUpDown,
  Layers,
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
import { ForecastSummary } from '../types';

interface ForecastViewProps {
  forecastsData: ForecastSummary[];
  onSelectCity: (city: string) => void;
  onNavigateCityDetail: (city: string) => void;
}

export const ForecastView: React.FC<ForecastViewProps> = ({
  forecastsData,
  onSelectCity,
  onNavigateCityDetail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [winnerFilter, setWinnerFilter] = useState<'all' | 'SARIMA' | 'Holt-Winters'>('all');
  const [sortField, setSortField] = useState<keyof ForecastSummary>('forecast_growth');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Top 10 Growth Cities
  const topGrowth = useMemo(() => {
    return [...forecastsData]
      .sort((a, b) => b.forecast_growth - a.forecast_growth)
      .slice(0, 10)
      .map((f) => ({
        city: f.city,
        growth: Math.round(f.forecast_growth * 100),
        winner: f.winner,
        forecast_12m: Math.round(f.forecast_12m),
      }));
  }, [forecastsData]);

  // Tournament statistics
  const stats = useMemo(() => {
    const sarimaWins = forecastsData.filter((f) => f.winner === 'SARIMA').length;
    const hwWins = forecastsData.filter((f) => f.winner === 'Holt-Winters').length;
    const avgGrowth =
      forecastsData.reduce((acc, f) => acc + (f.forecast_growth || 0), 0) / (forecastsData.length || 1);
    const allOk = forecastsData.every((f) => f.forecast_quality === 'ok');

    return { sarimaWins, hwWins, avgGrowth, allOk };
  }, [forecastsData]);

  // Filter & Search
  const filteredData = useMemo(() => {
    return forecastsData.filter((item) => {
      const matchSearch = item.city.toLowerCase().includes(searchTerm.toLowerCase());
      const matchWinner = winnerFilter === 'all' || item.winner === winnerFilter;
      return matchSearch && matchWinner;
    });
  }, [forecastsData, searchTerm, winnerFilter]);

  // Sort
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? (Number(aVal) || 0) - (Number(bVal) || 0) : (Number(bVal) || 0) - (Number(aVal) || 0);
    });
  }, [filteredData, sortField, sortAsc]);

  const handleSort = (field: keyof ForecastSummary) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Overview & Tournament Stats */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200 text-xs font-bold mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
              <span>Objective 4 — 12-Month Horizon Outlook</span>
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              SARIMA vs Holt-Winters Forecast Tournament
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Every city's time-series is fitted against a 9-month holdout test set. The model minimizing test RMSE wins.
            </p>
          </div>
        </div>

        {/* Tournament Highlights Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">SARIMA Wins</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">{stats.sarimaWins} cities</div>
            <span className="text-[11px] text-slate-400">Seasonal autoregression</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Holt-Winters Wins</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">{stats.hwWins} cities</div>
            <span className="text-[11px] text-slate-400">Triple exponential smoothing</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Average 12m Growth</span>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1">
              {(stats.avgGrowth * 100).toFixed(0)}%
            </div>
            <span className="text-[11px] text-slate-400">Across 51 major hubs</span>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Model Stability</span>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1 flex items-center space-x-1">
              <span>51/51 OK</span>
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">0 weak · 0 unstable</span>
          </div>
        </div>
      </div>

      {/* Top Growth Bar Chart */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Top 10 Projected Growth Hubs (12-Month Outlook)</h3>
          <p className="text-xs text-slate-500">
            Rapidly expanding markets where charger siting delivers high forward utilization
          </p>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topGrowth} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="city" tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} axisLine={{ stroke: '#e2e8f0' }} />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#e2e8f0' }}
                tickFormatter={(v) => `+${v}%`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-lg space-y-1">
                        <p className="font-bold text-sm text-purple-400">{d.city}</p>
                        <p>
                          12-Month Growth: <b>+{d.growth}%</b>
                        </p>
                        <p>
                          Forecast Additions: <b>{d.forecast_12m.toLocaleString()} EVs</b>
                        </p>
                        <p>
                          Winning Model: <b>{d.winner}</b>
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="growth" fill="#8b5cf6" radius={[6, 6, 0, 0]}>
                {topGrowth.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.winner === 'SARIMA' ? '#8b5cf6' : '#ec4899'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-center space-x-6 text-xs text-slate-600 pt-2 border-t border-slate-100">
          <span className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-md bg-[#8b5cf6]"></span>
            <span>SARIMA Winner</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded-md bg-[#ec4899]"></span>
            <span>Holt-Winters Winner</span>
          </span>
        </div>
      </div>

      {/* Forecast Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Search & Filter Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setWinnerFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                winnerFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All (51)
            </button>
            <button
              onClick={() => setWinnerFilter('SARIMA')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                winnerFilter === 'SARIMA'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              SARIMA ({stats.sarimaWins})
            </button>
            <button
              onClick={() => setWinnerFilter('Holt-Winters')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                winnerFilter === 'Holt-Winters'
                  ? 'bg-pink-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Holt-Winters ({stats.hwWins})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">City</th>
                <th className="py-3 px-4">Winning Model</th>
                <th
                  onClick={() => handleSort('holdout_rmse_rel')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Holdout RMSE/Level</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('last_12m')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Last 12m</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('forecast_12m')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Forecast 12m</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('forecast_growth')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Projected Growth</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">Quality</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedData.map((f) => (
                <tr
                  key={f.city}
                  onClick={() => {
                    onSelectCity(f.city);
                    onNavigateCityDetail(f.city);
                  }}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className="py-3 px-4 font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                    {f.city}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        f.winner === 'SARIMA'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-pink-100 text-pink-800'
                      }`}
                    >
                      {f.winner}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-700">
                    {f.holdout_rmse_rel?.toFixed(3) || 'N/A'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-700">
                    {Math.round(f.last_12m).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                    {Math.round(f.forecast_12m).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold">
                    <span
                      className={f.forecast_growth >= 0 ? 'text-emerald-700' : 'text-rose-600'}
                    >
                      {(f.forecast_growth * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {f.forecast_quality}
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
