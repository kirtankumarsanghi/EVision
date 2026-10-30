import React, { useState } from 'react';
import {
  BrainCircuit,
  BarChart2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  Sliders,
  Layers,
} from 'lucide-react';
import { M1Coefficient, M2Comparison, M2Confusion } from '../types';

interface ModelsViewProps {
  m1Coefficients: M1Coefficient[];
  m2Comparison: M2Comparison[];
  m2Confusion: M2Confusion[];
}

export const ModelsView: React.FC<ModelsViewProps> = ({
  m1Coefficients,
  m2Comparison,
  m2Confusion,
}) => {
  const [activeModelTab, setActiveModelTab] = useState<'m1' | 'm2'>('m1');

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Model Selector Header */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold mb-2">
            <BrainCircuit className="w-3.5 h-3.5 text-blue-600" />
            <span>Objectives 2 & 3 — Econometric & Classifier Foundations</span>
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Statistical Models: M1 Count & M2 Classifier
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Grounding EV charging demand in empirical vehicle registration drivers and exogenous classification.
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl text-xs font-bold">
          <button
            onClick={() => setActiveModelTab('m1')}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeModelTab === 'm1'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            M1 Negative Binomial (Drivers)
          </button>
          <button
            onClick={() => setActiveModelTab('m2')}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeModelTab === 'm2'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            M2 Logistic & LDA (Classifier)
          </button>
        </div>
      </div>

      {activeModelTab === 'm1' ? (
        /* M1 Count Model Tab */
        <div className="space-y-6">
          {/* M1 Findings Callout */}
          <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-6 rounded-2xl shadow-md space-y-3">
            <h3 className="font-extrabold text-base flex items-center space-x-2">
              <span>M1 Adoption Drivers Key Takeaway</span>
            </h3>
            <p className="text-xs sm:text-sm text-blue-100 leading-relaxed max-w-3xl">
              Non-EV market size is the single strongest determinant of monthly EV registrations (IRR 2.13, p &lt; 0.001):
              an existing deep automotive market converts rapidly to electric. Per-capita income is negative (IRR 0.62),
              consistent with adoption clustering in younger, high-density tier-1/tier-2 hubs rather than high-income enclaves.
            </p>
          </div>

          {/* M1 Forest Plot & Visualizer */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                M1 Incidence Rate Ratios (IRR) with 95% Confidence Intervals
              </h3>
              <p className="text-xs text-slate-500">
                IRR &gt; 1 indicates positive correlate; IRR &lt; 1 indicates negative correlate (Reference line at 1.0)
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {m1Coefficients.map((c) => {
                const isSignificant = c.p_value < 0.05;
                const minScale = 0.0;
                const maxScale = 3.0;
                const pct = (val: number) =>
                  `${Math.max(0, Math.min(100, ((val - minScale) / (maxScale - minScale)) * 100))}%`;

                return (
                  <div key={c.term} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-800 font-mono text-[11px]">{c.term}</span>
                      <div className="space-x-3 text-slate-500 text-[11px]">
                        <span>
                          IRR: <b className="text-slate-900 font-mono">{c.irr.toFixed(2)}</b> [
                          {c.irr_lo?.toFixed(2)}–{c.irr_hi?.toFixed(2)}]
                        </span>
                        <span
                          className={`font-semibold ${
                            isSignificant ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          p={c.p_value < 0.001 ? '<0.001' : c.p_value.toFixed(3)}
                        </span>
                      </div>
                    </div>

                    {/* CI Bar graphic */}
                    <div className="relative h-4 bg-slate-100 rounded-md overflow-hidden">
                      {/* Reference line 1.0 */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-400 z-10"
                        style={{ left: pct(1.0) }}
                        title="IRR = 1.0 (No Effect)"
                      ></div>

                      {/* 95% CI Range Bar */}
                      <div
                        className={`absolute top-1 bottom-1 rounded-full ${
                          isSignificant ? 'bg-indigo-200' : 'bg-slate-300'
                        }`}
                        style={{
                          left: pct(c.irr_lo || c.irr),
                          width: `${Math.max(
                            2,
                            ((c.irr_hi - c.irr_lo) / (maxScale - minScale)) * 100
                          )}%`,
                        }}
                      ></div>

                      {/* Point Estimate Dot */}
                      <div
                        className={`absolute top-0.5 bottom-0.5 w-3 h-3 rounded-full border-2 border-white shadow-xs ${
                          isSignificant ? 'bg-indigo-600' : 'bg-slate-500'
                        }`}
                        style={{
                          left: `calc(${pct(c.irr)} - 6px)`,
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* M1 Full Coefficients Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm">Full Regression Parameter Table (M1a, n=51)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                    <th className="py-3 px-4">Term</th>
                    <th className="py-3 px-4 text-right">Coefficient</th>
                    <th className="py-3 px-4 text-right">Std Error</th>
                    <th className="py-3 px-4 text-right">z-stat</th>
                    <th className="py-3 px-4 text-right">p-value</th>
                    <th className="py-3 px-4 text-right">IRR</th>
                    <th className="py-3 px-4 text-right">95% CI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {m1Coefficients.map((c) => (
                    <tr key={c.term} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-bold text-slate-900">{c.term}</td>
                      <td className="py-2.5 px-4 text-right text-slate-700">{c.coef.toFixed(3)}</td>
                      <td className="py-2.5 px-4 text-right text-slate-500">{c.std_err.toFixed(3)}</td>
                      <td className="py-2.5 px-4 text-right text-slate-700">{c.z.toFixed(2)}</td>
                      <td
                        className={`py-2.5 px-4 text-right font-bold ${
                          c.p_value < 0.05 ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {c.p_value < 0.001 ? '<0.001' : c.p_value.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-indigo-700">
                        {c.irr.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-600">
                        [{c.irr_lo?.toFixed(2)}, {c.irr_hi?.toFixed(2)}]
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* M2 Classifier Model Tab */
        <div className="space-y-6">
          {/* M2 Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Exogenous ROC-AUC
              </span>
              <div className="text-3xl font-black text-slate-900">0.915</div>
              <p className="text-xs text-slate-500">
                Linear Discriminant Analysis (LDA) cross-validated AUC under repeated 5-fold CV
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                LOOCV Accuracy
              </span>
              <div className="text-3xl font-black text-emerald-700">90.2%</div>
              <p className="text-xs text-slate-500">
                Leave-One-Out Cross Validation accurately labels 46 of 51 cities
              </p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Zero Label Leakage
              </span>
              <div className="text-3xl font-black text-indigo-700">Guaranteed</div>
              <p className="text-xs text-slate-500">
                EV stock, charger counts, and past growth are completely excluded from predictors
              </p>
            </div>
          </div>

          {/* Model Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm">
                Classifier Performance Benchmark (Repeated 5-Fold Cross Validation)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                    <th className="py-3 px-4 font-sans">Model</th>
                    <th className="py-3 px-4 text-right">AUC Mean</th>
                    <th className="py-3 px-4 text-right">AUC SD</th>
                    <th className="py-3 px-4 text-right">Train AUC</th>
                    <th className="py-3 px-4 text-right">Train-CV Gap</th>
                    <th className="py-3 px-4 text-right">Accuracy</th>
                    <th className="py-3 px-4 text-right">F1 Score</th>
                    <th className="py-3 px-4 text-right">LOOCV Acc</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {m2Comparison.map((m) => (
                    <tr key={m.model} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900 font-sans">{m.model}</td>
                      <td className="py-3 px-4 text-right font-bold text-indigo-700">
                        {m.auc_mean.toFixed(3)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">{m.auc_sd.toFixed(3)}</td>
                      <td className="py-3 px-4 text-right text-slate-700">{m.train_auc.toFixed(3)}</td>
                      <td className="py-3 px-4 text-right text-emerald-700">{m.train_cv_gap.toFixed(3)}</td>
                      <td className="py-3 px-4 text-right text-slate-800">
                        {(m.accuracy * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right text-slate-800">{m.f1.toFixed(3)}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {(m.loocv_accuracy * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Confusion Matrix Display */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">
              M2 Leave-One-Out Cross-Validation (LOOCV) Confusion Matrix
            </h3>
            <p className="text-xs text-slate-500">
              Evaluated across 51 city holdouts (Actual High Demand vs Predicted High Demand)
            </p>

            <div className="max-w-md mx-auto pt-4">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase">
                    True Negative (TN)
                  </span>
                  <div className="text-3xl font-extrabold text-emerald-900 mt-1">24</div>
                  <span className="text-[11px] text-emerald-700">Correctly low demand</span>
                </div>

                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                  <span className="text-[11px] font-bold text-rose-800 uppercase">
                    False Positive (FP)
                  </span>
                  <div className="text-3xl font-extrabold text-rose-900 mt-1">2</div>
                  <span className="text-[11px] text-rose-700">Type I Error</span>
                </div>

                <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                  <span className="text-[11px] font-bold text-rose-800 uppercase">
                    False Negative (FN)
                  </span>
                  <div className="text-3xl font-extrabold text-rose-900 mt-1">3</div>
                  <span className="text-[11px] text-rose-700">Type II Error</span>
                </div>

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase">
                    True Positive (TP)
                  </span>
                  <div className="text-3xl font-extrabold text-emerald-900 mt-1">22</div>
                  <span className="text-[11px] text-emerald-700">Correctly high demand</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
