// shipped-coast-scene.ts — THE THREE HONEST SHAPES OF A COAST CLIP, COSTED AGAINST EACH OTHER AND
// AGAINST THE MAP THAT HAS NO COAST AT ALL.
//
// THE INCREMENT: the coast clip on `adopt-the-land-into-the-shipped-map-arc` — the fifth of the
// approved treatment's six components to cross, and the first one whose subject is the island's
// OUTLINE rather than its surface.
//
// WHAT WAS ESTABLISHED BEFORE THIS PAGE, by reading the source rather than by inference:
// `substrate.ts:344` says the relaxed mesh keeps "the existing hex-silhouette" coastline with its
// outer vertices pinned, so the shipped 3D ground ends in 120° hex corners. `smoothCoast()` — the
// outset, story-seeded, Chaikin-rounded coast the approved treatment asks for — has existed in
// `packages/forest-world/src/coast.ts` all along and is called by the studio's 2D map ONLY. So the
// component is not missing; it is unimported, and `src/coast-clip.ts` is the import.
//
// ⚠⚠ THE FORK THIS PAGE EXISTS TO SETTLE. `smoothCoast` returns FOUR TIMES the vertices it is
// handed (52 rim vertices → a 208-point curve), so there is no 1:1 displacement to reach for and
// the three answers trade differently:
//
//   `outset`    — the outset only. Bays and headlands, every hex corner kept, zero new triangles.
//   `project`   — every rim vertex moved onto the curve. The rounded shape at 52-vertex
//                 resolution: corners CUT rather than curved, still zero new triangles.
//   `subdivide` — `project` plus the curve's own points along each rim edge, so the boundary IS
//                 the curve. The only arm that costs triangles.
//
// AND `none` IS THE CONTROL AND THE DENOMINATOR. The map exactly as it draws today.
//
// ⚠⚠ THE DENOMINATOR IS THE POINT, AND THIS ARC HAS ALREADY PAID FOR FORGETTING IT ONCE. A coast
// is a thin annulus around an island, so "0.4% of the frame changed" reads as nothing at all
// beside two pictures that are obviously different shapes. Differencing an arm against `none`
// counts the COAST's own pixels — the beach it added plus the corners it cut — which is the
// denominator the question actually has. {@link CoastRunner.coastPixels} is that number and every
// percentage on this page is quoted against it as well as against the frame.
//
// ⚠ AND THE BEACH'S DELIVERED WIDTH IN PIXELS IS PRINTED BESIDE EVERY COMPARISON, for the sibling
// reason: at the `fit` zoom a 7-unit beach is under three pixels, so an arm that changed the whole
// silhouette can come back nearly byte-identical there. A null result has to be readable as a null
// result rather than as agreement.
//
// ⚠ THE PAGE ADOPTS NOTHING. `harness/` only — it produces EVIDENCE about the `src/` module it
// imports. The adoption is a separate edit in the same landing.

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
  COAST_MODES,
  COAST_OUTSET,
  clipToCoast,
  coastCapping,
  isSimpleRing,
  type CoastMode,
} from '../src/coast-clip.js';
import { groundBounds } from '../src/ground-casters.js';
import { LAND_RELIEF_AMPLITUDE, landRelief } from '../src/land-relief.js';
import { SHADOW_GRES } from '../src/land-shadow.js';
import { SHADOW_ATLAS_MAX, buildAtlasOcclusion, atlasOriginResolver, islandGroundBounds, packShadowAtlas } from '../src/shadow-atlas.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import {
  CROWD_ZOOMS,
  FIT_ZOOM,
  crowdCasters,
  crowdCells,
  crowdPxPerUnit,
  crowdSize,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
  type CrowdZoom,
} from './shipped-crowd-scene.js';
import { GROUND_TOKENS, groundRowOf, linearColourOf } from './shipped-land-scene.js';

/** The arm a picture is taken of — {@link CoastMode} under this page's own name, so the arms and
 *  the module's modes cannot drift apart. */
export type CoastArm = CoastMode;

/** The arm every other row is read against: the shipped map's own angular hex silhouette. */
export const REFERENCE_ARM: CoastArm = 'none';

