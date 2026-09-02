// shipped-grass-scene.ts — LAYER 2 OF THE APPROVED GROUND, AND THE FORK IT ARRIVES WITH.
//
// THE INCREMENT: `layer-2-shore-sand-as-a-ground-field` on `land-ground-stack-arc`. Layer 1 SHIPS
// (PR #1798) and is the control here; this page asks whether the shore sand can join it.
//
// ⚠⚠ THE ARMS SHOW A TRADE THAT DOES NOT CLOSE, which is the finding rather than a staging
// accident. Measured over every colour layers 1+2 can deliver together, the sand is VISIBLE only
// at or above ~0.22 and HONEST only at or below ~0.15 — so no single strength is both. `honest`
// and `authored` are the two ends of that gap, and `flat` is what ships today.
//
// ⚠⚠ THE ARMS DIFFER IN EXACTLY ONE NUMBER, AND NOTHING ELSE ON THE PAGE IS ARM-SPECIFIC. Every
// arm is `shippedGroundBuild` — the SHIPPED canvas's own builder, imported from `src/` — over the
// same parcels, the same casters, the same framing and the same material factory. The only thing
// an arm chooses is `grass.mix`. So a pixel difference between two arms is attributable to the
// grass and to nothing else.
//
// ⚠⚠ AND THAT IS THE STRUCTURAL FIX FOR THE HAZARD THIS ARC NAMES SECOND, not a claim about care.
// `comparison-baseline-moves-under-the-page`: the skirt's comparison page built its own scene, so
// after a sibling merged its `flat` CONTROL arm was quietly the map as it stood an hour earlier —
// 2,264 triangles against the real 2,962 — and the symptom was a re-run returning BYTE-IDENTICAL
// numbers, which reads as reassurance. On a five-layer chain landing one after another onto one
// composition root that is the single most likely way to produce a confident false result. The
// remedy here is not an assertion someone has to keep true: the control arm CALLS THE FUNCTION
// `CellGround` CALLS, so it cannot be a different scene. `shipped-grass-scene.test.ts` states
// that as a property of the source.
//
// ⚠ THE VERDICT IS NOT "IT RENDERS", AND IT IS NOT "PIXELS CHANGED". ADR-0490 D6 retires the
// touched-pixel count as a headline — it scores a 1/255 shift the same as a 164/255 one and
// overstated two increments roughly fourfold before the owner caught it by eye. An arm is judged
// on pixels that move MORE THAN 20/255, and on the arc's own gap metric: colour families holding
// >=0.5% of the island, 5 bits per channel (shipped 9, approved 36).
//
// ⚠ THE REFERENCE ARM IS AN IMAGE, NOT A SCENE, and that is stated rather than hidden — the same
// discipline `shipped-skirt-scene.ts` records. The approved Cycles render is a path tracer's
// output at a different resolution, framing and camera: its MICRO/STRUCT/family numbers are
// comparable to the live arms' on the same axes and its PIXEL DIFFERENCES are comparable to
// nothing. It is measured and never differenced.
//
// THE PAGE ADOPTS NOTHING. `harness/` only — it produces EVIDENCE about the `src/` module it
// imports.

import * as THREE from 'three';

import {
  buildGroundMaterial,
  shippedGroundBuild,
  GRASS_GATE_ROWS,
  SHIPPED_GRASS_MIX,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  type GroundLayerExtras,
} from '../src/ForestWorldCanvas.js';
import type { GroundGrassLayer, GroundRockLayer } from '../src/banded-ground-material.js';
import { WEAR_OCTAVES } from '../src/land-wear.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import {
  GROUND_ATLAS_ATTRIBUTE,
  GROUND_STATUS_ATTRIBUTE,
} from '../src/banded-ground-material.js';
import { GRASS_OCTAVES } from '../src/land-grass.js';
import { SAND_OCTAVES } from '../src/land-sand.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';
import { imageStats, type ImageStats } from './shipped-skirt-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import {
  VISIBLE_DELTA,
  sensitivityReasons,
  visibleDeltaDistribution,
  type VisibleDeltaReading,
} from './visible-delta.js';
import {
  CROWD_ZOOMS,
  FIT_ZOOM,
  crowdCasters,
  crowdCells,
  crowdPxPerUnit,
  crowdSize,
  crowdStrips,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
  type CrowdZoom,
} from './shipped-crowd-scene.js';

/**
 * THE FOUR ARMS — one control and three strengths, and the three are CHOSEN BY THE MEASUREMENT
 * rather than picked to look like a ladder. `harness/grass-status-reading.ts` walks every colour
 * layer 1 can deliver against the house reader model and reports two things per mix factor: does
 * every status still read as itself, and which ladder rungs survive if not.
 */
export type GrassArm =
  | 'flat'
  | 'authored'
  | 'grass-32'
  | 'grass-55'
  | 'grass-70'
  | 'grass-85'
  | 'grass-95'
  | 'rock-veins'
  | 'sand-16'
  | 'sand-40'
  | 'sand-65'
  | 'sand-90'
  | 'path-50'
  | 'path-80'
  | 'path-100'
  | 'rock-recipe'
  | 'rock-88-95'
  | 'rock-92-98'
  | 'detail-30'
  | 'detail-60'
  | 'detail-100';

