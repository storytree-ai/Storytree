// stressLayout — Stage-1 red-green of the ADR-0171 dependency-aware placement
// GEOMETRY (the APPEARANCE is owner-attested, never asserted here). The three invariant
// families the research pass named: hierarchy is preserved (rank monotonicity), the
// long foundation→consumer edge SHRINKS vs strict layering, and the layout is
// byte-deterministic + order-independent (ADR-0169 §5 honesty).

import { describe, it, expect } from 'vitest';
import { stressSeeds, STRESS_OPTS, type StressNode, type StressEdge } from './stressLayout';

const N = (id: string, rank: number, radius = 30): StressNode => ({ id, rank, radius });
const E = (from: string, to: string): StressEdge => ({ from, to });

/** distance between two placed nodes, by id. */
function distOf(seeds: Map<number, { x: number; y: number }>, ids: string[], a: string, b: string): number {
  const pa = seeds.get(ids.indexOf(a))!;
  const pb = seeds.get(ids.indexOf(b))!;
  return Math.hypot(pa.x - pb.x, pa.y - pb.y);
}
const yOf = (seeds: Map<number, { x: number; y: number }>, ids: string[], id: string): number =>
  seeds.get(ids.indexOf(id))!.y;

describe('stressSeeds — dependency-aware placement (ADR-0171)', () => {
  it('is deterministic — same inputs, byte-identical positions', () => {
    const nodes = [N('a', 0), N('b', 1), N('c', 2)];
    const edges = [E('a', 'b'), E('b', 'c')];
    expect(stressSeeds(nodes, edges, 's')).toEqual(stressSeeds(nodes, edges, 's'));
  });

  it('is ORDER-INDEPENDENT — each id lands the same regardless of input order', () => {
    const nodes = [N('a', 0), N('b', 1), N('c', 2), N('d', 1)];
    const edges = [E('a', 'b'), E('b', 'c'), E('a', 'd')];
    const ids1 = nodes.map((n) => n.id);
    const s1 = stressSeeds(nodes, edges, 's');
    // shuffle both nodes and edges
    const nodes2 = [nodes[2]!, nodes[0]!, nodes[3]!, nodes[1]!];
    const edges2 = [edges[2]!, edges[1]!, edges[0]!];
    const ids2 = nodes2.map((n) => n.id);
    const s2 = stressSeeds(nodes2, edges2, 's');
    for (const id of ids1) {
      const p1 = s1.get(ids1.indexOf(id))!;
      const p2 = s2.get(ids2.indexOf(id))!;
      expect(p2.x).toBeCloseTo(p1.x, 6);
      expect(p2.y).toBeCloseTo(p1.y, 6);
    }
  });

  it('preserves HIERARCHY — a linear dependency chain lays out monotonically in y (up = dependent)', () => {
    // d depends on c depends on b depends on a (from → to = "to depends on from").
    const ids = ['a', 'b', 'c', 'd'];
    const nodes = [N('a', 0), N('b', 1), N('c', 2), N('d', 3)];
    const edges = [E('a', 'b'), E('b', 'c'), E('c', 'd')];
    const s = stressSeeds(nodes, edges, 's');
    // up is negative y: the foundation `a` is lowest (largest y), the leaf `d` highest.
    expect(yOf(s, ids, 'a')).toBeGreaterThan(yOf(s, ids, 'b'));
    expect(yOf(s, ids, 'b')).toBeGreaterThan(yOf(s, ids, 'c'));
    expect(yOf(s, ids, 'c')).toBeGreaterThan(yOf(s, ids, 'd'));
  });

  it('SHORTENS the long foundation→consumer trail vs strict layering (the owner complaint)', () => {
    // A chain base→m1→m2→m3→top PLUS a DIRECT base→top edge: strict layering pins `top`
    // at rank 4 (far up) and `base` at rank 0, so the direct base→top edge spans the
    // whole forest. The soft y-anchor lets `top` relax DOWN toward `base`, shortening it.
    const ids = ['base', 'm1', 'm2', 'm3', 'top'];
    const nodes = [N('base', 0), N('m1', 1), N('m2', 2), N('m3', 3), N('top', 4)];
    const edges = [E('base', 'm1'), E('m1', 'm2'), E('m2', 'm3'), E('m3', 'top'), E('base', 'top')];
    const soft = stressSeeds(nodes, edges, 's', { ...STRESS_OPTS, alphaFrac: 0.55 });
    // a very large alpha pins y ≈ rank → the strict-layered baseline (x still relaxes).
    const pinned = stressSeeds(nodes, edges, 's', { ...STRESS_OPTS, alphaFrac: 400 });
    const softLong = distOf(soft, ids, 'base', 'top');
    const pinnedLong = distOf(pinned, ids, 'base', 'top');
    expect(softLong).toBeLessThan(pinnedLong);
    // and hierarchy still reads: base stays below top even when relaxed.
    expect(yOf(soft, ids, 'base')).toBeGreaterThan(yOf(soft, ids, 'top'));
  });

  it('places dependency-adjacent islands CLOSER than unrelated ones', () => {
    // two separate 2-chains: a→b and (disconnected) x→y. a&b are adjacent; a&x are not.
    const ids = ['a', 'b', 'x', 'y'];
    const nodes = [N('a', 0), N('b', 1), N('x', 0), N('y', 1)];
    const edges = [E('a', 'b'), E('x', 'y')];
    const s = stressSeeds(nodes, edges, 's');
    const adjacent = distOf(s, ids, 'a', 'b');
    const unrelated = distOf(s, ids, 'a', 'x');
    expect(adjacent).toBeLessThan(unrelated);
  });

  it('produces finite coordinates for a disconnected graph (no NaN, no fly-off)', () => {
    const nodes = [N('a', 0), N('b', 1), N('lone', 0)];
    const edges = [E('a', 'b')]; // `lone` is its own component
    const s = stressSeeds(nodes, edges, 's');
    for (const p of s.values()) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('handles the degenerate sizes (0 and 1 nodes)', () => {
    expect(stressSeeds([], [], 's').size).toBe(0);
    const one = stressSeeds([N('solo', 0)], [], 's');
    expect(one.get(0)).toEqual({ x: 0, y: 0 });
  });
});
