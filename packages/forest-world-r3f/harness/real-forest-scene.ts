// real-forest-scene.ts — STORYTREE'S REAL FOREST, THROUGH THE 3D RENDERER, FOR THE FIRST TIME —
// beside the studio's own SVG map of the same forest, in the same buffer.
//
// ⚠⚠ WHAT MAKES THIS DIFFERENT FROM EVERY OTHER FOREST PICTURE IN THIS DIRECTORY. The land work's
// forest pictures are of one of two things, and neither is the map:
//   · a SYNTHETIC CROWD (`crowd-layout.ts`) — copies of one fixture island on a scatter grid whose
//     frame is calibrated to a land share read off a committed PNG. Its own header says so: it
//     models DENSITY and knows nothing of the map's topology;
//   · a LADDER ARM — the real layout, but drawn with a candidate spacing or a candidate tile that
//     the map does not ship (`shipped-spacing-scene.ts`, `shipped-tile-scene.ts`).
// This page renders exactly ONE thing: the layout the studio built for the live corpus TODAY, asked
// for nothing (`apps/studio/scripts/export-real-forest.mjs` passes no rung override), pushed
// through the SHIPPED 3D pipeline — `worldTo3D`, `dressMapWithCover`, `shippedGroundBuild`,
// `buildGroundMaterial` — and photographed. There is no control arm because nothing is being
// compared: the subject is the map.
//
// ⚠⚠ IT DECIDES NOTHING AND CHANGES NO SHIPPED SURFACE. It is a picture and four numbers
// (`mount-the-land-on-a-real-surface-arc-inc-01`). In particular it is NOT a precondition for the
// mount (ADR-0546 D3): the owner accepted the forest's post-un-projection shape sight-unseen, as an
// offered option he was shown and declined. If the picture reads badly that is a FINDING to report
// and a fresh question about the forest's SPACING — never a licence to re-squash it, reinstate the
// deleted footprint repair, or tune the layout here.
//
// ⚠ THE EXPORT IS A 2D DRAWING and the mapper stopped repairing one (ADR-0546 D1), so it is
// converted at the reader by `trueGroundFromDrawing` — un-projected about the ORIGIN, which is what
// puts the forest on true ground — and only THEN sized per capability. `frozen-drawing.ts` carries
// the why and is the thing to delete first when the studio can be asked for a plan-view map.
//
// ⚠⚠ "THE SAME FRAMING" IS DEFINED HERE, BECAUSE THE TWO SURFACES DO NOT SHARE A PROJECTION AND
// SAYING THEY DO WOULD BE THE LIE THIS PAGE EXISTS TO PREVENT. The studio's SVG map draws the world
// already projected at `LAND_CAMERA_ELEVATION_DEG` (20°); the 3D canvas stands the same world on
// TRUE ground and looks at it from `RENDER_ELEV_DEG` (50°). Depth therefore delivers
// `sin 50° / sin 20°` = 2.24x more screen height in 3D than in 2D for the same forest, and no
// choice of scale removes that. What the two DO share is the x axis, which neither projection
// touches. So {@link REAL_FOREST_PICTURES} offers both honest framings and names which is which:
//   · `fit`     — each renderer fits the whole forest into the same 2560x1600 buffer, at its own
//                 scale. The pictures are then comparable as PICTURES and not as measurements.
//   · `matched` — the 3D at the 2D map's OWN delivered pixels-per-world-x-unit, so a metre of world
//                 x is a pixel of screen x in both. The comparable MEASUREMENT, and the one that
//                 shows what the extra depth costs.
//   · `one`     — the read island at 8 px/unit, the zoom a member works at.
//
// ⚠ `restingFrame` (ADR-0471) IS NOT SHARED BY THIS RENDERER, and the increment's own premise said
// it was. Checked at the source: `src/camera-framing.ts` says in terms that its rule "is NOT the
// shipped framing", that the two surfaces a visitor can reach (the studio's SVG map and the public
// `/forest/` page) are the two that converge on `restingFrame`, and that this canvas would have to
// ADOPT it — which needs island identity on `InstanceDescriptor` — if it were ever mounted. The
// `matched` picture is what stands in for a shared framing until then, and it is derived from the
// 2D map's own delivered scale rather than invented here.
//
// THE PAGE ADOPTS NOTHING OF ITS OWN. `harness/` only: it produces EVIDENCE.

import { LAND_CAMERA_ELEVATION_DEG, groundFlattening } from '@storytree/forest-world';
import * as THREE from 'three';

