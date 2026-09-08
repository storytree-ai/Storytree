// shipped-blight-scene.ts — THE UNHEALTHY GROUND, ON THE REAL MAP, WITH ONE ISLAND FORCED.
//
// The comparison page for `paint-the-unhealthy-ground-for-the-read-not-the-richness`: the starkness
// ladder of `src/land-blight.ts` rendered through the SHIPPED pipeline on the REAL 35-island forest
// (`export-real-forest.mjs`'s committed scene), with exactly one island's status forced to
// `unhealthy` — because the published map carries none.
//
// ⚠⚠ A FORCED-TOKEN FIXTURE, AND EVERY CAPTION SAYS SO. The public snapshot (2026-08-28) is 21
// `healthy` + 14 `proposed`: zero unhealthy, zero unknown, zero mapped. So this row cannot be judged
// on the shipped map at all, and no picture here may be read as a live judgement. What IS live is
// everything else in the frame — the layout, the island sizes, the neighbours' statuses, the props,
// the occlusion field — so the forced island is judged against the map's OWN green and gold rather
// than against a synthetic crowd of copies.
//
// ⚠⚠ AND IT IS JUDGED AT THE REAL MAP'S ISLAND SIZE, WHICH IS THE POINT. On 2026-09-08 the first
// render of the real forest found that the six terrains' separability does NOT survive the size
// ADR-0520 draws islands at: 1 of 35 islands read as their own status family, 31 of 35 with the
// slope-gated rock removed (`docs/research/chapter2-real-forest-2026-09-08/` §4). A read that only
// survives on the big harness fixture is not a read, so this page renders no fixture island at all.
// The `one` picture is the SAME forced island at the read zoom — a bigger picture of a real island,
// never a bigger island.
//
// ⚠ THE CONTROL IS THE FLAT TOKEN, and it has no shipped counterpart. The usual "pixels moved
// against what ships" arm compares a painted token to the same token as the map draws it; here the
// map draws no unhealthy island, so `flat` is the same forced fixture wearing the flat charcoal —
// which is what the map WOULD draw — and the sheet says exactly that rather than implying a
// before/after on live ground.
//
// ⚠ THE `nocracks` ARM IS THE ATTRIBUTION ARM. The ladder's rungs move the burn and the crack
// strength together, because that is the one question the owner is picking between (how dead does
// an unhealthy island look). `nocracks` is the shipped rung's burn with the crack layer switched
// off, so the sheet can say what the crack network — the second signal channel this row rests on —
// is actually worth. `flat` → `nocracks` → the shipped rung is three steps each moving one thing.

import * as THREE from 'three';

import {
  SHIPPED_BLIGHT_MIX,
  SHIPPED_BLIGHT_RUNG,
  SHIPPED_GRASS,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  SHIPPED_WHEAT,
  BLIGHT_GATE_ROWS,
  buildGroundMaterial,
  shippedGroundBuild,
  type GroundLayerExtras,
  type ShippedGroundBuild,
} from '../src/ForestWorldCanvas.js';
import {
  BLIGHT_CRACK_LIFT,
  BLIGHT_OCTAVES,
  BLIGHT_RUNGS,
  BLIGHT_STATUS_GATE,
  BLIGHT_TOKEN,
  blightCrackColour,
  blightRung,
  type BlightPalette,
} from '../src/land-blight.js';
import type { GroundBlightLayer } from '../src/banded-ground-material.js';
import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE } from '../src/banded-ground-material.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { calibrateLights, intensitiesFor, type CalibratedIntensities } from '../src/light-calibration.js';
import { parseHex, type Rgb255 } from '../src/shade-ladder.js';
import { configureExactColour } from '../src/exact-colour.js';
import { KIT_PROP_INDIRECT_FRACTION } from '../src/prop-lighting.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { KIT_ASSET_URL, kitMeshes, loadKit, setKitPropLighting, type LoadedKit } from './kit-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { orientedCamera } from './shipped-crowd-scene.js';
import {
  READ_ISLAND,
  armCasters,
  armPlacements,
  armStream,
  fitCamera,
  islandFootprints,
  viewElevationDeg,
  type FetchJson,
  type SpacingArm,
} from './shipped-spacing-scene.js';
import {
  CORE_RECT_SHRINK,
  fetchJsonFromPage,
  groundSample,
  loadRealForest,
  realIslandRects,
  rectInFrame,
  type GroundSample,
  type RealIslandRect,
} from './real-forest-scene.js';
import {
  fullReaderTable,
  isBackgroundPixel,
  nearestReadStatus,
  familyKeyOf,
  statusTruthVerdict,
  type StatusTruthVerdict,
} from './status-truth.js';

