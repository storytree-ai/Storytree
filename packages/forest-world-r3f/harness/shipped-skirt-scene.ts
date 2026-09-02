// shipped-skirt-scene.ts — THE ISLAND'S EDGE, FOUR WAYS, AGAINST THE PICTURE THE OWNER APPROVED.
//
// THE INCREMENT: the stepped cliff skirt on `adopt-the-land-into-the-shipped-map-arc` — the SIXTH
// and last of the approved treatment's components, and the only one that needed the owner before it
// could be built at all.
//
// ⚠⚠ WHY IT NEEDED HIM, AND WHAT HE CHANGED. Every colour on this map's ground is a capability's
// proof state, and the edge wall inherits the parcel's tint, so it reports too. A rock cliff is the
// first ground surface that reports nothing. He settled it on 2026-09-01 and granted MORE than the
// question asked — sessions may add colours as needed, and the fence is now an OUTCOME test the
// session applies itself:
//
//     LOOK AT THE FINAL RENDER AND ASK: CAN I TELL WHAT STATE THIS ISLAND IS IN?
//
// This page is where that question is asked, which is why the four arms are the ones they are: they
// are his own options A, B and C beside the map as it draws today, so the test is applied to
// pictures rather than to an argument.
//
// ⚠⚠ AND THE VERDICT IS NOT "IT RENDERS". This arc's standing instruction (`oq-the-map-this-arc-is-
// improving-is-mounted-nowhere-which-ma`, and again on the ladder question) is that every crossing
// is judged against the APPROVED PICTURE and not against its own harness arm — "the image that I
// stamped as looking awesome was done in isolation and now we trying to do the same with the app
// constraints in place". So the approved Cycles render is carried here as a REFERENCE ARM and put
// through the SAME instrument as the live frames, and the gap is printed rather than inferred.
//
// ⚠ THE REFERENCE ARM IS AN IMAGE, NOT A SCENE, AND THAT IS STATED RATHER THAN HIDDEN. It is a path
// tracer's output at a different resolution, framing and camera; its MICRO/STRUCT/anchor numbers are
// comparable to the live arms' on the same axes and its PIXEL DIFFERENCES are not comparable to
// anything. So {@link REFERENCE_IMAGE} is measured and never differenced.
//
// THE PAGE ADOPTS NOTHING. `harness/` only — it produces EVIDENCE about the `src/` module it
// imports. The adoption is a separate edit in the same landing (`ForestWorldCanvas.tsx`).

import * as THREE from 'three';

import {
  GROUND_ATLAS_ATTRIBUTE,
  GROUND_STATUS_ATTRIBUTE,
  createBandedGroundMaterial,
  groundAtlasTexture,
  type BandedGroundMaterialOptions,
} from '../src/banded-ground-material.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import {
  SHIPPED_GRASS,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  shippedGroundBuild,
  type ShippedGroundBuild,
} from '../src/ForestWorldCanvas.js';
import { DETAIL_TILE_UNITS, detailNormalTexture } from '../src/detail-normal-texture.js';
import { SAND_FIELD_WIDTH } from '../src/shore-atlas.js';
import { SHIPPED_SHORE } from '../src/shore-fall.js';
import { WEAR_FIELD_WIDTH } from '../src/wear-atlas.js';
import { shoreArmRingPlan } from '../src/shore-ring.js';
import {
  SKIRT_ROCK,
  SKIRT_ROCK_LIT,
  SKIRT_ROCK_SHADED,
  SKIRT_ROCK_SHADED_SUNK,
  SKIRT_ROWS,
  isRimEdge,
  mappedShadedRock,
  oneRock,
  rimEdgeKeys,
  shadeBelowHalfDepth,
  shadeBelowLadderFloor,
  shadedRockAboveSea,
  skirtExtraTriangles,
  type GroundSkirt,
  type SkirtRock,
} from '../src/stepped-skirt.js';
import { parseHex, type Rgb255 } from '../src/shade-ladder.js';
import { cliffReadability, type CliffReadability } from './cliff-readability.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';
import { SHIPPED_GROUND_COLOUR, SHIPPED_LIGHTING } from './shipped-baseline.js';
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
 * THE FOUR ARMS — the map today, and the owner's own three options.
 *
 * ⚠ THEY ARE HIS OPTIONS AND NOT A LADDER OF ADDITIONS, which is why this page does not carry the
 * `from:` chain the land page does. `stepped` and `rock` both extend `flat`; `soil-over-rock` is a
 * variant of `rock` rather than an addition to it. Naming a predecessor for each would assert a
 * sequence that does not exist.
 */
export type SkirtArm =
  | 'flat'
  | 'stepped'
  | 'rock'
  | 'soil-over-rock'
  | 'two-token-lit'
  | 'two-token-deep'
  | 'two-token-sunk'
  | 'two-token-mapped'
  | 'two-token-sea36'
  | 'two-token-sea44';

/** The arm the FIRST four are read against: the map exactly as it drew before this component —
 *  ONE flat quad per rim edge, wearing the parcel's own status colour. */
export const CONTROL_ARM: SkirtArm = 'flat';

/**
 * THE LADDER THE SHADED ROCK WAS RE-PICKED FROM (ADR-0503 D3) — each rung is how far, in luma,
 * the rock's darkest delivered pixel sits above the sea. `two-token-deep` is the rung that SHIPS
 * ({@link SKIRT_ROCK_SHADED} — the fence's own floor, 21, found by search); `two-token-mapped` is
 * the approved quartile re-based onto the sea's headroom (28.5); the two here are two steps lighter
 * again, so "scale it back" can point at a column already rendered.
 */
export const SKIRT_SEA_LADDER = { 'two-token-sea36': 36, 'two-token-sea44': 44 } as const;

export const SKIRT_ARMS: readonly SkirtArm[] = [
  'flat',
  'stepped',
  'rock',
  'soil-over-rock',
  'two-token-lit',
  'two-token-deep',
  'two-token-sunk',
  'two-token-mapped',
  'two-token-sea36',
  'two-token-sea44',
];

