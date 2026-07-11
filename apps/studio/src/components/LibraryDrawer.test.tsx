// @vitest-environment jsdom
//
// Behaviour test for the Library drawer SHELL (ADR-0185 dec 1 — the slide-down overlay that mounts
// behind `?overlay=library` and walks a closed → peek → dive state machine). This is the SHELL only:
// the finder (increment 2) and the artifact body (increment 4) are NOT built here — this cap proves
// the flag reader, the mode transitions, and that peek/dive each reserve an EMPTY, identifiable slot
// for those increments to mount into later. Pins GEOMETRY/BEHAVIOUR ONLY:
//
// The five spec contract ids (stories/library-tech-tree-overlay/library-drawer-shell.md) each lead
// a distinctly-named test (ADR-0122 — `storytree coverage library-drawer-shell` reads the names):
//
//   • the flag opens the drawer to peek; absent → closed (lds-flag-opens-drawer-to-peek, with the
//     pure reader pinned in isolation by the supporting ldw-reads-overlay-flag-* tests),
//   • peek overlays a LIVE (non-scrimmed) map, with an empty peek slot reserved for the finder
//     (lds-peek-overlays-live-map / ldw-peek-reserves-an-empty-slot),
//   • Esc and the close toggle both close from peek, clearing the `?overlay` flag through the
//     `onCommitSearch` callback — observed here, never a real navigation
//     (lds-esc-and-toggle-close-from-peek, ldw-close-toggle-clears-overlay-flag),
//   • a dive action collapses peek to a bar and reserves an empty dive-body slot, hiding the peek
//     slot (lds-dive-collapses-to-bar-and-reserves-body),
//   • Esc unwinds ONE level at a time: dive → peek → closed (lds-esc-unwinds-dive-to-peek,
//     ldw-esc-unwinds-peek-to-closed).
//
// The palette (forest-cozy vs neutral-admin), the slide animation, and the z-layering are the story's
// OWNER-ATTESTED UAT leg (ADR-0185 dec 5 / ADR-0070) — NO color / animation / z-index assertion lives
// in this file. No backend seam (no `api`, no fetch, no socket, no DB) — the shell holds none; no
// agent / drive / model import (the modelPathBoundary.test.ts wall stays green).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LibraryDrawer, readLibraryOverlay } from './LibraryDrawer';

afterEach(cleanup);

describe('readLibraryOverlay', () => {
  it('ldw-reads-overlay-flag-present: `?overlay=library` reads true', () => {
    expect(readLibraryOverlay('?overlay=library')).toBe(true);
  });

  it('ldw-reads-overlay-flag-present-with-other-params: true regardless of param order/company', () => {
    expect(readLibraryOverlay('?foo=bar&overlay=library')).toBe(true);
  });

  it('ldw-reads-overlay-flag-absent: no search string reads false', () => {
    expect(readLibraryOverlay('')).toBe(false);
  });

  it('ldw-reads-overlay-flag-other-value: an unrelated/wrong value reads false', () => {
    expect(readLibraryOverlay('?overlay=other')).toBe(false);
  });
});

