// ChatDock — the collapsible, draggable, bottom-anchored OVERLAY that wraps <ChatPanel/> on the
// forest map (owner feedback, leg-7 chip 1; ADR-0108 / ADR-0113 desktop "an actual agent you can
// chat to"). It is FOLDED by default; the operator clicks the toggle bar to EXPAND it out over the
// top of the map, and DRAGS its top edge to resize (taller/shorter). Because the root is
// position:fixed, the dock floats over the map — the operator trades map-space for chat-space on
// demand, the map keeps its full layout underneath.
//
// WRAPS, never folds-into, ChatPanel: the dock owns only the chrome (the toggle, the resize grabber,
// the body shell). ChatPanel and its 5 streaming contracts (ChatPanel.test.tsx) stay intact (slow
// growth — the minimum disruption). ChatPanel stays ALWAYS MOUNTED; the dock toggles its visibility
// with the `hidden` ATTRIBUTE, not conditional rendering, so (a) a streamed proposal / typed intent
// survives a fold→unfold, and (b) the folded body leaves the accessibility tree (which is how the
// fold is testable via role queries; CSS display:none does not apply in jsdom).
//
// THIN CLIENT — React + ChatPanel ONLY. No agent / drive / cli / orchestrator (the model-path wall,
// modelPathBoundary.test.ts); ChatPanel's sole route to the chat is the `api` streaming seam.
//
// GEOMETRY HERE, APPEARANCE OWNER-ATTESTED (ADR-0070): the structural/geometry style (fixed, bottom,
// z-index, the dragged height) is INLINE so it's robustly assertable and CSS-load-independent; the
// dock's look (background, border-top, shadow, radius, the toggle/grabber cosmetics) lives in
// index.css and is the `desktop` story's operator-attested UAT leg 7 — this file signs no visual
// verdict and asserts no appearance.

import { useCallback, useRef, useState } from 'react';
import { ChatPanel } from './ChatPanel.js';

/** Drag bounds for the expanded dock height (px). MIN keeps the conversation usable; MAX leaves a
 *  strip of map (and the topbar) visible so the dock never swallows the whole viewport. */
const MIN_HEIGHT = 160;
const DEFAULT_HEIGHT = 320;
const VIEWPORT_MARGIN = 100;

function maxHeight(): number {
  const innerH = typeof window !== 'undefined' ? window.innerHeight : 768;
  return Math.max(MIN_HEIGHT, innerH - VIEWPORT_MARGIN);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function ChatDock(): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  // Drag bookkeeping in a ref so the window listeners read live values, not a stale closure.
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  const toggle = useCallback((): void => {
    setExpanded((e) => !e);
  }, []);

  // Resize by dragging the top edge: UP (smaller clientY) GROWS the dock, DOWN shrinks it. Listeners
  // ride `window` so the drag continues even if the cursor leaves the thin grabber. Clamped to
  // [MIN_HEIGHT, maxHeight()].
  const onDragStart = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault(); // suppress text selection while dragging
      drag.current = { startY: e.clientY, startHeight: height };

      const onMove = (ev: MouseEvent): void => {
        const d = drag.current;
        if (!d) return;
        const next = d.startHeight + (d.startY - ev.clientY); // up = larger height
        setHeight(clamp(next, MIN_HEIGHT, maxHeight()));
      };
      const onUp = (): void => {
        drag.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [height],
  );

  return (
    <aside
      className="chat-dock"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        ...(expanded ? { height: `${height}px` } : {}),
      }}
    >
      {/* The resize grabber lives on the dock's TOP edge, only while expanded. */}
      {expanded && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="resize chat"
          className="chat-dock-resize"
          onMouseDown={onDragStart}
        />
      )}

      {/* One control toggles both ways: folded → expand, expanded → collapse. */}
      <button
        type="button"
        className="chat-dock-toggle"
        aria-expanded={expanded}
        onClick={toggle}
      >
        <span className="chat-dock-toggle-label">Chat</span>
        <span className="chat-dock-toggle-chevron" aria-hidden="true">
          {expanded ? '▾' : '▴'}
        </span>
      </button>

      {/* ChatPanel stays MOUNTED; `hidden` (not conditional render) preserves conversation state and
          drops the folded body from the a11y tree. */}
      <div className="chat-dock-body" hidden={!expanded}>
        <ChatPanel />
      </div>
    </aside>
  );
}