/** The arms this page COMPARES — the control is deliberately not one of them. */
export const COAST_ARMS: readonly CoastArm[] = COAST_MODES.filter((m) => m !== REFERENCE_ARM);

/** Every arm, control first. Derived from {@link COAST_MODES} so a mode added to the module cannot
 *  be left silently out of the comparison. */
export const ALL_COAST_ARMS: readonly CoastArm[] = [REFERENCE_ARM, ...COAST_ARMS];

/** What each arm adds, as the caption under its own picture — beside the arm rather than in the
 *  HTML, so an arm cannot be added without a reader being told what it is. */
export const COAST_ARM_CAPTION: Record<CoastArm, string> = {
  none: 'the shipped map today — the raw hex-union silhouette (CONTROL)',
  outset: '+ the story-seeded beach, every hex corner kept',
  project: '+ each rim vertex moved onto the smoothed curve (corners CUT)',
  subdivide: '+ the curve’s own points along each rim edge (the boundary IS the curve)',
};

/** One island, and the thirty-five-island forest. The coast is a per-island silhouette, so ONE is
 *  where it is read — but the forest is where it stops being decorative: thirty-five copies of one
 *  fixture island wear thirty-five DIFFERENT coasts, because the wave is seeded on the island id. */
export const COAST_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];

/** The two zooms every comparison on this arc is taken at. */
export const COAST_ZOOMS: readonly number[] = [...CROWD_ZOOMS];

/** Those two plus the fitted overview, which is a CONTEXT picture and never a timing: `fit`
 *  delivers a different px/unit per scene. */
export const COAST_PICTURE_ZOOMS: readonly CrowdZoom[] = [...COAST_ZOOMS, FIT_ZOOM];

/** How wide the beach is, in ground units, at its authored value — the number multiplied by a
 *  zoom to say how many PIXELS of shore a reader is being shown. */
export const BEACH_GROUND_WIDTH = COAST_OUTSET;

/** What one arm costs and what it changed, in numbers a picture cannot carry. */
export interface CoastPlan {
  /** Triangles in the merged ground buffer. */
  triangles: number;
  /** Ring vertices across every parcel — what `subdivide` spends and the other two do not. */
  ringVertices: number;
  /** Bytes of vertex attribute the merged buffer uploads (position + normal + row + atlas origin). */
  attributeBytes: number;
  /** The island's summed parcel area, in square ground units. The beach is land the map did not
   *  draw before, so this is what the coast ADDED rather than a cost. */
  groundArea: number;
  /** Parcels whose ring crosses itself. A folded parcel draws its capability's colour over ground
   *  that belongs to another one, so this is a MISREPORT count and not a quality score — it must be
   *  zero on every arm, and the driver refuses a run where it is not. */
  foldedParcels: number;
  /** Rim vertices the fold cap bound, out of how many there are. */
  capBound: number;
  capRim: number;
  /** The least beach any rim vertex was left with — 1 when the cap never bound. */
  capLeast: number;
}

/** Bytes per vertex the merged ground buffer uploads: position (3) + normal (3) + status row (1) +
 *  atlas origin (2), all `Float32`. Written as the sum rather than as 36 so a channel added to the
 *  buffer is a change to this line rather than a silently stale constant. */
const GROUND_FLOATS_PER_VERTEX = 3 + 3 + 1 + 2;

export function coastPlan(cells: readonly InstanceDescriptor[], mode: CoastMode): CoastPlan {
  const clipped = clipToCoast(cells, mode);
  const geo = cellGroundGeometry({
    cells: clipped,
    resolve: linearColourOf,
    index: groundRowOf,
    relief: landRelief,
  });
  let ringVertices = 0;
  let groundArea = 0;
  let foldedParcels = 0;
  for (const c of clipped) {
    const ring = (c.points ?? []).map((p) => ({ x: p.x, z: p.z }));
    ringVertices += ring.length;
    if (ring.length >= 3 && !isSimpleRing(ring)) foldedParcels += 1;
    let shoelace = 0;
    for (let i = 0; i < ring.length; i += 1) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      shoelace += p.x * q.z - q.x * p.z;
    }
    groundArea += Math.abs(shoelace) / 2;
  }
  const cap = coastCapping(cells, mode);
  return {
    triangles: geo.triangles,
    ringVertices,
    attributeBytes: geo.triangles * 3 * GROUND_FLOATS_PER_VERTEX * 4,
    groundArea,
    foldedParcels,
    capBound: cap.bound,
    capRim: cap.rim,
    capLeast: cap.least,
  };
}

