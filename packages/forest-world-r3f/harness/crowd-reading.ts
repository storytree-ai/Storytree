// crowd-reading.ts — CAN A READER STILL FIND THE FAILING ISLAND IN A CROWD, and do the props
// still read as objects at the size the crowd is delivered at?
//
// Two readings, and they answer different questions. Keeping them apart is the point:
//
//   TRUTH       the ADR-0392 D5 / ADR-0398 D7 fence — a treatment that reads beautifully and
//               misreports proof state is a REGRESSION. With 35 islands in six states, is the
//               one failing island still the most anomalous thing in the frame?
//   LEGIBILITY  is a prop still an OBJECT at the delivered size, or has it become texture?
//
// ⚠⚠ THE SECOND IS NOT ANSWERED BY THE FIRST, AND NEITHER IS ANSWERED BY A SEPARATION SCORE.
// A metric saying two islands' pixels differ says nothing about whether a reader can tell a
// proved island from a failing one, and a metric saying a dressing added colours says nothing
// about whether those colours read as conifers. The pictures are the primary evidence for
// legibility; what is computed here is the part that can be checked.
//
// Pure: no three, no DOM, no `node:`. Runs in the browser page and in `bun test`.

/**
 * CIE76 ΔE over sRGB.
 *
 * ⚠ WRITTEN HERE RATHER THAN IMPORTED, AND THE REASON IS OWNERSHIP, NOT IGNORANCE. The repo's
 * other ΔE lives in `status-vocabulary.ts` / `ground-cover.ts`, which a sibling session holds
 * open. This is a published standard rather than a transcription of anything in this repo — the
 * "hand-copied duplicate of its own subject" trap is copying the thing UNDER TEST, and the thing
 * under test here is a rendered frame, not a colour-space formula.
 */
export function deltaE76(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [l1, a1, b1] = rgbToLab(a);
  const [l2, a2, b2] = rgbToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

export function rgbToLab(rgb: readonly [number, number, number]): [number, number, number] {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(rgb[0]);
  const g = lin(rgb[1]);
  const b = lin(rgb[2]);
  // sRGB D65 -> XYZ, then XYZ -> Lab against the D65 white point.
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export interface IslandColour {
  index: number;
  status: string;
  needle: boolean;
  /** Mean delivered colour over this island's own opaque pixels. */
  rgb: [number, number, number];
  /** How many opaque pixels it delivered — a box that caught nothing is not a reading. */
  pixels: number;
}

/**
 * THE MEAN DELIVERED COLOUR of one island's box.
 *
 * ⚠ MEAN OVER EVERY OPAQUE PIXEL, PROPS INCLUDED — not over the ground alone. That is deliberate
 * and it is the whole risk being measured: the land's colour is what carries a capability's
 * status, and props STAND ON the land and hide it. A reading that carefully excluded the props
 * would be measuring a signal no reader receives, and would report the dressing as harmless by
 * construction.
 */
export function meanColour(
  rgba: Uint8Array | Uint8ClampedArray,
  bufW: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): { rgb: [number, number, number]; pixels: number } {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = (y * bufW + x) * 4;
      if (rgba[i + 3]! === 0) continue;
      r += rgba[i]!;
      g += rgba[i + 1]!;
      b += rgba[i + 2]!;
      n++;
    }
  }
  return n === 0 ? { rgb: [0, 0, 0], pixels: 0 } : { rgb: [r / n, g / n, b / n], pixels: n };
}

export type TruthVerdict = 'FOUND' | 'LOST' | 'UNVERIFIED';

export interface TruthReading {
  verdict: TruthVerdict;
  /** Why, in one sentence a reader can act on. */
  reason: string;
  /** The needle's rank by anomaly among all 35 — 1 means it is the most anomalous island. */
  needleRank: number;
  /** ΔE of the needle from the healthy population's median colour. */
  needleDE: number;
  /** The most anomalous HEALTHY island's ΔE — the bar, read off this same run's own population. */
  healthyMaxDE: number;
  /** How far clear of that bar the needle sits. Negative means a healthy island looks worse. */
  margin: number;
  /** The margin in units of the healthy population's own spread. */
  marginSigma: number;
  healthyCount: number;
  /**
   * The islands that read as MORE anomalous than the failing one, with their statuses.
   *
   * ⚠ THIS IS NOT A FAILURE, AND LEAVING IT OUT WOULD HAVE OVERSTATED THE VERDICT. `FOUND` says
   * the failing island stands clear of every HEALTHY one — it does not say it is the most
   * eye-catching thing in the frame. An `unknown` or a `building` island is legitimately a
   * different colour, so a reader scanning for "what looks odd" may land on one of those first
   * and then has to tell a different STATE from a failing one. Naming them is what lets a reader
   * of this report see that distinction instead of inferring a rank of 1.
   */
  outrankedBy: Array<{ index: number; status: string; de: number }>;
  /** How many of the islands handed in were actually IN FRAME and readable. */
  visibleCount: number;
  /** How many were handed in at all — so a partial view is visible as a partial view. */
  totalCount: number;
}