/** The arm every pixel figure is read against: the shipped map exactly as it draws today, with no
 *  grass at all. */
export const CONTROL_ARM: GrassArm = 'flat';

/**
 * THE CONTROL, WHAT SHIPS, AND A STRENGTH LADDER — owner-directed 2026-09-02.
 *
 * ⚠⚠ THE LADDER EXISTS BECAUSE THE OWNER SAID THE SESSIONS WERE TOO CONSERVATIVE. Layer 2 was
 * adopted at 0.16 — its reader-model ceiling — and at that strength the largest channel shift is
 * 15/255: a beach nobody can see. He asked for the layers to be applied ADVENTUROUSLY, with a
 * picture per step and "scale it back" as his lever. So the page now carries four strengths in one
 * row — the fenced 0.16 beside three bolder ones — and `authored` is whatever SHIPS, read from the
 * constant, so the picture under that caption is always the map.
 */
export const GRASS_ARMS: readonly GrassArm[] = [
  'flat',
  'authored',
  'grass-32',
  'grass-55',
  'grass-70',
  'grass-85',
  'grass-95',
  'rock-veins',
  'sand-16',
  'sand-40',
  'sand-65',
  'sand-90',
  'path-50',
  'path-80',
  'path-100',
  'rock-recipe',
  'rock-88-95',
  'rock-92-98',
  'detail-30',
  'detail-60',
  'detail-100',
];

/**
 * THE CONTROL'S GRASS STRENGTH — layer 1 as it shipped from PR #1798 (2026-09-01) until ADR-0506
 * (2026-09-03), and the strength every committed table on this arc was read against.
 *
 * ⚠⚠ A LITERAL ON PURPOSE, NOT `SHIPPED_GRASS_MIX`. Until 2026-09-03 the control read the shipped
 * constant, which was right while the constant WAS 0.32: the control meant "the map before layer
 * 2". Once layer 1's own strength became the thing under the ladder, a control that followed the
 * constant would have moved with the rung under test and every "moved >20/255" figure on this page
 * would have been a layer measured against itself. Pinning the control at the pre-parity strength
 * keeps every row comparable to `chapter2-ground-stack-2026-09-02/`'s (families 20 on this arm).
 */
export const CONTROL_GRASS_MIX = 0.32;

/**
 * WHAT EACH ARM MIXES IN — layer 1's strength per arm.
 *
 * ⚠⚠ THE GRASS LADDER VARIES THIS ONE NUMBER AND HOLDS EVERY LAYER ABOVE IT AT WHAT SHIPS — the
 * same one-thing-per-ladder rule the sand, path, rock and detail ladders follow, applied to the
 * base layer (ADR-0506; the owner, 2026-09-03: the finished stack did not read as the render he
 * stamped, and the strength he never saw a ladder for was this one). Every OTHER arm reads
 * `SHIPPED_GRASS_MIX`, so the four upper ladders are measured over the grass the map actually
 * draws; the CONTROL alone holds {@link CONTROL_GRASS_MIX}.
 *
 *   0.32   `grass-32` — the pre-ADR-0506 map, for the before/after
 *   0.55 / 0.70 / 0.85 / 0.95 — the bold rungs; 0.85 SHIPS, never 1.0 (ADR-0490 D5's seam)
 */
export const GRASS_ARM_MIX: Record<GrassArm, number | null> = Object.fromEntries(
  GRASS_ARMS.map((arm) => [arm, armGrassMix(arm)]),
) as Record<GrassArm, number | null>;

/** The grass strength one arm wears — a named function so the mutation rung can attribute a
 *  mutant in the table's arithmetic to the test that kills it. */
export function armGrassMix(arm: GrassArm): number {
  if (arm === CONTROL_ARM) return CONTROL_GRASS_MIX;
  if (arm === 'grass-32') return 0.32;
  if (arm === 'grass-55') return 0.55;
  if (arm === 'grass-70') return 0.7;
  if (arm === 'grass-85') return 0.85;
  if (arm === 'grass-95') return 0.95;
  return SHIPPED_GRASS_MIX;
}

/** The rock ends the map wore from 2026-09-02 to 2026-09-03 — the interior veins — carried as an
 *  arm so the owner can re-pick them from a rendered frame rather than from a description. */
export const ROCK_VEINS: GroundRockLayer = { mix: 0.85, slope: [0.88, 0.95] };

/**
 * WHAT EACH ARM WEARS ABOVE THE GRASS — one row per arm, one LADDER per layer.
 *
 * ⚠⚠ EVERY LADDER VARIES EXACTLY ONE THING and holds the layers BELOW it at what SHIPS, so a pixel
 * between two rungs is attributable to that rung's number and nothing else: the sand ladder wears
 * sand only; the path ladder wears the shipped sand plus a path strength; the rock ladder wears the
 * shipped sand and path plus a rock rung; the detail ladder wears all three shipped plus a detail
 * strength. `authored` is the whole shipped stack, read from the canvas's constants so the picture
 * under that caption is always the map; `flat` is the control (layer 1 only).
 *
 * `sand` is `uSandMix` — the share of the recipe's sand colour a fragment at the waterline wears
 * (`mix(c, sand, uSandMix * (1 - band))`, so 1.0 at the coast is the recipe's own pure sand).
 * `wear` is `uWearMix` ON the path. `rock` is the mix and the slope ends `[lo, hi]` on the
 * normal's up-component (the recipe's [0.72, 0.90] bite only on the beach's ring chain on this
 * mesh, so the other rungs are the stated departure that reaches the interior). `detail` is the
 * cliff normal's strength (the recipe's 0.30 is the provenance rung).
 */
