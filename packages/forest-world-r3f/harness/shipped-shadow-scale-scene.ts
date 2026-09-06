// shipped-shadow-scale-scene.ts — THE SHADOW SCALED BACK: the contact pool, the tree's cast
// silhouette and the depth, each a ladder, judged on THREE grounds (owner feedback 2026-09-06 on
// `land-ground-stack-arc`).
//
//   today          the map AS IT SHIPPED after PR #1841 / #1845: the contact pool at the DERIVED reach
//                  (spread 1), the tree's cone as wide as its crown's footprint (width 1), the deep
//                  rung at 0.55 (CONTROL — every "moved" is vs this; the picks typed as history)
//   pool-<r>       THE CIRCLE UNDER THE TREE, at the shipped width and depth: the contact pool's edge
//                  at r × its derived reach (1 / 0.7 / 0.5 / 0.25 / 0 = no pool)
//   width-<w>      THE TRIANGLE, at the shipped pool and depth: the tree's cast silhouette at w of
//                  the crown's footprint (1 / 0.8 / 0.65 / 0.5)
//   depth-<d>      HOW DARK, at the shipped pool and width: the painted islands' full-shadow rung at
//                  d — HIGHER IS LIGHTER (the derived 0.78 / 0.70 / 0.62 / 0.55)
//   shipped        the map as it ships now — `CONTACT_SPREAD`, `TREE_SHADOW_WIDTH`, `SHADOW_DEPTH`
//                  read off the source, so this arm IS one rung of each ladder
//
// ⚠⚠ THE OWNER, 2026-09-06, VERBATIM: "Shadows still look overdone, you have a full circle under
// the tree that is quite large and a triangle for what the tree casts, both look too large depending
// on the land color." Two marks, two levers — the pool's edge (`contact-shade.ts`'s
// `CONTACT_SPREAD`) and the cone's width (`ground-casters.ts`'s `TREE_SHADOW_WIDTH`) — and the
// depth laddered UPWARD from where PR #1841 left it, because "depending on the land color" is a
// measurement: a rung is a FRACTION of the lit colour, so the pale grounds lose more absolute
// light to the same rung than mid-green does.
//
// ⚠⚠ THREE GROUNDS, NOT ONE. Every rung is rendered on a GREEN island, on an IN-PROGRESS island
// wearing the mustard wheat (PR #1845), and the green island's SAND band is read off the same
// frame (the driver crops the coast). A rung that reads well only on green is not a pick.
//
// ⚠ EACH LADDER RIDES THE SHIPPED PICKS OF THE OTHER TWO LEVERS (the cast-shadow sheet's lesson:
// a lever laddered at the shallow rung is invisible). "vs neighbour" isolates one lever, "vs
// today" is the whole change. ⚠ Neighbouring DEPTH rungs are ~13/255 apart on the green and so
// sit under ADR-0490 D6's 20/255 bar between themselves — the same was true on PR #1841's sheet,
// where the depth ladder's "vs neighbour" read 0 — so that ladder is judged vs today.
//
// ⚠ THE CONTROL IS THE MAP AS IT SHIPPED, BY CONSTRUCTION. Every arm's ground is
// `shippedGroundBuild` (handed this arm's casters and spread) and every arm's material is
// `buildGroundMaterial` (handed this arm's depth) — the one construction the canvas uses. The
// field is built once per (picture, pool, width) and shared by the depth arms.
//
// ⚠ THE READER MODEL PRINTS AND DOES NOT FENCE (ADR-0503 D1 / ADR-0506): the margin per token per
// depth rung is in the report, negative where it is negative. Frame cost REPORTS (ADR-0517 D4). No
// shadow map, no second pass, one draw call, one mount-time stamp.
//
// THE PAGE ADOPTS NOTHING OF ITS OWN. `harness/` only: it produces EVIDENCE about the `src/`
// modules it imports. The picks land in `src/contact-shade.ts` (`CONTACT_SPREAD`),
// `src/ground-casters.ts` (`TREE_SHADOW_WIDTH`) and `src/shadow-rung.ts` (`SHADOW_DEPTH`).

import * as THREE from 'three';

