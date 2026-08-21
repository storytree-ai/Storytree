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

/**
 * THE PROP MATERIALS — stone, wood, fired clay, water, and the vegetation accents (ADR-0406).
 *
 * WHY THEY EXIST AT ALL, because it is a scope decision rather than a palette expansion for its
 * own sake. The arc counted its island against the owner's four references and found FOUR kinds
 * of object against eight to fifteen, and exactly ONE material — matte green — against stone AND
 * wood AND brick AND paving AND water. Every reference image reads as a place; ours reads as a
 * field. The gap the count names is CONTENT and MATERIALS, not rendering: the simplest reference
 * has no cast shadow, no ambient occlusion, no relief and no bevels, and still reads better than
 * an island carrying all three.
 *
 * WHY THEY ARE ALLOWED, which is the half a later reader will want. ADR-0406 D1: the harness
 * island REPRESENTS NOTHING. It asserts no capability's proof state and no UAT verdict, so there
 * is no state a decorative material can misreport and ADR-0367 D5 has nothing to bite on. That
 * licence is scoped to this surface — ADR-0406 D2 leaves the product map exactly as it was, and
 * the shipped half of `oq-may-the-island-carry-things-that-mean-nothing-and-may-veg` is still
 * open.
 *
 * WHY THIS DOES NOT BREACH THE LOCKED-PALETTE FENCE (ADR-0380 D6 fence 3, read by ADR-0406 D3).
 * The fence's property is that every delivered pixel is an authored `(token x level)` closure
 * entry — which is what lets `capture.mjs` REFUSE rather than merely report. That property is
 * indifferent to how many tokens the vocabulary holds; the shadow rung already grew the closure
 * by 39 entries inside it. So a prop material is added by AUTHORING ITS TOKEN and letting the
 * same banded shader select among the same authored ladder. What stays forbidden is unchanged:
 * free continuous shading, a gradient, a texture, a nearest-entry snap, or an exception in the
 * checker.
 *
 * ⚠ THEY ARE FAMILY-LESS BY CONSTRUCTION AND MUST STAY THAT WAY (ADR-0406 D4). A stone belongs
 * to no status, exactly as a flower's petal material belongs to none (ADR-0226 D4) — so they
 * join {@link familylessTokens}, and `prop-tokens.test.ts` asserts that NO delivered colour of
 * any prop token equals a delivered colour of any status family, on the shadow ladder as well as
 * the lit one. That test is the load-bearing one: a paving slab that delivered `healthy` green
 * would be an ornament indistinguishable from a status read, which is the one thing this licence
 * must not produce even on a surface that asserts nothing — because a human judges this island
 * and carries what he learns to the map.
 *
 * THE COLOURS ARE CHOSEN AGAINST THE REFERENCES, and the two rules behind them are worth stating
 * because they are what makes the set read as materials rather than as a swatch card. FIRST,
 * every one is well off the green/ochre/brown axis the status families occupy — stone is
 * deliberately COOL and desaturated, water is the only teal on the island, and the accents are
 * the reference's own pink/orange rather than a hue picked to be far away. SECOND, each material
 * that has a lit top and a shaded flank gets TWO tokens rather than relying on the ladder: at
 * `LIGHT_DIRECTION` every vertical face lands on rung 0 and every horizontal one on rung 2, so a
 * one-token wall delivers exactly two colours and reads as a silhouette. A separate `-Light`
 * coping or `-Dark` base is what gives built things their edge.
 */
