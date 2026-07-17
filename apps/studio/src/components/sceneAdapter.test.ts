// The studio scene-graph adapter (ADR-0093 Unit 2b): the real buildWorld → worldToScene →
// buildScene path. Stage-1 red-green of the studio render (ADR-0070): the studio's actual
// world model folds into the core's SceneInput and yields a correct drawable tree (the right
// island per status, caps as flora, the human-witness signpost, trails). The studio's VISUAL
// PARITY (the inline render vs `?render=scene`) is operator-attested, not asserted here.

import { describe, it, expect } from 'vitest';
import { buildScene, type SceneNode } from '@storytree/forest-world';
import { buildWorld, worldToScene, buildRelaxedCells } from './TreeView.js';
import type { BuildActivity, TreeCapability, TreeStory, WorkStatus } from '../types';

const cap = (id: string, status: WorkStatus = 'mapped'): TreeCapability => ({
  id,
  title: id,
  outcome: '',
  status,
  proofMode: 'red-green',
  dependsOn: [],
  testCount: 0,
});

const story = (id: string, over: Partial<TreeStory> = {}): TreeStory => ({
  id,
  title: id,
  outcome: '',
  status: 'mapped',
  proofMode: 'UAT',
  uatWitness: 'machine',
  dependsOn: [],
  consumedBy: [],
  capabilities: [],
  ...over,
});

const NOW = new Date('2026-06-23T00:00:00Z');
const NO_BUILDS = new Map<string, BuildActivity[]>();

function fixture(): TreeStory[] {
  return [
    story('foundation', {
      status: 'healthy',
      capabilities: [cap('foundation#a', 'healthy'), cap('foundation#b', 'unhealthy')],
    }),
    story('mid', { status: 'unhealthy', dependsOn: ['foundation'], capabilities: [cap('mid#a')] }),
    story('top', { status: 'mapped', uatWitness: 'human', dependsOn: ['mid'] }),
  ];
}

function scene(): SceneNode {
  const world = buildWorld(fixture());
  const cells = buildRelaxedCells(world, 'mesh', {});
  return buildScene(worldToScene(world, cells, NOW, NO_BUILDS));
}

// traversal
function kids(n: SceneNode): SceneNode[] {
  return n.el === 'g' ? n.children : [];
}
function all(n: SceneNode, kind: string): SceneNode[] {
  const out: SceneNode[] = [];
  const walk = (m: SceneNode): void => {
    if (m.kind === kind) out.push(m);
    for (const c of kids(m)) walk(c);
  };
  walk(n);
  return out;
}
function territory(n: SceneNode, id: string): SceneNode {
  const hit = all(n, 'territory').find((t) => t.id === id);
  if (!hit) throw new Error(`no territory ${id}`);
  return hit;
}

describe('worldToScene → buildScene (the real studio world model)', () => {
  it('folds the whole world into a drawable scene without throwing', () => {
    const s = scene();
    expect(s.kind).toBe('world');
    expect(all(s, 'territory')).toHaveLength(3);
    // mesh ground present (default world); each island has its coast.
    expect(all(s, 'ground').length).toBeGreaterThan(0);
    expect(all(s, 'coast').length).toBe(3);
  });

  it('renders the right central tree per folded status', () => {
    const s = scene();
    // healthy foundation → full canopy (5 low blobs), no bare branches.
    const foundation = territory(s, 'foundation');
    expect(all(foundation, 'crown-lo')[0] && kids(all(foundation, 'crown-lo')[0]!)).toHaveLength(5);
    expect(all(foundation, 'bare')).toHaveLength(0);
    // unhealthy mid → withered (bare branches present).
    expect(all(territory(s, 'mid'), 'bare')).toHaveLength(1);
  });

  it('gardens each capability as a PARCEL of ground, retiring the plant + conifer ring (forest-parcels inc 1)', () => {
    const s = scene();
    // territory flora layer: on a parcels-present (mesh) island the one-plant-per-cap ring AND the
    // decorative conifers are RETIRED — the capability land IS the capability now.
    const foundation = territory(s, 'foundation');
    expect(all(foundation, 'flora')).toHaveLength(0);
    expect(all(foundation, 'conifer')).toHaveLength(0);
    // the GROUND layer now carries one transparent parcel group per capability that won cells in the
    // Voronoi split (both caps here), keyed by capId and wearing the cap's folded status.
    const parcels = all(s, 'parcel').filter((p) => p.id?.startsWith('foundation#'));
    expect(parcels.length).toBeGreaterThan(0);
    expect(parcels.length).toBeLessThanOrEqual(2);
    expect(parcels.every((p) => p.status === 'healthy' || p.status === 'unhealthy')).toBe(true);
    // every ground cell inside a parcel carries a PER-CELL status (the tint moved from the whole
    // island down to the per-cap parcel).
    const foundationCells = parcels.flatMap((p) => all(p, 'cell'));
    expect(foundationCells.length).toBeGreaterThan(0);
    expect(foundationCells.every((c) => c.status === 'healthy' || c.status === 'unhealthy')).toBe(true);
  });

  it('marks the human-witness story with a signpost (blank until signed)', () => {
    const top = territory(scene(), 'top');
    expect(all(top, 'sign-blank')).toHaveLength(1);
    // a machine/absent-witness story carries none.
    expect(all(territory(scene(), 'foundation'), 'sign-blank')).toHaveLength(0);
  });

  it('routes the depends_on edges as the trail network (foundation←mid←top, ADR-0169)', () => {
    const s = scene();
    // the per-edge reveal metadata carries every depends_on edge…
    const edges = all(s, 'trail-edge');
    expect(edges.length).toBeGreaterThanOrEqual(2);
    const ends = edges.map((e) => `${e.from}->${e.to}`);
    expect(ends).toContain('foundation->mid');
    expect(ends).toContain('mid->top');
    // …each with an ordered segment chain naming real drawn segments
    const drawn = new Set(
      [...all(s, 'trail-fill'), ...all(s, 'trail-ghost')].map((n) => n.id),
    );
    for (const e of edges) {
      expect(e.segments && e.segments.length > 0).toBe(true);
      for (const part of (e.segments ?? '').split(',')) {
        expect(drawn.has(part.split(':')[0]!)).toBe(true);
      }
    }
    // the cased passes exist and never interleave (shadow, casing, fill, ghost groups)
    expect(all(s, 'trail-shadow-pass')).toHaveLength(1);
    expect(all(s, 'trail-casing-pass')).toHaveLength(1);
    expect(all(s, 'trail-fill-pass')).toHaveLength(1);
  });

  it('is deterministic — same world → byte-identical scene', () => {
    expect(scene()).toEqual(scene());
  });
});

