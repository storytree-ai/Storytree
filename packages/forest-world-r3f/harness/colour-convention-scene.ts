// colour-convention-scene.ts — THE RUNTIME HALF OF THE COLOUR GUARD: does the frame this
// renderer actually produces carry the bought texture's own colours, or the linearised ones?
//
// `texture-convention.test.ts` proves two things without a GPU: that the convention function
// does what it says, and that every loading path in this directory calls it. Neither can prove
// that CALLING IT WORKS — three could change how it decodes a slot, a map could arrive in a
// slot the convention does not name, or the asset could carry its colour somewhere unexpected.
// The only thing that settles that is the delivered pixels, so this reads them.
//
// ⚠ THE TWO HYPOTHESES ARE RENDERED, NOT PREDICTED. For every material the asset carries, three
// swatches are drawn in the SAME context, on the same quad, under the same lights, differing in
// exactly one thing — which texture is bound:
//
//   1. the asset's own map, as the production loading path left it;
//   2. a flat 1x1 texture of that map's own mean, forced raw — the RAW hypothesis;
//   3. a flat 1x1 texture of that map's mean-after-linearising, forced raw — the MANAGED one.
//
// Arms 2 and 3 are what the frame WOULD look like under each convention, measured rather than
// modelled. That is what makes the bar a same-run control
// (`pixel-threshold-reads-off-a-same-run-control`) and it also means the standard material's
// BRDF constants, its surviving specular term and the light calibration all cancel instead of
// having to be reproduced in JavaScript, where they would drift.

import * as THREE from 'three';

import { configureExactColour } from './banded-material.js';
import { calibrateLights, loadPine } from './pine-scene.js';
import type { LightCalibration, LoadedPine } from './pine-scene.js';
import {
  MIN_OPAQUE_FRACTION,
  OPAQUE_TEXEL_CUT,
  checkAssetMaterials,
  judgeColourConvention,
  srgbToLinearUnit,
} from './texture-convention.js';
import type { ConventionJudgement, Rgb } from './texture-convention.js';

/** A decoded texture image, in the one shape both the 2D canvas and three's loaders answer. */
type DecodedMap = CanvasImageSource & { width?: number; height?: number };

/** Every committed asset this page judges. Adding one here is what puts it under the guard. */
export const GUARDED_ASSETS: readonly string[] = ['/assets/pine-01.glb'];

/**
 * The largest square buffer a swatch is rendered into. Each material is rendered at ITS OWN map's
 * resolution up to this, so the sampling is 1:1 and every delivered pixel is exactly one texel.
 */
const MAX_SWATCH_PX = 1024;

export interface MaterialReport extends ConventionJudgement {
  asset: string;
  /** The decoded map's own dimensions — reported so a run says what it looked at. */
  mapWidth: number;
  mapHeight: number;
  /** The side of the buffer it was rendered into, and how much of the map was solid. */
  swatchPx: number;
  opaqueFraction: number;
  /** Mean of the map's texels, and mean of the map's texels after linearising. */
  sourceMeanRaw: Rgb;
  sourceMeanLinear: Rgb;
  delivered: Rgb;
  rawControl: Rgb;
  managedControl: Rgb;
}

export interface ConventionReport {
  renderer: string;
  vendor: string;
  software: boolean;
  calibration: LightCalibration;
  materials: MaterialReport[];
  /** Refusals that are not about any one material — a missing asset, an undeclared material set. */
  refusals: string[];
  ok: boolean;
}

// ------------------------------------------------------------------ reading a map's own texels

/** Draw a decoded texture image into a 2D canvas and answer its raw and linearised means.
 *
 *  ⚠ BOTH MEANS ARE COMPUTED HERE, FROM THE SAME TEXELS, IN THE SAME RUN. The linearised one is
 *  `mean(srgb_to_linear(texel))` and NOT `srgb_to_linear(mean(texel))` — the curve is convex, so
 *  those differ, and predicting with the wrong one leaves a systematic error that the tolerance
 *  would then have to absorb. A tolerance absorbing a modelling error has stopped discriminating.
 */
