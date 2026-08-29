// crowd-scene.ts — THIRTY-FIVE ISLANDS IN ONE FRAME, four arms, two zooms.
//
// The question, in PR #1693's own words, attached as a caveat to its own recommendation to go
// ahead: *"nobody has seen a CROWD of these islands together, and that's exactly the kind of
// thing that looks fine on one and turns to soup on four hundred."*
//
// THE ARMS, differing in the PROP VOCABULARY and nothing else:
//
//   bare        the forest with nothing standing on it — the control the dressings are read
//               against, and the ceiling for how well the LAND alone can carry status
//   today       every island dressed as it is dressed today: the `wild` composition, its canopy
//               lathes, its plants and its flower markers
//   kit         every island dressed from `dressing-kit.glb`, merged PER ISLAND — the shape the
//               one-island page measured, repeated 35 times
//   kit-merged  the same props, the same pixels, merged ACROSS THE WHOLE FOREST in one pass
//
// ⚠ THE FOURTH ARM IS NOT A FOURTH DRESSING — IT IS THE SAME DRESSING WITH THE DRAW CALLS
// REARRANGED, and it is here because the hardware floor is DRAW-CALL bound, not fragment bound
// (`hardware-floor-is-draw-call-bound-not-fragment-bound`: 4x the fragments moved it 0%, removing
// the plants dropped it 97%). `kit` and `kit-merged` must deliver the SAME PICTURE — the driver
// refuses the run if they do not — so any cost between them is the merge granularity and nothing
// else. That is what makes it a measured remedy rather than a suggestion.
//
// ⚠ IT IS NOT ON `island.html` OR `directions.html`, and that is structural: `capture.mjs`
// refuses an off-palette pixel and a textured asset is off-palette by construction, which is the
// same reason `grain.html`, `pine.html` and `kit-island.html` each have a page of their own.
//
// ⚠ AND IT ADOPTS NOTHING. `harness/` only; ADR-0406 D2 and ADR-0380 D6 stand in full. This page
// produces EVIDENCE for a decision the owner holds, and takes none.

import * as THREE from 'three';

import { composeIsland, sharedRenderer } from './IslandView.js';
import type { IslandViewProps } from './IslandView.js';
import { ELEV_RAD, crowdLayout, fitZoom, neighbourhoodZoom } from './crowd-layout.js';
import type { CrowdIsland, CrowdLayout } from './crowd-layout.js';
import { LAND_RELIEF_AMPLITUDE } from './land-definition.js';
import { islandScene } from './island-fixture.js';
import { kitLights, kitMeshes, roleFootprints } from './kit-scene.js';
import type { LoadedKit } from './kit-scene.js';
import { dressIslandFromKit, dressingOverlaps } from './kit-vocabulary.js';
import type { KitPlacement, PropOverlap } from './kit-vocabulary.js';
import type { LightCalibration } from './pine-scene.js';

export type CrowdArm = 'bare' | 'today' | 'kit' | 'kit-merged';
export const CROWD_ARMS: readonly CrowdArm[] = ['bare', 'today', 'kit', 'kit-merged'];

/** The arms that must deliver the same pixels — the merge-granularity control pair. */
export const MERGE_CONTROL_PAIR: readonly [CrowdArm, CrowdArm] = ['kit', 'kit-merged'];

export type CrowdZoom = 'forest' | 'neighbourhood' | 'island';

/**
 * THE VIEWPORT EVERY CROWD PICTURE IS TAKEN IN — a 1280x800 CSS window at device-pixel-ratio 2,
 * i.e. an ordinary laptop. It is fixed across arms and zooms because the reader's SCREEN does not
 * change when the art does; only what fits inside it changes.
 *
 * ⚠ THIS IS THE THING THE ONE-ISLAND PAGES DO NOT HAVE. There, the buffer is sized to the island,
 * so "2 px per ground unit" is a property of the picture. Here the buffer is the reader's screen
 * and the px-per-unit falls out of how much forest has to fit in it — which is the only way the
 * crowd question can be asked honestly.
 */
export const CROWD_VIEWPORT = { w: 2560, h: 1600, dpr: 2 } as const;

/**
 * The land treatment every arm shares — the arc's endorsed one, and byte-for-byte the base
 * `kit-island-scene.ts` uses, so a crowd picture and a one-island picture are of the same land.
 */
const BASE: Omit<IslandViewProps, 'pxPerUnit' | 'displayPxPerUnit' | 'island'> = {
  land: 'full',
  contact: true,
  shadow: 'canopy',
  edge: 'material',
  wallDepth: 8,
  ground: 'regional',
  style: 'foliage',
  tree: false,
  grain: { mode: 'both' },
};