// forest-parcels inc 1: the studio fold builds one PARCEL per capability (the land IS the capability)
// and threads it into the core's SceneInput. Asserted on `worldToScene`'s output — the exact shape this
// lane owns; the parcel GEOMETRY (Voronoi + themed flora) is the core's (forest-world/scene.test.ts).
describe('worldToScene → capability parcels', () => {
  function input() {
    const world = buildWorld(fixture());
    const cells = buildRelaxedCells(world, 'mesh', {});
    return worldToScene(world, cells, NOW, NO_BUILDS);
  }
  function terr(inp: ReturnType<typeof input>, id: string) {
    const t = inp.territories.find((x) => x.id === id);
    if (!t) throw new Error(`no territory ${id}`);
    return t;
  }

  it('builds one parcel per capability, carrying the cap status + testCount + a finite seed', () => {
    const foundation = terr(input(), 'foundation');
    expect(foundation.parcels).toHaveLength(2);
    const byId = new Map(foundation.parcels!.map((p) => [p.capId, p]));
    // the parcel's status is the cap's folded status (the SAME the plant/flora render uses)…
    expect(byId.get('foundation#a')!.status).toBe('healthy');
    expect(byId.get('foundation#b')!.status).toBe('unhealthy');
    for (const p of foundation.parcels!) {
      expect(p.testCount).toBe(0); // the fixture caps declare no contracts
      expect(Number.isFinite(p.seed.x) && Number.isFinite(p.seed.y)).toBe(true);
      expect(['meadow', 'woodland', 'heath']).toContain(p.theme);
    }
  });

  it('picks the theme deterministically from the capId (same world → same themes)', () => {
    const a = terr(input(), 'foundation').parcels!.map((p) => `${p.capId}:${p.theme}`);
    const b = terr(input(), 'foundation').parcels!.map((p) => `${p.capId}:${p.theme}`);
    expect(a).toEqual(b);
  });

  it('seeds each parcel at the SAME position buildWorld laid the cap plant out at', () => {
    const foundation = terr(input(), 'foundation');
    for (const p of foundation.parcels!) {
      const plant = foundation.plants.find((pl) => pl.id === p.capId)!;
      expect(p.seed).toEqual({ x: plant.x, y: plant.y });
    }
  });

  it('flows the declared testCount onto the parcel (the flora-density knob)', () => {
    const world = buildWorld([
      story('s', { capabilities: [{ ...cap('s#a', 'healthy'), testCount: 4 }] }),
    ]);
    const cells = buildRelaxedCells(world, 'mesh', {});
    const inp = worldToScene(world, cells, NOW, NO_BUILDS);
    const parcel = inp.territories.find((t) => t.id === 's')!.parcels![0]!;
    expect(parcel.testCount).toBe(4);
  });

  it('omits parcels for a story with NO capabilities (parcels-absent)', () => {
    // `top` declares no capabilities in the fixture → no parcels field (the core reads absent ⇒ today).
    expect(terr(input(), 'top').parcels).toBeUndefined();
  });
});

// forest-parcels inc 2: the studio fold threads the story's declared UAT criteria straight through to
// the core's `uatCriteria` scene field (the core owns the walk geometry + lantern placement entirely;
// this lane just carries the `{id, state}` shape across, exactly like `parcels` above).
describe('worldToScene → uatCriteria (the UAT lantern walk)', () => {
  function input(stories: TreeStory[]) {
    const world = buildWorld(stories);
    const cells = buildRelaxedCells(world, 'mesh', {});
    return worldToScene(world, cells, NOW, NO_BUILDS);
  }
  function terr(inp: ReturnType<typeof input>, id: string) {
    const t = inp.territories.find((x) => x.id === id);
    if (!t) throw new Error(`no territory ${id}`);
    return t;
  }

  it('threads a non-empty uatCriteria array through unchanged', () => {
    const stories = fixture();
    stories[0] = {
      ...stories[0]!,
      uatCriteria: [
        { id: 'foundation:c1', state: 'proven' },
        { id: 'foundation:c2', state: 'pending' },
        { id: 'foundation:c3', state: 'failing' },
      ],
    };
    const foundation = terr(input(stories), 'foundation');
    expect(foundation.uatCriteria).toEqual([
      { id: 'foundation:c1', state: 'proven' },
      { id: 'foundation:c2', state: 'pending' },
      { id: 'foundation:c3', state: 'failing' },
    ]);
  });

  it('omits the field when the story has no uatCriteria (absent or empty)', () => {
    // the fixture stories declare no uatCriteria at all.
    expect(terr(input(fixture()), 'foundation').uatCriteria).toBeUndefined();
    const stories = fixture();
    stories[0] = { ...stories[0]!, uatCriteria: [] };
    expect(terr(input(stories), 'foundation').uatCriteria).toBeUndefined();
  });
});