export interface ArmLayers {
  sand: number | null;
  wear: number | null;
  rock: GroundRockLayer | null;
  detail: number | null;
}

const NONE: ArmLayers = { sand: null, wear: null, rock: null, detail: null };
const SHIPPED_STACK: ArmLayers = {
  sand: SHIPPED_SAND_MIX,
  wear: SHIPPED_LAYERS.wearMix,
  rock: SHIPPED_LAYERS.rock,
  detail: SHIPPED_LAYERS.detail.strength,
};
const sandOnly = (sand: number): ArmLayers => ({ ...NONE, sand });
const pathRung = (wear: number): ArmLayers => ({ ...NONE, sand: SHIPPED_SAND_MIX, wear });
const rockRung = (rock: GroundRockLayer): ArmLayers => ({
  ...NONE,
  sand: SHIPPED_SAND_MIX,
  wear: SHIPPED_LAYERS.wearMix,
  rock,
});
const detailRung = (detail: number): ArmLayers => ({ ...SHIPPED_STACK, detail });

export const GRASS_ARM_LAYERS = {
  flat: NONE,
  authored: SHIPPED_STACK,
  // The grass ladder: the whole shipped stack above, layer 1's strength the one moving part.
  'grass-32': SHIPPED_STACK,
  'grass-55': SHIPPED_STACK,
  'grass-70': SHIPPED_STACK,
  'grass-85': SHIPPED_STACK,
  'grass-95': SHIPPED_STACK,
  // The rock re-pick: the shipped stack with the 2026-09-02 interior veins instead of the recipe's ends.
  'rock-veins': { ...SHIPPED_STACK, rock: ROCK_VEINS },
  'sand-16': sandOnly(0.16),
  'sand-40': sandOnly(0.4),
  'sand-65': sandOnly(0.65),
  'sand-90': sandOnly(0.9),
  'path-50': pathRung(0.5),
  'path-80': pathRung(0.8),
  'path-100': pathRung(1.0),
  'rock-recipe': rockRung({ mix: 0.9, slope: [0.72, 0.9] }),
  'rock-88-95': rockRung({ mix: 0.9, slope: [0.88, 0.95] }),
  'rock-92-98': rockRung({ mix: 0.9, slope: [0.92, 0.98] }),
  'detail-30': detailRung(0.3),
  'detail-60': detailRung(0.6),
  'detail-100': detailRung(1.0),
} satisfies Record<GrassArm, ArmLayers>;

/**
 * LAYER 2's STRENGTH PER ARM — `null` is NO SAND (the control). Derived from the layer table so
 * the two cannot disagree; kept as its own export because the sand ladder's tests read it.
 */
export const GRASS_ARM_SAND_MIX: Record<GrassArm, number | null> = Object.fromEntries(
  GRASS_ARMS.map((arm) => [arm, GRASS_ARM_LAYERS[arm].sand]),
) as Record<GrassArm, number | null>;

/** Which arms wear LAYER 2 — derived from the strength table, so the two cannot disagree. `flat`
 *  is the CONTROL: the map exactly as it shipped before layer 2, layer 1 and no sand, so the
 *  comparison is layer 2 against what is drawn now rather than against bare ground. */
export const GRASS_ARM_SAND: Record<GrassArm, boolean> = Object.fromEntries(
  GRASS_ARMS.map((arm) => [arm, GRASS_ARM_LAYERS[arm].sand !== null]),
) as Record<GrassArm, boolean>;

/** What each arm IS, as the caption under its own picture — beside the arm rather than in the
 *  HTML, so an arm cannot be added without a reader being told what it is. */
