/**
 * THE UNLINKED HALF OF THE LIBRARY — who is in the joined dependency graph, and who is not.
 *
 * `unlinked-corpus-half-arc` increment 01. A measurement, never a cleanup: this file classifies and
 * reports, and decides nothing. The owner decides what happens to each cohort.
 *
 * ## THE QUESTION
 *
 * An artifact carrying no dependency edge in EITHER direction — nothing points at it and it points
 * at nothing — cannot have a depth under any seeding, is unreachable by every traversal the system
 * offers, and is invisible to `library related`. 1,945 of a reported 3,101 nodes were in that state
 * on 2026-08-29. This exists so that figure can be RE-DERIVED after any change rather than quoted
 * from a transcript, and so that the population it divides by is stated rather than assumed.
 *
 * ## THE DENOMINATOR, WHICH IS HALF THE ANSWER (and where the 3,101 came from)
 *
 * A decision is an ORDINARY Library row since ADR-0403 dec 1 — `adr-0403` is one of `queryDocs()`'s
 * rows, not a node beside them. So "2,633 artifacts + 468 decisions = 3,101 nodes" counts the
 * decision tier TWICE, and every ratio taken over it is understated by the size of that tier.
 * {@link linkageNodeId} is the fix and it is one line: an `adr-NNNN` row IS the decision node
 * `decision:NNNN`, which is also what collapses the three live pointer spellings onto one target.
 *
 * The same care is owed the other way. `evaluateDepthFromWork` reports "reached" and "unreachable"
 * side by side precisely so "nothing was deep" and "nothing was measured" can never print alike; a
 * cohort this cannot see must say so rather than report a zero.
 *
 * ## THE EDGE SET, AND WHY THREE OF THEM ARE REPORTED APART
 *
 * The PRIMARY reading walks exactly what `evaluateDepthFromWork` walks — `dependsOn` plus the
 * `asset:` half of `cites` — through the same parsers, so this classification and that judge's
 * verdict describe one graph. Three further authored relations exist and each is counted on its own
 * line rather than folded in, because folding them in would change the number without changing the
 * corpus:
 *
 *   • `supersedes` on a decision. A real authored relation, deliberately NOT walked by the depth
 *     judge (ADR-0403 dec 6). A decision linked ONLY by it is connected in the log's own terms and
 *     absent from the dependency graph, and those are different findings.
 *   • `story:` / `capability:` cites. These leave the corpus for the work hierarchy — an artifact
 *     carrying one points at something real, but at nothing this graph holds.
 *   • `references`. Provenance ("what this was written FROM"), not a dependency (ADR-0464 D1
 *     retires the offer surface built on exactly that conflation). Counted so a cohort that is
 *     richly cited but edge-free is visible as such.
 *
 * ## THIS COMPUTES DEGREE, NOT DEPTH — AND IT MUST CONVERGE ON THE SHARED WALKER
 *
 * `evaluateDepthFromWork` answers "how far from the work is this", a shortest-path walk. This
 * answers "does anything touch this at all", which is a DEGREE over the same edge set. Two
 * questions, one graph — and one graph is the point: the rule for resolving a pointer onto a node is
 * mirrored here rather than shared, because `traversal-panel-arc` is concurrently extracting exactly
 * that rule into a `buildDependencyGraph` helper under ADR-0476 D6 ("there is ONE edge-resolution
 * rule by design"), and on 2026-08-29 it was on neither `origin/main` nor a pushed branch.
 *
 * So this is a mirror with a declared expiry: WHEN `buildDependencyGraph` LANDS, THIS CONSUMES IT.
 * Until then the two are held together by an ASSERTION rather than by resemblance —
 * `probe:corpus-linkage` runs the judge over the same rows in the same process and exits 1 unless
 * every node the judge reached at depth >= 1 carries an in-edge here. A silent second walker is what
 * that assertion exists to prevent.
 *
 * ## WHY A `probe:` AND NEVER A `check:`
 *
 * Nothing here is a repo invariant anyone can be held to — an unlinked artifact is not a defect
 * until the owner says which cohort it belongs to. A `check:` name is also picked up by the gate
 * plan's unplanned-check guard. This is the `probe:depth-from-work` precedent exactly.
 */

import {
  DAG_EXCLUDED_KINDS,
  EDGE_FREE_KINDS,
  KIND_SPECS,
  adrNumberOfArtifactId,
  decisionNodeId,
  hasDependsOnKey,
  parseCiteRef,
  parseDecisionPointer,
  readDependsOnPointers,
} from "@storytree/library";

