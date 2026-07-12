// PtySessionManager — the Electron-main pty lifecycle manager.
//
// A deep module over an injected PtyPort: spawn / write / resize / dispose / route-data,
// tracking multiple independent sessions and failing closed (typed false/no-op, never a
// throw) on an unknown or already-disposed session id. No `electron` import, no `node-pty`
// import — the real pty is reached only through the injected PtyPort, so the whole
// lifecycle is provable headlessly (node:test, a fake port).

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

type DataSink = (sessionId: string, chunk: string) => void;
type ExitSink = (sessionId: string, e: { exitCode: number }) => void;

interface Session {
  handle: PtyHandle;
  cwd: string | null;
  chunks: string[];
  bytes: number;
}

export interface PtySessionManagerOptions {
  /** Total bytes of buffered scrollback kept per session (oldest chunks trimmed first). */
  scrollbackBytes?: number;
}

// Generous default — sized for several thousand lines of typical terminal output.
const DEFAULT_SCROLLBACK_BYTES = 5_000_000;

let nextSessionSeq = 0;

function generateSessionId(): string {
  nextSessionSeq += 1;
  return `pty-session-${Date.now().toString(36)}-${nextSessionSeq}`;
}

export class PtySessionManager {
  readonly #port: PtyPort;
  readonly #sessions = new Map<string, Session>();
  readonly #scrollbackBytes: number;

  constructor(port: PtyPort, opts: PtySessionManagerOptions = {}) {
    this.#port = port;
    this.#scrollbackBytes = opts.scrollbackBytes ?? DEFAULT_SCROLLBACK_BYTES;
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
    this.#sessions.set(sessionId, { handle, cwd: opts.cwd ?? null, chunks: [], bytes: 0 });

    handle.onData((chunk) => {
      const session = this.#sessions.get(sessionId);
      if (!session) {
        // Disposed already — a late chunk from a race after kill() is dropped, not
        // routed to a freed sink.
        return;
      }
      this.#appendChunk(session, chunk);
      onData(sessionId, chunk);
    });

    handle.onExit((e) => {
      if (!this.#sessions.has(sessionId)) {
        return;
      }
      this.#sessions.delete(sessionId);
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
    return true;
  }

  dispose(sessionId: string): boolean {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return false;
    }
    this.#sessions.delete(sessionId);
    session.handle.kill();
    return true;
  }

  /** The session's buffered scrollback — what a re-attaching renderer replays into a
   * fresh xterm. Fail-closed: null (never a throw) for an unknown or disposed id. */
  snapshot(sessionId: string): string | null {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return session.chunks.join("");
  }

  #appendChunk(session: Session, chunk: string): void {
    session.chunks.push(chunk);
    session.bytes += Buffer.byteLength(chunk, "utf8");
    while (session.bytes > this.#scrollbackBytes && session.chunks.length > 0) {
      const oldest = session.chunks.shift();
      if (oldest !== undefined) {
        session.bytes -= Buffer.byteLength(oldest, "utf8");
      }
    }
  }
}
