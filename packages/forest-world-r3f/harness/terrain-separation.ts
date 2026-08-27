// terrain-separation.ts — CAN A READER TELL TWO TERRAINS APART, when colour cannot help?
//
// THE QUESTION THIS EXISTS FOR. ADR-0462 settled the colour vocabulary at five colours over six
// states, so `proposed` and `building` wear the SAME token. Every existing separation
// instrument in this repo measures COLOUR distance — `ground-cover.ts`'s matched-condition
// separation, `status-vocabulary.ts`'s cross-rung ladder, `shadow-ladder.ts`'s reader model —
// and every one of them correctly reports those two states as ZERO apart. They are not wrong;
// they are measuring the channel that has nothing left to say. This module measures the other
// one.
//
// ⚠⚠ IT IS A THIRD INSTRUMENT AND THAT IS DELIBERATE, NOT DUPLICATION. `ground-cover.ts`'s
// header and `land-colour-vocabulary-is-five-over-six` both warn against writing a second
// colour-distance function, and this is not one: it never looks at hue at all. Pick between
// them by the question — "can a reader tell these two COLOURS apart?" is `ground-cover.ts`;
// "can LIGHTING slide one onto the other?" is `status-vocabulary.ts`; "is this the same LAND?"
// is here.
//
// WHAT IT MEASURES. The delivered image's DIRECTIONAL GRADIENT ENERGY at four orientations,
// normalised to a unit sum. A land of rows spends its gradient across the rows and almost none
// along them; an undirected mottle spends it evenly. That signature is invariant to the token
// by construction — it is computed on luma differences, so scaling every pixel's colour scales
// numerator and denominator alike — which is exactly the property needed for a pair that shares
// a colour.
//
// ⚠⚠ THE BAR IS READ OFF A CONTROL IN THE SAME RUN, NEVER PICKED. Two terrains count as
// separated when the distance BETWEEN their signatures exceeds the spread WITHIN each of them —
// the spread measured across sub-regions of the same island, in the same frame, under the same
// light. That is the house pattern (`frame-budget.ts`, `capture.mjs`'s holes instrument,
// `cover-measure.mjs`, `status-vocabulary.ts`) and it exists here for a sharper reason than
// usual: `grain-picture-is-renderer-specific` measured that a QUARTER of grained pixels land on
// a different ladder rung between SwiftShader and an RTX 2060. Any absolute threshold over
// grained land would be one machine's threshold and would red on every other. A within-run
// ratio survives that, because both arms move together.

/** The four orientations sampled, in the order {@link signatureOf} returns them. Horizontal
 *  means the gradient is measured ALONG the image's x axis, i.e. it responds to VERTICAL
 *  edges — the naming trap this comment exists to defuse. */
export const ORIENTATIONS = ['dx', 'dy', 'diagA', 'diagB'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** A land's directional fingerprint: four non-negative numbers summing to 1. */
export type Signature = readonly [number, number, number, number];

/** ITU-R BT.601 luma, the same weighting `ground-cover.ts` uses for colour distance — so the
 *  two instruments at least agree about what "brighter" means even though they ask different
 *  questions. */
export function lumaOf(r: number, g: number, b: number): number {
  return 0.3 * r + 0.59 * g + 0.11 * b;
}

/** A rectangular region of an RGBA buffer. */
export interface Region {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The directional signature of a region's OPAQUE pixels.
 *
 * ⚠ OPAQUE ONLY, AND THE ALPHA TEST IS LOAD-BEARING. The water around an island is transparent;
 * counting the island's silhouette edge against it would dominate every reading and would
 * measure the island's SHAPE, which is identical in every panel, instead of its ground. Every
 * sample requires BOTH pixels of the pair to be opaque.
 *
 * Returns `null` when the region carries too few opaque pairs to say anything — which is a
 * refusal, not a zero. A signature of zeros would read as a legitimate flat measurement.
 */
export function signatureOf(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  region?: Region,
): Signature | null {
  const x0 = Math.max(1, region?.x0 ?? 1);
  const y0 = Math.max(1, region?.y0 ?? 1);
  const x1 = Math.min(width - 1, region?.x1 ?? width - 1);
  const y1 = Math.min(height - 1, region?.y1 ?? height - 1);

  const sums = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];
  const at = (x: number, y: number): number | null => {
    const i = (y * width + x) * 4;
    if ((data[i + 3] ?? 0) < 128) return null;
    return lumaOf(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
  };

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const c = at(x, y);
      if (c === null) continue;
      const neighbours: [number, number][] = [
        [x + 1, y],
        [x, y + 1],
        [x + 1, y + 1],
        [x + 1, y - 1],
      ];
      for (let k = 0; k < 4; k++) {
        const n = neighbours[k]!;
        const v = at(n[0], n[1]);
        if (v === null) continue;
        sums[k] = (sums[k] ?? 0) + Math.abs(v - c);
        counts[k] = (counts[k] ?? 0) + 1;
      }
    }
  }

  const means = sums.map((s, k) => (counts[k]! > 0 ? s / counts[k]! : 0));
  const total = means.reduce((a, b) => a + b, 0);
  const sampled = counts.reduce((a, b) => a + b, 0);
  if (sampled < 4000 || total <= 0) return null;
  return [means[0]! / total, means[1]! / total, means[2]! / total, means[3]! / total];
}

