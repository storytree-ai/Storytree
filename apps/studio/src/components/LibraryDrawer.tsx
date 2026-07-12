/**
 * The Library drawer — the PERMANENT LENS (ADR-0187 dec 1/2), now with a MINIMISE state machine
 * (ADR-0188 dec 6). The retired affordances (the `×` "Close library" button, the "Dive" button,
 * and the closed/peek/dive mode machine) are gone: behind `?overlay=library` the lens simply
 * renders, and the flag is the ONLY presence gate — dismissal (clearing `?overlay`) is owned by
 * the parent glue on map navigation, not this shell.
 *
 * The lens:
 *   - renders nothing unless `readLibraryOverlay(search)` is true (the sole gate);
 *   - carries NO full-screen dimming scrim, so the forest map stays fully live/interactive
 *     beneath it at all times — in EITHER lens state;
 *   - in the EXPANDED state (its default on render), renders the `bodySlot` above a bottom
 *     HANDLE BAR (a grip, a "Library" wordmark, and a Minimise control);
 *   - firing Minimise transitions to the MINIMISED state: a stable `data-lens-state="minimised"`
 *     marker on the lens root, the body not rendered, and the handle bar surviving — now
 *     carrying a Restore control in place of Minimise;
 *   - firing Restore (in the minimised state) transitions back to `data-lens-state="expanded"`
 *     and the same handed `bodySlot` content renders again — the lens minimises in place (a
 *     local state toggle), it never unmounts/re-fetches the body;
 *   - the inc-8 bottom selection-preview strip (`library-drawer-selection-preview`, the
 *     in-drawer Open button) is RETIRED (ADR-0188 dec 3 — that job moved to the side-panel
 *     `library-selection-card`); `selection`/`onOpen` are kept as accepted-but-ignored optional
 *     props only so the pre-rework `TreeView.tsx` call site keeps compiling until a later glue
 *     increment removes them.
 *
 * The palette (forest-cozy, matching `.world-frame`'s `--board-1`/`--board-2`/`--border`/
 * `--accent` variables), the grip look, the wordmark styling, the minimised silhouette, and the
 * expand↔minimise transition animation are the story's OWNER-ATTESTED UAT leg
 * (ADR-0188 dec 6/7 + ADR-0070) — deliberately not asserted here.
 */

import { useState } from 'react';
import type { SearchResult } from '../lib/librarySearch';

// ---------- the query-flag reader (the worldSettings `?layout=` precedent) ----------

/**
 * Pure reader: does the search string carry `?overlay=library`? Mirrors
 * `readRenderScene`/`readLayoutMode` (`worldSettings.ts` / `TreeView.tsx`) — reads a `?…` param
 * off the search string that precedes the `#hash`, never a new hash route.
 */
export function readLibraryOverlay(search: string): boolean {
  return new URLSearchParams(search).get('overlay') === 'library';
}

// ---------- the permanent lens ----------

export interface LibraryDrawerProps {
  /** The reactive search string (precedes `#hash`) — the lens renders whenever it carries
   *  `?overlay=library`; nothing otherwise. The flag is the ONLY gate — there is no in-panel
   *  transition out of presence. */
  search: string;
  /** What fills the lens body (the finder+subgraph or the whole-corpus overview, composed by the
   *  parent glue — mounted by TreeView where the AppData context is available; the lens itself
   *  stays provider-free so it proves in isolation). Absent → the body renders empty. */
  bodySlot?: React.ReactNode;
  /**
   * @deprecated retired by ADR-0188 dec 3/6 — the bottom selection-preview strip that read this
   * is gone (its job moved to the side-panel `library-selection-card`); accepted-but-ignored only
   * for pre-rework call-site compatibility (`TreeView.tsx`).
   */
  selection?: SearchResult | null;
  /**
   * @deprecated retired by ADR-0188 dec 3/6 — the bottom selection-preview strip's "Open" button
   * that fired this is gone; accepted-but-ignored only for pre-rework call-site compatibility.
   */
  onOpen?: (selection: SearchResult) => void;
  /**
   * @deprecated retired by ADR-0187 dec 1 (the permanent-lens rework superseding ADR-0185's
   * closed→peek→dive shell) — an accepted-but-unused alias of `bodySlot`, kept ONLY so pre-rework
   * call sites (`TreeView.tsx`, updated by a later glue increment) keep compiling. New callers use
   * `bodySlot`.
   */
  peekSlot?: React.ReactNode;
  /**
   * @deprecated retired by ADR-0187 dec 1 — the inline dive slot is gone (reading a whole
   * artifact is the separate `library-open-overlay` surface); accepted-but-ignored only for
   * pre-rework call-site compatibility.
   */
  diveSlot?: React.ReactNode;
  /**
   * @deprecated retired by ADR-0187 dec 1 — in-panel dismissal (the `×`/Esc-to-closed machine) is
   * gone; the parent glue clears `?overlay` on map navigation instead. Accepted-but-ignored only
   * for pre-rework call-site compatibility.
   */
  onCommitSearch?: (nextSearch: string) => void;
}

/**
 * The Library permanent lens — renders behind `?overlay=library` over the still-live map. In the
 * EXPANDED state it shows the body slot above a bottom handle bar (grip + wordmark + Minimise);
 * firing Minimise collapses it to just that handle bar (the body hidden, a Restore control in
 * its place); firing Restore returns to expanded with the same `bodySlot` content. No dimming
 * scrim in either state, no in-panel dismissal — the flag (`readLibraryOverlay`) is the only
 * presence gate, unaffected by the minimise/expand toggle.
 */
export function LibraryDrawer({
  search,
  bodySlot,
  peekSlot,
}: LibraryDrawerProps) {
  const [lensState, setLensState] = useState<'expanded' | 'minimised'>('expanded');

  if (!readLibraryOverlay(search)) return null;

  const body = bodySlot ?? peekSlot;
  const expanded = lensState === 'expanded';

  return (
    <div className="library-drawer" data-testid="library-drawer" data-lens-state={lensState}>
      {expanded ? (
        <div className="library-drawer-body" data-testid="library-drawer-body">
          {body}
        </div>
      ) : null}
      <div className="library-drawer-handle-bar" data-testid="library-drawer-handle-bar">
        <span className="library-drawer-handle-grip" aria-hidden="true" />
        <span className="library-drawer-handle-wordmark">Library</span>
        {expanded ? (
          <button
            type="button"
            className="library-drawer-minimise"
            onClick={() => setLensState('minimised')}
          >
            Minimise
          </button>
        ) : (
          <button
            type="button"
            className="library-drawer-restore"
            onClick={() => setLensState('expanded')}
          >
            Restore
          </button>
        )}
      </div>
    </div>
  );
}
