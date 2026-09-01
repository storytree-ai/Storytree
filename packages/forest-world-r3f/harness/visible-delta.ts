// visible-delta.ts — THE ADR-0490 D6 METRIC, as ONE committed instrument: how much of a frame a
// reader can actually see move, reported as a MAGNITUDE DISTRIBUTION rather than a count. Pure,
// browser-free and bun/node-test-provable, fenced into `harness/` with the rest of the experiment.
//
// ⚠⚠ WHY IT EXISTS. ADR-0490 D6 retired the touched-pixel count as a headline in favour of pixels
// moving more than 20/255, after the count was found to overstate two increments roughly fourfold
// — caught by the OWNER, by eye, before any recompute. That rule was PROSE. No committed
// instrument implemented it, so every comparison page re-wrote the comparison by hand and the next
// one could quietly regress to the old metric; one session has already been caught about to ship a
// touched-pixel headline after the rule landed.
//
// AND IT WAS ALREADY DUPLICATED FOUR WAYS, which is the measurable form of the problem. The
// increment named two; reading at HEAD found four, and the two extra copies are the ones no test
// could ever have reached:
//
//   harness/shipped-grass-scene.ts:242    export const VISIBLE_DELTA = 20   + its own differing()
//   harness/shipped-skirt-scene.ts:494    export const VISIBLE_DELTA = 20   + its own differing()
//   harness/shipped-grass-measure.mjs:64  const VISIBLE_DELTA = 20          (prose only)
//   harness/shipped-skirt-measure.mjs:66  const VISIBLE_DELTA = 20          (prose only)
//
// Four spellings of one authored threshold is how two pages stop agreeing without anyone editing
// either — and the two driver copies are worse than the scene copies rather than merely more of
// them, because they appear only inside REPORT SENTENCES. A driver whose prose says "20" over a
// page that moved to 30 prints a false claim about a true number, and no assertion in this
// repository looks at prose.
//
// ⚠⚠ THE TWO FAILURE DIRECTIONS, AND WHY THE ANSWER IS A DISTRIBUTION RATHER THAN A BETTER SCALAR.
// This arc has now been bitten from BOTH sides by scalars, and the second one is the trap a
// reasonable person walks into while fixing the first:
//
//   COUNT OVERSTATES.  `touched` scores a 1/255 shift identically to a 164/255 one. Recomputing
//                      the two misjudged increments by magnitude showed no pixel had moved more
//                      than 37/255 with a typical move of 8 — every one of them sub-threshold.
//   SPREAD UNDERSTATES. The obvious substitute fails in the OPPOSITE direction: raw RGB standard
//                      deviation is 33.8 for BOTH the shipped and the approved picture, identical
//                      to one decimal. A spread metric calls them the same image.
//
// A bare count over a threshold discards exactly the information whose absence made the touched
// count misleading, so replacing one scalar with another scalar reproduces the fault at a
// different offset. What this module reports is therefore the whole shape: how many pixels moved,
// how far each of them moved, and what share of the movement sits on either side of the cited bar.
//
// ⚠ AND A DISTRIBUTION HERE IS A DISTRIBUTION OF MOVEMENT, NEVER A SPREAD OF COLOUR. The two are
// different questions and the second is the one that returned 33.8 twice. Nothing in this file
// measures a property of ONE frame; every figure is a property of the PAIR. `pixel-metrics.ts`
// owns the single-frame statistics and is the right place to look for those — importing MICRO,
// STRUCT or the colour counts and calling the result a visibility verdict is the substitution this
// comment exists to refuse.
//
// THE RUNGS, AND THEIR ORDER IS THE POINT — the same shape `land-floor.ts` uses for frame cost,
// because the same fault class reaches a pixel comparison:
//
//   1. VOIDNESS     — the frames are not comparable, or are not two frames at all. Nothing may be
//                     concluded. UNVERIFIED.
//   2. SENSITIVITY  — the instrument must PROVE, in this same run and on this run's own pixels,
//                     that it resolves the cited boundary: a move of 21 must read as visible and a
//                     move of 20 must not. If it cannot, a small reading on the real pair is not
//                     evidence the arms look alike — it is the same null a blind instrument
//                     returns. UNVERIFIED.
//   3. THE READING  — only now. The distribution.
//
// ⚠⚠ RUNG 2 IS WHAT MAKES THE OTHER TWO WORTH HAVING, and neither page had it. Without it,
// "these two arms look the same" and "this comparison never saw two different frames" produce the
// SAME report — `visible: 0` — and the second one reads as reassurance. That is not hypothetical
// on this arc: `comparison-baseline-moves-under-the-page` records a control arm going stale under
// a sibling merge, whose symptom was byte-identical numbers on a re-run.
//
// ⚠ WHAT THIS DELIBERATELY DOES NOT OWN: A LAND MASK. Both pages already carry their own
// denominator — `familyCensus().land` masks on the painted background, `cliffPixels()` differences
// against the control arm — and they are defined differently ON PURPOSE, because a cliff and an
// island are not the same population. A third, differently-defined land mask living in here is
// precisely how two instruments quietly disagree, which is the fault `pixel-metrics.ts`'s own
// header records paying for. So the counts below are absolute counts over the compared frame, and
// `frame` is reported beside them so a caller can take whichever share is right for its page.

