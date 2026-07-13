/**
 * The Library drawer — a persistent TOP DRAWER HANDLE (ADR-0191), replacing the ADR-0188 dec-6
 * component-local Minimise/Restore machine. Lens state is URL-DERIVED, not component-local:
 * `?overlay=library` present in `search` => expanded; absent => collapsed to just the handle bar.
 * The handle is the SINGLE open/close affordance in both states — clicking its toggle fires the
 * `onToggle` callback prop; the component itself NEVER mutates the URL/history. The parent glue
 * owns the URL write (via `commitSearch`, the same reactive seam the gear dials ride).
 *
 * The lens:
 *   - COLLAPSED (search lacks `?overlay=library`): a stable `data-lens-state="collapsed"` marker,
 *     the handle bar (grip + "Library" wordmark + toggle) present, the `bodySlot` NOT rendered;
 *   - EXPANDED (search carries `?overlay=library`): a stable `data-lens-state="expanded"` marker,
 *     the handed `bodySlot` content visible, the handle bar still present;
 *   - carries NO full-screen dimming scrim in EITHER state — the forest map stays fully
 *     live/interactive beneath it at all times;
 *   - the inc-8 bottom selection-preview strip (`library-drawer-selection-preview`, the
 *     in-drawer Open button) stays RETIRED (ADR-0188 dec 3); `selection`/`onOpen` are kept as
 *     accepted-but-ignored optional props only so the pre-rework `TreeView.tsx` call site keeps
 *     compiling until a later glue increment removes them.
 *
 * The full-width / top-third layout, the handle silhouette, and the slide animation are the
 * story's OWNER-ATTESTED UAT leg (ADR-0191 dec 3 + ADR-0070) — deliberately not asserted here.
 */

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
  /**
   * Fired when the handle's toggle affordance is clicked, in EITHER state — a request to expand
   * (from collapsed) or to collapse (from expanded). The component never writes the URL itself;
   * the parent glue owns the URL write (via `commitSearch`) that actually flips `search`.
   */
  onToggle?: () => void;
}

/**
 * The Library top drawer — its state is URL-derived from `search` (`readLibraryOverlay`), never
 * component-local. Collapsed renders just the handle bar; expanded renders the handed `bodySlot`
 * above the same handle bar. No dimming scrim in either state. The handle's toggle fires
 * `onToggle` — it never mutates the URL/history itself.
 */
export function LibraryDrawer({
  search,
  bodySlot,
  peekSlot,
  onToggle,
}: LibraryDrawerProps) {
  const expanded = readLibraryOverlay(search);
  const body = bodySlot ?? peekSlot;

  return (
    <div
      className="library-drawer"
      data-testid="library-drawer"
      data-lens-state={expanded ? 'expanded' : 'collapsed'}
    >
      {expanded ? (
        <div className="library-drawer-body" data-testid="library-drawer-body">
          {body}
        </div>
      ) : null}
      <div className="library-drawer-handle-bar" data-testid="library-drawer-handle-bar">
        <span className="library-drawer-handle-grip" aria-hidden="true" />
        <span className="library-drawer-handle-wordmark">Library</span>
        <button
          type="button"
          className="library-drawer-toggle"
          data-testid="library-drawer-toggle"
          onClick={() => onToggle?.()}
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
    </div>
  );
}
