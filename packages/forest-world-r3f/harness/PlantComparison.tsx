// PlantComparison.tsx — the live-render experiment's EVIDENCE SURFACE (dev-only harness,
// never shipped; the package exports only src/).
//
// THE EXPERIMENT'S DESIGN, AND WHY IT IS SHAPED THIS WAY. The arc's central question is
// whether a live renderer unties vegetation from the twelve-pixel sprite budget. The
// obvious way to stage that — render a nice 3D plant, put it next to a screenshot of the
// old one — would compare two different plants and settle nothing, which is precisely the
// error that nearly shipped "hair delivers more pixels than the hand-modelled dome" (hair
// was simply a bigger object).
//
// So this harness renders ONE GEOMETRY THROUGH TWO DELIVERY CONVENTIONS:
//
//   SPRITE side — a canvas sized to the plant's own footprint at ONE GROUND UNIT = ONE
//     DELIVERED PIXEL, then upscaled by the browser with nearest-neighbour. That IS the
//     author-time convention: a 6x3 shrub gets a 6x3 raster, ~12 delivered pixels, and
//     everything finer is gone before the eye is reached.
//   LIVE side — the SAME mesh, SAME camera, SAME banded material, rasterised at the
//     display's own resolution.
//
// Same geometry, same palette, same light. Every difference between the two panels is the
// DELIVERY CONVENTION and nothing else. That is the only form of this comparison that can
// carry a conclusion.
//
// The camera is ORTHOGRAPHIC at the arc's signed 50-degree elevation. ADR-0380 D6 fence 4
// is explicit that the projection does not move — a live renderer changes WHAT DRAWS the
// land, not the angle it is drawn at — so there is no orbit control here and no
// perspective camera. Fence 4 is honoured by construction, not by discipline.

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import {
  configureExactColour,
  createBandedMaterial,
  toBufferGeometry,
} from '../src/banded-material.js';
import { growPlant, type PlantMesh } from '../src/plant-geometry.js';
import { STATUS_TOKENS, landPalette } from '../src/palette-band.js';

/** The arc's measured shrub: ~12 delivered px in a 6x3 world-unit box. */
const FOOTPRINT = { w: 6, h: 3 };

/** The shipped map's real scale on the owner's 2880x1920 display: the 1x sprites are
 *  already upscaled about 2x before anyone sees them (ADR-0380 D2). So "as delivered"
 *  means two device pixels per world unit, not one. */
const DELIVERED_PX_PER_UNIT = 2;

/** The magnification the arc uses for an art call (its 6x detail crops). Larger here
 *  because the subject is a single plant rather than an island window. */
const MAGNIFY = 20;

const HEALTHY = STATUS_TOKENS['healthy']!.top[0]!;

interface PanelSpec {
  /** Rasterise at this many device pixels per world unit. */
  pxPerUnit: number;
  /** Then display the result at this many CSS pixels per world unit. */
  displayPxPerUnit: number;
  seeds: number[];
  detail: number;
  token: string;
}

/**
 * ONE WebGL context for the whole page, shared by every panel.
 *
 * A browser caps simultaneous WebGL contexts at roughly SIXTEEN and silently LOSES the
 * oldest ones past that. This page draws 22 panels, so a context-per-canvas version blanked
 * six of them — and, worse, blanked them in a way that read as success: a lost canvas
 * contributes ZERO pixels, so a palette check that totals pixels across the page still
 * reported a clean closure. The per-canvas floor in `capture.mjs` is the instrument that
 * catches it; this is the fix. Each panel now renders through the shared context and is
 * BLITTED onto its own plain 2D canvas, which cannot be lost.
 */
let shared: { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement } | null = null;