/**
 * THE DENOMINATOR EACH ARM'S PIXEL FIGURES ARE READ AGAINST — data rather than one fixed constant,
 * because this page now answers TWO questions and they have different controls.
 *
 * ⚠⚠ A COMPARISON AGAINST THE WRONG CONTROL IS NOT A SMALLER RESULT, IT IS A DIFFERENT CLAIM.
 * The owner's options A/B/C asked *should the island's edge be a rock cliff at all*, and their
 * denominator is the map before any cliff (`flat`). `two-token` asks a question that only exists
 * once A shipped — *can one rock token span the cliff's tonal range* — so its denominator is the
 * SHIPPED CLIFF. Reading it against `flat` would credit the second token with everything the first
 * one already delivered, which is the shape of over-claim this arc's own instrument exists to
 * refuse.
 */
export const ARM_CONTROL = {
  flat: 'flat',
  stepped: 'flat',
  rock: 'flat',
  'soil-over-rock': 'flat',
  'two-token-lit': 'rock',
  'two-token-deep': 'rock',
  // ⚠ THE RE-PICK ARMS ARE READ AGAINST `rock` TOO, not against the sunk pair: the question each
  // answers is still "what does a SECOND token buy over one", and reading them against the pair
  // that merged with the sea would credit a rung with the pixels the water gave back. The
  // sea-readability question is asked separately, against `flat`, by `SkirtRunner.readability`.
  'two-token-sunk': 'rock',
  'two-token-mapped': 'rock',
  'two-token-sea36': 'rock',
  'two-token-sea44': 'rock',
} satisfies Record<SkirtArm, SkirtArm>;

/** What each arm IS, as the caption under its own picture — beside the arm rather than in the HTML,
 *  so an arm cannot be added without a reader being told what it is. */
export const SKIRT_ARM_CAPTION = {
  flat: 'the shipped map today — ONE flat wall per rim edge, wearing the parcel’s status colour (CONTROL)',
  stepped: 'six ledges, still the parcel’s status colour — the SHAPE without the rock (his option C)',
  rock: 'six ledges, all of them rock — the approved picture’s cliff (his option A)',
  'soil-over-rock': 'six ledges, the TOP one keeping the status tint (his option B)',
  'two-token-lit':
    'a LIT rock and a SHADED one, split by LIGHTING — the faces the ladder has SATURATED wear the ' +
    'shaded rock (read against `rock`, not against `flat`)',
  'two-token-deep':
    'the same pair split by DEPTH — the cliff’s lower half wears the shaded rock, RE-PICKED against ' +
    'the sea at the fence’s own floor: 21 luma above `#101418`, the darkest base whose every rung ' +
    'still clears the 20/255 bar (SHIPS; read against `rock`, not against `flat`)',
  'two-token-sunk':
    'the pair as it shipped on 2026-09-01 — the shaded rock lifted straight off the render’s mask, ' +
    '6 luma above the sea, which swallowed two thirds of the cliff (WITHDRAWN; the before)',
  'two-token-mapped':
    'the ladder’s principled rung — the approved quartile re-based onto the headroom the sea ' +
    'leaves, 28.5 luma above it (the scale-back the pick was judged against)',
  'two-token-sea36': 'the ladder, one step lighter — the shaded rock 36 luma above the sea',
  'two-token-sea44': 'the ladder, two steps lighter — the shaded rock 44 luma above the sea',
} satisfies Record<SkirtArm, string>;

/** How many ledges from the top keep the parcel's status tint, per arm. `flat` is one ledge and it
 *  is soil, which is the shipped wall exactly. */
export const ARM_SOIL_LEDGES = {
  flat: 1,
  stepped: SKIRT_ROWS,
  rock: 0,
  'soil-over-rock': 1,
  'two-token-lit': 0,
  'two-token-deep': 0,
  'two-token-sunk': 0,
  'two-token-mapped': 0,
  'two-token-sea36': 0,
  'two-token-sea44': 0,
} satisfies Record<SkirtArm, number>;

/** Ledges per rim edge, per arm. */
export const ARM_ROWS = {
  flat: 1,
  stepped: SKIRT_ROWS,
  rock: SKIRT_ROWS,
  'soil-over-rock': SKIRT_ROWS,
  'two-token-lit': SKIRT_ROWS,
  'two-token-deep': SKIRT_ROWS,
  'two-token-sunk': SKIRT_ROWS,
  'two-token-mapped': SKIRT_ROWS,
  'two-token-sea36': SKIRT_ROWS,
  'two-token-sea44': SKIRT_ROWS,
} satisfies Record<SkirtArm, number>;

/**
 * THE REFERENCE ARM — the render the owner stamped, carried as a committed image.
 *
 * `land-combined-1948px.png` is the `combined` variant of the land-idiom pass: the treatment whose
 * six components this arc has been crossing one at a time. It is the picture "this looks better,
 * stamp it" was said of.
 */
export const REFERENCE_IMAGE = '/reference/chapter2-land-idiom-2026-08-27/land-combined-1948px.png';

/** The same render with a PROCEDURAL rock on the skirt and nothing else changed — the pair whose
 *  difference IS the skirt, and the pair the 9.8%-of-structural-contrast finding was measured on.
 *  Carried so this page can re-derive that number rather than quoting it. */
export const REFERENCE_STRATA_IMAGE = '/reference/chapter2-land-idiom-2026-08-27/land-strata-1948px.png';

/** The ramp rows this page's material uploads: the shipped statuses, then the rock appended LAST —
 *  the same order `ForestWorldCanvas.tsx` derives, and derived the same way rather than transcribed,
 *  so a status added to the map cannot leave this page painting parcels the wrong colour. */
/** ⚠ ALL THREE ROCKS RIDE ONE TABLE, so every arm on this page uploads the SAME ramp and an arm
 *  differs from its neighbour only in which rows its geometry selects. Two tables would make a
 *  pixel difference between two arms attributable to the material as well as to the cliff, which
 *  is exactly the confound this page's "only the edge moves" claim rests on not having. */
/** The scene's sea as the framebuffer holds it — the background every re-pick rung is measured
 *  against, parsed from the authored hex rather than routed through `THREE.Color` (see the runner's
 *  `bg` for why that route delivers the wrong bytes). */
