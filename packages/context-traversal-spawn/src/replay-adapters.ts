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
  renderCoverageCaveats,
  renderTraversalSession,
  resolveTraversalDir,
  FOLLOW_OFFER_EDGE_CAVEATS,
  FOLLOW_OFFER_EDGE_COVERAGE,
} from "@storytree/context-traversal-capture";
import type { TraversalRenderEnvelope, TraversalQueryOptions } from "@storytree/context-traversal-capture";

import { BUILD_SPAWN_BOUNDARY_COVERAGE } from "./observe-leaf-slices.js";

/**
 * Replay one captured session declaring the union of every installed adapter's coverage
 * (currently the terminal CLI dispatch adapter and the build spawn boundary adapter). Reads only —
 * this composition writes nothing.
 *
 * The terminal declaration is the OUTERMOST composed constant — now `FOLLOW_OFFER_EDGE_COVERAGE`,
 * which composes `OFFER_CANDIDATE_SET_COVERAGE` → `AGENT_DESCENT_COVERAGE` → `REVISIT_LINK_COVERAGE`
 * → `observe-cli.ts`'s base. Each layer adds what the wired composition genuinely emits: increment 6
 * added `field:prior_visit_id` (same-node revisits), increment 11 added `field:parent_visit_id` (an
 * `agents <name>` render's floor-ref descent), `context-decision-tree-arc`'s first build increment
 * added `event:candidate_set` (a `library artifact <id>` render's recorded offer, ADR-0260 D1), and
 * its second adds `event:followed_edge` + `field:candidate_follow_causality` (an offer-carrying read
 * declaring the edge it answered, ADR-0260 D3). This is the one render the CLI actually calls, and
 * declaring an inner layer here printed a field under `omitted` on a trace that visibly carried it —
 * the self-denial ADR-0235 clause 6 forbids, and the shape the capacity render (#933), the
 * prior-visit render (#944) and the candidate-set render (#1003) each had to correct at this exact
 * seam. When a further layer is composed, this import moves to it — and the only way to know it
 * moved is to walk the real binary, because the owning package's own suite goes green either way.
 *
 * The body also carries the terminal adapter's CAVEATS (ADR-0260 D7). The closed feature enum can say
 * `event:followed_edge` is emitted; it cannot say why the resulting picture will still be thin — that
 * a `doc:` offer can never be observed as followed, that a follow is recorded only when the agent
 * re-uses the offered form CARRYING the offer id, and that an unanswered offer is indistinguishable
 * from a bypassed mechanism. ADR-0260 D4 forbids repairing any of those gaps by inference, so saying
 * so in the same body is the only mitigation there is.
 */
export function showTraversalSessionAllAdapters(
  sessionId: string,
  opts?: TraversalQueryOptions,
): TraversalRenderEnvelope {
  const dir = opts?.dir ?? resolveTraversalDir();
  const { replay, skipped } = readTraversalSession({ dir, sessionId });
  const rendered = renderTraversalSession(
    { ...replay, coverage: [FOLLOW_OFFER_EDGE_COVERAGE, BUILD_SPAWN_BOUNDARY_COVERAGE] },
    { skipped },
  );
  const caveats = renderCoverageCaveats(FOLLOW_OFFER_EDGE_CAVEATS);
  return { ...rendered, body: `${rendered.body}\n\ncoverage-caveats:\n${caveats}` };
}