import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE } from '../src/banded-ground-material.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { configureExactColour } from '../src/exact-colour.js';
import {
  SHIPPED_GRASS,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  buildGroundMaterial,
  shippedGroundBuild,
  type GroundLayerExtras,
  type ShippedGroundBuild,
} from '../src/ForestWorldCanvas.js';
import { RENDER_ELEV_DEG } from '../src/kit-vocabulary.js';
import { LAND_AREA_PER_CAPABILITY } from '../src/land-per-capability.js';
import { KIT_PROP_INDIRECT_FRACTION } from '../src/prop-lighting.js';
import { atlasCoverage } from '../src/shadow-atlas.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import { awaitQuery, readIdentity, type DisjointTimerQuery, type RendererIdentity } from './frame-cost-scene.js';
import { KIT_ASSET_URL, kitMeshes, loadKit, setKitPropLighting } from './kit-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { crowdCells, crowdSize, orientedCamera } from './shipped-crowd-scene.js';
import { kitFacts, type KitFacts } from './shipped-detail-scene.js';
import { backgroundBytes, familyCensus } from './shipped-grass-scene.js';
import { groundDepth, landBox, screenExtent, type GroundExtent, type PixelBox } from './shipped-land-ratio-scene.js';
import {
  READ_ISLAND,
  armGroundBuild,
  armPlacements,
  armStream,
  fitCamera,
  forestBounds,
  islandFootprints,
  tightestPair,
  viewElevationDeg,
  type ForestBounds,
  type IslandFootprint,
  type FetchJson,
  type SpacingArm,
  type SpacingArmRecord,
  type SpacingSceneFile,
  type TightestPair,
} from './shipped-spacing-scene.js';
import { calibrateLights, intensitiesFor, type CalibratedIntensities, type LightCalibration } from '../src/light-calibration.js';
import { parseHex, type Rgb255 } from '../src/shade-ladder.js';
import {
  familyKeyOf,
  fullReaderTable,
  isBackgroundPixel,
  nearestReadStatus,
  statusTruthVerdict,
  type PixelRect,
  type ReaderTable,
  type StatusTruthVerdict,
} from './status-truth.js';

// ---------------------------------------------------------------- where the export lives

/** Where `export-real-forest.mjs` writes, relative to `docs/research/` — served by the harness's
 *  fenced `/reference/` route (`vite.config.ts`), the same route every committed scene rides. */
export const REAL_FOREST_EVIDENCE_DIR = 'chapter2-real-forest-2026-09-08';
export const REAL_FOREST_SCENES_ROUTE = `/reference/${REAL_FOREST_EVIDENCE_DIR}/scenes`;

/** The one arm's id — the map as it ships. */
export const REAL_FOREST_ARM = 'shipped';

/** One 2D view as the export driver photographed it, with the scale the studio's own camera delivered. */
export interface TwoDView {
  view: 'fit' | 'resting';
  islands: number;
  /** The studio camera's delivered scale — CSS px per 2D WORLD unit. The x axis of this is the one
   *  quantity the 3D page can honestly match, since neither projection touches x. */
  scale: number;
  viewport: { w: number; h: number };
  contentExtentPx: { w: number; h: number } | null;
  medianIslandWidthPx: number | null;
  png: string;
}

export interface RealForestManifest {
  generatedAt: string;
  studio: { url: string; head: string; branch: string };
  control: string;
  arms: ReadonlyArray<SpacingArmRecord & { tile: { hexR: number; quota: string; tilesPerCapability: number } }>;
  twoD: readonly TwoDView[];
}

/**
 * THE MANIFEST MUST BE THE MAP AND NOT A LADDER — refused otherwise rather than rendering an arm
 * that does not ship and captioning it as the forest.
 *
 * Every refusal here is a way this page could show something other than the shipped map: more than
 * one arm (a ladder's manifest, whose arms are candidates); an arm carrying a spacing OVERRIDE (the
 * driver asked the studio for a rung); no tile record (ADR-0528 made the tile derived, so a scene
 * that does not say which tile it stands on cannot be shown to stand on the shipped one); and no
 * 2D view to stand beside, which is half of what this page is for.
 */
export function validateRealManifest(m: unknown): RealForestManifest {
  const bad = (why: string): never => {
    throw new Error(`real-forest-scene: manifest.json is not the shipped map — ${why}`);
  };
  if (typeof m !== 'object' || m === null) return bad('not an object');
  const o = m as Partial<RealForestManifest>;
  if (!Array.isArray(o.arms) || o.arms.length !== 1) return bad(`${Array.isArray(o.arms) ? o.arms.length : 'no'} arms — this page renders exactly one, the map`);
  const arm = o.arms[0]!;
  if (typeof arm.id !== 'string' || typeof arm.file !== 'string') return bad('the arm has no id/file');
  if (arm.spacing?.ratio !== undefined || arm.spacing?.legacy !== undefined) {
    return bad(`the arm carries a spacing override (${JSON.stringify(arm.spacing)}) — it was exported from a ladder rung, not from the shipped map`);
  }
  if (typeof arm.tile?.hexR !== 'number') return bad('the arm records no tile — since ADR-0528 the tile is derived and a scene must say which one it stands on');
  if (!Array.isArray(o.twoD) || !o.twoD.some((v) => v.view === 'fit' && typeof v.scale === 'number')) {
    return bad('no fitted 2D view with a delivered scale — there is nothing to stand the 3D beside');
  }
  return o as RealForestManifest;
}

