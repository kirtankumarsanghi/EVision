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
import { PageHeader, StatGroup, Tag } from './ui';
import { BarList } from './BarList';
import { SERIES } from '../lib/palette';

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
    const okCount = forecastsData.filter((f) => f.forecast_quality === 'ok').length;
    const weakCount = forecastsData.filter((f) => f.forecast_quality === 'weak').length;
    const unstableCount = forecastsData.filter((f) => f.forecast_quality === 'unstable').length;
    const allOk = okCount === forecastsData.length && forecastsData.length > 0;

    return { sarimaWins, hwWins, avgGrowth, okCount, weakCount, unstableCount, allOk };
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
    <div className="space-y-5 pb-12">
      <PageHeader
        eyebrow="Objective 4 · 12-month outlook"
        icon={TrendingUp}
        title="Forecast tournament"
        description="Every city is fitted with SARIMA and Holt-Winters against a 9-month holdout window. The model with the lower test RMSE wins and becomes that city's forecast."
      />

      <StatGroup
        columns={4}
        items={[
          {
            label: 'SARIMA wins',
            value: `${stats.sarimaWins} cities`,
            sub: 'Seasonal autoregression',
          },
          {
            label: 'Holt-Winters wins',
            value: `${stats.hwWins} cities`,
            sub: 'Triple exponential smoothing',
          },
          {
            label: 'Average 12m growth',
            value: `${(stats.avgGrowth * 100).toFixed(0)}%`,
            sub: `Across ${forecastsData.length} major hubs`,
            tone: 'text-slate-900',
          },
          {
            label: 'Model stability',
            value: `${stats.okCount}/${forecastsData.length} OK`,
            sub: `${stats.weakCount} weak · ${stats.unstableCount} unstable`,
            tone: 'text-slate-900',
          },
        ]}
      />

      {/* Top Growth Bar Chart */}
      <div className="surface p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">Top 10 Projected Growth Hubs (12-Month Outlook)</h3>
          <p className="text-xs text-slate-500">
            Rapidly expanding markets where charger siting delivers high forward utilization
          </p>
        </div>

        <BarList
          items={topGrowth.map((city) => {
            const dot = city.winner === 'SARIMA' ? SERIES.secondary : SERIES.tertiary;
            return {
              key: city.city,
              label: city.city,
              value: city.growth,
              display: `+${city.growth}%`,
              dotColor: dot,
              barColor: 'var(--bar)',
              hint: `${city.winner} winner · ${city.forecast_12m.toLocaleString()} forecast EVs`,
            };
          })}
          onSelect={(key) => onNavigateCityDetail(key)}
        />
        <p className="text-[10.5px] text-slate-400">
          Projected 12-month growth, ranked. Click a row to open the city profile.
        </p>

        <div className="flex items-center justify-center space-x-6 text-xs text-slate-600 pt-2 border-t border-slate-100">
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#4c6b8a]"></span>
            <span>SARIMA winner</span>
          </span>
          <span className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#a85a3c]"></span>
            <span>Holt-Winters winner</span>
          </span>
        </div>
      </div>

      {/* Forecast Comparison Table */}
      <div className="surface overflow-hidden">
        {/* Table Search & Filter Bar */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500 font-medium"
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
              All ({forecastsData.length})
            </button>
            <button
              onClick={() => setWinnerFilter('SARIMA')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                winnerFilter === 'SARIMA'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              SARIMA ({stats.sarimaWins})
            </button>
            <button
              onClick={() => setWinnerFilter('Holt-Winters')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                winnerFilter === 'Holt-Winters'
                  ? 'bg-slate-900 text-white'
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
                  <td className="py-3 px-4 font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                    {f.city}
                  </td>
                  <td className="py-3 px-4">
                    <Tag tone={f.winner === 'SARIMA' ? 'violet' : 'pink'}>{f.winner}</Tag>
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
                      className={f.forecast_growth >= 0 ? 'text-slate-900' : 'text-rose-600'}
                    >
                      {(f.forecast_growth * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Tag
                      tone={
                        f.forecast_quality === 'ok'
                          ? 'blue'
                          : f.forecast_quality === 'weak'
                          ? 'amber'
                          : 'rose'
                      }
                    >
                      {f.forecast_quality}
                    </Tag>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-400 transition-colors group-hover:text-brand-600">
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
