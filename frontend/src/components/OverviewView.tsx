import React from 'react';
import {
  ArrowRight,
  BarChart3,
  Calculator,
  CheckCircle2,
  MapPin,
  ShieldAlert,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CityRanking, StatsResponse, TabType } from '../types';
import { SectionTitle, StatGroup } from './ui';
import { HeroScene } from './HeroScene';

interface OverviewViewProps {
  hotspots: CityRanking[];
  stats: StatsResponse | null;
  onNavigateTab: (tab: TabType) => void;
  onSelectCity: (city: string) => void;
  onOpenPlanner: () => void;
}

const tierDot = (cds: number) =>
  cds >= 1.5
    ? 'bg-[#a63d33]'
    : cds >= 0.75
    ? 'bg-[#c07a2c]'
    : cds >= 0
    ? 'bg-[#5f7d8c]'
    : 'bg-[#8a8178]';

export const OverviewView: React.FC<OverviewViewProps> = ({
  hotspots,
  stats,
  onNavigateTab,
  onSelectCity,
  onOpenPlanner,
}) => {
  const topFive = hotspots.slice(0, 5);
  const topCity = topFive[0];

  const fastestGrowth = React.useMemo(
    () => [...hotspots].sort((a, b) => b.forecast_growth - a.forecast_growth)[0],
    [hotspots]
  );
  const sharpestGap = React.useMemo(
    () => [...hotspots].sort((a, b) => b.effective_public_demand - a.effective_public_demand)[0],
    [hotspots]
  );

  const nationalSeries = React.useMemo(() => {
    if (!stats?.national_monthly) return [];
    return Object.entries(stats.national_monthly).map(([date, count]) => ({ date, count }));
  }, [stats]);

  const totalStock = React.useMemo(
    () => hotspots.reduce((acc, h) => acc + (h.ev_stock || 0), 0),
    [hotspots]
  );

  const objectives: {
    id: string;
    title: string;
    body: string;
    tab?: TabType;
    note?: string;
  }[] = [
    {
      id: 'Obj 1',
      title: 'Quantify public demand',
      body: 'Weight demand by how much each vehicle class relies on public charging (0.15·2W, 0.70·3W, 1.00·4W, 0.60·commercial).',
      tab: 'demand',
    },
    {
      id: 'Obj 2',
      title: 'Find adoption drivers',
      body: 'Negative-binomial count model over income, density, policy and market size.',
      note: 'Coefficients in final_report.md',
    },
    {
      id: 'Obj 3',
      title: 'Classify high demand',
      body: 'Logistic regression and LDA using background factors only, with zero label leakage.',
      note: 'Model comparison in final_report.md',
    },
    {
      id: 'Obj 4',
      title: 'Forecast 12 months',
      body: 'SARIMA versus Holt-Winters on a holdout window, per city.',
      tab: 'forecast',
    },
    {
      id: 'Obj 5',
      title: 'Rank the hotspots',
      body: 'Combine the three models into one Charging Demand Score and rank all 51 cities.',
      tab: 'hotspots',
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Editorial hero — text left, live 3D field right, no card around it */}
      <section className="relative animate-fade-up border-b border-slate-200/70 pb-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-5">
            <div className="eyebrow flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              EV charging siting
            </div>

            <h1 className="mt-3 font-display text-[2.15rem] font-extrabold leading-[1.06] tracking-[-0.03em] text-slate-900 sm:text-[2.9rem]">
              Where should India's next public chargers go?
            </h1>

            <p className="mt-4 max-w-xl text-[13.5px] leading-relaxed text-slate-600">
              Charging demand is not directly observed, and a raw EV-per-charger ratio misleads:
              two-wheelers mostly charge at home while autos and cars depend on public infrastructure.
              EVision models demand across {hotspots.length} cities and ranks where new capacity is
              genuinely needed.
            </p>

            <p className="mt-5 border-l-2 border-brand-500 pl-3 font-display text-[15px] italic leading-snug text-slate-800">
              “Which cities can support new chargers today — and which are worth building for?”
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
              <button
                onClick={onOpenPlanner}
                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 sm:text-[13px]"
              >
                <Calculator className="h-4 w-4" />
                Build my deployment plan
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => onNavigateTab('hotspots')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 underline-offset-4 transition-colors hover:text-slate-900 hover:underline sm:text-[13px]"
              >
                <BarChart3 className="h-4 w-4" />
                See the ranking
              </button>
              <button
                onClick={() => onNavigateTab('map')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 underline-offset-4 transition-colors hover:text-slate-900 hover:underline sm:text-[13px]"
              >
                <MapPin className="h-4 w-4" />
                Open the map
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-center lg:col-span-7">
            <HeroScene className="ml-auto max-w-[640px]" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2 text-[10.5px] text-slate-400">
              <span className="font-mono uppercase tracking-[0.14em]">Public charging · {hotspots.length} cities</span>
              <span>Demand-ranked siting across India</span>
            </div>
          </div>
        </div>
      </section>

      {/* Headline numbers — one panel, four cells */}
      <StatGroup
        columns={4}
        className="animate-fade-in"
        items={[
          {
            label: 'Analysed fleet',
            value: totalStock.toLocaleString(),
            sub: `Across ${hotspots.length} urban centres`,
            icon: CheckCircle2,
            onClick: () => onNavigateTab('hotspots'),
            hint: 'Open the full city ranking',
          },
          {
            label: '#1 ranked hub',
            value: topCity?.city ?? '—',
            sub: topCity ? `CDS ${topCity.cds.toFixed(2)} · ${topCity.recommendation.split('—')[0].trim()}` : 'No data',
            tone: 'text-slate-900',
            icon: MapPin,
            onClick: topCity ? () => onSelectCity(topCity.city) : undefined,
            hint: 'Open this city profile',
          },
          {
            label: 'Fastest 12-month growth',
            value: fastestGrowth?.city ?? '—',
            sub: fastestGrowth
              ? `${fastestGrowth.forecast_growth >= 0 ? '+' : ''}${(fastestGrowth.forecast_growth * 100).toFixed(0)}% · ${fastestGrowth.winner}`
              : 'No forecast',
            tone: 'text-slate-900',
            icon: TrendingUp,
            onClick: () => onNavigateTab('forecast'),
            hint: 'See the forecast tournament',
          },
          {
            label: 'Sharpest charger gap',
            value: sharpestGap?.city ?? '—',
            sub: sharpestGap
              ? `${Math.round(sharpestGap.effective_public_demand).toLocaleString()} demand / station`
              : 'No data',
            tone: 'text-slate-900',
            icon: ShieldAlert,
            onClick: () => onNavigateTab('demand'),
            hint: 'See the demand and gap analysis',
          },
        ]}
      />

      {/* The five objectives — a single panel with a hairline grid */}
      <section className="surface overflow-hidden animate-fade-in">
        <div className="px-5 pb-3 pt-5 sm:px-6">
          <SectionTitle
            title="How the answer is built"
            description="Five steps from raw registration data to a ranked siting recommendation."
          />
        </div>
        <div className="grid gap-px bg-slate-200/70 sm:grid-cols-2 lg:grid-cols-5">
          {objectives.map((objective, index) => {
            const clickable = Boolean(objective.tab);
            const content = (
              <>
                <div className="flex items-center justify-between">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-[10px] font-extrabold text-brand-700 ring-1 ring-brand-100">
                    {index + 1}
                  </span>
                  <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-300">
                    {objective.id}
                  </span>
                </div>
                <h3 className="mt-2 text-xs font-extrabold leading-snug text-slate-900">{objective.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{objective.body}</p>
                <div className="mt-2 flex items-center gap-1 text-[10.5px] font-bold">
                  {clickable ? (
                    <span className="text-brand-700">
                      Open <ArrowRight className="inline h-3 w-3" />
                    </span>
                  ) : (
                    <span className="text-slate-400">{objective.note}</span>
                  )}
                </div>
              </>
            );

            return clickable ? (
              <button
                key={objective.id}
                type="button"
                onClick={() => onNavigateTab(objective.tab as TabType)}
                className="group bg-white p-4 text-left transition-colors hover:bg-brand-50/40 focus:outline-none focus-visible:bg-brand-50/60"
              >
                {content}
              </button>
            ) : (
              <div key={objective.id} className="bg-white p-4">
                {content}
              </div>
            );
          })}
        </div>
      </section>

      {/* Top priorities — a ranked list, not five cards */}
      <section className="surface overflow-hidden animate-fade-in">
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-3 pt-5 sm:px-6">
          <SectionTitle
            title="Current top five priorities"
            description="Highest Charging Demand Score today. Select a row to open the city profile."
          />
          <button
            onClick={() => onNavigateTab('hotspots')}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700 hover:text-brand-800"
          >
            All {hotspots.length} cities <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {topFive.map((city) => (
            <button
              key={city.city}
              type="button"
              onClick={() => onSelectCity(city.city)}
              className="grid w-full grid-cols-12 items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 sm:px-6"
            >
              <span className="col-span-2 font-mono text-xs font-extrabold text-slate-300 sm:col-span-1">
                #{city.rank}
              </span>
              <span className="col-span-7 flex items-center gap-2 sm:col-span-4">
                <span className={`h-2 w-2 shrink-0 rounded-full ${tierDot(city.cds)}`} />
                <span className="text-sm font-bold text-slate-900">{city.city}</span>
                <span className="text-[10px] font-semibold text-slate-400">{city.state_code}</span>
              </span>
              <span className="col-span-3 text-right sm:col-span-2">
                <span className="block font-mono text-sm font-extrabold text-slate-900">
                  {city.cds.toFixed(2)}
                </span>
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">CDS</span>
              </span>
              <span className="col-span-3 hidden text-right sm:block sm:col-span-2">
                <span
                  className={`block font-mono text-xs font-bold ${
                    city.forecast_growth >= 0 ? 'text-slate-900' : 'text-rose-600'
                  }`}
                >
                  {(city.forecast_growth * 100).toFixed(0)}%
                </span>
                <span className="text-[9.5px] uppercase tracking-wider text-slate-400">12m growth</span>
              </span>
              <span className="col-span-2 hidden text-right sm:block">
                <span className="block font-mono text-xs font-semibold text-slate-700">
                  {Math.round(city.ev_stock).toLocaleString()}
                </span>
                <span className="text-[9.5px] uppercase tracking-wider text-slate-400">fleet</span>
              </span>
              <span className="col-span-1 hidden justify-self-end text-slate-300 sm:flex">
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* National trend */}
      <section className="surface animate-fade-in px-5 py-5 sm:px-6">
        <SectionTitle
          title="National monthly EV registrations"
          description={`${hotspots.length} cities${
            stats?.city_months ? ` · ${stats.city_months.toLocaleString()} observed city-months` : ''
          } · 2021 to 2026`}
        />
        <div className="mt-3 h-56 w-full">
          {nationalSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={nationalSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="nationalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--bar)" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="var(--bar)" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const point = payload[0].payload;
                    return (
                      <div className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg">
                        <p className="font-medium text-slate-400">{point.date}</p>
                        <p className="text-sm font-bold text-white">
                          {Number(point.count).toLocaleString()} EVs registered
                        </p>
                      </div>
                    );
                  }}
                />
                <Area isAnimationActive={false}
                  type="monotone"
                  dataKey="count"
                  stroke="var(--bar)"
                  strokeWidth={2.4}
                  fillOpacity={1}
                  fill="url(#nationalGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">
              Loading national trend…
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