// ---------------------------------------------------------------- which island is forced

/**
 * THE ISLAND FORCED TO `unhealthy` — the same island `real-forest-scene.ts`'s read zoom centres
 * on, borrowed rather than re-picked so the two pages talk about the same island. It is a real
 * island of the real map: real capability count, real size, real neighbours.
 */
export const FORCED_ISLAND = READ_ISLAND;

/** The status it is forced to — the gate's own single entry, so a rename of the token cannot
 *  leave this page forcing a status the gate no longer names. */
export const FORCED_STATUS = BLIGHT_STATUS_GATE[0]!;

/** THE REAL MAP'S STREAM WITH ONE ISLAND'S STATUS REPLACED. Every other descriptor is untouched:
 *  the geometry, the neighbours, the props and the trails are the map's own.
 *
 *  ⚠ REFUSED IF THE ISLAND IS NOT THERE, rather than returning the map unchanged. A silently
 *  unforced stream would render 35 ordinary islands and every arm would be identical — a page that
 *  looks like it works and compares nothing. */
export function forcedStream(arm: SpacingArm): InstanceDescriptor[] {
  const stream = armStream(arm);
  let hits = 0;
  const out = stream.map((d): InstanceDescriptor => {
    if (d.kind !== 'cell-ground' || d.island !== FORCED_ISLAND) return d;
    hits += 1;
    return { ...d, material: FORCED_STATUS };
  });
  if (hits === 0) throw new Error(`shipped-blight-scene: the map has no island "${FORCED_ISLAND}" to force`);
  return out;
}

const buildMemo = new Map<string, ShippedGroundBuild>();

/** THE SHIPPED GROUND over the forced stream, memoised — the field is the same on every arm, so
 *  the mount-time cost is paid once and six arms read the memo. The casters and the dressing are
 *  the map's own (`armCasters` / `armPlacements` over the UNFORCED stream): forcing a status must
 *  not move what stands on the island, or the arms would differ in two things. */
export function forcedGroundBuild(arm: SpacingArm): ShippedGroundBuild {
  const hit = buildMemo.get(arm.record.id);
  if (hit !== undefined) return hit;
  const stream = forcedStream(arm);
  const built = shippedGroundBuild(
    stream.filter((d) => d.kind === 'cell-ground'),
    armCasters(arm),
    stream.filter((d) => d.kind === 'trail-strip'),
  );
  buildMemo.set(arm.record.id, built);
  return built;
}

// ---------------------------------------------------------------- the arms

export interface BlightArmSpec {
  id: string;
  /** `null` is the flat token — the map as it would draw an unhealthy island today. */
  palette: BlightPalette | null;
  what: string;
}

export const CONTROL_ARM = 'flat';
export const NOCRACKS_ARM = 'nocracks';

export const BLIGHT_ARMS: readonly BlightArmSpec[] = [
  {
    id: CONTROL_ARM,
    palette: null,
    what: 'the flat charcoal token — what the map would draw for an unhealthy island today',
  },
  ...BLIGHT_RUNGS.map((r): BlightArmSpec => ({ id: r.id, palette: r.palette, what: r.what })),
  {
    id: NOCRACKS_ARM,
    palette: { burn: SHIPPED_BLIGHT_RUNG.palette.burn, crackMix: 0 },
    what: `the shipped rung's burn (${SHIPPED_BLIGHT_RUNG.palette.burn.toFixed(2)}) with the crack network OFF — what the second signal channel is worth`,
  },
];

/** The ladder's rungs alone, for a contact sheet that shows the pick and not the controls. */
export const LADDER_ARMS: readonly string[] = BLIGHT_RUNGS.map((r) => r.id);

export function armSpec(id: string): BlightArmSpec {
  const found = BLIGHT_ARMS.find((a) => a.id === id);
  if (found === undefined) throw new Error(`shipped-blight-scene: no arm "${id}"`);
  return found;
}

