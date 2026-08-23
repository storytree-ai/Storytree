// @vitest-environment jsdom
//
// Stage-1 red-green of the chat panel's SPAWN LINE (chat-panel-spawn-render capability, ADR-0070
// two-stage / ADR-0137). A new NON-terminal SSE frame flows over /api/chat when the orchestrator
// session spawns a sub-agent (a story-author or a builder):
//
//   { type: "spawn", phase: "started" | "finished", role: "story-author" | "builder",
//     unitId: string, ok?: boolean }
//
// It is PLAIN JSON — the wire shape is declared LOCALLY in api.ts (a ChatSpawnEvent on the ChatEvent
// union + the isChatEvent guard), NOT imported from @storytree/drive (ADR-0004 / the modelPathBoundary
// wall; the same move the delta/done/error/refused frames make). These tests pin GEOMETRY/BEHAVIOUR
// ONLY — the guard accepts the frame, the panel renders the spawn line ("🔧 spawning <role> for
// <unitId>…") and resolves it on the matching finish ("✓ <role> finished"), and a spawn frame is
// NON-terminal (a later `done` frame still renders its proposal). NO appearance/visual/legibility
// assertion lives here — the line's LOOK inside the native shell is the story's operator-attested UAT
// leg 5 (ADR-0070), witnessed by the owner, never a machine verdict here.
//
// The `api` seam is MOCKED (no fetch, no socket, no SDK, no DB, no Electron); fake timers drive the
// started→finished transition deterministically. Each test LEADS with its contract id so
// `storytree coverage` reports 3/3 (ADR-0122).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// The local mirror of the /api/chat SSE `data:` frames (the cross-boundary wire shape). Re-declared
// here — as ChatPanel.test.tsx does — so the scripted seam yields exactly what the route emits,
// INCLUDING the new `spawn` frame. This test never imports @storytree/drive; the type is plain JSON.
type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; proposal: string; costUsd?: number; turns?: number }
  | { type: 'error'; error: string }
  | { type: 'refused'; reason: string }
  | { type: 'spawn'; phase: 'started' | 'finished'; role: string; unitId: string; ok?: boolean };

import { HttpDouble, installHttpDouble, sseChannel, type SseChannel } from '../test/httpDouble';

// THE SEAM IS THE TRANSPORT, NOT THE MODULE (anti-slop-adoption-arc inc-06, `no-module-mocking`),
// and on THIS suite that is not a tidy-up — it is what lets the file test the thing it is named for.
//
// The point of the unit is that api.ts's `isChatEvent` guard WIDENED to accept `type: 'spawn'`;
// before, the guard dropped the frame. While `../api` was module-mocked the guard never ran, so the
// suite could only reach it two indirect ways, and its own header said so at length: a TEXTUAL scan
// of api.ts for `t === 'spawn'`, plus an inference from the render. Both are proxies. A spawn frame
// pushed as SSE BYTES now travels through the real `drainFrames` and the real guard, so
// "the panel rendered the spawn line" means the guard accepted it — which is the actual claim.
const CHAT = '/api/chat';

let http: HttpDouble;
let channels: SseChannel[];

/** Marks a send whose stream is HELD OPEN for the test to drive and close. */
const HOLD = null;

/** Script what each successive `POST /api/chat` streams back; the last entry repeats. */
const scriptSends = (...sends: Array<readonly ChatEvent[] | typeof HOLD>): void => {
  let n = 0;
  http.post(CHAT, () => {
    const script = sends.length === 0 ? HOLD : sends[Math.min(n, sends.length - 1)];
    n += 1;
    const channel = sseChannel();
    channels.push(channel);
    if (script !== HOLD && script !== undefined) {
      for (const frame of script) channel.push(frame);
      channel.close();
    }
    return channel.response;
  });
};

/** The nth send's live stream (0-based). */
const channelFor = (index: number): SseChannel => {
  const channel = channels[index];
  if (channel === undefined) throw new Error(`no send #${index} yet (${channels.length} so far)`);
  return channel;
};

