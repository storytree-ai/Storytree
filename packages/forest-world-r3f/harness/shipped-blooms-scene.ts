// shipped-blooms-scene.ts — CAN THE MAP SAY WHOSE SIGNATURE THAT IS? Three arms, one thing each.
//
// ⚠⚠ THE DEFECT THIS PAGE PICTURES IS INVISIBLE IN A FRAME, which is why the page exists. A UAT
// bloom is one SIGNED criterion of one STORY (ADR-0226 D4) — a claim about proof state, bound by
// the same fence as the land's colour: a unit reads as the state it holds and as no other
// (ADR-0392 D5 / ADR-0398 D7). Nothing in a rendered flower says which story signed it, so a map
// that spends one story's signatures over its neighbours draws perfectly ordinary islands and
// asserts something nobody signed.
//
// THE THREE ARMS, each differing from the one before it in exactly one thing:
//
//   none         the map as it drew until 2026-08-31 — `blooms: 0` at both call sites, in terms,
//                because the descriptor stream carried no island attribution and drawing NOTHING
//                was the honest state.
//   scattered    the same map with the signature count finally read — and spent through ONE
//                whole-map dressing call, which is what the zero was protecting against. Stories
//                that have signed nothing wear flowers.
//   attributed   the same count spent per island (`dressMapFromKit`) — what ships now. Every
//                flower stands on the ground of the story that signed it.
//
// ⚠ `scattered` IS NOT A PICTURE OF THE PAST. The map never drew it: the count was pinned at zero
// precisely so this could not happen. It is the picture of the mistake the pin was standing in
// for, and it is here because "we avoided a misreport" is not something a reader can check without
// seeing what the misreport looks like.
//
// ⚠ THE CROWD IS THE `forest` SIZE ON PURPOSE — the real map's own status MIX. A crowd where every
// story is healthy has every story signing all ten, and then a scattered dressing and an
// attributed one draw the same number of flowers in nearly the same places. The defect is only
// visible where some stories have signed nothing, which is what the real mix supplies.
//
// ⚠ THE NUMBERS BESIDE THE PICTURES ARE THE ACCEPTANCE TEST, not the pictures. `bloomCensus`
// attributes every PLACED flower to the island it stands on and compares that against what each
// story actually signed — so `misattributed` is a count a reader can check, and a picture whose
// flowers merely look tidy cannot pass it.

import * as THREE from 'three';

import { LAND_RELIEF_AMPLITUDE } from '../src/land-relief.js';
import { dressMapFromKit } from '../src/map-dressing.js';
import {
  capabilityFactsFrom,
  dressIslandFromKit,
  type KitPlacement,
  type RoleFootprints,
} from '../src/kit-vocabulary.js';
import { parcelCellsFrom } from '../src/parcel-cells.js';
import type { InstanceDescriptor } from '../src/world-to-3d.js';
import { readIdentity, type RendererIdentity } from './frame-cost-scene.js';
import { kitMeshes, loadKit, roleFootprints, type LoadedKit } from './kit-scene.js';
import {
  CROWD_ZOOMS,
  FIT_ZOOM,
  buildCrowdScene,
  crowdBlooms,
  crowdCells,
  crowdDescriptors,
  crowdIslandId,
  crowdIslands,
  crowdSize,
  type CrowdZoom,
} from './shipped-crowd-scene.js';

/** The crowd this page draws: the real map's island count AND its real status mix. */
const SIZE = crowdSize('forest');

/** The ladder arm the land wears — the one the map wears now. Held fixed on every arm here, so the
 *  only thing that moves between pictures is where the flowers go. */
const LAND_ARM = 'dense' as const;

export type BloomDressing = 'none' | 'scattered' | 'attributed';
export const BLOOM_DRESSINGS: readonly BloomDressing[] = ['none', 'scattered', 'attributed'];

export const BLOOM_CAPTION = {
  none: 'blooms: 0 — the map until 2026-08-31, and the honest state while it could not attribute them',
  scattered: 'the count read and spent over the WHOLE map — the misreport the zero stood in for',
  attributed: 'the count spent per island — every signature on the story that gave it',
} satisfies Record<BloomDressing, string>;

/** The zooms this page draws at: the overview of the whole forest, and the arc's two delivered
 *  scales. Nothing here is timed — a bloom is a look question, and the frame cost of the land is
 *  the page next door's measurement. */
export const BLOOM_ZOOMS: readonly CrowdZoom[] = [FIT_ZOOM, ...CROWD_ZOOMS];

