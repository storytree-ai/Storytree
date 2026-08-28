// pine-scene.ts — THE FIRST TEXTURED ASSET THIS PROJECT HAS EVER DRAWN LIVE, and the A/B that
// says what it costs.
//
// ============================================================================
// WHAT WAS NOT HERE BEFORE
// ============================================================================
//
// Before this file, `packages/forest-world-r3f/` had NO model- or texture-loading path at all:
// no `GLTFLoader`, no `useGLTF`, no `.glb`, no `TextureLoader`, no `KTX2Loader`, and no
// `three-stdlib` / `meshoptimizer` / `draco3d` anywhere in the workspace. Every mesh in the
// package is hand-authored procedural buffer geometry wearing `createBandedMaterial`. So
// ADR-0418's "textured, sculpted 3D assets, drawn live" had never actually been drawn, and the
// two increments describing this as a cheap first probe were wrong about that.
//
// ⚠ THE LOADER COSTS NO NEW DEPENDENCY, AND THAT IS A MEASURED CHOICE RATHER THAN LUCK.
// `three@0.185.1` already ships `GLTFLoader` (`three/examples/jsm/loaders/GLTFLoader.js`) with
// the `EXT_texture_webp` extension wired in, and every browser this project targets decodes
// WebP natively. So the whole loading path adds ZERO bytes to what a visitor downloads beyond
// the asset itself. The alternatives were measured and rejected on exactly that ground:
// Draco would add ~100 KB of decoder to save 11 KB on one tree, and KTX2/Basis would add
// ~263 KB of transcoder for a video-memory win the kit is far too small to need. The numbers
// and the reasoning are in `asset-payload.ts`.
//
// ============================================================================
// THE ARMS, AND WHY THE LIGHTS ARE IN ALL THREE
// ============================================================================
//
// `bare` is the ground alone. `procedural` grows nine of the island's own trees. `gltf` draws
// nine instances of the bought pine, scaled to the SAME height, on the SAME nine points, under
// the SAME camera.
//
// The two arms need different lighting models — `createBandedMaterial` is a custom shader that
// quantises its own half-lambert and ignores scene lights entirely, while a glTF's
// `MeshStandardMaterial` is black without them. Adding lights for one arm only would be a
// SECOND difference between the arms, and then no frame-cost figure could be attributed to the
// texture. So the lights are added to EVERY arm including the control, and the claim that they
// change nothing about the banded arms is not asserted here — it is REFUSED by the driver,
// which renders `procedural` with and without them and requires the pixels to be identical.
// That is the premise refusal ADR-0462's status page and ADR-0461's terrain page both use.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { configureExactColour, createBandedMaterial } from './banded-material.js';
import {
  CLEAR_RGB,
  awaitQuery,
  readIdentity,
  type DisjointTimerQuery,
  type RendererIdentity,
} from './frame-cost-scene.js';
import { GPU_TIMER_EXTENSION, type TimingSample } from './frame-cost.js';
import {
  LIGHT_DIRECTION,
  SHADE_LEVELS,
  SHARED_TOKENS,
  STATUS_TOKENS,
  TREE_TOKENS,
} from './palette-band.js';
import {
  CANOPY_TREE_HEIGHT,
  GROUND_SPAN,
  RENDER_ELEV_DEG,
  TREE_GROUND_POINTS,
  gltfScale,
  proceduralScale,
  referenceTree,
  sceneUpright,
  type PineVariant,
} from './pine-asset.js';
import { growTree } from './tree-geometry.js';

/** The ground token every arm's land wears — the healthy family's lit top. */
const HEALTHY = STATUS_TOKENS.get('healthy')!.top[0]!;

/** Where the committed asset is served from. Vite serves `harness/` as its root. */
export const PINE_ASSET_URL = '/assets/pine-01.glb';

export interface PineSpec {
  variant: PineVariant;
  pxPerUnit: number;
  width: number;
  height: number;
  batch: number;
  /** Measure how much of the frame the ground actually covers (an empty canvas is a cheap one). */
  coverage?: boolean;
  /** Drop the scene lights. Only the driver's premise refusal asks for this. */
  noLights?: boolean;
  /**
   * Draw only the first N of the nine authored points. The driver asks for ONE so it can read
   * a SINGLE tree's delivered extent off the frame — the nine-tree stand spans the whole ground
   * and its bounding box would answer a different question.
   */
  trees?: number;
}

