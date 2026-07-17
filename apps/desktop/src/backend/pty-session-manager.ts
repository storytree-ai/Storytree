// PtySessionManager — the Electron-main pty lifecycle manager.
//
// A deep module over an injected PtyPort: spawn / write / resize / dispose / route-data /
// snapshot / list, tracking multiple independent sessions and failing closed (typed
// false/null/no-op, never a throw) on an unknown or already-disposed session id. No
// `electron` import, no `node-pty` import — the real pty is reached only through the
// injected PtyPort, so the whole lifecycle is provable headlessly (node:test, a fake port).
//
// Screen state (ADR-0190): each session's routed output is also written through a
// per-session headless xterm (@xterm/headless) so snapshot() can resolve the SERIALIZED
// PARSED SCREEN (@xterm/addon-serialize) rather than a jumbled raw-byte replay. Both
// packages are pure JS (no native module, no DOM) so this stays provable under node:test.

import type { Terminal as HeadlessTerminal, ITerminalAddon as HeadlessTerminalAddon } from "@xterm/headless";
import type { SerializeAddon as XtermSerializeAddon } from "@xterm/addon-serialize";
import type { Unicode11Addon as XtermUnicode11Addon } from "@xterm/addon-unicode11";
import xtermHeadless from "@xterm/headless";
import xtermSerialize from "@xterm/addon-serialize";
import xtermUnicode11 from "@xterm/addon-unicode11";

// The @xterm packages (headless, addon-serialize, addon-unicode11) ship UMD/CJS bundles
// that assign their named exports dynamically (a runtime `for...in` copy onto
// `exports`), which cjs-module-lexer cannot see statically — a plain `import { Terminal }
// from "@xterm/headless"` throws "does not provide an export named 'Terminal'" under
// Node's native ESM loader. static default imports — named ESM imports fail on these UMD
// bundles under node:test, and createRequire(import.meta.url) crashes the esbuild CJS
// bundle (import.meta.url is undefined there, thrown at apps/desktop/dist/main.cjs load);
// the default-import-then-destructure form is the only one green in BOTH runtimes. Static
// types come from `import type` above (elided at runtime by verbatimModuleSyntax).
const { Terminal } = xtermHeadless as unknown as { Terminal: typeof HeadlessTerminal };
const { SerializeAddon } = xtermSerialize as unknown as {
  SerializeAddon: typeof XtermSerializeAddon;
};
const { Unicode11Addon } = xtermUnicode11 as unknown as {
  Unicode11Addon: typeof XtermUnicode11Addon;
};

export interface PtySpawnOptions {
  shell?: string;
  cwd?: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
}

