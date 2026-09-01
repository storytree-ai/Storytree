// banded-ground-material.ts — THE SHIPPED GROUND'S MATERIAL: the authored shade ladder, on the
// GPU, over a merged multi-status buffer. Browser-bound (it imports three), so it is exported
// via the `./canvas` subpath alongside `ForestWorldCanvas` and NEVER from the pure root barrel
// — the provability firewall holds (`world-to-3d.ts` stays importable under bare `node:test`).
// Its thinking half is `shade-ladder.ts`, which is pure and node-provable; this file only
// carries that contract onto a GPU.
//
// ⚠⚠ WHY THIS IS A SECOND MATERIAL AND NOT `harness/banded-material.ts` MOVED. That one takes
// ONE authored token per material, because the experiment island builds a mesh per prop role and
// can afford a material each. The shipped ground is the opposite shape by construction: 164
// arbitrary polygons that cannot share a geometry, merged into ONE buffer so the island costs one
// draw call instead of 164 (`cell-ground-geometry.ts`). One buffer carrying many statuses cannot
// wear a one-token material. What the two DO share — the ladder, the light, the quantiser, the
// `token x level` arithmetic — is `shade-ladder.ts`, which both import and neither copies.
//
// ⚠⚠ THE GPU PERFORMS NO COLOUR ARITHMETIC, AND THAT IS THE WHOLE DESIGN. The obvious shader
// takes the parcel's colour as a vertex attribute and multiplies it by the rung's level. It is
// wrong here for a measured reason: the GPU's float-to-unorm8 conversion resolves an exact half
// DOWN where `Math.round` takes it UP, which delivered 929 px of `#c2ad5e` against the authored
// `#c2ad5f` the first time this package tried it (`bandLevelIndex`). THREE of this map's own
// products land on exactly that knife edge — `#d8c069`'s blue at level 0.9 (94.5) and
// `#9ca3af`'s at both 0.9 (157.5) and 0.78 (136.5), so TWO of `unknown`'s four rungs are on it
// — and multiplying on the GPU would ship the same defect on the state that means "no data".
// Instead the ramp is built ONCE in TypeScript by `deliveredForLevel`, uploaded as
// finished colours, and the fragment stage SELECTS one. "The delivered pixel is an authored
// entry" is then a bit-identity rather than an approximation.
//
// ⚠ THE FRAGMENT WRITES AUTHORED sRGB STRAIGHT THROUGH, and this is deliberate rather than an
// oversight about colour management. three appends no output transform to a `ShaderMaterial`'s
// `main()` — the `<colorspace_fragment>` chunk lives inside the BUILT-IN materials' sources — so
// what this shader writes is what the framebuffer holds. The ramp is therefore uploaded as the
// authored bytes over 255, with no `THREE.Color` in the path to linearise it. Everything ELSE on
// the canvas (crowns, the story tree's bole, the wisps) keeps three's ordinary colour-managed
// path; nothing here disables `ColorManagement`, because doing so would silently repaint them.
//
// ⚠ AND IT IS UNLIT — no `ambientLight`, no `directionalLight`, no scene light of any kind
// reaches it. The lambert term is computed here against `LIGHT_DIRECTION`, the authored world
// direction the whole land is shaded by, because the ladder's rungs are only meaningful against
// the light they were authored under. A scene light multiplying on top would push every fragment
// off the ladder — which is what a banded ground under `MeshStandardMaterial` would be, and the
// reason this is a material rather than a vertex-colour trick.

import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RedFormat,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from 'three';

import {
  GRAIN_COLOUR_MIX,
  GRAIN_NORMAL_STRENGTH,
  grainGlsl,
  grainStops,
} from './land-grain.js';
import { grassGlsl } from './land-grass.js';
import { sandGlsl } from './land-sand.js';
import { SAND_FIELD_WIDTH } from './shore-atlas.js';
import { type ShadowField } from './land-shadow.js';
import { atlasScale, type AtlasField } from './shadow-atlas.js';
import { LIGHT_DIRECTION, SHADE_LEVELS, bandGlsl, deliveredForLevel } from './shade-ladder.js';
import { shadowLadderFor } from './shadow-rung.js';

/** The attribute a merged ground buffer carries its parcel's RAMP ROW in — the name the shader
 *  declares and the name `ForestWorldCanvas` attaches `CellGroundGeometry.statuses` under. It is
 *  a constant rather than two string literals because a mismatch between them is silent: the
 *  attribute simply never arrives, every fragment reads row 0, and the island paints itself one
 *  status while looking like it is working. */
export const GROUND_STATUS_ATTRIBUTE = 'statusIndex';

/** The attribute a merged ground buffer carries its island's ATLAS ORIGIN in, when the occlusion
 *  field is packed rather than allocated over the ground's rect. Same argument as
 *  {@link GROUND_STATUS_ATTRIBUTE}: a mismatch between the shader's spelling and the canvas's is
 *  silent — every island reads the atlas's top-left corner, and the map wears one island's
 *  shadow everywhere while looking like it is working. */
export const GROUND_ATLAS_ATTRIBUTE = 'atlasOrigin';

/**
 * WHICH HALF of the grain octave the shipped ground wears — and they are separate options rather
 * than one switch because THEY LAND ON OPPOSITE SIDES OF THIS MATERIAL'S WHOLE GUARANTEE.
 *
 *   - `normal` perturbs the lambert BEFORE the quantiser, so the fragment still writes a
 *     `uRamp[...]` entry and the palette closure is untouched. It is what ships.
 *   - `both` additionally mixes a noise-driven ramp INTO the delivered colour, which is the
 *     mechanism the approved Cycles render used and is OFF-PALETTE BY CONSTRUCTION.
 *
 * ⚠⚠ `both` IS NOT ADOPTABLE ON THIS SURFACE TODAY, AND THAT IS A MEASUREMENT RATHER THAN A
 * POLICY. `harness/grain-status-reading.ts` drove all six shipped ground tokens through the
 * colour half's mix arithmetically — exhaustively, since the mix is linear in the grain scalar —
 * and asked the house reader model whether every reachable colour still reports its own status.
 * At the authored fac of 0.13 it does not: the `proposed`/`building` yellow at the ladder's two
 * darkest rungs (0.78, 0.80) walks into `healthy`'s green, and the largest fac every reading
 * survives is 0.031. That is a fence-1 failure (ADR-0392 D5 / ADR-0398 D7) rather than an
 * aesthetic one. `both` exists here so the comparison the owner looks at can show what the
 * closure costs, and so the fork can be put to him against a picture.
 *
 * There is deliberately NO `colour`-only mode, which `harness/banded-material.ts` does have: the
 * experiment needed to isolate the two halves to cost them separately, and that costing is done
 * (`docs/research/chapter2-frame-cost-2026-08-28/`). A mode nothing on this surface would ever
 * ask for is a branch no test can motivate.
 */
