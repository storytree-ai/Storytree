// land-floor-scene.ts — the BROWSER half of the land frame floor: the arms, and the GPU clock
// that times them. The arithmetic that judges the readings is `land-floor.ts`, which is pure.
//
// ⚠⚠ EVERY ARM IS THE SHIPPED SCENE, AND THAT IS STRUCTURAL RATHER THAN A CLAIM ABOUT CARE.
// `buildGrassScene` calls {@link shippedGroundBuild} — the function `CellGround` itself calls — so
// the control arm CANNOT be a different scene from the map. This is the remedy
// `comparison-baseline-moves-under-the-page` names: the skirt's page assembled its own scene, and
// after a sibling merged, its CONTROL arm was quietly the map as it stood an hour earlier (2,264
// triangles against the real 2,962). The symptom was a re-run returning byte-identical numbers,
// which reads as reassurance. The instrument this file replaces has exactly that shape:
// `hardware-floor.ts`'s `buildLand` hand-assembles a ground plane and some shrubs.
//
// THE THREE ARMS, and the third is the one that makes the other two mean anything:
//
//   flat              the shipped ground as it draws today. The CONTROL.
//   grass             + layer 1 of the approved ground. ZERO extra triangles, 23 extra
//                     lattice-noise octaves per ground fragment. The layer under test.
//   grass-amplified   the SAME layer evaluated {@link AMPLIFY_FACTOR} times over, with the
//                     geometry untouched. The SENSITIVITY CONTROL — see `land-floor.ts` rung 3.
//
// ⚠ THE AMPLIFIED ARM IS NOT A LOOK ARM AND MUST NEVER BE READ AS ONE. Its offsets are chosen to
// defeat common-subexpression elimination, not to deliver a picture, and nothing on this page
// screenshots it. It exists so that a run can PROVE, in the same run and on the same box, that
// this instrument can see fragment cost at all — the property `hardware-floor.mjs` assumed and
// `frame-cost.ts` later measured to be false of the route it was using.

import * as THREE from 'three';

import { GRASS_OCTAVES } from '../src/land-grass.js';
import { GRASS_ARM_MIX, buildGrassScene, type GrassArm } from './shipped-grass-scene.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import {
  awaitQuery,
  readIdentity,
  type DisjointTimerQuery,
  type RendererIdentity,
} from './frame-cost-scene.js';
import { crowdSize, type CrowdSizeId, type CrowdZoom } from './shipped-crowd-scene.js';

/** The arms this instrument can draw. */
export type LandFloorArm = 'flat' | 'grass' | 'grass-amplified';

export const LAND_FLOOR_ARMS: readonly LandFloorArm[] = ['flat', 'grass', 'grass-amplified'];

/** The control every cost is read against — the shipped map exactly as it draws today. */
export const LAND_FLOOR_CONTROL: LandFloorArm = 'flat';

/** The arm whose cost is the question. */
export const LAND_FLOOR_LAYER: LandFloorArm = 'grass';

/** The arm that proves the instrument can see a shader. */
export const LAND_FLOOR_AMPLIFIED: LandFloorArm = 'grass-amplified';

/**
 * HOW MANY TIMES OVER the sensitivity control evaluates the layer.
 *
 * Eight because the property being established is only that the instrument is not BLIND, and the
 * blindness it is guarding against is large: the route this instrument replaces was measured
 * blind to an 8.7x change in real GPU work (`frame-cost.ts`'s header). An amplification smaller
 * than the failure it is testing for would not settle the question; a much larger one would push
 * the arm so far past the shipped scene that a driver might take a different path through it.
 */
export const AMPLIFY_FACTOR = 8;

/**
 * WHICH GRASS MIX THE LAYER ARM WEARS.
 *
 * ⚠ IT IS THE COST QUESTION, SO THE STRENGTH BARELY MATTERS AND THE CHOICE IS STATED ANYWAY. The
 * shader evaluates all 23 octaves whatever `uGrassMix` is — the mix is a uniform multiplying an
 * already-computed colour, not a branch around computing it — so every strength costs the same and
 * the arm could wear any of them. It wears `ladder-limit` (0.20) because that is the strongest mix
 * `shipped-grass-scene.ts` measured as leaving ANY shading depth at all, and pricing the layer at a
 * strength nobody would ship would invite the number to be dismissed on that ground.
 */