export async function loadRealForest(
  fetchJson: FetchJson,
  route: string = REAL_FOREST_SCENES_ROUTE,
): Promise<{ manifest: RealForestManifest; arm: SpacingArm }> {
  const manifest = validateRealManifest(await fetchJson(`${route}/manifest.json`));
  const record = manifest.arms[0]!;
  const file = (await fetchJson(`${route}/${record.file}`)) as SpacingSceneFile;
  if (typeof file !== 'object' || file === null || file.scene?.el !== 'g') {
    throw new Error(`real-forest-scene: ${record.file} carries no scene graph`);
  }
  return { manifest, arm: { record, file } };
}

/** The 2D view by id, or a refusal — a missing view is a driver that did not photograph it. */
export function twoDView(manifest: RealForestManifest, view: TwoDView['view']): TwoDView {
  const found = manifest.twoD.find((v) => v.view === view);
  if (found === undefined) throw new Error(`real-forest-scene: the export carries no 2D "${view}" view`);
  return found;
}

// ---------------------------------------------------------------- the extent comparison

/**
 * HOW MUCH BIGGER THE REAL FOREST IS THAN THE SYNTHETIC CROWD EVERY EARLIER FIGURE WAS TAKEN ON.
 *
 * Both extents are read by the SAME function (`groundDepth` over `cell-ground` descriptors), which
 * is the whole point: a ratio between two rulers would say nothing. `depthOverWidth` is each
 * forest's own aspect — the number that says the real map is a tall column and the crowd is a
 * roughly square scatter, which is what makes a "forest-scale" figure taken on the crowd an
 * over- or under-statement rather than merely a different number.
 */
export interface ExtentComparison {
  real: GroundExtent;
  synthetic: GroundExtent;
  realIslands: number;
  syntheticIslands: number;
  widthRatio: number;
  depthRatio: number;
  areaRatio: number;
  realDepthOverWidth: number;
  syntheticDepthOverWidth: number;
}

export function extentComparison(real: readonly InstanceDescriptor[], synthetic: readonly InstanceDescriptor[]): ExtentComparison {
  const cells = (s: readonly InstanceDescriptor[]) => s.filter((d) => d.kind === 'cell-ground');
  const r = groundDepth(cells(real));
  const s = groundDepth(cells(synthetic));
  const count = (x: readonly InstanceDescriptor[]) => new Set(cells(x).map((d) => d.island).filter((i): i is string => i !== undefined)).size;
  return {
    real: r,
    synthetic: s,
    realIslands: count(real),
    syntheticIslands: count(synthetic),
    widthRatio: s.w === 0 ? Infinity : r.w / s.w,
    depthRatio: s.d === 0 ? Infinity : r.d / s.d,
    areaRatio: s.w * s.d === 0 ? Infinity : (r.w * r.d) / (s.w * s.d),
    realDepthOverWidth: r.w === 0 ? Infinity : r.d / r.w,
    syntheticDepthOverWidth: s.w === 0 ? Infinity : s.d / s.w,
  };
}

/** The synthetic 35-island crowd's own descriptor stream — the thing every earlier forest figure
 *  was taken on, built here so the comparison is against the real article rather than a quoted number. */
export function syntheticForestStream(): InstanceDescriptor[] {
  return crowdCells(crowdSize('forest'));
}

// ---------------------------------------------------------------- the per-island screen rects

/**
 * EVERY ISLAND'S OWN PIXEL RECT, PROJECTED FROM ITS OWN RING.
 *
 * ⚠ THE CROWD PAGE'S SHORTCUT DOES NOT WORK HERE, AND SILENTLY. `shipped-status-scene.ts` projects
 * ONE fixture island's extent and then shifts it per island, which is exact for a crowd (every
 * island there IS a translated copy of that fixture) and WRONG for the real map, where every island
 * is a different size and shape. Reusing it would hand `status-truth.ts` a rect of the wrong size
 * for 34 of 35 islands — voting neighbours' ground and sea into each island's verdict — and the
 * verdict would still come back looking like a verdict. So this projects each island's actual
 * ground vertices.
 *
 * `shrink` pulls the rect toward its own centre to keep a neighbour's ground out of the vote; it is
 * `shipped-status-scene.ts`'s own {@link STATUS_RECT_SHRINK} value, borrowed rather than re-picked.
 */
export const STATUS_RECT_SHRINK = 0.6;

