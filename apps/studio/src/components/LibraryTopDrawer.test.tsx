// @vitest-environment jsdom
//
// ADR-0191 — the Library lens defaults to a persistent COLLAPSED TOP DRAWER HANDLE; lens state is
// URL-derived (`?overlay=library` present = expanded, absent = the collapsed handle). This is the
// net-new real.testFile for capability `library-top-drawer` — the M2 rework of `LibraryDrawer.tsx`
// that REPLACES the inc-9 `library-lens-minimise` component-local Minimise/Restore machine (ADR-0188
// dec 6) with a single `onToggle` seam the parent glue owns via `commitSearch`.
//
// Contract ids pinned here:
//   • ltd-collapsed-handle-by-default    — search="" renders the collapsed handle only (no body, no
//                                          scrim), data-lens-state="collapsed".
//   • ltd-flag-renders-expanded          — search="?overlay=library" renders expanded, body visible,
//                                          handle still present, data-lens-state="expanded".
//   • ltd-handle-toggle-fires-in-both-states — clicking the handle's toggle fires `onToggle` exactly
//                                          once in the collapsed state and once in the expanded
//                                          state; the component itself never mutates the URL/history.
//   • ltd-lens-state-is-url-derived      — re-rendering with a changed `search` flips
//                                          collapsed → expanded → collapsed, the handed `bodySlot`
//                                          intact on re-expand, and NO "Minimise"/"Restore" controls
//                                          in either state.
//   • ltd-no-scrim-either-state          — no full-screen dimming scrim in either state.
//   • ltd-flag-reader-survives           — the pure `readLibraryOverlay` reader's three cases.
//
// No backend seam (no `api`, no fetch, no socket, no DB); no agent / drive / model import (the
// modelPathBoundary.test.ts wall stays green). Layout/silhouette/animation are the story's
// operator-attested LOOK leg (ADR-0191 dec 3 + ADR-0070) — not asserted here.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readLibraryOverlay, LibraryDrawer } from './LibraryDrawer';

afterEach(cleanup);

describe('readLibraryOverlay — the pure flag reader survives', () => {
  it('ltd-flag-reader-survives: `?overlay=library` reads true; absent and other-value read false', () => {
    expect(readLibraryOverlay('?overlay=library')).toBe(true);
    expect(readLibraryOverlay('')).toBe(false);
    expect(readLibraryOverlay('?overlay=other')).toBe(false);
  });
});

describe('LibraryDrawer — collapsed top drawer handle by default (ADR-0191)', () => {
  it('ltd-collapsed-handle-by-default: search="" renders the collapsed handle only, no body, no scrim', () => {
    render(<LibraryDrawer search="" bodySlot="stub body content" />);

    const lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('collapsed');

    // The handle bar (carrying the "Library" wordmark) is present.
    expect(screen.getByTestId('library-drawer-handle-bar')).not.toBeNull();
    expect(screen.getByText('Library')).not.toBeNull();

    // The handed body is NOT rendered/visible.
    expect(screen.queryByTestId('library-drawer-body')).toBeNull();
    expect(screen.queryByText('stub body content')).toBeNull();

    // No dimming scrim.
    expect(document.querySelector('.library-drawer-scrim')).toBeNull();
    expect(screen.queryByTestId('library-drawer-scrim')).toBeNull();
  });
});

describe('LibraryDrawer — the flag renders expanded (ADR-0191)', () => {
  it('ltd-flag-renders-expanded: search="?overlay=library" renders expanded, body visible, handle survives', () => {
    render(<LibraryDrawer search="?overlay=library" bodySlot="stub body content" />);

    const lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('expanded');

    expect(screen.getByTestId('library-drawer-handle-bar')).not.toBeNull();
    expect(screen.getByText('stub body content')).not.toBeNull();
  });
});

describe('LibraryDrawer — the handle toggle fires onToggle, never the URL itself (ADR-0191)', () => {
  it('ltd-handle-toggle-fires-in-both-states: clicking the handle toggle fires onToggle exactly once, collapsed and expanded, with no history mutation', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const historyLengthBefore = window.history.length;

    const onToggleCollapsed = vi.fn();
    const { unmount } = render(
      <LibraryDrawer search="" bodySlot="stub body content" onToggle={onToggleCollapsed} />,
    );
    fireEvent.click(screen.getByTestId('library-drawer-toggle'));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    unmount();

    const onToggleExpanded = vi.fn();
    render(
      <LibraryDrawer search="?overlay=library" bodySlot="stub body content" onToggle={onToggleExpanded} />,
    );
    fireEvent.click(screen.getByTestId('library-drawer-toggle'));
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);

    // The component itself never mutates history/URL — only onToggle observes the click.
    expect(window.history.length).toBe(historyLengthBefore);
  });
});

describe('LibraryDrawer — lens state is URL-derived (ADR-0191 dec 2)', () => {
  it('ltd-lens-state-is-url-derived: a changed search flips collapsed -> expanded -> collapsed, body intact on re-expand, no Minimise/Restore controls', () => {
    const bodyContent = 'stub body content';
    const { rerender } = render(<LibraryDrawer search="" bodySlot={bodyContent} />);

    let lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('collapsed');
    expect(screen.queryByText(bodyContent)).toBeNull();

    rerender(<LibraryDrawer search="?overlay=library" bodySlot={bodyContent} />);
    lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('expanded');
    expect(screen.getByText(bodyContent)).not.toBeNull();

    rerender(<LibraryDrawer search="" bodySlot={bodyContent} />);
    lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('collapsed');
    expect(screen.queryByText(bodyContent)).toBeNull();

    rerender(<LibraryDrawer search="?overlay=library" bodySlot={bodyContent} />);
    lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('expanded');
    // Same handed body intact on re-expand.
    expect(screen.getByText(bodyContent)).not.toBeNull();

    // The retired component-local Minimise/Restore machine is absent in either state.
    expect(screen.queryByRole('button', { name: 'Minimise' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });
});

describe('LibraryDrawer — no dimming scrim in either state (ADR-0191, extends inc-8 posture)', () => {
  it('ltd-no-scrim-either-state: neither the collapsed nor the expanded state renders a scrim', () => {
    const { rerender } = render(<LibraryDrawer search="" bodySlot="stub body content" />);
    expect(document.querySelector('.library-drawer-scrim')).toBeNull();

    rerender(<LibraryDrawer search="?overlay=library" bodySlot="stub body content" />);
    expect(document.querySelector('.library-drawer-scrim')).toBeNull();
  });
});
