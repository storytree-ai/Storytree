// shipped-shadow-scene.ts — THE THREE REMEDIES FOR A FOREST-SCALE OCCLUSION FIELD, COSTED
// AGAINST EACH OTHER ON ONE INSTRUMENT.
//
// THE INCREMENT: `the-forest-shadow-field-goes-coarse-at-scale` on
// `adopt-the-land-into-the-shipped-map-arc`.
//
// THE FINDING THIS PAGE ANSWERS, established by `shipped-crowd-scene.ts` and not re-derived here:
// `occlusionGres` is `min(SHADOW_GRES, SHADOW_TEXTURE_MAX / widestSpan)`, so one island (234
// ground units) gets the authored 3.000 samples per ground unit and a thirty-five-island forest
// (~3,500) gets 0.585 — 5.1x coarser in each axis, against parcels whose mean diameter is 16.57.
// The contact pool under a story tree stops being a soft round shadow and becomes a shrunken
// jagged blob, and it does so PRECISELY WHEN THE MAP BECOMES THE REAL MAP.
//
// ⚠ THE INCREMENT WAS PARKED AS A FORK RATHER THAN A FIX, and this page is what turns the fork
// into numbers. The two remedies it named trade against different things, and it named a third
// nobody had costed:
//
//   A `raised`     — lift the texture cap until the authored resolution is delivered. Spends the
//                    memory the cap was written to protect, on a field that is empty almost
//                    everywhere (`occlusionCoverage` 0.16% on the forest against 3.11% on one
//                    island).
//   B `per-island` — one field per island. Keeps the resolution AND the memory, and gives up the
//                    one-material property `the forest's ground is ONE draw call` rests on: a
//                    per-island field is a per-island material is a draw call per island.
//   C `atlas`      — ONE field, allocated over the UNION of the islands rather than the rect that
//                    contains them, with each island packed at the authored resolution and the
//                    sea between them left out of the allocation. This is the third remedy the
//                    increment named and nobody had costed; `src/shadow-atlas.ts` is it.
//
// AND `clamped` IS THE CONTROL — the map exactly as it drew until this increment landed. Without
// it every arm above is a picture of something better than a thing nobody photographed. ⚠ The
// shipped canvas moved to `atlas` in the same landing (`ForestWorldCanvas.tsx`), so this arm is a
// picture of the PAST rather than of the present, and it is kept for the reason the blooms page
// keeps its own: "we avoided a misreport" is not something a reader can check without seeing it.
//
// ⚠⚠ THE PIXEL TRAP THIS PAGE IS BUILT AROUND, AND IT HAS ALREADY BITTEN THIS ARC ONCE. A
// comparison at the OVERVIEW zoom cannot falsify a per-object claim: at 8 delivered px per ground
// unit a whole island is 1,872 px and a contact pool is about 100, but at the `fit` zoom the
// forest is ~3,500 units in 1,280 px and a pool is a third of a pixel — so two arms whose shadows
// differ completely come back BYTE-IDENTICAL. `shipped-blooms-scene.ts` produced exactly that pair
// of files. So every arm here is compared at 8 AND at {@link CLOSE_ZOOM}, where one story tree's
// pool is ~250 px across, and the driver reports the pool's delivered width in pixels beside each
// comparison so a null result can be read as a null result rather than as agreement.
//
// ⚠ THE PAGE ITSELF ADOPTS NOTHING. `harness/` only: it produces EVIDENCE about `src/` modules it
// imports and changes none of them. The ADOPTION is a separate edit in the same landing —
// `ForestWorldCanvas.tsx` now builds `buildAtlasOcclusion`, because the numbers below settle
// option A out on memory and hardware and leave C holding the property the arc already committed
// to (`the forest's ground is ONE draw call`).

import * as THREE from 'three';