/**
 * A MUCH TIGHTER RECT, used only for the diagnostic sample — the island's CORE.
 *
 * ⚠ IT IS NOT A SECOND VERDICT AND MUST NOT BECOME ONE. Shrinking the rect until an island passes
 * would be tuning the instrument to the answer, which is why the status verdict keeps the borrowed
 * 60%. What this buys is attribution: `status-truth.ts` votes every ground pixel in the rect, so a
 * misread can be the island's own field or it can be the rim — the shore band, the sand skirt, the
 * worn path — occupying a share of a SMALL island it never occupied on the big fixture the
 * demonstration ran on. Sampling the core beside the whole says which, and neither number decides
 * anything on its own.
 */
export const CORE_RECT_SHRINK = 0.25;

export interface RealIslandRect {
  id: string;
  status: string;
  rect: PixelRect;
  fullRect: PixelRect;
  /** The rect's area in frame pixels BEFORE the shrink — how much picture this island gets. */
  fullAreaPx: number;
}

function toPixelRect(
  camera: THREE.OrthographicCamera,
  e: { minX: number; maxX: number; minY: number; maxY: number },
  width: number,
  height: number,
): PixelRect {
  const toPxX = (x: number) => ((x - camera.left) / (camera.right - camera.left)) * width;
  const toPxY = (y: number) => ((y - camera.bottom) / (camera.top - camera.bottom)) * height;
  return { x0: toPxX(e.minX), x1: toPxX(e.maxX), y0: toPxY(e.minY), y1: toPxY(e.maxY) };
}

function shrinkToCentre(rect: PixelRect, factor: number): PixelRect {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const hw = ((rect.x1 - rect.x0) / 2) * factor;
  const hh = ((rect.y1 - rect.y0) / 2) * factor;
  return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
}

/** Does `rect` overlap the frame at all — asked of the FULL rect, so a corner-clipped island counts. */
export function rectInFrame(rect: PixelRect, width: number, height: number): boolean {
  return rect.x1 > 0 && rect.x0 < width && rect.y1 > 0 && rect.y0 < height;
}

