// @vitest-environment jsdom
//
// The accept-to-land affordance for the chat panel (accept-to-land-affordance capability,
// ADR-0108 d.3 — the human gate is a deliberate UI gesture, NEVER a parsed prose intent):
//   • a `done` frame WITHOUT `proposedUnitId` shows the proposal text and NO Build button —
//     nothing safe to dispatch (atl-no-button-without-proposed-id),
//   • a `done` frame WITH `proposedUnitId` shows the proposal text AND an explicit Build button
//     (atl-build-button-on-proposed-id),
//   • clicking Build dispatches api.acceptBuild(proposedUnitId) EXACTLY once; stream-end alone and any
//     free-text prose cannot trigger it — only the explicit click (atl-click-dispatches-accepted-id),
//   • after clicking Build the panel renders the run's coarse progress to a terminal state, and a
//     FAILED build renders honestly — never a forged success (atl-click-dispatches-accepted-id siblings),
//   • typing "yes build it" into the chat input does NOT trigger a build — the ONLY trigger is
//     the explicit Build button click (atl-no-free-text-build-path).
//
// The `api` seam is mocked (no real fetch, no socket, no DB, no Electron); fake timers drive
// streaming and poll transitions deterministically. The panel imports no agent/drive/model code
// (ADR-0004 / the modelPathBoundary wall). Each test leads with its contract id so coverage
// reports correctly.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import type { BuildIntentResult, BuildStatus } from '../types';

// Local mirror of the SSE wire shape (cross-boundary, re-declared like ChatPanel.test.tsx does),
// extended with the new optional `proposedUnitId` on the `done` frame — the machine-actionable
// structural signal the agent attaches when it proposes a specific unit to build (capability 1).
type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; proposal: string; costUsd?: number; turns?: number; proposedUnitId?: string }
  | { type: 'error'; error: string }
  | { type: 'refused'; reason: string };