export type GroundGrainMode = 'normal' | 'both';

/**
 * LAYER 1 OF THE APPROVED GROUND, as this material wears it: the grass base and its cool/warm
 * hue drift (`src/land-grass.ts`, transcribed from `build_land.py`'s `mat_attribute()`).
 *
 * ⚠⚠ IT IS OFF-PALETTE BY CONSTRUCTION, AND THAT IS WHAT ADR-0490 D5 AUTHORISES RATHER THAN AN
 * OVERSIGHT. The decision names this exact seam — "every layer here enters through the same seam
 * the grain already uses (`uGrainColourMix`) — as a mix INTO the selected status colour, not as
 * a replacement for it" — and a mix into the delivered colour is not a `uRamp` entry. So a
 * grassed material makes `grainKeepsPaletteClosed` report OPEN, correctly, and
 * `banded-ground-material.test.ts` asserts that rather than working around it.
 *
 * ⚠⚠ WHAT REPLACES THE CLOSURE IS A MEASUREMENT AND THEN A LOOK, NOT NOTHING. ADR-0489 D3/D4
 * moved the fence from composition to outcome: the ground may carry colours that report nothing,
 * and the test is whether a viewer can still tell what state an island is in.
 * `harness/grass-status-reading.ts` answers the arithmetic half exhaustively — which mix factors
 * leave every reachable colour reading as its own status — and the session adding the layer
 * applies the look to the picture. Neither half is optional.
 *
 * ⚠ ABSENT MEANS THE EMITTED SOURCE IS BYTE-IDENTICAL to the one this file produced before the
 * grass existed, which is the claim every measured figure about the banded ground rests on.
 */
export interface GroundGrassLayer {
  /** How much of the grass colour enters the delivered pixel — the `fac` of
   *  `mix(statusColour, grassColour, fac)`. There is no default on purpose: the admissible value
   *  is a measurement about the palette this material was handed, so a caller that has not made
   *  one has nothing to inherit. */
  mix: number;
  /**
   * WHICH RAMP ROWS WEAR THE LAYER — ADR-0492 D1's per-token gate, as this material spells it.
   * Row `i` here is the same row `i` {@link BandedGroundMaterialOptions.tokens} indexes, so the
   * caller that owns the token ordering owns this too rather than a second list agreeing with it.
   *
   * ⚠⚠ THE GATE IS WHAT MAKES THE LAYER ADMISSIBLE AT A VISIBLE STRENGTH, not a refinement of
   * it. The admissible mix factor is a per-TOKEN property: `healthy` admits 0.4065 while the
   * `building`/`proposed` yellow admits 0.0095, because at the ladder's darkest rungs a grassed
   * yellow walks into `healthy`'s green and an in-progress parcel reports as signed off. A
   * material handed every row has to hold the yellow's ceiling for all of them, which is forty
   * times smaller and provably invisible. Ungated, this layer cannot ship.
   *
   * ⚠ NO DEFAULT, AND EMPTY IS REFUSED — the same argument {@link mix} makes. "Every row" is not
   * a safe fallback here but the precise input the measurement forbids, and an empty list is a
   * layer that is switched on and gates everything out, which costs a full shader's fragment
   * work to deliver the pixels it delivered before.
   */
  rows: readonly number[];
}

/**
 * LAYER 2 OF THE APPROVED GROUND: the shore sand and the band that carries it
 * (`src/land-sand.ts`, transcribed from `build_land.py`'s `mat_attribute()`).
 *
 * ⚠⚠ IT DOES NOT ADD A SECOND MIX — IT CHANGES WHAT LAYER 1 MIXES IN, and that is the recipe's
 * own structure rather than a saving. In `mat_attribute()` the sand blend's OUTPUT is what the
 * grass output was, and everything downstream composites over it; the beach is not painted on top
 * of the grass, it is the ground being a different colour there. So the delivered pixel is still
 * `mix(statusColour, layerColour, uGrassMix)` — the same seam, at the same strength, through the
 * same ADR-0490 D5 fence — with `layerColour` now `mix(sand, grass, band)` instead of bare grass.
 *
 * ⚠⚠ AND IT THEREFORE INHERITS LAYER 1'S PER-TOKEN GATE, which is the honest answer to "does
 * layer 2 carry a truth cost?" rather than an assumption. Riding `uGrassMix * grassGate` means an
 * ungated row multiplies the whole layer by zero and delivers exactly the pixel it delivered
 * before — so no ungated token's reading can move, by construction. What is NOT free is the GATED
 * token: sand is a genuinely new colour family on the green, and whether green still reads as
 * green through it is a measurement (`harness/grass-status-reading.ts`), not an inference.
 *
 * ⚠ IT NEEDS THE PACKED ATLAS, not the rect occlusion form, and is refused without it. The shore
 * field is sampled through the SAME `shUv` the shadow uses — one tile corner on the mesh, one
 * scale on the material — so a second packing cannot disagree with the first about where an
 * island sits. Under the rect form there is no per-island tile to ride.
 */
