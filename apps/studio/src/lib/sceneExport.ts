// sceneExport.ts — the `?sceneExport=1` bridge: the map's built scene graph, parked on `window` for
// an instrument to read.
//
// WHY IT EXISTS. The 3D map (`packages/forest-world-r3f`) lays out nothing of its own: it reads the
// 2D layout's scene graph through `worldTo3D`. But no product surface mounts the 3D forest over the
// real corpus yet, and the r3f harness cannot import this app, so every "fitted forest" picture on
// `land-ground-stack-arc` so far stood on a SYNTHETIC crowd calibrated off a PNG. ADR-0521 moves the
// spacing at the 2D source, so the picture that judges it has to be the 2D source's own layout —
// this bridge is how the layout crosses: the studio builds the scene exactly as it ships (the live
// corpus, the same fold, the same vegetation), a Playwright driver reads it off `window` per rung,
// and the harness page renders those scenes through the shipped 3D pipeline.
//
// ⚠ BEHIND THE FLAG ONLY, AND NOTHING ELSE CHANGES. Without `?sceneExport=1` in the query nothing is
// written to `window`; with it, the bridge is replaced whenever the scene rebuilds and removed on
// unmount — the same shape as `cameraRasterisationProbe.ts`. It reads; it never steers the map.
//
// ⚠ THE BOOKKEEPING RIDES WITH THE SCENE so a driver can VERIFY rather than assume that every trail
// survived the re-layout (ADR-0520's consequence list, item 1): the routed edge count, the segment
// count, and the `dropped` list are read off the same `HexWorld` the scene was folded from.

import type { Pt, SceneG, SceneNode, TrailNetwork } from '@storytree/forest-world';

import type { LegacySpacing } from './islandSpacing.js';

/** What the bridge needs of a laid-out world — a structural slice of TreeView's `HexWorld`, so this
 *  module does not import the component it is mounted from. */
export interface ExportableWorld {
  territories: ReadonlyArray<{
    story: { id: string };
    centroid: Pt;
    groundRadius: number;
    caps: ReadonlyArray<unknown>;
    tiles: ReadonlyArray<unknown>;
  }>;
  /** The routed network — the bridge COUNTS segments, edges and caves and carries `dropped`
   *  verbatim, so a structural slice is all it asks for. */
  trails: {
    segments: ReadonlyArray<unknown>;
    edges: ReadonlyArray<unknown>;
    caves: ReadonlyArray<unknown>;
    dropped: TrailNetwork['dropped'];
  };
  width: number;
  height: number;
  offset: Pt;
}

export interface SceneExportIsland {
  id: string;
  /** The territory's centroid in the drawing's projected space — where the 2D map puts the island. */
  centroid: Pt;
  groundRadius: number;
  capabilities: number;
  tiles: number;
}

export interface SceneExportTrails {
  /** `depends_on` edges the router was asked to draw. */
  edges: number;
  /** Distinct routed segments (a shared trunk renders once). */
  segments: number;
  caves: number;
  /** Edges the network could NOT route — the §5 honesty signal, carried verbatim. */
  dropped: ReadonlyArray<{ from: string; to: string }>;
}

export interface SceneExportBridge {
  /** The drawable scene graph — `worldTo3D`'s input. */
  scene: SceneG;
  /** The spacing the world was laid out with, as the URL asked for it (absent keys ⇒ the shipped default). */
  spacing: { ratio?: number; legacy?: LegacySpacing };
  world: { width: number; height: number; offset: Pt; islands: SceneExportIsland[] };
  trails: SceneExportTrails;
}

/** `?sceneExport=1` (or `true`) in the query string — nothing else turns the bridge on. */
export function readSceneExport(search: string): boolean {
  const v = new URLSearchParams(search).get('sceneExport');
  return v === '1' || v === 'true';
}

export function sceneExportBridge(
  world: ExportableWorld,
  scene: SceneG,
  spacing: { ratio?: number; legacy?: LegacySpacing },
): SceneExportBridge {
  const out: SceneExportBridge = {
    scene,
    spacing: {},
    world: {
      width: world.width,
      height: world.height,
      offset: world.offset,
      islands: world.territories.map((t) => ({
        id: t.story.id,
        centroid: t.centroid,
        groundRadius: t.groundRadius,
        capabilities: t.caps.length,
        tiles: t.tiles.length,
      })),
    },
    trails: {
      edges: world.trails.edges.length,
      segments: world.trails.segments.length,
      caves: world.trails.caves.length,
      dropped: world.trails.dropped.map((d) => ({ from: d.from, to: d.to })),
    },
  };
  if (spacing.ratio !== undefined) out.spacing.ratio = spacing.ratio;
  if (spacing.legacy !== undefined) out.spacing.legacy = { ...spacing.legacy };
  return out;
}

/**
 * The scene kinds the 3D mapper READS (`world-to-3d.ts`'s `walkNode`): the parcel cells, the trail
 * ribbons, the cave portals, the wisps and the signed UAT markers. Everything else on a 2D scene —
 * grass blades, shrubs, coast shore, nameplates, the hero tree the 3D map retired (ADR-0508) — is
 * emitted by the walk as an explicit `skipped` and drawn by nothing, so an EXPORT for the mapper
 * need not carry it. Kept in step with the walk's `case` list by `sceneExport.test.ts`. An
 * anonymous leaf (no `kind`) is never read, and the Set says so without a guard.
 */
export const MAPPER_READ_KINDS: ReadonlySet<string | undefined> = new Set([
  'cell',
  'cell-wheat',
  'trail-fill',
  'trail-ghost',
  'cave',
  'wisp',
  'tall-flower-proven',
]);

/**
 * The scene with every leaf the mapper does not read removed — `<g>` groups are always kept (they
 * carry the translates, the island and parcel identities and the folded status the walk inherits
 * down), leaves are kept only for {@link MAPPER_READ_KINDS}. Measured on the live corpus: a 3.5 MB
 * scene prunes to about a fifth, most of the bytes being 2D grass blades. Pure and total: the same
 * scene always prunes to the same bytes, and a leaf of a kind the mapper reads is never dropped.
 */
export function pruneSceneForMapper(node: SceneG): SceneG {
  const children = node.children.flatMap((child): SceneNode[] => {
    if (child.el === 'g') return [pruneSceneForMapper(child)];
    // Typed `string | undefined` so an anonymous leaf needs no guard: a Set of strings answers
    // `false` for `undefined` on its own, and a `kind !== undefined &&` in front would be a TYPE guard
    // with no runtime meaning — the mutation rung reads such a guard exactly right (`world-to-3d.ts`
    // makes the same call for the same reason).
    return MAPPER_READ_KINDS.has(child.kind) ? [child] : [];
  });
  return { ...node, children };
}

declare global {
  interface Window {
    __storytreeSceneExport?: SceneExportBridge;
  }
}
