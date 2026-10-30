import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Info,
  Pencil,
  Printer,
  SlidersHorizontal,
  TrendingUp,
  Wallet,
  Zap,
  Building2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { ScenarioResult } from '../../types';
import { allocationCsv, downloadFile, encodeScenario, scenarioSummary } from '../../lib/export';
import { AssumptionDrawer } from './AssumptionDrawer';
import { CityWhyPanel } from './CityWhyPanel';
import { StatGroup, Tag, splitTone } from '../ui';

interface Props {
  result: ScenarioResult;
  onEdit: () => void;
  onOpenCity: (city: string) => void;
}

const tierColor = (cds: number) =>
  cds >= 1.5 ? '#a63d33' : cds >= 0.75 ? '#c07a2c' : cds >= 0 ? '#5f7d8c' : 'var(--chart-axis)';

const tierLabel = (cds: number) =>
  cds >= 1.5 ? 'Critical' : cds >= 0.75 ? 'High' : cds >= 0 ? 'Moderate' : 'Low';

export const ResultsView: React.FC<Props> = ({ result, onEdit, onOpenCity }) => {
  const [expanded, setExpanded] = useState<string | null>(result.cities[0]?.city ?? null);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  const { cities, totals, input, weights, dcPct } = result;

  const allocationChart = useMemo(
    () =>
      cities.slice(0, 12).map((c) => ({
        city: c.city,
        'DC fast': c.fastUnits,
        'AC destination': c.acUnits,
        total: c.units,
      })),
    [cities]
  );

  const scatter = useMemo(
    () =>
      cities.map((c) => ({
        city: c.city,
        demand: Math.max(0, Math.min(c.demand, 600)),
        growth: Number((c.growth * 100).toFixed(1)),
        units: Math.max(c.units, 1),
        cds: c.cds,
      })),
    [cities]
  );

  const exclusionSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of result.excluded) {
      const reason = row.reason.replace(/\d[\d,]*/g, 'N');
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [result.excluded]);

  const maxUnits = Math.max(...cities.map((c) => c.units), 1);
  const eligible = totals.considered - totals.excluded;
  const belowCut = Math.max(0, eligible - totals.markets);
  const summary = scenarioSummary(result);

  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('scenario', encodeScenario(input));
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this scenario link', url.toString());
    }
  };

  if (cities.length === 0) {
    return (
      <div className="space-y-6 pb-12">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="space-y-2">
              <h2 className="text-lg font-extrabold text-amber-950">No city matches every requirement</h2>
              <p className="text-xs text-amber-900 leading-relaxed max-w-2xl">
                That is an honest answer, not an error — the filters are strict. The most likely culprit is listed
                below. Relax one requirement and run again.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={onEdit}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-900 px-3 py-2 text-xs font-bold text-white hover:bg-amber-800"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit requirements
                </button>
                <span className="inline-flex items-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900">
                  {result.excluded.length} of {totals.considered} cities excluded
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="surface p-5">
          <h3 className="text-sm font-extrabold text-slate-900 mb-2">Why cities were excluded</h3>
          <ul className="space-y-1.5">
            {exclusionSummary.slice(0, 6).map(([reason, count]) => (
              <li key={reason} className="flex justify-between gap-3 text-[11px] text-slate-600 border-b border-slate-100 pb-1.5">
                <span>{reason}</span>
                <span className="font-bold font-mono text-slate-900">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Report header */}
      <div className="page-head p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
          <div className="max-w-3xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold text-white">
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-400" />
              Deployment brief
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              {input.company.trim() ? input.company : 'Your rollout'}, prioritised
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{summary}</p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                `${totals.markets} of ${eligible} eligible cities`,
                `${dcPct}% DC / ${100 - dcPct}% AC`,
                `${Math.round(weights.m1 * 100)}/${Math.round(weights.m2 * 100)}/${Math.round(weights.m3 * 100)} weighting`,
                `${input.horizon}-month horizon`,
              ].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10.5px] font-bold text-slate-600"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 print:hidden">
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit requirements
            </button>
            <button
              onClick={() => downloadFile('evision-allocation.csv', allocationCsv(result))}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'Copied' : 'Share link'}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              <Printer className="w-3.5 h-3.5" />
              Print brief
            </button>
          </div>
        </div>

        {totals.budgetLimited && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] text-amber-900 flex items-start gap-2">
            <Wallet className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
            <span>
              Your {totals.requestedUnits.toLocaleString()}-charger target costs more than ₹
              {totals.budgetCr.toLocaleString()} Cr, so deployment was scaled to{' '}
              <b>{totals.affordableUnits.toLocaleString()}</b> units — the most the budget supports at this hardware
              mix.
            </span>
          </div>
        )}
      </div>

      {/* KPI strip — one panel, hairline dividers */}
      <StatGroup
        columns={5}
        items={[
          {
            label: 'Markets in plan',
            value: totals.markets.toLocaleString(),
            sub: `${totals.excluded} excluded · ${belowCut} ranked lower than top ${input.topN}`,
            icon: Building2,
            tone: 'text-slate-900',
          },
          {
            label: 'Chargers deployed',
            value: totals.units.toLocaleString(),
            sub: `${totals.fastUnits.toLocaleString()} DC · ${totals.acUnits.toLocaleString()} AC`,
            icon: Zap,
            tone: 'text-slate-900',
          },
          {
            label: 'Approx. capex',
            value: `₹${totals.capexCr.toLocaleString()} Cr`,
            sub: `of ₹${totals.budgetCr.toLocaleString()} Cr budget`,
            icon: Wallet,
            tone: 'text-slate-900',
          },
          {
            label: 'EVs addressable',
            value: totals.evServed.toLocaleString(),
            sub: 'at 24 EVs per plug (assumption)',
            icon: TrendingUp,
            tone: 'text-slate-900',
          },
          {
            label: 'Strong-evidence share',
            value: `${Math.round(totals.coveragePct)}%`,
            sub: 'measured split + stable forecast',
            icon: CheckCircle2,
            tone: 'text-slate-900',
          },
        ]}
      />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface p-5 print:break-inside-avoid">
          <h3 className="text-sm font-extrabold text-slate-900">Charger allocation</h3>
          <p className="text-[11px] text-slate-500">
            Top {Math.min(12, cities.length)} markets, split into DC fast and AC destination units.
          </p>
          <div className="h-64 w-full mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allocationChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="city" tick={{ fontSize: 10, fill: 'var(--chart-axis-strong)' }} interval={0} angle={-25} textAnchor="end" height={54} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--chart-axis)' }} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg space-y-0.5">
                        <p className="font-bold text-white">{d.city}</p>
                        <p>Total: {d.total.toLocaleString()} units</p>
                        <p className="text-slate-300">DC fast: {d['DC fast'].toLocaleString()}</p>
                        <p className="text-slate-300">AC destination: {d['AC destination'].toLocaleString()}</p>
                      </div>
                    );
                  }}
                />
                <Bar isAnimationActive={false} dataKey="DC fast" stackId="a" fill="var(--bar)" />
                <Bar isAnimationActive={false} dataKey="AC destination" stackId="a" fill="var(--bar-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface p-5 print:break-inside-avoid">
          <h3 className="text-sm font-extrabold text-slate-900">Priority matrix</h3>
          <p className="text-[11px] text-slate-500">
            Supply gap (x) against 12-month growth (y). Bubble size is the units allocated; colour is the CDS tier.
          </p>
          <div className="h-64 w-full mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis
                  type="number"
                  dataKey="demand"
                  name="Demand per station"
                  tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                  label={{ value: 'Demand per station', position: 'insideBottom', offset: -4, fontSize: 10, fill: 'var(--chart-axis)' }}
                />
                <YAxis
                  type="number"
                  dataKey="growth"
                  name="12m growth %"
                  tick={{ fontSize: 10, fill: 'var(--chart-axis)' }}
                  tickFormatter={(v) => `${v}%`}
                />
                <ZAxis type="number" dataKey="units" range={[60, 420]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] text-white shadow-lg space-y-0.5">
                        <p className="font-bold text-white">{d.city}</p>
                        <p>Units: {d.units.toLocaleString()}</p>
                        <p>Demand / station: {d.demand.toFixed(1)}</p>
                        <p>Growth: {d.growth}%</p>
                        <p>CDS: {d.cds.toFixed(2)}</p>
                      </div>
                    );
                  }}
                />
                <Scatter isAnimationActive={false} data={scatter}>
                  {scatter.map((entry) => (
                    <Cell key={entry.city} fill={tierColor(entry.cds)} fillOpacity={0.75} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Ranked table */}
      <div className="surface overflow-hidden print:break-inside-avoid">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">City-by-city allocation</h3>
            <p className="text-[11px] text-slate-500">
              Ranked by CDS; units follow your allocation strategy. Expand any row for the evidence behind its rank.
              Units always sum to {totals.units.toLocaleString()}.
            </p>
          </div>
          <button
            onClick={() => setShowAssumptions(true)}
            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 print:hidden"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Assumptions
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3 w-8">#</th>
                <th className="py-2.5 px-3">City</th>
                <th className="py-2.5 px-3 text-right">CDS</th>
                <th className="py-2.5 px-3 text-right">Units</th>
                <th className="py-2.5 px-3 text-right hidden sm:table-cell">DC / AC</th>
                <th className="py-2.5 px-3 text-right hidden md:table-cell">Demand/stn</th>
                <th className="py-2.5 px-3 text-right hidden md:table-cell">12m growth</th>
                <th className="py-2.5 px-3 hidden lg:table-cell">Evidence</th>
                <th className="py-2.5 px-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cities.map((city) => {
                const open = expanded === city.city;
                return (
                  <React.Fragment key={city.city}>
                    <tr
                      onClick={() => setExpanded(open ? null : city.city)}
                      className={`cursor-pointer transition-colors ${open ? 'bg-slate-50' : 'hover:bg-slate-50/70'}`}
                      aria-expanded={open}
                    >
                      <td className="py-2.5 px-3 font-extrabold text-slate-400">{city.rank}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{city.city}</div>
                        <div className="text-[10px] text-slate-400">
                          {city.state_code} · {city.tier}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="font-mono font-extrabold text-slate-900">{city.cds.toFixed(2)}</span>
                        <div className="text-[9.5px] font-bold" style={{ color: tierColor(city.cds) }}>
                          {tierLabel(city.cds)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="font-mono font-extrabold text-slate-900">
                          {city.units.toLocaleString()}
                        </div>
                        <div className="h-1 w-16 ml-auto mt-1 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--bar)]"
                            style={{ width: `${Math.max(2, (city.units / maxUnits) * 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-600 hidden sm:table-cell">
                        {city.fastUnits.toLocaleString()} / {city.acUnits.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 hidden md:table-cell">
                        {city.demand.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold hidden md:table-cell">
                        <span className={city.growth >= 0 ? 'text-slate-900' : 'text-rose-600'}>
                          {(city.growth * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                          <Tag tone={splitTone(city.confidence.split)} className="text-[10px]">
                            {city.confidence.split}
                          </Tag>
                          <Tag
                            tone={
                              city.confidence.forecast === 'ok'
                                ? 'blue'
                                : city.confidence.forecast === 'weak'
                                ? 'amber'
                                : 'rose'
                            }
                            className="text-[10px]"
                          >
                            {city.confidence.forecast}
                          </Tag>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-slate-400">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={9} className="px-3 pb-3">
                          <CityWhyPanel city={city} onOpenCity={onOpenCity} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Excluded cities */}
      {result.excluded.length > 0 && (
        <div className="surface p-5 print:break-inside-avoid">
          <button
            onClick={() => setShowExcluded((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={showExcluded}
          >
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                {result.excluded.length} cities excluded by your requirements
              </h3>
              <p className="text-[11px] text-slate-500">
                Nothing is hidden — every exclusion is recorded with its reason.
              </p>
            </div>
            <span className="text-slate-400 print:hidden">
              {showExcluded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          </button>

          {showExcluded && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {result.excluded.map((row) => (
                <div
                  key={row.city}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10.5px] leading-snug"
                >
                  <span className="font-bold text-slate-800">{row.city}</span>
                  <span className="text-slate-500"> — {row.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[10.5px] text-slate-500 leading-relaxed print:break-inside-avoid">
        <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
        <span>
          CDS is statistical model output. Capex, hardware split and “EVs addressable” are planning assumptions, not
          predictions. Segment fit for proxy cities is approximate. Sources: MoRTH Vahan, Census 2011, Open-Meteo
          ERA5, BEE PCS snapshot.
        </span>
      </div>

      <AssumptionDrawer open={showAssumptions} onClose={() => setShowAssumptions(false)} />
    </div>
  );
};