export interface GroundSandLayer {
  /** The packed distance-to-coast field, over the OCCLUSION atlas's own tiles
   *  (`buildAtlasShore`). Single-channel bytes; the shader decodes to ground units. */
  shore: Texture;
  /**
   * How much of the sand colour enters the delivered pixel, INSIDE the band.
   *
   * ⚠⚠ ITS OWN FACTOR, SEPARATE FROM LAYER 1'S, AND THAT SEPARATION IS WHAT MAKES THE LAYER
   * ADMISSIBLE AT ALL. Under one shared factor the two layers have one joint ceiling — 0.235 —
   * which is BELOW layer 1's shipped 0.32, so adopting the sand that way would have quietly
   * dimmed the grass that already ships. Fenced on its own, the sand's ceiling with layer 1 held
   * at 0.32 is 0.16, and layer 1 is untouched. Same argument as ADR-0492's, one level down: do
   * not force one component's ceiling onto another's.
   */
  mix: number;
  /**
   * The beach's width in ground units, as the `BEACH + 0.9` divisor the recipe applies.
   *
   * ⚠ A UNIFORM RATHER THAN A WRITTEN-IN CONSTANT, so a page varying the width compiles ONE
   * shader and its arms differ in one number — which is what makes a difference between two arms
   * attributable to the width their captions name.
   *
   * ⚠⚠ IT MUST EQUAL THE WIDTH THE SHORE FIELD WAS BUILT FOR. The field caps its distances at its
   * own band, so a wider divisor here reads a field that has already flattened, and the beach
   * stops dead at the old width — a hard step that looks like a bug in the edge noise rather than
   * a mismatch between two numbers.
   */
  width: number;
}

export interface BandedGroundMaterialOptions {
  /** The authored `#rrggbb` ground token for each ramp ROW, in row order. Row `i` is what a
   *  vertex carrying `statusIndex === i` wears. The caller owns the ordering and must use the
   *  same one for `cellGroundGeometry`'s `index` resolver — `ForestWorldCanvas` derives both
   *  from one `Map`, so there is one ordering rather than two that agree today. */
  tokens: readonly string[];
  /** WEAR the high-frequency grain octave. Absent means the generated shader source is
   *  byte-identical to the one this file emitted before the grain existed — the same claim
   *  `harness/banded-material.ts` makes about its own options, and
   *  `banded-ground-material.test.ts` asserts it rather than stating it. */
  grain?: GroundGrainMode;
  /** WEAR the approved ground's LAYER 1 — the grass base and its hue drift. See
   *  {@link GroundGrassLayer}; absent leaves the emitted source byte-identical.
   *
   *  ⚠ IT REQUIRES {@link grain}, and the material REFUSES the combination without it rather
   *  than emitting a shader that will not link. `grassGlsl()` calls `st_grainOctave`, which
   *  `grainGlsl()` declares — one lattice hash serving both layers, because two spellings of one
   *  field in one shader is a GLSL redefinition error at best and a silent divergence at worst.
   *  Every material this map builds is grained already, so the constraint costs a real caller
   *  nothing; what it buys is that the failure is a message rather than a black island. */
  grass?: GroundGrassLayer;
  /** WEAR the approved ground's LAYER 2 — the shore sand and its band. See
   *  {@link GroundSandLayer}; absent leaves the emitted source byte-identical.
   *
   *  ⚠ IT REQUIRES {@link grass} AND {@link shadowAtlas}, and the material refuses either
   *  combination rather than emitting a shader that will not link or one that samples a field
   *  through coordinates nothing computed. */
  sand?: GroundSandLayer;
  /** RECEIVE the ground-space occlusion field — the cast shadows and contact pools of whatever
   *  stands on this land, merged into one scalar. Absent means this material is not shadowed and
   *  its ramp stays the four authored rungs, so an unshadowed island delivers exactly the pixels
   *  it delivered before shadows existed. Built by {@link groundShadowTexture}, so the texture
   *  and the rect it is sampled through can never disagree about which ground the samples cover. */
  shadow?: GroundShadow;
  /** RECEIVE the occlusion field as a PACKED ATLAS instead — one texture holding every island's
   *  own field at the authored resolution, side by side, with the sea between them left out of
   *  the allocation.
   *
   *  ⚠ MUTUALLY EXCLUSIVE WITH {@link shadow}, and refused rather than resolved by precedence: the
   *  two forms disagree about how a fragment finds its sample, so a material handed both would
   *  shade correctly under whichever one the code happened to check first and the other option
   *  would sit there reading as though it were doing something.
   *
   *  ⚠ IT NEEDS THE MESH'S HELP, which {@link shadow} does not. The origin is a per-vertex
   *  attribute ({@link GROUND_ATLAS_ATTRIBUTE}), so a geometry built without
   *  `CellGroundGeometryInput.atlasOrigin` draws every island through the atlas's top-left tile.
   *  That is the one failure mode of this form that looks like art rather than like a bug. */
  shadowAtlas?: GroundShadowAtlas;
  /** THE LIT LADDER this material quantises its lighting scalar onto. Absent means the authored
   *  `SHADE_LEVELS`, and the shipped canvas passes nothing — so the source it emits is
   *  byte-identical to the one every measured figure about the banded ground was taken against.
   *
   *  ⚠ IT IS HERE FOR THE COMPARISON, NOT AS A DIAL SOMEBODY MAY TURN IN PRODUCTION. Which
   *  ladder the map wears decides how dark a shaded parcel gets, and therefore how much reading
   *  margin the ground has left over for anything else — a look decision with a semantic cost,
   *  which ADR-0392 D5 reserves to the owner. What the option buys is that candidate ladders
   *  render through THIS material rather than through a second implementation, so an arm on the
   *  comparison page can honestly claim to differ in exactly one thing.
   *
   *  ⚠ THE SHADOW RUNG IS RE-DERIVED AGAINST IT. A shadowed material asks `shadowLadderFor` how
   *  dark THIS ladder's tokens may go, so a candidate does not silently inherit the shipped
   *  ladder's 0.77 — a stale derived number of exactly the class the fourth crossing was written
   *  to prevent. */
  lit?: readonly number[];
}

/** The occlusion field, uploaded, with the ground rect it covers. */
export interface GroundShadow {
  texture: Texture;
  minX: number;
  minZ: number;
  spanX: number;
  spanZ: number;
}

/** A packed occlusion atlas, uploaded, with the ground→UV SCALE every tile shares. The per-tile
 *  ORIGIN is not here: it rides on the mesh, because it is what differs per island. */
export interface GroundShadowAtlas {
  texture: Texture;
  /** Atlas UV per ground unit, x and z. `gres / atlasEdge` — derived by `atlasScale` rather than
   *  spelled here, so the packing and the shader cannot hold two copies of one number. */
  scaleU: number;
  scaleV: number;
}

