// shadow-ladder.ts — CAN A SHADOW SHIP AT ALL? The admissibility half of
// `shadow-ladder-is-admissible-and-affordable`. Pure, browser-free, node:test-provable,
// and fenced into `harness/` for the same reason `palette-band.ts` is (see its header).
//
// THE QUESTION. A shadow is a LUMINANCE operation, and the land's four rendered statuses
// are ordered along luminance. So darkening a cell walks it toward another status's colour,
// and past some depth a reader takes `unknown` ground for `healthy` ground — doubt painted
// as proof, the worst available direction to be wrong (ADR-0367 D5, ADR-0226). The depth at
// which that happens is the CEILING, and this module MEASURES it rather than declaring it.
//
// WHY THE SHIPPED INSTRUMENT CANNOT ANSWER THIS, WHICH IS THE WHOLE REASON THIS FILE
// EXISTS. `statusFamilyOf` in `palette-band.ts` asks *is this delivered colour a member of
// the instance's own token image?* On the live path the answer is YES BY CONSTRUCTION — the
// shader can only ever emit `uRamp[i]`, which is `token x level` for the instance's own
// token. Measured over all 64 (rendered status x token x rung) entries: zero mismatches.
// That check therefore CANNOT fail for a shadow, at any depth, ever. It is a closure
// instrument and it is doing its job; it is simply blind to confusability, and reading its
// green as "the shadow is honest" would be reading a vacuous pass as a result.
//
// SO THE READER MODEL IS BORROWED, NOT INVENTED. Everything below is a port of the
// author-time compositor's pre-registered instrument —
// `docs/research/chapter2-one-surface-and-shadow-2026-08-17/shadow.py`
// (`reader_status_table`, `nearest_status`, `safe_depth`) and its `W_LUMA` weighting from
// `chapter2-land-interior-fork-2026-08-15/compose.py:140`. Inventing a metric here and
// tuning it until it agreed with a preferred conclusion is the move this arc declined once
// already and kept the refusal on the record for
// (`docs/research/chapter2-live-island-2026-08-19/README.md`). The port is held to that by
// `shadow-ladder.test.ts`, which reproduces all THREE independently recorded
// configurations of the ceiling before any of it is pointed at the live ladder:
//
//   as PR #1385 measured it (6 statuses)  healthy 0.74 · mapped 0.76 · proposed 0.88 · unknown 0.91
//   folded to what worldStatus renders    healthy 0.67 · mapped <=0.30 · proposed 0.88 · unknown 0.91
//   collapsed to one token per status     ............................................. unknown 0.94
//
// A port that reproduces three recorded configurations is the same instrument. One that
// reproduced none of them would be a new metric wearing an old name.

import {
  SHADE_LEVELS,
  STATUS_TOKENS,
  parseHex,
  rungOfNormal,
  toHex,
  type Rgb255,
} from './palette-band.js';

/** The channel weighting the compositor's `snap` and `nearest_status` share, so "near"
 *  means the same thing to the quantiser and to the test. Verbatim from
 *  `chapter2-land-interior-fork-2026-08-15/compose.py:140` — NOT a new choice. */
export const W_LUMA: readonly [number, number, number] = [0.3, 0.59, 0.11];

/** The statuses `worldStatus` can actually put on an island: `unhealthy` folds to `mapped`
 *  (ADR-0296) and `building` to `proposed` (ADR-0038), so the admissible set is the four
 *  survivors rather than all six of `STATUS_TOKENS`. Both sets are measured in the test;
 *  this is the one the shipping question is about. */
export const RENDERED_STATUSES: readonly string[] = ['healthy', 'mapped', 'proposed', 'unknown'];

/** Weighted squared distance — the space `nearest_status` searches. */
export function colourDistance2(a: Rgb255, b: Rgb255): number {
  return W_LUMA[0] * (a.r - b.r) ** 2 + W_LUMA[1] * (a.g - b.g) ** 2 + W_LUMA[2] * (a.b - b.b) ** 2;
}

/** Luminance of a delivered colour under the same weighting. Reported for the INTUITION
 *  (why the ladder is tight), never used as the verdict — the statuses differ in hue as
 *  well as luminance, so a luminance-only test would condemn depths a reader can still
 *  separate. `nearestStatus` is the verdict. */
