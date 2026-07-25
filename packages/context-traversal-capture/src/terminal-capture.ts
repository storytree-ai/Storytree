/**
 * The terminal CLI capture composition — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (ADR-0235 / ADR-0241).
 *
 * The one entry point the CLI calls: resolve the trace directory, call
 * `terminal-boundary-observations`'s pure observer (`observeCliInvocation`), and hand the result
 * to `traversal-trace-sink`'s synchronous append. Also exposes the thin query composition
 * (`showTraversalSession` / `listTraversalSessionsRendered`) that reads through the sink and
 * renders through `traversal-session-query`.
 *
 * Capture is additive and fail-silent, never fail-closed (ADR-0241 D3): this module never throws
 * (every filesystem edge is already absorbed by the sink) and its only side effect is appending
 * bytes — it never touches the envelope or the exit code. Identity is resolved by the CLI and
 * passed IN — this package must not depend on `@storytree/drive` for `deriveIdentity()`, which
 * keeps its runtime deps to zod and the increment-1 vocabulary.
 */
import { randomUUID } from "node:crypto";

import { observeCliInvocation, TERMINAL_CLI_DISPATCH_COVERAGE } from "./observe-cli.js";
import { renderTraversalSession, renderTraversalSessions } from "./query-render.js";
import {
  appendTraversalEvents,
  listTraversalSessions,
  readTraversalSession,
  resolveTraversalDir,
} from "./sink.js";

const TRAVERSAL_TOGGLE_ENV = "STORYTREE_TRAVERSAL";

/** What the CLI boundary hands the capture composition for one invocation. */
export interface CaptureCliInvocationInput {
  /** The invocation's argv with the pnpm `--` separator already stripped. */
  readonly argv: readonly string[];
  /** The envelope's own outcome — observation is success-only (`ok: false` observes nothing). */
  readonly ok: boolean;
  /**
   * The resolved session identity, or null when none resolves (the main checkout, CI, the lobby).
   * Null must capture NOTHING — an absent identity is a normal, silent no-op, never an error.
   */
  readonly sessionId: string | null;
  /** Overrides the resolved trace directory; defaults to {@link resolveTraversalDir}. */
  readonly dir?: string;
  /** Overrides the `STORYTREE_TRAVERSAL=off` opt-out check. */
  readonly enabled?: boolean;
  /** Injected clock, so the composition stays testable. */
  readonly now?: () => Date;
  /** Injected id source for visit identity. */
  readonly nextId?: () => string;
}

/** Where the query composition reads a captured session from. */
export interface TraversalQueryOptions {
  /** Overrides the resolved trace directory; defaults to {@link resolveTraversalDir}. */
  readonly dir?: string;
}

/** The rendered body the CLI's `traversal` area prints. Structurally the CLI's own Envelope. */
interface RenderedEnvelope {
  readonly ok: boolean;
  readonly body: string;
  readonly next?: readonly string[];
}

/**
 * Whether capture is enabled for this invocation: an explicit `enabled` override wins, else
 * `STORYTREE_TRAVERSAL=off` opts out, else capture is on by default.
 */
function isCaptureEnabled(override: boolean | undefined): boolean {
  if (override !== undefined) return override;
  return process.env[TRAVERSAL_TOGGLE_ENV] !== "off";
}

/**
 * Ambient capture of one terminal invocation's allowlisted READS.
 *
 * Additive and fail-silent (ADR-0241 D3): with capture off, or no resolvable session identity,
 * this is a silent no-op — no directory is resolved, no file is created. Otherwise it observes the
 * invocation through the pure `terminal-cli-dispatch` adapter and appends whatever it finds
 * (possibly zero events) through the sink. Never throws — the sink itself never throws, and every
 * step here is synchronous.
 */
export function captureCliInvocation(input: CaptureCliInvocationInput): void {
  if (!isCaptureEnabled(input.enabled)) return;
  if (input.sessionId === null) return;

  const sessionId = input.sessionId;
  const now = input.now ?? (() => new Date());
  const nextId = input.nextId ?? (() => randomUUID());

  const events = observeCliInvocation(input.argv, {
    ok: input.ok,
    sessionId,
    nextVisitId: nextId,
    now,
  });
  if (events.length === 0) return;

  const dir = input.dir ?? resolveTraversalDir();
  appendTraversalEvents(events, { dir, sessionId });
}

/**
 * Replay one captured session for `storytree traversal show <sessionId>`.
 *
 * The sink persists events only, never coverage declarations, so this composition — the only place
 * that knows which adapter captured through the terminal CLI — declares `terminal-cli-dispatch`'s
 * coverage for the render itself.
 */
export function showTraversalSession(sessionId: string, opts?: TraversalQueryOptions): RenderedEnvelope {
  const dir = opts?.dir ?? resolveTraversalDir();
  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  return renderTraversalSession({ ...replay, coverage: [TERMINAL_CLI_DISPATCH_COVERAGE] }, { skipped });
}

/**
 * Render the captured-session index for `storytree traversal list`.
 */
export function listTraversalSessionsRendered(opts?: TraversalQueryOptions): RenderedEnvelope {
  const dir = opts?.dir ?? resolveTraversalDir();
  const list = listTraversalSessions({ dir });
  return renderTraversalSessions(list);
}
