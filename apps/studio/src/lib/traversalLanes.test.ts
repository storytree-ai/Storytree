// Red-green on the lane model (`traversal-panel-arc`, increment `traversal-panel-lanes-and-depth`).
//
// The increment's proof route names two of these outright — "a lane with a recorded model renders it
// and a lane without renders the not-recorded state", and "two children overlapping in time render as
// concurrent lanes while sequential ones do not". The rest are the honest gaps: pairing is by `edgeId`
// and never by proximity, an unreturned lane is OPEN rather than closed at a guess, and a return with
// no handoff is reported rather than dropped.

import { describe, it, expect } from 'vitest';
import type { TraversalEventEnvelope } from '../types';
import { buildTraversalLanes, laneInstants } from './traversalLanes';
import { buildTraversalTimeScale } from './traversalTime';

const SESSION = 'bold-dhawan-b6970b';
const T0 = Date.parse('2026-08-12T09:00:00.000Z');

function at(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

function handoff(
  edgeId: string,
  offsetMs: number,
  over: Partial<{ agentType: string; model: string; runtime: 'sdk-leaf' | 'codex-leaf' | 'owned-loop' }> = {},
): TraversalEventEnvelope {
  return {
    kind: 'spawn_handoff',
    eventId: `event:spawn:${edgeId}`,
    sessionId: SESSION,
    at: at(offsetMs),
    edgeId,
    parentSessionId: SESSION,
    childSessionId: `child-${edgeId}`,
    agentType: 'Explore',
    ...over,
  };
}

function result(edgeId: string, offsetMs: number, ok = true): TraversalEventEnvelope {
  return {
    kind: 'result_return',
    eventId: `event:return:${edgeId}`,
    sessionId: SESSION,
    at: at(offsetMs),
    edgeId,
    parentSessionId: SESSION,
    childSessionId: `child-${edgeId}`,
    ok,
  };
}

/** The axis the render will use — built over every lane instant, exactly as the spine builds it. */
function scaleFor(events: TraversalEventEnvelope[]) {
  return buildTraversalTimeScale(laneInstants(events));
}

function build(events: TraversalEventEnvelope[]) {
  return buildTraversalLanes(events, scaleFor(events));
}

describe('a lane names the model it ran on, or says it was not recorded', () => {
  it('renders the recorded model verbatim, with its runtime', () => {
    const model = build([
      handoff('e1', 0, { model: 'gpt-5.6-terra', runtime: 'codex-leaf', agentType: 'green-builder' }),
      result('e1', 60_000),
    ]);

    expect(model.lanes).toHaveLength(1);
    expect(model.lanes[0]?.model).toBe('gpt-5.6-terra');
    expect(model.lanes[0]?.runtime).toBe('codex-leaf');
    expect(model.lanes[0]?.agentType).toBe('green-builder');
  });

  it('reports an unrecorded model as null — never a default, and never inferred from the runtime', () => {
    const model = build([handoff('e1', 0, { runtime: 'sdk-leaf' }), result('e1', 60_000)]);

    expect(model.lanes[0]?.model).toBeNull();
    // The runtime IS recorded here, and it still does not become a model. That inference is exactly
    // what the arc's multi-provider clause forbids.
    expect(model.lanes[0]?.runtime).toBe('sdk-leaf');
  });
});

describe('concurrency is measured from the recorded intervals, never assumed', () => {
  it('gives two overlapping children their own columns', () => {
    const model = build([
      handoff('e1', 0),
      handoff('e2', 30_000),
      result('e1', 120_000),
      result('e2', 150_000),
    ]);

    expect(model.columnCount).toBe(2);
    expect(new Set(model.lanes.map((lane) => lane.column)).size).toBe(2);
  });

  it('puts two children that ran back-to-back in the SAME column', () => {
    const model = build([
      handoff('e1', 0),
      result('e1', 60_000),
      handoff('e2', 120_000),
      result('e2', 180_000),
    ]);

    expect(model.columnCount).toBe(1);
    expect(model.lanes.map((lane) => lane.column)).toEqual([0, 0]);
  });

  it('keeps two children spawned in the SAME millisecond apart', () => {
    // The ordinary shape of a `--real` build leaf pair: both the handoff and the return of each are
    // recorded retrospectively at one instant. Collapsing them into one column would read as
    // sequential work that never happened sequentially.
    const model = build([handoff('e1', 0), handoff('e2', 0), result('e1', 0), result('e2', 0)]);

    expect(model.columnCount).toBe(2);
  });

  it('packs a third child back into a freed column rather than opening a new one', () => {
    const model = build([
      handoff('e1', 0),
      handoff('e2', 10_000),
      result('e1', 60_000),
      handoff('e3', 120_000),
      result('e2', 180_000),
      result('e3', 200_000),
    ]);

    expect(model.columnCount).toBe(2);
  });
});

describe('the honest gaps are reported, never smoothed', () => {
  it('leaves a lane with no recorded return OPEN, ending at the axis rather than at a guess', () => {
    const events = [handoff('e1', 0), handoff('e2', 10_000), result('e2', 60_000)];
    const model = build(events);
    const open = model.lanes.find((lane) => lane.edgeId === 'e1');

    expect(open?.endMs).toBeNull();
    expect(open?.ok).toBeNull();
    expect(model.openLanes).toBe(1);
    // It is drawn to the end of the axis — as far as the observation goes, and no further.
    expect(open?.y1).toBe(scaleFor(events).totalPx);
  });

  it('reports a result_return naming an edge no handoff opened', () => {
    const model = build([handoff('e1', 0), result('e1', 30_000), result('ghost', 40_000)]);

    expect(model.lanes).toHaveLength(1);
    expect(model.unpairedReturns).toBe(1);
  });

  it('reports a trace of returns alone rather than reading as a trace with no lane events', () => {
    const model = build([result('ghost', 0), result('other', 10_000)]);

    expect(model.lanes).toHaveLength(0);
    expect(model.unpairedReturns).toBe(2);
  });

  it('counts a lane event with no readable timestamp rather than placing it', () => {
    const broken = { ...handoff('e1', 0), at: 'not-a-timestamp' } as TraversalEventEnvelope;
    const model = build([broken, handoff('e2', 10_000), result('e2', 20_000)]);

    expect(model.undatable).toBe(1);
    expect(model.lanes).toHaveLength(1);
  });

  it('pairs by edgeId and never by adjacency in time', () => {
    // `e2` returns FIRST even though it was spawned second. Pairing on nearness would close `e1` on
    // `e2`'s return and leave the trace claiming a child that ran for a third of its real span.
    const model = build([handoff('e1', 0), handoff('e2', 10_000), result('e2', 20_000), result('e1', 90_000)]);

    const first = model.lanes.find((lane) => lane.edgeId === 'e1');
    expect(first?.endMs).toBe(T0 + 90_000);
    expect(model.lanes.find((lane) => lane.edgeId === 'e2')?.endMs).toBe(T0 + 20_000);
  });

  it('keeps the FIRST return for an edge, so a duplicate cannot stretch the band', () => {
    const model = build([handoff('e1', 0), result('e1', 30_000), result('e1', 300_000)]);
    expect(model.lanes[0]?.endMs).toBe(T0 + 30_000);
  });
});

describe('the agent-type domain is stable', () => {
  it('lists distinct types sorted, so a colour keyed on it does not shuffle between reads', () => {
    const model = build([
      handoff('e1', 0, { agentType: 'librarian-curator' }),
      handoff('e2', 10_000, { agentType: 'Explore' }),
      handoff('e3', 20_000, { agentType: 'Explore' }),
    ]);

    expect(model.agentTypes).toEqual(['Explore', 'librarian-curator']);
  });
});