function sharedRenderer(): { renderer: THREE.WebGLRenderer; canvas: HTMLCanvasElement } {
  if (shared) return shared;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // ANTIALIASING OFF is load-bearing, not a performance choice. A multisampled edge
    // BLENDS two palette entries and delivers a colour that is on neither — the closure
    // proof would then fail on the compositor's arithmetic while naming the shader. A
    // locked-palette render is aliased on purpose; that is what "locked" costs.
    antialias: false,
    alpha: true,
    // The blit reads the drawing buffer after the frame, so it must survive presentation.
    preserveDrawingBuffer: true,
  });
  // dpr 1: the buffer size IS the pixel budget. Letting the device pixel ratio multiply it
  // would silently hand the sprite panel more pixels than the convention allows, which
  // would flatter exactly the side the experiment is testing.
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  renderer.setClearColor(0x000000, 0);
  shared = { renderer, canvas };
  return shared;
}

/**
 * Draw a row of plants at an exact pixel budget, then let CSS upscale it.
 *
 * `pxPerUnit` is the RASTERISATION resolution and `displayPxPerUnit` the presentation
 * size. Setting them equal is a live render; setting `pxPerUnit` to 1 and
 * `displayPxPerUnit` to 20 is exactly what the sprite pipeline does to a plant.
 */
function renderPanel(canvas: HTMLCanvasElement, spec: PanelSpec): void {
  const cols = spec.seeds.length;
  const worldW = FOOTPRINT.w * cols;
  const worldH = FOOTPRINT.h;

  const bufW = Math.max(1, Math.round(worldW * spec.pxPerUnit));
  const bufH = Math.max(1, Math.round(worldH * spec.pxPerUnit));

  const { renderer, canvas: glCanvas } = sharedRenderer();
  renderer.setSize(bufW, bufH, false);

  const scene = new THREE.Scene();
  const material = createBandedMaterial({ token: spec.token, doubleSided: true });

  spec.seeds.forEach((seed, i) => {
    const mesh: PlantMesh = growPlant({
      seed,
      form: 'shrub',
      width: FOOTPRINT.w * 0.82,
      height: FOOTPRINT.h,
      detail: spec.detail,
    });
    const obj = new THREE.Mesh(toBufferGeometry(mesh), material);
    obj.position.set(-worldW / 2 + FOOTPRINT.w * (i + 0.5), 0, 0);
    scene.add(obj);
  });

  // Orthographic, tilted to the arc's signed 50-degree land elevation. The ground plane is
  // xz and up is y, so the camera sits above and south, looking at the row's centre.
  const camera = new THREE.OrthographicCamera(-worldW / 2, worldW / 2, worldH, 0, -100, 100);
  const elev = (50 * Math.PI) / 180;
  camera.position.set(0, Math.sin(elev) * 50, Math.cos(elev) * 50);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, worldH / 2, 0);
  // An orthographic camera that has been rotated needs its projection re-derived against
  // the tilted frame, or the plants shear. Re-aiming the frustum vertically by the
  // foreshortening the tilt introduces keeps the row filling the panel.
  camera.top = worldH;
  camera.bottom = -worldH * 0.15;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);

  // Blit the shared context's result onto this panel's own 2D canvas. `imageSmoothing` is
  // OFF for the same reason antialiasing is: a smoothed copy would interpolate between two
  // palette entries and manufacture colours the shader never chose.
  canvas.width = bufW;
  canvas.height = bufH;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, bufW, bufH);
    ctx.drawImage(glCanvas, 0, 0, bufW, bufH, 0, 0, bufW, bufH);
  }

  canvas.style.width = `${worldW * spec.displayPxPerUnit}px`;
  canvas.style.height = `${worldH * spec.displayPxPerUnit}px`;
  // Nearest-neighbour: the sprite convention's own upscale, and the only honest way to
  // show a 12-pixel plant at a size an eye can judge.
  canvas.style.imageRendering = 'pixelated';

  // The delivered pixels are read back by the CAPTURE script off THIS canvas — what the
  // palette proof must bind is the colour an eye receives, which is the composited one.
}