/** Distance between two signatures: total variation (half the L1), so it lands in [0,1] and a
 *  figure can be read as "this fraction of the land's gradient energy sits in different
 *  directions". */
export function signatureDistance(a: Signature, b: Signature): number {
  let s = 0;
  for (let i = 0; i < 4; i++) s += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return s / 2;
}

/**
 * How strongly a land is DIRECTED: the ratio of its strongest orientation to its weakest.
 * `1` is a perfectly undirected mottle. Reported beside the signature because it is the number
 * that reads as a picture — "these features run four times more one way than the other".
 */
export function anisotropyOf(s: Signature): number {
  const lo = Math.min(...s);
  const hi = Math.max(...s);
  return lo > 0 ? hi / lo : Infinity;
}

/**
 * ⚠⚠ THE ORIENTATION SIGNATURE IS BLIND TO FEATURE SCALE, AND A SYNTHETIC TEST CAUGHT IT.
 * Two lands of rows at the SAME bearing and seven times apart in scale produced signatures
 * 0.0002 apart — because normalising to a distribution throws the magnitude away and the
 * direction of the gradient is identical in both. That is precisely the `fallow` / `wheatfield`
 * case: they run the same way on purpose (it is the same field) and differ ~4.7x in feature
 * size. An instrument with only the orientation channel would have reported the pair the whole
 * vocabulary rests on as INDISTINGUISHABLE, and it would have been the instrument that was
 * wrong.
 *
 * FINENESS is the second channel: how often the land crosses its own local mean per hundred
 * pixels, along each image axis. Coarse furrows cross rarely; a fine standing crop crosses
 * often.
 *
 * ⚠ IT IS TOKEN-INVARIANT FOR THE SAME REASON THE ORIENTATION CHANNEL IS. Crossings are counted
 * about the row's OWN mean, so scaling every pixel's level (or shifting it) moves the mean with
 * the samples and preserves every sign change. That is the property the colour-blind pair
 * needs.
 */
export interface Fineness {
  /** Mean crossings per 100 px scanning along x. */
  x: number;
  /** Mean crossings per 100 px scanning along y. */
  y: number;
}

/** Crossings of the local mean, per 100 px, along both axes of a region's opaque pixels. */
export function finenessOf(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  region?: Region,
): Fineness | null {
  const x0 = Math.max(0, region?.x0 ?? 0);
  const y0 = Math.max(0, region?.y0 ?? 0);
  const x1 = Math.min(width, region?.x1 ?? width);
  const y1 = Math.min(height, region?.y1 ?? height);

  const at = (x: number, y: number): number | null => {
    const i = (y * width + x) * 4;
    if ((data[i + 3] ?? 0) < 128) return null;
    return lumaOf(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
  };

  /** One scan line's crossings and length. ⚠ The mean is the LINE's own, not the frame's: a
   *  relief'd island is lit unevenly, and a frame-wide mean would turn that slow gradient into
   *  a single crossing per line and swamp the signal. */
  const scan = (samples: (number | null)[]): [number, number] => {
    const vals = samples.filter((v): v is number => v !== null);
    if (vals.length < 16) return [0, 0];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    let crossings = 0;
    let prev: number | null = null;
    for (const s of samples) {
      if (s === null) {
        prev = null;
        continue;
      }
      const sign = s >= mean ? 1 : -1;
      if (prev !== null && sign !== prev) crossings++;
      prev = sign;
    }
    return [crossings, vals.length];
  };

  let cx = 0;
  let nx = 0;
  for (let y = y0; y < y1; y++) {
    const row: (number | null)[] = [];
    for (let x = x0; x < x1; x++) row.push(at(x, y));
    const [c, n] = scan(row);
    cx += c;
    nx += n;
  }
  let cy = 0;
  let ny = 0;
  for (let x = x0; x < x1; x++) {
    const col: (number | null)[] = [];
    for (let y = y0; y < y1; y++) col.push(at(x, y));
    const [c, n] = scan(col);
    cy += c;
    ny += n;
  }
  if (nx < 2000 || ny < 2000) return null;
  return { x: (100 * cx) / nx, y: (100 * cy) / ny };
}

/** Distance between two fineness readings, as a RATIO rather than a difference — a land twice
 *  as fine as another is the same perceptual step whether the pair is 2 and 4 crossings or 20
 *  and 40. Returns `log2` of the ratio, so 1.0 means "twice as fine" in either direction. */
export function finenessDistance(a: Fineness, b: Fineness): number {
  const step = (p: number, q: number): number => {
    if (p <= 0 || q <= 0) return 0;
    return Math.abs(Math.log2(p / q));
  };
  return Math.max(step(a.x, b.x), step(a.y, b.y));
}

/** The K x K grid of sub-regions a within-terrain spread is measured over. */
export function subRegions(width: number, height: number, k = 3): Region[] {
  const out: Region[] = [];
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < k; i++) {
      out.push({
        x0: Math.floor((i * width) / k),
        y0: Math.floor((j * height) / k),
        x1: Math.floor(((i + 1) * width) / k),
        y1: Math.floor(((j + 1) * height) / k),
      });
    }
  }
  return out;
}

