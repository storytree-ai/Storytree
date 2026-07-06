// trailReveal — Stage-1 red-green of the reveal-on-focus selector (ADR-0169 §3): the
// PURE (focused id, TrailNetwork) → ordered-segments-with-delays plan the DOM half
// (SceneView masks + index.css animation) consumes. Chain order, growth ends, the
// direction tints, and the shared-trunk folds are all pinned here; the LOOK of the
// animation is owner-attested (ADR-0070), never asserted.

import { describe, it, expect } from 'vitest';
import type { TrailNetwork } from '@storytree/forest-world';
import { trailRevealPlan, REVEAL_STAGGER_MS } from './trailReveal';

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
