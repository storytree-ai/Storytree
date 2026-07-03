// ChatDock — the collapsible, draggable, bottom-anchored OVERLAY that wraps <ChatPanel/> on the
// forest map (owner feedback, leg-7 chip 1; ADR-0108 / ADR-0113 desktop "an actual agent you can
// chat to"). It is FOLDED by default; the operator clicks the toggle bar to EXPAND it out over the
// top of the map, and DRAGS its top edge to resize (taller/shorter). Because the root is
// position:absolute, the dock floats over the MAP FRAME (its positioned offsetParent, .world-frame)
// rather than the whole app — the operator trades map-space for chat-space on demand, the map keeps
// its full layout underneath.
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
// GEOMETRY HERE, APPEARANCE OWNER-ATTESTED (ADR-0070): the structural/geometry style (absolute,
// bottom, z-index, the dragged height) is INLINE so it's robustly assertable and CSS-load-independent; the
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

function maxHeight(root: HTMLElement | null): number {
  // Clamp the expanded dock to the MAP FRAME (its positioned offsetParent = .world-frame) so the
  // toggle/grabber stay visible and the dock never overflows the map. Falls back to the viewport
  // when there is no frame (standalone render), keeping the geometry deterministic.
  const frame = root?.offsetParent as HTMLElement | null;
  const frameH = frame && frame.clientHeight > 0 ? frame.clientHeight : null;
  const base = frameH ?? (typeof window !== 'undefined' ? window.innerHeight : 768);
  return Math.max(MIN_HEIGHT, base - VIEWPORT_MARGIN);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Props for ChatDock. `onReloadTree` is the map-refresh callback TreeView injects
 *  (live-story-island-refresh, ADR-0137): when the chat surface sees a spawn-FINISHED frame for a
 *  STORY-AUTHOR (a new story was authored to stories/, so the tree changed), the dock invokes it so the
 *  just-authored island appears live on the forest map. A plain React callback — the dock imports no
 *  drive/agent (the model-path wall); TreeView owns `reloadTree` and passes it down. Optional: the dock
 *  renders standalone with no callback (no reload fires). */
export interface ChatDockProps {
  onReloadTree?: () => void;
}

export function ChatDock({ onReloadTree }: ChatDockProps = {}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  // Drag bookkeeping in a ref so the window listeners read live values, not a stale closure.
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  // The dock root — its offsetParent is the positioned map frame (.world-frame), the clamp ceiling.
  const asideRef = useRef<HTMLElement>(null);

  const toggle = useCallback((): void => {
    setExpanded((e) => !e);
  }, []);

  // The fence (live-story-island-refresh, ADR-0137): a spawn-FINISHED frame reloads the map ONLY for a
  // STORY-AUTHOR role — a story-author finish authored a NEW story to stories/, so the tree changed. A
  // BUILDER finish drove an EXISTING node (nothing new to show) and a `started` frame (never surfaced
  // here — ChatPanel only relays `finished`) has authored nothing yet; neither reloads. The reload
  // reuses TreeView's existing `reloadTree` (passed in as `onReloadTree`) — no new fetch/tree loader.
  const handleSpawnFinished = useCallback(
    (frame: { role: string; unitId: string; ok?: boolean }): void => {
      if (frame.role === 'story-author') onReloadTree?.();
    },
    [onReloadTree],
  );

  // Resize by dragging the top edge: UP (smaller clientY) GROWS the dock, DOWN shrinks it. Listeners
  // ride `window` so the drag continues even if the cursor leaves the thin grabber. Clamped to
  // [MIN_HEIGHT, maxHeight(asideRef.current)] (the map frame, falling back to the viewport).
  const onDragStart = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault(); // suppress text selection while dragging
      drag.current = { startY: e.clientY, startHeight: height };

      const onMove = (ev: MouseEvent): void => {
        const d = drag.current;
        if (!d) return;
        const next = d.startHeight + (d.startY - ev.clientY); // up = larger height
        setHeight(clamp(next, MIN_HEIGHT, maxHeight(asideRef.current)));
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
      ref={asideRef}
      className="chat-dock"
      // position:absolute → the dock overlays the MAP FRAME (its positioned offsetParent,
      // .world-frame), not the whole app; z 6 sits above the in-frame map overlays (z 2–5) and
      // below the transient tooltips (z 55–60).
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 6,
        ...(expanded ? { height: `${height}px` } : {}),
      }}
    >
      {/* The resize grabber lives on the dock's TOP edge, only while expanded — a thin drag handle,
          paired below with the collapse chevron in the minimal top strip (no title text). */}
      {expanded && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="resize chat"
          className="chat-dock-resize"
          onMouseDown={onDragStart}
        />
      )}

      {/* One control toggles both ways: folded → expand, expanded → collapse. NO "Chat" title text
          anywhere (owner feedback: the title appeared redundantly). Collapsed: a slim, discoverable
          prompt-bar — a forest-sage `›` glyph + a faint hint + an up-chevron. Expanded: a minimal top
          strip with just a down-chevron to collapse (the drag grabber sits above it). The
          aria-expanded state stays the testable signal. The aria-label keeps the toggle findable
          ("expand chat" / "collapse chat") now that the visible text label is gone. */}
      <button
        type="button"
        className={`chat-dock-toggle${expanded ? ' chat-dock-toggle-expanded' : ''}`}
        aria-expanded={expanded}
        aria-label={expanded ? 'collapse chat' : 'expand chat'}
        onClick={toggle}
      >
        {expanded ? (
          <span className="chat-dock-toggle-chevron" aria-hidden="true">
            {'▾'}
          </span>
        ) : (
          <>
            <span className="chat-dock-toggle-prompt" aria-hidden="true">
              {'›'}
            </span>
            <span className="chat-dock-toggle-hint">Ask the orchestrator…</span>
            <span className="chat-dock-toggle-chevron" aria-hidden="true">
              {'▴'}
            </span>
          </>
        )}
      </button>

      {/* ChatPanel stays MOUNTED; `hidden` (not conditional render) preserves conversation state and
          drops the folded body from the a11y tree. */}
      <div className="chat-dock-body" hidden={!expanded}>
        <ChatPanel onSpawnFinished={handleSpawnFinished} />
      </div>
    </aside>
  );
}