export function luma(c: Rgb255): number {
  return W_LUMA[0] * c.r + W_LUMA[1] * c.g + W_LUMA[2] * c.b;
}

export interface ReaderTableOptions {
  /** Which statuses the reader has learned. */
  statuses?: readonly string[];
  /** The shade level the reference colours are delivered AT. The compositor's table was
   *  built at full light because its lit top faces WERE delivered at full light; the LIVE
   *  renderer never delivers flat ground at 1.0 (see `FLAT_GROUND_LEVEL`), so pointing the
   *  compositor's table at it unchanged compares a delivered colour against a reference the
   *  renderer cannot draw. */
  rung?: number;
  /** Include the `side` (wall) tokens — `reader_status_table`'s `faces="all"`. Reported,
   *  never asserted on: 21 of the 78 colours the land may already emit read as a foreign
   *  status at FULL LIGHT with no shadow anywhere near them, and an instrument that
   *  condemns the shipped art before the change cannot price the change. */
  faces?: 'top' | 'all';
  /** Use only the first `top` variant — THE LIVE RENDERER'S OWN CONFIGURATION. `IslandView`
   *  emits `fam.top[0]` for the whole family, so the three hash-picked variants the
   *  compositor carried are not in play here. */
  oneToken?: boolean;
}

/** `token x level`, rounded exactly the way the material's own ramp rounds — so a reference
 *  colour in the table is bit-identical to the pixel the shader would deliver for it. */
export function scale(c: Rgb255, m: number): Rgb255 {
  const q = (v: number) => Math.min(255, Math.max(0, Math.round(v * m)));
  return { r: q(c.r), g: q(c.g), b: q(c.b) };
}

/**
 * The pixel the shader delivers for `token` at `level` — `round(token x level)`, once.
 *
 * IT IS NOT `bandedColour`, AND THE DIFFERENCE COST A FALSE ANSWER BEFORE THIS COMMENT
 * EXISTED. `bandedColour` runs its argument through `bandShade` first, which quantises onto
 * `SHADE_LEVELS`; ask it for level 0.86 and it hands back `token x 0.90`, because 0.86 is
 * nearer 0.90 than 0.80. Every candidate rung between the authored ones therefore SNAPS to
 * an authored one, so a sweep looking for the deepest admissible rung silently tests the
 * same four levels over and over and reports the FIRST rung it tried as admissible — which
 * looks exactly like a shallow, cautious, correct answer. The shadow rung is by
 * construction NOT a member of `SHADE_LEVELS`, so it must never be quantised on the way in.
 */
export function deliveredColour(token: string, level: number): Rgb255 {
  return scale(parseHex(token), level);
}

/** The colours a READER could take for a status, per status — the port of
 *  `reader_status_table`. WHEAT IS EXCLUDED and that is not a convenience: five of the six
 *  statuses share the identical wheat hex, so a wheat cell reports no status by colour at
 *  all, and including it would make every status equidistant from every shadowed pixel. */
export function readerStatusTable(opts: ReaderTableOptions = {}): Record<string, Rgb255[]> {
  const statuses = opts.statuses ?? Object.keys(STATUS_TOKENS).sort();
  const rung = opts.rung ?? 1.0;
  const table: Record<string, Rgb255[]> = {};
  for (const st of statuses) {
    const fam = STATUS_TOKENS[st];
    if (!fam) throw new Error(`shadow-ladder: no token family for status ${JSON.stringify(st)}`);
    const tokens = opts.oneToken ? [fam.top[0]!] : [...fam.top];
    if (opts.faces === 'all') tokens.push(fam.side);
    table[st] = tokens.map((t) => (rung === 1.0 ? parseHex(t) : scale(parseHex(t), rung)));
  }
  return table;
}

/** Which status a delivered colour reads as: nearest entry in the weighted space. Ties go
 *  to the alphabetically first status, which is what `numpy.argmin` over the stacked table
 *  does. */
export function nearestStatus(colour: Rgb255, table: Record<string, Rgb255[]>): string {
  let best = '';
  let bestD = Infinity;
  for (const st of Object.keys(table).sort()) {
    for (const entry of table[st]!) {
      const d = colourDistance2(colour, entry);
      if (d < bestD) {
        bestD = d;
        best = st;
      }
    }
  }
  return best;
}