export function realIslandRects(
  stream: readonly InstanceDescriptor[],
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  shrink: number = STATUS_RECT_SHRINK,
): RealIslandRect[] {
  const byIsland = new Map<string, { status: string; pts: Array<{ x: number; y: number; z: number }> }>();
  for (const d of stream) {
    if (d.kind !== 'cell-ground' || d.island === undefined) continue;
    const entry = byIsland.get(d.island) ?? { status: d.material ?? 'unknown', pts: [] };
    for (const p of d.points ?? []) entry.pts.push({ x: p.x, y: p.y, z: p.z });
    byIsland.set(d.island, entry);
  }
  const v = new THREE.Vector3();
  const out: RealIslandRect[] = [];
  for (const [id, entry] of [...byIsland.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (entry.pts.length === 0) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of entry.pts) {
      v.set(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    const fullRect = toPixelRect(camera, { minX, maxX, minY, maxY }, width, height);
    out.push({
      id,
      status: entry.status,
      fullRect,
      rect: shrinkToCentre(fullRect, shrink),
      fullAreaPx: Math.max(0, fullRect.x1 - fullRect.x0) * Math.max(0, fullRect.y1 - fullRect.y0),
    });
  }
  return out;
}

// ---------------------------------------------------------------- the pictures

export type RealPictureId = 'fit' | 'matched' | 'one';

export interface RealPicture {
  id: RealPictureId;
  what: string;
}

export const REAL_FOREST_PICTURES: readonly RealPicture[] = [
  { id: 'fit', what: 'the whole real forest fitted to the buffer — the picture to set beside the 2D map’s own fitted view' },
  { id: 'matched', what: 'the whole real forest at the 2D map’s OWN delivered px per world x unit — the comparable measurement' },
  { id: 'one', what: `one island (${READ_ISLAND}) at the read zoom — the zoom a member works at` },
];

export function realPicture(id: RealPictureId): RealPicture {
  const found = REAL_FOREST_PICTURES.find((p) => p.id === id);
  if (!found) throw new Error(`real-forest-scene: no picture "${id}"`);
  return found;
}

export const REAL_READ_ZOOM = 8;

export interface RealForestScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  groundTriangles: number;
  bounds: ForestBounds;
  tightest: TightestPair;
  read: IslandFootprint;
  /** The occlusion field's coverage — what fraction of the shadow atlas's texels are occluded. */
  occlusionCoverage: number;
  meshes: number;
}

/**
 * THE ARMS, AND WHY A PAGE THAT REPORTED ONLY THE FIRST WOULD MISLEAD.
 *
 * The status question (`does an island's ground still read as its own state`) was demonstrated by
 * PR #1804 through `harness/shipped-status-scene.ts`, on a scene that has NO CAST SHADOWS: since
 * ADR-0508 retired the placeholder story-tree family, `crowdCasters` returns an empty list, so that
 * page's occlusion field is all-lit and its ground is delivered at the authored ladder exactly.
 * The real map's ground is not: it carries an occlusion field built from the map's own casters, and
 * the cast-shadow row landed AFTER that demonstration.
 *
 * So a verdict taken on the map alone could not say whether a misread came from the forest (this
 * increment's only subject), from the dressing standing in front of the land, from the shadow the
 * dressing casts ON the land, or from a ground layer whose reach depends on how big an island is.
 * {@link REAL_ARMS} separates them, and every step moves exactly one thing:
 *
 *   `map`         the frame the map actually draws — kit meshes, occlusion field, everything.
 *   `bare`        the same ground with nothing standing on it. `map` → `bare` isolates the props.
 *   `unshadowed`  the same bare ground, its occlusion atlas built from NO CASTERS — an all-lit
 *                 field with the same packing. `bare` → `unshadowed` isolates the cast shadow.
 *   `norock`      the all-lit ground with LAYER 4, the rock, removed. `unshadowed` → `norock`
 *                 isolates the one layer whose strength is driven by SLOPE, and therefore the one
 *                 whose reach changes when the islands change size: `land-relief.ts`'s amplitude is
 *                 in absolute world units, so the same relief over a smaller island is a steeper
 *                 island, and a slope-gated grey mixes further in.
 *
 * ⚠ `unshadowed` REMOVES THE CASTERS, NOT THE FIELD, AND THAT IS FORCED RATHER THAN CHOSEN. The
 * `none` arm on `shipped-shadow-scene.ts` drops the field entirely, which is legal there because
 * that page's material carries no sand; the SHIPPED stack does, and layer 2 rides the packed
 * atlas's own tiles — `createBandedGroundMaterial` refuses a sand mix with no atlas to read a
 * per-island coordinate from. So the control keeps the packing and empties the caster list, which
 * is the same configuration `shipped-status-scene.ts` is in today anyway: ADR-0508 retired the
 * placeholder story-tree family, so its `crowdCasters` returns nothing and the demonstration this
 * page repeats was taken on all-lit ground.
 */
export type RealArmId = 'map' | 'bare' | 'unshadowed' | 'norock';

export const REAL_ARMS: ReadonlyArray<{ id: RealArmId; what: string }> = [
  { id: 'map', what: 'the frame the map draws — kit meshes and the occlusion field' },
  { id: 'bare', what: 'the same ground with nothing standing on it — isolates the props' },
  { id: 'unshadowed', what: 'the same bare ground, its occlusion atlas built from no casters — isolates the cast shadow' },
  { id: 'norock', what: 'the all-lit ground with the slope-gated rock layer removed — isolates the one layer whose reach follows island size' },
];

const unshadowedMemo = new Map<string, ShippedGroundBuild>();

/** The map's own ground with an EMPTY caster list — the all-lit control the arms above describe.
 *  Memoised for the same reason `armGroundBuild` is: the shore field is the expensive half. */
export function unshadowedGroundBuild(arm: SpacingArm): ShippedGroundBuild {
  const hit = unshadowedMemo.get(arm.record.id);
  if (hit !== undefined) return hit;
  const stream = armStream(arm);
  const built = shippedGroundBuild(
    stream.filter((d) => d.kind === 'cell-ground'),
    [],
    stream.filter((d) => d.kind === 'trail-strip'),
  );
  unshadowedMemo.set(arm.record.id, built);
  return built;
}

/** ONE PICTURE of the real forest, in one arm, through the shipped pipeline and nothing else. */
export function buildRealForestScene(
  kit: Awaited<ReturnType<typeof loadKit>>,
  lit: CalibratedIntensities,
  arm: SpacingArm,
  pic: RealPicture,
  matchedPxPerUnit: number,
  armId: RealArmId = 'map',
): RealForestScene {
  const build = armId === 'unshadowed' || armId === 'norock' ? unshadowedGroundBuild(arm) : armGroundBuild(arm);
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('real-forest-scene: the map drew no ground');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  if (geo.atlasOrigins.length > 0) {
    geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));
  }
  const wearField = build.wear();
  // ⚠ BY STATEMENT, and absent means ABSENT: under `exactOptionalPropertyTypes` a `rock: undefined`
  // is a different input from no key at all, and only the second leaves the emitted shader
  // byte-identical to the one the map compiled before the rock layer existed.
  const extras: GroundLayerExtras = { detail: SHIPPED_LAYERS.detail };
  if (armId !== 'norock') extras.rock = SHIPPED_LAYERS.rock;
  if (wearField !== null) extras.wear = { field: wearField, mix: SHIPPED_LAYERS.wearMix };
  const { material } = buildGroundMaterial(build.field, SHIPPED_GRASS, build.shore(), SHIPPED_SAND_MIX, extras);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.Mesh(geometry, material));
  let meshes = 0;
  if (armId === 'map') {
    for (const mesh of kitMeshes(kit, armPlacements(arm))) {
      scene.add(mesh);
      meshes += 1;
    }
  }
  scene.add(new THREE.AmbientLight(0xffffff, lit.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, lit.directional);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);

  const stream = armStream(arm);
  const footprints = islandFootprints(stream);
  const read = footprints.find((f) => f.id === READ_ISLAND);
  if (read === undefined) throw new Error(`real-forest-scene: the map has no island "${READ_ISLAND}" to centre the read zoom on`);
  const fit = fitCamera(geo.positions);
  let camera: THREE.OrthographicCamera;
  let pxPerUnit: number;
  if (pic.id === 'one') {
    pxPerUnit = REAL_READ_ZOOM;
    camera = orientedCamera(read.centre, pxPerUnit);
  } else if (pic.id === 'matched') {
    pxPerUnit = matchedPxPerUnit;
    camera = orientedCamera(fit.centre, pxPerUnit);
  } else {
    pxPerUnit = fit.pxPerUnit;
    camera = orientedCamera(fit.centre, pxPerUnit);
  }
  return {
    scene,
    camera,
    width: CROWD_VIEWPORT.w,
    height: CROWD_VIEWPORT.h,
    pxPerUnit,
    groundTriangles: geo.triangles,
    bounds: forestBounds(stream),
    tightest: tightestPair(stream),
    read,
    occlusionCoverage: build.field === null ? 0 : atlasCoverage(build.field),
    meshes,
  };
}

