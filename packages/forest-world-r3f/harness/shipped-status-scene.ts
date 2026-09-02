// shipped-status-scene.ts — THE 35-ISLAND FOREST, ON THE SHIPPED GROUND STACK, READ BACK.
//
// The comparison surface for `demonstrate-the-map-still-reports-truth` on
// `adopt-the-land-into-the-shipped-map-arc`. ADR-0475 D2 is the frame: "THE LAND IS UNIFORM WITHIN
// AN ISLAND, AND CARRIES THE STORY'S OWN STATE … island-level state reads off the ground at the
// opening view." So this page renders the real fixture forest (`harness/crowd-layout.ts`'s
// `CROWD_POPULATION` — 21 healthy / 8 proposed / 2 building / 2 mapped / 1 unknown / 1 unhealthy)
// through the SAME composition the map draws, at both of the arc's own zooms, and hands every
// island's ground pixels to `harness/status-truth.ts` to read back.
//
// ⚠⚠ THE GROUND IS BUILT THE ONE WAY THE MAP BUILDS IT — `shippedGroundBuild` +
// `buildGroundMaterial`, imported from `src/ForestWorldCanvas.js` rather than reconstructed. This
// is the same structural guard `harness/shipped-skirt-scene.ts` and `harness/shipped-grass-scene.ts`
// already stand on (`comparison-baseline-moves-under-the-page`): a page that assembled its own
// `CellGroundGeometryInput` would have a control arm that quietly stops being the map, and there is
// nothing here that needs a custom token table — the whole point is to read the map's OWN five
// colours over six states (ADR-0462 D1/D2), not a widened one.
//
// ⚠ THE PER-ISLAND PIXEL RECT IS A PROJECTION, NOT A GUESS. Every island on this page is a rigid
// translation of the SAME one-island fixture (`crowdCells`/`crowdIslands`), so its view-space
// footprint is the fixture's own view-space footprint (`viewSpaceExtent`, the same projection
// `shipped-crowd-scene.ts`'s private `shippedIslandExtent` performs) shifted by the island's world
// offset carried through the camera's own affine transform (`viewSpaceShift`) — no per-vertex
// re-projection of the merged mesh is needed, because the shift is exact for a rigid copy. The
// projected rect can OVERLAP a neighbour (islands sit close together at this crowd's density), so
// every rect handed to the reader is SHRUNK to its middle 60% ({@link STATUS_RECT_SHRINK}) before
// any pixel votes — the corners, where a neighbour or the sea is likeliest to intrude, are given up
// rather than risking a false foreign vote.

import * as THREE from 'three';

import {
  GROUND_ATLAS_ATTRIBUTE,
  GROUND_STATUS_ATTRIBUTE,
} from '../src/banded-ground-material.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import {
  SHIPPED_GRASS,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  buildGroundMaterial,
  shippedGroundBuild,
  type GroundLayerExtras,
  type ShippedGroundBuild,
} from '../src/ForestWorldCanvas.js';
import { landRelief } from '../src/land-relief.js';
import { parseHex, type Rgb255 } from '../src/shade-ladder.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { linearColourOf, shippedParcels } from './shipped-land-scene.js';
import {
  CROWD_ZOOMS,
  crowdCasters,
  crowdCells,
  crowdIslandId,
  crowdIslands,
  crowdPxPerUnit,
  crowdSize,
  crowdStrips,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
} from './shipped-crowd-scene.js';
import {
  fullReaderTable,
  statusPairSeparation,
  statusTruthVerdict,
  type Frame,
  type IslandSpec,
  type PairSeparation,
  type PixelRect,
  type StatusTruthVerdict,
} from './status-truth.js';

export { CROWD_ZOOMS };

/** How much of an island's PROJECTED rect survives after it is shrunk toward its own centre, to
 *  keep a neighbour's ground out of the vote. Documented rather than tuned: 60% keeps most of the
 *  island's own top face while giving up a corner-width margin on every side, which is generous
 *  next to the crowd's own jitter slack (`crowdLayout`'s `slackX`/`slackZ`). */
export const STATUS_RECT_SHRINK = 0.6;

const groundBuildCache = new Map<CrowdSizeId, ShippedGroundBuild>();

/** THE SHIPPED GROUND, BUILT ONCE — mirrors `harness/shipped-skirt-scene.ts`'s `skirtGroundBuild`:
 *  memoised per crowd size because the occlusion field is the expensive half of the build and does
 *  not depend on anything this page varies (there is nothing to vary here at all). */
function statusGroundBuild(size: CrowdSize): ShippedGroundBuild {
  const hit = groundBuildCache.get(size.id);
  if (hit !== undefined) return hit;
  const built = shippedGroundBuild(crowdCells(size), crowdCasters(size), crowdStrips(size));
  groundBuildCache.set(size.id, built);
  return built;
}

