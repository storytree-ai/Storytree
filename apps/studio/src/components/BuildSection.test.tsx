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
  adopt: vi.fn<(storyId: string) => Promise<BuildIntentResult>>(),
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
  apiMock.adopt.mockReset();
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

  // ── ubt-loading-affordance-present-while-building-gone-when-terminal ─────────
  // The pronounced "thinking" affordance (ADR-0070 Stage 2): a spinner + indeterminate bar are
  // PRESENT for the whole non-terminal run and GONE the moment a verdict lands. The appearance
  // itself is the owner's call; this only pins that the affordance is mounted/unmounted correctly.
  it('shows the loading affordance (spinner + progress bar) while a Build runs, and removes it on a PASS terminal', async () => {
    apiMock.build.mockResolvedValue({ runId: 'run-1' });
    apiMock.buildStatus
      .mockResolvedValueOnce(building())
      .mockResolvedValueOnce({
        runId: 'run-1',
        unitId: 'drive-machinery',
        status: 'passed',
        transcript: ['build started', 'verdict: PASS'],
        envelope: 'verdict PASS · signer spine',
      });

    const { container } = render(<BuildSection unitId="drive-machinery" buildable />);
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    await flush(); // building — the affordance is up
    expect(container.querySelector('.build-spinner')).toBeTruthy();
    expect(container.querySelector('.build-progress')).toBeTruthy();
    // The animated parts are decorative — the live-region carries the meaning via the text label.
    expect(container.querySelector('.build-spinner')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.build-progress')?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('building…')).toBeTruthy();

    await tick(BUILD_POLL_MS); // terminal PASS — the affordance is gone, the verdict shows
    expect(container.querySelector('.build-spinner')).toBeNull();
    expect(container.querySelector('.build-progress')).toBeNull();
    expect(screen.getByText(/build passed/)).toBeTruthy();
  });

  it('removes the loading affordance on a FAILED terminal too', async () => {
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

    const { container } = render(<BuildSection unitId="drive-machinery" buildable />);
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    await flush();
    expect(container.querySelector('.build-spinner')).toBeTruthy();

    await tick(BUILD_POLL_MS);
    expect(container.querySelector('.build-spinner')).toBeNull();
    expect(container.querySelector('.build-progress')).toBeNull();
    expect(screen.getByText(/failed/i)).toBeTruthy();
  });

  // The button's "Starting…" busy state carries a small inline spinner for consistency (ADR-0070).
  it('shows an inline spinner in the button while the intent is in flight (busy)', async () => {
    let resolveBuild: (r: { runId: string }) => void = () => {};
    apiMock.build.mockReturnValue(new Promise<{ runId: string }>((res) => { resolveBuild = res; }));
    apiMock.buildStatus.mockResolvedValue(building());

    const { container } = render(<BuildSection unitId="drive-machinery" buildable />);
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    await flush(); // intent posted but not yet resolved → the button is busy ("Starting…")
    expect(screen.getByText('Starting…')).toBeTruthy();
    expect(container.querySelector('.build-spinner-inline')).toBeTruthy();

    resolveBuild({ runId: 'run-1' }); // let the run proceed so the effect/timers settle cleanly
    await flush();
  });

  // ── ubt-terminal-refreshes-affordance (Bug 2: stale affordance after a finished run) ──
  it('calls onTerminal exactly once when a run reaches terminal — not while building, not again after', async () => {
    const onTerminal = vi.fn();
    apiMock.build.mockResolvedValue({ runId: 'run-1' });
    apiMock.buildStatus
      .mockResolvedValueOnce(building())
      .mockResolvedValueOnce({
        runId: 'run-1',
        unitId: 'drive-machinery',
        status: 'passed',
        transcript: ['build started', 'verdict: PASS'],
        envelope: 'verdict PASS · signer spine',
      });

    render(<BuildSection unitId="drive-machinery" buildable onTerminal={onTerminal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    await flush(); // first read — still building, so no refresh yet
    expect(onTerminal).not.toHaveBeenCalled();

    await tick(BUILD_POLL_MS); // terminal read → the panel refreshes the now-stale affordance
    expect(onTerminal).toHaveBeenCalledTimes(1);

    // The poll loop is torn down — no further refreshes fire.
    await tick(BUILD_POLL_MS);
    await tick(BUILD_POLL_MS);
    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  // ── story scope: the STATUS-AWARE go-green affordance (ADR-0094) ─────────────
  it('a proposed story (goGreen=build) frames a whole-story real build that merges automatically', () => {
    render(<BuildSection unitId="notice-board" buildable scope="story" goGreen="build" status="proposed" />);
    expect(screen.getByRole('button', { name: 'Build' })).toBeTruthy();
    // Honest framing (in plain language): a real build that writes code + opens a PR that merges itself
    // (ADR-0022), NOT the node-scope "test build" copy, and NOT a "suggest a PR" dead end.
    expect(screen.getByText(/whole story for real/i)).toBeTruthy();
    expect(screen.getByText(/writes the tests and code/i)).toBeTruthy();
    expect(screen.getByText(/merges automatically/i)).toBeTruthy();
    expect(screen.queryByText(/quick test build/i)).toBeNull();
  });

  it('a mapped story (goGreen=adopt) surfaces Adopt + the gate-run path, NOT a Build button', () => {
    render(
      <BuildSection
        unitId="library"
        buildable={false}
        scope="story"
        goGreen="adopt"
        status="mapped"
        adoptGates={[
          { id: 'library#gate-1', kind: 'observe', command: 'pnpm --filter @storytree/library test' },
          { id: 'library#gate-2', kind: 'observe', command: 'pnpm --filter @storytree/cli test' },
        ]}
      />,
    );
    // Adopt — never a fail-closed Build over a mature brownfield artifact (ADR-0094 d.3).
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
    // A lean Adopt ACTION (ADR-0097 Layer 1) — a real button (no redundant title), NOT copy-paste
    // gate-run commands.
    expect(screen.getByRole('button', { name: 'Adopt' })).toBeTruthy();
    expect(screen.queryByText(/storytree gate run/)).toBeNull();
  });

  it('a mapped story with NO reliability gates (goGreen=none) points at authoring them, not Build', () => {
    // The agent / binding-staleness case: mapped, but no `## Reliability Gates` to adopt yet.
    render(<BuildSection unitId="agent" buildable={false} scope="story" goGreen="none" status="mapped" />);
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
    expect(screen.getByText(/Reliability Gates/)).toBeTruthy();
    expect(screen.getByText(/Adopt/)).toBeTruthy();
  });

  it('a healthy story (goGreen=none) needs no go-green action', () => {
    render(<BuildSection unitId="x" buildable={false} scope="story" goGreen="none" status="healthy" />);
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
    expect(screen.getByText(/healthy — no go-green action/i)).toBeTruthy();
  });

  it('a proposed story with no real path (goGreen=none) explains it needs a real proof arm', () => {
    render(<BuildSection unitId="p" buildable={false} scope="story" goGreen="none" status="proposed" />);
    expect(screen.queryByRole('button', { name: 'Build' })).toBeNull();
    expect(screen.getByText(/no real-buildable capabilities/i)).toBeTruthy();
  });

  it('a node-scope build keeps the test-build framing with the honest "not the real feature" caveat', () => {
    render(<BuildSection unitId="library-cli" buildable scope="node" />);
    expect(screen.getByText(/quick test build/i)).toBeTruthy();
    expect(screen.getByText(/not the real feature/i)).toBeTruthy();
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

// ── AdoptPanel — the real Adopt ACTION (ADR-0097 Layer 1) ───────────────────────
//
// Pressing Adopt POSTs a real adoption intent (api.adopt → POST /api/adopt) that ENTERS the
// brown→proposed→green proving process — NOT the old static copy-paste `gate run` surface. The
// adoption runs in the SAME build registry, so the panel reuses the Build control's exact trigger +
// poll machinery: it POSTs ONCE, polls api.buildStatus on BUILD_POLL_MS, accumulates the coarse
// transcript, and renders the shared verdict (PASS via `envelope`, FAIL via `reason`) on a terminal
// poll. The gates are CONTEXT framing the action, not commands. `gates: []` renders the no-gates
// message and NO Adopt button. The api client is mocked — the panel imports no spine (ADR-0004).
const adoptProps = {
  unitId: 'library',
  buildable: false as const,
  scope: 'story' as const,
  goGreen: 'adopt' as const,
  status: 'mapped' as const,
};
const adoptGates: import('../types').AdoptGate[] = [
  { id: 'library#gate-1', kind: 'observe', command: 'pnpm --filter @storytree/library test' },
  { id: 'library#gate-2', kind: 'observe', command: 'pnpm --filter @storytree/cli test' },
];

describe('AdoptPanel (BuildSection adopt scope)', () => {
  it('clicking Adopt POSTs api.adopt once with the story id and flips into an adopting state', async () => {
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    apiMock.buildStatus.mockResolvedValue({
      runId: 'adopt-1',
      unitId: 'library',
      status: 'building',
      transcript: ['adoption started'],
    });
    render(<BuildSection {...adoptProps} adoptGates={adoptGates} />);

    const btn = screen.getByRole('button', { name: 'Adopt' });
    fireEvent.click(btn);
    fireEvent.click(btn); // a second synchronous click must NOT post a second intent
    await flush();

    expect(apiMock.adopt).toHaveBeenCalledTimes(1);
    expect(apiMock.adopt).toHaveBeenCalledWith('library');
    // the panel is now adopting — the trigger is gone and the live transcript shows
    expect(screen.queryByRole('button', { name: 'Adopt' })).toBeNull();
    expect(screen.getByText('adoption started')).toBeTruthy();
  });

  it('polls buildStatus while adopting, accumulates the transcript, and renders a PASS verdict, then STOPS', async () => {
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    apiMock.buildStatus
      .mockResolvedValueOnce({
        runId: 'adopt-1',
        unitId: 'library',
        status: 'building',
        transcript: ['observe library#gate-1'],
      })
      .mockResolvedValueOnce({
        runId: 'adopt-1',
        unitId: 'library',
        status: 'passed',
        transcript: ['observe library#gate-1', 'flip mapped → proposed', 'verdict: PASS'],
        envelope: 'adopted · signer spine-principal · approvedBy operator',
      });

    render(<BuildSection {...adoptProps} adoptGates={adoptGates} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    await flush(); // intent + first status read
    expect(screen.getByText('observe library#gate-1')).toBeTruthy();
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(1);

    await tick(BUILD_POLL_MS); // second read — terminal PASS, polling stops
    // Bug 1: the shared terminal status line uses ADOPT wording — an adopt is NOT a build. It reads
    // "verdict PASS · adopted", never "build passed".
    expect(screen.getByText(/PASS.*adopted/)).toBeTruthy();
    expect(screen.queryByText(/build passed/)).toBeNull();
    expect(screen.getByText(/adopted · signer spine-principal/)).toBeTruthy(); // the envelope body
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(2);

    // No further fetches after the terminal poll — the loop is torn down.
    await tick(BUILD_POLL_MS);
    await tick(BUILD_POLL_MS);
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(2);
  });

  it('a failing adoption renders the failed terminal state with the reason and stops polling', async () => {
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    apiMock.buildStatus
      .mockResolvedValueOnce({
        runId: 'adopt-1',
        unitId: 'library',
        status: 'building',
        transcript: ['adoption started'],
      })
      .mockResolvedValueOnce({
        runId: 'adopt-1',
        unitId: 'library',
        status: 'failed',
        transcript: ['adoption started', 'verdict: FAIL'],
        reason: 'gate library#gate-2 observed red — refused',
      });

    render(<BuildSection {...adoptProps} adoptGates={adoptGates} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    await flush();
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(1);

    await tick(BUILD_POLL_MS);
    // Bug 1: the failed terminal line reads "adopt failed", never "build failed".
    expect(screen.getByText(/adopt failed/)).toBeTruthy();
    expect(screen.queryByText(/build failed/)).toBeNull();
    expect(screen.getByText(/observed red — refused/)).toBeTruthy();

    await tick(BUILD_POLL_MS);
    await tick(BUILD_POLL_MS);
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(2); // no polling past terminal
  });

  // The shared "thinking" affordance lifts the Adopt path too (BuildRun is shared, ADR-0097): the
  // spinner + indeterminate bar show while adopting and are gone on the terminal verdict.
  it('shows the loading affordance while an Adopt runs, and removes it when terminal', async () => {
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    apiMock.buildStatus
      .mockResolvedValueOnce({
        runId: 'adopt-1',
        unitId: 'library',
        status: 'building',
        transcript: ['adoption started'],
      })
      .mockResolvedValueOnce({
        runId: 'adopt-1',
        unitId: 'library',
        status: 'passed',
        transcript: ['flip mapped → proposed', 'verdict: PASS'],
        envelope: 'adopted · signer spine-principal · approvedBy operator',
      });

    const { container } = render(<BuildSection {...adoptProps} adoptGates={adoptGates} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    await flush(); // adopting — the affordance is up, and reads "adopting…" not "building…"
    expect(container.querySelector('.build-spinner')).toBeTruthy();
    expect(container.querySelector('.build-progress')).toBeTruthy();
    expect(screen.getByText('adopting…')).toBeTruthy();
    expect(screen.queryByText('building…')).toBeNull();

    await tick(BUILD_POLL_MS); // terminal — affordance gone, verdict shows
    expect(container.querySelector('.build-spinner')).toBeNull();
    expect(container.querySelector('.build-progress')).toBeNull();
    expect(screen.getByText(/PASS.*adopted/)).toBeTruthy();
  });

  // Bug 2: a finished adoption flips the story `mapped → proposed` server-side, so the panel must
  // re-pull or it keeps showing the stale Adopt button. The AdoptPanel threads onTerminal through the
  // SAME poll machinery; assert it fires when the adoption goes terminal.
  it('calls onTerminal when the adoption finishes (so the mapped → proposed affordance refreshes in place)', async () => {
    const onTerminal = vi.fn();
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    apiMock.buildStatus
      .mockResolvedValueOnce({
        runId: 'adopt-1',
        unitId: 'library',
        status: 'building',
        transcript: ['adoption started'],
      })
      .mockResolvedValueOnce({
        runId: 'adopt-1',
        unitId: 'library',
        status: 'passed',
        transcript: ['flip mapped → proposed', 'verdict: PASS'],
        envelope: 'adopted · signer spine-principal · approvedBy operator',
      });

    render(<BuildSection {...adoptProps} adoptGates={adoptGates} onTerminal={onTerminal} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    await flush(); // first read — still adopting, no refresh yet
    expect(onTerminal).not.toHaveBeenCalled();

    await tick(BUILD_POLL_MS); // terminal PASS → refresh the now-stale affordance
    expect(onTerminal).toHaveBeenCalledTimes(1);
  });

  it('is a LEAN surface — a button + a short one-line description, no per-gate list (owner steer)', () => {
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    render(<BuildSection {...adoptProps} adoptGates={adoptGates} />);
    // The Adopt action is present…
    expect(screen.getByRole('button', { name: 'Adopt' })).toBeTruthy();
    // …with a short, plain description beside it that frames it honestly (a start, not the finish).
    // (The "what each capability still needs" list-intro only appears when a classification follows.)
    expect(screen.getByText(/a start, not the finish/i)).toBeTruthy();
    // …and NO verbose per-gate list / copy-paste commands cluttering the detail panel.
    expect(screen.queryByText('library#gate-1')).toBeNull();
    expect(screen.queryByText(/storytree gate run/)).toBeNull();
  });

  it('renders the per-capability classification as one list — ✓ covered / ○ needs tests, no header, no footer', () => {
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    const { container } = render(
      <BuildSection
        {...adoptProps}
        adoptGates={adoptGates}
        adoption={{
          capabilities: [
            { capId: 'library-cli', covered: true, coveredBy: ['library#gate-2'] },
            { capId: 'seed-corpus-scripts', covered: false, coveredBy: [] },
          ],
          covered: ['library-cli'],
          uncovered: ['seed-corpus-scripts'],
        }}
      />,
    );
    // No "what still owes real work — N covered, N uncovered" header — the count is no longer restated;
    // the ✓ / ○ glyph carries it per row (owner steer 2026-06-24).
    expect(screen.queryByText(/owes real work/i)).toBeNull();
    expect(screen.queryByText(/covered,/i)).toBeNull();
    // …instead the Adopt description itself introduces the list, so they read as ONE section.
    expect(screen.getByText(/what each capability still needs/i)).toBeTruthy();
    // the covered cap shows its covering gate; the uncovered one says it needs tests
    expect(screen.getByText('library-cli')).toBeTruthy();
    expect(screen.getByText(/covered by library#gate-2/)).toBeTruthy();
    expect(screen.getByText('seed-corpus-scripts')).toBeTruthy();
    expect(screen.getByText(/needs tests/)).toBeTruthy();
    // …and NO CLI-pointer footer (the panel IS the plan; adopt-plan stays a CLI/agent tool).
    expect(screen.queryByText(/storytree story adopt-plan/)).toBeNull();
    expect(container.querySelector('.adopt-coverage-caps')).toBeTruthy();
  });

  it('omits the classification block when no adoption plan is supplied', () => {
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    const { container } = render(<BuildSection {...adoptProps} adoptGates={adoptGates} />);
    expect(container.querySelector('.adopt-coverage')).toBeNull();
  });

  it('a panel with NO gates renders the no-gates message and NO Adopt button', () => {
    render(<BuildSection {...adoptProps} adoptGates={[]} />);
    expect(screen.queryByRole('button', { name: 'Adopt' })).toBeNull();
    expect(screen.getByText(/declares no/i)).toBeTruthy();
    expect(screen.getByText(/Reliability Gates/)).toBeTruthy();
    expect(apiMock.adopt).not.toHaveBeenCalled();
  });

  it('a thrown adopt intent (404/409) surfaces gracefully and the Adopt button returns', async () => {
    apiMock.adopt.mockRejectedValue(new Error('a run is already in flight'));
    render(<BuildSection {...adoptProps} adoptGates={adoptGates} />);

    fireEvent.click(screen.getByRole('button', { name: 'Adopt' }));
    await flush();

    expect(apiMock.adopt).toHaveBeenCalledTimes(1);
    expect(apiMock.buildStatus).not.toHaveBeenCalled();
    expect(screen.getByText(/already in flight/)).toBeTruthy();
    // the Adopt button returns so the operator can retry once the other run ends
    expect(screen.getByRole('button', { name: 'Adopt' })).toBeTruthy();
  });
});