import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE } from '../src/banded-ground-material.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { CONTACT_SPREAD, CONTACT_SPREAD_RUNGS, SHADOW_CONTACT_BAND } from '../src/contact-shade.js';
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
import { TREE_SHADOW_WIDTH, TREE_SHADOW_WIDTH_RUNGS, groundCasters, placementCasters, roleSilhouettes } from '../src/ground-casters.js';
import { KIT_FOOTPRINTS_2026_08_29, KIT_HEIGHTS_2026_08_29, RENDER_ELEV_DEG, type KitPlacement } from '../src/kit-vocabulary.js';
import { SHADOW_PENUMBRA, type ShadowCaster } from '../src/land-shadow.js';
import { calibrateLights, intensitiesFor, type CalibratedIntensities, type LightCalibration } from '../src/light-calibration.js';
import { KIT_PROP_INDIRECT_FRACTION } from '../src/prop-lighting.js';
import { atlasCoverage } from '../src/shadow-atlas.js';
import {
  SHADOW_DEPTH,
  SHADOW_DEPTH_SCALE_BACK_RUNGS,
  SHADOW_EDGE,
  deepestAdmissibleRung,
  readMarginAt,
  type ShadowDepthOptions,
} from '../src/shadow-rung.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import { awaitQuery, readIdentity, type DisjointTimerQuery, type RendererIdentity } from './frame-cost-scene.js';
import { KIT_ASSET_URL, kitMeshes, loadKit, setKitPropLighting, type LoadedKit } from './kit-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { FIT_ZOOM, crowdCasters, crowdSize, orientedCamera, type CrowdZoom } from './shipped-crowd-scene.js';
import { kitFacts, type KitFacts } from './shipped-detail-scene.js';
import { backgroundBytes, familyCensus } from './shipped-grass-scene.js';
import { landBox, screenExtent, type PixelBox, type ScreenExtent } from './shipped-land-ratio-scene.js';
import { imageStats, type ImageStats } from './shipped-skirt-scene.js';
import {
  armPlacements as spacingPlacements,
  armStream as spacingStream,
  fitCamera,
  loadSpacingArms,
  viewElevationDeg,
  type SpacingArm,
} from './shipped-spacing-scene.js';
import { monoPictureStream, monoPlacements, pictureStatus, shippedLayoutArm, type WheatPictureId } from './shipped-wheat-scene.js';
import { VISIBLE_DELTA, sensitivityReasons, visibleDeltaDistribution, type VisibleDeltaReading } from './visible-delta.js';

export { VISIBLE_DELTA };

// ---------------------------------------------------------------- the arms

export type ScaleLadder = 'control' | 'pool' | 'width' | 'depth' | 'shipped';

export interface ScaleArmSpec {
  id: string;
  ladder: ScaleLadder;
  /** The contact pool's edge as a fraction of its derived reach; 0 is no pool. */
  pool: number;
  /** The tree's cast silhouette as a fraction of the crown's footprint. */
  width: number;
  /** The painted islands' full-shadow rung; `null` is the derived rung (no deep token). */
  depth: number | null;
}

export const SCALE_CONTROL_ARM = 'today';
export const SCALE_SHIPPED_ARM = 'shipped';

/** ⚠ THE CONTROL'S PICKS ARE TYPED AS HISTORY — the map after PR #1841 / #1845: the derived pool,
 *  the cone as wide as the crown, 0.55 deep. They cannot be read off `src/` any more. */
export const TODAY_PICKS = { pool: 1, width: 1, depth: 0.55 } as const;

/** The shipped picks, as an arm's fields — what every ladder rides for the levers it does not vary. */
const SHIPPED_PICKS = { pool: CONTACT_SPREAD, width: TREE_SHADOW_WIDTH, depth: SHADOW_DEPTH } as const;

export function poolArmId(pool: number): string {
  return `pool-${pool}`;
}
export function widthArmId(width: number): string {
  return `width-${width}`;
}
export function depthArmId(depth: number): string {
  return `depth-${Math.round(depth * 100)}`;
}

/** The three ladders the source declares, read rather than restated. The depth ladder is the
 *  scale-back one — laddered UPWARD from 0.55, the derived rung on top. */