/** THE ARM'S MATERIAL LAYER — `null` on the control, so `buildGroundMaterial` emits the shader it
 *  emitted before the blight existed and the control is the map rather than a reconstruction. */
export function armBlight(id: string): GroundBlightLayer | null {
  const spec = armSpec(id);
  if (spec.palette === null) return null;
  return { mix: SHIPPED_BLIGHT_MIX, rows: BLIGHT_GATE_ROWS, palette: spec.palette };
}

export function armCaption(id: string): string {
  const spec = armSpec(id);
  if (spec.palette === null) return `${id} — ${spec.what}`;
  return `${id} burn ${spec.palette.burn.toFixed(2)} cracks ${spec.palette.crackMix.toFixed(2)} — ${spec.what}`;
}

/** The arm rendered immediately before `id`, or `null` for the first — the pairwise step a
 *  visible-delta reading is taken across. */
export function neighbourArm(id: string): string | null {
  const i = BLIGHT_ARMS.findIndex((a) => a.id === id);
  if (i <= 0) return null;
  return BLIGHT_ARMS[i - 1]!.id;
}

// ---------------------------------------------------------------- the pictures

export type BlightPictureId = 'forest' | 'one';

export interface BlightPicture {
  id: BlightPictureId;
  what: string;
}

/** The read zoom, borrowed from the spacing/real-forest pages rather than re-picked. */
export const BLIGHT_READ_ZOOM = 8;

export const BLIGHT_PICTURES: readonly BlightPicture[] = [
  {
    id: 'forest',
    what: 'the real 35-island forest, fitted, with one island forced unhealthy — the acceptance picture: can it be found without being told where',
  },
  {
    id: 'one',
    what: `the same forced island (${FORCED_ISLAND}) at ${BLIGHT_READ_ZOOM} px per ground unit — a bigger picture of a real island, never a bigger island`,
  },
];

export function picture(id: BlightPictureId): BlightPicture {
  const found = BLIGHT_PICTURES.find((p) => p.id === id);
  if (found === undefined) throw new Error(`shipped-blight-scene: no picture "${id}"`);
  return found;
}

// ---------------------------------------------------------------- the scene

export interface BlightScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  arm: string;
  blight: GroundBlightLayer | null;
  groundTriangles: number;
  meshes: number;
  /** The forced stream this picture was built from — the rects are projected from it AFTER the
   *  render, never here. */
  stream: readonly InstanceDescriptor[];
}

/**
 * ⚠⚠ THE RECTS ARE PROJECTED AFTER THE RENDER, AND THE ORDER IS LOAD-BEARING.
 * `realIslandRects` projects through `camera.matrixWorldInverse`, and THREE fills that in during
 * `renderer.render` — `camera.updateMatrixWorld()` does not, it only updates `matrixWorld`. Asking
 * for the rects before the first render therefore projects through a STALE inverse and hands the
 * status reader rectangles that have nothing to do with the frame. It does not throw and it does
 * not look wrong: this page reported 22 of 35 islands reading as their own status where the same
 * frame, projected correctly, reports 1 — a plausible number, in the reassuring direction, from an
 * instrument that was sampling the wrong pixels.
 */
export function rectsFor(built: BlightScene, shrink?: number): RealIslandRect[] {
  return realIslandRects(built.stream, built.camera, built.width, built.height, shrink);
}

function lightScene(scene: THREE.Scene, lit: CalibratedIntensities): void {
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.AmbientLight(0xffffff, lit.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, lit.directional);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);
}

