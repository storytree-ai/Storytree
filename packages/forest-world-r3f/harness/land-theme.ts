// land-theme.ts — A THEME, AND THE FLOOR NO THEME MAY SHIP WITHOUT CLEARING (ADR-0461 D3).
//
// THE DECISION THIS BUILDS. ADR-0461 D3: *"Themes are permitted, and every theme is held to the
// SAME separation floor. A theme may move every hue on the map; it may not let one state read as
// another. That is a RELATIONAL rule, which is why it survives theming where a fixed palette could
// not — and it is checkable per theme."*
//
// ⚠⚠ THE RISK THIS REMOVES, STATED AS THE THING THAT GOES WRONG WITHOUT IT. Before ADR-0461 an art
// change could only be wrong about APPEARANCE. After it, a theme can be wrong about MEANING across
// a whole palette at once — every state on the map, in one edit — and nothing else in this repo
// would notice, because every other instrument is pinned to the SHIPPED tokens. A theme that has
// not been run through this floor has not been checked.
//
// ⚠ THE OWNER'S SEQUENCING STEER, and it is NOT in tension with the floor. Recorded on
// `oq-may-the-shipped-map-s-land-carry-a-worn-path-and-what-doe` 2026-08-27: *"we can tighten it up
// if things get too wild and I can no longer tell, but its a taste thing that needs a human eye, so
// I rather grant more flexibility to start off with."* START LOOSE, TIGHTEN REACTIVELY. So this
// module fences NOTHING about how a theme LOOKS — any hue, anywhere, at any saturation. The floor
// is a backstop against a theme that has stopped REPORTING, which is a different question from
// whether the map reads well; the owner's eye remains the arbiter of the second. A session reading
// the steer as licence to skip the floor has inverted it.
//
// ── WHAT A THEME IS ────────────────────────────────────────────────────────────────────────────
//
// A set of substitutions KEYED ON THE SIX TERRAIN NAMES — `forest`, `heath`, `fallow`,
// `wheatfield`, `swamp`, `scree` — all six owner-settled on 2026-08-28. Source names a terrain; a
// theme resolves the name to delivered colour AND to the land geometry that carries it. That is
// "the resolution layer ADR-0461 D2 implies": no raw hex at a call site, and no hue in a token
// name, because the terrain half of a name survives a theme while the hue half goes stale the
// first time a theme moves it.
//
// ⚠ IT IS KEYED ON THE TERRAIN, NOT ON THE STATE, AND THE DIFFERENCE IS LOAD-BEARING. A state is
// what the work holds; a terrain is what the map draws for it. ADR-0461 D1 binds the two, and a
// theme is only ever allowed to move the second. A theme keyed on states could quietly re-map
// which state gets which land, which is a semantic change wearing an art change's clothes.
//
// ── THE FLOOR IS TWO HALVES, BECAUSE THE TWO QUESTIONS NEED TWO INSTRUMENTS ─────────────────────
//
// PURE (this module, provable under `bun test`):
//   (a) COLOUR — `status-vocabulary.ts`'s `vocabularySeparation`, called with the THEME's token
//       table. That function already takes the table as an argument precisely because this is the
//       shape a per-theme floor needs; a second colour-distance function is not written here and
//       must not be (`ground-cover.ts`'s header, `land-colour-vocabulary-is-five-over-six`).
//   (b) GEOMETRY — every colour-blind pair a theme creates must be assigned distinct terrain
//       geometry. ⚠⚠ THIS IS NECESSARY, NOT SUFFICIENT, AND SAYING SO IS NOT A HEDGE. Distinct
//       authored geometry is not the same claim as distinguishable DELIVERED PIXELS: the numbers
//       here are what was written down, not what a reader sees. The pixel half is the one that
//       adjudicates that.
//
// PIXEL (`theme-measure.mjs`, a measure driver): `terrain-separation.ts`'s `pairVerdict` over
//   rendered regions, per theme. `readTerrain` needs delivered pixels, so this half CANNOT be a
//   pure rung and this module does not pretend it can.
//
// ── THE BARS ARE READ OFF CONTROLS, NEVER PICKED ───────────────────────────────────────────────
//
// The colour half's bar is `vocabularySeparation`'s own: one lighting step on the families being
// compared, measured in the same call. The geometry half's bar is {@link shippedGeometryFloor} —
// the SHIPPED vocabulary's own weakest link between any two of its lands, computed in the same
// run. Read as a sentence: *two lands a theme leaves the same colour must be at least as different
// as the two most similar lands we already ship.* Neither is a number anybody chose, which is the
// house pattern (`frame-budget.ts`, `capture.mjs`'s holes instrument, `cover-measure.mjs`,
// `status-vocabulary.ts`) and matters more here than usual: `grain-picture-is-renderer-specific`
// measured a quarter of grained pixels landing on a different ladder rung between SwiftShader and
// an RTX 2060, so an absolute figure over rendered land is one machine's figure.
//
// ⚠ WHERE THE SHIPPED THEME'S OWN GEOMETRY VERDICT IS WEAK, SAID PLAINLY. The bar is derived from
// the shipped table, so for the SHIPPED theme the control and the subject are the same artifact
// and the check is a self-comparison — the blindness
// `self-comparison-invariance-suites-are-blind-by-construction` describes. It is meaningful for a
// CANDIDATE theme, which is what it exists for; the shipped table is pinned separately by a
// committed digest in `land-theme.test.ts` so that moving it is a visible two-place edit.
//
// ⚠ THE MUTATION RUNG CANNOT REACH THIS FILE. `pnpm gate`'s `check:mutation-diff` skips
// `harness/**` verbatim — the harness sits outside any workspace project's `src/`, and on PR #1687
// it printed `SKIP — … 5 changed .ts file(s) sit outside any project's src/`. Mutation evidence for
// this module is HAND-RUN and recorded in `docs/research/chapter2-land-theme-2026-08-28/README.md`
// §3, never produced by the gate.