/** Every kind the typed schema knows. A stored row of any other kind predates that schema. */
const TYPED_KINDS: ReadonlySet<string> = new Set(Object.keys(KIND_SPECS));

/** The `doc:` scheme — any repository file, of which a decision is one spelling. */
const DOC_PREFIX = "doc:";

/** The minimal stored-row facts this reads. Matches `StoredDoc` structurally. */
export interface LinkageSource {
  readonly id: string;
  readonly kind: string;
  readonly doc: unknown;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * PURE: the JOINED-graph node id for a stored row or an `asset:` target.
 *
 * An `adr-NNNN` row is the decision node `decision:NNNN`. Everything else is itself. This is the one
 * place the collapse happens, so `doc:decisions/0403-x.md`, `doc:docs/decisions/0403-x.md` and
 * `asset:adr-0403` cannot become three nodes — the failure that inflates both the population and the
 * unlinked count at once.
 */
export function linkageNodeId(id: string): string {
  const number = adrNumberOfArtifactId(id);
  return number === null ? id : decisionNodeId(number);
}

/** What one authored pointer turned out to name. Collapsing any two of these is the bug. */
export type PointerTarget =
  /** A node this corpus holds. */
  | { readonly sort: "node"; readonly nodeId: string }
  /** A `story:` / `capability:` unit — real, and outside this graph. */
  | { readonly sort: "anchor"; readonly scheme: "story" | "capability"; readonly id: string }
  /** A repository file that is not a decision — a research note, a spec. */
  | { readonly sort: "repo-file"; readonly pointer: string }
  /** A well-formed pointer naming nothing this corpus holds. */
  | { readonly sort: "dangling"; readonly pointer: string }
  /** Not a pointer this system's parsers admit at all. */
  | { readonly sort: "unparseable"; readonly pointer: string };

/**
 * PURE and TOTAL: resolve one authored pointer against the node population.
 *
 * DECISION RESOLUTION RUNS FIRST, on both halves, for `knowledge-depth.ts`'s measured reason: letting
 * {@link parseCiteRef} claim `asset:adr-NNNN` first turns a decision pointer into an ordinary
 * artifact pointer, and the two halves of a walk then disagree about the same string.
 */
export function resolvePointer(pointer: string, nodeIds: ReadonlySet<string>): PointerTarget {
  const decision = parseDecisionPointer(pointer);
  if (decision !== null) {
    const nodeId = decisionNodeId(decision.number);
    return nodeIds.has(nodeId) ? { sort: "node", nodeId } : { sort: "dangling", pointer };
  }
  const cite = parseCiteRef(pointer);
  if (cite === null) {
    return pointer.startsWith(DOC_PREFIX)
      ? { sort: "repo-file", pointer }
      : { sort: "unparseable", pointer };
  }
  if (cite.scheme !== "asset") return { sort: "anchor", scheme: cite.scheme, id: cite.id };
  const nodeId = linkageNodeId(cite.id);
  return nodeIds.has(nodeId) ? { sort: "node", nodeId } : { sort: "dangling", pointer };
}

/**
 * WHY a node carries no walkable edge. Mechanical — read off the schema and the row, never guessed.
 *
 * The order matters: the first reason that applies wins, most-structural first. A `friction` row
 * cannot carry the field at all, so asking whether it authored one is meaningless.
 */
export type EdgeFreeReason =
  /** `EDGE_FREE_KINDS` — the schema refuses `dependsOn` on this kind outright (ADR-0223 D1). */
  | "schema-refuses-the-field"
  /** A stored kind the typed schema does not know at all, so no edge field was ever available. */
  | "outside-the-typed-schema"
  /** The field is available and the row does not carry the key — never authored. */
  | "field-never-authored"
  /** The key is present and empty — authored as "stands on nothing". */
  | "field-authored-empty"
  /** Pointers exist but none resolve onto a node this corpus holds. */
  | "pointers-resolve-nowhere"
  /** Pointers exist and leave the corpus — work units or repository files only. */
  | "points-outside-the-corpus";

/** One node's full linkage record. */
export interface LinkageNode {
  /** The JOINED-graph id — `decision:NNNN` for a decision, the row id otherwise. */
  readonly nodeId: string;
  /** The stored row id, which is what a CLI read and a trace both name. */
  readonly rowId: string;
  readonly kind: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Distinct nodes this points at over the walked edge set. */
  readonly outDegree: number;
  /** Distinct nodes pointing at this over the walked edge set. */
  readonly inDegree: number;
  /** `supersedes` targets held by this node, and holders of it. Never summed with the above. */
  readonly supersedesOut: number;
  readonly supersedesIn: number;
  /** `story:` / `capability:` cites — a real pointer at something outside this graph. */
  readonly anchorOut: number;
  /** `references` entries. Provenance, never a dependency — reported, never walked. */
  readonly referenceCount: number;
  /** Pointers that named nothing held, and repository files that are not decisions. */
  readonly danglingOut: number;
  readonly repoFileOut: number;
  /** Null when the node carries a walkable edge; the mechanical reason otherwise. */
  readonly edgeFreeReason: EdgeFreeReason | null;
}

/** The per-kind roll-up. Both denominators, always — see the header. */
export interface LinkageKindRow {
  readonly kind: string;
  readonly total: number;
  /** No walkable edge in either direction. THE headline population. */
  readonly unlinked: number;
  /** Of those, how many are also untouched by `supersedes`, anchors and references. */
  readonly isolated: number;
  /** Of those, how many are reachable only by a relation the walk does not follow. */
  readonly linkedOnlyOffGraph: number;
  readonly reasons: ReadonlyMap<EdgeFreeReason, number>;
}

/** The corpus-wide linkage projection. */
export interface LinkageVerdict {
  readonly nodes: readonly LinkageNode[];
  /** Rows read. Zero is "nothing was measured", never "a clean corpus". */
  readonly rowsScanned: number;
  /** Nodes after the decision collapse — the honest population. */
  readonly population: number;
  /** How many rows collapsed onto a decision node (the tier double-counted by a naive census). */
  readonly decisionRows: number;
  /** Distinct walkable edges, deduplicated per (source, target). */
  readonly walkableEdges: number;
  readonly linked: number;
  readonly unlinked: number;
  readonly byKind: readonly LinkageKindRow[];
  /** Pointer resolution totals — a declared floor, never a silent drop. */
  readonly danglingPointers: number;
  readonly repoFilePointers: number;
  readonly unparseablePointers: number;
  readonly anchorPointers: number;
}

function bagOf(doc: unknown): Record<string, unknown> {
  return typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>) : {};
}

