import React, { useState, useMemo } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  MapPin,
  Info,
  ChevronRight,
  TrendingUp,
  Zap,
  Filter,
  Layers,
} from 'lucide-react';
import { CityRanking } from '../types';
import { api } from '../api';

interface MapViewProps {
  hotspots: CityRanking[];
  onSelectCity: (city: string) => void;
  onNavigateCityDetail: (city: string) => void;
}

export const MapView: React.FC<MapViewProps> = ({
  hotspots,
  onSelectCity,
  onNavigateCityDetail,
}) => {
  const mapData = useMemo(() => api.getMapStaticData(), []);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredCity, setHoveredCity] = useState<CityRanking | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<CityRanking | null>(hotspots[0] || null);
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [metricMode, setMetricMode] = useState<'cds' | 'demand' | 'stock'>('cds');
  const [choroplethMode, setChoroplethMode] = useState<'off' | 'policy' | 'fleet'>('fleet');
  const [showLabels, setShowLabels] = useState<boolean>(true);

  // Map coordinates projection
  const { states, city_coords } = mapData;
  const WIDTH = 820;
  const HEIGHT = 900;
  const LON_MIN = 66.0;
  const LON_MAX = 98.5;
  const LAT_MIN = 6.5;
  const LAT_MAX = 37.5;
  const MEAN_LAT = 22.0;

  const project = (lon: number, lat: number): [number, number] => {
    const rad = Math.PI / 180;
    const x = (lon - LON_MIN) * Math.cos(MEAN_LAT * rad);
    const x_max = (LON_MAX - LON_MIN) * Math.cos(MEAN_LAT * rad);
    const y = LAT_MAX - lat;
    const y_max = LAT_MAX - LAT_MIN;
    return [(x / x_max) * WIDTH, (y / y_max) * HEIGHT];
  };

  // State Name to Code mapping
  const stateCodeMap: Record<string, string> = {
    'Andhra Pradesh': 'AP',
    'Assam': 'AS',
    'Bihar': 'BR',
    'Chandigarh': 'CH',
    'Chhattisgarh': 'CG',
    'Delhi': 'DL',
    'Goa': 'GA',
    'Gujarat': 'GJ',
    'Haryana': 'HR',
    'Himachal Pradesh': 'HP',
    'Jammu and Kashmir': 'JK',
    'Jharkhand': 'JH',
    'Karnataka': 'KA',
    'Kerala': 'KL',
    'Madhya Pradesh': 'MP',
    'Maharashtra': 'MH',
    'Orissa': 'OR',
    'Punjab': 'PB',
    'Rajasthan': 'RJ',
    'Tamil Nadu': 'TN',
    'Telangana': 'TG',
    'Uttar Pradesh': 'UP',
    'Uttaranchal': 'UK',
    'West Bengal': 'WB',
  };

  const statePolicyScores: Record<string, number> = {
    DL: 3, MH: 3, GJ: 3, TN: 3, OR: 3, CH: 3,
    KA: 2, UP: 2, RJ: 2, MP: 2, AP: 2, TG: 2, KL: 2, PB: 2, HR: 2, WB: 2, BR: 2,
    AS: 1, JH: 1, UK: 1, CG: 1, JK: 1,
  };

  // Compute state-level fleet totals
  const stateFleetTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    hotspots.forEach((h) => {
      totals[h.state_code] = (totals[h.state_code] || 0) + (h.ev_stock || 0);
    });
    return totals;
  }, [hotspots]);

  const maxStateFleet = useMemo(
    () => Math.max(...Object.values(stateFleetTotals), 100000),
    [stateFleetTotals]
  );

  const getStateColor = (stateName: string) => {
    const code = stateCodeMap[stateName];
    if (choroplethMode === 'off' || !code) return '#f1f5f9';

    if (choroplethMode === 'policy') {
      const score = statePolicyScores[code] || 1;
      if (score >= 3) return '#bae6fd'; // Sky blue - Score 3
      if (score >= 2) return '#e0f2fe'; // Light sky - Score 2
      return '#f8fafc'; // Neutral - Score 1
    }

    if (choroplethMode === 'fleet') {
      const fleet = stateFleetTotals[code] || 0;
      if (fleet === 0) return '#f8fafc';
      const ratio = fleet / maxStateFleet;
      if (ratio > 0.6) return '#bbf7d0'; // High density green
      if (ratio > 0.25) return '#dcfce7'; // Medium green
      return '#f0fdf4'; // Light green
    }

    return '#f1f5f9';
  };

  const maxCds = useMemo(() => Math.max(...hotspots.map((c) => c.cds || 1)), [hotspots]);
  const maxDemand = useMemo(
    () => Math.max(...hotspots.map((c) => c.effective_public_demand || 1)),
    [hotspots]
  );
  const maxStock = useMemo(() => Math.max(...hotspots.map((c) => c.ev_stock || 1)), [hotspots]);

  // Color determination for city bubbles
  const getCityColor = (cds: number) => {
    if (cds >= 1.5) return '#dc2626'; // Critical - Red
    if (cds >= 0.75) return '#ea580c'; // High - Orange
    if (cds >= 0.0) return '#0284c7'; // Moderate - Blue
    return '#64748b'; // Low - Slate
  };

  // Filtered hotspots
  const filteredHotspots = useMemo(() => {
    return hotspots.filter((c) => {
      if (tierFilter === 'critical') return c.cds >= 1.5;
      if (tierFilter === 'high') return c.cds >= 0.75 && c.cds < 1.5;
      if (tierFilter === 'moderate') return c.cds >= 0 && c.cds < 0.75;
      if (tierFilter === 'low') return c.cds < 0;
      return true;
    });
  }, [hotspots, tierFilter]);

  // Calculate bubble radius based on selected metric
  const getBubbleRadius = (city: CityRanking) => {
    if (metricMode === 'demand') {
      const val = Math.max(city.effective_public_demand || 0, 0);
      return 4 + 11 * Math.sqrt(val / maxDemand);
    }
    if (metricMode === 'stock') {
      const val = Math.max(city.ev_stock || 0, 0);
      return 4 + 11 * Math.sqrt(val / maxStock);
    }
    // Default: CDS
    const val = Math.max(city.cds || 0, 0);
    return 4 + 10 * Math.sqrt(val / maxCds);
  };

  const handleZoom = (delta: number) => {
    setZoom((prev) => Math.min(Math.max(prev + delta, 0.8), 3.0));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const activeFocus = hoveredCity || selectedCity || hotspots[0];

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Controls bar */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            <span>Interactive India Choropleth & Charging Demand Map</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            51 monitored cities across 35 Indian states and union territories. Shaded state choropleth with priority hotspots.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Choropleth Layer Selector */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
            <span className="text-[11px] font-bold text-slate-500 px-2 flex items-center space-x-1">
              <Layers className="w-3 h-3 text-slate-400" />
              <span>Choropleth:</span>
            </span>
            <button
              onClick={() => setChoroplethMode('fleet')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                choroplethMode === 'fleet'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              State Fleet
            </button>
            <button
              onClick={() => setChoroplethMode('policy')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                choroplethMode === 'policy'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              State Policy
            </button>
            <button
              onClick={() => setChoroplethMode('off')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                choroplethMode === 'off'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Outlines
            </button>
          </div>

          {/* Metric Selector for bubbles */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setMetricMode('cds')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                metricMode === 'cds'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              CDS
            </button>
            <button
              onClick={() => setMetricMode('demand')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                metricMode === 'demand'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Gap
            </button>
            <button
              onClick={() => setMetricMode('stock')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                metricMode === 'stock'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fleet
            </button>
          </div>

          {/* Tier filter */}
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-700 font-semibold px-2.5 py-1.5 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Tiers (51)</option>
            <option value="critical">Critical (≥ 1.5)</option>
            <option value="high">High (0.75 – 1.5)</option>
            <option value="moderate">Moderate (0 – 0.75)</option>
            <option value="low">Low (&lt; 0)</option>
          </select>

          {/* Label toggle */}
          <label className="flex items-center space-x-1.5 cursor-pointer text-slate-600 font-medium px-2 py-1">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Labels</span>
          </label>
        </div>
      </div>

      {/* Map + Detail sidebar layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SVG Map Canvas */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm p-4 relative overflow-hidden">
          {/* Zoom controls float */}
          <div className="absolute top-6 left-6 z-10 flex flex-col space-y-1 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl shadow-md p-1">
            <button
              onClick={() => handleZoom(0.2)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleZoom(-0.2)}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Choropleth & City Legend float */}
          <div className="absolute bottom-6 left-6 z-10 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-2xl p-3.5 shadow-md space-y-2 text-xs text-slate-600 max-w-xs">
            <div className="font-bold text-[11px] uppercase tracking-wider text-slate-500">
              {choroplethMode === 'fleet'
                ? 'State Choropleth (EV Adoption Intensity)'
                : choroplethMode === 'policy'
                ? 'State Choropleth (Policy Score)'
                : 'Priority Legend'}
            </div>

            {/* City Bubble scale */}
            <div className="space-y-1 border-b border-slate-100 pb-2">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-red-600"></span>
                <span className="font-semibold text-slate-800">Critical (CDS ≥ 1.5)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                <span className="font-semibold text-slate-800">High (0.75 – 1.5)</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-sky-600"></span>
                <span>Moderate (0 – 0.75)</span>
              </div>
            </div>

            {/* Choropleth info */}
            {choroplethMode !== 'off' && (
              <div className="pt-1 text-[11px] text-slate-500 space-y-1">
                <div className="flex items-center space-x-1.5">
                  <span
                    className={`w-3.5 h-3 rounded border ${
                      choroplethMode === 'fleet'
                        ? 'bg-emerald-200 border-emerald-300'
                        : 'bg-sky-200 border-sky-300'
                    }`}
                  ></span>
                  <span>
                    {choroplethMode === 'fleet'
                      ? 'Darker green = higher state EV fleet'
                      : 'Blue shading = high policy incentive score'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* SVG Map */}
          <div className="w-full flex items-center justify-center overflow-hidden min-h-[580px]">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="w-full max-h-[720px] transition-transform duration-200 ease-out cursor-grab active:cursor-grabbing"
              style={{
                transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: 'center center',
              }}
            >
              {/* State Choropleth Polygons */}
              <g className="states">
                {states.map((st, idx) => {
                  const stateFill = getStateColor(st.name);
                  const isHoveredState = hoveredState === st.name;
                  return (
                    <path
                      key={`${st.name}-${idx}`}
                      d={st.path}
                      fill={stateFill}
                      stroke={isHoveredState ? '#0f172a' : '#cbd5e1'}
                      strokeWidth={isHoveredState ? '1.5' : '0.75'}
                      onMouseEnter={() => setHoveredState(st.name)}
                      onMouseLeave={() => setHoveredState(null)}
                      className="transition-colors duration-150 cursor-pointer"
                    >
                      <title>{st.name} (EVision State Layer)</title>
                    </path>
                  );
                })}
              </g>

              {/* City Hotspots Bubbles */}
              <g className="cities">
                {filteredHotspots.map((city) => {
                  const coords = (city_coords as unknown as Record<string, [number, number]>)[city.city];
                  if (!coords) return null;
                  const [cx, cy] = project(coords[1], coords[0]);
                  const r = getBubbleRadius(city);
                  const isHovered = hoveredCity?.city === city.city;
                  const isSelected = selectedCity?.city === city.city;
                  const color = getCityColor(city.cds);

                  return (
                    <g
                      key={city.city}
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredCity(city)}
                      onMouseLeave={() => setHoveredCity(null)}
                      onClick={() => {
                        setSelectedCity(city);
                        onSelectCity(city.city);
                      }}
                    >
                      {/* Pulse ring for Critical cities or selected */}
                      {(city.cds >= 1.5 || isSelected) && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r + 5}
                          fill="none"
                          stroke={color}
                          strokeWidth="2"
                          opacity="0.4"
                          className="animate-pulse"
                        />
                      )}

                      {/* Main City Bubble */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered || isSelected ? r * 1.3 : r}
                        fill={color}
                        fillOpacity={isHovered || isSelected ? 0.95 : 0.8}
                        stroke="#ffffff"
                        strokeWidth={isSelected ? '2.5' : '1.2'}
                        className="transition-all duration-150 drop-shadow-sm"
                      />

                      {/* City Text Label */}
                      {showLabels && (city.rank <= 15 || isHovered || isSelected || zoom > 1.4) && (
                        <text
                          x={cx}
                          y={cy - r - 3}
                          fontSize={isSelected || isHovered ? '11' : '8.5'}
                          fontWeight={isSelected || isHovered ? '800' : '700'}
                          fill="#0f172a"
                          textAnchor="middle"
                          className="select-none pointer-events-none drop-shadow-xs"
                        >
                          {city.city}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>

        {/* Selected City Details Panel */}
        <div className="lg:col-span-4 space-y-4">
          {activeFocus ? (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold px-2.5 py-1 rounded-md bg-slate-900 text-white">
                  Rank #{activeFocus.rank} of 51
                </span>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    activeFocus.cds >= 1.5
                      ? 'tag-critical'
                      : activeFocus.cds >= 0.75
                      ? 'tag-high'
                      : 'tag-moderate'
                  }`}
                >
                  {activeFocus.recommendation.split('—')[0].trim()}
                </span>
              </div>

              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                  {activeFocus.city}
                </h3>
                <p className="text-xs text-slate-500 font-medium">State: {activeFocus.state_code}</p>
                <p className="text-xs text-slate-700 italic mt-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  {activeFocus.recommendation}
                </p>
              </div>

              {/* Metric Breakdown Table */}
              <div className="space-y-2.5 text-xs border-t border-slate-100 pt-3">
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">Charging Demand Score (CDS)</span>
                  <span className="font-extrabold text-sm text-slate-900 font-mono">
                    {activeFocus.cds.toFixed(3)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">M1 Exp Monthly Additions</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {Math.round(activeFocus.m1_expected_monthly).toLocaleString()} EVs/mo
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">M2 High Demand Probability</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {(activeFocus.p_high * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">M3 12m Forward Growth</span>
                  <span
                    className={`font-bold font-mono ${
                      activeFocus.forecast_growth >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {(activeFocus.forecast_growth * 100).toFixed(1)}% ({activeFocus.winner})
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">Fleet Stock</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {Math.round(activeFocus.ev_stock).toLocaleString()} EVs
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-50">
                  <span className="text-slate-500">Stations (10km fixed)</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {activeFocus.stations_10km || 0} stns ({activeFocus.fast_10km || 0} fast)
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Split Method</span>
                  <span className={`badge-${activeFocus.split_method}`}>
                    {activeFocus.split_method}
                  </span>
                </div>
              </div>

              {/* Deep Dive Button */}
              <button
                onClick={() => {
                  onSelectCity(activeFocus.city);
                  onNavigateCityDetail(activeFocus.city);
                }}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-slate-900 hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition-all group"
              >
                <span>Launch {activeFocus.city} Deep Dive</span>
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center text-slate-500 text-xs">
              <Info className="w-6 h-6 mx-auto mb-2 text-slate-400" />
              Hover or click any city on the choropleth map to inspect its metrics.
            </div>
          )}

          {/* Siting Guidelines card */}
          <div className="bg-emerald-50/60 rounded-3xl p-5 border border-emerald-200 text-xs space-y-2 text-slate-700">
            <div className="flex items-center space-x-1.5 font-bold text-emerald-950">
              <Zap className="w-4 h-4 text-emerald-600" />
              <span>Siting Strategy for Major CPOs</span>
            </div>
            <p className="leading-relaxed">
              <b>Tata Power & Jio-bp:</b> Target heavy highway corridors and commercial 4W charging plazas in <b>Delhi</b>, <b>Bengaluru</b>, and <b>Pune</b>.
            </p>
            <p className="leading-relaxed">
              <b>Ola Electric & Ather:</b> Accelerate 2W urban hyperchargers in rapidly scaling hubs like <b>Guwahati</b>, <b>Surat</b>, and <b>Jaipur</b>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
