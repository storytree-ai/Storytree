// shipped-land-scene.ts — THE SHIPPED MAP'S GROUND, AS A LADDER OF FOUR ARMS ON ONE SCREEN.
//
// THE INCREMENT: `improve-the-ground-texture` / `put-the-treatment-on-the-shipped-map` on
// `adopt-the-land-into-the-shipped-map-arc`. The owner authorised adoption on 2026-08-29 and asked,
// on this arc specifically, that every increment land a comparison he can LOOK at — "variants that
// differ in exactly ONE thing, rendered at both zooms, measured on the same instrument, with the
// pictures committed beside the numbers". This is that page, and it GREW A RUNG rather than being
// replaced: the relief comparison it was built for on 2026-08-30 is still its first two arms.
//
// ⚠⚠ THE ARMS ARE THE SAME FUNCTION CALLED FOUR TIMES, and that is what makes this a controlled
// comparison rather than an assertion. Every arm is `src/cell-ground-geometry.ts` over the same
// parcels, the same status rows and the same framing. Between `flat` and `relief` the only
// difference is which relief field is handed in — `FLAT_GROUND` (the identity, which
// `cell-ground-geometry.test.ts` proves is the old buffer byte for byte) or `landRelief`. Between
// `relief` and `banded` the only difference is the MATERIAL. Nothing here re-implements the ground.
//
// ⚠ THE FOURTH ARM IS THE ONE EXCEPTION AND IT SAYS SO — see {@link LAND_ARMS}.
//
// ⚠ THE LIGHT AND THE VIEW DIRECTION ARE THE SHIPPED ONES, NOT PLAUSIBLE ONES, AND THAT MATTERS
// MORE HERE THAN ANYWHERE ELSE ON THIS ARC. Relief moves no colour and adds no mark: the whole
// visible difference is `dot(n, L)`. Lit from somewhere else, this page would be a picture of a
// land the product does not draw. The direction comes from `frameWorld`, IMPORTED from `src/`, and
// the lighting from `SHIPPED_LIGHTING`, which `shipped-baseline.test.ts` parses out of
// `ForestWorldCanvas.tsx` and refuses on drift.
//
// ⚠ THE FRAME, THOUGH, IS THE ISLAND'S OWN AND NOT THE SHIPPED RULE'S — see `buildLandScene` for
// why, and note it is a deliberate refusal to answer a question that belongs to another increment.
//
// ⚠ IT IS RAW THREE RATHER THAN THE R3F COMPONENT, and the reason is a fence rather than
// convenience. `<ForestWorldCanvas>` passes the relief UNCONDITIONALLY — the arc's end-state item
// 6 says a flag nobody flips is not adoption — so there is no "before" component left to mount.
// The before arm therefore has to be built from the geometry function directly, which is exactly
// what the after arm is too.
//
// Browser-bound by design (it imports three), so it is NOT in `scope-fence.test.ts`'s pure sweep —
// the same standing as `kit-scene.ts` and `pine-scene.ts`. Every number it reports is computed in
// the typechecked modules; `shipped-land-measure.mjs` only drives it.

import * as THREE from 'three';

import {
  cellGroundGeometry,
  FLAT_GROUND,
  type GroundRelief,
  type LinearRgb,
} from '../src/cell-ground-geometry.js';
import {
  GROUND_STATUS_ATTRIBUTE,
  createBandedGroundMaterial,
  groundRamp,
  groundShadowTexture,
  type BandedGroundMaterialOptions,
  type GroundGrainMode,
} from '../src/banded-ground-material.js';
import { frameWorld } from '../src/camera-framing.js';
import { configureExactColour } from '../src/exact-colour.js';
import {
  buildProbeRig,
  calibrateLights,
  readProbePixel,
  type LightCalibration,
  type ProbeRig,
} from '../src/light-calibration.js';
import { LAND_RELIEF_AMPLITUDE, landHeightRange, landRelief } from '../src/land-relief.js';
import { buildGroundOcclusion } from '../src/contact-shade.js';
import { groundBounds, groundCasters } from '../src/ground-casters.js';
import { nearestReference, readerReferences, shadowLadderFor } from '../src/shadow-rung.js';
import { deliveredForLevel } from '../src/shade-ladder.js';
import { shadowCoverage, type ShadowCaster } from '../src/land-shadow.js';
import { LEGACY_SHADE_LEVELS, SHADE_LEVELS } from '../src/shade-ladder.js';
import { worldTo3D, type InstanceDescriptor } from '../src/world-to-3d.js';
import { islandScene } from './island-fixture.js';
import { SHIPPED_GROUND_COLOUR, SHIPPED_LIGHTING } from './shipped-baseline.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';
import { kitMeshes, loadKit, roleFootprints } from './kit-scene.js';
import type { LoadedKit } from './kit-scene.js';
import { dressMapWithGroves } from '../src/map-dressing.js';

/**
 * THE SIX ARMS — a LADDER WITH ONE FORK, in which every arm differs from the one it names in
 * exactly ONE thing.
 *
 *   flat          the shipped map as it drew on 2026-08-29
 *   relief        + the land's relief field           (crossed 2026-08-30, PR #1725)
 *   banded        + the authored shade ladder         (crossed 2026-08-30, PR #1726)
 *   grain-normal  + the grain octave's NORMAL half    (crossed 2026-08-30, PR #1731) — ⭐ SHIPPED
 *   shadow        + the ground-space occlusion field  (crossed 2026-08-30, THIS increment)
 *   grain-both    + the grain octave's COLOUR half    (⚠ NOT SHIPPED — see below)
 *
 * ⚠⚠ EACH ARM NAMES ITS OWN PREDECESSOR RATHER THAN INHERITING IT FROM THE ORDER, and this
 * increment is what forced that. The list used to be a straight chain and `LAND_STEPS` was
 * `slice(1)` over it — which was honest while every arm really did follow the one before it, and
 * stopped being honest the moment a second arm hung off `grain-normal`. Both `shadow` and
 * `grain-both` extend the SHIPPED arm; neither extends the other, and an ordinal chain would have
 * silently published "grain-both → shadow" as a one-thing comparison of two things. Naming the
 * predecessor makes that unrepresentable, and it is what a reader has to know to read the table.
 *
 * ⚠ `grain-both` IS A REFERENCE, NOT A CANDIDATE, AND IT IS MEASURED RATHER THAN ASSUMED TO BE.
 * Its colour half mixes a noise ramp INTO the delivered colour, so it is off-palette by
 * construction. `harness/grain-status-reading.ts` asked the sharper question — does that move a
 * pixel into a NEIGHBOURING STATUS's family — by driving all six shipped ground tokens through the
 * mix arithmetically, and the answer at the authored fac of 0.13 is yes: the `proposed`/`building`
 * yellow at the ladder's two darkest rungs reads as `healthy`. The largest fac every reading
 * survives is 0.031. So this arm is here to SHOW what the closure costs, beside the arms that hold
 * it, which is what lets the owner settle the fork on a picture rather than on a paragraph.
 *
 * ⚠ `shadow` IS A CANDIDATE AND IT HOLDS THE CLOSURE, which is the whole difference between the
 * two forks. Its rung is `token x 0.77` — an authored `(token x level)` product, DERIVED as the
 * deepest level at which every shipped ground token still reads as itself, so the palette grows by
 * one entry per row and stays closed. See `src/shadow-rung.ts`.
 */
export type LandArm =
  | 'flat'
  | 'relief'
  | 'banded'
  | 'grain-normal'
  | 'shadow'
  | 'grain-both'
  | 'dense';

/**
 * THE REFINED LADDER IS NOW THE SHIPPED ONE — `REFINED_LADDER` IS GONE, DELIBERATELY.
 *
 * It lived here from 2026-08-30 as the `dense` arm's candidate ladder while the owner decided. He
 * adopted it on `oq-which-shade-ladder-should-the-map-wear-and-the-yellow-doe` ("Adopt it."), so
 * `src/shade-ladder.ts`'s {@link SHADE_LEVELS} IS those nine rungs and a second constant holding
 * the same numbers would be the fork this package has already paid for three times. What is pinned
 * here instead is the OTHER side of the comparison — see {@link LIT_OF}.
 */