/** PURE: the strings of an array-shaped field; anything else reads as empty (untrusted rows). */
function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/** PURE: the numbers of an array-shaped field — `supersedes` is a decision-number array. */
function numbersOf(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === "number" && Number.isInteger(entry));
}

/**
 * PURE: why this row carries no walkable out-edge, given what it authored.
 *
 * Structural reasons first: a kind that cannot hold the field is not a kind that failed to author
 * one. `outside-the-typed-schema` is the `template` tier — 13 rows shaped by the pre-kind category
 * schema, which has no edge field for an author to leave empty.
 */
export function edgeFreeReasonFor(
  kind: string,
  doc: unknown,
  outward: readonly PointerTarget[],
): EdgeFreeReason {
  if (EDGE_FREE_KINDS.has(kind)) return "schema-refuses-the-field";
  if (!TYPED_KINDS.has(kind)) return "outside-the-typed-schema";
  if (outward.some((t) => t.sort === "anchor" || t.sort === "repo-file")) {
    return "points-outside-the-corpus";
  }
  if (outward.some((t) => t.sort === "dangling")) return "pointers-resolve-nowhere";
  if (!hasDependsOnKey(doc)) return "field-never-authored";
  return "field-authored-empty";
}

/**
 * PURE: classify every stored row's position in the joined dependency graph.
 *
 * TOTAL over untrusted input, for `depthFromWorkNodes`' reason: this runs over the LIVE corpus, so a
 * row written by an older schema — or by a branch carrying a field this checkout does not — must
 * project as "no edges" rather than throw.
 */
