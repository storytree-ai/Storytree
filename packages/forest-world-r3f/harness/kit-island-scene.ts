// kit-island-scene.ts — THE COMPARISON PAGE: one island, three arms, two zooms.
//
// The question this page exists to answer is the owner's own, from 2026-08-27: "keep scaling
// this up until we confidently can replace the whole map." Nine bought pines on bare ground
// answered it for one asset. This answers it for a WHOLE ISLAND — the real 13-hex research
// surface, its eleven capabilities, its own ten UAT criteria — dressed out of the kit's real
// vocabulary, beside the same island as it is dressed today.
//
// THE ARMS, differing in the PROP VOCABULARY and nothing else:
//
//   bare    the island with nothing standing on it — the control both dressings are read against
//   today   the island's own procedural props: the `wild` composition, its canopy lathes,
//           its plants and its flower markers
//   kit     the same island, the same ground, dressed from `dressing-kit.glb` — pines for
//           contracts, standing dead wood for an unhealthy capability, undergrowth for one that
//           is not built yet, rocks for drift, logs for retired work, blooms for signed criteria
//
// ⚠ IT IS NOT ON `island.html`, AND THAT IS STRUCTURAL. `capture.mjs` refuses an off-palette
// pixel, and a textured asset is off-palette by construction — the same reason `grain.html` and
// `pine.html` have pages of their own.
//
// ⚠ AND IT ADOPTS NOTHING. `harness/` only; ADR-0406 D2 and ADR-0380 D6 stand in full.

import * as THREE from 'three';


import { composeIsland, sharedRenderer } from './IslandView.js';
import type { IslandViewProps } from './IslandView.js';
import { configureExactColour } from './banded-material.js';
import { LAND_RELIEF_AMPLITUDE } from './land-definition.js';
import { awaitQuery, readIdentity } from './frame-cost-scene.js';
import type { DisjointTimerQuery, RendererIdentity } from './frame-cost-scene.js';
import { GPU_TIMER_EXTENSION } from './frame-cost.js';
import { islandScene } from './island-fixture.js';
import { leafTintGainFor, tintDeliveries } from './leaf-tint.js';
import type { TintDelivery } from './leaf-tint.js';
import {
  KIT_ASSET_URL,
  LEAF_MATERIALS,
  kitLights,
  kitMeshes,
  loadKit,
  placementExtent,
  roleFootprints,
} from './kit-scene.js';
import type { LoadedKit } from './kit-scene.js';
import {
  FOOTPRINT_TOLERANCE,
  KIT_FOOTPRINTS_2026_08_29,
  KIT_ROLES,
  KIT_ROLE_SIZE,
  KIT_ROLE_SIGNAL,
  clearsObjectFloor,
  deliveredRolePx,
  dressIslandFromKit,
  dressingCensus,
  dressingOverlaps,
} from './kit-vocabulary.js';
import type { KitPlacement, KitRole, PropOverlap, RoleFootprints } from './kit-vocabulary.js';
import { calibrateLights } from './pine-scene.js';
import type { LightCalibration } from './pine-scene.js';

/**
 * THE FOUR ARMS, and the reason there are four rather than three.
 *
 * The owner's 2026-08-29 answer moved TWO things at once — what stands on a parcel, and whose
 * state the ground carries — so a single before/after would show both moving together and settle
 * neither. Each step below differs from its neighbour in exactly one thing (ADR-0392 D1's own
 * standard, and the shape PR #1665 landed that the owner endorsed):
 *
 *   bare   per-capability land, nothing standing on it — the control the map has always had
 *   today  per-capability land + the island's own procedural props — WHAT THE MAP DOES TODAY
 *   land   ISLAND-UNIFORM land, nothing standing on it — the land change, alone
 *   kit    island-uniform land + one tinted bought object per capability — THE PROPOSAL
 *
 * `bare` -> `land` is the ground moving. `land` -> `kit` is the props arriving. `today` is the
 * incumbent both are read against.
 */
export type KitArm = 'bare' | 'today' | 'land' | 'kit';
export const KIT_ARMS: readonly KitArm[] = ['bare', 'today', 'land', 'kit'];

/** The two zooms every land measurement on this arc is taken at. */
export const ZOOMS: readonly number[] = [2, 8];