export interface PineReading extends TimingSample {
  variant: PineVariant;
  pxPerUnit: number;
  width: number;
  height: number;
  batch: number;
  drawCalls: number;
  triangles: number;
  groundCoveragePct: number | null;
  gpuBatchNs: number | null;
  timerQueryAvailable: boolean;
  renderer: string;
  vendor: string;
  software: boolean;
  hidden: boolean;
  /** Textures resident on the GPU after this render — 0 for both banded arms, non-zero for glTF. */
  textures: number;
}

/** What the loaded asset turned out to be, reported so the run records what it drew. */
export interface LoadedPine {
  /** One entry per glTF primitive: its geometry and its own material. */
  parts: ReadonlyArray<{ geometry: THREE.BufferGeometry; material: THREE.Material; name: string }>;
  /** The asset's bounding-box height in its own units, before scaling. */
  heightUnits: number;
  triangles: number;
  /** Every distinct texture the asset carries, with its decoded dimensions. */
  textures: ReadonlyArray<{ name: string; width: number; height: number }>;
  /** Bytes of the `.glb` as fetched — the wire figure, read from the response rather than
   *  transcribed, so the page cannot claim a payload it did not download. */
  wireBytes: number;
}

/**
 * LOAD THE PINE, and correct the two things the kit's own export gets wrong for a map.
 *
 * (1) ALPHA MODE. The kit's foliage material is authored `BLEND` — order-dependent alpha, which
 *     for a nine-tree stand of cut-out leaf cards means the classic sorting failure: leaves in
 *     front of leaves vanish depending on draw order and camera angle. Leaf cards want `MASK`
 *     (alpha test): a fragment is in or out, depth writes normally, no sort. So the loaded
 *     material is switched to `alphaTest` here. It is done at LOAD rather than in the exported
 *     file deliberately — it is a RENDERER's decision about how to draw cut-outs, it is visible
 *     in our own code where a reviewer will find it, and it costs zero bytes on the wire.
 *
 * (2) COLOUR SPACE. `GLTFLoader` already marks base colour as sRGB and data maps as linear, so
 *     nothing is done here — noted so the next reader does not "fix" it.
 */
