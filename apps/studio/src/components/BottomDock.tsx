// The bottom panel's TAB HOST (`traversal-panel-arc`, increment `traversal-panel-bottom-tab-host`).
//
// ADR-0354 D1: the context-traversal replay lives in a tab in the bottom panel BESIDE the terminal,
// and the terminal keeps its tab. This adds a sibling; it does not replace or degrade the CLI, which
// some operators drive the whole system from (owner, 2026-08-12). What forced the move was staging
// the previous placement for attestation: in the 360px story-details panel the picker's claim-join
// made 338 of this machine's 339 local traces unreachable, and the width cap was taxing exactly the
// depth / lanes / offer-fan metadata the arc had just added.
//
// WHY THE FRAME MOVED HERE. Until now `TerminalDock` was the bottom panel: it owned the absolute
// bottom overlay, the fold chevron and the drag-to-resize edge, because it was the only thing down
// there. A panel with two tabs cannot have each tab draw its own box — that is a dock inside a dock,
// two chevrons for one fold, and two drag handles. So the FRAME is this component's and the dock
// keeps everything else, through the absent-by-default `host` seam it grew for exactly this
// (TerminalDock contract 12, the `headerRight` precedent one level out). The geometry constants are
// deliberately the same values the dock has always used — this is the same box, drawn one level up.
//
// BOTH PANES STAY MOUNTED, hidden rather than unmounted, which is the dock's own idiom for its
// terminal panes and the reason a tab switch preserves state: the terminal keeps its xterm instances
// and scrollback, and the traversal keeps its selected trace and playback position. Unmounting the
// terminal would survive (sessions are app-owned since ADR-0189 and re-attach on the next mount),
// but it would pay a snapshot replay for every tab switch and lose the traversal's selection outright.
//
// GEOMETRY HERE, APPEARANCE OWNER-ATTESTED (ADR-0070): the structural style is inline or in this
// component's own `.bottom-dock*` namespace — never `.terminal-dock*`, which belongs to the dock
// (the `RepoPicker` namespace rule). This file signs no visual verdict; the look is judged against
// `docs/design/context-traversal/bottom-panel-traversal-composition.html` by the owner.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalDockSeed } from './TerminalDock.js';
import { TerminalRepoGate } from './TerminalRepoGate.js';
import { TraversalTab } from './TraversalTab.js';
import { RepoPicker } from './RepoPicker.js';

/** Drag bounds for the expanded panel height (px) — the SAME values the dock has always used, so
 *  moving the frame up one level cannot change how the bottom panel feels. */
const MIN_HEIGHT = 160;
const DEFAULT_HEIGHT = 320;
const VIEWPORT_MARGIN = 100;

/**
 * Below this height the CHROME yields and the PICTURE keeps the room (the composition reference's
 * `.is-compact`). It is the bottom panel's analogue of the retired `PANEL_MIN=360` rule, asked of
 * height instead of width: the alternative — letting the traversal shrink toward nothing — fails the
 * arc's clause that the traversal must dominate the first glance.
 */
const COMPACT_BELOW = 240;

export type BottomDockTab = 'terminal' | 'traversal';

export interface BottomDockProps {
  /** A map Build's pre-filled command (ADR-0137), forwarded to the terminal tab. */
  seed?: TerminalDockSeed;
  /** Which tab opens first. The terminal, unless a caller says otherwise — the traversal is the new
   *  sibling, and an operator who has never opened it should still meet the panel they know. */
  initialTab?: BottomDockTab;
  /**
   * The two pane bodies this panel hosts. Both default to the real components; a caller substitutes
   * one to observe the panel's OWN behaviour — pane retention across tab switches, the host seam,
   * the meta line — without standing up a real pty or a real trace read.
   *
   * INJECTED RATHER THAN MODULE-MOCKED (anti-slop-adoption-arc inc-06, `no-module-mocking`), the
   * same move `TerminalRepoGate` already makes for its own `repoControl` and `renderDock` slots.
   */
  panes?: BottomDockPanes;
}

/** What the panel hands each pane body. Both slots default to the real component. */
export interface BottomDockPanes {
  terminal?: (props: {
    seed?: TerminalDockSeed;
    host: { expanded: boolean; onRequestExpand: () => void };
  }) => React.JSX.Element;
  traversal?: (props: {
    active: boolean;
    onMeta: (meta: string | null) => void;
    compact: boolean;
  }) => React.JSX.Element;
}

const REAL_PANES: Required<BottomDockPanes> = {
  terminal: (props) => (
    <TerminalRepoGate {...props} repoControl={<RepoPicker />} />
  ),
  traversal: (props) => <TraversalTab {...props} />,
};

/**
 * The bottom panel: a folded-by-default overlay on the map frame, holding the terminal tab and the
 * context-traversal tab.
 */