/**
 * THE PLACEMENTS EACH ARM STANDS.
 *
 * ⚠ `scattered` IS THE REAL PRE-FIX CALL, not a caricature of it: one `dressIslandFromKit` over
 * every cell on the map, given the map's TOTAL signature count. That function is named for what it
 * dresses — one island — and handing it a whole forest is precisely the mistake. The blooms it
 * places are scattered over every cell it was given, so they land wherever the sampler finds room.
 */
export function bloomPlacements(footprint: RoleFootprints, dressing: BloomDressing): KitPlacement[] {
  if (dressing === 'attributed') {
    return dressMapFromKit(crowdDescriptors(SIZE), { relief: LAND_RELIEF_AMPLITUDE, footprint });
  }
  const cells = parcelCellsFrom(crowdCells(SIZE));
  return dressIslandFromKit({
    cells,
    facts: capabilityFactsFrom(cells),
    blooms: dressing === 'none' ? 0 : crowdBlooms(SIZE).length,
    relief: LAND_RELIEF_AMPLITUDE,
    footprint,
  });
}

/** One island's ground centre, in forest space — what a placed prop is attributed to. */
interface IslandAnchor {
  id: string;
  x: number;
  z: number;
}

function anchors(): IslandAnchor[] {
  return crowdIslands(SIZE).map((island) => ({
    id: crowdIslandId(island.index),
    x: island.offset.x,
    z: island.offset.z,
  }));
}

/**
 * WHICH ISLAND A PLACED PROP STANDS ON — the NEAREST island centre.
 *
 * ⚠ NEAREST-CENTRE RATHER THAN A BOUNDING BOX, because the crowd's islands are scattered and their
 * boxes can overlap even where their land does not: a box test would leave some props attributed
 * to two islands and some to none, and the honest answer to "whose ground is this?" would then
 * depend on iteration order. Every island in the crowd is the same fixture island, so the nearest
 * centre IS the island whose cells the point was sampled from.
 */
function nearestIsland(at: { x: number; z: number }, list: readonly IslandAnchor[]): string {
  let best = list[0];
  if (!best) throw new Error('shipped-blooms-scene: the crowd has no islands');
  let bestD = Infinity;
  for (const island of list) {
    const d = (island.x - at.x) ** 2 + (island.z - at.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = island;
    }
  }
  return best.id;
}

export interface BloomCensus {
  dressing: BloomDressing;
  /** Flowers actually placed on the map. */
  drawn: number;
  /** Signatures the scene actually holds — what a truthful map would draw. */
  signed: number;
  /** Flowers standing on an island whose story did not sign that many — the misreport, as a count.
   *  Summed per island as `max(0, drawn - signed)`, so a story wearing four flowers for two
   *  signatures contributes two whatever the rest of the map does. */
  misattributed: number;
  /** Stories that signed NOTHING and are nevertheless wearing at least one flower. The sharpest
   *  form of the defect: the map asserting a signature on work nobody has checked. */
  unsignedIslandsWearingFlowers: number;
  /** Signatures a story holds that the map does not draw — the opposite error, and the one the
   *  `none` arm is made entirely of. */
  undrawn: number;
}

export function bloomCensus(footprint: RoleFootprints, dressing: BloomDressing): BloomCensus {
  const list = anchors();
  const signed = new Map<string, number>();
  for (const island of list) signed.set(island.id, 0);
  for (const bloom of crowdBlooms(SIZE)) {
    const id = bloom.island;
    if (id !== undefined) signed.set(id, (signed.get(id) ?? 0) + 1);
  }
  const drawn = new Map<string, number>();
  for (const island of list) drawn.set(island.id, 0);
  let total = 0;
  for (const placement of bloomPlacements(footprint, dressing)) {
    if (placement.role !== 'bloom') continue;
    total += 1;
    const id = nearestIsland(placement.at, list);
    drawn.set(id, (drawn.get(id) ?? 0) + 1);
  }
  let misattributed = 0;
  let undrawn = 0;
  let unsignedWearing = 0;
  for (const island of list) {
    const s = signed.get(island.id) ?? 0;
    const d = drawn.get(island.id) ?? 0;
    misattributed += Math.max(0, d - s);
    undrawn += Math.max(0, s - d);
    if (s === 0 && d > 0) unsignedWearing += 1;
  }
  return {
    dressing,
    drawn: total,
    signed: crowdBlooms(SIZE).length,
    misattributed,
    unsignedIslandsWearingFlowers: unsignedWearing,
    undrawn,
  };
}