// ---------------------------------------------------------------- what the ground was delivered at

/**
 * THE MEDIAN DELIVERED COLOUR of one island's ground, beside the colours its own status is
 * supposed to wear.
 *
 * ⚠ A STATUS VERDICT ALONE CANNOT BE ACTED ON. `status-truth.ts` reports which family a pixel voted
 * for, which is what the demonstration needed — but "0 of 35 read as their own status" is
 * indistinguishable, from the outside, between a palette that stopped working, a reader table that
 * describes a ground nobody draws any more, and a frame this instrument projected wrongly. The
 * median delivered colour and the reader's own expected range separate those: if the delivered
 * green is a plausible green sitting BELOW the ladder's darkest rung, the ground is being darkened
 * past what the reader models, and that is a different problem from the map painting the wrong hue.
 * Per channel MEDIAN rather than mean, because a mean over a shaded island is a colour no pixel is.
 */
export interface GroundSample {
  island: string;
  status: string;
  groundPixels: number;
  median: Rgb255;
  /** The darkest and brightest colour the reader models for {@link status}. */
  expected: { darkest: Rgb255; brightest: Rgb255 };
  /** The nearest status family to {@link median} in the reader's own space. */
  nearest: string;
}

export function groundSample(
  frame: { data: Uint8ClampedArray; width: number; height: number },
  background: Rgb255,
  island: { id: string; status: string; rect: PixelRect },
  table: ReaderTable = fullReaderTable(),
): GroundSample {
  const x0 = Math.max(0, Math.floor(island.rect.x0));
  const y0 = Math.max(0, Math.floor(island.rect.y0));
  const x1 = Math.min(frame.width, Math.ceil(island.rect.x1));
  const y1 = Math.min(frame.height, Math.ceil(island.rect.y1));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * frame.width + x) * 4;
      const px: Rgb255 = { r: frame.data[i] ?? 0, g: frame.data[i + 1] ?? 0, b: frame.data[i + 2] ?? 0 };
      if (isBackgroundPixel(px, background)) continue;
      rs.push(px.r);
      gs.push(px.g);
      bs.push(px.b);
    }
  }
  const mid = (v: number[]): number => {
    if (v.length === 0) return 0;
    v.sort((a, b) => a - b);
    return v[Math.floor((v.length - 1) / 2)]!;
  };
  const median: Rgb255 = { r: mid(rs), g: mid(gs), b: mid(bs) };
  const own = table[island.status] ?? [];
  const luma = (c: Rgb255): number => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  const sorted = [...own].sort((a, b) => luma(a) - luma(b));
  return {
    island: island.id,
    status: island.status,
    groundPixels: rs.length,
    median,
    expected: {
      darkest: sorted[0] ?? { r: 0, g: 0, b: 0 },
      brightest: sorted[sorted.length - 1] ?? { r: 0, g: 0, b: 0 },
    },
    nearest: familyKeyOf(nearestReadStatus(median, table)),
  };
}

// ---------------------------------------------------------------- the readings