// Mock the api seam — chatStream (the existing streaming seam) plus the acceptBuild/buildStatus
// calls the panel will make after the operator clicks the explicit Build affordance. acceptBuild()
// is the DISTINCT accept-provenance seam (POST /api/chat/accept, ADR-0133 d.3) the click now drives —
// NOT the generic build() (that stays the BuildSection island's path).
const apiMock = vi.hoisted(() => ({
  chatStream: vi.fn<(intent: string, onEvent: (event: ChatEvent) => void) => Promise<void>>(),
  acceptBuild: vi.fn<(unitId: string) => Promise<BuildIntentResult>>(),
  buildStatus: vi.fn<(runId: string) => Promise<BuildStatus>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { ChatPanel } from './ChatPanel';

/** Flush the async chain a submit/timer kicked off. */
const flush = (): Promise<void> => act(async () => {});

/** Advance the poll clock (and flush whatever the tick triggered). */
const tick = (ms: number): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/** Type the intent into the panel's input and submit via the Send button. */
function typeAndSubmit(intent: string): void {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: intent } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.chatStream.mockReset();
  apiMock.acceptBuild.mockReset();
  apiMock.buildStatus.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ChatPanel — accept-to-land affordance', () => {
  // ── atl-no-button-without-proposed-id ─────────────────────────────────────────
  it('atl-no-button-without-proposed-id: a done frame WITHOUT proposedUnitId shows the proposal and NO Build button — nothing safe to dispatch', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'done', proposal: 'Here is my analysis: orient and explore.' });
    });

    const { container } = render(<ChatPanel />);
    typeAndSubmit('orient me');
    await flush();

    // The proposal text is rendered.
    expect(screen.getByText(/Here is my analysis: orient and explore\./)).toBeTruthy();
    // No accept affordance — there is nothing safe to dispatch (no proposedUnitId).
    expect(container.querySelector('.chat-accept')).toBeNull();
    // No Build button of any kind — queryAllByRole returns [] (not throws) so this always asserts cleanly.
    expect(screen.queryAllByRole('button', { name: /build/i })).toHaveLength(0);
  });

  // ── atl-build-button-on-proposed-id ───────────────────────────────────────────
  it('atl-build-button-on-proposed-id: a done frame WITH proposedUnitId shows the proposal AND an explicit Build button', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({
        type: 'done',
        proposal: 'I propose: build the feature.',
        proposedUnitId: 'chat-drive-bridge#proposal-id-threading',
      });
    });

    const { container } = render(<ChatPanel />);
    typeAndSubmit('what next?');
    await flush();

    // The proposal text is shown.
    expect(screen.getByText(/I propose: build the feature\./)).toBeTruthy();
    // The accept affordance container is rendered.
    expect(container.querySelector('.chat-accept')).toBeTruthy();
    // The explicit Build button is present — the operator's deliberate accept gate.
    expect(screen.getByRole('button', { name: /build/i })).toBeTruthy();
  });

  // ── atl-click-dispatches-accepted-id ──────────────────────────────────────────
  it('atl-click-dispatches-accepted-id: clicking Build calls api.acceptBuild(proposedUnitId) exactly once; stream-end alone does NOT dispatch', async () => {
    const proposedUnitId = 'chat-drive-bridge#proposal-id-threading';
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'done', proposal: 'I propose: build it.', proposedUnitId });
    });
    // build returns a runId; buildStatus keeps the run in-flight (no terminal yet).
    apiMock.acceptBuild.mockResolvedValue({ runId: 'run-accept-1' });
    apiMock.buildStatus.mockResolvedValue({
      runId: 'run-accept-1',
      unitId: proposedUnitId,
      status: 'building',
      transcript: [],
    });

    render(<ChatPanel />);
    typeAndSubmit('what next?');
    await flush();

    // The stream ended — NO auto-dispatch (the agent proposed; the human has NOT clicked yet).
    expect(apiMock.acceptBuild).not.toHaveBeenCalled();

    // Click the explicit Build button — the human's deliberate accept gate (ADR-0108 d.3).
    const buildBtn = screen.getByRole('button', { name: /build/i });
    fireEvent.click(buildBtn);
    await flush();

    // api.acceptBuild was called EXACTLY once with the accepted unit id.
    expect(apiMock.acceptBuild).toHaveBeenCalledTimes(1);
    expect(apiMock.acceptBuild).toHaveBeenCalledWith(proposedUnitId);
  });

  // ── atl-click-dispatches-accepted-id (sibling: progress render) ───────────────
  it('atl-click-dispatches-accepted-id (sibling: progress render): after clicking Build the panel renders coarse progress and reaches a terminal passed state', async () => {
    const proposedUnitId = 'chat-drive-bridge#proposal-id-threading';
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'done', proposal: 'I propose: build it.', proposedUnitId });
    });
    apiMock.acceptBuild.mockResolvedValue({ runId: 'run-accept-2' });
    // First poll: still building, a transcript line is available.
    apiMock.buildStatus
      .mockResolvedValueOnce({
        runId: 'run-accept-2',
        unitId: proposedUnitId,
        status: 'building',
        transcript: ['AUTHOR_TEST phase started'],
      })
      // Second poll: terminal — the build passed.
      .mockResolvedValue({
        runId: 'run-accept-2',
        unitId: proposedUnitId,
        status: 'passed',
        transcript: ['AUTHOR_TEST phase started', 'GATE passed — verdict signed'],
        envelope: 'signed verdict',
      });

    const { container } = render(<ChatPanel />);
    typeAndSubmit('what next?');
    await flush();

    // Click Build — the accept gate.
    fireEvent.click(screen.getByRole('button', { name: /build/i }));
    await flush();

    // A build progress section is now rendered in the chat conversation.
    expect(container.querySelector('.chat-build-progress')).toBeTruthy();

    // Advance past the first poll — transcript content becomes visible.
    await tick(2_000);
    expect(screen.getByText(/AUTHOR_TEST phase started/)).toBeTruthy();

    // Advance past the second poll → terminal state: the build passed.
    await tick(2_000);
    expect(container.querySelector('.chat-build-passed')).toBeTruthy();
  });

  // ── atl-no-free-text-build-path ───────────────────────────────────────────────
  it('atl-no-free-text-build-path: typing "yes build it" into the chat and submitting does NOT call api.acceptBuild — the ONLY trigger is the explicit Build button click', async () => {
    const proposedUnitId = 'chat-drive-bridge#proposal-id-threading';
    // First call: returns the proposal carrying the unit id.
    apiMock.chatStream.mockImplementationOnce(async (_intent, onEvent) => {
      onEvent({ type: 'done', proposal: 'I propose: build it.', proposedUnitId });
    });
    // Fallback for any further chatStream call (the user's follow-up intent).
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'done', proposal: 'I noted your response.' });
    });
    apiMock.acceptBuild.mockResolvedValue({ runId: 'run-prose-1' });

    render(<ChatPanel />);
    // Get the proposal with proposedUnitId onto the screen.
    typeAndSubmit('what next?');
    await flush();

    // Now type prose that sounds like acceptance and submit via the Send button.
    // This is a SECOND chatStream call — NOT an api.acceptBuild call.
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'yes build it' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await flush();

    // chatStream WAS called a second time (the user submitted a follow-up intent)…
    expect(apiMock.chatStream).toHaveBeenCalledTimes(2);
    // …but api.acceptBuild was NEVER called — prose cannot trigger the build gate.
    expect(apiMock.acceptBuild).not.toHaveBeenCalled();
  });

  // ── atl-click-dispatches-accepted-id (sibling: failed render) ─────────────────
  it('atl-click-dispatches-accepted-id (sibling: failed render): a dispatched build that FAILS renders an honest failed state — never a forged success', async () => {
    const proposedUnitId = 'chat-drive-bridge#proposal-id-threading';
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'done', proposal: 'I propose: build it.', proposedUnitId });
    });
    apiMock.acceptBuild.mockResolvedValue({ runId: 'run-accept-fail' });
    // The poll surfaces a terminal FAILED status with a reason.
    apiMock.buildStatus.mockResolvedValue({
      runId: 'run-accept-fail',
      unitId: proposedUnitId,
      status: 'failed',
      transcript: ['IMPLEMENT phase started', 'GATE refused — red'],
      reason: 'the gate observed RED',
    });

    const { container } = render(<ChatPanel />);
    typeAndSubmit('what next?');
    await flush();

    // Click Build — the accept gate.
    fireEvent.click(screen.getByRole('button', { name: /build/i }));
    await flush();

    // Advance past the poll → terminal FAILED state, honestly rendered (and NOT a forged pass).
    await tick(2_000);
    expect(container.querySelector('.chat-build-failed')).toBeTruthy();
    expect(container.querySelector('.chat-build-passed')).toBeNull();
    expect(screen.getByText(/the gate observed RED/)).toBeTruthy();
  });
});