import { ChatPanel } from './ChatPanel';

/** Flush the async chain a submit/timer kicked off. */
const flush = (): Promise<void> =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

/** Type the intent into the panel's input and submit via the Send icon button. */
function typeAndSubmit(intent: string): void {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: intent } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_SRC = readFileSync(path.join(HERE, '..', 'api.ts'), 'utf8');

/** True iff `src` STATICALLY or DYNAMICALLY imports `mod` (an `import … from '<mod>'` or
 *  `import('<mod>')`) — mirrors modelPathBoundary.test.ts so a bare mention in a COMMENT (e.g.
 *  "never imported from @storytree/drive") is not a false positive. Bare-substring scanning the
 *  thin-client wall would flag the doc prose; the import regex is the honest check. */
function importsModule(src: string, mod: string): boolean {
  const esc = mod.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(`(from\\s*['"]${esc}(/[^'"]*)?['"]|import\\(\\s*['"]${esc}(/[^'"]*)?['"])`);
  return re.test(src);
}

beforeEach(() => {
  vi.useFakeTimers();
  http = installHttpDouble();
  channels = [];
});

afterEach(() => {
  cleanup();
  for (const channel of channels) channel.close();
  http.uninstall();
  vi.useRealTimers();
});

/** A frame the `ChatEvent` union does NOT carry — widened here so the ONE narrowing below is a
 *  legal downcast, and the guard's RUNTIME rejection is still what is being proved. */
const UNKNOWN_FRAME: Record<string, unknown> = {
  type: 'gibberish',
  role: 'story-author',
  unitId: 'rejected-unit',
};