/**
 * Upload a packed {@link AtlasField} as a single-channel texture.
 *
 * SAME FILTERING AND WRAPPING AS {@link groundShadowTexture}, and the tile borders do not need
 * more. `OCCLUSION_PAD` already leaves six texels of empty field between an island's own land and
 * its tile's edge at the authored resolution, and a bilinear tap reaches one — so no fragment
 * over ground the mesh actually covers can sample a neighbouring tile. `shadow-atlas.ts`'s
 * `tileMargin` is what says so, and would say so loudly if the pad ever moved.
 */
export function groundAtlasTexture(field: AtlasField): GroundShadowAtlas {
  const tex = new DataTexture(field.data, field.w, field.h, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const scale = atlasScale(field);
  return { texture: tex, scaleU: scale.u, scaleV: scale.v };
}

/**
 * Upload a {@link ShadowField} as a single-channel texture.
 *
 * LINEAR FILTERING, ON PURPOSE, AND IT COSTS NOTHING. The fragment stage THRESHOLDS this scalar
 * (one shadow rung means the decision is binary), so interpolation cannot introduce a colour — it
 * only moves WHERE the edge falls, to sub-texel precision, and the palette closure is untouched
 * either way. Nearest filtering would staircase the shadow's outline along the field's own grid
 * at the zoomed read, which looks like a defect in the shadow rather than in the sampling.
 */
export function groundShadowTexture(field: ShadowField): GroundShadow {
  const tex = new DataTexture(field.data, field.w, field.h, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return {
    texture: tex,
    minX: field.minX,
    minZ: field.minZ,
    spanX: field.w / field.gres,
    spanZ: field.h / field.gres,
  };
}

/** A delivered colour as a GLSL literal, 0..1 per channel. The grain stops are AUTHORED
 *  constants, so they are written into the source rather than uploaded — the same argument
 *  `bandGlsl` makes about the ladder: a shader and a test holding private copies of one number
 *  prove nothing about each other. */
function glslVec3(c: { r: number; g: number; b: number }): string {
  return `vec3(${(c.r / 255).toFixed(6)}, ${(c.g / 255).toFixed(6)}, ${(c.b / 255).toFixed(6)})`;
}

/**
 * THE RAMP, FLATTENED — every `(token, level)` product this material can deliver, row-major, as
 * 0..1 channel triples ready to upload.
 *
 * Row-major and not level-major, so `row * levels.length + rung` is the index, which is the one
 * arithmetic the shader does. Exported because it is what a test enumerates to prove the closure:
 * the reachable set of this material is exactly this array, with no sampling.
 *
 * ⚠ `levels` DEFAULTS TO THE AUTHORED LADDER AND IS AN ARGUMENT ONLY BECAUSE OF THE SHADOW. A
 * shadowed material's ramp is one entry longer per row and NOTHING ELSE CHANGES: the extra entry
 * is `token x SHADOW_RUNG`, a member of the same `(authored token x authored level)` closure the
 * palette is defined as. The shadow costs palette ENTRIES; it does not cost the closure.
 */
export function groundRamp(
  tokens: readonly string[],
  levels: readonly number[] = SHADE_LEVELS,
): number[][] {
  const out: number[][] = [];
  for (const token of tokens) {
    for (const level of levels) {
      const c = deliveredForLevel(token, level);
      out.push([c.r / 255, c.g / 255, c.b / 255]);
    }
  }
  return out;
}

/** The generated fragment-stage selection: a comparison chain rather than `uRamp[idx]`, because
 *  GLSL ES 1.0 forbids a dynamic index into a uniform array. Generated from the ramp's own length
 *  so it cannot fall short of it — a hand-typed chain that stopped early would paint every status
 *  past the cut-off with row 0's colour, which is a foreign-status read on the surface whose whole
 *  job is to report status. */
export function rampSelectGlsl(entries: number): string {
  // ⚠ BUILT WITH `Array.from` RATHER THAN AN INDEXED `for`, and that is a mutation-rung finding
  // rather than a style preference. The loop's `i < entries` and `i += 1` came back UNPROVEN —
  // killed, but with no test named — which the rung treats as neither a pass nor a survivor, and
  // which the `bun` runner's coverage attribution does to inline single-statement loop bodies
  // (`mutation-rung-misreports-inline-chains`). With the counter gone there is nothing left to
  // mis-attribute, and every remaining mutant lands on arithmetic a test names directly.
  const rest = Array.from(
    { length: Math.max(0, entries - 1) },
    (_, i) => `if (idx == ${i + 1}) c = uRamp[${i + 1}];`,
  );
  return ['vec3 c = uRamp[0];', ...rest].join('\n        ');
}

/**
 * THE PER-TOKEN GATE, as GLSL — one scalar that is 1.0 on the rows the layer dresses and 0.0
 * everywhere else, so the mix below it is a multiply rather than a branch around the write.
 *
 * ⚠ THE ROWS ARE WRITTEN INTO THE SOURCE RATHER THAN UPLOADED, unlike the mix factor, and the
 * reason is the same one {@link rampSelectGlsl} exists for: GLSL ES 1.0 will not let a fragment
 * shader index a uniform array with a computed index, so a `uGrassRows[row]` lookup is not
 * available to write even if it were wanted. It is also the right shape — the mix factor is the
 * one number a comparison arm varies, while WHICH tokens wear the layer is structural, so
 * writing it in keeps a four-arm page compiling one shader per factor rather than per gate.
 *
 * ⚠ THE ROW TEST IS `int(vStatus + 0.5)`, THE SAME SPELLING THE RAMP INDEX USES, and that is
 * load-bearing rather than tidy: `vStatus` arrives interpolated, so a bare cast would read
 * 1.9999998 as row 1 and gate the wrong token — dressing a foreign status and leaving the green
 * flat, which is precisely the misreport the gate exists to prevent.
 */
export function grassGateGlsl(rows: readonly number[]): string {
  const tests = rows.map((row) => `if (int(vStatus + 0.5) == ${row}) grassGate = 1.0;`);
  return ['float grassGate = 0.0;', ...tests].join('\n        ');
}

/** One line of the LIT-rung remap. A named function rather than an expression inside a callback:
 *  the mutation rung cannot attribute a mutant inside an inline arrow body to the test that kills
 *  it, and an unattributable mutant reds the rung from inside well-covered arithmetic. */
function litRemapLine(from: number, to: number): string {
  return `if (rung == ${from}) lvl = ${to};`;
}

/** GLSL mapping each `SHADE_LEVELS` index onto its index in the SHADOW-EXTENDED ladder.
 *
 *  ⚠ IT IS A REMAP RATHER THAN AN OFFSET, and that is not defensive. `deepestAdmissibleRung` can
 *  in principle return a level sitting BETWEEN two authored rungs, in which case the sorted ladder
 *  does not simply shift every lit rung up by one. Assuming it does would paint the wrong colour
 *  for every fragment on the map the day the palette moves, silently. */
export function litRemapGlsl(litIndex: readonly number[]): string {
  return Array.from({ length: litIndex.length }, (_, i) => litRemapLine(i, litIndex[i]!)).join(
    '\n        ',
  );
}

/** One line of the shadow's own remap. Named for the same reason as {@link litRemapLine}. */
function darkenLine(from: number, rungIndex: number): string {
  return `if (rung == ${from}) lvl = ${rungIndex};`;
}

/** GLSL sending every DARKENABLE lit rung to the shadow rung — those LIGHTER than it. A fragment
 *  already darker keeps its own level, because a shadow that BRIGHTENED a surface would be a
 *  shadow lighting something up. */
export function shadowDarkenGlsl(darkenable: readonly number[], rungIndex: number): string {
  return Array.from({ length: darkenable.length }, (_, i) =>
    darkenLine(darkenable[i]!, rungIndex),
  ).join('\n            ');
}

/**
 * The banded ground material: `colour = ramp[statusRow * nLevels + bandIndex(lambert)]`.
 *
 * The ladder in the fragment source is INTERPOLATED by `bandGlsl` from the material's own lit
 * ladder (`SHADE_LEVELS` unless a caller overrides it) and the ramp is computed by
 * `deliveredForLevel`, so a shader and a test holding private copies of the same numbers is
 * unrepresentable — the argument `bandGlsl` already makes about the ladder, extended to the
 * colours.
 *
 * THE AMBIENT FLOOR IS DELIBERATELY ABSENT. Adding a constant AFTER quantisation would produce
 * `token * level + ambient`, which is not a closure member. The ladder's darkest rung IS the
 * ambient floor; that is what a locked palette means, and on this surface it is also the fence
 * that stops a shaded `healthy` parcel walking into `unhealthy`'s territory.
 */
export function createBandedGroundMaterial(opts: BandedGroundMaterialOptions): ShaderMaterial {
  // ⚠ THE SHADOW'S RUNG IS DERIVED FROM THIS MATERIAL'S OWN TOKENS, never inherited and never
  // typed. `shadowLadderFor` asks how dark every one of them may go before it reads as another,
  // and THROWS if the answer is "not at all" — a palette that cannot carry a shadow honestly has
  // to fail loudly, because the failure IS the finding (ADR-0392 D5 / ADR-0398 D7).
  const lit = opts.lit ?? SHADE_LEVELS;
  // ⚠ REFUSED, NOT RESOLVED BY PRECEDENCE. The two occlusion forms disagree about how a fragment
  // finds its sample; a material handed both would shade through one of them and leave the other
  // reading as though it were doing something.
  if (opts.shadow !== undefined && opts.shadowAtlas !== undefined) {
    throw new Error(
      'banded-ground-material: both a rect occlusion field and a packed atlas were supplied — ' +
        'they are two spellings of one input and only one of them can be the one being drawn',
    );
  }
  const occluded = opts.shadow !== undefined || opts.shadowAtlas !== undefined;
  const ladder = occluded ? shadowLadderFor(opts.tokens, lit) : null;
  const ramp = groundRamp(opts.tokens, ladder === null ? lit : ladder.levels);
  if (ramp.length === 0) {
    // A material with an empty ramp compiles to `uRamp[0]` on a zero-length uniform array, which
    // is a link error on some drivers and a black island on others. Refusing is the only reading
    // that cannot be mistaken for art.
    throw new Error('banded-ground-material: no tokens — a ground material with no palette');
  }
  const grainNormal = opts.grain === 'normal' || opts.grain === 'both';
  const grainColour = opts.grain === 'both';
  const grained = grainNormal || grainColour;
  const grass = opts.grass;
  // ⚠ REFUSED, NOT SILENTLY REPAIRED BY EMITTING A SECOND LATTICE HASH. `grassGlsl()` calls
  // `st_grainOctave`, which only `grainGlsl()` declares. Emitting a grass-named copy would put
  // two spellings of one field in one shader — which is how this package once acquired three
  // disagreeing status palettes — and repairing it by turning the grain on would silently give
  // the caller a component it did not ask for.
  if (grass !== undefined && !grained) {
    throw new Error(
      'banded-ground-material: the grass layer needs the grain — it evaluates its octaves ' +
        'through `st_grainOctave`, which only the grain source declares',
    );
  }
  // ⚠ AN EMPTY GATE IS REFUSED RATHER THAN TREATED AS "EVERY ROW". Both readings are defensible
  // from the value alone, which is exactly why neither may be guessed: "every row" is the input
  // ADR-0492's measurement forbids, and "no row" is a layer that is switched on, pays a full
  // shader's fragment work, and delivers the pixels the ground drew before it — a landing that
  // looks clean and changes nothing, which is this arc's named failure shape.
  if (grass !== undefined && grass.rows.length === 0) {
    throw new Error(
      'banded-ground-material: the grass layer was given no rows to dress — a gate that ' +
        'matches nothing draws the ungrassed ground at the grassed ground’s cost',
    );
  }
  // ⚠ AND A ROW OUTSIDE THE RAMP IS REFUSED TOO, because it fails INVISIBLY: the emitted test
  // simply never matches, so the shader compiles, the island draws, and the layer is silently
  // absent from a map that reports it as adopted.
  const sand = opts.sand;
  // ⚠ REFUSED FOR THE SAME REASON THE GRASS IS. `sandGlsl()` calls `st_grassScalar` (the sand ramp
  // is driven by layer 1's own base scalar) and `st_grassSrgb` — both of which only `grassGlsl()`
  // declares. Emitting a sand-named copy of either would put two spellings of one field in one
  // shader, and the beach would drift away from the grass it is supposed to be part of.
  if (sand !== undefined && grass === undefined) {
    throw new Error(
      'banded-ground-material: the sand layer needs the grass — its ramp is driven by layer 1’s ' +
        'own base scalar, which only the grass source declares',
    );
  }
  // ⚠ AND IT NEEDS THE PACKED ATLAS. The shore field is sampled through the SAME `shUv` the
  // shadow computes, so without the atlas form there is no per-island tile to ride and no
  // coordinate to sample through. Refused rather than silently falling back to the rect form,
  // which would sample one island's stretch of coast for the whole map.
  if (sand !== undefined && opts.shadowAtlas === undefined) {
    throw new Error(
      'banded-ground-material: the sand layer needs the PACKED occlusion atlas — it rides that ' +
        'atlas’s own tiles, and there is no per-island coordinate without it',
    );
  }
  const strayRow = grass?.rows.find((row) => !Number.isInteger(row) || row < 0 || row >= opts.tokens.length);
  if (strayRow !== undefined) {
    throw new Error(
      `banded-ground-material: the grass layer names row ${strayRow}, which is not a ramp row ` +
        `of the ${opts.tokens.length} this material was handed`,
    );
  }
  const shadowed = ladder !== null;
  const [grainDark, grainLight] = grainStops();

  // ⚠ THE WORLD POSITION RIDES THROUGH ONLY WHEN SOMETHING NEEDS IT. A material with neither
  // the grain nor a shadow must stay byte-identical to the one this file emitted before either
  // existed — otherwise every figure already measured about the banded ground (0 off-palette
  // pixels, 51% cheaper per frame than `MeshStandardMaterial`) would be a figure about a different
  // shader. The REASON line is picked by whichever asked for it, so a GRAINED material's source is
  // unchanged by the shadow's arrival too — the same claim, one rider further along.
  const needsWorld = grained || shadowed;
  const worldReason = grained
    ? '\n        // The grain is authored in GROUND coordinates, so it is sampled in them.'
    : '\n        // The occlusion field is authored in GROUND coordinates, so it is sampled in them.';
  const worldVarying = needsWorld ? '\n      varying vec3 vWorld;' : '';
  const worldAssign = needsWorld
    ? worldReason + '\n        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;'
    : '';

  // ⚠ THE GRAIN UNIFORMS ARE ADDED BY STATEMENT — the same shape `harness/banded-material.ts`
  // uses, and for the same reason plus one the lint rules make sharper. The reason: an ungrained
  // material must carry NO `uGrain*` uniform at all, because a uniform the shader never declares
  // is dead weight a reader would take as evidence the grain is active. The sharper one: the two
  // shorter spellings are both refused, and correctly — annotating the WHOLE uniform object as an
  // open dictionary discards the fact that `uRamp` and `uLightDir` are always there
  // (`no-known-value-widening`), and a `...(cond ? {x} : {})` hides an omission behind an empty
  // object (`no-conditional-empty-object-spread`). An empty dictionary that starts empty discards
  // nothing and omits nothing.
  const grainUniforms: Record<string, { value: number }> = {};
  if (grainNormal) grainUniforms['uGrainNormalStrength'] = { value: GRAIN_NORMAL_STRENGTH };
  if (grainColour) grainUniforms['uGrainColourMix'] = { value: GRAIN_COLOUR_MIX };
  // The grass layer's own factor, by statement for the same two reasons: an ungrassed material
  // must carry NO `uGrass*` uniform at all, and the shorter spellings are refused by the
  // anti-slop rules. It is UPLOADED rather than written into the source, unlike the grain's mix,
  // because it is the one number on this layer a comparison arm varies — a page carrying four
  // facs would otherwise compile four shaders that differ in a constant.
  const grassUniforms: Record<string, { value: number }> = {};
  if (grass !== undefined) grassUniforms['uGrassMix'] = { value: grass.mix };
  // Layer 2's field, by statement for the same two reasons: an unsanded material must carry NO
  // `uShore*` uniform at all, and the shorter spellings are refused by the anti-slop rules.
  const sandUniforms: Record<string, { value: Texture } | { value: number }> = {};
  if (sand !== undefined) {
    sandUniforms['uShoreTex'] = { value: sand.shore };
    sandUniforms['uSandMix'] = { value: sand.mix };
    sandUniforms['uSandWidth'] = { value: sand.width };
  }
  // The occlusion field's two uniforms follow the same by-statement shape, for the same two
  // reasons: an unshadowed material must carry NO `uShadow*` uniform at all, and both shorter
  // spellings are refused by the anti-slop rules.
  const shadowUniforms: Record<
    string,
    { value: Texture } | { value: Vector4 } | { value: Vector2 }
  > = {};
  if (opts.shadowAtlas !== undefined) {
    shadowUniforms['uShadowTex'] = { value: opts.shadowAtlas.texture };
    // The SCALE only — every tile shares it, because the packing puts them all at one resolution.
    // The per-island ORIGIN rides on the mesh; see GROUND_ATLAS_ATTRIBUTE.
    shadowUniforms['uShadowAtlasScale'] = {
      value: new Vector2(opts.shadowAtlas.scaleU, opts.shadowAtlas.scaleV),
    };
  }
  if (opts.shadow !== undefined) {
    shadowUniforms['uShadowTex'] = { value: opts.shadow.texture };
    // The RECT carries the RECIPROCAL spans rather than the spans, so the fragment stage does two
    // multiplies instead of two divides per pixel — and so a zero span surfaces as an Infinity in
    // a uniform here rather than as a whole island quietly reading unshadowed.
    shadowUniforms['uShadowRect'] = {
      value: new Vector4(
        opts.shadow.minX,
        opts.shadow.minZ,
        1 / opts.shadow.spanX,
        1 / opts.shadow.spanZ,
      ),
    };
  }
  const uniforms = {
    uRamp: { value: ramp.map(([r, g, b]) => new Vector3(r, g, b)) },
    uLightDir: {
      value: new Vector3(LIGHT_DIRECTION.x, LIGHT_DIRECTION.y, LIGHT_DIRECTION.z),
    },
    ...grainUniforms,
    ...grassUniforms,
    ...sandUniforms,
    ...shadowUniforms,
  };

  const grainSource = grained ? `\n      ${grainGlsl().split('\n').join('\n      ')}\n` : '';
  // APPENDED AFTER THE GRAIN'S SOURCE, and the order is a requirement rather than a habit: GLSL
  // ES 1.0 resolves calls against declarations already seen, and every grass octave calls
  // `st_grainOctave`.
  const grassSource = grass === undefined ? '' : `      ${grassGlsl().split('\n').join('\n      ')}\n`;
  // Appended AFTER the grass source, because `sandGlsl()` calls `st_grassScalar` and
  // `st_grassSrgb`, and GLSL ES 1.0 resolves calls against declarations already seen.
  const sandSource = sand === undefined ? '' : `      ${sandGlsl().split('\n').join('\n      ')}\n`;
  // The two grain uniforms are declared as ONE appended string rather than as two
  // interpolated ternaries, and that IS the byte-identity claim rather than a formatting
  // preference: a `${cond ? x : ''}` sitting on its own line leaves that line's indentation
  // behind, so an ungrained shader would differ from the one measured on 2026-08-30 by two
  // whitespace-only lines. Byte-identical has to be literal or it is not a claim.
  const grainUniformDecls =
    (grainNormal ? '\n      uniform float uGrainNormalStrength;' : '') +
    (grainColour ? '\n      uniform float uGrainColourMix;' : '');
  // Appended after the grain's, so an ungrassed shader is byte-identical.
  const grassUniformDecls = grass === undefined ? '' : '\n      uniform float uGrassMix;';
  // Appended after the grass's, so an unsanded shader is byte-identical.
  const sandUniformDecls =
    sand === undefined
      ? ''
      : '\n      uniform sampler2D uShoreTex;' +
        '\n      uniform float uSandMix;' +
        '\n      uniform float uSandWidth;';
  // Same appended-string shape, same reason: an unshadowed shader must not merely fail to USE
  // these, it must not declare them.
  const shadowUniformDecls =
    (opts.shadow !== undefined
      ? '\n      uniform sampler2D uShadowTex;' + '\n      uniform vec4 uShadowRect;'
      : '') +
    (opts.shadowAtlas !== undefined
      ? '\n      uniform sampler2D uShadowTex;' + '\n      uniform vec2 uShadowAtlasScale;'
      : '');
  // The atlas is the ONLY form that needs anything from the VERTEX stage, and every one of these
  // is empty for the other two — so an unshadowed shader and a rect-shadowed one both stay
  // byte-identical to the ones every committed figure was taken against.
  const atlased = opts.shadowAtlas !== undefined;
  const atlasAttribute = atlased ? `\n      attribute vec2 ${GROUND_ATLAS_ATTRIBUTE};` : '';
  const atlasVarying = atlased ? '\n      varying vec2 vAtlasOrigin;' : '';
  const atlasAssign = atlased
    ? '\n        // The island\'s tile corner rides through the interpolator. All three vertices of' +
      '\n        // a triangle belong to one island and carry the same corner, so the interpolated' +
      '\n        // value is that corner exactly — the same argument vStatus above makes.' +
      `\n        vAtlasOrigin = ${GROUND_ATLAS_ATTRIBUTE};`
    : '';
  const grainNormalStage = grainNormal
    ? `        // THE GRAIN'S NORMAL HALF — the palette-safe one, and the only one the shipped
        // ground wears. The linearised heightfield normal: a displacement h(x,z) has normal
        // normalize(vec3(-dh/dx, 1, -dh/dz)), so subtracting the gradient from an arbitrary
        // normal is that construction on a surface that is not already flat — which the
        // relief'd land is not.
        //
        // It runs BEFORE the lambert and therefore before the quantiser, so it can only move a
        // fragment between AUTHORED RUNGS of its own token's ramp. That is what keeps the
        // closure, and it is also this half's ceiling: on a four-rung ladder the delivered
        // grain is a stipple between two authored colours rather than the continuous
        // micro-variation Cycles delivers. See land-grain.ts.
        vec2 gradient = st_grainGradient(vWorld.xz);
        n = normalize(n - uGrainNormalStrength * vec3(gradient.x, 0.0, gradient.y));
`
    : '';
  // LAYER 1, COMPOSITED BETWEEN THE RAMP SELECTION AND THE WRITE — which is the recipe's own
  // order and not merely a convenient place. In `mat_attribute()` the grass is the BASE and the
  // grain is applied LAST, over everything; here the base is the parcel's status colour, so the
  // grass mixes into that and the grain's colour half (when a comparison arm asks for it) mixes
  // over the result. Composing them the other way round would grain the status colour and then
  // paint grass over the grain, which is a different picture wearing the same two names.
  const grassStage =
    grass === undefined
      ? ''
      : `        // LAYER 1 — the grass base and its cool/warm hue drift (ADR-0490 D2 row 1),
        // transcribed from build_land.py:836-868 and generated by src/land-grass.ts.
        // ⚠ THIS IS THE LINE THAT LEAVES THE PALETTE. It is authorised by ADR-0490 D5, which
        // names this seam, and fenced by ADR-0489 D3's outcome test rather than by the closure.
        //
        // ⚠⚠ GATED PER TOKEN (ADR-0492 D1), AND THE GATE IS WHAT MAKES THE FACTOR ABOVE LEGAL.
        // Ungated, this layer has to hold the tightest token's ceiling — the yellow's 0.0095,
        // at which the maximum channel shift is under 1/255 and nothing moves. On the rows the
        // gate names, the same measurement admits 0.4065. Every other row multiplies the mix by
        // zero and delivers exactly the pixel it delivered before this layer existed.
        ${grassGateGlsl(grass.rows)}
${
  sand === undefined
    ? '        c = mix(c, st_grassColour(vWorld.xz), uGrassMix * grassGate);\n'
    : `        c = mix(c, st_grassColour(vWorld.xz), uGrassMix * grassGate);
        // LAYER 2 — the shore sand, over layer 1 and masked to the beach (build_land.py:869-893).
        //
        // ⚠⚠ A SECOND SEAM RATHER THAN A BLEND INSIDE LAYER 1'S, AND THE DIFFERENCE IS THE WHOLE
        // REASON THIS LAYER CAN SHIP. The recipe blends sand and grass and mixes the result in
        // ONCE, which forces both layers through one factor — and one factor has one joint
        // ceiling, 0.235, BELOW the 0.32 layer 1 already ships at. Composited that way, adopting
        // the sand would have quietly dimmed the grass on the live map. Given its own factor the
        // sand is fenced on its own measurement (0.16 at layer 1's 0.32) and layer 1's delivered
        // pixel above is byte-identical to the one that ships today. ADR-0490 D5 names the SEAM,
        // not the arity: layer 5's grain already enters as a second mix over the result.
        //
        // ⚠ AND IT INHERITS THE PER-TOKEN GATE — grassGate again, not a gate of its own. An
        // ungated row multiplies the whole layer by zero, so the yellow, red, slate and grey
        // islands deliver exactly the pixel they delivered before this layer existed.
        //
        // ⚠ THE SHORE FIELD RIDES THE SHADOW ATLAS'S OWN COORDINATE. shUv is the tile corner plus
        // the scaled ground position; sampling a second packing here would be a second answer to
        // "where is this island" and every coast would belong to the wrong land.
        //
        // ⚠ AND THE TEXEL IS DECODED TO GROUND UNITS BEFORE THE RECIPE TOUCHES IT, through the
        // SAME width the field was built for. st_sandBand divides by BEACH + 0.9, an arithmetic in
        // ground units; a raw 0..1 texel would be the same expression meaning something else.
        float shoreUnits = texture2D(uShoreTex, shUv).r * uSandWidth;
        float sandBand = st_sandBand(vWorld.xz, shoreUnits, uSandWidth);
        c = mix(c, st_sandColour(vWorld.xz), uSandMix * (1.0 - sandBand) * grassGate);
`
}`;
  const writeColour = grainColour
    ? `        // THE GRAIN'S COLOUR HALF — the mechanism Cycles used, and the one that BREAKS THE
        // CLOSURE. Mixing anything into the delivered colour produces a value that is not an
        // authored ramp entry. It is measured off this surface rather than argued about:
        // harness/grain-status-reading.ts found the authored 0.13 walks the yellow at the two
        // darkest rungs into healthy's green, and 0.031 is the largest fac that does not. This
        // branch exists so a comparison can SHOW what holding the closure costs.
        vec3 grainCol = mix(${glslVec3(grainDark)}, ${glslVec3(grainLight)}, st_grainRamped(vWorld.xz));
        gl_FragColor = vec4(mix(c, grainCol, uGrainColourMix), 1.0);`
    : '        gl_FragColor = vec4(c, 1.0);';

  // WHICH RAMP ENTRY A FRAGMENT LANDS ON. Unshadowed, this is the one line it has always been,
  // byte for byte. Shadowed, the ladder has grown an entry, so the lit rung is REMAPPED into the
  // longer ladder and the occlusion field may then send it to the shadow rung.
  //
  // ⚠ ONE SHADOW RUNG, SO THE DECISION IS BINARY. That is not a simplification — it is what a
  // closed palette with a measured confusability ceiling leaves room for. A penumbra needs
  // INTERMEDIATE rungs, and every one of them costs palette entries and walks a status closer to
  // its neighbour: this palette's tightest reading margin is 3.0 weighted channel units already.
  const indexStage =
    ladder === null
      ? '        // +0.5 then truncate, rather than a bare cast: an interpolated float that arrives as' +
        '\n        // 1.9999998 for row 2 would otherwise select row 1 and report a foreign status.' +
        '\n        int idx = int(vStatus + 0.5) * ST_N_LEVELS + st_bandIndex(lambert);'
      : `${
          atlased
            ? `        // The atlas form: the island's own tile corner, plus the ground position
        // scaled into it. Two multiply-adds against the rect form's two subtract-multiplies —
        // the packing costs the fragment stage nothing, it costs a vec2 on the mesh.
        vec2 shUv = vAtlasOrigin + vec2(vWorld.x, vWorld.z) * uShadowAtlasScale;`
            : `        vec2 shUv = vec2((vWorld.x - uShadowRect.x) * uShadowRect.z,
                         (vWorld.z - uShadowRect.y) * uShadowRect.w);`
        }
        int rung = st_bandIndex(lambert);
        int lvl = 0;
        ${litRemapGlsl(ladder.litIndex)}
        if (texture2D(uShadowTex, shUv).r > 0.5) {
            ${shadowDarkenGlsl(ladder.darkenable, ladder.rungIndex)}
        }
        // +0.5 then truncate, rather than a bare cast: an interpolated float that arrives as
        // 1.9999998 for row 2 would otherwise select row 1 and report a foreign status.
        int idx = int(vStatus + 0.5) * ${ladder.levels.length} + lvl;`;

  return new ShaderMaterial({
    uniforms,
    vertexShader: `
      attribute float ${GROUND_STATUS_ATTRIBUTE};${atlasAttribute}
      varying float vStatus;
      varying vec3 vNormal;${worldVarying}${atlasVarying}
      void main() {
        // The ramp ROW rides through the interpolator. All three vertices of a triangle carry
        // the same parcel's row, so the interpolated value is that row exactly — GLSL ES 1.0
        // has no flat qualifier and does not need one here.
        vStatus = ${GROUND_STATUS_ATTRIBUTE};
        // The normal reaches the fragment stage in WORLD space: the light is an authored world
        // direction, so shading in view space would swing the lighting whenever the camera
        // moved — which on a banded material means visible rungs sliding across static ground.
        vNormal = normalize(mat3(modelMatrix) * normal);${worldAssign}${atlasAssign}
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      ${bandGlsl(lit).split('\n').join('\n      ')}
${grainSource}${grassSource}${sandSource}
      uniform vec3 uRamp[${ramp.length}];
      uniform vec3 uLightDir;${grainUniformDecls}${grassUniformDecls}${sandUniformDecls}${shadowUniformDecls}
      varying float vStatus;
      varying vec3 vNormal;${worldVarying}${atlasVarying}

      void main() {
        vec3 n = normalize(vNormal);
${grainNormalStage}        // Half-lambert: wrapped so the terminator lands inside the ladder's range instead of
        // collapsing every back-facing pixel onto the darkest rung. Still a single scalar, so
        // the closure argument is untouched.
        float lambert = dot(n, normalize(uLightDir)) * 0.5 + 0.5;
${indexStage}
        ${rampSelectGlsl(ramp.length)}
${grassStage}${writeColour}
      }
    `,
  });
}