export const GRASS_ARM_CAPTION = {
  flat: `the map as it SHIPPED before layer 2 — layer 1 at ${CONTROL_GRASS_MIX} on the green islands, nothing above it (CONTROL)`,
  authored:
    `the whole stack as it SHIPS — grass ${SHIPPED_GRASS_MIX}, sand ${SHIPPED_SAND_MIX}, path ${SHIPPED_LAYERS.wearMix}, ` +
    `rock ${SHIPPED_LAYERS.rock.mix} on [${SHIPPED_LAYERS.rock.slope.join(', ')}], detail ` +
    `${SHIPPED_LAYERS.detail.strength}`,
  'grass-32': 'grass at 0.32 under the shipped stack — the map as it drew on 2026-09-02, minus the rock veins',
  'grass-55': 'grass at 0.55 under the shipped stack — the recipe’s hue drift starts to show through the token',
  'grass-70': 'grass at 0.70 under the shipped stack — the ground is mostly the recipe’s grass',
  'grass-85': 'grass at 0.85 under the shipped stack — the approved render’s grass with the token’s green left in',
  'grass-95': 'grass at 0.95 under the shipped stack — all but the last of the status token gone',
  'rock-veins':
    `the shipped stack wearing the 2026-09-02 rock ends [${ROCK_VEINS.slope.join(', ')}] — grey veins along ` +
    'the interior’s swells, which the approved render does not have',
  'sand-16':
    'sand at 0.16 — the reader-model ceiling layer 2 was first adopted at; largest possible ' +
    'shift 15/255, so the beach is a tint',
  'sand-40': 'sand at 0.40 — past the visibility bar; the beach reads, the green still bleeds through',
  'sand-65': 'sand at 0.65 — the beach is unmistakably sand with the island’s green in it',
  'sand-90': 'sand at 0.90 — near the recipe’s own pure sand at the waterline',
  'path-50': 'the worn path at 0.50 over the shipped sand — dirt along the trail docks, half strength',
  'path-80': 'the worn path at 0.80 — the track reads as dirt with green through it',
  'path-100': 'the worn path at 1.00 — the recipe’s own pure dirt on the track',
  'rock-recipe':
    'rock at 0.9 on the recipe’s own ends [0.72, 0.90] — on this mesh that is the beach’s ring ' +
    'chain and nothing inland',
  'rock-88-95': 'rock at 0.9 on [0.88, 0.95] — the interior’s steepest swells start to wear rock',
  'rock-92-98': 'rock at 0.9 on [0.92, 0.98] — most of the interior’s relief wears some rock',
  'detail-30': 'the cliff normal at the recipe’s 0.30 over the shipped stack — surface break-up',
  'detail-60': 'the cliff normal at 0.60 — the break-up reads at the zoomed frame',
  'detail-100': 'the cliff normal at 1.00 — the map’s striation shows through',
} satisfies Record<GrassArm, string>;

/** One island, and the thirty-five-island forest. A ground treatment is read at BOTH: a layer that
 *  survives one island and dissolves in the forest has not answered the question. */
/**
 * ⚠⚠ ONE ISLAND FOR THIS INCREMENT. Layer 2's carrier costs 730 ms to build for one island and
 * **49.7 s for the 35-island forest** (`shoreField.sample()` is O(coast edges) per texel over a
 * 5.4 M-texel atlas), so warming the sanded forest arms hangs this page outright — measured, it
 * did. The fork these arms exist to show is a PER-PIXEL reading property and is fully visible on
 * one island. Layer 1's own evidence carries both sizes.
 */
export const GRASS_SIZES: readonly CrowdSize[] = [crowdSize('one')];

/** The two zooms every comparison on this arc is taken at, plus the fitted overview — a CONTEXT
 *  picture and never a timing, because it delivers a different px/unit per scene. */
export const GRASS_ZOOMS: readonly number[] = [...CROWD_ZOOMS];
export const GRASS_PICTURE_ZOOMS: readonly CrowdZoom[] = [...GRASS_ZOOMS, FIT_ZOOM];

/** What one arm costs, in numbers a picture cannot carry.
 *
 *  ⚠ THE TRIANGLE COUNT IS HERE PRECISELY BECAUSE IT MUST NOT MOVE. Layer 1 is a FRAGMENT-stage
 *  layer: it adds no geometry, so an arm whose triangle count differs from the control's is a
 *  page that changed something else and called it the grass. That is the first hazard this arc
 *  names — every layer is priced against a repository the previous layer moved — inverted into a
 *  check: this component's correct triangle delta is ZERO, and the measure driver refuses a run
 *  where it is not. */
export interface GrassPlan {
  triangles: number;
  /** Lattice-noise octaves this arm evaluates per ground fragment, over the grain's own. The
   *  frame-cost question in one number, and the reason it is an arm's property rather than a
   *  footnote: ADR-0490's stated cost is that nothing argues the full stack is affordable. */
  octaves: number;
  /** Layer 2's own octaves per ground fragment, over layer 1's. Zero on the control. */
  sandOctaves: number;
  /** Layer 3's own octaves (the break noise), over layers 1 and 2. Zero where no path is worn. */
  wearOctaves: number;
  mix: number | null;
}

export interface GrassScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  islands: number;
  plan: GrassPlan;
}

/** The grass option one arm wears — `undefined` for the control, which is what makes its material
 *  byte-identical to the PRE-LAYER-1 one rather than a grassed material set to zero.
 *
 *  ⚠ EVERY GRASSED ARM WEARS THE SHIPPED GATE, `GRASS_GATE_ROWS`, rather than a list of its own.
 *  The arms differ in exactly ONE thing — the mix factor — which is this arc's standing rule for a
 *  comparison, and a page that gated its arms differently from the map would be measuring a layer
 *  the map does not draw while reporting it as this one's.
 *
 *  ⚠ AND THE `flat` AND `authored` ARMS READ {@link SHIPPED_GRASS_MIX} rather than repeating its
 *  value, so the pair that differs ONLY in the sand cannot come apart on the grass as well. */
export function armGrass(arm: GrassArm): GroundGrassLayer | undefined {
  const mix = GRASS_ARM_MIX[arm];
  if (mix === null) return undefined;
  return { mix, rows: GRASS_GATE_ROWS };
}

/** Does this arm wear LAYER 2? Separate from {@link armGrass} because the two vary independently
 *  across this page: `flat` and `authored` share a mix factor and differ ONLY in the sand, which
 *  is what makes them a pair a reader can attribute. */
export function armWearsSand(arm: GrassArm): boolean {
  return GRASS_ARM_SAND[arm];
}

