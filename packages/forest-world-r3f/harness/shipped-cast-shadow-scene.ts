// shipped-cast-shadow-scene.ts — THE CAST SHADOW'S THREE LEVERS, LADDERED FOR THE OWNER
// (increment `the-trees-cast-the-shadows-the-reference-casts` on `land-ground-stack-arc`).
//
//   today          the map AS IT SHIPPED after PR #1829: every caster an upright cylinder, the
//                  ground cover casting nothing, the contact pools at the full rung, one derived
//                  shadow rung (0.78) with a hard edge (CONTROL — every "moved" is vs this)
//   shape-<s>      SHAPE, at the shipped edge and depth: `cylinder` (the old form, cover casting
//                  nothing), `cone` (each role's own silhouette, cover casting nothing), `cover`
//                  (the silhouettes AND the ground cover casting its low domes — casting, not
//                  pooling: `COVER_POOLS`)
//   edge-<p>       EDGE, at the shipped shape and depth: the penumbra ramp rendered through the
//                  soft rung, p ground units wide (0.15 = hard in the picture / 0.6 / 1.2 / 2.4)
//   depth-<d>      DEPTH, at the shipped shape and edge: the green islands' full-shadow rung at d
//                  (the derived 0.78 / 0.65 / 0.55 / 0.45); every other token keeps the derived rung
//   shipped        the map as it ships now — `COVER_CASTS`, `SHADOW_PENUMBRA`, `SHADOW_EDGE`,
//                  `SHADOW_DEPTH` read off the source, so this arm IS one rung of each ladder
//
// ⚠ EACH LADDER RIDES THE SHIPPED PICKS OF THE OTHER TWO LEVERS, and the reason is measured: the
// first run laddered the edge at the derived rung, where the soft band differs from lit ground
// by 12/255 on the green — under ADR-0490 D6's 20/255 bar, so the edge ladder moved 69–183 px
// between rungs and showed nothing. Every rung is a picture the owner can see only against the
// depth that ships; "vs neighbour" then isolates one lever, and "vs today" is the whole change.
//
// ⚠⚠ THE REFERENCE IS THE RENDER THE OWNER STAMPED (`land-combined-1948px.png`, ADR-0489 D3):
// a 3° sun (`build_land.py:1141-1147`), so a near-hard edge; the cast shape is the pine's own
// cone; shaded ground receives only the sky's share of the light, so the shadow is DEEP. Three
// differences, three levers, all inside the analytic field: no shadow map, no second pass, the
// ground stays ONE draw call and the field is stamped once at mount (`land-shadow.ts`'s header).
//
// ⚠⚠ THE READER MODEL PRINTS AND DOES NOT FENCE (ADR-0503 D1 / ADR-0506, applied to the shadow):
// `readMarginAt` is reported per token per depth rung, negative where it is negative. The depth
// is gated per TOKEN — the green islands wear it, the 14 yellow islands (ADR-0492 D3) keep the
// derived rung — and judged by the look on the green islands.
//
// ⚠ THE CONTROL IS THE MAP AS IT SHIPPED, BY CONSTRUCTION. Every arm's ground is
// `shippedGroundBuild` and every arm's material is `buildGroundMaterial` — the one construction
// the canvas uses (`comparison-baseline-moves-under-the-page`) — handed this arm's casters,
// penumbra and depth. The control strips the profiles off the shipped casters, drops the cover
// (`coverCasts: false`) and passes `null` for the depth, which is the one-rung hard-edged material
// the map wore until 2026-09-06.
//
// ⚠ THE MOUNT-TIME STAMP IS MEASURED HERE (`buildMs` on every ground build) and reported; the
// field's texels are read the same way whatever is stamped in them, so frame cost is measured
// only to say so (`cost`, ADR-0517 D4: it reports).
//
// THE PAGE ADOPTS NOTHING OF ITS OWN. `harness/` only: it produces EVIDENCE about the `src/`
// modules it imports. The picks land in `src/ground-casters.ts` (`COVER_CASTS`,
// `ROLE_SILHOUETTE`), `src/land-shadow.ts` (`SHADOW_PENUMBRA`) and `src/shadow-rung.ts`
// (`SHADOW_EDGE`, `SHADOW_DEPTH`).

import * as THREE from 'three';

