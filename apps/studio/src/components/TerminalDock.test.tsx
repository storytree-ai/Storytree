// @vitest-environment jsdom
//
// terminal-dock-panel capability (embedded-terminal story, ADR-0174 renderer half). An integration
// test over TWO mocked seams — the xterm module (`@xterm/xterm` + `@xterm/addon-fit`) and the
// `desktopTerminal` contextBridge (`window.desktopTerminal`) — exactly as ChatDock/ChatPanel mock
// their seam (`../api`). These pin GEOMETRY/BEHAVIOUR/WIRING ONLY — the terminal's APPEARANCE
// ("reads and behaves like a real terminal") is the story's operator-attested UAT leg 5 (ADR-0070);
// no color/pixel/visual assertion lives here.
//
//   • spawn-on-open + pty-output → terminal wiring     (tdp-spawns-on-open-and-writes-data)
//   • terminal-input → pty wiring                       (tdp-forwards-input-to-bridge)
//   • resize wiring + the reused dock clamp geometry     (tdp-resizes-with-the-dock)
//   • visibility toggle keeps the terminal MOUNTED       (tdp-toggles-visibility-keeping-terminal-mounted)
//   • honest disabled state when the bridge is absent    (tdp-degrades-when-bridge-absent)
//
// THIN CLIENT: TerminalDock reaches the pty ONLY through `window.desktopTerminal` (mocked here — no
// real IPC / pty / Electron) and mounts an xterm `Terminal` (mocked here — jsdom lays out no real
// terminal, the same discipline ChatPanel.test.tsx uses on `../api`). It imports no
// `@storytree/agent` / `@storytree/drive` (modelPathBoundary.test.ts stays green).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// ── the fake xterm Terminal — records write/onData/open/resize/dispose, and fires `onResize` on
//    ANY resize() call (including one driven by the fake FitAddon's `fit()`) — mirroring real
//    xterm's onResize-fires-on-resize behaviour, so the resize→bridge wiring is genuinely exercised,
//    not just a shape the test hands itself. ─────────────────────────────────────────────────────
const xtermMock = vi.hoisted(() => {
  class FakeTerminal {
    static instances: FakeTerminal[] = [];
    written: string[] = [];
    opened: HTMLElement | null = null;
    disposed = false;
    cols = 80;
    rows = 24;
    resized: Array<{ cols: number; rows: number }> = [];
    /** test-only: counts `term.focus()` calls — pins contract 6 (re-focus after a window blur/focus
     *  cycle) without asserting anything about real DOM focus, which jsdom's xterm mock has none of. */
    focusCalls = 0;
    private dataHandler: ((data: string) => void) | null = null;
    private resizeHandler: ((dims: { cols: number; rows: number }) => void) | null = null;
    constructor() {
      FakeTerminal.instances.push(this);
    }
    open(el: HTMLElement): void {
      this.opened = el;
    }
    focus(): void {
      this.focusCalls += 1;
    }
    write(data: string): void {
      this.written.push(data);
    }
    onData(cb: (data: string) => void): void {
      this.dataHandler = cb;
    }
    onResize(cb: (dims: { cols: number; rows: number }) => void): void {
      this.resizeHandler = cb;
    }
    resize(cols: number, rows: number): void {
      this.cols = cols;
      this.rows = rows;
      this.resized.push({ cols, rows });
      this.resizeHandler?.({ cols, rows });
    }
    loadAddon(): void {
      /* no-op — the fake FitAddon wires itself via activate() below */
    }
    dispose(): void {
      this.disposed = true;
    }
    /** test-only: simulate the user typing into the (fake) terminal. */
    typeIn(data: string): void {
      this.dataHandler?.(data);
    }
  }
  return { FakeTerminal };
});
vi.mock('@xterm/xterm', () => ({ Terminal: xtermMock.FakeTerminal }));