/**
 * Is every rung of every token on `lit` still read as its own token, judged against the references
 * THAT LADDER produces?
 *
 * ⚠ IT EXISTS BECAUSE ITS ABSENCE ALMOST PUBLISHED A DISHONEST ARM. The first refined ladder tried
 * here was 0.02-spaced from 0.78, and measured against the SHIPPED ladder's references it looked
 * free — same tightest margin to the last decimal. Against its own it is dishonest. A comparison
 * page may not offer the owner a candidate that misreports, so every arm is held to this.
 */
export function landLadderHonest(lit: readonly number[]): boolean {
  const tokens = [...new Set(GROUND_TOKENS)];
  const refs = readerReferences(tokens, lit);
  const levels = shadowLadderFor(tokens, lit).levels;
  return tokens.every((token) =>
    levels.every((level) => nearestReference(deliveredForLevel(token, level), refs) === token),
  );
}

/** Each arm, what it ADDS, and which arm it adds it TO. `from: null` is the baseline. */
export interface LandArmSpec {
  arm: LandArm;
  /** The arm this one differs from in exactly one thing. */
  from: LandArm | null;
  /** What that one thing is — the caption under its picture, kept beside the arm rather than in
   *  the HTML so a rung cannot be added without a reader being told what it is. */
  adds: string;
}

export const LAND_ARM_SPECS: readonly LandArmSpec[] = [
  { arm: 'flat', from: null, adds: 'the shipped map on 2026-08-29' },
  { arm: 'relief', from: 'flat', adds: '+ the land relief field' },
  { arm: 'banded', from: 'relief', adds: '+ the authored shade ladder' },
  { arm: 'grain-normal', from: 'banded', adds: "+ the grain octave's NORMAL half" },
  { arm: 'shadow', from: 'grain-normal', adds: '+ the occlusion field' },
  {
    arm: 'grain-both',
    from: 'grain-normal',
    adds: "+ the grain octave's COLOUR half (REFERENCE — off-palette, not adopted)",
  },
  {
    arm: 'dense',
    from: 'shadow',
    adds: '+ the ladder refined to 0.025 spacing, 9 rungs (SHIPPED)',
  },
];

export const LAND_ARMS: readonly LandArm[] = LAND_ARM_SPECS.map((spec) => spec.arm);

/** The arms whose every delivered land pixel must be an authored `(token x level)` entry — the
 *  fence the whole surface rests on, as a LIST rather than as a literal in the driver, so adding
 *  an arm forces a decision about which side of the closure it is on.
 *
 *  `flat` and `relief` are excluded because they wear a lit `MeshStandardMaterial` and deliver a
 *  continuous gradient by construction — that is the thing being replaced. `grain-both` is
 *  excluded because it is off-palette on purpose. Everything else must hold, `shadow` included:
 *  its extra rung is an authored product, so the closure grows by one entry per row rather than
 *  opening. */
export const PALETTE_CLOSED_ARMS: readonly LandArm[] = [
  'banded',
  'grain-normal',
  'shadow',
  // ⚠ THE REFINED ARM IS INSIDE THE CLOSURE, and that is the finding rather than an oversight.
  // Every rung it adds is an authored `token x level` product, so refining the ladder GROWS the
  // enumerable set without opening it — the same reading the shadow rung got, one lever further
  // along. The arm that buys texture by LEAVING the closure is `grain-both`, excluded above, and
  // this one is what makes it unnecessary.
  'dense',
];

/** What `changedPct` is asked for, and what the report tables: each arm against the one it names.
 *  Derived from {@link LAND_ARM_SPECS} rather than from the ORDER, so a fork cannot leave the pair
 *  list quietly describing a chain that no longer exists. */
export const LAND_STEPS: readonly (readonly [LandArm, LandArm])[] = LAND_ARM_SPECS.filter(
  (spec): spec is LandArmSpec & { from: LandArm } => spec.from !== null,
).map((spec) => [spec.from, spec.arm] as const);

/** Delivered CSS pixels per ground unit. The same two zooms every other comparison on this arc is
 *  taken at: 2 is roughly the overview a laptop opens on, 8 is the zoomed-in read. On an
 *  orthographic camera `zoom` IS px-per-unit, one number everywhere in the frame — which is the
 *  substance of ADR-0380 D6 fence 4 and the reason these are quotable at all. */
export const LAND_ZOOMS: readonly number[] = [2, 8];

const RELIEF_OF = {
  flat: FLAT_GROUND,
  relief: landRelief,
  banded: landRelief,
  'grain-normal': landRelief,
  shadow: landRelief,
  'grain-both': landRelief,
  dense: landRelief,
} satisfies Record<LandArm, GroundRelief>;

/** Which grain option each banded arm asks the SHIPPED material for. `undefined` is the ungrained
 *  ladder, and it matters that it is undefined rather than a mode meaning "none": an absent grain
 *  leaves the generated shader source byte-identical to the one measured on 2026-08-30, so the
 *  `banded` arm here is the same shader that produced that evidence rather than a near relative.
 *
 *  ⚠ THE TWO PRE-BANDED ARMS ARE ABSENT FROM THIS MAP ON PURPOSE. They wear
 *  `MeshStandardMaterial` and never reach `createBandedGroundMaterial` at all; a `flat: undefined`
 *  entry would read as "the flat arm is ungrained", which is true of a material it does not use. */
const GRAIN_OF = {
  banded: undefined,
  'grain-normal': 'normal',
  // The shadow arm wears the SHIPPED grain, because it differs from `grain-normal` in the shadow
  // and in nothing else. An unshadowed comparison against a grainless arm would be two changes.
  shadow: 'normal',
  'grain-both': 'both',
  // The refined arm wears the SHIPPED grain, because what it changes is the ladder the grain
  // quantises onto and nothing else. Dropping the grain here would compare a refined ladder
  // against a grained one and call the difference the ladder's.
  dense: 'normal',
} satisfies Record<
  'banded' | 'grain-normal' | 'shadow' | 'grain-both' | 'dense',
  GroundGrainMode | undefined
>;

/**
 * The LIT ladder each arm hands the shipped material. Absent means `SHADE_LEVELS` — the NINE rungs
 * the map wears since 2026-08-31 — and `dense` is now the arm that passes nothing.
 *
 * ⚠⚠ THIS MAP INVERTED WHEN THE LADDER WAS ADOPTED, AND THAT IS THE WHOLE POINT OF IT. It used to
 * carry one entry, `dense -> REFINED_LADDER`, with every other arm taking the four-rung default.
 * Adoption made the default the refined ladder — so leaving the map alone would have moved
 * `banded` / `grain-normal` / `shadow` / `grain-both` onto the new ladder too, silently making
 * every figure published about them untrue and collapsing the `shadow -> dense` step into a
 * comparison of a thing with itself. They are therefore PINNED to {@link LEGACY_SHADE_LEVELS},
 * which is what they were measured on, and the one remaining difference between `shadow` and
 * `dense` is the ladder.
 */
const LIT_OF: ReadonlyMap<LandArm, readonly number[]> = new Map([
  ['banded', LEGACY_SHADE_LEVELS],
  ['grain-normal', LEGACY_SHADE_LEVELS],
  ['shadow', LEGACY_SHADE_LEVELS],
  ['grain-both', LEGACY_SHADE_LEVELS],
]);

/** The LIT ladder an arm actually draws — the one place that fallback lives, so the scene, the
 *  palette check and the honesty test cannot disagree about which ladder an arm is on. */
export function litLadderOf(arm: LandArm): readonly number[] {
  return LIT_OF.get(arm) ?? SHADE_LEVELS;
}

