// shipped-land-scene.ts — THE SHIPPED MAP'S GROUND, FLAT AND RELIEVED, ON ONE SCREEN.
//
// THE INCREMENT: `put-the-treatment-on-the-shipped-map` on `adopt-the-land-into-the-shipped-map-arc`.
// The owner authorised adoption on 2026-08-29 and asked, on this arc specifically, that every
// increment land a comparison he can LOOK at — "variants that differ in exactly ONE thing,
// rendered at both zooms, measured on the same instrument, with the pictures committed beside the
// numbers". This is that page for the first component across: the land's relief.
//
// ⚠⚠ THE TWO ARMS ARE THE SAME FUNCTION CALLED TWICE, and that is what makes this a controlled
// comparison rather than an assertion. Both arms are `src/cell-ground-geometry.ts` over the same
// parcels, the same status colours and the same framing; the ONLY difference is which relief field
// is handed in — `FLAT_GROUND` (the identity, which `cell-ground-geometry.test.ts` proves is the
// old buffer byte for byte) or `landRelief` (what the shipped canvas now passes). Nothing here
// re-implements the ground.
//
// ⚠ THE LIGHT AND THE FRAMING ARE THE SHIPPED ONES, NOT PLAUSIBLE ONES, AND THIS MATTERS MORE
// HERE THAN ANYWHERE ELSE ON THIS ARC. Relief moves no colour and adds no mark: the whole visible
// difference is `dot(n, L)`. Lit from somewhere else, this page would be a picture of a land the
// product does not draw. `frameWorld` / `orthographicZoomFor` are IMPORTED from `src/`, and the
// lighting comes from `SHIPPED_LIGHTING`, which `shipped-baseline.test.ts` parses out of
// `ForestWorldCanvas.tsx` and refuses on drift.
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
import { frameWorld, orthographicZoomFor } from '../src/camera-framing.js';
import { landHeightRange, landRelief } from '../src/land-relief.js';
import { worldTo3D, type InstanceDescriptor } from '../src/world-to-3d.js';
import { islandScene } from './island-fixture.js';
import { SHIPPED_GROUND_COLOUR, SHIPPED_LIGHTING } from './shipped-baseline.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';

/** The two arms. `flat` is the shipped map as it drew on 2026-08-29; `relief` is as it draws now. */
export type LandArm = 'flat' | 'relief';
export const LAND_ARMS: readonly LandArm[] = ['flat', 'relief'];

/** Delivered CSS pixels per ground unit. The same two zooms every other comparison on this arc is
 *  taken at: 2 is roughly the overview a laptop opens on, 8 is the zoomed-in read. On an
 *  orthographic camera `zoom` IS px-per-unit, one number everywhere in the frame — which is the
 *  substance of ADR-0380 D6 fence 4 and the reason these are quotable at all. */
export const LAND_ZOOMS: readonly number[] = [2, 8];

const RELIEF_OF = {
  flat: FLAT_GROUND,
  relief: landRelief,
} satisfies Record<LandArm, GroundRelief>;

/** The parcels of the island the studio actually ships — 164 of them, mean diameter 16.57 ground
 *  units, 191 distinct ring vertices of which 185 belong to more than one parcel. That last figure
 *  is why a CONTINUOUS field is watertight here for free. */
export function shippedParcels(): InstanceDescriptor[] {
  return worldTo3D(islandScene()).filter(
    (d): d is InstanceDescriptor => d.kind === 'cell-ground',
  );
}

/** Status variant → LINEAR colour, through three's own sRGB transfer function — the same route
 *  `ForestWorldCanvas` takes, so the two arms wear the colours the map reports with. */
function linearColourOf(material: string | undefined): LinearRgb {
  const hex =
    SHIPPED_GROUND_COLOUR.get(material ?? 'unknown') ?? SHIPPED_GROUND_COLOUR.get('unknown')!;
  const c = new THREE.Color(hex);
  return { r: c.r, g: c.g, b: c.b };
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
}