/** One terrain's reading: its whole-island signature and the spread across its own sub-regions. */
export interface TerrainReading {
  signature: Signature;
  anisotropy: number;
  fineness: Fineness;
  /** The largest ORIENTATION distance between any two of this land's own sub-regions — the
   *  noise floor a between-terrain orientation distance has to clear. */
  withinSpread: number;
  /** The largest FINENESS distance between any two of this land's own sub-regions. */
  withinFineness: number;
  /** How many sub-regions carried enough opaque pixels to contribute. */
  regionsUsed: number;
}

/**
 * Read one terrain off a delivered frame.
 *
 * ⚠ THE WITHIN-SPREAD IS THE WHOLE POINT AND IT IS NOT A FORMALITY. The same terrain looks
 * different in different parts of one island — the relief tilts the light, the cell boundaries
 * fold, the coast cuts the field — and without a number for that, ANY between-terrain
 * difference can be presented as a separation. This is the control that makes the claim
 * falsifiable, and it is taken from the same frame so nothing else can have moved.
 */
export function readTerrain(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  k = 3,
): TerrainReading | null {
  const whole = signatureOf(data, width, height);
  const wholeFine = finenessOf(data, width, height);
  if (!whole || !wholeFine) return null;
  const parts: Signature[] = [];
  const fines: Fineness[] = [];
  for (const r of subRegions(width, height, k)) {
    const s = signatureOf(data, width, height, r);
    if (s) parts.push(s);
    const f = finenessOf(data, width, height, r);
    if (f) fines.push(f);
  }
  let spread = 0;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      spread = Math.max(spread, signatureDistance(parts[i]!, parts[j]!));
    }
  }
  let fineSpread = 0;
  for (let i = 0; i < fines.length; i++) {
    for (let j = i + 1; j < fines.length; j++) {
      fineSpread = Math.max(fineSpread, finenessDistance(fines[i]!, fines[j]!));
    }
  }
  return {
    signature: whole,
    anisotropy: anisotropyOf(whole),
    fineness: wholeFine,
    withinSpread: spread,
    withinFineness: fineSpread,
    regionsUsed: parts.length,
  };
}

/** The verdict for one pair of terrains. */
export interface PairVerdict {
  /** ORIENTATION: how differently the two lands spend their gradient across directions. */
  between: number;
  bar: number;
  /** FINENESS: how far apart the two lands are in feature scale, in octaves. */
  betweenFineness: number;
  barFineness: number;
  /** Separated on the orientation channel alone. */
  separatedByDirection: boolean;
  /** Separated on the fineness channel alone. */
  separatedByScale: boolean;
  /** ⚠ EITHER CHANNEL IS ENOUGH, and that is a claim about reading rather than a weakening.
   *  Two lands running crosswise are told apart by their direction; two running the same way at
   *  different scales are told apart by their grain. A land has to be distinguishable, not
   *  distinguishable in a particular way. */
  separated: boolean;
  /** How many times its bar the winning channel cleared. Below 1 on both is a failure. */
  margin: number;
}

/**
 * Are these two lands distinguishable?
 *
 * ⚠ THE BAR IS THE WORSE OF THE TWO WITHIN-SPREADS, not their mean. A land that varies a lot
 * across itself is a land a reader cannot reliably fingerprint from one patch, and averaging
 * would let a very uniform partner carry a very variable one over the line.
 */
export function pairVerdict(a: TerrainReading, b: TerrainReading): PairVerdict {
  const between = signatureDistance(a.signature, b.signature);
  const bar = Math.max(a.withinSpread, b.withinSpread);
  const betweenFineness = finenessDistance(a.fineness, b.fineness);
  const barFineness = Math.max(a.withinFineness, b.withinFineness);
  const byDirection = between > bar;
  const byScale = betweenFineness > barFineness;
  const ratio = (n: number, d: number): number => (d > 0 ? n / d : n > 0 ? Infinity : 0);
  return {
    between,
    bar,
    betweenFineness,
    barFineness,
    separatedByDirection: byDirection,
    separatedByScale: byScale,
    separated: byDirection || byScale,
    margin: Math.max(ratio(between, bar), ratio(betweenFineness, barFineness)),
  };
}