import { STATUS_TOKENS, type StatusFamily, parseHex, toHex } from './palette-band.js';
import {
  STATUS_COLOUR,
  vocabularySeparation,
  type LandColour,
  type SeparationVerdict,
} from './status-vocabulary.js';
import {
  TERRAINS,
  terrainFeature,
  type Terrain,
  type TerrainName,
} from './terrain-vocabulary.js';

/** The six terrain names a theme must resolve, in the vocabulary's own order. All six are
 *  owner-settled (2026-08-28) — none of them is a proposal any more. */
export const THEME_KEYS: readonly TerrainName[] = TERRAINS.map((t) => t.name);

/** What a theme says about one terrain: the colour family it wears and the land it is. */
export interface ThemeTerrain {
  /** The authored family — the same shape `STATUS_TOKENS` carries, so a theme's table drops
   *  straight into every instrument and renderer that already takes one. */
  family: StatusFamily;
  /** How much longer a feature runs ALONG the bearing than across it. `1` is undirected. */
  stretch: number;
  /** The bearing, in radians in the ground plane. */
  bearing: number;
  /** Multiplier on the grain's lattice spacing — below 1 is finer than the base grain. */
  lattice: number;
}

/**
 * A THEME.
 *
 * ⚠ NAMED FOR ITS CHARACTER, NEVER FOR ITS HUES, for the same reason ADR-0461 D2 gives for terrain
 * tokens: a theme called `blue-theme` is a name that can be falsified by editing the thing it
 * names. `high-summer` cannot.
 */
export interface LandTheme {
  id: string;
  title: string;
  /** One line: what this theme IS, so a reader can judge it without rendering it. */
  character: string;
  /** Every one of the six terrain names, resolved. A partial theme is refused rather than
   *  defaulted — a terrain silently falling back to the shipped land is a theme that reports
   *  a state in another theme's clothes. */
  terrain: ReadonlyMap<TerrainName, ThemeTerrain>;
}