/**
 * THE THRESHOLD, CITED AND NOT CHOSEN — ADR-0490 D6. A pixel is credited as visible when its
 * largest channel move exceeds this. Strictly exceeds: a move of exactly this much is NOT visible,
 * and {@link sensitivityReasons} proves that boundary on every run rather than trusting it.
 *
 * ⚠ THIS IS NOW THE ONLY DECLARATION. Three others existed when this module landed and were
 * deleted rather than left agreeing; `visible-delta.test.ts` fences the file count so a fourth
 * cannot reappear quietly.
 */
export const VISIBLE_DELTA = 20;

/**
 * HOW FAR THE SENSITIVITY PROBE MOVES A PIXEL — one above the bar, and deliberately the LEAST
 * generous amount that must still register.
 *
 * ⚠ DERIVED, NOT AUTHORED, and the derivation is the whole point. Any larger amplitude weakens the
 * rung: a probe that shifts every channel by 100 is passed by a comparator that has lost its
 * threshold entirely, so it would prove only that the pixels reached the arithmetic. The smallest
 * integer strictly above the cited bar is the hardest case the rule admits, so it is the one that
 * proves the instrument resolves the RULE rather than merely sees movement. This neighbourhood has
 * already paid for an authored constant: an earlier `hardware-floor.mjs` scored rungs against
 * `16.7 * 1.35`, and its own comment records 1.35 as "a number picked to make the answer come out".
 */
export const SENSITIVITY_MOVE = VISIBLE_DELTA + 1;

/** RGBA bytes, however the capture path delivered them. `getImageData` hands back a
 *  `Uint8ClampedArray`; a `readPixels` route hands back a `Uint8Array`. */
export type Frame = Uint8Array | Uint8ClampedArray;

/** One rung of the magnitude ladder: pixels whose largest channel moved into `[from, to]`. */
export interface MagnitudeBand {
  /** Inclusive lower bound of the move, in 0..255 channel units. */
  from: number;
  /** Inclusive upper bound. */
  to: number;
  /** How this band reads in a report — e.g. `sub-threshold` or `2-4x`. */
  label: string;
  /** Whether every move in this band clears {@link VISIBLE_DELTA}. Exactly one band sits below
   *  the bar, by construction of the ladder. */
  visible: boolean;
  pixels: number;
  /** This band's share of the pixels that moved AT ALL, 0..1. Zero when nothing moved. */
  shareOfMoved: number;
}

export interface VisibleDeltaReading {
  /** Pixels compared — the two frames' shared size. */
  frame: number;
  /**
   * Pixels that moved at all.
   *
   * ⚠ CONTEXT ONLY. ADR-0490 D6 forbids this number carrying a verdict, and it is returned so a
   * report can print the OVERSTATEMENT beside the headline rather than so a report can quote it.
   */
  touched: number;
  /** Pixels that moved by MORE than {@link VISIBLE_DELTA}. The headline. */
  visible: number;
  /**
   * `touched / visible` — how many times larger the retired metric would have read.
   *
   * ⚠ THIS IS THE FIGURE THE OWNER CAUGHT BY EYE, made first-class so the next session sees it
   * instead of rediscovering it. `null` when nothing is visible, because the ratio is unbounded
   * there and a large finite number would understate a total absence of visible movement.
   */
  overstatement: number | null;
  /** The magnitude ladder. Bands partition 1..255 with no gap and no overlap. */
  bands: readonly MagnitudeBand[];
  /** Median move over the pixels that MOVED. Zero when nothing moved. */
  p50: number;
  p90: number;
  p99: number;
  /** The largest single-pixel move in the frame. */
  max: number;
}