export const LAYER_ARM_MIX: GrassArm = 'ladder-limit';

/**
 * The line the grass enters the shipped fragment shader on, emitted by
 * `src/banded-ground-material.ts`. Matched on the CALL rather than on the whole statement so the
 * surrounding comment text can change without silently disarming the surgery.
 */
export const GRASS_CALL = 'st_grassColour(vWorld.xz)';

/**
 * MAKE THE LAYER DELIBERATELY DEARER, in the fragment stage and nowhere else.
 *
 * The single `st_grassColour(vWorld.xz)` call becomes `factor` calls at distinct offsets, averaged.
 * DISTINCT OFFSETS ARE THE POINT: `factor` copies of an identical call are one call after common
 * subexpression elimination, and the arm would be byte-equivalent to the layer arm while claiming
 * to be eight times dearer — a sensitivity control that always reports blindness. The offsets are
 * a fraction of a lattice cell, so the picture is essentially the layer's own; that is irrelevant
 * to its purpose and is stated only so nobody screenshots it.
 *
 * ⚠⚠ IT THROWS WHEN THE ANCHOR IS ABSENT, AND THAT REFUSAL IS THE WHOLE SAFETY OF THIS FILE. A
 * string surgery that quietly returns its input on a miss would make the amplified arm IDENTICAL
 * to the layer arm; rung 3 would then correctly report that the instrument cannot see fragment
 * cost, and a reader would conclude the box was at fault rather than this function. Silence here
 * would manufacture the exact null the rung exists to distinguish from a real one.
 */
export function amplifyGrass(fragmentShader: string, factor: number): string {
  if (!Number.isInteger(factor) || factor < 1) {
    throw new Error(`amplifyGrass: factor must be a positive integer, got ${factor}`);
  }
  if (!fragmentShader.includes(GRASS_CALL)) {
    throw new Error(
      `amplifyGrass: the shipped fragment shader does not contain "${GRASS_CALL}". Either this ` +
        'arm was built without the grass layer, or src/banded-ground-material.ts changed how it ' +
        'emits the call. REFUSED rather than returning the shader unchanged: an unamplified ' +
        'sensitivity control reports the instrument as blind and hides the real cause.',
    );
  }
  if (factor === 1) return fragmentShader;

  const terms: string[] = [];
  for (let i = 0; i < factor; i++) {
    // A prime-ish stride in both axes so no two offsets share a lattice cell corner, and so the
    // compiler cannot prove any two calls equal.
    const dx = (i * 0.0131).toFixed(6);
    const dz = (i * 0.0079).toFixed(6);
    terms.push(`st_grassColour(vWorld.xz + vec2(${dx}, ${dz}))`);
  }
  const amplified = `((${terms.join(' + ')}) / ${factor.toFixed(1)})`;
  return fragmentShader.split(GRASS_CALL).join(amplified);
}

export interface LandFloorScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  triangles: number;
  /** Lattice-noise octaves this arm evaluates per ground fragment, over the control's. */
  octaves: number;
}

/** Which shipped-grass arm each land-floor arm is built from. The amplified arm is the layer arm
 *  plus surgery, so it draws the same geometry with the same mix. */
export function grassArmFor(arm: LandFloorArm): GrassArm {
  return arm === 'flat' ? 'flat' : LAYER_ARM_MIX;
}

/** The ground mesh in a built scene — the one object carrying the material under test. */
function groundMeshOf(scene: THREE.Scene): THREE.Mesh {
  for (const child of scene.children) {
    if (child instanceof THREE.Mesh) return child;
  }
  throw new Error('land-floor-scene: the built scene carries no mesh to measure');
}

/**
 * BUILD ONE ARM — the shipped scene, with the material as the only moving part.
 *
 * The `grass-amplified` arm reassigns `fragmentShader` before the material has ever been compiled,
 * which is the only window in which three.js will pick the change up.
 */