/**
 * ✅ NOTHING IS SUPPLIED TO THIS DRESSING ANY MORE. The two roles that read from numbers a
 * database-less fixture cannot compute — rocks for drift, logs for retired contracts — were
 * withdrawn by the owner on 2026-08-29, so every prop in this crowd is read off each island's own
 * scene. The constant that used to sit here is gone with them.
 */

/** One island's fixture options: the whole island in its own status. */
interface IslandOptions {
  status: CrowdIsland['status'];
}

function islandOptions(island: CrowdIsland): IslandOptions {
  return { status: island.status };
}

/**
 * MOVE A COMPOSED ISLAND TO WHERE IT STANDS IN THE FOREST.
 *
 * ⚠⚠ TRANSLATING THE GROUP IS NOT ENOUGH, AND GETTING THIS WRONG IS INVISIBLE IN A THUMBNAIL.
 * The banded material samples its occlusion field in WORLD space —
 * `uv = (vWorld.xz - uShadowRect.xy) * uShadowRect.zw` (`banded-material.ts:311-312`) — against a
 * rect built from the island's own ground bounds. Move the island and leave the rect alone and
 * every island but the one at the origin samples the shadow texture at the wrong offset: some
 * read off the end of it and come back unshaded, others wear a neighbour's shadow. At 35 islands
 * a few device pixels tall that reads as "the crowd looks a bit flat", which is exactly the
 * verdict this page exists to deliver — so it would have been reported as the ANSWER.
 *
 * The fix is one line, and it is safe because `composeIsland` builds fresh materials on every
 * call (only the shadow TEXTURE is cached, and its content is offset-independent).
 */
function offsetIsland(scene3: THREE.Scene, offset: { x: number; z: number }): THREE.Group {
  const group = new THREE.Group();
  group.position.set(offset.x, 0, offset.z);
  // `.slice()` rather than iterating `scene3.children` directly: `removeFromParent()` mutates that
  // array as we go, so iterating it live would skip every other child.
  for (const child of scene3.children.slice()) {
    child.removeFromParent();
    group.add(child);
    child.traverse((node) => {
      const material = (node as THREE.Mesh).material;
      for (const m of Array.isArray(material) ? material : [material]) {
        const rect = (m as THREE.ShaderMaterial | undefined)?.uniforms?.['uShadowRect'];
        if (rect && rect.value instanceof THREE.Vector4) {
          rect.value.x += offset.x;
          rect.value.y += offset.z;
        }
      }
    });
  }
  return group;
}

/** Where every prop on one island stands, in that island's OWN space. */
function islandPlacements(island: CrowdIsland, kit: LoadedKit): KitPlacement[] {
  const opts = islandOptions(island);
  return dressIslandFromKit({
    scene: islandScene(opts),
    island: opts,
    // ⚠ THE RELIEF THE GROUND IS ACTUALLY BUILT AT. `BASE.land` is `'full'`, which `composeIsland`
    // reads as `amplitude ?? LAND_RELIEF_AMPLITUDE`; a dressing computed at any other amplitude
    // samples a landscape the island does not have and every prop floats or sinks by the
    // difference.
    relief: LAND_RELIEF_AMPLITUDE,
    // Measured off the loaded kit, never restated — see `placements` in `kit-island-scene.ts`.
    footprint: roleFootprints(kit),
  });
}

/**
 * EVERY OVERLAPPING PAIR ACROSS THE WHOLE FOREST, in forest space.
 *
 * ⚠ IT IS CHECKED IN FOREST SPACE ON PURPOSE, and this is the one thing the single-island page
 * cannot ask. Each island is dressed in its own coordinates and then offset; two islands whose
 * layout put them close enough together could stand a tree of one inside a tree of another
 * without either island's own dressing ever seeing a conflict.
 */
export function crowdOverlaps(layout: CrowdLayout, kit: LoadedKit): PropOverlap[] {
  const all = layout.islands.flatMap((island) => placementsAt(island, kit));
  return dressingOverlaps(all, roleFootprints(kit));
}

/** The same placements, moved into FOREST space — what the whole-forest merge consumes. */
function placementsAt(island: CrowdIsland, kit: LoadedKit): KitPlacement[] {
  return islandPlacements(island, kit).map((p) => ({
    ...p,
    at: { x: p.at.x + island.offset.x, z: p.at.z + island.offset.z },
  }));
}

