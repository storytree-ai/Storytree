// @vitest-environment jsdom
//
// Stage-1 red-green of the chat DOCK — the collapsible, draggable, bottom-anchored OVERLAY that wraps
// <ChatPanel/> on the forest map (owner feedback, leg-7 chip 1; ADR-0070 two-stage / ADR-0108 /
// ADR-0113 desktop). These pin GEOMETRY/BEHAVIOUR ONLY — the dock's appearance (its background,
// border, shadow, the look inside the native shell) is the `desktop` story's operator-attested UAT
// leg 7, witnessed by the owner, never a machine verdict here. So: NO color / pixel / shadow / radius
// assertion lives in this file — only fold/expand state, drag-resize mechanics (clamped), the
// fixed/bottom-anchored/above-the-map overlay geometry, and conversation-state survival across a fold.
//
//   • folded by default       — the body (and its input) is `hidden`, out of the a11y tree; toggle is
//                                aria-expanded="false" (cd-folded-by-default),
//   • expands on click         — the toggle flips aria-expanded → "true" and the ChatPanel input
//                                enters the a11y tree (cd-expands-on-click),
//   • collapses on click       — a second toggle click folds it back; the input leaves the a11y tree
//                                (cd-collapses-on-click),
//   • drag-resize (clamped)    — dragging the top-edge separator UP grows the dock, DOWN shrinks it,
//                                clamped to [MIN, MAX] (cd-drag-resizes-clamped),
//   • overlays the map         — the root is position:fixed, bottom:0, z-index numeric → it floats
//                                OVER the map rather than taking layout space (cd-overlays-the-map),
//   • state survives a fold    — typed text persists across fold→unfold, proving ChatPanel stays
//                                MOUNTED under `hidden` (cd-state-survives-fold).
//
// ChatDock is a THIN CLIENT wrapper: it imports only React + ChatPanel (no agent / drive / cli /
// orchestrator — modelPathBoundary.test.ts). ChatPanel reaches the chat route through the `api`
// streaming seam, so that seam is MOCKED here with a no-op chatStream — nothing streams; this test
// only exercises the dock chrome around a mounted panel. Drag uses MOUSE events (jsdom has no
// setPointerCapture). These are NET-NEW geometry/behaviour tests (the chip is owner feedback after
// the chat-panel capability shipped) — they carry their own cd-* ids; the cp-* streaming contracts
// stay covered by the untouched ChatPanel.test.tsx.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// ChatDock mounts ChatPanel, which imports the `api` streaming seam. Mock it with a no-op chatStream
// (a promise that never resolves) so a stray submit can't fetch / stream — the dock chrome is all we
// exercise. Mirrors ChatPanel.test.tsx's api mock.
const apiMock = vi.hoisted(() => ({
  chatStream: vi.fn<(intent: string, onEvent: (event: unknown) => void) => Promise<void>>(
    () => new Promise<void>(() => {}),
  ),
}));
vi.mock('../api', () => ({ api: apiMock }));

import { ChatDock } from './ChatDock';

/** Read the dock root and parse its inline height (px) — the geometry the drag mechanics move. */
function dockRoot(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.chat-dock');
  if (!el) throw new Error('.chat-dock root not found');
  return el as HTMLElement;
}
function heightPx(el: HTMLElement): number {
  return parseFloat(el.style.height || '0');
}

/** The single toggle bar (folded→click expands, expanded→click collapses). */
function toggle(): HTMLElement {
  return screen.getByRole('button', { name: /chat/i });
}