/** ONE ARM'S PICTURE of the real forest, through the shipped pipeline and this arm's blight. */
export function buildBlightScene(
  kit: LoadedKit,
  lit: CalibratedIntensities,
  arm: SpacingArm,
  armId: string,
  pic: BlightPictureId,
): BlightScene {
  const build = forcedGroundBuild(arm);
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-blight-scene: the map drew no ground');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  if (geo.atlasOrigins.length > 0) {
    geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));
  }
  const wearField = build.wear();
  // ⚠ BY STATEMENT, and absent means ABSENT under `exactOptionalPropertyTypes` — the shipped
  // extras, so a pixel between two arms is the blight's and nothing else's.
  const extras: GroundLayerExtras = { detail: SHIPPED_LAYERS.detail, rock: SHIPPED_LAYERS.rock };
  if (wearField !== null) extras.wear = { field: wearField, mix: SHIPPED_LAYERS.wearMix };
  const blight = armBlight(armId);
  const { material } = buildGroundMaterial(
    build.field,
    SHIPPED_GRASS,
    build.shore(),
    SHIPPED_SAND_MIX,
    extras,
    undefined,
    SHIPPED_WHEAT,
    blight,
  );
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  let meshes = 0;
  for (const mesh of kitMeshes(kit, armPlacements(arm))) {
    scene.add(mesh);
    meshes += 1;
  }
  lightScene(scene, lit);

  const stream = forcedStream(arm);
  const fit = fitCamera(geo.positions);
  let camera: THREE.OrthographicCamera;
  let pxPerUnit: number;
  if (pic === 'one') {
    const footprints = islandFootprints(stream);
    const read = footprints.find((f) => f.id === FORCED_ISLAND);
    if (read === undefined) throw new Error(`shipped-blight-scene: no footprint for "${FORCED_ISLAND}"`);
    pxPerUnit = BLIGHT_READ_ZOOM;
    camera = orientedCamera(read.centre, pxPerUnit);
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
    arm: armId,
    blight,
    groundTriangles: geo.triangles,
    meshes,
    stream,
  };
}

// ---------------------------------------------------------------- what the ground delivered

/**
 * HOW FAR THE FORCED ISLAND SITS FROM ITS NEIGHBOURS, in delivered bytes — the number this whole
 * row is about, and the one no status verdict can give.
 *
 * `status-truth.ts` answers "which family does this island's ground vote for", which is a reading
 * of a MODEL. What a viewer actually does is compare an island with the ones beside it, so this
 * reports the forced island's median delivered colour against the median of every island wearing
 * each OTHER status in the same frame — the honest form of "does it jump out".
 *
 * ⚠ MAX-CHANNEL, NOT EUCLIDEAN. ADR-0490 D6's bar is stated as a per-channel 20/255, and every
 * other reading on this arc is taken that way; a Euclidean distance would be a second ruler.
 */
export interface NeighbourSeparation {
  /** The status compared against — `healthy`, `proposed`, and so on. */
  status: string;
  islands: number;
  median: Rgb255;
  /** The largest per-channel difference from the forced island's median. */
  maxChannel: number;
}

export interface BlightReading {
  arm: string;
  blight: GroundBlightLayer | null;
  picture: BlightPictureId;
  elevationDeg: number;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  meshes: number;
  /** The forced island's own delivered sample — the median colour beside the reader's range. */
  forced: GroundSample;
  /** The same over the island's CORE, so a misread can be attributed to the rim or not. */
  forcedCore: GroundSample;
  /** How far the forced island sits from each other status present in the frame. */
  separation: readonly NeighbourSeparation[];
  /**
   * HOW FAR THE ISLAND SITS FROM THE SEA, read two ways because one of them cannot fence anything.
   *
   * ⚠ THE DARKEST SINGLE PIXEL IS DOMINATED BY THE DEEPEST SHADOW RUNG, NOT BY THE PAINT, and the
   * FLAT token already fails a 20/255 reading of it — measured 2026-09-08, the unforced charcoal
   * delivers a darkest ground luma 6.1 above the sea at the fitted forest. So a fence on that
   * number would have refused the token the map already draws, which makes it a report and not a
   * bar. What it IS good for is direction: a rung whose darkest pixel goes BELOW the sea is
   * painting ground the water swallows, and `scorched` does exactly that.
   *
   * ⚠ THE MEDIAN IS THE ONE THAT ANSWERS "DOES THE ISLAND STILL READ AS A SHAPE". That is the
   * failure `a-metric-scored-in-isolation-rewards-invisibility` records (PR #1792, the cliff whose
   * bottom half merged into the water while its own metric improved), and it is the reading the
   * fence is taken on.
   */
  sea: { darkestLuma: number; medianLuma: number; backgroundLuma: number; margin: number; medianMargin: number };
  /**
   * HOW MANY OF THE FORCED ISLAND'S GROUND PIXELS MOVED past ADR-0490 D6's 20/255 against the
   * CONTROL arm, and what share of the island that is.
   *
   * ⚠ THE MEDIAN CANNOT SEE A CRACK NETWORK, WHICH IS WHY THIS EXISTS. Cracks are thin lines: they
   * move a minority of pixels a long way, so a median moves 3 to 5 units while the island's
   * appearance changes completely. Measured on the first run of this page, `nocracks` → the shipped
   * rung moved the median 3/255 on the fitted forest — a number that would have read as "the crack
   * layer does nothing" and been wrong about the only thing this row rests on.
   */
  moved: { pixels: number; islandPixels: number; share: number };
  /**
   * THE SAME READING TAKEN AGAINST THE `nocracks` ARM — what the CRACK NETWORK alone moves.
   *
   * ⚠ IT IS NOT `moved` MINUS ANYTHING. Both shares are measured against the flat token, so
   * subtracting them is not the crack layer's contribution and can come out NEGATIVE: the burn
   * alone moves 84.1% of the island past the bar and the whole treatment 75.6%, because a pale
   * crack lands a pixel back NEAR the flat token it was moved away from. The crack layer's own
   * contribution has to be measured against the burn, which is what this is.
   */
  movedVsBurn: { pixels: number; islandPixels: number; share: number };
  /** Every island's status verdict in this frame — the map-wide reading, reported not fenced. */
  verdict: StatusTruthVerdict;
  /** How many islands in frame wear each status — so a separation over one island says so. */
  statusCounts: Record<string, number>;
}