/** The arms that wear the ground occlusion field. `shadow` is where it arrived; the refined arm
 *  keeps it because it differs from `shadow` in the ladder and in nothing else — and because a
 *  refined arm that silently dropped the shadow would look like the refinement had brightened the
 *  island. */
const SHADOWED_ARMS: readonly LandArm[] = ['shadow', 'dense'];

/** The ramp ROWS the shipped canvas uses, in its own `GROUND_COLOUR` order - transcribed here off
 *  `SHIPPED_GROUND_COLOUR`, which `shipped-baseline.test.ts` parses out of `ForestWorldCanvas.tsx`
 *  and refuses on drift. So the arm below wears the rows and the tokens the map itself wears. */
export const GROUND_TOKENS: readonly string[] = [...SHIPPED_GROUND_COLOUR.values()];
export const GROUND_ROWS: ReadonlyMap<string, number> = new Map(
  [...SHIPPED_GROUND_COLOUR.keys()].map((status, i) => [status, i]),
);
/** A status variant's ramp ROW, `unknown`'s when the status is unrecognised — the same fallback
 *  the shipped canvas takes, and the same reason: `unknown` is the one state that means "no
 *  data", so any other fallback would have the picture assert something about a status it could
 *  not classify. Exported so a test can drive it; it is the pair to {@link GROUND_TOKENS} and a
 *  disagreement between the two paints every parcel a different status's colour. */
export const groundRowOf = (material: string | undefined): number =>
  GROUND_ROWS.get(material ?? 'unknown') ?? GROUND_ROWS.get('unknown')!;

/** The parcels of the island the studio actually ships — 164 of them, mean diameter 16.57 ground
 *  units, 191 distinct ring vertices of which 185 belong to more than one parcel. That last figure
 *  is why a CONTINUOUS field is watertight here for free. */
/**
 * THE BOUGHT KIT, ONCE, FOR THE WHOLE PAGE.
 *
 * ⚠ IT IS SET RATHER THAN LOADED HERE because `buildLandScene` is SYNCHRONOUS and every
 * measurement on this page depends on that: the driver builds an arm, reads it, and builds the
 * next one inside one animation frame. Parsing a `.glb` is asynchronous, so the page awaits it
 * once during setup and hands it in. An arm asked for props before that has none, and says so by
 * drawing none — which is what makes {@link LandRunner.dressed}'s prop count worth reading.
 */
let landKit: LoadedKit | null = null;

/** Hand the page its kit. The page's own async setup is the only caller. */
export function setLandKit(kit: LoadedKit): void {
  landKit = kit;
}

/**
 * THE PROPS THE SHIPPED CANVAS WOULD STAND ON THIS ISLAND — built through the SAME functions, off
 * the SAME descriptors.
 *
 * ⚠ NOT A PAGE-LOCAL APPROXIMATION. `ForestWorldCanvas` calls `dressMapFromKit` → `kitMeshes` with
 * the kit's own measured footprints, and so does this. An instrument that dressed the island its
 * own way would be picturing something the product does not draw — the failure the three
 * disagreeing status palettes cost an increment to undo.
 *
 * ⚠ THE BLOOM COUNT IS NO LONGER PINNED AT ZERO, and this page is where the change is visible. It
 * used to be, because a bloom is a claim about a STORY's signed UAT criteria and the descriptor
 * stream carried no island attribution — so a count read here would have scattered one story's
 * signatures over every other story's island. `worldTo3D` now names the island on every family
 * that belongs to one, and `dressMapFromKit` spends the signatures per island. This fixture is a
 * healthy story with ten signed criteria, so it now stands ten flowers it previously did not.
 *
 * ⚠ AND SINCE 2026-09-03 IT STANDS THE GROVE TOO — `dressMapWithGroves`, the function the canvas
 * calls, because this fixture is a healthy island and the canvas forests those. A page that kept
 * calling the vocabulary-only dressing would picture the map as it stood before the grove.
 */
export function shippedProps(kit: LoadedKit): THREE.Mesh[] {
  return kitMeshes(
    kit,
    dressMapWithGroves(worldTo3D(islandScene()), {
      relief: LAND_RELIEF_AMPLITUDE,
      footprint: roleFootprints(kit),
    }),
  );
}

export function shippedParcels(): InstanceDescriptor[] {
  return worldTo3D(islandScene()).filter(
    (d): d is InstanceDescriptor => d.kind === 'cell-ground',
  );
}

/**
 * WHAT THE SHIPPED ISLAND'S OWN DESCRIPTOR STREAM STANDS, as occluders.
 *
 * ⚠⚠ IT IS EMPTY SINCE ADR-0508, AND THAT IS THE ANSWER RATHER THAN A BUG. Read the history,
 * because the number here moved twice. Measured 2026-08-30 it was ONE: the semantic scene emits
 * 1,089 objects standing on this ground — 693 grass blades, 144 flora, 112 shrubs, 3 stems, 136
 * tall-flower parts and ONE story tree — and the shipped mapper had a case for the tree and
 * skipped the other 1,088, so the shadow this map could draw was bounded by its own emptiness.
 * That one was the placeholder cone, and it is retired: each island stands a GROVE now, and a
 * grove is a kit PLACEMENT, which reaches the ground through `placementCasters` rather than
 * through the descriptor stream.
 *
 * ⚠ SO THIS IS NO LONGER "EVERYTHING THAT STANDS ON THE ISLAND" AND MUST NOT BE READ AS IT.
 * `ForestWorldCanvas` unions this list with `placementCasters(placements, …)`; a page wanting the
 * shadow the MAP draws has to union it too (`shipped-canopy-scene.ts`'s `armCasters` is the
 * worked example). A page that hands this list alone to `buildGroundOcclusion` is asking for an
 * un-shadowed field, and since 2026-09-04 that is what it gets.
 */
export function shippedCasters(): ShadowCaster[] {
  return groundCasters(worldTo3D(islandScene()));
}

/** Status variant → LINEAR colour, through three's own sRGB transfer function — the same route
 *  `ForestWorldCanvas` takes, so the two arms wear the colours the map reports with.
 *
 *  ⚠ EXPORTED SINCE 2026-08-31 for `shipped-crowd-scene.ts`, which draws the same ground at
 *  forest scale. A second transcription of this three-line function is how two pages that both
 *  claim to draw "the shipped ground" end up delivering two palettes. */
export function linearColourOf(material: string | undefined): LinearRgb {
  const hex =
    SHIPPED_GROUND_COLOUR.get(material ?? 'unknown') ?? SHIPPED_GROUND_COLOUR.get('unknown')!;
  const c = new THREE.Color(hex);
  return { r: c.r, g: c.g, b: c.b };
}

/**
 * THE TRANSFER FUNCTION AN ARM IS DRAWN THROUGH — a second axis, added 2026-08-31, and the reason
 * it exists is that this instrument had a THIRD one.
 *
 * ⚠⚠ Until now three configurations were in play and no two agreed. The approved reference render
 * (`harness/kit-island-scene.ts` → `chapter2-vocabulary-2026-08-29/island-kit-8px.png`) calls
 * `configureExactColour` and calibrates. The SHIPPED canvas mounted @react-three/fiber's default
 * `<Canvas>` — ACES filmic tone mapping, an sRGB output encode, colour management ON — and ran no
 * probe. And THIS page did neither: a bare `new THREE.WebGLRenderer` is sRGB-out, NO tone mapping,
 * colour management on. For the GROUND arms that was harmless and remains so, because three
 * appends neither the tone-mapping nor the colour-space chunk to a raw `ShaderMaterial`, so the
 * banded material writes its authored bytes whatever the renderer holds — which is exactly why
 * every published ground figure on this arc reproduces. It stopped being harmless the moment this
 * page started drawing a DRESSED island: a `MeshStandardMaterial` crown is subject to both, and
 * the props in those pictures were drawn through a transfer function the product did not have.
 *
 * So the pipeline is now something an arm declares, and the default is what SHIPS.
 */
