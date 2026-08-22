// hardware-floor.ts — the ADR-0380 D2 measurement, on a scene that is actually being drawn.
//
// WHY THIS EXISTS, AND WHY THE EXISTING HUD IS NOT ENOUGH. The live-render experiment
// (PR #1417) left question 2 — does a live-rendered land clear the D2 hardware floor —
// deliberately unanswered, because headless Chromium on this box rasterises through
// ANGLE-on-SwiftShader and a software frame time is not a hardware verdict. It shipped a
// `HardwareHud` so the owner could open the page on the real machine and have the number
// answer itself.
//
// That remedy has a defect this module exists to correct. `compare.html` renders each panel
// ONCE and blits it to a 2D canvas; after the settled signal nothing is drawn again. So the
// HUD's ninety `requestAnimationFrame` deltas sample an IDLE page, and an idle page presents
// at the display's cadence on any hardware whatsoever — the same ~16.7 ms the README
// correctly refused to quote from the headless run, arrived at by a different road. A reader
// who sees `Adreno X1-85` beside `p50 16.7 ms` would reasonably conclude the floor is
// cleared, on evidence that contains no scene. `hardware-floor.mjs` proves that with a
// blank-page control rather than asserting it.
//
// WHAT THIS MEASURES INSTEAD. A vegetated land drawn CONTINUOUSLY at a requested plant count
// and buffer size, reporting two numbers that fail in different ways:
//
//   - `rafP50` / `rafP95` — presentation cadence. VSYNC-CAPPED, so it can only ever show
//     that 60 Hz was MISSED; it can never show headroom. Useful as a pass/fail on the floor.
//   - `gpuMsPerFrame` — wall time for a batch of renders closed by `gl.finish()`, divided by
//     the batch size. NOT vsync-capped, so this is the one that shows how much room is left.
//     `finish()` blocks until the GPU has actually retired the work, which is the whole point:
//     without it the CPU races ahead of the driver and times its own queue submission.
//
// Both are reported. Neither is quietly substituted for the other, which is the habit this
// arc has had to correct five times.

import * as THREE from 'three';

import { createBandedMaterial, configureExactColour, toBufferGeometry } from './banded-material.js';
import { STATUS_TOKENS } from './palette-band.js';
import { growPlant } from './plant-geometry.js';

/** The same authored token the comparison page draws its plants and ground with. A
 *  benchmark wearing a different palette would measure a different shader. */
const HEALTHY = STATUS_TOKENS['healthy']!.top[0]!;

/** The arc's signed land camera elevation. ADR-0380 D6 fence 4: the projection does not move. */
const ELEVATION_DEG = 50;

/** Deterministic, seeded — ADR-0380 D6 fence 2. No `Math.random` anywhere in this module. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FloorRunSpec {
  /** How many plants stand on the land. The real-corpus island carries ~171 marks. */
  plants: number;
  /** Render-buffer width in device pixels. D2 names 2880x1920. */
  width: number;
  /** Render-buffer height in device pixels. */
  height: number;
  /** Frames of continuous rendering to sample for the cadence figure. */
  frames: number;
  /** Renders per `gl.finish()` batch for the GPU-cost figure. */
  batch: number;
}

export interface FloorReading extends FloorRunSpec {
  renderer: string;
  software: boolean;
  /** Median presentation interval, ms. Vsync-capped. */
  rafP50: number;
  rafP95: number;
  rafWorst: number;
  /** GPU-bound cost of one render, ms. Not vsync-capped. */
  gpuMsPerFrame: number;
  /** Triangles submitted per frame, read from three.js's own counter. */
  triangles: number;
  drawCalls: number;
  /** True when the tab was hidden — every timing below is then void, not merely noisy. */
  hidden: boolean;
}

export interface ReadRendererResult { renderer: string; software: boolean }

/** The unmasked renderer string. Read from a throwaway context so no context is retained. */
export function readRenderer(): ReadRendererResult {
  const c = document.createElement('canvas');
  const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
  if (!gl) return { renderer: 'NO WEBGL CONTEXT', software: true };
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg
    ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
    : 'unavailable (extension blocked)';
  return { renderer, software: /swiftshader|llvmpipe|software|basic render/i.test(renderer) };
}

export interface BuildLandResult {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
}

/**
 * Build the land: a ground plane carrying `plants` seeded shrubs, under the banded material
 * the palette proof binds. This is deliberately the SAME geometry generator and the SAME
 * material the comparison page uses — a benchmark against a different scene would measure a
 * different thing and settle nothing about the experiment it is attached to.
 */
