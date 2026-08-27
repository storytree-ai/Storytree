// frame-cost-scene.ts — the FRAGMENT-BOUND A/B scene, and the two timing routes taken over it.
//
// ⚠⚠ THE SCENE IS THE INSTRUMENT HERE, NOT AN ILLUSTRATION. `hardware-floor.ts` benchmarks a
// land carrying up to 4,000 plants at ONE DRAW CALL EACH, so its frame time is dominated by
// submission: measured, quadrupling the fragments moved it 0% while removing the plants dropped
// it 97%. A shader A/B run on that scene cannot resolve anything, and it does not say so.
//
// So this scene is the opposite shape, and every choice below exists to make the ground's
// FRAGMENT stage the dominant term:
//
//   - ONE DRAW CALL. A single ground quad. Two triangles. There is no vegetation, no props, no
//     second material — nothing else is submitted, so nothing else can drown the shader.
//   - THE GROUND FILLS THE FRAME, and that is CHECKED rather than arranged and assumed
//     (`measureCoverage`). A ground that only covered half the frame would halve every cost and
//     the report would not know.
//   - THE BUFFER IS THE DELIVERED ONE. ADR-0380 D2's 2880x1920 by default, so the numbers are
//     the ones a shipped map would pay rather than a scaled-up stress figure.
//
// WHAT THE ZOOM MEANS HERE, stated because it is easy to misread. `pxPerUnit` sets how many
// device pixels one ground unit occupies, exactly as `IslandPanel` does — so at a FIXED buffer
// size the two zooms draw the SAME NUMBER OF FRAGMENTS and differ in how much world is under
// them. That is deliberate: the grain is sampled in world coordinates (`vWorld.xz`), so what
// the zoom actually varies is the field's sampling density, not the fragment count. Any
// difference between the two zooms is therefore a property of the FIELD, and any similarity is
// the honest answer that the grain's cost is per-fragment and does not care about the zoom.
//
// ⚠ THE ARMS MUST NOT BE SECRETLY THE SAME SCENE. An A/B whose two arms compile the same
// shader always reports "no measurable difference", with the calm authority of a real
// measurement, and that is indistinguishable from a genuine sub-noise cost.
// `frame-cost-scene.test.ts` proves the sources differ.

import * as THREE from 'three';

import {
  configureExactColour,
  createBandedMaterial,
  type BandedMaterialOptions,
  type GrainMode,
} from './banded-material.js';
import { GPU_TIMER_EXTENSION, type TimingSample } from './frame-cost.js';
import { STATUS_TOKENS } from './palette-band.js';

/** The same authored token every other land panel on this arc wears. A benchmark in a
 *  different palette would be costing a different shader. */
const HEALTHY = STATUS_TOKENS.get('healthy')!.top[0]!;

/** The arc's signed land camera elevation (ADR-0380 D6 fence 4). The projection does not move
 *  between arms — if it did, the arms would differ in more than the shader. */
export const ELEVATION_DEG = 50;

/**
 * The variants this instrument can draw.
 *
 * The first four are the grain octave as BUILT (`land-grain.ts`), decomposed the way the
 * treatment decomposes: `none` is the control, `normal` is the palette-CLOSED half, `colour` is
 * the palette-OPEN half, `both` is what Cycles actually did. Their fragment arithmetic is known
 * and is what the measured numbers get sanity-checked against — one field evaluation is
 * 2 octaves x 4 corners = 8 `sin` calls, so:
 *
 *   none            0 sin/fragment
 *   colour          8 sin/fragment   (one `st_grainRamped` = one field evaluation)
 *   normal         32 sin/fragment   (a central-difference gradient = FOUR evaluations)
 *   both           40 sin/fragment
 *
 * The last two are the UNTRIED REDUCTIONS on the normal half, and they exist to be costed
 * rather than adopted:
 *
 *   normal-forward 24 sin/fragment   (forward difference: three evaluations, -25%)
 *   normal-dfd      8 sin/fragment   (screen-space derivatives: ONE evaluation)
 *
 * ⚠ `normal-dfd` IS NOT APPEARANCE-EQUIVALENT and must never be reported as a free win. The
 * authored gradient steps a QUARTER WAVELENGTH, deliberately measuring the slope of the FEATURE;
 * `dFdx`/`dFdy` measure the slope across ONE SCREEN PIXEL, so the delivered bump changes with
 * the zoom and the look is a different look. It is costed here to answer "what would the cheap
 * route buy", not to propose it.
 */
