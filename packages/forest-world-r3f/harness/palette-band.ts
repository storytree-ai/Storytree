// palette-band.ts — the LOCKED-PALETTE SHADER CONTRACT (chapter2 live-render experiment,
// ADR-0380 D6 fence 3). Pure, browser-free, node:test-provable.
//
// IT LIVES IN `harness/` RATHER THAN `src/`, AND THAT IS A SCOPE DECISION, NOT A FILING
// ACCIDENT. `packages/forest-world-r3f/src` is MIRRORED into the public website repo by
// `pnpm sync:web-engine`, which copies every non-test file it finds and offers no way to
// exclude one. The increment authorises the EXPERIMENT and explicitly does not authorise
// adopting it, so publishing these modules to a public repo is not this session's call to
// make. `harness/` is dev-only and outside the synced tree, so the experiment reaches no
// public surface at all. If it is ever adopted, MOVING IT INTO `src/` IS PART OF THAT
// ADOPTION — and it is then that the sync becomes correct rather than presumptuous.
//
// THE QUESTION THIS ANSWERS. ADR-0380 D6 reopened a live-rendered land, but only behind
// four binding fences, and the third is that a live render stays banded to the LOCKED
// PALETTE in the shader rather than shipping as a generic 3D render. The palette
// discipline is ADR-0214 §4 (NOT ADR-0145 — that mis-citation was repeated across this
// whole track and is corrected here and on the arc).
//
// THE DESIGN, AND WHY IT IS STRONGER THAN A SNAP. The obvious implementation is what the
// author-time compositor does: shade freely, then SNAP each pixel to the nearest entry of
// a closed palette. That is a CLAMP, and this arc has already measured what a clamp costs
// when it is imperfect — an incomplete `(token x shade)` palette silently repainted an
// `unknown` island's rim `healthy` green over 2564 px, because a snap can only clamp
// toward what it holds, so a missing entry reassigns SEMANTIC state rather than shifting a
// hue (chapter2-land-interior-fork-2026-08-15/compose.py `build_palette`).
//
// So this module does NOT snap. It CONSTRUCTS. The palette is defined as the closure of
// (authored token x authored shade level); the shader is given the instance's own token
// and quantises only the LIGHTING SCALAR to that same authored ladder:
//
//     colour = token * quantise(lambert)
//
// Every colour the material can emit is therefore a palette entry BY CONSTRUCTION. There
// is no nearest-entry search, no palette texture, and — the property that matters — no
// reachable colour that belongs to another status's family. A foreign-status read is not
// made unlikely; it is made unrepresentable. `paletteImageOfToken` and the tests prove the
// closure over a fine sweep rather than asserting it in prose.
//
// THE LADDER AND THE TOKENS ARE COPIES, NOT NEW ART. Both are read from the same source
// the author-time track reads — the app's `.hex-territory.st-<status>` blocks in
// `apps/studio/src/index.css`, transcribed by
// `docs/research/chapter2-land-interior-fork-2026-08-15/compose.py`. ADR-0367 D4 requires
// the land's render to pass through the island's EXISTING palette, so a live renderer
// inherits it exactly as the compositor does. If the app's tokens move, BOTH copies move.

/** A colour as 0..255 integer channels — the delivered form, so a test can compare a
 *  shader's output to an authored entry without a float-tolerance argument. */
export interface Rgb255 {
  r: number;
  g: number;
  b: number;
}

/** The per-status authored tokens. Verbatim from the app's `.hex-territory.st-<status>`
 *  blocks via chapter2-land-interior-fork-2026-08-15/compose.py `STATUS_TOKENS`. `top` is
 *  the three-variant ground family (`substrate.ts:237` hash-picks one per cell), `wheat`
 *  the override, `side` the wall/side-face family. */
export const STATUS_TOKENS: Record<
  string,
  { top: readonly string[]; wheat: string; side: string }
> = {
  proposed: { top: ['#d8c069', '#ccb258', '#e2cf7e'], wheat: '#d6b271', side: '#a8914a' },
  building: { top: ['#dcab52', '#d09a42', '#e6bc68'], wheat: '#d6b271', side: '#aa7d33' },
  healthy: { top: ['#8cb85e', '#7dab50', '#9ac570'], wheat: '#d6b271', side: '#648244' },
  mapped: { top: ['#b3946a', '#a68557', '#bda278'], wheat: '#d6b271', side: '#85683f' },
  unhealthy: { top: ['#57544a', '#4a473e', '#635f52'], wheat: '#6f6852', side: '#37352c' },
  unknown: { top: ['#a9c87f', '#9fc174', '#b2cf8b'], wheat: '#d6b271', side: '#87985f' },
};

