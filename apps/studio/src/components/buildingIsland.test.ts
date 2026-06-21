// buildingIsland — the on-map EDGELESS building island (owner pivot 2026-06-21).
//
// The library is a foundation hub depended on by ~everything, so as a normal island its
// inbound roads flood the map (that's why ADR-0076 made it a distributed bookshelf stamp
// with no island). The owner now wants the island BACK on the map — clickable, with a
// health tree like any island, sitting among the central hubs near `cli` — but WITHOUT its
// edges drawn, and with the bookshelf icon next to its nameplate.
//
// This mode (`?buildingIsland=on`, gear toggle, default OFF) is the OPPOSITE handling of
// building-tagged stories from the distributed-stamp `buildings` flag: include them in the
// layout as normal islands, but SUPPRESS only their incident edges from the rendered road
// lists — never the layout/ranking inputs — and stamp the bookshelf glyph by the nameplate.
//
// Stage-1 red-green of the geometry/behaviour (ADR-0070): the APPEARANCE (the glyph by the
// plate, where the island lands) is owner-attested.

import { describe, it, expect } from 'vitest';
import { buildWorld, isEdgeless } from './TreeView.js';
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
    const on = buildWorld(corpus(), { buildingIsland: true });
    const ids = on.territories.map((t) => t.story.id).sort();
    expect(ids).toEqual(['alpha', 'beta', 'cli', 'library']);
    const lib = on.territories.find((t) => t.story.id === 'library')!;
    // it gets a real central tree + capability garden like any island
    expect(lib.caps.map((c) => c.cap.id).sort()).toEqual(['library-a', 'library-b']);
    // and it carries NO distributed bookshelf STAMP (the real island replaces the stamp)
    expect(on.territories.every((t) => t.bookshelf === false)).toBe(true);
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

  it('leaves the RANKING/positions of the non-building islands UNCHANGED by the edge suppression', () => {
    // Ground truth: the same corpus laid out as a normal island world (no distributed
    // stamp, no edgeless suppression) — library is a real island and its edges are drawn.
    const baseline = buildWorld(corpus());
    const islandMode = buildWorld(corpus(), { buildingIsland: true });
    // The positions are driven by the FULL dependency graph (library still ranks/positions
    // everything); only the painted edges change. So every territory — library included —
    // sits at exactly the same place in both worlds.
    const pos = (w: ReturnType<typeof buildWorld>) =>
      Object.fromEntries(w.territories.map((t) => [t.story.id, t.centroid]));
    expect(pos(islandMode)).toEqual(pos(baseline));
    // and the scene bounds are identical (layout untouched)
    expect(islandMode.width).toBe(baseline.width);
    expect(islandMode.height).toBe(baseline.height);
    expect(islandMode.offset).toEqual(baseline.offset);
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
