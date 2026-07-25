/**
 * The terminal CLI capture composition — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (ADR-0235 / ADR-0241).
 *
 * ── SCAFFOLD, NOT THE IMPLEMENTATION ─────────────────────────────────────────────────────────
 * This file is staged as an inert, fail-silent STUB so that the CLI can import and call it before
 * the capability that owns it has been built. That resolves a real chicken-and-egg: the story's
 * UAT spawns the REAL `pnpm storytree` process, so the CLI must already compose this entry point,
 * yet this file is `terminal-capture-activation`'s declared `real.sourceFile` and only that
 * capability's write-scoped leaf may author its behaviour.
 *
 * The stub keeps every CLI invocation working and observably uninstrumented: capture writes
 * nothing and the query surface reports that the composition is not yet built. The UAT is
 * therefore honestly RED against this file and GREEN against the real composition — the red→green
 * the prove-it-gate observes, rather than a pre-passed test.
 *
 * The signatures below are the seam the CLI glue already calls, taken from the capability's
 * guidance (`captureCliInvocation({ argv, ok, sessionId, … })` plus the thin query composition).
 * Identity is resolved by the CLI and passed IN — this package must not depend on
 * `@storytree/drive` for `deriveIdentity()`, which keeps its runtime deps to zod and the
 * increment-1 vocabulary.
 */

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

const NOT_COMPOSED =
  "Context-traversal capture is not composed yet — `terminal-capture-activation` has not been built.";

/**
 * Ambient capture of one terminal invocation's allowlisted READS.
 *
 * STUB: deliberately does nothing. Capture is additive and fail-silent by contract (ADR-0241 D3),
 * so an uncomposed capture path is indistinguishable from an uninstrumented run — which is exactly
 * what the "capture is additive and opt-out-clean" contract demands of the off path anyway.
 */
export function captureCliInvocation(_input: CaptureCliInvocationInput): void {
  // Intentionally empty. `terminal-capture-activation`'s leaf replaces this file wholesale with the
  // real composition: resolve the directory, call the pure `observeCliInvocation` observer, and hand
  // its events to the sink's synchronous `appendTraversalEvents`.
}

/**
 * Replay one captured session for `storytree traversal show <sessionId>`.
 *
 * STUB: reports honestly that the composition does not exist yet rather than fabricating a replay.
 */
export function showTraversalSession(sessionId: string, _opts?: TraversalQueryOptions): RenderedEnvelope {
  return {
    ok: false,
    body: `${NOT_COMPOSED}\n\nNo replay is available for session "${sessionId}".`,
  };
}

/**
 * Render the captured-session index for `storytree traversal list`.
 *
 * STUB: reports honestly that the composition does not exist yet rather than fabricating an index.
 */
export function listTraversalSessionsRendered(_opts?: TraversalQueryOptions): RenderedEnvelope {
  return { ok: false, body: NOT_COMPOSED };
}