export const SKIRT_SEA: Rgb255 = parseHex(SHIPPED_LIGHTING.background);

/** The ladder's three bracketing rocks — the mapped quartile through its own derivation, the two
 *  lighter rungs through the rung-maker the shipped floor was found with — so a rung differs from
 *  its neighbour in exactly one number. */
export const SKIRT_LADDER_ROCK = {
  'two-token-mapped': mappedShadedRock(SKIRT_SEA, VISIBLE_DELTA),
  'two-token-sea36': shadedRockAboveSea(SKIRT_SEA, SKIRT_SEA_LADDER['two-token-sea36']),
  'two-token-sea44': shadedRockAboveSea(SKIRT_SEA, SKIRT_SEA_LADDER['two-token-sea44']),
} as const;

export const SKIRT_GROUND_TOKENS: readonly string[] = [
  ...SHIPPED_GROUND_COLOUR.values(),
  SKIRT_ROCK,
  SKIRT_ROCK_LIT,
  SKIRT_ROCK_SHADED,
  // ⚠ THE WITHDRAWN ROCK AND THE LADDER RIDE THE SAME TABLE, past the shipping rows, for the same
  // reason the three rocks share it: an arm may differ from its neighbour only in which rows its
  // geometry selects. None of these four is drawn by the map.
  SKIRT_ROCK_SHADED_SUNK,
  SKIRT_LADDER_ROCK['two-token-mapped'],
  SKIRT_LADDER_ROCK['two-token-sea36'],
  SKIRT_LADDER_ROCK['two-token-sea44'],
];

/** Each rock's row — LOOKED UP in the table rather than written down, so a token added to it
 *  cannot leave an arm selecting a neighbour's colour. `indexOf` is exact here because every rock
 *  is a distinct hex, which `skirt-rock-separation.test.ts` asserts rather than assumes. */
const rockRow = (token: string): number => SKIRT_GROUND_TOKENS.indexOf(token);
export const SKIRT_ROCK_ROW = rockRow(SKIRT_ROCK);
export const SKIRT_ROCK_LIT_ROW = rockRow(SKIRT_ROCK_LIT);
export const SKIRT_ROCK_SHADED_ROW = rockRow(SKIRT_ROCK_SHADED);
export const SKIRT_ROCK_SHADED_SUNK_ROW = rockRow(SKIRT_ROCK_SHADED_SUNK);

/** One island, and the thirty-five-island forest. A cliff is a per-island silhouette, so ONE is
 *  where it is read — and the forest is where a component either survives being small or does not. */
export const SKIRT_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];

/** The two zooms every comparison on this arc is taken at, plus the fitted overview, which is a
 *  CONTEXT picture and never a timing. */
export const SKIRT_ZOOMS: readonly number[] = [...CROWD_ZOOMS];
export const SKIRT_PICTURE_ZOOMS: readonly CrowdZoom[] = [...SKIRT_ZOOMS, FIT_ZOOM];

/** Bytes per vertex the merged ground buffer uploads: position (3) + normal (3) + status row (1) +
 *  atlas origin (2), all `Float32`. Written as the sum rather than as 36 so a channel added to the
 *  buffer is a change to this line rather than a silently stale constant. */
const GROUND_FLOATS_PER_VERTEX = 3 + 3 + 1 + 2;

/** The rock in the buffer's LINEAR space, through three's own transfer function — the same route
 *  `ForestWorldCanvas.tsx` converts it by, so the arm this page photographs and the map that ships
 *  cannot deliver the token at two different lightnesses. */
const linearRock = (token: string): SkirtRock => {
  const c = new THREE.Color(token);
  return { row: rockRow(token), colour: { r: c.r, g: c.g, b: c.b } };
};

/**
 * THE ROCK PAIR EACH ARM WEARS.
 *
 * ⚠ THE FOUR ORIGINAL ARMS HAND THE SAME ROCK TWICE, through {@link oneRock}, and that is what
 * keeps them the arms whose numbers this page already published: the selection still runs on every
 * ledge and both of its answers are the median rock, so their buffers are the buffers they were.
 * `two-token` is the only arm whose two entries differ.
 */
const ARM_ROCK = {
  flat: oneRock(linearRock(SKIRT_ROCK)),
  stepped: oneRock(linearRock(SKIRT_ROCK)),
  rock: oneRock(linearRock(SKIRT_ROCK)),
  'soil-over-rock': oneRock(linearRock(SKIRT_ROCK)),
  'two-token-lit': {
    lit: linearRock(SKIRT_ROCK_LIT),
    shaded: linearRock(SKIRT_ROCK_SHADED),
    isShaded: shadeBelowLadderFloor,
  },
  'two-token-deep': {
    lit: linearRock(SKIRT_ROCK_LIT),
    shaded: linearRock(SKIRT_ROCK_SHADED),
    isShaded: shadeBelowHalfDepth,
  },
  // ⚠ THE FOUR RE-PICK ARMS DIFFER FROM `two-token-deep` IN THE SHADED ROCK AND NOTHING ELSE —
  // same lit rock, same depth rule — so a pixel between any two of them is attributable to that
  // one hex. The ladder is a ladder only because every other input is held.
  'two-token-sunk': {
    lit: linearRock(SKIRT_ROCK_LIT),
    shaded: linearRock(SKIRT_ROCK_SHADED_SUNK),
    isShaded: shadeBelowHalfDepth,
  },
  'two-token-mapped': {
    lit: linearRock(SKIRT_ROCK_LIT),
    shaded: linearRock(SKIRT_LADDER_ROCK['two-token-mapped']),
    isShaded: shadeBelowHalfDepth,
  },
  'two-token-sea36': {
    lit: linearRock(SKIRT_ROCK_LIT),
    shaded: linearRock(SKIRT_LADDER_ROCK['two-token-sea36']),
    isShaded: shadeBelowHalfDepth,
  },
  'two-token-sea44': {
    lit: linearRock(SKIRT_ROCK_LIT),
    shaded: linearRock(SKIRT_LADDER_ROCK['two-token-sea44']),
    isShaded: shadeBelowHalfDepth,
  },
} satisfies Record<SkirtArm, Pick<GroundSkirt, 'lit' | 'shaded' | 'isShaded'>>;