import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE } from '../src/banded-ground-material.js';
import { shippedElevationDeg } from '../src/camera-framing.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { configureExactColour } from '../src/exact-colour.js';
import {
  GROUND_TOKENS,
  SHIPPED_GRASS,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  SHIPPED_SHADOW_DEPTH,
  buildGroundMaterial,
  shippedGroundBuild,
  type GroundLayerExtras,
  type ShippedGroundBuild,
} from '../src/ForestWorldCanvas.js';
import { COVER_CASTS, placementCasters } from '../src/ground-casters.js';
import {
  KIT_FOOTPRINTS_2026_08_29,
  KIT_HEIGHTS_2026_08_29,
  RENDER_ELEV_DEG,
  isDressingRole,
  type KitPlacement,
} from '../src/kit-vocabulary.js';
import { LAND_AREA_PER_CAPABILITY } from '../src/land-per-capability.js';
import { LAND_RELIEF_AMPLITUDE } from '../src/land-relief.js';
import { SHADOW_PENUMBRA, SHADOW_PENUMBRA_RUNGS, type ShadowCaster } from '../src/land-shadow.js';
import {
  calibrateLights,
  intensitiesFor,
  type CalibratedIntensities,
  type LightCalibration,
} from '../src/light-calibration.js';
import { dressMapWithCover } from '../src/map-dressing.js';
import { KIT_PROP_INDIRECT_FRACTION } from '../src/prop-lighting.js';
import { SHADOW_CONTACT_BAND, type ContactBand } from '../src/contact-shade.js';
import { atlasCoverage } from '../src/shadow-atlas.js';
import {
  SHADOW_DEPTH,
  SHADOW_DEPTH_RUNGS,
  SHADOW_EDGE,
  deepestAdmissibleRung,
  readMarginAt,
  type ShadowDepthOptions,
  type ShadowEdge,
} from '../src/shadow-rung.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import { awaitQuery, readIdentity, type DisjointTimerQuery, type RendererIdentity } from './frame-cost-scene.js';
import { KIT_ASSET_URL, kitMeshes, loadKit, setKitPropLighting, type LoadedKit } from './kit-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import {
  FIT_ZOOM,
  crowdCasters,
  crowdDescriptors,
  crowdSize,
  crowdStrips,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
  type CrowdZoom,
} from './shipped-crowd-scene.js';
import { kitFacts, type KitFacts } from './shipped-detail-scene.js';
import { REFERENCE_IMAGE, backgroundBytes, familyCensus } from './shipped-grass-scene.js';
import {
  cameraAgreement,
  cameraElevationDeg,
  centreIslandLand,
  fitPxPerUnitFor,
  landBox,
  screenExtent,
  type CentreIslandLand,
  type PixelBox,
  type ScreenExtent,
} from './shipped-land-ratio-scene.js';
import { imageStats, type ImageStats } from './shipped-skirt-scene.js';
import { VISIBLE_DELTA, sensitivityReasons, visibleDeltaDistribution, type VisibleDeltaReading } from './visible-delta.js';

export { REFERENCE_IMAGE, VISIBLE_DELTA };

// ---------------------------------------------------------------- the arms

export type CastShadowLadder = 'control' | 'shape' | 'edge' | 'depth' | 'shipped';

export interface CastShadowArmSpec {
  id: string;
  ladder: CastShadowLadder;
  /** Scene roles cast their own silhouette (`ROLE_SILHOUETTE`) rather than a cylinder. */
  profiles: boolean;
  /** The ground cover casts (its low domes). */
  cover: boolean;
  /** The field's soft-edge width, in ground units. */
  penumbra: number;
  edge: ShadowEdge;
  /** The green islands' full-shadow rung; `null` is the derived rung (today's). */
  depth: number | null;
}

export const CONTROL_ARM = 'today';
export const SHIPPED_ARM = 'shipped';

export function edgeArmId(penumbra: number): string {
  return `edge-${penumbra}`;
}

export function depthArmId(depth: number): string {
  return `depth-${Math.round(depth * 100)}`;
}

/** The two ladders the source declares, read rather than restated. */
export const EDGE_LADDER: readonly number[] = [...SHADOW_PENUMBRA_RUNGS];
export const DEPTH_LADDER: readonly number[] = [...SHADOW_DEPTH_RUNGS];

/** The shipped picks, as an arm's fields — what every ladder rides for the levers it does not vary. */
const SHIPPED_PICKS = {
  profiles: true,
  cover: COVER_CASTS,
  penumbra: SHADOW_PENUMBRA,
  edge: SHADOW_EDGE,
  depth: SHADOW_DEPTH,
} as const;

