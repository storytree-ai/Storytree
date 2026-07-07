// trailReveal — Stage-1 red-green of the reveal-on-focus selector (ADR-0169 §3): the
// PURE (focused id, TrailNetwork) → ordered-segments-with-delays plan the DOM half
// (SceneView masks + index.css animation) consumes. Chain order, growth ends, the
// direction tints, and the shared-trunk folds are all pinned here; the LOOK of the
// animation is owner-attested (ADR-0070), never asserted.

import { describe, it, expect } from 'vitest';
import type { TrailNetwork } from '@storytree/forest-world';
import { trailRevealPlan, arrivalGrowPlan, REVEAL_STAGGER_MS } from './trailReveal';

const seg = (id: string, hidden = false) => ({
  id,
  d: `M 0 0 C 1 1 2 2 3 3`,
  points: [{ x: 0, y: 0 }, { x: 3, y: 3 }],
  usage: 1,
  hidden,
});

/** foundation ←(s1,s2)— mid ←(s3)— top, plus an unrelated x→y edge on s4. The
 *  mid→top chain rides s3 REVERSED (its geometry is drawn top→mid). */
function network(): TrailNetwork {
  return {
    segments: [seg('s1'), seg('s2'), seg('s3'), seg('s4')],
    edges: [
      {
        from: 'foundation',
        to: 'mid',
        segments: [
          { id: 's1', reversed: false },
          { id: 's2', reversed: true },
        ],
      },
      { from: 'mid', to: 'top', segments: [{ id: 's3', reversed: true }] },
      { from: 'x', to: 'y', segments: [{ id: 's4', reversed: false }] },
    ],
    caves: [],
    dropped: [],
  };
}

describe('trailRevealPlan — the pure reveal selector', () => {
  it('is null when nothing is focused (and only then — an edgeless focus still plans)', () => {
    expect(trailRevealPlan(network(), null)).toBeNull();
    expect(trailRevealPlan(null, 'mid')).toBeNull();
    // a focused island with no incident edges yields an EMPTY plan, not null — the
    // world still dims around it.
    const lonely = trailRevealPlan(network(), 'nowhere');
    expect(lonely).not.toBeNull();
    expect(lonely!.segments).toEqual([]);
  });

  it('reveals the UNION of the focused island`s incident edges — never the rest (§5 honesty)', () => {
    const plan = trailRevealPlan(network(), 'mid')!;
    // both incident edges' segments, nothing from the unrelated x→y edge.
    expect([...plan.byId.keys()].sort()).toEqual(['s1', 's2', 's3']);
    expect(plan.byId.has('s4')).toBe(false);
  });

  it('staggers outward from the island in chain order (~350ms per chain position)', () => {
    const plan = trailRevealPlan(network(), 'mid')!;
    // foundation→mid walked FROM mid: s2 first (delay 0), s1 second (one stagger).
    expect(plan.byId.get('s2')!.delayMs).toBe(0);
    expect(plan.byId.get('s1')!.delayMs).toBe(REVEAL_STAGGER_MS);
    // mid→top walked from mid in chain order: s3 at delay 0.
    expect(plan.byId.get('s3')!.delayMs).toBe(0);
    // the plan lists segments by delay, then id — a stable, render-ready order.
    expect(plan.segments.map((s) => s.id)).toEqual(['s2', 's3', 's1']);
  });

  it('grows each segment from the end nearest the island (reversed chain entries flip)', () => {
    const plan = trailRevealPlan(network(), 'mid')!;
    // foundation→mid is an incoming chain (to === mid): walked backwards, so a
    // NON-reversed ref grows from its geometric END and a reversed ref from its start.
    expect(plan.byId.get('s1')!.fromEnd).toBe(true);
    expect(plan.byId.get('s2')!.fromEnd).toBe(false);
    // mid→top is walked forward (from === mid): a reversed ref grows from its end.
    expect(plan.byId.get('s3')!.fromEnd).toBe(true);
  });

  it('tints by direction: dependencies warm `out`, dependents cooler `in`', () => {
    const plan = trailRevealPlan(network(), 'mid')!;
    // mid depends on foundation (to === mid) → out; top depends on mid (from === mid) → in.
    expect(plan.byId.get('s1')!.dir).toBe('out');
    expect(plan.byId.get('s3')!.dir).toBe('in');
  });

  it('folds a shared trunk: earliest reveal wins, directions merge to `both`, usage counts', () => {
    const net: TrailNetwork = {
      segments: [seg('trunk'), seg('spur')],
      edges: [
        // f's dependency: walked outward from f the spur comes first, the trunk at
        // chain position 1 (delay 350) …
        {
          from: 'dep',
          to: 'f',
          segments: [
            { id: 'trunk', reversed: false },
            { id: 'spur', reversed: false },
          ],
        },
        // … but f's dependent reaches the SAME trunk at chain position 0 (delay 0).
        { from: 'f', to: 'user', segments: [{ id: 'trunk', reversed: false }] },
      ],
      caves: [],
      dropped: [],
    };
    const plan = trailRevealPlan(net, 'f')!;
    const trunk = plan.byId.get('trunk')!;
    expect(trunk.delayMs).toBe(0); // the earlier chain position wins the stagger
    expect(trunk.dir).toBe('both'); // in + out merge — the multi-reveal neutral tint
    expect(trunk.revealedUsage).toBe(2); // the §3 width step-up counts REVEALED edges
    expect(plan.byId.get('spur')!.revealedUsage).toBe(1);
  });

  it('is deterministic — same inputs, identical plan', () => {
    expect(trailRevealPlan(network(), 'mid')).toEqual(trailRevealPlan(network(), 'mid'));
  });
});