/** The skirt one arm wears, over the parcels it will actually draw. */
export function armSkirt(arm: SkirtArm, cells: readonly InstanceDescriptor[]): GroundSkirt {
  const rim = rimEdgeKeys(cells);
  return {
    rows: ARM_ROWS[arm],
    ...ARM_ROCK[arm],
    soilLedges: ARM_SOIL_LEDGES[arm],
    isRim: (a, b) => isRimEdge(rim, a, b),
  };
}

/**
 * THE SHIPPED GROUND, BUILT ONCE PER CROWD SIZE AND SHARED BY EVERY ARM.
 *
 * ⚠⚠ IT IS THE SHIPPED BUILDER, NOT A RECONSTRUCTION OF IT. `shippedGroundBuild` is the one
 * construction of the map's `CellGroundGeometryInput` — coast clip, occlusion field, relief, shore
 * fall, inset ring, stepped skirt, atlas origins — and `CellGround` calls it. This page calls the
 * SAME function, so an arm here cannot be a different scene from the map by construction: the
 * hazard `comparison-baseline-moves-under-the-page` records (a control that quietly became the map
 * as it stood an hour earlier, because the page assembled its own input) is closed structurally
 * rather than by a checklist. The only key an arm overrides is `skirt`, which is the one thing
 * this page varies.
 *
 * ⚠ MEMOISED PER SIZE, and that is what makes ten arms affordable. The occlusion field is the
 * expensive half of the build (tens of seconds at forest scale), and it does not depend on the
 * arm — every arm shares the same casters over the same ground. Building it per arm cost the
 * page's mount six field builds with six arms and pushed it past the driver's five-minute wait
 * with ten; one build per size is what a page with a ladder on it needs.
 *
 * ⚠ THE STRIPS ARE THE CROWD'S OWN TWO LANDINGS PER ISLAND (`crowdStrips`), handed in for the
 * same reason the grass page hands them in: layer 3's connector reads their ends as the islands'
 * docks, and a build handed no strips yields a wear field of no wear everywhere — a page whose
 * arms all wore a path the map does not draw, or none where the map draws one, would be
 * comparing cliffs on a ground that is not the shipped ground.
 */
const groundBuildCache = new Map<CrowdSizeId, ShippedGroundBuild>();
export function skirtGroundBuild(size: CrowdSize): ShippedGroundBuild {
  const hit = groundBuildCache.get(size.id);
  if (hit !== undefined) return hit;
  const built = shippedGroundBuild(crowdCells(size), crowdCasters(size), crowdStrips(size));
  groundBuildCache.set(size.id, built);
  return built;
}

/** What one arm costs, in numbers a picture cannot carry. */
export interface SkirtPlan {
  triangles: number;
  /** The extra triangles the ledges cost over the flat wall — stated separately because it is the
   *  number the arc sized this component at (~624 on the reference island) and the one a hardware
   *  argument would be made from. */
  skirtTriangles: number;
  /** Rim edges across every parcel — the cliff's own length, in edges. */
  rimEdges: number;
  attributeBytes: number;
}

export function skirtPlan(size: CrowdSize, arm: SkirtArm): SkirtPlan {
  // ⚠ THE CLIPPED PARCELS ARE THE BUILD'S OWN — `shippedGroundBuild` clips the coast first and
  // every downstream key reads the clipped set, so the census here walks the same rings the
  // geometry was cut from rather than a second clip that could disagree with it.
  const clipped = skirtGroundBuild(size).input.cells;
  const skirt = armSkirt(arm, clipped);
  const geo = buildSkirtGeometry(size, skirt);
  // ⚠ COUNTED OFF THE WALL RING THE DECOMPOSITION PRODUCES, never off the parcel's own corners.
  // The inset ring inserts vertices along rim edges inside the shore band, so the island's outline
  // carries more edges than `c.points` does — and every one of them is a cliff edge. Counting the
  // raw ring here would report a cost the geometry does not have, which is the same disagreement
  // `cell-ground-geometry.ts` had to resolve in its own sizing loop.
  const plan = shoreArmRingPlan(clipped, SHIPPED_SHORE);
  let rimEdges = 0;
  for (const c of clipped) {
    const ring = plan.decompose(c).wall;
    if (ring.length < 3) continue;
    for (let i = 0; i < ring.length; i += 1) {
      if (skirt.isRim(ring[i]!, ring[(i + 1) % ring.length]!)) rimEdges += 1;
    }
  }
  return {
    triangles: geo.triangles,
    skirtTriangles: skirtExtraTriangles(rimEdges, ARM_ROWS[arm]),
    rimEdges,
    attributeBytes: geo.triangles * 3 * GROUND_FLOATS_PER_VERTEX * 4,
  };
}

/** The merged ground buffer for one arm — the SHIPPED input entire, with the skirt as the only
 *  moving part. Relief, shore fall, coast clip, inset ring, ladder, grain and occlusion atlas are
 *  exactly what `CellGround` builds, because they are literally what it builds
 *  ({@link skirtGroundBuild}); so a pixel difference between two arms is attributable to the cliff
 *  and to nothing else on the page. */
function buildSkirtGeometry(size: CrowdSize, skirt: GroundSkirt) {
  return cellGroundGeometry({ ...skirtGroundBuild(size).input, skirt });
}

export interface SkirtScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  islands: number;
  plan: SkirtPlan;
}

/** THE ONE DETAIL TEXTURE FOR THE PAGE, created on first use — the canvas keeps its own the same
 *  way (`shippedDetailTexture`, module-private there). Lazy because `TextureLoader` needs a
 *  `document`; a node-side reader of this module's constants must not decode 26 KB of PNG at
 *  import, and under node `detailNormalTexture` hands back a named empty texture anyway. */
let detailTextureMemo: THREE.Texture | undefined;
function skirtDetailTexture(): THREE.Texture {
  if (detailTextureMemo === undefined) detailTextureMemo = detailNormalTexture();
  return detailTextureMemo;
}