export function BottomDock({
  seed,
  initialTab = 'terminal',
  panes,
}: BottomDockProps = {}): React.JSX.Element {
  const renderTerminalPane = panes?.terminal ?? REAL_PANES.terminal;
  const renderTraversalPane = panes?.traversal ?? REAL_PANES.traversal;
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [tab, setTab] = useState<BottomDockTab>(initialTab);
  /** The right-hand meta line in the tab strip — the traversal tab names its selected trace there,
   *  the way the composition reference does. Owned here because the strip is this component's. */
  const [meta, setMeta] = useState<string | null>(null);

  const asideRef = useRef<HTMLElement>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  const toggleDock = useCallback((): void => {
    setExpanded((open) => !open);
  }, []);

  /**
   * A map Build seeds the TERMINAL, so it must both unfold the panel and bring the terminal tab
   * forward — a seeded command landing in a pane hidden behind the traversal tab would be a command
   * the operator never sees. The dock asks for this through its `host.onRequestExpand`.
   */
  const revealTerminal = useCallback((): void => {
    setExpanded(true);
    setTab('terminal');
  }, []);

  // Drag-to-resize the top edge — the dock's own handler, moved up with the frame it belongs to:
  // window-level listeners so the pointer may leave the 6px strip mid-drag, and a clamp to the map
  // frame (the positioned offsetParent) so the panel never overflows the map or hides its own strip.
  const onDragStart = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault();
      drag.current = { startY: e.clientY, startHeight: height };
      const onMove = (ev: MouseEvent): void => {
        const d = drag.current;
        if (!d) return;
        const next = d.startHeight + (d.startY - ev.clientY); // up = larger
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

  // A tab the operator cannot see should not be describing itself in the strip. Clearing on the way
  // out of the traversal tab keeps the meta line honest rather than stale.
  useEffect(() => {
    if (tab !== 'traversal') setMeta(null);
  }, [tab]);

  const compact = expanded && height < COMPACT_BELOW;

  return (
    <aside
      ref={asideRef}
      className={`bottom-dock${compact ? ' bottom-dock-compact' : ''}`}
      aria-label="Bottom panel"
      // position:absolute → the panel overlays the MAP FRAME (its positioned offsetParent,
      // .world-frame), the geometry the terminal dock has always had here.
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 6,
        ...(expanded ? { height: `${height}px` } : {}),
      }}
    >
      {expanded && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="resize bottom panel"
          className="bottom-dock-resize"
          onMouseDown={onDragStart}
        />
      )}

      <div className="bottom-dock-tabs" role="tablist" aria-label="Bottom panel tabs">
        <TabButton
          id="terminal"
          label="Terminal"
          glyph="›_"
          active={tab === 'terminal'}
          expanded={expanded}
          onSelect={setTab}
          onToggle={toggleDock}
        />
        <TabButton
          id="traversal"
          label="Traversal"
          glyph="⌁"
          active={tab === 'traversal'}
          expanded={expanded}
          onSelect={setTab}
          onToggle={toggleDock}
        />

        <span className="bottom-dock-tabs-spacer" />

        {/* The selected trace, named where the composition reference names it. Absent by default —
            no container at all — so the strip is unchanged for an operator who never opens the tab. */}
        {meta !== null && (
          <span className="bottom-dock-meta" data-testid="bottom-dock-meta">
            {meta}
          </span>
        )}

        {/* One chevron for one fold. It sits at the end of the strip rather than over a tab,
            because it folds the PANEL and not whichever tab happens to be forward. */}
        <button
          type="button"
          className="bottom-dock-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? 'collapse bottom panel' : 'expand bottom panel'}
          onClick={toggleDock}
        >
          <span aria-hidden="true">{expanded ? '▾' : '▴'}</span>
        </button>
      </div>

      {/* Both panes stay MOUNTED across a switch and across a fold — see the header. `hidden` is the
          dock's own idiom for exactly this, and it is what makes "switching preserves each tab's
          state" true rather than merely intended. */}
      <div
        className="bottom-dock-pane bottom-dock-pane-terminal"
        role="tabpanel"
        id="bottom-dock-pane-terminal"
        aria-labelledby="bottom-dock-tab-terminal"
        hidden={!expanded || tab !== 'terminal'}
      >
        {renderTerminalPane({
          ...(seed ? { seed } : {}),
          host: { expanded: expanded && tab === 'terminal', onRequestExpand: revealTerminal },
        })}
      </div>

      <div
        className="bottom-dock-pane bottom-dock-pane-traversal"
        role="tabpanel"
        id="bottom-dock-pane-traversal"
        aria-labelledby="bottom-dock-tab-traversal"
        hidden={!expanded || tab !== 'traversal'}
      >
        {renderTraversalPane({
          active: expanded && tab === 'traversal',
          onMeta: setMeta,
          compact,
        })}
      </div>
    </aside>
  );
}

/**
 * One tab in the strip. Selecting a tab while the panel is FOLDED unfolds it — an operator clicking
 * "Traversal" on a folded panel means "show me the traversal", not "note my preference silently".
 */
function TabButton({
  id,
  label,
  glyph,
  active,
  expanded,
  onSelect,
  onToggle,
}: {
  id: BottomDockTab;
  label: string;
  glyph: string;
  active: boolean;
  expanded: boolean;
  onSelect: (tab: BottomDockTab) => void;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      id={`bottom-dock-tab-${id}`}
      className="bottom-dock-tab"
      aria-selected={active}
      aria-controls={`bottom-dock-pane-${id}`}
      onClick={() => {
        if (!expanded) {
          onSelect(id);
          onToggle();
          return;
        }
        // Clicking the tab that is already forward folds the panel — the same "click the thing that
        // is open to close it" the chevron offers, without moving the pointer.
        if (active) onToggle();
        else onSelect(id);
      }}
    >
      <span className="bottom-dock-tab-glyph" aria-hidden="true">
        {glyph}
      </span>
      {label}
    </button>
  );
}

function maxHeight(root: HTMLElement | null): number {
  // Clamp to the MAP FRAME (the positioned offsetParent = .world-frame) so the tab strip stays
  // visible and the panel never overflows the map. Falls back to the viewport when there is no
  // frame (a standalone render), keeping the geometry deterministic.
  const frame = root?.offsetParent as HTMLElement | null;
  const frameH = frame && frame.clientHeight > 0 ? frame.clientHeight : null;
  const base = frameH ?? (typeof window !== 'undefined' ? window.innerHeight : 768);
  return Math.max(MIN_HEIGHT, base - VIEWPORT_MARGIN);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