export interface CoastLandScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  islands: number;
  plan: CoastPlan;
}

/**
 * Build one arm of one crowd at one zoom.
 *
 * ⚠ EVERY ARM SHARES THE LADDER, THE GRAIN, THE RELIEF, THE OCCLUSION ATLAS, THE LIGHT AND THE
 * CAMERA — the whole shipped pipeline as it stands after the shadow crossing. The only thing that
 * moves is which coast the parcels were clipped to, so a pixel difference between two arms is
 * attributable to the coast and to nothing else on the page.
 *
 * ⚠ THE OCCLUSION ATLAS IS PACKED OVER THE CLIPPED PARCELS, not over the originals, and that is
 * the same ordering the canvas uses. Packing it over the pre-clip bounds would leave the new beach
 * outside every island's tile, so the shore would read the atlas's edge texel and wear whatever
 * shadow happened to sit there.
 */
export function buildCoastScene(arm: CoastArm, size: CrowdSize, zoom: CrowdZoom): CoastLandScene {
  const cells = clipToCoast(crowdCells(size), arm);
  const casters = crowdCasters(size);
  if (groundBounds(cells) === null) throw new Error('shipped-coast-scene: the crowd bounds nothing');

  const geo = cellGroundGeometry({
    cells,
    resolve: linearColourOf,
    index: groundRowOf,
    relief: landRelief,
    atlasOrigin: atlasOriginResolver(
      packShadowAtlas(islandGroundBounds(cells), SHADOW_GRES, SHADOW_ATLAS_MAX),
    ),
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
  geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));

  const opts: BandedGroundMaterialOptions = {
    tokens: GROUND_TOKENS,
    grain: 'normal',
    shadowAtlas: groundAtlasTexture(
      buildAtlasOcclusion({
        cells,
        relief: LAND_RELIEF_AMPLITUDE,
        casters,
        gres: SHADOW_GRES,
        max: SHADOW_ATLAS_MAX,
      }),
    ),
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.Mesh(geometry, createBandedGroundMaterial(opts)));
  // The banded material is unlit — it computes its own lambert against the authored
  // LIGHT_DIRECTION — so these reach nothing. They are here because the scene the product builds
  // has them, and a scene that dropped them would differ from it in two things.
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
    plan: coastPlan(crowdCells(size), arm),
  };
}

export interface CoastReading {
  arm: CoastArm;
  size: CrowdSizeId;
  pxPerUnit: number;
  width: number;
  height: number;
  islands: number;
  triangles: number;
  ringVertices: number;
  attributeBytes: number;
  groundArea: number;
  foldedParcels: number;
  capBound: number;
  capRim: number;
  capLeast: number;
  /** Draw calls the renderer actually submitted. One, on every arm — the coast changes where the
   *  ground ENDS, never how many meshes carry it, which is what keeps
   *  `the forest's ground is ONE draw call` true through this crossing. */
  drawCalls: number;
  trianglesSubmitted: number;
  /** Median GPU nanoseconds for one render, or null if the timer never resolved. */
  gpuNs: number | null;
  batch: number;
}

