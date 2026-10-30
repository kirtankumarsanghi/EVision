import { CityConfidence, CityFeatures, CityRanking } from '../types';

/** Feature booleans arrive as real booleans or as "True"/"False" strings. */
export function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === 'yes' || v === '1';
  }
  return false;
}

export function confidenceOf(
  city: CityRanking,
  features: CityFeatures | undefined
): CityConfidence {
  return {
    split: city.split_method,
    forecast: city.forecast_quality,
    boundary: truthy(features?.boundary_harmonised) ? 'harmonised' : 'estimated',
    policy: truthy(features?.policy_verified) ? 'verified' : 'provisional',
  };
}

export interface ConfidenceBadge {
  label: string;
  tone: 'good' | 'warn' | 'neutral';
  hint: string;
}

/** Plain-English badges shown next to a city in the ranked table. */
export function confidenceBadges(c: CityConfidence): ConfidenceBadge[] {
  const split: ConfidenceBadge =
    c.split === 'measured'
      ? { label: 'Measured split', tone: 'good', hint: '2W/3W/4W volumes measured from Vahan for this city.' }
      : {
          label: `${c.split === 'state' ? 'State' : 'National'} proxy`,
          tone: 'warn',
          hint: 'Vehicle mix is borrowed from a broader geography, so segment fit is approximate.',
        };

  const forecast: ConfidenceBadge =
    c.forecast === 'ok'
      ? { label: 'Stable forecast', tone: 'good', hint: 'SARIMA / Holt-Winters passed the holdout quality gate.' }
      : {
          label: `${c.forecast} forecast`,
          tone: 'warn',
          hint: 'The winning time-series model did not pass the holdout gate; treat growth with caution.',
        };

  const boundary: ConfidenceBadge =
    c.boundary === 'harmonised'
      ? { label: 'Harmonised boundary', tone: 'neutral', hint: 'Population and area use a consistent urban boundary.' }
      : { label: 'Estimated boundary', tone: 'warn', hint: 'City boundary is not harmonised with the Census agglomeration.' };

  const policy: ConfidenceBadge =
    c.policy === 'verified'
      ? { label: 'Policy verified', tone: 'good', hint: 'The state EV policy document was read and verified.' }
      : {
          label: 'Policy provisional',
          tone: 'warn',
          hint: 'Policy score is provisional — the source PDF has not been machine-read yet.',
        };

  return [split, forecast, boundary, policy];
}