export const POOL_LADDER: readonly number[] = [...CONTACT_SPREAD_RUNGS];
export const WIDTH_LADDER: readonly number[] = [...TREE_SHADOW_WIDTH_RUNGS];
export const DEPTH_LADDER: readonly number[] = [...SHADOW_DEPTH_SCALE_BACK_RUNGS];

/** The derived rung — `deepestAdmissibleRung` over the shipped ground's own tokens, the rung an
 *  arm with `depth: null` keeps on every row. Derived, never typed. */
export function derivedDepth(): number {
  const rung = deepestAdmissibleRung(GROUND_TOKENS);
  if (rung === null) throw new Error('shipped-shadow-scale-scene: the shipped palette admits no shadow rung');
  return rung;
}

export const SCALE_ARMS: readonly ScaleArmSpec[] = [
  { id: SCALE_CONTROL_ARM, ladder: 'control', ...TODAY_PICKS },
  ...POOL_LADDER.map((pool): ScaleArmSpec => ({ id: poolArmId(pool), ladder: 'pool', ...SHIPPED_PICKS, pool })),
  ...WIDTH_LADDER.map((width): ScaleArmSpec => ({ id: widthArmId(width), ladder: 'width', ...SHIPPED_PICKS, width })),
  { id: depthArmId(derivedDepth()), ladder: 'depth', ...SHIPPED_PICKS, depth: null },
  ...DEPTH_LADDER.map((depth): ScaleArmSpec => ({ id: depthArmId(depth), ladder: 'depth', ...SHIPPED_PICKS, depth })),
  { id: SCALE_SHIPPED_ARM, ladder: 'shipped', ...SHIPPED_PICKS },
];

export const POOL_ARMS: readonly string[] = SCALE_ARMS.filter((a) => a.ladder === 'pool').map((a) => a.id);
export const WIDTH_ARMS: readonly string[] = SCALE_ARMS.filter((a) => a.ladder === 'width').map((a) => a.id);
export const DEPTH_ARMS: readonly string[] = SCALE_ARMS.filter((a) => a.ladder === 'depth').map((a) => a.id);

export function scaleArmSpec(id: string): ScaleArmSpec {
  const found = SCALE_ARMS.find((a) => a.id === id);
  if (found === undefined) throw new Error(`shipped-shadow-scale-scene: no arm "${id}"`);
  return found;
}

/** Do two arms draw the SAME picture — same field, same material? The shipped arm is meant to
 *  coincide with one rung of each ladder; the driver refuses a run where it coincides with none. */
export function sameScaleArm(a: ScaleArmSpec, b: ScaleArmSpec): boolean {
  return a.pool === b.pool && a.width === b.width && (a.depth ?? derivedDepth()) === (b.depth ?? derivedDepth());
}

/** The arm one rung UP its own ladder — toward the derived pool, the full crown, the derived rung
 *  — or null: the control, the shipped arm and each ladder's first rung have none, so "vs
 *  neighbour" always isolates ONE lever. */
export function scaleNeighbourArm(id: string): string | null {
  const spec = scaleArmSpec(id);
  if (spec.ladder === 'control' || spec.ladder === 'shipped') return null;
  const ladder = spec.ladder === 'pool' ? POOL_ARMS : spec.ladder === 'width' ? WIDTH_ARMS : DEPTH_ARMS;
  const i = ladder.indexOf(id);
  return i > 0 ? ladder[i - 1]! : null;
}

export function scaleArmCaption(id: string): string {
  const s = scaleArmSpec(id);
  const pool = s.pool === 0 ? 'no contact pool (the trees cast and do not pool)' : s.pool === 1 ? 'the contact pool at its derived reach' : `the contact pool’s edge at ${s.pool} of its derived reach`;
  const width = s.width === 1 ? 'the cone as wide as the crown' : `the cone at ${s.width} of the crown’s width`;
  const depth = s.depth === null ? `the derived rung (${derivedDepth()}) on every token` : `the painted islands at ${s.depth}`;
  const tag = id === SCALE_CONTROL_ARM ? ' (CONTROL — the map after PR #1841 / #1845)' : id === SCALE_SHIPPED_ARM ? ' (SHIPS)' : '';
  return `${pool} · ${width} · ${depth}${tag}`;
}

