// @vitest-environment jsdom
//
// Integration test for the ChatPanel component — the studio renderer's thin SSE
// client (ADR-0108 d.1 / ADR-0004). The panel POSTs /api/chat, reads the
// text/event-stream response body as a ReadableStream (`res.body.getReader()`),
// parses `data: <json>\n\n` SSE frames, and renders the terminal event into the
// right UI state.
//
// Four contracts pinned (ADR-0122 — each `it(...)` LEADS with its contract id so
// `storytree coverage chat-panel` reports 4/4):
//   cp-renders-streamed-done-proposal              — POST {intent} → `done` frame renders the proposal; busy clears; submit re-enabled
//   cp-renders-error-frame-as-error                — `error` frame renders a distinct error state (not "try again")
//   cp-renders-refused-as-busy-retry               — `refused` frame renders "busy — try again" (not a generic error)
//   cp-busy-while-streaming-blank-not-submittable  — blank/whitespace intent never POSTs; an in-flight submit blocks a concurrent POST
//
// global fetch is replaced with a scripted ReadableStream double — no live SDK, no DB, no imports
// from @storytree/agent / @storytree/drive / @storytree/orchestrator / @storytree/cli (ADR-0004).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

import { ChatPanel } from './ChatPanel';

// ── scripted SSE helpers ──────────────────────────────────────────────────────

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const sseFrame = (event: unknown): string => `data: ${JSON.stringify(event)}\n\n`;

/**
 * A scripted SSE Response: a ReadableStream that enqueues all frames
 * synchronously then closes. The panel must read this via `res.body.getReader()`,
 * NOT via `res.json()` (the body is SSE text, not JSON).
 */
function sseResponse(frames: unknown[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(enc(sseFrame(f)));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

/** Flush pending microtasks and React state updates. */
const flush = (): Promise<void> => act(async () => {});

// ── lifecycle ─────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ChatPanel', () => {
  // ── cp-renders-streamed-done-proposal ─────────────────────────────────────────
  //
  // The happy path — PROVES (a) the panel POSTs the intent to /api/chat with a
  // `{ intent }` JSON body, and (b) it reads the STREAM (the proposal arrives as a
  // parsed SSE `done` frame), not a one-shot `res.json()` body. If the panel used
  // `res.json()`, the "data: ...\n\n" wire format would fail to parse as JSON and
  // the proposal would never render.
  it('cp-renders-streamed-done-proposal: POSTs {intent} to /api/chat, reads the stream, renders the proposal, re-enables submit', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([{ type: 'done', proposal: 'Here is the plan.', costUsd: 0.04, turns: 2 }]),
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<ChatPanel />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What should we build?' } });
    fireEvent.click(screen.getByRole('button'));
    await flush();

    // The wire contract: exactly ONE POST to /api/chat carrying { intent } as JSON.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ intent: 'What should we build?' });

    // The proposal text from the streamed `done` event is on-screen.
    expect(screen.getByText('Here is the plan.')).toBeTruthy();
    // The busy state has cleared — the submit control is enabled again.
    expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  });

  // ── cp-renders-error-frame-as-error ───────────────────────────────────────────
  //
  // Fail-closed honesty: the panel surfaces the error message to the user rather
  // than silently clearing. Distinct from `refused` — an error is a real failure,
  // not a session-guard bounce.
  it('cp-renders-error-frame-as-error: an `error` SSE frame renders a distinct error state (not silent, not "try again")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([{ type: 'error', error: 'The agent crashed mid-run.' }]),
      ),
    );

    render(<ChatPanel />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Do something risky' } });
    fireEvent.click(screen.getByRole('button'));
    await flush();

    // The error text is surfaced (fail-closed honesty — NOT a silent empty render).
    expect(screen.getByText(/The agent crashed mid-run\./)).toBeTruthy();
    // It must NOT render the "try again" affordance — error and refused are distinct states.
    expect(screen.queryByText(/try again/i)).toBeNull();
  });

  // ── cp-renders-refused-as-busy-retry ──────────────────────────────────────────
  //
  // The single-session guard's UX (ADR-0108 d.6): a `refused` frame means a
  // session is already running — the user is told to try again later, NOT shown a
  // generic failure. The panel must NOT conflate this with an `error` state.
  it('cp-renders-refused-as-busy-retry: a `refused` SSE frame renders "busy — try again" (distinct from error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([{ type: 'refused', reason: 'A session is already running.' }]),
      ),
    );

    render(<ChatPanel />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Chat now' } });
    fireEvent.click(screen.getByRole('button'));
    await flush();

    // A "try again" affordance is rendered (the refused / busy-session guard UX).
    expect(screen.getByText(/try again/i)).toBeTruthy();
    // The reason forwarded from the server is surfaced.
    expect(screen.getByText(/A session is already running\./)).toBeTruthy();
    // It must NOT render a generic error — refused is its own distinct state.
    expect(screen.queryByText(/The agent crashed/)).toBeNull();
  });

  // ── cp-busy-while-streaming-blank-not-submittable (blank facet) ────────────────
  //
  // Fail-closed submit: a blank or whitespace-only intent is not submittable — no
  // POST fires. This keeps the fetch-call-count assertions in the concurrent test
  // exact.
  it('cp-busy-while-streaming-blank-not-submittable: a blank or whitespace-only intent never fires fetch', async () => {
    vi.stubGlobal('fetch', vi.fn());
    render(<ChatPanel />);
    const btn = screen.getByRole('button');

    // Blank input (default state) — the submit is a no-op.
    fireEvent.click(btn);
    await flush();
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // Whitespace-only — still no POST.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   \t  ' } });
    fireEvent.click(btn);
    await flush();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // ── cp-busy-while-streaming-blank-not-submittable (in-flight facet) ────────────
  //
  // While a stream is in flight the submit is disabled so a concurrent POST cannot
  // fire from the UI. The composition-level single-session guard is authoritative
  // server-side (ADR-0108 d.6); this is the matching client-side courtesy — it also
  // keeps the fetch-call-count assertions in other tests exact.
  //
  // Double-click pattern: both clicks fire synchronously; the first click sets
  // busy = true and React commits the state (button disabled) before the second
  // click fires; React suppresses onClick on a disabled button.
  it('cp-busy-while-streaming-blank-not-submittable: a concurrent click while in-flight fires no extra fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([{ type: 'done', proposal: 'ok', costUsd: 0, turns: 1 }]),
      ),
    );

    render(<ChatPanel />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Start chat' } });
    const btn = screen.getByRole('button');

    fireEvent.click(btn); // first click — sets busy, disables the submit
    fireEvent.click(btn); // second click — button is now disabled, React suppresses onClick
    await flush();

    // Exactly one POST was made — the concurrent click did not trigger a second fetch.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
