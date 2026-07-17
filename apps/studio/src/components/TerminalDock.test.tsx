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
// multi-session-tabs capability (this file's newest additions) — the tab substrate: N independent
// sessions/panes, switched/created/closed, per-tab I/O scoping, per-dock chrome, an explicit per-tab
// close as the only renderer kill (ADR-0189 — sessions are APP-owned and survive dock unmount,
// superseding ADR-0186's dock-lifetime "dispose all on unmount" wall). Proven with `bridgeMock.spawn`
// resolving a FRESH sessionId per call (`sess-1`, `sess-2`, …) so a second tab's session is genuinely
// distinguishable from the first's:
//
//   • "+" opens an independent second session/pane        (mst-new-tab-spawns-independent-session)
//   • clicking a tab shows its pane, hides the others      (mst-switch-shows-selected-tab-pane)
//   • bridge data routes to the RIGHT tab's pane only      (mst-scopes-io-per-tab)
//   • toggle/headerRight stay ONE-per-dock, not per-tab    (mst-chrome-stays-per-dock)
//   • closing a tab disposes ONLY that tab's session       (mst-close-tab-disposes-its-session)
//   • unmount disposes RENDERER only, sessions survive     (mst-unmount-preserves-sessions)
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
    /** test-only: records every addon handed to `loadAddon` (fit, webgl, …) so a contract can
     *  assert WHICH renderer/addons were wired onto this terminal. */
    addons: unknown[] = [];
    /** test-only: counts `term.focus()` calls — pins contract 6 (re-focus after a window blur/focus
     *  cycle) without asserting anything about real DOM focus, which jsdom's xterm mock has none of. */
    focusCalls = 0;
    /** test-only: contract 12 (Ctrl+C-copy / Ctrl+V-paste) — the current "selection" text;
     *  `hasSelection()`/`getSelection()` read this, mirroring real xterm's own API, without a real
     *  selection model (jsdom lays out no terminal). */
    selection = '';
    /** test-only: contract 12 — records every `paste()` call, mirroring real xterm's bracketed-paste
     *  entry point. */
    pasted: string[] = [];
    /** test-only: contract 12 — the handler `attachCustomKeyEventHandler` captures, mirroring real
     *  xterm's own hook; null until the source wires it (the missing-behaviour red this test pins:
     *  invoking a still-null handler is the RIGHT kind of red for the unbuilt wiring). */
    customKeyEventHandler: ((event: KeyboardEvent) => boolean) | null = null;
    /** test-only: the CONSTRUCTOR options this terminal was built with — the seam that pins the
     *  rendering-correctness constructor contracts (scrollback alignment, windowsPty). */
    options: Record<string, unknown>;
    /** test-only: mirrors real xterm's `unicode` handling surface — starts at xterm's Unicode 6
     *  default so the unicode11 contract genuinely observes the source flipping it to '11'. */
    unicode: { activeVersion: string } = { activeVersion: '6' };
    /** test-only: counts `term.clear()` calls — pins the ConPTY state-sync clear contract
     *  (frontend clear → xterm buffer cleared + bridge.clear forwarded) without a real buffer. */
    clearCalls = 0;
    /** test-only: increment D tab titles — the handler `onTitleChange` captures, mirroring real
     *  xterm's OSC 0/2 title hook; `fireTitleChange` simulates the app retitling its terminal. */
    titleHandler: ((title: string) => void) | null = null;
    private dataHandler: ((data: string) => void) | null = null;
    private resizeHandler: ((dims: { cols: number; rows: number }) => void) | null = null;
    constructor(options?: Record<string, unknown>) {
      this.options = options ?? {};
      FakeTerminal.instances.push(this);
    }
    open(el: HTMLElement): void {
      this.opened = el;
    }
    focus(): void {
      this.focusCalls += 1;
    }
    write(data: string, cb?: () => void): void {
      this.written.push(data);
      // Real xterm fires the write callback on PARSE-COMPLETE (the flow-control ack signal);
      // the fake "parses" synchronously, so the callback fires right away.
      cb?.();
    }
    onData(cb: (data: string) => void): void {
      this.dataHandler = cb;
    }
    onResize(cb: (dims: { cols: number; rows: number }) => void): void {
      this.resizeHandler = cb;
    }
    onTitleChange(cb: (title: string) => void): void {
      this.titleHandler = cb;
    }
    /** test-only: increment D — simulate the pty app changing its title (OSC 0/2). */
    fireTitleChange(title: string): void {
      this.titleHandler?.(title);
    }
    resize(cols: number, rows: number): void {
      this.cols = cols;
      this.rows = rows;
      this.resized.push({ cols, rows });
      this.resizeHandler?.({ cols, rows });
    }
    clear(): void {
      this.clearCalls += 1;
    }
    loadAddon(addon: unknown): void {
      // records the addon (the fake FitAddon still wires itself via activate() below) so the
      // renderer contract can assert the WebGL addon was loaded onto this terminal.
      this.addons.push(addon);
    }
    dispose(): void {
      this.disposed = true;
    }
    /** test-only: simulate the user typing into the (fake) terminal. */
    typeIn(data: string): void {
      this.dataHandler?.(data);
    }
    /** test-only: contract 12 — mirrors real xterm's own `hasSelection()`/`getSelection()`. */
    hasSelection(): boolean {
      return this.selection.length > 0;
    }
    getSelection(): string {
      return this.selection;
    }
    /** test-only: contract 12 — mirrors real xterm's own `paste()` (bracketed-paste); records the
     *  pasted text rather than touching a real terminal buffer. */
    paste(data: string): void {
      this.pasted.push(data);
    }
    /** test-only: contract 12 — mirrors real xterm's own `attachCustomKeyEventHandler`, capturing the
     *  handler so the test can invoke it directly with synthetic KeyboardEvent-shaped objects. */
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
      this.customKeyEventHandler = handler;
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

// ── the fake WebglAddon — the GPU renderer seam (tdp-renders-with-webgl-and-falls-back-honestly).
//    Records construction / the onContextLoss handler / dispose, and can be told to THROW on
//    construction (a box with no usable WebGL context) so the DOM-renderer fallback path is
//    exercised deterministically — jsdom has no GPU, exactly like such a box. ────────────────────
const webglMock = vi.hoisted(() => {
  class FakeWebglAddon {
    static instances: FakeWebglAddon[] = [];
    /** test-only: when true, the next construction throws — the no-WebGL-context box. */
    static failConstruction = false;
    disposed = false;
    contextLossHandler: (() => void) | null = null;
    constructor() {
      if (FakeWebglAddon.failConstruction) throw new Error('WebGL context unavailable');
      FakeWebglAddon.instances.push(this);
    }
    onContextLoss(cb: () => void): void {
      this.contextLossHandler = cb;
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { FakeWebglAddon };
});
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: webglMock.FakeWebglAddon }));

// ── the fake Unicode11Addon — the width-table seam (tdp-activates-unicode11-widths). Real xterm
//    defaults to Unicode 6 width tables (emoji/spinner/box glyphs mis-measured → overlapping
//    cells, the owner-reported edge-artifact class); the contract pins that the dock loads the
//    addon on EVERY tab's terminal and flips `unicode.activeVersion` to '11'. ──────────────────
const unicode11Mock = vi.hoisted(() => {
  class FakeUnicode11Addon {
    static instances: FakeUnicode11Addon[] = [];
    disposed = false;
    constructor() {
      FakeUnicode11Addon.instances.push(this);
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { FakeUnicode11Addon };
});
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: unicode11Mock.FakeUnicode11Addon }));

// ── the fake WebLinksAddon — the clickable-links seam (increment D). Captures the activation
//    handler the dock constructs it with, so the contract can invoke it with a URI and assert the
//    click routes over the feature-guarded bridge (NEVER window.open — the electerm CVE class,
//    GHSA-fwf6-j56g-m97c). ──────────────────────────────────────────────────────────────────────
const webLinksMock = vi.hoisted(() => {
  class FakeWebLinksAddon {
    static instances: FakeWebLinksAddon[] = [];
    handler: ((event: MouseEvent, uri: string) => void) | undefined;
    disposed = false;
    constructor(handler?: (event: MouseEvent, uri: string) => void) {
      this.handler = handler;
      FakeWebLinksAddon.instances.push(this);
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { FakeWebLinksAddon };
});
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: webLinksMock.FakeWebLinksAddon }));

