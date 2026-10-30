import React, { useMemo, useState } from 'react';
import { MapPin, RotateCcw, Search } from 'lucide-react';
import {
  AllocationStrategy,
  CityClass,
  CityFeatures,
  CorridorPreference,
  ScenarioInput,
  SegmentFocus,
  SupplyScope,
} from '../../types';
import { Callout, Field, FormSection, Segmented } from './controls';

interface Props {
  value: ScenarioInput;
  onChange: (patch: Partial<ScenarioInput>) => void;
  features: CityFeatures[];
}

const CITY_CLASS_OPTIONS: { value: CityClass; label: string; hint: string }[] = [
  { value: 'all', label: 'All cities', hint: 'Every analysed city, metro and tier-2.' },
  { value: 'metro', label: 'Metros', hint: 'The fourteen largest urban agglomerations.' },
  { value: 'tier2', label: 'Tier-2', hint: 'Growing secondary cities with thinner charger supply.' },
];

const CORRIDOR_OPTIONS: { value: CorridorPreference; label: string; hint: string }[] = [
  { value: 'any', label: 'Any location', hint: 'Do not restrict by highway proximity.' },
  { value: 'highway', label: 'Highway only', hint: 'Cities flagged on a national highway corridor.' },
  { value: 'urban', label: 'Urban only', hint: 'Exclude highway-corridor cities.' },
];

const SEGMENT_OPTIONS: { value: SegmentFocus; label: string; hint: string }[] = [
  { value: 'mixed', label: 'Mixed fleet', hint: 'Standard demand weighting across all vehicle classes.' },
  { value: '2W', label: '2W', hint: 'Two-wheelers mostly charge at home — nudges the mix toward AC.' },
  { value: '3W', label: '3W', hint: 'Auto and cargo three-wheelers need midday public top-ups.' },
  { value: '4W', label: '4W', hint: 'Cars and fleets need DC fast charging — nudges the mix toward DC.' },
];

const SCOPE_OPTIONS: { value: SupplyScope; label: string; hint: string }[] = [
  { value: '5km', label: '5 km', hint: 'Tightest comparison radius; best for dense urban siting.' },
  { value: '10km', label: '10 km', hint: 'The published comparison radius.' },
  { value: 'circle', label: 'City circle', hint: 'Each city’s own 15–30 km catchment.' },
];

const STRATEGY_OPTIONS: { value: AllocationStrategy; label: string; hint: string }[] = [
  { value: 'balanced', label: 'Balanced CDS', hint: 'Spread chargers in proportion to the composite score.' },
  { value: 'deficit', label: 'Close the gap', hint: 'Prioritise cities with the most demand per station.' },
  { value: 'growth', label: 'Follow growth', hint: 'Prioritise the fastest-growing markets.' },
  { value: 'volume', label: 'Follow fleet', hint: 'Prioritise the largest existing EV fleets.' },
];