/**
 * CAN THE FAILING ISLAND BE PICKED OUT OF THE CROWD?
 *
 * ⚠⚠ THE BAR IS READ OFF THE SAME RUN'S OWN HEALTHY POPULATION, never off a number chosen here
 * (`pixel-threshold-reads-off-a-same-run-control`). The question a reader actually faces is not
 * "is this island's colour more than N from green" — it is "is anything in this forest anomalous,
 * and is the failing island the thing I land on first?" So the needle must be MORE anomalous than
 * every healthy island in the same picture, and the margin is quoted against the healthy
 * population's own spread.
 *
 * ⚠ WHAT MAKES IT ABLE TO FAIL. Give every island the same status and the needle is no longer
 * different from its neighbours; the margin goes to roughly zero or negative and this returns
 * LOST. That mutation is run by the driver and its refusal is committed — an instrument nobody
 * has seen refuse is not evidence.
 *
 * ⚠ AND IT REFUSES RATHER THAN GUESSING. Fewer than two healthy islands, or any island whose box
 * caught no pixels, gives UNVERIFIED — a verdict about the MEASUREMENT, which outranks a verdict
 * about the art (the three-verdict shape `frame-budget.ts` already uses on this arc).
 */
export function truthReading(colours: readonly IslandColour[]): TruthReading {
  // ⚠ ONLY THE ISLANDS ACTUALLY IN FRAME ARE READ, and the count is reported rather than folded
  // away. A zoomed-in view shows a NEIGHBOURHOOD, not the forest, so most boxes legitimately catch
  // nothing — refusing over that would make the reading mute exactly where a reader is looking
  // hardest. What it must still refuse is the case where NOTHING was caught, which is what a
  // mis-projected camera looks like, and that is the bug this guard actually found: the first run
  // of this page projected all 35 islands through a stale view matrix and every box came back
  // empty.
  const visible = colours.filter((c) => c.pixels > 0);
  const healthy = visible.filter((c) => c.status === 'healthy');
  const needle = visible.find((c) => c.needle);

  const empty = {
    needleRank: 0,
    needleDE: 0,
    healthyMaxDE: 0,
    margin: 0,
    marginSigma: 0,
    healthyCount: healthy.length,
    outrankedBy: [],
    visibleCount: visible.length,
    totalCount: colours.length,
  };
  if (visible.length === 0) {
    return {
      verdict: 'UNVERIFIED',
      reason: `none of the ${colours.length} island boxes caught a single opaque pixel — this is a reading about empty frame, not about the forest`,
      ...empty,
    };
  }
  if (!needle) {
    // Two different absences, and they are worth telling apart: a population nobody marked a
    // needle in is MALFORMED, while a needle that simply caught no pixels is off the edge of a
    // legitimately partial frame.
    return {
      verdict: 'UNVERIFIED',
      reason: colours.some((c) => c.needle)
        ? 'the failing island is not in this frame, so there is nothing here to pick it out of'
        : 'no needle island in the population — nothing was marked as the one to find',
      ...empty,
    };
  }
  if (healthy.length < 2) {
    return {
      verdict: 'UNVERIFIED',
      reason: `only ${healthy.length} healthy island(s) in frame — a bar cannot be read off a population this small`,
      ...empty,
    };
  }

  // The healthy MEDIAN per channel, not the mean: one wildly-off island should move the reference
  // as little as possible, since the reference is meant to be "what a healthy island looks like".
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  const reference: [number, number, number] = [
    med(healthy.map((c) => c.rgb[0])),
    med(healthy.map((c) => c.rgb[1])),
    med(healthy.map((c) => c.rgb[2])),
  ];

  const withDE = visible.map((c) => ({ ...c, de: deltaE76(c.rgb, reference) }));
  const needleDE = withDE.find((c) => c.needle)!.de;
  const healthyDEs = withDE.filter((c) => c.status === 'healthy').map((c) => c.de);
  const healthyMaxDE = Math.max(...healthyDEs);
  const mean = healthyDEs.reduce((s, d) => s + d, 0) / healthyDEs.length;
  const sigma = Math.sqrt(healthyDEs.reduce((s, d) => s + (d - mean) ** 2, 0) / healthyDEs.length);
  const needleRank = 1 + withDE.filter((c) => c.de > needleDE).length;
  const margin = needleDE - healthyMaxDE;

  return {
    verdict: margin > 0 ? 'FOUND' : 'LOST',
    reason:
      margin > 0
        ? `the failing island is the most anomalous of the ${visible.length} in frame, ${margin.toFixed(2)} dE clear of the worst healthy one`
        : `a HEALTHY island reads as more anomalous than the failing one (${(-margin).toFixed(2)} dE the wrong way) — a reader hunting for the failure lands on a green island first`,
    needleRank,
    needleDE,
    healthyMaxDE,
    margin,
    marginSigma: sigma > 0 ? margin / sigma : 0,
    healthyCount: healthy.length,
    outrankedBy: withDE
      .filter((c) => c.de > needleDE)
      .sort((a, b) => b.de - a.de)
      .map((c) => ({ index: c.index, status: c.status, de: c.de })),
    visibleCount: visible.length,
    totalCount: colours.length,
  };
}