/** The STORY TREE's authored crown token, per status. Verbatim from the app's
 *  `.story-tree .crown-lo circle` rules — `--crown-<status>-lo` — with `--story-trunk` as the
 *  shared bole (see {@link SHARED_TOKENS}).
 *
 *  `--crown-<status>-hi` IS DELIBERATELY NOT TRANSCRIBED, and the reason is the difference
 *  between the two renderers rather than taste. The SVG crown is two overlapping circle sets:
 *  five `crown-lo` blobs and three lighter `crown-hi` blobs clustered up-and-left. The lighter
 *  fill is the flat surface STANDING IN for a light it does not have — it paints a highlight
 *  where a highlight would fall. A live crown has the light: `LIGHT_DIR` comes from up-left-
 *  forward, which is where those three blobs already sit, so the banded material lands them on
 *  a brighter rung on its own. Grow both lobe groups (their silhouette is authored and real),
 *  paint them one token, and the highlight is said ONCE.
 *
 *  The consequence for the palette is the reason this is written down rather than just done: an
 *  authored token the renderer can never emit would enlarge the closed palette with an entry
 *  nothing delivers, and a fence with unreachable entries reads as more coverage than it has. */
export const TREE_TOKENS: Record<string, { crown: string }> = {
  proposed: { crown: '#b06a24' },
  // `building` has NO `.story-tree.st-building` rule and no `--crown-building-*` pair in the
  // app, so a building story's tree falls through to the unset default, which is `unknown`.
  // Transcribed as what the app DELIVERS rather than as the amber the ground family would
  // suggest — inventing the missing pair here would put a colour on an island that the shipped
  // renderer never draws.
  building: { crown: '#6b7280' },
  healthy: { crown: '#2f6b3f' },
  mapped: { crown: '#7d5f3b' },
  unhealthy: { crown: '#9f2d22' },
  unknown: { crown: '#6b7280' },
};

/** The UAT FLOWERS' authored tokens. Verbatim from the app's `--flower-*` custom properties,
 *  which `.tall-flower-stem/-leaf/-bud/-petal/-center` resolve against.
 *
 *  THEY CARRY NO STATUS AND THAT IS THE POINT (ADR-0226 D4). A flower's verdict is read from
 *  its FORM — a bloomed daisy is proven, a closed bud is pending, a wilted nodding head is
 *  failing — so the colour is a MATERIAL, not a channel. That is why they are their own record
 *  rather than a sixth field on {@link STATUS_TOKENS}, and why {@link statusFamilyOf} must go
 *  on reporting `null` for them: a flower colour genuinely belongs to no status family, and
 *  making one up would be the art asserting a state the work does not hold (ADR-0367 D5).
 *
 *  `--flower-glow-proven` is DELIBERATELY ABSENT. The glow is drawn at opacity 0.10/0.16 over
 *  whatever is behind it, and a blend of two entries is a colour on NEITHER — the one thing a
 *  closed palette cannot represent. It is dropped rather than approximated; the bloom says
 *  "proven" with its petals, which is what ADR-0226 D4 asked of it in the first place. */
export const MARKER_TOKENS = {
  stem: '#6f9257',
  leaf: '#7ea363',
  bud: '#7f9d5c',
  petalProven: '#fbf3e0',
  centreProven: '#eab94e',
  petalFailing: '#b9b3a7',
  centreFailing: '#8f8672',
} as const;

/** Authored tokens shared by EVERY status, so they discriminate none: the wheat override and
 *  the story tree's bole. They are palette entries like any other — {@link landPalette} closes
 *  over them — but they are excluded from {@link statusFamilyOf}'s family test, because a token
 *  every family carries can answer "which family is this" for none of them. */
export const SHARED_TOKENS = {
  wheat: '#d6b271',
  storyTrunk: '#6e533d',
} as const;

/** THE AUTHORED LIGHT DIRECTION, as three plain numbers.
 *
 *  It lives with the tokens rather than with the material, because it is AUTHORED ART in
 *  exactly the way they are: a live land is still a 2.5D isometric picture (ADR-0380 D6 fence
 *  4 — the projection does not move), so the light is a fixed direction someone chose, not a
 *  scene-graph light a camera could swing around.
 *
 *  Keeping it in the pure half also lets geometry DERIVE from it rather than guess at it — the
 *  UAT bloom's tilt is read off this vector, because a daisy faces the light, and a number read
 *  off the light cannot drift away from the light the way a hand-picked one silently would. */
export const LIGHT_DIR_AUTHORED: readonly [number, number, number] = [-0.45, 0.82, 0.35];

/** The authored shade ladder — the ONLY multipliers a surface may wear, from the
 *  compositor's `KEY_SHADE` plus its flat/seam levels. A live material quantises its
 *  continuous lighting term ONTO this ladder; nothing else is representable.
 *
 *  Kept SORTED ASCENDING: `bandShade` relies on the order, and a test asserts the order
 *  rather than trusting the literal to stay sorted through a later edit. */