export interface BloomScene {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  width: number;
  height: number;
  pxPerUnit: number;
  /** Props standing on the frame — a kit that failed to parse draws none, and a picture with no
   *  props in it is otherwise indistinguishable from a picture of bare land. */
  props: number;
  blooms: number;
}

/**
 * THE CROWD'S LAND, PLUS THIS ARM'S PROPS.
 *
 * ⚠ THE LAND IS BUILT BY `buildCrowdScene` RATHER THAN REBUILT HERE, so every arm on this page
 * stands on exactly the ground the page next door measures — same ladder, same grain, same
 * occlusion field, same camera. An instrument that built its own land would be picturing flowers
 * on a map the product does not draw.
 */
export function buildBloomScene(
  kit: LoadedKit | null,
  dressing: BloomDressing,
  zoom: CrowdZoom,
): BloomScene {
  const land = buildCrowdScene(LAND_ARM, SIZE, zoom);
  let props = 0;
  let blooms = 0;
  if (kit !== null) {
    const placements = bloomPlacements(roleFootprints(kit), dressing);
    for (const placement of placements) if (placement.role === 'bloom') blooms += 1;
    for (const mesh of kitMeshes(kit, placements)) {
      land.scene.add(mesh);
      props += 1;
    }
  }
  return {
    scene: land.scene,
    camera: land.camera,
    width: land.width,
    height: land.height,
    pxPerUnit: land.pxPerUnit,
    props,
    blooms,
  };
}

export interface BloomRunner {
  identity(): RendererIdentity;
  snapshot(dressing: BloomDressing, zoom: CrowdZoom): { png: string; props: number; blooms: number };
  census(dressing: BloomDressing): BloomCensus;
  dispose(): void;
}

export async function createBloomRunner(): Promise<BloomRunner> {
  const kit = await loadKit();
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const identity = readIdentity(gl);

  // ⚠ CACHED PER (dressing, zoom). `buildCrowdScene` MUTATES the scene it hands back when this page
  // adds props to it, so a rebuild per snapshot would stack one arm's flowers on the next one's.
  const built = new Map<string, BloomScene>();

  return {
    identity: () => identity,
    snapshot(dressing, zoom) {
      const key = `${dressing}|${String(zoom)}`;
      let s = built.get(key);
      if (!s) {
        s = buildBloomScene(kit, dressing, zoom);
        built.set(key, s);
      }
      renderer.setSize(s.width, s.height, false);
      renderer.render(s.scene, s.camera);
      return { png: canvas.toDataURL('image/png'), props: s.props, blooms: s.blooms };
    },
    census: (dressing) => bloomCensus(roleFootprints(kit), dressing),
    dispose() {
      renderer.dispose();
    },
  };
}

/** Mount the page: every arm at every zoom, with its census printed beside it. */
export async function mountShippedBlooms(root: HTMLElement): Promise<void> {
  const runner = await createBloomRunner();
  const id = runner.identity();
  const head = document.createElement('p');
  head.className = 'numbers';
  head.textContent = `${id.vendor} — ${id.renderer} · software=${id.software}`;
  root.appendChild(head);

  const table = document.createElement('p');
  table.className = 'numbers';
  table.innerHTML = BLOOM_DRESSINGS.map((d) => {
    const c = runner.census(d);
    return (
      `${d.padEnd(11)} drawn ${String(c.drawn).padStart(3)} of ${c.signed} signed · ` +
      `MISATTRIBUTED ${c.misattributed} · undrawn ${c.undrawn} · ` +
      `stories wearing an unsigned flower: ${c.unsignedIslandsWearingFlowers}`
    );
  }).join('<br />');
  root.appendChild(table);

  for (const zoom of BLOOM_ZOOMS) {
    const h2 = document.createElement('h2');
    h2.textContent =
      zoom === FIT_ZOOM
        ? 'the whole forest, fitted to a laptop screen'
        : `${zoom} delivered px per ground unit`;
    root.appendChild(h2);
    const row = document.createElement('div');
    row.className = 'row';
    for (const dressing of BLOOM_DRESSINGS) {
      const shot = runner.snapshot(dressing, zoom);
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = shot.png;
      img.width = 620;
      const cap = document.createElement('figcaption');
      cap.textContent = `${dressing} — ${BLOOM_CAPTION[dressing]} · ${shot.props} props, ${shot.blooms} of them flowers`;
      fig.append(img, cap);
      row.appendChild(fig);
    }
    root.appendChild(row);
  }

  window.bloomRunner = runner;
}

declare global {
  // eslint-disable-next-line no-var
  var bloomRunner: BloomRunner;
}