/**
 * HOW THE SENSITIVITY RUNG READS A PAIR. Defaults to {@link visibleDeltaDistribution}; a test
 * injects a deliberately broken one to prove the rung FIRES, which is the only way to know a
 * refusal branch works before the day it has to.
 */
export type DeltaReader = (a: Frame, b: Frame, threshold: number) => VisibleDeltaReading;

export type VisibleDeltaStatus = 'READ' | 'UNVERIFIED';
export type VisibleDeltaRung = 'VOIDNESS' | 'SENSITIVITY' | 'READING';

export interface VisibleDeltaVerdict {
  status: VisibleDeltaStatus;
  /** Which rung produced the status. `READING` means the run got all the way to the question. */
  rung: VisibleDeltaRung;
  /** The distribution. `null` unless the status is `READ` — an unverified run has no reading,
   *  rather than a reading of zero. */
  reading: VisibleDeltaReading | null;
  /** Why nothing may be concluded. Empty unless UNVERIFIED. */
  unverified: string[];
  /** Things that are not refusals but that a reader must not skim past — chiefly two
   *  byte-identical frames, which is what a stale control looks like. */
  suspicions: string[];
  /** The sentence a report prints, DERIVED rather than typed. `cadence-verdict.ts` exists because
   *  a hand-written sentence in a sibling report was false while every computed number in it held
   *  up. */
  prose: string;
}

/**
 * THE ONE PIXEL WALK — the largest of the three channel moves at pixel `i`.
 *
 * Alpha is deliberately excluded. Every frame these pages compare is opaque (the sea is painted),
 * so an alpha term contributes nothing here; and where it is not opaque, a pixel appearing over a
 * transparent one is a change the COLOUR channels already record.
 */
export function channelMove(a: Frame, b: Frame, i: number): number {
  const dr = Math.abs(a[i]! - b[i]!);
  const dg = Math.abs(a[i + 1]! - b[i + 1]!);
  const db = Math.abs(a[i + 2]! - b[i + 2]!);
  return Math.max(dr, Math.max(dg, db));
}

/**
 * THE MAGNITUDE LADDER, DERIVED FROM THE CITED THRESHOLD — never a hand-picked set of buckets.
 *
 * The first band is `[1, T]`: pixels that moved but did not clear the bar. That band is not a
 * rounding convenience — it is exactly the population whose inclusion made the touched count
 * overstate, so a report that shows it shows the error rather than describing it.
 *
 * Above the bar the ladder doubles — `(T, 2T]`, `(2T, 4T]`, … — and terminates at 255 because a
 * channel cannot move further than its own range. So both the base and the ceiling are given
 * rather than selected, and the only judgement left is the doubling, which is the one step that
 * carries no scale of its own.
 */
export function magnitudeBands(threshold: number = VISIBLE_DELTA): MagnitudeBand[] {
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 254) {
    throw new Error(`visible-delta: a threshold of ${threshold} has no ladder; use an integer 1..254`);
  }
  const out: MagnitudeBand[] = [];
  out.push({ from: 1, to: threshold, label: 'sub-threshold', visible: false, pixels: 0, shareOfMoved: 0 });
  let lower = threshold;
  let multiple = 1;
  while (lower < 255) {
    const uncapped = threshold * multiple * 2;
    const upper = Math.min(uncapped, 255);
    // ⚠ THE TOP BAND IS LABELLED `over Nx` RATHER THAN `N-2Nx` WHEN THE CHANNEL RANGE CUT IT
    // SHORT. At the cited threshold the last rung would otherwise read `8-16x` while a channel
    // cannot move further than 12.75x the bar — a label naming a magnitude the picture cannot
    // reach, which is a small lie of exactly the kind this module exists to stop printing.
    out.push({
      from: lower + 1,
      to: upper,
      label: upper < uncapped ? `over ${multiple}x` : `${multiple}-${multiple * 2}x`,
      visible: true,
      pixels: 0,
      shareOfMoved: 0,
    });
    lower = upper;
    multiple *= 2;
  }
  return out;
}

