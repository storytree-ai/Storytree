// @vitest-environment jsdom
//
// Stage-1 red-green of the island side panel's Build control (ADR-0090 Phase 1 "the local loop").
// These pin the geometry/behaviour the owner-attested appearance (ADR-0070) sits on top of:
//   • a buildable node shows a Build button; clicking POSTs the build intent EXACTLY once and
//     flips the panel into a building state (ubt-build-button-posts-intent),
//   • while building it POLLS buildStatus, accumulating the coarse transcript, and on a terminal
//     poll it renders the verdict and STOPS polling — no further fetches (ubt-transcript-polls-until-terminal),
//   • a non-buildable node shows no Build button (ubt-button-absent-for-non-buildable),
//   • a 409 concurrent-build refusal surfaces gracefully (it does not crash the panel).
// The api client is mocked (no fetch, no dev server) and the poll loop runs on fake timers, so
// every transition is driven exactly. The frontend's ONLY path to a build is this api client
// (ADR-0004) — the panel imports no build engine.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { BuildIntentResult, BuildStatus } from '../types';

const apiMock = vi.hoisted(() => ({
  build: vi.fn<(unitId: string) => Promise<BuildIntentResult>>(),
  buildStatus: vi.fn<(runId: string) => Promise<BuildStatus>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { BuildSection, BUILD_POLL_MS } from './BuildSection';

/** Flush the async chain that a click/timer kicked off. */
const flush = () => act(async () => {});
/** Advance the poll clock (and flush whatever the tick triggered). */
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const building = (over: Partial<BuildStatus> = {}): BuildStatus => ({
  runId: 'run-1',
  unitId: 'drive-machinery',
  status: 'building',
  transcript: ['build started'],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.build.mockReset();
  apiMock.buildStatus.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BuildSection', () => {
  // ── ubt-button-absent-for-non-buildable ─────────────────────────────────────
  it('shows no Build button for a non-buildable node (with a reason)', () => {
    render(<BuildSection unitId="some-cap" buildable={false} />);
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
    // …but the surface explains why it can't be built, rather than rendering nothing silent.
    expect(screen.getByText(/not buildable/i)).toBeTruthy();
  });

  it('shows no Build button when buildable is undefined', () => {
    render(<BuildSection unitId="some-cap" buildable={undefined} />);
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
  });

  // ── ubt-build-button-posts-intent ───────────────────────────────────────────
  it('a buildable node shows Build; clicking POSTs the intent once and flips to building', async () => {
    apiMock.build.mockResolvedValue({ runId: 'run-1' });
    apiMock.buildStatus.mockResolvedValue(building());
    render(<BuildSection unitId="drive-machinery" buildable />);

    const btn = screen.getByRole('button', { name: 'Build' });
    fireEvent.click(btn);
    await flush();

    expect(apiMock.build).toHaveBeenCalledTimes(1);
    expect(apiMock.build).toHaveBeenCalledWith('drive-machinery');
    // the panel is now in a building state (the trigger is gone / the live region shows)
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
    expect(screen.getByText(/building/i)).toBeTruthy();
  });

  it('a double-click cannot fire a second intent (the button is busy/gone after the first)', async () => {
    apiMock.build.mockResolvedValue({ runId: 'run-1' });
    apiMock.buildStatus.mockResolvedValue(building());
    render(<BuildSection unitId="drive-machinery" buildable />);

    const btn = screen.getByRole('button', { name: 'Build' });
    fireEvent.click(btn);
    fireEvent.click(btn); // second synchronous click before the await resolves
    await flush();

    expect(apiMock.build).toHaveBeenCalledTimes(1);
  });

  // ── ubt-transcript-polls-until-terminal ─────────────────────────────────────
  it('polls buildStatus while building, accumulates the transcript, and STOPS when terminal', async () => {
    apiMock.build.mockResolvedValue({ runId: 'run-1' });
    // first read: building w/ one line; next read: more lines; terminal: passed + envelope
    apiMock.buildStatus
      .mockResolvedValueOnce(building({ transcript: ['AUTHOR_TEST'] }))
      .mockResolvedValueOnce(building({ transcript: ['AUTHOR_TEST', 'GATE'] }))
      .mockResolvedValueOnce({
        runId: 'run-1',
        unitId: 'drive-machinery',
        status: 'passed',
        transcript: ['AUTHOR_TEST', 'GATE', 'verdict: PASS'],
        envelope: 'verdict PASS · signer spine · cost $0.02',
      });

    render(<BuildSection unitId="drive-machinery" buildable />);
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    await flush(); // intent + first status read
    expect(screen.getByText('AUTHOR_TEST')).toBeTruthy();
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(1);

    await tick(BUILD_POLL_MS); // second read — transcript grows
    expect(screen.getByText('GATE')).toBeTruthy();
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(2);

    await tick(BUILD_POLL_MS); // third read — terminal PASS, polling stops
    expect(screen.getByText(/build passed/)).toBeTruthy(); // the terminal status line
    expect(screen.getByText(/verdict PASS · signer spine/)).toBeTruthy(); // the envelope body
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(3);

    // No further fetches after the terminal poll — the loop is torn down.
    await tick(BUILD_POLL_MS);
    await tick(BUILD_POLL_MS);
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(3);
  });

  it('a failing run shows the failed terminal state with the reason and stops polling', async () => {
    apiMock.build.mockResolvedValue({ runId: 'run-1' });
    apiMock.buildStatus
      .mockResolvedValueOnce(building())
      .mockResolvedValueOnce({
        runId: 'run-1',
        unitId: 'drive-machinery',
        status: 'failed',
        transcript: ['build started', 'verdict: FAIL'],
        reason: 'gate observed red, never green',
      });

    render(<BuildSection unitId="drive-machinery" buildable />);
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    await flush();
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(1);

    await tick(BUILD_POLL_MS);
    expect(screen.getByText(/failed/i)).toBeTruthy();
    expect(screen.getByText(/gate observed red/)).toBeTruthy();

    await tick(BUILD_POLL_MS);
    await tick(BUILD_POLL_MS);
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(2); // no polling past terminal
  });

  // ── story scope: whole-story --real framing (ADR-0090 Phase 2 increment) ─────
  it('a story-scope buildable node frames the build as a whole-story --real run', () => {
    render(<BuildSection unitId="notice-board" buildable scope="story" />);
    expect(screen.getByRole('button', { name: 'Build' })).toBeTruthy();
    // Honest framing: --real authors real code + promotes a branch (NOT the node-scope --live copy).
    expect(screen.getByText(/whole story for real/i)).toBeTruthy();
    expect(screen.getByText(/--real/)).toBeTruthy();
    expect(screen.queryByText(/synthetic task/i)).toBeNull();
  });

  it('a non-buildable story explains it has no real-buildable capabilities (not the node copy)', () => {
    render(<BuildSection unitId="agent" buildable={false} scope="story" />);
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
    expect(screen.getByText(/no real-buildable capabilities/i)).toBeTruthy();
  });

  it('a node-scope build keeps the single-node --live framing with the synthetic-task caveat', () => {
    render(<BuildSection unitId="library-cli" buildable scope="node" />);
    expect(screen.getByText(/single-node/i)).toBeTruthy();
    expect(screen.getByText(/synthetic task/i)).toBeTruthy();
  });

  // ── 409 concurrent-build refusal handled gracefully ─────────────────────────
  it('surfaces a 409 concurrent-build refusal without crashing (no polling started)', async () => {
    apiMock.build.mockRejectedValue(new Error('a build is already running'));
    render(<BuildSection unitId="drive-machinery" buildable />);

    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    await flush();

    expect(apiMock.build).toHaveBeenCalledTimes(1);
    expect(apiMock.buildStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/already running/)).toBeTruthy();
    // the Build button comes back so the operator can retry once the other run ends
    expect(screen.getByRole('button', { name: 'Build' })).toBeTruthy();
  });
});
