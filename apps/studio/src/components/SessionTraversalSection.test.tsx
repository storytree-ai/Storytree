// @vitest-environment jsdom
//
// Stage-1 red-green of the story panel's session picker and its replay mount seam
// (`traversal-panel-arc`, increment `traversal-panel-session-picker`). The owner's LOOK is a
// SEPARATE parked increment (`traversal-panel-attestation`), so nothing here asserts appearance.
//
// What these pin is the honesty of a surface joining two facts that are NOT the same set — who
// claimed this story (shared, live, in the claim ledger) and what can be replayed on THIS machine
// (per-machine local JSONL, by the arc's owner decision of 2026-08-10):
//
//   • the dropdown offers exactly the sessions claiming the SELECTED node — never a session that
//     merely has a trace lying around;
//   • a node nobody claims renders NO picker, not an empty control (an empty dropdown reads as
//     "no session here has a trace", which is a claim about traces, not about claims);
//   • a claimed session with no local trace is OFFERED, DISABLED and EXPLAINED — it is never
//     silently dropped and never offered as though selecting it would show something;
//   • a failed index read is never rendered as "no traces exist";
//   • changing the island RESETS the selection — a mounted replay must never outlive its story;
//   • the mount renders the replay's own honesty (partial, occupancy) verbatim rather than
//     composing a second, softer account of what the adapters observed.
//
// The api client is mocked, so no fetch and no dev server: the picker's ONLY path to a trace is
// these two read routes.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { ClaimActivity, TraversalReplayPayload, TraversalSessionsPayload } from '../types';

const apiMock = vi.hoisted(() => ({
  traversalSessions: vi.fn<() => Promise<TraversalSessionsPayload>>(),
  traversal: vi.fn<(sessionId: string) => Promise<TraversalReplayPayload>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { SessionTraversalSection } from './SessionTraversalSection';

const TRACE_DIR = '/home/op/.storytree/traces';

/** Flush the async read chain the mount kicked off. */
const flush = (): Promise<void> => act(async () => {});

function claim(over: Partial<ClaimActivity> & { sessionId: string }): ClaimActivity {
  return {
    unitId: 'studio',
    kind: 'claim',
    branch: `claude/${over.sessionId}`,
    intent: 'orchestrate',
    grade: 'work',
    at: '2026-08-11T09:00:00.000Z',
    ...over,
  };
}

function replay(over: Partial<TraversalReplayPayload> = {}): TraversalReplayPayload {
  return {
    sessionId: 'elegant-rosalind',
    // Two real events off the mirrored union (widened from a two-field envelope by
    // `traversal-panel-spine-render`, which plots them). These tests still read only the COUNT.
    events: [
      {
        kind: 'full_payload_read',
        eventId: 'event:1',
        sessionId: 'elegant-rosalind',
        at: '2026-08-11T09:00:00.000Z',
        visitId: 'visit:1',
        nodeId: 'arc',
      },
      {
        kind: 'model_context',
        eventId: 'occupancy:1',
        sessionId: 'elegant-rosalind',
        at: '2026-08-11T09:00:05.000Z',
        cumulativeInputTokens: 120_000,
        addedInputTokens: 120_000,
      },
    ],
    relationships: [],
    coverage: [],
    coverageCaveats: [],
    skipped: 0,
    partial: false,
    occupancy: {
      modelContextCount: 1,
      observationCount: 0,
      declared: false,
      note: 'no occupancy series: 1 model_context observation(s) recorded, none carrying residentInputTokens.',
    },
    ...over,
  };
}

/** The picker's `<option>` rows, minus the placeholder. */
function offered(): HTMLOptionElement[] {
  const select = screen.getByRole('combobox') as HTMLSelectElement;
  return [...select.options].filter((option) => option.value !== '');
}

beforeEach(() => {
  apiMock.traversalSessions.mockReset();
  apiMock.traversal.mockReset();
  apiMock.traversalSessions.mockResolvedValue({ dir: TRACE_DIR, sessions: [] });
  apiMock.traversal.mockResolvedValue(replay());
});
afterEach(cleanup);

describe('SessionTraversalSection — the picker offers this story’s claimants', () => {
  it('offers exactly the sessions claiming the selected node', async () => {
    apiMock.traversalSessions.mockResolvedValue({
      dir: TRACE_DIR,
      // A session with a trace that never claimed this story must NOT appear: the picker is reached
      // through the island, so its unit is "who is working here", not "what this laptop has read".
      sessions: [
        { sessionId: 'claimed-here', eventCount: 12, lastObservedAt: null },
        { sessionId: 'traced-elsewhere', eventCount: 900, lastObservedAt: null },
      ],
    });
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'claimed-here' })]} />);
    await flush();
    expect(offered().map((option) => option.value)).toEqual(['claimed-here']);
  });

  it('renders NO picker at all for a node nobody claims — and reads no trace index for it', () => {
    const { container } = render(<SessionTraversalSection storyId="studio" claims={[]} />);
    expect(container.querySelector('[data-testid="traversal-picker"]')).toBeNull();
    // Not merely invisible: an unclaimed island must not spend a read to discover it has nothing.
    expect(apiMock.traversalSessions).not.toHaveBeenCalled();
  });

  it('reads the trace index ONCE, not on a poll cadence', async () => {
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'a' })]} />);
    await flush();
    await flush();
    expect(apiMock.traversalSessions).toHaveBeenCalledTimes(1);
  });
});

