// TerminalDock — the renderer xterm.js terminal dock (terminal-dock-panel capability, ADR-0174 renderer
// half), now MULTI-SESSION (multi-session-tabs capability): a tab strip between the dock header and the
// body holds N independent sessions, each its own xterm `Terminal` pane over the `desktopTerminal`
// contextBridge. Reuses ChatDock's TESTED collapse/resize dock geometry (folded-by-default bottom
// overlay, drag-to-resize the top edge, clamped to the map frame) as the chrome around the tab set.
//
// THE SESSION TABLE (not N refs) — an ordered list of local tab ids (`tabIds`, drives render/order) with
// the imperative per-tab state (`sessionId`/`term`/`fit`/`bodyEl`/`pendingSeed`) held in a `Map` ref
// (`recordsRef`) — the live values the bridge's `onData`/`onExit` callbacks (subscribed ONCE, scanning
// the table for the matching `sessionId`) and the drag-resize/refocus handlers read. `activeId` (state)
// is which tab's pane is visible; the chrome (toggle, `headerRight`, collapse/resize geometry) renders
// ONCE per dock, wrapping the whole tab set — never repeated per tab.
//
// THIN CLIENT — no `@storytree/agent` / `@storytree/drive` import, no model path (ADR-0004 / ADR-0108
// d.1; modelPathBoundary.test.ts). The renderer's ONLY route to the pty is `window.desktopTerminal`
// (mirrors `desktopAuth` / `desktopApply`): `spawn` starts a session, `write`/`resize`/`dispose` forward
// to it, `onData`/`onExit` subscribe to the stream the Electron main relays. xterm.js itself is a
// third-party rendering library, not a model path.
//
// DEGRADES HONESTLY where the bridge is absent (the `StoreBanner` store-unreachable / `ChatPanel`
// no-backend precedent) — the studio-standalone case (no desktop preload) never spawns, never hangs
// waiting on a stream that will never arrive, and never crashes the surrounding app; it renders a plain
// disabled "terminal unavailable here" panel instead.
//
// DISPOSE ON TAB-CLOSE; PRESERVE ON UNMOUNT (ADR-0189, superseding ADR-0186's dock-lifetime wall):
// closing a tab disposes ONLY that tab's bridge session + xterm/fit instances and reaps its tab — the
// ONLY thing that ever disposes a bridge session. Dock unmount disposes every tab's RENDERER resources
// (xterm + fit) and clears the session table, but calls NO `bridge.dispose` — sessions are app-owned,
// they survive a route change and re-attach on the next mount (`tdp-reattaches-live-sessions-on-mount`).
// The pty-reap duty moved to the Electron main's app lifecycle (`disposeAllTerminals` on
// window-close/app-quit — glue).
//
// GEOMETRY HERE, APPEARANCE OWNER-ATTESTED (ADR-0070): the structural/geometry style (absolute, bottom,
// z-index, the dragged height) is inline, same as ChatDock; the terminal's look/feel is the story's
// operator-attested UAT leg 5 — this file signs no visual verdict.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

/** Drag bounds for the expanded dock height (px) — mirrors ChatDock's MIN/DEFAULT/margin. */
const MIN_HEIGHT = 160;
const DEFAULT_HEIGHT = 320;
const VIEWPORT_MARGIN = 100;

/** The bridge the desktop preload exposes on `window` (absent in the hosted/dev studio — a browser). Its
 *  shape mirrors `desktopAuth` / `desktopApply`: `spawn` starts a pty session (the Electron main drives
 *  `pty-session-manager.create`), `write`/`resize`/`dispose` forward to the manager, `onData`/`onExit`
 *  subscribe to the `webContents.send` stream the main relays. */
export interface DesktopTerminalBridge {
  spawn(opts?: unknown): Promise<{ sessionId: string }>;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  dispose(sessionId: string): void;
  onData(cb: (sessionId: string, chunk: string) => void): void;
  onExit(cb: (sessionId: string, e: { exitCode: number }) => void): void;
  /** ADR-0189 re-attach slice — OPTIONAL: an older preload lacks it (feature-guard, never assume).
   *  The still-live sessions the main scopes to the currently selected repo. */
  list?(): Promise<Array<{ sessionId: string }>>;
  /** ADR-0189 re-attach slice — OPTIONAL: the session's main-held buffered scrollback, replayed into
   *  a fresh xterm on re-attach. */
  snapshot?(sessionId: string): Promise<string>;
}

