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
import { LEAF_MATERIALS, loadKit } from './kit-scene.js';
import { LEAF_TINT_TOKEN, TINT_LUMA_TOLERANCE, leafTintGain, luma } from './leaf-tint.js';
import { mapMeans } from './map-texels.js';
import type { DecodedMap } from './map-texels.js';
import { parseHex } from './palette-band.js';
import { calibrateLights, loadPine } from './pine-scene.js';
import type { LightCalibration } from './pine-scene.js';
import {
  MIN_OPAQUE_FRACTION,
  OPAQUE_TEXEL_CUT,
  checkAssetMaterials,
  judgeColourConvention,
} from './texture-convention.js';
import type { ConventionJudgement, Rgb } from './texture-convention.js';

/**
 * EVERY COMMITTED ASSET THIS PAGE JUDGES, EACH THROUGH THE LOADER THAT ACTUALLY LOADS IT.
 *
 * ⚠⚠ THE LOADER IS PART OF THE SUBJECT, and this was a real hole before it was closed. Both
 * assets were judged through `loadPine`, so deleting the convention call from `kit-scene.ts` —
 * the path the island page really uses — left every material still reporting RAW. The static
 * scan caught it, which is why that leg exists; but a runtime probe that judges an asset through
 * a loader nothing uses is answering about a code path no picture is drawn by.
 *
 * Adding an asset here is what puts it under this leg, and it must be paired with the loader its
 * own page calls.
 */
export const GUARDED_ASSETS: ReadonlyArray<{ url: string; via: 'pine' | 'kit' }> = [
  { url: '/assets/pine-01.glb', via: 'pine' },
  { url: '/assets/dressing-kit.glb', via: 'kit' },
];

/**
 * The largest square buffer a swatch is rendered into. Each material is rendered at ITS OWN map's
 * resolution up to this, so the sampling is 1:1 and every delivered pixel is exactly one texel.
 */
const MAX_SWATCH_PX = 1024;

export interface MaterialReport extends ConventionJudgement {
  asset: string;
  /**
   * WHICH DECLARED LEAF TINT THIS ROW IS ABOUT, or `null` for the material as the kit ships it.
   *
   * ⚠ A TINTED ROW EXISTS BECAUSE THE PICTURE DRAWS ONE. The island stands a yellow-crowned tree
   * for a `proposed` capability, and that crown is `color x map` — the same arithmetic as the
   * 3.5x-dark failure this whole guard was built for. Judging only the material as LOADED would
   * be judging a code path no picture is drawn by, which is the exact hole PR #1693 found and
   * closed for the loader.
   *
   * The tint carries into all three arms — the swatch material is cloned from the tinted one —
   * so it cancels between the two hypotheses and the verdict stays about the CONVENTION. What
   * the tint is judged on separately is `lumaVsUntinted`.
   */
  tint: string | null;
  /**
   * A TINTED CROWN'S DELIVERED LUMINANCE OVER ITS UNTINTED SIBLING'S, in the same run.
   *
   * This is the number that says a yellow crown is intentional and a black-green one is not.
   * `leaf-tint.ts` rotates hue at constant value, so this must be 1; a tint that darkened would
   * be indistinguishable by eye from the convention failing, and this is what refuses it.
   * `null` on an untinted row, which is its own control.
   */
  lumaVsUntinted: number | null;
  /** The decoded map's own dimensions — reported so a run says what it looked at. */
  mapWidth: number;
  mapHeight: number;
  /** The side of the buffer it was rendered into, and how much of the map was solid. */
  swatchPx: number;
  opaqueFraction: number;
  /** What fraction of the swatch's pixels survived the alpha test and entered the mean. */
  coveredFraction: number;
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

// The map-reading half lives in `map-texels.ts` — two callers now need the same numbers, and two
// copies of an opaque-texel loop is how a source mean and a delivered mean come to be means of
// different sets.

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
  // ⚠⚠ AND THE VERTEX COLOURS GO, BECAUSE THE SWATCH'S GEOMETRY HAS NONE. This one produced a
  // wrong verdict before it was found. The kit's `Logs` material carries `vertexColors: true` —
  // its meshes ship a COLOR_0 attribute and three multiplies it into the base colour. A
  // `PlaneGeometry` has no such attribute, so the shader multiplied by nothing and the swatch
  // came out BLACK: delivered (1,1,1) against a map whose own mean is (93,72,59), which the
  // check honestly reported as INDISCRIMINATE (both hypotheses collapse to black) rather than
  // as a pass. It was the instrument that was wrong, not the asset — the logs render correctly
  // on the island, where the real geometry carries its colours.
  //
  // The material's own vertex colours are therefore OUT OF SCOPE for this probe, and that is a
  // stated limitation rather than a silent one: it judges base-colour MAPS. A vertex-colour
  // channel is a second place colour enters this non-colour-managed pipeline and nothing here
  // checks it.
  m.vertexColors = false;
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

/** Every distinct material an asset carries that has a base-colour map to judge, loaded through
 *  the path its own page uses. */
async function texturedMaterials(
  asset: (typeof GUARDED_ASSETS)[number],
): Promise<Map<string, THREE.MeshStandardMaterial>> {
  const materials: Array<{ material: THREE.Material; name: string }> = [];
  if (asset.via === 'kit') {
    const kit = await loadKit(asset.url);
    for (const assembly of kit.assemblies.values()) {
      for (const part of assembly.objects) materials.push({ material: part.material, name: part.name });
    }
  } else {
    const pine = await loadPine(asset.url);
    for (const part of pine.parts) materials.push({ material: part.material, name: part.name });
  }

  const out = new Map<string, THREE.MeshStandardMaterial>();
  for (const { material, name } of materials) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    if (!material.map) continue;
    out.set(material.name || name, material);
  }
  return out;
}

