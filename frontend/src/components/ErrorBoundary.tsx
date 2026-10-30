import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  error: Error | null;
}

/** Keeps a rendering failure in one panel instead of a blank white page. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[EVision] UI error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 sm:p-8 my-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 mt-0.5" />
          <div className="space-y-2">
            <h2 className="text-lg font-extrabold text-rose-950">This view could not render</h2>
            <p className="text-xs text-rose-800 leading-relaxed max-w-2xl">
              The data loaded, but something in this screen failed. Your scenario is safe — reloading restores the
              last plan you ran.
            </p>
            <pre className="text-[10.5px] text-rose-700 bg-white/70 border border-rose-200 rounded-lg p-2 overflow-x-auto max-w-full">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-900 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
