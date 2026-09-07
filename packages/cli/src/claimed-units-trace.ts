/**
 * RECORD WHAT THIS SESSION CLAIMED, on its own traversal declaration (ADR-0541 D2).
 *
 * The real implementation of `RunDeps.recordClaimedUnits` — the seam `noticeboard declare` calls
 * once with the units it actually claimed, so the replay's trace rail can name the arc a session was
 * working on from a RECORDED FACT rather than derive it.
 *
 * ⚠ WHY THIS IS A MODULE OF ITS OWN, AND WHY `commands.ts` HAS NO DEFAULT FOR IT. This is the only
 * write the CLI's dispatch performs into the OPERATOR'S HOME rather than into a store a caller
 * supplied. Resolved ambiently inside the dispatch — which is how it first shipped — every caller
 * that drives `noticeboard declare` writes there, tests included. That is not a hypothetical: on
 * 2026-09-07 the fixture ids `noticeboard-cli`, `tree-view`, `inc-a` and `cap-a` reached a live
 * session's declaration, and a mutation run of those same tests, executing MUTATED merge code
 * against the real file, overwrote that session's declared origin on the way past. The seam is
 * injected and undefaulted so a caller that is not the real CLI cannot reach the home directory at
 * all, and `main.ts` is the one place that supplies this.
 *
 * ⚠ IT HONOURS THE CAPTURE OPT-OUT, because it IS a trace write. ADR-0241 D2 promises that a run
 * with `STORYTREE_TRAVERSAL=off` writes no trace and reads back byte-identical; a declaration sits
 * beside the trace and is read by the same reader, so an opted-out declare must leave the file
 * exactly as it found it.
 *
 * ⚠ NOTHING HERE INFERS AN ARC. It records the unit ids the session itself named. Resolution to an
 * arc happens at READ time against the corpus, and a unit that resolves to no arc stays a unit
 * (ADR-0541 D3/D4). The refused shortcut is joining the trace's worktree SLOT to the claim ledger —
 * a pooled slot answers "every arc ever worked in this worktree".
 *
 * FAIL-SILENT IN BOTH DIRECTIONS, on the capture path's own contract (ADR-0241 D3). A null session
 * id is the primary checkout / CI / the lobby — exactly the runs that capture no trace at all, so
 * there is no row for a unit to label — and an unwritable home leaves the session simply
 * unrecorded. Neither ever touches the claim, the envelope, or the exit code.
 */
import {
  isTraversalCaptureEnabled,
  readSessionOriginDeclaration,
  resolveTraversalDir,
  withClaimedUnits,
  writeSessionOriginDeclaration,
} from "@storytree/context-traversal-capture";

/** What the recorder needs. Every member is injected so the whole function is testable offline. */
export interface ClaimedUnitsTraceEnv {
  /** This invocation's trace identity, or null when none resolves. */
  readonly sessionId: string | null;
  /** Overrides the resolved trace directory — the fixture seam every test uses. */
  readonly dir?: string;
  /** Overrides the `STORYTREE_TRAVERSAL=off` opt-out check. */
  readonly enabled?: boolean;
  /** Injected clock, so a fresh declaration's `declaredAt` is decided by value. */
  readonly now?: () => Date;
}

/**
 * Build the recorder for one invocation.
 *
 * Returns a line to print under the claims, or `null` for "nothing to say" — which covers three
 * different quiet outcomes on purpose: capture is off, no trace identity resolved, and every unit
 * was already on the record. The third is the ordinary case for a re-declare, and returning null
 * there is what keeps a re-declare from rewriting the file and restamping `declaredAt` over the
 * moment the session actually first said it.
 */
export function recordClaimedUnitsOnTrace(
  env: ClaimedUnitsTraceEnv,
): (nodeIds: readonly string[]) => string | null {
  return (nodeIds) => {
    const { sessionId } = env;
    if (sessionId === null) return null;
    if (!isTraversalCaptureEnabled(env.enabled)) return null;
    const dir = env.dir ?? resolveTraversalDir();
    const now = env.now ?? (() => new Date());
    const next = withClaimedUnits(
      readSessionOriginDeclaration(dir, sessionId),
      nodeIds,
      now().toISOString(),
    );
    if (next === null) return null;
    return writeSessionOriginDeclaration(dir, sessionId, next)
      ? `→ trace records this session's units: ${next.units.join(", ")} (ADR-0541 D2)`
      : null;
  };
}

/**
 * The recorder for one invocation's resolved TRACE IDENTITY — what `main.ts` actually calls.
 *
 * A named function rather than an inline `{ sessionId: trace?.sessionId ?? null }` at the call site,
 * because `main.ts` has no tests of its own: logic written there is logic nothing can witness, and
 * the mutation rung says so the moment a line changes. The whole decision this makes — that an
 * unresolved trace identity means "record nothing" rather than "record under some other id" — is
 * therefore made in a module that has tests, and asserted below.
 */
export function claimedUnitsRecorderFor(
  trace: { readonly sessionId: string } | null,
): (nodeIds: readonly string[]) => string | null {
  return recordClaimedUnitsOnTrace({ sessionId: trace?.sessionId ?? null });
}
