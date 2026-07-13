// @vitest-environment jsdom
//
// The Library overlay as a PERMANENT LENS (ADR-0187 dec 1/2, capability `library-permanent-lens`,
// the M1 rework of `LibraryDrawer.tsx`). This is the net-new real.testFile for this capability —
// it pins the reworked shell's behaviour as a WHOLE, spanning:
//
//   • lpl-no-closed-or-dive-mode-no-close-button — the retired `×`/"Close library" button, the
//                                            "Dive" button, and the `closed`/`dive` mode states are
//                                            GONE.
//   • lpl-permanent-lens-over-live-map     — the lens renders no full-screen dimming scrim; the map
//                                            stays live beneath it (proven by the scrim's absence).
//   • lpl-body-slot-renders-content        — the renamed `bodySlot` prop (was `peekSlot`) renders
//                                            whatever node it is handed; the retired `diveSlot` is
//                                            gone.
//
// RETIRED (ADR-0188 dec 3/6, inc-9 reconciliation): `lpl-bottom-selection-preview-open-fires-onopen`
// is GONE — the inc-8 bottom selection-preview strip is retired (its "what am I looking at" + Open job
// moved to the side-panel `library-selection-card`). Its behaviour is re-homed across
// `lsel-open-button-fires-onopen` (the pinned Open button) + the reworked lens rendering no strip.
//
// RETIRED (ADR-0191, the top-drawer reconciliation): `lpl-flag-gates-permanent-lens` is GONE — "absent
// renders nothing" is no longer true (absent renders the collapsed top drawer handle). The flag
// semantics re-home into `library-top-drawer`'s `ltd-collapsed-handle-by-default` +
// `ltd-flag-renders-expanded` + `ltd-flag-reader-survives`. The three blocks below survive verbatim
// against the reworked source (they render WITH the flag; none asserts absence).
//
// The pure `readLibraryOverlay` reader stays pinned in the trimmed `LibraryDrawer.test.tsx` (`ldw-*`)
// — not re-pinned here.
//
// `onCommitSearch`/`peekSlot`/`diveSlot` are the RETIRED shell's props (ADR-0185 dec 1) — the
// permanent lens drops `onCommitSearch` entirely (in-panel dismissal is retired; the parent glue
// clears `?overlay` on map navigation, not this shell) and renames `peekSlot` to `bodySlot`. This
// file exercises the reworked prop surface (`search`, `bodySlot`, `selection`, `onOpen`) and is
// expected to be RED against the current (pre-rework) `LibraryDrawer.tsx`.
//
// No backend seam (no `api`, no fetch, no socket, no DB); no agent / drive / model import (the
// modelPathBoundary.test.ts wall stays green). Appearance (palette, chrome) is NOT asserted here —
// owner-attested per ADR-0187/ADR-0070.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LibraryDrawer } from './LibraryDrawer';

afterEach(cleanup);

describe('LibraryDrawer — permanent lens (ADR-0187 dec 1/2)', () => {
  it('lpl-no-closed-or-dive-mode-no-close-button: the retired close/dive affordances and mode machine are gone', () => {
    render(<LibraryDrawer search="?overlay=library" selection={null} onOpen={vi.fn()} />);

    expect(screen.queryByLabelText('Close library')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close library' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dive' })).toBeNull();

    const lens = screen.getByTestId('library-drawer');
    expect(lens.getAttribute('data-mode')).not.toBe('closed');
    expect(lens.getAttribute('data-mode')).not.toBe('dive');
  });

  it('lpl-permanent-lens-over-live-map: no full-screen dimming scrim renders over the map', () => {
    render(<LibraryDrawer search="?overlay=library" selection={null} onOpen={vi.fn()} />);

    expect(document.querySelector('.library-drawer-scrim')).toBeNull();
    expect(screen.queryByTestId('library-drawer-scrim')).toBeNull();
  });

  it('lpl-body-slot-renders-content: the bodySlot prop renders whatever node it is handed, and there is no dive slot', () => {
    const bodyContent = 'stub body slot content';
    render(
      <LibraryDrawer search="?overlay=library" selection={null} onOpen={vi.fn()} bodySlot={bodyContent} />,
    );

    // The handed body node renders inside the lens, and the retired inline dive slot is gone.
    expect(screen.getByText(bodyContent)).not.toBeNull();
    expect(screen.queryByTestId('library-drawer-dive-slot')).toBeNull();
  });
});