/**
 * THE SHIPPED GROUND MESH — `shippedGroundBuild` + `buildGroundMaterial`, key for key what
 * `ForestWorldCanvas.tsx`'s `CellGround` builds (see its `useMemo` body): the same geometry
 * attributes, the same grass/sand/wear/rock/detail extras at the same shipped strengths, no
 * substitutions. This page needs no custom token table — it reads the map's own five colours.
 */
function buildStatusGroundMesh(size: CrowdSize): THREE.Mesh {
  const build = statusGroundBuild(size);
  const geo = cellGroundGeometry(build.input);

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
  const { material } = buildGroundMaterial(build.field, SHIPPED_GRASS, build.shore(), SHIPPED_SAND_MIX, extras);

  return new THREE.Mesh(geometry, material);
}

let sceneMemo: THREE.Scene | undefined;

/** The whole scene, built ONCE and reused across every camera/zoom this page renders — only the
 *  camera moves between frames, exactly as it does on the shipped canvas. */
export function statusScene(size: CrowdSize = crowdSize('forest')): THREE.Scene {
  if (sceneMemo !== undefined) return sceneMemo;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(buildStatusGroundMesh(size));
  scene.add(new THREE.AmbientLight(0xffffff, SHIPPED_LIGHTING.ambientIntensity));
  const sun = new THREE.DirectionalLight(0xffffff, SHIPPED_LIGHTING.directionalIntensity);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);
  sceneMemo = scene;
  return scene;
}

/** The frame's clear colour as `status-truth.ts` needs it (RGB255) — the scene's own background,
 *  never re-authored here. */
export function statusBackground(): Rgb255 {
  return parseHex(SHIPPED_LIGHTING.background);
}

// ---------------------------------------------------------------------------------------------
// THE PROJECTION — one island's screen rect, from its world offset alone
// ---------------------------------------------------------------------------------------------

interface ViewExtent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The fixture island's own VIEW-SPACE footprint under `camera` — the same projection
 *  `shipped-crowd-scene.ts`'s private `shippedIslandExtent` performs, computed against `camera`
 *  directly (rather than a fixed reference camera) so it composes exactly with
 *  {@link viewSpaceShift} below, which reads the SAME camera's `matrixWorldInverse`. */
