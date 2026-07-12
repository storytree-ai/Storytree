// @vitest-environment jsdom
//
// The permanent lens's MINIMISE state machine (ADR-0188 dec 6, capability `library-lens-minimise`).
// The lens gains a bottom handle bar (grip + "Library" wordmark + Minimise control) visible in the
// expanded state; firing Minimise collapses the lens to just that handle bar (a stable `data-` state
// marker, the body hidden, a restore control, still no scrim); firing restore returns to expanded with
// the handed `bodySlot` content intact. The inc-8 bottom selection-preview strip
// (`library-drawer-selection-preview`, the in-drawer Open button) is RETIRED — its absence is asserted.
// The flag gate (`readLibraryOverlay`) survives untouched in BOTH states.
//
//   • lmin-handle-bar-present-when-expanded      — the handle bar + Minimise control are present when
//                                                  the lens renders (its default, expanded state).
//   • lmin-minimise-collapses-to-handle          — firing Minimise sets a stable `data-` state marker,
//                                                  hides the body, keeps the handle bar (now carrying a
//                                                  restore control), and still renders no scrim.
//   • lmin-restore-expands-with-body-intact      — firing restore returns to expanded and the SAME
//                                                  `bodySlot` content renders again (state kept, not
//                                                  unmounted/re-fetched).
//   • lmin-selection-preview-strip-retired       — no `library-drawer-selection-preview` section and no
//                                                  in-drawer Open button, even with a non-null selection.
//   • lmin-flag-gate-survives-both-states        — `readLibraryOverlay` still gates presence: with the
//                                                  flag the lens renders (expanded, then still present
//                                                  when minimised); without it nothing renders.
//
// Appearance (palette, grip look, wordmark styling, minimised silhouette, transition animation) is
// OWNER-ATTESTED (ADR-0188 dec 6/7 + ADR-0070) — not asserted here; only the stable `data-` state
// marker, presence/absence, and wiring are pinned.
//
// No backend seam (no `api`, no fetch, no socket, no DB); no agent / drive / model import (the
// modelPathBoundary.test.ts wall stays green).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LibraryDrawer } from './LibraryDrawer';
import type { SearchResult } from '../lib/librarySearch';

afterEach(cleanup);

const SELECTION: SearchResult = {
  id: 'widget-alpha',
  title: 'Widget Alpha',
  category: 'principle',
  source: 'asset',
};

describe('LibraryDrawer — minimise state machine (ADR-0188 dec 6)', () => {
  it('lmin-handle-bar-present-when-expanded: the handle bar and Minimise control are present when the lens renders (expanded by default)', () => {
    render(<LibraryDrawer search="?overlay=library" bodySlot="stub body" />);

    const lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('expanded');
    expect(screen.getByTestId('library-drawer-handle-bar')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Minimise' })).not.toBeNull();
  });

  it('lmin-minimise-collapses-to-handle: firing Minimise sets a stable data- state marker, hides the body, keeps the handle bar with a restore control, and renders no scrim', () => {
    render(<LibraryDrawer search="?overlay=library" bodySlot="stub body content" />);

    fireEvent.click(screen.getByRole('button', { name: 'Minimise' }));

    const lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('minimised');
    expect(screen.queryByText('stub body content')).toBeNull();
    expect(screen.getByTestId('library-drawer-handle-bar')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Restore' })).not.toBeNull();
    expect(document.querySelector('.library-drawer-scrim')).toBeNull();
    expect(screen.queryByTestId('library-drawer-scrim')).toBeNull();
  });

  it('lmin-restore-expands-with-body-intact: firing restore returns to expanded and the same bodySlot content renders again', () => {
    render(<LibraryDrawer search="?overlay=library" bodySlot="the handed body slot" />);

    // expanded: body present
    expect(screen.getByText('the handed body slot')).not.toBeNull();

    // minimise: body gone
    fireEvent.click(screen.getByRole('button', { name: 'Minimise' }));
    expect(screen.queryByText('the handed body slot')).toBeNull();

    // restore: same body back, state kept
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('expanded');
    expect(screen.getByText('the handed body slot')).not.toBeNull();
  });

  it('lmin-selection-preview-strip-retired: the inc-8 bottom selection-preview strip and its in-drawer Open button are gone, even with a non-null selection', () => {
    render(
      <LibraryDrawer
        search="?overlay=library"
        bodySlot="stub body"
        selection={SELECTION}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('library-drawer-selection-preview')).toBeNull();
    expect(document.querySelector('.library-drawer-selection-preview')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });

  it('lmin-flag-gate-survives-both-states: readLibraryOverlay still gates presence in both the expanded and the minimised state', () => {
    render(<LibraryDrawer search="?overlay=library" bodySlot="stub body" />);
    expect(screen.getByTestId('library-drawer')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Minimise' }));
    expect(screen.getByTestId('library-drawer')).not.toBeNull();
    cleanup();

    render(<LibraryDrawer search="" bodySlot="stub body" />);
    expect(screen.queryByTestId('library-drawer')).toBeNull();
  });
});