/** What one decoded base-colour map is, measured over its solid texels only. */
interface MapMeans {
  raw: Rgb;
  linear: Rgb;
  width: number;
  height: number;
  opaqueFraction: number;
}

function meansOf(image: DecodedMap): MapMeans {
  const width = Number(image.width ?? 0);
  const height = Number(image.height ?? 0);
  if (!(width > 0 && height > 0)) throw new Error('colour-convention: a map has no decoded pixels');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('colour-convention: no 2d context to read a map with');
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;

  let rr = 0;
  let gg = 0;
  let bb = 0;
  let lr = 0;
  let lg = 0;
  let lb = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Only solid texels — see `OPAQUE_TEXEL_CUT`. The render discards exactly the same ones.
    if (data[i + 3]! < OPAQUE_TEXEL_CUT) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    rr += r;
    gg += g;
    bb += b;
    lr += srgbToLinearUnit(r / 255) * 255;
    lg += srgbToLinearUnit(g / 255) * 255;
    lb += srgbToLinearUnit(b / 255) * 255;
    n++;
  }
  if (n === 0) throw new Error('colour-convention: a map has no solid texels at all');
  return {
    raw: { r: rr / n, g: gg / n, b: bb / n },
    linear: { r: lr / n, g: lg / n, b: lb / n },
    width,
    height,
    opaqueFraction: n / (width * height),
  };
}

// ------------------------------------------------------------------ the swatch rig

/**
 * A 1x1 texture of one colour, FORCED RAW.
 *
 * Forced rather than left to the default deliberately: this is the reference the verdict is read
 * against, so it must be in a known convention whatever the asset's own maps turn out to be in.
 */
function flatTexture(colour: Rgb): THREE.DataTexture {
  const px = new Uint8Array([
    Math.round(colour.r),
    Math.round(colour.g),
    Math.round(colour.b),
    255,
  ]);
  const tex = new THREE.DataTexture(px, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The material every swatch wears, differing only in which texture is bound.
 *
 * ⚠ EVERY OTHER MAP IS STRIPPED, AND THAT IS WHAT MAKES IT ONE VARIABLE. A normal map would
 * tilt the swatch's shading per texel, a roughness map would move the specular term, and an AO
 * map would darken it — each of which moves the delivered mean for a reason that has nothing to
 * do with the colour convention. `alphaTest` goes too: the foliage's alpha lives in the
 * base-colour map's alpha channel, and cutting texels out would make the delivered mean an
 * average over a different set of texels than the source mean was taken over.
 */
function swatchMaterial(base: THREE.MeshStandardMaterial, map: THREE.Texture): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.map = map;
  m.normalMap = null;
  m.roughnessMap = null;
  m.metalnessMap = null;
  m.aoMap = null;
  m.emissiveMap = null;
  // Solid texels only, matching the predicate the source mean was taken over exactly.
  m.alphaTest = OPAQUE_TEXEL_CUT / 255;
  m.transparent = false;
  m.depthWrite = true;
  m.side = THREE.FrontSide;
  m.needsUpdate = true;
  return m;
}

/**
 * Render one swatch full-frame and answer the mean of every pixel.
 *
 * The rig is `calibrateLights`'s own: a plane facing the camera with the key light straight down
 * its normal and the ambient at the ladder's floor, at the calibrated intensities. It is the
 * same rig for all three arms, so the lighting cancels; using the calibration's rig rather than
 * the island's sun also means a fully lit swatch lands on the ladder's TOP rung, which is what
 * makes the raw control land on the map's own mean rather than some fraction of it.
 */
/** What one swatch delivered, and over how many solid pixels. */
interface SwatchResult {
  mean: Rgb;
  covered: number;
}

function renderSwatch(
  renderer: THREE.WebGLRenderer,
  material: THREE.Material,
  cal: LightCalibration,
  size: number,
): SwatchResult {
  const scene = new THREE.Scene();
  // Exactly filling the frame: every pixel centre lands on the plane, and with nearest filtering
  // at 1:1 each pixel is exactly one texel. Overfilling would crop the map and undersample it.
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(plane);
  scene.add(new THREE.AmbientLight(0xffffff, cal.floor * cal.scale));
  const key = new THREE.DirectionalLight(0xffffff, (cal.target - cal.floor) * cal.scale);
  key.position.set(0, 0, 1);
  scene.add(key);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.set(0, 0, 2);
  camera.lookAt(0, 0, 0);

  renderer.setSize(size, size, false);
  renderer.setClearAlpha(0);
  renderer.render(scene, camera);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  gl.finish();
  const px = new Uint8Array(size * size * 4);
  gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);

  let r = 0;
  let g = 0;
  let b = 0;
  let covered = 0;
  for (let i = 0; i < px.length; i += 4) {
    // The cut-out texels were discarded and left the transparent clear colour behind. Averaging
    // them in would be averaging the page background into the material's own colour.
    if (px[i + 3]! < OPAQUE_TEXEL_CUT) continue;
    r += px[i]!;
    g += px[i + 1]!;
    b += px[i + 2]!;
    covered++;
  }
  plane.geometry.dispose();
  if (covered === 0) throw new Error('colour-convention: a swatch delivered no solid pixels');
  return { mean: { r: r / covered, g: g / covered, b: b / covered }, covered };
}