export type FrameCostVariant =
  | 'none'
  | 'normal'
  | 'colour'
  | 'both'
  | 'normal-forward'
  | 'normal-dfd';

/** The four variants the arc's question is actually about. */
export const GRAIN_VARIANTS: readonly FrameCostVariant[] = ['none', 'normal', 'colour', 'both'];

/** The two reductions, measured only when asked for. */
export const REDUCTION_VARIANTS: readonly FrameCostVariant[] = ['normal-forward', 'normal-dfd'];

/** `sin` calls per fragment, derived from the generated GLSL rather than typed as a guess —
 *  the report states measured cost BESIDE this arithmetic so a reader can see whether the two
 *  tell the same story. */
export const SIN_CALLS_PER_FRAGMENT = {
  none: 0,
  colour: 8,
  normal: 32,
  both: 40,
  'normal-forward': 24,
  'normal-dfd': 8,
} as const satisfies Record<FrameCostVariant, number>;

export interface FrameCostSpec {
  variant: FrameCostVariant;
  /** Device pixels per ground unit — the zoom. The research's two are 2 (overview) and 8. */
  pxPerUnit: number;
  /** Render-buffer width in device pixels. ADR-0380 D2 names 2880x1920. */
  width: number;
  /** Render-buffer height in device pixels. */
  height: number;
  /** Renders per timed batch. Both routes use the same batch, over the same scene. */
  batch: number;
  /** Read the framebuffer back and report what fraction of it the ground covered. Costly, so
   *  the driver asks for it once per configuration rather than on every repeat. */
  coverage?: boolean;
}

export interface FrameCostReading extends TimingSample {
  variant: FrameCostVariant;
  pxPerUnit: number;
  width: number;
  height: number;
  batch: number;
  drawCalls: number;
  triangles: number;
  /** Percentage of the framebuffer the ground actually covered, or `null` when not asked for. */
  groundCoveragePct: number | null;
  /** Nanoseconds the GPU clock reported for the WHOLE batch, before division. Kept raw so a
   *  reader can check the arithmetic. */
  gpuBatchNs: number | null;
  timerQueryAvailable: boolean;
  renderer: string;
  vendor: string;
  software: boolean;
  hidden: boolean;
}

// ---------------------------------------------------------------- the shader surgery

/**
 * The generated central-difference gradient, exactly as `land-grain.ts` emits it. Matched as a
 * REGEX over the whole function so a change to that generator makes the substitution FAIL
 * LOUDLY rather than silently leave the original in place — a reduction arm that quietly kept
 * the full gradient would be the "arms are secretly the same scene" failure wearing a
 * different hat.
 */
const GRADIENT_FN =
  /vec2 st_grainGradient\(vec2 p\) \{[\s\S]*?\n\s*\}/;

/** The step the authored gradient uses, lifted out of the generated source rather than
 *  re-derived, so a retune of `GRAIN_GRAD_STEP` cannot leave the reductions on a stale step. */
