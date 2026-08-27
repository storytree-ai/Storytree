// terrain-vocabulary.ts — ADR-0461 D1's TERRAIN VOCABULARY, as data.
//
// THE DECISION THIS BUILDS. ADR-0461 D1: *"A capability's state is carried by a NAMED TERRAIN,
// not by a tint. Each rendered state gets a named land character — `forest`, `swamp`,
// `wheatfield`, … — carrying ground cover, texture, treatment and colour TOGETHER. Colour
// remains one channel of the signal and is not given up; it stops being the ONLY channel."*
//
// ⚠⚠ SIX TERRAINS, NOT FIVE, AND THE COUNT IS BY STATE. ADR-0462 settled the colour vocabulary
// at FIVE colours over SIX states — `proposed` and `building` SHARE one yellow. ADR-0461 D4
// says in terms: *"count the terrains by STATE, never by COLOUR … an increment scoped off the
// colour count will author one treatment too few and will not notice."* So this table has six
// rows and two of them wear the same hex, which is exactly the case the vocabulary exists for:
// once two states share a colour, colour alone CANNOT tell them apart, and terrain is not an
// enrichment there — it is the only carrier.
//
// ⚠ NAMED FOR WHAT THEY ARE, NEVER FOR HOW THEY LOOK (ADR-0461 D2). `forest`, not
// `forest-green`. The terrain half of a name survives a theme; the hue half goes stale the
// first time a theme moves it, leaving a token called `forest-green` painting something that is
// not green. Nothing in this file may acquire a colour word in its name.
//
// ⚠⚠ ONLY THREE OF THE SIX MAPPINGS ARE THE OWNER'S. He named `forest`, `swamp` and
// `wheatfield` on 2026-08-27 ("swap the colors for color theme names like forest-green,
// swamp-black, wheatfield-yellow"), and ADR-0461 D5 says in terms that *"which terrain maps to
// which state beyond the three the owner named"* is NOT decided. The other three — `fallow`,
// `heath`, `scree` — are AUTHORED HERE as a proposal and are flagged as such on every row.
// They are for the owner to look at and accept or move; they are not a decision this file made.
//
// ⚠ WHAT A TERRAIN IS, MECHANICALLY, AND WHY IT IS THIS. A terrain warps the GRAIN OCTAVE's
// sample space before the field is evaluated: a rotation and a non-uniform scale. That is
// enough to turn one proven field into rows, furrows, pools or stony fines without a second
// noise, a second texture, a new vertex attribute or a new dependency — and the grain octave is
// the ONE component of the approved treatment already measured to cross into WebGL
// (PR #1665: +183% pixel-scale contrast, palette CLOSED). ⚠ `land-grain.ts` records that the
// Cycles grain was ANISOTROPIC by accident — generated coordinates normalise per axis — and
// that ours was deliberately authored isotropic at a round 2.5. This file makes that axis a
// DECLARED, per-state carrier rather than an artefact.

import { STATUS_TOKENS } from './palette-band.js';

/** The six states the semantic layer can produce (`packages/forest-world/src/scene.ts:57-64`). */
export const TERRAIN_STATES: readonly string[] = [
  'healthy',
  'mapped',
  'proposed',
  'building',
  'unhealthy',
  'unknown',
];

/** A terrain's name. Six, one per STATE. ⚠ Not five: `proposed` and `building` share a colour
 *  and must not share a terrain, or the map loses the ability to tell them apart at all. */
export type TerrainName = 'forest' | 'heath' | 'fallow' | 'wheatfield' | 'swamp' | 'scree';

/** Who chose a mapping. Recorded per row rather than in prose, because the difference between
 *  "the owner said this" and "a session proposed this" is exactly what a later reader needs and
 *  exactly what prose loses. */
export type TerrainProvenance = 'owner' | 'proposed-here';