// ---------------------------------------------------------------- the pictures

export type ScalePictureId = 'green' | 'yellow' | 'forest';

export interface ScalePicture {
  id: ScalePictureId;
  what: string;
  zoom: CrowdZoom;
}

export const SCALE_READ_ZOOM = 8;

export const SCALE_PICTURES: readonly ScalePicture[] = [
  { id: 'green', what: 'one GREEN island at the read zoom — the sand band is read off its coast', zoom: SCALE_READ_ZOOM },
  { id: 'yellow', what: 'one IN-PROGRESS island wearing the mustard wheat, at the read zoom', zoom: SCALE_READ_ZOOM },
  { id: 'forest', what: 'the REAL forest, fitted — control and shipped only', zoom: FIT_ZOOM },
];

export function scalePicture(id: ScalePictureId): ScalePicture {
  const found = SCALE_PICTURES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`shipped-shadow-scale-scene: no picture "${id}"`);
  return found;
}

/** Every ladder is read on BOTH mono islands; the forest is the check that the picks survive the
 *  opening zoom, control and shipped only. */
export function scaleArmsFor(pic: ScalePictureId): readonly string[] {
  return pic === 'forest' ? [SCALE_CONTROL_ARM, SCALE_SHIPPED_ARM] : SCALE_ARMS.map((a) => a.id);
}

// ---------------------------------------------------------------- what stands, what casts

/** The status a mono picture wears — the wheat page's own reading, so the yellow island here IS
 *  the yellow island there. */
export function scalePictureStatus(pic: 'green' | 'yellow'): string {
  return pictureStatus(pic as WheatPictureId);
}

/** THE STREAM a picture stands on: the mono fixture island (the wheat page's, memoised there) or
 *  the real forest (the spacing page's shipped layout). The SAME on every arm. */
export function pictureStream(pic: ScalePictureId, layout: SpacingArm): InstanceDescriptor[] {
  return pic === 'forest' ? spacingStream(layout) : monoPictureStream(pic);
}

export function picturePlacements(pic: ScalePictureId, layout: SpacingArm): KitPlacement[] {
  return pic === 'forest' ? spacingPlacements(layout) : monoPlacements(pic);
}

/** WHAT CASTS on an arm: the stream's own casters (the cave portals; the crowd's, on a mono island)
 *  unioned with one per placement — the same union the canvas hands its ground — with the trees'
 *  silhouettes at THIS arm's width. The cover casts, the pools follow the roles, exactly as shipped. */
export function scaleArmCasters(arm: string, pic: ScalePictureId, layout: SpacingArm): ShadowCaster[] {
  const spec = scaleArmSpec(arm);
  const own = pic === 'forest' ? groundCasters(spacingStream(layout)) : crowdCasters(crowdSize('one'));
  return [
    ...own,
    ...placementCasters(picturePlacements(pic, layout), KIT_FOOTPRINTS_2026_08_29, KIT_HEIGHTS_2026_08_29, true, roleSilhouettes(spec.width)),
  ];
}

/** The key two arms share a FIELD under: the pool and the width are what a field reads; the depth
 *  is the material's. */
export function fieldKey(spec: ScaleArmSpec, pic: ScalePictureId): string {
  return `${pic}|${spec.pool}|${spec.width}`;
}

export interface TimedGroundBuild {
  build: ShippedGroundBuild;
  /** THE MOUNT-TIME STAMP, wall-clock ms for `shippedGroundBuild`. Measured, never inherited. */
  buildMs: number;
  casters: number;
}

const groundBuildMemo = new Map<string, TimedGroundBuild>();

/** THE SHIPPED GROUND, BUILT ONCE PER FIELD KEY — `shippedGroundBuild`, the function `CellGround`
 *  calls, handed this arm's casters and spread, the shipped penumbra and band. */