export const SHADE_LEVELS: readonly number[] = [0.78, 0.8, 0.9, 1.0];

/** Parse `#rrggbb` to integer channels. Throws on a malformed token — an authored palette
 *  entry that does not parse is a corpus error, not a pixel to guess at. */
export function parseHex(hex: string): Rgb255 {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) throw new Error(`palette-band: not a #rrggbb token: ${JSON.stringify(hex)}`);
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
  const t = parseHex(token);
  const m = bandShade(lambert);
  const q = (v: number) => Math.min(255, Math.max(0, Math.round(v * m)));
  return { r: q(t.r), g: q(t.g), b: q(t.b) };
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
  if (i < 0) throw new Error(`palette-band: bandShade returned ${banded}, not a ladder member`);
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

/** Every authored token an ISLAND may wear, deduped, in a stable order — the ground and wall
 *  families, the story tree's crowns and bole, and the UAT flowers' materials.
 *
 *  IT GREW WHEN THE ISLAND DID, AND THAT IS WHAT KEEPS THE FENCE A FENCE. The palette is the
 *  closure of (authored token x authored level), and `capture.mjs` refuses any delivered pixel
 *  outside it. An island that grows flowers and a tree therefore either declares their authored
 *  tokens here — same provenance, same transcription, same app CSS — or delivers colours the
 *  check has to be told to ignore. The first is a palette; the second is a palette with an
 *  exception, and an exception is how a closed palette stops being closed. */
export function landTokens(): string[] {
  const out: string[] = [];
  const push = (t: string): void => {
    if (!out.includes(t)) out.push(t);
  };
  for (const st of Object.keys(STATUS_TOKENS).sort()) {
    const fam = STATUS_TOKENS[st]!;
    for (const t of [...fam.top, fam.wheat, fam.side]) push(t);
  }
  for (const st of Object.keys(TREE_TOKENS).sort()) push(TREE_TOKENS[st]!.crown);
  for (const t of Object.values(SHARED_TOKENS)) push(t);
  for (const t of Object.values(MARKER_TOKENS)) push(t);
  return out;
}

/** The tokens that belong to no single status: the shared overrides and every flower material.
 *  {@link statusFamilyOf} reports `null` for their delivered colours BY DESIGN, so a caller
 *  auditing foreign-status reads needs this set to tell "family-less on purpose" from "in the
 *  palette and unaccounted for". Without it a wheat cell or a daisy petal reads as a defect. */
export function familylessTokens(): string[] {
  return [...Object.values(SHARED_TOKENS), ...Object.values(MARKER_TOKENS)];
}

/** Every colour the family-less tokens can deliver — the set a foreign-status audit subtracts
 *  before asking {@link statusFamilyOf} anything. */
export function familylessPalette(): string[] {
  const set = new Set<string>();
  for (const token of familylessTokens()) {
    for (const c of paletteImageOfToken(token)) set.add(toHex(c));
  }
  return [...set].sort();
}

/** The CLOSED palette a live-rendered land may emit: the full closure of
 *  (authored token x authored level), as `#rrggbb`, sorted. The count is the number the
 *  experiment reports against the shipped land-only 86 / dressed 132 entries. */
export function landPalette(): string[] {
  const set = new Set<string>();
  for (const token of landTokens()) {
    for (const c of paletteImageOfToken(token)) set.add(toHex(c));
  }
  return [...set].sort();
}

/** Which authored status family a delivered colour belongs to, or `null` when it is not a
 *  palette entry at all. The FOREIGN-STATUS instrument: a live material is honest only if
 *  every pixel it draws for a `healthy` instance reports `healthy`.
 *
 *  `wheat` is deliberately EXCLUDED from the family test — it is one shared override token
 *  every status carries, so it belongs to all of them and can discriminate none. Including
 *  it would make the instrument report a collision on every island and read as a defect. */
export function statusFamilyOf(colour: Rgb255): string | null {
  const hex = toHex(colour);
  for (const st of Object.keys(STATUS_TOKENS)) {
    const fam = STATUS_TOKENS[st]!;
    const tree = TREE_TOKENS[st];
    // The tree's crown IS status-bearing — `--crown-healthy-lo` says healthy as surely as the
    // ground does — so it joins the family test rather than sitting outside it. The BOLE does
    // not: `--story-trunk` is one shared brown every status wears, so it is family-less with the
    // wheat override (see `familylessTokens`).
    const tokens = tree ? [...fam.top, fam.side, tree.crown] : [...fam.top, fam.side];
    for (const token of tokens) {
      for (const c of paletteImageOfToken(token)) if (toHex(c) === hex) return st;
    }
  }
  return null;
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
