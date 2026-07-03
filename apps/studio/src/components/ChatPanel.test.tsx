// @vitest-environment jsdom
//
// Stage-1 red-green of the renderer chat panel (chat-panel + terminal-chat capabilities, ADR-0070
// two-stage). These pin the GEOMETRY/BEHAVIOUR the owner-attested appearance (the story's terminal
// FEEL UAT leg) sits on top of — NO appearance/visual assertion lives here (the look is witnessed,
// never a machine verdict). The panel is a persistent multi-turn TRANSCRIPT (multi-turn-transcript):
//   • each send APPENDS a `› <prompt>` echo + its reply as a new entry, prior exchanges never replaced
//     (mtt-appends-not-replaces, mtt-echoes-each-prompt),
//   • done / error / refused each settle their own transcript entry, all surviving later sends
//     (mtt-renders-each-terminal-kind-as-an-entry),
//   • delta frames render live in the NEWEST (tail) entry, priors untouched
//     (mtt-streams-delta-into-the-tail-entry),
//   • appending an exchange (and streaming into the tail) fires a scroll-to-newest recompute on the
//     scrollback surface — the recompute is observed via a spied ref, not laid-out pixels, since jsdom
//     has no layout (mtt-auto-scrolls-to-newest),
//   • a rejected seam (404 / fetch error) settles the entry to an honest "chat unavailable" state,
//     never hangs, never crashes (cp-degrades-when-route-absent),
//   • plain Enter submits, Shift+Enter inserts a newline, a blank intent fires no seam call
//     (cp-enter-submits), and the panel carries no redundant title/blurb chrome (cp-no-redundant-chrome).
//
// The panel's ONLY path to the chat route is the api streaming seam (ADR-0004): the panel imports no
// agent/drive/model code and defines the SSE wire shape LOCALLY. The api module is mocked (no fetch,
// no socket, no SDK, no DB, no Electron) and the streaming transitions run on fake timers, so every
// terminal outcome is driven exactly. Each test LEADS with its contract id so `storytree coverage
// terminal-chat` / `… chat-panel` reports the contracts covered (ADR-0122).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// The local mirror of the chat-sse-mount SSE `data:` frames (the cross-boundary wire shape). Defined
// here too so the scripted seam yields exactly what the route emits — the panel re-declares its own.
type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; proposal: string; costUsd?: number; turns?: number }
  | { type: 'error'; error: string }
  | { type: 'refused'; reason: string };

