import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Play, Sparkles } from 'lucide-react';
import { CityFeatures, ScenarioInput } from '../../types';
import { DEFAULT_SCENARIO } from '../../lib/scenario';
import { affordableUnits, capexCrFor } from '../../lib/assumptions';
import { ScenarioPresets } from './ScenarioPresets';
import { StepCompany } from './StepCompany';
import { StepMarket } from './StepMarket';
import { StepRisk } from './StepRisk';

interface Props {
  initial: ScenarioInput;
  features: CityFeatures[];
  onRun: (input: ScenarioInput) => void;
}

const STEPS = [
  {
    id: 'company',
    title: 'Your capital',
    blurb: 'Budget, charger target and hardware mix.',
  },
  {
    id: 'market',
    title: 'Your market',
    blurb: 'Where you want to compete and what you are charging.',
  },
  {
    id: 'risk',
    title: 'Your evidence bar',
    blurb: 'How strict to be about proxies and forecast quality.',
  },
];

export const PlanWizard: React.FC<Props> = ({ initial, features, onRun }) => {
  const [draft, setDraft] = useState<ScenarioInput>(initial);
  const [step, setStep] = useState(0);

  const patch = (next: Partial<ScenarioInput>) => setDraft((prev) => ({ ...prev, ...next }));

  const applyPreset = (preset: Partial<ScenarioInput>) => {
    if (Object.keys(preset).length === 0) {
      setDraft({ ...DEFAULT_SCENARIO });
      return;
    }
    setDraft((prev) => ({ ...prev, ...preset }));
  };

  const affordable = affordableUnits(draft.budgetCr, draft.dcPct);
  const plannedCapex = Math.round(capexCrFor(draft.targetUnits, draft.dcPct));
  const willDeploy = Math.min(draft.targetUnits, affordable);
  const filterCount = [
    draft.cityClass !== 'all',
    draft.states.length > 0,
    draft.corridor !== 'any',
    draft.measuredSplitOnly,
    draft.stableForecastOnly,
    draft.harmonisedOnly,
    draft.minEvStock > 0,
  ].filter(Boolean).length;

  const canRun = draft.budgetCr > 0 && draft.targetUnits > 0 && draft.topN > 0;

  const stepContent = useMemo(() => {
    if (step === 0) return <StepCompany value={draft} onChange={patch} />;
    if (step === 1) return <StepMarket value={draft} onChange={patch} features={features} />;
    return <StepRisk value={draft} onChange={patch} />;
  }, [step, draft, features]);

  return (
    <div className="space-y-6 pb-12">
      <div className="page-head p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-200 px-3 py-1 text-[11px] font-bold text-brand-800">
              <Sparkles className="w-3.5 h-3.5 text-brand-600" />
              Requirements-first planner
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Tell us your rollout, get a defended plan
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
              Three short steps. We filter the 51-city panel to your requirements, score what remains with the
              published CDS, and split your chargers across the strongest markets — with the evidence for every
              choice.
            </p>
          </div>

          <div className="shrink-0 rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs space-y-1.5 min-w-[220px]">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Budget</span>
              <span className="font-bold text-slate-900">₹{draft.budgetCr.toLocaleString()} Cr</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Chargers</span>
              <span className="font-bold text-slate-900">{willDeploy.toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Approx. capex</span>
              <span className="font-bold text-slate-900">₹{plannedCapex.toLocaleString()} Cr</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Active filters</span>
              <span className="font-bold text-slate-900">{filterCount}</span>
            </div>
            {plannedCapex > draft.budgetCr && (
              <p className="text-[10.5px] text-amber-700 font-semibold pt-1 border-t border-slate-200">
                Over budget — deployment will scale to {affordable.toLocaleString()} units.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <ScenarioPresets onApply={applyPreset} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 surface overflow-hidden">
          <div className="border-b border-slate-100 px-5 sm:px-6 pt-5">
            <ol className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-4">
              {STEPS.map((s, index) => {
                const done = index < step;
                const active = index === step;
                return (
                  <li key={s.id} className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setStep(index)}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                        active
                          ? 'bg-slate-900 text-white'
                          : done
                          ? 'bg-brand-50 text-brand-800 border border-brand-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      aria-current={active ? 'step' : undefined}
                    >
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${
                          done ? 'bg-slate-900 text-white' : active ? 'bg-white/20' : 'bg-white'
                        }`}
                      >
                        {done ? <Check className="w-2.5 h-2.5" /> : index + 1}
                      </span>
                      {s.title}
                    </button>
                    {index < STEPS.length - 1 && <span className="text-slate-300">›</span>}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="px-5 sm:px-6 py-5">
            <p className="text-xs text-slate-500 mb-4">{STEPS[step].blurb}</p>
            {stepContent}
          </div>

          <div className="border-t border-slate-100 px-5 sm:px-6 py-4 flex items-center justify-between gap-3 bg-slate-50/60">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40 hover:bg-slate-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>

            <div className="flex items-center gap-2">
              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800"
                >
                  Next
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => canRun && onRun(draft)}
                  disabled={!canRun}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  Build my plan
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-4">
          <div className="surface p-5 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">What happens when you run it</h3>
            <ol className="space-y-2.5 text-[11px] text-slate-600 leading-relaxed">
              {[
                'Every city is checked against your requirements; excluded cities and the exact reason are listed.',
                'Remaining cities are scored with the published CDS — 40% current volume, 30% fundamentals, 30% growth.',
                'Your units are apportioned exactly, largest-remainder, so the total never drifts.',
                'Hardware is split into DC fast and AC destination using the mix you chose.',
                'Each city gets a confidence badge for split, forecast, boundary and policy.',
              ].map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-brand-50 text-brand-700 text-[9px] font-extrabold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 text-[11px] text-slate-600 leading-relaxed">
            <h3 className="text-sm font-extrabold text-slate-900 mb-1.5">Good to know</h3>
            <p>
              Scores are never rescaled when you filter, so “CDS 1.70” always means the same thing across runs. Capex
              and “EVs served” are planning assumptions — open the Assumptions drawer on the results page to see every
              rate.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};