// ------------------------------------------------------------------ the run

/** Every distinct material the loaded asset carries that has a base-colour map to judge. */
function texturedMaterials(pine: LoadedPine): Map<string, THREE.MeshStandardMaterial> {
  const out = new Map<string, THREE.MeshStandardMaterial>();
  for (const part of pine.parts) {
    const m = part.material;
    if (!(m instanceof THREE.MeshStandardMaterial)) continue;
    if (!m.map) continue;
    out.set(m.name || part.name, m);
  }
  return out;
}

export async function runColourConvention(
  canvas: HTMLCanvasElement,
  assets: readonly string[] = GUARDED_ASSETS,
): Promise<ConventionReport> {
  // ⚠ `alpha` so a discarded cut-out texel leaves a transparent pixel the readback can tell from
  // a solid one, and `premultipliedAlpha: false` so a solid pixel's rgb is written unscaled —
  // with premultiplication on, a texel's own alpha would multiply its colour and the delivered
  // mean would depend on the map's alpha channel rather than only on its colours.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
    alpha: true,
    premultipliedAlpha: false,
  });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);

  const gl = renderer.getContext() as WebGL2RenderingContext;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : 'unknown';
  const software = /swiftshader|llvmpipe|software/i.test(rendererName);

  const calibration = calibrateLights(renderer);
  const materials: MaterialReport[] = [];
  const refusals: string[] = [];

  for (const url of assets) {
    const loaded = await loadPine(url);
    const found = texturedMaterials(loaded);

    // ⚠ THE FLOOR THAT STOPS AN EMPTY RUN READING AS A GREEN. Every judgement below is per
    // material FOUND; an asset whose materials failed to load carries none and would pass over
    // an empty set. The declared manifest is upstream of the loader for exactly that reason.
    const mismatch = checkAssetMaterials(url, [...found.keys()]);
    if (mismatch) {
      refusals.push(mismatch);
      continue;
    }

    for (const [name, material] of found) {
      const map = material.map!;
      const image = map.image as DecodedMap;
      const source = meansOf(image);

      if (source.opaqueFraction < MIN_OPAQUE_FRACTION) {
        refusals.push(
          `colour-convention: ${name}'s map is only ${(source.opaqueFraction * 100).toFixed(1)}% solid ` +
            `(floor ${(MIN_OPAQUE_FRACTION * 100).toFixed(0)}%) — too little of it is drawn to judge`,
        );
        continue;
      }

      const swatchPx = Math.min(MAX_SWATCH_PX, source.width, source.height);

      // ⚠ THE MAP IS CLONED, NOT MUTATED. The clone carries the asset's own `colorSpace` — which
      // is the property under test — and gets nearest filtering with no mips, so a delivered
      // pixel is exactly one texel rather than an average of four. Changing the filtering on the
      // asset's own texture would change the picture the rest of the harness draws.
      const probeMap = map.clone();
      probeMap.magFilter = THREE.NearestFilter;
      probeMap.minFilter = THREE.NearestFilter;
      probeMap.generateMipmaps = false;
      probeMap.needsUpdate = true;

      const rawTex = flatTexture(source.raw);
      const managedTex = flatTexture(source.linear);
      const armTextured = swatchMaterial(material, probeMap);
      const armRaw = swatchMaterial(material, rawTex);
      const armManaged = swatchMaterial(material, managedTex);

      const delivered = renderSwatch(renderer, armTextured, calibration, swatchPx).mean;
      const rawControl = renderSwatch(renderer, armRaw, calibration, swatchPx).mean;
      const managedControl = renderSwatch(renderer, armManaged, calibration, swatchPx).mean;

      const judgement = judgeColourConvention({ material: name, delivered, rawControl, managedControl });
      materials.push({
        ...judgement,
        asset: url,
        mapWidth: source.width,
        mapHeight: source.height,
        swatchPx,
        opaqueFraction: source.opaqueFraction,
        sourceMeanRaw: source.raw,
        sourceMeanLinear: source.linear,
        delivered,
        rawControl,
        managedControl,
      });

      armTextured.dispose();
      armRaw.dispose();
      armManaged.dispose();
      probeMap.dispose();
      rawTex.dispose();
      managedTex.dispose();
    }
  }

  if (materials.length === 0) {
    refusals.push('colour-convention: no material was judged at all — the run proves nothing');
  }
  if (software) {
    refusals.push(`colour-convention: rendered by ${rendererName}, a software rasteriser`);
  }

  const ok = refusals.length === 0 && materials.every((m) => m.ok);
  return { renderer: rendererName, vendor, software, calibration, materials, refusals, ok };
}

