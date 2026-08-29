// crowd-page.ts — the driveable surface for the crowd question. Mounts the forest, publishes the
// hooks `crowd-measure.mjs` reads the pictures, the readings and the frame cost off.
//
// Every number is computed in the typechecked modules beside this one; the page renders and hands
// them out. See `crowd-scene.ts` for the arms and `crowd-reading.ts` for the two readings.

import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import { awaitQuery, readIdentity } from './frame-cost-scene.js';
import type { DisjointTimerQuery, RendererIdentity } from './frame-cost-scene.js';
import { ELEV_RAD, REAL_FOREST, fitZoom, visitorZoom } from './crowd-layout.js';
import type { CrowdLayout } from './crowd-layout.js';
import {
  CROWD_ARMS,
  CROWD_VIEWPORT,
  ISLAND_ZOOM_PX_PER_UNIT,
  buildCrowdLayout,
  composeCrowd,
  crowdPxPerUnit,
  crowdOverlaps,
  crowdPropCount,
  sharedRenderer,
} from './crowd-scene.js';
import type { CrowdArm, CrowdOptions, CrowdZoom } from './crowd-scene.js';
import type { PropOverlap } from './kit-vocabulary.js';
import {
  countIslandBlobs,
  meanColour,
  propLegibility,
  truthReading,
} from './crowd-reading.js';
import type { IslandColour, PropLegibility, TruthReading } from './crowd-reading.js';
import { configureExactColour } from './banded-material.js';
import { SHADE_LEVELS } from './palette-band.js';
import { KIT_ASSET_URL, loadKit } from './kit-scene.js';
import type { LoadedKit } from './kit-scene.js';
import { KIT_ROLE_SIZE } from './kit-vocabulary.js';
import type { KitRole } from './kit-vocabulary.js';
import { calibrateLights } from './pine-scene.js';
import type { LightCalibration } from './pine-scene.js';

export const CROWD_ZOOMS: readonly CrowdZoom[] = ['forest', 'neighbourhood', 'island'];

/**
 * THE SMALLEST DIFFERENCE THE LAND ITSELF CAN EXPRESS, in bytes — the reference a pixel delta is
 * read against, and this repo's own number rather than a perceptual one. The banded material
 * quantises onto `SHADE_LEVELS`, so the tightest pair of rungs is the finest step any ground pixel
 * is allowed to take; two pictures differing by less than that differ by less than the land's own
 * resolution. Recomputed from the ladder rather than written down, so it cannot drift from it.
 */
const LADDER_STEP_BYTES = (() => {
  let step = Infinity;
  for (let i = 1; i < SHADE_LEVELS.length; i++) {
    step = Math.min(step, SHADE_LEVELS[i]! - SHADE_LEVELS[i - 1]!);
  }
  return step * 255;
})();

export interface CrowdArmReading {
  arm: CrowdArm;
  zoom: CrowdZoom;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  width: number;
  height: number;
  /** Median GPU nanoseconds for one frame, or null if the timer query gave no verdict. */
  gpuNs: number | null;
}

export interface CrowdTruth extends TruthReading {
  arm: CrowdArm;
  zoom: CrowdZoom;
  islands: IslandColour[];
}

export interface CrowdDiff {
  a: CrowdArm;
  b: CrowdArm;
  zoom: CrowdZoom;
  /** Pixels whose worst channel moved at all, as a share of the frame. */
  differing: number;
  /** Pixels that moved by more than one step of the land's own shade ladder. */
  differingBeyondLadderStep: number;
  maxChannelDelta: number;
  pixels: number;
}

