/**
 * Chart palette — desaturated, editorial tones that sit together.
 * Avoids the neon red/orange/sky combination that reads as generic AI output.
 */
export const SERIES = {
  primary: '#b85420', // burnt copper
  secondary: '#4c6b8a', // slate blue
  tertiary: '#a85a3c', // clay
  quaternary: '#7d7165', // warm grey
  muted: '#c9beb1',
} as const;

export const TIER_COLORS = {
  critical: '#a63d33',
  high: '#c07a2c',
  moderate: '#5f7d8c',
  low: '#8a8178',
} as const;

export const tierColor = (cds: number): string =>
  cds >= 1.5
    ? TIER_COLORS.critical
    : cds >= 0.75
    ? TIER_COLORS.high
    : cds >= 0
    ? TIER_COLORS.moderate
    : TIER_COLORS.low;
