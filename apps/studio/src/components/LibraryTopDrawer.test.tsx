// @vitest-environment jsdom
//
// The Library top drawer (capability `library-top-drawer`, ADR-0191 as POLISHED by ADR-0193),
// REPLACING the prior version of this same real.testFile written against ADR-0191 alone (the
// inc-10 cap-replacement precedent). The permanent lens defaults to a SLIM, TITLE-LESS collapsed
// top drawer handle; lens state is URL-derived (`?overlay=library` present => expanded, absent =>
// collapsed); the single terminal-dock ARROW toggle fires an `onToggle` seam the parent glue owns
// (the component never writes the URL/history itself, and the Expand/Collapse WORD buttons
// retire); the "Library" wordmark renders EXPANDED-ONLY (ADR-0193 dec 2); the expanded drawer
// gains a drag-resize separator (ADR-0193 dec 1); the ADR-0188 dec-6 component-local
// Minimise/Restore machine and the #715 corner toggle stay retired; the map stays live beneath
// with no scrim in either state; the pure `readLibraryOverlay` reader survives.
//
// This is a REGRESSION test authored against the CURRENT `LibraryDrawer.tsx`, which still renders
// the "Library" wordmark unconditionally, an Expand/Collapse WORD toggle button (not a labelled
// arrow icon), and no drag-resize separator — it is expected to be RED here for real behavioural
// reasons (not a missing symbol / import error), and GREEN once the component is polished to
// ADR-0193.
//
// Contract ids (per ADR-0122, `storytree coverage library-top-drawer` reads the names):
//   ltd-collapsed-handle-by-default        — search="" renders the slim, title-less collapsed handle.
//   ltd-flag-renders-expanded              — the flag renders expanded, with the wordmark present.
//   ltd-handle-toggle-fires-in-both-states — the single arrow toggle fires onToggle; no word button;
//                                             no URL/history mutation.
//   ltd-drag-resize-expanded-only          — a drag-resize separator, expanded-only, changes height.
//   ltd-lens-state-is-url-derived          — a changed `search` flips state; body kept; no
//                                             Minimise/Restore controls in either state.
//   ltd-no-scrim-either-state              — no dimming scrim in either state.
//   ltd-flag-reader-survives               — the pure `readLibraryOverlay` reader survives.
//
// No backend seam (no `api`, no fetch, no socket, no DB); no agent / drive / model import (the
// modelPathBoundary.test.ts wall stays green). The full-width / half-screen layout, the
// half-screen default proportion, and the handle silhouette are the story's OWNER-ATTESTED LOOK
// leg (ADR-0070) — deliberately not asserted here.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LibraryDrawer, readLibraryOverlay } from './LibraryDrawer';

afterEach(cleanup);

describe('LibraryDrawer — top drawer defaults to a slim, title-less collapsed handle (ADR-0191/0193)', () => {
  it('ltd-collapsed-handle-by-default: search="" renders the collapsed handle — no wordmark, no body, no scrim', () => {
    render(<LibraryDrawer search="" bodySlot="stub body content" />);

    const lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('collapsed');

    // The handle bar (and its toggle) is present in the collapsed state...
    expect(screen.getByTestId('library-drawer-handle-bar')).not.toBeNull();
    // ...but the "Library" wordmark/title belongs to the EXPANDED state only (ADR-0193 dec 2).
    expect(screen.queryByText('Library')).toBeNull();

    // The handed body is not rendered while collapsed.
    expect(screen.queryByText('stub body content')).toBeNull();
    expect(screen.queryByTestId('library-drawer-body')).toBeNull();

    // No dimming scrim.
    expect(document.querySelector('.library-drawer-scrim')).toBeNull();
  });

  it('ltd-flag-renders-expanded: `?overlay=library` renders expanded, with the body, the handle, and the wordmark', () => {
    render(<LibraryDrawer search="?overlay=library" bodySlot="stub body content" />);

    const lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-lens-state')).toBe('expanded');

    expect(screen.getByText('stub body content')).not.toBeNull();
    expect(screen.getByTestId('library-drawer-handle-bar')).not.toBeNull();
    // The expanded-only title (ADR-0193 dec 2).
    expect(screen.getByText('Library')).not.toBeNull();
  });
});

