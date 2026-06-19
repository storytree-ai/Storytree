// connectionSet — the pure resolver for a node's FULL declared connection set
// (ADR-0074 §4: "you needn't read another package's package.json to know how it
// is wired"). It lets the studio detail panel show how an organism is wired
// without the reader leaving the node: what it CONSUMES (outbound "depends on")
// and who CONSUMES IT (inbound "consumed by").
//
// The crux is that a single directed edge `A → B` ("A depends on / consumes B")
// can be declared at EITHER endpoint (ADR-0074 §2: "the gate covers an edge if
// either endpoint declares it"):
//   • on A as `depends_on: [B]`, or
//   • on B as `consumed_by: [A]`  (the provider-side declaration).
// So neither declaration alone is the full picture, and the resolution is
// SYMMETRIC — both directions must be recovered from both declaration styles:
//   • A's outbound = A.depends_on ∪ {B : B.consumed_by ∋ A}
//   • B's inbound  = B.consumed_by ∪ {A : A.depends_on ∋ B}
// This is what surfaces a de-noised HUB's wiring on its own panel: the `cli` hub
// has an EMPTY `depends_on` — every edge it owns lives on a spoke's
// `consumed_by: [cli]` — so cli's "depends on" is recovered entirely from the
// inverse. Likewise `library` is "consumed by" drive-machinery, store AND cli
// even though only one may sit in its own `consumed_by`.
//
// Pure (no React/DOM) → Stage-1 red-green in connectionSet.test.ts (ADR-0070
// two-stage proof); the panel APPEARANCE is owner-attested, never asserted here.

/** One node's two-sided wiring declaration, as carried per story by /api/tree. */
export interface WiredNode {
  id: string;
  /** Outbound: the ids this node consumes (frontmatter `depends_on`). */
  dependsOn: string[];
  /** Inbound, provider-side: the ids that declare they consume this node (`consumed_by`). */
  consumedBy: string[];
}

/** A node's resolved full connection set: both directions, deduped. */
export interface ConnectionSet {
  /**
   * Outbound — what this node consumes: its own `depends_on` ∪ the derived inverse
   * {every node that declares this one as a consumer (`consumed_by ∋ focus`)}.
   */
  dependsOn: string[];
  /**
   * Inbound — who consumes this node: its own `consumed_by` ∪ the derived inverse
   * {every node whose `depends_on` names this one}.
   */
  consumedBy: string[];
}

/**
 * Resolve `focusId`'s full connection set from the whole node list — both directions,
 * each recovered from BOTH declaration styles (see the module header). Self-edges are
 * dropped on both sides. Dangling ids (declared but no matching node) are KEPT — the
 * panel renders them inertly ("declared, but no such story") rather than silently
 * swallowing a mis-wire.
 *
 * Deterministic ordering: a node's OWN declarations come first in their declared order
 * (deduped) so the common case reads exactly as the spec does, followed by any DERIVED
 * inverse ids appended in sorted order — so a hub whose edges are ALL derived (cli)
 * still renders the same every time.
 */
export function fullConnectionSet(nodes: WiredNode[], focusId: string): ConnectionSet {
  const self = nodes.find((n) => n.id === focusId);
  return {
    // what focus consumes: own depends_on, plus everyone who names focus as a consumer
    dependsOn: resolveDirection(self?.dependsOn ?? [], focusId, nodes, (n) => n.consumedBy),
    // who consumes focus: own consumed_by, plus everyone whose depends_on names focus
    consumedBy: resolveDirection(self?.consumedBy ?? [], focusId, nodes, (n) => n.dependsOn),
  };
}

/**
 * One direction of a node's edges: its OWN declarations (deduped, declared order kept)
 * followed by the DERIVED inverse — every OTHER node whose opposite-style declaration
 * (`inverseDecl`) names the focus — appended in sorted order. Self-edges dropped.
 */
function resolveDirection(
  own: string[],
  focusId: string,
  nodes: WiredNode[],
  inverseDecl: (n: WiredNode) => string[],
): string[] {
  const ordered = [...new Set(own.filter((id) => id !== focusId))];
  const seen = new Set(ordered);
  const derived: string[] = [];
  for (const n of nodes) {
    if (n.id === focusId) continue;
    if (inverseDecl(n).includes(focusId) && !seen.has(n.id)) {
      seen.add(n.id);
      derived.push(n.id);
    }
  }
  derived.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [...ordered, ...derived];
}
