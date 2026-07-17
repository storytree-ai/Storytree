// PtySessionManager — the Electron-main pty lifecycle manager.
//
// A deep module over an injected PtyPort: spawn / write / resize / dispose / route-data /
// snapshot / list / ack, tracking multiple independent sessions and failing closed (typed
// false/null/no-op, never a throw) on an unknown or already-disposed session id. No
// `electron` import, no `node-pty` import — the real pty is reached only through the
// injected PtyPort, so the whole lifecycle is provable headlessly (node:test, a fake port).
//
// Throughput (increment B of the embedded-terminal patterns survey): routed output is
// BATCHED per session (chunks coalesce for a 5 ms window and reach the sink as one joined
// string — VS Code's TerminalDataBufferer pattern) and FLOW-CONTROLLED with ack-based
// watermarks (pause the pty handle past 100k unacknowledged chars, resume below 5k on
// ack() — out-of-band, never node-pty's in-band experimental handleFlowControl).
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
  /** Flow control (out-of-band, never node-pty's in-band experimental handleFlowControl):
   *  stop reading the pty's output while the renderer's unacknowledged backlog is past the
   *  high watermark. The real port wraps node-pty's own pause(). */
  pause(): void;
  /** Resume reading the pty's output once the renderer has consumed back below the low
   *  watermark. The real port wraps node-pty's own resume(). */
  resume(): void;
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
  /** The registered data sink — held on the session so the batching flush can reach it. */
  sink: DataSink;
  /** Chunks coalescing inside the current flush window (batching, increment B). */
  pending: string[];
  flushTimer: ReturnType<typeof setTimeout> | null;
  /** Chars routed to the sink's consumer but not yet acknowledged back (flow control). */
  unackedChars: number;
  /** Whether the pty handle is currently paused by flow control. */
  paused: boolean;
}

export interface PtySessionManagerOptions {
  /** Scrollback line bound of each session's headless screen model. */
  scrollbackLines?: number;
  /** Batching flush window (ms) — chunks arriving within it reach the sink as ONE joined string. */
  dataFlushIntervalMs?: number;
  /** Unacknowledged chars past this pause the pty handle (flow control). */
  highWatermarkChars?: number;
  /** A paused pty resumes once unacknowledged chars drop below this. */
  lowWatermarkChars?: number;
}

// Generous default — several thousand lines of typical terminal output. The renderer's
// TerminalDock constructs its xterm with the SAME literal (its constructor `scrollback`) —
// duplicated there by design, the thin-client boundary forbids it importing desktop code;
// keep the two aligned or a re-attach replays more lines than the renderer can hold.
const DEFAULT_SCROLLBACK_LINES = 5_000;

// Throughput defaults (increment B of the embedded-terminal patterns survey) — VS Code's
// verified constants. Batching: one sink call per session per 5 ms window (the
// TerminalDataBufferer pattern) instead of one per pty chunk — the (sessionId, chunk) wire
// shape is unchanged, there are just fewer, larger messages. Flow control: xterm's renderer
// write buffer is unbounded until its 50 MB OOM guard, so a fast producer (a `pnpm gate` in
// the dock) must be backpressured at the SOURCE — past 100,000 unacknowledged chars the pty
// handle is paused; acks (chars the renderer actually parsed) resume it below 5,000.
const DEFAULT_DATA_FLUSH_INTERVAL_MS = 5;
const DEFAULT_HIGH_WATERMARK_CHARS = 100_000;
const DEFAULT_LOW_WATERMARK_CHARS = 5_000;

let nextSessionSeq = 0;

function generateSessionId(): string {
  nextSessionSeq += 1;
  return `pty-session-${Date.now().toString(36)}-${nextSessionSeq}`;
}

export class PtySessionManager {
  readonly #port: PtyPort;
  readonly #sessions = new Map<string, Session>();
  readonly #scrollbackLines: number;
  readonly #flushIntervalMs: number;
  readonly #highWatermarkChars: number;
  readonly #lowWatermarkChars: number;