import {
  GROUND_ATLAS_ATTRIBUTE,
  GROUND_STATUS_ATTRIBUTE,
  createBandedGroundMaterial,
  groundAtlasTexture,
  groundShadowTexture,
  type BandedGroundMaterialOptions,
} from '../src/banded-ground-material.js';
import { cellGroundGeometry } from '../src/cell-ground-geometry.js';
import { buildGroundOcclusion } from '../src/contact-shade.js';
import { groundBounds } from '../src/ground-casters.js';
import { LAND_RELIEF_AMPLITUDE, landRelief } from '../src/land-relief.js';
import {
  SHADOW_GRES,
  SHADOW_TEXTURE_MAX,
  occlusionGres,
  occlusionGrid,
  shadowCoverage,
  type GroundBounds,
  type ShadowCaster,
} from '../src/land-shadow.js';
import {
  SHADOW_ATLAS_MAX,
  atlasBytes,
  atlasCoverage,
  atlasOriginResolver,
  buildAtlasOcclusion,
  islandGroundBounds,
  packShadowAtlas,
  UNHOMED_ISLAND,
} from '../src/shadow-atlas.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';
import { SHIPPED_LIGHTING } from './shipped-baseline.js';
import { CROWD_VIEWPORT } from './crowd-layout.js';
import {
  CROWD_ZOOMS,
  FIT_ZOOM,
  crowdCasters,
  crowdCells,
  crowdPxPerUnit,
  crowdSize,
  orientedCamera,
  type CrowdSize,
  type CrowdSizeId,
  type CrowdZoom,
} from './shipped-crowd-scene.js';
import { GROUND_TOKENS, groundRowOf, linearColourOf } from './shipped-land-scene.js';

/** The four compared arms plus the REFERENCE. `clamped` first because it is the control every
 *  other row is read against. */
export type ShadowArm = 'none' | 'clamped' | 'raised' | 'per-island' | 'atlas';

/** The arms the page COMPARES — {@link REFERENCE_ARM} is deliberately not one of them. */
export const SHADOW_ARMS: readonly ShadowArm[] = ['clamped', 'raised', 'per-island', 'atlas'];

/**
 * THE GROUND WITH NO OCCLUSION FIELD AT ALL — the map as it was until 2026-08-30.
 *
 * ⚠⚠ IT IS NOT A FIFTH OPTION, IT IS THE DENOMINATOR, and without it every number this page
 * prints about "how much the remedy moved" is quietly misleading. A contact pool is a small part
 * of a 2560 x 1600 frame, so the difference between a RAGGED pool and a ROUND one is a fraction of
 * a percent OF THE FRAME — a figure that reads as "nothing changed" while the two pictures beside
 * it are obviously different. Differencing an arm against this one counts the SHADOW's own pixels,
 * which is the denominator the question actually has.
 *
 * It is exact rather than approximate: an unshadowed material's ramp is the lit ladder and a
 * shadowed one REMAPS the lit rungs into a longer ladder, so a lit fragment delivers the same
 * colour under both (`banded-ground-material.ts` asserts that byte for byte). Every pixel that
 * differs between an arm and this reference is therefore a pixel the shadow darkened, and no other.
 */
export const REFERENCE_ARM: ShadowArm = 'none';

/** Every arm the page BUILDS, reference included. */
export const ALL_SHADOW_ARMS: readonly ShadowArm[] = [REFERENCE_ARM, ...SHADOW_ARMS];

export const SHADOW_ARM_CAPTION = {
  none: 'the reference — the same ground with NO occlusion field, as the map was until 2026-08-30',
  clamped: 'the map until 2026-08-31 — ONE field over the forest RECT, resolution clamped by the cap',
  raised: 'A — the same field with the texture cap lifted until the authored resolution lands',
  'per-island': 'B — one field, one material and one draw call PER ISLAND',
  atlas: 'C — ONE field packed over the islands themselves; one material, one draw call',
} satisfies Record<ShadowArm, string>;

/**
 * The cap the `raised` arm runs under.
 *
 * ⚠ IT IS A HARDWARE NUMBER, NOT A BUDGET. 16,384 is the `MAX_TEXTURE_SIZE` every desktop GPU
 * this arc has measured on reports, so it is the largest cap that answers "what if the budget
 * simply were not the constraint?" without asking a question the renderer would refuse. The
 * forest needs 10,515 texels on its long edge at the authored resolution, so this delivers
 * {@link SHADOW_GRES} exactly — and the page reports the renderer's OWN limit beside it, because
 * an arm that could not be uploaded on a visitor's machine is a finding rather than an option.
 */