/**
 * The deepest light multiplier at which `rgb` still reads as the status it reads at full
 * strength — the port of `safe_depth`, floor and step included.
 *
 * COMPUTING IT RATHER THAN CHOOSING IT is the difference between a shadow that is bounded
 * and one that merely happens not to have broken yet.
 */
export function safeDepth(
  rgb: Rgb255,
  table: Record<string, Rgb255[]>,
  floor = 0.3,
  step = 0.01,
): { deepest: number; readsAs: string } {
  const readsAs = nearestStatus(rgb, table);
  let m = 1.0;
  let last = 1.0;
  while (m > floor) {
    m = Math.round((m - step) * 10000) / 10000;
    // UNROUNDED, exactly as the Python does — `np.clip(base * m, 0, 255)` hands the reader
    // floats. Rounding to channels here first would move the flip point by up to a step.
    const c = { r: rgb.r * m, g: rgb.g * m, b: rgb.b * m };
    if (nearestStatus(c, table) !== readsAs) break;
    last = m;
  }
  return { deepest: last, readsAs };
}

/**
 * The ladder level FLAT GROUND is delivered at — DERIVED from the light and the ladder,
 * never typed. It is 0.90, and it is the most consequential number in this file: the live
 * renderer's "lit" ground is not `token x 1.0`, so the reader's reference colours have to be
 * built at THIS level or the instrument compares a delivered colour against a reference the
 * renderer never draws.
 */
export const FLAT_GROUND_LEVEL: number = SHADE_LEVELS[rungOfNormal({ x: 0, y: 1, z: 0 })]!;

/** The live renderer's own reader table: one token per status, at the level flat ground is
 *  actually delivered at. */
export function liveReaderTable(
  statuses: readonly string[] = RENDERED_STATUSES,
): Record<string, Rgb255[]> {
  return readerStatusTable({ statuses, rung: FLAT_GROUND_LEVEL, oneToken: true });
}

/** Per-status ceilings on the live path, as ABSOLUTE ladder levels — a level a rung could
 *  hold — rather than as multipliers of a full-light colour the ground never wears. */
export function liveCeilings(
  statuses: readonly string[] = RENDERED_STATUSES,
): { status: string; relative: number; absolute: number; readsAs: string }[] {
  const table = liveReaderTable(statuses);
  return statuses.map((st) => {
    const base = deliveredColour(STATUS_TOKENS[st]!.top[0]!, FLAT_GROUND_LEVEL);
    const { deepest, readsAs } = safeDepth(base, table);
    return { status: st, relative: deepest, absolute: FLAT_GROUND_LEVEL * deepest, readsAs };
  });
}

/**
 * THE DERIVED ANSWER: the deepest ladder level EVERY rendered status can wear without
 * reading as another one.
 *
 * It sweeps candidate levels down the same 0.01 grid `safeDepth` walks and asks the reader
 * about the colour THE SHADER WOULD ACTUALLY DELIVER at that level — `bandedColour(token,
 * level)`, integer-rounded once. That last detail is not pedantry. `safeDepth` darkens an
 * already-rounded delivered colour by a float, so it answers a question about
 * `round(round(t * 0.90) * m)` while the shader emits `round(t * level)`. The two disagree
 * by up to one channel unit near the flip, and one channel unit is a whole rung on a 0.01
 * grid. The shader's arithmetic is the one that ships, so it is the one that decides.
 *
 * Returns `null` if NO level below flat ground is admissible — which would be the honest
 * finding that a shadow cannot ship on this palette at all.
 */
export function deepestAdmissibleRung(
  statuses: readonly string[] = RENDERED_STATUSES,
  step = 0.01,
): number | null {
  const table = liveReaderTable(statuses);
  let admissible: number | null = null;
  for (let level = FLAT_GROUND_LEVEL - step; level > 0.3; level -= step) {
    const rounded = Math.round(level * 10000) / 10000;
    const ok = statuses.every(
      (st) => nearestStatus(deliveredColour(STATUS_TOKENS[st]!.top[0]!, rounded), table) === st,
    );
    if (!ok) break;
    admissible = rounded;
  }
  return admissible;
}

/**
 * THE SHADOW'S RUNG — derived on import, never typed.
 *
 * If `deepestAdmissibleRung` ever returns `null` this THROWS rather than quietly falling
 * back to a level the reader rejects: a shadow that cannot ship honestly has to fail loudly,
 * because the failure IS the finding.
 */