export type LandPipeline = 'app-today' | 'exact' | 'exact-probe';

export interface LandPipelineSpec {
  pipeline: LandPipeline;
  /** What this pipeline changes relative to the one before it. */
  adds: string;
  /** The pipeline it differs from in exactly one thing, or null for the first. */
  from: LandPipeline | null;
}

/** A LADDER, like {@link LAND_ARM_SPECS}: each rung differs from its named predecessor in one thing. */
export const LAND_PIPELINE_SPECS: readonly LandPipelineSpec[] = [
  {
    pipeline: 'app-today',
    adds: "the shipped canvas as it drew on 2026-08-30 — R3F's default ACES + sRGB output, no probe",
    from: null,
  },
  {
    pipeline: 'exact',
    adds: 'exact-colour mode — the transfer function the approved reference render was taken in',
    from: 'app-today',
  },
  {
    pipeline: 'exact-probe',
    adds: "the measured light calibration — a lit white face lands on the ladder's top rung",
    from: 'exact',
  },
];

export const LAND_PIPELINES: readonly LandPipeline[] = LAND_PIPELINE_SPECS.map((it) => it.pipeline);

/** What each pipeline ADDED and to WHAT — read off the specs, never transcribed. */
export function pipelineCaption(pipeline: LandPipeline): string {
  const spec = LAND_PIPELINE_SPECS.find((it) => it.pipeline === pipeline);
  if (spec === undefined) throw new Error(`shipped-land-scene: no spec for pipeline ${pipeline}`);
  return spec.from === null ? spec.adds : `${spec.adds} — on top of ${spec.from}`;
}

/**
 * The factor both scene lights are multiplied by — 1 until a runner measures one.
 *
 * ⚠ A MODULE-LEVEL VALUE RATHER THAN A PARAMETER, deliberately, and it is the same shape as
 * `setLandKit`. The page builds scenes through `buildLandScene` DIRECTLY as well as through the
 * runner (for triangle counts and captions), so a scale threaded only through the runner would
 * light the page's own scenes differently from the ones it measures. One page draws one pipeline;
 * the driver navigates once per pipeline rather than flipping this mid-run, because
 * `THREE.ColorManagement` is a global that is read when a `Color` is CONSTRUCTED — a scene built
 * before a flip keeps the conversion it was built with.
 */
let landLightScale = 1;

/** Set by {@link createLandRunner} once it has probed. Exported for the page's own scene builds. */
export function setLandLightScale(scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`shipped-land-scene: a light scale of ${scale} is not a measurement`);
  }
  landLightScale = scale;
}

export function landLightScaleNow(): number {
  return landLightScale;
}

/**
 * Put a renderer into the named pipeline and return the light scale it implies.
 *
 * ⚠ `app-today` SETS THE THREE FLAGS EXPLICITLY rather than leaving three's defaults, because
 * three's defaults are NOT R3F's: a bare `WebGLRenderer` has `NoToneMapping`, and the arm is
 * supposed to reproduce the CANVAS. Reproducing it by omission is how this instrument came to
 * measure a fourth configuration in the first place.
 */
export function applyLandPipeline(renderer: THREE.WebGLRenderer, pipeline: LandPipeline): void {
  if (pipeline === 'app-today') {
    THREE.ColorManagement.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    return;
  }
  configureExactColour(renderer);
}

/**
 * Configure the renderer and MEASURE what a lit white face delivers in it, before and after the
 * correction the pipeline implies.
 *
 * ⚠ `delivered` IS THE NON-VACUITY, and it is the whole reason this returns two numbers instead of
 * one. `scale = target / probe` is an arithmetic claim about a LINEAR transfer; re-probing with the
 * scaled intensities is what checks it against the renderer rather than against the arithmetic that
 * produced it. In exact-colour mode the two agree to the byte. Through ACES they do not, which is
 * the finding this axis exists to make visible instead of arguable.
 */
export function probePipeline(
  renderer: THREE.WebGLRenderer,
  pipeline: LandPipeline,
): LandPipelineReading {
  applyLandPipeline(renderer, pipeline);
  const floor = SHADE_LEVELS[0]!;
  const target = SHADE_LEVELS[SHADE_LEVELS.length - 1]!;
  const read = (rig: ProbeRig): number => {
    try {
      return readProbePixel(renderer, rig);
    } finally {
      rig.dispose();
    }
  };
  const probe = read(buildProbeRig({ floor, target }));
  // ⚠ ONLY `exact-probe` CALIBRATES, and `calibrateLights` is the thing that decides whether it
  // MAY: it refuses a renderer whose transfer is not linear in intensity. Calling it here rather
  // than dividing by hand is what keeps this arm honest about running the product's own code.
  const cal: LightCalibration =
    pipeline === 'exact-probe'
      ? calibrateLights(renderer)
      : { probe, scale: 1, target, floor };
  const delivered = read(buildProbeRig({ floor: floor * cal.scale, target: target * cal.scale }));
  return {
    pipeline,
    probe,
    scale: cal.scale,
    target,
    delivered,
    outputColorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping,
    colorManagement: THREE.ColorManagement.enabled,
  };
}


/** A ground buffer's extent in CAMERA space — what a fitted orthographic frustum needs.
 *
 *  Computed off the buffer rather than off the ring coordinates, because the relief moves the
 *  vertices AND relief is an upright extent: a frame sized from the flat footprint would crop the
 *  land where it rises, which under a 45° view is the near edge. */
interface CameraBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function projectedBounds(positions: Float32Array, viewMatrix: THREE.Matrix4): CameraBounds {
  const p = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    p.set(positions[i]!, positions[i + 1]!, positions[i + 2]!).applyMatrix4(viewMatrix);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

export interface LandScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  triangles: number;
  parcels: number;
  /** The buffer's own y extent, in ground units — exactly the slab depth for the flat arm, and
   *  that plus the relief's own range for the relieved one. The driver refuses a run where those
   *  two are equal, which is what a page drawing the same thing twice looks like. */
  heightSpan: number;
  /** How much of the occlusion FIELD is past the material's own threshold, or null for an arm
   *  that carries no field. It is a fraction of the padded ground RECT rather than of the island,
   *  so it is comparable across arms and is not the same number as `changedPct`. */
  occlusionCoverage: number | null;
  /** How many things stand on this island and therefore darken it. ONE, and that is the finding
   *  rather than a fixture accident — see {@link shippedCasters}. */
  casters: number;
  /** How many MERGED prop meshes this arm added — one per (material, tint), never one per prop.
   *  Zero on an undressed arm, and zero on a dressed one whose kit never arrived, which is why
   *  the driver reads it rather than trusting the flag it passed in. */
  props: number;
}

/** What the driver asks about an arm's occlusion field, as plain data it can carry back out of
 *  the page. The scene itself holds three objects and cannot cross that boundary. */
export interface OcclusionReading {
  arm: LandArm;
  pxPerUnit: number;
  occlusionCoverage: number | null;
  casters: number;
}

/**
 * Build one arm at one zoom.
 *
 * ⚠ BOTH ARMS ARE FITTED TO THE SAME BOUNDS, measured on the RELIEVED buffer whichever arm this
 * is, so the two PNGs are directly comparable pixel for pixel. Fitting each arm to its own bounds
 * would make the relieved island come out subtly SMALLER for being subtly taller — a framing
 * artefact, and one that would read as the treatment having changed the island's size.
 */
