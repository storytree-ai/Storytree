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

  it('gardens each capability as flora; a failing capability withers', () => {
    const foundation = territory(scene(), 'foundation');
    expect(all(foundation, 'flora')).toHaveLength(2);
    // the unhealthy capability shows a dead-ground patch; the healthy one does not.
    expect(all(foundation, 'dead-ground')).toHaveLength(1);
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