/**
 * ✅ THERE ARE NO SUPPLIED SIGNALS ANY MORE, and the absence is worth a line because it used to
 * be a constant here. PR #1693's dressing had two roles — rocks for drift, logs for retired
 * contracts — reading from numbers this database-less fixture cannot compute, so they were
 * handed in explicitly rather than defaulted to something plausible. Both roles were WITHDRAWN
 * by the owner on 2026-08-29. Every prop on this island is now read off the scene's own data,
 * so there is nothing left to demonstrate and `kit-vocabulary.test.ts` asserts it stays that way.
 */

/**
 * The island every arm is drawn on. One capability is deliberately unhealthy and one is
 * building, so the dressing's status-dependent arms are visible rather than merely tested —
 * a labelled deviation, exactly as `island-fixture.ts`'s own `oddOneOut` is.
 */
export const ISLAND = {
  oddOnesOut: [
    { index: 4, status: 'unhealthy' as const },
    { index: 7, status: 'building' as const },
    { index: 9, status: 'unknown' as const },
  ],
} as const;

/**
 * The land treatment every arm shares. It is the arc's endorsed one — relief, the material rim,
 * regional ground variation and the grain octave — so the pictures are of the land the owner
 * approved, and the only thing that moves between arms is what stands on it.
 */
const BASE: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit'> = {
  land: 'full',
  contact: true,
  shadow: 'canopy',
  edge: 'material',
  wallDepth: 8,
  ground: 'regional',
  style: 'foliage',
  tree: false,
  island: ISLAND,
  grain: { mode: 'both' },
};

/** What each arm adds. The kit arm's objects are built fresh per call — an `Object3D` belongs to
 *  one scene at a time, so sharing them across panels would silently empty the earlier one. */
function armProps(
  arm: KitArm,
  pxPerUnit: number,
  kit: LoadedKit | null,
  cal: LightCalibration | null,
  grain: boolean = true,
): IslandViewProps {
  const base: IslandViewProps = { ...BASE, pxPerUnit, displayPxPerUnit: pxPerUnit };
  if (!grain) delete base.grain;
  if (arm === 'bare') return { ...base, plants: false, flowers: false };
  if (arm === 'today') return { ...base, dressing: 'wild' };
  // The two new arms share the land change; only `kit` also stands anything on it, which is what
  // makes the pair isolate the ground from the props.
  const uniform: IslandViewProps = { ...base, landState: 'island', plants: false, flowers: false };
  if (arm === 'land') return uniform;
  if (!kit || !cal) throw new Error('kit-island: the kit arm was asked for before the kit loaded');
  return { ...uniform, extra: [...kitMeshes(kit, placements(kit)), ...kitLights(cal)] };
}

let cachedPlacements: KitPlacement[] | null = null;

/**
 * Where every prop stands, built once.
 *
 * ⚠ THE RELIEF IS THE ONE THE GROUND IS ACTUALLY BUILT AT. `BASE.land` is `'full'`, and
 * `composeIsland` reads that as `amplitude ?? LAND_RELIEF_AMPLITUDE` — so a dressing computed
 * at any other amplitude would sample a landscape the island does not have and every prop would
 * float or sink by the difference.
 *
 * ⚠ THE FOOTPRINTS COME FROM THE LOADED KIT, not from the frozen literal. A pine's canopy is as
 * wide as its own geometry says once scaled to its role's height, and the placement search keeps
 * props apart BY those widths — so a kit re-exported with a different tree would silently place
 * against the wrong clearances if this restated a number. `footprintDrift` below is what checks
 * the two against each other.
 */
export function placements(kit: LoadedKit): KitPlacement[] {
  cachedPlacements ??= dressIslandFromKit({
    scene: islandScene(ISLAND),
    island: ISLAND,
    relief: LAND_RELIEF_AMPLITUDE,
    footprint: roleFootprints(kit),
  });
  return cachedPlacements;
}

/**
 * WHERE THE LOADED KIT'S OWN FOOTPRINTS DISAGREE WITH THE FROZEN LITERAL, beyond tolerance.
 *
 * The pure tests dress at `KIT_FOOTPRINTS_2026_08_29` because they have no GPU to load an asset
 * with, so every placement assertion in `kit-vocabulary.test.ts` is made against that table. This
 * is the leg that ties it to the asset: a re-export that changed a tree's proportions would move
 * every placement on every island, and the node tests would keep passing against the old numbers.
 */