export function buildSkirtScene(arm: SkirtArm, size: CrowdSize, zoom: CrowdZoom): SkirtScene {
  const build = skirtGroundBuild(size);
  const cells = build.input.cells;
  if (cells.length === 0) throw new Error('shipped-skirt-scene: the crowd bounds nothing');

  const geo = buildSkirtGeometry(size, armSkirt(arm, cells));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));

  // ⚠ THE MATERIAL IS THE SHIPPED COMPOSITION WITH ONE SUBSTITUTION — the token table. The map's
  // `buildGroundMaterial` fixes its tokens to the map's own (statuses + the two rocks that ship);
  // this page's table carries the median rock, the withdrawn rock and the ladder as extra rows past
  // them, so an arm can select a colour the map does not draw. Every OTHER key is what
  // `CellGround` passes — the shared occlusion field, the grain, layer 1 at its shipped strength,
  // and since PR #1802 the whole ground stack: layer 2 (shore sand) and layer 3 (the worn path)
  // through the build's OWN packed carriers, layer 4 (rock on slope) and layer 6 (the cliff normal
  // as detail relief) at the strengths the owner chose from their ladders (ADR-0503). So a pixel
  // between two arms is the cliff's and nothing else's, ON THE GROUND THAT SHIPS. ⚠ Kept in step
  // with `buildGroundMaterial` BY READING IT, and now also by `shipped-skirt-scene.test.ts`,
  // which reads both sources and fails when the canvas passes a material key this page does not —
  // a layer adopted there must be added here in the same landing, or this page's control is the map
  // as it stood before that layer (`comparison-baseline-moves-under-the-page`).
  //
  // ⚠ NONE OF LAYERS 2/3/4 CAN REPAINT THE CLIFF: each rides `grassGate`, which the skirt's rock
  // rows never open, so an ungated row multiplies the layer by zero. Layer 6 touches no colour — it
  // bends the normal before the quantiser, so it can only move a cliff fragment between authored
  // rungs of its own token's ramp, every one of which the sea fence already holds above the water.
  // The stack changes what the cliff stands NEXT TO, not the colours the cliff can deliver.
  const opts: BandedGroundMaterialOptions = {
    tokens: SKIRT_GROUND_TOKENS,
    grain: 'normal',
    grass: SHIPPED_GRASS,
  };
  const shadow = build.field === null ? null : groundAtlasTexture(build.field);
  if (shadow !== null) opts.shadowAtlas = shadow;
  // LAYER 2 — the shore sand through the build's own distance-to-coast field. Offered only where
  // there is an atlas to sample it through, the way `buildGroundMaterial` offers it; the thunk is
  // memoised inside the build, so ten arms pay the field once per size.
  const shoreField = build.shore();
  if (shoreField !== null) {
    opts.sand = { shore: groundAtlasTexture(shoreField).texture, mix: SHIPPED_SAND_MIX, width: SAND_FIELD_WIDTH };
  }
  // LAYER 3 — the worn path through the build's own distance-to-path field, over the crowd's docks.
  const wearField = build.wear();
  if (wearField !== null) {
    opts.wear = { field: groundAtlasTexture(wearField).texture, mix: SHIPPED_LAYERS.wearMix, width: WEAR_FIELD_WIDTH };
  }
  // LAYERS 4 AND 6 — constants, as the canvas passes them.
  opts.rock = SHIPPED_LAYERS.rock;
  opts.detail = { map: skirtDetailTexture(), strength: SHIPPED_LAYERS.detail.strength, tile: DETAIL_TILE_UNITS };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.Mesh(geometry, createBandedGroundMaterial(opts)));
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
    plan: skirtPlan(size, arm),
  };
}

/**
 * THE THREE NUMBERS THE RESEARCH JUDGED THE SKIRT ON, re-implemented here so the live frames and
 * the approved render go through ONE instrument.
 *
 * ⚠ THEY ARE `measure_land.py`'s OWN DEFINITIONS, not near-relatives of them, because the finding
 * this component rests on is quoted in their units: swapping the kit's cliff for a procedural rock
 * cost "9.8% of structural contrast and 6.8 of luminance spread" and lifted the island's dark anchor
 * (its 2nd-percentile luma) by 7.0. A page that measured a different STRUCT could not check that.
 *
 *   ANCHOR  the 2nd percentile of luma over the island's own pixels. The island's DARKEST value,
 *           robust to a handful of outliers — and the quantity the cliff exists to supply.
 *   MICRO   mean |delta luma| between horizontally neighbouring pixels. Contrast at the pixel
 *           scale: grain, speckle, the ledges' own edges.
 *   STRUCT  standard deviation of luma after a 4-px box blur. Contrast at the scale a viewer still
 *           has at overview — landform, shore, and the cliff as a dark band.
 */
export interface ImageStats {
  pixels: number;
  anchor: number;
  micro: number;
  struct: number;
  /** Mean luma, so a run that simply got darker overall is distinguishable from one that got more
   *  contrasty — the two move ANCHOR the same way and only this separates them. */
  mean: number;
}

const BLUR_RADIUS = 2;

/** Luma from 8-bit sRGB channels, Rec.709 — the same weights `measure_land.py` uses. */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The three numbers over one RGBA buffer, counting only pixels that are NOT the scene background.
 *
 * ⚠ THE BACKGROUND IS EXCLUDED BY COLOUR, NOT BY ALPHA, and it has to be. The live frames are
 * rendered opaque onto `SHIPPED_LIGHTING.background`, so every pixel has alpha 255 and an
 * alpha-keyed mask would measure the sea as though it were land — a large, perfectly flat region
 * that drags STRUCT and MICRO toward zero and would make every arm look more similar than it is.
 */