function Panel({ spec, label, note }: { spec: PanelSpec; label: string; note: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) renderPanel(ref.current, spec);
  }, [spec]);
  return (
    <figure className="panel">
      <figcaption>
        <strong>{label}</strong>
        <span>{note}</span>
      </figcaption>
      <div className="stage">
        <canvas ref={ref} />
      </div>
    </figure>
  );
}

const SEEDS = [11, 27, 43, 58, 71];

export function PlantComparison() {
  const palette = landPalette();
  const spritePx = Math.round(FOOTPRINT.w * FOOTPRINT.h * 0.7);
  const livePx = Math.round(
    FOOTPRINT.w * DELIVERED_PX_PER_UNIT * FOOTPRINT.h * DELIVERED_PX_PER_UNIT * 0.7,
  );

  return (
    <main>
      <header>
        <h1>Live-rendered vegetation vs the sprite budget</h1>
        <p>
          One geometry, two delivery conventions. Both panels draw the <em>same</em> procedural
          shrubs, at the <em>same</em> footprint, through the <em>same</em> banded palette and the
          same light, under the same orthographic 50&deg; camera. The only difference is where the
          rasterisation happens.
        </p>
        <p className="numbers">
          shrub footprint {FOOTPRINT.w}&times;{FOOTPRINT.h} world units &middot; sprite budget{' '}
          <strong>{spritePx} px</strong> &middot; live at {DELIVERED_PX_PER_UNIT} device px per unit{' '}
          <strong>{livePx} px</strong> &middot; reachable palette{' '}
          <strong>{palette.length} entries</strong> (shipped land-only 86, dressed 132)
          <br />
          Every &ldquo;px&rdquo; above is BOX ARITHMETIC (w &times; h &times; fill). The pixels these
          panels actually deliver are fewer &mdash; about 5&ndash;6 per plant at 1 px/unit, because the
          50&deg; tilt foreshortens the height and a mound does not fill its box. The measured
          per-panel counts are in <code>capture-report.json</code>; neither number is quietly
          substituted for the other.
        </p>
      </header>

      <section>
        <h2>1 &mdash; at the size they are actually delivered on screen</h2>
        <p className="lede">
          This is the honest, unflattering row: what each convention puts in front of a viewer on a
          2880&times;1920 display, life size. Lean in.
        </p>
        <div className="row">
          <Panel
            label="SPRITE — today"
            note={`rasterised at 1 px/unit, upscaled ${DELIVERED_PX_PER_UNIT}x`}
            spec={{
              pxPerUnit: 1,
              displayPxPerUnit: DELIVERED_PX_PER_UNIT,
              seeds: SEEDS,
              detail: 2,
              token: HEALTHY,
            }}
          />
          <Panel
            label="LIVE — same mesh"
            note={`rasterised at ${DELIVERED_PX_PER_UNIT} px/unit`}
            spec={{
              pxPerUnit: DELIVERED_PX_PER_UNIT,
              displayPxPerUnit: DELIVERED_PX_PER_UNIT,
              seeds: SEEDS,
              detail: 2,
              token: HEALTHY,
            }}
          />
        </div>
      </section>

      <section>
        <h2>2 &mdash; the zoom ladder, which is where the two conventions actually part</h2>
        <p className="lede">
          Row 1 shows the two conventions nearly tying, and that is the honest result: at the size a
          plant is delivered today, a plant is a handful of pixels either way, and no renderer changes
          that. The difference is what happens NEXT. A sprite is authored at a fixed pixel budget, so
          zooming in enlarges its pixels; a live mesh is rasterised at whatever the display gives it,
          so zooming in buys detail. Each pair below is the same plant at the same world size, drawn
          at a bigger map scale each time.
        </p>
        {[2, 5, 10, 20].map((z) => (
          <div className="row zoomrung" key={z}>
            <span className="rung">{z} px / world unit</span>
            <Panel
              label="sprite"
              note={`${spritePx} px budget, upscaled ${z}x`}
              spec={{
                pxPerUnit: 1,
                displayPxPerUnit: z,
                seeds: SEEDS.slice(0, 3),
                detail: 2,
                token: HEALTHY,
              }}
            />
            <Panel
              label="live"
              note={`${Math.round(FOOTPRINT.w * z * FOOTPRINT.h * z * 0.7)} px budget`}
              spec={{
                pxPerUnit: z,
                displayPxPerUnit: z,
                seeds: SEEDS.slice(0, 3),
                detail: 2,
                token: HEALTHY,
              }}
            />
          </div>
        ))}
      </section>

      <section>
        <h2>3 &mdash; the same two rows, magnified {MAGNIFY}&times; (the art call)</h2>
        <p className="lede">
          Nearest-neighbour on both sides, so the sprite row shows its actual pixels rather than a
          blurred apology for them.
        </p>
        <div className="row">
          <Panel
            label="SPRITE — today"
            note={`${spritePx} px budget per plant`}
            spec={{
              pxPerUnit: 1,
              displayPxPerUnit: MAGNIFY,
              seeds: SEEDS,
              detail: 2,
              token: HEALTHY,
            }}
          />
          <Panel
            label="LIVE — same mesh"
            note={`${MAGNIFY} px/unit, no sprite step`}
            spec={{
              pxPerUnit: MAGNIFY,
              displayPxPerUnit: MAGNIFY,
              seeds: SEEDS,
              detail: 2,
              token: HEALTHY,
            }}
          />
        </div>
      </section>

      <section>
        <h2>4 &mdash; the detail ladder the sprite path never had</h2>
        <p className="lede">
          Geodesic subdivision 0&rarr;3 at a fixed footprint: triangles multiply by four a rung
          while the plant stays exactly the same size. The 1&times;/2&times;/4&times;/8&times; raster
          ladder could not do this &mdash; it scaled the same authored geometry, so no rung authored
          new detail. Here the size is pinned and the geometry genuinely gains.
        </p>
        <div className="row ladder">
          {[0, 1, 2, 3].map((detail) => (
            <Panel
              key={detail}
              label={`detail ${detail}`}
              note={`${growPlant({ seed: SEEDS[0]!, form: 'shrub', width: 6, height: 3, detail }).triangles} triangles`}
              spec={{
                pxPerUnit: MAGNIFY,
                displayPxPerUnit: MAGNIFY,
                seeds: [SEEDS[0]!],
                detail,
                token: HEALTHY,
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>5 &mdash; every status, one shader</h2>
        <p className="lede">
          The same material with a different authored token per parcel status. Nothing is snapped to
          a palette; each colour is <code>token &times; quantise(lambert)</code>, so a status can
          only ever deliver its own family.
        </p>
        <p className="lede caveat">
          <strong>Not all six of these reach a viewer, and saying so matters.</strong> The app&rsquo;s
          own <code>worldStatus</code> fold sends <code>unhealthy</code>&rarr;<code>mapped</code>{' '}
          (ADR-0296) and <code>building</code>&rarr;<code>proposed</code> (ADR-0038), so two of these
          tokens are unreachable on a real island &mdash; the arc has already once over-counted a
          palette problem by scoring all six as if the app could draw them. And{' '}
          <code>unknown</code> is <em>not a schema status at all</em>: it is the null-status fallback
          stamped when a capability has none, which is why it rendering as a healthy-looking green is
          worth a look rather than a shrug &mdash; that is absence of information wearing the colour
          of a signed pass. All six are drawn here because this panel is testing the SHADER, not
          proposing a vocabulary.
        </p>
        <div className="row ladder">
          {Object.keys(STATUS_TOKENS).map((status) => (
            <Panel
              key={status}
              label={status}
              note={STATUS_TOKENS[status]!.top[0]!}
              spec={{
                pxPerUnit: MAGNIFY,
                displayPxPerUnit: MAGNIFY,
                seeds: [SEEDS[1]!],
                detail: 2,
                token: STATUS_TOKENS[status]!.top[0]!,
              }}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
