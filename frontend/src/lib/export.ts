import { ScenarioInput, ScenarioResult } from '../types';

export function allocationCsv(result: ScenarioResult): string {
  const headers = [
    'Rank',
    'City',
    'State',
    'CDS',
    'Share_Pct',
    'Total_Chargers',
    'DC_Fast_Units',
    'AC_Units',
    'Capex_Cr',
    'Fleet_EVs',
    'Public_Stations',
    'Demand_Per_Station',
    'Growth_12m_Pct',
    'Split_Confidence',
    'Forecast_Quality',
    'Policy_Status',
    'Recommendation',
  ];

  const rows = result.cities.map((c) => [
    c.rank,
    c.city,
    c.state_code,
    c.cds.toFixed(3),
    c.sharePct.toFixed(2),
    c.units,
    c.fastUnits,
    c.acUnits,
    c.capexCr.toFixed(1),
    Math.round(c.evStock),
    c.stations,
    c.demand.toFixed(1),
    (c.growth * 100).toFixed(1),
    c.confidence.split,
    c.confidence.forecast,
    c.policyVerified ? 'verified' : 'provisional',
    `"${c.recommendation}"`,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function encodeScenario(input: ScenarioInput): string {
  return encodeURIComponent(JSON.stringify(input));
}

export function decodeScenario(value: string | null): ScenarioInput | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (parsed && typeof parsed === 'object' && 'targetUnits' in parsed) {
      return parsed as ScenarioInput;
    }
  } catch {
    /* ignore malformed links */
  }
  return null;
}

/** One-sentence narrative used at the top of the results page. */
export function scenarioSummary(result: ScenarioResult): string {
  const { totals, cities, input } = result;
  const who = input.company.trim() || 'This plan';
  if (cities.length === 0) {
    return `${who} matched no cities. Relax a requirement to see a recommendation.`;
  }
  const top = cities[0];
  return `${who} deploys ${totals.units.toLocaleString()} chargers (₹${totals.capexCr.toLocaleString()} Cr) across ${totals.markets} ${
    totals.markets === 1 ? 'market' : 'markets'
  }. ${top.city} ranks first (CDS ${top.cds.toFixed(2)}), followed by ${
    cities[1]?.city ?? 'no other city'
  }.`;
}
