// buildingIsland — the on-map EDGELESS building island (owner pivot 2026-06-21).
//
// The library is a foundation hub depended on by ~everything, so as a normal island its
// inbound roads flood the map (that's why ADR-0076 made it a distributed bookshelf stamp
// with no island). The owner now wants the island BACK on the map — clickable, with a
// health tree like any island, sitting among the central hubs near `cli` — but WITHOUT its
// edges drawn, and with the bookshelf icon next to its nameplate.
//
// This mode (`?buildingIsland=on`, gear toggle, DEFAULT ON since 2026-06-22) keeps the
// building-tagged story in the layout as a real island, SUPPRESSES only its incident edges
// from the rendered road lists (never the layout/ranking inputs), pins its layout RANK to
// the foundation row (rank 0, near `cli`) since its edges are hidden anyway, stamps the
// bookshelf glyph by its nameplate — AND still distributes the bookshelf STAMP onto every
// consumer (the "this island uses the library" marker, decoupled from the building's own
// island, owner steer 2026-06-22).
//
// Stage-1 red-green of the geometry/behaviour (ADR-0070): the APPEARANCE (the glyph by the
// plate, the bigger cards/icons, where the island lands) is owner-attested.

import { describe, it, expect } from 'vitest';
import { buildWorld, isEdgeless, nameplateLayout } from './TreeView.js';
import type { TreeStory } from '../types';

const cap = (id: string, dependsOn: string[] = []) => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped' as const,
  proofMode: 'red-green',
  dependsOn,
});

const story = (
  id: string,
  opts: { building?: boolean; dependsOn?: string[]; consumedBy?: string[] } = {},
): TreeStory => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped',
  proofMode: 'red-green',
  uatWitness: 'machine',
  dependsOn: opts.dependsOn ?? [],
  consumedBy: opts.consumedBy ?? [],
  ...(opts.building ? { building: true } : {}),
  capabilities: [cap(`${id}-a`), cap(`${id}-b`)],
});

// A small graph: `library` is a building hub; `cli` and `alpha` both depend on it, and
// `beta` depends on `alpha` (a NON-building edge between two normal islands). This lets us
// assert that (a) library is laid out, (b) its incident edges drop, and (c) the alpha→beta
// edge survives — i.e. the filter is by ENDPOINT, not global.
function corpus(): TreeStory[] {
  return [
    story('library', { building: true, consumedBy: ['cli', 'alpha'] }),
    story('cli', { dependsOn: ['library'] }),
    story('alpha', { dependsOn: ['library'] }),
    story('beta', { dependsOn: ['alpha'] }),
  ];
}

describe('isEdgeless — the predicate', () => {
  it('is true only for a building-tagged story when buildingIsland is on', () => {
    const lib = story('library', { building: true });
    const cli = story('cli');
    expect(isEdgeless(lib, true)).toBe(true);
    // a normal island is never edgeless
    expect(isEdgeless(cli, true)).toBe(false);
    // flag off ⇒ nothing is edgeless (today's world is unchanged)
    expect(isEdgeless(lib, false)).toBe(false);
    expect(isEdgeless(cli, false)).toBe(false);
  });
});

