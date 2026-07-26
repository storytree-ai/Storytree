/**
 * The multi-adapter replay composition (story `context-traversal-spawn`, capability
 * `multi-adapter-replay`, ADR-0235 / ADR-0241 / ADR-0192).
 *
 * Increment 2's `showTraversalSession` hardcodes the single terminal adapter's coverage
 * declaration, because at the time the terminal was the only producer. A session's trace can now
 * also hold `spawn_handoff` / `model_context` / `result_return` events from the build spawn
 * boundary adapter — rendering those under a coverage block that omits them would tell the reader
 * the trace could not contain what it is visibly showing (ADR-0235 clause 6).
 *
 * This composition reads through increment 2's `readTraversalSession` and renders through its
 * `renderTraversalSession`, unchanged — it only widens which adapters' coverage declarations are
 * attached to the render. Coverage is a per-adapter CAPABILITY statement, not an emission claim:
 * every INSTALLED adapter's declaration is declared, regardless of whether it actually emitted into
 * this particular session.
 */
import {
  readTraversalSession,
  renderTraversalSession,
  resolveTraversalDir,
  REVISIT_LINK_COVERAGE,
} from "@storytree/context-traversal-capture";
import type { TraversalRenderEnvelope, TraversalQueryOptions } from "@storytree/context-traversal-capture";

import { BUILD_SPAWN_BOUNDARY_COVERAGE } from "./observe-leaf-slices.js";

/**
 * Replay one captured session declaring the union of every installed adapter's coverage
 * (currently the terminal CLI dispatch adapter and the build spawn boundary adapter). Reads only —
 * this composition writes nothing.
 *
 * The terminal declaration is the COMPOSED `REVISIT_LINK_COVERAGE`, not `observe-cli.ts`'s base
 * constant: since increment 6 the terminal composition links same-node revisits, so it really does
 * emit `field:prior_visit_id`. This is the one render the CLI actually calls, and declaring the base
 * here printed `field:prior_visit_id` under `omitted` on a trace that visibly carried it — the same
 * self-denial ADR-0235 clause 6 forbids, and the same shape as the capacity render #933 corrected.
 */
export function showTraversalSessionAllAdapters(
  sessionId: string,
  opts?: TraversalQueryOptions,
): TraversalRenderEnvelope {
  const dir = opts?.dir ?? resolveTraversalDir();
  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  return renderTraversalSession(
    { ...replay, coverage: [REVISIT_LINK_COVERAGE, BUILD_SPAWN_BOUNDARY_COVERAGE] },
    { skipped },
  );
}
