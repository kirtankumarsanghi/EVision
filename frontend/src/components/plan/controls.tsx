import React from 'react';

export const FormSection: React.FC<{
  title: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ title, hint, children }) => (
  <section className="space-y-3">
    <div>
      <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
      {hint && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{hint}</p>}
    </div>
    <div className="space-y-4">{children}</div>
  </section>
);

export const Field: React.FC<{
  label: string;
  hint?: string;
  htmlFor?: string;
  value?: React.ReactNode;
  children: React.ReactNode;
}> = ({ label, hint, htmlFor, value, children }) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-xs font-bold text-slate-700">
        {label}
      </label>
      {value !== undefined && (
        <span className="text-xs font-extrabold text-brand-700 font-mono">{value}</span>
      )}
    </div>
    {children}
    {hint && <p className="text-[11px] text-slate-500 leading-relaxed">{hint}</p>}
  </div>
);

interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  columns,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  columns?: number;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-1 rounded-xl bg-slate-100 p-1"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={`rounded-lg px-2.5 py-2 text-[11px] sm:text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
              active
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const Toggle: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 cursor-pointer hover:border-slate-300 transition-colors">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
    />
    <span>
      <span className="block text-xs font-bold text-slate-800">{label}</span>
      {hint && <span className="block text-[11px] text-slate-500 mt-0.5 leading-relaxed">{hint}</span>}
    </span>
  </label>
);

export const NumberInput: React.FC<{
  id: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}> = ({ id, value, min, max, step, onChange, suffix }) => (
  <div className="flex items-center rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-brand-500 overflow-hidden">
    <input
      id={id}
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const next = Number(e.target.value);
        onChange(Number.isFinite(next) ? next : 0);
      }}
      className="w-full px-3 py-2 text-sm font-semibold text-slate-900 bg-transparent focus:outline-none"
    />
    {suffix && (
      <span className="border-l border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 dark:border-slate-700">
        {suffix}
      </span>
    )}
  </div>
);

export const Callout: React.FC<{
  tone?: 'info' | 'warn' | 'good';
  title?: string;
  children: React.ReactNode;
}> = ({ tone = 'info', title, children }) => {
  const tones = {
    info: 'bg-sky-50 border-sky-200 text-sky-900',
    warn: 'bg-amber-50 border-amber-200 text-amber-900',
    good: 'bg-brand-50 border-brand-200 text-brand-900',
  } as const;
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-[11px] leading-relaxed ${tones[tone]}`}>
      {title && <div className="font-extrabold mb-0.5">{title}</div>}
      {children}
    </div>
  );
};
