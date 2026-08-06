/**
 * The map's top drawer — a persistent TOP DRAWER HANDLE (ADR-0191, polished by ADR-0193), replacing
 * the ADR-0188 dec-6 component-local Minimise/Restore machine. Lens state is URL-DERIVED, not
 * component-local: an `?overlay=` lens value present in `search` => expanded; absent => collapsed to
 * a SLIM, TITLE-LESS handle bar. The handle's single arrow toggle is the SINGLE open/close
 * affordance in both states — clicking it fires the `onToggle` callback prop; the component
 * itself NEVER mutates the URL/history. The parent glue owns the URL write (via `commitSearch`,
 * the same reactive seam the gear dials ride).
 *
 * It carries TWO lenses since ADR-0267 D1 (arcs take the primary slot) and ADR-0314 D6 (the demoted
 * Library becomes an `Arcs | Library` toggle in this header): `?overlay=arcs` shows `arcsSlot`,
 * `?overlay=library` shows `bodySlot`.
 *
 * The lens:
 *   - COLLAPSED (search carries no recognised `?overlay=` lens): a stable
 *     `data-lens-state="collapsed"` marker, the handle bar (grip + arrow toggle, NO lens toggle and
 *     so neither wordmark) present, no body rendered, no resize separator, no inline height;
 *   - EXPANDED (search carries `?overlay=arcs` or `?overlay=library`): a stable
 *     `data-lens-state="expanded"` marker, the active lens's slot content visible, the handle bar
 *     still present WITH the `Arcs | Library` toggle in the wordmark's slot (ADR-0193 dec 2's
 *     expanded-only rule, ADR-0314 D6's control), and a drag-resize separator (ADR-0193 dec 1) whose
 *     drag changes the drawer's inline height;
 *   - carries NO full-screen dimming scrim in EITHER state — the forest map stays fully
 *     live/interactive beneath it at all times;
 *   - the inc-8 bottom selection-preview strip (`library-drawer-selection-preview`, the
 *     in-drawer Open button) stays RETIRED (ADR-0188 dec 3); `selection`/`onOpen` are kept as
 *     accepted-but-ignored optional props only so the pre-rework `TreeView.tsx` call site keeps
 *     compiling until a later glue increment removes them.
 *
 * The full-width / half-screen default layout, the handle silhouette, the resize feel, and the
 * slide animation are the story's OWNER-ATTESTED UAT leg (ADR-0193 dec 1 + ADR-0191 dec 3 +
 * ADR-0070) — deliberately not asserted here.
 */

import { useEffect, useRef, useState } from 'react';
import type { SearchResult } from '../lib/librarySearch';
import { readDrawerLens, type DrawerLens } from '../lib/drawerLens';

// ---------- the query-flag reader (the worldSettings `?layout=` precedent) ----------

/**
 * Pure reader: does the search string carry `?overlay=library`? Mirrors
 * `readRenderScene`/`readLayoutMode` (`worldSettings.ts` / `TreeView.tsx`) — reads a `?…` param
 * off the search string that precedes the `#hash`, never a new hash route.
 */
export function readLibraryOverlay(search: string): boolean {
  return new URLSearchParams(search).get('overlay') === 'library';
}

// ---------- the two lenses (ADR-0267 D1 / ADR-0314 D6) ----------
//
// `readDrawerLens` / `DrawerLens` live in ../lib/drawerLens.ts, not here — see that module's header
// for why (three TreeView suites stub this component to null and would each need a copy). Option B's
// own proposal for the demoted Library, "a second lens on the same time axis", died with the axis in
// ADR-0314 D1, so D6's answer is borrowed from option A: a toggle in this header.
//
// `readLibraryOverlay` above is UNCHANGED and stays exported here — it is `library-drawer-shell`'s
// signed contract (four ids in LibraryDrawer.test.tsx) and answers a narrower question: is the
// LIBRARY lens the one open. Widening it in place would have silently re-pointed those contracts at
// a different question.

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
  /**
   * What fills the drawer on the ARCS lens (ADR-0267 D1's primary slot) — the momentum-lanes
   * surface, composed by the parent glue exactly as `bodySlot` composes the Library one. Absent →
   * the arcs lens renders empty, the same way `bodySlot` does.
   */
  arcsSlot?: React.ReactNode;
  /**
   * Fired when the header's `Arcs | Library` toggle is clicked (ADR-0314 D6) with the lens the
   * owner asked for. Like `onToggle`, the component never writes the URL itself — the parent glue
   * owns the `?overlay=` write, so the lens stays URL-derived and deep-linkable.
   */
  onSelectLens?: (lens: DrawerLens) => void;
}

