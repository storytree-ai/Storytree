// shipped-detail-scene.ts — THE TREES' DETAIL on the shipped map: the kit's texture rung and the
// crown's ambient-to-key split, each an arm over the SAME dressed ground.
//
// The owner, 2026-09-03, on the canopy sheet beside the render he stamped: "this looks nice, but
// the trees dont seem to have as much detail as our target image." Two mechanisms were named
// before anyone measured (increment `trees-carry-the-kits-detail-texture-rung-and-crown-lighting`):
// the embedded kit shipped ONE texture rung, 128 texels, and the crowns are lit by the ground's
// derived lights — ambient at the ladder floor, so an unlit needle sits at 80% of a lit one. The
// texture half is DECIDED (ADR-0508 D1: native maps); the lighting half is a LOOK, rendered here
// as a ladder for the owner under ADR-0503 D3.
//
// ⚠ EVERY ARM STANDS ON THE SAME GROUND, BUILT BY THE CANOPY PAGE'S OWN MEMOISED BUILDER for the
// SHIPPED grove arm — `canopyGroundBuild(SHIPPED_GROVE_ARM, size)` — with the grove's casters in
// the field. So the ground and every shadow on it are byte-identical across arms, including the
// `bare` arm that stands nothing: the only pixels that differ between `bare` and any other arm are
// the PROPS' own, which is what makes `bare` an honest mask for "where the trees are" and the
// per-arm crown statistics a measurement of the trees rather than of the ground under them
// (`comparison-baseline-moves-under-the-page`: the ground is the shipped builder's, not a copy).
//
// ⚠ THE CONTROL IS `texture-128`: the kit as it was committed until this landing
// (`harness/assets/dressing-kit-128.glb`, kept for exactly this arm), at the ladder floor — i.e.
// today's picture. `texture-native` is ADR-0508 D1 alone; the three `crown-*` arms are the native
// kit under the lighting ladder (`PROP_INDIRECT_FRACTION_RUNGS`).

import * as THREE from 'three';

import { GROUND_ATLAS_ATTRIBUTE, GROUND_STATUS_ATTRIBUTE } from '../src/banded-ground-material.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { configureExactColour } from '../src/exact-colour.js';
import {
  SHIPPED_GRASS,
  SHIPPED_LAYERS,
  SHIPPED_SAND_MIX,
  buildGroundMaterial,
  type GroundLayerExtras,
} from '../src/ForestWorldCanvas.js';
import { isGrovePlacement } from '../src/kit-vocabulary.js';
import {
  calibrateLights,
  intensitiesFor,
  type CalibratedIntensities,
  type LightCalibration,
} from '../src/light-calibration.js';
import { KIT_PROP_INDIRECT_FRACTION, PROP_INDIRECT_FRACTION_RUNGS } from '../src/prop-lighting.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import {
  awaitQuery,
  readIdentity,
  type DisjointTimerQuery,
  type RendererIdentity,
} from './frame-cost-scene.js';
import { KIT_ASSET_URL, kitMeshes, loadKit, setKitPropLighting, type LoadedKit } from './kit-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { SHIPPED_GROVE_ARM, armPlacements, canopyGroundBuild } from './shipped-canopy-scene.js';
import {
  FIT_ZOOM,
  crowdPxPerUnit,
  crowdSize,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
  type CrowdZoom,
} from './shipped-crowd-scene.js';
import {
  REFERENCE_IMAGE,
  backgroundBytes,
  familyCensus,
  referenceFamilies,
  type ReferenceReading,
} from './shipped-grass-scene.js';
import { imageStats, type ImageStats } from './shipped-skirt-scene.js';
import {
  VISIBLE_DELTA,
  sensitivityReasons,
  visibleDeltaDistribution,
  type VisibleDeltaReading,
} from './visible-delta.js';

export { REFERENCE_IMAGE, VISIBLE_DELTA };