export function buildLandScene(
  arm: LandArm,
  pxPerUnit: number,
  dressed = false,
): LandScene {
  const cells = shippedParcels();
  const geo = cellGroundGeometry({
    cells,
    resolve: linearColourOf,
    index: groundRowOf,
    relief: RELIEF_OF[arm],
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(geo.colors, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  // THE PRE-BANDED ARMS KEEP `MeshStandardMaterial` AND THEREFORE THE SCENE LIGHTS. That is not
  // an inconsistency to tidy up: it is what those arms ARE. `flat` and `relief` are the map as it
  // drew on 2026-08-29 and 2026-08-30, lit by the ambient-plus-directional pair
  // `shipped-baseline.ts` reads out of the canvas. `banded` is unlit because the ladder computes
  // its own lambert against the authored `LIGHT_DIRECTION` - which is exactly the change being
  // pictured, so hiding it under a common material would be a comparison of nothing.
  // ⚠ THE GRAIN IS PASSED BY STATEMENT RATHER THAN AS `grain: GRAIN_OF[arm]`, and that is the
  // byte-identity claim rather than a concession to `exactOptionalPropertyTypes`: an explicit
  // `grain: undefined` is a different call from an absent one, and the whole reason the `banded`
  // arm is comparable to the 2026-08-30 evidence is that it is the SAME shader those numbers were
  // taken off. Absent means absent.
  const bandedOpts: BandedGroundMaterialOptions = { tokens: GROUND_TOKENS };
  const grain = arm === 'flat' || arm === 'relief' ? undefined : GRAIN_OF[arm];
  if (grain !== undefined) bandedOpts.grain = grain;
  // ⚠ BY STATEMENT, for the same byte-identity reason the grain is: an explicit `lit: undefined`
  // is a different call from an absent one, and every arm measured before 2026-08-30 must keep
  // emitting the shader those numbers were taken off.
  const lit = LIT_OF.get(arm);
  if (lit !== undefined) bandedOpts.lit = lit;
  // ⚠ THE SHADOW ARM BUILDS THE SAME FIELD `ForestWorldCanvas` BUILDS, through the same function
  // over the same casters — not a page-local approximation of it. An instrument that computed its
  // own occlusion would be measuring something the product does not draw.
  let occlusionCoverage: number | null = null;
  if (SHADOWED_ARMS.includes(arm)) {
    const bounds = groundBounds(cells);
    if (bounds === null) {
      throw new Error('shipped-land-scene: the island bounds nothing — no ground to shadow');
    }
    const field = buildGroundOcclusion({
      bounds,
      relief: LAND_RELIEF_AMPLITUDE,
      casters: shippedCasters(),
    });
    occlusionCoverage = shadowCoverage(field);
    bandedOpts.shadow = groundShadowTexture(field);
  }
  const material =
    arm === 'flat' || arm === 'relief'
      ? new THREE.MeshStandardMaterial({ vertexColors: true })
      : createBandedGroundMaterial(bandedOpts);
  const mesh = new THREE.Mesh(geometry, material);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(mesh);
  // ⚠⚠ THE `treed` ARM STOOD HERE AND IS RETIRED WITH THE THING IT DREW (ADR-0508). It added
  // `storyTreeGroup()` — the placeholder cone, rebuilt on this page from the canvas's own
  // constants — and it existed for one reason: "so the owner can see the shadow beside the thing
  // casting it". Both halves of that are gone. The cone is retired, and the shadow it cast is
  // retired with it, so the arm would now draw nothing and caption it as a tree. What the `dressed`
  // arm below stands is the answer to the same question: the grove IS the thing casting now.
  // ⚠ THE BOUGHT PROPS ARE FOR LOOKING AT, EXACTLY AS THE TREE WAS, and for the same reason: a
  // textured crown puts thousands of pixels in the frame that are off the GROUND palette by
  // construction, and every measured claim on this page is about the ground's delivered pixels.
  // So the measured ladder above is unchanged and the props ride alongside it — which is also
  // honest about what they are: the props are not a ground treatment, they are what STANDS on it.
  let props = 0;
  if (dressed && landKit !== null) {
    for (const mesh of shippedProps(landKit)) {
      scene.add(mesh);
      props += 1;
    }
  }
  // ⚠ THE PAIR IS THE SHIPPED ONE TIMES THE MEASURED SCALE. `SHIPPED_LIGHTING` carries the
  // AUTHORED intent — the ladder's floor and the span from it to the top rung — which is all a
  // parsed transcription of the canvas can hold, because the correction is a probe of a live
  // renderer. `landLightScale` is that probe's answer, set by the runner before any scene is
  // built. At `exact-probe` the two together are exactly what `<CalibratedLights />` hangs.
  scene.add(new THREE.AmbientLight(0xffffff, SHIPPED_LIGHTING.ambientIntensity * landLightScale));
  const sun = new THREE.DirectionalLight(
    0xffffff,
    SHIPPED_LIGHTING.directionalIntensity * landLightScale,
  );
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);

  // ⚠ THE VIEW DIRECTION IS THE SHIPPED ONE; THE FRAME IS THE ISLAND'S OWN, AND THE SPLIT IS
  // DELIBERATE. `frameWorld` supplies the 45°-elevation direction the map looks from, and that is
  // what has to be the product's. Its FRAMING is a different matter: the shipped rule backs off
  // `max(260, spread * 2.6)`, which on this island — 234 units wide and 46 deep — reserves a frame
  // the land occupies a few percent of. Framed that way both comparison pictures would be a green
  // smear in a black field, and whether that rule wastes a third of the screen is its OWN open
  // increment (`does-the-shipped-framing-waste-a-third-of-the-screen`) — not a question to answer
  // by accident here. So the frustum is fitted to the island's own projected bounds, in world
  // units, and the canvas is sized at `pxPerUnit` per unit: the delivered scale is exactly the
  // stated one, and both arms are fitted to the SAME bounds so the two PNGs stay comparable pixel
  // for pixel.
  const frame = frameWorld(cells);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  camera.position.set(...frame.position);
  camera.lookAt(...frame.target);
  camera.updateMatrixWorld(true);

  // The island in CAMERA space (x right, y up), measured on the RELIEVED buffer whatever arm this
  // is — a frame fitted per-arm would be a different frame per arm, and the relieved island would
  // come out subtly smaller for being subtly taller. That is a framing artefact, not the thing
  // being compared.
  const bounds = projectedBounds(
    cellGroundGeometry({ cells, resolve: linearColourOf, relief: landRelief }).positions,
    camera.matrixWorldInverse,
  );
  const pad = landHeightRange();
  camera.left = bounds.minX - pad;
  camera.right = bounds.maxX + pad;
  camera.bottom = bounds.minY - pad;
  camera.top = bounds.maxY + pad;
  camera.updateProjectionMatrix();

  const width = Math.round((camera.right - camera.left) * pxPerUnit);
  const height = Math.round((camera.top - camera.bottom) * pxPerUnit);

  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < geo.positions.length; i += 3) {
    lo = Math.min(lo, geo.positions[i]!);
    hi = Math.max(hi, geo.positions[i]!);
  }

  return {
    scene,
    camera,
    width,
    height,
    triangles: geo.triangles,
    parcels: geo.cells,
    // The SLAB is `CELL_GROUND_DEPTH` thick in both arms, so the interesting figure is how much
    // MORE than that the buffer spans — which is the relief's own range and zero when it is flat.
    heightSpan: hi - lo,
    occlusionCoverage,
    casters: shippedCasters().length,
    props,
  };
}

export interface LandArmReading {
  arm: LandArm;
  pxPerUnit: number;
  width: number;
  height: number;
  triangles: number;
  parcels: number;
  heightSpan: number;
  drawCalls: number;
  /** Median GPU nanoseconds for one frame, or null when the timer query gave no verdict. */
  gpuNs: number | null;
}

/** How much SHADING an arm delivered, and how much of the frame it changed.
 *
 *  ⚠ THE COLOUR COUNT IS THE POINT AND THE PIXEL COUNT IS ITS CONTROL. Relief is a lighting
 *  operation: it authors no colour, so what it can only do is spread each status token across
 *  more of the range between its lit and unlit ends. A flat island delivers a handful of colours
 *  — one per status per face orientation — and a relieved one delivers a gradient, so the count
 *  is the direct measure of whether the land gained any shading at all rather than merely moving.
 *  On its own it would be satisfied by an arm that changed colour everywhere and shape nowhere,
 *  which is why `changedPct` (against the SAME arm's flat sibling, same frame, same size) is
 *  reported beside it. */
export interface LandColourReading {
  arm: LandArm;
  pxPerUnit: number;
  /** Distinct RGB triples delivered over the whole frame, background included. */
  distinct: number;
  /** Pixels that are not the background — the island's own delivered area. */
  landPixels: number;
}

/** WHAT AN ARM DELIVERED THAT THE AUTHORED PALETTE DOES NOT CONTAIN.
 *
 *  ⚠ THE POINT IS `count === 0`, AND EVERY OTHER FIELD IS THERE TO STOP THAT READING VACUOUSLY.
 *  An arm that drew nothing at all delivers zero off-palette pixels too, so `landPixels` and
 *  `distinctLand` are reported beside it: the honest claim is "it drew an island, and every pixel
 *  of that island is an authored entry", which no single number states. */
export interface LandPaletteReading {
  arm: LandArm;
  pxPerUnit: number;
  /** Non-background pixels whose colour is not an authored `(token x level)` entry. */
  count: number;
  /** Those colours, as `#rrggbb`, deduped and sorted — so a failure names what it saw. */
  colours: string[];
  /** Distinct non-background colours delivered, and how many authored entries exist to hit. */
  distinctLand: number;
  authored: number;
  landPixels: number;
}

/** What a runner's own probe measured, and the pipeline it measured it in. */
export interface LandPipelineReading {
  pipeline: LandPipeline;
  /** What a white, fully-lit, fully-rough standard face delivered at the AUTHORED intensities. */
  probe: number;
  /** The factor both lights are multiplied by. 1 where the pipeline runs no probe. */
  scale: number;
  /** The rung a calibrated pipeline aims a lit white face at. */
  target: number;
  /** What a white lit face delivers AFTER the scale is applied — the claim, re-measured. */
  delivered: number;
  outputColorSpace: string;
  toneMapping: number;
  colorManagement: boolean;
}

/** The delivered prop pixels at one zoom — see {@link LandRunner.props}. */
export interface LandPropReading {
  arm: LandArm;
  pxPerUnit: number;
  /** Pixels that differ between the dressed frame and the bare one. */
  changed: number;
  /** Their mean delivered channel value, 0-255, over the changed pixels only. */
  mean: readonly [number, number, number];
  /** How many of them have a channel pinned at 255 — blown out, carrying no texture detail. */
  saturated: number;
  /** How many sit BELOW the ladder's floor times their own frame's darkest ground — crushed. */
  black: number;
}

export interface LandRunner {
  identity(): RendererIdentity;
  warm(): void;
  snapshot(arm: LandArm, pxPerUnit: number): string;
  /**
   * The same arm with one bought object per capability — the comparison, and never measured.
   *
   * ⚠ `snapshotTreed` STOOD BESIDE THIS AND IS RETIRED (ADR-0508). It drew the same arm with the
   * placeholder story tree added, so that the shadow could be looked at beside the thing casting
   * it; the tree is gone and so is the shadow it cast, so the method would now return a picture
   * of bare ground under a caption promising a tree. The grove IS the thing casting now, which is
   * what this method already draws — hence one snapshot pair here rather than two.
   *
   * ⚠ IT REPORTS THE PROP COUNT BESIDE THE PICTURE, and that is not decoration. A kit that failed
   * to parse draws NO props and produces a picture identical to {@link snapshot}'s — a
   * perfectly ordinary-looking frame that says nothing about what went wrong. The count is what
   * distinguishes "the props are drawn and this is what they look like" from "the props are
   * absent and this is what the ground looks like".
   */
  snapshotDressed(arm: LandArm, pxPerUnit: number): { png: string; props: number; triangles: number };
  /** The arm's occlusion field, as plain data. ⚠ THIS IS THE ONLY NON-VACUITY A PIXEL SWEEP
   *  CANNOT SUPPLY: a frame with no shadow in it is a perfectly ordinary-looking frame, so what
   *  says the field reached the material at all is that the field itself has something in it. */
  occlusion(arm: LandArm, pxPerUnit: number): OcclusionReading;
  /** The pipeline this runner was configured for, and what its probe measured. */
  pipeline(): LandPipelineReading;
  /**
   * The delivered PROP pixels — every pixel that differs between the dressed island and the same
   * island bare, at this zoom.
   *
   * ⚠ IT IS A DIFF RATHER THAN A COLOUR FILTER, and that is what makes it a measurement of the
   * props rather than of a guess about which colours belong to a crown. A filter would have to
   * name the crown's colours, which is the very thing under test.
   */
  props(arm: LandArm, pxPerUnit: number): LandPropReading;
  colours(arm: LandArm, pxPerUnit: number): LandColourReading;
  /** Percentage of pixels that differ between two arms at this zoom, on identical frames. */
  changedPct(a: LandArm, b: LandArm, pxPerUnit: number): number;
  /**
   * A hash of the GROUND-ONLY frame — the whole delivered buffer, no tree and no props.
   *
   * ⚠ IT EXISTS FOR ONE CLAIM AND IT IS THE SAFETY ONE: the ground must deliver the SAME BYTES in
   * every pipeline. three appends neither the tone-mapping nor the colour-space chunk to a raw
   * `ShaderMaterial`, so the banded material writes its authored ramp entry whatever the renderer
   * holds — which is why the map's status reporting (ADR-0392 D5) is untouched by a change to the
   * transfer function. That is an arithmetic argument about three's internals, and this is what
   * turns it into a measurement across page loads.
   */
  digest(arm: LandArm, pxPerUnit: number): string;
  /** Delivered pixels that are not authored ladder entries — see {@link LandPaletteReading}. */
  offPalette(arm: LandArm, pxPerUnit: number): LandPaletteReading;
  time(arm: LandArm, pxPerUnit: number, batch: number): Promise<LandArmReading>;
  dispose(): void;
}

const GPU_TIMER = 'EXT_disjoint_timer_query_webgl2';

/** Wait for one timer query's result, or give up. Local rather than imported: the shared helper
 *  lives beside a scene builder this page does not use, and a copy of eleven lines is cheaper than
 *  a dependency on a module that would drag its own fixtures in. */
async function elapsedNs(gl: WebGL2RenderingContext, query: WebGLQuery): Promise<number | null> {
  for (let i = 0; i < 600; i += 1) {
    if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true) {
      return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  return null;
}

export function createLandRunner(pipeline: LandPipeline = 'exact-probe'): LandRunner {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  // ⚠ THE PIPELINE IS SET BEFORE ANY SCENE IS BUILT, and the order is load-bearing rather than
  // tidy: `THREE.Color` converts at CONSTRUCTION against the global colour-management flag, so a
  // material built first keeps the conversion it was built with and does not follow a later flip.
  const probed = probePipeline(renderer, pipeline);
  setLandLightScale(probed.scale);
  const gl = renderer.getContext() as WebGL2RenderingContext;

  // ⚠⚠ THE BACKGROUND KEY IS MEASURED, NOT DERIVED, and that changed on 2026-08-31. It used to be
  // `new THREE.Color('#101418').convertLinearToSRGB()` — an arithmetic guess at what the clear
  // would deliver, correct only while colour management was on. It is now read off an empty frame
  // in THIS pipeline, so "not the island" compares against the colour this renderer actually
  // clears to. A constant that is right in one of three configurations silently miscounts
  // `landPixels` in the other two, and nothing in the output would say so.
  const backgroundKey = (() => {
    const empty = new THREE.Scene();
    empty.background = new THREE.Color(SHIPPED_LIGHTING.background);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    renderer.setSize(4, 4, false);
    renderer.render(empty, camera);
    const px = new Uint8Array(4);
    gl.readPixels(2, 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return ((px[0] ?? 0) << 16) | ((px[1] ?? 0) << 8) | (px[2] ?? 0);
  })();

  /** The delivered frame, straight out of the renderer's own buffer. */
  const readFrame = (s: LandScene): Uint8Array => {
    const px = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  const timer = gl.getExtension(GPU_TIMER) as { TIME_ELAPSED_EXT: number } | null;
  const identity = readIdentity(gl);

  // ⚠ CACHED PER (arm, zoom). Rebuilding the buffer inside the sweep would time the CPU's
  // triangulation of 164 parcels along with the GPU's frame, which is not the number being asked
  // for and is where the relieved arm would look "more expensive" for no rendering reason.
  const built = new Map<string, LandScene>();
  const sceneFor = (
    arm: LandArm,
    pxPerUnit: number,
    dressed = false,
  ): LandScene => {
    const key = `${arm}|${pxPerUnit}|${dressed}`;
    const found = built.get(key);
    if (found) return found;
    const made = buildLandScene(arm, pxPerUnit, dressed);
    built.set(key, made);
    return made;
  };

  const render = (
    arm: LandArm,
    pxPerUnit: number,
    dressed = false,
  ): LandScene => {
    const s = sceneFor(arm, pxPerUnit, dressed);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };

  return {
    identity: () => identity,
    // THE COLD START IS PAID ONCE, OUTSIDE THE SWEEP — the first render of any configuration
    // compiles shaders and uploads buffers, and leaving that inside the timing is what made an
    // earlier instrument on this arc report a heavier scene as faster than a lighter one.
    warm() {
      for (const zoom of LAND_ZOOMS) for (const arm of LAND_ARMS) render(arm, zoom);
      gl.finish();
    },
    colours(arm, pxPerUnit) {
      const s = render(arm, pxPerUnit);
      const px = readFrame(s);
      const seen = new Set<number>();
      let landPixels = 0;
      for (let i = 0; i < px.length; i += 4) {
        const key = (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!;
        seen.add(key);
        if (key !== backgroundKey) landPixels += 1;
      }
      return { arm, pxPerUnit, distinct: seen.size, landPixels };
    },

    changedPct(a, b, pxPerUnit) {
      // ⚠ READ IN ONE PASS EACH, AND ONLY BECAUSE THE FRAMES ARE IDENTICAL BY CONSTRUCTION. Every
      // arm is fitted to the same bounds and sized from the same numbers, so a pixel index means
      // the same place in all of them. An earlier instrument on this arc compared two
      // differently-sized frames and reported 100% of pixels differing — in every arm, whatever
      // it drew.
      const first = readFrame(render(a, pxPerUnit));
      const second = readFrame(render(b, pxPerUnit));
      if (first.length !== second.length) return Number.NaN;
      let changed = 0;
      for (let i = 0; i < first.length; i += 4) {
        const same =
          first[i] === second[i] &&
          first[i + 1] === second[i + 1] &&
          first[i + 2] === second[i + 2];
        if (!same) changed += 1;
      }
      return (changed / (first.length / 4)) * 100;
    },

    offPalette(arm, pxPerUnit) {
      // THE AUTHORED CLOSURE, packed the same way the frame is read. `groundRamp` is the very
      // array the material uploads, so this compares delivered pixels against the material's own
      // table rather than against a transcription of it — the argument `bandGlsl` makes about the
      // ladder, applied to the pixels.
      // ⚠ THE AUTHORED SET IS THE ARM'S OWN. A shadowed material's ramp is one entry longer per
      // row — `token x SHADOW_RUNG`, still an authored product — so asking the shadow arm about
      // the FOUR-rung closure would report every shadowed pixel as a stray. That failure would be
      // loud rather than silent, but it would be a fact about the question.
      // ⚠ THE ARM'S OWN LADDER, derived exactly as the material derives it — the lit ladder it
      // was handed, extended by the shadow rung re-derived against THAT ladder. Asking a refined
      // arm about the four-rung closure would report every intermediate rung as a stray, which is
      // a fact about the question rather than about the pixels.
      const armLit = litLadderOf(arm);
      const levels = SHADOWED_ARMS.includes(arm)
        ? shadowLadderFor(GROUND_TOKENS, armLit).levels
        : armLit;
      const authored = new Set(
        groundRamp(GROUND_TOKENS, levels).map(
          (entry) =>
            (Math.round(entry[0]! * 255) << 16) |
            (Math.round(entry[1]! * 255) << 8) |
            Math.round(entry[2]! * 255),
        ),
      );
      const s = render(arm, pxPerUnit);
      const px = readFrame(s);
      const strays = new Map<number, number>();
      const land = new Set<number>();
      let landPixels = 0;
      for (let i = 0; i < px.length; i += 4) {
        const key = (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!;
        if (key === backgroundKey) continue;
        landPixels += 1;
        land.add(key);
        if (!authored.has(key)) strays.set(key, (strays.get(key) ?? 0) + 1);
      }
      let count = 0;
      for (const n of strays.values()) count += n;
      const hex = (k: number): string => `#${k.toString(16).padStart(6, '0')}`;
      return {
        arm,
        pxPerUnit,
        count,
        colours: [...strays.keys()].map(hex).sort(),
        distinctLand: land.size,
        authored: authored.size,
        landPixels,
      };
    },

    occlusion(arm, pxPerUnit) {
      const s = sceneFor(arm, pxPerUnit);
      return {
        arm,
        pxPerUnit,
        occlusionCoverage: s.occlusionCoverage,
        casters: s.casters,
      };
    },
    pipeline: () => probed,
    props(arm, pxPerUnit) {
      // ⚠ BOTH FRAMES ARE READ BEFORE EITHER IS COMPARED. They are the same size by construction
      // (the same arm at the same zoom), so a pixel index means the same place in both — the
      // property `changedPct` already relies on and the reason this can be one pass.
      const bare = ((): Uint8Array => {
        const scene = render(arm, pxPerUnit, false);
        return readFrame(scene);
      })();
      const dressedScene = render(arm, pxPerUnit, true);
      const dressed = readFrame(dressedScene);
      if (bare.length !== dressed.length) {
        throw new Error('shipped-land-scene: the dressed and bare frames are different sizes');
      }
      let changed = 0;
      let saturated = 0;
      let black = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let i = 0; i < dressed.length; i += 4) {
        const dr = dressed[i] ?? 0;
        const dg = dressed[i + 1] ?? 0;
        const db = dressed[i + 2] ?? 0;
        if (dr === (bare[i] ?? 0) && dg === (bare[i + 1] ?? 0) && db === (bare[i + 2] ?? 0)) continue;
        changed += 1;
        sr += dr;
        sg += dg;
        sb += db;
        if (dr === 255 || dg === 255 || db === 255) saturated += 1;
        if (dr + dg + db <= 12) black += 1;
      }
      const mean = (total: number): number => (changed === 0 ? 0 : total / changed);
      return {
        arm,
        pxPerUnit,
        changed,
        mean: [mean(sr), mean(sg), mean(sb)] as const,
        saturated,
        black,
      };
    },
    snapshotDressed(arm, pxPerUnit) {
      const s = render(arm, pxPerUnit, true);
      return { png: canvas.toDataURL('image/png'), props: s.props, triangles: s.triangles };
    },
    digest(arm, pxPerUnit) {
      const px = readFrame(render(arm, pxPerUnit));
      // FNV-1a over the whole buffer. A hash rather than the buffer itself because this crosses
      // the Playwright bridge once per pipeline and the frame is megabytes.
      let h = 0x811c9dc5;
      for (const byte of px) {
        h ^= byte;
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return `${px.length.toString(16)}:${h.toString(16).padStart(8, '0')}`;
    },
    snapshot(arm, pxPerUnit) {
      render(arm, pxPerUnit);
      // ⚠ The renderer's OWN buffer, not an element screenshot — an element screenshot composites
      // the page background in and has confounded two evidence pictures on this arc already.
      return canvas.toDataURL('image/png');
    },
    async time(arm, pxPerUnit, batch) {
      const s = render(arm, pxPerUnit);
      renderer.info.reset();
      let gpuNs: number | null = null;
      if (timer !== null) {
        const query = gl.createQuery();
        if (query !== null) {
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          for (let i = 0; i < batch; i += 1) renderer.render(s.scene, s.camera);
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          const total = await elapsedNs(gl, query);
          gl.deleteQuery(query);
          gpuNs = total === null ? null : total / batch;
        }
      }
      return {
        arm,
        pxPerUnit,
        width: s.width,
        height: s.height,
        triangles: s.triangles,
        parcels: s.parcels,
        heightSpan: s.heightSpan,
        drawCalls: renderer.info.render.calls,
        gpuNs,
      };
    },
    dispose() {
      for (const s of built.values()) s.scene.clear();
      renderer.dispose();
    },
  };
}

/** What each arm ADDED and to WHAT — read off {@link LAND_ARM_SPECS} rather than transcribed, so
 *  a rung cannot be added without a reader being told what it is, and a caption cannot come to
 *  describe a predecessor the arm no longer has. */
function armCaption(arm: LandArm): string {
  const spec = LAND_ARM_SPECS.find((it) => it.arm === arm);
  if (spec === undefined) throw new Error(`shipped-land-scene: no spec for arm ${arm}`);
  return spec.from === null ? spec.adds : `${spec.adds} — on top of ${spec.from}`;
}

/** Mount the page: every arm at both zooms, side by side, with the runner on `window` for the
 *  driver to reach. */
export async function mountShippedLand(root: HTMLElement): Promise<void> {
  // ⚠⚠ THE PIPELINE COMES FIRST AND THE ORDER IS LOAD-BEARING, which is why the runner is now
  // created BEFORE the kit is awaited rather than after. `THREE.Color` converts against the global
  // colour-management flag at CONSTRUCTION, and `createLandRunner` is what sets that flag — so
  // anything built ahead of it keeps the conversion it was built with and does not follow the flip.
  // Nothing is DRAWN before the kit lands (that is `warm()`, below), which is the property the
  // paragraph this replaced was protecting: a page that cached every arm without props would hand
  // the driver a dressed row quietly showing bare ground.
  const params = new URLSearchParams(globalThis.location.search);
  const asked = params.get('pipeline');
  if (asked !== null && !LAND_PIPELINES.includes(asked as LandPipeline)) {
    throw new Error(
      `shipped-land: unknown pipeline "${asked}" — expected one of ${LAND_PIPELINES.join(', ')}`,
    );
  }
  const pipeline: LandPipeline = (asked as LandPipeline | null) ?? 'exact-probe';
  // ⚠ `only=dressed` IS FOR THE LIGHT DRIVER, which loads this page ONCE PER PIPELINE and only
  // wants the dressed row. Rendering the whole measured ladder three times over would be four
  // minutes of GPU for pictures nobody reads.
  const dressedOnly = params.get('only') === 'dressed';

  const runner = createLandRunner(pipeline);

  try {
    setLandKit(await loadKit());
  } catch (err) {
    // Loud, and then on: the ground arms are the measured ones and they do not need the kit. A
    // page that refused to render at all would take every land measurement down with the props.
    console.error('shipped-land: the bought kit did not load, so the dressed row is bare', err);
  }

  if (!dressedOnly) runner.warm();
  const id = runner.identity();
  const head = document.createElement('p');
  head.className = 'numbers';
  const probed = runner.pipeline();
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · timerQuery=${id.timerQuery}\n` +
    `pipeline=${probed.pipeline} · outputColorSpace=${probed.outputColorSpace} · ` +
    `toneMapping=${probed.toneMapping} · colorManagement=${probed.colorManagement}\n` +
    `a lit white face delivers ${probed.probe.toFixed(4)} at the authored intensities; ` +
    `x${probed.scale.toFixed(4)} -> ${probed.delivered.toFixed(4)} (target ${probed.target})`;
  head.style.whiteSpace = 'pre-wrap';
  root.appendChild(head);

  if (dressedOnly) {
    mountDressedRow(root, runner, pipeline);
    window.landRunner = runner;
    return;
  }

  for (const zoom of LAND_ZOOMS) {
    const h2 = document.createElement('h2');
    h2.textContent = `${zoom} delivered px per ground unit`;
    root.appendChild(h2);
    const row = document.createElement('div');
    row.className = 'row';
    for (const arm of LAND_ARMS) {
      const s = buildLandScene(arm, zoom);
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = runner.snapshot(arm, zoom);
      img.width = Math.min(s.width, 900);
      const cap = document.createElement('figcaption');
      cap.textContent = `${arm} — ${armCaption(arm)} · ${s.triangles} triangles`;
      fig.append(img, cap);
      row.appendChild(fig);
    }
    root.appendChild(row);
  }

  // ⚠ THE ROW WITH THE STORY TREE IN IT IS RETIRED (ADR-0508). It drew `grain-normal` and
  // `shadow` at 8 px/unit with the placeholder cone added, outside the measured ladder because
  // the crown's pixels are off the ground palette by construction, and it was here because "a
  // shadow with nothing casting it is not a picture anyone can judge". The cone is gone and its
  // shadow with it, so the row would now be two pictures of bare ground captioned as trees. The
  // dressed row below answers the same question with the grove, which is what stands there now.

  // ⚠⚠ THE ROW THIS INCREMENT LANDS — the shipped island with one bought object per capability,
  // at both zooms, beside the same island without them. Also outside the measured ladder, because
  // a textured crown's pixels are off the GROUND palette by construction. The prop count is
  // printed in the caption because a kit that failed to parse draws a picture identical to the
  // bare one and says nothing about why.
  mountDressedRow(root, runner, pipeline);

  window.landRunner = runner;
}

/**
 * The dressed island at both zooms, beside the same island bare.
 *
 * ⚠ EXTRACTED 2026-08-31 so the light driver can load this page once per PIPELINE and get only
 * this row. It is outside the measured ladder for the reason it always was — a textured crown's
 * pixels are off the GROUND palette by construction — but it is no longer only for looking at:
 * `LandRunner.props` measures exactly the pixels it adds.
 */
function mountDressedRow(root: HTMLElement, runner: LandRunner, pipeline: LandPipeline): void {
  const h3 = document.createElement('h2');
  h3.textContent =
    `with one bought object per capability (ADR-0475) — ${pipelineCaption(pipeline)}`;
  root.appendChild(h3);
  for (const zoom of LAND_ZOOMS) {
    const dressedRow = document.createElement('div');
    dressedRow.className = 'row';
    for (const dressed of [false, true]) {
      const shot = dressed
        ? runner.snapshotDressed('shadow', zoom)
        : { png: runner.snapshot('shadow', zoom), props: 0, triangles: 0 };
      const s = buildLandScene('shadow', zoom, dressed);
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = shot.png;
      img.width = Math.min(s.width, 900);
      const cap = document.createElement('figcaption');
      cap.textContent = dressed
        ? `shadow + the bought kit — ${zoom} px/unit · ${shot.props} merged prop meshes · ${s.triangles} ground triangles`
        : `shadow, bare — ${zoom} px/unit`;
      fig.append(img, cap);
      dressedRow.appendChild(fig);
    }
    root.appendChild(dressedRow);
  }
}

/** The runner the driver reaches for. A DECLARED GLOBAL rather than a cast at the assignment: an
 *  `as unknown as { … }` chain is exactly the discarded-evidence shape the house TypeScript
 *  standard refuses, and it would also let the property's type drift from the interface above. */
declare global {
  // eslint-disable-next-line no-var
  var landRunner: LandRunner;
}