/** Which band a move of `d` belongs to, or `-1` when it did not move. Named rather than inlined:
 *  the mutation rung cannot attribute a mutant inside an inline arrow body to the test that kills
 *  it. */
function bandOf(bands: readonly MagnitudeBand[], d: number): number {
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i]!;
    if (d >= band.from && d <= band.to) return i;
  }
  return -1;
}

/** The `p`-th percentile of a 0..255 move histogram, over the moved pixels only. Computed from
 *  the histogram rather than a sort: exact, and O(256) instead of O(n log n) on a 1.8-Mpx frame. */
function percentileOfMoved(histogram: Uint32Array, moved: number, p: number): number {
  if (moved === 0) return 0;
  const target = Math.ceil((moved * p) / 100);
  let cum = 0;
  for (let d = 1; d <= 255; d++) {
    cum += histogram[d]!;
    if (cum >= target) return d;
  }
  return 255;
}

/**
 * THE READING — one pass over the pair, producing the whole distribution.
 *
 * ⚠ THROWS on frames that cannot be compared rather than returning a zero, because a zero here is
 * indistinguishable from "the arms look identical", which is the reading this whole module exists
 * to stop being manufactured. Callers that want that stated as a verdict rather than an exception
 * should use {@link visibleDeltaVerdict}, which asks {@link voidnessReasons} first.
 */
export function visibleDeltaDistribution(
  a: Frame,
  b: Frame,
  threshold: number = VISIBLE_DELTA,
): VisibleDeltaReading {
  if (a.length !== b.length) {
    throw new Error(
      `visible-delta: frames of ${a.length} and ${b.length} bytes are not comparable`,
    );
  }
  if (a.length === 0 || a.length % 4 !== 0) {
    throw new Error(`visible-delta: ${a.length} bytes is not a non-empty RGBA buffer`);
  }

  const bands = magnitudeBands(threshold);
  const histogram = new Uint32Array(256);
  let touched = 0;
  let visible = 0;
  let max = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = channelMove(a, b, i);
    if (d === 0) continue;
    histogram[d]! += 1;
    touched += 1;
    if (d > threshold) visible += 1;
    if (d > max) max = d;
  }

  for (let d = 1; d <= 255; d++) {
    const count = histogram[d]!;
    if (count === 0) continue;
    const idx = bandOf(bands, d);
    if (idx >= 0) bands[idx]!.pixels += count;
  }
  if (touched > 0) {
    for (const band of bands) band.shareOfMoved = band.pixels / touched;
  }

  return {
    frame: a.length / 4,
    touched,
    visible,
    overstatement: visible === 0 ? null : touched / visible,
    bands,
    p50: percentileOfMoved(histogram, touched, 50),
    p90: percentileOfMoved(histogram, touched, 90),
    p99: percentileOfMoved(histogram, touched, 99),
    max,
  };
}

/**
 * THE SENSITIVITY PROBE — a copy of `frame` in which EVERY pixel's every colour channel has moved
 * by exactly `by`.
 *
 * ⚠⚠ IT MOVES EACH CHANNEL AWAY FROM ITS NEARER END, and the naive `v + by` is wrong in the
 * direction that looks like working code. A channel already at 250 shifted by +21 CLAMPS to 255
 * and moves only 5, so a probe built by adding would fail its own rung on a bright frame and the
 * failure would read as a broken instrument rather than a broken probe. Sending each channel away
 * from whichever end it is nearer keeps every move exact for any `by` up to 128, which is what
 * lets the rung below assert an EXACT pixel count instead of a tolerance.
 *
 * Alpha is copied untouched: {@link channelMove} does not read it, and moving it would make the
 * probe differ from the thing it is a probe for.
 */
export function amplifyBy(frame: Frame, by: number): Uint8ClampedArray {
  if (by < 1 || by > 128) {
    throw new Error(`visible-delta: a probe of ${by} cannot move every channel exactly; use 1..128`);
  }
  const out = new Uint8ClampedArray(frame.length);
  for (let i = 0; i < frame.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = frame[i + c]!;
      out[i + c] = v < 128 ? v + by : v - by;
    }
    out[i + 3] = frame[i + 3]!;
  }
  return out;
}

/**
 * RUNG 1 — are these two frames comparable at all?
 *
 * Every entry is a property of the CAPTURE rather than of the picture, which is why it outranks
 * the sensitivity rung: a pair that is not two frames has nothing for a sensitivity probe to be
 * about.
 */