export interface CrowdShape {
  islands: number;
  proven: number;
  landFraction: number;
  screenW: number;
  screenH: number;
  islandW: number;
  islandScreenH: number;
  /** The shipped canvas's own framing rule, applied to a forest of this extent. */
  visitor: { cssPxPerUnit: number; devicePxPerUnit: number; halfHeight: number };
  /** The GENEROUS whole-forest view the pictures are taken at — the forest fitted to the screen. */
  fitPxPerUnit: number;
  /** Device px per ground unit at every zoom this page renders. */
  zoomPxPerUnit: Record<string, number>;
  viewport: { w: number; h: number; dpr: number };
  /** How much coarser the whole-forest view is than the arc's one-island "overview". */
  coarserThanIslandOverview: number;
  props: { total: number; byStatus: Record<string, number> };
  /** Props standing closer than their footprints allow, ACROSS the whole forest — empty is the
   *  claim, and it is a claim only this page can make: each island is dressed in its own
   *  coordinates and then offset, so only the layout can put one island's tree inside
   *  another's. */
  overlaps: PropOverlap[];
  real: typeof REAL_FOREST;
}

export interface CrowdRunner {
  warm(): void;
  shape(): CrowdShape;
  snapshot(arm: CrowdArm, zoom: CrowdZoom): string;
  truth(arm: CrowdArm, zoom: CrowdZoom, uniform?: boolean): CrowdTruth;
  blobs(arm: CrowdArm, zoom: CrowdZoom): { blobs: number; largest: number; expected: number };
  compare(a: CrowdArm, b: CrowdArm, zoom: CrowdZoom): CrowdDiff;
  legibility(zoom: CrowdZoom): PropLegibility[];
  time(arm: CrowdArm, zoom: CrowdZoom, batch: number): Promise<CrowdArmReading>;
  identity(): RendererIdentity;
}

