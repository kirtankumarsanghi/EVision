import React from 'react';

/* ------------------------------------------------------------------ *
 * Shared layout primitives.
 *
 * The UI deliberately uses ONE surface per section and hairline dividers
 * inside it, instead of nesting a bordered card inside another card.
 * ------------------------------------------------------------------ */

export const SectionTitle: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, description, action, className = '' }) => (
  <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`}>
    <div>
      <h2 className="text-[15px] font-extrabold tracking-tight text-slate-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{description}</p>}
    </div>
    {action}
  </div>
);

export const PageHeader: React.FC<{
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: React.ElementType;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}> = ({ eyebrow, title, description, icon: Icon, actions, children, className = '' }) => (
  <section className={`page-head relative overflow-hidden animate-fade-up ${className}`}>
    <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl" />
    <div className="relative flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="max-w-3xl">
        {eyebrow && (
          <div className="eyebrow flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {eyebrow}
          </div>
        )}
        <h1 className="mt-1.5 flex items-center gap-2 text-xl font-black tracking-tight text-slate-900 sm:text-[1.55rem]">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
              <Icon className="h-4 w-4" />
            </span>
          )}
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-slate-600">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {children && <div className="relative border-t border-slate-200/70 px-5 py-4 sm:px-6">{children}</div>}
  </section>
);

export interface StatItem {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
  icon?: React.ElementType;
  onClick?: () => void;
  hint?: string;
}

const STAT_GRID: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
};

/** One panel with hairline dividers — not a row of separate boxes. */
export const StatGroup: React.FC<{
  items: StatItem[];
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}> = ({ items, columns = 4, className = '' }) => (
  <div className={`surface overflow-hidden ${className}`}>
    <div className={`grid gap-px bg-slate-200/70 ${STAT_GRID[columns]}`}>
      {items.map((item) => {
        const Icon = item.icon;
        const inner = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                {item.label}
              </span>
              {Icon && <Icon className="h-3.5 w-3.5 text-slate-300" />}
            </div>
            <div className={`mt-1.5 text-xl font-black leading-none ${item.tone ?? 'text-slate-900'}`}>
              {item.value}
            </div>
            {item.sub && <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">{item.sub}</p>}
          </>
        );

        return item.onClick ? (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            title={item.hint}
            className="group bg-white p-4 text-left transition-colors hover:bg-brand-50/40 focus:outline-none focus-visible:bg-brand-50/60"
          >
            {inner}
          </button>
        ) : (
          <div key={item.label} className="bg-white p-4" title={item.hint}>
            {inner}
          </div>
        );
      })}
    </div>
  </div>
);

/** A quiet row of labelled facts, used inside panels. */
export const InlineStats: React.FC<{
  items: { label: string; value: React.ReactNode }[];
  className?: string;
}> = ({ items, className = '' }) => (
  <div className={`flex flex-wrap gap-x-6 gap-y-2 ${className}`}>
    {items.map((item) => (
      <div key={item.label}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.label}</div>
        <div className="mt-0.5 text-xs font-extrabold text-slate-800">{item.value}</div>
      </div>
    ))}
  </div>
);

export type TagTone = 'red' | 'orange' | 'amber' | 'sky' | 'blue' | 'violet' | 'pink' | 'rose' | 'slate';

const TAG_DOT: Record<TagTone, string> = {
  red: 'bg-[#a63d33]',
  orange: 'bg-[#c07a2c]',
  amber: 'bg-[#c07a2c]',
  sky: 'bg-[#5f7d8c]',
  blue: 'bg-[#4c6b8a]',
  violet: 'bg-[#5f6b8c]',
  pink: 'bg-[#a85a3c]',
  rose: 'bg-[#a63d33]',
  slate: 'bg-[#8a8178]',
};

/**
 * Status tag: a coloured dot plus neutral text.
 * The dot carries the meaning, so tags stay readable in both themes and do not
 * look like a row of pastel pills.
 */
export const Tag: React.FC<{
  tone?: TagTone;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'slate', children, className = '' }) => (
  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 ${className}`}>
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TAG_DOT[tone]}`} />
    {children}
  </span>
);

export const tierTone = (cds: number): TagTone =>
  cds >= 1.5 ? 'red' : cds >= 0.75 ? 'orange' : cds >= 0 ? 'sky' : 'slate';

export const splitTone = (method: string): TagTone =>
  method === 'measured' ? 'blue' : method === 'state' ? 'amber' : 'rose';
