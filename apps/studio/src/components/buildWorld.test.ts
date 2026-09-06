// buildWorld — the world-model→render seam (ADR-0069): a deterministic, pure function of
// the story data that lays out territories. These tests pin the STANDALONE single-island
// layout the SHARED ISLANDS PANEL relies on (ADR-0088, the left panel that replaced the
// on-map building islands): handing buildWorld a single building story with `buildings: false`
// (so it is NOT distributed/excluded) yields exactly ONE territory carrying that story's
// capabilities — the one-island Territory the panel renders with TerritoryFlora inside a
// self-contained <svg>. Stage-1 red-green of the geometry (ADR-0070); the panel's APPEARANCE
// is owner-attested.

import { describe, it, expect } from 'vitest';
import { buildWorld, parseArtRungs, parseSpacingTuning } from './TreeView.js';
import { ISLAND_SPACING_RATIO, ISLAND_SPACING_RUNGS } from '../lib/islandSpacing.js';
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

// ── ADR-0521: the spacing is a FRACTION OF ISLAND SIZE, not three constants ──
//
// The three absolute gaps (40 / 60 / 140) are retired; every gap is `gapBetween` over the two
// islands' estimated radii and a lone island's swing is the offset a same-row neighbour would have
// had. These pin the RULE at the packer — that the layout MOVES with the ratio, that the legacy
// triple stands the old map and ignores the ratio, and that the dial's grammar reads what a URL
// says — never a rung's look, which is the owner's off the rendered ladder.
describe('buildWorld — ADR-0521: the gaps derive from island size', () => {
  const caps = (id: string, n: number) => Array.from({ length: n }, (_, i) => cap(`${id}-${i}`));
  const story = (id: string, n: number, dependsOn: string[] = []): TreeStory => ({
    id,
    title: id,
    outcome: '',
    status: 'mapped',
    proofMode: 'UAT',
    uatWitness: 'machine',
    dependsOn,
    consumedBy: [],
    capabilities: caps(id, n),
  });
  /** Two independent big islands on the foundation row, and one lone island above them. */
  const fixture = (): TreeStory[] => [story('left', 11), story('right', 11), story('lone', 11, ['left', 'right'])];
  const centroid = (stories: TreeStory[], id: string, ratio: number) => {
    const w = buildWorld(stories, { spacing: { ratio } });
    const t = w.territories.find((x) => x.story.id === id);
    if (!t) throw new Error(`no territory ${id}`);
    return t.centroid;
  };

  it('same-row neighbours sit FURTHER apart at a larger ratio — the in-row gap is a fraction of their radii', () => {
    const near = Math.abs(centroid(fixture(), 'left', 0).x - centroid(fixture(), 'right', 0).x);
    const far = Math.abs(centroid(fixture(), 'left', 0.6).x - centroid(fixture(), 'right', 0.6).x);
    expect(far).toBeGreaterThan(near);
    // 0.6 × the mean radius of two 13-tile islands is ≈ 79 ground units before the lattice snaps
    // the seeds; the snapped distance must still have moved by at least one hex step (≈ 47).
    expect(far - near).toBeGreaterThan(40);
  });

  it('adjacent ranks sit FURTHER apart at a larger ratio — the row gap is the same fraction', () => {
    const rows = (ratio: number) =>
      Math.abs(centroid(fixture(), 'lone', ratio).y - (centroid(fixture(), 'left', ratio).y + centroid(fixture(), 'right', ratio).y) / 2);
    expect(rows(0.6)).toBeGreaterThan(rows(0));
  });

  it('the legacy triple stands the pre-ADR-0521 map and IGNORES the ratio — a control arm cannot be one of its own rungs', () => {
    const legacy = { rankGap: 40, islandGap: 60, rankSwing: 140 };
    const a = buildWorld(fixture(), { spacing: { ratio: 0, legacy } });
    const b = buildWorld(fixture(), { spacing: { ratio: 0.6, legacy } });
    expect(a.territories.map((t) => t.centroid)).toEqual(b.territories.map((t) => t.centroid));
    expect(a.width).toBe(b.width);
    // and it is a different layout from the ratio path at a ratio that is not it
    const c = buildWorld(fixture(), { spacing: { ratio: 0 } });
    expect(c.territories.map((t) => t.centroid)).not.toEqual(a.territories.map((t) => t.centroid));
  });

  it('a bare call lays out at the shipped ratio, not at the retired constants', () => {
    const bare = buildWorld(fixture());
    const shipped = buildWorld(fixture(), { spacing: { ratio: ISLAND_SPACING_RATIO } });
    expect(bare.territories.map((t) => t.centroid)).toEqual(shipped.territories.map((t) => t.centroid));
  });

  it('every trail still routes when the whole forest moves — no edge is dropped at any rung', () => {
    for (const ratio of ISLAND_SPACING_RUNGS) {
      const w = buildWorld(fixture(), { spacing: { ratio } });
      expect(w.trails.dropped).toEqual([]);
      expect(w.trails.edges.map((e) => `${e.from}->${e.to}`).sort()).toEqual(['left->lone', 'right->lone']);
    }
  });

  it('parseArtRungs (ADR-0528 D2): each ?<family>Rung= is a positive finite factor on the shipped rung; anything else is ignored, and a bare URL states no tile', () => {
    expect(parseArtRungs(new URLSearchParams(''))).toEqual({});
    expect(parseArtRungs(new URLSearchParams('?treeRung=0.8'))).toEqual({ tree: 0.8 });
    expect(parseArtRungs(new URLSearchParams('?plateRung=1.25&trailRung=2.44&floraRung=1.5'))).toEqual({ plate: 1.25, trail: 2.44, flora: 1.5 });
    expect(parseArtRungs(new URLSearchParams('?treeRung=0&plateRung=-1&trailRung=nope'))).toEqual({});
  });

  it('parseSpacingTuning: ?spacing= is the ratio; all three legacy keys together are the control, one or two are nothing', () => {
    expect(parseSpacingTuning(new URLSearchParams('?spacing=0.2'))).toEqual({ ratio: 0.2 });
    expect(parseSpacingTuning(new URLSearchParams('?rankGap=40&islandGap=60&rankSwing=140'))).toEqual({
      legacy: { rankGap: 40, islandGap: 60, rankSwing: 140 },
    });
    expect(parseSpacingTuning(new URLSearchParams('?rankGap=40&islandGap=60'))).toEqual({});
    expect(parseSpacingTuning(new URLSearchParams('?spacing=-1'))).toEqual({});
    expect(parseSpacingTuning(new URLSearchParams('?spacing=abc'))).toEqual({});
    expect(parseSpacingTuning(new URLSearchParams(''))).toEqual({});
  });
});
