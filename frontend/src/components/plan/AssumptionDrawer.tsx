import React, { useEffect } from 'react';
import { X, Info } from 'lucide-react';
import { ASSUMPTIONS } from '../../lib/assumptions';

export const AssumptionDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close assumptions"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assumptions-title"
        className="relative h-full w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <Info className="w-4 h-4" />
            </span>
            <h2 id="assumptions-title" className="text-sm font-extrabold text-slate-900">
              Assumptions behind the numbers
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            The CDS ranking is statistical. The capital cost and utilisation figures below are engineering
            assumptions, stated here so every rupee in the report is traceable.
          </p>
          {ASSUMPTIONS.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-bold text-slate-800">{row.label}</span>
                <span className="text-xs font-extrabold text-brand-700 font-mono shrink-0">{row.value}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">{row.note}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