export type DetailArm = 'bare' | 'texture-128' | 'texture-native' | 'crown-60' | 'crown-45' | 'crown-30';

export const DETAIL_ARMS: readonly DetailArm[] = [
  'bare',
  'texture-128',
  'texture-native',
  'crown-60',
  'crown-45',
  'crown-30',
];

/** Today's picture: the 128-texel kit at the ladder floor. Every "moved >20/255" is against it. */
export const CONTROL_ARM: DetailArm = 'texture-128';

/** The arm that stands nothing on the same ground — the denominator for the prop mask. */
export const MASK_ARM: DetailArm = 'bare';

/** The kit as committed until this landing, kept as a file for this one arm. */
export const KIT_128_URL = '/assets/dressing-kit-128.glb';

/** Which `.glb` each arm parses — `null` stands nothing. */
export const DETAIL_ARM_KIT = {
  bare: null,
  'texture-128': KIT_128_URL,
  'texture-native': KIT_ASSET_URL,
  'crown-60': KIT_ASSET_URL,
  'crown-45': KIT_ASSET_URL,
  'crown-30': KIT_ASSET_URL,
} satisfies Record<DetailArm, string | null>;

/** The ambient fraction each arm's props wear — `null` stands nothing. */
export const DETAIL_ARM_FRACTION = {
  bare: null,
  'texture-128': KIT_PROP_INDIRECT_FRACTION,
  'texture-native': PROP_INDIRECT_FRACTION_RUNGS[0]!,
  'crown-60': PROP_INDIRECT_FRACTION_RUNGS[1]!,
  'crown-45': PROP_INDIRECT_FRACTION_RUNGS[2]!,
  'crown-30': PROP_INDIRECT_FRACTION_RUNGS[3]!,
} satisfies Record<DetailArm, number | null>;

/** The lighting ladder, floor first: the native kit at every rung. */
export const CROWN_ARMS: readonly DetailArm[] = ['texture-native', 'crown-60', 'crown-45', 'crown-30'];

/** The arms that stand the kit at all. */
export const DRESSED_ARMS: readonly DetailArm[] = DETAIL_ARMS.filter((a) => DETAIL_ARM_KIT[a] !== null);

/**
 * THE SHIPPED PICK — the boldest rung rendered, chosen on the RTX 2060 sheets of 2026-09-04
 * (`docs/research/chapter2-tree-detail-2026-09-04/`) under ADR-0503 D1/D3. `KIT_PROP_INDIRECT_FRACTION`
 * in `src/prop-lighting.ts` is the constant the shipped map reads, and the test holds the two
 * agree; a scale-back moves both together, to a rung already on the sheet.
 */
export const SHIPPED_DETAIL_ARM: DetailArm = 'crown-30';

export const DETAIL_ARM_CAPTION = {
  bare: 'the shipped ground with the grove’s SHADOWS in its field and nothing standing on it — the prop MASK (every pixel that differs from this is a tree, a trunk or a flower)',
  'texture-128':
    'TODAY: the kit at 128 texels (the rung committed until this landing), crowns lit at the ladder floor — an unlit face at 80% of a lit one (CONTROL)',
  'texture-native': 'ADR-0508 D1 alone: the kit at its NATIVE 2048-texel maps, lighting unchanged (unlit face at 80%)',
  'crown-60': '+ crowns sculpted: an unlit face at 60% of a lit one',
  'crown-45': '+ crowns sculpted: an unlit face at 45% of a lit one',
  'crown-30': '+ crowns sculpted: an unlit face at 30% of a lit one — the boldest rung rendered',
} satisfies Record<DetailArm, string>;

export const DETAIL_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];
export const DETAIL_ZOOMS: readonly number[] = [8];
export const DETAIL_PICTURE_ZOOMS: readonly CrowdZoom[] = [...DETAIL_ZOOMS, FIT_ZOOM];