/** Layer 2's strength on this arm — `null` for an arm that wears no sand. */
export function armSandMix(arm: GrassArm): number | null {
  return GRASS_ARM_SAND_MIX[arm];
}

/** Everything this arm wears above the grass. */
export function armLayers(arm: GrassArm): ArmLayers {
  return GRASS_ARM_LAYERS[arm];
}

/**
 * ONE ARM'S SCENE — the SHIPPED pipeline entire, with the grass mix as the only moving part.
 *
 * Coast clip, relief, shore fall, inset ring, stepped skirt, ladder, grain and the packed
 * occlusion atlas are all exactly what `CellGround` builds, because they are literally what
 * `CellGround` builds: {@link shippedGroundBuild} is the function it calls.
 */
export function buildGrassScene(
  arm: GrassArm,
  size: CrowdSize,
  zoom: CrowdZoom,
  /**
   * FORCE THE LAYERS OFF, whatever the arm says — the one override this builder takes, and it
   * exists for a page that asks a DIFFERENT question off the same arm vocabulary.
   *
   * ⚠⚠ IT IS HERE BECAUSE THE SHARED `flat` ALREADY BROKE ONCE. `land-floor-scene.ts` prices what
   * evaluating the layer COSTS, so its control must evaluate none of it; this page's `flat` means
   * "the map as it ships", which since PR #1798 is a GRASSED shader. Mapping one onto the other
   * made the frame-cost control price layer 1 against itself and report ~0 ms — a green run
   * carrying a number that could only ever be zero. A frame-cost baseline and a look-comparison
   * baseline are different objects that happened to share a name.
   */
  bare = false,
): GrassScene {
  const cells: InstanceDescriptor[] = crowdCells(size);
  const casters = crowdCasters(size);
  // ⚠ THE STRIPS ARE THE CROWD'S OWN TWO LANDINGS PER ISLAND (`crowdStrips`), so layer 3's
  // connector has docks to join and the wear field the builder returns is not trivially empty.
  const strips = crowdStrips(size);
  const { field, shore, wear, input } = shippedGroundBuild(cells, casters, strips);
  const geo = cellGroundGeometry(input);
  if (geo.triangles === 0) throw new Error('shipped-grass-scene: the crowd drew no ground');

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  if (geo.atlasOrigins.length > 0) {
    geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));
  }

  // ⚠ THE MATERIAL FACTORY IS THE SHIPPED ONE TOO, handed the same occlusion field the geometry's
  // atlas origins were packed from. A page that built its own material could disagree with the
  // map about the ladder, the tokens or the shadow rung and report the difference as the grass's.
  const grass = bare ? undefined : armGrass(arm);
  // ⚠ THE SHORE FIELD COMES FROM `shippedGroundBuild` TOO, so an arm cannot be handed a coast the
  // map does not have — the same structural answer to the stale-control hazard the occlusion field
  // already gets. It is offered only to the arms that wear layer 2.
  // ⚠ THE THUNK IS CALLED ONLY FOR AN ARM THAT WEARS LAYER 2 — the field costs 54 s at forest
  // scale, so an eager call here would make even the CONTROL arm pay for a layer it does not draw.
  // ⚠ THE STRENGTH IS THE ARM'S OWN, passed explicitly: an arm that wears sand names how much,
  // and an arm that wears none is handed no field at all (absent, not zero — a zeroed sand option
  // still emits the sand source and costs its octaves, so it is not the map).
  const sandMix = armSandMix(arm);
  // ⚠ LAYERS 3, 4 AND 6 THE SAME WAY: each thunk is called only for an arm that wears the layer,
  // and each option is assigned BY STATEMENT so an arm without it hands the material no key at
  // all (absent, never zero — a zeroed option still emits the layer's source and costs its
  // octaves, which is not the map the caption names).
  const layers = bare ? NONE : armLayers(arm);
  const extras: GroundLayerExtras = {};
  if (layers.wear !== null) {
    const wearField = wear();
    if (wearField !== null) extras.wear = { field: wearField, mix: layers.wear };
  }
  if (layers.rock !== null) extras.rock = layers.rock;
  if (layers.detail !== null) extras.detail = { strength: layers.detail };
  const { material } = buildGroundMaterial(
    field,
    grass,
    !bare && sandMix !== null ? shore() : null,
    sandMix ?? undefined,
    extras,
  );

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.Mesh(geometry, material));
  scene.add(new THREE.AmbientLight(0xffffff, SHIPPED_LIGHTING.ambientIntensity));
  const sun = new THREE.DirectionalLight(0xffffff, SHIPPED_LIGHTING.directionalIntensity);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);

  const pxPerUnit = crowdPxPerUnit(size, zoom);
  return {
    scene,
    camera: orientedCamera({ x: 0, z: 0 }, pxPerUnit),
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit,
    islands: size.islands,
    plan: {
      triangles: geo.triangles,
      octaves: grass === undefined ? 0 : GRASS_OCTAVES,
      // ⚠ REPORTED SEPARATELY from layer 1's, because the CONTROL now wears layer 1 and a single
      // total cannot say which layer an arm is carrying. The control's correct sand count is 0
      // while its grass count is 23 — one number could not express that.
      sandOctaves: !bare && armWearsSand(arm) ? SAND_OCTAVES : 0,
      wearOctaves: extras.wear === undefined ? 0 : WEAR_OCTAVES,
      mix: GRASS_ARM_MIX[arm],
    },
  };
}