export async function loadPine(url: string = PINE_ASSET_URL): Promise<LoadedPine> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`pine-scene: ${url} answered ${res.status}`);
  const bytes = await res.arrayBuffer();

  const loader = new GLTFLoader();
  const gltf = await loader.parseAsync(bytes, '');

  const parts: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material; name: string }> = [];
  const textures = new Map<string, { name: string; width: number; height: number }>();
  let triangles = 0;
  const box = new THREE.Box3();

  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geometry = obj.geometry as THREE.BufferGeometry;
    const material = obj.material as THREE.Material;
    const index = geometry.getIndex();
    triangles += index ? index.count / 3 : geometry.getAttribute('position').count / 3;

    if (material instanceof THREE.MeshStandardMaterial) {
      if (material.transparent) {
        // (1) above. `alphaTest` and `transparent` are mutually exclusive in three: leaving
        // `transparent` on keeps the mesh in the sorted transparent pass even with a test set.
        material.transparent = false;
        material.alphaTest = 0.5;
        material.depthWrite = true;
      }
      material.side = THREE.DoubleSide;

      // (3) THE COLOUR CONVENTION, and it is the whole reason the first run came out dark.
      //
      // `GLTFLoader` marks a base-colour map `SRGBColorSpace`, and three DECODES that in the
      // shader whatever `ColorManagement.enabled` says — the flag governs `Color` values, not
      // texture transfer functions. The lighting then runs in linear, and
      // `configureExactColour` deliberately leaves `outputColorSpace` LINEAR so an authored
      // token survives byte-for-byte, so nothing ever encodes the result back. Measured: a map
      // whose own mean is rgb(70,90,69) delivered rgb(14,27,16) — which is exactly
      // `srgb_to_linear(70,90,69)`, not a lighting error at all.
      //
      // The fix is to put the asset in the SAME colour convention as everything else on this
      // surface: `createBandedMaterial` does its half-lambert on authored sRGB numbers and
      // writes them raw. So the base-colour map is sampled raw too. It is not colorimetrically
      // correct and it is not meant to be — it is what makes a bought asset and the land beside
      // it speak one convention, which is the precondition for comparing them at all. The
      // DATA maps (normal, roughness) are already linear and are left alone.
      if (material.map) {
        material.map.colorSpace = THREE.NoColorSpace;
        material.map.needsUpdate = true;
      }
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'] as const) {
        const tex = material[key];
        if (tex && tex.image) {
          const img = tex.image as { width?: number; height?: number };
          textures.set(tex.uuid, {
            name: `${key}:${tex.name || obj.name}`,
            width: img.width ?? 0,
            height: img.height ?? 0,
          });
        }
      }
    }
    // The exporter leaves each node at its position in the kit's layout; the comparison plants
    // its own nine points, so the geometry is re-centred on its own footprint and dropped to
    // y = 0. Doing it once here keeps every instance matrix a pure translate.
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!);
    parts.push({ geometry, material, name: obj.name });
  });

  if (parts.length === 0) throw new Error('pine-scene: the asset carries no meshes');

  const centreX = (box.min.x + box.max.x) / 2;
  const centreZ = (box.min.z + box.max.z) / 2;
  for (const part of parts) {
    part.geometry.translate(-centreX, -box.min.y, -centreZ);
    part.geometry.computeBoundingBox();
  }

  return {
    parts,
    heightUnits: box.max.y - box.min.y,
    triangles,
    textures: [...textures.values()],
    wireBytes: bytes.byteLength,
  };
}

// ---------------------------------------------------------------- building the three arms

/** The flat ground, identical in every arm. One draw call. */
function groundMesh(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(GROUND_SPAN, GROUND_SPAN);
  geometry.rotateX(-Math.PI / 2);
  return new THREE.Mesh(geometry, createBandedMaterial({ token: HEALTHY }));
}

/**
 * The grown trees, merged one mesh per authored token — exactly how `IslandView` draws a stand,
 * so the arm this is compared against is the renderer the product actually has rather than a
 * simplified stand-in.
 */
function proceduralTrees(points: ReadonlyArray<readonly [number, number]>): THREE.Mesh[] {
  const scale = proceduralScale();
  const parts = growTree(referenceTree(), sceneUpright());
  const byToken = new Map<string, { pos: number[]; nrm: number[]; idx: number[] }>();

  for (const [token, mesh] of parts) {
    const bucket = byToken.get(token) ?? { pos: [], nrm: [], idx: [] };
    byToken.set(token, bucket);
    for (const [gx, gz] of points) {
      const base = bucket.pos.length / 3;
      for (let i = 0; i < mesh.positions.length; i += 3) {
        bucket.pos.push(
          mesh.positions[i]! * scale + gx,
          mesh.positions[i + 1]! * scale,
          mesh.positions[i + 2]! * scale + gz,
        );
        bucket.nrm.push(mesh.normals[i]!, mesh.normals[i + 1]!, mesh.normals[i + 2]!);
      }
      for (const v of mesh.indices) bucket.idx.push(base + v);
    }
  }

  const out: THREE.Mesh[] = [];
  for (const [token, bucket] of byToken) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.nrm, 3));
    geometry.setIndex(bucket.idx);
    out.push(new THREE.Mesh(geometry, createBandedMaterial({ token, doubleSided: true })));
  }
  return out;
}

/**
 * The bought pine, as one `InstancedMesh` per glTF primitive.
 *
 * ⚠ INSTANCED RATHER THAN MERGED, AND THAT IS THE HONEST COMPARISON. Merging would upload nine
 * copies of the same 780 triangles; instancing uploads one and draws it nine times, which is
 * what any real adoption would do and what keeps the draw-call count equal to the procedural
 * arm's. The bytes a visitor downloads do not move either way — that is the point about
 * payload this whole increment exists to make: N trees of one asset cost the bytes of ONE asset.
 */