export const SHADOW_RUNG: number = (() => {
  const rung = deepestAdmissibleRung();
  if (rung === null) {
    throw new Error(
      'shadow-ladder: NO ladder level below flat ground is admissible for every rendered ' +
        'status. A shadow cannot ship inside this closed palette, and that is a finding to ' +
        'price and escalate — not a reason to widen the palette.',
    );
  }
  return rung;
})();

/**
 * The ladder a shadowed land wears: the authored ladder plus the one derived shadow rung,
 * sorted ascending like `SHADE_LEVELS`.
 *
 * THE SHADOW RUNG IS NOT REACHABLE BY LIGHTING, AND THAT IS DELIBERATE. `bandShade` still
 * quantises the lambert term onto `SHADE_LEVELS` alone, so no surface normal can land on the
 * shadow rung — only the shadow term puts a pixel there. Inserting it into the QUANTISER
 * instead would have re-banded every relief pixel on every existing panel, which is a
 * different change wearing this increment's clothes.
 */
export const SHADOW_LADDER: readonly number[] = [...SHADE_LEVELS, SHADOW_RUNG].sort((a, b) => a - b);

/** Index of the shadow rung within `SHADOW_LADDER` — what the generated GLSL selects. */
export const SHADOW_RUNG_INDEX: number = SHADOW_LADDER.indexOf(SHADOW_RUNG);

/** The `SHADE_LEVELS` indices a shadow may darken: those lighter than the shadow rung. A
 *  pixel already darker (a steep face turned away from the light) keeps its own level — a
 *  shadow that BRIGHTENED it would be a shadow lighting something up. */
export function rungsAShadowDarkens(): number[] {
  const out: number[] = [];
  SHADE_LEVELS.forEach((l, i) => {
    if (l > SHADOW_RUNG) out.push(i);
  });
  return out;
}

/** Every colour one token can deliver ON THE SHADOW LADDER — the closure argument, extended
 *  by exactly one level. */
export function shadowRamp(token: string): Rgb255[] {
  return SHADOW_LADDER.map((level) => deliveredColour(token, level));
}

/** The closed palette a shadowed live land may emit. Its size MINUS `landPalette()`'s is
 *  the palette COST of the shadow, which is the number this increment owes. */
export function landPaletteWithShadow(): string[] {
  const set = new Set<string>();
  for (const st of Object.keys(STATUS_TOKENS)) {
    const fam = STATUS_TOKENS[st]!;
    for (const token of [...fam.top, fam.wheat, fam.side]) {
      for (const c of shadowRamp(token)) set.add(toHex(c));
    }
  }
  return [...set].sort();
}

export interface RungVerdict {
  status: string;
  level: number;
  hex: string;
  readsAs: string;
  admissible: boolean;
}

/**
 * The whole ladder, status by status, as the reader sees it — the table the evidence sheet
 * prints. It reports on the SHIPPED rungs too, and it is not shy about them: the shipped
 * dark rungs are ALREADY inadmissible for `proposed` and `unknown`, before any shadow
 * exists. That is a finding about today's render, not a cost of this change.
 */
export function ladderAdmissibility(
  levels: readonly number[] = SHADOW_LADDER,
  statuses: readonly string[] = RENDERED_STATUSES,
): RungVerdict[] {
  const table = liveReaderTable(statuses);
  const out: RungVerdict[] = [];
  for (const status of statuses) {
    for (const level of levels) {
      const colour = deliveredColour(STATUS_TOKENS[status]!.top[0]!, level);
      const readsAs = nearestStatus(colour, table);
      out.push({ status, level, hex: toHex(colour), readsAs, admissible: readsAs === status });
    }
  }
  return out;
}

/**
 * Which authored status family a delivered colour belongs to ON THE SHADOW LADDER — the
 * shadow-aware sibling of `palette-band.ts`'s `statusFamilyOf`.
 *
 * IT EXISTS BECAUSE THE OLD ONE WOULD RAISE A FALSE ALARM RATHER THAN A REAL ONE. The shadow
 * rung is not a member of `SHADE_LEVELS`, so `statusFamilyOf` finds a shadowed pixel in NO
 * token's image and returns `null` — which `capture.mjs` counts as a foreign-status read.
 * All 26 shadow entries would report as foreign the moment a shadow was drawn, and a
 * capture that cries wolf over its own authored palette is worse than no capture at all.
 */