describe('buildWorld — buildingIsland mode (edgeless on-map island)', () => {
  it('INCLUDES the building story as a normal territory (vs excluded by the distributed flag)', () => {
    const on = buildWorld(corpus(), { buildingIsland: true, buildings: true });
    const ids = on.territories.map((t) => t.story.id).sort();
    expect(ids).toEqual(['alpha', 'beta', 'cli', 'library']);
    const lib = on.territories.find((t) => t.story.id === 'library')!;
    // it gets a real central tree + capability garden like any island
    expect(lib.caps.map((c) => c.cap.id).sort()).toEqual(['library-a', 'library-b']);
    // the building's OWN island never carries a consumer-stamp (it IS the building)
    expect(lib.bookshelf).toBe(false);
  });

  it('STILL distributes the bookshelf STAMP onto consumers (coexists with the island, owner steer 2026-06-22)', () => {
    // Decoupled: the building keeps its island AND its consumers keep the "uses the library"
    // stamp. `cli` and `alpha` both connect to `library`, so both carry a stamp; `beta` does
    // not connect to the library (only to alpha), so it carries none.
    const on = buildWorld(corpus(), { buildingIsland: true, buildings: true });
    const byId = Object.fromEntries(on.territories.map((t) => [t.story.id, t]));
    expect(byId['cli']!.bookshelf).toBe(true);
    expect(byId['alpha']!.bookshelf).toBe(true);
    expect(byId['beta']!.bookshelf).toBe(false);
    // a consumer stamp has a placed spot on owned land
    expect(byId['cli']!.bookshelfSpot).toBeDefined();
  });

  it('the distributed-stamp flag (buildings) EXCLUDES the same building story (the opposite handling)', () => {
    const distributed = buildWorld(corpus(), { buildings: true });
    expect(distributed.territories.map((t) => t.story.id)).not.toContain('library');
  });

  it('SUPPRESSES every edge incident to the edgeless island from lineRoads, keeping non-building edges', () => {
    const world = buildWorld(corpus(), { buildingIsland: true });
    const roads = world.lineRoads ?? [];
    // no rendered road touches library (neither as from nor to)
    expect(roads.some((e) => e.from === 'library' || e.to === 'library')).toBe(false);
    // the alpha→beta edge between two NORMAL islands is still drawn (filter is by endpoint)
    expect(roads.some((e) => e.from === 'alpha' && e.to === 'beta')).toBe(true);
  });

  it('SUPPRESSES incident edges from solar.roads AND solar.spokes too', () => {
    const world = buildWorld(corpus(), { buildingIsland: true, layoutMode: 'solar' });
    const roads = world.solar?.roads ?? [];
    const spokes = world.solar?.spokes ?? [];
    expect(roads.some((e) => e.from === 'library' || e.to === 'library')).toBe(false);
    expect(spokes.some((e) => e.from === 'library' || e.to === 'library')).toBe(false);
    // a non-building road survives
    expect(roads.some((e) => e.from === 'alpha' && e.to === 'beta')).toBe(true);
  });

  it('PINS the edgeless building island to the foundation row (rank 0, near cli) — owner steer 2026-06-22', () => {
    // The world reads bottom-up: the foundation row sits at the BOTTOM (largest centroid.y;
    // rowY decreases going up). `cli` has no deps ⇒ rank 0 ⇒ the bottom row. The library
    // naturally ranks ABOVE cli (cli/alpha depend on it… no — library has no deps, so it is
    // ALSO rank 0 here). To exercise the override we give the building a dependency so its
    // NATURAL rank is > 0, then assert the pin drags it back down to the foundation row.
    const graph: TreeStory[] = [
      story('base'),
      story('library', { building: true, dependsOn: ['base'], consumedBy: ['cli', 'alpha'] }),
      story('cli', { dependsOn: ['library'] }),
      story('alpha', { dependsOn: ['library'] }),
      story('beta', { dependsOn: ['alpha'] }),
    ];
    const world = buildWorld(graph, { buildingIsland: true });
    const by = Object.fromEntries(world.territories.map((t) => [t.story.id, t.centroid.y]));
    // The foundation row is the BOTTOM (largest y). `base` (rank 0) defines it. The library,
    // though it depends_on `base` (natural rank 1), is PINNED to the SAME foundation row — so
    // its y sits within the per-row jitter band of `base`, NOT a full row higher. Rows are
    // separated by RANK_GAP-plus-clearance (≫ the ±15 intra-row jitter), so a generous band
    // cleanly distinguishes "same row" from "a row up".
    expect(Math.abs(by['library']! - by['base']!)).toBeLessThan(40);
    // and a real dependent (beta, the deepest) sits well ABOVE the foundation (much smaller y)
    expect(by['beta']!).toBeLessThan(by['base']! - 40);
  });

  it('does NOT pin non-building islands — only the edgeless building rank is overridden', () => {
    // Flag OFF: with the building a normal island, the override never fires.
    const off = buildWorld(corpus());
    const onByRankShape = buildWorld(corpus(), { buildingIsland: true });
    // beta (the deepest dependent) is the TOP row in both worlds — its rank is never pinned.
    const topId = (w: ReturnType<typeof buildWorld>) =>
      [...w.territories].sort((a, b) => a.centroid.y - b.centroid.y)[0]!.story.id;
    expect(topId(off)).toBe('beta');
    expect(topId(onByRankShape)).toBe('beta');
  });

  it('marks the edgeless territory so the nameplate can carry the bookshelf glyph', () => {
    const world = buildWorld(corpus(), { buildingIsland: true });
    const lib = world.territories.find((t) => t.story.id === 'library')!;
    const cli = world.territories.find((t) => t.story.id === 'cli')!;
    expect(lib.buildingGlyph).toBe(true);
    expect(cli.buildingGlyph).toBe(false);
  });

  it('default (flag off) is byte-identical to a plain world — building stories still get filtered/stamped as today', () => {
    const off = buildWorld(corpus());
    const ids = off.territories.map((t) => t.story.id).sort();
    // library is a normal island when neither flag is set (bare-call fallback)
    expect(ids).toEqual(['alpha', 'beta', 'cli', 'library']);
    // no glyph mark, no suppression — its edges are drawn
    expect(off.territories.every((t) => t.buildingGlyph === false)).toBe(true);
    expect((off.lineRoads ?? []).some((e) => e.to === 'cli' && e.from === 'library')).toBe(true);
  });
});

describe('nameplateLayout — bigger cards + building landmark (owner ask 2026-06-22)', () => {
  it('the building-class card is distinctly LARGER than a normal card of the same id', () => {
    const normal = nameplateLayout('library'.length, false);
    const building = nameplateLayout('library'.length, true);
    expect(building.h).toBeGreaterThan(normal.h);
    expect(building.w).toBeGreaterThan(normal.w);
  });

  it('the building card reserves a left gutter and a non-trivial leading glyph', () => {
    const building = nameplateLayout('library'.length, true);
    // the glyph is seated (a positive leading anchor) and scaled up to read as a marker
    expect(building.glyphX).toBeGreaterThan(0);
    expect(building.glyphScale).toBeGreaterThanOrEqual(0.85);
  });

  it('the normal card is a MODEST bump over the old 30px plate (not a giant)', () => {
    const normal = nameplateLayout('cli'.length, false);
    // taller than the old 30 but conservative (≤ a few px), so the dense world is not flooded
    expect(normal.h).toBeGreaterThan(30);
    expect(normal.h).toBeLessThanOrEqual(36);
  });
});
