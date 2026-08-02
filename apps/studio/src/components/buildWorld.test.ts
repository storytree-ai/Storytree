// buildWorld — the world-model→render seam (ADR-0069): a deterministic, pure function of
// the story data that lays out territories. These tests pin the STANDALONE single-island
// layout the SHARED ISLANDS PANEL relies on (ADR-0088, the left panel that replaced the
// on-map building islands): handing buildWorld a single building story with `buildings: false`
// (so it is NOT distributed/excluded) yields exactly ONE territory carrying that story's
// capabilities — the one-island Territory the panel renders with TerritoryFlora inside a
// self-contained <svg>. Stage-1 red-green of the geometry (ADR-0070); the panel's APPEARANCE
// is owner-attested.

import { describe, it, expect } from 'vitest';
import { buildWorld } from './TreeView.js';
import type { TreeStory } from '../types';

const cap = (id: string) => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped' as const,
  proofMode: 'red-green',
  dependsOn: [],
  testCount: 0,
});

const library = (): TreeStory => ({
  id: 'library',
  title: 'library',
  outcome: '',
  status: 'mapped',
  proofMode: 'UAT',
  uatWitness: 'human',
  dependsOn: [],
  consumedBy: ['cli'],
  building: true,
  capabilities: [cap('library-cli'), cap('seed-corpus'), cap('knowledge-render')],
});

describe('buildWorld — standalone single-island layout (Shared Islands panel)', () => {
  it('lays a single building story as exactly one territory carrying its capabilities', () => {
    // buildings:false ⇒ the building is NOT excluded; it lays out as a normal island (the
    // one-island Territory the panel renders for each shared island).
    const world = buildWorld([library()], { buildings: false });
    expect(world.territories).toHaveLength(1);
    const t = world.territories[0]!;
    expect(t.story.id).toBe('library');
    // every capability gets a garden spot on the island
    expect(t.caps.map((c) => c.cap.id).sort()).toEqual(
      ['knowledge-render', 'library-cli', 'seed-corpus'].sort(),
    );
    // the island carries no icon stamps of its own (buildings:false ⇒ no promotion; ADR-0102)
    expect(t.stamps).toEqual([]);
  });

  it('is deterministic — same input, byte-identical geometry (pure function of the data)', () => {
    const a = buildWorld([library()], { buildings: false });
    const b = buildWorld([library()], { buildings: false });
    expect(a.width).toBe(b.width);
    expect(a.height).toBe(b.height);
    expect(a.offset).toEqual(b.offset);
    expect(a.territories[0]!.treeSpot).toEqual(b.territories[0]!.treeSpot);
    expect(a.territories[0]!.coastPaths).toEqual(b.territories[0]!.coastPaths);
  });

  it('an edgeless world carries an EMPTY trail network (the router is skipped, never fed junk)', () => {
    const world = buildWorld([library()], { buildings: false });
    expect(world.trails).toEqual({ segments: [], edges: [], caves: [], dropped: [] });
  });
});

describe('buildWorld — the ADR-0169 trail network (roads route as trails, both layouts)', () => {
  const story = (id: string, dependsOn: string[] = []): TreeStory => ({
    id,
    title: id,
    outcome: '',
    status: 'mapped',
    proofMode: 'UAT',
    uatWitness: 'machine',
    dependsOn,
    consumedBy: [],
    capabilities: [cap(`${id}-a`)],
  });
  const fixture = (): TreeStory[] => [
    story('foundation'),
    story('mid', ['foundation']),
    story('top', ['mid']),
  ];

  it('routes every depends_on edge through ONE TrailNetwork with per-edge segment chains', () => {
    const world = buildWorld(fixture());
    const keys = world.trails.edges.map((e) => `${e.from}->${e.to}`);
    expect(keys).toContain('foundation->mid');
    expect(keys).toContain('mid->top');
    // every routed edge carries a non-empty ordered chain of real segment refs
    const segIds = new Set(world.trails.segments.map((s) => s.id));
    for (const e of world.trails.edges) {
      expect(e.segments.length).toBeGreaterThan(0);
      for (const ref of e.segments) expect(segIds.has(ref.id)).toBe(true);
    }
    // the tooltip vocabulary rides the edge (folded at routing time)
    expect(world.trails.edges[0]!.title).toMatch(/depends on/);
  });

  // ADR-0283 D2 (owner-directed 2026-08-02): DAG rows are the ONLY layout. `?layout=stress` /
  // `?layout=solar` are retired, so there is no second arrangement to hold the one-TrailNetwork
  // model against. (The companion `world.solar` assertion retired with the FIELD — the radial
  // layer is off `HexWorld` entirely now, so typecheck pins its absence, not a runtime expect.)
  it('lays out DAG rows whatever the URL said', () => {
    const world = buildWorld(fixture());
    const keys = world.trails.edges.map((e) => `${e.from}->${e.to}`);
    expect(keys).toContain('foundation->mid');
  });

  it('is deterministic — same stories, byte-identical network', () => {
    expect(buildWorld(fixture()).trails).toEqual(buildWorld(fixture()).trails);
  });
});

// ── ADR-0286: the pale coast is ATTRIBUTED, island by island ──
//
// The moat is derived from the UNION of claimed land, so it had no owner — and while it had none,
// the Act 2 regrow's per-story hide could not reach it: the map drew the whole forest's hexagonal
// silhouette from frame one, announcing every island before it existed. Naming the island each
// coast hex grew out of is what gives the hide a handle.
describe('buildWorld — the coast belongs to an island (ADR-0286)', () => {
  const story = (id: string, dependsOn: string[] = []): TreeStory => ({
    id,
    title: id,
    outcome: '',
    status: 'mapped',
    proofMode: 'UAT',
    uatWitness: 'machine',
    dependsOn,
    consumedBy: [],
    capabilities: [cap(`${id}-a`)],
  });
  const fixture = (): TreeStory[] => [
    story('foundation'),
    story('mid', ['foundation']),
    story('top', ['mid']),
  ];

  it('gives every coast hex an owning territory index', () => {
    const world = buildWorld(fixture());
    expect(world.empties.length).toBeGreaterThan(0);
    for (const hex of world.empties) {
      expect(typeof hex.owner, `coast hex ${hex.q},${hex.r} needs an owner`).toBe('number');
      expect(hex.owner).toBeGreaterThanOrEqual(0);
      expect(hex.owner).toBeLessThan(world.territories.length);
    }
  });

  it('spreads the coast across EVERY island, never parks it all on one', () => {
    const world = buildWorld(fixture());
    const owners = new Set(world.empties.map((h) => h.owner));
    // The point of attribution is that hiding one island hides only ITS moat. If every hex named
    // the same territory the hide would be all-or-nothing again, just spelled differently.
    expect(owners.size).toBe(world.territories.length);
  });

  it('is deterministic — the same stories attribute the same hexes to the same islands', () => {
    expect(buildWorld(fixture()).empties).toEqual(buildWorld(fixture()).empties);
  });

  it('leaves the coast geometry itself untouched (attribution adds, it does not move)', () => {
    const world = buildWorld(fixture());
    const bare = world.empties.map((h) => ({ q: h.q, r: h.r }));
    // A hex is still a hex at the same axial coordinate; `owner` rides alongside.
    expect(new Set(bare.map((h) => `${h.q},${h.r}`)).size).toBe(bare.length);
  });
});
