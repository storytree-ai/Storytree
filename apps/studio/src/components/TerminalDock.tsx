// TerminalDock — the renderer xterm.js terminal dock (terminal-dock-panel capability, ADR-0174 renderer
// half). Reuses ChatDock's TESTED collapse/resize dock geometry (folded-by-default bottom overlay,
// drag-to-resize the top edge, clamped to the map frame) as the chrome around an xterm.js `Terminal`
// wired to the `desktopTerminal` contextBridge the desktop preload injects on `window`.
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
}

export function TerminalDock({ seed }: TerminalDockProps = {}): React.JSX.Element {
  const bridge = getDesktopTerminal();

  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  // Drag bookkeeping in a ref so the window listeners read live values, not a stale closure.
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  // The dock root — its offsetParent is the positioned map frame (.world-frame), the clamp ceiling.
  const asideRef = useRef<HTMLElement>(null);
  // The xterm mount point — stays MOUNTED across fold/unfold (`hidden`, never conditional render) so
  // the terminal + session survive a toggle.
  const bodyRef = useRef<HTMLDivElement>(null);

  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Seed bookkeeping: the last-applied token (so a re-render with the SAME token is a no-op, keyed
  // on the token — a nonce — never the command string) and a PENDING seed command, held when the
  // seed arrives before the async `spawn()` below has resolved a session (write it once it does).
  const seedTokenRef = useRef<number | null>(null);
  const pendingSeedRef = useRef<string | null>(null);

  const toggle = useCallback((): void => {
    setExpanded((e) => !e);
  }, []);

  // Spawn a session + mount xterm the FIRST time the dock is expanded — guarded by `termRef.current` so
  // a later fold/unfold never re-spawns or re-mounts (the same session/instance persists).
  useEffect(() => {
    if (!expanded || !bridge || termRef.current || !bodyRef.current) return;

    const term = new Terminal({ cursorBlink: true, convertEol: true });
    const fit = new FitAddon();
    term.loadAddon(fit);
    fit.activate(term); // wire the addon to this terminal so a later fit()/dispose() has effect
    term.open(bodyRef.current);
    termRef.current = term;
    fitRef.current = fit;

    // Terminal input → bridge write (only once a session exists to write to).
    term.onData((data) => {
      const sessionId = sessionIdRef.current;
      if (sessionId) bridge.write(sessionId, data);
    });
    // Terminal resize (driven by our fit() calls) → forward the new pty geometry.
    term.onResize(({ cols, rows }) => {
      const sessionId = sessionIdRef.current;
      if (sessionId) bridge.resize(sessionId, cols, rows);
    });

    // Bridge data stream → xterm write, scoped to THIS session.
    bridge.onData((sessionId, chunk) => {
      if (sessionId === sessionIdRef.current) term.write(chunk);
    });
    // Bridge exit → an honest terminal message; the dock stays mounted (no crash, no re-spawn).
    bridge.onExit((sessionId) => {
      if (sessionId === sessionIdRef.current) term.write('\r\n[process exited]\r\n');
    });

    void bridge.spawn().then((res) => {
      sessionIdRef.current = res.sessionId;

      // A seed that arrived before this session resolved was held PENDING — write it now, exactly
      // once, as a pre-fill (no trailing newline: reviewed by the user, never auto-run).
      const pendingCommand = pendingSeedRef.current;
      if (pendingCommand !== null) {
        pendingSeedRef.current = null;
        bridge.write(res.sessionId, pendingCommand);
      }
    });
  }, [expanded, bridge]);

  // Seed lifecycle (terminal-dock-seed capability): on a NEW seed token, expand the dock and ensure a
  // session — reusing the spawn-on-first-expand effect above via `setExpanded(true)`, never a second
  // spawn — then write the command as a pre-fill. If a session already exists, write immediately;
  // otherwise hold it PENDING (above) for the spawn's `.then` to write once resolved. A seed with no
  // bridge (studio-standalone) is inert — no spawn, no write, no crash.
  useEffect(() => {
    if (!seed || !bridge) return;
    if (seedTokenRef.current === seed.token) return; // same token = no-op, even for the same command
    seedTokenRef.current = seed.token;

    setExpanded(true);

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      bridge.write(sessionId, seed.command);
    } else {
      pendingSeedRef.current = seed.command;
    }
  }, [seed?.token, seed?.command, bridge]);

  // Dispose the session/instance only when the dock itself unmounts, never on a plain fold/unfold.
  useEffect(() => {
    return () => {
      fitRef.current?.dispose();
      termRef.current?.dispose();
      const sessionId = sessionIdRef.current;
      if (sessionId && bridge) bridge.dispose(sessionId);
    };
  }, [bridge]);

  // Contract 6 — re-focus the mounted xterm after a window blur/focus cycle (another window/app had
  // stolen focus; the user clicks back). xterm's hidden input textarea does not regain focus on its
  // own, so we drive it explicitly on the events that mean "the user is back on the terminal": the
  // window regaining focus, a click/mousedown on the dock body, and the document coming back visible.
  // Guarded by `termRef.current` — a no-op while nothing is mounted (folded dock / absent bridge).
  useEffect(() => {
    const refocus = (): void => {
      termRef.current?.focus();
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
  // re-fits the terminal (which forwards the new geometry to the bridge via `onResize` above) and
  // clamps the dock height to [MIN_HEIGHT, maxHeight(asideRef.current)].
  const onDragStart = useCallback(
    (e: React.MouseEvent): void => {
      e.preventDefault(); // suppress text selection while dragging
      drag.current = { startY: e.clientY, startHeight: height };

      const onMove = (ev: MouseEvent): void => {
        const d = drag.current;
        if (!d) return;
        const next = d.startHeight + (d.startY - ev.clientY); // up = larger height
        setHeight(clamp(next, MIN_HEIGHT, maxHeight(asideRef.current)));
        fitRef.current?.fit();
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
        onClick={toggle}
      >
        <span className="terminal-dock-toggle-chevron" aria-hidden="true">
          {expanded ? '▾' : '▴'}
        </span>
      </button>

      {/* The xterm mount stays MOUNTED under `hidden` (not conditional render), preserving the session
          across a fold → unfold. */}
      <div
        className="terminal-dock-body"
        hidden={!expanded}
        ref={bodyRef}
        onMouseDown={() => termRef.current?.focus()}
      />
    </aside>
  );
}