export interface ComposedCrowd {
  scene3: THREE.Scene;
  camera: THREE.OrthographicCamera;
  bufW: number;
  bufH: number;
  /** Device pixels per ground unit this picture actually delivers. */
  pxPerUnit: number;
  layout: CrowdLayout;
  /** Where each island's ground footprint lands in the buffer, for the per-island readings. */
  boxes: Array<{ index: number; status: string; needle: boolean; x0: number; y0: number; x1: number; y1: number }>;
}

export interface CrowdOptions {
  arm: CrowdArm;
  zoom: CrowdZoom;
  layout: CrowdLayout;
  kit: LoadedKit | null;
  cal: LightCalibration | null;
  /** Turn the grain octave off — only the presence floor does this, never a picture. */
  grain?: boolean;
}

/**
 * ONE ISLAND'S OWN ON-SCREEN FOOTPRINT, measured off a composed island rather than derived from
 * the tile arithmetic — because `composeIsland` frames on the scene's BOUNDING BOX, which knows
 * about the relief, the bevel, the wall skirt and anything standing on it, and a formula that
 * re-derived it would be a hand-copied duplicate of its own subject.
 *
 * Measured on the BARE arm: the real map's land pixels are the island's own silhouette, so the
 * density calibration has to be against the land rather than against whatever is standing on it.
 */
export interface IslandExtent {
  /** The island's own width in ground units. */
  w: number;
  /** Its on-screen height in ground units — already foreshortened by the camera. */
  screenH: number;
}

export function islandExtent(): IslandExtent {
  const composed = composeIsland({
    ...BASE,
    island: { status: 'healthy' },
    plants: false,
    flowers: false,
    pxPerUnit: 2,
    displayPxPerUnit: 2,
  });
  // `composeIsland` pads by 3 ground units on every side; the island itself is the rest.
  return { w: composed.paddedW - 6, screenH: composed.paddedH - 6 };
}

/** The forest, at whichever zoom, with one arm's dressing on it. */
export function composeCrowd(opts: CrowdOptions): ComposedCrowd {
  const { arm, layout } = opts;
  const scene3 = new THREE.Scene();
  const wantKit = arm === 'kit' || arm === 'kit-merged';
  if (wantKit && (!opts.kit || !opts.cal)) {
    throw new Error('crowd-scene: a kit arm was asked for before the kit loaded');
  }

  const merged: KitPlacement[] = [];
  for (const island of layout.islands) {
    const base: IslandViewProps = {
      ...BASE,
      island: islandOptions(island),
      pxPerUnit: 2,
      displayPxPerUnit: 2,
    };
    if (opts.grain === false) delete base.grain;

    let props: IslandViewProps;
    if (arm === 'today') props = { ...base, dressing: 'wild' };
    else props = { ...base, plants: false, flowers: false };

    // ⚠ THE LAND CHANGE RIDES THE KIT ARMS ONLY. An island wears ONE colour, its story's own
    // state (ADR-0475 D2), and the crowd is where that claim is actually tested — 35 islands in
    // five states, read at the zoom the map opens at. `bare` and `today` keep the per-capability
    // ground so the comparison has a control that is the map as it is.
    if (wantKit) props = { ...props, landState: 'island' };

    // The per-island merge: this island's own props become this island's own draw calls.
    if (arm === 'kit') {
      props = { ...props, extra: kitMeshes(opts.kit!, islandPlacements(island, opts.kit!)) };
    }
    if (arm === 'kit-merged') merged.push(...placementsAt(island, opts.kit!));

    scene3.add(offsetIsland(composeIsland(props).scene3, island.offset));
  }

  // ⚠ THE WHOLE-FOREST MERGE HAPPENS AT ROOT, ALREADY IN FOREST SPACE — it must NOT be offset a
  // second time. `kitMeshes` bakes every placement's transform into its vertices and buckets by
  // MATERIAL, so 2,695 props across 35 islands collapse to one mesh per material.
  if (arm === 'kit-merged') for (const mesh of kitMeshes(opts.kit!, merged)) scene3.add(mesh);

  // ⚠ ONE SET OF LIGHTS FOR THE WHOLE FOREST, NEVER ONE PER ISLAND. An ambient light added 35
  // times is 35x the ambient term, which would wash the crowd out and read as an art difference
  // between this page and the one-island page rather than as the wiring error it is.
  if (wantKit) for (const light of kitLights(opts.cal!)) scene3.add(light);

  const centre = opts.zoom === 'forest' ? { x: 0, z: 0 } : needleCentre(layout);
  const pxPerUnit = crowdPxPerUnit(layout, opts.zoom);

  const bufW = CROWD_VIEWPORT.w;
  const bufH = CROWD_VIEWPORT.h;
  const halfW = bufW / pxPerUnit / 2;
  const halfH = bufH / pxPerUnit / 2;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, -20000, 20000);
  const dist = 8000;
  camera.position.set(centre.x, Math.sin(ELEV_RAD) * dist, centre.z + Math.cos(ELEV_RAD) * dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(centre.x, 0, centre.z);
  camera.updateProjectionMatrix();
  // ⚠⚠ WITHOUT THIS THE ISLAND BOXES ARE PROJECTED THROUGH AN IDENTITY VIEW MATRIX. `project()`
  // reads `camera.matrixWorldInverse`, which three only refreshes inside `render()` — and the
  // boxes are computed here, BEFORE anything is drawn. The first run of this page projected every
  // one of the 35 islands to the wrong place, every box caught zero pixels, and the truth reading
  // returned UNVERIFIED for all eight arms. That is the instrument working: the alternative was
  // eight confident colour readings taken off empty frame.
  camera.updateMatrixWorld(true);

  return {
    scene3,
    camera,
    bufW,
    bufH,
    pxPerUnit,
    layout,
    boxes: islandBoxes(layout, camera, bufW, bufH),
  };
}

