import type { Store } from "@storytree/storage-protocol";

// ── process branch-edge retrieval (ADR-0154 follow-on / ADR-0161: the process node of the context DAG) ─
// A `process` artifact's `branchEdges` (knowledge.ts) are the ORDERED outbound edges of a process NODE
// in the Library context DAG — the counterpart to an agent-step's `refs`. This is the schema-aware
// EXTRACTOR: it reads one process's branch-edges into node DATA, or fails closed with the process ids
// that exist. Shaping those edges into the ADR-0023 `next:` envelope is the CLI's job (via the shared
// `emitNodeEnvelope`) — the library organism owns the schema, not the envelope (which lives one layer
// up, in @storytree/drive). Mirrors `renderAgentStep` (render-agent.ts) exactly, so both node types of
// the one DAG travel the same library→CLI split.

/** The process ids that exist, sorted — the fail-closed guidance when an id is unknown / not a process. */
async function processIds(store: Store): Promise<string[]> {
  const docs = await store.queryDocs({ kind: "process" });
  return docs.map((d) => d.id).sort();
}

/** The branch-edges on a raw process doc, tolerant of an absent/odd field (like {@link stepRefsOf}). */
function branchEdgesOf(doc: Record<string, unknown>): { ref: string; label?: string }[] {
  const v = doc["branchEdges"];
  if (!Array.isArray(v)) return [];
  const out: { ref: string; label?: string }[] = [];
  for (const entry of v) {
    if (entry === null || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const ref = typeof e["ref"] === "string" ? e["ref"] : "";
    if (ref === "") continue;
    // The ref is returned VERBATIM (`asset:<id>`); the emitter is the single place that maps a ref to
    // its `storytree library artifact <id>` pull. A non-string/empty label is DROPPED so we never emit
    // `label: undefined` (exactOptionalPropertyTypes) — the object then maps straight into a NodeEdge.
    const label = typeof e["label"] === "string" && e["label"] !== "" ? e["label"] : undefined;
    out.push(label !== undefined ? { ref, label } : { ref });
  }
  return out;
}

export type RenderProcessNodeResult =
  | { ok: true; id: string; headline: string; edges: { ref: string; label?: string }[] }
  | { ok: false; reason: string; available: string[] };

/**
 * Read ONE `process`'s branch-edges into a context-DAG node (ADR-0154 follow-on / ADR-0161: the
 * node-keyed context DAG). This is the retrieval path the `storytree library artifact <id>` pull
 * derives its `next:` from for a process id — its `branchEdges` are the node's ORDERED outbound edges.
 * Fail-closed: an unknown id — or an id whose kind is not `process` — returns the process ids that
 * exist (`available`) so the caller can suggest the valid nodes; a missing id asks for one. A process
 * with NO `branchEdges` authored resolves ok with an empty edge list (an honest "no graph yet", not an
 * error). Returns node DATA only — the CLI shapes it into the ADR-0023 `next:` envelope via the shared
 * `emitNodeEnvelope` (ADR-0161 decision 2 — one emitter, never a bespoke per-surface `next:`).
 */
export async function renderProcessNode(
  store: Store,
  id: string | undefined,
): Promise<RenderProcessNodeResult> {
  const available = await processIds(store);
  if (id === undefined || id === "") {
    return {
      ok: false,
      reason: "library artifact <id> needs a process id to derive its graph.",
      available,
    };
  }
  const stored = await store.getDoc(id);
  if (!stored || stored.kind !== "process") {
    return { ok: false, reason: `no process "${id}" in the Library.`, available };
  }
  const doc = stored.doc as Record<string, unknown>;
  const title =
    typeof doc["title"] === "string" && doc["title"] !== "" ? (doc["title"] as string) : stored.id;
  const edges = branchEdgesOf(doc);
  const headline =
    `${title} — process graph (ADR-0161)\n\n` +
    (edges.length > 0
      ? "Each branch below is a node this process hands on to; pull it just-in-time."
      : "This process has no branch-edges yet — follow its body above.");
  return { ok: true, id: stored.id, headline, edges };
}

// ── the process-graph integrity gate (ADR-0161 decision 5) ────────────────────────────────────────
// The counterpart of the agent step→refs fence (essentialsGateViolations, render-agent.ts): the
// dangling-ref fence extended to the process tier's STRUCTURED edges. The CLI `check:process-graph`
// (in `pnpm gate`) runs this over the whole corpus's `process` docs and fails closed on any violation,
// so the Library context DAG's process half cannot silently grow a dangling branch or a cycle.
//
// SCOPED to two integrity properties: (a) every branch-edge RESOLVES to a real artifact, and (b) the
// process graph has NO CYCLE. ADR-0161 dec 5 also names "unreachable nodes", but the process
// branch-edge graph has NO declared root, and reachability is only computable relative to one. The ADR
// settles resolve + cycles — its Consequences names cycles as the load-bearing property ("The graph
// must not grow cycles") — but never defines a graph root, so enforcing reachability would mean
// inventing a root semantics the corpus does not settle. That is deferred, not this unit's business
// (it would naturally become definable once a real traversal entry-point is declared) — we do not
// invent it here. Mirrors inc 5's scoped no-unattached-context check, which was likewise a no-op until
// the data it guards existed.
//
// A NO-OP today: no seed `process` carries `branchEdges` yet, so the graph is empty and the gate stays
// green — honest, exactly like the inc-4 agent checks were no-ops until `stepRefs` were authored.

/** A branch-edge's target id — the `asset:` prefix stripped, as {@link renderProcessNode}'s emitter does. */
function edgeTargetId(ref: string): string {
  return ref.replace(/^asset:/, "");
}

/**
 * Enumerate the process branch-edge GRAPH's integrity violations (ADR-0161 decision 5). Returns the
 * list of VIOLATIONS across every `process` doc's `branchEdges` (empty ⇒ the graph is sound); the CLI
 * `check:process-graph` (in `pnpm gate`) fails the build on any. Asserts, fail-closed:
 *   (a) RESOLVE — every branch-edge `ref` (`asset:<id>`) points at a real artifact in the corpus; a
 *       dangling edge reds, naming the process + the missing ref.
 *   (b) NO CYCLE — no `process` is reachable from itself via branch-edges; a cycle reds, naming the
 *       loop path. Only a `process` carries branch-edges, so a cycle is a loop of process nodes — a
 *       non-process (or unknown) target is a leaf that cannot continue the path.
 * Reachability/"unreachable" is deliberately OUT of scope (see the section header): no declared graph
 * root, so no reachability semantics is invented here. REUSES {@link branchEdgesOf}, the tolerant edge
 * reader — malformed edges are already dropped there, so this sees only well-formed `{ ref, label? }`.
 */
export async function processGraphViolations(store: Store): Promise<string[]> {
  const violations: string[] = [];
  const processes = await store.queryDocs({ kind: "process" });

  // Index every process's edges once (via the tolerant reader), so the cycle traversal is O(V+E) and
  // the graph is read from the store a single time.
  const edgesById = new Map<string, { ref: string; label?: string }[]>();
  for (const p of processes) {
    edgesById.set(p.id, branchEdgesOf(p.doc as Record<string, unknown>));
  }

  // (a) RESOLVE — every branch-edge ref must point at a real artifact.
  for (const [id, edges] of edgesById) {
    for (const { ref } of edges) {
      if (!(await store.getDoc(edgeTargetId(ref)))) {
        violations.push(
          `process "${id}" has a dangling branch-edge ${ref} — it resolves to no artifact.`,
        );
      }
    }
  }

  // (b) NO CYCLE — DFS with a recursion stack (`path`); a back-edge to a node still on the stack is a
  // cycle. Only process nodes have outbound edges, so a target that is not a process id is a leaf we do
  // not descend. Each distinct loop (keyed by its node SET) is reported once.
  const state = new Map<string, "visiting" | "done">();
  const reported = new Set<string>();
  const walk = (id: string, path: string[]): void => {
    state.set(id, "visiting");
    for (const { ref } of edgesById.get(id) ?? []) {
      const next = edgeTargetId(ref);
      if (!edgesById.has(next)) continue; // a non-process (or unknown) target is a leaf — no outbound edges
      const seen = state.get(next);
      if (seen === "visiting") {
        const loop = [...path.slice(path.indexOf(next)), next];
        const key = [...new Set(loop)].sort().join("|");
        if (!reported.has(key)) {
          reported.add(key);
          violations.push(
            `process branch-edge CYCLE: ${loop.join(" → ")} — the process graph must stay acyclic.`,
          );
        }
      } else if (seen === undefined) {
        walk(next, [...path, next]);
      }
    }
    state.set(id, "done");
  };
  for (const id of edgesById.keys()) {
    if (state.get(id) === undefined) walk(id, [id]);
  }

  return violations;
}