/**
 * The map's top drawer — its state is URL-derived from `search` (`readDrawerLens`), never
 * component-local. Collapsed renders just the slim, title-less handle bar; expanded renders the
 * active lens's body above the same handle bar (now carrying the `Arcs | Library` toggle) plus a
 * drag-resize separator. No dimming scrim in either state. The handle's single arrow toggle fires
 * `onToggle` and the lens toggle fires `onSelectLens` — it never mutates the URL/history itself.
 *
 * TWO LENSES SINCE ADR-0267 D1 / ADR-0314 D6: `?overlay=arcs` shows `arcsSlot` (the primary slot —
 * the momentum-lanes arc surface), `?overlay=library` shows `bodySlot` (the demoted Library lens),
 * and anything else stays collapsed. Arcs is the default the collapsed handle opens onto
 * ({@link DEFAULT_DRAWER_LENS}) — the parent glue owns that choice, since it owns the URL write.
 */
export function LibraryDrawer({
  search,
  bodySlot,
  peekSlot,
  onToggle,
  arcsSlot,
  onSelectLens,
}: LibraryDrawerProps) {
  const lens = readDrawerLens(search);
  const expanded = lens !== null;
  const body = lens === 'arcs' ? arcsSlot : (bodySlot ?? peekSlot);

  const lensRef = useRef<HTMLDivElement | null>(null);
  const [heightPx, setHeightPx] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // The drag-resize separator's drag is tracked via document-level listeners (mousedown starts
  // the drag on the separator itself; move/up are global so the drag tracks outside the element).
  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = event.clientY - drag.startY;
      setHeightPx(Math.max(0, drag.startHeight + delta));
    }
    function handleMouseUp() {
      dragRef.current = null;
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  function handleSeparatorMouseDown(event: React.MouseEvent) {
    const startHeight = lensRef.current?.getBoundingClientRect().height ?? 0;
    dragRef.current = { startY: event.clientY, startHeight };
  }

  const inlineHeight = expanded && heightPx != null ? `${heightPx}px` : undefined;

  return (
    <div
      ref={lensRef}
      className="library-drawer"
      data-testid="library-drawer"
      data-lens-state={expanded ? 'expanded' : 'collapsed'}
      style={inlineHeight !== undefined ? { height: inlineHeight } : undefined}
    >
      {expanded ? (
        <div className="library-drawer-body" data-testid="library-drawer-body">
          {body}
        </div>
      ) : null}
      <div className="library-drawer-handle-bar" data-testid="library-drawer-handle-bar">
        <span className="library-drawer-handle-grip" aria-hidden="true" />
        {/* ADR-0314 D6: the `Arcs | Library` lens toggle takes the wordmark's slot — same header,
            one click, arcs the default. It names the ACTIVE lens the way the wordmark used to name
            the only one, so `library-top-drawer`'s expanded-only wordmark contract still holds:
            collapsed shows neither word, expanded shows both as the choice they now are. */}
        {expanded ? (
          <span
            className="library-drawer-lens-toggle"
            data-testid="library-drawer-lens-toggle"
            role="group"
            aria-label="drawer lens"
          >
            {(['arcs', 'library'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`library-drawer-lens${lens === option ? ' on' : ''}`}
                data-testid={`library-drawer-lens:${option}`}
                aria-pressed={lens === option}
                onClick={() => onSelectLens?.(option)}
              >
                {option === 'arcs' ? 'Arcs' : 'Library'}
              </button>
            ))}
          </span>
        ) : null}
        <button
          type="button"
          className="library-drawer-toggle"
          data-testid="library-drawer-toggle"
          aria-label={expanded ? 'collapse library' : 'expand library'}
          onClick={() => onToggle?.()}
        >
          <span aria-hidden="true">{expanded ? '▲' : '▼'}</span>
        </button>
      </div>
      {expanded ? (
        <div
          className="library-drawer-resize-separator"
          data-testid="library-drawer-resize-separator"
          role="separator"
          aria-label="resize library"
          onMouseDown={handleSeparatorMouseDown}
        />
      ) : null}
    </div>
  );
}
