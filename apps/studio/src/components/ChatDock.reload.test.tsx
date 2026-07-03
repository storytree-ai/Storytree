// @vitest-environment jsdom
//
// Stage-1 red-green of the LIVE STORY ISLAND REFRESH (live-story-island-refresh capability, ADR-0070
// two-stage / ADR-0137). When the chat surface sees a spawn-FINISHED frame for a STORY-AUTHOR (a new
// story was authored to stories/, so the tree changed), ChatDock invokes an injected reloadTree
// callback so the just-authored island appears live on the forest map. The signal rides the plain-JSON
// `spawn` frame (capability 3's wire shape) up from ChatPanel through a plain React callback prop —
// never a @storytree/drive import (ADR-0004 / the modelPathBoundary wall).
//
// These pin GEOMETRY/BEHAVIOUR ONLY: the callback fires EXACTLY once on a story-author finish, and NOT
// on a builder finish nor a started frame. Whether the island actually APPEARS on the map, live, is the
// story's operator-attested UAT leg 6 (ADR-0070) — witnessed by the owner, never a machine map-geometry
// verdict here. NO map/island presence/position/look assertion lives in this file.
//
// The `api` seam is MOCKED — ChatDock mounts ChatPanel, which reaches the chat route through the `api`
// streaming seam; we script the spawn frames through it and spy on the injected reloadTree prop. No real
// fetch/socket/SDK/DB/Electron, no real TreeView map render. Each test LEADS with its contract id so
// `storytree coverage` reports 3/3 (ADR-0122).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// Local mirror of the /api/chat SSE `data:` frames, INCLUDING the `spawn` frame (capability 3's wire
// shape). Plain JSON, re-declared here — never a drive import.
type ChatEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; proposal: string; costUsd?: number; turns?: number }
  | { type: 'error'; error: string }
  | { type: 'refused'; reason: string }
  | { type: 'spawn'; phase: 'started' | 'finished'; role: string; unitId: string; ok?: boolean };

// Mock the api streaming seam so we can script the spawn frames the panel/dock observe.
const apiMock = vi.hoisted(() => ({
  chatStream: vi.fn<(intent: string, onEvent: (event: ChatEvent) => void) => Promise<void>>(),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { ChatDock } from './ChatDock';

/** Flush the async chain a submit/timer kicked off. */
const flush = (): Promise<void> => act(async () => {});

/** Expand the dock (folded by default) and submit an intent so the scripted stream runs. */
function expandAndSubmit(intent: string): void {
  // The dock is folded by default; expand it so ChatPanel's input is in the a11y tree.
  fireEvent.click(screen.getByRole('button', { name: /expand chat/i }));
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: intent } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** True iff `src` STATICALLY or DYNAMICALLY imports `mod` — mirrors modelPathBoundary.test.ts so a
 *  bare mention in a comment is not a false positive. */
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

describe('ChatDock — live story island refresh (live-story-island-refresh)', () => {
  // ── lsr-story-author-finish-triggers-reload ─────────────────────────────────
  it('lsr-story-author-finish-triggers-reload: a story-author phase:"finished" frame fires the injected reloadTree callback EXACTLY once', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      onEvent({ type: 'spawn', phase: 'started', role: 'story-author', unitId: 'fresh-story' });
      onEvent({ type: 'spawn', phase: 'finished', role: 'story-author', unitId: 'fresh-story' });
      onEvent({ type: 'done', proposal: 'authored a story', turns: 1 });
    });

    const spy = vi.fn();
    render(<ChatDock onReloadTree={spy} />);
    expandAndSubmit('write me a story');
    await flush();

    // A story-author finish authored a new story → the map must reload, exactly once.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // ── lsr-no-reload-on-builder-or-started ─────────────────────────────────────
  it('lsr-no-reload-on-builder-or-started: a builder finish and a started frame do NOT fire reloadTree — the reload is earned only by a real tree change', async () => {
    apiMock.chatStream.mockImplementation(async (_intent, onEvent) => {
      // A story-author STARTED frame — nothing authored yet.
      onEvent({ type: 'spawn', phase: 'started', role: 'story-author', unitId: 'not-yet' });
      // A BUILDER finish — it drove an existing node, authored no new story.
      onEvent({ type: 'spawn', phase: 'started', role: 'builder', unitId: 'some-cap' });
      onEvent({ type: 'spawn', phase: 'finished', role: 'builder', unitId: 'some-cap' });
      onEvent({ type: 'done', proposal: 'built the cap', turns: 1 });
    });

    const spy = vi.fn();
    render(<ChatDock onReloadTree={spy} />);
    expandAndSubmit('build the cap');
    await flush();

    // Neither a started frame nor a builder finish is a tree change → no reload.
    expect(spy).not.toHaveBeenCalled();
  });

  // ── lsr-reload-is-a-plain-callback-no-drive-import ──────────────────────────
  it('lsr-reload-is-a-plain-callback-no-drive-import: ChatDock imports only React + ChatPanel (no drive/agent/model) and the reload is a plain callback prop', () => {
    // The reload is a plain React callback prop — ChatDock imports no agent/drive/cli/orchestrator
    // (modelPathBoundary.test.ts stays green); TreeView owns reloadTree and passes it down.
    const dockSrc = readFileSync(path.join(HERE, 'ChatDock.tsx'), 'utf8');
    for (const mod of ['@storytree/agent', '@storytree/drive', '@storytree/cli', '@storytree/orchestrator']) {
      expect(importsModule(dockSrc, mod)).toBe(false);
    }
    // The dock accepts the plain callback prop the wiring rides on.
    expect(dockSrc).toMatch(/onReloadTree/);

    // And behaviourally: rendering the dock WITHOUT the prop does not throw — the prop is optional, a
    // plain callback the parent (TreeView) injects. (No stream is scripted here, so no reload fires.)
    apiMock.chatStream.mockResolvedValue(undefined);
    expect(() => render(<ChatDock />)).not.toThrow();
  });
});