/** The kit slots that carry DATA rather than colour, read off the loaded textures' slot names. */
export function dataSlotsOf(kit: Pick<LoadedKit, 'textures'>): string[] {
  const slots = new Set<string>();
  for (const t of kit.textures) {
    const slot = t.name.split(':')[0] ?? '';
    if (slot !== 'map' && slot !== '') slots.add(slot);
  }
  return [...slots].sort();
}

/** What one loaded kit costs — the payload half of ADR-0508 D1's "as long as the browser can handle it". */
export interface KitFacts {
  url: string;
  wireBytes: number;
  gpuBytes: number;
  textures: number;
  textureEdges: number[];
  dataSlots: string[];
  triangles: number;
  /** Wall-clock of fetch + parse, which on the shipped canvas is the mount's own kit half. */
  loadMs: number;
}

export function kitFacts(kit: LoadedKit, url: string, loadMs: number): KitFacts {
  return {
    url,
    wireBytes: kit.wireBytes,
    gpuBytes: kit.gpuBytes,
    textures: kit.textures.length,
    textureEdges: [...new Set(kit.textures.map((t) => Math.max(t.width, t.height)))].sort((a, b) => a - b),
    dataSlots: dataSlotsOf(kit),
    triangles: kit.triangles,
    loadMs,
  };
}

/** Luma over the pixels that are PROPS — where the arm differs from the mask arm at all. */
export interface PropMaskStats {
  pixels: number;
  meanLuma: number;
  p10: number;
  p50: number;
  p90: number;
  /** p90 − p10: how much of the range the crowns actually use. A flat crown is a narrow spread. */
  spread: number;
}

export function lumaOf(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The prop mask's luma distribution. A pixel is a prop pixel when ANY channel differs from the
 * mask arm — the ground and its shadows are byte-identical by construction, so no threshold is
 * needed and none is applied.
 */
export function propMaskStats(arm: Uint8ClampedArray, mask: Uint8ClampedArray): PropMaskStats {
  if (arm.length !== mask.length) {
    throw new Error(`shipped-detail-scene: the arm (${arm.length}) and the mask (${mask.length}) are different frames`);
  }
  const bins = new Uint32Array(256);
  let pixels = 0;
  let sum = 0;
  for (let i = 0; i < arm.length; i += 4) {
    if (arm[i] === mask[i] && arm[i + 1] === mask[i + 1] && arm[i + 2] === mask[i + 2]) continue;
    const luma = lumaOf(arm[i]!, arm[i + 1]!, arm[i + 2]!);
    const bin = Math.min(255, Math.round(luma));
    bins[bin] = (bins[bin] ?? 0) + 1;
    sum += luma;
    pixels += 1;
  }
  if (pixels === 0) return { pixels: 0, meanLuma: 0, p10: 0, p50: 0, p90: 0, spread: 0 };
  const p10 = percentileOf(bins, pixels, 0.1);
  const p50 = percentileOf(bins, pixels, 0.5);
  const p90 = percentileOf(bins, pixels, 0.9);
  return { pixels, meanLuma: sum / pixels, p10, p50, p90, spread: p90 - p10 };
}

/** The smallest bin at which the cumulative count reaches `q` of `n`. */
export function percentileOf(bins: Uint32Array, n: number, q: number): number {
  const target = q * n;
  let seen = 0;
  for (const [bin, count] of bins.entries()) {
    seen += count;
    if (seen >= target && count > 0) return bin;
  }
  return 255;
}

export interface DetailScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  groundTriangles: number;
  placements: number;
  groves: number;
  meshes: number;
}

/**
 * ONE ARM'S SCENE: the shipped grove arm's ground (its builder, its casters) and, when a kit is
 * handed in, the same grove placements stood from that kit — so two arms differ in the kit and in
 * nothing else.
 */