describe('SessionTraversalSection — an unreplayable session is offered, disabled and explained', () => {
  it('keeps a claimed session with no local trace in the list, disabled, with its reason', async () => {
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'ran-elsewhere' })]} />);
    await flush();
    const rows = offered();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.disabled).toBe(true);
    // The reason travels in the row's own text, not only a tooltip an operator must hover to find.
    expect(rows[0]?.textContent).toContain('no trace on this machine');
    expect(rows[0]?.title).toContain(TRACE_DIR);
  });

  it('explains at the block WHY nothing is selectable, naming the directory it searched', async () => {
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'ran-elsewhere' })]} />);
    await flush();
    expect(screen.getByTestId('traversal-picker-note').textContent).toContain(TRACE_DIR);
  });

  it('a FAILED index read never reads as "no traces exist"', async () => {
    // The distinction is operational: "no trace" sends an operator to their trace dir, a failed read
    // sends them to the studio server. Collapsing the two sends them to the wrong place.
    apiMock.traversalSessions.mockRejectedValue(new Error('500 Internal Server Error'));
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'a' })]} />);
    await flush();
    const note = screen.getByTestId('traversal-picker-note').textContent ?? '';
    expect(note).toContain('500 Internal Server Error');
    expect(note).not.toContain('no trace');
    expect(offered()[0]?.textContent).toContain('unknown');
  });
});

