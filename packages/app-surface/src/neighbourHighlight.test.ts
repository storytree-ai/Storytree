// neighbourHighlight — Stage-1 red-green of the selection selector (ADR-0242): the PURE
// (TrailNetwork, selected id) → which trail segments are LIT and which islands are the
// immediate upstream / downstream neighbours. The two properties that decide the
// treatment are pinned here — a trunk shared with a NON-incident edge is still lit (the
// road is genuinely on the selection's route), and a segment reachable only through a
// non-incident edge is NOT — plus the one-hop fence. The LOOK of the lane and the rings
// is owner-attested (ADR-0070 stage 2), never asserted here.

import { describe, it, expect } from 'vitest';
import type { TrailNetwork } from '@storytree/forest-world';
import { neighbourHighlightPlan } from './neighbourHighlight.js';

const seg = (id: string, usage = 1, hidden = false) => ({
  id,
  d: 'M 0 0 C 1 1 2 2 3 3',
  points: [
    { x: 0, y: 0 },
    { x: 3, y: 3 },
  ],
  usage,
  hidden,
});

/**
 * An edge `from → to` means "`to` depends on `from`" (TreeView stamps exactly that title
 * on every routed edge), so `from` is the dependency and `to` the dependent.
 *
 *   proof ──sA──▶ library ──sB──▶ ┐
 *                                 ├─sC (TRUNK, shared)──▶ drive ──sE──▶ studio
 *   orchestrator ────────────sD───┘                    (cli rides sC too)
 *
 * Selecting `library`: sA/sB/sC are on its own edges; sD is on a stranger's edge that
 * merely SHARES sC; sE is one hop further out.
 */
function network(): TrailNetwork {
  return {
    segments: [seg('sA'), seg('sB'), seg('sC', 2), seg('sD'), seg('sE')],
    edges: [
      { from: 'proof', to: 'library', segments: [{ id: 'sA', reversed: false }] },
      {
        from: 'library',
        to: 'drive',
        segments: [
          { id: 'sB', reversed: false },
          { id: 'sC', reversed: true },
        ],
      },
      // a stranger's edge that funnels onto the SAME trunk segment sC
      {
        from: 'orchestrator',
        to: 'cli',
        segments: [
          { id: 'sD', reversed: false },
          { id: 'sC', reversed: false },
        ],
      },
      { from: 'drive', to: 'studio', segments: [{ id: 'sE', reversed: false }] },
    ],
    caves: [],
    dropped: [],
  };
}

describe('neighbourHighlightPlan', () => {
  it('returns null with no network or no selection', () => {
    expect(neighbourHighlightPlan(null, 'library')).toBeNull();
    expect(neighbourHighlightPlan(network(), null)).toBeNull();
    expect(neighbourHighlightPlan(network(), '')).toBeNull();
  });

  it('splits the immediate neighbours by direction (`to` depends on `from`)', () => {
    const plan = neighbourHighlightPlan(network(), 'library');
    expect(plan?.upstreamIds).toEqual(['proof']); // what library stands on
    expect(plan?.downstreamIds).toEqual(['drive']); // who stands on library
  });

  it('lights every segment on the selection’s own edges, and nothing else', () => {
    const plan = neighbourHighlightPlan(network(), 'library');
    expect(plan?.litSegmentIds).toEqual(['sA', 'sB', 'sC']);
  });

  it('lights a trunk the selection shares with a non-incident edge — once', () => {
    const plan = neighbourHighlightPlan(network(), 'library');
    // sC carries library→drive AND the stranger orchestrator→cli: it IS on the
    // selection's route, so it lights; the shared road is honest about it by staying
    // wider than the lane, not by going dark.
    expect(plan?.litSegments.has('sC')).toBe(true);
    expect(plan?.litSegmentIds.filter((id) => id === 'sC')).toHaveLength(1);
  });

  it('does NOT light a segment reachable only through a non-incident edge', () => {
    const plan = neighbourHighlightPlan(network(), 'library');
    expect(plan?.litSegments.has('sD')).toBe(false);
  });

  it('fences the reading at ONE hop — no transitive chain', () => {
    const plan = neighbourHighlightPlan(network(), 'library');
    expect(plan?.litSegments.has('sE')).toBe(false); // drive→studio is two hops out
    expect(plan?.upstreamIds).not.toContain('orchestrator');
    expect(plan?.downstreamIds).not.toContain('studio');
  });

  it('keeps a story that is both a dependency and a dependent on both sides', () => {
    const cyclic: TrailNetwork = {
      segments: [seg('s1'), seg('s2')],
      edges: [
        { from: 'a', to: 'b', segments: [{ id: 's1', reversed: false }] },
        { from: 'b', to: 'a', segments: [{ id: 's2', reversed: false }] },
      ],
      caves: [],
      dropped: [],
    };
    const plan = neighbourHighlightPlan(cyclic, 'a');
    expect(plan?.upstreamIds).toEqual(['b']);
    expect(plan?.downstreamIds).toEqual(['b']);
    expect(plan?.litSegmentIds).toEqual(['s1', 's2']);
  });

  it('never reports the selection as its own neighbour', () => {
    const selfish: TrailNetwork = {
      segments: [seg('s1')],
      edges: [{ from: 'a', to: 'a', segments: [{ id: 's1', reversed: false }] }],
      caves: [],
      dropped: [],
    };
    const plan = neighbourHighlightPlan(selfish, 'a');
    expect(plan?.upstreamIds).toEqual([]);
    expect(plan?.downstreamIds).toEqual([]);
    expect(plan?.litSegmentIds).toEqual([]);
  });

  it('yields an empty plan (not null) for a selected island with no edges', () => {
    const plan = neighbourHighlightPlan(network(), 'lonely');
    expect(plan).not.toBeNull();
    expect(plan?.selectedId).toBe('lonely');
    expect(plan?.litSegmentIds).toEqual([]);
    expect(plan?.upstreamIds).toEqual([]);
    expect(plan?.downstreamIds).toEqual([]);
  });

  it('is deterministic and input-order independent', () => {
    const forward = network();
    const reversed: TrailNetwork = { ...forward, edges: [...forward.edges].reverse() };
    const a = neighbourHighlightPlan(forward, 'library');
    const b = neighbourHighlightPlan(reversed, 'library');
    expect(a?.litSegmentIds).toEqual(b?.litSegmentIds);
    expect(a?.upstreamIds).toEqual(b?.upstreamIds);
    expect(a?.downstreamIds).toEqual(b?.downstreamIds);
  });
});