declare global {
  interface Window {
    /** Injected by the desktop preload (ADR-0174). Undefined in the hosted/dev studio. */
    desktopTerminal?: DesktopTerminalBridge;
  }
}

function getDesktopTerminal(): DesktopTerminalBridge | undefined {
  return typeof window !== 'undefined' ? window.desktopTerminal : undefined;
}

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

/** A seed command to pre-fill into the terminal (never auto-run — no trailing newline). `token` is a
 *  monotonic NONCE, not a cache key: a repeat seed of the identical `command` still re-fires as long
 *  as `token` bumps (a user may Build the same node twice, or re-seed after clearing the terminal). */
export interface TerminalDockSeed {
  command: string;
  token: number;
}

export interface TerminalDockProps {
  seed?: TerminalDockSeed;
  /** Optional passive render slot in the dock's own header, top-right — a sibling of the toggle
   *  button (never nested inside it, to keep valid HTML). The dock does not interpret it; the
   *  downstream `terminal-repo-gate` places a repo-picker control here. Absent by default, in which
   *  case the header renders byte-identical to before (no extra container). Never rendered in the
   *  absent-bridge disabled state (nothing to host a repo control for). */
  headerRight?: React.ReactNode;
}

/** One tab's imperative state — held in `recordsRef` (a `Map`, keyed by the tab's stable local id), NOT
 *  in per-tab React state: `term`/`fit`/`bodyEl` are opaque handles the bridge/drag/refocus callbacks
 *  read and mutate directly, and `sessionId` is set once the (per-tab) `bridge.spawn()` resolves. */
interface TabRecord {
  sessionId: string | null;
  term: Terminal | null;
  fit: FitAddon | null;
  bodyEl: HTMLDivElement | null;
  /** A seed command held until THIS tab's spawn resolves (written once, then cleared). */
  pendingSeed: string | null;
  /** ADR-0189 re-attach: true for an ADOPTED tab (bridge.list()) until its snapshot() replay lands —
   *  live `onData` chunks for this session are held (see `heldChunks`) rather than written directly,
   *  so restored scrollback is never interleaved out of order with fresh output. Always false for a
   *  freshly spawned tab (nothing to replay). */
  awaitingSnapshot: boolean;
  /** Live bridge chunks that arrived for this session while `awaitingSnapshot` was true — flushed, in
   *  order, right after the snapshot replay lands. */
  heldChunks: string[];
}

