import React from 'react';

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  display: string;
  dotColor?: string;
  barColor?: string;
  hint?: string;
}

/** A readable horizontal bar list — labels, values and bars in one aligned row. */
export const BarList: React.FC<{
  items: BarListItem[];
  onSelect?: (key: string) => void;
  className?: string;
}> = ({ items, onSelect, className = '' }) => {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className={`divide-y divide-slate-100 ${className}`}>
      {items.map((item, index) => {
        const pct = Math.max(1.5, (Math.max(item.value, 0) / max) * 100);
        const Row = onSelect ? 'button' : 'div';
        return (
          <Row
            key={item.key}
            {...(onSelect
              ? { type: 'button' as const, onClick: () => onSelect(item.key), title: item.hint }
              : { title: item.hint })}
            className={`group grid w-full grid-cols-[7.5rem_1fr_4.75rem] items-center gap-3 py-2 text-left ${
              onSelect ? 'transition-colors hover:bg-slate-50/70' : ''
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              {item.dotColor && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.dotColor }}
                />
              )}
              <span className="truncate text-[11.5px] font-medium text-slate-700">{item.label}</span>
            </span>
            <span className="relative h-1.5 overflow-hidden rounded-full bg-slate-100">
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: item.barColor ?? 'var(--bar)',
                  opacity: Math.max(0.55, 1 - index * 0.03),
                }}
              />
            </span>
            <span className="text-right font-mono text-[11px] font-semibold text-slate-800">
              {item.display}
            </span>
          </Row>
        );
      })}
    </div>
  );
};
