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

  // ── story scope: the STATUS-AWARE go-green affordance (ADR-0094) ─────────────
  it('a proposed story (goGreen=build) frames a whole-story --real drive that auto-merges', () => {
    render(<BuildSection unitId="notice-board" buildable scope="story" goGreen="build" status="proposed" />);
    expect(screen.getByRole('button', { name: 'Build' })).toBeTruthy();
    // Honest framing: --real authors real code + opens a PR that auto-merges to trunk (ADR-0022),
    // NOT the node-scope --live "synthetic task" copy, and NOT a "suggest a PR" dead end.
    expect(screen.getByText(/whole story for real/i)).toBeTruthy();
    expect(screen.getByText(/--real/)).toBeTruthy();
    expect(screen.getByText(/auto-merges to trunk/i)).toBeTruthy();
    expect(screen.queryByText(/synthetic task/i)).toBeNull();
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
    expect(screen.getByRole('heading', { name: 'Adopt' })).toBeTruthy();
    // The gate-run path is SURFACED (the live signing is the owner's DB action — not auto-run).
    expect(screen.getByText(/storytree gate run library#gate-1 --pg/)).toBeTruthy();
    expect(screen.getByText(/storytree gate run library#gate-2 --pg/)).toBeTruthy();
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
    expect(screen.getByText(/build passed/)).toBeTruthy(); // the shared terminal status line
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
    expect(screen.getByText(/failed/i)).toBeTruthy();
    expect(screen.getByText(/observed red — refused/)).toBeTruthy();

    await tick(BUILD_POLL_MS);
    await tick(BUILD_POLL_MS);
    expect(apiMock.buildStatus).toHaveBeenCalledTimes(2); // no polling past terminal
  });

  it('still lists the gates as context (id + observe command) above/below the Adopt button', () => {
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    render(<BuildSection {...adoptProps} adoptGates={adoptGates} />);
    // The Adopt action is present…
    expect(screen.getByRole('button', { name: 'Adopt' })).toBeTruthy();
    // …and the gates still render as CONTEXT (their id + the observe command), not as the trigger.
    expect(screen.getByText('library#gate-1')).toBeTruthy();
    expect(screen.getByText('library#gate-2')).toBeTruthy();
    expect(screen.getByText(/storytree gate run library#gate-1 --pg/)).toBeTruthy();
    // Honest framing that Adopt ENTERS a proving process (ADR-0097) — does not necessarily green.
    expect(screen.getByText(/proving process/i)).toBeTruthy();
  });

  it('a mixed-kind gate set frames build-tests/integrate gates as still-owed real work', () => {
    apiMock.adopt.mockResolvedValue({ runId: 'adopt-1' });
    render(
      <BuildSection
        {...adoptProps}
        adoptGates={[
          { id: 'library#gate-1', kind: 'observe', command: 'pnpm --filter @storytree/library test' },
          { id: 'library#gate-9', kind: 'build-tests' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Adopt' })).toBeTruthy();
    expect(screen.getByText(/genuine red→green build/)).toBeTruthy();
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
