import React from 'react';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Info } from 'lucide-react';
import { CityAllocation } from '../../types';
import { confidenceBadges } from '../../lib/confidence';
import { Tag } from '../ui';

const CONTRIB_COLORS = {
  m1: 'bg-[var(--bar-3)]',
  m2: 'bg-[var(--bar-4)]',
  m3: 'bg-[var(--bar)]',
} as const;

const ContributionBar: React.FC<{
  label: string;
  hint: string;
  value: number;
  maxAbs: number;
  color: string;
}> = ({ label, hint, value, maxAbs, color }) => {
  const ratio = maxAbs > 0 ? Math.min(1, Math.abs(value) / maxAbs) : 0;
  const width = `${ratio * 50}%`;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-bold text-slate-700" title={hint}>
          {label}
        </span>
        <span className={`font-mono font-extrabold ${value >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
          {value >= 0 ? '+' : ''}
          {value.toFixed(2)}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300" />
        <div
          className={`absolute top-0 bottom-0 ${color} rounded-full`}
          style={value >= 0 ? { left: '50%', width } : { right: '50%', width }}
        />
      </div>
    </div>
  );
};

export const CityWhyPanel: React.FC<{
  city: CityAllocation;
  onOpenCity?: (city: string) => void;
}> = ({ city, onOpenCity }) => {
  const maxAbs = Math.max(
    Math.abs(city.contributions.m1),
    Math.abs(city.contributions.m2),
    Math.abs(city.contributions.m3),
    0.001
  );
  const badges = confidenceBadges(city.confidence);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-extrabold text-slate-900">
            Why {city.city} ranks #{city.rank}
          </h4>
          <p className="text-[11px] text-slate-500">{city.recommendation}</p>
        </div>
        {onOpenCity && (
          <button
            type="button"
            onClick={() => onOpenCity(city.city)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:text-brand-700 hover:border-brand-300"
          >
            Open city profile
            <ArrowUpRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Score contribution
            </span>
            <span className="text-[11px] font-bold text-slate-600">
              CDS <span className="font-mono text-slate-900">{city.cds.toFixed(3)}</span>
            </span>
          </div>
          <ContributionBar
            label="Current volume (M1)"
            hint="Weight × standardised expected monthly registrations."
            value={city.contributions.m1}
            maxAbs={maxAbs}
            color={CONTRIB_COLORS.m1}
          />
          <ContributionBar
            label="Market fundamentals (M2)"
            hint="Weight × probability this city is a high-demand market, from exogenous factors only."
            value={city.contributions.m2}
            maxAbs={maxAbs}
            color={CONTRIB_COLORS.m2}
          />
          <ContributionBar
            label="Forward growth (M3)"
            hint="Weight × standardised 12-month forecast growth."
            value={city.contributions.m3}
            maxAbs={maxAbs}
            color={CONTRIB_COLORS.m3}
          />
          <p className="text-[10.5px] text-slate-500 leading-relaxed pt-1">
            Bars are the three weighted terms of the CDS, drawn from a zero centre line. They sum to the score.
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            Evidence
          </span>
          <ul className="space-y-1.5">
            {city.reasons.map((reason) => (
              <li key={reason} className="flex gap-1.5 text-[11px] text-slate-600 leading-relaxed">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand-600 mt-0.5 shrink-0" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-1">
            {badges.map((badge) => (
              <span key={badge.label} title={badge.hint}>
                <Tag
                  tone={badge.tone === 'good' ? 'blue' : badge.tone === 'warn' ? 'amber' : 'slate'}
                  className="text-[10px]"
                >
                  {badge.label}
                </Tag>
              </span>
            ))}
          </div>

          {city.segmentShare !== null && city.segmentProxy && (
            <p className="text-[10.5px] text-amber-700 leading-relaxed">
              Segment fit uses a {city.confidence.split} proxy for this city, not a measured Vahan split.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {[
          { label: 'Allocated', value: `${city.units.toLocaleString()} units` },
          { label: 'DC / AC', value: `${city.fastUnits.toLocaleString()} / ${city.acUnits.toLocaleString()}` },
          { label: 'Demand / station', value: city.demand.toFixed(1) },
          { label: 'Capex', value: `₹${city.capexCr.toFixed(1)} Cr` },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-white border border-slate-200 px-2.5 py-2">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</div>
            <div className="text-xs font-extrabold text-slate-900 font-mono mt-0.5">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