export interface RealForestReading {
  picture: RealPictureId;
  elevationDeg: number;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  meshes: number;
  bounds: ForestBounds;
  tightest: TightestPair;
  occlusionCoverage: number;
  screen: { w: number; h: number; wPx: number; hPx: number };
  box: PixelBox;
  landPx: number;
  landShare: number;
  landShareOfBox: number;
  families: number;
  /** Every island's read at this framing, one verdict per arm — keyed by {@link RealArmId} so the
   *  three can be compared step by step and a misread attributed to exactly one of them. */
  status: Readonly<Record<RealArmId, StatusTruthVerdict>>;
  /** Islands whose full rect overlaps the frame at all — the population `status` could speak about. */
  islandsInFrame: number;
  /** The smallest and median island rect area, in frame pixels — how much picture an island gets. */
  islandRectPx: { min: number; median: number };
  /** What the READ island's ground was actually delivered at, per arm, beside the colours the
   *  reader expects for its own status — the line that turns a status verdict into a diagnosis. */
  readGround: Readonly<Record<RealArmId, GroundSample>>;
  /** The same sample over the island's CORE ({@link CORE_RECT_SHRINK} of its rect) rather than the
   *  reader's own 60% rect. The two together say whether a misread is the whole island or its rim. */
  readGroundCore: Readonly<Record<RealArmId, GroundSample>>;
}

export interface RealCostSpec {
  picture: RealPictureId;
  batch: number;
}

export interface RealCostReading extends RealCostSpec {
  gpuMsPerFrame: number | null;
  gpuBatchNs: number | null;
  disjoint: boolean;
  drawCalls: number;
  triangles: number;
  timerQueryAvailable: boolean;
  hidden: boolean;
}

export interface RealForestRunner {
  manifest(): RealForestManifest;
  identity(): RendererIdentity;
  calibration(): LightCalibration;
  kits(): KitFacts[];
  /** The projection facts the two surfaces do NOT share, stated as numbers rather than as prose. */
  projection(): { drawnElevationDeg: number; viewedElevationDeg: number; depthGain: number; matchedPxPerUnit: number };
  extents(): ExtentComparison;
  read(picture: RealPictureId): RealForestReading;
  cost(spec: RealCostSpec): Promise<RealCostReading>;
  snapshot(picture: RealPictureId, armId?: RealArmId): string;
}

export async function fetchJsonFromPage(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`real-forest-scene: ${url} answered ${res.status} — run apps/studio/scripts/export-real-forest.mjs first, and serve the harness from THIS worktree`);
  }
  return res.json();
}