export const CAST_SHADOW_ARMS: readonly CastShadowArmSpec[] = [
  { id: CONTROL_ARM, ladder: 'control', profiles: false, cover: false, penumbra: 1.2, edge: 'hard', depth: null },
  { id: 'shape-cylinder', ladder: 'shape', ...SHIPPED_PICKS, profiles: false, cover: false },
  { id: 'shape-cone', ladder: 'shape', ...SHIPPED_PICKS, profiles: true, cover: false },
  { id: 'shape-cover', ladder: 'shape', ...SHIPPED_PICKS, profiles: true, cover: true },
  ...EDGE_LADDER.map((penumbra): CastShadowArmSpec => ({ id: edgeArmId(penumbra), ladder: 'edge', ...SHIPPED_PICKS, penumbra, edge: 'soft' })),
  { id: depthArmId(derivedDepth()), ladder: 'depth', ...SHIPPED_PICKS, depth: null },
  ...DEPTH_LADDER.map((depth): CastShadowArmSpec => ({ id: depthArmId(depth), ladder: 'depth', ...SHIPPED_PICKS, depth })),
  { id: SHIPPED_ARM, ladder: 'shipped', ...SHIPPED_PICKS },
];

export const SHAPE_ARMS: readonly string[] = CAST_SHADOW_ARMS.filter((a) => a.ladder === 'shape').map((a) => a.id);
export const EDGE_ARMS: readonly string[] = CAST_SHADOW_ARMS.filter((a) => a.ladder === 'edge').map((a) => a.id);
export const DEPTH_ARMS: readonly string[] = CAST_SHADOW_ARMS.filter((a) => a.ladder === 'depth').map((a) => a.id);

export function armSpec(id: string): CastShadowArmSpec {
  const found = CAST_SHADOW_ARMS.find((a) => a.id === id);
  if (found === undefined) throw new Error(`shipped-cast-shadow-scene: no arm "${id}"`);
  return found;
}

/** Do two arms draw the SAME picture — same field, same material? The shipped arm is meant to
 *  coincide with one rung of each ladder, which is what makes it a pick rather than a fourth
 *  candidate; the driver refuses a run where it coincides with none. */
export function sameArm(a: CastShadowArmSpec, b: CastShadowArmSpec): boolean {
  return (
    a.profiles === b.profiles &&
    a.cover === b.cover &&
    a.penumbra === b.penumbra &&
    a.edge === b.edge &&
    (a.depth ?? derivedDepth()) === (b.depth ?? derivedDepth())
  );
}

/** The derived rung — `deepestAdmissibleRung` over the shipped ground's own tokens, the rung an
 *  arm with `depth: null` keeps on every row (it passes NO deep token). Derived, never typed. */
export function derivedDepth(): number {
  const rung = deepestAdmissibleRung(GROUND_TOKENS);
  if (rung === null) throw new Error('shipped-cast-shadow-scene: the shipped palette admits no shadow rung');
  return rung;
}

/** The arm one step UP its own ladder, or null — the control, the shipped arm and each ladder's
 *  first rung have none, so "vs neighbour" always isolates ONE lever. */
export function neighbourArm(id: string): string | null {
  const spec = armSpec(id);
  if (spec.ladder === 'control' || spec.ladder === 'shipped') return null;
  const ladder = spec.ladder === 'shape' ? SHAPE_ARMS : spec.ladder === 'edge' ? EDGE_ARMS : DEPTH_ARMS;
  const i = ladder.indexOf(id);
  return i > 0 ? ladder[i - 1]! : null;
}

export function armCaption(id: string): string {
  const s = armSpec(id);
  const shape = s.profiles ? (s.cover ? 'silhouettes, cover casts' : 'silhouettes, cover casts nothing') : 'cylinders, cover casts nothing';
  const edge = s.edge === 'hard' ? 'hard edge, contact pools at the full rung' : `soft edge, penumbra ${s.penumbra}`;
  const depth = s.depth === null ? `derived rung (${derivedDepth()}) on every token` : `green islands at ${s.depth}, others at the derived rung`;
  const tag = id === CONTROL_ARM ? ' (CONTROL)' : id === SHIPPED_ARM ? ' (SHIPS)' : '';
  return `${shape} · ${edge} · ${depth}${tag}`;
}

// ---------------------------------------------------------------- the pictures

export type CastShadowPictureId = 'one' | 'forest';

export interface CastShadowPicture {
  id: CastShadowPictureId;
  size: CrowdSize;
  what: string;
}