export const StepMarket: React.FC<Props> = ({ value, onChange, features }) => {
  const [stateQuery, setStateQuery] = useState('');

  const states = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of features) counts.set(f.state_code, (counts.get(f.state_code) || 0) + 1);
    return Array.from(counts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [features]);

  const visibleStates = useMemo(() => {
    const q = stateQuery.trim().toUpperCase();
    return q ? states.filter((s) => s.code.includes(q)) : states;
  }, [states, stateQuery]);

  const toggleState = (code: string) => {
    const next = value.states.includes(code)
      ? value.states.filter((s) => s !== code)
      : [...value.states, code];
    onChange({ states: next });
  };

  const m1m3 = value.weightM1 + value.weightM3;
  const priority = m1m3 > 0 ? (value.weightM3 / m1m3) * 100 : 50;

  const setPriority = (p: number) => {
    const remaining = 0.7;
    onChange({
      weightM2: 0.3,
      weightM1: Number(((remaining * (100 - p)) / 100).toFixed(2)),
      weightM3: Number(((remaining * p) / 100).toFixed(2)),
    });
  };

  const resetWeights = () => onChange({ weightM1: 0.4, weightM2: 0.3, weightM3: 0.3 });

  return (
    <div className="space-y-7">
      <FormSection
        title="Which markets are in scope?"
        hint="Filters only remove cities — they never rescale the score, so priorities stay comparable."
      >
        <Field
          label="City class"
          hint={CITY_CLASS_OPTIONS.find((o) => o.value === value.cityClass)?.hint}
        >
          <Segmented
            ariaLabel="City class"
            options={CITY_CLASS_OPTIONS}
            value={value.cityClass}
            onChange={(cityClass) => onChange({ cityClass })}
          />
        </Field>

        <Field
          label="Region"
          value={
            value.states.length === 0
              ? 'All states'
              : `${value.states.length} state${value.states.length === 1 ? '' : 's'}`
          }
          hint="Leave every state unselected to search nationally."
        >
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={stateQuery}
                onChange={(e) => setStateQuery(e.target.value)}
                placeholder="Find a state code…"
                className="w-full bg-transparent text-xs font-medium text-slate-800 focus:outline-none"
              />
              {value.states.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange({ states: [] })}
                  className="text-[11px] font-bold text-brand-700 hover:text-brand-800 shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="max-h-36 overflow-y-auto p-2 flex flex-wrap gap-1.5">
              {visibleStates.map((state) => {
                const active = value.states.includes(state.code);
                return (
                  <button
                    key={state.code}
                    type="button"
                    onClick={() => toggleState(state.code)}
                    aria-pressed={active}
                    className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {state.code}
                    <span className={`ml-1 font-mono ${active ? 'text-brand-100' : 'text-slate-400'}`}>
                      {state.count}
                    </span>
                  </button>
                );
              })}
              {visibleStates.length === 0 && (
                <span className="text-[11px] text-slate-400 px-1 py-2">No state matches “{stateQuery}”.</span>
              )}
            </div>
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field
            label="Highway preference"
            hint={CORRIDOR_OPTIONS.find((o) => o.value === value.corridor)?.hint}
          >
            <Segmented
              ariaLabel="Highway preference"
              options={CORRIDOR_OPTIONS}
              value={value.corridor}
              onChange={(corridor) => onChange({ corridor })}
            />
          </Field>

          <Field
            label="Supply comparison radius"
            hint={SCOPE_OPTIONS.find((o) => o.value === value.supplyScope)?.hint}
          >
            <Segmented
              ariaLabel="Supply comparison radius"
              options={SCOPE_OPTIONS}
              value={value.supplyScope}
              onChange={(supplyScope) => onChange({ supplyScope })}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="What are you charging?"
        hint="Segment focus adjusts the hardware mix and surfaces segment fit. It does not change the published CDS formula."
      >
        <Field
          label="Vehicle segment focus"
          hint={SEGMENT_OPTIONS.find((o) => o.value === value.segment)?.hint}
        >
          <Segmented
            ariaLabel="Vehicle segment focus"
            options={SEGMENT_OPTIONS}
            value={value.segment}
            onChange={(segment) => onChange({ segment })}
            columns={4}
          />
        </Field>

        {value.segment === '2W' && (
          <Callout tone="warn" title="2W demand is mostly private">
            Two-wheelers charge at home, so a 2W-heavy plan usually means fewer public DC plazas and more AC points.
            The mix slider has been nudged down by 10 points.
          </Callout>
        )}
        {value.segment === '4W' && (
          <Callout tone="info" title="4W plans need DC">
            Cars and commercial fleets depend on public fast charging. The mix slider has been nudged up by 15 points.
          </Callout>
        )}
      </FormSection>

      <FormSection
        title="How should the three models be weighted?"
        hint="Default is the published 40 / 30 / 30. Moving the slider changes only the balance between current volume (M1) and forward growth (M3); market fundamentals (M2) stay pinned at 30%."
      >
        <Field
          label="Volume ↔ Growth"
          value={`${Math.round(value.weightM1 * 100)}% volume · ${Math.round(
            value.weightM2 * 100
          )}% fundamentals · ${Math.round(value.weightM3 * 100)}% growth`}
        >
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(priority)}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-full accent-brand-600 cursor-pointer"
            aria-label="Weight between current volume and forward growth"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Customers today (M1)</span>
            <span>Momentum tomorrow (M3)</span>
          </div>
          <button
            type="button"
            onClick={resetWeights}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-slate-900"
          >
            <RotateCcw className="w-3 h-3" />
            Reset to published 40 / 30 / 30
          </button>
        </Field>

        <Field
          label="Allocation strategy"
          hint={STRATEGY_OPTIONS.find((o) => o.value === value.strategy)?.hint}
        >
          <Segmented
            ariaLabel="Allocation strategy"
            options={STRATEGY_OPTIONS}
            value={value.strategy}
            onChange={(strategy) => onChange({ strategy })}
            columns={2}
          />
        </Field>
      </FormSection>

      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[11px] text-slate-600 flex items-start gap-2">
        <MapPin className="w-3.5 h-3.5 text-brand-600 mt-0.5 shrink-0" />
        <span>
          Demand is weighted by vehicle class (0.15·2W + 0.70·3W + 1.00·4W + 0.60·commercial) because a
          two-wheeler relies on public charging far less than a car or an auto.
        </span>
      </div>
    </div>
  );
};