export function buildDetailScene(
  kit: LoadedKit | null,
  lit: CalibratedIntensities,
  size: CrowdSize,
  zoom: CrowdZoom,
): DetailScene {
  const build = canopyGroundBuild(SHIPPED_GROVE_ARM, size);
  const geo = cellGroundGeometry(build.input);
  if (geo.triangles === 0) throw new Error('shipped-detail-scene: the crowd drew no ground');
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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);
  scene.add(new THREE.Mesh(geometry, material));
  const placements = armPlacements(SHIPPED_GROVE_ARM, size);
  let meshes = 0;
  if (kit !== null) {
    for (const mesh of kitMeshes(kit, placements)) {
      scene.add(mesh);
      meshes += 1;
    }
  }
  scene.add(new THREE.AmbientLight(0xffffff, lit.ambient));
  const sun = new THREE.DirectionalLight(0xffffff, lit.directional);
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
    groundTriangles: geo.triangles,
    placements: placements.length,
    groves: placements.filter(isGrovePlacement).length,
    meshes,
  };
}

export interface DetailReading {
  arm: DetailArm;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  groundTriangles: number;
  placements: number;
  groves: number;
  meshes: number;
  stats: ImageStats;
  land: number;
  families: number;
  largestShare: number;
  topThreeShare: number;
  /** Pixels moved at all / past the visible bar against the CONTROL (today's picture). */
  touched: number;
  visible: number;
  delta: VisibleDeltaReading;
  /** The same two against the arm one rung LEANER on the crown ladder (null off the ladder). */
  touchedVsLeaner: number | null;
  visibleVsLeaner: number | null;
  mask: PropMaskStats;
}

export interface DetailCostSpec {
  arm: DetailArm;
  size: CrowdSizeId;
  zoom: CrowdZoom;
  batch: number;
}

export interface DetailCostReading extends DetailCostSpec {
  gpuMsPerFrame: number | null;
  gpuBatchNs: number | null;
  disjoint: boolean;
  drawCalls: number;
  triangles: number;
  timerQueryAvailable: boolean;
  hidden: boolean;
}

export interface DetailRunner {
  identity(): RendererIdentity;
  calibration(): LightCalibration;
  kits(): KitFacts[];
  warm(): void;
  read(arm: DetailArm, size: CrowdSizeId, zoom: CrowdZoom): DetailReading;
  sensitivity(size: CrowdSizeId, zoom: CrowdZoom): string[];
  cost(spec: DetailCostSpec): Promise<DetailCostReading>;
  snapshot(arm: DetailArm, size: CrowdSizeId, zoom: CrowdZoom): string;
  reference(url: string): Promise<ReferenceReading>;
}

/** The arm one rung leaner than `arm` on the crown ladder, or null for the floor and off-ladder arms. */
export function leanerArm(arm: DetailArm): DetailArm | null {
  const i = CROWN_ARMS.indexOf(arm);
  return i > 0 ? CROWN_ARMS[i - 1]! : null;
}

/** Fetch + parse one kit, timed — the shipped canvas's own mount pays exactly this, once. */
export async function timedKit(url: string): Promise<{ kit: LoadedKit; loadMs: number }> {
  const t0 = performance.now();
  const kit = await loadKit(url);
  return { kit, loadMs: performance.now() - t0 };
}

