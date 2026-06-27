// @vitest-environment jsdom
//
// Stage-1 red-green of the renderer chat panel (chat-panel capability, ADR-0070 two-stage). These
// pin the GEOMETRY/BEHAVIOUR the owner-attested appearance (the `desktop` story's UAT leg 7) sits on
// top of — NO appearance/visual assertion lives here (the look is witnessed, never a machine verdict):
//   • submitting an intent POSTs to /api/chat (through the api streaming seam) EXACTLY once and flips
//     the panel into a busy/streaming state — a double-submit cannot fire a second POST
//     (cp-posts-intent-once-and-shows-busy),
//   • a terminal `done` frame renders the proposal and ends the busy state
//     (cp-renders-the-done-proposal),
//   • a terminal `error` frame renders a DISTINCT failure state carrying the error, not a proposal
//     (cp-renders-error-distinctly),
//   • a terminal `refused` frame renders a DISTINCT "busy — try again" state carrying the reason
//     (≠ error), and a blank/whitespace intent fires NO seam call (cp-renders-refused-as-busy-retry),
//   • a rejected seam (404 / fetch error — the route is absent) renders an honest disabled "chat
//     unavailable" state, never hangs, never crashes (cp-degrades-when-route-absent).
//
// The panel's ONLY path to the chat route is the api streaming seam (ADR-0004): the panel imports no
// agent/drive/model code and defines the SSE wire shape LOCALLY. The api module is mocked (no fetch,
// no socket, no SDK, no DB, no Electron) and the streaming transitions run on fake timers, so every
// terminal outcome is driven exactly. Each test LEADS with its contract id so `storytree coverage
// chat-panel` reports 5/5 (ADR-0122).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// The local mirror of the chat-sse-mount SSE `data:` frames (the cross-boundary wire shape). Defined
// here too so the scripted seam yields exactly what the route emits — the panel re-declares its own.
type ChatEvent =
  | { type: 'done'; proposal: string; costUsd?: number; turns?: number }
  | { type: 'error'; error: string }
  | { type: 'refused'; reason: string };

