// factoryBuildings — the island's side of ADR-0217's building factory.
//
// This is the GLUE increment 5 exists to answer: what happens when a building the factory
// produced has to sit on the island next to everything else. Three things had to be
// decided here, and none of them is geometry — the geometry arrived baked.
//
// 1. WHICH building an island gets. Nothing new is invented: the map already derives a
//    deterministic identity per story (`storyIcon`, ADR-0102) and draws it as a flat glyph.
//    That same identity now indexes the kit, so an island's building is as stable as its
//    icon always was and no island's identity moves.
//
// 2. WHERE it stands. The kit bakes to the same placement contract the glyph used —
//    centred on x = 0, standing on y = 0 — so every existing call site's `translate` is
//    already correct and the swap does not move anything on the map.
//
// 3. HOW MANY copies exist. This is the one that bites. A baked building is ~800 nodes
//    (`bake.test.ts` measures it), so inlining one per island puts a mid-sized map into
//    five figures of DOM and past ADR-0069's ceiling several times over. Every building is
//    therefore DEFINED once in `<defs>` and REFERENCED with `<use>` — the cost becomes the
//    kit's size plus one node per island, instead of the kit's size times the islands.
//
// ADR-0093 §4 keeps colour out of the shared scene-graph, which is why none of this lives
// in `@storytree/forest-world`: a baked facade's fill is its material modulated by N·L, so
// two walls of one building carry different colours and no CSS class can name them. The
// stamps were already studio chrome (ADR-0093 Decision 2), so the buildings ride there too
// and the core stays a colourless, framework-agnostic root. Whether baked art should be
// able to enter the shared scene at all is a live question for the owner — see the
// increment-5 notes — and deliberately NOT decided here.

import { storyIcon } from './buildingLayout.js';

/** One drawable of a baked building — the vector node vocabulary, already resolved. */
export type FactoryNode =
  | { el: 'polygon'; points: string; fill: string; stroke: string; strokeWidth: number; opacity?: number }
  | { el: 'path'; d: string; fill: string; stroke: string; strokeWidth: number; opacity?: number; fillRule?: 'evenodd' }
  | { el: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: string; opacity?: number };

export interface FactoryBuilding {
  id: string;
  label: string;
  name: string;
  nodes: FactoryNode[];
  minX: number;
  minY: number;
  width: number;
  height: number;
}

interface KitAsset {
  note: string;
  entries: FactoryBuilding[];
}

/** Resolved once and reused — the asset is immutable and the parse is not free. */
let kitPromise: Promise<FactoryBuilding[]> | null = null;

/**
 * Load the baked kit.
 *
 * DYNAMIC on purpose. The asset is about a megabyte of geometry, and the feature it serves is
 * off by default — a static import would put all of it in the main chunk and charge every
 * studio load for a flag nobody has turned on. Behind `import()` it becomes its own chunk that
 * is fetched only when the flag is.
 */
export function loadFactoryKit(): Promise<FactoryBuilding[]> {
  kitPromise ??= import('@storytree/procedural-architecture/kit.json').then(
    (m) => ((m as { default: KitAsset }).default ?? (m as unknown as KitAsset)).entries,
  );
  return kitPromise;
}

/**
 * Which kit building a story shows.
 *
 * Keyed on the SAME `storyIcon(id).shape` bucket the flat glyph used, so swapping the art
 * never reshuffles which island is which — a reader who learned the map keeps their
 * landmarks. The bucket space (8) and the kit size (6) need not match: the modulo just
 * means two buckets share a building, which is already true of hue and monogram collisions.
 */
export function factoryBuildingFor(kit: readonly FactoryBuilding[], storyId: string): FactoryBuilding {
  const bucket = storyIcon(storyId).shape;
  const entry = kit[bucket % kit.length];
  if (!entry) throw new Error('the baked kit is empty — run `pnpm --filter @storytree/procedural-architecture bake`');
  return entry;
}

/** The `<defs>` id a building is defined under, and referenced by. */
export const factoryDefId = (kitId: string): string => `factory-building-${kitId}`;

/**
 * The kit entries a given set of stories actually needs, in kit order.
 *
 * Defining the whole kit when a map shows three buildings would pay for four unused ones,
 * and `<defs>` content is still DOM. Filtering to what is referenced keeps the floor cost
 * proportional to what is on screen.
 */
export function usedFactoryBuildings(
  kit: readonly FactoryBuilding[],
  storyIds: readonly string[],
): FactoryBuilding[] {
  if (kit.length === 0) return [];
  const needed = new Set(storyIds.map((id) => factoryBuildingFor(kit, id).id));
  return kit.filter((e) => needed.has(e.id));
}

/**
 * The scale that draws a baked building at `targetHeight` map units.
 *
 * Height rather than width, because the glyph this replaces was specified by height
 * (`ICON_GLYPH.H`) and because a windmill and a mushroom differ far more in width than in
 * height — matching on width would make the windmill tower over its neighbours.
 */
export function factoryScale(b: FactoryBuilding, targetHeight: number): number {
  return b.height > 0 ? targetHeight / b.height : 1;
}
