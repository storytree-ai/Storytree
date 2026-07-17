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
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';

/** Drag bounds for the expanded dock height (px) — mirrors ChatDock's MIN/DEFAULT/margin. */
const MIN_HEIGHT = 160;
const DEFAULT_HEIGHT = 320;
const VIEWPORT_MARGIN = 100;

/** Flow-control ack grain (chars) — consumed chars accumulate per tab and are acked to the main in
 *  batches of at least this size (VS Code's FlowControlConstants ack grain), never per-chunk. Keep
 *  it no larger than the main's watermark constants (pause 100,000 / resume 5,000 —
 *  apps/desktop/src/backend/pty-session-manager.ts; duplicated literal, the thin-client boundary
 *  forbids importing desktop code) or a paused pty starves waiting for a grain that never fills. */
const ACK_GRAIN_CHARS = 5_000;

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
  /** ADR-0189 re-attach slice, re-shaped by ADR-0190: the session's main-held SERIALIZED SCREEN STATE
   *  (`data`) at the dims it was recorded at (`cols`/`rows`), replayed into a fresh xterm on
   *  re-attach. An older preload may still resolve the pre-ADR-0190 bare scrollback string. */
  snapshot?(sessionId: string): Promise<string | { data: string; cols: number; rows: number }>;
  /** OPTIONAL (feature-guarded like `list?`/`snapshot?` — an older preload lacks it): the Windows OS
   *  build number, for xterm's ConPTY heuristics (`windowsPty` — without them a row-increase resize
   *  can LOSE data, and reflow runs on conpty builds where it must not). Present ONLY when the
   *  desktop preload runs on win32, so its presence doubles as the platform signal — never set on
   *  any other OS. A plain synchronous value (not a method): it must exist BEFORE the first
   *  Terminal is constructed, and an async main round-trip would race `initTab`. */
  windowsBuildNumber?: number;
  /** OPTIONAL (feature-guarded like `list?`/`snapshot?` — an older preload lacks it): flow-control
   *  acknowledgement — reports chars this renderer has actually CONSUMED (xterm parse-complete) so
   *  the main can pause the pty past its high watermark and resume it as the renderer catches up.
   *  Without it the main never pauses (an un-acking renderer must not wedge the pty). */
  ack?(sessionId: string, charCount: number): void;
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
  /** Flow control: consumed-but-not-yet-acked chars (the ACK_GRAIN_CHARS accumulator). */
  ackPending: number;
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

  // The body-row wrapper (panel + panes) — observed by a ResizeObserver so a bare container-size
  // change (no drag, no tab switch — e.g. a window/layout resize) still refits the active terminal.
  const bodyRowRef = useRef<HTMLDivElement>(null);

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
      ackPending: 0,
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
      ackPending: 0,
    });
    setTabIds((prev) => [...prev, id]);
    setActiveId(id);
    return id;
  }, []);

  /** Write LIVE pty data into a tab's xterm, acknowledging consumption back to the main (flow
   *  control, feature-guarded on `bridge.ack` — an older preload lacks it and gets plain writes).
   *  The ack signal is xterm's `write(data, callback)`, which fires on PARSE-COMPLETE — not on IPC
   *  receipt: data sitting unparsed in xterm's write buffer is exactly the backlog the main's
   *  watermarks exist to bound. Acks accumulate per tab and flush in ACK_GRAIN_CHARS batches.
   *  Renderer-generated text (the snapshot replay, '[process exited]') is written plain — it was
   *  never counted unacked by the main. */
  const writePtyData = useCallback(
    (rec: TabRecord, chunk: string): void => {
      const term = rec.term;
      if (!term) return;
      if (!bridge?.ack) {
        term.write(chunk);
        return;
      }
      term.write(chunk, () => {
        rec.ackPending += chunk.length;
        if (rec.ackPending >= ACK_GRAIN_CHARS && rec.sessionId) {
          bridge.ack?.(rec.sessionId, rec.ackPending);
          rec.ackPending = 0;
        }
      });
    },
    [bridge],
  );

  /** Mount xterm into a tab's committed body div and spawn its (independent) bridge session — guarded
   *  so a tab already carrying a `term` is never re-initialised (mirrors the old termRef guard, per
   *  tab). Runs once the tab's body div has committed (see the tabIds effect below). */
  const initTab = useCallback(
    (id: number): void => {
      const rec = recordsRef.current.get(id);
      if (!bridge || !rec || rec.term || !rec.bodyEl) return;

      const buildNumber = bridge.windowsBuildNumber;
      const term = new Terminal({
        cursorBlink: true,
        convertEol: true,
        // The unicode-version surface (`term.unicode`, the Unicode11Addon's registration point) is
        // a PROPOSED API in xterm 5.x — without this flag the activation below THROWS at runtime
        // (a class the mocked vitest seam cannot see; the e2e caught it). The headless snapshot
        // terminal (pty-session-manager.ts) sets the same flag.
        allowProposedApi: true,
        // Scrollback PARITY with the main-held headless screen model (DEFAULT_SCROLLBACK_LINES in
        // apps/desktop/src/backend/pty-session-manager.ts): xterm's 1,000-line default holds fewer
        // lines than a re-attach can replay. Duplicated literal by design — the thin-client
        // boundary forbids importing desktop code; keep the two aligned.
        scrollback: 5000,
        // ConPTY heuristics (Windows only — the bridge carries `windowsBuildNumber` ONLY on a
        // win32 desktop preload): without `windowsPty` a row-increase resize can LOSE data
        // (ConPTY emits empty rows instead of restoring scrollback) and reflow runs on conpty
        // builds where it must not (< 21376). The key is OMITTED entirely elsewhere — xterm
        // treats its presence as "apply ConPTY behaviour".
        ...(typeof buildNumber === 'number' && buildNumber > 0
          ? { windowsPty: { backend: 'conpty' as const, buildNumber } }
          : {}),
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      fit.activate(term); // wire the addon to this terminal so a later fit()/dispose() has effect
      // Unicode 11 width tables, in PARITY with the main's headless snapshot terminal
      // (pty-session-manager.ts): xterm's Unicode 6 default mis-measures emoji/spinner/box glyphs
      // (Claude Code's staple output) so the next glyph draws into an overlapping cell — and
      // one-sided tables would make a re-attach replay re-wrap differently than live rendering.
      term.loadAddon(new Unicode11Addon());
      term.unicode.activeVersion = '11';
      term.open(rec.bodyEl);
      rec.term = term;
      rec.fit = fit;

      // Contract 13 — render on xterm's GPU (WebGL) renderer, not the DOM fallback renderer whose
      // documented rendering issues are the owner-reported artifact class (stale glyphs pinned at
      // the pane edges after a resize/scroll). Loaded AFTER open() — the addon needs the mounted
      // element. Falls back HONESTLY: a box with no usable WebGL context throws here and the
      // session simply stays on the DOM renderer (functional, never a crash); a LATER context loss
      // disposes the addon, which reverts xterm to the DOM renderer rather than leaving a dead
      // canvas. The addon is term-owned after loadAddon — term.dispose() reaps it with the tab.
      try {
        const webgl = new WebglAddon();
        term.loadAddon(webgl);
        webgl.onContextLoss(() => webgl.dispose());
      } catch {
        /* no WebGL context — xterm's DOM renderer stays active */
      }

      // Contract 12 — Ctrl+C-copy / Ctrl+V-paste (the owner-reported keyboard-wiring defect): xterm
      // otherwise always consumes Ctrl+C and forwards '\x03'/SIGINT to the pty, so a selection could
      // never be copied to the clipboard. With a selection, Ctrl+C copies it and returns `false`
      // (suppressing xterm's default handling, so no interrupt reaches the bridge); with NO selection
      // it returns `true` (xterm's normal handling — the interrupt still fires). Ctrl+V reads the
      // clipboard and pastes it through xterm's own bracketed-paste entry point. Any other event
      // (non-keydown, an unrelated key, or an absent `navigator.clipboard`) is left untouched — return
      // `true`, xterm's default handling, and never throw.
      term.attachCustomKeyEventHandler((event: KeyboardEvent): boolean => {
        if (
          event.type !== 'keydown' ||
          !event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.metaKey
        ) {
          return true;
        }
        const clipboard: Clipboard | undefined =
          typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (event.key === 'c') {
          if (clipboard && term.hasSelection()) {
            void clipboard.writeText(term.getSelection());
            return false;
          }
          return true;
        }
        if (event.key === 'v') {
          if (!clipboard) return true;
          void clipboard.readText().then((text) => term.paste(text));
          return false;
        }
        return true;
      });

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
          void bridge.snapshot(rec.sessionId).then((result) => {
            // ADR-0190 re-shape: `result` is either the pre-ADR-0190 bare scrollback string (an
            // older preload) or `{ data, cols, rows }` — the serialized screen state AT THE DIMS IT
            // WAS RECORDED AT. For the latter, resize the fresh xterm to those recorded dims BEFORE
            // writing the data, so the write lands on a terminal the exact size the screen was
            // captured at (the resize forwards to the pty via the onResize -> bridge.resize wiring
            // above, since `rec.sessionId` is already set for an adopted tab).
            const data = typeof result === 'string' ? result : result.data;
            if (typeof result !== 'string') term.resize(result.cols, result.rows);
            term.write(data);
            // Held chunks are LIVE pty data (counted unacked by the main) — write them through
            // the acking path; the snapshot replay above is not (the main reset its count when
            // it answered snapshot()).
            for (const chunk of rec.heldChunks) writePtyData(rec, chunk);
            rec.heldChunks = [];
            rec.awaitingSnapshot = false;
            // Then fit to the real container, forwarding the FITTED dims to the pty (the same
            // onResize -> bridge.resize wiring) — so the resident TUI receives a real resize and
            // repaints itself into the terminal's actual geometry.
            fit.fit();
          });
        } else {
          rec.awaitingSnapshot = false;
        }
        return;
      }

      // Contract 10 (ADR-0190) — fit the fresh terminal to its container BEFORE spawning, and
      // forward the resulting dims into the spawn call, so a new pty starts at the terminal's REAL
      // size, never xterm's 80x24 default under a wide dock. `rec.sessionId` is still null here (an
      // adopted tab returned above), so the fit's own `onResize` firing is a no-op for the bridge.
      fit.fit();
      void bridge.spawn({ cols: term.cols, rows: term.rows }).then((res) => {
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
    [bridge, writePtyData],
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
            writePtyData(rec, chunk);
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
  }, [bridge, writePtyData]);

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

  // Contract 11 (ADR-0190) — re-fit the ACTIVE tab's terminal to its container whenever it becomes
  // the visible pane (a tab switch) or the dock re-expands (fold -> unfold), forwarding the new
  // geometry to the pty through the SAME onResize -> bridge.resize wiring the drag handle uses
  // (contract 3). A no-op while folded (nothing visible to fit) or before any tab is active.
  useEffect(() => {
    if (!expanded || activeId === null) return;
    recordsRef.current.get(activeId)?.fit?.fit();
  }, [expanded, activeId]);

  // The remaining fit-lifecycle gap (ADR-0190) — a ResizeObserver on the body-row wrapper notices a
  // bare container-size change (no drag, no tab switch — e.g. a window/layout resize) and re-fits the
  // ACTIVE tab's terminal, forwarding the new geometry to the pty through the SAME onResize ->
  // bridge.resize wiring contracts 3/11 use. Installed once per dock (guarded on `bridge`/the element
  // existing), never per tab.
  useEffect(() => {
    if (!bridge) return;
    const el = bodyRowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const id = activeIdRef.current;
      if (id !== null) recordsRef.current.get(id)?.fit?.fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [bridge]);

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

      {/* The session panel (ADR-0190 §3) — sits BESIDE the terminal panes, down the right of the dock
          body, inside a shared `.terminal-dock-body-row` wrapper (never a strip between the header
          and the panes). One row per session — carrying a readable label with at least its ordinal —
          plus the panel's own "+" spawn control. The chrome (this whole row wrapper) renders
          regardless of fold state, same as the toggle above it; only the ACTIVE pane is visible while
          expanded. */}
      <div
        ref={bodyRowRef}
        className="terminal-dock-body-row"
        style={{ display: 'flex', flexDirection: 'row' }}
      >
        <div className="terminal-dock-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          {tabIds.map((id, i) => (
            <div
              key={id}
              className={`terminal-dock-tab terminal-dock-panel-row${
                id === activeId ? ' terminal-dock-panel-row-active' : ''
              }`}
            >
              <button
                type="button"
                className="terminal-dock-panel-row-switch"
                aria-label={`tab ${i + 1}`}
                onClick={() => setActiveId(id)}
              >
                Session {i + 1}
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
            className="terminal-dock-panel-new"
            aria-label="new terminal tab"
            onClick={() => openSession(null)}
          >
            +
          </button>
        </div>

        {/* Each tab's xterm mount stays MOUNTED under `hidden` (not conditional render), preserving
            the session across a fold → unfold or a switch away and back. Only the active tab's pane
            is visible while the dock is expanded. */}
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
      </div>
    </aside>
  );
}