export function TerminalDock({ seed, headerRight }: TerminalDockProps = {}): React.JSX.Element {
  const bridge = getDesktopTerminal();

  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  // The session table: `tabIds` (state) is the ORDER or tabs — it drives render and the "tab N"/"close
  // tab N" numbering; `recordsRef` (a ref, mirrored by nothing else) is the live per-tab imperative
  // state the bridge callbacks and drag/refocus handlers read. `activeId` is which tab's pane shows.
  const [tabIds, setTabIds] = useState<number[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  // ADR-0189 re-attach slice — true until the mount-time bridge.list() restore has settled (empty,
  // populated, or no `list` at all). Gates spawn-on-first-expand so it never races/duplicates the
  // restore's adopted tabs.
  const [restoringSessions, setRestoringSessions] = useState(true);
  const recordsRef = useRef<Map<number, TabRecord>>(new Map());
  const nextTabIdRef = useRef(0);
  const activeIdRef = useRef<number | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Drag bookkeeping in a ref so the window listeners read live values, not a stale closure.
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  // The dock root — its offsetParent is the positioned map frame (.world-frame), the clamp ceiling.
  const asideRef = useRef<HTMLElement>(null);

  // Seed bookkeeping: the last-applied token (so a re-render with the SAME token is a no-op, keyed
  // on the token — a nonce — never the command string).
  const seedTokenRef = useRef<number | null>(null);

  const toggleDock = useCallback((): void => {
    setExpanded((e) => !e);
  }, []);

  /** Create a new tab — a fresh local id, an empty record, appended to the order, made active. The
   *  record's own xterm/spawn wiring happens once its mount div commits (see the tabIds effect below). */
  const openSession = useCallback((pendingSeed: string | null): number => {
    const id = nextTabIdRef.current;
    nextTabIdRef.current += 1;
    recordsRef.current.set(id, {
      sessionId: null,
      term: null,
      fit: null,
      bodyEl: null,
      pendingSeed,
      awaitingSnapshot: false,
      heldChunks: [],
    });
    setTabIds((prev) => [...prev, id]);
    setActiveId(id);
    return id;
  }, []);

  /** ADR-0189 re-attach — adopt a still-live session reported by `bridge.list()` as its own tab,
   *  NEVER calling `bridge.spawn()` for it. The tab's xterm mount + snapshot replay happen once its
   *  body div commits (see `initTab`, below), same as a freshly-spawned tab. */
  const adoptSession = useCallback((sessionId: string): number => {
    const id = nextTabIdRef.current;
    nextTabIdRef.current += 1;
    recordsRef.current.set(id, {
      sessionId,
      term: null,
      fit: null,
      bodyEl: null,
      pendingSeed: null,
      awaitingSnapshot: true,
      heldChunks: [],
    });
    setTabIds((prev) => [...prev, id]);
    setActiveId(id);
    return id;
  }, []);

  /** Mount xterm into a tab's committed body div and spawn its (independent) bridge session — guarded
   *  so a tab already carrying a `term` is never re-initialised (mirrors the old termRef guard, per
   *  tab). Runs once the tab's body div has committed (see the tabIds effect below). */
  const initTab = useCallback(
    (id: number): void => {
      const rec = recordsRef.current.get(id);
      if (!bridge || !rec || rec.term || !rec.bodyEl) return;

      const term = new Terminal({ cursorBlink: true, convertEol: true });
      const fit = new FitAddon();
      term.loadAddon(fit);
      fit.activate(term); // wire the addon to this terminal so a later fit()/dispose() has effect
      term.open(rec.bodyEl);
      rec.term = term;
      rec.fit = fit;

      // Terminal input → bridge write, scoped to THIS tab's session (only once it exists).
      term.onData((data) => {
        if (rec.sessionId) bridge.write(rec.sessionId, data);
      });
      // Terminal resize (driven by our fit() calls) → forward the new pty geometry for THIS session.
      term.onResize(({ cols, rows }) => {
        if (rec.sessionId) bridge.resize(rec.sessionId, cols, rows);
      });

      if (rec.sessionId) {
        // ADR-0189 re-attach: an ADOPTED tab already carries a live session — never spawn a fresh
        // one. Replay its buffered scrollback (if the bridge offers `snapshot`) BEFORE any live
        // `onData` chunk for this session is written (those are held in `rec.heldChunks` by the
        // bridge router below while `awaitingSnapshot` is true).
        if (bridge.snapshot) {
          void bridge.snapshot(rec.sessionId).then((text) => {
            term.write(text);
            for (const chunk of rec.heldChunks) term.write(chunk);
            rec.heldChunks = [];
            rec.awaitingSnapshot = false;
          });
        } else {
          rec.awaitingSnapshot = false;
        }
        return;
      }

      void bridge.spawn().then((res) => {
        rec.sessionId = res.sessionId;

        // Contract 8 — the main FAILS CLOSED (no valid repo selected) by resolving an empty
        // sessionId rather than a shell in the wrong cwd. Never leave the screen blank: write an
        // honest one-line message and wire NO live session (the `if (rec.sessionId)` guards above
        // already treat an empty string as falsy, so input stays inert).
        if (!res.sessionId) {
          term.write('No repository selected — choose one to start the terminal.\r\n');
          return;
        }

        // A seed that arrived before THIS session resolved was held PENDING — write it now, exactly
        // once, as a pre-fill (no trailing newline: reviewed by the user, never auto-run).
        const pendingCommand = rec.pendingSeed;
        if (pendingCommand !== null) {
          rec.pendingSeed = null;
          bridge.write(res.sessionId, pendingCommand);
        }
      });
    },
    [bridge],
  );

  /** Dispose ONE tab's session (bridge + xterm/fit) and reap it from the strip; the sibling tabs are
   *  untouched. If the closed tab was active, a remaining tab (the last one) becomes active. */
  const closeTab = useCallback(
    (id: number): void => {
      const rec = recordsRef.current.get(id);
      if (rec) {
        rec.fit?.dispose();
        rec.term?.dispose();
        if (rec.sessionId && bridge) bridge.dispose(rec.sessionId);
        recordsRef.current.delete(id);
      }
      setTabIds((prev) => {
        const next = prev.filter((x) => x !== id);
        setActiveId((prevActive) =>
          prevActive === id ? (next.length > 0 ? next[next.length - 1]! : null) : prevActive,
        );
        return next;
      });
    },
    [bridge],
  );

  // ADR-0189 re-attach slice — on mount, ask the bridge for still-live sessions and ADOPT each one as
  // its own tab (never `spawn`). Gates `restoringSessions` false once the restore settles (empty,
  // populated, or the bridge has no `list` at all — an older preload), so spawn-on-first-expand below
  // never races/duplicates it.
  useEffect(() => {
    if (!bridge || !bridge.list) {
      setRestoringSessions(false);
      return;
    }
    let cancelled = false;
    void bridge.list().then((sessions) => {
      if (cancelled) return;
      for (const s of sessions) adoptSession(s.sessionId);
      setRestoringSessions(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  // Spawn the FIRST tab's session the first time the dock is expanded — mirrors the old
  // spawn-on-first-expand guard, generalised: only when no tab exists yet, AND only once the
  // mount-time restore above has settled (never race/duplicate an adopted session).
  useEffect(() => {
    if (!expanded || !bridge || tabIds.length > 0 || restoringSessions) return;
    openSession(null);
  }, [expanded, bridge, tabIds.length, restoringSessions, openSession]);

  // Whenever a new tab enters the table, its body div has just committed (ref callbacks run before
  // effects) — initialise its xterm + bridge session now. Already-initialised tabs are no-ops (the
  // `rec.term` guard inside `initTab`).
  useEffect(() => {
    for (const id of tabIds) initTab(id);
  }, [tabIds, initTab]);

  // Bridge data/exit streams → routed to whichever tab's record carries the matching sessionId.
  // Subscribed ONCE per dock (not per tab) — a chunk for tab A's session never reaches tab B's pane.
  useEffect(() => {
    if (!bridge) return;
    bridge.onData((sessionId, chunk) => {
      for (const rec of recordsRef.current.values()) {
        if (rec.sessionId === sessionId) {
          // ADR-0189 re-attach: hold live chunks for an adopted tab until its snapshot replay lands,
          // so restored scrollback never interleaves out of order with fresh output.
          if (rec.awaitingSnapshot) {
            rec.heldChunks.push(chunk);
          } else {
            rec.term?.write(chunk);
          }
          break;
        }
      }
    });
    bridge.onExit((sessionId) => {
      for (const rec of recordsRef.current.values()) {
        if (rec.sessionId === sessionId) {
          rec.term?.write('\r\n[process exited]\r\n');
          break;
        }
      }
    });
  }, [bridge]);

  // Seed lifecycle (seed-opens-new-tab capability, ADR-0186 — SUPERSEDES the old terminal-dock-seed
  // write-to-the-active-session behaviour): on a NEW seed token, expand the dock and open A FRESH TAB
  // via the SAME `openSession` the "+" control uses — never reuse/write into an existing (possibly
  // ACTIVE, possibly the user's own interactive Claude Code) session. `openSession` makes the fresh
  // tab active and carries the command as that tab's `pendingSeed`, which `initTab`'s spawn `.then`
  // writes once (no trailing newline — pre-fill, never auto-run) the moment the fresh tab's own
  // `bridge.spawn()` resolves — so an async spawn never drops the command, and it is written to THAT
  // tab's session only. The token is a NONCE (not a cache key): a bump always opens ANOTHER fresh tab,
  // even for an identical command; the same token re-rendering is a no-op. A seed with no bridge
  // (studio-standalone) is inert — no spawn, no write, no crash.
  useEffect(() => {
    if (!seed || !bridge) return;
    if (seedTokenRef.current === seed.token) return; // same token = no-op, even for the same command
    seedTokenRef.current = seed.token;

    setExpanded(true);
    openSession(seed.command);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed?.token, seed?.command, bridge, openSession]);

  // ADR-0189 — on dock UNMOUNT (never a plain fold/unfold or a tab switch), dispose every tab's
  // RENDERER resources only (xterm + fit) and clear the session table (so a stale bridge callback
  // never writes a disposed xterm) — but call NO `bridge.dispose`: sessions are app-owned and survive
  // unmount, re-attaching via `bridge.list()`/`snapshot()` on the next mount.
  useEffect(() => {
    return () => {
      for (const rec of recordsRef.current.values()) {
        rec.fit?.dispose();
        rec.term?.dispose();
      }
      recordsRef.current.clear();
    };
  }, []);

  // Contract 6 — re-focus the ACTIVE tab's mounted xterm after a window blur/focus cycle (another
  // window/app had stolen focus; the user clicks back). xterm's hidden input textarea does not regain
  // focus on its own, so we drive it explicitly on the events that mean "the user is back on the
  // terminal": the window regaining focus, a click/mousedown on the dock body, and the document coming
  // back visible. A no-op while nothing is mounted (folded dock / absent bridge / no tabs yet).
  useEffect(() => {
    const refocus = (): void => {
      const id = activeIdRef.current;
      if (id === null) return;
      recordsRef.current.get(id)?.term?.focus();
    };
    const onWindowFocus = (): void => refocus();
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') refocus();
    };
    window.addEventListener('focus', onWindowFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onWindowFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Resize by dragging the top edge: UP (smaller clientY) GROWS the dock, DOWN shrinks it. Each move
  // re-fits the ACTIVE tab's terminal (which forwards the new geometry to the bridge via `onResize`
  // above) and clamps the dock height to [MIN_HEIGHT, maxHeight(asideRef.current)].
  const onDragStart = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault(); // suppress text selection while dragging
      drag.current = { startY: e.clientY, startHeight: height };

      const onMove = (ev: MouseEvent): void => {
        const d = drag.current;
        if (!d) return;
        const next = d.startHeight + (d.startY - ev.clientY); // up = larger height
        setHeight(clamp(next, MIN_HEIGHT, maxHeight(asideRef.current)));
        const id = activeIdRef.current;
        if (id !== null) recordsRef.current.get(id)?.fit?.fit();
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

  if (!bridge) {
    // Studio-standalone: no desktop preload. Never spawn, never hang, never crash the surrounding
    // studio — an honest disabled state instead.
    return (
      <aside className="terminal-dock terminal-dock-disabled">
        <div className="terminal-dock-unavailable">Terminal unavailable here</div>
      </aside>
    );
  }

  return (
    <aside
      ref={asideRef}
      className="terminal-dock"
      // position:absolute → the dock overlays the MAP FRAME (its positioned offsetParent,
      // .world-frame), matching ChatDock's overlay geometry.
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
          aria-label="resize terminal"
          className="terminal-dock-resize"
          onMouseDown={onDragStart}
        />
      )}

      <button
        type="button"
        className={`terminal-dock-toggle${expanded ? ' terminal-dock-toggle-expanded' : ''}`}
        aria-expanded={expanded}
        aria-label={expanded ? 'collapse terminal' : 'expand terminal'}
        onClick={toggleDock}
      >
        <span className="terminal-dock-toggle-chevron" aria-hidden="true">
          {expanded ? '▾' : '▴'}
        </span>
      </button>

      {/* Contract 7 — an optional passive render slot in the dock's own header, top-right. A
          SIBLING of the toggle button (never nested inside it — no nested interactive controls
          inside a <button>). Absent by default: no container at all when `headerRight` is not
          provided, keeping the header byte-identical to before. Renders ONCE per dock, never per tab. */}
      {headerRight != null && (
        <div className="terminal-dock-header-right">{headerRight}</div>
      )}

      {/* The tab strip — between the dock header (above) and the tab panes (below). One tab per open
          session; the active one highlighted. Chrome, so it renders regardless of fold state, same as
          the toggle above it. */}
      <div className="terminal-dock-tabs">
        {tabIds.map((id, i) => (
          <div
            key={id}
            className={`terminal-dock-tab${id === activeId ? ' terminal-dock-tab-active' : ''}`}
          >
            <button
              type="button"
              className="terminal-dock-tab-switch"
              aria-label={`tab ${i + 1}`}
              onClick={() => setActiveId(id)}
            >
              {i + 1}
            </button>
            <button
              type="button"
              className="terminal-dock-tab-close"
              aria-label={`close tab ${i + 1}`}
              onClick={() => closeTab(id)}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="terminal-dock-tab-new"
          aria-label="new terminal tab"
          onClick={() => openSession(null)}
        >
          +
        </button>
      </div>

      {/* Each tab's xterm mount stays MOUNTED under `hidden` (not conditional render), preserving the
          session across a fold → unfold or a switch away and back. Only the active tab's pane is
          visible while the dock is expanded. */}
      {tabIds.map((id) => (
        <div
          key={id}
          className="terminal-dock-body"
          hidden={!expanded || id !== activeId}
          ref={(el) => {
            const rec = recordsRef.current.get(id);
            if (rec) rec.bodyEl = el;
          }}
          onMouseDown={() => recordsRef.current.get(id)?.term?.focus()}
        />
      ))}
    </aside>
  );
}