export function footprintDrift(kit: LoadedKit): string[] {
  const measured = roleFootprints(kit);
  const out: string[] = [];
  for (const role of KIT_ROLES) {
    const want = KIT_FOOTPRINTS_2026_08_29[role];
    const got = measured[role];
    if (Math.abs(got - want) / want > FOOTPRINT_TOLERANCE) {
      out.push(
        `${role}: the loaded kit occupies ${got.toFixed(3)} ground units, ` +
          `KIT_FOOTPRINTS_2026_08_29 declares ${want} — the pure tests placed against the wrong ` +
          'clearances, so re-measure and update the literal',
      );
    }
  }
  return out;
}

// ------------------------------------------------------------------ what the page reports

export interface KitPayload {
  asset: string;
  /** Bytes as fetched, read off the response rather than transcribed. */
  wireBytes: number;
  /** Decoded bytes the GPU holds, mipmaps included. */
  gpuBytes: number;
  /** DISTINCT kit objects — what the payload actually scales with. */
  distinctObjects: number;
  materials: string[];
  triangles: number;
  textures: Array<{ name: string; width: number; height: number }>;
  /** How many props stand on the island, by role, and what each delivers at both zooms. */
  roles: Array<{
    role: KitRole;
    signal: string;
    count: number;
    sizedBy: 'height' | 'width';
    worldHeight: number;
    worldWidth: number;
    /** What it delivers along the axis it is sized by, at each zoom. */
    deliveredPx: Record<string, number>;
    /** Does it clear the ~10 device-pixel object floor at the overview? */
    clearsFloor: boolean;
  }>;
  totalProps: number;
  /** How many props of each (role, tint) the island grew — the census the vocabulary produces. */
  census: Record<string, number>;
  /**
   * PROPS STANDING CLOSER THAN THEIR OWN FOOTPRINTS ALLOW — the defect the owner reported,
   * reported by the picture's own driver rather than by eye. Empty is the claim.
   */
  overlaps: PropOverlap[];
  /** The kit's own footprints, and where they disagree with the frozen literal. */
  footprints: RoleFootprints;
  footprintDrift: string[];
  /**
   * WHAT EACH DECLARED TINT DELIVERS over the leaf material's own base-colour mean.
   *
   * ⚠ `lumaRatio` IS THE ONE TO READ. A leaf tint rotates a map's hue and may NOT change its
   * value (`leaf-tint.ts`), because the failure the colour guard exists to catch is a map coming
   * out about 3.5x dark and looking deliberate — and a tint is a second multiplier on exactly
   * those pixels. Every row must sit at 1.
   */
  tintsByMaterial: Record<string, TintDelivery[]>;
  /** Each leaf material's own base-colour mean — what those tints were rotated FROM. */
  leafMeans: Record<string, { r: number; g: number; b: number }>;
}

export interface ArmReading {
  arm: KitArm;
  pxPerUnit: number;
  drawCalls: number;
  triangles: number;
  width: number;
  height: number;
  /** Median GPU nanoseconds for one frame, or null if the timer query gave no verdict. */
  gpuNs: number | null;
}

// ------------------------------------------------------------------ the runner

/** How many DISTINCT colours one arm delivered, and over how many pixels. */
export interface ColourReading {
  arm: KitArm;
  pxPerUnit: number;
  distinct: number;
  pixels: number;
}

export interface KitRunner {
  /** Draw every arm at every zoom once, untimed. */
  warm(): void;
  snapshot(arm: KitArm, pxPerUnit: number): string;
  colours(arm: KitArm, pxPerUnit: number): ColourReading;
  time(arm: KitArm, pxPerUnit: number, batch: number): Promise<ArmReading>;
  identity(): RendererIdentity;
  payload(): KitPayload;
}