export const CAST_SHADOW_PICTURES: readonly CastShadowPicture[] = [
  { id: 'one', size: crowdSize('one'), what: 'one island — the island as it is read' },
  { id: 'forest', size: crowdSize('forest'), what: 'the forest, fitted — the view the map opens on' },
];

export function picture(id: CastShadowPictureId): CastShadowPicture {
  const found = CAST_SHADOW_PICTURES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`shipped-cast-shadow-scene: no picture "${id}"`);
  return found;
}

/** One island is read at 8 px/unit on every arm; the forest is fitted, control and shipped only —
 *  the overview is a check that the picks survive the zoom, not a ladder. */
export const READ_ZOOM = 8;
export function armsFor(pic: CastShadowPictureId): readonly string[] {
  return pic === 'one' ? CAST_SHADOW_ARMS.map((a) => a.id) : [CONTROL_ARM, SHIPPED_ARM];
}
export function zoomFor(pic: CastShadowPictureId): CrowdZoom {
  return pic === 'one' ? READ_ZOOM : FIT_ZOOM;
}

// ---------------------------------------------------------------- what stands, what casts

const descriptorMemo = new Map<string, InstanceDescriptor[]>();

/** The whole stream for a picture — the crowd's cells and blooms plus its strips, on the island
 *  as it ships (the crowd's default base is the shipped parcels, sized by the ratio). */
export function pictureDescriptors(pic: CastShadowPicture): InstanceDescriptor[] {
  const hit = descriptorMemo.get(pic.id);
  if (hit !== undefined) return hit;
  const built = [...crowdDescriptors(pic.size), ...crowdStrips(pic.size)];
  descriptorMemo.set(pic.id, built);
  return built;
}

/** The canvas's own dressing options (`ForestWorldCanvas.tsx`), stated once. */
const CANVAS_OPTIONS = { relief: LAND_RELIEF_AMPLITUDE, footprint: KIT_FOOTPRINTS_2026_08_29 } as const;

const placementMemo = new Map<string, KitPlacement[]>();

/** WHAT STANDS — `dressMapWithCover` with the SAME options the canvas passes: one tree per
 *  capability, the blooms, and the cover at the shipped rung. The same list on every arm; the
 *  arms differ in what CASTS from it. */
export function picturePlacements(pic: CastShadowPicture): KitPlacement[] {
  const hit = placementMemo.get(pic.id);
  if (hit !== undefined) return hit;
  const built = dressMapWithCover(pictureDescriptors(pic), CANVAS_OPTIONS);
  placementMemo.set(pic.id, built);
  return built;
}

/** A caster list with its profiles and pool flags stripped — the pooling cylinders every caster
 *  was until 2026-09-06. */
export function asCylinders(casters: readonly ShadowCaster[]): ShadowCaster[] {
  return casters.map(({ x, z, radius, height }) => ({ x, z, radius, height }));
}

/** WHAT CASTS on an arm — the descriptor stream's casters UNIONED with one per placement, the
 *  same union the canvas hands its ground, with the cover included or not per the arm and the
 *  profiles kept or stripped per the arm. */
export function armCasters(arm: string, pic: CastShadowPicture): ShadowCaster[] {
  const spec = armSpec(arm);
  const list = [
    ...crowdCasters(pic.size),
    ...placementCasters(picturePlacements(pic), KIT_FOOTPRINTS_2026_08_29, KIT_HEIGHTS_2026_08_29, spec.cover),
  ];
  return spec.profiles ? list : asCylinders(list);
}

/** Where an arm's contact pools land: the control keeps them at the full rung (the field as it
 *  was); every other arm packs them into the soft band (`SHADOW_CONTACT_BAND`). */
export function contactBandFor(spec: CastShadowArmSpec): ContactBand {
  return spec.ladder === 'control' ? 'full' : SHADOW_CONTACT_BAND;
}

/** The key two arms share a FIELD under — the casters, the penumbra and the contact band are all
 *  a field reads. */
export function fieldKey(spec: CastShadowArmSpec, pic: CastShadowPictureId): string {
  return `${pic}|${spec.profiles}|${spec.cover}|${spec.penumbra}|${contactBandFor(spec)}`;
}

export interface TimedGroundBuild {
  build: ShippedGroundBuild;
  /** THE MOUNT-TIME STAMP: wall-clock ms for `shippedGroundBuild` — the coast clip, the
   *  occlusion field (the expensive half), the relief, the skirt. Measured, never inherited. */
  buildMs: number;
  casters: number;
}

const groundBuildMemo = new Map<string, TimedGroundBuild>();