// ── the fake FitAddon — `fit()` mirrors the real addon's job of resizing the terminal to the
//    (test-controlled) proposed dimensions, so the resize wiring is driven deterministically without
//    a real container layout (jsdom has no layout). ──────────────────────────────────────────────
const fitMock = vi.hoisted(() => {
  class FakeFitAddon {
    static instances: FakeFitAddon[] = [];
    nextDims: { cols: number; rows: number } = { cols: 80, rows: 24 };
    fitCalls = 0;
    disposed = false;
    private terminal: InstanceType<typeof xtermMock.FakeTerminal> | null = null;
    constructor() {
      FakeFitAddon.instances.push(this);
    }
    activate(terminal: InstanceType<typeof xtermMock.FakeTerminal>): void {
      this.terminal = terminal;
    }
    fit(): void {
      this.fitCalls += 1;
      this.terminal?.resize(this.nextDims.cols, this.nextDims.rows);
    }
    proposeDimensions(): { cols: number; rows: number } {
      return this.nextDims;
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { FakeFitAddon };
});
vi.mock('@xterm/addon-fit', () => ({ FitAddon: fitMock.FakeFitAddon }));

// ── the desktopTerminal bridge — installed on `window` per test (deleted for the absent-bridge
//    case). `spawn` resolves asynchronously (a real IPC round-trip would too), so tests await a
//    flush before asserting the spawned Terminal. ────────────────────────────────────────────────
const SESSION_ID = 'sess-1';
const bridgeMock = vi.hoisted(() => ({
  spawn: vi.fn<(opts?: unknown) => Promise<{ sessionId: string }>>(async () => ({
    sessionId: 'sess-1',
  })),
  write: vi.fn<(sessionId: string, data: string) => void>(),
  resize: vi.fn<(sessionId: string, cols: number, rows: number) => void>(),
  dispose: vi.fn<(sessionId: string) => void>(),
  onData: vi.fn<(cb: (sessionId: string, chunk: string) => void) => void>(),
  onExit: vi.fn<(cb: (sessionId: string, e: { exitCode: number }) => void) => void>(),
}));

import { TerminalDock } from './TerminalDock';

/** Flush the microtask queue the bridge's `spawn()` promise resolves on. */
const flush = (): Promise<void> => act(async () => {});

/** The single toggle (folded → expand, expanded → collapse), found by aria-label — mirrors ChatDock's
 *  toggle pattern. */
function toggle(): HTMLElement {
  return screen.getByRole('button', { name: /(expand|collapse) terminal/i });
}

/** The dock root; its inline height (px) is the geometry the drag mechanics move (ChatDock pattern). */
function dockRoot(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.terminal-dock');
  if (!el) throw new Error('.terminal-dock root not found');
  return el as HTMLElement;
}
function heightPx(el: HTMLElement): number {
  return parseFloat(el.style.height || '0');
}

/** Expand the dock and let the bridge's spawn() promise resolve. */
async function expand(): Promise<void> {
  fireEvent.click(toggle());
  await flush();
}

beforeEach(() => {
  xtermMock.FakeTerminal.instances.length = 0;
  fitMock.FakeFitAddon.instances.length = 0;
  bridgeMock.spawn.mockClear();
  bridgeMock.write.mockClear();
  bridgeMock.resize.mockClear();
  bridgeMock.dispose.mockClear();
  bridgeMock.onData.mockClear();
  bridgeMock.onExit.mockClear();
  (window as unknown as { desktopTerminal?: typeof bridgeMock }).desktopTerminal = bridgeMock;
});

afterEach(() => {
  cleanup();
  delete (window as unknown as { desktopTerminal?: typeof bridgeMock }).desktopTerminal;
});

describe('TerminalDock', () => {
  // ── tdp-spawns-on-open-and-writes-data ───────────────────────────────────────
  it('tdp-spawns-on-open-and-writes-data: opening the terminal spawns over the bridge and pipes bridge data into xterm', async () => {
    const { container } = render(<TerminalDock />);

    // Folded by default: no session spawned yet, no terminal instantiated.
    expect(bridgeMock.spawn).not.toHaveBeenCalled();
    expect(xtermMock.FakeTerminal.instances.length).toBe(0);

    await expand();

    // Opening spawns exactly once and mounts the (fake) xterm into the dock's container.
    expect(bridgeMock.spawn).toHaveBeenCalledTimes(1);
    expect(xtermMock.FakeTerminal.instances.length).toBe(1);
    const term = xtermMock.FakeTerminal.instances[0]!;
    expect(term.opened).not.toBeNull();
    expect(container.contains(term.opened)).toBe(true);

    // The component subscribed to the bridge's data stream exactly once.
    expect(bridgeMock.onData).toHaveBeenCalledTimes(1);
    const onData = bridgeMock.onData.mock.calls[0]![0];

    onData(SESSION_ID, 'hello ');
    onData(SESSION_ID, 'world\n');

    expect(term.written).toEqual(['hello ', 'world\n']);
  });

  // ── tdp-forwards-input-to-bridge ─────────────────────────────────────────────
  it('tdp-forwards-input-to-bridge: terminal keystrokes are forwarded to the bridge write', async () => {
    render(<TerminalDock />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    term.typeIn('ls\n');

    expect(bridgeMock.write).toHaveBeenCalledWith(SESSION_ID, 'ls\n');
  });

  // ── tdp-resizes-with-the-dock ────────────────────────────────────────────────
  it('tdp-resizes-with-the-dock: dragging the dock resize edge refits the terminal, forwards the new geometry to the bridge, and clamps the dock height', async () => {
    const { container } = render(<TerminalDock />);
    await expand();

    const root = dockRoot(container);
    const start = heightPx(root);
    expect(start).toBe(320); // the DEFAULT expanded height, mirroring ChatDock

    const fit = fitMock.FakeFitAddon.instances[0]!;
    fit.nextDims = { cols: 132, rows: 45 };

    const handle = screen.getByRole('separator', { name: /resize/i });

    // Drag UP by 100px (smaller clientY) → the dock grows, and the drag refits the terminal.
    fireEvent.mouseDown(handle, { clientY: 600 });
    fireEvent.mouseMove(window, { clientY: 500 });
    fireEvent.mouseUp(window);

    const grown = heightPx(dockRoot(container));
    expect(grown).toBeGreaterThan(start);
    expect(Math.abs(grown - (start + 100))).toBeLessThanOrEqual(2);

    // The fit recomputed and the new geometry was forwarded to the bridge as the pty resize.
    expect(fit.fitCalls).toBeGreaterThan(0);
    expect(bridgeMock.resize).toHaveBeenCalledWith(SESSION_ID, 132, 45);

    // An extreme DOWN drag clamps at the floor (never below 160, ChatDock's MIN_HEIGHT).
    fireEvent.mouseDown(handle, { clientY: 0 });
    fireEvent.mouseMove(window, { clientY: 100000 });
    fireEvent.mouseUp(window);
    const floored = heightPx(dockRoot(container));
    expect(floored).toBeGreaterThanOrEqual(160);
    expect(floored).toBeLessThan(grown);
  });

  // ── tdp-toggles-visibility-keeping-terminal-mounted ──────────────────────────
  it('tdp-toggles-visibility-keeping-terminal-mounted: collapse/expand keeps the terminal mounted, the session preserved', async () => {
    const { container } = render(<TerminalDock />);
    await expand();

    expect(bridgeMock.spawn).toHaveBeenCalledTimes(1);
    const term = xtermMock.FakeTerminal.instances[0]!;

    fireEvent.click(toggle()); // collapse
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    const body = container.querySelector('.terminal-dock-body');
    expect(body?.hasAttribute('hidden')).toBe(true);

    fireEvent.click(toggle()); // expand again
    await flush();

    // No re-spawn, no new Terminal instantiated, no dispose in between — the SAME session/instance.
    expect(bridgeMock.spawn).toHaveBeenCalledTimes(1);
    expect(xtermMock.FakeTerminal.instances.length).toBe(1);
    expect(xtermMock.FakeTerminal.instances[0]).toBe(term);
    expect(term.disposed).toBe(false);
    expect(container.querySelector('.terminal-dock-body')?.hasAttribute('hidden')).toBe(false);
  });

  // ── tdp-refocuses-after-window-focus-cycle (contract 6) ─────────────────
  it('tdp-refocuses-after-window-focus-cycle: window focus, a click on the dock body, and visibilitychange-to-visible all re-focus the mounted terminal', async () => {
    render(<TerminalDock />);

    // Not yet mounted (folded, no session): none of the refocus triggers should touch a terminal
    // instance or throw — there is nothing mounted to focus yet.
    expect(() => fireEvent(window, new Event('focus'))).not.toThrow();
    expect(xtermMock.FakeTerminal.instances.length).toBe(0);

    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    expect(term.focusCalls).toBe(0);

    // The Electron window regaining focus (another window/app had stolen it, the user clicks back)
    // must re-focus the mounted xterm so keystrokes reach it again.
    fireEvent(window, new Event('focus'));
    expect(term.focusCalls).toBeGreaterThan(0);
    const afterWindowFocus = term.focusCalls;

    // A mousedown on the dock body — the user clicking directly onto the terminal — also re-focuses.
    const body = document.querySelector('.terminal-dock-body') as HTMLElement;
    fireEvent.mouseDown(body);
    expect(term.focusCalls).toBeGreaterThan(afterWindowFocus);
    const afterBodyClick = term.focusCalls;

    // The document coming back to `visible` (tab/app foregrounded) also re-focuses.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    fireEvent(document, new Event('visibilitychange'));
    expect(term.focusCalls).toBeGreaterThan(afterBodyClick);
  });

  // ── tdp-degrades-when-bridge-absent ──────────────────────────────────────────
  it('tdp-degrades-when-bridge-absent: an absent desktopTerminal bridge renders an honest disabled state, never spawns/hangs', () => {
    delete (window as unknown as { desktopTerminal?: typeof bridgeMock }).desktopTerminal;

    expect(() => render(<TerminalDock />)).not.toThrow();

    expect(screen.getByText(/terminal unavailable/i)).toBeTruthy();
    expect(bridgeMock.spawn).not.toHaveBeenCalled();
    expect(xtermMock.FakeTerminal.instances.length).toBe(0);
  });
});