export function createKitRunner(kit: LoadedKit, cal: LightCalibration, assetUrl: string): KitRunner {
  const { renderer, canvas } = sharedRenderer();
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const timer = gl.getExtension(GPU_TIMER_EXTENSION) as DisjointTimerQuery | null;

  const draw = (arm: KitArm, pxPerUnit: number, grain = true) => {
    // ⚠ THE RENDERER'S OWN CLEAR STATE IS LEFT ALONE. Every other island picture on this arc is
    // taken through `sharedRenderer` as it comes, and a page that set its own background would
    // be comparing its arms against a different backdrop than the committed pictures use.
    const composed = composeIsland(armProps(arm, pxPerUnit, kit, cal, grain));
    renderer.setSize(composed.bufW, composed.bufH, false);
    return composed;
  };

  return {
    /**
     * ⚠ THE COLD START IS PAID ONCE, OUTSIDE THE SWEEP. The first render of any configuration
     * compiles shaders and uploads textures; measured here, leaving that inside the sweep gave
     * the BARE island a spread of 19.5 ms against a median of 0.14 — a noise floor 139x the
     * figure, which made `frame-budget.ts` correctly report every arm's cost as UNRESOLVED.
     */
    warm() {
      for (const zoom of ZOOMS) {
        for (const arm of KIT_ARMS) {
          const composed = draw(arm, zoom);
          renderer.render(composed.scene3, composed.camera);
        }
      }
    },

    snapshot(arm, pxPerUnit) {
      const composed = draw(arm, pxPerUnit);
      renderer.render(composed.scene3, composed.camera);
      // ⚠ THE RENDERER'S OWN BUFFER, not an element screenshot. An element screenshot
      // composites the page background in opaque and has confounded two evidence pictures on
      // this arc already.
      return canvas.toDataURL('image/png');
    },

    /**
     * DID THE ARM ACTUALLY PUT SOMETHING ON THE ISLAND? Counted as distinct delivered colours.
     *
     * ⚠ THE BAR IS THE OTHER DRESSING'S OWN COUNT, IN THE SAME RUN. Every banded material
     * quantises onto four authored rungs, so a banded island delivers a handful of colours
     * however much is standing on it; a textured one delivers thousands. Comparing arms is what
     * makes the bar a measurement rather than a number someone picked.
     *
     * ⚠⚠ MEASURED WITH THE GRAIN OCTAVE OFF, and that is not a convenience. The grain mixes
     * toward a second colour per fragment, so a GRAINED banded island is not banded in delivered
     * colours at all: measured here, the bare island delivers 1,557 distinct colours with the
     * grain on and the whole separation this floor rests on disappears into it. The pictures
     * keep the grain — it is the arc's endorsed treatment — and only this floor turns it off, so
     * the count it compares is a count of what the PROPS added.
     *
     * ⚠ AND WHAT THIS ALONE CANNOT SAY, because PR #1686 learned it the expensive way: a
     * `MeshStandardMaterial` shading curved geometry delivers a smooth gradient whether or not
     * its maps bound, so a high count proves something NON-BANDED drew and NOT that it drew
     * textured. What closes that is the colour-convention probe, which judges this same asset's
     * delivered pixels against its own maps.
     *
     * It is also why this is not a pixel-difference against the bare arm: the arms are framed by
     * their own bounding boxes, so a dressed island's buffer is BIGGER than a bare one's, and
     * the first version of this check compared two differently sized frames and reported that
     * 100% of the pixels differed — in both arms, whatever they drew.
     */
    colours(arm, pxPerUnit) {
      const composed = draw(arm, pxPerUnit, false);
      renderer.render(composed.scene3, composed.camera);
      const px = new Uint8Array(composed.bufW * composed.bufH * 4);
      gl.readPixels(0, 0, composed.bufW, composed.bufH, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const seen = new Set<number>();
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3]! === 0) continue;
        seen.add((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!);
      }
      return { arm, pxPerUnit, distinct: seen.size, pixels: composed.bufW * composed.bufH };
    },

    async time(arm, pxPerUnit, batch) {
      const composed = draw(arm, pxPerUnit);
      // Warm the shaders OUTSIDE the timed batch. A fresh compile inside one is measured as the
      // frame's cost and is 100x it.
      renderer.render(composed.scene3, composed.camera);
      // ⚠ READ THE COUNTERS OFF THAT ONE RENDER, AND DO NOT DIVIDE. three resets `info.render`
      // at the top of every `render()` call, so after a batch of 20 the counter holds the LAST
      // frame's figures — dividing by the batch reported 0.45 draw calls for a nine-call frame.
      const drawCalls = renderer.info.render.calls;
      const triangles = renderer.info.render.triangles;

      let gpuNs: number | null = null;
      if (timer) {
        const query = gl.createQuery();
        if (query) {
          gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
          for (let i = 0; i < batch; i++) renderer.render(composed.scene3, composed.camera);
          gl.endQuery(timer.TIME_ELAPSED_EXT);
          const total = await awaitQuery(gl, query, 4000);
          const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT) === true;
          // ⚠ A DISJOINT SAMPLE IS DISCARDED, NEVER AVERAGED IN. The GPU has told us it was
          // interrupted; a number taken across that is not a frame time.
          gpuNs = total !== null && !disjoint ? total / batch : null;
          gl.deleteQuery(query);
        }
      } else {
        for (let i = 0; i < batch; i++) renderer.render(composed.scene3, composed.camera);
      }

      return { arm, pxPerUnit, drawCalls, triangles, width: composed.bufW, height: composed.bufH, gpuNs };
    },

    identity: () => readIdentity(gl),

    payload(): KitPayload {
      const all = placements(kit);
      const footprints = roleFootprints(kit);
      const roles: KitPayload['roles'] = [];
      for (const role of KIT_ROLES) {
        const mine = all.filter((p) => p.role === role);
        if (mine.length === 0) continue;
        const first = mine[0]!;
        const deliveredPx: Record<string, number> = {};
        for (const zoom of ZOOMS) deliveredPx[`${zoom}px`] = deliveredRolePx(role, zoom);
        const extent = placementExtent(kit, first);
        roles.push({
          role,
          signal: KIT_ROLE_SIGNAL[role],
          count: mine.length,
          sizedBy: KIT_ROLE_SIZE[role].axis,
          worldHeight: extent.height,
          worldWidth: extent.width,
          deliveredPx,
          clearsFloor: clearsObjectFloor(role),
        });
      }
      return {
        asset: assetUrl,
        wireBytes: kit.wireBytes,
        gpuBytes: kit.gpuBytes,
        distinctObjects: [...new Set(all.map((p) => p.assembly))].length,
        materials: kit.materials,
        triangles: kit.triangles,
        textures: kit.textures,
        roles,
        totalProps: all.length,
        census: dressingCensus(all),
        overlaps: dressingOverlaps(all, footprints),
        footprints,
        footprintDrift: footprintDrift(kit),
        tintsByMaterial: Object.fromEntries(
          [...kit.leafMeans].map(([name, mean]) => [name, tintDeliveries(mean)]),
        ),
        leafMeans: Object.fromEntries(kit.leafMeans),
      };
    },
  };
}