/**
 * ARE THE ISLANDS STILL SEPARATE THINGS? Connected components of opaque pixels in the delivered
 * frame — the direct form of "turns to soup". Thirty-five islands that deliver thirty-five blobs
 * are thirty-five islands; a crowd that delivers four has merged into a mass.
 *
 * ⚠ IT COUNTS BLOBS BIG ENOUGH TO BE AN ISLAND. A stray anti-aliased pixel is not a thirty-sixth
 * island, and the floor is stated as a share of the smallest island box rather than as a pixel
 * count someone picked.
 */
export interface BlobReading {
  /** Separated opaque regions big enough to be an island. */
  blobs: number;
  /** Pixels in the biggest of them. */
  largest: number;
}

export function countIslandBlobs(
  rgba: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  minPixels: number,
): BlobReading {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  let blobs = 0;
  let largest = 0;
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || rgba[s * 4 + 3]! === 0) continue;
    stack.push(s);
    seen[s] = 1;
    let n = 0;
    while (stack.length > 0) {
      const p = stack.pop()!;
      n++;
      const x = p % w;
      const y = (p / w) | 0;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && !seen[q] && rgba[q * 4 + 3]! !== 0) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (n >= minPixels) {
      blobs++;
      largest = Math.max(largest, n);
    }
  }
  return { blobs, largest };
}

/** The ~10 device-pixel floor below which a mark stops reading as an object and becomes texture.
 *  It is `kit-vocabulary.ts`'s own floor, restated as a number this module can quote in a report. */
export const OBJECT_FLOOR_PX = 10;

export interface PropLegibility {
  role: string;
  worldSize: number;
  axis: 'height' | 'width';
  deliveredPx: number;
  clears: boolean;
}

/**
 * WHAT A PROP DELIVERS AT A GIVEN ZOOM, and whether that is still an object.
 *
 * ⚠ WIDTH DOES NOT FORESHORTEN AT THIS CAMERA AND HEIGHT DOES, by cos(50°) = 0.643. Applying the
 * foreshortening to both would under-report every width-sized prop by 36% — and `kit-vocabulary.ts`
 * already had to learn this the expensive way in the other direction, when a flat bloom scaled by
 * its HEIGHT was delivered 8.2 ground units across, as wide as a whole pine's canopy. The axis is
 * declared, never inferred; it defaults to `height`, which is the conservative half.
 *
 * ⚠ THE FLOOR IS RE-ASKED AT THE CROWD'S OWN SCALE, and that is the whole point. `clearsObjectFloor`
 * answers this question at the one-island overview, where a tree is 23 px. A whole-forest view is
 * further back, so the same prop delivers fewer pixels — and a prop under the floor has stopped
 * being a conifer and become speckle, whatever it looked like on its own island.
 */
export function propLegibility(
  roles: ReadonlyArray<{ role: string; worldSize: number; axis?: 'height' | 'width' }>,
  pxPerUnit: number,
  elevRad: number,
): PropLegibility[] {
  return roles.map(({ role, worldSize, axis = 'height' }) => {
    const deliveredPx = axis === 'height' ? worldSize * Math.cos(elevRad) * pxPerUnit : worldSize * pxPerUnit;
    return { role, worldSize, axis, deliveredPx, clears: deliveredPx >= OBJECT_FLOOR_PX };
  });
}