/**
 * THE APPROVED RENDER, carried as a REFERENCE ARM.
 *
 * ⚠ IT IS THE STANDARD THE OWNER SET, restated on 2026-09-01: *"the image that I stamped as
 * looking awesome was done in isolation and now we trying to do the same with the app constraints
 * in place"*. So every crossing on this arc is judged against the APPROVED PICTURE and not
 * against its own best harness arm, and the gap is printed rather than inferred.
 */
export const REFERENCE_IMAGE = '/reference/chapter2-land-idiom-2026-08-27/land-combined-1948px.png';

/** The gap this arc exists to close, as the two numbers ADR-0490's context table states — carried
 *  here so the evidence sheet can print the arc's own target beside what an arm delivered, rather
 *  than a reader having to fetch it.
 *
 *  ⚠⚠ THEY ARE THE ARC'S FIGURES AND THEY ARE RE-MEASURED, NEVER INHERITED. The driver computes
 *  the shipped count from the CONTROL ARM it just rendered and prints both — a figure quoted from
 *  a decision is a figure as at the day it was written, which is the first hazard this arc names.
 *  A disagreement between the two is a finding about the map having moved, not a defect. */
export const ARC_FAMILY_TARGET = { shippedAsWritten: 9, approvedAsWritten: 36 } as const;

// ---------------------------------------------------------------- the instrument

/**
 * THE THRESHOLD AN ARM IS JUDGED ON — ADR-0490 D6, RE-EXPORTED FROM THE ONE MODULE THAT OWNS IT.
 *
 * ⚠ THIS PAGE USED TO DECLARE ITS OWN COPY, and so did the skirt page and both of their drivers:
 * four spellings of one authored number, which is how two pages stop agreeing without anyone
 * editing either. A re-export cannot drift from its source by construction; a second `= 20` can.
 */
export { VISIBLE_DELTA } from './visible-delta.js';

/** The colour-family quantiser ADR-0490's context table uses: 5 bits per channel. */
export function colourFamily(r: number, g: number, b: number): number {
  return ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
}

/** The share of a frame's LAND pixels a family must hold to be counted, matching the table's
 *  ">=0.5% of the island". A family below it is noise the picture does not read as a colour. */
export const FAMILY_FLOOR = 0.005;

/**
 * COLOUR FAMILIES OVER THE ISLAND'S OWN PIXELS — the arc's gap metric, computed on a frame.
 *
 * ⚠⚠ THE MASK IS THE BACKGROUND COLOUR, NOT ALPHA, and getting that wrong is a measured bug on
 * this page's sibling rather than a hypothetical. The frames are opaque — the sea is painted —
 * so an alpha mask selects the WHOLE FRAME, and a large perfectly flat region then dominates
 * every statistic and makes all four arms look identical: a null result manufactured by the
 * instrument. `shipped-skirt-scene.ts`'s runner records the same trap in its `bg` comment,
 * including that routing the authored hex through `THREE.Color` linearises it and matches
 * nothing.
 */
export interface FamilyCensus {
  /** Pixels that are not the painted sea — the denominator every share below is taken over. */
  land: number;
  /** Families holding at least {@link FAMILY_FLOOR} of them. */
  families: number;
  largestShare: number;
  topThreeShare: number;
}

export function familyCensus(rgba: Uint8ClampedArray, bg: readonly [number, number, number]): FamilyCensus {
  const counts = new Map<number, number>();
  let land = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    if (r === bg[0] && g === bg[1] && b === bg[2]) continue;
    land += 1;
    const key = colourFamily(r, g, b);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (land === 0) return { land: 0, families: 0, largestShare: 0, topThreeShare: 0 };
  const sorted = [...counts.values()].sort(descending);
  const held = sorted.filter((n) => n / land >= FAMILY_FLOOR);
  const top3 = sorted.slice(0, 3).reduce(sum, 0);
  return {
    land,
    families: held.length,
    largestShare: (sorted[0] ?? 0) / land,
    topThreeShare: top3 / land,
  };
}

/** Named comparators/folds — the mutation rung cannot attribute a mutant inside an inline arrow
 *  body to the test that kills it. */
function descending(a: number, b: number): number {
  return b - a;
}
function sum(a: number, b: number): number {
  return a + b;
}

/** The scene background as the FRAMEBUFFER holds it — parsed from the authored hex, never routed
 *  through `THREE.Color`, which converts sRGB to linear on construction and would make the mask
 *  match nothing (see {@link familyCensus}). */
export function backgroundBytes(): readonly [number, number, number] {
  const hex = SHIPPED_LIGHTING.background.replace('#', '');
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ] as const;
}