/**
 * THE SHIPPED GROUND, BUILT ONCE PER FIELD KEY — `shippedGroundBuild`, the function `CellGround`
 * calls, handed this arm's casters and penumbra. Arms sharing a field key share one build (the
 * depth arms all ride the shipped field), which is what keeps a ten-arm page inside the driver's
 * wait (`comparison-baseline-moves-under-the-page`, "call it once per size").
 */
export function armGroundBuild(arm: string, pic: CastShadowPicture): TimedGroundBuild {
  const spec = armSpec(arm);
  const key = fieldKey(spec, pic.id);
  const hit = groundBuildMemo.get(key);
  if (hit !== undefined) return hit;
  const stream = pictureDescriptors(pic);
  const casters = armCasters(arm, pic);
  const t0 = performance.now();
  const build = shippedGroundBuild(
    stream.filter((d) => d.kind === 'cell-ground'),
    casters,
    stream.filter((d) => d.kind === 'trail-strip'),
    spec.penumbra,
    contactBandFor(spec),
  );
  const timed = { build, buildMs: performance.now() - t0, casters: casters.length };
  groundBuildMemo.set(key, timed);
  return timed;
}

/** The depth options an arm's material is built with — `null` for the control (the one-rung
 *  material), the shipped deep tokens with this arm's rung and edge otherwise. An arm keeping
 *  the derived rung names NO deep token, so every row keeps it whatever `deep` says. */
export function armDepth(arm: string): ShadowDepthOptions | null {
  const spec = armSpec(arm);
  if (spec.ladder === 'control') return null;
  return {
    deep: spec.depth ?? SHADOW_DEPTH,
    deepTokens: spec.depth === null ? [] : SHIPPED_SHADOW_DEPTH.deepTokens,
    edge: spec.edge,
  };
}

// ---------------------------------------------------------------- the numbers under the picture

export interface CasterCounts {
  casters: number;
  scene: number;
  cover: number;
  placements: number;
}

export function casterCounts(arm: string, pic: CastShadowPicture): CasterCounts {
  const placements = picturePlacements(pic);
  const spec = armSpec(arm);
  const cover = placements.filter((p) => isDressingRole(p.role)).length;
  const scene = placements.length - cover;
  return {
    casters: armCasters(arm, pic).length,
    scene,
    cover: spec.cover ? cover : 0,
    placements: placements.length,
  };
}

/** THE READER MODEL, PRINTED: every token's margin at every depth rung on the ladder (and the
 *  derived rung), so the report carries the negative numbers rather than hiding them. */
export interface MarginRow {
  token: string;
  level: number;
  margin: number;
}

export function depthMargins(tokens: readonly string[]): MarginRow[] {
  const distinct = [...new Set(tokens)];
  const levels = [derivedDepth(), ...DEPTH_LADDER];
  const out: MarginRow[] = [];
  for (const level of levels) {
    for (const token of distinct) out.push({ token, level, margin: readMarginAt(token, level, tokens) });
  }
  return out;
}

/**
 * HOW DEEP THE DARKEST GRASS SITS AGAINST THE BRIGHTEST — the luma percentiles of the GREEN
 * pixels in a frame (green channel leading both others by a margin; the background excluded).
 * On the reference it measures the stamped render's own shadow depth; on an arm, ours. An
 * instrument for the depth ladder, not a fence: a ratio near the reference's is a reason to look,
 * not a verdict.
 */
export interface GreenLuma {
  count: number;
  p05: number;
  p50: number;
  p95: number;
  /** `p05 / p95` — the darkest green as a share of the brightest. ⚠ Crowns and cover are green
   *  too, so the low tail is foliage as much as shadowed grass; read the histogram, not the ratio. */
  ratio: number;
  /** Share of the green pixels in each of {@link LUMA_BINS} equal luma bins over 0..255. */
  bins: number[];
}

export const LUMA_BINS = 16;

export function greenLuma(rgba: Uint8ClampedArray, bg: readonly [number, number, number] | null): GreenLuma {
  const lumas: number[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    const a = rgba[i + 3]!;
    const isBg = bg === null ? a < 128 : r === bg[0] && g === bg[1] && b === bg[2];
    if (isBg) continue;
    if (g <= r + 8 || g <= b + 8) continue;
    lumas.push(0.3 * r + 0.59 * g + 0.11 * b);
  }
  lumas.sort((x, y) => x - y);
  const at = (q: number): number => (lumas.length === 0 ? 0 : lumas[Math.min(lumas.length - 1, Math.floor(q * lumas.length))]!);
  const p05 = at(0.05);
  const p50 = at(0.5);
  const p95 = at(0.95);
  const bins = Array.from({ length: LUMA_BINS }, () => 0);
  for (const l of lumas) bins[Math.min(LUMA_BINS - 1, Math.floor((l / 256) * LUMA_BINS))]! += 1;
  return {
    count: lumas.length,
    p05,
    p50,
    p95,
    ratio: p95 === 0 ? 0 : p05 / p95,
    bins: bins.map((n) => (lumas.length === 0 ? 0 : n / lumas.length)),
  };
}