function gltfTrees(
  pine: LoadedPine,
  points: ReadonlyArray<readonly [number, number]>,
  textured: boolean,
): THREE.InstancedMesh[] {
  const scale = gltfScale(pine.heightUnits);
  return pine.parts.map((part) => {
    // The untextured arm is the SAME material with every map removed — same albedo factor, same
    // roughness, same alpha mode, same geometry, same instancing. One thing differs.
    const material = textured ? part.material : stripMaps(part.material);
    const mesh = new THREE.InstancedMesh(part.geometry, material, points.length);
    const m = new THREE.Matrix4();
    points.forEach(([gx, gz], i) => {
      m.makeScale(scale, scale, scale);
      m.setPosition(gx, 0, gz);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  });
}

/**
 * THE LIGHTS, and the calibration that is the real finding of this arm.
 *
 * ⚠⚠ THIS RENDERER IS NOT COLOUR-MANAGED, ON PURPOSE, AND A PBR ASSET DROPPED INTO IT COMES OUT
 * FAR TOO DARK. `configureExactColour` sets `outputColorSpace = LinearSRGBColorSpace` and
 * `ColorManagement.enabled = false` so an authored token like `#8cb85e` survives the round trip
 * byte-for-byte — the whole basis of the palette-closure claim this arc rests on. A
 * `MeshStandardMaterial` computes its lighting through a BRDF with its own reciprocal-pi and
 * three's own irradiance units, and then has NO output transform to open the result back up. The
 * first run of this page delivered foliage at rgb(15,26,15) against a base-colour map whose own
 * mean is rgb(70,90,69) — a factor of 3.5, in a picture that looked like an art choice. Nothing
 * was broken; the light was being reported in units the pipeline does not convert.
 *
 * ⚠ AND THE FIX IS NOT A DIALLED NUMBER. Multiplying by pi and looking at the result is exactly
 * the move `hardware-floor.mjs`'s own history records as the way an instrument stops being one
 * ("a number picked to make the answer come out"). So the intensities are CALIBRATED AT RUNTIME
 * against a control rendered in the same context: a white, fully rough, fully lit
 * `MeshStandardMaterial` face is drawn and read back, and the lights are scaled until it
 * delivers exactly the banded ladder's top rung. After that a lit pine face delivers its base
 * colour at `SHADE_LEVELS`'s top and an unlit one at its floor — the SAME range the land beside
 * it is quantised into, by construction rather than by eye.
 */
export interface LightCalibration {
  /** What a white, fully-lit, fully-rough standard face delivered at unit intensities. */
  probe: number;
  /** The factor both intensities are multiplied by. */
  scale: number;
  /** The ladder rung the calibration targets — a fully lit face. */
  target: number;
  /** The floor an unlit face lands on — the ladder's own darkest rung. */
  floor: number;
}

/**
 * Measure how a `MeshStandardMaterial` responds in THIS context, and return the correction.
 *
 * The probe is a plane facing the camera with the key light straight down its normal, white
 * albedo, `roughness: 1`, `metalness: 0` — as close to pure Lambert as the standard material
 * gets. A small specular term survives at that roughness and is deliberately left in: it is part
 * of what the real material will deliver, so calibrating it away would leave every asset slightly
 * bright.
 */
export function calibrateLights(renderer: THREE.WebGLRenderer): LightCalibration {
  const floor = SHADE_LEVELS[0]!;
  const target = SHADE_LEVELS[SHADE_LEVELS.length - 1]!;

  const scene = new THREE.Scene();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }),
  );
  scene.add(plane);
  scene.add(new THREE.AmbientLight(0xffffff, floor));
  const key = new THREE.DirectionalLight(0xffffff, target - floor);
  key.position.set(0, 0, 1);
  scene.add(key);

  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
  camera.position.set(0, 0, 2);
  camera.lookAt(0, 0, 0);

  const size = new THREE.Vector2();
  renderer.getSize(size);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  renderer.setSize(8, 8, false);
  renderer.render(scene, camera);
  gl.finish();
  const px = new Uint8Array(4);
  gl.readPixels(4, 4, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  renderer.setSize(size.x, size.y, false);

  plane.geometry.dispose();
  (plane.material as THREE.Material).dispose();

  const probe = px[0]! / 255;
  if (!(probe > 0)) {
    throw new Error(
      'pine-scene: the lighting probe delivered black. A calibration that cannot see its own ' +
        'control is not a calibration.',
    );
  }
  return { probe, scale: target / probe, target, floor };
}

