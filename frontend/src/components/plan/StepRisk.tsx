import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { DeploymentHorizon, ScenarioInput } from '../../types';
import { Callout, Field, FormSection, NumberInput, Segmented, Toggle } from './controls';

interface Props {
  value: ScenarioInput;
  onChange: (patch: Partial<ScenarioInput>) => void;
}

const HORIZONS: { value: string; label: string; hint: string }[] = [
  { value: '6', label: '6 months', hint: 'Halve the 12-month growth rate by compounding.' },
  { value: '12', label: '12 months', hint: 'The fitted M3 horizon.' },
  { value: '24', label: '24 months', hint: 'Extrapolation beyond the fitted horizon — treat with caution.' },
];

export const StepRisk: React.FC<Props> = ({ value, onChange }) => (
  <div className="space-y-7">
    <FormSection
      title="How much evidence do you require?"
      hint="These are honesty filters. Tightening them removes cities whose numbers rest on proxies or weak fits."
    >
      <div className="space-y-2">
        <Toggle
          label="Measured vehicle split only"
          hint="Keeps the 42 cities whose 2W/3W/4W mix is measured from Vahan rather than borrowed from a state or national average."
          checked={value.measuredSplitOnly}
          onChange={(measuredSplitOnly) => onChange({ measuredSplitOnly })}
        />
        <Toggle
          label="Stable forecasts only"
          hint="Keeps cities where SARIMA or Holt-Winters passed the holdout quality gate. All 51 currently pass."
          checked={value.stableForecastOnly}
          onChange={(stableForecastOnly) => onChange({ stableForecastOnly })}
        />
        <Toggle
          label="Harmonised boundaries only"
          hint="Drops cities whose Census boundary is not harmonised with the urban agglomeration, which distorts density."
          checked={value.harmonisedOnly}
          onChange={(harmonisedOnly) => onChange({ harmonisedOnly })}
        />
      </div>

      <Callout tone="info" title="Policy verification is a badge, not a filter">
        The state policy score is provisional for all 51 cities, so filtering on it would return nothing. Each city
        shows a “Policy provisional” badge instead.
      </Callout>
    </FormSection>

    <FormSection title="Minimum market size" hint="Ignore cities below a fleet threshold.">
      <Field
        label="Minimum EV fleet"
        htmlFor="minstock"
        value={`${value.minEvStock.toLocaleString()} EVs`}
        hint="Set to zero to include every city, however small."
      >
        <NumberInput
          id="minstock"
          value={value.minEvStock}
          min={0}
          max={500000}
          step={5000}
          suffix="EVs"
          onChange={(minEvStock) => onChange({ minEvStock })}
        />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[0, 25000, 50000, 100000].map((threshold) => (
            <button
              key={threshold}
              type="button"
              onClick={() => onChange({ minEvStock: threshold })}
              className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                value.minEvStock === threshold
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {threshold === 0 ? 'Any' : `${threshold / 1000}k+`}
            </button>
          ))}
        </div>
      </Field>
    </FormSection>

    <FormSection title="Timing and focus" hint="How far ahead to plan, and how many markets to include.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field
          label="Deployment horizon"
          hint={HORIZONS.find((h) => Number(h.value) === value.horizon)?.hint}
        >
          <Segmented
            ariaLabel="Deployment horizon"
            options={HORIZONS}
            value={String(value.horizon)}
            onChange={(h) => onChange({ horizon: Number(h) as DeploymentHorizon })}
          />
        </Field>

        <Field
          label="Markets in the plan"
          htmlFor="topn"
          value={`Top ${value.topN}`}
          hint="Only these cities receive chargers; the rest remain visible in Explore."
        >
          <NumberInput
            id="topn"
            value={value.topN}
            min={3}
            max={25}
            step={1}
            suffix="cities"
            onChange={(topN) => onChange({ topN })}
          />
        </Field>
      </div>

      {value.horizon !== 12 && (
        <Callout tone="warn" title={`${value.horizon} months is an extrapolation`}>
          M3 forecasts twelve months. A {value.horizon}-month figure compounds that rate, so treat it as a planning
          scenario rather than a second fitted model.
        </Callout>
      )}
    </FormSection>

    <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[11px] text-slate-600 flex items-start gap-2">
      <ShieldCheck className="w-3.5 h-3.5 text-brand-600 mt-0.5 shrink-0" />
      <span>
        Readiness check: the planner never invents data. Missing values stay missing and are shown as proxy badges,
        exactly as they are in the underlying panel.
      </span>
    </div>

    <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[11px] text-amber-900 flex items-start gap-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0" />
      <span>
        Nine late-joining cities have no measured vehicle split. Their segment fit is a proxy and is badged as such
        in the results table.
      </span>
    </div>
  </div>
);