/** A 4-island dependency chain a →(e1) b →(e2) c →(e3) d, plus an unrelated x→y (e4)
 *  in a SEPARATE component. `from → to` means "`to` depends on `from`", so the
 *  dependency order runs a ⟵ b ⟵ c ⟵ d and the whole chain is one connected run. */
function chainNetwork(): TrailNetwork {
  return {
    segments: [seg('e1'), seg('e2'), seg('e3'), seg('e4')],
    edges: [
      { from: 'a', to: 'b', segments: [{ id: 'e1', reversed: false }] },
      { from: 'b', to: 'c', segments: [{ id: 'e2', reversed: false }] },
      { from: 'c', to: 'd', segments: [{ id: 'e3', reversed: false }] },
      { from: 'x', to: 'y', segments: [{ id: 'e4', reversed: false }] },
    ],
    caves: [],
    dropped: [],
  };
}

describe('trailRevealPlan — full transitive dependency-chain reveal (owner 2026-07-06)', () => {
  it('reveals the WHOLE chain both directions from a mid-chain island, not just neighbours', () => {
    const plan = trailRevealPlan(chainNetwork(), 'b')!;
    // b's dependency (upstream): a via e1. b's dependents (downstream, transitively):
    // c via e2, then d via e3. e4 is a different component — never revealed.
    expect([...plan.byId.keys()].sort()).toEqual(['e1', 'e2', 'e3']);
    expect(plan.byId.has('e4')).toBe(false);
  });

  it('tints the upstream run `out` and the downstream run `in`', () => {
    const plan = trailRevealPlan(chainNetwork(), 'b')!;
    expect(plan.byId.get('e1')!.dir).toBe('out'); // a is b's dependency
    expect(plan.byId.get('e2')!.dir).toBe('in'); // c depends on b
    expect(plan.byId.get('e3')!.dir).toBe('in'); // d depends on c (transitive)
  });

  it('accumulates delay outward: a farther hop reveals later than a nearer one', () => {
    const plan = trailRevealPlan(chainNetwork(), 'b')!;
    // direct hops (e1 upstream, e2 downstream) reveal at 0; the second downstream hop
    // (e3) waits one full chain (e2 is one segment) → REVEAL_STAGGER_MS.
    expect(plan.byId.get('e1')!.delayMs).toBe(0);
    expect(plan.byId.get('e2')!.delayMs).toBe(0);
    expect(plan.byId.get('e3')!.delayMs).toBe(REVEAL_STAGGER_MS);
  });

  it('from a foundation island reveals the entire downstream chain', () => {
    const plan = trailRevealPlan(chainNetwork(), 'a')!;
    expect([...plan.byId.keys()].sort()).toEqual(['e1', 'e2', 'e3']);
    // all downstream (dependents), staggered by hop distance.
    expect(plan.byId.get('e1')!.dir).toBe('in');
    expect(plan.byId.get('e1')!.delayMs).toBe(0);
    expect(plan.byId.get('e2')!.delayMs).toBe(REVEAL_STAGGER_MS);
    expect(plan.byId.get('e3')!.delayMs).toBe(2 * REVEAL_STAGGER_MS);
  });

  it('a diamond folds the shared tail to `both` (reached upstream AND downstream)', () => {
    // f depends on g and h; both g and h depend on base. Focus f: base is reached both
    // via g (up then up) — but base is also a common ancestor; the base→g and base→h
    // edges are upstream-only here, so verify the two upstream branches both reveal.
    const diamond: TrailNetwork = {
      segments: [seg('fg'), seg('fh'), seg('gb'), seg('hb')],
      edges: [
        { from: 'g', to: 'f', segments: [{ id: 'fg', reversed: false }] },
        { from: 'h', to: 'f', segments: [{ id: 'fh', reversed: false }] },
        { from: 'base', to: 'g', segments: [{ id: 'gb', reversed: false }] },
        { from: 'base', to: 'h', segments: [{ id: 'hb', reversed: false }] },
      ],
      caves: [],
      dropped: [],
    };
    const plan = trailRevealPlan(diamond, 'f')!;
    // the whole upstream diamond reveals: both branches to base.
    expect([...plan.byId.keys()].sort()).toEqual(['fg', 'fh', 'gb', 'hb']);
    for (const id of ['fg', 'fh', 'gb', 'hb']) expect(plan.byId.get(id)!.dir).toBe('out');
  });

  it('terminates on a dependency cycle (defensive — no infinite walk)', () => {
    const cyclic: TrailNetwork = {
      segments: [seg('p'), seg('q'), seg('rr')],
      edges: [
        { from: 'a', to: 'b', segments: [{ id: 'p', reversed: false }] },
        { from: 'b', to: 'c', segments: [{ id: 'q', reversed: false }] },
        { from: 'c', to: 'a', segments: [{ id: 'rr', reversed: false }] }, // closes the loop
      ],
      caves: [],
      dropped: [],
    };
    const plan = trailRevealPlan(cyclic, 'a')!;
    expect([...plan.byId.keys()].sort()).toEqual(['p', 'q', 'rr']);
  });

  it('is deterministic on the chain fixture too', () => {
    expect(trailRevealPlan(chainNetwork(), 'b')).toEqual(trailRevealPlan(chainNetwork(), 'b'));
  });
});

