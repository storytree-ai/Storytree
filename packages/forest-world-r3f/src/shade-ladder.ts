// shade-ladder.ts — THE AUTHORED SHADE LADDER, and the arithmetic that turns an authored
// token plus a lighting scalar into the pixel a GPU delivers. Pure, browser-free,
// node:test-provable — it imports nothing at all.
//
// ⚠ IT LIVES IN `src/` BECAUSE IT HAS CROSSED. It was the ladder half of
// `harness/palette-band.ts` until 2026-08-30, fenced out of the public mirror because adoption
// was a separate and deliberate event (ADR-0380 D6 / ADR-0406 D2). The owner authorised that
// event on 2026-08-29 — "This looks better, stamp it, i'm still hoping for future iterations to
// improve the ground texture and add shadows" — and the shipped map's ground now quantises onto
// this ladder, so the ladder ships. `harness/palette-band.ts` RE-EXPORTS every symbol below
// rather than keeping a copy: two ladders that agreed on the day they were forked is exactly
// how this package acquired three disagreeing status palettes.
//
// THE DESIGN, AND WHY IT IS STRONGER THAN A SNAP. The obvious implementation is what the
// author-time compositor does: shade freely, then SNAP each pixel to the nearest entry of a
// closed palette. That is a CLAMP, and a clamp can only clamp toward what it holds, so a
// missing entry reassigns SEMANTIC state rather than shifting a hue — measured, an incomplete
// `(token x shade)` palette silently repainted an `unknown` island's rim `healthy` green over
// 2564 px (`docs/research/chapter2-land-interior-fork-2026-08-15/compose.py`, `build_palette`).
//
// So this module does not snap. It CONSTRUCTS. The palette is the closure of
// (authored token x authored shade level), and a material is given the instance's own token and
// quantises only the LIGHTING SCALAR onto that same authored ladder:
//
//     colour = token * quantise(lambert)
//
// Every colour a material can emit is therefore a palette entry BY CONSTRUCTION. No
// nearest-entry search, no palette texture, and — the property that matters on a map whose
// ground colour IS a capability's proof state (ADR-0392 D5 / ADR-0398 D7) — no reachable colour
// belongs to another status's family. A foreign-status read is not made unlikely; it is made
// unrepresentable.
//
// THE LADDER AND THE TOKENS ARE COPIES, NOT NEW ART. Both are read from the same source the
// author-time track reads — the app's `.hex-territory.st-<status>` blocks in
// `apps/studio/src/index.css`. ADR-0367 D4 requires the land's render to pass through the
// island's EXISTING palette, so a live renderer inherits it exactly as the compositor does.

/** A colour as 0..255 integer channels — the delivered form, so a test can compare a
 *  shader's output to an authored entry without a float-tolerance argument. */
export interface Rgb255 {
  r: number;
  g: number;
  b: number;
}

/**
 * SHADE KEYS — the ONE new rendering lever this arc has added, and it comes from a measurement
 * of the named reference rather than from taste (`docs/research/chapter2-islanders-canopy-2026-08-22/`).
 *
 * WHAT WAS MEASURED, on its TREES specifically — the lit and shaded deciles of each tree's own
 * pixels, so no hand-picked pixel decided the answer:
 *
 *   green spire     lit H74  S64 V80  ->  shade H135 S37 V47   dH +61   V x0.59
 *   teal cypress    lit H95  S58 V51  ->  shade H117 S46 V31   dH +22   V x0.61
 *   winter conifer  lit H183 S43 V99  ->  shade H218 S68 V71   dH +35   V x0.72
 *   rust spindle    lit H41  S41 V73  ->  shade H30  S32 V56   dH -11   V x0.77
 *
 * A shaded face there is NOT its lit face darkened. It has ROTATED, and always toward the cool
 * side of ITS OWN ISLAND'S scheme — the greens go teal, the blue conifer goes further blue, and
 * the one WARM tree on a warm island barely moves at all and stays warm. That last row is the
 * half of the finding easiest to get backwards: the key is per-scheme, not a universal teal.
 *
 * WHAT OUR LADDER COULD DO BEFORE THIS. `bandedColour` is `token x level` — a pure multiply, so
 * R:G:B is invariant and HSV hue and saturation CANNOT change by construction. Every shaded
 * face we have ever delivered was its lit face at lower value, exactly. That is the gap, it is
 * arithmetic rather than opinion, and it is why "add another shadow rung" never closed it.
 *
 * WHAT THIS ADDS. A token MAY declare a shade key. Its delivered colour at level `L` is then a
 * linear mix from the key (at {@link SHADE_KEY_FLOOR}) to the token itself (at 1.0), instead of
 * `token x L`. One authored colour per token buys the hue rotation.
 *
 * WHY THE FENCE IS UNMOVED (ADR-0380 D6 fence 3, read by ADR-0406 D3). The property the fence
 * carries is that every delivered pixel is an enumerable AUTHORED closure entry, which is what
 * lets `capture.mjs` REFUSE rather than report. A keyed token still delivers exactly one colour
 * per ladder rung, `tokenRamp`/`shadowRamp` still enumerate them, and `landPalette` still closes
 * over them. What changed is how an entry is COMPUTED, not whether the set is closed. No free
 * shading, no gradient, no nearest-entry snap, no checker exception.
 *
 * ⚠ IT IS DELIBERATELY EMPTY FOR EVERY PRE-EXISTING TOKEN, AND THAT IS A DECISION RATHER THAN
 * CAUTION. Keying the STATUS families would change what the LAND's colour asserts — and
 * `shadow-ladder-is-admissible-and-affordable` already measured that the four status colours
 * are separated mainly by BRIGHTNESS with all six pairs overlapping, so rotating a shaded
 * ground's hue could as easily fix that as break it. That is a semantic question, and ADR-0392
 * D5 / ADR-0398 D7 forbid an art call settling one. The keys here are on FAMILY-LESS prop
 * tokens (ADR-0406 D4), which assert nothing. Pricing the status half is the research artefact's
 * job, not this constant's.
 */