export function createCrowdRunner(layout: CrowdLayout, kit: LoadedKit, cal: LightCalibration): CrowdRunner {
  const { renderer, canvas } = sharedRenderer();
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER_EXTENSION) as DisjointTimerQuery | null;

  /**
   * ⚠⚠ THE COMPOSED FOREST IS CACHED, AND THAT IS A MEASUREMENT FIX RATHER THAN AN OPTIMISATION.
   * Composing this scene builds 35 islands, merges thousands of props and uploads ~2M triangles of
   * fresh buffers. The first version rebuilt it inside every timed call, so the GPU was servicing
   * buffer uploads and evictions WHILE the timer query was open. Measured, every one of the twelve
   * arms came back with a spread roughly equal to its own median — `today@forest` read 3.36 ms on
   * one run and 18.03 ms on the next with byte-identical draw calls and triangle counts. Nothing in
   * that is a frame time.
   *
   * Keyed on everything that changes what is built, so a cache miss is impossible to arrange by
   * accident (the trap `IslandView.tsx`'s own shadow cache header warns about).
   */
  const composed = new Map<string, ReturnType<typeof composeCrowd>>();

  const draw = (arm: CrowdArm, zoom: CrowdZoom, opts: { grain?: boolean; uniform?: boolean } = {}) => {
    // ⚠ THE UNIFORM MUTATION IS THE FALSIFICATION ARM, and it lives here rather than in the
    // driver so it moves through exactly the same code path the real picture does. Every island
    // wears `healthy`, so the needle is no longer different from its neighbours — and the truth
    // reading MUST come back LOST. An instrument nobody has watched refuse is not evidence.
    const used: CrowdLayout = opts.uniform
      ? { ...layout, islands: layout.islands.map((i) => ({ ...i, status: 'healthy' as const })) }
      : layout;
    const key = `${arm}|${zoom}|${opts.grain === false ? 'nograin' : 'grain'}|${opts.uniform ? 'uniform' : 'real'}`;
    let built = composed.get(key);
    if (!built) {
      // Built in statements rather than with a conditional spread: `exactOptionalPropertyTypes`
      // makes "absent" and "present and undefined" different things, and a spread collapsing to
      // `{}` hides which of the two this is.
      const request: CrowdOptions = { arm, zoom, layout: used, kit, cal };
      if (opts.grain === false) request.grain = false;
      built = composeCrowd(request);
      composed.set(key, built);
    }
    renderer.setSize(built.bufW, built.bufH, false);
    return built;
  };

  const readBuffer = (composed: ReturnType<typeof composeCrowd>) => {
    renderer.render(composed.scene3, composed.camera);
    const px = new Uint8Array(composed.bufW * composed.bufH * 4);
    gl.readPixels(0, 0, composed.bufW, composed.bufH, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };

  return {
    /**
     * ⚠ THE COLD START IS PAID ONCE, OUTSIDE THE SWEEP. The first render of any configuration
     * compiles shaders and uploads textures; leaving that inside a timed sweep gave the bare
     * ONE-island arm a spread 139x its own median on the previous page, which correctly made
     * every arm's cost UNRESOLVED.
     */
    warm() {
      for (const zoom of CROWD_ZOOMS) {
        for (const arm of CROWD_ARMS) {
          const composed = draw(arm, zoom);
          renderer.render(composed.scene3, composed.camera);
        }
      }
    },

    shape(): CrowdShape {
      const visitor = visitorZoom(layout, CROWD_VIEWPORT);
      const fit = fitZoom(layout, CROWD_VIEWPORT);
      return {
        islands: layout.islands.length,
        proven: layout.islands.filter((i) => i.status === 'healthy').length,
        landFraction: layout.landFraction,
        screenW: layout.screenW,
        screenH: layout.screenH,
        islandW: layout.islandW,
        islandScreenH: layout.screenH === 0 ? 0 : layout.islandD * Math.sin(ELEV_RAD),
        visitor,
        fitPxPerUnit: fit,
        zoomPxPerUnit: Object.fromEntries(CROWD_ZOOMS.map((z) => [z, crowdPxPerUnit(layout, z)])),
        viewport: { ...CROWD_VIEWPORT },
        coarserThanIslandOverview: ISLAND_ZOOM_PX_PER_UNIT / fit,
        props: crowdPropCount(layout, kit),
        // Overlaps checked in FOREST space: two islands' own dressings each see a clear
        // arrangement, and only the offset layout can put one island's tree inside another's.
        overlaps: crowdOverlaps(layout, kit),
        real: REAL_FOREST,
      };
    },

    snapshot(arm, zoom) {
      const composed = draw(arm, zoom);
      renderer.render(composed.scene3, composed.camera);
      // ⚠ THE RENDERER'S OWN BUFFER, not an element screenshot — an element screenshot
      // composites the page background in opaque and has confounded two evidence pictures on
      // this arc already.
      return canvas.toDataURL('image/png');
    },

    truth(arm, zoom, uniform = false) {
      const composed = draw(arm, zoom, { uniform });
      const px = readBuffer(composed);
      const islands: IslandColour[] = composed.boxes.map((box) => {
        const { rgb, pixels } = meanColour(px, composed.bufW, box);
        return { index: box.index, status: box.status, needle: box.needle, rgb, pixels };
      });
      return { arm, zoom, islands, ...truthReading(islands) };
    },

    blobs(arm, zoom) {
      const composed = draw(arm, zoom);
      const px = readBuffer(composed);
      // The floor is a share of the SMALLEST island box in this frame, not a pixel count chosen
      // here: an island delivering under a twentieth of its own box is a speck, not an island.
      const smallest = Math.min(
        ...composed.boxes.map((b) => Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0))),
      );
      const found = countIslandBlobs(px, composed.bufW, composed.bufH, Math.max(4, smallest / 20));
      return { ...found, expected: composed.boxes.length };
    },

    /**
     * DO TWO ARMS DELIVER THE SAME PICTURE?
     *
     * ⚠⚠ THIS REPLACED A TRIANGLE-COUNT CHECK, AND THE REPLACEMENT IS THE POINT. The first
     * version asserted that `kit` and `kit-merged` DREW the same number of triangles, and it
     * refused a correct run: at the zoomed-in view the per-island arm reported 98,410 triangles
     * and the whole-forest arm 2,138,068. Both place exactly the same props. The difference is
     * FRUSTUM CULLING — 35 per-island groups are each culled on their own bounding sphere, while
     * one merged mesh spanning the whole forest is never culled at all, so every off-screen
     * island is submitted every frame.
     *
     * That is a genuine finding about the remedy rather than a fault in the arms, so the
     * invariant has to be stated over what a READER receives: the two must deliver the same
     * PIXELS. A triangle count was never the claim being made.
     */
    compare(a, b, zoom) {
      const pxA = readBuffer(draw(a, zoom));
      const pxB = readBuffer(draw(b, zoom));
      let differing = 0;
      let beyond = 0;
      let maxDelta = 0;
      for (let i = 0; i < pxA.length; i += 4) {
        const d = Math.max(
          Math.abs(pxA[i]! - pxB[i]!),
          Math.abs(pxA[i + 1]! - pxB[i + 1]!),
          Math.abs(pxA[i + 2]! - pxB[i + 2]!),
          Math.abs(pxA[i + 3]! - pxB[i + 3]!),
        );
        if (d > 0) differing++;
        if (d > LADDER_STEP_BYTES) beyond++;
        if (d > maxDelta) maxDelta = d;
      }
      const pixels = pxA.length / 4;
      return {
        a,
        b,
        zoom,
        differing: differing / pixels,
        differingBeyondLadderStep: beyond / pixels,
        maxChannelDelta: maxDelta,
        pixels,
      };
    },

    legibility(zoom) {
      const pxPerUnit = crowdPxPerUnit(layout, zoom);
      // The AUTHORED size each role is scaled to, and the axis it is sized by — `kit-vocabulary.ts`
      // owns both, so this asks it rather than re-deriving a prop's size from the asset.
      const roles = (['tree', 'deadTree', 'undergrowth', 'rock', 'log', 'bloom'] as KitRole[]).map(
        (role) => ({ role, worldSize: KIT_ROLE_SIZE[role].units, axis: KIT_ROLE_SIZE[role].axis }),
      );
      return propLegibility(roles, pxPerUnit, ELEV_RAD);
    },

    async time(arm, zoom, batch) {
      const built = draw(arm, zoom);
      // Warm the shaders OUTSIDE the timed batch — a fresh compile inside one is measured as the
      // frame's cost and is 100x it.
      renderer.render(built.scene3, built.camera);
      // ⚠⚠ AND PRE-ROLL THE CLOCK, which is a different warm-up from the shader one and was the
      // second cause of an unpublishable spread. This GPU idles at 300 MHz and boosts under load;
      // between two timed batches it sits idle through a driver round-trip, so a batch opened cold
      // spends its first frames at a fraction of the clock the rest run at — and how big that
      // fraction is varies per sample. Measured, that left every forest-zoom arm with a spread
      // 60-80% of its own median AFTER the scene-rebuild cause was fixed. A quarter of the batch,
      // untimed, puts the clock where it will be for the measurement.
      for (let i = 0; i < Math.max(30, Math.floor(batch / 4)); i++) {
        renderer.render(built.scene3, built.camera);
      }
      const composed = built;
      // ⚠ READ THE COUNTERS OFF THAT ONE RENDER, AND DO NOT DIVIDE. three resets `info.render` at
      // the top of every `render()`, so after a batch the counter holds the LAST frame's figures.
      const drawCalls = renderer.info.render.calls;
      const triangles = renderer.info.render.triangles;

      let gpuNs: number | null = null;
      if (timer) {
        const query = gl.createQuery();
        if (query) {
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          for (let i = 0; i < batch; i++) renderer.render(composed.scene3, composed.camera);
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          const total = await awaitQuery(gl, query, 20000);
          const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT) === true;
          // ⚠ A DISJOINT SAMPLE IS DISCARDED, NEVER AVERAGED IN. The GPU has said it was
          // interrupted; a number taken across that is not a frame time.
          gpuNs = total !== null && !disjoint ? total / batch : null;
          gl.deleteQuery(query);
        }
      } else {
        for (let i = 0; i < batch; i++) renderer.render(composed.scene3, composed.camera);
      }

      return {
        arm,
        zoom,
        pxPerUnit: composed.pxPerUnit,
        drawCalls,
        triangles,
        width: composed.bufW,
        height: composed.bufH,
        gpuNs,
      };
    },

    identity: () => readIdentity(gl),
  };
}