const luma = (c: Rgb255): number => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;

/** The median colour of the ground inside a set of rects, background excluded. */
export function medianOfRects(
  frame: { data: Uint8ClampedArray; width: number; height: number },
  background: Rgb255,
  rects: readonly RealIslandRect[],
): { median: Rgb255; pixels: number } {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.rect.x0));
    const y0 = Math.max(0, Math.floor(r.rect.y0));
    const x1 = Math.min(frame.width, Math.ceil(r.rect.x1));
    const y1 = Math.min(frame.height, Math.ceil(r.rect.y1));
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
  }
  const mid = (v: number[]): number => {
    if (v.length === 0) return 0;
    v.sort((a, b) => a - b);
    return v[Math.floor((v.length - 1) / 2)]!;
  };
  return { median: { r: mid(rs), g: mid(gs), b: mid(bs) }, pixels: rs.length };
}

/** The darkest ground LUMA inside one island's rect — the number the sea fence is read against. */
export function darkestGroundLuma(
  frame: { data: Uint8ClampedArray; width: number; height: number },
  background: Rgb255,
  rect: RealIslandRect,
): number {
  let darkest = Infinity;
  const x0 = Math.max(0, Math.floor(rect.rect.x0));
  const y0 = Math.max(0, Math.floor(rect.rect.y0));
  const x1 = Math.min(frame.width, Math.ceil(rect.rect.x1));
  const y1 = Math.min(frame.height, Math.ceil(rect.rect.y1));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * frame.width + x) * 4;
      const px: Rgb255 = { r: frame.data[i] ?? 0, g: frame.data[i + 1] ?? 0, b: frame.data[i + 2] ?? 0 };
      if (isBackgroundPixel(px, background)) continue;
      darkest = Math.min(darkest, luma(px));
    }
  }
  return Number.isFinite(darkest) ? darkest : 0;
}

/** HOW MANY PIXELS IN ONE RECT MOVED past `bar` on any channel between two frames of the same
 *  scene — ADR-0490 D6's own reading, over the island's ground only. */
export function movedPixels(
  a: { data: Uint8ClampedArray; width: number; height: number },
  b: { data: Uint8ClampedArray; width: number; height: number },
  background: Rgb255,
  rect: RealIslandRect,
  bar = 20,
): { pixels: number; islandPixels: number; share: number } {
  const x0 = Math.max(0, Math.floor(rect.rect.x0));
  const y0 = Math.max(0, Math.floor(rect.rect.y0));
  const x1 = Math.min(a.width, Math.ceil(rect.rect.x1));
  const y1 = Math.min(a.height, Math.ceil(rect.rect.y1));
  let moved = 0;
  let island = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * a.width + x) * 4;
      const pa: Rgb255 = { r: a.data[i] ?? 0, g: a.data[i + 1] ?? 0, b: a.data[i + 2] ?? 0 };
      const pb: Rgb255 = { r: b.data[i] ?? 0, g: b.data[i + 1] ?? 0, b: b.data[i + 2] ?? 0 };
      // A pixel counts as the island's if EITHER frame has ground there — an arm that darkened a
      // rim pixel into the background's own colour must not simply drop out of the denominator.
      if (isBackgroundPixel(pa, background) && isBackgroundPixel(pb, background)) continue;
      island += 1;
      if (maxChannelGap(pa, pb) > bar) moved += 1;
    }
  }
  return { pixels: moved, islandPixels: island, share: island === 0 ? 0 : moved / island };
}