export function scaleArmGroundBuild(arm: string, pic: ScalePictureId, layout: SpacingArm): TimedGroundBuild {
  const spec = scaleArmSpec(arm);
  const key = fieldKey(spec, pic);
  const hit = groundBuildMemo.get(key);
  if (hit !== undefined) return hit;
  const stream = pictureStream(pic, layout);
  const casters = scaleArmCasters(arm, pic, layout);
  const t0 = performance.now();
  const build = shippedGroundBuild(
    stream.filter((d) => d.kind === 'cell-ground'),
    casters,
    stream.filter((d) => d.kind === 'trail-strip'),
    SHADOW_PENUMBRA,
    SHADOW_CONTACT_BAND,
    spec.pool,
  );
  const timed = { build, buildMs: performance.now() - t0, casters: casters.length };
  groundBuildMemo.set(key, timed);
  return timed;
}

/** The depth options an arm's material is built with: the shipped deep tokens at this arm's rung
 *  and the shipped edge; an arm keeping the derived rung names NO deep token. The control wears
 *  its typed depth on the same tokens. */
export function scaleArmDepth(arm: string): ShadowDepthOptions {
  const spec = scaleArmSpec(arm);
  return {
    deep: spec.depth ?? SHADOW_DEPTH,
    deepTokens: spec.depth === null ? [] : SHIPPED_SHADOW_DEPTH.deepTokens,
    edge: SHADOW_EDGE,
  };
}

// ---------------------------------------------------------------- the numbers under the picture

/** THE READER MODEL, PRINTED: every distinct token's margin at the derived rung and at every rung of
 *  the scale-back ladder. */
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
 * HOW DARK THE LAND'S DARKEST PIXELS SIT AGAINST ITS BRIGHTEST — luma percentiles over every LAND
 * pixel in a frame (the background excluded, nothing else), so the same instrument reads the green,
 * the wheat and the sand. An instrument for the depth ladder, not a fence: `p05 / p95` is the
 * darkest land as a share of the brightest. ⚠ Crowns and cover are land pixels too, so the low tail
 * is foliage as much as shadowed ground; read the bins.
 */
export interface LandLuma {
  count: number;
  p05: number;
  p50: number;
  p95: number;
  ratio: number;
  /** Share of land pixels in each of {@link LUMA_BINS} equal luma bins over 0..255. */
  bins: number[];
}

export const LUMA_BINS = 16;

export function landLuma(rgba: Uint8ClampedArray, bg: readonly [number, number, number]): LandLuma {
  const lumas: number[] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i]!;
    const g = rgba[i + 1]!;
    const b = rgba[i + 2]!;
    if (r === bg[0] && g === bg[1] && b === bg[2]) continue;
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

export interface ScaleScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  spec: ScaleArmSpec;
  groundTriangles: number;
  screen: ScreenExtent;
  meshes: number;
  placements: number;
  casters: number;
  buildMs: number;
  /** Share of the field's texels past the full threshold, and past the soft one. */
  fieldFull: number;
  fieldSoft: number;
}

function lightScene(scene: THREE.Scene, lit: CalibratedIntensities): void {
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.AmbientLight(0xffffff, lit.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, lit.directional);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);
}

/** ONE ARM'S SCENE in one picture: its field's ground build, its depth's material, the picture's
 *  placements, the shipped camera. The forest is fitted ONCE, on the control, and every arm shares
 *  that frame. */
export function buildScaleScene(kit: LoadedKit, lit: CalibratedIntensities, arm: string, pic: ScalePicture, layout: SpacingArm): ScaleScene {
  const spec = scaleArmSpec(arm);
  const timed = scaleArmGroundBuild(arm, pic.id, layout);
  const build = timed.build;
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-shadow-scale-scene: the picture drew no ground');
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
  // ⚠ THE SHIPPED BUILDER, HANDED THIS ARM'S DEPTH AND NOTHING ELSE OF THIS PAGE'S OWN — the grass,
  // the sand, the layers and the wheat as the map wears them.
  const { material } = buildGroundMaterial(build.field, SHIPPED_GRASS, build.shore(), SHIPPED_SAND_MIX, extras, scaleArmDepth(arm));
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  const placements = picturePlacements(pic.id, layout);
  let meshes = 0;
  for (const mesh of kitMeshes(kit, placements)) {
    scene.add(mesh);
    meshes += 1;
  }
  lightScene(scene, lit);
  let camera: THREE.OrthographicCamera;
  let pxPerUnit: number;
  if (pic.id === 'forest') {
    const fit = fitCamera(geo.positions);
    pxPerUnit = fit.pxPerUnit;
    camera = orientedCamera(fit.centre, pxPerUnit);
  } else {
    pxPerUnit = pic.zoom === FIT_ZOOM ? fitCamera(geo.positions).pxPerUnit : pic.zoom;
    camera = orientedCamera({ x: 0, z: 0 }, pxPerUnit);
  }
  return {
    scene,
    camera,
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit,
    spec,
    groundTriangles: geo.triangles,
    screen: screenExtent(geo.positions, camera),
    meshes,
    placements: placements.length,
    casters: timed.casters,
    buildMs: timed.buildMs,
    fieldFull: build.field === null ? 0 : atlasCoverage(build.field, 0.5),
    fieldSoft: build.field === null ? 0 : atlasCoverage(build.field, 0.25),
  };
}