// ── the fake SearchAddon — the find-in-scrollback seam (increment D). Records the queries driven
//    through findNext/findPrevious so the contracts can assert the panel's search chrome targets
//    the ACTIVE tab's addon only. ────────────────────────────────────────────────────────────────
const searchMock = vi.hoisted(() => {
  class FakeSearchAddon {
    static instances: FakeSearchAddon[] = [];
    findNextCalls: string[] = [];
    findPreviousCalls: string[] = [];
    disposed = false;
    constructor() {
      FakeSearchAddon.instances.push(this);
    }
    findNext(term: string): boolean {
      this.findNextCalls.push(term);
      return true;
    }
    findPrevious(term: string): boolean {
      this.findPreviousCalls.push(term);
      return true;
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { FakeSearchAddon };
});
vi.mock('@xterm/addon-search', () => ({ SearchAddon: searchMock.FakeSearchAddon }));

// ── the fake ClipboardAddon — the OSC 52 seam (increment D). Captures BOTH constructor arguments:
//    the runtime is `constructor(base64 = new Base64(), provider = new BrowserClipboardProvider())`
//    — the provider is the SECOND parameter (0.2.0's typings now declare both slots; 0.1.0's
//    one-arg typings hid this), and the DEFAULT provider READS the system clipboard. A provider
//    landing in the base64 slot would leave OSC 52 read (the paste-exfiltration vector) enabled,
//    so the contract pins the second-slot placement explicitly. ─────────────────────────────────
const clipboardMock = vi.hoisted(() => {
  interface CapturedClipboardProvider {
    readText(selection: string): string | Promise<string>;
    writeText(selection: string, text: string): void | Promise<void>;
  }
  class FakeClipboardAddon {
    static instances: FakeClipboardAddon[] = [];
    base64: unknown;
    provider: CapturedClipboardProvider | undefined;
    disposed = false;
    constructor(base64?: unknown, provider?: CapturedClipboardProvider) {
      this.base64 = base64;
      this.provider = provider;
      FakeClipboardAddon.instances.push(this);
    }
    dispose(): void {
      this.disposed = true;
    }
  }
  return { FakeClipboardAddon };
});
vi.mock('@xterm/addon-clipboard', () => ({ ClipboardAddon: clipboardMock.FakeClipboardAddon }));

// ── the desktopTerminal bridge — installed on `window` per test (deleted for the absent-bridge
//    case). `spawn` resolves asynchronously (a real IPC round-trip would too), so tests await a
//    flush before asserting the spawned Terminal. `spawn` resolves a FRESH sessionId per call
//    (`sess-1`, `sess-2`, …, reset every test) — the single-session tests only ever call it once
//    (still `sess-1`, matching `SESSION_ID` below unchanged), while the multi-session-tabs tests
//    open a second/third tab and need genuinely distinct session ids to assert dispose/write/data
//    routing lands on the RIGHT session. ──────────────────────────────────────────────────────────
const SESSION_ID = 'sess-1';
const bridgeMock = vi.hoisted(() => {
  let sessionCounter = 0;
  return {
    spawn: vi.fn<(opts?: unknown) => Promise<{ sessionId: string }>>(async () => {
      sessionCounter += 1;
      return { sessionId: `sess-${sessionCounter}` };
    }),
    write: vi.fn<(sessionId: string, data: string) => void>(),
    resize: vi.fn<(sessionId: string, cols: number, rows: number) => void>(),
    dispose: vi.fn<(sessionId: string) => void>(),
    onData: vi.fn<(cb: (sessionId: string, chunk: string) => void) => void>(),
    onExit: vi.fn<(cb: (sessionId: string, e: { exitCode: number }) => void) => void>(),
    // ADR-0189 re-attach slice — OPTIONAL bridge members (an older preload lacks them, feature-guard,
    // never assume). Default: no still-live sessions to restore, so the existing spawn-on-first-expand
    // behaviour stays byte-identical unless a test overrides `list` for that call.
    list: vi.fn<() => Promise<Array<{ sessionId: string }>>>(async () => []),
    // Typed as a union so a test can opt a single call into the ADR-0190 re-shaped
    // `{ data, cols, rows }` result (see `tdp-restores-snapshot-at-recorded-size-then-fits`
    // below) while every other test keeps the default bare-string (pre-ADR-0190) resolution
    // unchanged — the default fn below is untouched, so the existing reattach test's
    // baseline-green assertions stay exactly as they were.
    snapshot: vi.fn<
      (sessionId: string) => Promise<string | { data: string; cols: number; rows: number }>
    >(async (sessionId) => `snapshot for ${sessionId}\n`),
    // Increment B flow control — OPTIONAL like `list`/`snapshot` (an older preload lacks it): the
    // renderer reports consumed chars so the main can pause/resume the pty at its watermarks.
    ack: vi.fn<(sessionId: string, charCount: number) => void>(),
    // Increment C ConPTY state-sync — OPTIONAL like `ack` (an older preload lacks it): a frontend
    // clear forwards to the main so the pty's buffer representation and the main-held screen model
    // clear with it (else ConPTY reprints the stale screen on the next resize).
    clear: vi.fn<(sessionId: string) => void>(),
    // Increment D clickable links — OPTIONAL like `ack`/`clear` (an older preload lacks it): the
    // web-links addon routes a clicked URI here; the main enforces the http/https allowlist before
    // shell.openExternal (open-link-policy.test.ts is the enforcing wall's own contract).
    openLink: vi.fn<(url: string) => void>(),
    resetSessionCounter: (): void => {
      sessionCounter = 0;
    },
  };
});

// ── the fake ResizeObserver — jsdom has NO native ResizeObserver at all, so this fake both makes
//    the constructor available to the component under test and records the callback + observed
//    elements so a test can simulate a container-size-change (a window/layout resize with no drag
//    and no tab switch) deterministically, with no real layout engine involved. ───────────────────
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  unobserve(): void {
    /* no-op — not exercised by this suite */
  }
  disconnect(): void {
    this.disconnected = true;
  }
  /** test-only: simulate the observer firing for its observed container. */
  fire(): void {
    this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

import { TerminalDock } from './TerminalDock';

/** Flush the microtask queue the bridge's `spawn()` promise resolves on. */
const flush = (): Promise<void> => act(async () => {});

/** The injected pty-resize debounce window used by the resize contracts (the source's default is
 *  100 ms — Tabby's audited value; injected small here to keep the tests fast, the same discipline
 *  pty-session-manager.test.ts uses on its 5 ms data-flush window). */
const RESIZE_DEBOUNCE_MS = 5;

/** Outwait the injected pty-resize debounce window, so an assertion on `bridge.resize` sees the
 *  trailing coalesced forward — the pty-side resize is DEBOUNCED (ConPTY-aware resize, patterns-
 *  survey increment C) while the xterm-side fit()/resize stays live. */
const flushResizeDebounce = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, RESIZE_DEBOUNCE_MS * 5));
  });

/** The injected tab-title debounce window (increment D) — the source's default is 150 ms; injected
 *  small here, the same seam discipline as `resizeDebounceMs`. */
const TITLE_DEBOUNCE_MS = 5;

/** Outwait the injected title debounce window so an assertion sees the trailing coalesced title. */
const flushTitleDebounce = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, TITLE_DEBOUNCE_MS * 5));
  });

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

/** The "+" control in the tab strip that opens a fresh, independent session/tab. */
function newTabButton(): HTMLElement {
  return screen.getByRole('button', { name: /new terminal tab/i });
}

/** Click "+" and let its bridge.spawn() promise resolve — mirrors `expand()` for a second+ tab. */
async function openNewTab(): Promise<void> {
  fireEvent.click(newTabButton());
  await flush();
}

/** The Nth tab's switch control (1-based), found by its accessible name "tab N". */
function tabButton(n: number): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^tab ${n}$`, 'i') });
}

/** The Nth tab's close ("×") control (1-based), found by its accessible name "close tab N". */
function closeTabButton(n: number): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^close tab ${n}$`, 'i') });
}

