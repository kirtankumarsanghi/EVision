import React from 'react';
import { Building2, Wallet, Zap } from 'lucide-react';
import { ScenarioInput } from '../../types';
import { affordableUnits, capexCrFor, costPerUnitLakh } from '../../lib/assumptions';
import { Callout, Field, FormSection, NumberInput } from './controls';

interface Props {
  value: ScenarioInput;
  onChange: (patch: Partial<ScenarioInput>) => void;
}

export const StepCompany: React.FC<Props> = ({ value, onChange }) => {
  const affordable = affordableUnits(value.budgetCr, value.dcPct);
  const plannedCapex = capexCrFor(value.targetUnits, value.dcPct);
  const overBudget = plannedCapex > value.budgetCr;

  return (
    <div className="space-y-7">
      <FormSection
        title="Who is deploying?"
        hint="Used only for the report header and the exported brief."
      >
        <Field label="Company name" htmlFor="company" hint="Optional — leave blank to use “This plan”.">
          <div className="flex items-center rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-brand-500">
            <span className="pl-3 text-slate-400">
              <Building2 className="w-4 h-4" />
            </span>
            <input
              id="company"
              type="text"
              value={value.company}
              placeholder="e.g. Tata Power"
              onChange={(e) => onChange({ company: e.target.value })}
              className="w-full bg-transparent px-2.5 py-2 text-sm font-semibold text-slate-900 focus:outline-none"
            />
          </div>
        </Field>
      </FormSection>

      <FormSection
        title="What can you spend?"
        hint="Capex is an assumption, not model output — the Assumptions drawer lists every rate."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field
            label="Total budget"
            htmlFor="budget"
            value={`₹${value.budgetCr.toLocaleString()} Cr`}
            hint={`At ${value.dcPct}% DC that buys about ${affordable.toLocaleString()} chargers.`}
          >
            <NumberInput
              id="budget"
              value={value.budgetCr}
              min={100}
              max={20000}
              step={100}
              suffix="₹ Cr"
              onChange={(budgetCr) => onChange({ budgetCr })}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[500, 1000, 2500, 5000].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => onChange({ budgetCr: amount })}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                    value.budgetCr === amount
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ₹{amount} Cr
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Chargers to deploy"
            htmlFor="units"
            value={`${value.targetUnits.toLocaleString()} units`}
            hint="The planner splits this exactly across the selected cities — no rounding drift."
          >
            <NumberInput
              id="units"
              value={value.targetUnits}
              min={1000}
              max={500000}
              step={1000}
              suffix="units"
              onChange={(targetUnits) => onChange({ targetUnits })}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[10000, 25000, 50000, 100000].map((units) => (
                <button
                  key={units}
                  type="button"
                  onClick={() => onChange({ targetUnits: units })}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold border transition-colors ${
                    value.targetUnits === units
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {units >= 1000 ? `${units / 1000}k` : units}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field
          label="Hardware mix"
          htmlFor="dcmix"
          value={`${value.dcPct}% DC / ${100 - value.dcPct}% AC`}
          hint="DC fast charges 4W fleets and highway traffic; AC destination is cheaper and suits 2W/workplace charging."
        >
          <input
            id="dcmix"
            type="range"
            min={15}
            max={70}
            step={5}
            value={value.dcPct}
            onChange={(e) => onChange({ dcPct: Number(e.target.value) })}
            className="w-full accent-brand-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Cheaper AC</span>
            <span className="font-mono">₹{costPerUnitLakh(value.dcPct).toFixed(2)} lakh / unit</span>
            <span>Faster DC</span>
          </div>
        </Field>

        {overBudget ? (
          <Callout tone="warn" title="This plan exceeds the budget">
            {value.targetUnits.toLocaleString()} chargers cost about ₹{Math.round(plannedCapex).toLocaleString()} Cr.
            On your ₹{value.budgetCr.toLocaleString()} Cr budget the planner will deploy{' '}
            <b>{affordable.toLocaleString()}</b> instead. Raise the budget or lower the unit target to avoid the
            automatic scale-down.
          </Callout>
        ) : (
          <Callout tone="good" title={`${value.targetUnits.toLocaleString()} chargers fit the budget`}>
            Approximate capex ₹{Math.round(plannedCapex).toLocaleString()} Cr of ₹
            {value.budgetCr.toLocaleString()} Cr, leaving ₹
            {Math.max(0, Math.round(value.budgetCr - plannedCapex)).toLocaleString()} Cr headroom.
          </Callout>
        )}
      </FormSection>

      <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[11px] text-slate-600 flex items-start gap-2">
        <Zap className="w-3.5 h-3.5 text-brand-600 mt-0.5 shrink-0" />
        <span>
          Capital cost covers the charger, civil work and grid interconnect. Land lease, opex and demand charges are
          not included — see Assumptions.
        </span>
      </div>
    </div>
  );
};