export function voidnessReasons(a: Frame, b: Frame): string[] {
  const out: string[] = [];
  if (a.length === 0 || b.length === 0) {
    out.push('one of the frames is empty — nothing was captured to compare');
    return out;
  }
  if (a.length !== b.length) {
    out.push(
      `the frames hold ${a.length} and ${b.length} bytes. Two pictures of different sizes are ` +
        'not comparable, and a per-pixel difference between them is not a statement about either',
    );
  }
  if (a.length % 4 !== 0) {
    out.push(`the arm holds ${a.length} bytes, which is not a whole number of RGBA pixels`);
  }
  // ⚠⚠ THE ALIASING CASE, AND IT IS THE ONE THAT FAILS SILENTLY. Both pages read their pixels
  // through a memoising `pixels(arm, size, zoom)`; a key collision hands the SAME array back for
  // two different arms, every delta is 0, and the page reports "these arms look identical" — a
  // null manufactured by the cache. Object identity catches it exactly and costs nothing.
  if (a === b) {
    out.push(
      'both arms were handed the SAME buffer object, so every difference is zero by construction ' +
        'rather than by measurement — the reading would say the arms look identical when nothing ' +
        'compared two frames at all',
    );
  }
  return out;
}

/**
 * RUNG 2 — can this instrument resolve the RULE, on this run's own pixels?
 *
 * It builds two probes out of the control frame it was handed and requires BOTH limbs, because the
 * cited rule has two sides and only checking one of them leaves the commonest arithmetic slip
 * alive:
 *
 *   +21 must be VISIBLE on every pixel      — catches a comparison that never saw two frames, a
 *                                             readback that returned nothing, a threshold that
 *                                             drifted upward.
 *   +20 must be TOUCHED and NOT visible     — catches `>=` where the rule says `>`, and a
 *                                             threshold that drifted downward. Without this limb
 *                                             an off-by-one at the bar passes every time, and it
 *                                             is an off-by-one AT THE BAR that decides whether a
 *                                             marginal layer is reported as seen.
 *
 * ⚠ THE BAR IS AN EXACT PIXEL COUNT, NOT A TOLERANCE, and it can be because {@link amplifyBy}
 * moves every channel by exactly `by`. The test of an honest bar is where a number picked to PASS
 * would have sat — at "most pixels", or at a probe amplitude far above the threshold — and both
 * are configurations that cannot fail.
 *
 * ⚠⚠ WHAT THIS RUNG CANNOT DO, STATED SO IT IS NOT READ AS DOING IT. Both probes are derived FROM
 * the threshold, so the rung proves the instrument RESOLVES the bar it is applying — never that
 * the bar is the number ADR-0490 D6 states. Move the threshold to 40 and this rung passes happily
 * at 40. That second claim is not left unmade, it is made somewhere a rung cannot reach it:
 * `visible-delta.test.ts` pins {@link VISIBLE_DELTA} to the decision's own 20, and fences the
 * harness to ONE declaration of it. The two together are the whole guarantee, and neither half is
 * sufficient alone.
 *
 * `read` is a seam so the rung can be shown to FIRE rather than only to pass — a rung whose
 * failure branch is never exercised is a rung nobody has evidence works.
 */
export function sensitivityReasons(
  control: Frame,
  threshold: number = VISIBLE_DELTA,
  read: DeltaReader = visibleDeltaDistribution,
): string[] {
  const out: string[] = [];
  if (control.length === 0 || control.length % 4 !== 0) return out;
  const pixels = control.length / 4;
  // ⚠ A THRESHOLD TOO HIGH TO PROBE IS A REFUSAL, NOT A THROW. `amplifyBy` can only move every
  // channel exactly up to 128, so a bar at or above that cannot be probed at all — and the honest
  // report is that this run could not have verified itself, which is what an UNVERIFIED rung says.
  // Throwing would surface the same fact as a crash in whichever page happened to call it.
  if (threshold + 1 > 128) {
    out.push(
      `a bar of ${threshold}/255 cannot be probed: moving every channel one unit past it would ` +
        'clamp at the ends of the range, so this run cannot prove it resolves its own threshold',
    );
    return out;
  }

  const above = read(control, amplifyBy(control, threshold + 1), threshold);
  if (above.visible !== pixels) {
    out.push(
      `a probe moving every channel by ${threshold + 1}/255 — one MORE than the bar — registered ` +
        `${above.visible} of ${pixels} pixels as visible. This run therefore cannot see movement ` +
        'it is told is there, and a small reading on the real pair is not evidence the arms look ' +
        'alike: it is the same null a blind instrument returns',
    );
  }

  const at = read(control, amplifyBy(control, threshold), threshold);
  if (at.touched !== pixels || at.visible !== 0) {
    out.push(
      `a probe moving every channel by exactly ${threshold}/255 — the bar itself, which ADR-0490 ` +
        `D6 does NOT credit — registered ${at.touched} of ${pixels} touched and ${at.visible} ` +
        'visible, where the rule requires all of them touched and none of them visible. The ' +
        'threshold this run applied is not the threshold the decision states',
    );
  }
  return out;
}

