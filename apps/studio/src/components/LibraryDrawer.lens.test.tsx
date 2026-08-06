// @vitest-environment jsdom
//
// The drawer's TWO LENSES (ADR-0267 D1 + ADR-0314 D6) — arcs take the map's primary top-drawer
// slot, and the demoted Library becomes an `Arcs | Library` toggle in the same header.
//
// A NEW file rather than an edit to LibraryTopDrawer.test.tsx / LibraryDrawer.test.tsx: those two
// are `library-top-drawer`'s and `library-drawer-shell`'s signed real.testFiles, and their contract
// ids are positional against signed verdicts. Everything they assert is still TRUE and still runs
// — the collapsed handle is still title-less, the arrow toggle still fires `onToggle` in both
// states with the same accessible labels, the drag-resize separator is still expanded-only, and
// `readLibraryOverlay` is untouched. What is new is the second lens, and it is proven here.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LibraryDrawer } from './LibraryDrawer';
import { readDrawerLens, DEFAULT_DRAWER_LENS } from '../lib/drawerLens';

afterEach(cleanup);

describe('readDrawerLens — which lens the URL opens', () => {
  it('reads both lens values, and nothing else', () => {
    expect(readDrawerLens('?overlay=arcs')).toBe('arcs');
    expect(readDrawerLens('?overlay=library')).toBe('library');
    expect(readDrawerLens('?foo=bar&overlay=arcs')).toBe('arcs');
    expect(readDrawerLens('')).toBeNull();
    expect(readDrawerLens('?overlay=other')).toBeNull();
  });

  it('arcs is the DEFAULT lens — the primary slot (ADR-0267 D1)', () => {
    expect(DEFAULT_DRAWER_LENS).toBe('arcs');
  });
});

describe('LibraryDrawer — `?overlay=arcs` expands onto the arcs lens', () => {
  it('renders the arcsSlot and not the library bodySlot', () => {
    render(<LibraryDrawer search="?overlay=arcs" arcsSlot="arc lanes here" bodySlot="library body here" />);
    expect(screen.getByTestId('library-drawer').getAttribute('data-lens-state')).toBe('expanded');
    expect(screen.getByText('arc lanes here')).not.toBeNull();
    expect(screen.queryByText('library body here')).toBeNull();
  });

  it('renders the library bodySlot and not the arcsSlot under `?overlay=library`', () => {
    render(<LibraryDrawer search="?overlay=library" arcsSlot="arc lanes here" bodySlot="library body here" />);
    expect(screen.getByText('library body here')).not.toBeNull();
    expect(screen.queryByText('arc lanes here')).toBeNull();
  });

  it('an unrecognised overlay value leaves the drawer collapsed with neither slot rendered', () => {
    render(<LibraryDrawer search="?overlay=nonsense" arcsSlot="arc lanes here" bodySlot="library body here" />);
    expect(screen.getByTestId('library-drawer').getAttribute('data-lens-state')).toBe('collapsed');
    expect(screen.queryByText('arc lanes here')).toBeNull();
    expect(screen.queryByText('library body here')).toBeNull();
  });
});

describe('LibraryDrawer — the `Arcs | Library` header toggle (ADR-0314 D6)', () => {
  it('is expanded-only, like the wordmark whose slot it takes (ADR-0193 dec 2)', () => {
    const { rerender } = render(<LibraryDrawer search="" />);
    expect(screen.queryByTestId('library-drawer-lens-toggle')).toBeNull();
    expect(screen.queryByText('Arcs')).toBeNull();
    expect(screen.queryByText('Library')).toBeNull();

    rerender(<LibraryDrawer search="?overlay=arcs" />);
    expect(screen.getByTestId('library-drawer-lens-toggle')).not.toBeNull();
    expect(screen.getByText('Arcs')).not.toBeNull();
    expect(screen.getByText('Library')).not.toBeNull();
  });

  it('marks the active lens, and fires onSelectLens with the one asked for — never writing the URL', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    const onSelectLens = vi.fn();

    render(<LibraryDrawer search="?overlay=arcs" onSelectLens={onSelectLens} />);
    expect(screen.getByTestId('library-drawer-lens:arcs').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('library-drawer-lens:library').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByTestId('library-drawer-lens:library'));
    expect(onSelectLens).toHaveBeenCalledTimes(1);
    expect(onSelectLens).toHaveBeenCalledWith('library');

    // The component never mutates the URL/history itself — the parent glue owns the write, which is
    // what keeps the lens URL-derived and deep-linkable.
    expect(pushStateSpy).not.toHaveBeenCalled();
    expect(replaceStateSpy).not.toHaveBeenCalled();
    pushStateSpy.mockRestore();
    replaceStateSpy.mockRestore();
  });

  it('the arrow toggle still owns open/close, distinctly from the lens toggle', () => {
    const onToggle = vi.fn();
    const onSelectLens = vi.fn();
    render(<LibraryDrawer search="?overlay=arcs" onToggle={onToggle} onSelectLens={onSelectLens} />);

    fireEvent.click(screen.getByLabelText('collapse library'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onSelectLens).not.toHaveBeenCalled();
  });
});