// The streaming seam: api.chatStream(intent, onEvent) POSTs /api/chat, parses each SSE frame, and
// calls onEvent per typed event. It resolves when the stream ends and rejects when the route is
// absent (404 / fetch error). The mock lets each test script the frames (and the rejection) across
// MULTIPLE sends (the transcript model).
const apiMock = vi.hoisted(() => ({
  chatStream:
    vi.fn<(intent: string, onEvent: (event: ChatEvent) => void, signal?: AbortSignal) => Promise<void>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { ChatPanel } from './ChatPanel';

/** Flush the async chain a submit/timer kicked off. */
const flush = (): Promise<void> => act(async () => {});

/** Type the intent into the panel's input and submit it via the icon send button (Enter-to-send is
 *  covered separately; the button is stable). The input clears on submit (the prompt moves into the
 *  transcript), so each call types fresh. */
function typeAndSubmit(intent: string): void {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: intent } });
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

describe('ChatPanel — multi-turn transcript', () => {
  // ── mtt-appends-not-replaces ────────────────────────────────────────────────
  it('mtt-appends-not-replaces: a second send appends a new exchange without discarding the first — both present, in order, newest last', async () => {
    // First send settles to a done proposal; second send settles to an error. Both must remain.
    apiMock.chatStream
      .mockImplementationOnce(async (_intent, onEvent) => {
        onEvent({ type: 'done', proposal: 'first plan', turns: 1 });
      })
      .mockImplementationOnce(async (_intent, onEvent) => {
        onEvent({ type: 'error', error: 'second failed' });
      });

    const { container } = render(<ChatPanel />);

    typeAndSubmit('first intent');
    await flush();
    // First exchange settled.
    expect(screen.getByText(/first plan/)).toBeTruthy();

    typeAndSubmit('second intent');
    await flush();

    // BOTH exchanges are present — the first was NOT replaced.
    expect(screen.getByText(/first plan/)).toBeTruthy();
    expect(screen.getByText(/second failed/)).toBeTruthy();

    // In order: two exchanges, first ABOVE second (newest last).
    const exchanges = container.querySelectorAll('.chat-exchange');
    expect(exchanges.length).toBe(2);
    expect(exchanges[0]?.textContent).toContain('first intent');
    expect(exchanges[0]?.textContent).toContain('first plan');
    expect(exchanges[1]?.textContent).toContain('second intent');
    expect(exchanges[1]?.textContent).toContain('second failed');

    // The first exchange's echo + terminal render are unchanged (a done proposal, still).
    expect(exchanges[0]?.querySelector('.chat-proposal')).toBeTruthy();
  });

  // ── mtt-echoes-each-prompt ──────────────────────────────────────────────────
  it('mtt-echoes-each-prompt: each send appends its `› <prompt>` echo line above its reply, per turn', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'done', proposal: 'a plan', turns: 1 });
    });

    const { container } = render(<ChatPanel />);

    typeAndSubmit('rework the chat dock');
    await flush();
    typeAndSubmit('now add auto-grow');
    await flush();

    // Two echo lines, each carrying its own submitted intent (not just the current one).
    const echoes = container.querySelectorAll('.chat-echo');
    expect(echoes.length).toBe(2);
    expect(echoes[0]?.textContent).toContain('rework the chat dock');
    expect(echoes[1]?.textContent).toContain('now add auto-grow');

    // The echo renders ABOVE its reply within its exchange (the terminal prompt line).
    const firstExchange = container.querySelectorAll('.chat-exchange')[0];
    const echo = firstExchange?.querySelector('.chat-echo');
    const reply = firstExchange?.querySelector('.chat-proposal');
    expect(echo).toBeTruthy();
    expect(reply).toBeTruthy();
    // echo precedes reply in document order.
    const position = (echo as Element).compareDocumentPosition(reply as Node);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // ── mtt-renders-each-terminal-kind-as-an-entry ──────────────────────────────
  it('mtt-renders-each-terminal-kind-as-an-entry: done / error / refused each settle their own entry, all surviving later sends', async () => {
    apiMock.chatStream
      .mockImplementationOnce(async (_intent, onEvent) => {
        onEvent({ type: 'done', proposal: 'the proposal', turns: 2 });
      })
      .mockImplementationOnce(async (_intent, onEvent) => {
        onEvent({ type: 'error', error: 'the session died' });
      })
      .mockImplementationOnce(async (_intent, onEvent) => {
        onEvent({ type: 'refused', reason: 'already in flight' });
      });

    const { container } = render(<ChatPanel />);

    typeAndSubmit('one');
    await flush();
    typeAndSubmit('two');
    await flush();
    typeAndSubmit('three');
    await flush();

    // All three entries present, each with its DISTINCT terminal render.
    const exchanges = container.querySelectorAll('.chat-exchange');
    expect(exchanges.length).toBe(3);
    expect(exchanges[0]?.querySelector('.chat-proposal')).toBeTruthy();
    expect(exchanges[1]?.querySelector('.chat-error')).toBeTruthy();
    expect(exchanges[2]?.querySelector('.chat-refused')).toBeTruthy();

    // The reasons/errors render distinctly, all still visible.
    expect(screen.getByText(/the proposal/)).toBeTruthy();
    expect(screen.getByText(/the session died/)).toBeTruthy();
    expect(screen.getByText(/already in flight/)).toBeTruthy();

    // Refused is NOT an error, error is NOT a proposal — the kinds stay distinct per entry.
    expect(exchanges[1]?.querySelector('.chat-refused')).toBeNull();
    expect(exchanges[2]?.querySelector('.chat-error')).toBeNull();
  });

  // ── mtt-streams-delta-into-the-tail-entry ───────────────────────────────────
  it('mtt-streams-delta-into-the-tail-entry: delta frames render live in the newest (tail) entry while prior settled entries are untouched, then settle', async () => {
    // First send settles to a done. Second send streams deltas (held open), then settles.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    apiMock.chatStream
      .mockImplementationOnce(async (_intent, onEvent) => {
        onEvent({ type: 'done', proposal: 'prior settled reply', turns: 1 });
      })
      .mockImplementationOnce(async (_intent, onEvent) => {
        onEvent({ type: 'delta', text: 'Orienting' });
        onEvent({ type: 'delta', text: ' on the tree…' });
        await gate; // hold the tail entry mid-stream
        onEvent({ type: 'done', proposal: 'the newest settled reply', turns: 2 });
      });

    const { container } = render(<ChatPanel />);

    typeAndSubmit('first');
    await flush();
    expect(screen.getByText(/prior settled reply/)).toBeTruthy();

    typeAndSubmit('second');
    await flush();

    // Mid-stream: the accumulating delta text renders in the TAIL (newest) entry, live.
    const exchanges = container.querySelectorAll('.chat-exchange');
    expect(exchanges.length).toBe(2);
    const tail = exchanges[1];
    expect(tail?.querySelector('.chat-streaming-text')?.textContent).toContain('Orienting on the tree…');
    // The prior settled entry is UNTOUCHED — still its done proposal, no streaming text.
    const prior = exchanges[0];
    expect(prior?.querySelector('.chat-proposal')).toBeTruthy();
    expect(prior?.querySelector('.chat-streaming-text')).toBeNull();

    // Settle the tail → its live stream gives way to the authoritative proposal, prior still intact.
    release();
    await flush();
    expect(screen.getByText(/the newest settled reply/)).toBeTruthy();
    expect(screen.getByText(/prior settled reply/)).toBeTruthy();
    expect(container.querySelector('.chat-streaming-text')).toBeNull();
    // The input is usable again for a follow-up.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
  });

  // ── mtt-auto-scrolls-to-newest ──────────────────────────────────────────────
  it('mtt-auto-scrolls-to-newest: appending an exchange and streaming into the tail fires a scroll-to-newest recompute (observed via a spied scrollTop setter, not laid-out pixels)', async () => {
    // Spy the scrollTop setter on ALL elements — jsdom lays out nothing, so we observe the recompute
    // (scrollTop = scrollHeight) firing, not a pixel result. scrollHeight is scripted so the recompute
    // has a value to set.
    const scrollTopSets: number[] = [];
    const proto = window.HTMLElement.prototype;
    const originalScrollTop = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 500 });
    Object.defineProperty(proto, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set(v: number) {
        scrollTopSets.push(v);
      },
    });

    try {
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => { release = r; });
      apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
        onEvent({ type: 'delta', text: 'streaming token' });
        await gate;
        onEvent({ type: 'done', proposal: 'done', turns: 1 });
      });

      render(<ChatPanel />);

      const before = scrollTopSets.length;
      typeAndSubmit('a prompt');
      await flush();
      // Appending the exchange (and the delta streaming into it) fired the scroll-to-newest recompute
      // — scrollTop was set to the (scripted) scrollHeight.
      expect(scrollTopSets.length).toBeGreaterThan(before);
      expect(scrollTopSets).toContain(500);

      release();
      await flush();
    } finally {
      // Restore the prototype descriptors so no other test observes the spy.
      delete (proto as unknown as Record<string, unknown>).scrollHeight;
      if (originalScrollTop) {
        Object.defineProperty(proto, 'scrollTop', originalScrollTop);
      } else {
        delete (proto as unknown as Record<string, unknown>).scrollTop;
      }
    }
  });

  it('mtt-auto-scrolls-to-newest (sibling: empty-intent guard): a blank / whitespace-only intent fires NO seam call and appends NO transcript entry', async () => {
    apiMock.chatStream.mockResolvedValue(undefined);
    const { container } = render(<ChatPanel />);

    // Empty submit.
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await flush();
    expect(apiMock.chatStream).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.chat-exchange').length).toBe(0);

    // Whitespace-only submit.
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   \n  ' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await flush();
    expect(apiMock.chatStream).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.chat-exchange').length).toBe(0);
  });

  // ── cp-posts-intent-once-and-shows-busy (retained: single-POST + busy, now over the transcript) ──
  it('cp-posts-intent-once-and-shows-busy: submitting POSTs to the seam once with the intent and flips to busy (input disabled), and a double-submit cannot fire a second POST', async () => {
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

    // The panel is busy/streaming: the input is disabled until the tail exchange terminates.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true);
    // A third click while busy still cannot fire a second POST.
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    await flush();
    expect(apiMock.chatStream).toHaveBeenCalledTimes(1);

    settle();
    await flush();
  });

  // ── cp-enter-submits (terminal keybindings, retained) ───────────────────────
  it('cp-enter-submits: plain Enter in the input submits (fires the seam once); Shift+Enter does NOT submit', async () => {
    let settle: () => void = () => {};
    apiMock.chatStream.mockReturnValue(new Promise<void>((res) => { settle = res; }));

    render(<ChatPanel />);
    const input = screen.getByRole('textbox');

    // Shift+Enter must NOT submit — it inserts a newline (the default), so the seam is untouched.
    fireEvent.change(input, { target: { value: 'multi' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    await flush();
    expect(apiMock.chatStream).not.toHaveBeenCalled();

    // Plain Enter submits — fires the seam exactly once with the typed intent.
    fireEvent.keyDown(input, { key: 'Enter' });
    await flush();
    expect(apiMock.chatStream).toHaveBeenCalledTimes(1);
    expect(apiMock.chatStream.mock.calls[0]?.[0]).toBe('multi');

    settle();
    await flush();
  });

  it('cp-enter-submits (sibling: empty-intent guard holds for Enter): plain Enter on a blank input fires NO seam call', async () => {
    apiMock.chatStream.mockResolvedValue(undefined);
    render(<ChatPanel />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await flush();
    expect(apiMock.chatStream).not.toHaveBeenCalled();
  });

  // ── cp-renders-the-done-proposal (retained chat-panel contract, now a transcript entry) ─────────
  it('cp-renders-the-done-proposal: a terminal done frame renders the proposal text in its entry and ends the busy state', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'done', proposal: 'Here is the plan: build it.', costUsd: 0.02, turns: 3 });
    });

    const { container } = render(<ChatPanel />);
    typeAndSubmit('what should I build?');
    await flush();

    expect(screen.getByText(/Here is the plan: build it\./)).toBeTruthy();
    expect(container.querySelector('.chat-proposal')).toBeTruthy();
    // busy ended — the input is usable again for a follow-up.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
  });

  // ── cp-renders-error-distinctly (retained chat-panel contract, now a transcript entry) ──────────
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
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
  });

  // ── cp-renders-refused-as-busy-retry (retained chat-panel contract, now a transcript entry) ─────
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

  // ── cp-no-redundant-chrome (retained) ───────────────────────────────────────
  it('cp-no-redundant-chrome: the panel renders NO "Chat" title heading and NO blurb — and the send control is an icon (aria-label="send"), not a "Send" text button', () => {
    render(<ChatPanel />);

    expect(screen.queryByRole('heading', { name: /chat/i })).toBeNull();
    expect(screen.queryByText(/ask the orchestrator to orient and propose/i)).toBeNull();
    expect(screen.getByRole('button', { name: /send/i })).toBeTruthy();
    expect(screen.queryByText(/^send$/i)).toBeNull();
  });

  // ── cp-degrades-when-route-absent (retained: now settles the tail entry) ────
  it('cp-degrades-when-route-absent: a rejected seam (404 / fetch error) settles the entry to an honest "chat unavailable" state, never hangs, never crashes', async () => {
    apiMock.chatStream.mockRejectedValue(new Error('404 Not Found'));

    const { container } = render(<ChatPanel />);
    typeAndSubmit('anything');
    await flush();

    // An honest, distinct "unavailable" render on the exchange — not a generic error, not a hung spinner.
    expect(container.querySelector('.chat-unavailable')).toBeTruthy();
    expect(screen.getByText(/chat is unavailable/i)).toBeTruthy();
    expect(apiMock.chatStream).toHaveBeenCalledTimes(1);
    // The tail settled (no longer busy) so the input is usable again — never a perpetual spinner.
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false);
    expect(container.querySelector('.chat-busy')).toBeNull();
  });
});