/**
 * Build one arm at one zoom.
 *
 * ⚠ THE VIEWPORT IS SIZED FROM THE ISLAND, NOT FIXED, so both arms frame the same world at the
 * same delivered scale and the two PNGs are directly comparable pixel for pixel. The height range
 * is added to the framed extent rather than ignored: relief is an UPRIGHT extent and would
 * otherwise crop against a frame sized for a flat plane — a difference that would show up as the
 * relieved arm being subtly larger, which is a framing artefact and not the thing being compared.
 */
export function buildLandScene(arm: LandArm, pxPerUnit: number): LandScene {
  const cells = shippedParcels();
  const geo = cellGroundGeometry({ cells, resolve: linearColourOf, relief: RELIEF_OF[arm] });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(geo.colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(mesh);
  scene.add(new THREE.AmbientLight(0xffffff, SHIPPED_LIGHTING.ambientIntensity));
  const sun = new THREE.DirectionalLight(0xffffff, SHIPPED_LIGHTING.directionalIntensity);
  const [lx, ly, lz] = SHIPPED_LIGHTING.directionalPosition;
  sun.position.set(lx, ly, lz);
  scene.add(sun);

  const frame = frameWorld(cells);
  // The island's own on-screen extent, plus the relief's upright range so neither arm crops.
  const halfHeight = frame.halfHeight + landHeightRange();
  const height = Math.round(halfHeight * 2 * pxPerUnit);
  const width = Math.round(height * 1.9);

  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 1, 4000);
  camera.position.set(...frame.position);
  camera.lookAt(...frame.target);
  camera.zoom = orthographicZoomFor(halfHeight, height);
  camera.updateProjectionMatrix();

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

export interface LandRunner {
  identity(): RendererIdentity;
  warm(): void;
  snapshot(arm: LandArm, pxPerUnit: number): string;
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

export function createLandRunner(): LandRunner {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER) as { TIME_ELAPSED_EXT: number } | null;
  const identity = readIdentity(gl);

  // ⚠ CACHED PER (arm, zoom). Rebuilding the buffer inside the sweep would time the CPU's
  // triangulation of 164 parcels along with the GPU's frame, which is not the number being asked
  // for and is where the relieved arm would look "more expensive" for no rendering reason.
  const built = new Map<string, LandScene>();
  const sceneFor = (arm: LandArm, pxPerUnit: number): LandScene => {
    const key = `${arm}|${pxPerUnit}`;
    const found = built.get(key);
    if (found) return found;
    const made = buildLandScene(arm, pxPerUnit);
    built.set(key, made);
    return made;
  };

  const render = (arm: LandArm, pxPerUnit: number): LandScene => {
    const s = sceneFor(arm, pxPerUnit);
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

/** Mount the page: both arms at both zooms, side by side, with the runner on `window` for the
 *  driver to reach. */
export function mountShippedLand(root: HTMLElement): void {
  const runner = createLandRunner();
  runner.warm();
  const id = runner.identity();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent = `${id.vendor} — ${id.renderer} · software=${id.software} · timerQuery=${id.timerQuery}`;
  root.appendChild(head);

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
      cap.textContent =
        arm === 'flat'
          ? 'flat — the shipped map before 2026-08-30'
          : `relief — ${s.triangles} triangles, the same as flat`;
      fig.append(img, cap);
      row.appendChild(fig);
    }
    root.appendChild(row);
  }

  window.landRunner = runner;
}

/** The runner the driver reaches for. A DECLARED GLOBAL rather than a cast at the assignment: an
 *  `as unknown as { … }` chain is exactly the discarded-evidence shape the house TypeScript
 *  standard refuses, and it would also let the property's type drift from the interface above. */
declare global {
  // eslint-disable-next-line no-var
  var landRunner: LandRunner;
}