export const RAISED_TEXTURE_MAX = 16384;

/** The sizes: one island, and the real forest's island count in its own status mix. The middle
 *  `forest-mono` size the ladder page needed is absent — status diversity cannot move an occlusion
 *  field, so a third row would cost a render and separate nothing. */
export const SHADOW_SIZES: readonly CrowdSize[] = [crowdSize('one'), crowdSize('forest')];

/**
 * A THIRD ZOOM, AND IT IS THE ONE THE COMPARISON ACTUALLY TURNS ON.
 *
 * The arc's two zooms are 2 and 8 delivered px per ground unit, and both are kept so a row here
 * reads against every committed figure. But a contact pool is about 12 ground units across: 24 px
 * at the overview and 96 at 8, where a 5.1x resolution difference is a soft edge going slightly
 * ragged. At 20 it is 240 px and the difference is the whole subject of the picture. A comparison
 * that could only be taken at a zoom where the object is small is a comparison that cannot come
 * back negative.
 */
export const CLOSE_ZOOM = 20;

/** Every NUMERIC zoom this page renders — the arc's two plus the close one. */
export const SHADOW_ZOOMS: readonly number[] = [...CROWD_ZOOMS, CLOSE_ZOOM];

/**
 * Every zoom including the FITTED one.
 *
 * ⚠ THE FITTED ZOOM IS TIMED HERE, WHERE THE LADDER PAGE NEXT DOOR REFUSES TO TIME IT, and the
 * difference is what is being compared. There, `fit` delivers a different px/unit per SIZE, so
 * timing it compared three different frames. Here every arm of one size shares that size's fit
 * — `fitPxPerUnit` reads the geometry, which is identical across arms — so an arm-to-arm
 * comparison at `fit` is exact. And it is the ONLY zoom where the whole forest is on screen, which
 * is the only place the per-island arm's thirty-five draw calls actually happen: without it the
 * arm's headline cost would never be measured at all.
 */
export const SHADOW_PICTURE_ZOOMS: readonly CrowdZoom[] = [...SHADOW_ZOOMS, FIT_ZOOM];

/** Ground units across a story tree's contact pool, near enough for the pixel check below — the
 *  crown radius the shipped caster uses, doubled, plus the pool's own spread. It is a SIZING
 *  number for "is the object big enough to photograph", never a claim about the shadow's shape. */
export const POOL_GROUND_WIDTH = 24;

/**
 * WHAT A FIELD COSTS UNDER ONE ARM, WITHOUT BUILDING IT.
 *
 * ⚠ ARITHMETIC ONLY — no `Uint8Array`, no stamp, no upload. That is what lets the node tests hold
 * every claim on this page's numbers at a cost the mutation rung can afford: `check:mutation-diff`
 * runs the covering tests ONCE PER MUTANT, and the `raised` arm's field alone is 72 MB to
 * allocate three times over. A witness that built it would be scored as a timeout, which the rung
 * reports as UNPROVEN in the same words an attribution gap produces.
 */
export interface ShadowPlan {
  arm: ShadowArm;
  /** Delivered samples per ground unit — the number the whole increment is about. */
  gres: number;
  /** How many occlusion textures the scene uploads. */
  textures: number;
  /** Their total size in bytes (single-channel, so one byte per texel). */
  textureBytes: number;
  /** The largest single texture edge — what a renderer's `MAX_TEXTURE_SIZE` has to cover. */
  widestEdge: number;
  /** Ground meshes, i.e. draw calls for the land. */
  meshes: number;
  /** Extra VERTEX bytes this arm adds over the shipped buffer. Only the atlas has any: a vec2
   *  per vertex, which is the price of carrying the per-island tile corner on the mesh. */
  attributeBytes: number;
}

/** Vertices in a merged ground buffer, from its triangle count. Non-indexed, three per triangle
 *  — named because the attribute arithmetic below would otherwise read as a magic 3. */
export function groundVertices(triangles: number): number {
  return triangles * 3;
}