export function imageStats(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  background: readonly [number, number, number] | null,
): ImageStats {
  const L = new Float64Array(w * h);
  const on = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    const isBg =
      a < 250 ||
      (background !== null &&
        Math.abs(r - background[0]) <= 2 &&
        Math.abs(g - background[1]) <= 2 &&
        Math.abs(b - background[2]) <= 2);
    if (isBg) continue;
    L[p] = luma(r, g, b);
    on[p] = 1;
    count += 1;
  }
  if (count === 0) return { pixels: 0, anchor: 0, micro: 0, struct: 0, mean: 0 };

  const values: number[] = [];
  let sum = 0;
  let micro = 0;
  let microPairs = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      if (on[p] === 0) continue;
      values.push(L[p]!);
      sum += L[p]!;
      const q = p + 1;
      if (x + 1 < w && on[q] === 1) {
        micro += Math.abs(L[p]! - L[q]!);
        microPairs += 1;
      }
    }
  }
  values.sort((a, b) => a - b);
  const anchor = values[Math.floor((values.length - 1) * 0.02)]!;
  const mean = sum / count;

  // The 4-px box blur STRUCT is measured after — over the masked pixels only, so the background
  // never bleeds into the island's edge and manufacture contrast there.
  let sq = 0;
  let blurSum = 0;
  let blurN = 0;
  const blurred: number[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = y * w + x;
      if (on[p] === 0) continue;
      let acc = 0;
      let n = 0;
      for (let dy = -BLUR_RADIUS; dy <= BLUR_RADIUS; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -BLUR_RADIUS; dx <= BLUR_RADIUS; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (on[q] === 0) continue;
          acc += L[q]!;
          n += 1;
        }
      }
      const v = acc / n;
      blurred.push(v);
      blurSum += v;
      blurN += 1;
    }
  }
  const blurMean = blurSum / blurN;
  for (const v of blurred) sq += (v - blurMean) * (v - blurMean);

  return {
    pixels: count,
    anchor,
    micro: microPairs === 0 ? 0 : micro / microPairs,
    struct: Math.sqrt(sq / blurN),
    mean,
  };
}

export interface SkirtReading {
  arm: SkirtArm;
  size: CrowdSizeId;
  pxPerUnit: number;
  width: number;
  height: number;
  islands: number;
  triangles: number;
  skirtTriangles: number;
  rimEdges: number;
  attributeBytes: number;
  /** Draw calls the renderer actually submitted. ONE, on every arm — the skirt changes how many
   *  triangles the ground carries, never how many meshes carry it. */
  drawCalls: number;
  trianglesSubmitted: number;
  gpuNs: number | null;
  batch: number;
  stats: ImageStats;
}