function gradientStep(source: string): string {
  const m = /vec2 st_grainGradient\(vec2 p\) \{\s*\n\s*float e = ([0-9.]+);/.exec(source);
  if (!m || m[1] === undefined) {
    throw new Error(
      'frame-cost-scene: could not read the grain gradient step out of the generated shader — ' +
        'land-grain.ts has changed shape and the reduction variants would be measuring the ' +
        'wrong thing. Fix the substitution rather than the assertion.',
    );
  }
  return m[1];
}

/**
 * Replace the grain's normal-half gradient with a cheaper construction.
 *
 * ⚠ THIS IS SHADER SURGERY ON A GENERATED SOURCE, AND IT IS DELIBERATELY NARROW. It rewrites
 * ONE function and asserts the rewrite landed. The alternative — teaching `banded-material.ts`
 * a gradient mode — would put an unadopted experiment into the material every other panel on
 * this arc compiles, for a question that is a COST probe rather than a proposal.
 */
export function reduceGradient(
  source: string,
  how: 'forward' | 'derivatives',
): string {
  if (!GRADIENT_FN.test(source)) {
    throw new Error(
      'frame-cost-scene: the generated shader carries no st_grainGradient to reduce. Either the ' +
        'material was built without the grain\'s normal half, or land-grain.ts changed shape.',
    );
  }
  const e = gradientStep(source);
  const body =
    how === 'forward'
      ? [
          'vec2 st_grainGradient(vec2 p) {',
          `  float e = ${e};`,
          '  // FORWARD DIFFERENCE: three field evaluations instead of four (-25% of this',
          '  // half\'s sin calls). The sample point moves half a step, so the delivered bump',
          '  // is offset by e/2 — a shift, not a different mechanism.',
          '  float h0 = st_grainField(p);',
          '  float gx = st_grainField(p + vec2(e, 0.0)) - h0;',
          '  float gz = st_grainField(p + vec2(0.0, e)) - h0;',
          '  return vec2(gx, gz) / e;',
          '}',
        ].join('\n')
      : [
          'vec2 st_grainGradient(vec2 p) {',
          '  // SCREEN-SPACE DERIVATIVES: ONE field evaluation. The GPU differences the value',
          '  // across the 2x2 quad it is already shading, so the extra samples are free.',
          '  // ⚠ NOT APPEARANCE-EQUIVALENT: this measures the slope across one screen pixel,',
          '  // where the authored gradient measures it across a quarter wavelength. The',
          '  // delivered bump therefore changes with the zoom. Costed, not proposed.',
          '  float h = st_grainField(p);',
          '  float sx = max(1e-6, abs(dFdx(p.x)));',
          '  float sy = max(1e-6, abs(dFdy(p.y)));',
          '  return vec2(dFdx(h) / sx, dFdy(h) / sy);',
          '}',
        ].join('\n');

  const out = source.replace(GRADIENT_FN, body);
  if (out === source) {
    throw new Error('frame-cost-scene: the gradient substitution changed nothing');
  }
  return out;
}

/** Which `createBandedMaterial` grain mode a variant is built on. `none` has none. */
function baseGrainMode(variant: FrameCostVariant): GrainMode | null {
  switch (variant) {
    case 'none':
      return null;
    case 'colour':
      return 'colour';
    case 'both':
      return 'both';
    default:
      return 'normal';
  }
}

/**
 * The ground material for one variant.
 *
 * Exported so `frame-cost-scene.test.ts` can prove the arms differ WITHOUT a GL context —
 * `createBandedMaterial` builds its source at construction time, so the strongest version of
 * "these are not the same scene" is available to a plain `node:test`.
 */
export function variantMaterial(variant: FrameCostVariant): THREE.ShaderMaterial {
  const mode = baseGrainMode(variant);
  const opts: BandedMaterialOptions = { token: HEALTHY, doubleSided: true };
  if (mode) opts.grain = { mode };
  const material = createBandedMaterial(opts);
  if (variant === 'normal-forward') {
    material.fragmentShader = reduceGradient(material.fragmentShader, 'forward');
  } else if (variant === 'normal-dfd') {
    material.fragmentShader = reduceGradient(material.fragmentShader, 'derivatives');
  }
  return material;
}

export interface GroundScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  material: THREE.ShaderMaterial;
}

/**
 * The whole scene: one ground quad, one material, one draw call.
 *
 * THE PLANE IS OVERSIZED ON PURPOSE. The camera looks down at `ELEVATION_DEG`, so a world-Z
 * ground direction is foreshortened by `sin(elevation)` on screen — a plane sized to the
 * frustum's world height would fall short of the top and bottom of the frame by a third. The
 * plane is sized past the frustum in both axes and the excess is CLIPPED, which costs no
 * fragments; `measureCoverage` is what proves the frame actually filled, rather than this
 * comment.
 */
export function buildGroundScene(spec: FrameCostSpec): GroundScene {
  const worldW = spec.width / spec.pxPerUnit;
  const worldH = spec.height / spec.pxPerUnit;
  const elev = (ELEVATION_DEG * Math.PI) / 180;

  const scene = new THREE.Scene();
  const material = variantMaterial(spec.variant);
  // 1.5x past the frustum in x, and past the foreshortened depth in z. Two triangles either way.
  const plane = new THREE.PlaneGeometry(worldW * 1.5, (worldH / Math.sin(elev)) * 1.5);
  const ground = new THREE.Mesh(plane, material);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const camera = new THREE.OrthographicCamera(
    -worldW / 2,
    worldW / 2,
    worldH / 2,
    -worldH / 2,
    -1e5,
    1e5,
  );
  const d = Math.max(worldW, worldH) * 2;
  camera.position.set(0, Math.sin(elev) * d, Math.cos(elev) * d);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();

  return { scene, camera, material };
}

