import React from 'react';
import { Zap, Activity, Database, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { BackendStatus } from '../api';

interface HeaderProps {
  backendStatus: BackendStatus;
  isCheckingHealth: boolean;
  onRefreshHealth: () => void;
  selectedCity: string;
  onSelectCity: (city: string) => void;
  cities: Array<{ city: string; state_code: string }>;
}

export const Header: React.FC<HeaderProps> = ({
  backendStatus,
  isCheckingHealth,
  onRefreshHealth,
  selectedCity,
  onSelectCity,
  cities,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <Zap className="w-6 h-6 fill-current" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">EVision</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                  v0.2.0
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">
                Quantifying where India's next public EV chargers should go
              </p>
            </div>
          </div>

          {/* Quick city selector & status indicator */}
          <div className="flex items-center space-x-4">
            {/* Quick city jumper */}
            <div className="relative hidden md:block">
              <select
                value={selectedCity}
                onChange={(e) => onSelectCity(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-300 text-slate-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="">Jump to city analysis...</option>
                {cities.map((c) => (
                  <option key={c.city} value={c.city}>
                    {c.city} ({c.state_code})
                  </option>
                ))}
              </select>
            </div>

            {/* Coverage pill */}
            <div className="hidden lg:flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>51 cities</span>
              <span className="text-slate-400">·</span>
              <span className="text-emerald-700 font-semibold">96.9% observed</span>
            </div>

            {/* Backend connection status */}
            <div
              className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                backendStatus.online
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
              title={
                backendStatus.online
                  ? 'FastAPI backend connected at port 8000'
                  : 'FastAPI offline: using pre-built processed datasets'
              }
            >
              {backendStatus.online ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="font-semibold hidden sm:inline">API Online</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-semibold hidden sm:inline">Data Snapshots</span>
                </>
              )}
              <button
                onClick={onRefreshHealth}
                disabled={isCheckingHealth}
                className="hover:text-slate-900 transition-colors"
                title="Refresh backend status"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingHealth ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