describe('arrivalGrowPlan — the arrival draw-on selector (owner 2026-07-07)', () => {
  it('is null when nothing is arriving', () => {
    expect(arrivalGrowPlan(network(), null)).toBeNull();
    expect(arrivalGrowPlan(network(), new Set())).toBeNull();
    expect(arrivalGrowPlan(null, new Set(['mid']))).toBeNull();
  });

  it('grows ONLY the arriving island`s DIRECT incident edges, not the transitive chain', () => {
    // 'top' arrives: its one direct edge is mid→top (s3). foundation→mid (s1,s2) is a hop
    // further — a transitive reveal would include it; an arrival draw-on must NOT.
    const plan = arrivalGrowPlan(network(), new Set(['top']))!;
    expect(plan.byId.has('s3')).toBe(true);
    expect(plan.byId.has('s1')).toBe(false);
    expect(plan.byId.has('s2')).toBe(false);
    expect(plan.byId.has('s4')).toBe(false); // the unrelated x→y edge never draws
  });

  it('grows an arriving hub`s incident edges on both sides, and only real ones (§5)', () => {
    // 'mid' arrives: foundation→mid (s1,s2) AND mid→top (s3) draw on; x→y (s4) does not.
    const plan = arrivalGrowPlan(network(), new Set(['mid']))!;
    expect([...plan.byId.keys()].sort()).toEqual(['s1', 's2', 's3']);
  });

  it('staggers a multi-segment edge by chain position, growing from the new island', () => {
    // foundation→mid rides [s1, s2]; 'foundation' arrives ⇒ walk forward from it: s1
    // draws first (delay 0), s2 one stagger later.
    const plan = arrivalGrowPlan(network(), new Set(['foundation']))!;
    expect(plan.byId.get('s1')!.delayMs).toBe(0);
    expect(plan.byId.get('s2')!.delayMs).toBe(REVEAL_STAGGER_MS);
  });

  it('is deterministic — same input, deep-equal plan', () => {
    expect(arrivalGrowPlan(network(), new Set(['mid']))).toEqual(
      arrivalGrowPlan(network(), new Set(['mid'])),
    );
  });
});