export interface Terrain {
  name: TerrainName;
  /** The state it carries. */
  state: string;
  /** Who chose this mapping — see {@link TerrainProvenance}. */
  provenance: TerrainProvenance;
  /** What the terrain IS, in one line. The reason a reader can judge the mapping. */
  character: string;
  /**
   * How much longer a ground feature runs ALONG the terrain's bearing than across it. `1` is
   * the isotropic mottle the grain already delivers; higher values give rows, furrows, ridges.
   */
  stretch: number;
  /** The compass direction the features run, in radians in the ground plane. */
  bearing: number;
  /**
   * Multiplier on the grain's lattice spacing. Below 1 is FINER than the base grain, above 1
   * is coarser. This is what separates two terrains that share a bearing — a standing crop and
   * a ploughed furrow run the same way and are four times apart in scale.
   */
  lattice: number;
  /** The colour channel. ONE channel of the signal (ADR-0461 D1), never the whole of it. */
  token: string;
}

/** `proposed` and `building`'s shared yellow, named ONCE so the two rows below cannot drift
 *  apart. ADR-0462 holds it as one object under two keys for the same reason. */
const SHARED_YELLOW = STATUS_TOKENS.get('proposed')!.top[0]!;

/** Degrees to radians, so the table below reads in the units a person authors in. */
const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * THE VOCABULARY.
 *
 * ⚠ THE PAIR THAT PROVES THE MOST IS `proposed` / `building`. They wear the SAME hex. Every
 * distinction between them is carried by `stretch`, `bearing` and `lattice` — so if the terrain
 * mechanism does not work, those two states become indistinguishable, and a test can say so.
 * `fallow` is the field marked out and ploughed with nothing grown in it yet; `wheatfield` is
 * the crop standing while the work is in flight. Same field, same light, four times apart in
 * feature scale. (`building` is also the only status carrying `spark: true` in `heathConf()`
 * — ADR-0461 notes that the code already carries state through more than hue, partly and
 * undeclared. This makes it declared.)
 */
export const TERRAINS: readonly Terrain[] = [
  {
    name: 'forest',
    state: 'healthy',
    provenance: 'owner',
    character: 'closed canopy over undisturbed ground — no direction, no working',
    stretch: 1,
    bearing: 0,
    lattice: 1,
    token: STATUS_TOKENS.get('healthy')!.top[0]!,
  },
  {
    name: 'heath',
    state: 'mapped',
    provenance: 'proposed-here',
    character: 'open scrub over surveyed ground — walked, marked, not worked',
    stretch: 1.7,
    bearing: deg(72),
    lattice: 1.25,
    token: STATUS_TOKENS.get('mapped')!.top[0]!,
  },
  {
    name: 'fallow',
    state: 'proposed',
    provenance: 'proposed-here',
    character: 'ploughed and set out, nothing grown in it yet — wide bare furrows',
    stretch: 6,
    bearing: deg(18),
    lattice: 2.6,
    token: SHARED_YELLOW,
  },
  {
    name: 'wheatfield',
    state: 'building',
    provenance: 'owner',
    character: 'the crop standing while the work is in flight — fine dense rows',
    stretch: 4,
    bearing: deg(18),
    lattice: 0.55,
    token: SHARED_YELLOW,
  },
  {
    name: 'swamp',
    state: 'unhealthy',
    provenance: 'owner',
    character: 'standing water in broad pools — no direction, coarse and high-contrast',
    stretch: 1,
    bearing: 0,
    lattice: 1.9,
    token: STATUS_TOKENS.get('unhealthy')!.top[0]!,
  },
  {
    name: 'scree',
    state: 'unknown',
    provenance: 'proposed-here',
    character: 'broken stone with nothing growing — the sparsest land there is',
    stretch: 1,
    bearing: 0,
    lattice: 0.42,
    token: STATUS_TOKENS.get('unknown')!.top[0]!,
  },
];

/** The terrain a state wears. */
export function terrainOf(state: string): Terrain | undefined {
  return TERRAINS.find((t) => t.state === state);
}

/** The terrain by name. */
export function terrainNamed(name: TerrainName): Terrain | undefined {
  return TERRAINS.find((t) => t.name === name);
}