// ---------------------------------------------------------------- the readings

export interface ScaleReading {
  arm: string;
  ladder: ScaleLadder;
  spec: ScaleArmSpec;
  picture: ScalePictureId;
  elevationDeg: number;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  meshes: number;
  placements: number;
  casters: number;
  buildMs: number;
  fieldFull: number;
  fieldSoft: number;
  box: PixelBox;
  stats: ImageStats;
  landPx: number;
  families: number;
  luma: LandLuma;
  /** Against the CONTROL at the same picture. `touched` is context only (ADR-0490 D6). */
  touched: number;
  visible: number;
  delta: VisibleDeltaReading;
  /** Against the neighbour one rung up the same ladder (null for the control, the shipped arm and
   *  each ladder's first rung). */
  touchedVsNeighbour: number | null;
  visibleVsNeighbour: number | null;
  /** Against the SHIPPED arm — zero on the rung it coincides with, which is the pick made visible. */
  touchedVsShipped: number;
}

export interface ScaleCostSpec {
  arm: string;
  picture: ScalePictureId;
  batch: number;
}

export interface ScaleCostReading extends ScaleCostSpec {
  gpuMsPerFrame: number | null;
  gpuBatchNs: number | null;
  disjoint: boolean;
  drawCalls: number;
  triangles: number;
  timerQueryAvailable: boolean;
  hidden: boolean;
}

export interface ScaleRunner {
  identity(): RendererIdentity;
  calibration(): LightCalibration;
  kits(): KitFacts[];
  layout(): { id: string; islands: number; head: string; generatedAt: string };
  warm(): void;
  read(arm: string, picture: ScalePictureId): ScaleReading;
  sensitivity(picture: ScalePictureId): string[];
  margins(): MarginRow[];
  /** The frame cost of one arm on the GPU's own clock — a REPORT (ADR-0517 D4). */
  cost(spec: ScaleCostSpec): Promise<ScaleCostReading>;
  snapshot(arm: string, picture: ScalePictureId): string;
}

async function fetchJsonFromPage(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`shipped-shadow-scale-scene: ${url} answered ${res.status} — serve the harness from THIS worktree`);
  return res.json();
}