export async function createRealForestRunner(fetchJson: FetchJson = fetchJsonFromPage): Promise<RealForestRunner> {
  const { manifest, arm } = await loadRealForest(fetchJson);
  const fitView = twoDView(manifest, 'fit');
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
  const background: Rgb255 = parseHex(SHIPPED_LIGHTING.background);

  const cache = new Map<string, RealForestScene>();
  const sceneFor = (id: RealPictureId, armId: RealArmId = 'map'): RealForestScene => {
    const k = `${id}|${armId}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildRealForestScene(kit, lit, arm, realPicture(id), fitView.scale, armId);
    cache.set(k, built);
    return built;
  };
  const render = (id: RealPictureId, armId: RealArmId = 'map'): RealForestScene => {
    const s = sceneFor(id, armId);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };
  const pixelMemo = new Map<string, Uint8ClampedArray>();
  const pixels = (id: RealPictureId, armId: RealArmId = 'map'): Uint8ClampedArray => {
    const k = `${id}|${armId}`;
    const hit = pixelMemo.get(k);
    if (hit !== undefined) return hit;
    const s = render(id, armId);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8ClampedArray(buf.buffer);
    pixelMemo.set(k, out);
    return out;
  };
  const frameFor = (id: RealPictureId, armId: RealArmId, w: number, h: number) => ({
    data: pixels(id, armId),
    width: w,
    height: h,
  });

  return {
    manifest: () => manifest,
    identity: () => readIdentity(gl),
    calibration: () => cal,
    kits: () => facts,
    projection: () => ({
      drawnElevationDeg: LAND_CAMERA_ELEVATION_DEG,
      viewedElevationDeg: RENDER_ELEV_DEG,
      depthGain: Math.sin((RENDER_ELEV_DEG * Math.PI) / 180) / groundFlattening(LAND_CAMERA_ELEVATION_DEG),
      matchedPxPerUnit: fitView.scale,
    }),
    extents: () => extentComparison(armStream(arm), syntheticForestStream()),
    read(picture) {
      const s = render(picture);
      const info = renderer.info.render;
      const drawCalls = info.calls;
      const triangles = info.triangles;
      const buf = pixels(picture);
      const census = familyCensus(buf, bg);
      const box = landBox(buf, s.width, s.height, bg);
      const rects = realIslandRects(armStream(arm), s.camera, s.width, s.height);
      const inFrame = rects.filter((r) => rectInFrame(r.fullRect, s.width, s.height));
      const areas = inFrame.map((r) => r.fullAreaPx).sort((a, b) => a - b);
      const sampled = inFrame.find((r) => r.id === READ_ISLAND) ?? inFrame[0] ?? rects[0]!;
      const core = shrinkToCentre(sampled.fullRect, CORE_RECT_SHRINK);
      const screen = screenExtent(cellGroundGeometry(armGroundBuild(arm).input).positions, s.camera);
      return {
        picture,
        elevationDeg: viewElevationDeg(s.camera),
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        groundTriangles: s.groundTriangles,
        meshes: s.meshes,
        bounds: s.bounds,
        tightest: s.tightest,
        occlusionCoverage: s.occlusionCoverage,
        screen: { w: screen.w, h: screen.h, wPx: screen.w * s.pxPerUnit, hPx: screen.h * s.pxPerUnit },
        box,
        landPx: census.land,
        landShare: census.land / (s.width * s.height),
        landShareOfBox: box.pixels === 0 ? 0 : census.land / (box.w * box.h),
        families: census.families,
        status: Object.fromEntries(
          REAL_ARMS.map((a) => [a.id, statusTruthVerdict(frameFor(picture, a.id, s.width, s.height), background, inFrame)]),
        ) as Readonly<Record<RealArmId, StatusTruthVerdict>>,
        islandsInFrame: inFrame.length,
        islandRectPx: {
          min: areas.length === 0 ? 0 : areas[0]!,
          median: areas.length === 0 ? 0 : areas[Math.floor((areas.length - 1) / 2)]!,
        },
        readGround: Object.fromEntries(
          REAL_ARMS.map((a) => [a.id, groundSample(frameFor(picture, a.id, s.width, s.height), background, sampled)]),
        ) as Readonly<Record<RealArmId, GroundSample>>,
        readGroundCore: Object.fromEntries(
          REAL_ARMS.map((a) => [
            a.id,
            groundSample(frameFor(picture, a.id, s.width, s.height), background, { ...sampled, rect: core }),
          ]),
        ) as Readonly<Record<RealArmId, GroundSample>>,
      };
    },
    async cost(spec) {
      const s = sceneFor(spec.picture);
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
    snapshot(picture, armId = 'map') {
      render(picture, armId);
      return canvas.toDataURL('image/png');
    },
  };
}

// ---------------------------------------------------------------- the page

export async function mountRealForest(root: HTMLElement): Promise<void> {
  const runner = await createRealForestRunner();
  window.realForestRunner = runner;
  const id = runner.identity();
  const m = runner.manifest();
  const p = runner.projection();
  const e = runner.extents();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · ` +
    `the map exported ${m.generatedAt} from the studio at ${m.studio.head.slice(0, 8)} (${m.studio.branch}) · ` +
    `${m.arms[0]!.islands} islands · tile ${m.arms[0]!.tile.quota}, hex r ${m.arms[0]!.tile.hexR.toFixed(2)} · ` +
    `land ${LAND_AREA_PER_CAPABILITY} units² per capability · drawn at ${p.drawnElevationDeg}°, viewed at ${p.viewedElevationDeg}° ` +
    `(depth delivers ${p.depthGain.toFixed(2)}× more screen height in 3D) · ` +
    `real forest ${e.real.w.toFixed(0)}×${e.real.d.toFixed(0)} units against the synthetic crowd's ${e.synthetic.w.toFixed(0)}×${e.synthetic.d.toFixed(0)}`;
  root.appendChild(head);
  for (const pic of REAL_FOREST_PICTURES) {
    const r = runner.read(pic.id);
    const h = document.createElement('h2');
    h.textContent = `${pic.id} — ${pic.what}`;
    root.appendChild(h);
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = runner.snapshot(pic.id);
    img.width = 1200;
    fig.appendChild(img);
    const cap = document.createElement('figcaption');
    cap.textContent =
      `${r.pxPerUnit.toFixed(3)} px/unit · land ${(r.landShare * 100).toFixed(2)}% of the frame, ${(r.landShareOfBox * 100).toFixed(1)}% of its box · ` +
      `occlusion ${(r.occlusionCoverage * 100).toFixed(2)}% of the atlas · ` +
      `${r.islandsInFrame} islands in frame, smallest rect ${r.islandRectPx.min.toFixed(0)} px² · ` +
      `status reads own family on ${REAL_ARMS.map((a) => `${a.id} ${r.status[a.id].islands.filter((v) => v.pass).length}/${r.status[a.id].islands.length}`).join(', ')}`;
    fig.appendChild(cap);
    root.appendChild(fig);
  }
}

declare global {
  interface Window {
    realForestRunner?: RealForestRunner;
  }
}