export function shadowPlan(arm: ShadowArm, cells: readonly InstanceDescriptor[], triangles: number): ShadowPlan {
  const bounds = groundBounds(cells);
  if (bounds === null) throw new Error('shipped-shadow-scene: these cells bound nothing');
  const islands = islandGroundBounds(cells);

  if (arm === 'none') {
    // No field, so no resolution — ZERO rather than {@link SHADOW_GRES}, because "the authored
    // resolution" is a claim about a field and this arm has none. A number that read 3.000 here
    // would sit in the table looking like an arm that solved the problem for free.
    return {
      arm,
      gres: 0,
      textures: 0,
      textureBytes: 0,
      widestEdge: 0,
      meshes: 1,
      attributeBytes: 0,
    };
  }

  if (arm === 'atlas') {
    const layout = packShadowAtlas(islands, SHADOW_GRES, SHADOW_ATLAS_MAX);
    return {
      arm,
      gres: layout.gres,
      textures: 1,
      textureBytes: atlasBytes(layout),
      widestEdge: Math.max(layout.w, layout.h),
      meshes: 1,
      // A vec2 of float32 per vertex — the ONLY per-vertex cost any arm here carries.
      attributeBytes: groundVertices(triangles) * 2 * 4,
    };
  }

  if (arm === 'per-island') {
    let bytes = 0;
    let widest = 0;
    for (const island of islands) {
      const grid = occlusionGrid(island.bounds, SHADOW_GRES, SHADOW_TEXTURE_MAX);
      bytes += grid.w * grid.h;
      widest = Math.max(widest, grid.w, grid.h);
    }
    return {
      arm,
      // Every island is small enough for the authored resolution on its own — which is the whole
      // premise of this arm, so it is READ back off the grids rather than asserted.
      gres: islands.length === 0 ? SHADOW_GRES : occlusionGres(islands[0]!.bounds),
      textures: islands.length,
      textureBytes: bytes,
      widestEdge: widest,
      meshes: islands.length,
      attributeBytes: 0,
    };
  }

  const max = arm === 'raised' ? RAISED_TEXTURE_MAX : SHADOW_TEXTURE_MAX;
  const grid = occlusionGrid(bounds, SHADOW_GRES, max);
  return {
    arm,
    gres: grid.gres,
    textures: 1,
    textureBytes: grid.w * grid.h,
    widestEdge: Math.max(grid.w, grid.h),
    meshes: 1,
    attributeBytes: 0,
  };
}

/** Cells grouped by their own island id, in the packing's own order — so a per-island arm builds
 *  its meshes in the same order the atlas lays its tiles out and the two are comparable island for
 *  island. */
export function cellsByIsland(cells: readonly InstanceDescriptor[]): Map<string, InstanceDescriptor[]> {
  const out = new Map<string, InstanceDescriptor[]>();
  for (const island of islandGroundBounds(cells)) out.set(island.island, []);
  for (const cell of cells) {
    if ((cell.points ?? []).length === 0) continue;
    out.get(cell.island ?? UNHOMED_ISLAND)?.push(cell);
  }
  return out;
}

/** Casters standing inside a rect, padded — the per-island arm's own assignment, which is
 *  `assignCasters` applied one island at a time. */
export function castersWithin(
  bounds: GroundBounds,
  casters: readonly ShadowCaster[],
  pad = 2,
): ShadowCaster[] {
  return casters.filter(
    (c) =>
      c.x >= bounds.minX - pad &&
      c.x <= bounds.maxX + pad &&
      c.z >= bounds.minZ - pad &&
      c.z <= bounds.maxZ + pad,
  );
}

export interface ShadowLandScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  triangles: number;
  islands: number;
  casters: number;
  plan: ShadowPlan;
  /** How much of the delivered field is occluded past the material's threshold.
   *
   *  ⚠ NOT COMPARABLE ACROSS ARMS, and saying so is the point. The rect forms' denominator is
   *  mostly sea, so the SAME shadows read as a smaller fraction there than in a packed atlas or a
   *  per-island field. It is here to show each arm's field is not empty, never as a ranking. */
  occlusionCoverage: number;
}

