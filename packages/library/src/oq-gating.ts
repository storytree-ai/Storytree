/**
 * ADR-0107 (the proving-process escalation valve generalised from ADR-0106 decision 4): the
 * ATTACHMENT predicate for "an open question gates a story's proving process". When an agent driving
 * a story's adopt/build proving process hits a genuine fork it cannot settle from the corpus, it
 * raises an open question via the Library (ADR-0032) carrying a `node:<storyId>` reference — the
 * token that ATTACHES the OQ to that story's proving process. While such an OQ is open (un-retired),
 * the story's green is WITHHELD (the gate compute is the orchestrator's `gateStoryGreenOnOpenQuestions`).
 *
 * This module owns the `node:<id>` reference convention and the pure attachment filter — the analogue
 * of ADR-0037 §5's `doc:decisions/NNNN` deciding-ADR match, but pointing at the NODE being proven
 * rather than at an ADR. Pure, browser-safe (no `node:` import, no I/O): the CLI/studio load the live
 * open-questions and call this; the orchestrator counts what it returns. It deliberately knows nothing
 * about proof or status — WHICH OQs attach lives here, the green-fold lives with the proof compute.
 */

/**
 * The `references` token that attaches an artifact to a NODE (a story / capability) — the
 * proving-process anchor, alongside the existing `doc:<relpath>` (ADR) and `asset:<id>` (Library
 * unit) reference tokens (`knowledge.ts` `commonShape.references`). An OQ raised during a story's
 * proving process carries `node:<storyId>` so the gate can find it.
 */
export const NODE_REF_PREFIX = "node:";

/** Build the proving-process attachment reference for a node id (`agent` → `node:agent`). */
export function nodeRef(nodeId: string): string {
  return `${NODE_REF_PREFIX}${nodeId}`;
}

/** The minimal structural shape the attachment filter reads — id + its `references` list. */
export interface GatingOpenQuestion {
  readonly id: string;
  readonly references?: readonly string[] | undefined;
}

/**
 * The open questions ATTACHED to node `nodeId`'s proving process — those whose `references` carry the
 * exact `node:<nodeId>` token. Pure and total: a missing/empty `references` list simply doesn't match.
 * The caller supplies the OPEN set (the live `open-question` projection — a retired OQ has dropped out,
 * which is how resolving one unblocks the green, ADR-0018 §6); this never inspects kind or lifecycle,
 * only the attachment edge. Returns the matching OQs (the orchestrator gate takes the count).
 */
export function openQuestionsGatingNode<T extends GatingOpenQuestion>(
  openQuestions: readonly T[],
  nodeId: string,
): T[] {
  const token = nodeRef(nodeId);
  return openQuestions.filter((oq) => oq.references?.includes(token) ?? false);
}