export interface SkirtRunner {
  identity(): RendererIdentity;
  warm(): void;
  geometry(arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): Omit<SkirtReading, 'gpuNs' | 'batch'>;
  /** Percentage of the FRAME differing between two arms at the same size and zoom. */
  changedPct(a: SkirtArm, b: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  changedPixels(a: SkirtArm, b: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  /**
   * How many pixels this arm's CLIFF covers — differenced against {@link CONTROL_ARM}.
   *
   * ⚠⚠ IT IS THE DENOMINATOR EVERY OTHER PIXEL NUMBER ON THIS PAGE NEEDS, and this arc has already
   * paid for forgetting it once on the coast. A cliff is a thin band around an island, so "2% of the
   * frame changed" reads as nothing at all beside two pictures whose edges are obviously different.
   */
  cliffPixels(arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  /** The magnitude distribution between ANY two arms — the general form of {@link SkirtRunner.delta},
   *  which is the same question asked with {@link ARM_CONTROL}'s answer already substituted. */
  deltaBetween(a: SkirtArm, b: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): VisibleDeltaReading;
  /** The denominator this runner read that arm against.
   *
   *  ⚠ ASKED OF THE PAGE RATHER THAN RESTATED BY THE DRIVER, so a report can never name a
   *  denominator the measurement did not use. The driver is `.mjs` and therefore untypechecked; a
   *  second copy of this mapping there would be prose beside a number, which is exactly the class
   *  `visible-delta.ts`'s header records four copies of. */
  controlOf(arm: SkirtArm): SkirtArm;
  /**
   * How many pixels this arm MOVED BY MORE THAN {@link VISIBLE_DELTA} — the metric ADR-0490 D6
   * makes the headline, in place of the touched-pixel count above.
   *
   * ⚠⚠ THE TWO ARE NOT THE SAME NUMBER AND THE DIFFERENCE HAS ALREADY MISLED THIS ARC. Counting
   * pixels that CHANGED AT ALL scored two increments about 4x higher than a reader would credit:
   * the owner looked at their pictures and said the arms did not look meaningfully different, and
   * recomputing by MAGNITUDE showed no pixel had moved more than 37/255 with a typical move of 8.
   * A one-unit change in the last bit of a channel counts identically to a black-to-white flip
   * under the touched metric, and only one of those is visible.
   */
  visiblePixels(arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  /** The WHOLE magnitude distribution against {@link CONTROL_ARM} — what the two counts above are
   *  summaries of. ADR-0490 D6's headline is defensible only beside it: a bare count over a
   *  threshold discards exactly the information whose absence made the touched count misleading. */
  delta(arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): VisibleDeltaReading;
  /**
   * RUNG 2 over the pixels this run actually captured: can this instrument resolve the cited
   * boundary at all? Empty means it can. Without it, "these arms look alike" and "this comparison
   * never saw two different frames" are the same report.
   */
  sensitivity(size: CrowdSizeId, zoom: CrowdZoom): string[];
  snapshot(arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): string;
  /**
   * HOW MUCH OF THIS ARM'S CLIFF A READER CAN TELL FROM THE SEA — the owner's own metric
   * (`cliff-readability.ts`), which none of the three statistics above can ask and one of them
   * (ANCHOR) rewards getting wrong.
   *
   * ⚠ MEASURED AGAINST `flat` FOR EVERY ARM, whatever {@link ARM_CONTROL} says. The cliff BAND is
   * every pixel the cliff occupies — the whole edge, lit half and shaded half — and only the map
   * with no cliff at all leaves that band untouched. Against `rock` a two-token arm's "cliff" would
   * be its lower half alone, and its apparent height would be the shaded rock's rather than the
   * cliff's. The 18-px band the owner sampled by hand is the band against `flat`.
   */
  readability(arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): CliffReadability;
  /** The reference render's own numbers, through the same {@link imageStats}. */
  reference(url: string): Promise<ImageStats>;
  time(arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom, batch: number): Promise<SkirtReading>;
  dispose(): void;
}

/**
 * How far a channel must move before a reader is credited with seeing it (ADR-0490 D6) —
 * RE-EXPORTED FROM THE ONE MODULE THAT OWNS IT.
 *
 * ⚠ THIS PAGE USED TO DECLARE ITS OWN COPY, and so did the grass page and both of their drivers:
 * four spellings of one authored number. A re-export cannot drift from its source; a second
 * `= 20` can, and neither page would notice.
 */
export { VISIBLE_DELTA } from './visible-delta.js';

const GPU_TIMER = 'EXT_disjoint_timer_query_webgl2';

async function elapsedNs(gl: WebGL2RenderingContext, query: WebGLQuery): Promise<number | null> {
  for (let i = 0; i < 600; i += 1) {
    if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true) {
      return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  return null;
}

export function createSkirtRunner(): SkirtRunner {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER) as
    | { QUERY_COUNTER_EXT?: number; TIME_ELAPSED_EXT: number }
    | null;

  /**
   * The scene background AS THE FRAMEBUFFER HOLDS IT — parsed from the authored hex, never routed
   * through `THREE.Color`.
   *
   * ⚠⚠ THIS WAS A REAL BUG AND IT FAILED IN THE DIRECTION THAT LOOKS LIKE WORKING CODE.
   * `new THREE.Color('#101418')` converts sRGB to LINEAR on construction under three's colour
   * management, so `c.r * 255` is 6, not 16 — the mask matched nothing, every arm measured the
   * SEA as though it were land, and the numbers came back with `pixels` equal to the whole frame:
   * MICRO 0.17 against the reference's 2.5, and a mean of 37 for an island whose own mean is ~130.
   * A large, perfectly flat region dragged every statistic toward the background's own value, so all
   * four arms looked nearly identical — a null result manufactured by the instrument.
   */
  const bg: readonly [number, number, number] = (() => {
    const hex = SHIPPED_LIGHTING.background.replace('#', '');
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ] as const;
  })();

  const cache = new Map<string, SkirtScene>();
  const key = (arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom) => `${arm}|${size}|${zoom}`;
  const sceneFor = (arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): SkirtScene => {
    const k = key(arm, size, zoom);
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildSkirtScene(arm, crowdSize(size), zoom);
    cache.set(k, built);
    return built;
  };

  const render = (arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): SkirtScene => {
    const s = sceneFor(arm, size, zoom);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };

  const pixels = (arm: SkirtArm, size: CrowdSizeId, zoom: CrowdZoom): Uint8ClampedArray => {
    const s = render(arm, size, zoom);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return new Uint8ClampedArray(buf.buffer);
  };

  /**
   * Two arms through the ONE instrument that owns the ADR-0490 D6 metric. The `touched` and
   * `visible` counts below are summaries of {@link VisibleDeltaReading}, which is now returned
   * whole so a report can print the distribution rather than a scalar.
   *
   * ⚠ MEMOISED, AND THAT IS A SPEED-UP RATHER THAN A NEW COST. `pixels()` RE-RENDERS AND
   * RE-READS on every call — it caches nothing — so the mount's per-figure pair of `cliffPixels`
   * + `visiblePixels` used to cost FOUR renders and four `readPixels` round trips to answer two
   * questions about one comparison. One distribution answers both, so the pair now costs two.
   */
  const deltaCache = new Map<string, VisibleDeltaReading>();
  const deltaOf = (
    a: SkirtArm,
    b: SkirtArm,
    size: CrowdSizeId,
    zoom: CrowdZoom,
  ): VisibleDeltaReading => {
    const k = `${a}|${b}|${size}|${zoom}`;
    const hit = deltaCache.get(k);
    if (hit !== undefined) return hit;
    const reading = visibleDeltaDistribution(pixels(a, size, zoom), pixels(b, size, zoom));
    deltaCache.set(k, reading);
    return reading;
  };

  const differing = (
    a: SkirtArm,
    b: SkirtArm,
    size: CrowdSizeId,
    zoom: CrowdZoom,
    threshold = 0,
  ): number => {
    const reading = deltaOf(a, b, size, zoom);
    return threshold === 0 ? reading.touched : reading.visible;
  };

  return {
    identity: () => readIdentity(gl),
    warm() {
      for (const arm of SKIRT_ARMS) render(arm, 'one', SKIRT_ZOOMS[0]!);
    },
    geometry(arm, size, zoom) {
      const s = render(arm, size, zoom);
      const info = renderer.info.render;
      return {
        arm,
        size,
        pxPerUnit: s.pxPerUnit,
        width: s.width,
        height: s.height,
        islands: s.islands,
        triangles: s.plan.triangles,
        skirtTriangles: s.plan.skirtTriangles,
        rimEdges: s.plan.rimEdges,
        attributeBytes: s.plan.attributeBytes,
        drawCalls: info.calls,
        trianglesSubmitted: info.triangles,
        stats: imageStats(pixels(arm, size, zoom), s.width, s.height, bg),
      };
    },
    changedPixels: differing,
    changedPct(a, b, size, zoom) {
      const s = sceneFor(a, size, zoom);
      return (differing(a, b, size, zoom) / (s.width * s.height)) * 100;
    },
    cliffPixels(arm, size, zoom) {
      return differing(arm, ARM_CONTROL[arm], size, zoom);
    },
    visiblePixels(arm, size, zoom) {
      return differing(arm, ARM_CONTROL[arm], size, zoom, VISIBLE_DELTA);
    },
    delta(arm, size, zoom) {
      return deltaOf(arm, ARM_CONTROL[arm], size, zoom);
    },
    deltaBetween(a, b, size, zoom) {
      return deltaOf(a, b, size, zoom);
    },
    controlOf(arm) {
      return ARM_CONTROL[arm];
    },
    sensitivity(size, zoom) {
      return sensitivityReasons(pixels(CONTROL_ARM, size, zoom));
    },
    snapshot(arm, size, zoom) {
      render(arm, size, zoom);
      return canvas.toDataURL('image/png');
    },
    readability(arm, size, zoom) {
      const s = sceneFor(arm, size, zoom);
      // ⚠ `SKIRT_SEA`, not `bg`: the same bytes, but the typed one is what the instrument takes and
      // what the harness test measures the tokens against, so the page and the test cannot read
      // the sea two ways.
      return cliffReadability(pixels(arm, size, zoom), pixels(CONTROL_ARM, size, zoom), s.width, SKIRT_SEA);
    },
    async reference(url) {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error(`shipped-skirt-scene: could not load ${url}`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx === null) throw new Error('shipped-skirt-scene: no 2d context for the reference arm');
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      // ⚠ NULL BACKGROUND: the reference renders are alpha-cut, so the alpha test alone is the
      // island mask there. Passing this page's own scene background would be measuring one
      // picture's sea colour against another's.
      return imageStats(new Uint8ClampedArray(d.buffer), img.width, img.height, null);
    },
    async time(arm, size, zoom, batch) {
      const base = this.geometry(arm, size, zoom);
      let gpuNs: number | null = null;
      if (timer !== null) {
        const s = sceneFor(arm, size, zoom);
        const samples: number[] = [];
        for (let i = 0; i < batch; i += 1) {
          const q = gl.createQuery();
          if (q === null) break;
          gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
          renderer.render(s.scene, s.camera);
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          const ns = await elapsedNs(gl, q);
          gl.deleteQuery(q);
          if (ns !== null) samples.push(ns);
        }
        if (samples.length > 0) {
          samples.sort((p, q) => p - q);
          gpuNs = samples[Math.floor(samples.length / 2)]!;
        }
      }
      return { ...base, gpuNs, batch };
    },
    dispose() {
      renderer.dispose();
      cache.clear();
    },
  };
}

declare global {
  interface Window {
    skirtRunner?: SkirtRunner;
  }
}

/** Build the page: the four arms at every zoom, and the approved render beside them. */
export async function mountShippedSkirt(root: HTMLElement): Promise<void> {
  const runner = createSkirtRunner();
  runner.warm();
  const id = runner.identity();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent = `${id.vendor} — ${id.renderer} · software=${id.software} · timerQuery=${id.timerQuery}`;
  root.appendChild(head);

  // ⚠⚠ THE REFERENCE ARM GOES FIRST, and its position is the argument. This arc's standing rule is
  // that a crossing is judged against the picture the owner approved rather than against its own
  // best arm, so the approved render is what a reader sees before any of ours.
  const refHead = document.createElement('h2');
  refHead.textContent = 'THE REFERENCE — the render the owner stamped (Blender/Cycles, not a frame budget)';
  root.appendChild(refHead);
  const refRow = document.createElement('div');
  refRow.className = 'row';
  for (const [url, what] of [
    [REFERENCE_IMAGE, 'land-combined — the kit’s cliff on the six-row skirt (APPROVED)'],
    [REFERENCE_STRATA_IMAGE, 'land-strata — the SAME render with a procedural rock: the pair whose difference IS the skirt'],
  ] as const) {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = url;
    img.width = 620;
    const cap = document.createElement('figcaption');
    cap.textContent = what;
    try {
      const s = await runner.reference(url);
      cap.textContent =
        `${what} — anchor ${s.anchor.toFixed(1)} · MICRO ${s.micro.toFixed(2)} · ` +
        `STRUCT ${s.struct.toFixed(2)} · mean ${s.mean.toFixed(1)}`;
    } catch {
      // A missing reference is reported in the caption rather than thrown: the live arms below are
      // still worth looking at, and a page that renders nothing hides them for a reason unrelated
      // to the component.
      cap.textContent = `${what} — ⚠ NOT MEASURED (the image did not load)`;
    }
    fig.append(img, cap);
    refRow.appendChild(fig);
  }
  root.appendChild(refRow);

  const overview = document.createElement('h2');
  overview.textContent = 'the whole forest, fitted to a laptop screen — where the cliff is smallest';
  root.appendChild(overview);
  const overviewRow = document.createElement('div');
  overviewRow.className = 'row';
  for (const arm of SKIRT_ARMS) {
    const s = buildSkirtScene(arm, crowdSize('forest'), FIT_ZOOM);
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = runner.snapshot(arm, 'forest', FIT_ZOOM);
    img.width = 620;
    const cap = document.createElement('figcaption');
    const stats = runner.geometry(arm, 'forest', FIT_ZOOM).stats;
    cap.textContent =
      `${arm} · ${s.pxPerUnit.toFixed(2)} px/unit · anchor ${stats.anchor.toFixed(1)} · ` +
      `STRUCT ${stats.struct.toFixed(2)} — ${SKIRT_ARM_CAPTION[arm]}`;
    fig.append(img, cap);
    overviewRow.appendChild(fig);
  }
  root.appendChild(overviewRow);

  for (const zoom of SKIRT_ZOOMS) {
    for (const size of SKIRT_SIZES) {
      const h2 = document.createElement('h2');
      h2.textContent = `${zoom} delivered px per ground unit — ${size.what}`;
      root.appendChild(h2);
      const row = document.createElement('div');
      row.className = 'row';
      for (const arm of SKIRT_ARMS) {
        const g = runner.geometry(arm, size.id, zoom);
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = runner.snapshot(arm, size.id, zoom);
        img.width = 620;
        const cap = document.createElement('figcaption');
        const cliff = runner.cliffPixels(arm, size.id, zoom);
        const visible = runner.visiblePixels(arm, size.id, zoom);
        cap.textContent =
          `${arm} · ${g.triangles} triangles (+${g.skirtTriangles} skirt over ${g.rimEdges} rim edges) · ` +
          `${g.drawCalls} draw call${g.drawCalls === 1 ? '' : 's'} · ` +
          `vs ${ARM_CONTROL[arm]}: ${visible} px moved >${VISIBLE_DELTA}/255 (${cliff} touched) · ` +
          `anchor ${g.stats.anchor.toFixed(1)} · MICRO ${g.stats.micro.toFixed(2)} · ` +
          `STRUCT ${g.stats.struct.toFixed(2)}`;
        fig.append(img, cap);
        row.appendChild(fig);
      }
      root.appendChild(row);
    }
  }

  window.skirtRunner = runner;
}