/**
 * The page's mount. It publishes the report on `window` for the driver and renders a readable
 * summary, then sets `__stConventionReady` LAST so a driver cannot photograph a half-run.
 *
 * ⚠ A FAILURE IS LOUD AND RETHROWN. A page that came up ready with no asset would be a guard
 * that had quietly stopped guarding — the same shape as the empty-material-set floor above.
 */
export async function mountColourConvention(root: HTMLElement): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  canvas.style.width = '256px';
  canvas.style.height = '256px';
  canvas.style.imageRendering = 'pixelated';
  root.appendChild(canvas);

  const w: Record<string, unknown> = window as never;
  try {
    const report = await runColourConvention(canvas);
    w['__stConvention'] = report;

    const table = document.createElement('pre');
    table.textContent = [
      `renderer: ${report.renderer}`,
      `calibration: probe ${report.calibration.probe.toFixed(4)} scale x${report.calibration.scale.toFixed(3)}`,
      ...report.refusals.map((r) => `REFUSED  ${r}`),
      ...report.materials.map(
        (m) =>
          `${m.ok ? 'OK  ' : 'FAIL'} ${m.material.padEnd(20)} ${m.verdict.padEnd(16)} ` +
          `delivered ${fmt(m.delivered)}  raw ${fmt(m.rawControl)}  managed ${fmt(m.managedControl)}  ` +
          `sep ${m.separation.toFixed(2)}x  ${m.detail}`,
      ),
      report.ok ? 'CONVENTION HELD' : 'CONVENTION BROKEN',
    ].join('\n');
    root.appendChild(table);
    w['__stConventionReady'] = true;
  } catch (err) {
    w['__stConventionError'] = String(err);
    throw err;
  }
}

function fmt(c: Rgb): string {
  return `(${c.r.toFixed(0)},${c.g.toFixed(0)},${c.b.toFixed(0)})`;
}
