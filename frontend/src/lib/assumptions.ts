/**
 * Every financial / utilisation constant used by the planner lives here.
 *
 * These are ENGINEERING ASSUMPTIONS, not model output. The UI surfaces them in
 * the Assumptions drawer and in the exported brief so a reader can trace every
 * rupee back to a stated number.
 */

export const COST_PER_DC_LAKH = 12.5; // ₹12.5 lakh per 60 kW DC fast charger
export const COST_PER_AC_LAKH = 1.8; // ₹1.8 lakh per 22 kW dual AC point
export const EVS_PER_PLUG = 24; // planning ratio: EVs supported per public plug
export const CR_IN_LAKH = 100;

export interface AssumptionRow {
  id: string;
  label: string;
  value: string;
  note: string;
}

export const ASSUMPTIONS: AssumptionRow[] = [
  {
    id: 'dc',
    label: 'DC fast charger unit cost',
    value: `₹${COST_PER_DC_LAKH} lakh`,
    note: '60 kW CCS2 plaza including civil work and grid interconnect.',
  },
  {
    id: 'ac',
    label: 'AC destination unit cost',
    value: `₹${COST_PER_AC_LAKH} lakh`,
    note: '7.4–22 kW Type-2 point for malls, hotels and workplaces.',
  },
  {
    id: 'plug',
    label: 'EVs supported per public plug',
    value: `${EVS_PER_PLUG} EVs`,
    note: 'Planning ratio used to translate charger counts into an addressable fleet.',
  },
  {
    id: 'cap',
    label: 'Budget conversion',
    value: '1 Cr = 100 lakh',
    note: 'Capex is reported in ₹ crore, rounded to the nearest crore.',
  },
  {
    id: 'horizon',
    label: 'Growth horizon',
    value: 'M3 gives 12 months',
    note: '6- and 24-month figures compound the 12-month growth rate; they are extrapolations, not new fits.',
  },
  {
    id: 'z',
    label: 'CDS scaling',
    value: 'Global z-scores',
    note: 'M1 and M3 are standardised across all 51 cities and are never rescaled when you filter.',
  },
];

export function costPerUnitLakh(dcPct: number): number {
  const dc = Math.min(Math.max(dcPct, 0), 100) / 100;
  return dc * COST_PER_DC_LAKH + (1 - dc) * COST_PER_AC_LAKH;
}

/** Units that a budget can actually pay for at a given hardware mix. */
export function affordableUnits(budgetCr: number, dcPct: number): number {
  const perUnit = costPerUnitLakh(dcPct);
  if (perUnit <= 0) return 0;
  return Math.max(0, Math.floor((budgetCr * CR_IN_LAKH) / perUnit));
}

/** Capex in ₹ crore for a number of units at a given DC share. */
export function capexCrFor(units: number, dcPct: number): number {
  return (units * costPerUnitLakh(dcPct)) / CR_IN_LAKH;
}