export function buildLandFloorScene(
  arm: LandFloorArm,
  size: CrowdSizeId,
  zoom: CrowdZoom,
): LandFloorScene {
  const built = buildGrassScene(grassArmFor(arm), crowdSize(size), zoom);
  let octaves = built.plan.octaves;

  if (arm === 'grass-amplified') {
    const mesh = groundMeshOf(built.scene);
    const material = mesh.material as THREE.ShaderMaterial;
    material.fragmentShader = amplifyGrass(material.fragmentShader, AMPLIFY_FACTOR);
    material.needsUpdate = true;
    octaves = built.plan.octaves * AMPLIFY_FACTOR;
  }

  return {
    scene: built.scene,
    camera: built.camera,
    width: built.width,
    height: built.height,
    pxPerUnit: built.pxPerUnit,
    triangles: built.plan.triangles,
    octaves,
  };
}

export interface LandFloorSpec {
  arm: LandFloorArm;
  size: CrowdSizeId;
  zoom: CrowdZoom;
  /** Renders per timed batch. */
  batch: number;
  /** Read the framebuffer back and report the ground's share of it. Costly, so the driver asks
   *  for it once per arm rather than on every repeat. */
  coverage?: boolean;
}

export interface LandFloorReading {
  arm: LandFloorArm;
  size: CrowdSizeId;
  zoom: CrowdZoom;
  batch: number;
  /** The GPU's own clock, ms per frame. `null` when the query never became available. */
  gpuMsPerFrame: number | null;
  /** Nanoseconds the GPU clock reported for the WHOLE batch, kept raw so the arithmetic can be
   *  checked by a reader. */
  gpuBatchNs: number | null;
  /** `GL_GPU_DISJOINT_EXT` was set while this sample was in flight — the driver is saying the
   *  elapsed figure is GARBAGE rather than merely noisy. */
  disjoint: boolean;
  triangles: number;
  drawCalls: number;
  octaves: number;
  groundCoveragePct: number | null;
  timerQueryAvailable: boolean;
  renderer: string;
  vendor: string;
  software: boolean;
  hidden: boolean;
}

export interface LandFloorRunner {
  run(spec: LandFloorSpec): Promise<LandFloorReading>;
  identity(): RendererIdentity;
  dispose(): void;
}

/** The ground's share of the frame, by reading back what is not the painted sea.
 *
 *  ⚠ THE REFERENCE IS READ OFF AN ACTUALLY-CLEARED BUFFER rather than compared against the
 *  authored hex. Routing that hex through `THREE.Color` linearises it and matches nothing — a
 *  measured trap on this page's siblings, recorded in `shipped-grass-scene.ts`'s own census. */