/** A theme resolved into the shapes the instruments and the renderer take. */
export interface ResolvedTheme {
  theme: LandTheme;
  /** The six terrains, in `TERRAINS` order, wearing this theme's colour and land. */
  terrains: readonly Terrain[];
  /** The token table keyed by STATE — the argument `vocabularySeparation` and the renderer's
   *  own family lookup both take. */
  tokens: ReadonlyMap<string, StatusFamily>;
  /** The terrain a state wears under this theme. */
  terrainByState: ReadonlyMap<string, Terrain>;
}

// ---------------------------------------------------------------------------
// Authoring helpers
// ---------------------------------------------------------------------------

/** Scale a hex's channels and clamp — the operation the authored families' own variants stand in
 *  to each other (`healthy`'s `top[1]` is ~0.90x `top[0]`, `top[2]` ~1.08x, `side` ~0.71x). */
function scaleHex(hex: string, k: number): string {
  const c = parseHex(hex);
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return toHex({ r: clamp(c.r), g: clamp(c.g), b: clamp(c.b) });
}

/**
 * A family from ONE authored hex, using the shipped families' own internal ratios.
 *
 * ⚠ IT IS A CONVENIENCE FOR AUTHORING A THEME, NOT A DERIVATION OF THE SHIPPED PALETTE. The
 * shipped families are hand-transcribed from the app's CSS and must never be regenerated from
 * this — a palette derived from a formula would agree with the formula whatever the app does.
 */
