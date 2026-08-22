// cadence-verdict.ts — the one prose assertion in the D2 report, COMPUTED from the rows it
// describes instead of typed beside them.
//
// WHY THIS FILE EXISTS. `hardware-floor-report.json` is a generated evidence artifact, and
// every number in it recomputes bit-exact from its own sweep. Exactly one statement in it was
// not computed: `verdict.cadenceIsUninformative` was a hard-coded string asserting "the
// 0-plant rung's rafP95 is HIGHER than the 171-plant rung's", and in the run that produced the
// file those two values are EQUAL (both 18.100000001490116). The measurement was real — four
// independent lines confirm it — and the only untrue statement in the artifact was the one a
// human wrote by hand, inside a file where no instrument checks prose.
//
// Correcting the string by hand would have reproduced the defect immediately: the 2026-08-21
// re-run of the same instrument reads the 0-plant rung LOWER than the island rung (18.5 vs
// 18.6), so a sentence saying "they are the same" would be false of that run in turn. A claim
// about the data has to be derived from the data or it is only ever true of one run.
//
// WHAT IS FIXED PROSE AND WHAT IS DERIVED. The closing claim — read `gpuMsPerFrame`, not the
// cadence — is a property of the METRIC, not of any run: rAF is vsync-capped, so it can only
// ever show 60 Hz being missed and can never show headroom. That stays fixed. Everything
// relational — which rung reads higher than which, and by how much — is measured here.
//
// NO CHOSEN TOLERANCE. The report's verdict is computed against its CONTROLS rather than
// against a picked threshold (an earlier draft scored rungs against `16.7 * 1.35`, where 1.35
// was a number selected because it made the answer come out). This module holds that line: the
// only threshold it uses is the noise floor the controls themselves establish.

/** One row of the plant-count sweep, reduced to the cadence columns this module reads. */
export interface CadenceRung {
  plants: number;
  /** Median presentation interval, ms. Vsync-capped. */
  rafP50: number;
  rafP95: number;
}

/** The blank-page control: the same quantity measured with no scene at all. */
export interface BlankControl {
  p50: number;
  p95: number;
}

export interface CadenceVerdictInput {
  sweep: readonly CadenceRung[];
  blankPage: BlankControl;
  /** The plant count the report calls the real-corpus island. */
  islandPlants: number;
}

/**
 * The floor below which a cadence reading is not a measurement of the scene: the worse of the
 * two ways to draw nothing — a blank page, and a rung with zero plants on it. Anything at or
 * under this is indistinguishable from an empty frame.
 */
export function cadenceNoiseFloorMs(input: CadenceVerdictInput): number {
  const empty = input.sweep.find((r) => r.plants === 0);
  return Math.max(input.blankPage.p95, empty ? empty.rafP95 : 0);
}

/** ms to the precision the report's own README quotes. */
function ms(value: number): string {
  return value.toFixed(1);
}

/** A weight ratio as a reader would say it: `10x`, `3.4x`. */
function ratio(heavier: number, lighter: number): string {
  const r = heavier / lighter;
  const fixed = r.toFixed(1);
  return `${fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed}x`;
}

/**
 * Describe what the cadence column did on THIS run, and why it is not the number to read.
 *
 * Returns a plain sentence for the report's `verdict.cadenceIsUninformative`. It never
 * throws: a sweep missing the rungs it wants gets a statement saying so, because a benchmark
 * that has already spent its run should write down what it has rather than lose the report.
 */
export function describeCadence(input: CadenceVerdictInput): string {
  const { sweep, blankPage, islandPlants } = input;
  const island = sweep.find((r) => r.plants === islandPlants);
  const empty = sweep.find((r) => r.plants === 0);

  if (!island || !empty) {
    return (
      `This sweep carries no ${!empty ? '0-plant' : `${islandPlants}-plant`} rung, so the ` +
      'cadence column cannot be compared against an empty scene. Read gpuMsPerFrame, not the ' +
      'cadence: the cadence can only ever show 60 Hz being MISSED, never how much room is left.'
    );
  }

  const floor = cadenceNoiseFloorMs(input);

  // 1. The median. Stated as a distance from the BLANK PAGE's own median, so the claim that it
  //    is the display interval rests on the control rather than on an assumed refresh rate.
  const worstP50Gap = Math.max(...sweep.map((r) => Math.abs(r.rafP50 - blankPage.p50)));
  const medianClause =
    `Every rung's rafP50 is within ${ms(worstP50Gap)} ms of the BLANK PAGE's ` +
    `${ms(blankPage.p50)} ms, so the median is the display interval and carries no scene.`;

  // 2. The island against the floor — the comparison D2 is actually about.
  const islandClause =
    island.rafP95 <= floor
      ? `The ${islandPlants}-plant island rung's rafP95 (${ms(island.rafP95)} ms) is AT the ` +
        `empty-scene noise floor of ${ms(floor)} ms — the reading a frame with nothing in it ` +
        'produces.'
      : `The ${islandPlants}-plant island rung's rafP95 (${ms(island.rafP95)} ms) sits ` +
        `${ms(island.rafP95 - floor)} ms above the empty-scene noise floor of ${ms(floor)} ms.`;

  // 3. Whether the column orders the rungs by weight at all. The telling shape is a HEAVIER
  //    rung sitting at the floor while a LIGHTER one reads above it — if that happens, the
  //    column is not tracking the scene, and it is the sweep that says so rather than us.
  const loaded = sweep.filter((r) => r.plants > 0);
  const atFloor = loaded.filter((r) => r.rafP95 <= floor);
  const aboveFloor = loaded.filter((r) => r.rafP95 > floor);
  const heaviestAtFloor = atFloor.reduce<CadenceRung | undefined>(
    (best, r) => (!best || r.plants > best.plants ? r : best),
    undefined,
  );
  const lightestAboveFloor = aboveFloor.reduce<CadenceRung | undefined>(
    (best, r) => (!best || r.plants < best.plants ? r : best),
    undefined,
  );

  const inverted =
    heaviestAtFloor && lightestAboveFloor && heaviestAtFloor.plants > lightestAboveFloor.plants;

  const orderClause = inverted
    ? `And the column does not order the rungs by weight: the ${heaviestAtFloor.plants}-plant ` +
      `rung also sits at that floor, while the ${lightestAboveFloor.plants}-plant rung — ` +
      `${ratio(heaviestAtFloor.plants, lightestAboveFloor.plants)} lighter — reads ` +
      `${ms(lightestAboveFloor.rafP95)} ms, above it.`
    : 'Across this sweep the p95 does rise with weight, but it is vsync-capped either way and ' +
      'can still only report a miss.';

  return (
    `${medianClause} ${islandClause} ${orderClause} Read gpuMsPerFrame, not the cadence: the ` +
    'cadence can only ever show 60 Hz being MISSED, never how much room is left.'
  );
}
