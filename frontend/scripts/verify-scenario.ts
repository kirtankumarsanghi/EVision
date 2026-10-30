/**
 * Dependency-free verification of the scenario engine.
 *
 * Run with: npm run verify:scenario
 *
 * Guards the two things that must never drift:
 *   1. the default weighting reproduces the published CDS exactly, and
 *   2. per-city allocations always sum to the requested unit total.
 */
import { buildScenario, DEFAULT_SCENARIO, verifyPublishedParity } from '../src/lib/scenario';
import hotspotsJson from '../src/data/snapshots/hotspots.json';
import featuresJson from '../src/data/snapshots/features.json';
import splitJson from '../src/data/snapshots/vehicle_split.json';

const hotspots: any = (hotspotsJson as any).rows ?? hotspotsJson;
const data = {
  hotspots,
  features: featuresJson as any,
  vehicleSplits: splitJson as any,
};

let failures = 0;
function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS  ${message}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${message}`);
  }
}

console.log('CDS parity');
const drift = verifyPublishedParity(hotspots);
check(drift < 1e-9, `default weighting reproduces published CDS (drift ${drift.toExponential(2)})`);

console.log('\nDefault scenario');
const base = buildScenario(DEFAULT_SCENARIO, data);
const baseSum = base.cities.reduce((a, c) => a + c.units, 0);
check(base.totals.units === DEFAULT_SCENARIO.targetUnits, `units equal target (${base.totals.units})`);
check(baseSum === base.totals.units, `per-city units sum exactly (${baseSum})`);
check(
  base.cities.slice(0, 5).map((c) => c.city).join(',') === 'Delhi,Bengaluru,Guwahati,Surat,Pune',
  'top five match the published ranking'
);
check(
  base.cities.every((c) => Math.abs(c.contributions.m1 + c.contributions.m2 + c.contributions.m3 - c.cds) < 1e-9),
  'weighted contributions sum to each city CDS'
);

console.log('\nAllocation strategies');
for (const strategy of ['balanced', 'deficit', 'growth', 'volume'] as const) {
  const r = buildScenario({ ...DEFAULT_SCENARIO, strategy }, data);
  const sum = r.cities.reduce((a, c) => a + c.units, 0);
  check(sum === r.totals.units, `${strategy} allocation sums exactly (${sum})`);
}

console.log('\nBudget guard');
const limited = buildScenario({ ...DEFAULT_SCENARIO, budgetCr: 200, targetUnits: 50000 }, data);
check(limited.totals.budgetLimited, 'over-budget target is flagged');
check(limited.totals.units === limited.totals.affordableUnits, 'deployment scales to the affordable count');

console.log('\nRequirements');
check(
  buildScenario({ ...DEFAULT_SCENARIO, measuredSplitOnly: true }, data).excluded.length === 9,
  'measured-split filter excludes the nine proxy cities'
);
check(
  buildScenario({ ...DEFAULT_SCENARIO, states: ['ZZ'] }, data).cities.length === 0,
  'impossible requirement yields an honest empty plan'
);
check(
  buildScenario({ ...DEFAULT_SCENARIO, segment: '4W' }, data).dcPct === 50,
  '4W focus shifts the hardware mix toward DC'
);

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
if (failures > 0) process.exitCode = 1;
