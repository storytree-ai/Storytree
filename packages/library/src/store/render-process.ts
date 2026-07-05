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
