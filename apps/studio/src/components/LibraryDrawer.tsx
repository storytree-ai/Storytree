/**
 * The Library drawer SHELL (ADR-0185 dec 1) — a slide-down overlay that mounts behind
 * `?overlay=library` and walks a closed → peek → dive state machine over the live forest map.
 *
 * This is the SHELL only: the finder (increment 2) and the artifact body (increment 4) are NOT
 * built here — this capability proves the flag reader, the mode transitions, and that peek/dive
 * each reserve an EMPTY, identifiable slot for those increments to mount into later.
 *
 * States:
 *   - closed — nothing renders; the bare map.
 *   - peek   — the drawer slides down over the map; the map stays FULLY LIVE beneath it (no
 *              dimming scrim); an empty peek slot is reserved for the finder.
 *   - dive   — the drawer collapses to a bar and reserves an empty dive-body slot for the
 *              artifact body; the peek slot is hidden.
 *
 * Transitions:
 *   - the `?overlay=library` flag (read via `readLibraryOverlay`) opens closed → peek at mount.
 *   - the "Dive" action goes peek → dive.
 *   - Esc unwinds ONE level at a time: dive → peek, then peek → closed.
 *   - the explicit close toggle closes from any open state.
 *   - closing (via Esc reaching closed, or the explicit close toggle) clears the `?overlay` flag
 *     from the search via `onCommitSearch` — this shell never navigates directly.
 *
 * The palette (forest-cozy, matching `.world-frame`'s `--board-1`/`--board-2`/`--border`/
 * `--accent` variables), the slide animation, and the z-layering (z-index 4, between the
 * side-panel/legend layer at z:3 and the flyout at z:5) are the story's OWNER-ATTESTED UAT leg
 * (ADR-0185 dec 5 / ADR-0070) — deliberately not asserted here.
 */

import { useCallback, useEffect, useState } from 'react';

// ---------- the query-flag reader (the worldSettings `?layout=` precedent) ----------

/**
 * Pure reader: does the search string carry `?overlay=library`? Mirrors
 * `readRenderScene`/`readLayoutMode` (`worldSettings.ts` / `TreeView.tsx`) — reads a `?…` param
 * off the search string that precedes the `#hash`, never a new hash route.
 */
export function readLibraryOverlay(search: string): boolean {
  return new URLSearchParams(search).get('overlay') === 'library';
}

/** Returns the search string with `overlay` removed, preserving every other param. */
function clearOverlayParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('overlay');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

// ---------- the shell ----------

type Mode = 'closed' | 'peek' | 'dive';

export interface LibraryDrawerProps {
  /** The reactive search string (precedes `#hash`) — the drawer opens straight to peek when it
   *  carries `?overlay=library` at mount. */
  search: string;
  /** Called with the next search string when the drawer clears its own `?overlay` flag on
   *  close — a `commitSearch`-style write, observed here rather than a real navigation. */
  onCommitSearch: (nextSearch: string) => void;
  /** What fills the reserved peek body slot (the finder, increment 2 — mounted by TreeView where
   *  the AppData context is available; the shell itself stays provider-free so it proves in
   *  isolation). Absent → the slot renders empty, as increment 1 left it. */
  peekSlot?: React.ReactNode;
  /** What fills the reserved dive body slot (the artifact body, increment 4 — mounted by TreeView
   *  where the AppData context is available, mirroring `peekSlot`). Absent → the slot renders
   *  empty, as increment 1 left it (so the shell's own `lds-*` tests, which pass no `diveSlot`,
   *  stay byte-green). */
  diveSlot?: React.ReactNode;
}

/**
 * The Library drawer shell — reads the overlay flag, holds the peek/dive/closed mode, renders
 * the overlay chrome, and reserves the peek/dive body slots. Renders nothing when closed.
 */
export function LibraryDrawer({ search, onCommitSearch, peekSlot, diveSlot }: LibraryDrawerProps) {
  const [mode, setMode] = useState<Mode>(() => (readLibraryOverlay(search) ? 'peek' : 'closed'));

  const close = useCallback(() => {
    setMode('closed');
    onCommitSearch(clearOverlayParam(search));
  }, [search, onCommitSearch]);

  useEffect(() => {
    if (mode === 'closed') return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return;
      setMode((current) => {
        if (current === 'dive') return 'peek';
        if (current === 'peek') {
          onCommitSearch(clearOverlayParam(search));
          return 'closed';
        }
        return current;
      });
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, search, onCommitSearch]);

  if (mode === 'closed') return null;

  return (
    <div className="library-drawer" data-testid="library-drawer" data-mode={mode}>
      <div className="library-drawer-bar" data-testid="library-drawer-bar">
        <span className="library-drawer-bar-title">Library</span>
        {mode === 'peek' && (
          <button type="button" className="library-drawer-dive" onClick={() => setMode('dive')}>
            Dive
          </button>
        )}
        <button type="button" aria-label="Close library" className="library-drawer-close" onClick={close}>
          ×
        </button>
      </div>
      {mode === 'peek' && (
        <div className="library-drawer-peek-slot" data-testid="library-drawer-peek-slot">
          {peekSlot}
        </div>
      )}
      {mode === 'dive' && (
        <div className="library-drawer-dive-slot" data-testid="library-drawer-dive-slot">
          {diveSlot}
        </div>
      )}
    </div>
  );
}