/** The same material with its image maps removed — the control the texture check reads against. */
function stripMaps(material: THREE.Material): THREE.Material {
  const clone = material.clone();
  if (clone instanceof THREE.MeshStandardMaterial) {
    clone.map = null;
    clone.normalMap = null;
    clone.metalnessMap = null;
    clone.roughnessMap = null;
    clone.aoMap = null;
    // ⚠ WITHOUT THIS THE ARM IS NOT A CONTROL. The foliage's alpha lives in the base-colour
    // map's alpha channel, so removing the map removes the leaf cut-outs and the arm would draw
    // solid quads — a different SILHOUETTE, a different fragment count, and a comparison of two
    // things at once.
    clone.alphaTest = 0;
    clone.needsUpdate = true;
  }
  return clone;
}

/**
 * The lights, at the calibrated intensities. Aimed along `palette-band.ts`'s own
 * `LIGHT_DIRECTION`, so the bought pine is lit by the same sun the banded land is — anything
 * else reads as an art difference rather than a wiring one.
 */
function addLights(scene: THREE.Scene, cal: LightCalibration): void {
  scene.add(new THREE.AmbientLight(0xffffff, cal.floor * cal.scale));
  const key = new THREE.DirectionalLight(0xffffff, (cal.target - cal.floor) * cal.scale);
  key.position
    .set(LIGHT_DIRECTION.x, LIGHT_DIRECTION.y, LIGHT_DIRECTION.z)
    .normalize()
    .multiplyScalar(400);
  scene.add(key);
}

export interface PineScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
}

export function buildPineScene(spec: PineSpec, pine: LoadedPine | null, cal: LightCalibration): PineScene {
  const scene = new THREE.Scene();
  scene.add(groundMesh());
  const points = TREE_GROUND_POINTS.slice(0, spec.trees ?? TREE_GROUND_POINTS.length);
  if (points.length === 0) throw new Error('pine-scene: a tree arm with no trees is not an arm');
  if (spec.variant === 'procedural') for (const m of proceduralTrees(points)) scene.add(m);
  if (spec.variant === 'gltf' || spec.variant === 'gltf-untextured') {
    if (!pine) throw new Error('pine-scene: the gltf arm was asked for before the asset loaded');
    for (const m of gltfTrees(pine, points, spec.variant === 'gltf')) scene.add(m);
  }
  if (spec.noLights !== true) addLights(scene, cal);

  // The camera frames a fixed world window set by the zoom, exactly as `frame-cost-scene.ts`
  // does: at a fixed buffer size the two zooms draw the SAME fragments and differ in how much
  // world sits under them, so any difference between zooms is a property of the scene rather
  // than of the fill rate.
  const worldW = spec.width / spec.pxPerUnit;
  const worldH = spec.height / spec.pxPerUnit;
  const elev = (RENDER_ELEV_DEG * Math.PI) / 180;
  const camera = new THREE.OrthographicCamera(-worldW / 2, worldW / 2, worldH / 2, -worldH / 2, -4000, 4000);
  const dist = 500;
  camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, CANOPY_TREE_HEIGHT / 3, 0);
  camera.updateProjectionMatrix();
  return { scene, camera };
}

// ---------------------------------------------------------------- the driveable runner

function readPixel(gl: WebGL2RenderingContext, x: number, y: number): [number, number, number] {
  const px = new Uint8Array(4);
  gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return [px[0]!, px[1]!, px[2]!];
}