export async function createDetailRunner(): Promise<DetailRunner> {
  // One parsed kit per dressed arm: the fraction is a property of the kit's MATERIALS, and the
  // merged meshes of every arm share them, so two arms at two fractions need two parses.
  const kits = new Map<DetailArm, LoadedKit>();
  const facts: KitFacts[] = [];
  for (const arm of DRESSED_ARMS) {
    const url = DETAIL_ARM_KIT[arm];
    if (url === null) continue;
    const { kit, loadMs } = await timedKit(url);
    setKitPropLighting(kit, DETAIL_ARM_FRACTION[arm]!);
    kits.set(arm, kit);
    if (!facts.some((f) => f.url === url)) facts.push(kitFacts(kit, url, loadMs));
  }
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  const cal = calibrateLights(renderer);
  const lit = intensitiesFor(cal);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER_EXTENSION) as DisjointTimerQuery | null;
  const bg = backgroundBytes();
  const cache = new Map<string, DetailScene>();
  const sceneFor = (arm: DetailArm, size: CrowdSizeId, zoom: CrowdZoom): DetailScene => {
    const k = `${arm}|${size}|${String(zoom)}`;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const built = buildDetailScene(kits.get(arm) ?? null, lit, crowdSize(size), zoom);
    cache.set(k, built);
    return built;
  };
  const render = (arm: DetailArm, size: CrowdSizeId, zoom: CrowdZoom): DetailScene => {
    const s = sceneFor(arm, size, zoom);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };
  const pixels = (arm: DetailArm, size: CrowdSizeId, zoom: CrowdZoom): Uint8ClampedArray => {
    const s = render(arm, size, zoom);
    const buf = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return new Uint8ClampedArray(buf.buffer);
  };
  return {
    identity: () => readIdentity(gl),
    calibration: () => cal,
    kits: () => facts,
    warm() {
      for (const arm of DETAIL_ARMS) render(arm, 'one', DETAIL_ZOOMS[0]!);
    },
    read(arm, size, zoom) {
      const s = render(arm, size, zoom);
      const info = renderer.info.render;
      const drawCalls = info.calls;
      const triangles = info.triangles;
      const buf = pixels(arm, size, zoom);
      const census = familyCensus(buf, bg);
      const delta = visibleDeltaDistribution(buf, pixels(CONTROL_ARM, size, zoom));
      const leaner = leanerArm(arm);
      const vsLeaner = leaner === null ? null : visibleDeltaDistribution(buf, pixels(leaner, size, zoom));
      return {
        arm,
        pxPerUnit: s.pxPerUnit,
        drawCalls,
        triangles,
        groundTriangles: s.groundTriangles,
        placements: s.placements,
        groves: s.groves,
        meshes: s.meshes,
        stats: imageStats(buf, s.width, s.height, bg),
        land: census.land,
        families: census.families,
        largestShare: census.largestShare,
        topThreeShare: census.topThreeShare,
        touched: delta.touched,
        visible: delta.visible,
        delta,
        touchedVsLeaner: vsLeaner === null ? null : vsLeaner.touched,
        visibleVsLeaner: vsLeaner === null ? null : vsLeaner.visible,
        mask: propMaskStats(buf, pixels(MASK_ARM, size, zoom)),
      };
    },
    sensitivity(size, zoom) {
      return sensitivityReasons(pixels(CONTROL_ARM, size, zoom));
    },
    async cost(spec) {
      const s = sceneFor(spec.arm, spec.size, spec.zoom);
      renderer.setSize(s.width, s.height, false);
      for (const _ of Array.from({ length: 5 })) {
        void _;
        renderer.render(s.scene, s.camera);
      }
      gl.finish();
      const drawCalls = renderer.info.render.calls;
      const triangles = renderer.info.render.triangles;
      let gpuBatchNs: number | null = null;
      let disjoint = false;
      if (timer) {
        gl.getParameter(timer.GPU_DISJOINT_EXT);
        const query = gl.createQuery();
        if (query) {
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          for (const _ of Array.from({ length: spec.batch })) {
            void _;
            renderer.render(s.scene, s.camera);
          }
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          gl.flush();
          gpuBatchNs = await awaitQuery(gl, query, 20_000);
          disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT) === true;
          gl.deleteQuery(query);
        }
      }
      const usable = gpuBatchNs !== null && !disjoint ? gpuBatchNs : null;
      return {
        ...spec,
        gpuMsPerFrame: usable === null ? null : usable / 1e6 / spec.batch,
        gpuBatchNs,
        disjoint,
        drawCalls,
        triangles,
        timerQueryAvailable: timer !== null,
        hidden: document.hidden,
      };
    },
    snapshot(arm, size, zoom) {
      render(arm, size, zoom);
      return canvas.toDataURL('image/png');
    },
    async reference(url) {
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error(`shipped-detail-scene: the reference ${url} did not load`));
        img.src = url;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx === null) throw new Error('shipped-detail-scene: no 2d context for the reference');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      const buf = new Uint8ClampedArray(data.buffer.slice(0));
      const census = referenceFamilies(buf);
      return {
        stats: imageStats(buf, c.width, c.height, REFERENCE_TRANSPARENT),
        families: census.families,
        largestShare: census.largestShare,
      };
    },
  };
}