export function buildLand(plants: number): BuildLandResult {
  const scene = new THREE.Scene();
  const rand = mulberry32(0x1a2b3c4d);

  // A square of land in world units, sized so plant density stays roughly the shipped
  // island's as the count rises — otherwise a bigger count would also mean a denser scene
  // and the sweep would vary two things at once.
  const extent = Math.max(24, Math.sqrt(plants) * 6);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(extent, extent),
    createBandedMaterial({ token: HEALTHY, doubleSided: true }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // ONE material and ONE geometry per distinct seed bucket, instanced by reuse: a live
  // renderer's cost is dominated by draw calls, and authoring a unique geometry per plant
  // would measure the authoring, not the drawing.
  const material = createBandedMaterial({ token: HEALTHY, doubleSided: true });
  const geometries = Array.from({ length: 8 }, (_, i) =>
    toBufferGeometry(growPlant({ seed: 1000 + i, form: 'shrub', width: 5, height: 3, detail: 1 })),
  );

  for (let i = 0; i < plants; i++) {
    const g = geometries[i % geometries.length];
    if (!g) continue;
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set((rand() - 0.5) * extent, 0, (rand() - 0.5) * extent);
    scene.add(mesh);
  }

  const half = extent / 2;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, -500, 500);
  const elev = (ELEVATION_DEG * Math.PI) / 180;
  camera.position.set(0, Math.sin(elev) * 100, Math.cos(elev) * 100);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  return { scene, camera };
}

/**
 * Run one measurement. Resolves with the reading; never throws on a slow GPU — a slow result
 * is a RESULT. It reports `hidden` rather than silently returning a throttled sample, because
 * a backgrounded tab throttles rAF to ~1 Hz and that reads as a plausible "this is slow"
 * number rather than as the void measurement it is.
 */
export async function runFloor(canvas: HTMLCanvasElement, spec: FloorRunSpec): Promise<FloorReading> {
  const { renderer: rendererName, software } = readRenderer();

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  renderer.setClearColor(0x0b0e13, 1);
  renderer.setSize(spec.width, spec.height, false);

  const { scene, camera } = buildLand(spec.plants);

  // Warm-up: the first renders pay shader compilation and buffer upload, which are real
  // costs but are NOT the per-frame cost being reported.
  for (let i = 0; i < 5; i++) renderer.render(scene, camera);
  const gl = renderer.getContext();
  gl.finish();

  // --- cadence, vsync-capped --------------------------------------------------------------
  const deltas: number[] = [];
  await new Promise<void>((resolve) => {
    let last = performance.now();
    let n = 0;
    const tick = () => {
      renderer.render(scene, camera);
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      if (++n < spec.frames) {
        requestAnimationFrame(tick);
        return;
      }
      resolve();
    };
    requestAnimationFrame(tick);
  });

  // --- GPU-bound cost, NOT vsync-capped -----------------------------------------------------
  const t0 = performance.now();
  for (let i = 0; i < spec.batch; i++) renderer.render(scene, camera);
  gl.finish();
  const gpuMsPerFrame = (performance.now() - t0) / spec.batch;

  const sorted = deltas.slice(1).sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;

  const reading: FloorReading = {
    ...spec,
    renderer: rendererName,
    software,
    rafP50: at(0.5),
    rafP95: at(0.95),
    rafWorst: sorted[sorted.length - 1] ?? 0,
    gpuMsPerFrame,
    triangles: renderer.info.render.triangles,
    drawCalls: renderer.info.render.calls,
    hidden: document.hidden,
  };

  renderer.dispose();
  return reading;
}

declare global {
  interface Window {
    __stFloor?: (spec: FloorRunSpec) => Promise<FloorReading>;
    __stFloorReady?: boolean;
  }
}

/**
 * Mount the driveable surface. The page does nothing on its own: the Playwright driver calls
 * `window.__stFloor(spec)` per rung, so the sweep lives in the driver where it can be read,
 * rather than in a query string.
 */
export function mountHardwareFloor(root: HTMLElement): void {
  const canvas = document.createElement('canvas');
  canvas.style.width = '640px';
  canvas.style.height = '427px';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  root.appendChild(canvas);

  window.__stFloor = (spec) => runFloor(canvas, spec);
  window.__stFloorReady = true;
}