beforeEach(() => {
  xtermMock.FakeTerminal.instances.length = 0;
  fitMock.FakeFitAddon.instances.length = 0;
  webglMock.FakeWebglAddon.instances.length = 0;
  webglMock.FakeWebglAddon.failConstruction = false;
  unicode11Mock.FakeUnicode11Addon.instances.length = 0;
  webLinksMock.FakeWebLinksAddon.instances.length = 0;
  searchMock.FakeSearchAddon.instances.length = 0;
  clipboardMock.FakeClipboardAddon.instances.length = 0;
  FakeResizeObserver.instances.length = 0;
  bridgeMock.resetSessionCounter();
  bridgeMock.spawn.mockClear();
  bridgeMock.write.mockClear();
  bridgeMock.resize.mockClear();
  bridgeMock.dispose.mockClear();
  bridgeMock.onData.mockClear();
  bridgeMock.onExit.mockClear();
  bridgeMock.list.mockClear();
  bridgeMock.snapshot.mockClear();
  bridgeMock.ack.mockClear();
  bridgeMock.clear.mockClear();
  bridgeMock.openLink.mockClear();
  (window as unknown as { desktopTerminal?: typeof bridgeMock }).desktopTerminal = bridgeMock;
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
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
    const { container } = render(<TerminalDock resizeDebounceMs={RESIZE_DEBOUNCE_MS} />);
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

    // The fit recomputed and the new geometry was forwarded to the bridge as the pty resize —
    // through the debounced pty-side forward (increment C), so outwait the trailing window.
    expect(fit.fitCalls).toBeGreaterThan(0);
    await flushResizeDebounce();
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

  // ── seed-opens-new-tab capability (ADR-0186): a seed OPENS A FRESH TAB — spawns a new session,
  //    switches to it, and pre-fills THERE — and NEVER writes into the ACTIVE session (the user's
  //    own interactive Claude Code). SUPERSEDES map-terminal-build's terminal-dock-seed capability
  //    (was write-to-the-active-session) — the son-* contracts below replace the old tds-* ones. ──
  it('son-seed-opens-a-fresh-tab: a new seed opens a SECOND, independent tab and switches to it, rather than reusing the active session', async () => {
    const { container, rerender } = render(<TerminalDock />);
    await expand(); // tab 1 = sess-1, the pre-existing ACTIVE session (the user's interactive Claude Code)

    expect(bridgeMock.spawn).toHaveBeenCalledTimes(1);
    expect(xtermMock.FakeTerminal.instances.length).toBe(1);

    const seed = { command: 'ls -la', token: 1 };
    rerender(<TerminalDock seed={seed} />);
    await flush();

    // A SECOND, independent session/tab was opened for the seed — never a reuse of tab 1.
    expect(bridgeMock.spawn).toHaveBeenCalledTimes(2);
    expect(xtermMock.FakeTerminal.instances.length).toBe(2);
    expect(container.querySelectorAll('.terminal-dock-tab').length).toBe(2);

    // The dock switched to the fresh tab — its pane visible, tab 1's hidden.
    const bodies = Array.from(container.querySelectorAll('.terminal-dock-body')) as HTMLElement[];
    expect(bodies.length).toBe(2);
    expect(bodies[0]!.hasAttribute('hidden')).toBe(true);
    expect(bodies[1]!.hasAttribute('hidden')).toBe(false);
  });

  it("son-seed-never-touches-active-session: the seed command is written to the FRESH tab, never into the previously-active session", async () => {
    const { rerender } = render(<TerminalDock />);
    await expand(); // tab 1 = sess-1, the pre-existing active session

    const seed = { command: 'ls -la', token: 1 };
    rerender(<TerminalDock seed={seed} />);
    await flush();

    // The load-bearing safety wall: sess-1 (the previously-active session) is NEVER written to for
    // this seed — only the fresh tab's session (sess-2) receives the pre-fill.
    expect(bridgeMock.write).toHaveBeenCalledTimes(1);
    expect(bridgeMock.write).toHaveBeenCalledWith('sess-2', 'ls -la');
    expect(bridgeMock.write).not.toHaveBeenCalledWith('sess-1', expect.anything());
  });

  it("son-pre-spawn-seed-writes-on-resolve: a seed arriving before the fresh tab's spawn resolves is held pending and written exactly once on resolve", async () => {
    const { rerender } = render(<TerminalDock />);
    await expand(); // tab 1 = sess-1, already resolved

    const seed = { command: 'ls -la', token: 1 };
    rerender(<TerminalDock seed={seed} />);

    // The fresh tab's bridge.spawn() promise has not resolved yet — the seed must be held pending
    // for THAT tab, never written into tab 1's already-resolved session.
    expect(bridgeMock.write).not.toHaveBeenCalled();

    await flush();

    expect(bridgeMock.spawn).toHaveBeenCalledTimes(2);
    expect(bridgeMock.write).toHaveBeenCalledTimes(1);
    expect(bridgeMock.write).toHaveBeenCalledWith('sess-2', 'ls -la');
  });

  it('son-token-bump-opens-another-fresh-tab: a token bump opens ANOTHER fresh tab even for an unchanged command; the same token is a no-op', async () => {
    const seed1 = { command: 'ls -la', token: 1 };
    const seed2 = { command: 'ls -la', token: 2 };
    const { rerender } = render(<TerminalDock />);
    await expand(); // tab 1 = sess-1

    rerender(<TerminalDock seed={seed1} />);
    await flush(); // tab 2 = sess-2, pre-filled

    expect(bridgeMock.spawn).toHaveBeenCalledTimes(2);
    expect(bridgeMock.write).toHaveBeenCalledTimes(1);

    // A token bump opens a THIRD tab — a nonce, not a cache key — even for the identical command.
    rerender(<TerminalDock seed={seed2} />);
    await flush();

    expect(bridgeMock.spawn).toHaveBeenCalledTimes(3);
    expect(bridgeMock.write).toHaveBeenCalledTimes(2);
    expect(bridgeMock.write).toHaveBeenLastCalledWith('sess-3', 'ls -la');

    // Re-rendering with the SAME token is a no-op — keyed on the token, not the command string.
    rerender(<TerminalDock seed={seed2} />);
    await flush();
    expect(bridgeMock.spawn).toHaveBeenCalledTimes(3);
    expect(bridgeMock.write).toHaveBeenCalledTimes(2);
  });

  it('son-prefills-without-trailing-newline: the fresh tab is pre-filled with the BARE command — no trailing newline/carriage-return (never auto-run)', async () => {
    const seed = { command: 'pnpm storytree story build x --real --store pg', token: 1 };
    const { rerender } = render(<TerminalDock />);
    await expand();
    rerender(<TerminalDock seed={seed} />);
    await flush();

    // The load-bearing safety wall: a --real build is billed + PR-opening (ADR-0136); the command
    // sits at the fresh tab's prompt un-executed until the user presses Enter, so NOTHING is
    // appended.
    const written = bridgeMock.write.mock.calls.at(-1)?.[1] as string;
    expect(written).toBe('pnpm storytree story build x --real --store pg');
    expect(written.endsWith('\n')).toBe(false);
    expect(written.endsWith('\r')).toBe(false);
  });

  it('son-absent-seed-is-a-no-op: with NO seed prop the dock is byte-identical to the multi-session dock — no extra tab, no write', async () => {
    render(<TerminalDock />);
    await expand();

    expect(bridgeMock.spawn).toHaveBeenCalledTimes(1);
    expect(bridgeMock.write).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^tab 2$/i })).toBeNull();
  });

  // ── tdp-renders-header-right-slot (contract 7 — the terminal-repo-picker header affordance) ──
  it('tdp-renders-header-right-slot: an optional headerRight node renders in the dock header, as a sibling of the toggle button (never nested inside it)', async () => {
    const { container } = render(
      <TerminalDock headerRight={<button type="button">Pick repo</button>} />,
    );
    await expand();

    const headerRightBtn = screen.getByRole('button', { name: 'Pick repo' });
    expect(dockRoot(container).contains(headerRightBtn)).toBe(true);

    // A sibling of the toggle button, never nested inside it — keeps valid HTML (no nested
    // interactive controls inside a <button>).
    expect(toggle().contains(headerRightBtn)).toBe(false);
  });

  it('tdp-renders-header-right-slot: absent by default — with no headerRight prop the header renders exactly as before, no header-right container at all', async () => {
    const { container } = render(<TerminalDock />);
    await expand();

    expect(container.querySelector('.terminal-dock-header-right')).toBeNull();
  });

  // ── tdp-shows-message-on-empty-session (contract 8 — the main-side fail-close feedback) ──────
  it('tdp-shows-message-on-empty-session: spawn() resolving an empty sessionId writes an honest one-line message and wires no live session (input inert, never a blank screen)', async () => {
    bridgeMock.spawn.mockResolvedValueOnce({ sessionId: '' });
    render(<TerminalDock />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    expect(term.written.some((w) => /no repository selected/i.test(w))).toBe(true);

    // No live session was wired — typing into the terminal never reaches the bridge.
    term.typeIn('ls\n');
    expect(bridgeMock.write).not.toHaveBeenCalled();
  });

  // ── tdp-fits-before-spawn-and-passes-initial-dims (contract 10, ADR-0190 — the missing fit
  //    lifecycle) ─────────────────────────────────────────────────────────────────────────────────
  //    A fresh tab must fit() its xterm to its container BEFORE calling bridge.spawn(), and forward
  //    the resulting cols/rows into that spawn call — so a new pty starts at the terminal's REAL
  //    size, never the 80x24 xterm default under a wide dock. Today `initTab` calls `bridge.spawn()`
  //    with no dims at all, so this must fail against current behaviour.
  it('tdp-fits-before-spawn-and-passes-initial-dims: a fresh tab fits before spawning and passes the fitted cols/rows into bridge.spawn', async () => {
    render(<TerminalDock />);
    await expand();

    const fit = fitMock.FakeFitAddon.instances[0]!;
    // The dock must have fit the fresh terminal to its container before spawning...
    expect(fit.fitCalls).toBeGreaterThan(0);
    // ...and forwarded the resulting dims into the spawn call, rather than spawning with no dims
    // (today's behaviour — the pty always starts at xterm's 80x24 default).
    expect(bridgeMock.spawn).toHaveBeenCalledWith(
      expect.objectContaining({ cols: fit.nextDims.cols, rows: fit.nextDims.rows }),
    );
  });

  // ── tdp-refits-on-expand-activation-and-resize (contract 11, ADR-0190 — the missing fit
  //    lifecycle, part 2). Contract 10 (above) only fits a FRESH tab before its first spawn. The
  //    ACTIVE tab's xterm must ALSO re-fit its container on TAB ACTIVATION (switching to a tab
  //    fits its now-visible pane) and on dock EXPAND (fold → unfold), each time forwarding the new
  //    dims to the pty through the SAME bridge.resize wiring contract 3 proves for the drag. Today
  //    neither the tab-switch handler nor the toggle handler calls fit() at all, so this must fail
  //    against current behaviour.
  it('tdp-refits-on-expand-activation-and-resize: switching tabs and re-expanding the dock re-fits the now-visible terminal and forwards the new dims to the bridge', async () => {
    render(<TerminalDock resizeDebounceMs={RESIZE_DEBOUNCE_MS} />);
    await expand(); // tab 1 = sess-1, active; fit1 fit-before-spawn already ran once (contract 10)
    await openNewTab(); // tab 2 = sess-2, becomes active; fit2 fit-before-spawn already ran once

    const fit1 = fitMock.FakeFitAddon.instances[0]!;
    fit1.nextDims = { cols: 100, rows: 40 };
    const fit1CallsBeforeSwitch = fit1.fitCalls;
    bridgeMock.resize.mockClear();

    // Switching TO tab 1 (now the visible pane) must re-fit ITS terminal to its container and
    // forward the resulting dims to the bridge as a real pty resize — not just flip which pane
    // carries the `hidden` attribute. The pty-side forward is debounced (increment C), so
    // outwait the trailing window before asserting it.
    fireEvent.click(tabButton(1));

    expect(fit1.fitCalls).toBeGreaterThan(fit1CallsBeforeSwitch);
    await flushResizeDebounce();
    expect(bridgeMock.resize).toHaveBeenCalledWith('sess-1', 100, 40);

    // Folding the dock then re-expanding it must ALSO re-fit the now-active tab's terminal
    // (tab 1 is still active here) and forward the new dims — the fold/unfold cycle keeps the
    // terminal mounted (tdp-toggles-visibility-keeping-terminal-mounted) but its geometry can
    // have gone stale while folded (e.g. the surrounding layout changed).
    fit1.nextDims = { cols: 120, rows: 48 };
    const fit1CallsBeforeToggle = fit1.fitCalls;
    bridgeMock.resize.mockClear();

    fireEvent.click(toggle()); // collapse
    fireEvent.click(toggle()); // expand again
    await flush();

    expect(fit1.fitCalls).toBeGreaterThan(fit1CallsBeforeToggle);
    await flushResizeDebounce();
    expect(bridgeMock.resize).toHaveBeenCalledWith('sess-1', 120, 48);
  });

  // ── multi-session-tabs capability — the tab substrate: N independent sessions/panes, created via
  //    "+", switched by clicking a tab, closed via a per-tab "×" (the ONLY thing that disposes a
  //    session's bridge/pty side); dock unmount disposes renderer resources only and PRESERVES every
  //    open session (ADR-0189 — sessions are app-owned, the pty-reap duty moved to the Electron
  //    main's app lifecycle). The eight tdp-* contracts above stay green unchanged (the N=1 case);
  //    these six pin the NEW multi-session behaviour. ─────────────────────────────────────────────

  // ── mst-new-tab-spawns-independent-session ─────────────────────────────────────────────
  it('mst-new-tab-spawns-independent-session: the "+" control spawns an independent second session and mounts its own xterm pane', async () => {
    render(<TerminalDock />);
    await expand(); // tab 1: spawns sess-1, mounts terminal instance 0

    expect(bridgeMock.spawn).toHaveBeenCalledTimes(1);
    expect(xtermMock.FakeTerminal.instances.length).toBe(1);

    await openNewTab(); // tab 2: spawns sess-2, mounts a SECOND, independent terminal instance

    expect(bridgeMock.spawn).toHaveBeenCalledTimes(2);
    expect(xtermMock.FakeTerminal.instances.length).toBe(2);
    expect(xtermMock.FakeTerminal.instances[1]).not.toBe(xtermMock.FakeTerminal.instances[0]);

    // The tab strip now carries two tabs.
    expect(tabButton(1)).toBeTruthy();
    expect(tabButton(2)).toBeTruthy();
  });

  // ── mst-switch-shows-selected-tab-pane ─────────────────────────────────────────────
  it('mst-switch-shows-selected-tab-pane: clicking a tab shows its pane and hides the others', async () => {
    const { container } = render(<TerminalDock />);
    await expand(); // tab 1 active
    await openNewTab(); // tab 2 spawned and becomes the active tab

    const bodies = (): HTMLElement[] =>
      Array.from(container.querySelectorAll('.terminal-dock-body')) as HTMLElement[];

    expect(bodies().length).toBe(2);
    // The just-opened tab (2) is active: its pane visible, tab 1's hidden.
    expect(bodies()[1]!.hasAttribute('hidden')).toBe(false);
    expect(bodies()[0]!.hasAttribute('hidden')).toBe(true);

    // Switching back to tab 1 flips which pane is visible.
    fireEvent.click(tabButton(1));
    expect(bodies()[0]!.hasAttribute('hidden')).toBe(false);
    expect(bodies()[1]!.hasAttribute('hidden')).toBe(true);
  });

  // ── mst-scopes-io-per-tab ────────────────────────────────────────────────────
  it('mst-scopes-io-per-tab: a bridge data chunk for one session writes ONLY into that session\'s pane, never a sibling tab\'s', async () => {
    render(<TerminalDock />);
    await expand(); // tab 1 = sess-1
    await openNewTab(); // tab 2 = sess-2

    expect(xtermMock.FakeTerminal.instances.length).toBe(2);
    const term1 = xtermMock.FakeTerminal.instances[0]!;
    const term2 = xtermMock.FakeTerminal.instances[1]!;

    const onData = bridgeMock.onData.mock.calls.at(-1)![0];
    onData('sess-1', 'from one\n');
    onData('sess-2', 'from two\n');

    expect(term1.written).toEqual(['from one\n']);
    expect(term2.written).toEqual(['from two\n']);
  });

  // ── mst-chrome-stays-per-dock ─────────────────────────────────────────────────
  it('mst-chrome-stays-per-dock: the toggle and headerRight slot render ONCE per dock, not once per tab', async () => {
    const { container } = render(
      <TerminalDock headerRight={<button type="button">Pick repo</button>} />,
    );
    await expand();
    await openNewTab();

    // Two tabs open, but exactly one toggle and one headerRight container — the chrome wraps the
    // whole tab set, it is never repeated per tab.
    expect(container.querySelectorAll('.terminal-dock-tab').length).toBe(2);
    expect(
      screen.getAllByRole('button', { name: /(expand|collapse) terminal/i }).length,
    ).toBe(1);
    expect(container.querySelectorAll('.terminal-dock-header-right').length).toBe(1);
  });

  // ── mst-panel-sits-beside-pane (ADR-0190 §3 — the session panel replaces the numbered
  //    horizontal tab strip: it renders BESIDE the terminal pane, down the right of the dock
  //    body, with one row per session — a readable label carrying at least the ordinal, and the
  //    active row marked — rather than a strip of bare-digit buttons sitting between the header
  //    and the panes). Today's source renders `.terminal-dock-tabs` as a strip ABOVE the panes
  //    (a sibling of the toggle, not beside the pane area) — no `.terminal-dock-panel` /
  //    `.terminal-dock-body-row` exist yet, so this must fail against current behaviour. ───────
  it('mst-panel-sits-beside-pane: the session panel renders beside the terminal panes (not a strip above them), with one labeled row per session and the active row marked', async () => {
    const { container } = render(<TerminalDock />);
    await expand(); // session 1
    await openNewTab(); // session 2, becomes active

    // Exactly one session panel, per dock.
    const panels = container.querySelectorAll('.terminal-dock-panel');
    expect(panels.length).toBe(1);
    const panel = panels[0]!;

    // The panel sits BESIDE the pane area — both are children of a shared body-row wrapper, not
    // the panel alone sitting as a strip between the header and the panes.
    const bodyRow = container.querySelector('.terminal-dock-body-row');
    expect(bodyRow).not.toBeNull();
    expect(bodyRow!.contains(panel)).toBe(true);
    for (const body of Array.from(container.querySelectorAll('.terminal-dock-body'))) {
      expect(bodyRow!.contains(body)).toBe(true);
    }

    // One row per session, each carrying a readable label with at least its ordinal.
    const rows = panel.querySelectorAll('.terminal-dock-panel-row');
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent ?? '').toContain('1');
    expect(rows[1]!.textContent ?? '').toContain('2');

    // The active row (session 2, just opened) is marked distinctly — exactly one.
    expect(panel.querySelectorAll('.terminal-dock-panel-row-active').length).toBe(1);
    expect(rows[1]!.classList.contains('terminal-dock-panel-row-active')).toBe(true);

    // The per-row close control and the panel's own "+" spawn control live INSIDE the panel.
    expect(panel.contains(closeTabButton(2))).toBe(true);
    expect(panel.contains(newTabButton())).toBe(true);
  });

  // ── mst-close-tab-disposes-its-session ───────────────────────────────────────
  it('mst-close-tab-disposes-its-session: closing a tab disposes ONLY that session (bridge + xterm) and reaps its tab; the sibling is untouched', async () => {
    const { container } = render(<TerminalDock />);
    await expand(); // tab 1 = sess-1
    await openNewTab(); // tab 2 = sess-2

    const term1 = xtermMock.FakeTerminal.instances[0]!;
    const term2 = xtermMock.FakeTerminal.instances[1]!;
    const fit2 = fitMock.FakeFitAddon.instances[1]!;

    fireEvent.click(closeTabButton(2));

    expect(bridgeMock.dispose).toHaveBeenCalledWith('sess-2');
    expect(bridgeMock.dispose).not.toHaveBeenCalledWith('sess-1');
    expect(term2.disposed).toBe(true);
    expect(fit2.disposed).toBe(true);
    expect(term1.disposed).toBe(false);

    // The closed tab is reaped from the strip — only tab 1 remains.
    expect(container.querySelectorAll('.terminal-dock-tab').length).toBe(1);
    expect(screen.queryByRole('button', { name: /^tab 2$/i })).toBeNull();
  });

  // ── tdp-reattaches-live-sessions-on-mount (ADR-0189 re-attach slice, contract 9) ──────────────
  //    On mount, with the bridge present and `list()` reporting still-live sessions, the dock
  //    ADOPTS each one as its own tab (never calling `spawn` for it) and replays that session's
  //    `snapshot()` into its fresh xterm. Expanding afterwards must NOT spawn a duplicate/fresh
  //    session — the restore already settled the tab set.
  it('tdp-reattaches-live-sessions-on-mount: still-live sessions reported by bridge.list() are adopted as one tab each, with snapshot() replayed and no spawn', async () => {
    bridgeMock.list.mockResolvedValueOnce([{ sessionId: 'sess-9' }, { sessionId: 'sess-8' }]);

    const { container } = render(<TerminalDock />);
    await flush();
    await flush(); // drain the list() → per-session snapshot() promise chain

    expect(bridgeMock.list).toHaveBeenCalledTimes(1);
    expect(bridgeMock.spawn).not.toHaveBeenCalled(); // adopted, never spawned

    expect(container.querySelectorAll('.terminal-dock-tab').length).toBe(2);
    expect(xtermMock.FakeTerminal.instances.length).toBe(2);

    const term9 = xtermMock.FakeTerminal.instances[0]!;
    const term8 = xtermMock.FakeTerminal.instances[1]!;
    expect(term9.written).toEqual(['snapshot for sess-9\n']);
    expect(term8.written).toEqual(['snapshot for sess-8\n']);

    // Expanding afterwards must not spawn a duplicate session — the restore already settled.
    await expand();
    expect(bridgeMock.spawn).not.toHaveBeenCalled();
  });

  // ── tdp-restores-snapshot-at-recorded-size-then-fits (ADR-0190 — contract 9's re-shape) ────────
  //    ADR-0190 re-shapes the bridge's `snapshot()` result from a bare scrollback string to
  //    `{ data, cols, rows }` — the session's serialized screen state AT THE DIMS IT WAS RECORDED
  //    AT. On re-attach the restore must: RESIZE the fresh xterm to those recorded cols/rows (so
  //    the write lands on a terminal the exact size the screen was captured at) BEFORE writing the
  //    data, then FIT the xterm to its real container and forward the FITTED dims to the pty via a
  //    real `bridge.resize(sessionId, cols, rows)` call — not the raw `{ data, cols, rows }` object
  //    handed straight to `term.write()`, and not silently skipping the fit. Today's code treats
  //    `snapshot()`'s resolved value as a bare string, writes it as-is, and never resizes or fits an
  //    adopted tab at all — so this must fail against current behaviour.
  //    Since increment C this contract ALSO pins that the re-attach sequence is EXEMPT from the
  //    pty-resize debounce: it renders with the DEFAULT (100 ms) window and asserts the recorded-
  //    dims forward with no debounce flush — the replay depends on the synchronous forward.
  it("tdp-restores-snapshot-at-recorded-size-then-fits: an adopted session is resized to the snapshot's recorded cols/rows before its screen data is written, then fit to its real container with the fitted dims forwarded to the bridge", async () => {
    bridgeMock.list.mockResolvedValueOnce([{ sessionId: 'sess-9' }]);
    bridgeMock.snapshot.mockResolvedValueOnce({
      data: 'restored screen\n',
      cols: 100,
      rows: 40,
    });

    render(<TerminalDock />);
    await flush();
    await flush(); // drain the list() → snapshot() promise chain

    expect(xtermMock.FakeTerminal.instances.length).toBe(1);
    const term = xtermMock.FakeTerminal.instances[0]!;
    const fit = fitMock.FakeFitAddon.instances[0]!;

    // Resized to the snapshot's OWN recorded size (the serialization's terminal dims), forwarded
    // to the pty as a real resize.
    expect(bridgeMock.resize).toHaveBeenCalledWith('sess-9', 100, 40);
    // The serialized screen text was written — never the raw { data, cols, rows } object.
    expect(term.written).toEqual(['restored screen\n']);
    // Then fit to the real container — today's code never fits an adopted/restored tab at all.
    expect(fit.fitCalls).toBeGreaterThan(0);
  });

  // ── mst-unmount-preserves-sessions (ADR-0189 — supersedes ADR-0186's dock-lifetime wall) ────────
  it('mst-unmount-preserves-sessions: unmounting the dock disposes only RENDERER resources (xterm + fit) for every open tab, and NEVER the bridge session — sessions are app-owned and survive dock unmount', async () => {
    const { unmount } = render(<TerminalDock />);
    await expand(); // tab 1 = sess-1
    await openNewTab(); // tab 2 = sess-2

    const term1 = xtermMock.FakeTerminal.instances[0]!;
    const term2 = xtermMock.FakeTerminal.instances[1]!;
    const fit1 = fitMock.FakeFitAddon.instances[0]!;
    const fit2 = fitMock.FakeFitAddon.instances[1]!;

    expect(bridgeMock.dispose).not.toHaveBeenCalled();

    unmount();

    // Every tab's RENDERER resources are torn down on unmount...
    expect(term1.disposed).toBe(true);
    expect(term2.disposed).toBe(true);
    expect(fit1.disposed).toBe(true);
    expect(fit2.disposed).toBe(true);

    // ...but NO bridge session is disposed — sessions are app-owned (they survive a route change
    // and re-attach on the next mount, `tdp-reattaches-live-sessions-on-mount`); the pty-reap duty
    // moved to the Electron main's app lifecycle (disposeAllTerminals on window-close/app-quit).
    expect(bridgeMock.dispose).not.toHaveBeenCalled();
  });

  // ── tdp-refits-on-container-resize (the remaining fit-lifecycle gap, ADR-0190 — a container-size
  //    change with NO drag and NO tab switch, e.g. a window/layout resize, must still refit the
  //    active terminal to its (now different) container and forward the new dims to the pty via the
  //    SAME bridge.resize wiring contracts 3/11 use). Today's source wires the fit lifecycle only to
  //    the drag handle (contract 3), the fresh-spawn fit (contract 10), and the expand/activation
  //    effect (contract 11) — it observes no `ResizeObserver` on the dock body at all, so a bare
  //    container-size change currently leaves the terminal at its stale geometry. This must fail
  //    against current behaviour. ──────────────────────────────────────────────────────────────────
  it('tdp-refits-on-container-resize: a ResizeObserver firing for the dock body refits the active terminal and forwards the new dims to the bridge, with no drag and no tab switch', async () => {
    render(<TerminalDock resizeDebounceMs={RESIZE_DEBOUNCE_MS} />);
    await expand();

    const fit = fitMock.FakeFitAddon.instances[0]!;
    fit.nextDims = { cols: 150, rows: 50 };
    const fitCallsBefore = fit.fitCalls;
    bridgeMock.resize.mockClear();

    // The dock must have installed a ResizeObserver on its body to notice a bare container-size
    // change (no drag, no tab switch involved).
    expect(FakeResizeObserver.instances.length).toBeGreaterThan(0);
    const ro = FakeResizeObserver.instances[0]!;

    // Simulate the observed container changing size.
    act(() => {
      ro.fire();
    });

    // The xterm-side refit is LIVE (synchronous); the pty-side forward is debounced (increment
    // C), so outwait the trailing window before asserting the bridge call.
    expect(fit.fitCalls).toBeGreaterThan(fitCallsBefore);
    await flushResizeDebounce();
    expect(bridgeMock.resize).toHaveBeenCalledWith(SESSION_ID, 150, 50);
  });

  // ── tdp-ctrl-c-copies-selection-ctrl-v-pastes (contract 12 — the owner-reported Ctrl+C-copy /
  //    Ctrl+V-paste keyboard-wiring defect: xterm consumes Ctrl+C and always forwards \x03/SIGINT to
  //    the pty, so a selection is never copied to the clipboard; Ctrl+V is not explicitly handled).
  //    Today's `initTab` never calls `term.attachCustomKeyEventHandler`, so the captured handler stays
  //    null — invoking it throws, which IS the red this test pins (the missing wiring, not a
  //    syntax/module-not-found error). ─────────────────────────────────────────────────────────────
  it('tdp-ctrl-c-copies-selection-ctrl-v-pastes: Ctrl+C with a selection copies to the clipboard and suppresses the interrupt; Ctrl+C with no selection still interrupts; Ctrl+V pastes the clipboard', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    const readText = vi.fn<() => Promise<string>>(async () => 'pasted text');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, readText },
      configurable: true,
    });

    render(<TerminalDock />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    const handler = term.customKeyEventHandler;
    expect(typeof handler).toBe('function');

    const ctrlC = {
      type: 'keydown',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      key: 'c',
    } as unknown as KeyboardEvent;
    const ctrlV = {
      type: 'keydown',
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      key: 'v',
    } as unknown as KeyboardEvent;

    // (a) Ctrl+C WITH a selection copies it to the clipboard and suppresses the interrupt — no
    // '\x03' reaches the bridge.
    term.selection = 'selected text';
    expect(handler!(ctrlC)).toBe(false);
    await flush();
    expect(writeText).toHaveBeenCalledWith('selected text');
    expect(bridgeMock.write).not.toHaveBeenCalledWith(SESSION_ID, '\x03');

    // (b) Ctrl+C with NO selection preserves the interrupt path — xterm's normal handling forwards
    // '\x03' to the pty itself; the clipboard is untouched.
    writeText.mockClear();
    term.selection = '';
    expect(handler!(ctrlC)).toBe(true);
    expect(writeText).not.toHaveBeenCalled();

    // (c) Ctrl+V reads the clipboard and pastes it through the terminal (bracketed-paste).
    expect(handler!(ctrlV)).toBe(false);
    await flush();
    expect(readText).toHaveBeenCalled();
    expect(term.pasted).toEqual(['pasted text']);

    // (d) a non-keydown event, and an unrelated key, are both left untouched.
    const ctrlCKeyUp = { ...ctrlC, type: 'keyup' } as unknown as KeyboardEvent;
    expect(handler!(ctrlCKeyUp)).toBe(true);
    const plainA = {
      type: 'keydown',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      key: 'a',
    } as unknown as KeyboardEvent;
    expect(handler!(plainA)).toBe(true);

    // (e) an absent navigator.clipboard never throws, and leaves xterm's default handling intact.
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    term.selection = 'still selected';
    expect(() => handler!(ctrlC)).not.toThrow();
    expect(handler!(ctrlC)).toBe(true);
  });

  // ── tdp-renders-with-webgl-and-falls-back-honestly (contract 13 — the owner-reported rendering
  //    artifacts: stale glyphs pinned at the pane edges after a resize/scroll). Without a renderer
  //    addon, xterm runs its DOM renderer — the documented FALLBACK renderer, whose known rendering
  //    issues are exactly this artifact class; the fix is the GPU (WebGL) renderer every serious
  //    Electron terminal ships. Each tab's terminal must load a WebglAddon AFTER `open()` (the
  //    addon needs the mounted element); a box with no usable WebGL context (construction/load
  //    throws) must fall back to the DOM renderer with the session fully functional — never a
  //    crash, never a dead pane; and a LATER context loss must dispose the addon (xterm reverts to
  //    the DOM renderer) with the session still functional. Today's `initTab` loads no renderer
  //    addon at all, so the first assertion must fail against current behaviour. ─────────────────
  it('tdp-renders-with-webgl-and-falls-back-honestly: each tab loads the WebGL renderer after open; a no-WebGL box falls back to a working DOM-rendered session; a context loss disposes the addon with the session still live', async () => {
    // (a) the GPU renderer: expanding wires a WebglAddon onto the fresh terminal, after open().
    render(<TerminalDock />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    expect(webglMock.FakeWebglAddon.instances.length).toBe(1);
    const webgl = webglMock.FakeWebglAddon.instances[0]!;
    expect(term.addons).toContain(webgl);
    expect(term.opened).not.toBeNull(); // loaded onto an OPENED terminal (the addon needs the element)

    // (b) a later context loss disposes the addon (xterm falls back to the DOM renderer) and the
    // session stays fully live — input still routes to the bridge, bridge data still renders.
    expect(webgl.contextLossHandler).not.toBeNull();
    webgl.contextLossHandler!();
    expect(webgl.disposed).toBe(true);
    term.typeIn('still alive\n');
    expect(bridgeMock.write).toHaveBeenCalledWith(SESSION_ID, 'still alive\n');
    const onData = bridgeMock.onData.mock.calls[0]![0];
    onData(SESSION_ID, 'echo');
    expect(term.written).toContain('echo');

    cleanup();

    // (c) the no-WebGL-context box: construction throws → the tab must still spawn and work on the
    // DOM renderer (fallback is silent and honest — no crash, no dead pane).
    webglMock.FakeWebglAddon.failConstruction = true;
    bridgeMock.resetSessionCounter();
    bridgeMock.write.mockClear();
    render(<TerminalDock />);
    await expand();

    const fallbackTerm = xtermMock.FakeTerminal.instances[1]!;
    expect(fallbackTerm.opened).not.toBeNull();
    fallbackTerm.typeIn('dom renderer\n');
    expect(bridgeMock.write).toHaveBeenCalledWith(SESSION_ID, 'dom renderer\n');
  });

  // ── rendering-correctness contracts (embedded-terminal patterns survey, increment A) ─────────
  //    xterm defaults to UNICODE 6 width tables — emoji/spinner/box glyphs (Claude Code's staple
  //    output) get the wrong cell width and the next glyph draws into an overlapping cell, a
  //    co-culprit of the owner-reported edge artifacts. Every tab's terminal must load the
  //    Unicode11Addon and flip `unicode.activeVersion` to '11'. PARITY is load-bearing: the
  //    main's headless snapshot terminal does the same (pty-session-manager.test.ts pins it with
  //    the REAL addon) — one-sided width tables make re-attach replays re-wrap differently than
  //    live rendering. Today `initTab` loads no unicode addon, so this must fail. ───────────────
  it('tdp-activates-unicode11-widths: every tab loads the Unicode11Addon and activates Unicode 11 width tables', async () => {
    render(<TerminalDock />);
    await expand(); // tab 1
    await openNewTab(); // tab 2 — the addon is per-terminal, EVERY tab must get its own

    expect(unicode11Mock.FakeUnicode11Addon.instances.length).toBe(2);
    const [term1, term2] = xtermMock.FakeTerminal.instances;
    expect(term1!.addons).toContain(unicode11Mock.FakeUnicode11Addon.instances[0]);
    expect(term2!.addons).toContain(unicode11Mock.FakeUnicode11Addon.instances[1]);
    expect(term1!.unicode.activeVersion).toBe('11');
    expect(term2!.unicode.activeVersion).toBe('11');

    // `term.unicode` is still EXPERIMENTAL in xterm 6.0 — without this constructor flag the real
    // terminal THROWS on activation (the mocked seam here cannot observe that throw; the e2e
    // caught it live), killing the tab before its session ever spawns.
    expect(term1!.options['allowProposedApi']).toBe(true);
  });

  //    The renderer terminal is constructed with xterm's default 1,000-line scrollback while the
  //    main's headless screen model keeps 5,000 (DEFAULT_SCROLLBACK_LINES,
  //    pty-session-manager.ts) — a re-attach can replay more lines than the renderer can hold.
  //    Today the constructor passes no `scrollback` at all, so this must fail. ──────────────────
  it('tdp-constructs-with-aligned-scrollback: the terminal is constructed with scrollback 5000, aligned with the main-held headless screen model', async () => {
    render(<TerminalDock />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    expect(term.options['scrollback']).toBe(5000);
  });

  //    windowsPty — the ConPTY heuristics gate: without it a row-increase resize can LOSE data
  //    (ConPTY emits empty rows instead of restoring scrollback) and reflow runs where it must
  //    not (conpty < build 21376). The Windows signal is the OPTIONAL bridge member
  //    `windowsBuildNumber` (present only on a win32 desktop preload — feature-guarded like
  //    `list?`/`snapshot?`); a bridge without it (older preload, or any non-Windows OS) must
  //    construct with NO windowsPty key at all. Today the constructor never sets it, so the
  //    first half must fail. ─────────────────────────────────────────────────────────────────
  it('tdp-sets-windows-pty-from-bridge-build-number: a bridge carrying windowsBuildNumber yields windowsPty { backend conpty, buildNumber }; an absent member yields no windowsPty at all', async () => {
    const bridgeWithBuild = bridgeMock as typeof bridgeMock & { windowsBuildNumber?: number };
    bridgeWithBuild.windowsBuildNumber = 26100;
    try {
      render(<TerminalDock />);
      await expand();

      const term = xtermMock.FakeTerminal.instances[0]!;
      expect(term.options['windowsPty']).toEqual({ backend: 'conpty', buildNumber: 26100 });
    } finally {
      delete bridgeWithBuild.windowsBuildNumber;
    }

    cleanup();

    // The absent-member half: no windowsBuildNumber on the bridge → no windowsPty option at all
    // (never a stub object — xterm treats the key's presence as "apply ConPTY heuristics").
    bridgeMock.resetSessionCounter();
    render(<TerminalDock />);
    await expand();

    const plainTerm = xtermMock.FakeTerminal.instances[1]!;
    expect('windowsPty' in plainTerm.options).toBe(false);
  });

  // ── flow-control contracts (embedded-terminal patterns survey, increment B) ──────────────────
  //    The main pauses the pty past 100,000 UNACKNOWLEDGED chars and resumes below 5,000 — but only
  //    if the renderer reports consumption. The correct signal is xterm's `write(data, callback)`,
  //    which fires on PARSE-COMPLETE (not on IPC receipt — data sitting unparsed in xterm's write
  //    buffer is exactly the backlog flow control exists to bound). Acks are batched in 5,000-char
  //    grains (VS Code's FlowControlConstants ack grain), never sent per-chunk. Today `onData`
  //    routing calls `term.write(chunk)` with no callback and no ack is ever sent — red. ──────────
  it('tdp-acks-consumed-chars-in-grains: consumed chars are acked back over the bridge in ≥5000-char grains from the write parse-complete callback, never per-chunk', async () => {
    render(<TerminalDock />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    const onData = bridgeMock.onData.mock.calls[0]![0];

    // Below the grain: consumed (the fake fires parse-complete synchronously) but NOT yet acked —
    // acks are batched, never per-chunk.
    onData(SESSION_ID, 'x'.repeat(3000));
    expect(bridgeMock.ack).not.toHaveBeenCalled();

    // Crossing the grain acks the FULL accumulated count, once.
    onData(SESSION_ID, 'y'.repeat(2500));
    expect(bridgeMock.ack).toHaveBeenCalledTimes(1);
    expect(bridgeMock.ack).toHaveBeenCalledWith(SESSION_ID, 5500);

    // The accumulator reset: a following small chunk starts a fresh grain, no premature ack.
    onData(SESSION_ID, 'z'.repeat(1000));
    expect(bridgeMock.ack).toHaveBeenCalledTimes(1);

    // The data itself still rendered, in order — flow control never reorders or drops.
    expect(term.written).toEqual(['x'.repeat(3000), 'y'.repeat(2500), 'z'.repeat(1000)]);
  });

  //    The ack channel is OPTIONAL on the bridge (feature-guarded like `list?`/`snapshot?` — an
  //    older preload lacks it): without it the dock renders data exactly as before, never throws,
  //    never tries to ack. ─────────────────────────────────────────────────────────────────────
  it('tdp-ack-absent-bridge-member-is-inert: a bridge without ack (older preload) renders data normally — no throw, no ack attempt', async () => {
    const bridgeWithoutAck = { ...bridgeMock } as Record<string, unknown>;
    delete bridgeWithoutAck['ack'];
    (window as unknown as { desktopTerminal?: unknown }).desktopTerminal = bridgeWithoutAck;

    render(<TerminalDock />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    const onData = bridgeMock.onData.mock.calls[0]![0];

    expect(() => onData(SESSION_ID, 'q'.repeat(6000))).not.toThrow();
    expect(term.written).toEqual(['q'.repeat(6000)]);
    expect(bridgeMock.ack).not.toHaveBeenCalled();
  });

  // ── ConPTY-aware resize contracts (embedded-terminal patterns survey, increment C) ───────────
  //    ConPTY reprints the screen on every resize and xterm upstream closed clean-scrollback-
  //    resize as out-of-scope (xterm.js#3513) — mangled scrollback on aggressive resize is
  //    structural, so the job is MINIMIZING the resizes ConPTY sees. The pty-side forward
  //    (bridge.resize) is DEBOUNCED per tab (trailing, ~100 ms — Tabby's audited value; injected
  //    small here): a resize storm (a drag) reaches the pty as ONE trailing forward carrying the
  //    LAST dims, while the xterm-side resize stays live so the pane feels responsive. Today the
  //    onResize wiring forwards every resize immediately, so the coalescing assertions must fail. ──
  it('tdp-debounces-pty-resize-forward: a resize storm forwards ONE trailing bridge.resize with the last dims (xterm-side stays live); a quiet later resize forwards again; unmount cancels a pending forward', async () => {
    const { unmount } = render(<TerminalDock resizeDebounceMs={RESIZE_DEBOUNCE_MS} />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    bridgeMock.resize.mockClear();

    // A drag-like storm: three xterm-side resizes in one burst. The xterm side is LIVE (every
    // resize lands on the terminal immediately)...
    term.resize(100, 40);
    term.resize(110, 42);
    term.resize(120, 48);
    expect(term.resized.slice(-3)).toEqual([
      { cols: 100, rows: 40 },
      { cols: 110, rows: 42 },
      { cols: 120, rows: 48 },
    ]);
    // ...but NOTHING has reached the pty yet — the forward is coalescing.
    expect(bridgeMock.resize).not.toHaveBeenCalled();

    // The trailing window elapses: exactly ONE forward, carrying the LAST dims — never the
    // intermediates (each is a full ConPTY screen-reprint).
    await flushResizeDebounce();
    expect(bridgeMock.resize).toHaveBeenCalledTimes(1);
    expect(bridgeMock.resize).toHaveBeenCalledWith(SESSION_ID, 120, 48);

    // A later, quiet resize starts a fresh window and forwards again.
    term.resize(90, 30);
    await flushResizeDebounce();
    expect(bridgeMock.resize).toHaveBeenCalledTimes(2);
    expect(bridgeMock.resize).toHaveBeenLastCalledWith(SESSION_ID, 90, 30);

    // Unmount with a forward still pending: the timer is cancelled (no leaked timer firing into
    // a torn-down dock — the sessions survive unmount and the next mount refits anyway).
    term.resize(80, 24);
    unmount();
    await flushResizeDebounce();
    expect(bridgeMock.resize).toHaveBeenCalledTimes(2);
  });

  //    node-pty's documented ConPTY state-sync: when the FRONTEND clears, the pty's own buffer
  //    representation must clear too (else ConPTY reprints the stale screen on the next resize).
  //    The panel's "clear terminal" control clears the ACTIVE tab's xterm buffer and forwards the
  //    clear over the bridge — `clear?` is OPTIONAL (feature-guarded like `ack?`; an older preload
  //    lacks it and gets the local xterm clear only, never a throw). Today no clear control exists
  //    and no bridge.clear is ever sent — red. ─────────────────────────────────────────────────
  it('tdp-clear-control-clears-active-tab-and-syncs-pty: the clear control clears the ACTIVE tab\'s xterm and forwards bridge.clear for its session only; an absent bridge.clear member stays inert (local clear, no throw)', async () => {
    render(<TerminalDock />);
    await expand(); // tab 1 = sess-1
    await openNewTab(); // tab 2 = sess-2, active

    const term1 = xtermMock.FakeTerminal.instances[0]!;
    const term2 = xtermMock.FakeTerminal.instances[1]!;
    const clearButton = screen.getByRole('button', { name: /clear terminal/i });

    // Clearing acts on the ACTIVE tab (2) only — its xterm buffer clears and ITS session's pty
    // is synced; the sibling tab is untouched.
    fireEvent.click(clearButton);
    expect(term2.clearCalls).toBe(1);
    expect(term1.clearCalls).toBe(0);
    expect(bridgeMock.clear).toHaveBeenCalledTimes(1);
    expect(bridgeMock.clear).toHaveBeenCalledWith('sess-2');

    // Switching tabs re-targets the control at the newly-active tab.
    fireEvent.click(tabButton(1));
    fireEvent.click(clearButton);
    expect(term1.clearCalls).toBe(1);
    expect(bridgeMock.clear).toHaveBeenLastCalledWith('sess-1');

    cleanup();

    // An older preload without `clear` (feature-guarded like `ack?`): the local xterm clear
    // still happens, nothing is forwarded, nothing throws.
    const bridgeWithoutClear = { ...bridgeMock } as Record<string, unknown>;
    delete bridgeWithoutClear['clear'];
    (window as unknown as { desktopTerminal?: unknown }).desktopTerminal = bridgeWithoutClear;
    bridgeMock.resetSessionCounter();
    bridgeMock.clear.mockClear();

    render(<TerminalDock />);
    await expand();
    const term = xtermMock.FakeTerminal.instances[2]!;
    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: /clear terminal/i })),
    ).not.toThrow();
    expect(term.clearCalls).toBe(1);
    expect(bridgeMock.clear).not.toHaveBeenCalled();
  });

  // ── UX table-stakes contracts (embedded-terminal patterns survey, increment D) ────────────────

  //    Clickable links: each tab loads the web-links addon with a handler that routes the clicked
  //    URI over the feature-guarded bridge (`openLink?`) to the main's allowlisted
  //    shell.openExternal — NEVER window.open, never an unvalidated openExternal (the electerm CVE
  //    class, GHSA-fwf6-j56g-m97c; the main's scheme allowlist is the enforcing wall, this
  //    renderer check is only belt). An older preload without `openLink` loads NO link addon at
  //    all — a link affordance that could never open would mislead. Today `initTab` loads no
  //    web-links addon, so this must fail. ────────────────────────────────────────────────────────
  it('tdp-opens-links-via-guarded-bridge: every tab loads the web-links addon routing http/https URIs to bridge.openLink; a non-http scheme never reaches the bridge; an absent openLink member loads no link addon', async () => {
    render(<TerminalDock />);
    await expand(); // tab 1
    await openNewTab(); // tab 2 — the addon is per-terminal, EVERY tab gets its own

    expect(webLinksMock.FakeWebLinksAddon.instances.length).toBe(2);
    const [term1, term2] = xtermMock.FakeTerminal.instances;
    const links1 = webLinksMock.FakeWebLinksAddon.instances[0]!;
    expect(term1!.addons).toContain(links1);
    expect(term2!.addons).toContain(webLinksMock.FakeWebLinksAddon.instances[1]);

    // The handler routes the clicked URI over the bridge, suppressing the default (window.open).
    const preventDefault = vi.fn();
    const clickEvent = { preventDefault } as unknown as MouseEvent;
    expect(links1.handler).toBeDefined();
    links1.handler!(clickEvent, 'https://github.com/HuaMick/storytree/pull/772');
    expect(bridgeMock.openLink).toHaveBeenCalledWith('https://github.com/HuaMick/storytree/pull/772');
    expect(preventDefault).toHaveBeenCalled();

    // Renderer-side belt: a non-http(s) scheme never even reaches the bridge (the main's
    // allowlist would refuse it anyway — defense in depth).
    bridgeMock.openLink.mockClear();
    links1.handler!(clickEvent, 'file:///C:/Windows/System32/cmd.exe');
    expect(bridgeMock.openLink).not.toHaveBeenCalled();

    cleanup();

    // An older preload without `openLink` (feature-guarded like `ack?`/`clear?`): no link addon
    // is loaded at all, and nothing throws.
    const bridgeWithoutOpenLink = { ...bridgeMock } as Record<string, unknown>;
    delete bridgeWithoutOpenLink['openLink'];
    (window as unknown as { desktopTerminal?: unknown }).desktopTerminal = bridgeWithoutOpenLink;
    bridgeMock.resetSessionCounter();
    webLinksMock.FakeWebLinksAddon.instances.length = 0;
    render(<TerminalDock />);
    await expand();
    expect(webLinksMock.FakeWebLinksAddon.instances.length).toBe(0);
  });

  //    Tab titles: OSC 0/2 (`term.onTitleChange`) → the session-panel row label, DEBOUNCED
  //    (trailing — a TUI that animates its title must not re-render the panel per frame). The
  //    dynamic title lands in VISIBLE TEXT ONLY ("N: title"); the `tab N` / `close tab N`
  //    aria-labels and the `.terminal-dock-panel-row` class stay BYTE-STABLE (this whole suite +
  //    the e2e select by them). A pending title timer is cancelled on unmount, the same timer
  //    discipline as increment C's resize debounce. Today `initTab` never subscribes
  //    `onTitleChange`, so this must fail. ────────────────────────────────────────────────────────
  it('tdp-updates-panel-row-title-debounced: an OSC title burst lands ONCE as the trailing title in the row\'s visible text; aria-labels stay byte-stable; unmount cancels a pending title', async () => {
    const { unmount } = render(<TerminalDock titleDebounceMs={TITLE_DEBOUNCE_MS} />);
    await expand(); // tab 1 = sess-1

    const term = xtermMock.FakeTerminal.instances[0]!;
    expect(term.titleHandler).not.toBeNull();

    // A burst of title changes coalesces — nothing lands until the trailing window elapses...
    act(() => {
      term.fireTitleChange('powershell');
      term.fireTitleChange('claude');
    });
    expect(tabButton(1).textContent ?? '').not.toContain('claude');

    await flushTitleDebounce();

    // ...then the FINAL title lands, ordinal-prefixed, in visible text only.
    expect(tabButton(1).textContent).toContain('1: claude');

    // BYTE-STABLE selectors: the aria-labels and the row class are untouched by the title.
    expect(screen.getByRole('button', { name: /^tab 1$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^close tab 1$/i })).toBeTruthy();
    expect(document.querySelectorAll('.terminal-dock-panel-row').length).toBe(1);

    // A pending title at unmount is cancelled — no leaked timer fires into a torn-down dock.
    act(() => {
      term.fireTitleChange('late title');
    });
    unmount();
    await flushTitleDebounce(); // must not throw / touch unmounted state
  });

  //    Find-in-scrollback: a per-tab SearchAddon stored on the TabRecord (like `fit`), driven for
  //    the ACTIVE tab by the panel's search chrome. Absent by default — no search input until
  //    toggled, and never a `.terminal-dock-header-right` container (the headerRight slot contract
  //    keeps its absent-by-default half). Today `initTab` loads no search addon and no search
  //    chrome exists, so this must fail. ──────────────────────────────────────────────────────────
  it('tdp-searches-active-tab-scrollback: the panel search chrome drives the ACTIVE tab\'s per-tab search addon (Enter next, Shift+Enter previous), renders no input until toggled, and closes on Escape', async () => {
    const { container } = render(<TerminalDock />);
    await expand(); // tab 1
    await openNewTab(); // tab 2, active

    // Per-tab addon, loaded like fit.
    expect(searchMock.FakeSearchAddon.instances.length).toBe(2);
    const [term1, term2] = xtermMock.FakeTerminal.instances;
    const search1 = searchMock.FakeSearchAddon.instances[0]!;
    const search2 = searchMock.FakeSearchAddon.instances[1]!;
    expect(term1!.addons).toContain(search1);
    expect(term2!.addons).toContain(search2);

    // Absent by default: no input until toggled, and no header-right container involved.
    expect(screen.queryByRole('textbox', { name: /search scrollback/i })).toBeNull();
    expect(container.querySelector('.terminal-dock-header-right')).toBeNull();

    // Open the chrome; find-as-you-type drives the ACTIVE tab (2) only.
    fireEvent.click(screen.getByRole('button', { name: /search terminal/i }));
    const input = screen.getByRole('textbox', { name: /search scrollback/i });
    fireEvent.change(input, { target: { value: 'error' } });
    expect(search2.findNextCalls).toContain('error');
    expect(search1.findNextCalls).toEqual([]);

    // Enter advances to the next match; Shift+Enter goes back.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(search2.findNextCalls.filter((q) => q === 'error').length).toBeGreaterThanOrEqual(2);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(search2.findPreviousCalls).toEqual(['error']);

    // Switching tabs re-targets the SAME chrome at the newly-active tab.
    fireEvent.click(tabButton(1));
    fireEvent.change(input, { target: { value: 'warn' } });
    expect(search1.findNextCalls).toContain('warn');
    expect(search2.findNextCalls).not.toContain('warn');

    // Escape closes the chrome — back to absent-by-default.
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: /search scrollback/i })).toBeNull();
  });

  //    OSC 52 clipboard, WRITE-ONLY: each tab loads the clipboard addon with a custom provider in
  //    the SECOND constructor slot (the runtime is `constructor(base64, provider)` — a provider
  //    landing in the base64 slot would leave the READING default provider active; 0.2.0's
  //    typings now declare both slots). The provider's write half reaches the
  //    system clipboard; its read half always answers EMPTY — OSC 52 read is a paste-exfiltration
  //    vector (any process in the pty could silently read the user's clipboard). Today `initTab`
  //    loads no clipboard addon, so this must fail. ─────────────────────────────────────────────
  it('tdp-clipboard-osc52-write-only: every tab loads the clipboard addon with a second-slot provider whose writes reach the system clipboard and whose reads always resolve empty', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    const readText = vi.fn<() => Promise<string>>(async () => 'secret clipboard contents');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, readText },
      configurable: true,
    });

    render(<TerminalDock />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    expect(clipboardMock.FakeClipboardAddon.instances.length).toBe(1);
    const clip = clipboardMock.FakeClipboardAddon.instances[0]!;
    expect(term.addons).toContain(clip);

    // The provider sits in the SECOND runtime slot (never the base64 slot).
    expect(clip.provider).toBeDefined();
    expect(typeof clip.provider!.readText).toBe('function');
    expect(typeof clip.provider!.writeText).toBe('function');

    // WRITE: an app's OSC 52 copy reaches the system clipboard.
    await clip.provider!.writeText('c', 'copied by the TUI');
    expect(writeText).toHaveBeenCalledWith('copied by the TUI');

    // READ: disabled — always empty, and the system clipboard is never touched.
    expect(await clip.provider!.readText('c')).toBe('');
    expect(readText).not.toHaveBeenCalled();
  });

  //    Right-click copy/paste (the Windows terminal convention), complementing — never replacing —
  //    the signed Ctrl+C/V contract 12: a contextmenu on the pane with a selection COPIES it; with
  //    no selection it PASTES the clipboard through xterm's own paste entry point; the browser
  //    context menu is always suppressed; an absent navigator.clipboard never throws. Today the
  //    pane has no contextmenu handler, so this must fail. ─────────────────────────────────────────
  it('tdp-right-click-copies-selection-or-pastes: contextmenu with a selection copies it (no paste); without a selection it pastes the clipboard; the browser menu is always suppressed; no clipboard never throws', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    const readText = vi.fn<() => Promise<string>>(async () => 'clipboard text');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, readText },
      configurable: true,
    });

    const { container } = render(<TerminalDock />);
    await expand();

    const term = xtermMock.FakeTerminal.instances[0]!;
    const pane = container.querySelector('.terminal-dock-body') as HTMLElement;

    // WITH a selection: copy, no paste, browser menu suppressed (fireEvent returns false when
    // preventDefault was called on the cancelable event).
    term.selection = 'picked text';
    expect(fireEvent.contextMenu(pane)).toBe(false);
    await flush();
    expect(writeText).toHaveBeenCalledWith('picked text');
    expect(term.pasted).toEqual([]);

    // WITHOUT a selection: paste through xterm's own entry point, no copy.
    writeText.mockClear();
    term.selection = '';
    expect(fireEvent.contextMenu(pane)).toBe(false);
    await flush();
    expect(readText).toHaveBeenCalled();
    expect(term.pasted).toEqual(['clipboard text']);
    expect(writeText).not.toHaveBeenCalled();

    // An absent navigator.clipboard never throws; the browser menu is still suppressed.
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    expect(() => fireEvent.contextMenu(pane)).not.toThrow();
    expect(fireEvent.contextMenu(pane)).toBe(false);
  });
});