// ---------------------------------------------------------------- reading the device

interface DisjointTimerQuery {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

export interface RendererIdentity {
  renderer: string;
  vendor: string;
  software: boolean;
  timerQuery: boolean;
}

/**
 * WHICH DEVICE DREW THIS, read out of the live context and recorded on every run.
 *
 * ⚠ Every browser figure this project published before 2026-08-27 came off SwiftShader and no
 * report said so. A software rasteriser is deterministic and its numbers are not WRONG — what
 * was wrong is that any of them could later be quoted as a GPU result. For a TIMING they are
 * not merely unattributed but meaningless, which is why `integrityVerdict` voids a run here.
 */
export function readIdentity(gl: WebGL2RenderingContext): RendererIdentity {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '(masked)';
  const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : '(masked)';
  return {
    renderer,
    vendor,
    software: /swiftshader|llvmpipe|softwarerasterizer|software|basic render/i.test(renderer),
    timerQuery: gl.getExtension(GPU_TIMER_EXTENSION) !== null,
  };
}

/** The colour the frame is cleared to — magenta, which the land palette does not contain, so a
 *  cleared pixel can never be mistaken for a ground pixel. */
const CLEAR_RGB: readonly [number, number, number] = [255, 0, 255];

/** One pixel out of the current framebuffer. */
function readPixel(gl: WebGL2RenderingContext, x: number, y: number): [number, number, number] {
  const px = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [px[0]!, px[1]!, px[2]!];
}

/**
 * What fraction of the framebuffer the ground actually covered.
 *
 * THE NON-VACUITY CHECK THAT MATTERS MOST HERE. Every figure this instrument reports is a
 * per-frame fragment cost, and a ground covering 60% of the frame would report 60% of that cost
 * with nothing in the report able to tell. So the frame is cleared to a colour the palette does
 * not contain and the buffer is read back: 100% means the fragment stage really did run over
 * the whole frame.
 *
 * ⚠ THE REFERENCE COLOUR IS MEASURED, NOT ASSUMED. `configureExactColour` turns colour
 * management off precisely because it has silently changed delivered bytes on this stack
 * before; comparing against the magenta we ASKED for would make this check depend on that
 * still being true. `clearReference` is read back off an actually-cleared buffer, so whatever
 * the pipeline delivers for "cleared" is what a cleared pixel is compared against.
 */
function measureCoverage(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  clearReference: readonly [number, number, number],
): number {
  // A STRIDED read rather than the whole 22 MB buffer: full coverage is a property every
  // sampled row shares, and reading 1 row in 16 answers it for a hundredth of the cost.
  const stride = 16;
  let sampled = 0;
  let covered = 0;
  const row = new Uint8Array(width * 4);
  for (let y = 0; y < height; y += stride) {
    gl.readPixels(0, y, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
    for (let x = 0; x < width; x += stride) {
      const i = x * 4;
      sampled++;
      const isClear =
        row[i] === clearReference[0] &&
        row[i + 1] === clearReference[1] &&
        row[i + 2] === clearReference[2];
      if (!isClear) covered++;
    }
  }
  return sampled === 0 ? 0 : (covered / sampled) * 100;
}

/** Poll a query object until the driver has the answer. Resolves `null` on timeout, which the
 *  acceptance rules count as an unavailable sample rather than as a zero. */
async function awaitQuery(
  gl: WebGL2RenderingContext,
  query: WebGLQuery,
  timeoutMs: number,
): Promise<number | null> {
  const started = performance.now();
  for (;;) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1);
    });
    if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true) {
      return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
    }
    if (performance.now() - started > timeoutMs) return null;
  }
}

export interface FrameCostRunner {
  run(spec: FrameCostSpec): Promise<FrameCostReading>;
  identity(): RendererIdentity;
  dispose(): void;
}

/**
 * Build the runner over ONE renderer and ONE canvas, reused across every configuration.
 *
 * ⚠ ONE CONTEXT FOR THE WHOLE SWEEP, and that is a correctness requirement rather than a
 * saving. A browser caps the number of live WebGL contexts and drops the oldest, so a sweep
 * that built a renderer per measurement would silently lose contexts partway through — and the
 * arms measured after the drop would be measuring a re-created device warming up. The scenes
 * are cached per configuration for the same reason: a fresh shader compile inside a timed
 * sample is a cost that is not the grain's.
 */
