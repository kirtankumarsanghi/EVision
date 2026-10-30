import React from 'react';
import { Building2, Route, Truck, TrendingUp, Scale } from 'lucide-react';
import { ScenarioInput } from '../../types';

interface Preset {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  apply: Partial<ScenarioInput>;
}

const PRESETS: Preset[] = [
  {
    id: 'balanced',
    name: 'Balanced national rollout',
    description: 'The published ranking: 25k chargers across the ten strongest cities, volume and growth equally trusted.',
    icon: Scale,
    apply: {},
  },
  {
    id: 'metro',
    name: 'Metro fleet blitz',
    description: 'Chase the biggest existing fleets in metros — highest utilisation today, least forecast risk.',
    icon: Building2,
    apply: {
      budgetCr: 5000,
      targetUnits: 40000,
      dcPct: 45,
      cityClass: 'metro',
      corridor: 'any',
      segment: '4W',
      strategy: 'volume',
      weightM1: 0.5,
      weightM2: 0.25,
      weightM3: 0.25,
      topN: 8,
      horizon: 12,
    },
  },
  {
    id: 'corridor',
    name: 'Highway corridor',
    description: 'Only cities on a national highway corridor, weighted toward DC fast plazas for inter-city travel.',
    icon: Route,
    apply: {
      budgetCr: 3000,
      targetUnits: 20000,
      dcPct: 60,
      cityClass: 'all',
      corridor: 'highway',
      segment: '4W',
      strategy: 'balanced',
      topN: 10,
      horizon: 12,
    },
  },
  {
    id: 'commercial3w',
    name: '3W commercial fleet',
    description: 'Target auto and cargo three-wheelers in cities with the widest supply gap.',
    icon: Truck,
    apply: {
      budgetCr: 1800,
      targetUnits: 18000,
      dcPct: 40,
      cityClass: 'all',
      corridor: 'any',
      segment: '3W',
      strategy: 'deficit',
      weightM1: 0.35,
      weightM2: 0.35,
      weightM3: 0.3,
      topN: 12,
      horizon: 12,
    },
  },
  {
    id: 'growth',
    name: 'Growth bet',
    description: 'Back fast-expanding markets twelve to twenty-four months out, accepting more forecast risk.',
    icon: TrendingUp,
    apply: {
      budgetCr: 2200,
      targetUnits: 22000,
      dcPct: 35,
      cityClass: 'all',
      corridor: 'any',
      segment: 'mixed',
      strategy: 'growth',
      weightM1: 0.3,
      weightM2: 0.25,
      weightM3: 0.45,
      stableForecastOnly: true,
      topN: 10,
      horizon: 24,
    },
  },
];

export const ScenarioPresets: React.FC<{
  onApply: (patch: Partial<ScenarioInput>) => void;
}> = ({ onApply }) => (
  <div className="space-y-2">
    <div className="flex items-baseline justify-between">
      <h3 className="text-sm font-extrabold text-slate-900">Start from a proven playbook</h3>
      <span className="text-[11px] text-slate-500">You can change anything afterwards</span>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
      {PRESETS.map((preset) => {
        const Icon = preset.icon;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApply(preset.apply)}
            className="text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-brand-400 hover:shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 group"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-6 h-6 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="text-[11px] font-extrabold text-slate-900 group-hover:text-brand-700">
                {preset.name}
              </span>
            </div>
            <p className="text-[10.5px] text-slate-500 leading-relaxed">{preset.description}</p>
          </button>
        );
      })}
    </div>
  </div>
);