// The streaming seam: api.chatStream(intent, onEvent) POSTs /api/chat, parses each SSE frame, and
// calls onEvent per typed event. It resolves when the stream ends and rejects when the route is
// absent (404 / fetch error). The mock lets each test script the frames (and the rejection).
const apiMock = vi.hoisted(() => ({
  chatStream:
    vi.fn<(intent: string, onEvent: (event: ChatEvent) => void) => Promise<void>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { ChatPanel } from './ChatPanel';

/** Flush the async chain a submit/timer kicked off. */
const flush = (): Promise<void> => act(async () => {});

/** Type the intent into the panel's input and submit it. */
function typeAndSubmit(intent: string): void {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: intent } });
  // Submit via the Send button (also covers Enter, but the button is the stable affordance).
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

beforeEach(() => {
  vi.useFakeTimers();
  apiMock.chatStream.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ChatPanel', () => {
  // ── cp-posts-intent-once-and-shows-busy ─────────────────────────────────────
  it('cp-posts-intent-once-and-shows-busy: submitting POSTs to the seam once with the intent and flips to busy (input disabled), and a double-submit cannot fire a second POST', async () => {
    // A seam that never resolves → the panel stays busy/streaming, so we can observe the busy state.
    let settle: () => void = () => {};
    apiMock.chatStream.mockReturnValue(new Promise<void>((res) => { settle = res; }));

    render(<ChatPanel />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'add a chat panel' } });
    const send = screen.getByRole('button', { name: /send/i });
    fireEvent.click(send);
    fireEvent.click(send); // a second synchronous click before the stream starts
    await flush();

    // POSTed exactly once, with the typed intent.
    expect(apiMock.chatStream).toHaveBeenCalledTimes(1);
    expect(apiMock.chatStream.mock.calls[0]?.[0]).toBe('add a chat panel');

    // The panel is busy/streaming: the input is disabled until the stream terminates.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    // A third click while busy still cannot fire a second POST.
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await flush();
    expect(apiMock.chatStream).toHaveBeenCalledTimes(1);

    settle(); // let the (never-terminal) stream resolve so the effect/timers settle cleanly
    await flush();
  });

  // ── cp-renders-the-done-proposal ────────────────────────────────────────────
  it('cp-renders-the-done-proposal: a terminal done frame renders the proposal text and ends the busy state', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'done', proposal: 'Here is the plan: build it.', costUsd: 0.02, turns: 3 });
    });

    render(<ChatPanel />);
    typeAndSubmit('what should I build?');
    await flush();

    expect(screen.getByText(/Here is the plan: build it\./)).toBeTruthy();
    // busy ended — the input is usable again for a follow-up.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
  });

  // ── cp-renders-error-distinctly ─────────────────────────────────────────────
  it('cp-renders-error-distinctly: a terminal error frame renders a distinct failure state carrying the error (not a proposal)', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'error', error: 'the session died unexpectedly' });
    });

    const { container } = render(<ChatPanel />);
    typeAndSubmit('do the thing');
    await flush();

    expect(screen.getByText(/the session died unexpectedly/)).toBeTruthy();
    // A distinct failure state — marked as an error, NOT a proposal and NOT the refused/busy state.
    expect(container.querySelector('.chat-error')).toBeTruthy();
    expect(container.querySelector('.chat-proposal')).toBeNull();
    expect(container.querySelector('.chat-refused')).toBeNull();
    // busy ended.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
  });

  // ── cp-renders-refused-as-busy-retry ────────────────────────────────────────
  it('cp-renders-refused-as-busy-retry: a terminal refused frame renders a distinct "busy — try again" state carrying the reason (≠ error)', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'refused', reason: 'a session is already in flight' });
    });

    const { container } = render(<ChatPanel />);
    typeAndSubmit('start a session');
    await flush();

    expect(screen.getByText(/a session is already in flight/)).toBeTruthy();
    // A distinct "busy — try again" state — NOT the error state, NOT a proposal.
    expect(container.querySelector('.chat-refused')).toBeTruthy();
    expect(container.querySelector('.chat-error')).toBeNull();
    expect(container.querySelector('.chat-proposal')).toBeNull();
    // A refusal is recoverable — the input comes back so the operator can retry.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
  });

  it('cp-renders-refused-as-busy-retry (sibling: empty-intent guard): a blank / whitespace-only intent fires NO seam call', async () => {
    apiMock.chatStream.mockResolvedValue(undefined);
    render(<ChatPanel />);

    // Empty submit.
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await flush();
    expect(apiMock.chatStream).not.toHaveBeenCalled();

    // Whitespace-only submit.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   \n  ' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await flush();
    expect(apiMock.chatStream).not.toHaveBeenCalled();
  });

  // ── cp-degrades-when-route-absent ───────────────────────────────────────────
  it('cp-degrades-when-route-absent: a rejected seam (404 / fetch error) renders an honest disabled "chat unavailable" state, never hangs, never crashes', async () => {
    apiMock.chatStream.mockRejectedValue(new Error('404 Not Found'));

    const { container } = render(<ChatPanel />);
    typeAndSubmit('anything');
    await flush();

    // An honest, distinct "unavailable" state — not a generic error, not a hung spinner.
    expect(container.querySelector('.chat-unavailable')).toBeTruthy();
    expect(screen.getByText(/chat is unavailable/i)).toBeTruthy();
    // The seam WAS attempted once (so it's a genuine degrade, not a silent no-op)…
    expect(apiMock.chatStream).toHaveBeenCalledTimes(1);
    // …and the surface is disabled (it does not pretend to work where the route is absent),
    // never left in a perpetual busy/streaming spinner.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    expect(container.querySelector('.chat-busy')).toBeNull();
  });
});