describe('SessionTraversalSection — selecting a session mounts its replay', () => {
  const traced: TraversalSessionsPayload = {
    dir: TRACE_DIR,
    sessions: [{ sessionId: 'elegant-rosalind', eventCount: 2, lastObservedAt: '2026-08-11T10:00:00.000Z' }],
  };

  it('mounts nothing until a session is picked, then reads that session’s replay', async () => {
    apiMock.traversalSessions.mockResolvedValue(traced);
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'elegant-rosalind' })]} />);
    await flush();
    expect(screen.queryByTestId('traversal-replay')).toBeNull();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'elegant-rosalind' } });
    await flush();
    expect(apiMock.traversal).toHaveBeenCalledWith('elegant-rosalind');
    expect(screen.getByTestId('traversal-replay').getAttribute('data-replay-state')).toBe('read');
  });

  it('mounts the PICTURE into the seam, above the honesty facts rather than instead of them', async () => {
    // This assertion inverted when `traversal-panel-spine-render` landed. It used to require the
    // NAMED hole (an operator meeting a blank picture would read it as "this session traversed
    // nothing"); the hole is now filled, and what it pins instead is that filling it did not cost the
    // payload's own honesty — the design's second acceptance clause puts the traversal first, and the
    // facts an operator checks before trusting a replay stay underneath it.
    apiMock.traversalSessions.mockResolvedValue(traced);
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'elegant-rosalind' })]} />);
    await flush();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'elegant-rosalind' } });
    await flush();

    expect(screen.queryByTestId('traversal-spine-pending')).toBeNull();
    expect(screen.getByTestId('traversal-spine')).not.toBeNull();
    expect(screen.getByTestId('traversal-occupancy-note')).not.toBeNull();
    // The picture precedes the facts in document order — first glance, not a footnote.
    const replayNode = screen.getByTestId('traversal-replay');
    expect(replayNode.firstElementChild?.getAttribute('data-testid')).toBe('traversal-spine');
  });

  it('renders the occupancy declaration VERBATIM — absence is unobserved, never zero', async () => {
    apiMock.traversalSessions.mockResolvedValue(traced);
    const note = 'no occupancy series: no model_context observation was recorded for this session.';
    apiMock.traversal.mockResolvedValue(
      replay({ occupancy: { modelContextCount: 0, observationCount: 0, declared: false, note } }),
    );
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'elegant-rosalind' })]} />);
    await flush();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'elegant-rosalind' } });
    await flush();
    // Verbatim, so the panel and `storytree traversal show` cannot tell an operator different
    // things about what the adapters observed.
    expect(screen.getByTestId('traversal-occupancy-note').textContent).toBe(note);
  });

  it('a PARTIAL trace says so — it never presents as complete (ADR-0241 D5)', async () => {
    apiMock.traversalSessions.mockResolvedValue(traced);
    apiMock.traversal.mockResolvedValue(replay({ skipped: 3, partial: true }));
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'elegant-rosalind' })]} />);
    await flush();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'elegant-rosalind' } });
    await flush();
    expect(screen.getByTestId('traversal-partial').textContent).toContain('3 lines');
  });

  it('a replay read that FAILS says so, and never as "this session traversed nothing"', async () => {
    apiMock.traversalSessions.mockResolvedValue(traced);
    apiMock.traversal.mockRejectedValue(new Error('404 no readable trace'));
    render(<SessionTraversalSection storyId="studio" claims={[claim({ sessionId: 'elegant-rosalind' })]} />);
    await flush();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'elegant-rosalind' } });
    await flush();
    const mount = screen.getByTestId('traversal-replay');
    expect(mount.getAttribute('data-replay-state')).toBe('failed');
    expect(mount.textContent).toContain('404 no readable trace');
  });
});

describe('SessionTraversalSection — the selection never outlives its island', () => {
  it('resets the picker when the selected story changes', async () => {
    apiMock.traversalSessions.mockResolvedValue({
      dir: TRACE_DIR,
      sessions: [
        { sessionId: 'elegant-rosalind', eventCount: 2, lastObservedAt: null },
        { sessionId: 'other-session', eventCount: 5, lastObservedAt: null },
      ],
    });
    const claims = [claim({ sessionId: 'elegant-rosalind' }), claim({ sessionId: 'other-session' })];
    const { rerender } = render(<SessionTraversalSection storyId="studio" claims={claims} />);
    await flush();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'elegant-rosalind' } });
    await flush();
    expect(screen.getByTestId('traversal-replay')).toBeTruthy();

    // StoryPanel is not keyed by story id, so this component survives a navigation. Without the
    // reset, a replay from the story you LEFT stays mounted under the story you arrived at —
    // answered-looking and attributed to the wrong node.
    rerender(<SessionTraversalSection storyId="forest-world" claims={claims} />);
    await flush();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
    expect(screen.queryByTestId('traversal-replay')).toBeNull();
  });
});