/** What fraction of the frame is NOT the clear colour. An empty canvas is not a cheap one. */
function measureCoverage(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  clear: readonly [number, number, number],
): number {
  const stride = 16;
  const row = new Uint8Array(width * 4);
  let seen = 0;
  let drawn = 0;
  for (let y = 0; y < height; y += stride) {
    gl.readPixels(0, y, width, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
    for (let x = 0; x < width; x += stride) {
      seen++;
      const i = x * 4;
      if (row[i] !== clear[0] || row[i + 1] !== clear[1] || row[i + 2] !== clear[2]) drawn++;
    }
  }
  return seen === 0 ? 0 : (drawn / seen) * 100;
}

/**
 * WHERE TWO ARMS DIFFER, in delivered pixels. Both a premise refusal and a measurement:
 *
 *  - against the BARE arm it gives the tree stand's true on-screen extent, which is the number
 *    `asset-payload.ts`'s texture-rung verdict is read against. Reading it off the frame rather
 *    than deriving it from the scene is the point: a derived extent would still be "right" if
 *    the trees were never drawn.
 *  - between LIT and UNLIT procedural it must be ZERO, which is what licenses putting lights in
 *    every arm so the glTF can be lit without becoming a second difference.
 */
export interface PineDiff {
  differing: number;
  total: number;
  /** The differing pixels' bounding box, in device pixels. `null` when nothing differs. */
  bbox: { x0: number; y0: number; x1: number; y1: number; width: number; height: number } | null;
  /**
   * How many DISTINCT colours the second frame delivers over the differing pixels.
   *
   * This is what says a textured arm actually drew textured, in delivered pixels rather than in
   * an API's own bookkeeping. `renderer.info.memory.textures` cannot answer it: it counts
   * textures RESIDENT on the renderer, so it reads the same on every arm once the asset has been
   * loaded once — the first version of this check used it and refused the bare control for
   * carrying seven textures it never sampled. A banded tree delivers a handful of authored ramp
   * entries; a textured one delivers hundreds. The bar is the PROCEDURAL arm's own count in the
   * same run, never a committed number.
   */
  distinctColours: number;
}

export interface PineRunner {
  run(spec: PineSpec): Promise<PineReading>;
  identity(): RendererIdentity;
  asset(): LoadedPine;
  /** How the standard material had to be scaled to speak the banded ladder's units. */
  calibration(): LightCalibration;
  /** The delivered pixels of the current frame, as a PNG data URL — the picture the owner reads. */
  snapshot(spec: PineSpec): Promise<string>;
  diff(a: PineSpec, b: PineSpec): Promise<PineDiff>;
}

export function createPineRunner(canvas: HTMLCanvasElement, pine: LoadedPine): PineRunner {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  configureExactColour(renderer);
  renderer.setClearColor((CLEAR_RGB[0] << 16) | (CLEAR_RGB[1] << 8) | CLEAR_RGB[2], 1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension(GPU_TIMER_EXTENSION) as DisjointTimerQuery | null;
  const identity = readIdentity(gl);
  const calibration = calibrateLights(renderer);
  const scenes = new Map<string, PineScene>();

  const sceneFor = (spec: PineSpec): PineScene => {
    const key =
      `${spec.variant}|${spec.pxPerUnit}|${spec.width}x${spec.height}` +
      `|${spec.noLights === true ? 'dark' : 'lit'}|n${spec.trees ?? TREE_GROUND_POINTS.length}`;
    const found = scenes.get(key);
    if (found) return found;
    const built = buildPineScene(spec, pine, calibration);
    scenes.set(key, built);
    return built;
  };

  return {
    identity: () => identity,
    asset: () => pine,
    calibration: () => calibration,

    async diff(a: PineSpec, b: PineSpec): Promise<PineDiff> {
      if (a.width !== b.width || a.height !== b.height) {
        throw new Error('pine-scene: two frames of different sizes are not comparable');
      }
      const read = (spec: PineSpec): Uint8Array => {
        renderer.setSize(spec.width, spec.height, false);
        const { scene, camera } = sceneFor(spec);
        renderer.render(scene, camera);
        gl.finish();
        const px = new Uint8Array(spec.width * spec.height * 4);
        gl.readPixels(0, 0, spec.width, spec.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      };
      const pa = read(a);
      const pb = read(b);
      let differing = 0;
      const palette = new Set<number>();
      let x0 = a.width;
      let y0 = a.height;
      let x1 = -1;
      let y1 = -1;
      for (let y = 0; y < a.height; y++) {
        for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          if (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2]) {
            differing++;
            palette.add((pb[i]! << 16) | (pb[i + 1]! << 8) | pb[i + 2]!);
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      return {
        differing,
        distinctColours: palette.size,
        total: a.width * a.height,
        bbox:
          x1 < 0 ? null : { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 },
      };
    },

    async snapshot(spec: PineSpec): Promise<string> {
      renderer.setSize(spec.width, spec.height, false);
      const { scene, camera } = sceneFor(spec);
      renderer.render(scene, camera);
      gl.finish();
      return canvas.toDataURL('image/png');
    },

    async run(spec: PineSpec): Promise<PineReading> {
      renderer.setSize(spec.width, spec.height, false);
      const { scene, camera } = sceneFor(spec);

      // Warm-up: shader compilation, texture upload and pipeline setup are real costs and are
      // NOT the per-frame cost being reported. The glTF arm pays a texture upload here that the
      // banded arms do not, which is exactly why it must land outside the timed batch.
      for (let i = 0; i < 5; i++) renderer.render(scene, camera);
      gl.finish();

      let groundCoveragePct: number | null = null;
      if (spec.coverage === true) {
        renderer.clear();
        gl.finish();
        const clearReference = readPixel(gl, 0, 0);
        renderer.render(scene, camera);
        gl.finish();
        groundCoveragePct = measureCoverage(gl, spec.width, spec.height, clearReference);
      }

      gl.finish();
      const t0 = performance.now();
      for (let i = 0; i < spec.batch; i++) renderer.render(scene, camera);
      gl.finish();
      const wallMsPerFrame = (performance.now() - t0) / spec.batch;

      let gpuBatchNs: number | null = null;
      let disjoint = false;
      if (ext) {
        gl.getParameter(ext.GPU_DISJOINT_EXT);
        const query = gl.createQuery();
        if (query) {
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          for (let i = 0; i < spec.batch; i++) renderer.render(scene, camera);
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          gl.flush();
          gpuBatchNs = await awaitQuery(gl, query, 10_000);
          disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) === true;
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
        textures: renderer.info.memory.textures,
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
    __stPine?: (spec: PineSpec) => Promise<PineReading>;
    __stPineDiff?: (a: PineSpec, b: PineSpec) => Promise<PineDiff>;
    __stPineSnapshot?: (spec: PineSpec) => Promise<string>;
    __stPineIdentity?: () => RendererIdentity;
    __stPineAsset?: () => Omit<LoadedPine, 'parts'>;
    __stPineCalibration?: () => LightCalibration;
    __stPineReady?: boolean;
    __stPineError?: string;
  }
}

/** The tokens the procedural arm wears — recorded on the page so the report can say what the
 *  arm it compares against is made of, without the driver reaching into the palette itself. */
export function proceduralTokens(): string[] {
  const crown = TREE_TOKENS.get(referenceTree().status)?.crown ?? TREE_TOKENS.get('unknown')!.crown;
  return [SHARED_TOKENS.storyTrunk, crown];
}

export async function mountPine(root: HTMLElement): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.style.width = '720px';
  canvas.style.height = '480px';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  root.appendChild(canvas);

  try {
    const pine = await loadPine();
    const runner = createPineRunner(canvas, pine);
    window.__stPine = (spec) => runner.run(spec);
    window.__stPineDiff = (a, b) => runner.diff(a, b);
    window.__stPineSnapshot = (spec) => runner.snapshot(spec);
    window.__stPineIdentity = () => runner.identity();
    window.__stPineAsset = () => ({
      heightUnits: pine.heightUnits,
      triangles: pine.triangles,
      textures: pine.textures,
      wireBytes: pine.wireBytes,
    });
    window.__stPineCalibration = () => runner.calibration();
    window.__stPineReady = true;
  } catch (err) {
    // A load failure must be LOUD. A page that came up ready with no asset would be measured
    // as a very cheap textured arm.
    window.__stPineError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}