export interface CoastRunner {
  identity(): RendererIdentity;
  warm(): void;
  geometry(arm: CoastArm, size: CrowdSizeId, zoom: CrowdZoom): Omit<CoastReading, 'gpuNs' | 'batch'>;
  /** Percentage of the FRAME differing between two arms at the same size and zoom. */
  changedPct(a: CoastArm, b: CoastArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  /** Pixels differing between two arms — the count {@link changedPct} reports as a percentage. */
  changedPixels(a: CoastArm, b: CoastArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  /**
   * How many pixels this arm's COAST covers — differenced against {@link REFERENCE_ARM}.
   *
   * ⚠⚠ IT IS THE DENOMINATOR EVERY OTHER PIXEL NUMBER ON THIS PAGE NEEDS. A coast is a thin
   * annulus around an island, so a figure quoted against the whole frame reads as "nothing
   * changed" beside two pictures that are obviously different shapes.
   */
  coastPixels(arm: CoastArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  snapshot(arm: CoastArm, size: CrowdSizeId, zoom: CrowdZoom): string;
  time(arm: CoastArm, size: CrowdSizeId, zoom: CrowdZoom, batch: number): Promise<CoastReading>;
  dispose(): void;
}

const GPU_TIMER = 'EXT_disjoint_timer_query_webgl2';

/** Wait for one timer query's result, or give up. The same eleven lines as the pages next door,
 *  and a copy for the reason they give: the shared helper sits beside fixtures this page does not
 *  use. */
async function elapsedNs(gl: WebGL2RenderingContext, query: WebGLQuery): Promise<number | null> {
  for (let i = 0; i < 600; i += 1) {
    if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true) {
      return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  return null;
}

export function createCoastRunner(): CoastRunner {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER) as { TIME_ELAPSED_EXT: number } | null;
  const identity = readIdentity(gl);

  // ⚠ CACHED PER (arm, size, zoom). The clip re-chains every island's rim and re-runs the fold
  // cap; rebuilding it inside the sweep would time that arithmetic as though it were a frame, and
  // would report the arm that does the most CPU work as the slowest to DRAW.
  const built = new Map<string, CoastLandScene>();
  const sceneFor = (arm: CoastArm, size: CrowdSizeId, zoom: CrowdZoom): CoastLandScene => {
    const key = `${arm}|${size}|${String(zoom)}`;
    const found = built.get(key);
    if (found) return found;
    const made = buildCoastScene(arm, crowdSize(size), zoom);
    built.set(key, made);
    return made;
  };

  const render = (arm: CoastArm, size: CrowdSizeId, zoom: CrowdZoom): CoastLandScene => {
    const s = sceneFor(arm, size, zoom);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };

  const readFrame = (s: CoastLandScene): Uint8Array => {
    const px = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };

  const diffCount = (first: Uint8Array, second: Uint8Array): number => {
    let differing = 0;
    for (let i = 0; i < first.length; i += 4) {
      if (
        first[i] !== second[i] ||
        first[i + 1] !== second[i + 1] ||
        first[i + 2] !== second[i + 2]
      ) {
        differing += 1;
      }
    }
    return differing;
  };

  const shape = (
    s: CoastLandScene,
    arm: CoastArm,
    size: CrowdSizeId,
  ): Omit<CoastReading, 'gpuNs' | 'batch'> => ({
    arm,
    size,
    pxPerUnit: s.pxPerUnit,
    width: s.width,
    height: s.height,
    islands: s.islands,
    triangles: s.plan.triangles,
    ringVertices: s.plan.ringVertices,
    attributeBytes: s.plan.attributeBytes,
    groundArea: s.plan.groundArea,
    foldedParcels: s.plan.foldedParcels,
    capBound: s.plan.capBound,
    capRim: s.plan.capRim,
    capLeast: s.plan.capLeast,
    drawCalls: renderer.info.render.calls,
    trianglesSubmitted: renderer.info.render.triangles,
  });

  return {
    identity: () => identity,

    // THE COLD START IS PAID ONCE, OUTSIDE THE SWEEP. The first render of any configuration
    // compiles shaders and uploads buffers, and leaving that inside the timing is what made an
    // earlier instrument on this arc report a heavier scene as faster than a lighter one.
    warm() {
      for (const size of COAST_SIZES) {
        for (const zoom of COAST_PICTURE_ZOOMS) {
          for (const arm of ALL_COAST_ARMS) render(arm, size.id, zoom);
        }
      }
      gl.finish();
    },

    geometry(arm, size, zoom) {
      return shape(render(arm, size, zoom), arm, size);
    },

    changedPct(a, b, size, zoom) {
      const first = readFrame(render(a, size, zoom));
      const second = readFrame(render(b, size, zoom));
      return (diffCount(first, second) / (first.length / 4)) * 100;
    },

    changedPixels(a, b, size, zoom) {
      return diffCount(readFrame(render(a, size, zoom)), readFrame(render(b, size, zoom)));
    },

    coastPixels(arm, size, zoom) {
      return diffCount(
        readFrame(render(arm, size, zoom)),
        readFrame(render(REFERENCE_ARM, size, zoom)),
      );
    },

    snapshot(arm, size, zoom) {
      render(arm, size, zoom);
      return canvas.toDataURL('image/png');
    },

    async time(arm, size, zoom, batch) {
      const s = render(arm, size, zoom);
      const base = shape(s, arm, size);
      if (!timer) return { ...base, gpuNs: null, batch };
      const query = gl.createQuery();
      if (!query) return { ...base, gpuNs: null, batch };
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      for (let i = 0; i < batch; i += 1) renderer.render(s.scene, s.camera);
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      const ns = await elapsedNs(gl, query);
      gl.deleteQuery(query);
      return { ...base, gpuNs: ns === null ? null : ns / batch, batch };
    },

    dispose() {
      renderer.dispose();
    },
  };
}

/** Mount the page: the forest fitted to a screen for context, then every arm at every zoom, with
 *  the runner on `window` for the driver to reach. */
export function mountShippedCoast(root: HTMLElement): void {
  const runner = createCoastRunner();
  runner.warm();
  const id = runner.identity();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · timerQuery=${id.timerQuery}`;
  root.appendChild(head);

  const overview = document.createElement('h2');
  overview.textContent =
    'the whole forest, fitted to a laptop screen — thirty-five islands, thirty-five DIFFERENT coasts';
  root.appendChild(overview);
  const overviewRow = document.createElement('div');
  overviewRow.className = 'row';
  for (const arm of ALL_COAST_ARMS) {
    const s = buildCoastScene(arm, crowdSize('forest'), FIT_ZOOM);
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = runner.snapshot(arm, 'forest', FIT_ZOOM);
    img.width = 620;
    const cap = document.createElement('figcaption');
    cap.textContent =
      `${arm} · ${s.pxPerUnit.toFixed(2)} px/unit · beach ≈ ` +
      `${(BEACH_GROUND_WIDTH * s.pxPerUnit).toFixed(1)} px — ${COAST_ARM_CAPTION[arm]}`;
    fig.append(img, cap);
    overviewRow.appendChild(fig);
  }
  root.appendChild(overviewRow);

  for (const zoom of COAST_ZOOMS) {
    for (const size of COAST_SIZES) {
      const h2 = document.createElement('h2');
      h2.textContent =
        `${zoom} delivered px per ground unit — ${size.what} · ` +
        `the beach is ≈ ${(BEACH_GROUND_WIDTH * zoom).toFixed(0)} px wide here`;
      root.appendChild(h2);
      const row = document.createElement('div');
      row.className = 'row';
      for (const arm of ALL_COAST_ARMS) {
        const s = buildCoastScene(arm, size, zoom);
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = runner.snapshot(arm, size.id, zoom);
        img.width = 620;
        const cap = document.createElement('figcaption');
        cap.textContent =
          `${arm} · ${s.plan.triangles} triangles · ${s.plan.ringVertices} ring vertices · ` +
          `${s.plan.groundArea.toFixed(0)} sq units of land · ` +
          `cap bound ${s.plan.capBound}/${s.plan.capRim} (least ${s.plan.capLeast.toFixed(2)}) · ` +
          `${s.plan.foldedParcels} folded parcels`;
        fig.append(img, cap);
        row.appendChild(fig);
      }
      root.appendChild(row);
    }
  }

  window.coastRunner = runner;
}

/** The runner the driver reaches for. A DECLARED GLOBAL rather than a cast at the assignment: an
 *  `as unknown as { … }` chain is the discarded-evidence shape the house TypeScript standard
 *  refuses, and it would let the property's type drift from the interface above. */
declare global {
  // eslint-disable-next-line no-var
  var coastRunner: CoastRunner;
}
