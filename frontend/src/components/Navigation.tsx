import React from 'react';
import {
  LayoutDashboard,
  MapPin,
  Trophy,
  Zap,
  LineChart,
  TrendingUp,
  BrainCircuit,
  FileCheck2,
  Calculator,
} from 'lucide-react';

export type TabType =
  | 'overview'
  | 'map'
  | 'allocation'
  | 'hotspots'
  | 'demand'
  | 'city'
  | 'forecast'
  | 'models'
  | 'integrity';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  selectedCityName?: string;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  selectedCityName,
}) => {
  const tabs = [
    { id: 'overview' as TabType, label: 'Problem & Objectives', icon: LayoutDashboard },
    { id: 'map' as TabType, label: 'Choropleth & CDS Map', icon: MapPin },
    { id: 'allocation' as TabType, label: 'Next 100k Siting Planner', icon: Calculator, badge: 'New' },
    { id: 'hotspots' as TabType, label: 'Hotspot Ranking', icon: Trophy },
    { id: 'demand' as TabType, label: 'Obj 1: Demand & Gap', icon: Zap },
    {
      id: 'city' as TabType,
      label: selectedCityName ? `City: ${selectedCityName}` : 'City Detail',
      icon: LineChart,
      highlight: !!selectedCityName,
    },
    { id: 'forecast' as TabType, label: 'Obj 4: Forecasts', icon: TrendingUp },
    { id: 'models' as TabType, label: 'Obj 2 & 3: Models', icon: BrainCircuit },
    { id: 'integrity' as TabType, label: 'Data & Provenance', icon: FileCheck2 },
  ];

  return (
    <nav className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                } ${tab.highlight && !isActive ? 'ring-1 ring-emerald-400 text-emerald-800 bg-emerald-50' : ''}`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {tab.badge && !isActive && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-extrabold border border-emerald-300">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