/** What one arm delivered, on one frame — everything a row of the evidence table needs. */
export interface GrassReading {
  arm: GrassArm;
  pxPerUnit: number;
  triangles: number;
  drawCalls: number;
  octaves: number;
  /** Layer 2's own octaves, over layer 1's. Zero on the control, which wears layer 1 only. */
  sandOctaves: number;
  stats: ImageStats;
  /** Land pixels, colour families holding >=0.5% of them, and how concentrated they are. */
  land: number;
  families: number;
  largestShare: number;
  topThreeShare: number;
  /** Against the CONTROL arm. `touched` is context only (ADR-0490 D6). */
  touched: number;
  visible: number;
  /** The WHOLE magnitude distribution the two counts above are summaries of — the half that makes
   *  the metric defensible, since a bare count over a threshold discards exactly the information
   *  whose absence made the touched count misleading. */
  delta: VisibleDeltaReading;
}

/** The approved render put through this page's own instrument. */
export interface ReferenceReading {
  stats: ImageStats;
  families: number;
  largestShare: number;
}

export interface GrassRunner {
  identity(): RendererIdentity;
  warm(): void;
  read(arm: GrassArm, size: CrowdSizeId, zoom: CrowdZoom): GrassReading;
  /**
   * RUNG 2 over the pixels this run actually captured: can this instrument resolve the cited
   * boundary at all? Empty means it can. A driver that skips this cannot tell "the arms look
   * alike" from "this comparison never saw two different frames".
   */
  sensitivity(size: CrowdSizeId, zoom: CrowdZoom): string[];
  snapshot(arm: GrassArm, size: CrowdSizeId, zoom: CrowdZoom): string;
  reference(url: string): Promise<ReferenceReading>;
}

/**
 * ONE WebGL CONTEXT FOR THE WHOLE PAGE, and every arm rendered through it.
 *
 * ⚠ A CONTEXT PER ARM WOULD BE THE OBVIOUS SHAPE AND IS WRONG HERE: browsers cap simultaneous
 * WebGL contexts near sixteen and silently LOSE the oldest, and a lost canvas contributes zero
 * pixels — which can never break a check, only make one pass for the wrong reason
 * (`capture.mjs`'s own header records paying for exactly that).
 */