declare global {
  interface Window {
    __stCrowdReady?: boolean;
    __stCrowdError?: string;
    __stCrowdWarm?: () => void;
    __stCrowdShape?: () => CrowdShape;
    __stCrowdSnapshot?: (arm: CrowdArm, zoom: CrowdZoom) => string;
    __stCrowdTruth?: (arm: CrowdArm, zoom: CrowdZoom, uniform?: boolean) => CrowdTruth;
    __stCrowdBlobs?: (arm: CrowdArm, zoom: CrowdZoom) => { blobs: number; largest: number; expected: number };
    __stCrowdCompare?: (a: CrowdArm, b: CrowdArm, zoom: CrowdZoom) => CrowdDiff;
    __stCrowdLegibility?: (zoom: CrowdZoom) => PropLegibility[];
    __stCrowdTime?: (arm: CrowdArm, zoom: CrowdZoom, batch: number) => Promise<CrowdArmReading>;
    __stCrowdIdentity?: () => RendererIdentity;
  }
}

/**
 * Mount the four arms at both zooms, then publish the driver hooks.
 *
 * ⚠ `__stCrowdReady` IS SET LAST and a load failure RETHROWS — a page that came up ready with no
 * asset would be photographed as a very cheap, very empty forest.
 */
export async function mountCrowd(root: HTMLElement): Promise<void> {
  try {
    const { renderer } = sharedRenderer();
    configureExactColour(renderer);
    const cal = calibrateLights(renderer);
    const kit = await loadKit(new URLSearchParams(location.search).get('kit') ?? KIT_ASSET_URL);
    const layout = buildCrowdLayout();
    const runner = createCrowdRunner(layout, kit, cal);

    const shape = runner.shape();
    const summary = document.createElement('p');
    summary.innerHTML =
      `<strong>${shape.islands} islands</strong>, ${shape.proven} of them healthy, over ` +
      `${Math.round(shape.screenW)}&times;${Math.round(shape.screenH)} ground units &mdash; ` +
      `${(shape.landFraction * 100).toFixed(2)}% of the frame is land, which is the real map's own ` +
      `measured density. Fitted to the screen with nothing wasted &mdash; the crowd's BEST case &mdash; ` +
      `that is <strong>${shape.fitPxPerUnit.toFixed(2)} device px per ground unit</strong>, ` +
      `${shape.coarserThanIslandOverview.toFixed(1)}&times; coarser than the 2 px/unit every one-island ` +
      `picture on this arc is taken at. The shipped canvas's own framing rule is coarser still, at ` +
      `${shape.visitor.devicePxPerUnit.toFixed(2)}.`;
    root.appendChild(summary);

    for (const zoom of CROWD_ZOOMS) {
      const row = document.createElement('section');
      const heading = document.createElement('h2');
      const zoomPx = crowdPxPerUnit(layout, zoom);
      heading.textContent =
        zoom === 'forest'
          ? `the whole forest — ${zoomPx.toFixed(2)} device px per ground unit`
          : zoom === 'neighbourhood'
            ? `the failing island among its neighbours — ${zoomPx.toFixed(2)} device px per ground unit`
            : `zoomed in on the failing island — ${zoomPx.toFixed(2)} device px per ground unit`;
      row.appendChild(heading);
      const strip = document.createElement('div');
      strip.className = 'row';
      for (const arm of CROWD_ARMS) {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = runner.snapshot(arm, zoom);
        image.style.width = '760px';
        const caption = document.createElement('figcaption');
        caption.textContent = arm;
        figure.append(image, caption);
        strip.appendChild(figure);
      }
      row.appendChild(strip);
      root.appendChild(row);
    }

    window.__stCrowdWarm = () => runner.warm();
    window.__stCrowdShape = () => runner.shape();
    window.__stCrowdSnapshot = (arm, zoom) => runner.snapshot(arm, zoom);
    window.__stCrowdTruth = (arm, zoom, uniform) => runner.truth(arm, zoom, uniform);
    window.__stCrowdBlobs = (arm, zoom) => runner.blobs(arm, zoom);
    window.__stCrowdCompare = (a, b, zoom) => runner.compare(a, b, zoom);
    window.__stCrowdLegibility = (zoom) => runner.legibility(zoom);
    window.__stCrowdTime = (arm, zoom, batch) => runner.time(arm, zoom, batch);
    window.__stCrowdIdentity = () => runner.identity();
    window.__stCrowdReady = true;
  } catch (err) {
    window.__stCrowdError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}