/**
 * Build one arm of one crowd at one zoom.
 *
 * ⚠ EVERY ARM SHARES THE LADDER, THE GRAIN, THE RELIEF, THE PARCELS, THE LIGHT AND THE CAMERA.
 * The only thing that moves is how the occlusion field is allocated and how many meshes carry it,
 * which is what makes a pixel difference between two arms attributable to the remedy rather than
 * to anything else on the page.
 */
export function buildShadowScene(arm: ShadowArm, size: CrowdSize, zoom: CrowdZoom): ShadowLandScene {
  const cells = crowdCells(size);
  const casters = crowdCasters(size);
  const bounds = groundBounds(cells);
  if (bounds === null) throw new Error('shipped-shadow-scene: the crowd bounds nothing');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SHIPPED_LIGHTING.background);

  let triangles = 0;
  let coverage = 0;

  if (arm === 'per-island') {
    // B: ONE MESH PER ISLAND. Each island's own bounds, so each gets the authored resolution —
    // and each gets its own material, which is the cost the arm exists to price.
    let occluded = 0;
    let samples = 0;
    for (const [island, group] of cellsByIsland(cells)) {
      const islandBounds = groundBounds(group);
      if (islandBounds === null) continue;
      const geo = cellGroundGeometry({
        cells: group,
        resolve: linearColourOf,
        index: groundRowOf,
        relief: landRelief,
      });
      const field = buildGroundOcclusion({
        bounds: islandBounds,
        relief: LAND_RELIEF_AMPLITUDE,
        casters: castersWithin(islandBounds, casters),
      });
      occluded += shadowCoverage(field) * field.data.length;
      samples += field.data.length;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
      geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));
      const material = createBandedGroundMaterial({
        tokens: GROUND_TOKENS,
        grain: 'normal',
        shadow: groundShadowTexture(field),
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `island-${island}`;
      scene.add(mesh);
      triangles += geo.triangles;
    }
    coverage = samples === 0 ? 0 : occluded / samples;
  } else {
    const opts: BandedGroundMaterialOptions = { tokens: GROUND_TOKENS, grain: 'normal' };
    const geoInput = {
      cells,
      resolve: linearColourOf,
      index: groundRowOf,
      relief: landRelief,
    };
    const geo =
      arm === 'atlas'
        ? cellGroundGeometry({
            ...geoInput,
            atlasOrigin: atlasOriginResolver(
              packShadowAtlas(islandGroundBounds(cells), SHADOW_GRES, SHADOW_ATLAS_MAX),
            ),
          })
        : cellGroundGeometry(geoInput);
    triangles = geo.triangles;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(geo.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(geo.normals, 3));
    geometry.setAttribute(GROUND_STATUS_ATTRIBUTE, new THREE.BufferAttribute(geo.statuses, 1));

    if (arm === 'atlas') {
      const field = buildAtlasOcclusion({
        cells,
        relief: LAND_RELIEF_AMPLITUDE,
        casters,
        gres: SHADOW_GRES,
        max: SHADOW_ATLAS_MAX,
      });
      geometry.setAttribute(GROUND_ATLAS_ATTRIBUTE, new THREE.BufferAttribute(geo.atlasOrigins, 2));
      opts.shadowAtlas = groundAtlasTexture(field);
      coverage = atlasCoverage(field);
    } else if (arm === 'none') {
      // Nothing at all — an absent `shadow` leaves the generated shader byte-identical to the one
      // the map compiled before the occlusion field existed, which is what makes this a reference
      // rather than a fifth treatment.
      coverage = 0;
    } else {
      const field = buildGroundOcclusion({
        bounds,
        relief: LAND_RELIEF_AMPLITUDE,
        casters,
        max: arm === 'raised' ? RAISED_TEXTURE_MAX : SHADOW_TEXTURE_MAX,
      });
      opts.shadow = groundShadowTexture(field);
      coverage = shadowCoverage(field);
    }
    scene.add(new THREE.Mesh(geometry, createBandedGroundMaterial(opts)));
  }

  // The banded material is unlit — it computes its own lambert against the authored
  // LIGHT_DIRECTION — so these reach nothing. They are here because the scene the product builds
  // has them, and a scene that dropped them would differ from it in two things.
  scene.add(new THREE.AmbientLight(0xffffff, SHIPPED_LIGHTING.ambientIntensity));
  const sun = new THREE.DirectionalLight(0xffffff, SHIPPED_LIGHTING.directionalIntensity);
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
    triangles,
    islands: size.islands,
    casters: casters.length,
    plan: shadowPlan(arm, cells, triangles),
    occlusionCoverage: coverage,
  };
}

