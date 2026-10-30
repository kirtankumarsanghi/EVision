import React from 'react';
import { Compass, LayoutDashboard, Sun, Moon } from 'lucide-react';
import { BackendStatus } from '../api';
import { useTheme } from '../lib/theme';
import { PlanMode, PlanStage, TabType } from '../types';

interface HeaderProps {
  mode: PlanMode;
  onModeChange: (mode: PlanMode) => void;
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  planStage: PlanStage;
  onPlanStageChange: (stage: PlanStage) => void;
  hasResult: boolean;
  backendStatus: BackendStatus;
  isCheckingHealth: boolean;
  onRefreshHealth: () => void;
}

const EXPLORE_LINKS: { id: TabType; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'map', label: 'Map' },
  { id: 'hotspots', label: 'Rankings' },
  { id: 'demand', label: 'Demand gap' },
  { id: 'city', label: 'City profile' },
  { id: 'forecast', label: 'Forecasts' },
];

const LogoMark: React.FC = () => (
  <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
    <path
      d="M16 2.4 28 8.9v11.1L16 29.6 4 20V8.9Z"
      className="fill-slate-900 dark:fill-slate-100"
    />
    <path
      d="M17.8 7.4 10.9 16.9h4.2l-.7 7.1 6.9-10.1h-4.3l.8-6.5Z"
      className="fill-[#e0915f] dark:fill-[#b85420]"
    />
  </svg>
);

export const Header: React.FC<HeaderProps> = ({
  mode,
  onModeChange,
  activeTab,
  onTabChange,
  planStage,
  onPlanStageChange,
  hasResult,
  backendStatus,
  isCheckingHealth,
  onRefreshHealth,
}) => {
  const { theme, toggle } = useTheme();

  const linkClass = (active: boolean) =>
    `relative flex h-14 shrink-0 items-center px-3 text-[13px] font-medium transition-colors ${
      active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-900'
    }`;

  const underline = 'absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[var(--bar)]';

  const exploreLinks = (
    <>
      {EXPLORE_LINKS.map((link) => {
        const active = activeTab === link.id;
        return (
          <button
            key={link.id}
            type="button"
            onClick={() => onTabChange(link.id)}
            aria-current={active ? 'page' : undefined}
            className={linkClass(active)}
          >
            {link.label}
            {active && <span className={underline} />}
          </button>
        );
      })}
    </>
  );

  const planLinks = (
    <>
      <button
        type="button"
        onClick={() => onPlanStageChange('wizard')}
        aria-current={planStage === 'wizard' ? 'page' : undefined}
        className={linkClass(planStage === 'wizard')}
      >
        Requirements
        {planStage === 'wizard' && <span className={underline} />}
      </button>
      <button
        type="button"
        disabled={!hasResult}
        onClick={() => onPlanStageChange('results')}
        title={!hasResult ? 'Run the planner once to see a recommendation' : undefined}
        className={`${linkClass(planStage === 'results')} ${!hasResult ? 'cursor-not-allowed opacity-35 hover:text-slate-500' : ''}`}
      >
        Recommendation
        {planStage === 'results' && <span className={underline} />}
      </button>
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center gap-2">
          <button
            type="button"
            onClick={() => onModeChange('explore')}
            className="flex items-center gap-2.5 pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md"
            aria-label="EVision home"
          >
            <LogoMark />
            <span className="font-display text-[21px] font-extrabold leading-none tracking-[-0.045em]">
              <span className="text-slate-900 dark:text-white">EV</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">ision</span>
            </span>
          </button>

          <nav className="ml-4 hidden h-14 items-center lg:flex" aria-label="Primary">
            {mode === 'explore' ? exploreLinks : planLinks}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRefreshHealth}
              disabled={isCheckingHealth}
              title={
                backendStatus.online
                  ? 'Live API connected — refreshing status'
                  : 'Backend offline — using bundled snapshots'
              }
              className="flex h-8 w-8 items-center justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label={backendStatus.online ? 'API online' : 'Using snapshots'}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  backendStatus.online ? 'bg-[#4c6b8a]' : 'bg-[#c07a2c]'
                } ${isCheckingHealth ? 'animate-pulse' : ''}`}
              />
            </button>

            <button
              type="button"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {mode === 'explore' ? (
              <button
                type="button"
                onClick={() => onModeChange('plan')}
                className="ml-1 inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800"
              >
                <Compass className="h-3.5 w-3.5" />
                Plan a rollout
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onModeChange('explore')}
                className="ml-1 inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-2 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                Explore data
              </button>
            )}
          </div>
        </div>

        {/* Mobile navigation */}
        <div className="-mx-4 flex overflow-x-auto border-t border-slate-100 px-4 sm:-mx-6 sm:px-6 lg:hidden dark:border-slate-800/60">
          <nav className="flex h-10 items-center gap-1" aria-label="Sections">
            {mode === 'explore' ? exploreLinks : planLinks}
          </nav>
        </div>
      </div>
    </header>
  );
};
