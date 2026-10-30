import React, { useState, useMemo } from 'react';
import {
  Trophy,
  Search,
  Download,
  Sliders,
  RotateCcw,
  ChevronRight,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { CityRanking, SplitMethod } from '../types';

interface HotspotsViewProps {
  hotspots: CityRanking[];
  onSelectCity: (city: string) => void;
  onNavigateCityDetail: (city: string) => void;
}

export const HotspotsView: React.FC<HotspotsViewProps> = ({
  hotspots,
  onSelectCity,
  onNavigateCityDetail,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [splitFilter, setSplitFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<keyof CityRanking>('rank');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Dynamic sensitivity simulation weights (Default: M1=0.4, M2=0.3, M3=0.3)
  const [weightM1, setWeightM1] = useState<number>(0.4);
  const [weightM2, setWeightM2] = useState<number>(0.3);
  const [weightM3, setWeightM3] = useState<number>(0.3);
  const [showSim, setShowSim] = useState<boolean>(false);

  // Recalculate dynamic CDS when weights change
  const simulatedHotspots = useMemo(() => {
    const isDefault = weightM1 === 0.4 && weightM2 === 0.3 && weightM3 === 0.3;
    if (isDefault) {
      return hotspots;
    }

    const totalWeight = weightM1 + weightM2 + weightM3 || 1.0;
    const normW1 = weightM1 / totalWeight;
    const normW2 = weightM2 / totalWeight;
    const normW3 = weightM3 / totalWeight;

    const recalculated = hotspots.map((item) => {
      // CDS formula: w1*z_m1 + w2*p_high + w3*z_m3
      const simCds = normW1 * (item.z_m1 || 0) + normW2 * (item.p_high || 0) + normW3 * (item.z_m3 || 0);
      let rec = 'Low';
      if (simCds >= 1.5) rec = 'Critical — immediate fast-charger deployment';
      else if (simCds >= 0.75) rec = 'High — prioritise in the next wave';
      else if (simCds >= 0.0) rec = 'Moderate — monitor and plan';

      return {
        ...item,
        cds: simCds,
        recommendation: rec,
      };
    });

    // Re-rank by simCds descending
    recalculated.sort((a, b) => b.cds - a.cds);
    return recalculated.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }, [hotspots, weightM1, weightM2, weightM3]);

  // Filter & Search
  const filteredHotspots = useMemo(() => {
    return simulatedHotspots.filter((item) => {
      const matchSearch =
        item.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.state_code.toLowerCase().includes(searchTerm.toLowerCase());

      const matchTier =
        tierFilter === 'all' ||
        (tierFilter === 'critical' && item.cds >= 1.5) ||
        (tierFilter === 'high' && item.cds >= 0.75 && item.cds < 1.5) ||
        (tierFilter === 'moderate' && item.cds >= 0 && item.cds < 0.75) ||
        (tierFilter === 'low' && item.cds < 0);

      const matchSplit = splitFilter === 'all' || item.split_method === splitFilter;

      return matchSearch && matchTier && matchSplit;
    });
  }, [simulatedHotspots, searchTerm, tierFilter, splitFilter]);

  // Sort
  const sortedHotspots = useMemo(() => {
    return [...filteredHotspots].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? (Number(aVal) || 0) - (Number(bVal) || 0) : (Number(bVal) || 0) - (Number(aVal) || 0);
    });
  }, [filteredHotspots, sortField, sortAsc]);

  const handleSort = (field: keyof CityRanking) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'rank' || field === 'city');
    }
  };

  const handleResetWeights = () => {
    setWeightM1(0.4);
    setWeightM2(0.3);
    setWeightM3(0.3);
  };

  const exportCSV = () => {
    const headers = [
      'Rank',
      'City',
      'State',
      'CDS',
      'M1_Expected_Monthly',
      'P_High_Demand',
      'Forecast_12m_Growth',
      'EV_Stock',
      'Stations_10km',
      'Split_Method',
      'Recommendation',
    ];
    const rows = sortedHotspots.map((r) => [
      r.rank,
      r.city,
      r.state_code,
      r.cds.toFixed(3),
      r.m1_expected_monthly.toFixed(1),
      r.p_high.toFixed(3),
      `${(r.forecast_growth * 100).toFixed(1)}%`,
      Math.round(r.ev_stock),
      r.stations_10km,
      r.split_method,
      `"${r.recommendation}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `EVision_CDS_Rankings_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Actions Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Charging Demand Score (CDS) Hotspot Ranking
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Official ranking of 51 Indian cities. Formula:{' '}
            <code className="text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded font-bold">
              0.4·z(M1 expected) + 0.3·P(high demand) + 0.3·z(M3 growth)
            </code>
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowSim(!showSim)}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
              showSim
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sensitivity Simulator</span>
          </button>

          <button
            onClick={exportCSV}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Weight Sensitivity Simulator Panel */}
      {showSim && (
        <div className="bg-emerald-50/60 rounded-2xl p-6 border border-emerald-200 shadow-xs space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-emerald-600" />
                <span>Live CDS Weight Sensitivity Simulator</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Adjust relative importance of Count (M1), Classifier (M2), or Forecast Growth (M3) to simulate ranking shifts.
              </p>
            </div>
            <button
              onClick={handleResetWeights}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center space-x-1 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset to Defaults (0.4 / 0.3 / 0.3)</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
            {/* M1 Slider */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-800">M1 Expected Monthly (Count)</span>
                <span className="font-extrabold text-emerald-600">{weightM1.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={weightM1}
                onChange={(e) => setWeightM1(parseFloat(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">Weights market size and volume of monthly EV additions</p>
            </div>

            {/* M2 Slider */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-800">M2 P(High Demand) (Classifier)</span>
                <span className="font-extrabold text-emerald-600">{weightM2.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={weightM2}
                onChange={(e) => setWeightM2(parseFloat(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">Exogenous structural propensity (density, income, corridor)</p>
            </div>

            {/* M3 Slider */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-800">M3 12m Growth (SARIMA/HW)</span>
                <span className="font-extrabold text-emerald-600">{weightM3.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={weightM3}
                onChange={(e) => setWeightM3(parseFloat(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">Forward momentum and adoption speed over the next 12 months</p>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search city or state code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
          />
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 font-semibold px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Recommendations</option>
            <option value="critical">Critical (CDS ≥ 1.5)</option>
            <option value="high">High (0.75 – 1.5)</option>
            <option value="moderate">Moderate (0 – 0.75)</option>
            <option value="low">Low (&lt; 0)</option>
          </select>

          <select
            value={splitFilter}
            onChange={(e) => setSplitFilter(e.target.value)}
            className="bg-white border border-slate-200 text-slate-700 font-semibold px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Split Methods</option>
            <option value="measured">Measured (42 cities)</option>
            <option value="state">State Proxy (6 cities)</option>
            <option value="national">National Proxy (3 cities)</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th
                  onClick={() => handleSort('rank')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center space-x-1">
                    <span>#</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('city')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center space-x-1">
                    <span>City</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('cds')}
                  className="py-3 px-4 cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center space-x-1">
                    <span>CDS Score</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('m1_expected_monthly')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>M1 Exp/Mo</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('p_high')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>P(High)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('forecast_growth')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>12m Growth</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('ev_stock')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>EV Stock</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('stations_10km')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Stns (10km)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4">Recommendation</th>
                <th className="py-3 px-4">Split Quality</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedHotspots.map((city) => {
                const isCritical = city.cds >= 1.5;
                const isHigh = city.cds >= 0.75 && city.cds < 1.5;
                const isModerate = city.cds >= 0 && city.cds < 0.75;

                return (
                  <tr
                    key={city.city}
                    onClick={() => {
                      onSelectCity(city.city);
                      onNavigateCityDetail(city.city);
                    }}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-4 font-extrabold text-slate-500">
                      #{city.rank}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                        {city.city}
                      </div>
                      <div className="text-[11px] text-slate-400">{city.state_code}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-extrabold text-slate-900 font-mono text-sm">
                        {city.cds.toFixed(3)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">
                      {Math.round(city.m1_expected_monthly).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">
                      {(city.p_high * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      <span
                        className={
                          city.forecast_growth >= 0 ? 'text-emerald-700' : 'text-slate-600'
                        }
                      >
                        {(city.forecast_growth * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {Math.round(city.ev_stock).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {city.stations_10km}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full inline-block ${
                          isCritical
                            ? 'tag-critical'
                            : isHigh
                            ? 'tag-high'
                            : isModerate
                            ? 'tag-moderate'
                            : 'tag-low'
                        }`}
                      >
                        {city.recommendation.split('—')[0].trim()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge-${city.split_method}`}>
                        {city.split_method}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-slate-400 group-hover:text-emerald-600 transition-colors">
                        <ChevronRight className="w-4 h-4 ml-auto" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div>
            Showing <b>{sortedHotspots.length}</b> of 51 analysed cities
          </div>
          <div className="flex items-center space-x-3 text-[11px]">
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Measured 2W/3W/4W (42)</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>State Proxy (6)</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>National Proxy (3)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