export async function createScaleRunner(): Promise<ScaleRunner> {
  const { manifest, arms: layouts } = await loadSpacingArms(fetchJsonFromPage);
  const layout = shippedLayoutArm(layouts, manifest.shippedRatio);
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
  const cache = new Map<string, ScaleScene>();
  const sceneFor = (arm: string, pic: ScalePictureId): ScaleScene => {
    const k = `${arm}|${pic}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildScaleScene(kit, lit, arm, scalePicture(pic), layout);
    cache.set(k, built);
    return built;
  };
  const render = (arm: string, pic: ScalePictureId): ScaleScene => {
    const s = sceneFor(arm, pic);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };
  const pixelMemo = new Map<string, Uint8ClampedArray>();
  const pixels = (arm: string, pic: ScalePictureId): Uint8ClampedArray => {
    const k = `${arm}|${pic}`;
    const hit = pixelMemo.get(k);
    if (hit !== undefined) return hit;
    const s = render(arm, pic);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8ClampedArray(buf.buffer);
    pixelMemo.set(k, out);
    return out;
  };
  return {
    identity: () => readIdentity(gl),
    calibration: () => cal,
    kits: () => facts,
    layout: () => ({ id: layout.record.id, islands: layout.record.islands, head: manifest.studio.head, generatedAt: manifest.generatedAt }),
    warm() {
      for (const arm of scaleArmsFor('green')) render(arm, 'green');
    },
    read(arm, pic) {
      const s = render(arm, pic);
      const info = renderer.info.render;
      const drawCalls = info.calls;
      const triangles = info.triangles;
      const buf = pixels(arm, pic);
      const census = familyCensus(buf, bg);
      const delta = visibleDeltaDistribution(buf, pixels(SCALE_CONTROL_ARM, pic));
      const neighbour = pic === 'forest' ? null : scaleNeighbourArm(arm);
      const vsNeighbour = neighbour === null ? null : visibleDeltaDistribution(buf, pixels(neighbour, pic));
      const vsShipped = visibleDeltaDistribution(buf, pixels(SCALE_SHIPPED_ARM, pic));
      return {
        arm,
        ladder: s.spec.ladder,
        spec: s.spec,
        picture: pic,
        elevationDeg: viewElevationDeg(s.camera),
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        groundTriangles: s.groundTriangles,
        meshes: s.meshes,
        placements: s.placements,
        casters: s.casters,
        buildMs: s.buildMs,
        fieldFull: s.fieldFull,
        fieldSoft: s.fieldSoft,
        box: landBox(buf, s.width, s.height, bg),
        stats: imageStats(buf, s.width, s.height, bg),
        landPx: census.land,
        families: census.families,
        luma: landLuma(buf, bg),
        touched: delta.touched,
        visible: delta.visible,
        delta,
        touchedVsNeighbour: vsNeighbour === null ? null : vsNeighbour.touched,
        visibleVsNeighbour: vsNeighbour === null ? null : vsNeighbour.visible,
        touchedVsShipped: vsShipped.touched,
      };
    },
    sensitivity(pic) {
      return sensitivityReasons(pixels(SCALE_CONTROL_ARM, pic));
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
  };
}

// ---------------------------------------------------------------- the page

export async function mountShippedShadowScale(root: HTMLElement): Promise<void> {
  const runner = await createScaleRunner();
  window.shadowScaleRunner = runner;
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → scale ${cal.scale.toFixed(3)} onto the ladder’s ${cal.target} · ` +
    `signed ${RENDER_ELEV_DEG}° · ships: pool ${CONTACT_SPREAD} of the derived reach, cone ${TREE_SHADOW_WIDTH} of the crown, depth ${SHADOW_DEPTH} (edge ${SHADOW_EDGE}, penumbra ${SHADOW_PENUMBRA}) · ` +
    `control: pool ${TODAY_PICKS.pool}, cone ${TODAY_PICKS.width}, depth ${TODAY_PICKS.depth}`;
  root.appendChild(head);
  for (const pic of SCALE_PICTURES) {
    const h = document.createElement('h2');
    h.textContent = `${pic.id} — ${pic.what} — ${pic.zoom === FIT_ZOOM ? 'fitted' : `${pic.zoom} px/unit`}`;
    root.appendChild(h);
    const row = document.createElement('div');
    row.className = 'row';
    for (const arm of scaleArmsFor(pic.id)) {
      const r = runner.read(arm, pic.id);
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = runner.snapshot(arm, pic.id);
      img.width = 900;
      fig.appendChild(img);
      const cap = document.createElement('figcaption');
      cap.textContent =
        `${arm} — ${scaleArmCaption(arm)} · ${r.casters} casters · stamp ${r.buildMs.toFixed(0)} ms · field ${(r.fieldFull * 100).toFixed(2)}% full / ${(r.fieldSoft * 100).toFixed(2)}% soft · ` +
        `land p05/p95 ${r.luma.ratio.toFixed(3)} · moved>${VISIBLE_DELTA} vs today ${r.visible.toLocaleString()}`;
      fig.appendChild(cap);
      row.appendChild(fig);
    }
    root.appendChild(row);
  }
}

declare global {
  interface Window {
    shadowScaleRunner?: ScaleRunner;
  }
}
