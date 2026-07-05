/**
 * The guidance envelope (ADR-0023 §4). EVERY command returns one — not bare data. It carries the
 * `result`, the **applicable doctrine** (pointers INTO the Library, never inlined text — the agent
 * earns the detail by exploring, choose-your-own-adventure), and **`next`** (suggested follow-up
 * commands). Errors are guidance, not bare failures: a blocked/empty result still ships `next` so
 * the agent can adapt — the same contract `packages/agent/src/fs-tools.ts` uses for tool results.
 */
export interface Envelope {
  /** false when the command could not give what was asked (unknown id, bad category, usage). */
  readonly ok: boolean;
  /** The result text (a table, an artifact, a list, or an explanation when `ok` is false). */
  readonly body: string;
  /** Applicable doctrine as Library pointers, e.g. "edit-first-curation — storytree library artifact edit-first-curation". */
  readonly doctrine?: readonly string[];
  /** Suggested next commands, the branches of the adventure. */
  readonly next?: readonly string[];
}

/** Render an {@link Envelope} to the text the agent reads on stdout. */
export function formatEnvelope(e: Envelope): string {
  const parts: string[] = [e.body.replace(/\s+$/, "")];
  if (e.doctrine && e.doctrine.length > 0) {
    parts.push("doctrine:\n" + e.doctrine.map((d) => `  - ${d}`).join("\n"));
  }
  if (e.next && e.next.length > 0) {
    parts.push("next:\n" + e.next.map((n) => `  - ${n}`).join("\n"));
  }
  return parts.join("\n\n") + "\n";
}

/**
 * One outbound edge of a context-DAG node: the artifact/node it hands on to, plus an optional gloss.
 * The `ref` is an `asset:<id>` Library pointer (or a bare id) — both an agent-step's ceremony refs
 * and a process node's branch-edges resolve to the same canonical Library pull.
 */
export interface NodeEdge {
  /** The target — an `asset:<id>` pointer (the `asset:` prefix is optional; it is stripped). */
  readonly ref: string;
  /** An optional one-line gloss shown beside the pull command. */
  readonly label?: string;
}

/**
 * A node in the Library context DAG (ADR-0161): an id, a headline describing the node, and its
 * ORDERED outbound edges. An agent workflow-step and a `process` are the first two node types.
 */
export interface ContextNode {
  /** The node's own id — an agent workflow-step key, or a `process` id. */
  readonly id: string;
  /** The headline body: what this node is / what to do while standing at it. */
  readonly headline: string;
  /** The ordered outbound edges this node hands on to (rendered as the envelope's `next:`). */
  readonly edges: readonly NodeEdge[];
  /** Overrides `ok` (default true) — false marks a degraded node (e.g. an unknown/empty step). */
  readonly ok?: boolean;
}

/**
 * The ONE shared `node → next:` emitter (ADR-0161 decision 2): render a context-DAG node as a
 * SINGLE ADR-0023 envelope — the node's `headline` as the body, each outbound edge as a `next:` pull
 * command into the Library (`storytree library artifact <id>`, the canonical ADR-0023/0053 pull).
 * BOTH the agent step→refs surface (ADR-0156) and the process branch-edge graph (ADR-0154,
 * un-deferred by ADR-0161) emit through this one helper over a compatible edge shape, so the Library
 * DAG stays one graph with one navigation format — never a bespoke per-surface `next:`. The caller
 * (each node type's extractor) is what knows how to READ a node into edges; the emitter is agnostic.
 */
export function emitNodeEnvelope(node: ContextNode): Envelope {
  const next = node.edges.map((e) => {
    const id = e.ref.replace(/^asset:/, "");
    const cmd = `storytree library artifact ${id}`;
    return e.label ? `${cmd}   (${e.label})` : cmd;
  });
  return { ok: node.ok ?? true, body: node.headline, next };
}