/** The largest per-channel gap between two delivered colours. */
export function maxChannelGap(a: Rgb255, b: Rgb255): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

/** THE PAIRWISE READ, in numbers: the forced island against every other status in the frame. */
export function neighbourSeparations(
  frame: { data: Uint8ClampedArray; width: number; height: number },
  background: Rgb255,
  rects: readonly RealIslandRect[],
  forcedMedian: Rgb255,
): NeighbourSeparation[] {
  const byStatus = new Map<string, RealIslandRect[]>();
  for (const r of rects) {
    if (r.id === FORCED_ISLAND) continue;
    const list = byStatus.get(r.status) ?? [];
    list.push(r);
    byStatus.set(r.status, list);
  }
  const out: NeighbourSeparation[] = [];
  for (const [status, list] of [...byStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const { median } = medianOfRects(frame, background, list);
    out.push({ status, islands: list.length, median, maxChannel: maxChannelGap(median, forcedMedian) });
  }
  return out;
}

// ---------------------------------------------------------------- the palette report

/** What the treatment's own colours came out as — printed on the sheet rather than quoted from
 *  the module, so a reader checks the delivered value and not the intent. */
export interface BlightPaletteReport {
  token: string;
  tokenRgb: Rgb255;
  crackLift: number;
  crackRgb: Rgb255;
  /** The reader table's nearest family to the crack colour — a bone the reader calls `unknown`
   *  would be a second report on one island, and the sheet has to say so either way. */
  crackNearest: string;
  octaves: number;
  /** Which layers the unhealthy ground wears and which it drops, derived from the material's own
   *  gating rather than restated: the blight gate is not promoted into `grassGate`. */
  wears: readonly string[];
  drops: readonly string[];
}

export function blightPaletteReport(): BlightPaletteReport {
  const crack = blightCrackColour();
  return {
    token: BLIGHT_TOKEN,
    tokenRgb: parseHex(BLIGHT_TOKEN),
    crackLift: BLIGHT_CRACK_LIFT,
    crackRgb: crack,
    crackNearest: familyKeyOf(nearestReadStatus(crack, fullReaderTable())),
    octaves: BLIGHT_OCTAVES,
    wears: ['1 base paint (re-palettised, burned)', 'the crack network (authored, not in the recipe)', '5 detail normal', '6 grain'],
    drops: ['2 shore sand', '3 worn path', '4 slope rock'],
  };
}

// ---------------------------------------------------------------- the runner

export interface BlightRunner {
  arms: readonly string[];
  pictures: readonly BlightPictureId[];
  caption: (arm: string) => string;
  neighbour: (arm: string) => string | null;
  palette: () => BlightPaletteReport;
  layout: () => { id: string; islands: number; head: string; generatedAt: string; forced: string; statusMix: Record<string, number> };
  render: (arm: string, pic: BlightPictureId) => Promise<{ reading: BlightReading; png: string }>;
}

/** The status mix of the FORCED stream — what the sheet's caption has to say the frame contains. */
export function forcedStatusMix(arm: SpacingArm): Record<string, number> {
  const byIsland = new Map<string, string>();
  for (const d of forcedStream(arm)) {
    if (d.kind !== 'cell-ground' || d.island === undefined) continue;
    byIsland.set(d.island, d.material ?? 'unknown');
  }
  const out: Record<string, number> = {};
  for (const status of byIsland.values()) out[status] = (out[status] ?? 0) + 1;
  return out;
}

export async function createBlightRunner(fetchJson: FetchJson = fetchJsonFromPage): Promise<BlightRunner> {
  const { manifest, arm } = await loadRealForest(fetchJson);
  const kit = await loadKit(KIT_ASSET_URL);
  setKitPropLighting(kit, KIT_PROP_INDIRECT_FRACTION);
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  const lit = intensitiesFor(calibrateLights(renderer));
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const background = parseHex(SHIPPED_LIGHTING.background);
  const table = fullReaderTable();

  // The CONTROL arm's frame per picture, so every arm can be read against what the map would draw.
  // Rendered on demand and kept, rather than re-rendered per arm: it is the same frame every time.
  const controlFrames = new Map<BlightPictureId, { data: Uint8ClampedArray; width: number; height: number }>();
  const burnFrames = new Map<BlightPictureId, { data: Uint8ClampedArray; width: number; height: number }>();

  /**
   * ⚠⚠ RENDERED TWICE, AND THE SECOND FRAME IS THE ONE MEASURED. This is not caution: a
   * FIRST render of a freshly built scene can be photographed before its textures have finished
   * reaching the GPU, and the frame it hands back is darker than the one anybody ever sees.
   *
   * Measured 2026-09-08 on `real-forest-scene.ts`, which reads its first render: for the island
   * `agent` in the fitted forest it reported the ground voting 12 `healthy` / 110 `unhealthy`,
   * where the SAME 147 pixels of the SAME frame — re-classified outside the browser, from that
   * page's own committed PNG, with that page's own weighted metric — vote 67 / 76. The arm
   * carrying kit meshes was the one thrown; the arm with nothing standing on it reproduced to
   * within a few pixels. So the headline "1 of 35 islands read as their own status" is partly an
   * artefact of when the frame was taken, and a status verdict is exactly the kind of reading that
   * cannot notice: it comes back a plausible number, in the alarming direction.
   *
   * This page will not inherit that. `docs/research/chapter2-unhealthy-ground-2026-09-08/README.md`
   * carries the reproduction; repairing the other page belongs to the arc that owns it.
   */
  const frameOf = (armId: string, pic: BlightPictureId) => {
    const built = buildBlightScene(kit, lit, arm, armId, pic);
    renderer.setSize(built.width, built.height, false);
    renderer.render(built.scene, built.camera);
    renderer.info.reset();
    renderer.render(built.scene, built.camera);
    // ⚠ READ BACK THROUGH `gl.readPixels`, NOT A 2D CONTEXT — the canvas is a WebGL one and has no
    // 2d context to ask. Rows come back bottom-up, which is the same convention `toPixelRect` maps
    // its y into, so the rects and the buffer agree (`real-forest-scene.ts` does exactly this).
    const buf = new Uint8Array(built.width * built.height * 4);
    gl.readPixels(0, 0, built.width, built.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return { built, frame: { data: new Uint8ClampedArray(buf.buffer), width: built.width, height: built.height } };
  };

  const controlFrame = (pic: BlightPictureId) => {
    const hit = controlFrames.get(pic);
    if (hit !== undefined) return hit;
    const { frame } = frameOf(CONTROL_ARM, pic);
    controlFrames.set(pic, frame);
    return frame;
  };

  const burnFrame = (pic: BlightPictureId) => {
    const hit = burnFrames.get(pic);
    if (hit !== undefined) return hit;
    const { frame } = frameOf(NOCRACKS_ARM, pic);
    burnFrames.set(pic, frame);
    return frame;
  };

  const render = async (armId: string, pic: BlightPictureId) => {
    const control = controlFrame(pic);
    const burn = burnFrame(pic);
    const { built, frame } = frameOf(armId, pic);
    // ⚠ AFTER THE RENDER — see `rectsFor`. Before it, the camera's inverse is stale.
    const inFrame = rectsFor(built).filter((r) => rectInFrame(r.fullRect, built.width, built.height));
    const forcedRect = inFrame.find((r) => r.id === FORCED_ISLAND);
    if (forcedRect === undefined) throw new Error(`shipped-blight-scene: "${FORCED_ISLAND}" is not in the ${pic} frame`);
    const coreRect = rectsFor(built, CORE_RECT_SHRINK).find((r) => r.id === FORCED_ISLAND);
    if (coreRect === undefined) throw new Error(`shipped-blight-scene: no core rect for "${FORCED_ISLAND}"`);
    const forced = groundSample(frame, background, forcedRect, table);
    const forcedCore = groundSample(frame, background, coreRect, table);
    const darkestLuma = darkestGroundLuma(frame, background, forcedRect);
    const backgroundLuma = luma(background);
    const medianLuma = luma(forced.median);
    const moved = movedPixels(frame, control, background, forcedRect);
    const movedVsBurn = movedPixels(frame, burn, background, forcedRect);
    const statusCounts: Record<string, number> = {};
    for (const r of inFrame) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    const reading: BlightReading = {
      arm: armId,
      blight: built.blight,
      picture: pic,
      elevationDeg: viewElevationDeg(built.camera),
      pxPerUnit: built.pxPerUnit,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      groundTriangles: built.groundTriangles,
      meshes: built.meshes,
      forced,
      forcedCore,
      separation: neighbourSeparations(frame, background, inFrame, forced.median),
      sea: {
        darkestLuma,
        medianLuma,
        backgroundLuma,
        margin: darkestLuma - backgroundLuma,
        medianMargin: medianLuma - backgroundLuma,
      },
      moved,
      movedVsBurn,
      verdict: statusTruthVerdict(frame, background, inFrame),
      statusCounts,
    };
    return { reading, png: canvas.toDataURL('image/png') };
  };

  return {
    arms: BLIGHT_ARMS.map((a) => a.id),
    pictures: BLIGHT_PICTURES.map((p) => p.id),
    caption: armCaption,
    neighbour: neighbourArm,
    palette: blightPaletteReport,
    layout: () => ({
      id: arm.record.id,
      islands: arm.record.islands,
      head: manifest.studio.head,
      generatedAt: manifest.generatedAt,
      forced: FORCED_ISLAND,
      statusMix: forcedStatusMix(arm),
    }),
    render,
  };
}

// ---------------------------------------------------------------- the page

declare global {
  interface Window {
    blightRunner?: BlightRunner;
  }
}

export async function mountShippedBlight(root: HTMLElement): Promise<void> {
  const runner = await createBlightRunner();
  // ⚠ EXPOSED BEFORE ANY FIGURE IS DRAWN, so the driver can start measuring without waiting for a
  // page that draws twelve frames for a human to look at.
  window.blightRunner = runner;
  const layout = runner.layout();
  const pal = runner.palette();
  const head = document.createElement('div');
  head.innerHTML =
    `<h1>The unhealthy ground, painted for the read</h1>` +
    `<p>The REAL map (${layout.islands} islands, studio head <code>${layout.head}</code>, exported ${layout.generatedAt}) ` +
    `with <b>one island forced unhealthy</b>: <code>${layout.forced}</code>. ` +
    `<b>A forced-token fixture</b> — the published map carries no unhealthy island, so nothing here is a live judgement. ` +
    `Frame status mix: ${JSON.stringify(layout.statusMix)}.</p>` +
    `<p>Token <code>${pal.token}</code> = rgb(${pal.tokenRgb.r}, ${pal.tokenRgb.g}, ${pal.tokenRgb.b}); ` +
    `cracks = the token lifted ${pal.crackLift}x = rgb(${pal.crackRgb.r}, ${pal.crackRgb.g}, ${pal.crackRgb.b}) ` +
    `(the reader calls that colour <code>${pal.crackNearest}</code>). ` +
    `Wears: ${pal.wears.join(' · ')}. Drops: ${pal.drops.join(' · ')}. Crack octaves: ${pal.octaves}.</p>`;
  root.append(head);
  for (const pic of runner.pictures) {
    const section = document.createElement('section');
    section.innerHTML = `<h2>${picture(pic).what}</h2>`;
    root.append(section);
    for (const armId of runner.arms) {
      const { reading, png } = await runner.render(armId, pic);
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = png;
      img.width = 760;
      const cap = document.createElement('figcaption');
      cap.textContent =
        `${runner.caption(armId)} — forced island median rgb(${reading.forced.median.r}, ${reading.forced.median.g}, ${reading.forced.median.b}), ` +
        `sea margin ${reading.sea.margin.toFixed(1)}, ` +
        reading.separation.map((s) => `vs ${s.status} ${s.maxChannel}`).join(' · ');
      fig.append(img, cap);
      section.append(fig);
    }
  }

}

/** THE SHIPPED RUNG, re-exported so the measure driver can name it without importing the canvas's
 *  `.tsx` — which a node loader will not resolve through the `.js` specifier convention. */
export const SHIPPED_RUNG = SHIPPED_BLIGHT_RUNG;

export { blightRung };