describe('LibraryDrawer', () => {
  // ── ldw-closed-without-flag ───────────────────────────────────────────────────
  it('ldw-closed-without-flag: absent the flag, the shell renders nothing (the bare map)', () => {
    render(<LibraryDrawer search="" onCommitSearch={vi.fn()} />);
    expect(screen.queryByTestId('library-drawer')).toBeNull();
  });

  // ── lds-flag-opens-drawer-to-peek ─────────────────────────────────────────────
  it('lds-flag-opens-drawer-to-peek: `?overlay=library` opens the drawer straight to peek; absent, it stays closed', () => {
    render(<LibraryDrawer search="?overlay=library" onCommitSearch={vi.fn()} />);
    const root = screen.getByTestId('library-drawer');
    expect(root.getAttribute('data-mode')).toBe('peek');
    cleanup();
    render(<LibraryDrawer search="?overlay=other" onCommitSearch={vi.fn()} />);
    expect(screen.queryByTestId('library-drawer')).toBeNull();
  });

  // ── lds-peek-overlays-live-map ────────────────────────────────────────────────
  it('lds-peek-overlays-live-map: peek renders no dimming scrim — the map stays fully live', () => {
    render(<LibraryDrawer search="?overlay=library" onCommitSearch={vi.fn()} />);
    expect(screen.queryByTestId('library-drawer-scrim')).toBeNull();
  });

  // ── lds-esc-and-toggle-close-from-peek ────────────────────────────────────────
  it('lds-esc-and-toggle-close-from-peek: Esc and the close toggle both close from peek, clearing the ?overlay flag', () => {
    const onEscCommit = vi.fn();
    render(<LibraryDrawer search="?overlay=library" onCommitSearch={onEscCommit} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('library-drawer')).toBeNull();
    expect(onEscCommit).toHaveBeenCalledTimes(1);
    expect(onEscCommit).toHaveBeenCalledWith('');
    cleanup();

    const onToggleCommit = vi.fn();
    render(<LibraryDrawer search="?overlay=library" onCommitSearch={onToggleCommit} />);
    fireEvent.click(screen.getByRole('button', { name: /close library/i }));
    expect(screen.queryByTestId('library-drawer')).toBeNull();
    expect(onToggleCommit).toHaveBeenCalledTimes(1);
    expect(onToggleCommit).toHaveBeenCalledWith('');
  });

  // ── ldw-peek-reserves-an-empty-slot ───────────────────────────────────────────
  it('ldw-peek-reserves-an-empty-slot: peek reserves an empty slot for the finder (increment 2)', () => {
    render(<LibraryDrawer search="?overlay=library" onCommitSearch={vi.fn()} />);
    const slot = screen.getByTestId('library-drawer-peek-slot');
    expect(slot.textContent).toBe('');
    // the dive-body slot must not exist yet — only the open mode's own slot renders.
    expect(screen.queryByTestId('library-drawer-dive-slot')).toBeNull();
  });

  // ── lds-dive-collapses-to-bar-and-reserves-body ───────────────────────────────
  it('lds-dive-collapses-to-bar-and-reserves-body: diving collapses to a bar, hides the peek slot, and reserves an empty dive-body slot', () => {
    render(<LibraryDrawer search="?overlay=library" onCommitSearch={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /dive/i }));

    const root = screen.getByTestId('library-drawer');
    expect(root.getAttribute('data-mode')).toBe('dive');
    expect(screen.getByTestId('library-drawer-bar')).toBeTruthy();
    expect(screen.queryByTestId('library-drawer-peek-slot')).toBeNull();

    const diveSlot = screen.getByTestId('library-drawer-dive-slot');
    expect(diveSlot.textContent).toBe('');
    // no scrim in dive either — the reserved region is a layout reservation, not a modal takeover.
    expect(screen.queryByTestId('library-drawer-scrim')).toBeNull();
  });

  // ── lds-esc-unwinds-dive-to-peek ───────────────────────────────────────────────
  it('lds-esc-unwinds-dive-to-peek: Esc from dive returns to peek (one level, flag kept); a second Esc closes', () => {
    const onCommitSearch = vi.fn();
    render(<LibraryDrawer search="?overlay=library" onCommitSearch={onCommitSearch} />);
    fireEvent.click(screen.getByRole('button', { name: /dive/i }));
    expect(screen.getByTestId('library-drawer').getAttribute('data-mode')).toBe('dive');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByTestId('library-drawer').getAttribute('data-mode')).toBe('peek');
    expect(screen.getByTestId('library-drawer-peek-slot')).toBeTruthy();
    expect(screen.queryByTestId('library-drawer-dive-slot')).toBeNull();
    expect(onCommitSearch).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('library-drawer')).toBeNull();
    expect(onCommitSearch).toHaveBeenCalledTimes(1);
  });

  // ── ldw-esc-unwinds-peek-to-closed / ldw-esc-close-clears-overlay-flag ────────
  it('ldw-esc-unwinds-peek-to-closed: a second Esc closes the drawer entirely and clears the ?overlay flag', () => {
    const onCommitSearch = vi.fn();
    render(<LibraryDrawer search="?overlay=library" onCommitSearch={onCommitSearch} />);
    fireEvent.click(screen.getByRole('button', { name: /dive/i }));
    fireEvent.keyDown(window, { key: 'Escape' }); // dive -> peek
    fireEvent.keyDown(window, { key: 'Escape' }); // peek -> closed

    expect(screen.queryByTestId('library-drawer')).toBeNull();
    expect(onCommitSearch).toHaveBeenCalledTimes(1);
    // the overlay flag is gone; no other param existed to preserve.
    expect(onCommitSearch).toHaveBeenCalledWith('');
  });

  // ── ldw-close-toggle-clears-overlay-flag ──────────────────────────────────────
  it('ldw-close-toggle-clears-overlay-flag: the explicit close toggle closes from any open state and preserves unrelated params', () => {
    const onCommitSearch = vi.fn();
    render(<LibraryDrawer search="?overlay=library&foo=bar" onCommitSearch={onCommitSearch} />);
    fireEvent.click(screen.getByRole('button', { name: /dive/i }));
    expect(screen.getByTestId('library-drawer').getAttribute('data-mode')).toBe('dive');

    fireEvent.click(screen.getByRole('button', { name: /close library/i }));

    expect(screen.queryByTestId('library-drawer')).toBeNull();
    expect(onCommitSearch).toHaveBeenCalledTimes(1);
    expect(onCommitSearch).toHaveBeenCalledWith('?foo=bar');
  });
});