export const SHADE_KEYS: ReadonlyMap<string, string> = new Map([
  // A cool deep teal. Delivers rung 0 at H141 S45 V37 against the token's H103 S51 V57 —
  // dH +38, V x0.65, which sits between the reference's two green trees (+22 and +61, x0.59
  // and x0.61) rather than chasing either one exactly.
  ['#5c9147', '#143440'],
  // The same rotation on an already-deep green: rung 0 lands H158 S51 V29, V x0.69.
  ['#3d6b3f', '#12303c'],
  // ⚠ A WARM KEY, AND IT IS A CORRECTION MADE BY MEASURING RATHER THAN A DEFAULT. The first
  // version pointed this token at the same cool teal as the greens, on the reasoning that the
  // reference's ochre island has TEAL cliffs. That is true of its cliffs and false of its
  // TREES — measured, the rust spindle's shade rotates -11 degrees and stays warm. Mixing a
  // saturated orange toward a desaturated teal passes straight through grey: the cool key
  // delivered rung 0 at S29 against the token's S72, a muddy brown that read as a dead tree.
  // A dark warm brown holds the hue (dH -0.5) and the saturation (S65) while still dropping
  // the value to x0.65.
  ['#a8622f', '#3d2a1e'],
]);

/** The level a shade-keyed token delivers its KEY at, unmixed.
 *
 *  Chosen BELOW every ladder member — the lit ladder floors at 0.78 and the shadow rung sits
 *  under that — so both ladders land strictly inside the mix and neither extrapolates past the
 *  key. At 0.6 the lit ladder's darkest rung delivers 45% token / 55% key, which reproduces the
 *  measured 0.70x value drop within a couple of points while carrying the hue rotation with it. */
export const SHADE_KEY_FLOOR = 0.6;

/** The authored shade ladder — the ONLY multipliers a surface may wear, from the
 *  compositor's `KEY_SHADE` plus its flat/seam levels. A live material quantises its
 *  continuous lighting term ONTO this ladder; nothing else is representable.
 *
 *  Kept SORTED ASCENDING: `bandShade` relies on the order, and a test asserts the order
 *  rather than trusting the literal to stay sorted through a later edit. */
export const SHADE_LEVELS: readonly number[] = [0.78, 0.8, 0.9, 1.0];

/**
 * The single authored light direction the whole land is shaded by, as plain numbers.
 *
 * IT LIVES HERE, IN THE PURE HALF, BECAUSE THE LADDER ALONE DOES NOT DECIDE A RUNG — the
 * light does, jointly with a surface normal. Anything reasoning about which rung a piece of
 * geometry will land on (which is the only thing that makes a shape visible on a banded
 * material) needs both, and must be able to do it without a browser. `banded-material.ts`
 * derives its three.js vector from this rather than carrying its own copy: a shader and a
 * test holding private copies of the same numbers prove nothing about each other.
 *
 * A live land is still a 2.5D isometric picture (ADR-0380 D6 fence 4: the projection does
 * not move), so this is a fixed authored direction rather than a scene-graph light a camera
 * could swing around. Stored normalised, so `dot(n, LIGHT_DIRECTION)` is the lambert term
 * with no further arithmetic.
 */
