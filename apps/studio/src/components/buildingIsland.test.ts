// Building-class stories OFF the map (ADR-0088, Shared Islands panel — amends ADR-0076 §2).
//
// The library is a foundation hub depended on by ~everything; rather than render it on the
// map (the earlier edgeless-root-island model) it now lives in a PERMANENT left "Shared
// Islands" panel. So in `buildWorld` a building-tagged story is UNCONDITIONALLY excluded from
// the laid-out `territories` whenever the distributed `buildings` flag is on (no `buildingIsland`
// coupling anymore) — it is not on the map, has no on-map nameplate/glyph, and no edge/rank to
// it exists (it never enters `stories`/`edgeList`). Its incident edges are PROMOTED to per-island
// icon STAMPS (ADR-0102): each consumer carries the building's identity icon ("you carry the icon
// of what you depend on") — a low-salience badge that stays on the map and links to the panel.
//
// Stage-1 red-green of the geometry/behaviour (ADR-0070): the panel's APPEARANCE (the
// full-island render inside the panel, the right-pop boxes, sizing) is owner-attested.

import { describe, it, expect } from 'vitest';
import { buildWorld, nameplateLayout } from './TreeView.js';
import { sharedIslandStories } from '../lib/buildingLayout.js';
import type { TreeStory } from '../types';

const cap = (id: string, dependsOn: string[] = []) => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped' as const,
  proofMode: 'red-green',
  dependsOn,
  testCount: 0,
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
// assert that (a) library is OFF the map, (b) no edge to it is drawn, and (c) the alpha→beta
// edge between two normal islands survives.
function corpus(): TreeStory[] {
  return [
    story('library', { building: true, consumedBy: ['cli', 'alpha'] }),
    story('cli', { dependsOn: ['library'] }),
    story('alpha', { dependsOn: ['library'] }),
    story('beta', { dependsOn: ['alpha'] }),
  ];
}

describe('buildWorld — building-class stories live OFF the map (ADR-0088)', () => {
  it('EXCLUDES every building-tagged story from territories when buildings is on (unconditional)', () => {
    const world = buildWorld(corpus(), { buildings: true });
    const ids = world.territories.map((t) => t.story.id).sort();
    // the library is absent — it lives in the Shared Islands panel, not the map
    expect(ids).toEqual(['alpha', 'beta', 'cli']);
    expect(ids).not.toContain('library');
  });

  it('PROMOTES library`s edges to per-island icon STAMPS on its consumers (ADR-0102)', () => {
    const world = buildWorld(corpus(), { buildings: true });
    const byId = Object.fromEntries(world.territories.map((t) => [t.story.id, t]));
    // cli and alpha depend on library → each carries library's icon; beta (only → alpha) carries none
    expect(byId['cli']!.stamps.map((s) => s.icon)).toEqual(['library']);
    expect(byId['alpha']!.stamps.map((s) => s.icon)).toEqual(['library']);
    expect(byId['beta']!.stamps).toEqual([]);
    // a carried stamp has a placed spot on owned land
    expect(byId['cli']!.stamps[0]!.spot).toBeDefined();
  });

  it('routes NO trail incident to a building (it never enters edgeList), keeping non-building edges', () => {
    const world = buildWorld(corpus(), { buildings: true });
    const edges = world.trails.edges;
    // no routed trail touches library (it is not laid out, so its edges never exist)
    expect(edges.some((e) => e.from === 'library' || e.to === 'library')).toBe(false);
    // the alpha→beta edge between two NORMAL islands is still routed
    expect(edges.some((e) => e.from === 'alpha' && e.to === 'beta')).toBe(true);
  });

  it('routes NO building edge in solar mode either (spokes stay building-free too)', () => {
    const world = buildWorld(corpus(), { buildings: true, layoutMode: 'solar' });
    const edges = world.trails.edges;
    const spokes = world.solar?.spokes ?? [];
    expect(edges.some((e) => e.from === 'library' || e.to === 'library')).toBe(false);
    expect(spokes.some((e) => e.from === 'library' || e.to === 'library')).toBe(false);
    // a non-building trail survives
    expect(edges.some((e) => e.from === 'alpha' && e.to === 'beta')).toBe(true);
  });

  it('no on-map nameplate carries the building glyph anymore (the glyph moved to the panel)', () => {
    const world = buildWorld(corpus(), { buildings: true });
    expect(world.territories.every((t) => t.buildingGlyph === false)).toBe(true);
  });

  it('is generic over story.building === true — a future shared island is excluded too', () => {
    const graph: TreeStory[] = [
      ...corpus(),
      story('future-shared', { building: true, consumedBy: ['beta'] }),
    ];
    const world = buildWorld(graph, { buildings: true });
    const ids = world.territories.map((t) => t.story.id);
    expect(ids).not.toContain('future-shared');
    // and beta now carries the new shared island's icon because it consumes it (ADR-0102)
    const beta = world.territories.find((t) => t.story.id === 'beta')!;
    expect(beta.stamps.map((s) => s.icon)).toContain('future-shared');
  });

  it('with buildings OFF the building is a normal connected island (the ?buildings=off escape)', () => {
    const off = buildWorld(corpus(), { buildings: false });
    const ids = off.territories.map((t) => t.story.id).sort();
    // library is a normal island when buildings are off — its edges are routed
    expect(ids).toEqual(['alpha', 'beta', 'cli', 'library']);
    expect(off.trails.edges.some((e) => e.to === 'cli' && e.from === 'library')).toBe(true);
    // no icon stamps when the buildings flag is off — every edge stays a trail (ADR-0102)
    expect(off.territories.every((t) => t.stamps.length === 0)).toBe(true);
  });
});

describe('sharedIslandStories — the panel roster (re-export check from buildWorld inputs)', () => {
  it('selects exactly the building-tagged stories the panel renders', () => {
    expect(sharedIslandStories(corpus()).map((s) => s.id)).toEqual(['library']);
  });
});

describe('nameplateLayout — the building card is the PANEL landmark (ADR-0088 keeps the glyph machinery)', () => {
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
