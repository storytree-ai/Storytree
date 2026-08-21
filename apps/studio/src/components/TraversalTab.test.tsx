// @vitest-environment jsdom
//
// The traversal tab's RAIL (`traversal-panel-arc`, increment `traversal-panel-trace-index-list`).
//
// `lib/traversalIndex.test.ts` proves the pure list — ordering, the four states, the age labels.
// What is under test HERE is the wiring the pure module cannot see, and every case is one the
// withdrawn claim-join used to get right (ADR-0354 D2 removed the join, not the honesty):
//
//   • lazy-read: the index is read on the tab's FIRST activation, never on mount     (ttl-reads-lazily-on-first-activation)
//   • read-once: it is read once and not re-read on later switches                   (ttl-reads-the-index-once)
//   • lists-all: every trace the index answered is offered — no claim, no story      (ttl-lists-the-whole-index)
//   • distinct-absences: pending / failed / empty render three DIFFERENT sentences   (ttl-keeps-the-three-absences-distinct)
//   • selects: choosing a row mounts the replay for that session                     (ttl-mounts-the-replay-on-selection)
//   • reports-meta: the selection is reported up to the host's tab strip             (ttl-reports-the-selected-trace)
//
// The REPLAY IS THE REAL COMPONENT (anti-slop-adoption-arc inc-06, `no-module-mocking`) — it is
// plain React over the same transport, so nothing needed stubbing once the transport itself was
// doubled. "Mounted for the chosen session" is therefore asserted by the REQUEST the replay made
// (`GET /api/traversal?session=…`), which is a stronger claim than a stub's data attribute: it can
// only pass if a real replay really mounted and really read that session. The replay's own render
// stays pinned by TraversalSpine.test.tsx and the route's tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { HttpDouble, errorReply, installHttpDouble } from '../test/httpDouble';
import { WithAppData } from '../test/appData';

const INDEX = '/api/traversal/sessions';
const REPLAY = '/api/traversal';

let http: HttpDouble;

/** How many times the rail read the trace index. */
const indexReads = (): number => http.countTo(INDEX);
/** The session ids a mounted replay actually read, oldest first. */
const replayedSessions = (): Array<string | null> =>
  http.requestsTo(REPLAY).map((request) => request.query.get('session'));

import { TraversalTab } from './TraversalTab';

const TRACE_DIR = '/home/op/.storytree/traces';

function answer(sessions: Array<{ sessionId: string; eventCount: number; lastObservedAt: string | null }>) {
  return { dir: TRACE_DIR, sessions };
}

const THREE = answer([
  { sessionId: 'alpha-1', eventCount: 12, lastObservedAt: '2026-08-12T10:00:00.000Z' },
  { sessionId: 'bravo-2', eventCount: 386, lastObservedAt: '2026-08-12T09:55:00.000Z' },
  { sessionId: 'charlie-3', eventCount: 4, lastObservedAt: '2026-08-11T10:00:00.000Z' },
]);

beforeEach(() => {
  http = installHttpDouble();
  http.get(INDEX, () => THREE);
  // The replay's own read is not what this file is about; it answers honestly-unavailable so the
  // real component mounts, reads, and renders its own stated absence.
  http.get(REPLAY, () => errorReply('no trace on this machine', 404));
});

afterEach(() => {
  cleanup();
  http.uninstall();
});

/** The rail always mounts under the real AppData context (the replay reads the doc index). */
interface TabProps {
  active: boolean;
  onMeta?: (meta: string | null) => void;
  compact?: boolean;
}
const tab = (props: TabProps): React.JSX.Element => (
  <WithAppData>
    <TraversalTab
      active={props.active}
      onMeta={props.onMeta ?? (() => {})}
      compact={props.compact ?? false}
    />
  </WithAppData>
);
const renderTab = (props: TabProps) => render(tab(props));

describe('TraversalTab — the index is read lazily (ttl-reads-lazily-on-first-activation)', () => {
  it('does NOT read the index while the tab has never been opened', () => {
    renderTab({ active: false });
    // Reading here would put a 10s budget on the map's own load for a panel nobody asked for.
    expect(indexReads()).toBe(0);
  });

  it('reads it on the first activation', async () => {
    const { rerender } = renderTab({ active: false });
    rerender(tab({ active: true }));
    await waitFor(() => expect(indexReads()).toBe(1));
  });

  it('reads it ONCE — a trace grows only by capture, so re-reading per switch buys nothing', async () => {
    const { rerender } = renderTab({ active: true });
    await waitFor(() => expect(indexReads()).toBe(1));
    rerender(tab({ active: false }));
    rerender(tab({ active: true }));
    expect(indexReads()).toBe(1);
  });
});