export interface PtyHandle {
  onData(cb: (chunk: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface PtyPort {
  spawn(opts: PtySpawnOptions): PtyHandle;
}

export interface PtySnapshot {
  data: string;
  cols: number;
  rows: number;
}

type DataSink = (sessionId: string, chunk: string) => void;
type ExitSink = (sessionId: string, e: { exitCode: number }) => void;

interface Session {
  handle: PtyHandle;
  cwd: string | null;
  term: HeadlessTerminal;
  serializeAddon: XtermSerializeAddon;
}

export interface PtySessionManagerOptions {
  /** Scrollback line bound of each session's headless screen model. */
  scrollbackLines?: number;
}

// Generous default — several thousand lines of typical terminal output. The renderer's
// TerminalDock constructs its xterm with the SAME literal (its constructor `scrollback`) —
// duplicated there by design, the thin-client boundary forbids it importing desktop code;
// keep the two aligned or a re-attach replays more lines than the renderer can hold.
const DEFAULT_SCROLLBACK_LINES = 5_000;

let nextSessionSeq = 0;

function generateSessionId(): string {
  nextSessionSeq += 1;
  return `pty-session-${Date.now().toString(36)}-${nextSessionSeq}`;
}

export class PtySessionManager {
  readonly #port: PtyPort;
  readonly #sessions = new Map<string, Session>();
  readonly #scrollbackLines: number;

  constructor(port: PtyPort, opts: PtySessionManagerOptions = {}) {
    this.#port = port;
    this.#scrollbackLines = opts.scrollbackLines ?? DEFAULT_SCROLLBACK_LINES;
  }

  get size(): number {
    return this.#sessions.size;
  }

  has(sessionId: string): boolean {
    return this.#sessions.has(sessionId);
  }

  create(opts: PtySpawnOptions, onData: DataSink, onExit: ExitSink): string {
    const sessionId = generateSessionId();
    const handle = this.#port.spawn(opts);
    const term = new Terminal({
      cols: opts.cols,
      rows: opts.rows,
      allowProposedApi: true,
      scrollback: this.#scrollbackLines,
    });
    const serializeAddon = new SerializeAddon();
    // Both packages expose the same runtime terminal shape; the addon's public types
    // target @xterm/xterm, not @xterm/headless — a narrow cast at this seam is the
    // sanctioned escape (ADR-0190).
    term.loadAddon(serializeAddon as unknown as HeadlessTerminalAddon);
    // Unicode 11 width tables, in PARITY with the renderer's TerminalDock terminal (its
    // own vitest contract): xterm defaults to Unicode 6 widths, which mis-measure
    // emoji/spinner glyphs — one-sided tables would make a re-attach replay re-wrap
    // differently than the live rendering did. Term-owned after loadAddon (term.dispose()
    // reaps it with the session).
    term.loadAddon(new Unicode11Addon() as unknown as HeadlessTerminalAddon);
    term.unicode.activeVersion = "11";

    this.#sessions.set(sessionId, { handle, cwd: opts.cwd ?? null, term, serializeAddon });

    handle.onData((chunk) => {
      const session = this.#sessions.get(sessionId);
      if (!session) {
        // Disposed already — a late chunk from a race after kill() is dropped, not
        // routed to a freed sink.
        return;
      }
      session.term.write(chunk);
      onData(sessionId, chunk);
    });

    handle.onExit((e) => {
      const session = this.#sessions.get(sessionId);
      if (!session) {
        return;
      }
      this.#teardown(sessionId, session);
      onExit(sessionId, e);
    });

    return sessionId;
  }

  write(sessionId: string, data: string): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.handle.write(data);
    return true;
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return false;
    }
    session.handle.resize(cols, rows);
    session.term.resize(cols, rows);
    return true;
  }

  dispose(sessionId: string): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return false;
    }
    this.#teardown(sessionId, session);
    session.handle.kill();
    return true;
  }

  /** The serialized parsed screen (content, colours, cursor, line-bounded scrollback) plus
   * the currently-tracked dims. ASYNC: first flushes the headless terminal's pending writes
   * so the serialization reflects every chunk received before the call. Fail-closed: null
   * (never a throw) for an unknown or disposed id. */
  async snapshot(sessionId: string): Promise<PtySnapshot | null> {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return null;
    }
    await new Promise<void>((resolve) => {
      session.term.write("", resolve);
    });
    // The session may have been disposed while the flush was in flight.
    const stillLive = this.#sessions.get(sessionId);
    if (!stillLive) {
      return null;
    }
    return {
      data: stillLive.serializeAddon.serialize(),
      cols: stillLive.term.cols,
      rows: stillLive.term.rows,
    };
  }

  /** The live sessions — id, spawn cwd, in creation order. A disposed or self-exited
   * session drops out. Facts only, no policy (e.g. per-repo scoping lives in the glue). */
  list(): Array<{ sessionId: string; cwd: string | null }> {
    return Array.from(this.#sessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      cwd: session.cwd,
    }));
  }

  #teardown(sessionId: string, session: Session): void {
    this.#sessions.delete(sessionId);
    session.serializeAddon.dispose();
    session.term.dispose();
  }
}