/** The sentence the report prints. Derived from the reading, never typed alongside it. */
export function visibleDeltaProse(
  status: VisibleDeltaStatus,
  rung: VisibleDeltaRung,
  reading: VisibleDeltaReading | null,
  threshold: number = VISIBLE_DELTA,
): string {
  if (status === 'UNVERIFIED' || reading === null) {
    return (
      `UNVERIFIED at the ${rung} rung — nothing may be concluded about how much of this frame a ` +
      'reader can see move'
    );
  }
  const share = reading.frame === 0 ? 0 : (reading.visible / reading.frame) * 100;
  const over =
    reading.overstatement === null
      ? 'the retired touched count would have reported movement where none is visible at all'
      : `the retired touched count would have read ${reading.overstatement.toFixed(1)}x higher`;
  return (
    `${reading.visible} of ${reading.frame} px moved by more than ${threshold}/255 ` +
    `(${share.toFixed(2)}% of the frame); typical move ${reading.p50}/255, largest ` +
    `${reading.max}/255. ${reading.touched} px moved at all, so ${over} (ADR-0490 D6)`
  );
}

/**
 * THE WHOLE INSTRUMENT — rungs in order, then the reading.
 *
 * `control` is both the frame `arm` is differenced against AND the pixels the sensitivity probes
 * are built from, deliberately: a probe made of synthetic pixels would prove the arithmetic works
 * on synthetic pixels, where the failures this rung is for are properties of the frames this run
 * actually captured.
 */
export function visibleDeltaVerdict(
  arm: Frame,
  control: Frame,
  threshold: number = VISIBLE_DELTA,
): VisibleDeltaVerdict {
  const voidness = voidnessReasons(arm, control);
  if (voidness.length > 0) {
    return {
      status: 'UNVERIFIED',
      rung: 'VOIDNESS',
      reading: null,
      unverified: voidness,
      suspicions: [],
      prose: visibleDeltaProse('UNVERIFIED', 'VOIDNESS', null, threshold),
    };
  }

  const sensitivity = sensitivityReasons(control, threshold);
  if (sensitivity.length > 0) {
    return {
      status: 'UNVERIFIED',
      rung: 'SENSITIVITY',
      reading: null,
      unverified: sensitivity,
      suspicions: [],
      prose: visibleDeltaProse('UNVERIFIED', 'SENSITIVITY', null, threshold),
    };
  }

  const reading = visibleDeltaDistribution(arm, control, threshold);
  const suspicions: string[] = [];
  // ⚠⚠ BYTE-IDENTICAL IS A SUSPICION, NOT A RESULT, and this is the shape a stale control has.
  // `comparison-baseline-moves-under-the-page`: the skirt's page built its own scene, a sibling
  // landed, its CONTROL arm quietly became the map as it stood an hour earlier — and the symptom
  // was numbers that did not move, which reads as reassurance. `run-agreement.ts` reports the same
  // shape the same way for two whole sweeps, so the two instruments hold ONE idea of what a
  // suspiciously perfect zero means rather than two.
  if (reading.touched === 0) {
    suspicions.push(
      'the two frames are BYTE-IDENTICAL. For two independently rendered arms that is near ' +
        'impossible, and the likelier causes are a stale control, a cache that answered both ' +
        'reads, or an arm whose option never reached the material — check the arms differ before ' +
        'reporting that they look alike',
    );
  }
  return {
    status: 'READ',
    rung: 'READING',
    reading,
    unverified: [],
    suspicions,
    prose: visibleDeltaProse('READ', 'READING', reading, threshold),
  };
}