/**
 * THE ZOOMED-IN VIEW'S SCALE — the arc's own "overview" figure, 2 device px per ground unit.
 *
 * ⚠ IT IS THE NAME THAT MOVES, NOT THE NUMBER. On the one-island pages 2 px/unit is called the
 * overview because one island alone at that scale fills the frame. In a 35-island forest the same
 * scale shows a NEIGHBOURHOOD — a handful of islands — which is what a visitor gets after zooming
 * in. Keeping the number identical is what lets a crowd picture be compared to the committed
 * one-island pictures at all.
 */
export const ISLAND_ZOOM_PX_PER_UNIT = 2;

/** Device pixels per ground unit at each zoom — one place, so a picture and a reading taken at the
 *  "same" zoom cannot silently be taken at two different ones. */
export function crowdPxPerUnit(layout: CrowdLayout, zoom: CrowdZoom): number {
  if (zoom === 'forest') return fitZoom(layout, CROWD_VIEWPORT);
  if (zoom === 'neighbourhood') return neighbourhoodZoom(layout, CROWD_VIEWPORT);
  return ISLAND_ZOOM_PX_PER_UNIT;
}

/** Centre the zoomed view on the planted failing island, which is what the truth reading is about. */
function needleCentre(layout: CrowdLayout): { x: number; z: number } {
  const needle = layout.islands.find((i) => i.needle) ?? layout.islands[0]!;
  return needle.offset;
}

/**
 * WHERE EACH ISLAND LANDS IN THE BUFFER — projected through the camera that will actually draw
 * it, never computed from the layout arithmetic a second time.
 */
function islandBoxes(
  layout: CrowdLayout,
  camera: THREE.OrthographicCamera,
  bufW: number,
  bufH: number,
): ComposedCrowd['boxes'] {
  const v = new THREE.Vector3();
  return layout.islands.map((island) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const dx of [-layout.islandW / 2, layout.islandW / 2]) {
      for (const dz of [-layout.islandD / 2, layout.islandD / 2]) {
        v.set(island.offset.x + dx, 0, island.offset.z + dz).project(camera);
        const px = ((v.x + 1) / 2) * bufW;
        // WebGL's buffer origin is BOTTOM-left; these boxes are consumed against `readPixels`,
        // which shares that origin, so no flip belongs here.
        const py = ((v.y + 1) / 2) * bufH;
        x0 = Math.min(x0, px);
        x1 = Math.max(x1, px);
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
    }
    return {
      index: island.index,
      status: island.status,
      needle: island.needle,
      x0: Math.max(0, Math.floor(x0)),
      y0: Math.max(0, Math.floor(y0)),
      x1: Math.min(bufW, Math.ceil(x1)),
      y1: Math.min(bufH, Math.ceil(y1)),
    };
  });
}

/** Build the forest's layout from a freshly measured island footprint. */
export function buildCrowdLayout(): CrowdLayout {
  const extent = islandExtent();
  return crowdLayout({ islandW: extent.w, islandScreenH: extent.screenH });
}

/** How many props the whole crowd stands up, by role — what the payload does NOT scale with. */
export interface CrowdPropCount {
  total: number;
  byStatus: Record<string, number>;
}

export function crowdPropCount(layout: CrowdLayout, kit: LoadedKit): CrowdPropCount {
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const island of layout.islands) {
    const n = islandPlacements(island, kit).length;
    byStatus[island.status] = (byStatus[island.status] ?? 0) + n;
    total += n;
  }
  return { total, byStatus };
}

export { sharedRenderer };