beforeEach(() => {
  apiMock.chatStream.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('ChatDock', () => {
  // ── cd-folded-by-default ─────────────────────────────────────────────────────
  it('cd-folded-by-default: renders folded — the chat input is out of the a11y tree (body hidden) and the toggle is aria-expanded="false"', () => {
    render(<ChatDock />);

    // The body is `hidden`, so the ChatPanel input is not in the accessibility tree.
    expect(screen.queryByRole('textbox')).toBeNull();
    // The toggle announces the collapsed state.
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  // ── cd-expands-on-click ──────────────────────────────────────────────────────
  it('cd-expands-on-click: clicking the toggle expands the dock — aria-expanded flips to "true" and the ChatPanel input enters the a11y tree', () => {
    render(<ChatDock />);

    fireEvent.click(toggle());

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    // The wrapped ChatPanel's intent textarea is now reachable.
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  // ── cd-collapses-on-click ────────────────────────────────────────────────────
  it('cd-collapses-on-click: a second toggle click collapses it — aria-expanded back to "false" and the input leaves the a11y tree', () => {
    render(<ChatDock />);

    fireEvent.click(toggle()); // expand
    expect(screen.getByRole('textbox')).toBeTruthy();

    fireEvent.click(toggle()); // collapse
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  // ── cd-drag-resizes-clamped ──────────────────────────────────────────────────
  it('cd-drag-resizes-clamped: dragging the top-edge separator UP grows the dock and DOWN shrinks it, clamped to [MIN, MAX]', () => {
    const { container } = render(<ChatDock />);
    fireEvent.click(toggle()); // must be expanded to have a height + the resize handle

    const root = dockRoot(container);
    const start = heightPx(root);
    expect(start).toBe(320); // the default expanded height

    const handle = screen.getByRole('separator', { name: /resize/i });

    // Drag UP by 100px (smaller clientY) → the dock grows by ~100px.
    fireEvent.mouseDown(handle, { clientY: 600 });
    fireEvent.mouseMove(window, { clientY: 500 });
    fireEvent.mouseUp(window);
    const grown = heightPx(dockRoot(container));
    expect(grown).toBeGreaterThan(start);
    expect(Math.abs(grown - (start + 100))).toBeLessThanOrEqual(2);

    // Drag DOWN by 80px (larger clientY) → the dock shrinks.
    fireEvent.mouseDown(handle, { clientY: 500 });
    fireEvent.mouseMove(window, { clientY: 580 });
    fireEvent.mouseUp(window);
    const shrunk = heightPx(dockRoot(container));
    expect(shrunk).toBeLessThan(grown);
    expect(Math.abs(shrunk - (grown - 80))).toBeLessThanOrEqual(2);

    // An extreme DOWN drag clamps at the floor (never below MIN = 160).
    fireEvent.mouseDown(handle, { clientY: 0 });
    fireEvent.mouseMove(window, { clientY: 100000 });
    fireEvent.mouseUp(window);
    const floored = heightPx(dockRoot(container));
    expect(floored).toBeGreaterThanOrEqual(160);
    expect(floored).toBeLessThanOrEqual(shrunk);

    // An extreme UP drag clamps at the ceiling — it grows from the floor but stays bounded
    // (does not run away past the viewport-derived MAX).
    fireEvent.mouseDown(handle, { clientY: 100000 });
    fireEvent.mouseMove(window, { clientY: 0 });
    fireEvent.mouseUp(window);
    const ceiled = heightPx(dockRoot(container));
    expect(ceiled).toBeGreaterThan(floored);
    const innerH = typeof window !== 'undefined' ? window.innerHeight : 768;
    expect(ceiled).toBeLessThanOrEqual(Math.max(160, innerH)); // bounded, not unbounded
  });

  // ── cd-overlays-the-map ──────────────────────────────────────────────────────
  it('cd-overlays-the-map: the root is a fixed, bottom-anchored overlay above the map (position:fixed, bottom:0, numeric z-index)', () => {
    const { container } = render(<ChatDock />);
    const root = dockRoot(container);

    // Fixed + bottom-anchored: it floats over the map rather than consuming layout space.
    expect(root.style.position).toBe('fixed');
    expect(root.style.bottom).toBe('0px');
    expect(root.style.left).toBe('0px');
    expect(root.style.right).toBe('0px');
    // Stacked above the map.
    expect(Number(root.style.zIndex)).toBeGreaterThan(0);
  });

  // ── cd-state-survives-fold ───────────────────────────────────────────────────
  it('cd-state-survives-fold: typed conversation state persists across fold → unfold (ChatPanel stays mounted under `hidden`)', () => {
    render(<ChatDock />);

    fireEvent.click(toggle()); // expand
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'half-typed intent' } });
    expect(input.value).toBe('half-typed intent');

    fireEvent.click(toggle()); // fold
    expect(screen.queryByRole('textbox')).toBeNull(); // out of the a11y tree while folded

    fireEvent.click(toggle()); // unfold
    // Same mounted panel → the typed text is still there (no remount cleared it).
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('half-typed intent');
  });
});