describe('ChatPanel — auto-grow input', () => {
  /** Script the textarea's `scrollHeight` (jsdom lays out nothing → returns 0). Redefining the
   *  prototype getter lets the height-recompute read a deterministic content height, so we observe the
   *  recompute setting `style.height` from it — not laid-out pixels (auto-grow-input). Returns a
   *  restore fn to remove the spy so no other test observes it. */
  function scriptScrollHeight(value: number): () => void {
    const proto = window.HTMLTextAreaElement.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => value });
    return () => {
      if (original) Object.defineProperty(proto, 'scrollHeight', original);
      else delete (proto as unknown as Record<string, unknown>).scrollHeight;
    };
  }

  // ── agi-recomputes-height-from-content ──────────────────────────────────────
  it('agi-recomputes-height-from-content: onChange grows the textarea height to fit its (scripted-scrollHeight) content, and shrinks back when content is deleted', async () => {
    apiMock.chatStream.mockResolvedValue(undefined);
    render(<ChatPanel />);
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;

    // Grow: content with a scripted scrollHeight of 60 (below the 160 cap) → height set to fit it.
    let restore = scriptScrollHeight(60);
    fireEvent.change(input, { target: { value: 'line one\nline two\nline three' } });
    expect(input.style.height).toBe('60px');
    restore();

    // Shrink: content deleted, scripted scrollHeight drops to 20 → the reset-then-measure recompute
    // sets the height BACK down (a grow-only recompute would leave it at 60 — a defect).
    restore = scriptScrollHeight(20);
    fireEvent.change(input, { target: { value: 'a' } });
    expect(input.style.height).toBe('20px');
    restore();
  });

  // ── agi-caps-height-and-scrolls-internally ──────────────────────────────────
  it('agi-caps-height-and-scrolls-internally: past a max height the textarea clamps at the cap and scrolls inside itself', async () => {
    apiMock.chatStream.mockResolvedValue(undefined);
    render(<ChatPanel />);
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;

    // scrollHeight well past the 160 cap → the height clamps at 160 AND internal scrolling turns on.
    const restore = scriptScrollHeight(400);
    fireEvent.change(input, { target: { value: 'a very long pasted multi-line prompt' } });
    expect(input.style.height).toBe('160px');
    expect(input.style.overflowY).toBe('auto');
    restore();

    // Back below the cap → the height fits the content again and internal scroll turns back off.
    const restore2 = scriptScrollHeight(50);
    fireEvent.change(input, { target: { value: 'short' } });
    expect(input.style.height).toBe('50px');
    expect(input.style.overflowY).toBe('hidden');
    restore2();
  });

  // ── agi-keeps-enter-send-shift-enter-newline ────────────────────────────────
  it('agi-keeps-enter-send-shift-enter-newline: plain Enter sends (seam fires once), Shift+Enter does NOT submit — the terminal keybindings kept through the grow change', async () => {
    let settle: () => void = () => {};
    apiMock.chatStream.mockReturnValue(new Promise<void>((res) => { settle = res; }));

    render(<ChatPanel />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'grow then send' } });
    // Shift+Enter → newline, no submit.
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    await flush();
    expect(apiMock.chatStream).not.toHaveBeenCalled();

    // Plain Enter → submit once.
    fireEvent.keyDown(input, { key: 'Enter' });
    await flush();
    expect(apiMock.chatStream).toHaveBeenCalledTimes(1);
    expect(apiMock.chatStream.mock.calls[0]?.[0]).toBe('grow then send');

    settle();
    await flush();
  });

  it('agi-keeps-enter-send-shift-enter-newline (sibling: empty-intent guard): plain Enter on a blank input fires NO seam call', async () => {
    apiMock.chatStream.mockResolvedValue(undefined);
    render(<ChatPanel />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await flush();
    expect(apiMock.chatStream).not.toHaveBeenCalled();
  });
});