export const LIGHT_DIRECTION: { readonly x: number; readonly y: number; readonly z: number } =
  (() => {
    const [x, y, z] = [-0.45, 0.82, 0.35];
    const len = Math.hypot(x, y, z);
    return { x: x / len, y: y / len, z: z / len };
  })();

/** The rung a surface normal lands on under the authored light — the shader's own decision,
 *  available to a node test. Half-lambert, exactly as `createBandedMaterial` computes it. */
export function rungOfNormal(n: { x: number; y: number; z: number }): number {
  const dot = n.x * LIGHT_DIRECTION.x + n.y * LIGHT_DIRECTION.y + n.z * LIGHT_DIRECTION.z;
  return bandLevelIndex(dot * 0.5 + 0.5);
}

/** Parse `#rrggbb` to integer channels. Throws on a malformed token — an authored palette
 *  entry that does not parse is a corpus error, not a pixel to guess at. */
export function parseHex(hex: string): Rgb255 {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`shade-ladder: not a #rrggbb token: ${JSON.stringify(hex)}`);
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** `#rrggbb` for a delivered colour — the form the evidence sheets and the tests print. */
export function toHex(c: Rgb255): string {
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/**
 * Quantise a continuous lighting scalar onto the authored ladder — the ONE operation the
 * GLSL below duplicates. Nearest level, ties resolved DOWN (toward the darker rung) so the
 * mapping is total and single-valued for every finite input; out-of-range inputs clamp to
 * the ladder's ends rather than extrapolating, because an extrapolated level is exactly the
 * off-palette colour this module exists to make unrepresentable.
 */
export function bandShade(lambert: number): number {
  const lo = SHADE_LEVELS[0]!;
  const hi = SHADE_LEVELS[SHADE_LEVELS.length - 1]!;
  if (!Number.isFinite(lambert) || lambert <= lo) return lo;
  if (lambert >= hi) return hi;
  let best = lo;
  let bestD = Infinity;
  for (const level of SHADE_LEVELS) {
    const d = Math.abs(level - lambert);
    // strict `<` keeps the FIRST (darker) level on an exact tie — the ladder is ascending
    if (d < bestD) {
      bestD = d;
      best = level;
    }
  }
  return best;
}

/** The delivered colour for one authored token under one lighting scalar: `token x
 *  bandShade(lambert)`, rounded to integer channels the same way the compositor's
 *  `shade()` plus palette rounding do. This is the whole material, in one line. */
export function bandedColour(token: string, lambert: number): Rgb255 {
  return deliveredForLevel(token, bandShade(lambert));
}

/**
 * THE PIXEL A TOKEN DELIVERS AT ONE LADDER LEVEL — the single place the arithmetic lives, so
 * the lit ladder and the shadow ladder cannot disagree about it.
 *
 * `token x level` for an ordinary token, exactly as before. For a token with a {@link SHADE_KEYS}
 * entry, a linear mix from its key at {@link SHADE_KEY_FLOOR} to the token itself at 1.0.
 *
 * ⚠ IT TAKES A LEVEL, NOT A LAMBERT, AND THAT DISTINCTION HAS COST A FALSE ANSWER HERE BEFORE.
 * `bandedColour` quantises its argument onto `SHADE_LEVELS` first; this does not, because the
 * shadow rung is by construction not a ladder member and quantising it on the way in would snap
 * it to 0.78 and report the shadow as delivering the same pixel as full shade.
 *
 * The rounding is done ONCE, here, in specified arithmetic — the same reason `bandLevelIndex`
 * exists: the GPU is handed finished colours to select between and never multiplies a colour.
 */
export function deliveredForLevel(token: string, level: number): Rgb255 {
  const t = parseHex(token);
  const q = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  const key = SHADE_KEYS.get(token);
  if (key === undefined) return { r: q(t.r * level), g: q(t.g * level), b: q(t.b * level) };
  const k = parseHex(key);
  // Clamped so a level outside [floor, 1] cannot extrapolate past either end into a colour
  // neither authored entry names. Both ladders sit strictly inside, so the clamp never fires
  // today; it exists so that a later rung added below the floor fails SAFE rather than quietly
  // inventing a colour.
  const f = Math.min(1, Math.max(0, (level - SHADE_KEY_FLOOR) / (1 - SHADE_KEY_FLOOR)));
  return {
    r: q(k.r + (t.r - k.r) * f),
    g: q(k.g + (t.g - k.g) * f),
    b: q(k.b + (t.b - k.b) * f),
  };
}

/** The ladder INDEX a lighting scalar falls on — the same decision as `bandShade`, returned
 *  as a position rather than a multiplier.
 *
 *  THIS IS THE FORM THE SHADER USES, AND THE REASON IS MEASURED, NOT STYLISTIC. A first
 *  version had the GPU compute `token * level` in normalised floats and let the framebuffer
 *  write-back round. That delivered 929 px of `#c2ad5e` where the authored entry is
 *  `#c2ad5f`: the exact product for `#d8c069`'s blue channel at level 0.9 is 94.5, and
 *  JavaScript's `Math.round` takes an exact half UP while the GPU's float-to-unorm8
 *  conversion took it DOWN. Both are defensible; they are not the same. So the rounding is
 *  done ONCE, here, in specified arithmetic, and the GPU is given the finished colours to
 *  SELECT between — it never multiplies a colour at all. The closure argument is untouched
 *  (a shader still only ever reaches its own token's entries); what changes is that
 *  "on-palette" now means bit-identical rather than within-one-LSB. */
export function bandLevelIndex(lambert: number): number {
  const banded = bandShade(lambert);
  const i = SHADE_LEVELS.indexOf(banded);
  // `bandShade` only ever returns a member of the ladder, so this cannot miss; the guard
  // exists so that if it ever could, it fails loudly instead of silently indexing -1.
  if (i < 0) throw new Error(`shade-ladder: bandShade returned ${banded}, not a ladder member`);
  return i;
}

/** The token's RAMP: its delivered colour at every ladder rung, in ladder order. This is
 *  what the material uploads — the shader picks `ramp[bandLevelIndex(lambert)]` and writes
 *  it through unchanged. */
export function tokenRamp(token: string): Rgb255[] {
  return SHADE_LEVELS.map((level) => bandedColour(token, level));
}

/** Every colour ONE token can deliver, across the whole ladder — the token's own closed
 *  image, deduped. A live material's reachable set is the union of these over its
 *  instances' tokens, which is what makes the closure provable without sampling the shader. */
export function paletteImageOfToken(token: string): Rgb255[] {
  const seen = new Map<string, Rgb255>();
  for (const c of tokenRamp(token)) seen.set(toHex(c), c);
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// The GLSL half — DERIVED from the constants above, never re-typed
// ---------------------------------------------------------------------------
//
// The shader and the test MUST share one authored ladder or the proof is theatre: a test
// that passes against its own private copy of the numbers proves nothing about the pixels
// a GPU delivers. So the ladder is INTERPOLATED into the GLSL from `SHADE_LEVELS`, and
// `bandGlsl()` is a function rather than a constant string so a test can call it and assert
// the interpolation actually happened. (This arc has twice shipped a harness that could not
// parse its own evidence and therefore looked exactly like a guard that did not fire;
// deriving beats asserting.)

/** GLSL source for the banding quantiser, with the ladder written in from `SHADE_LEVELS`.
 *
 *  It returns the ladder INDEX, not the multiplier: the fragment stage then reads
 *  `uRamp[index]` — the finished, already-rounded authored colour uploaded by
 *  `tokenRamp` — and writes it through unchanged. The GPU therefore performs no colour
 *  arithmetic at all, which is what makes "the delivered pixel is an authored entry" a
 *  bit-identity rather than an approximation (see `bandLevelIndex`). */
export function bandGlsl(): string {
  const n = SHADE_LEVELS.length;
  const levels = SHADE_LEVELS.map((l) => l.toFixed(6)).join(', ');
  const lines = [
    '// GENERATED from palette-band.ts SHADE_LEVELS — do not hand-edit this ladder.',
    `const int ST_N_LEVELS = ${n};`,
    'float st_level(int i) {',
    ...SHADE_LEVELS.map((l, i) => `  if (i == ${i}) return ${l.toFixed(6)};`),
    `  return ${SHADE_LEVELS[SHADE_LEVELS.length - 1]!.toFixed(6)};`,
    '}',
    '',
    '// The ladder rung a lighting scalar falls on. Nearest, ties DOWN, ends clamped —',
    '// identical to bandShade/bandLevelIndex in palette-band.ts.',
    'int st_bandIndex(float lambert) {',
    '  if (lambert <= st_level(0)) return 0;',
    '  if (lambert >= st_level(ST_N_LEVELS - 1)) return ST_N_LEVELS - 1;',
    '  int best = 0;',
    '  float bestD = 1e9;',
    '  for (int i = 0; i < ST_N_LEVELS; i++) {',
    '    float d = abs(st_level(i) - lambert);',
    '    if (d < bestD) { bestD = d; best = i; }',
    '  }',
    '  return best;',
    '}',
    '',
    `// ladder, for a reader and for the test that asserts this string carries it: ${levels}`,
  ];
  return lines.join('\n');
}