export function familyFrom(top: string, wheat: string): StatusFamily {
  return {
    top: [top, scaleHex(top, 0.9), scaleHex(top, 1.08)],
    wheat,
    side: scaleHex(top, 0.71),
  };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a theme into terrains, a state-keyed token table, and a state→terrain map.
 *
 * ⚠ IT REFUSES RATHER THAN DEFAULTS, in three places, and each refusal is a state the floor could
 * not honestly judge:
 *   - a MISSING terrain name — a state would fall through to another theme's land;
 *   - an UNKNOWN terrain name — a theme resolving a name the vocabulary does not have is keyed on
 *     something that is not the vocabulary;
 *   - a SPLIT of ADR-0462's shared colour class. `proposed` and `building` deliberately wear one
 *     token (five colours over six states), and a theme giving them two makes SIX colour classes.
 *     ⚠ The refusal is not a judgment that splitting is wrong — it is that this floor cannot
 *     MEASURE it: `status-vocabulary.ts` enumerates exactly the five classes `LAND_COLOURS` names,
 *     so a sixth is unreachable by the instrument, and an unmeasurable theme must not pass a
 *     floor. Lifting it means widening that module (ADR-0462's, not this layer's) and re-deciding
 *     the five-over-six settlement.
 */
export function resolveTheme(theme: LandTheme): ResolvedTheme {
  const known = new Set<string>(THEME_KEYS);
  for (const name of theme.terrain.keys()) {
    if (!known.has(name)) {
      throw new Error(
        `land-theme: theme '${theme.id}' resolves '${name}', which is not one of the six terrains ` +
          `(${THEME_KEYS.join(', ')}).`,
      );
    }
  }
  const terrains: Terrain[] = [];
  const tokens = new Map<string, StatusFamily>();
  const byState = new Map<string, Terrain>();
  for (const base of TERRAINS) {
    const entry = theme.terrain.get(base.name);
    if (entry === undefined) {
      throw new Error(
        `land-theme: theme '${theme.id}' says nothing about '${base.name}' (${base.state}). A ` +
          'partial theme would draw that state in another theme’s land.',
      );
    }
    const resolved: Terrain = {
      name: base.name,
      state: base.state,
      provenance: base.provenance,
      character: base.character,
      stretch: entry.stretch,
      bearing: entry.bearing,
      lattice: entry.lattice,
      token: entry.family.top[0]!,
    };
    terrains.push(resolved);
    tokens.set(base.state, entry.family);
    byState.set(base.state, resolved);
  }
  // The class-integrity refusal. Two states ADR-0462 puts in ONE colour class must resolve to one
  // family; the check reads the class partition from `STATUS_COLOUR`, which is hand-authored
  // upstream of every token table rather than derived from one.
  const byClass = new Map<LandColour, string[]>();
  for (const [state, colour] of STATUS_COLOUR) {
    if (!tokens.has(state)) continue;
    byClass.set(colour, [...(byClass.get(colour) ?? []), state]);
  }
  for (const [colour, states] of byClass) {
    const seen = new Set(states.map((s) => JSON.stringify(tokens.get(s))));
    if (seen.size > 1) {
      throw new Error(
        `land-theme: theme '${theme.id}' gives ${states.join(' and ')} different colours. ` +
          `ADR-0462 settled them as one class ('${colour}', five colours over six states) and the ` +
          'separation instrument enumerates exactly five classes, so a sixth cannot be measured. ' +
          'Splitting them re-decides ADR-0462; it is not a theme choice.',
      );
    }
  }
  return { theme, terrains, tokens, terrainByState: byState };
}

// ---------------------------------------------------------------------------
// The geometry channel
// ---------------------------------------------------------------------------

/**
 * HOW FAR APART TWO LANDS ARE AS GEOMETRY — the pure half's distance, in OCTAVES.
 *
 * Two channels, mirroring the two `terrain-separation.ts`'s `pairVerdict` reads off delivered
 * pixels, so the pure prediction and the pixel measurement speak one language:
 *
 *   SCALE — `|log2|` of the delivered feature ratio, along the bearing and across it, whichever is
 *     larger. This is `finenessDistance`'s own unit: a land twice as fine as another is one octave
 *     away whether the pair is 2 and 4 crossings or 20 and 40.
 *
 *   DIRECTION — how differently the two lands are DIRECTED. Two parts, added:
 *     `|log2(stretch_a / stretch_b)|`, which is how differently directed they are AT ALL; plus the
 *     folded bearing difference as a fraction of a right angle, weighted by the WEAKER of the two
 *     anisotropies. ⚠ THE WEIGHT IS WHY A BEARING ON AN ISOTROPIC LAND COUNTS FOR NOTHING: an
 *     undirected mottle has no direction to differ in, so `forest` at 0° and a rotated `forest`
 *     are the same land and must score zero, not a right angle. The bearing folds into [0, 90°]
 *     because a bearing is an AXIS, not a heading — rows at 10° and at 190° run the same way.
 *
 * ⚠⚠ THE OCTAVE CONVERSION ON THE DIRECTION CHANNEL IS AN AUTHORED CONVENTION AND WAS FITTED TO
 * NOTHING. A right angle between two lands each directed by one octave is *declared* worth one
 * octave of separation. There is no measurement behind that exchange rate and none is claimed —
 * the two channels are not commensurable, and putting them in one `max` needs a rate whether or
 * not one can be derived. It is said out loud here rather than buried because a reader could
 * otherwise take the number for a measured one. What keeps that acceptable: the PIXEL half is what
 * actually adjudicates a theme, and it reads the two channels SEPARATELY off delivered pixels with
 * no exchange rate at all (`pairVerdict`'s `separatedByDirection` / `separatedByScale`). This
 * channel exists to catch the obviously-collapsed theme before anyone spends a GPU on it, and the
 * rate would have to be wrong by a large factor to change a verdict — the shipped pairs it ranks
 * sit between 0.77 and 5.2 octaves.
 */
export interface GeometryDistance {
  scale: number;
  direction: number;
  /** The channel that carries the pair — the larger of the two. ⚠ EITHER IS ENOUGH, the same
   *  claim `pairVerdict` makes: two lands running crosswise are told apart by direction, two
   *  running the same way at different scales by their grain. */
  carried: number;
}

const HALF_TURN = Math.PI;
const RIGHT_ANGLE = Math.PI / 2;

export function geometricDistance(a: Terrain, b: Terrain, baseFeature: number): GeometryDistance {
  const fa = terrainFeature(a, baseFeature);
  const fb = terrainFeature(b, baseFeature);
  const octaves = (p: number, q: number): number =>
    p > 0 && q > 0 ? Math.abs(Math.log2(p / q)) : 0;
  const scale = Math.max(octaves(fa.along, fb.along), octaves(fa.across, fb.across));

  const sa = Math.log2(Math.max(1, a.stretch));
  const sb = Math.log2(Math.max(1, b.stretch));
  // Fold onto [0, RIGHT_ANGLE]: a bearing is an axis, so 170° apart is 10° apart.
  let dAng = Math.abs(a.bearing - b.bearing) % HALF_TURN;
  if (dAng > RIGHT_ANGLE) dAng = HALF_TURN - dAng;
  const direction = Math.abs(sa - sb) + (dAng / RIGHT_ANGLE) * Math.min(sa, sb);

  return { scale, direction, carried: Math.max(scale, direction) };
}

/** One shipped pair and the channel that carries it — what {@link shippedGeometryFloor} returns
 *  alongside its number, so the bar always arrives with the evidence for it. */
export interface GeometryFloor {
  /** The bar: the smallest `carried` distance between any two SHIPPED lands. */
  bar: number;
  /** Which shipped pair sets it — printed beside every verdict so the control is never anonymous. */
  from: string;
}

/**
 * THE CONTROL. The shipped vocabulary's own weakest link, measured in the same run as whatever is
 * being judged against it.
 *
 * ⚠ THE TEST OF AN HONEST BAR IS WHERE A NUMBER PICKED TO PASS WOULD HAVE SAT
 * (`pixel-threshold-reads-off-a-same-run-control`). The shipped theme's own colour-blind pair
 * (`fallow` / `wheatfield`) sits at ~2.83 octaves; a number chosen to let it through would sit just
 * under 2.83. This bar is ~0.77, set by a completely different pair (`heath` / `swamp`) that colour
 * already separates and that nobody was trying to make pass.
 */
export function shippedGeometryFloor(baseFeature: number): GeometryFloor {
  let out: GeometryFloor = { bar: Infinity, from: '' };
  for (let i = 0; i < TERRAINS.length; i++) {
    for (let j = i + 1; j < TERRAINS.length; j++) {
      const a = TERRAINS[i]!;
      const b = TERRAINS[j]!;
      const d = geometricDistance(a, b, baseFeature);
      if (d.carried < out.bar) out = { bar: d.carried, from: `${a.name}/${b.name}` };
    }
  }
  if (!Number.isFinite(out.bar)) {
    throw new Error('land-theme: the shipped vocabulary offers no pair to read a bar from');
  }
  return out;
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

/** One colour-blind pair's standing against the geometry bar. */
export interface ThemePairStanding {
  pair: string;
  states: [string, string];
  distance: GeometryDistance;
  bar: number;
  ratio: number;
  separated: boolean;
}

export interface GeometryVerdict {
  /** ⚠ NECESSARY, NOT SUFFICIENT — a pass here says the theme AUTHORED two different lands, not
   *  that a reader can see two different lands. `theme-measure.mjs` answers the second. */
  pass: boolean;
  bar: number;
  barFrom: string;
  /** Every pair of terrains this theme leaves wearing the same colour, tightest first. */
  pairs: ThemePairStanding[];
}

export interface ThemeVerdict {
  theme: string;
  /** No state may read as another: the colour half AND the geometry half. */
  pass: boolean;
  colour: SeparationVerdict;
  geometry: GeometryVerdict;
}

/**
 * THE GEOMETRY HALF, over an already-resolved set of lands.
 *
 * ⚠ IT IS SPLIT OUT FROM {@link themeSeparation} SO ITS REFUSAL IS REACHABLE. `resolveTheme`
 * guarantees the colour-blind pair survives, so through that door the vacuity arm below can never
 * run — and a branch nobody can execute is a branch nobody knows works. Taking the lands as an
 * argument gives the test a door to the arm without weakening the one the themes come through.
 *
 * ⚠ A LAND SET WITH NO COLOUR-BLIND PAIR IS REFUSED, NOT PASSED. The vocabulary guarantees one
 * (ADR-0462: `proposed` and `building` share a token), so an empty pair set means the resolution
 * lost it — and a geometry half with nothing to check would report a vacuous pass with the calm
 * authority of a real one. That is the exact shape `terrain-vocabulary.test.ts`'s own non-vacuity
 * test guards for the shipped table, arriving here by another road.
 */
export function geometryVerdict(terrains: readonly Terrain[], baseFeature: number): GeometryVerdict {
  const floor = shippedGeometryFloor(baseFeature);
  const pairs: ThemePairStanding[] = [];
  for (let i = 0; i < terrains.length; i++) {
    for (let j = i + 1; j < terrains.length; j++) {
      const a = terrains[i]!;
      const b = terrains[j]!;
      if (a.token !== b.token) continue;
      const distance = geometricDistance(a, b, baseFeature);
      pairs.push({
        pair: `${a.name}/${b.name}`,
        states: [a.state, b.state],
        distance,
        bar: floor.bar,
        ratio: floor.bar > 0 ? distance.carried / floor.bar : Infinity,
        separated: distance.carried > floor.bar,
      });
    }
  }
  pairs.sort((x, y) => x.ratio - y.ratio);
  if (pairs.length === 0) {
    throw new Error(
      'land-theme: this land carries no colour-blind pair. ADR-0462 guarantees one (proposed and ' +
        'building share a token), so a geometry verdict over it would be vacuous — it would report ' +
        'a pass having compared nothing.',
    );
  }
  return { pass: pairs.every((p) => p.separated), bar: floor.bar, barFrom: floor.from, pairs };
}

export function themeSeparation(theme: LandTheme, baseFeature: number): ThemeVerdict {
  const resolved = resolveTheme(theme);
  const colour = vocabularySeparation(resolved.tokens, STATUS_COLOUR);
  const geometry = geometryVerdict(resolved.terrains, baseFeature);
  return { theme: theme.id, pass: colour.pass && geometry.pass, colour, geometry };
}

/** The floor as a one-line sentence — what a driver prints and what an evidence sheet carries. */
export function themeVerdictLine(v: ThemeVerdict): string {
  const c = v.colour;
  const g = v.geometry;
  const tight = g.pairs[0]!;
  return (
    `${v.pass ? 'CLEARS' : 'REFUSED'} — colour: tightest ${c.tightest.pair} ` +
    `${c.tightest.ratio.toFixed(2)}x its bar, ${c.foreignReads.length} foreign read(s); ` +
    `land: tightest ${tight.pair} ${tight.distance.carried.toFixed(2)} octaves ` +
    `against ${g.bar.toFixed(2)} from ${g.barFrom} (${tight.ratio.toFixed(2)}x)`
  );
}

// ---------------------------------------------------------------------------
// The themes
// ---------------------------------------------------------------------------

/**
 * Build a theme from one authored hex per terrain, keeping the shipped land geometry.
 *
 * ⚠ A COLOUR-ONLY THEME IS A REAL THEME, not a degenerate one. Most of what a theme is for is
 * hue; the geometry channel exists so a theme CAN move the land, not so every theme must.
 */
function colourTheme(
  id: string,
  title: string,
  character: string,
  tops: Record<TerrainName, string>,
  wheat: string,
): LandTheme {
  const terrain = new Map<TerrainName, ThemeTerrain>();
  for (const t of TERRAINS) {
    terrain.set(t.name, {
      family: familyFrom(tops[t.name], wheat),
      stretch: t.stretch,
      bearing: t.bearing,
      lattice: t.lattice,
    });
  }
  return { id, title, character, terrain };
}

/** Degrees to radians, so the tables below read in the units a person authors in. */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * THE SHIPPED LAND, expressed as a theme.
 *
 * ⚠ IT IS BUILT FROM `TERRAINS` AND `STATUS_TOKENS` RATHER THAN RE-TRANSCRIBED, and that is the
 * one place in this file where deriving from the subject is right: this theme's job is to BE the
 * shipped land, so a copy that could drift from it would be a theme that quietly stopped being the
 * reference every other theme is compared against.
 */
export const SHIPPED_THEME: LandTheme = (() => {
  const terrain = new Map<TerrainName, ThemeTerrain>();
  for (const t of TERRAINS) {
    const family = STATUS_TOKENS.get(t.state);
    if (family === undefined) throw new Error(`land-theme: no shipped family for ${t.state}`);
    terrain.set(t.name, { family, stretch: t.stretch, bearing: t.bearing, lattice: t.lattice });
  }
  return {
    id: 'shipped',
    title: 'The shipped land',
    character: 'the land as it stands on the map today — the reference every theme is read against',
    terrain,
  };
})();

/**
 * A HOT, DRY, HIGH-KEY LAND — a colour-only theme, so the land geometry is the shipped land's and
 * every difference from it is hue. That makes the pair of them a clean one-variable comparison.
 *
 * Authored against the floor rather than against taste alone: an earlier draft put `scree` at a
 * bleached bone `#c9c3b4` and the check REFUSED it — `yellow/grey` at 0.62x its bar with three
 * foreign reads, the straw and the stone reading as each other. The cool stone here is what
 * cleared it.
 */
export const HIGH_SUMMER_THEME: LandTheme = colourTheme(
  'high-summer',
  'High summer',
  'hot and bleached — a green burnt toward olive, sienna scrub, amber crop and cool pale stone',
  {
    forest: '#6b9c36',
    heath: '#8a4430',
    fallow: '#e6a94a',
    wheatfield: '#e6a94a',
    swamp: '#2c2d26',
    scree: '#a3b8bf',
  },
  '#e2c98d',
);

/**
 * A COLD, LOW-SUN LAND — and the theme that moves BOTH channels, so the resolution layer is
 * exercised rather than merely available. The ground is coarser throughout (frozen, broad), the
 * worked fields swing round to a different bearing, and the crop is heavier.
 *
 * ⚠ THE COLOUR-BLIND PAIR IS STILL SEPARATED, AND IT HAD TO BE DELIBERATE. `fallow` and
 * `wheatfield` share a token under every theme (ADR-0462), so moving the land is exactly where a
 * theme can destroy the only channel those two have left. They stay ~2.6 octaves apart in feature
 * scale here, which the floor checks rather than trusts.
 */
export const COLD_SEASON_THEME: LandTheme = (() => {
  const tops = {
    forest: '#2f4d45',
    heath: '#5c4642',
    fallow: '#c9974f',
    wheatfield: '#c9974f',
    swamp: '#1b1f22',
    scree: '#86a4c2',
  } satisfies Record<TerrainName, string>;
  const land = {
    forest: { stretch: 1, bearing: 0, lattice: 1.2 },
    heath: { stretch: 1.4, bearing: deg(104), lattice: 1.5 },
    fallow: { stretch: 5, bearing: deg(40), lattice: 3.0 },
    wheatfield: { stretch: 3.2, bearing: deg(40), lattice: 0.72 },
    swamp: { stretch: 1, bearing: 0, lattice: 2.4 },
    scree: { stretch: 1, bearing: 0, lattice: 0.5 },
  } satisfies Record<TerrainName, { stretch: number; bearing: number; lattice: number }>;
  const terrain = new Map<TerrainName, ThemeTerrain>();
  for (const t of TERRAINS) terrain.set(t.name, { family: familyFrom(tops[t.name], '#b9a888'), ...land[t.name] });
  return {
    id: 'cold-season',
    title: 'Cold season',
    character: 'low sun and hard ground — dark pine, cold umber scrub, ochre stubble, pale ice stone',
    terrain,
  };
})();

/** Every theme that is offered. ⚠ How many themes exist and whether a viewer can switch them is
 *  NOT decided here — ADR-0461 D5 leaves both open, and this increment builds the mechanism. These
 *  three exist so the mechanism has something to be true of. */
export const THEMES: readonly LandTheme[] = [SHIPPED_THEME, HIGH_SUMMER_THEME, COLD_SEASON_THEME];

export function themeById(id: string): LandTheme | undefined {
  return THEMES.find((t) => t.id === id);
}

// ---------------------------------------------------------------------------
// The themes that must NOT pass
// ---------------------------------------------------------------------------

/**
 * ⚠⚠ THEMES AUTHORED TO BE REFUSED. THEY ARE NOT OFFERED AND MUST NEVER BE ADDED TO {@link THEMES}.
 *
 * WHY THEY ARE COMMITTED RATHER THAN WRITTEN INSIDE A TEST. An instrument with no input that makes
 * it say no is not an instrument, and this factory has caught four checks in two days that were
 * structurally incapable of failing. These are the inputs that make it say no, kept where the
 * measure driver can render them too — so the refusal is a PICTURE as well as an assertion, and a
 * later reader can see what a collapsed map actually looks like rather than taking the number's
 * word for it.
 *
 * ⚠ EACH ONE BREAKS EXACTLY ONE HALF OF THE FLOOR, which is the point. If both halves broke
 * together, a floor that had silently lost one of them would still refuse both themes and read as
 * healthy.
 */
export const REFUSED_THEMES: readonly LandTheme[] = [
  // ── breaks the COLOUR half, and does it the way a real theme would ──────────────────────────
  // Not by giving two states one hex, which nobody would author by accident, but by pulling the
  // scrub and the standing water toward each other until the lit ladder can slide one onto the
  // other. This is ADR-0414 D4's failure exactly: two tints separated mainly by brightness
  // collide as soon as the shader's 0.78..1.00 ladder spans the gap between them.
  colourTheme(
    'dusk-flats',
    'Dusk flats (REFUSED)',
    'a low-contrast dusk in which the scrub and the standing water converge — the colour half must refuse this',
    {
      forest: '#4d5c3a',
      heath: '#4a4238',
      fallow: '#c3ab63',
      wheatfield: '#c3ab63',
      swamp: '#3b362e',
      scree: '#8d8f8a',
    },
    '#c0ab84',
  ),
  // ── breaks the LAND half while the COLOUR half passes ───────────────────────────────────────
  // High summer's palette exactly — so the colour half returns a clean pass — with `fallow` given
  // `wheatfield`'s land. The two states then share a colour AND a land, which is the one thing the
  // vocabulary exists to prevent, and colour has nothing left to say about it. A floor that had
  // lost its geometry half would pass this theme.
  (() => {
    const terrain = new Map<TerrainName, ThemeTerrain>();
    const wheat = HIGH_SUMMER_THEME.terrain.get('wheatfield')!;
    for (const [name, entry] of HIGH_SUMMER_THEME.terrain) {
      terrain.set(
        name,
        name === 'fallow'
          ? { family: entry.family, stretch: wheat.stretch, bearing: wheat.bearing, lattice: wheat.lattice }
          : entry,
      );
    }
    return {
      id: 'levelled-fields',
      title: 'Levelled fields (REFUSED)',
      character:
        'high summer’s colours with the ploughed field given the standing crop’s own land — the geometry half must refuse this',
      terrain,
    };
  })(),
];