function measureCoverage(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  reference: readonly [number, number, number],
): number {
  const stride = 16;
  let sampled = 0;
  let covered = 0;
  const row = new Uint8Array(width * 4);
  for (let y = 0; y < height; y += stride) {
    gl.readPixels(0, y, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
    for (let x = 0; x < width; x += stride) {
      const i = x * 4;
      sampled++;
      const isBackground =
        row[i] === reference[0] && row[i + 1] === reference[1] && row[i + 2] === reference[2];
      if (!isBackground) covered++;
    }
  }
  return sampled === 0 ? 0 : (covered / sampled) * 100;
}

/**
 * ONE WebGL CONTEXT FOR THE WHOLE SWEEP, and every arm timed through it.
 *
 * ⚠ A CONTEXT PER ARM IS THE OBVIOUS SHAPE AND IS WRONG: browsers cap simultaneous contexts near
 * sixteen and silently LOSE the oldest, and a lost canvas contributes zero pixels — which can
 * never break a check, only make one pass for the wrong reason.
 */
export function createLandFloorRunner(canvas: HTMLCanvasElement): LandFloorRunner {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension(GPU_TIMER_EXTENSION) as DisjointTimerQuery | null;
  const identity = readIdentity(gl);
  const scenes = new Map<string, LandFloorScene>();

  function sceneFor(spec: LandFloorSpec): LandFloorScene {
    const key = `${spec.arm}|${spec.size}|${spec.zoom}`;
    const found = scenes.get(key);
    if (found !== undefined) return found;
    const built = buildLandFloorScene(spec.arm, spec.size, spec.zoom);
    scenes.set(key, built);
    return built;
  }

  return {
    identity: () => identity,
    dispose: () => {
      renderer.dispose();
    },
    async run(spec: LandFloorSpec): Promise<LandFloorReading> {
      const s = sceneFor(spec);
      renderer.setSize(s.width, s.height, false);

      // WARM-UP. The first renders pay shader compilation, buffer upload and pipeline setup —
      // real costs, and NOT the per-frame cost being reported. The amplified arm compiles a
      // materially longer shader, so skipping this would charge it for its own compile.
      for (let i = 0; i < 5; i++) renderer.render(s.scene, s.camera);
      gl.finish();

      let groundCoveragePct: number | null = null;
      if (spec.coverage === true) {
        renderer.clear();
        gl.finish();
        const px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        renderer.render(s.scene, s.camera);
        gl.finish();
        groundCoveragePct = measureCoverage(gl, s.width, s.height, [px[0]!, px[1]!, px[2]!]);
      }

      // THE GPU'S OWN CLOCK, and nothing else. There is deliberately no `gl.finish()` wall-clock
      // route here: this whole instrument exists because that route was measured blind to
      // fragment work, and carrying it would invite a reader to quote the familiar number.
      let gpuBatchNs: number | null = null;
      let disjoint = false;
      if (ext) {
        // Reading the flag CLEARS it, so this scopes the disjoint report to THIS sample rather
        // than inheriting an interruption from an earlier one.
        gl.getParameter(ext.GPU_DISJOINT_EXT);
        const query = gl.createQuery();
        if (query) {
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          for (let i = 0; i < spec.batch; i++) renderer.render(s.scene, s.camera);
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          gl.flush();
          const ns = await awaitQuery(gl, query, 10_000);
          disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) === true;
          gpuBatchNs = ns;
          gl.deleteQuery(query);
        }
      }

      return {
        arm: spec.arm,
        size: spec.size,
        zoom: spec.zoom,
        batch: spec.batch,
        gpuMsPerFrame: gpuBatchNs === null ? null : gpuBatchNs / 1e6 / spec.batch,
        gpuBatchNs,
        disjoint,
        triangles: renderer.info.render.triangles,
        drawCalls: renderer.info.render.calls,
        octaves: s.octaves,
        groundCoveragePct,
        timerQueryAvailable: ext !== null,
        renderer: identity.renderer,
        vendor: identity.vendor,
        software: identity.software,
        hidden: document.hidden,
      };
    },
  };
}

declare global {
  interface Window {
    __stLandFloor?: (spec: LandFloorSpec) => Promise<LandFloorReading>;
    __stLandFloorIdentity?: () => RendererIdentity;
    __stLandFloorReady?: boolean;
  }
}

/** Mount the driveable surface. The page does nothing on its own: `land-floor-measure.mjs` calls
 *  `window.__stLandFloor(spec)` once per sample, so the interleaved sweep lives in the driver
 *  where it can be read rather than in a query string. */
export function mountLandFloor(root: HTMLElement): void {
  const canvas = document.createElement('canvas');
  canvas.style.width = '640px';
  canvas.style.height = '400px';
  canvas.style.display = 'block';
  root.appendChild(canvas);

  const runner = createLandFloorRunner(canvas);
  window.__stLandFloor = (spec) => runner.run(spec);
  window.__stLandFloorIdentity = () => runner.identity();
  window.__stLandFloorReady = true;
}

/** The mixes the arms wear, exported so the report can print what was measured rather than a
 *  reader having to open two files. */
export const LAND_FLOOR_ARM_MIX = {
  flat: GRASS_ARM_MIX.flat,
  grass: GRASS_ARM_MIX[LAYER_ARM_MIX],
  'grass-amplified': GRASS_ARM_MIX[LAYER_ARM_MIX],
} satisfies Record<LandFloorArm, number | null>;

/** Octaves per ground fragment each arm adds over the shipped control — the arithmetic the
 *  measured cost is sanity-checked against. */
export const LAND_FLOOR_ARM_OCTAVES = {
  flat: 0,
  grass: GRASS_OCTAVES,
  'grass-amplified': GRASS_OCTAVES * AMPLIFY_FACTOR,
} satisfies Record<LandFloorArm, number>;