export function evaluateCorpusLinkage(sources: readonly LinkageSource[]): LinkageVerdict {
  const rows = new Map<string, LinkageSource>();
  const decisionRowIds = new Set<string>();
  for (const source of sources) {
    const nodeId = linkageNodeId(source.id);
    if (nodeId !== source.id) decisionRowIds.add(source.id);
    // The first id wins on a duplicate, matching `evaluateDepthFromWork`.
    if (!rows.has(nodeId)) rows.set(nodeId, source);
  }
  const nodeIds: ReadonlySet<string> = new Set(rows.keys());

  const outNeighbours = new Map<string, Set<string>>();
  const inNeighbours = new Map<string, Set<string>>();
  const supersedesOut = new Map<string, Set<string>>();
  const supersedesIn = new Map<string, Set<string>>();
  const perRow = new Map<string, readonly PointerTarget[]>();
  let danglingPointers = 0;
  let repoFilePointers = 0;
  let unparseablePointers = 0;
  let anchorPointers = 0;

  for (const [nodeId, source] of rows) {
    const bag = bagOf(source.doc);
    const outward = [...readDependsOnPointers(source.doc), ...stringsOf(bag["cites"])].map(
      (pointer) => resolvePointer(pointer, nodeIds),
    );
    perRow.set(nodeId, outward);
    for (const target of outward) {
      if (target.sort === "node") {
        // A self-pointer is not a link to anything else and must not rescue a node from the
        // unlinked population by pointing at itself.
        if (target.nodeId === nodeId) continue;
        (outNeighbours.get(nodeId) ?? outNeighbours.set(nodeId, new Set()).get(nodeId)!).add(target.nodeId);
        (inNeighbours.get(target.nodeId) ?? inNeighbours.set(target.nodeId, new Set()).get(target.nodeId)!).add(nodeId);
      } else if (target.sort === "anchor") anchorPointers += 1;
      else if (target.sort === "repo-file") repoFilePointers += 1;
      else if (target.sort === "dangling") danglingPointers += 1;
      else unparseablePointers += 1;
    }
    for (const number of numbersOf(bag["supersedes"])) {
      const target = decisionNodeId(number);
      if (!nodeIds.has(target) || target === nodeId) continue;
      (supersedesOut.get(nodeId) ?? supersedesOut.set(nodeId, new Set()).get(nodeId)!).add(target);
      (supersedesIn.get(target) ?? supersedesIn.set(target, new Set()).get(target)!).add(nodeId);
    }
  }

  const nodes: LinkageNode[] = [];
  for (const [nodeId, source] of rows) {
    const outward = perRow.get(nodeId) ?? [];
    const outDegree = outNeighbours.get(nodeId)?.size ?? 0;
    const inDegree = inNeighbours.get(nodeId)?.size ?? 0;
    nodes.push({
      nodeId,
      rowId: source.id,
      kind: source.kind,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      outDegree,
      inDegree,
      supersedesOut: supersedesOut.get(nodeId)?.size ?? 0,
      supersedesIn: supersedesIn.get(nodeId)?.size ?? 0,
      anchorOut: outward.filter((t) => t.sort === "anchor").length,
      referenceCount: stringsOf(bagOf(source.doc)["references"]).length,
      danglingOut: outward.filter((t) => t.sort === "dangling").length,
      repoFileOut: outward.filter((t) => t.sort === "repo-file").length,
      edgeFreeReason:
        outDegree + inDegree > 0 ? null : edgeFreeReasonFor(source.kind, source.doc, outward),
    });
  }

  const byKindDraft = new Map<
    string,
    { total: number; unlinked: number; isolated: number; offGraph: number; reasons: Map<EdgeFreeReason, number> }
  >();
  for (const node of nodes) {
    const row =
      byKindDraft.get(node.kind) ??
      byKindDraft.set(node.kind, { total: 0, unlinked: 0, isolated: 0, offGraph: 0, reasons: new Map() }).get(node.kind)!;
    row.total += 1;
    if (node.edgeFreeReason === null) continue;
    row.unlinked += 1;
    row.reasons.set(node.edgeFreeReason, (row.reasons.get(node.edgeFreeReason) ?? 0) + 1);
    const offGraph =
      node.supersedesOut + node.supersedesIn + node.anchorOut + node.referenceCount + node.repoFileOut;
    if (offGraph === 0) row.isolated += 1;
    else row.offGraph += 1;
  }

  const byKind = [...byKindDraft.entries()]
    .map(([kind, row]) => ({
      kind,
      total: row.total,
      unlinked: row.unlinked,
      isolated: row.isolated,
      linkedOnlyOffGraph: row.offGraph,
      reasons: row.reasons as ReadonlyMap<EdgeFreeReason, number>,
    }))
    .sort((a, b) => b.unlinked - a.unlinked || a.kind.localeCompare(b.kind));

  let walkableEdges = 0;
  for (const targets of outNeighbours.values()) walkableEdges += targets.size;
  const unlinked = nodes.filter((node) => node.edgeFreeReason !== null).length;

  return {
    nodes,
    rowsScanned: sources.length,
    population: rows.size,
    decisionRows: decisionRowIds.size,
    walkableEdges,
    linked: nodes.length - unlinked,
    unlinked,
    byKind,
    danglingPointers,
    repoFilePointers,
    unparseablePointers,
    anchorPointers,
  };
}