export interface ShadowReading {
  arm: ShadowArm;
  size: CrowdSizeId;
  pxPerUnit: number;
  width: number;
  height: number;
  triangles: number;
  islands: number;
  casters: number;
  gres: number;
  textures: number;
  textureBytes: number;
  widestEdge: number;
  meshes: number;
  attributeBytes: number;
  occlusionCoverage: number;
  /** Draw calls the renderer actually SUBMITTED for this frame.
   *
   *  ⚠⚠ IT IS NOT {@link ShadowPlan.meshes}, AND THE GAP IS A FINDING THIS PAGE FOUND RATHER THAN
   *  EXPECTED. One mesh has ONE bounding sphere, so a forest built as a single buffer is submitted
   *  whole at every zoom — all thirty-five islands, including the thirty-four off screen. Thirty-five
   *  meshes have thirty-five bounding spheres, so three CULLS them: at the close zoom the per-island
   *  arm submits ONE draw and one island's triangles, where the one-mesh arms submit one draw and
   *  the whole forest's. The increment parked this arm as "gives up the one-draw ground"; that is
   *  true only where the whole forest is on screen, and this is the number that says so. */
  drawCalls: number;
  /** Triangles the renderer actually submitted — the other half of the same finding, and the half
   *  that moves. A culled island costs neither a draw nor a triangle. */
  trianglesSubmitted: number;
  /** Median GPU nanoseconds for one render, or null if the timer never resolved. */
  gpuNs: number | null;
  batch: number;
}

