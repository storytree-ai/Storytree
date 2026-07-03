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

// The streaming seam: api.chatStream(intent, onEvent) POSTs /api/chat, parses each SSE frame, and
// calls onEvent per typed event. It resolves when the stream ends. The mock lets each test script
// the frames (spawn frames interleaved with the terminal frame).
const apiMock = vi.hoisted(() => ({
  chatStream: vi.fn<(intent: string, onEvent: (event: ChatEvent) => void) => Promise<void>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

// The real guard, imported to prove the union WIDENED — a `spawn` frame off the wire is no longer
// defensively ignored (at HEAD isChatEvent returns false for `t === 'spawn'`). Imported from the
// same module the mock replaces for the panel; vitest still resolves the real source for a direct
// import in the test file (the mock only intercepts the module the COMPONENT imports at runtime is
// insufficient — so we assert the guard behaviour indirectly via the RENDER below, which is the
// runtime red). To assert the guard directly without fighting the mock, we re-derive its acceptance
// from the render: a `spawn` frame that reaches the panel renders a line ONLY if the guard let it
// through the api's own drainFrames. Here in the component test the seam is mocked, so the guard's
// acceptance is proven by cps-panel-renders-the-spawn-line (the line appears) — the union widening is
// what makes that possible. We ALSO assert the union shape statically below (a compile-time + textual
// check) so cps-wire-union-accepts-the-spawn-frame stands on its own.

import { ChatPanel } from './ChatPanel';

/** Flush the async chain a submit/timer kicked off. */
const flush = (): Promise<void> => act(async () => {});

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
  apiMock.chatStream.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

  // ── cps-panel-renders-the-spawn-line ────────────────────────────────────────
  it('cps-panel-renders-the-spawn-line: a started frame renders the "🔧 spawning <role> for <unitId>…" line and the matching finished frame resolves it to "✓ <role> finished"', async () => {
    // Hold the stream open between the started and finished spawn frames so we can observe the
    // in-flight "spawning…" line BEFORE the finish resolves it.
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => { release = r; });
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'spawn', phase: 'started', role: 'story-author', unitId: 'my-new-story' });
      await gate; // hold open — the started line is live here
      onEvent({ type: 'spawn', phase: 'finished', role: 'story-author', unitId: 'my-new-story' });
      onEvent({ type: 'done', proposal: 'authored the story', turns: 1 });
    });

    render(<ChatPanel />);
    typeAndSubmit('write a story for me');
    await flush();

    // The started line is rendered (the guard accepted the frame; at HEAD it is rejected → absent → red).
    expect(screen.getByText(/spawning story-author for my-new-story/i)).toBeTruthy();

    // Release → the finished frame resolves the line to the "finished" form.
    release();
    await flush();

    expect(screen.getByText(/story-author finished/i)).toBeTruthy();
  });

  it('cps-panel-renders-the-spawn-line (sibling: an ok:false finish resolves to an honest failed line): a finished frame with ok:false resolves to "✗ <role> failed"', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'spawn', phase: 'started', role: 'builder', unitId: 'some-cap' });
      onEvent({ type: 'spawn', phase: 'finished', role: 'builder', unitId: 'some-cap', ok: false });
      onEvent({ type: 'done', proposal: 'done', turns: 1 });
    });

    render(<ChatPanel />);
    typeAndSubmit('build the cap');
    await flush();

    // An honest failed resolution — never a forged success.
    expect(screen.getByText(/builder failed/i)).toBeTruthy();
  });

  // ── cps-spawn-frame-is-non-terminal ─────────────────────────────────────────
  it('cps-spawn-frame-is-non-terminal: a spawn frame appends a line and does NOT terminate the stream — a done frame after it still renders its proposal; and the panel imports no agent/drive/model', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'spawn', phase: 'started', role: 'story-author', unitId: 'a-story' });
      onEvent({ type: 'spawn', phase: 'finished', role: 'story-author', unitId: 'a-story' });
      // A terminal done frame AFTER the spawn frames — the spawn frame was non-terminal (like a delta).
      onEvent({ type: 'done', proposal: 'The proposal survived the spawn frames.', turns: 2 });
    });

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