describe('TraversalTab — the whole local index, newest first (ttl-lists-the-whole-index)', () => {
  it('offers EVERY trace the index answered, with no claim and no story involved', async () => {
    renderTab({ active: true });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    // The claim-join left 338 of 339 traces unreachable. Every row the index knows is offered now.
    expect(screen.getAllByRole('option').map((row) => row.textContent)).toEqual([
      'alpha-112newest',
      'bravo-2386' + '5m earlier',
      'charlie-34' + '1d earlier',
    ]);
  });

  it('heads the rail with the count', async () => {
    renderTab({ active: true });
    await waitFor(() =>
      expect(screen.getByTestId('traversal-index-count').textContent).toBe('3 local traces'),
    );
  });
});

describe('TraversalTab — three absences stay three (ttl-keeps-the-three-absences-distinct)', () => {
  it('says it is READING while the index is in flight, never "no traces"', () => {
    http.get(INDEX, () => new Promise<Response>(() => {}));
    renderTab({ active: true });
    expect(screen.getByTestId('traversal-index-note').textContent).toMatch(/reading/i);
    expect(screen.getByTestId('traversal-index-note').textContent).not.toMatch(/no traces/i);
  });

  it('blames the SERVER when the route refuses, not the operator’s trace dir', async () => {
    http.get(INDEX, () => errorReply('HTTP 500', 500));
    renderTab({ active: true });
    await waitFor(() =>
      expect(screen.getByTestId('traversal-index-note').textContent).toContain('HTTP 500'),
    );
    expect(screen.getByTestId('traversal-index-note').textContent).toMatch(
      /says nothing about whether traces exist/i,
    );
  });

  it('answers an EMPTY machine confidently, naming the directory it looked in', async () => {
    http.get(INDEX, () => answer([]));
    renderTab({ active: true });
    // The hosted studio captures no operator traces — this is a correct answer there, not an error.
    await waitFor(() =>
      expect(screen.getByTestId('traversal-index-note').textContent).toContain(TRACE_DIR),
    );
    expect(screen.getByTestId('traversal-index-count').textContent).toBe('No local traces');
  });

  it('never states a count it does not have', () => {
    http.get(INDEX, () => new Promise<Response>(() => {}));
    renderTab({ active: true });
    expect(screen.getByTestId('traversal-index-count').textContent).not.toMatch(/^0 /);
  });
});

describe('TraversalTab — selection (ttl-mounts-the-replay-on-selection)', () => {
  it('mounts nothing until a trace is picked, and says so', async () => {
    renderTab({ active: true });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    expect(replayedSessions()).toEqual([]);
    expect(screen.getByTestId('traversal-tab-idle').textContent).toMatch(/pick a trace/i);
  });

  it('mounts the replay for the chosen session', async () => {
    renderTab({ active: true });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    fireEvent.click(screen.getByRole('option', { name: /bravo-2/ }));
    await waitFor(() => expect(replayedSessions()).toEqual(['bravo-2']));
  });

  it('marks the chosen row as current, so the rail shows what is playing', async () => {
    renderTab({ active: true });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    fireEvent.click(screen.getByRole('option', { name: /charlie-3/ }));
    expect(screen.getByRole('option', { name: /charlie-3/ }).getAttribute('aria-current')).toBe(
      'true',
    );
  });

  it('reports the selection up to the host’s tab strip (ttl-reports-the-selected-trace)', async () => {
    const onMeta = vi.fn();
    renderTab({ active: true, onMeta });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    fireEvent.click(screen.getByRole('option', { name: /bravo-2/ }));
    // Derived from the RAIL's row, so the strip and the rail can never disagree about the count.
    expect(onMeta).toHaveBeenLastCalledWith('bravo-2 · 386 events');
  });

  it('does not say "1 events" — a real local trace holds exactly one', async () => {
    http.get(INDEX, () =>
      answer([{ sessionId: 'solo-1', eventCount: 1, lastObservedAt: '2026-08-12T10:00:00.000Z' }]),
    );
    const onMeta = vi.fn();
    renderTab({ active: true, onMeta });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    fireEvent.click(screen.getByRole('option', { name: /solo-1/ }));
    expect(onMeta).toHaveBeenLastCalledWith('solo-1 · 1 event');
  });

  it('reports NO selection before one is made', async () => {
    const onMeta = vi.fn();
    renderTab({ active: true, onMeta });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    expect(onMeta).toHaveBeenLastCalledWith(null);
  });
});