// ---------------------------------------------------------------- the scene

export interface CastShadowScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  spec: CastShadowArmSpec;
  groundTriangles: number;
  screen: ScreenExtent;
  counts: CasterCounts;
  land: CentreIslandLand;
  meshes: number;
  buildMs: number;
  /** Share of the field's texels past the full threshold, and past the soft one. */
  fieldFull: number;
  fieldSoft: number;
}

/** ONE ARM'S SCENE: its ground build, its material, the same placements, the shipped camera. */
export function buildCastShadowScene(
  kit: LoadedKit,
  lit: CalibratedIntensities,
  arm: string,
  pic: CastShadowPicture,
  zoom: CrowdZoom,
): CastShadowScene {
  const spec = armSpec(arm);
  const timed = armGroundBuild(arm, pic);
  const build = timed.build;
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-cast-shadow-scene: the crowd drew no ground');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  if (geo.atlasOrigins.length > 0) {
    geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));
  }
  const wearField = build.wear();
  const extras: GroundLayerExtras = { rock: SHIPPED_LAYERS.rock, detail: SHIPPED_LAYERS.detail };
  if (wearField !== null) extras.wear = { field: wearField, mix: SHIPPED_LAYERS.wearMix };
  const { material } = buildGroundMaterial(build.field, SHIPPED_GRASS, build.shore(), SHIPPED_SAND_MIX, extras, armDepth(arm));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.Mesh(geometry, material));
  let meshes = 0;
  for (const mesh of kitMeshes(kit, picturePlacements(pic))) {
    scene.add(mesh);
    meshes += 1;
  }
  scene.add(new THREE.AmbientLight(0xffffff, lit.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, lit.directional);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);
  const pxPerUnit = zoom === FIT_ZOOM ? fitPxPerUnitFor(geo.positions) : zoom;
  const camera = orientedCamera({ x: 0, z: 0 }, pxPerUnit);
  const cells = pictureDescriptors(pic).filter((d) => d.kind === 'cell-ground');
  return {
    scene,
    camera,
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit,
    spec,
    groundTriangles: geo.triangles,
    screen: screenExtent(geo.positions, camera),
    counts: casterCounts(arm, pic),
    land: centreIslandLand(cells),
    meshes,
    buildMs: timed.buildMs,
    fieldFull: build.field === null ? 0 : atlasCoverage(build.field, 0.5),
    fieldSoft: build.field === null ? 0 : atlasCoverage(build.field, 0.25),
  };
}

// ---------------------------------------------------------------- the readings

export interface CastShadowReading {
  arm: string;
  ladder: CastShadowLadder;
  spec: CastShadowArmSpec;
  picture: CastShadowPictureId;
  zoom: CrowdZoom;
  elevationDeg: number;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  counts: CasterCounts;
  land: CentreIslandLand;
  meshes: number;
  buildMs: number;
  fieldFull: number;
  fieldSoft: number;
  box: PixelBox;
  stats: ImageStats;
  landPx: number;
  families: number;
  largestShare: number;
  green: GreenLuma;
  /** Against the CONTROL at the same picture and zoom. `touched` is context only (ADR-0490 D6). */
  touched: number;
  visible: number;
  delta: VisibleDeltaReading;
  /** Against the neighbour one step up the same ladder (null for the control and the shipped arm). */
  touchedVsNeighbour: number | null;
  visibleVsNeighbour: number | null;
  /** Against the SHIPPED arm — zero on the rung it coincides with, which is the pick made visible. */
  touchedVsShipped: number;
}

export interface ReferenceReading {
  width: number;
  height: number;
  box: PixelBox;
  green: GreenLuma;
  stats: ImageStats;
}

export interface CastShadowCostSpec {
  arm: string;
  picture: CastShadowPictureId;
  batch: number;
}

export interface CastShadowCostReading extends CastShadowCostSpec {
  gpuMsPerFrame: number | null;
  gpuBatchNs: number | null;
  disjoint: boolean;
  drawCalls: number;
  triangles: number;
  timerQueryAvailable: boolean;
  hidden: boolean;
}