export function createGrassRunner(): GrassRunner {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const bg = backgroundBytes();

  const cache = new Map<string, GrassScene>();
  const sceneFor = (arm: GrassArm, size: CrowdSizeId, zoom: CrowdZoom): GrassScene => {
    const k = `${arm}|${size}|${zoom}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildGrassScene(arm, crowdSize(size), zoom);
    cache.set(k, built);
    return built;
  };

  const render = (arm: GrassArm, size: CrowdSizeId, zoom: CrowdZoom): GrassScene => {
    const s = sceneFor(arm, size, zoom);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };

  const pixels = (arm: GrassArm, size: CrowdSizeId, zoom: CrowdZoom): Uint8ClampedArray => {
    const s = render(arm, size, zoom);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return new Uint8ClampedArray(buf.buffer);
  };

  /** Pixels whose largest channel move exceeds `threshold`. At 0 this is the TOUCHED count. */
  /** This arm against the CONTROL, through the ONE instrument that owns the ADR-0490 D6 metric.
   *  One pass now yields the whole magnitude distribution where two passes previously yielded two
   *  counts. */
  const deltaOf = (arm: GrassArm, size: CrowdSizeId, zoom: CrowdZoom): VisibleDeltaReading =>
    visibleDeltaDistribution(pixels(arm, size, zoom), pixels(CONTROL_ARM, size, zoom));

  return {
    identity: () => readIdentity(gl),
    warm() {
      for (const arm of GRASS_ARMS) render(arm, 'one', GRASS_ZOOMS[0]!);
    },
    read(arm, size, zoom) {
      const s = render(arm, size, zoom);
      const info = renderer.info.render;
      const buf = pixels(arm, size, zoom);
      const census = familyCensus(buf, bg);
      const delta = deltaOf(arm, size, zoom);
      return {
        arm,
        pxPerUnit: s.pxPerUnit,
        triangles: s.plan.triangles,
        drawCalls: info.calls,
        octaves: s.plan.octaves,
        sandOctaves: s.plan.sandOctaves,
        stats: imageStats(buf, s.width, s.height, bg),
        land: census.land,
        families: census.families,
        largestShare: census.largestShare,
        topThreeShare: census.topThreeShare,
        touched: delta.touched,
        visible: delta.visible,
        delta,
      };
    },
    sensitivity(size, zoom) {
      return sensitivityReasons(pixels(CONTROL_ARM, size, zoom));
    },
    snapshot(arm, size, zoom) {
      render(arm, size, zoom);
      return canvas.toDataURL('image/png');
    },
    async reference(url) {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error(`shipped-grass-scene: the reference ${url} did not load`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('shipped-grass-scene: no 2d context for the reference');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const buf = new Uint8ClampedArray(data.buffer.slice(0));
      // ⚠ THE REFERENCE IS MASKED ON ALPHA, NOT ON OUR BACKGROUND. It is a Cycles render with a
      // transparent sea; our frames paint theirs. Using one mask for both would count the
      // reference's whole canvas as land and report a family count about transparency.
      const census = referenceFamilies(buf);
      return {
        stats: imageStats(buf, c.width, c.height, REFERENCE_TRANSPARENT),
        families: census.families,
        largestShare: census.largestShare,
      };
    },
  };
}

/** The sentinel `imageStats` is handed for the reference — a colour no opaque pixel of a Cycles
 *  render holds, so the mask falls back to alpha via {@link referenceFamilies} and this triple
 *  excludes nothing it should keep. */
const REFERENCE_TRANSPARENT: readonly [number, number, number] = [-1, -1, -1];

/** The reference's own family census, masked on ALPHA. */
export interface ReferenceFamilies {
  families: number;
  largestShare: number;
}

export function referenceFamilies(rgba: Uint8ClampedArray): ReferenceFamilies {
  const counts = new Map<number, number>();
  let land = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    land += 1;
    const key = colourFamily(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (land === 0) return { families: 0, largestShare: 0 };
  const sorted = [...counts.values()].sort(descending);
  return {
    families: sorted.filter((n) => n / land >= FAMILY_FLOOR).length,
    largestShare: (sorted[0] ?? 0) / land,
  };
}

// ---------------------------------------------------------------- the page

/** Render the whole comparison into `root`. The DOM half only — every number it prints comes from
 *  {@link createGrassRunner}, so the page and `shipped-grass-measure.mjs` cannot disagree. */
export async function mountShippedGrass(root: HTMLElement): Promise<void> {
  const runner = createGrassRunner();
  // ⚠ THE DRIVER READS THE PAGE'S OWN RUNNER rather than building a second one, so the numbers in
  // the committed evidence and the numbers under the pictures cannot be two measurements that
  // agree today. `shipped-grass-measure.mjs` waits on exactly this handle.
  //
  // ⚠⚠ PUBLISHED BEFORE `warm()`, NOT AFTER, AND THE ORDER IS LOAD-BEARING. Warming builds every
  // arm, and a layer whose field is slow to build makes that take minutes — during which the
  // handle did not exist and the driver's `waitForFunction` timed out against a page that was
  // working perfectly. A slow page then reads exactly like a broken one, which is how layer 2's
  // first render attempt was misdiagnosed. Publishing first means the driver waits for the work
  // rather than for a symptom of it.
  window.grassRunner = runner;
  runner.warm();
  const id = runner.identity();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent = `${id.vendor} — ${id.renderer} · software=${id.software}`;
  root.appendChild(head);

  // ⚠⚠ THE REFERENCE GOES FIRST, and its position is the argument: this arc's standing rule is
  // that a crossing is judged against the picture the owner approved rather than against its own
  // best arm, so the approved render is what a reader sees before any of ours.
  const refHead = document.createElement('h2');
  refHead.textContent =
    'THE REFERENCE — the render the owner stamped (Blender/Cycles, no frame budget, not differenced)';
  root.appendChild(refHead);
  const refRow = document.createElement('div');
  refRow.className = 'row';
  const refFig = document.createElement('figure');
  const refImg = document.createElement('img');
  refImg.src = REFERENCE_IMAGE;
  refImg.width = 760;
  const refCap = document.createElement('figcaption');
  refCap.textContent = 'land-combined — the approved ground (all seven layers, path-traced)';
  try {
    const r = await runner.reference(REFERENCE_IMAGE);
    refCap.textContent =
      `land-combined (APPROVED) — colour families ${r.families} · largest holds ` +
      `${(r.largestShare * 100).toFixed(1)}% · MICRO ${r.stats.micro.toFixed(2)} · ` +
      `STRUCT ${r.stats.struct.toFixed(2)}`;
  } catch {
    // A missing reference is reported in the caption rather than thrown: the live arms below are
    // still worth looking at, and a page that renders nothing hides them for an unrelated reason.
    refCap.textContent = 'land-combined (APPROVED) — ⚠ NOT MEASURED (the image did not load)';
  }
  refFig.append(refImg, refCap);
  refRow.appendChild(refFig);
  root.appendChild(refRow);

  const overview = document.createElement('h2');
  overview.textContent = 'the whole forest, fitted to a laptop screen';
  root.appendChild(overview);
  root.appendChild(armRow(runner, 'forest', FIT_ZOOM));

  for (const zoom of GRASS_ZOOMS) {
    for (const size of GRASS_SIZES) {
      const h2 = document.createElement('h2');
      h2.textContent = `${zoom} delivered px per ground unit — ${size.what}`;
      root.appendChild(h2);
      root.appendChild(armRow(runner, size.id, zoom));
    }
  }
}

/** One row of four arms at one size and zoom, each with its own numbers under it. */
function armRow(runner: GrassRunner, size: CrowdSizeId, zoom: CrowdZoom): HTMLElement {
  const row = document.createElement('div');
  row.className = 'row';
  for (const arm of GRASS_ARMS) {
    const r = runner.read(arm, size, zoom);
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = runner.snapshot(arm, size, zoom);
    img.width = 620;
    const cap = document.createElement('figcaption');
    cap.textContent =
      `${arm} · families ${r.families} (largest ${(r.largestShare * 100).toFixed(1)}%, ` +
      `top three ${(r.topThreeShare * 100).toFixed(1)}%) · MICRO ${r.stats.micro.toFixed(2)} · ` +
      `STRUCT ${r.stats.struct.toFixed(2)} · vs control: ${r.visible} px moved >${VISIBLE_DELTA}/255 ` +
      `(${r.touched} touched) — ${GRASS_ARM_CAPTION[arm]}`;
    fig.append(img, cap);
    row.appendChild(fig);
  }
  return row;
}

declare global {
  interface Window {
    grassRunner?: GrassRunner;
  }
}
