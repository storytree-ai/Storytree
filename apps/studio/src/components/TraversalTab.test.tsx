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
// `TraversalReplay` is STUBBED — this test targets the rail, and the replay's own read/render is
// pinned by TraversalSpine.test.tsx and the route's tests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const apiMock = vi.hoisted(() => ({ traversalSessions: vi.fn() }));

vi.mock('../api', () => ({ api: apiMock }));

vi.mock('./TraversalReplay', () => ({
  TraversalReplay: (props: { sessionId: string }) => (
    <div data-testid="traversal-replay-mock" data-session={props.sessionId} />
  ),
}));

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
  apiMock.traversalSessions.mockReset();
  apiMock.traversalSessions.mockResolvedValue(THREE);
});

afterEach(() => cleanup());

describe('TraversalTab — the index is read lazily (ttl-reads-lazily-on-first-activation)', () => {
  it('does NOT read the index while the tab has never been opened', () => {
    render(<TraversalTab active={false} onMeta={() => {}} compact={false} />);
    // Reading here would put a 10s budget on the map's own load for a panel nobody asked for.
    expect(apiMock.traversalSessions).not.toHaveBeenCalled();
  });

  it('reads it on the first activation', async () => {
    const { rerender } = render(<TraversalTab active={false} onMeta={() => {}} compact={false} />);
    rerender(<TraversalTab active onMeta={() => {}} compact={false} />);
    await waitFor(() => expect(apiMock.traversalSessions).toHaveBeenCalledTimes(1));
  });

  it('reads it ONCE — a trace grows only by capture, so re-reading per switch buys nothing', async () => {
    const { rerender } = render(<TraversalTab active onMeta={() => {}} compact={false} />);
    await waitFor(() => expect(apiMock.traversalSessions).toHaveBeenCalledTimes(1));
    rerender(<TraversalTab active={false} onMeta={() => {}} compact={false} />);
    rerender(<TraversalTab active onMeta={() => {}} compact={false} />);
    expect(apiMock.traversalSessions).toHaveBeenCalledTimes(1);
  });
});

describe('TraversalTab — the whole local index, newest first (ttl-lists-the-whole-index)', () => {
  it('offers EVERY trace the index answered, with no claim and no story involved', async () => {
    render(<TraversalTab active onMeta={() => {}} compact={false} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    // The claim-join left 338 of 339 traces unreachable. Every row the index knows is offered now.
    expect(screen.getAllByRole('option').map((row) => row.textContent)).toEqual([
      'alpha-112newest',
      'bravo-2386' + '5m earlier',
      'charlie-34' + '1d earlier',
    ]);
  });

  it('heads the rail with the count', async () => {
    render(<TraversalTab active onMeta={() => {}} compact={false} />);
    await waitFor(() =>
      expect(screen.getByTestId('traversal-index-count').textContent).toBe('3 local traces'),
    );
  });
});

describe('TraversalTab — three absences stay three (ttl-keeps-the-three-absences-distinct)', () => {
  it('says it is READING while the index is in flight, never "no traces"', () => {
    apiMock.traversalSessions.mockReturnValue(new Promise(() => {}));
    render(<TraversalTab active onMeta={() => {}} compact={false} />);
    expect(screen.getByTestId('traversal-index-note').textContent).toMatch(/reading/i);
    expect(screen.getByTestId('traversal-index-note').textContent).not.toMatch(/no traces/i);
  });

  it('blames the SERVER when the route refuses, not the operator’s trace dir', async () => {
    apiMock.traversalSessions.mockRejectedValue(new Error('HTTP 500'));
    render(<TraversalTab active onMeta={() => {}} compact={false} />);
    await waitFor(() =>
      expect(screen.getByTestId('traversal-index-note').textContent).toContain('HTTP 500'),
    );
    expect(screen.getByTestId('traversal-index-note').textContent).toMatch(
      /says nothing about whether traces exist/i,
    );
  });

  it('answers an EMPTY machine confidently, naming the directory it looked in', async () => {
    apiMock.traversalSessions.mockResolvedValue(answer([]));
    render(<TraversalTab active onMeta={() => {}} compact={false} />);
    // The hosted studio captures no operator traces — this is a correct answer there, not an error.
    await waitFor(() =>
      expect(screen.getByTestId('traversal-index-note').textContent).toContain(TRACE_DIR),
    );
    expect(screen.getByTestId('traversal-index-count').textContent).toBe('No local traces');
  });

  it('never states a count it does not have', () => {
    apiMock.traversalSessions.mockReturnValue(new Promise(() => {}));
    render(<TraversalTab active onMeta={() => {}} compact={false} />);
    expect(screen.getByTestId('traversal-index-count').textContent).not.toMatch(/^0 /);
  });
});

describe('TraversalTab — selection (ttl-mounts-the-replay-on-selection)', () => {
  it('mounts nothing until a trace is picked, and says so', async () => {
    render(<TraversalTab active onMeta={() => {}} compact={false} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    expect(screen.queryByTestId('traversal-replay-mock')).toBeNull();
    expect(screen.getByTestId('traversal-tab-idle').textContent).toMatch(/pick a trace/i);
  });

  it('mounts the replay for the chosen session', async () => {
    render(<TraversalTab active onMeta={() => {}} compact={false} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    fireEvent.click(screen.getByRole('option', { name: /bravo-2/ }));
    expect(screen.getByTestId('traversal-replay-mock').dataset['session']).toBe('bravo-2');
  });

  it('marks the chosen row as current, so the rail shows what is playing', async () => {
    render(<TraversalTab active onMeta={() => {}} compact={false} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    fireEvent.click(screen.getByRole('option', { name: /charlie-3/ }));
    expect(screen.getByRole('option', { name: /charlie-3/ }).getAttribute('aria-current')).toBe(
      'true',
    );
  });

  it('reports the selection up to the host’s tab strip (ttl-reports-the-selected-trace)', async () => {
    const onMeta = vi.fn();
    render(<TraversalTab active onMeta={onMeta} compact={false} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    fireEvent.click(screen.getByRole('option', { name: /bravo-2/ }));
    // Derived from the RAIL's row, so the strip and the rail can never disagree about the count.
    expect(onMeta).toHaveBeenLastCalledWith('bravo-2 · 386 events');
  });

  it('does not say "1 events" — a real local trace holds exactly one', async () => {
    apiMock.traversalSessions.mockResolvedValue(
      answer([{ sessionId: 'solo-1', eventCount: 1, lastObservedAt: '2026-08-12T10:00:00.000Z' }]),
    );
    const onMeta = vi.fn();
    render(<TraversalTab active onMeta={onMeta} compact={false} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    fireEvent.click(screen.getByRole('option', { name: /solo-1/ }));
    expect(onMeta).toHaveBeenLastCalledWith('solo-1 · 1 event');
  });

  it('reports NO selection before one is made', async () => {
    const onMeta = vi.fn();
    render(<TraversalTab active onMeta={onMeta} compact={false} />);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    expect(onMeta).toHaveBeenLastCalledWith(null);
  });
});