// ------------------------------------------------------------------ the page

declare global {
  interface Window {
    __stKitReady?: boolean;
    __stKitError?: string;
    __stKitWarm?: () => void;
    __stKitSnapshot?: (arm: KitArm, pxPerUnit: number) => string;
    __stKitColours?: (arm: KitArm, pxPerUnit: number) => ColourReading;
    __stKitTime?: (arm: KitArm, pxPerUnit: number, batch: number) => Promise<ArmReading>;
    __stKitIdentity?: () => RendererIdentity;
    __stKitPayload?: () => KitPayload;
  }
}

/**
 * Mount the three arms at both zooms, then publish the driver hooks.
 *
 * ⚠ `__stKitReady` IS SET LAST and a load failure RETHROWS. A page that came up ready with no
 * asset would be photographed as a very cheap, very empty island.
 */
export async function mountKitIsland(root: HTMLElement): Promise<void> {
  try {
    // The driver points this at one texture rung at a time; the page does not choose.
    const assetUrl = new URLSearchParams(location.search).get('kit') ?? KIT_ASSET_URL;
    const { renderer } = sharedRenderer();
    configureExactColour(renderer);
    const cal = calibrateLights(renderer);
    const kit = await loadKit(assetUrl);
    const runner = createKitRunner(kit, cal, assetUrl);

    for (const zoom of ZOOMS) {
      const row = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = `${zoom} px per ground unit — ${zoom === 2 ? 'the overview' : 'zoomed in'}`;
      row.appendChild(heading);
      const strip = document.createElement('div');
      strip.className = 'row';
      for (const arm of KIT_ARMS) {
        const figure = document.createElement('figure');
        const image = document.createElement('img');
        image.src = runner.snapshot(arm, zoom);
        image.style.imageRendering = 'pixelated';
        const caption = document.createElement('figcaption');
        caption.textContent = arm;
        figure.append(image, caption);
        strip.appendChild(figure);
      }
      row.appendChild(strip);
      root.appendChild(row);
    }

    window.__stKitWarm = () => runner.warm();
    window.__stKitSnapshot = (arm, pxPerUnit) => runner.snapshot(arm, pxPerUnit);
    window.__stKitColours = (arm, pxPerUnit) => runner.colours(arm, pxPerUnit);
    window.__stKitTime = (arm, pxPerUnit, batch) => runner.time(arm, pxPerUnit, batch);
    window.__stKitIdentity = () => runner.identity();
    window.__stKitPayload = () => runner.payload();
    window.__stKitReady = true;
  } catch (err) {
    window.__stKitError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}