  constructor(port: PtyPort, opts: PtySessionManagerOptions = {}) {
    this.#port = port;
    this.#scrollbackLines = opts.scrollbackLines ?? DEFAULT_SCROLLBACK_LINES;
    this.#flushIntervalMs = opts.dataFlushIntervalMs ?? DEFAULT_DATA_FLUSH_INTERVAL_MS;
    this.#highWatermarkChars = opts.highWatermarkChars ?? DEFAULT_HIGH_WATERMARK_CHARS;
    this.#lowWatermarkChars = opts.lowWatermarkChars ?? DEFAULT_LOW_WATERMARK_CHARS;
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

    this.#sessions.set(sessionId, {
      handle,
      cwd: opts.cwd ?? null,
      term,
      serializeAddon,
      sink: onData,
      pending: [],
      flushTimer: null,
      unackedChars: 0,
      paused: false,
    });

    handle.onData((chunk) => {
      const session = this.#sessions.get(sessionId);
      if (!session) {
        // Disposed already — a late chunk from a race after kill() is dropped, not
        // routed to a freed sink.
        return;
      }
      // The headless screen model gets every chunk IMMEDIATELY (snapshot() must reflect
      // everything received before the call); only the sink relay is batched below.
      session.term.write(chunk);

      // Flow control: count at arrival — the chars are committed to the consumer's backlog
      // the moment they leave the pty — and pause the source past the high watermark.
      session.unackedChars += chunk.length;
      if (!session.paused && session.unackedChars > this.#highWatermarkChars) {
        session.paused = true;
        session.handle.pause();
      }

      // Batching: coalesce this session's chunks inside one flush window and deliver them
      // as ONE joined sink call — same (sessionId, chunk) shape, fewer, larger messages.
      session.pending.push(chunk);
      if (session.flushTimer === null) {
        session.flushTimer = setTimeout(() => this.#flush(sessionId), this.#flushIntervalMs);
      }
    });

    handle.onExit((e) => {
      const session = this.#sessions.get(sessionId);
      if (!session) {
        return;
      }
      // Pending batched output reaches the sink BEFORE the exit routes, so the consumer's
      // '[process exited]' line can never precede (or swallow) the session's last output.
      this.#flush(sessionId);
      this.#teardown(sessionId, session);
      onExit(sessionId, e);
    });

    return sessionId;
  }

  /** Deliver a session's coalesced pending chunks to its sink as one joined string. */
  #flush(sessionId: string): void {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (session.flushTimer !== null) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    if (session.pending.length === 0) {
      return;
    }
    const joined = session.pending.join("");
    session.pending = [];
    session.sink(sessionId, joined);
  }

  /** Flow-control acknowledgement: the consumer reports chars it has actually parsed
   * (xterm's write-callback / parse-complete signal). Decrements the session's unacked
   * backlog (floored at zero) and resumes a paused pty once it drops below the low
   * watermark. Fail-closed: false (never a throw) for an unknown session id or a
   * non-positive/non-finite count — the count crosses IPC from the renderer, untrusted. */
  ack(sessionId: string, charCount: number): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return false;
    }
    if (!Number.isFinite(charCount) || charCount <= 0) {
      return false;
    }
    session.unackedChars = Math.max(0, session.unackedChars - Math.floor(charCount));
    if (session.paused && session.unackedChars < this.#lowWatermarkChars) {
      session.paused = false;
      session.handle.resume();
    }
    return true;
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
   * (never a throw) for an unknown or disposed id.
   *
   * ALSO the flow-control re-attach reset (VS Code's clearUnacknowledgedChars discipline):
   * snapshot() is the re-attach entry point — the caller is a FRESH consumer whose backlog
   * starts at the serialized screen it is about to replay, so the old consumer's unacked
   * count is void. Cleared here (and a paused pty resumed) so a renderer that dropped
   * without acking can never wedge the session. */
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
    stillLive.unackedChars = 0;
    if (stillLive.paused) {
      stillLive.paused = false;
      stillLive.handle.resume();
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
    if (session.flushTimer !== null) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    session.serializeAddon.dispose();
    session.term.dispose();
  }
}