export function familyOnShadowLadder(colour: Rgb255): string | null {
  const hex = toHex(colour);
  for (const st of Object.keys(STATUS_TOKENS)) {
    const fam = STATUS_TOKENS[st]!;
    for (const token of [...fam.top, fam.side]) {
      for (const level of SHADOW_LADDER) {
        if (toHex(deliveredColour(token, level)) === hex) return st;
      }
    }
  }
  return null;
}

/** Just the entries the SHADOW RUNG contributes — `token x SHADOW_RUNG` for every land
 *  token, as `#rrggbb`. The set a delivered pixel has to land in for the shadow to exist at
 *  all: PR #1385's whole finding was that the identical light field delivered ZERO pixels
 *  once quantised onto the shipped palette, so counting entries is not the same as counting
 *  a shadow. */
export function shadowRungEntries(): string[] {
  const set = new Set<string>();
  for (const st of Object.keys(STATUS_TOKENS)) {
    const fam = STATUS_TOKENS[st]!;
    for (const token of [...fam.top, fam.wheat, fam.side]) {
      set.add(toHex(deliveredColour(token, SHADOW_RUNG)));
    }
  }
  return [...set].sort();
}

/**
 * The verdicts that survive BOTH reader configurations — the ones worth acting on.
 *
 * WHY THIS SPLIT EXISTS, AND IT CAUGHT A TWO-MILLION-PIXEL OVERCLAIM. Run against a reader
 * holding ONE reference colour per status (the live renderer's own configuration, since
 * `IslandView` emits `fam.top[0]`), `healthy` at full light reads `unknown`: its delivered
 * colour sits between the two references and is nearer the wrong one. That reading
 * DISAPPEARS the moment the reader's table carries all three authored `top` variants, so it
 * is a property of how the REFERENCE SET was built rather than of the colours the island
 * draws — and the island delivers two million pixels of it, which would have been reported
 * as a foreign read on the strength of an assumption.
 *
 * The three that survive both are all in the DOWNWARD direction, which is the direction a
 * shadow moves and the one ADR-0367 D5 is about.
 */
export function robustlyInadmissible(
  statuses: readonly string[] = RENDERED_STATUSES,
  levels: readonly number[] = SHADOW_LADDER,
): RungVerdict[] {
  const wide = readerStatusTable({ statuses, rung: FLAT_GROUND_LEVEL, oneToken: false });
  return ladderAdmissibility(levels, statuses).filter((v) => {
    if (v.admissible) return false;
    const colour = deliveredColour(STATUS_TOKENS[v.status]!.top[0]!, v.level);
    return nearestStatus(colour, wide) !== v.status;
  });
}

/**
 * THE PARAMETER-FREE CORE, and the one statement in this file that no reader model can
 * argue with: the delivered LUMINANCE RANGES of the rendered statuses, and which pairs
 * overlap.
 *
 * All six pairs do. `mapped` at its lit rung is darker than `healthy` at its darkest;
 * `unknown`'s two dark rungs bracket `healthy`'s lit one. So LUMINANCE CANNOT SEPARATE ANY
 * TWO STATUSES on this ladder, and what does the separating is HUE. That is why no
 * re-anchoring WITHIN the ordering can fix the collisions, and why the remedy this arc
 * would have to buy is hue/chroma separation between the status tokens — an owner art call
 * to price rather than an art call to make.
 */
export function luminanceOverlap(statuses: readonly string[] = RENDERED_STATUSES): {
  ranges: { status: string; min: number; max: number }[];
  overlaps: { a: string; b: string; luma: number }[];
} {
  const ranges = statuses.map((status) => {
    const ls = SHADE_LEVELS.map((l) => luma(deliveredColour(STATUS_TOKENS[status]!.top[0]!, l)));
    return { status, min: Math.min(...ls), max: Math.max(...ls) };
  });
  const overlaps: { a: string; b: string; luma: number }[] = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      const ov = Math.min(a.max, b.max) - Math.max(a.min, b.min);
      if (ov > 0) {
        overlaps.push({ a: a.status, b: b.status, luma: Number(ov.toFixed(1)) });
      }
    }
  }
  return { ranges, overlaps };
}
