// @vitest-environment jsdom
//
// Reconciled for ADR-0187 dec 1 (the library overlay is a PERMANENT LENS) and ADR-0191 (the lens
// defaults to a collapsed TOP DRAWER HANDLE; lens state is URL-derived). The closed→peek→dive state
// machine of ADR-0185 dec 1 is RETIRED, and so is the absent-flag-renders-nothing invariant — absent
// the flag, the drawer now renders its collapsed handle (pinned in `library-top-drawer`'s
// `ltd-collapsed-handle-by-default`, LibraryTopDrawer.test.tsx).
//
// This file is `library-drawer-shell`'s trimmed real.testFile — it keeps ONLY the still-true,
// SURVIVING contracts: the pure `readLibraryOverlay` reader (now the EXPANDED-state gate, ADR-0191
// dec 2). Per ADR-0122 (`storytree coverage library-drawer-shell` reads the names) each surviving
// contract id leads a distinctly-named test, so coverage reports 4/4:
//
//   • `?overlay=library` reads true / true with other params / absent reads false / other value reads
//     false (ldw-reads-overlay-flag-present, -present-with-other-params, -absent, -other-value).
//
// RETIRED here (now-false assertions, moved/removed by reworks):
// lds-flag-opens-drawer-to-peek → re-homed as lpl-* (inc 8), then ltd-flag-renders-expanded;
// lds-peek-overlays-live-map → re-homed as lpl-permanent-lens-over-live-map;
// ldw-peek-reserves-an-empty-slot → re-homed as lpl-body-slot-renders-content;
// lds-esc-and-toggle-close-from-peek, lds-dive-collapses-to-bar-and-reserves-body,
// lds-esc-unwinds-dive-to-peek, ldw-esc-unwinds-peek-to-closed, ldw-close-toggle-clears-overlay-flag
// (the retired × / Dive / Esc-to-closed machine — deleted, inc 8);
// ldw-closed-without-flag (ADR-0191 — absent now renders the collapsed handle; re-homed as
// ltd-collapsed-handle-by-default).
//
// No backend seam (no `api`, no fetch, no socket, no DB); no agent / drive / model import (the
// modelPathBoundary.test.ts wall stays green).

import { describe, it, expect } from 'vitest';
import { readLibraryOverlay } from './LibraryDrawer';

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