const REFERENCE_TRANSPARENT: readonly [number, number, number] = [-1, -1, -1];

export async function mountShippedDetail(root: HTMLElement): Promise<void> {
  const runner = await createDetailRunner();
  window.detailRunner = runner;
  runner.warm();
  const id = runner.identity();
  const cal = runner.calibration();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · light probe ${cal.probe.toFixed(3)} → ` +
    `scale ${cal.scale.toFixed(3)} onto the ladder’s ${cal.target}`;
  root.appendChild(head);
  const kitsHead = document.createElement('p');
  kitsHead.className = 'numbers';
  kitsHead.textContent = runner
    .kits()
    .map(
      (k) =>
        `${k.url}: ${k.wireBytes.toLocaleString()} B wire · ${k.gpuBytes.toLocaleString()} B on the GPU · ` +
        `${k.textures} textures at ${k.textureEdges.join('/')} texels · data slots ${k.dataSlots.join(', ')} · ` +
        `loaded in ${k.loadMs.toFixed(0)} ms`,
    )
    .join('\n');
  root.appendChild(kitsHead);
  const refHead = document.createElement('h2');
  refHead.textContent =
    'THE REFERENCE — the render the owner stamped (Blender/Cycles, no frame budget, not differenced)';
  root.appendChild(refHead);
  const refRow = document.createElement('div');
  refRow.className = 'row';
  const refFig = document.createElement('figure');
  const refImg = document.createElement('img');
  refImg.src = REFERENCE_IMAGE;
  refImg.width = 900;
  refFig.appendChild(refImg);
  const refCap = document.createElement('figcaption');
  refCap.textContent = 'land-combined-1948px.png — the look-fence, ADR-0489 D3';
  refFig.appendChild(refCap);
  refRow.appendChild(refFig);
  root.appendChild(refRow);
  for (const size of DETAIL_SIZES) {
    for (const zoom of DETAIL_PICTURE_ZOOMS) {
      const h = document.createElement('h2');
      const px = crowdPxPerUnit(size, zoom);
      h.textContent = `${size.id} — ${zoom === FIT_ZOOM ? `fitted, ${px.toFixed(3)} px/unit` : `${zoom} px/unit`}`;
      root.appendChild(h);
      const row = document.createElement('div');
      row.className = 'row';
      for (const arm of DETAIL_ARMS) {
        const r = runner.read(arm, size.id, zoom);
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = runner.snapshot(arm, size.id, zoom);
        img.width = 900;
        fig.appendChild(img);
        const cap = document.createElement('figcaption');
        cap.textContent =
          `${arm} — ${DETAIL_ARM_CAPTION[arm]} · ${r.drawCalls} calls · ${r.triangles.toLocaleString()} tris · ` +
          `${r.families} families · MICRO ${r.stats.micro.toFixed(2)} · moved>${VISIBLE_DELTA} vs control ${r.visible.toLocaleString()} · ` +
          `crown px ${r.mask.pixels.toLocaleString()} luma p10/p50/p90 ${r.mask.p10}/${r.mask.p50}/${r.mask.p90}`;
        fig.appendChild(cap);
        row.appendChild(fig);
      }
      root.appendChild(row);
    }
  }
}

declare global {
  interface Window {
    detailRunner?: DetailRunner;
  }
}