export function createFrameCostRunner(canvas: HTMLCanvasElement): FrameCostRunner {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  renderer.setClearColor(
    (CLEAR_RGB[0] << 16) | (CLEAR_RGB[1] << 8) | CLEAR_RGB[2],
    1,
  );
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension(GPU_TIMER_EXTENSION) as DisjointTimerQuery | null;
  const identity = readIdentity(gl);
  const scenes = new Map<string, GroundScene>();

  const sceneFor = (spec: FrameCostSpec): GroundScene => {
    const key = `${spec.variant}|${spec.pxPerUnit}|${spec.width}x${spec.height}`;
    const found = scenes.get(key);
    if (found) return found;
    const built = buildGroundScene(spec);
    scenes.set(key, built);
    return built;
  };

  return {
    identity: () => identity,
    dispose: () => {
      for (const s of scenes.values()) s.material.dispose();
      renderer.dispose();
    },
    async run(spec: FrameCostSpec): Promise<FrameCostReading> {
      renderer.setSize(spec.width, spec.height, false);
      const { scene, camera } = sceneFor(spec);

      // WARM-UP. The first renders pay shader compilation, buffer upload and pipeline setup.
      // Those are real costs and they are NOT the per-frame cost being reported.
      for (let i = 0; i < 5; i++) renderer.render(scene, camera);
      gl.finish();

      let groundCoveragePct: number | null = null;
      if (spec.coverage === true) {
        // Clear with NOTHING drawn, and read back what the pipeline actually delivers for a
        // cleared pixel. Then draw and count what is no longer that colour.
        renderer.clear();
        gl.finish();
        const clearReference = readPixel(gl, 0, 0);
        renderer.render(scene, camera);
        gl.finish();
        groundCoveragePct = measureCoverage(gl, spec.width, spec.height, clearReference);
      }

      // --- ROUTE A: wall clock around gl.finish() — `hardware-floor.ts`'s route, verbatim ---
      gl.finish();
      const t0 = performance.now();
      for (let i = 0; i < spec.batch; i++) renderer.render(scene, camera);
      gl.finish();
      const wallMsPerFrame = (performance.now() - t0) / spec.batch;

      // --- ROUTE B: the GPU's own clock, over the identical batch ---------------------------
      let gpuBatchNs: number | null = null;
      let disjoint = false;
      if (ext) {
        // Reading the flag CLEARS it, so this read scopes the disjoint report to this sample
        // rather than inheriting an interruption from an earlier one.
        gl.getParameter(ext.GPU_DISJOINT_EXT);
        const query = gl.createQuery();
        if (query) {
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          for (let i = 0; i < spec.batch; i++) renderer.render(scene, camera);
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          gl.flush();
          const ns = await awaitQuery(gl, query, 10_000);
          disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) === true;
          gpuBatchNs = ns;
          gl.deleteQuery(query);
        }
      }

      return {
        variant: spec.variant,
        pxPerUnit: spec.pxPerUnit,
        width: spec.width,
        height: spec.height,
        batch: spec.batch,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        groundCoveragePct,
        gpuBatchNs,
        gpuMsPerFrame: gpuBatchNs === null ? null : gpuBatchNs / 1e6 / spec.batch,
        disjoint,
        wallMsPerFrame,
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
    __stFrameCost?: (spec: FrameCostSpec) => Promise<FrameCostReading>;
    __stFrameCostIdentity?: () => RendererIdentity;
    __stFrameCostReady?: boolean;
  }
}

/**
 * Mount the driveable surface. The page does nothing on its own: `frame-cost-measure.mjs` calls
 * `window.__stFrameCost(spec)` once per sample, so the interleaved sweep lives in the driver
 * where it can be read rather than in a query string.
 */
export function mountFrameCost(root: HTMLElement): void {
  const canvas = document.createElement('canvas');
  canvas.style.width = '640px';
  canvas.style.height = '427px';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  root.appendChild(canvas);

  const runner = createFrameCostRunner(canvas);
  window.__stFrameCost = (spec) => runner.run(spec);
  window.__stFrameCostIdentity = () => runner.identity();
  window.__stFrameCostReady = true;
}
