/**
 * Revisit-link metadata (ADR-0235, ADR-0241), story `context-traversal-capture`, capability
 * `revisit-link-metadata`.
 *
 * `linkRevisits` is a total, pure function over already-observed events: no clock, no filesystem,
 * no id generation. It names, on each visit event, the LATEST earlier visit to the same node within
 * the same session — searching the caller-supplied `priorEvents` first, then the earlier members of
 * `observed` itself (in the append order they were given, never by reading `at` — ADR-0235's
 * no-timestamp-causality rule holds at this producer too).
 */
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalCoverage, ContextTraversalEvent, ContextVisitEvent } from "@storytree/context-traversal-telemetry";

import { TERMINAL_CLI_DISPATCH_COVERAGE } from "./observe-cli.js";

/**
 * Find the latest visit in `history` (in append order) to the same node, in the same session, as
 * `event` — never `event` itself. "Latest" means the last matching entry in the given order, so a
 * later call always overwrites an earlier candidate.
 */
function findLatestPriorVisit(
  history: readonly ContextTraversalEvent[],
  event: ContextVisitEvent,
): ContextVisitEvent | undefined {
  let found: ContextVisitEvent | undefined;
  for (const candidate of history) {
    if (!isContextVisitEvent(candidate)) continue;
    if (candidate.sessionId !== event.sessionId) continue;
    if (candidate.nodeId !== event.nodeId) continue;
    if (candidate.visitId === event.visitId) continue;
    found = candidate;
  }
  return found;
}

/**
 * Return `observed` with `priorVisitId` set on each visit event that has an earlier same-session,
 * same-node visit in `priorEvents` or earlier in `observed` itself. Non-visit events pass through
 * untouched. When there is no earlier visit, the key is left absent entirely (never
 * present-and-`undefined`) so `JSON.stringify` never emits it.
 */
export function linkRevisits(
  observed: readonly ContextTraversalEvent[],
  priorEvents: readonly ContextTraversalEvent[],
): ContextTraversalEvent[] {
  const history: ContextTraversalEvent[] = [...priorEvents];
  const linked: ContextTraversalEvent[] = [];

  for (const event of observed) {
    if (!isContextVisitEvent(event)) {
      linked.push(event);
      history.push(event);
      continue;
    }

    const earlier = findLatestPriorVisit(history, event);
    const nextEvent: ContextTraversalEvent = earlier === undefined ? event : { ...event, priorVisitId: earlier.visitId };

    linked.push(nextEvent);
    history.push(nextEvent);
  }

  return linked;
}

const REVISIT_LINK_SUPPORTED: ContextTraversalCoverage["supported"] = [
  ...TERMINAL_CLI_DISPATCH_COVERAGE.supported,
  "field:prior_visit_id",
];

const REVISIT_LINK_OMITTED: ContextTraversalCoverage["omitted"] = TERMINAL_CLI_DISPATCH_COVERAGE.omitted.filter(
  (feature) => feature !== "field:prior_visit_id",
);

/**
 * The `terminal-cli-dispatch` coverage, composed: `field:prior_visit_id` moves from `omitted` to
 * `supported` because this module wires revisit links onto that adapter's output. Every other
 * feature stays exactly where the base (`observe-cli.ts`) put it — composition, never a rewrite.
 */
export const REVISIT_LINK_COVERAGE: ContextTraversalCoverage = {
  adapterId: TERMINAL_CLI_DISPATCH_COVERAGE.adapterId,
  supported: REVISIT_LINK_SUPPORTED,
  omitted: REVISIT_LINK_OMITTED,
};