export const PROP_TOKENS = {
  /** Wall coping and the sunlit top course — the lightest built colour on the island. */
  stoneLight: '#c9c2b4',
  /** The body of a dry-stone wall, a well drum, a step. Cool and desaturated on purpose. */
  stone: '#a29a8c',
  /** A wall's footing and the joints between blocks — the built palette's dark end. */
  stoneDark: '#6b675e',
  /** A laid slab. Warmer than `stone` so a path and a wall separate in the same picture. */
  paving: '#bdae97',
  /** Loose gravel and a raked court — a path that is a surface rather than a set of slabs. */
  gravel: '#cbbfa8',
  /** Sawn timber in shade: fence posts, a pergola's uprights, a bridge's deck. */
  wood: '#8b5e39',
  /** The same timber lit — rails, planks, a lit beam. */
  woodLight: '#c08b52',
  /** Fired clay: pots, planters, a chimney pot. The reference's warmest accent. */
  terracotta: '#c8714b',
  /** Roof tile — a deeper clay, so a roof reads as a roof rather than as a large pot. */
  roofTile: '#a94f38',
  /** Still water, lit. The only teal on the island; nothing else can be mistaken for it. */
  water: '#5eb0c4',
  /** Water in shadow, and the depth under a rim. */
  waterDeep: '#37788f',
  /** A shore apron — where the grass stops and the island's edge begins. */
  sand: '#e0d3ac',
  /** A lantern's lit pane. The brightest entry in the whole palette, used sparingly. */
  lantern: '#f5e2a4',
  /** A doorway, a window, the inside of an arch — a void rather than a surface. */
  doorway: '#3c3a47',
  /** A clipped hedge: a deeper, cooler green than any status family's vegetation. */
  hedge: '#4d7a45',
  /** Blossom. An accent colour, not a status (ADR-0406 D1 — this island represents nothing). */
  blossom: '#e493b0',
  /** Marigold — the orange the owner's well-garden reference scatters through its beds. */
  marigold: '#f0a03c',
  /** Thatch and dry reed, for a roof that is not tiled. */
  thatch: '#cba15c',
  /** A SMALL TREE's canopy — the ordinary green one, and the island's commonest object once
   *  the hero tree is gone. Deeper than any status ground family, so a grove reads as a mass
   *  standing ON the land rather than as a patch OF it. */
  canopy: '#5c9147',
  /** The second species in a mixed grove: a deeper, cooler tree. Two silhouettes in one grove
   *  is what the reference does; two COLOURS is not (see `SHADE_KEYS`). */
  canopyDark: '#3d6b3f',
  /** A warm-scheme canopy — the reference's autumn island recolours its trees rather than
   *  adding a species. ADR-0406 D1 makes a tree any colour on this surface. */
  canopyRust: '#a8622f',
} as const;

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
export const SHADE_KEYS: Readonly<Record<string, string>> = {
  // A cool deep teal. Delivers rung 0 at H141 S45 V37 against the token's H103 S51 V57 —
  // dH +38, V x0.65, which sits between the reference's two green trees (+22 and +61, x0.59
  // and x0.61) rather than chasing either one exactly.
  [PROP_TOKENS.canopy]: '#143440',
  // The same rotation on an already-deep green: rung 0 lands H158 S51 V29, V x0.69.
  [PROP_TOKENS.canopyDark]: '#12303c',
  // ⚠ A WARM KEY, AND IT IS A CORRECTION MADE BY MEASURING RATHER THAN A DEFAULT. The first
  // version pointed this token at the same cool teal as the greens, on the reasoning that the
  // reference's ochre island has TEAL cliffs. That is true of its cliffs and false of its
  // TREES — measured, the rust spindle's shade rotates -11 degrees and stays warm. Mixing a
  // saturated orange toward a desaturated teal passes straight through grey: the cool key
  // delivered rung 0 at S29 against the token's S72, a muddy brown that read as a dead tree.
  // A dark warm brown holds the hue (dH -0.5) and the saturation (S65) while still dropping
  // the value to x0.65.
  [PROP_TOKENS.canopyRust]: '#3d2a1e',
};

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
  const key = SHADE_KEYS[token];
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
  // The prop materials close over the same ladder as everything else (ADR-0406 D3). They are
  // last so the pre-prop prefix of this list is unchanged, which is what lets the palette tests
  // assert a STRICT SUPERSET rather than a new set of the same size.
  for (const t of Object.values(PROP_TOKENS)) push(t);
  return out;
}

/** The tokens that belong to no single status: the shared overrides, every flower material, and
 *  every PROP material (ADR-0406 D4). {@link statusFamilyOf} reports `null` for their delivered
 *  colours BY DESIGN, so a caller auditing foreign-status reads needs this set to tell
 *  "family-less on purpose" from "in the palette and unaccounted for". Without it a wheat cell,
 *  a daisy petal or a paving slab reads as a defect — an instrument failing for a reason other
 *  than the one it names, which is a failure this track has paid for repeatedly. */
export function familylessTokens(): string[] {
  return [
    ...Object.values(SHARED_TOKENS),
    ...Object.values(MARKER_TOKENS),
    ...Object.values(PROP_TOKENS),
  ];
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