function viewSpaceExtent(camera: THREE.OrthographicCamera): ViewExtent {
  const cells = shippedParcels();
  const geo = cellGroundGeometry({ cells, resolve: linearColourOf, relief: landRelief });
  const v = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < geo.positions.length; i += 3) {
    v.set(geo.positions[i]!, geo.positions[i + 1]!, geo.positions[i + 2]!).applyMatrix4(camera.matrixWorldInverse);
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * HOW FAR A WORLD-SPACE OFFSET `(ox, oz)` MOVES A POINT IN VIEW SPACE, under `camera` — the
 * matrix's LINEAR part alone, with the translation cancelled by differencing against the origin:
 * `M(d) - M(0) = A·d` for any affine `M`. Every island on this page is a pure translation of the
 * same fixture (`crowdCells` adds the offset to every cell's `transform`, no rotation), so this is
 * exact — there is no need to re-project the merged mesh's own vertices per island.
 */
function viewSpaceShift(camera: THREE.OrthographicCamera, ox: number, oz: number) {
  const zero = new THREE.Vector3(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
  const shifted = new THREE.Vector3(ox, 0, oz).applyMatrix4(camera.matrixWorldInverse);
  return { dx: shifted.x - zero.x, dy: shifted.y - zero.y };
}

/** View-space extent → frame pixel rect, row 0 at the BOTTOM (matching `gl.readPixels`'s own
 *  convention, which `status-truth.ts`'s `Frame` is documented to expect). */
function toPixelRect(camera: THREE.OrthographicCamera, extent: ViewExtent, width: number, height: number): PixelRect {
  const toPxX = (x: number) => ((x - camera.left) / (camera.right - camera.left)) * width;
  const toPxY = (y: number) => ((y - camera.bottom) / (camera.top - camera.bottom)) * height;
  return { x0: toPxX(extent.minX), x1: toPxX(extent.maxX), y0: toPxY(extent.minY), y1: toPxY(extent.maxY) };
}

function shrinkToCentre(rect: PixelRect, factor: number): PixelRect {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const hw = ((rect.x1 - rect.x0) / 2) * factor;
  const hh = ((rect.y1 - rect.y0) / 2) * factor;
  return { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
}

/** Does `rect` overlap the frame at all — the test for "is this island in the picture", asked of
 *  the FULL (un-shrunk) rect so a corner-clipped island still counts as visible. */
export function rectInFrame(rect: PixelRect, width: number, height: number): boolean {
  return rect.x1 > 0 && rect.x0 < width && rect.y1 > 0 && rect.y0 < height;
}

/** One island as this page projects it: the reader's spec (shrunk rect) plus the full rect the
 *  in-frame test reads. */
export interface StatusIsland extends IslandSpec {
  fullRect: PixelRect;
}

/** Every island in `size`, projected through `camera` into `width` x `height` frame pixels. */
export function statusIslands(
  camera: THREE.OrthographicCamera,
  width: number,
  height: number,
  size: CrowdSize,
  shrink: number = STATUS_RECT_SHRINK,
): StatusIsland[] {
  const base = viewSpaceExtent(camera);
  return crowdIslands(size).map((island) => {
    const shift = viewSpaceShift(camera, island.offset.x, island.offset.z);
    const extent: ViewExtent = {
      minX: base.minX + shift.dx,
      maxX: base.maxX + shift.dx,
      minY: base.minY + shift.dy,
      maxY: base.maxY + shift.dy,
    };
    const fullRect = toPixelRect(camera, extent, width, height);
    return {
      id: crowdIslandId(island.index),
      status: island.status,
      rect: shrinkToCentre(fullRect, shrink),
      fullRect,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// THE RUNNER
// ---------------------------------------------------------------------------------------------

export interface StatusFrameResult {
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  /** Every island the layout places, in projected order — including ones off this frame. */
  islands: StatusIsland[];
  /** The subset whose FULL rect overlaps this frame. */
  inFrame: StatusIsland[];
}

export interface StatusIslandOffset {
  id: string;
  status: string;
  x: number;
  z: number;
}

export interface StatusRunner {
  identity(): RendererIdentity;
  /** Render one frame at `zoom` px/ground-unit, centred at `centre` (world/ground coordinates —
   *  the same argument `orientedCamera` itself takes). Defaults to the forest's own origin. */
  frame(zoom: number, centre?: { x: number; z: number }): StatusFrameResult;
  /** {@link frame}, read back through `status-truth.ts` — verdicts for the IN-FRAME islands only.
   *  An island never in the picture is not "judged" by that picture; feeding it in would report a
   *  manufactured EMPTY failure that has nothing to do with the ground. */
  verdict(zoom: number, centre?: { x: number; z: number }): StatusTruthVerdict;
  snapshot(zoom: number, centre?: { x: number; z: number }): string;
  /** The pair-separation table — independent of any rendered frame. */
  pairs(): PairSeparation[];
  /** Every island's id, status and world offset — what a driver needs to pick "one island of
   *  status X" and hand its offset back as an extra frame's centre. */
  islandOffsets(): StatusIslandOffset[];
  dispose(): void;
}

export function createStatusRunner(size: CrowdSize = crowdSize('forest')): StatusRunner {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const scene = statusScene(size);
  const background = statusBackground();
  const table = fullReaderTable();

  const render = (zoom: number, centre: { x: number; z: number }): THREE.OrthographicCamera => {
    const camera = orientedCamera(centre, crowdPxPerUnit(size, zoom));
    renderer.setSize(CROWD_VIEWPORT.w, CROWD_VIEWPORT.h, false);
    renderer.render(scene, camera);
    return camera;
  };

  const frameOf = (zoom: number, centre: { x: number; z: number }): StatusFrameResult => {
    const camera = render(zoom, centre);
    const width = CROWD_VIEWPORT.w;
    const height = CROWD_VIEWPORT.h;
    const buf = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const islands = statusIslands(camera, width, height, size);
    const inFrame = islands.filter((isl) => rectInFrame(isl.fullRect, width, height));
    return { camera, width, height, pixels: new Uint8ClampedArray(buf.buffer), islands, inFrame };
  };

  return {
    identity: () => readIdentity(gl),
    frame: (zoom, centre = { x: 0, z: 0 }) => frameOf(zoom, centre),
    verdict(zoom, centre = { x: 0, z: 0 }) {
      const f = frameOf(zoom, centre);
      const frame: Frame = { data: f.pixels, width: f.width, height: f.height };
      const specs: IslandSpec[] = f.inFrame.map(({ id, status, rect }) => ({ id, status, rect }));
      return statusTruthVerdict(frame, background, specs, table);
    },
    snapshot(zoom, centre = { x: 0, z: 0 }) {
      render(zoom, centre);
      return canvas.toDataURL('image/png');
    },
    pairs: () => statusPairSeparation(table),
    islandOffsets: () =>
      crowdIslands(size).map((isl) => ({
        id: crowdIslandId(isl.index),
        status: isl.status,
        x: isl.offset.x,
        z: isl.offset.z,
      })),
    dispose() {
      renderer.dispose();
    },
  };
}

declare global {
  interface Window {
    statusRunner?: StatusRunner;
  }
}

/** Build the page: the renderer identity, the reference paragraphs, one section per zoom (with an
 *  extra recentred frame for any status the default centre never sees), and the pair-separation
 *  table. */
export async function mountShippedStatus(root: HTMLElement): Promise<void> {
  const runner = createStatusRunner();
  const id = runner.identity();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent = `${id.vendor} — ${id.renderer} · software=${id.software}`;
  root.appendChild(head);

  const verdictTable = (v: StatusTruthVerdict): string => {
    const rows = v.islands
      .map(
        (isl) =>
          `<tr class="${isl.pass ? 'pass' : 'fail'}"><td>${isl.id}</td><td>${isl.status}</td>` +
          `<td>${isl.empty ? '(empty)' : isl.readFamily}</td>` +
          `<td>${(isl.ownShare * 100).toFixed(1)}%</td><td>${(isl.foreignShare * 100).toFixed(1)}%</td>` +
          `<td>${isl.empty ? 'EMPTY' : isl.pass ? 'PASS' : 'FAIL'}</td></tr>`,
      )
      .join('\n');
    return (
      '<table class="verdict"><thead><tr><th>island</th><th>status</th><th>read family</th>' +
      '<th>own%</th><th>foreign%</th><th>verdict</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>'
    );
  };

  for (const zoom of CROWD_ZOOMS) {
    const h2 = document.createElement('h2');
    h2.textContent = `${zoom} px per ground unit`;
    root.appendChild(h2);

    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = runner.snapshot(zoom);
    img.width = 900;
    const v = runner.verdict(zoom);
    const cap = document.createElement('figcaption');
    const passCount = v.islands.filter((isl) => isl.pass).length;
    cap.textContent = `${v.islands.length} islands in frame · ${passCount} PASS · ${v.islands.length - passCount} FAIL/EMPTY`;
    fig.append(img, cap);
    root.appendChild(fig);
    const table = document.createElement('div');
    table.innerHTML = verdictTable(v);
    root.appendChild(table);

    if (zoom !== 8) continue;
    // ⚠ THE OFF-CENTRE STATUSES — at 8 px/unit the frame holds only what is near the forest's own
    // centroid, and this crowd's scatter does not guarantee every one of the six statuses lands
    // there. Any status absent from the default-centred frame gets its OWN 8 px/unit frame,
    // centred on one of its islands, so no status goes unjudged at this zoom.
    const covered = new Set(v.islands.map((isl) => isl.status));
    const offsets = runner.islandOffsets();
    const missing = [...new Set(offsets.map((o) => o.status))].filter((s) => !covered.has(s));
    for (const status of missing.sort()) {
      const target = offsets.find((o) => o.status === status);
      if (target === undefined) continue;
      const h3 = document.createElement('h3');
      h3.textContent = `8 px/unit, recentred on ${target.id} — the only ${status} island near it was off the default frame`;
      root.appendChild(h3);
      const fig2 = document.createElement('figure');
      const img2 = document.createElement('img');
      img2.src = runner.snapshot(8, { x: target.x, z: target.z });
      img2.width = 900;
      const v2 = runner.verdict(8, { x: target.x, z: target.z });
      const cap2 = document.createElement('figcaption');
      const passCount2 = v2.islands.filter((isl) => isl.pass).length;
      cap2.textContent = `${v2.islands.length} islands in frame · ${passCount2} PASS · ${v2.islands.length - passCount2} FAIL/EMPTY`;
      fig2.append(img2, cap2);
      root.appendChild(fig2);
      const table2 = document.createElement('div');
      table2.innerHTML = verdictTable(v2);
      root.appendChild(table2);
    }
  }

  const pairsHead = document.createElement('h2');
  pairsHead.textContent = 'the pair-separation table';
  root.appendChild(pairsHead);
  const pairs = runner.pairs();
  const pairRows = pairs
    .map((p) => `<tr class="${p.minDistance === 0 ? 'zero' : ''}"><td>${p.a}</td><td>${p.b}</td><td>${p.minDistance.toFixed(2)}</td></tr>`)
    .join('\n');
  const pairsEl = document.createElement('div');
  pairsEl.innerHTML =
    '<table class="verdict"><thead><tr><th>status a</th><th>status b</th><th>min distance</th></tr></thead><tbody>' +
    pairRows +
    '</tbody></table>';
  root.appendChild(pairsEl);
  const pairsNote = document.createElement('p');
  pairsNote.textContent =
    'proposed/building at 0 is the measured identity ADR-0462 D1/D2 decided — one authored token under two ' +
    'keys — never a defect this page is reporting; every other pair above 0 is what the map can still tell apart.';
  root.appendChild(pairsNote);

  window.statusRunner = runner;
}