/** Every pair of states whose TOKENS are identical — the pairs colour cannot separate, and
 *  therefore the pairs terrain has to. Derived rather than listed, so a palette change that
 *  merged another pair would grow this set instead of being missed. */
export function colourBlindPairs(): { a: Terrain; b: Terrain }[] {
  const out: { a: Terrain; b: Terrain }[] = [];
  for (let i = 0; i < TERRAINS.length; i++) {
    for (let j = i + 1; j < TERRAINS.length; j++) {
      const a = TERRAINS[i]!;
      const b = TERRAINS[j]!;
      if (a.token === b.token) out.push({ a, b });
    }
  }
  return out;
}

/**
 * The DELIVERED feature size of a terrain, along its bearing and across it, in ground units.
 *
 * ⚠ IT IS NOT `lattice`. `land-grain.ts` measured that a smoothstep value-noise field wanders
 * across its mean about once every 2.6 lattice spacings, so the delivered feature is 2.6x the
 * lattice — a factor that decides whether a terrain lands at the pixel scale or up beside the
 * regional variation, and reading `lattice` as a feature size is an error that costs 2.6x.
 * `baseFeature` is `grainFeaturePeriod()` from that module, passed in rather than imported, so
 * this file stays free of the grain's own constants and the two cannot drift silently.
 */
export interface TerrainFeature {
  /** Delivered feature size ALONG the terrain's bearing, in ground units. */
  along: number;
  /** Delivered feature size ACROSS it. For an undirected land the two are equal. */
  across: number;
}

export function terrainFeature(t: Terrain, baseFeature: number): TerrainFeature {
  const across = baseFeature * t.lattice;
  return { along: across * t.stretch, across };
}

/**
 * GLSL for the terrain warp: rotate into the terrain's frame, then squeeze ACROSS the bearing
 * so features run along it, then apply the lattice multiplier.
 *
 * ⚠ THE SQUEEZE IS ON THE SAMPLE COORDINATE, SO IT IS INVERTED RELATIVE TO THE FEATURE. To make
 * a feature LONGER along the bearing you sample the field more SLOWLY along it — divide the
 * along-axis coordinate by `stretch`, do not multiply it. Getting this backwards produces rows
 * running at ninety degrees to the authored bearing, which looks deliberate and is wrong.
 *
 * ⚠ EMITTED ONLY WHEN A TERRAIN IS ASKED FOR. A material with no terrain must compile the
 * source it always did — the same argument `createBandedMaterial` already makes for the grain,
 * and the property `terrainKeepsGrainIntact` states about the generated source.
 */
export function terrainWarpGlsl(t: Terrain): string {
  const c = Math.cos(t.bearing);
  const s = Math.sin(t.bearing);
  return [
    `// GENERATED from terrain-vocabulary.ts for terrain '${t.name}' (${t.state}).`,
    `// stretch ${t.stretch} along ${((t.bearing * 180) / Math.PI).toFixed(1)} deg, lattice x${t.lattice}`,
    'vec2 st_terrainWarp(vec2 p) {',
    `  vec2 r = vec2(p.x * ${c.toFixed(6)} + p.y * ${s.toFixed(6)},`,
    `                -p.x * ${s.toFixed(6)} + p.y * ${c.toFixed(6)});`,
    `  r.x /= ${t.stretch.toFixed(6)};`,
    `  return r / ${t.lattice.toFixed(6)};`,
    '}',
  ].join('\n');
}

/** The warp as a pure function, for tests and for anything reasoning about the field on the
 *  CPU. The GLSL above and this must agree; `terrain-vocabulary.test.ts` holds them together by
 *  parsing the emitted constants out of the source rather than trusting they were kept in step. */
export function terrainWarp(t: Terrain, x: number, z: number): readonly [number, number] {
  const c = Math.cos(t.bearing);
  const s = Math.sin(t.bearing);
  const rx = (x * c + z * s) / t.stretch;
  const rz = -x * s + z * c;
  return [rx / t.lattice, rz / t.lattice];
}