export interface ShadowRunner {
  identity(): RendererIdentity;
  /** The renderer's OWN texture-edge limit. The `raised` arm is only an option on a machine whose
   *  limit covers {@link ShadowPlan.widestEdge}, and asserting that from a table of typical values
   *  would be exactly the kind of inherited number this arc keeps having to re-measure. */
  maxTextureSize(): number;
  warm(): void;
  geometry(arm: ShadowArm, size: CrowdSizeId, zoom: CrowdZoom): Omit<ShadowReading, 'gpuNs' | 'batch'>;
  /** Percentage of pixels differing between two arms at the same size and zoom. */
  changedPct(a: ShadowArm, b: ShadowArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  /**
   * How many pixels this arm's SHADOW covers — differenced against {@link REFERENCE_ARM}.
   *
   * ⚠⚠ IT IS THE DENOMINATOR EVERY OTHER PIXEL NUMBER ON THIS PAGE NEEDS. A pool is a small
   * part of a 2560 x 1600 frame, so "0.31% of the frame changed" reads as nothing at all while the
   * two pictures beside it are visibly different objects. Divided by this, the same measurement
   * says what fraction of the SHADOW moved, which is the question.
   */
  shadowPixels(arm: ShadowArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  /** Pixels differing between two arms — the count {@link changedPct} reports as a percentage. */
  changedPixels(a: ShadowArm, b: ShadowArm, size: CrowdSizeId, zoom: CrowdZoom): number;
  snapshot(arm: ShadowArm, size: CrowdSizeId, zoom: CrowdZoom): string;
  time(arm: ShadowArm, size: CrowdSizeId, zoom: CrowdZoom, batch: number): Promise<ShadowReading>;
  dispose(): void;
}

const GPU_TIMER = 'EXT_disjoint_timer_query_webgl2';

/** Wait for one timer query's result, or give up. The same eleven lines as the two pages next
 *  door, and a copy for the reason they give: the shared helper sits beside fixtures this page
 *  does not use. */
async function elapsedNs(gl: WebGL2RenderingContext, query: WebGLQuery): Promise<number | null> {
  for (let i = 0; i < 600; i += 1) {
    if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) === true) {
      return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  return null;
}

export function createShadowRunner(): ShadowRunner {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER) as { TIME_ELAPSED_EXT: number } | null;
  const identity = readIdentity(gl);
  const maxEdge = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

  // ⚠ CACHED PER (arm, size, zoom), AND ON THIS PAGE THAT IS NOT ONLY ABOUT THE TRIANGULATION.
  // The `raised` arm allocates a 72 MB field and merges two of them index for index; rebuilding it
  // inside the sweep would time several seconds of main-thread arithmetic as though it were a
  // frame, and would report the arm that keeps the resolution as catastrophically slow for a
  // reason that has nothing to do with rendering.
  const built = new Map<string, ShadowLandScene>();
  const sceneFor = (arm: ShadowArm, size: CrowdSizeId, zoom: CrowdZoom): ShadowLandScene => {
    const key = `${arm}|${size}|${String(zoom)}`;
    const found = built.get(key);
    if (found) return found;
    const made = buildShadowScene(arm, crowdSize(size), zoom);
    built.set(key, made);
    return made;
  };

  const render = (arm: ShadowArm, size: CrowdSizeId, zoom: CrowdZoom): ShadowLandScene => {
    const s = sceneFor(arm, size, zoom);
    renderer.setSize(s.width, s.height, false);
    renderer.render(s.scene, s.camera);
    return s;
  };

  const readFrame = (s: ShadowLandScene): Uint8Array => {
    const px = new Uint8Array(s.width * s.height * 4);
    gl.readPixels(0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };

  const diffCount = (first: Uint8Array, second: Uint8Array): number => {
    let differing = 0;
    for (let i = 0; i < first.length; i += 4) {
      if (
        first[i] !== second[i] ||
        first[i + 1] !== second[i + 1] ||
        first[i + 2] !== second[i + 2]
      ) {
        differing += 1;
      }
    }
    return differing;
  };

  const diff = (first: Uint8Array, second: Uint8Array): number =>
    (diffCount(first, second) / (first.length / 4)) * 100;

  const shape = (
    s: ShadowLandScene,
    arm: ShadowArm,
    size: CrowdSizeId,
  ): Omit<ShadowReading, 'gpuNs' | 'batch'> => ({
    arm,
    size,
    pxPerUnit: s.pxPerUnit,
    width: s.width,
    height: s.height,
    triangles: s.triangles,
    islands: s.islands,
    casters: s.casters,
    gres: s.plan.gres,
    textures: s.plan.textures,
    textureBytes: s.plan.textureBytes,
    widestEdge: s.plan.widestEdge,
    meshes: s.plan.meshes,
    attributeBytes: s.plan.attributeBytes,
    occlusionCoverage: s.occlusionCoverage,
    drawCalls: renderer.info.render.calls,
    trianglesSubmitted: renderer.info.render.triangles,
  });

  return {
    identity: () => identity,
    maxTextureSize: () => maxEdge,

    // THE COLD START IS PAID ONCE, OUTSIDE THE SWEEP. The first render of any configuration
    // compiles shaders and uploads buffers, and leaving that inside the timing is what made an
    // earlier instrument on this arc report a heavier scene as faster than a lighter one.
    warm() {
      for (const size of SHADOW_SIZES) {
        for (const zoom of SHADOW_PICTURE_ZOOMS) {
          for (const arm of ALL_SHADOW_ARMS) render(arm, size.id, zoom);
        }
      }
      gl.finish();
    },

    geometry(arm, size, zoom) {
      return shape(render(arm, size, zoom), arm, size);
    },

    changedPct(a, b, size, zoom) {
      return diff(readFrame(render(a, size, zoom)), readFrame(render(b, size, zoom)));
    },

    changedPixels(a, b, size, zoom) {
      return diffCount(readFrame(render(a, size, zoom)), readFrame(render(b, size, zoom)));
    },

    shadowPixels(arm, size, zoom) {
      return diffCount(
        readFrame(render(arm, size, zoom)),
        readFrame(render(REFERENCE_ARM, size, zoom)),
      );
    },

    snapshot(arm, size, zoom) {
      render(arm, size, zoom);
      return canvas.toDataURL('image/png');
    },

    async time(arm, size, zoom, batch) {
      const s = render(arm, size, zoom);
      const base = shape(s, arm, size);
      if (!timer) return { ...base, gpuNs: null, batch };
      const query = gl.createQuery();
      if (!query) return { ...base, gpuNs: null, batch };
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      for (let i = 0; i < batch; i += 1) renderer.render(s.scene, s.camera);
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      const ns = await elapsedNs(gl, query);
      gl.deleteQuery(query);
      return { ...base, gpuNs: ns === null ? null : ns / batch, batch };
    },

    dispose() {
      renderer.dispose();
    },
  };
}

/** Mount the page: the forest fitted to a screen for context, then every arm at every zoom, with
 *  the runner on `window` for the driver to reach. */
export function mountShippedShadow(root: HTMLElement): void {
  const runner = createShadowRunner();
  runner.warm();
  const id = runner.identity();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent =
    `${id.vendor} — ${id.renderer} · software=${id.software} · timerQuery=${id.timerQuery}` +
    ` · MAX_TEXTURE_SIZE=${runner.maxTextureSize()}`;
  root.appendChild(head);

  // THE CONTEXT PICTURE — never timed (`fit` delivers a different px/unit per scene), and never
  // the comparison either: at this zoom a contact pool is a third of a pixel, so all four arms
  // look identical here BY CONSTRUCTION. It is on the page so a reader knows what is being
  // photographed further down, with that warning attached.
  const overview = document.createElement('h2');
  overview.textContent =
    'the whole forest, fitted to a laptop screen — CONTEXT ONLY: a contact pool is sub-pixel here';
  root.appendChild(overview);
  const overviewRow = document.createElement('div');
  overviewRow.className = 'row';
  for (const arm of ALL_SHADOW_ARMS) {
    const s = buildShadowScene(arm, crowdSize('forest'), FIT_ZOOM);
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = runner.snapshot(arm, 'forest', FIT_ZOOM);
    img.width = 620;
    const cap = document.createElement('figcaption');
    cap.textContent =
      `${arm} · ${s.pxPerUnit.toFixed(2)} px/unit · pool ≈ ` +
      `${(POOL_GROUND_WIDTH * s.pxPerUnit).toFixed(1)} px — ${SHADOW_ARM_CAPTION[arm]}`;
    fig.append(img, cap);
    overviewRow.appendChild(fig);
  }
  root.appendChild(overviewRow);

  for (const zoom of SHADOW_ZOOMS) {
    for (const size of SHADOW_SIZES) {
      const h2 = document.createElement('h2');
      h2.textContent =
        `${zoom} delivered px per ground unit — ${size.what} · ` +
        `a contact pool is ≈ ${(POOL_GROUND_WIDTH * zoom).toFixed(0)} px wide here`;
      root.appendChild(h2);
      const row = document.createElement('div');
      row.className = 'row';
      for (const arm of ALL_SHADOW_ARMS) {
        const s = buildShadowScene(arm, size, zoom);
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.src = runner.snapshot(arm, size.id, zoom);
        img.width = 620;
        const cap = document.createElement('figcaption');
        cap.textContent =
          `${arm} · ${s.plan.gres.toFixed(3)} samples/unit · ` +
          `${s.plan.textures} texture(s), ${(s.plan.textureBytes / 1024 / 1024).toFixed(2)} MB · ` +
          `${s.plan.meshes} mesh(es) · +${(s.plan.attributeBytes / 1024 / 1024).toFixed(2)} MB vertex`;
        fig.append(img, cap);
        row.appendChild(fig);
      }
      root.appendChild(row);
    }
  }

  window.shadowRunner = runner;
}

/** The runner the driver reaches for. A DECLARED GLOBAL rather than a cast at the assignment: an
 *  `as unknown as { … }` chain is the discarded-evidence shape the house TypeScript standard
 *  refuses, and it would let the property's type drift from the interface above. */
declare global {
  // eslint-disable-next-line no-var
  var shadowRunner: ShadowRunner;
}