describe('ChatPanel — spawn line (chat-panel-spawn-render)', () => {
  // ── cps-wire-union-accepts-the-spawn-frame ──────────────────────────────────
  it('cps-wire-union-accepts-the-spawn-frame: the ChatEvent union carries a ChatSpawnEvent and isChatEvent accepts a spawn frame — locally declared plain JSON, NOT a @storytree/drive import', () => {
    // The wire shape is declared LOCALLY in api.ts (not imported from @storytree/drive). Assert the
    // module source declares a spawn variant on its ChatEvent union + the isChatEvent guard accepts
    // `t === 'spawn'`. (A source scan keeps this contract independent of the component render below —
    // it is the union widening itself, ADR-0004 thin-client discipline.)
    expect(API_SRC).toMatch(/ChatSpawnEvent/);
    // The union declares the spawn frame's fields (phase / role / unitId) — the wire shape.
    expect(API_SRC).toMatch(/type:\s*'spawn'/);
    // The guard accepts a spawn frame — no longer defensively ignored.
    expect(API_SRC).toMatch(/t === 'spawn'/);
    // And the type is NOT IMPORTED from the forbidden drive package (the thin-client wall) — a bare
    // mention in a comment is fine; a real import is the breach.
    expect(importsModule(API_SRC, '@storytree/drive')).toBe(false);
  });

  // ── cps-wire-union-accepts-the-spawn-frame, BEHAVIOURALLY ───────────────────
  it('cps-wire-union-accepts-the-spawn-frame (behavioural): the REAL isChatEvent guard lets a spawn frame off the wire through, and still drops an unknown type', async () => {
    // This case could not exist while `../api` was module-mocked: the guard never ran, so the
    // acceptance above could only be scanned for in the source. Here both frames arrive as SSE
    // bytes and the guard is the only thing that separates them.
    scriptSends([
      { type: 'spawn', phase: 'started', role: 'story-author', unitId: 'accepted-unit' },
      // A frame the union does NOT carry — it must be dropped, not rendered and not fatal.
      UNKNOWN_FRAME as ChatEvent,
      { type: 'done', proposal: 'settled', turns: 1 },
    ]);

    render(<ChatPanel />);
    typeAndSubmit('drive it');
    await flush();

    expect(screen.getByText(/spawning story-author for accepted-unit/i)).toBeTruthy();
    expect(screen.queryByText(/rejected-unit/)).toBeNull();
    // And the unknown frame did not kill the stream — the terminal frame still settled it.
    expect(screen.getByText(/settled/)).toBeTruthy();
  });

  // ── cps-panel-renders-the-spawn-line ────────────────────────────────────────
  it('cps-panel-renders-the-spawn-line: a started frame renders the "🔧 spawning <role> for <unitId>…" line and the matching finished frame resolves it to "✓ <role> finished"', async () => {
    // Hold the stream open between the started and finished spawn frames so we can observe the
    // in-flight "spawning…" line BEFORE the finish resolves it.
    scriptSends(HOLD);
    const release = (): void => {
      channelFor(0).push({ type: 'spawn', phase: 'finished', role: 'story-author', unitId: 'my-new-story' });
      channelFor(0).push({ type: 'done', proposal: 'authored the story', turns: 1 });
      channelFor(0).close();
    };

    render(<ChatPanel />);
    typeAndSubmit('write a story for me');
    await flush();
    channelFor(0).push({ type: 'spawn', phase: 'started', role: 'story-author', unitId: 'my-new-story' });
    await flush();

    // The started line is rendered (the guard accepted the frame; at HEAD it is rejected → absent → red).
    expect(screen.getByText(/spawning story-author for my-new-story/i)).toBeTruthy();

    // Release → the finished frame resolves the line to the "finished" form.
    release();
    await flush();

    expect(screen.getByText(/story-author finished/i)).toBeTruthy();
  });

  it('cps-panel-renders-the-spawn-line (sibling: an ok:false finish resolves to an honest failed line): a finished frame with ok:false resolves to "✗ <role> failed"', async () => {
    scriptSends([
      { type: 'spawn', phase: 'started', role: 'builder', unitId: 'some-cap' },
      { type: 'spawn', phase: 'finished', role: 'builder', unitId: 'some-cap', ok: false },
      { type: 'done', proposal: 'done', turns: 1 },
    ]);

    render(<ChatPanel />);
    typeAndSubmit('build the cap');
    await flush();

    // An honest failed resolution — never a forged success.
    expect(screen.getByText(/builder failed/i)).toBeTruthy();
  });

  // ── cps-spawn-frame-is-non-terminal ─────────────────────────────────────────
  it('cps-spawn-frame-is-non-terminal: a spawn frame appends a line and does NOT terminate the stream — a done frame after it still renders its proposal; and the panel imports no agent/drive/model', async () => {
    scriptSends([
      { type: 'spawn', phase: 'started', role: 'story-author', unitId: 'a-story' },
      { type: 'spawn', phase: 'finished', role: 'story-author', unitId: 'a-story' },
      // A terminal done frame AFTER the spawn frames — the spawn frame was non-terminal (like a delta).
      { type: 'done', proposal: 'The proposal survived the spawn frames.', turns: 2 },
    ]);

    const { container } = render(<ChatPanel />);
    typeAndSubmit('do the work');
    await flush();

    // The spawn frame did NOT terminate the stream: the done proposal still renders.
    expect(screen.getByText(/The proposal survived the spawn frames\./)).toBeTruthy();
    expect(container.querySelector('.chat-proposal')).toBeTruthy();
    // And the spawn line rode the transcript alongside it (non-terminal accumulation).
    expect(screen.getByText(/story-author finished/i)).toBeTruthy();

    // The thin-client wall holds: the panel source IMPORTS no agent/drive/model path (a bare mention
    // in the file's doc comment is fine — modelPathBoundary.test.ts uses the same import-only check).
    const panelSrc = readFileSync(path.join(HERE, 'ChatPanel.tsx'), 'utf8');
    for (const mod of ['@storytree/agent', '@storytree/drive', '@storytree/cli', '@storytree/orchestrator']) {
      expect(importsModule(panelSrc, mod)).toBe(false);
    }
  });
});