describe('LibraryDrawer — the single arrow toggle fires onToggle, no word button, no URL write (ADR-0193 dec 2)', () => {
  it('ltd-handle-toggle-fires-in-both-states: the arrow toggle fires onToggle once from collapsed and once from expanded; no word button; no history mutation', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    // Collapsed: no "Expand"/"Collapse" word button anywhere.
    const onToggleCollapsed = vi.fn();
    const { unmount: unmountCollapsed } = render(
      <LibraryDrawer search="" onToggle={onToggleCollapsed} />,
    );
    expect(screen.queryByRole('button', { name: 'Expand' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull();

    const collapsedToggle = screen.queryByLabelText('expand library');
    expect(collapsedToggle).not.toBeNull();
    fireEvent.click(collapsedToggle as Element);
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    unmountCollapsed();

    // Expanded: same single arrow affordance, opposite accessible label, still no word button.
    const onToggleExpanded = vi.fn();
    render(<LibraryDrawer search="?overlay=library" onToggle={onToggleExpanded} />);
    expect(screen.queryByRole('button', { name: 'Expand' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull();

    const expandedToggle = screen.queryByLabelText('collapse library');
    expect(expandedToggle).not.toBeNull();
    fireEvent.click(expandedToggle as Element);
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);

    // The component itself never mutates the URL/history — only the callback fires.
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();

    pushStateSpy.mockRestore();
    replaceStateSpy.mockRestore();
  });
});

describe('LibraryDrawer — a drag-resize separator, expanded-only (the terminal dock idiom)', () => {
  it('ltd-drag-resize-expanded-only: the expanded drawer has a drag separator that changes the inline height; the collapsed drawer has neither', () => {
    render(<LibraryDrawer search="?overlay=library" bodySlot="stub body content" />);

    const lens = screen.getByTestId('library-drawer');
    const separator = screen.queryByRole('separator');
    expect(separator).not.toBeNull();

    const heightBefore = (lens as HTMLElement).style.height;
    fireEvent.mouseDown(separator as Element, { clientY: 100 });
    fireEvent.mouseMove(document, { clientY: 250 });
    fireEvent.mouseUp(document);

    expect((lens as HTMLElement).style.height).not.toBe(heightBefore);

    cleanup();

    render(<LibraryDrawer search="" bodySlot="stub body content" />);
    const collapsedLens = screen.getByTestId('library-drawer');
    expect(screen.queryByRole('separator')).toBeNull();
    expect((collapsedLens as HTMLElement).style.height).toBe('');
  });
});

describe('LibraryDrawer — lens state is URL-derived; the Minimise/Restore machine is retired', () => {
  it('ltd-lens-state-is-url-derived: a changed `search` flips collapsed -> expanded -> collapsed -> expanded, keeping the handed body', () => {
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
    // The SAME handed body is intact on re-expand — state is kept via the URL, not lost.
    expect(screen.getByText(bodyContent)).not.toBeNull();

    // The retired component-local Minimise/Restore machine is absent in either state.
    expect(screen.queryByRole('button', { name: 'Minimise' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
    expect(screen.queryByText('Minimise')).toBeNull();
    expect(screen.queryByText('Restore')).toBeNull();
  });
});

describe('LibraryDrawer — no dimming scrim in either state (the permanent-lens posture extended)', () => {
  it('ltd-no-scrim-either-state: no scrim renders collapsed or expanded', () => {
    const { rerender } = render(<LibraryDrawer search="" />);
    expect(document.querySelector('.library-drawer-scrim')).toBeNull();
    expect(screen.queryByTestId('library-drawer-scrim')).toBeNull();

    rerender(<LibraryDrawer search="?overlay=library" />);
    expect(document.querySelector('.library-drawer-scrim')).toBeNull();
    expect(screen.queryByTestId('library-drawer-scrim')).toBeNull();
  });
});

describe('readLibraryOverlay — the pure flag reader survives (no Route variant, ADR-0185)', () => {
  it('ltd-flag-reader-survives: `?overlay=library` reads true; `""` and an unrelated value read false', () => {
    expect(readLibraryOverlay('?overlay=library')).toBe(true);
    expect(readLibraryOverlay('')).toBe(false);
    expect(readLibraryOverlay('?overlay=other')).toBe(false);
  });
});