export interface CastShadowRunner {
  identity(): RendererIdentity;
  calibration(): LightCalibration;
  kits(): KitFacts[];
  agreement(): string[];
  warm(): void;
  read(arm: string, picture: CastShadowPictureId): CastShadowReading;
  sensitivity(picture: CastShadowPictureId): string[];
  margins(): MarginRow[];
  /** The frame cost of one arm on the GPU's own clock — a REPORT (ADR-0517 D4). */
  cost(spec: CastShadowCostSpec): Promise<CastShadowCostReading>;
  snapshot(arm: string, picture: CastShadowPictureId): string;
  reference(url: string): Promise<ReferenceReading>;
}

export async function createCastShadowRunner(): Promise<CastShadowRunner> {
  const t0 = performance.now();
  const kit = await loadKit(KIT_ASSET_URL);
  const loadMs = performance.now() - t0;
  setKitPropLighting(kit, KIT_PROP_INDIRECT_FRACTION);
  const facts = [kitFacts(kit, KIT_ASSET_URL, loadMs)];
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  const cal = calibrateLights(renderer);
  const lit = intensitiesFor(cal);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER_EXTENSION) as DisjointTimerQuery | null;
  const bg = backgroundBytes();
  const cache = new Map<string, CastShadowScene>();
  const sceneFor = (arm: string, pic: CastShadowPictureId): CastShadowScene => {
    const k = `${arm}|${pic}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildCastShadowScene(kit, lit, arm, picture(pic), zoomFor(pic));
    cache.set(k, built);
    return built;
  };
  const render = (arm: string, pic: CastShadowPictureId): CastShadowScene => {
    const s = sceneFor(arm, pic);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };
  const pixels = (arm: string, pic: CastShadowPictureId): Uint8ClampedArray => {
    const s = render(arm, pic);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return new Uint8ClampedArray(buf.buffer);
  };
  return {
    identity: () => readIdentity(gl),
    calibration: () => cal,
    kits: () => facts,
    agreement: () => cameraAgreement(),
    warm() {
      for (const arm of armsFor('one')) render(arm, 'one');
    },
    read(arm, pic) {
      const s = render(arm, pic);
      const info = renderer.info.render;
      const drawCalls = info.calls;
      const triangles = info.triangles;
      const buf = pixels(arm, pic);
      const census = familyCensus(buf, bg);
      const delta = visibleDeltaDistribution(buf, pixels(CONTROL_ARM, pic));
      const neighbour = pic === 'one' ? neighbourArm(arm) : null;
      const vsNeighbour = neighbour === null ? null : visibleDeltaDistribution(buf, pixels(neighbour, pic));
      const vsShipped = visibleDeltaDistribution(buf, pixels(SHIPPED_ARM, pic));
      return {
        arm,
        ladder: s.spec.ladder,
        spec: s.spec,
        picture: pic,
        zoom: zoomFor(pic),
        elevationDeg: cameraElevationDeg(s.camera),
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        groundTriangles: s.groundTriangles,
        counts: s.counts,
        land: s.land,
        meshes: s.meshes,
        buildMs: s.buildMs,
        fieldFull: s.fieldFull,
        fieldSoft: s.fieldSoft,
        box: landBox(buf, s.width, s.height, bg),
        stats: imageStats(buf, s.width, s.height, bg),
        landPx: census.land,
        families: census.families,
        largestShare: census.largestShare,
        green: greenLuma(buf, bg),
        touched: delta.touched,
        visible: delta.visible,
        delta,
        touchedVsNeighbour: vsNeighbour === null ? null : vsNeighbour.touched,
        visibleVsNeighbour: vsNeighbour === null ? null : vsNeighbour.visible,
        touchedVsShipped: vsShipped.touched,
      };
    },
    sensitivity(pic) {
      return sensitivityReasons(pixels(CONTROL_ARM, pic));
    },
    margins() {
      return depthMargins(GROUND_TOKENS);
    },
    async cost(spec) {
      const s = sceneFor(spec.arm, spec.picture);
      renderer.setSize(s.width, s.height, false);
      for (const _ of Array.from({ length: 5 })) {
        void _;
        renderer.render(s.scene, s.camera);
      }
      gl.finish();
      const drawCalls = renderer.info.render.calls;
      const triangles = renderer.info.render.triangles;
      let gpuBatchNs: number | null = null;
      let disjoint = false;
      if (timer) {
        gl.getParameter(timer.GPU_DISJOINT_EXT);
        const query = gl.createQuery();
        if (query) {
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          for (const _ of Array.from({ length: spec.batch })) {
            void _;
            renderer.render(s.scene, s.camera);
          }
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          gl.flush();
          gpuBatchNs = await awaitQuery(gl, query, 20_000);
          disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT) === true;
          gl.deleteQuery(query);
        }
      }
      const usable = gpuBatchNs !== null && !disjoint ? gpuBatchNs : null;
      return {
        ...spec,
        gpuMsPerFrame: usable === null ? null : usable / 1e6 / spec.batch,
        gpuBatchNs,
        disjoint,
        drawCalls,
        triangles,
        timerQueryAvailable: timer !== null,
        hidden: document.hidden,
      };
    },
    snapshot(arm, pic) {
      render(arm, pic);
      return canvas.toDataURL('image/png');
    },
    async reference(url) {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error(`shipped-cast-shadow-scene: the reference ${url} did not load`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('shipped-cast-shadow-scene: no 2d context for the reference');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const buf = new Uint8ClampedArray(data.buffer.slice(0));
      return {
        width: c.width,
        height: c.height,
        box: landBox(buf, c.width, c.height, null),
        green: greenLuma(buf, null),
        stats: imageStats(buf, c.width, c.height, REFERENCE_TRANSPARENT),
      };
    },
  };
}

const REFERENCE_TRANSPARENT: readonly [number, number, number] = [-1, -1, -1];

// ---------------------------------------------------------------- the page

export async function mountShippedCastShadow(root: HTMLElement): Promise<void> {
  const runner = await createCastShadowRunner();
  window.castShadowRunner = runner;
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → ` +
    `scale ${cal.scale.toFixed(3)} onto the ladder’s ${cal.target} · shipped elevation ${shippedElevationDeg().toFixed(2)}° (signed ${RENDER_ELEV_DEG}°) · ` +
    `${LAND_AREA_PER_CAPABILITY} units² per capability · ships: cover casts ${COVER_CASTS}, penumbra ${SHADOW_PENUMBRA}, edge ${SHADOW_EDGE}, depth ${SHADOW_DEPTH} · ` +
    `camera agreement: ${runner.agreement().length === 0 ? 'the shipped camera is the signed one' : runner.agreement().join('; ')}`;
  root.appendChild(head);
  const refHead = document.createElement('h2');
  refHead.textContent = 'THE REFERENCE — the render the owner stamped (Blender/Cycles, a 3° sun)';
  root.appendChild(refHead);
  const refRow = document.createElement('div');
  refRow.className = 'row';
  const refFig = document.createElement('figure');
  const refImg = document.createElement('img');
  refImg.src = REFERENCE_IMAGE;
  refImg.width = 900;
  refFig.appendChild(refImg);
  const refCap = document.createElement('figcaption');
  refCap.textContent = 'land-combined-1948px.png — the look-fence, ADR-0489 D3';
  refFig.appendChild(refCap);
  refRow.appendChild(refFig);
  root.appendChild(refRow);
  for (const pic of CAST_SHADOW_PICTURES) {
    const h = document.createElement('h2');
    const zoom = zoomFor(pic.id);
    h.textContent = `${pic.id} — ${pic.what} — ${zoom === FIT_ZOOM ? 'fitted' : `${zoom} px/unit`}`;
    root.appendChild(h);
    const row = document.createElement('div');
    row.className = 'row';
    for (const arm of armsFor(pic.id)) {
      const r = runner.read(arm, pic.id);
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = runner.snapshot(arm, pic.id);
      img.width = 900;
      fig.appendChild(img);
      const cap = document.createElement('figcaption');
      cap.textContent =
        `${arm} — ${armCaption(arm)} · ${r.counts.casters} casters (${r.counts.scene} scene + ${r.counts.cover} cover) · ` +
        `stamp ${r.buildMs.toFixed(0)} ms · field ${(r.fieldFull * 100).toFixed(2)}% full / ${(r.fieldSoft * 100).toFixed(2)}% soft · ` +
        `grass p05/p95 ${r.green.ratio.toFixed(3)} · ${r.families} families · moved>${VISIBLE_DELTA} vs today ${r.visible.toLocaleString()}`;
      fig.appendChild(cap);
      row.appendChild(fig);
    }
    root.appendChild(row);
  }
}

declare global {
  interface Window {
    castShadowRunner?: CastShadowRunner;
  }
}