export async function runColourConvention(
  canvas: HTMLCanvasElement,
  assets: typeof GUARDED_ASSETS = GUARDED_ASSETS,
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

  for (const asset of assets) {
    const url = asset.url;
    const found = await texturedMaterials(asset);

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
      const source = mapMeans(image);

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

      /**
       * JUDGE ONE MATERIAL — the kit's own, or a tinted clone of it — and answer what it
       * delivered, so a tinted row can be compared against its untinted sibling.
       *
       * ⚠ ALL THREE ARMS ARE CLONED FROM THE SAME `base`, so a tint carries into the controls
       * as well as into the textured arm and cancels between the two hypotheses. That is what
       * makes an intentionally yellow crown judged on its CONVENTION rather than failed for
       * being yellow — and it is also why the separation ratio, being a ratio of two means,
       * is untouched by the tint.
       */
      const judge = (base: THREE.MeshStandardMaterial, tint: string | null): Rgb => {
        const label = tint === null ? name : `${name} (${tint} crown)`;
        const armTextured = swatchMaterial(base, probeMap);
        const armRaw = swatchMaterial(base, rawTex);
        const armManaged = swatchMaterial(base, managedTex);

        const deliveredSwatch = renderSwatch(renderer, armTextured, calibration, swatchPx);
        const delivered = deliveredSwatch.mean;
        const rawControl = renderSwatch(renderer, armRaw, calibration, swatchPx).mean;
        const managedControl = renderSwatch(renderer, armManaged, calibration, swatchPx).mean;

        const judgement = judgeColourConvention({
          material: label,
          delivered,
          rawControl,
          managedControl,
        });
        materials.push({
          ...judgement,
          asset: url,
          tint,
          lumaVsUntinted: null,
          mapWidth: source.width,
          mapHeight: source.height,
          swatchPx,
          opaqueFraction: source.opaqueFraction,
          coveredFraction: deliveredSwatch.covered / (swatchPx * swatchPx),
          sourceMeanRaw: source.raw,
          sourceMeanLinear: source.linear,
          delivered,
          rawControl,
          managedControl,
        });

        armTextured.dispose();
        armRaw.dispose();
        armManaged.dispose();
        return delivered;
      };

      const untinted = judge(material, null);

      // ⚠⚠ THE TINTED ARMS, AND WHY THE GUARD HAD TO GROW THEM. Since 2026-08-29 a capability's
      // state reaches the island as a LEAF TINT (ADR-0475 D1), which is `color x map` — the same
      // multiply as the failure this guard exists to catch. Two things are checked here that
      // could not be before: that a tinted crown is still sampled in the raw convention, and
      // that the tint held the map's own VALUE. The second is what tells a deliberate yellow
      // crown from a broken black-green one, and it is fail-closed: the tolerance is a
      // floating-point allowance, not a margin, so anything a reader could see clears it by
      // orders of magnitude.
      if (LEAF_MATERIALS.has(name)) {
        for (const [status, token] of LEAF_TINT_TOKEN) {
          const gain = leafTintGain(parseHex(token), source.raw);
          const tinted = material.clone();
          tinted.color.setRGB(gain.r, gain.g, gain.b);
          tinted.needsUpdate = true;
          const delivered = judge(tinted, status);
          const ratio = luma(delivered) / Math.max(luma(untinted), 1e-9);
          const row = materials[materials.length - 1]!;
          row.lumaVsUntinted = ratio;
          if (Math.abs(ratio - 1) > TINT_LUMA_TOLERANCE) {
            row.ok = false;
            row.detail =
              `the ${status} crown delivers ${ratio.toFixed(3)}x the untinted material's ` +
              'luminance — a leaf tint rotates hue and may not change value (ADR-0475 D1), ' +
              'because a crown darkened by a tint is the same picture as one darkened by the ' +
              'colour convention breaking, and the two must stay distinguishable';
          }
          tinted.dispose();
        }
      }

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
          `${m.ok ? 'OK  ' : 'FAIL'} ${m.material.padEnd(32)} ${m.verdict.padEnd(16)} ` +
          `delivered ${fmt(m.delivered)}  raw ${fmt(m.rawControl)}  managed ${fmt(m.managedControl)}  ` +
          `sep ${m.separation.toFixed(2)}x  ` +
          `${m.lumaVsUntinted === null ? '' : `value x${m.lumaVsUntinted.toFixed(3)}  `}${m.detail}`,
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