describe('ChatPanel — transcript reset', () => {
  /** Find the reset ("new chat") control by its accessible name. */
  const resetButton = (): HTMLElement => screen.getByRole('button', { name: /new chat/i });

  // ── tr-clears-transcript-to-idle ────────────────────────────────────────────
  it('tr-clears-transcript-to-idle: clicking reset empties the transcript back to the idle empty state (input cleared + re-enabled + resting height)', async () => {
    apiMock.chatStream
      .mockImplementationOnce(async (_intent, onEvent) => {
        onEvent({ type: 'done', proposal: 'first plan', turns: 1 });
      })
      .mockImplementationOnce(async (_intent, onEvent) => {
        onEvent({ type: 'error', error: 'second failed' });
      });

    const { container } = render(<ChatPanel />);
    typeAndSubmit('one');
    await flush();
    typeAndSubmit('two');
    await flush();

    // Two settled exchanges present…
    expect(container.querySelectorAll('.chat-exchange').length).toBe(2);

    // …click reset → the transcript clears to the idle empty state.
    fireEvent.click(resetButton());
    await flush();

    expect(container.querySelectorAll('.chat-exchange').length).toBe(0);
    expect(screen.queryByText(/first plan/)).toBeNull();
    expect(screen.queryByText(/second failed/)).toBeNull();
    // The input is cleared + re-enabled — a fresh terminal ready for the next send.
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(input.value).toBe('');
    expect(input.disabled).toBe(false);
    // The reset control is gone once there's nothing to reset (empty, idle).
    expect(screen.queryByRole('button', { name: /new chat/i })).toBeNull();
  });

  // ── tr-aborts-in-flight-stream ──────────────────────────────────────────────
  it('tr-aborts-in-flight-stream: clicking reset mid-stream aborts the in-flight stream (the passed signal is aborted) and leaves no ghost reply in the cleared transcript', async () => {
    // Capture the signal and hold the stream open; deliver a terminal frame only AFTER reset, to prove
    // the aborted stream cannot settle a ghost reply into the cleared panel.
    let capturedSignal: AbortSignal | undefined;
    let deliverTerminal: () => void = () => {};
    apiMock.chatStream.mockImplementation(async (_intent, onEvent, signal) => {
      capturedSignal = signal;
      onEvent({ type: 'delta', text: 'partial…' });
      await new Promise<void>((resolve) => {
        // The seam tries to deliver a terminal frame when released — but the panel must ignore it
        // because the signal was aborted.
        deliverTerminal = () => {
          onEvent({ type: 'done', proposal: 'GHOST REPLY should not render', turns: 1 });
          resolve();
        };
      });
    });

    const { container } = render(<ChatPanel />);
    typeAndSubmit('start a stream');
    await flush();

    // Mid-stream: the tail entry exists and is streaming; the signal was passed and not yet aborted.
    expect(container.querySelectorAll('.chat-exchange').length).toBe(1);
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    // Click reset mid-stream → the signal is aborted and the transcript clears.
    fireEvent.click(resetButton());
    await flush();
    expect(capturedSignal?.aborted).toBe(true);
    expect(container.querySelectorAll('.chat-exchange').length).toBe(0);

    // The aborted seam now tries to deliver its terminal frame — it must NOT render into the cleared
    // transcript (no ghost reply, no zombie stream settling into a fresh panel).
    deliverTerminal();
    await flush();
    expect(screen.queryByText(/GHOST REPLY should not render/)).toBeNull();
    expect(container.querySelectorAll('.chat-exchange').length).toBe(0);
  });

  // ── tr-threads-abort-signal-through-api ─────────────────────────────────────
  it('tr-threads-abort-signal-through-api: api.chatStream is called WITH an AbortSignal (the third arg) on a normal send — the abort is threaded even when reset is never clicked', async () => {
    let settle: () => void = () => {};
    apiMock.chatStream.mockReturnValue(new Promise<void>((res) => { settle = res; }));

    render(<ChatPanel />);
    typeAndSubmit('a normal send');
    await flush();

    // The seam was called with a third argument that is an AbortSignal — the panel threads its
    // controller's signal into api.chatStream (which forwards it to fetch), so abort is always available.
    expect(apiMock.chatStream).toHaveBeenCalledTimes(1);
    const thirdArg = apiMock.chatStream.mock.calls[0]?.[2];
    expect(thirdArg).toBeInstanceOf(AbortSignal);
    expect((thirdArg as AbortSignal).aborted).toBe(false);

    settle();
    await flush();
  });
});
