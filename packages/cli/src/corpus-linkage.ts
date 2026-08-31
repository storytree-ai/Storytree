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
 * ## ✅ THE FOURTH OFF-GRAPH SIGNAL IS GONE — CITATIONS (ADR-0477 D5, landed 2026-08-30)
 *
 * A `references` term used to sit in that list: provenance ("what this was written FROM"), never a
 * dependency, counted so a cohort that was richly cited but edge-free was visible as such. ADR-0477
 * D1 retired the field, and this module was one of the D5 readers that decision warned about — the
 * dangerous shape, because it would NOT have broken. `referenceCount` would simply have read zero
 * and every node whose only off-graph signal was a citation would have moved from "linked only
 * off-graph" to "isolated", a change in the instrument reading as a corpus that got worse.
 *
 * It was corrected in the removal's own landing, as D5 requires: `referenceCount` is OUT of the
 * isolation sum. **So the cohort figures moved on 2026-08-30, and the move is this instrument's, not
 * the corpus's** — a comparison across that date is comparing two different measures. The field is
 * still counted and reported per node, because a frozen record of what was cited exists
 * (`docs/research/citation-snapshot-2026-08-30.md`) and a live row can still carry the key until its
 * next write drains it; what changed is that it no longer buys a node its way out of `isolated`.
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

/**
 * THE FIELDS THE DEPENDENCY WALK FOLLOWS — the whole of the scope every figure in this module
 * inherits, stated so it can be printed beside the number rather than assumed by whoever quotes it.
 *
 * THE ONE DECLARED LIST HERE, and declared because it IS the walk's definition rather than an
 * observation about the corpus. Everything else about the pointer surface is DISCOVERED from the
 * rows ({@link LinkageVerdict.pointerFields}), for the reason
 * `a-corpus-count-inherits-one-querys-field-scope` records: a hand-kept list of "the fields that can
 * hold a pointer" is exactly the artifact that goes stale silently, and it went stale before —
 * `dischargedBy` carried two pointers and nobody would have listed it.
 *
 * ⚠ WHAT THIS MAKES FALSE, MEASURABLY. "70% of the library has no recorded connection to anything
 * else: nothing points at it and it points at nothing" was the sentence this instrument's first
 * reading was quoted as. Its second clause is not what was measured. Every increment carries
 * `arcRef`, every open question carries one, 222 of 477 decisions carry one — the field `arc show`
 * itself derives an arc's decision list from — and 88 friction rows are named by some increment's
 * `frictionRefs`. None of that is walked here, so a node reachable only that way reads as connected
 * to nothing. That is this list talking, not the corpus.
 */
export const WALKED_POINTER_FIELDS: readonly string[] = ["cites", "dependsOn"];

const WALKED_FIELD_SET: ReadonlySet<string> = new Set(WALKED_POINTER_FIELDS);

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
  /**
   * `references` entries. Provenance, never a dependency — reported, never walked, and since
   * ADR-0477 D5 no longer part of the isolation sum either. The field is retired; a live row keeps
   * the key until its next write drains it (migration #9), so this reports what is still there
   * rather than asserting zero.
   */
  readonly referenceCount: number;
  /** Pointers that named nothing held, and repository files that are not decisions. */
  readonly danglingOut: number;
  readonly repoFileOut: number;
  /**
   * Fields OUTSIDE {@link WALKED_POINTER_FIELDS} whose values name a row this corpus holds —
   * sorted, distinct, and discovered from the row rather than read off a list.
   *
   * THIS IS THE FIELD THAT SEPARATES THE TWO SENTENCES the headline runs together. A node with
   * `outDegree + inDegree === 0` carries no DEPENDENCY edge, which is true and is what "unlinked"
   * means here. Whether it is CONNECTED TO NOTHING is a different question, and for an increment
   * carrying `arcRef` the answer is plainly no.
   */
  readonly unwalkedPointerFields: readonly string[];
  /** Null when the node carries a walkable edge; the mechanical reason otherwise. */
  readonly edgeFreeReason: EdgeFreeReason | null;
}

/**
 * One field's pointer tally — POINTERS and NODES apart, never summed into one figure.
 *
 * Both, because they answer different questions and the difference is the finding: four
 * `frictionRefs` pointers across two increments is a thinner relationship than four across four,
 * and a single total cannot tell them apart.
 */
export interface PointerFieldTally {
  /** The authored field name, exactly as the row spells it. */
  readonly field: string;
  /** Whether the dependency walk follows it — i.e. whether it can make a node "linked". */
  readonly walked: boolean;
  /** Pointer values in this field that resolve onto some OTHER held node. */
  readonly pointers: number;
  /** Distinct nodes carrying at least one such value in this field. */
  readonly nodes: number;
}

/**
 * PURE: does this node point at something real by a relation the dependency walk ignores?
 *
 * The `story:`/`capability:` half of `cites` counts, though `cites` is a walked field: the walk
 * follows its `asset:` half only, and an anchor leaves the corpus for the work hierarchy — a real
 * destination this graph does not hold. So an artifact citing `story:desktop` and nothing else is
 * edge-free HERE and is not an artifact connected to nothing.
 */
export function carriesUnwalkedPointer(node: LinkageNode): boolean {
  return node.unwalkedPointerFields.length > 0 || node.anchorOut > 0;
}

/** The per-kind roll-up. Both denominators, always — see the header. */
export interface LinkageKindRow {
  readonly kind: string;
  readonly total: number;
  /** No walkable edge in either direction. THE headline population. */
  readonly unlinked: number;
  /** Of those, how many are also untouched by `supersedes` and anchors (ADR-0477 D5 dropped the
   *  citation term — see the header). */
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
  /**
   * Every field found holding a pointer at a held node, walked and unwalked alike, biggest first.
   *
   * DISCOVERED, NEVER DECLARED — see {@link WALKED_POINTER_FIELDS}. This is the line that has to be
   * printed beside the headline for the headline to be quotable at all.
   */
  readonly pointerFields: readonly PointerFieldTally[];
  /**
   * Unlinked nodes that nonetheless point at something real ({@link carriesUnwalkedPointer}).
   *
   * THE REFUTATION, AS A NUMBER. `unlinked` minus this is the population the bare sentence actually
   * describes; this term is the size of the error in it.
   */
  readonly unlinkedWithTypedPointer: number;
}

/**
 * Get-or-create one adjacency bucket.
 *
 * ONE helper rather than the `map.get(k) ?? map.set(k, new Set()).get(k)!` idiom inline at five
 * call sites: five copies of a rule are a drift surface, and the idiom's non-null assertion is the
 * kind of thing that gets "simplified" into a bug.
 */
function bucket(edges: Map<string, Set<string>>, key: string): Set<string> {
  const existing = edges.get(key);
  if (existing !== undefined) return existing;
  const created = new Set<string>();
  edges.set(key, created);
  return created;
}

function bagOf(doc: unknown): Record<string, unknown> {
  // Stryker disable next-line ConditionalExpression: EQUIVALENT — `doc !== null` alone decides every
  // case the other clause could. A scalar passed through reads back `undefined` on every field, and
  // `null` is the one value that would throw; dropping the `typeof` test changes neither.
  return typeof doc === "object" && doc !== null ? (doc as Record<string, unknown>) : {};
}

/** PURE: the strings of an array-shaped field; anything else reads as empty (untrusted rows). */
function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry !== "");
}

/**
 * PURE: the pointer-shaped values of one field, whatever shape the field takes.
 *
 * BOTH SHAPES, because the unwalked pointers are authored in both and picking one would reproduce
 * this module's own bug one level down: `arcRef` is a bare scalar, `frictionRefs` an array. A field
 * of any other type yields nothing rather than throwing — this runs over the live corpus, where a
 * row written by an older schema is ordinary input.
 */
function pointerCandidates(value: unknown): string[] {
  // No empty-string guard, deliberately: `""` carries no scheme, so `resolveHeldNode` returns null
  // for it exactly as it does for any other non-pointer. A guard here would be a branch no test
  // could ever distinguish from its absence — the mutation rung found it as three survivors, which
  // is the correct verdict on a check that changes nothing.
  if (typeof value === "string") return [value];
  return stringsOf(value);
}

/**
 * PURE: the held node one authored value names, or null.
 *
 * A POINTER CARRIES A SCHEME. `resolvePointer` is the whole rule — the same one the walk uses, so
 * the two halves of this instrument cannot disagree about a string, and a decision collapses
 * through {@link linkageNodeId} on both.
 *
 * ⚠ A BARE ROW NAME IS DELIBERATELY *NOT* A POINTER, and that was MEASURED rather than assumed.
 * The first version of this accepted one, on the reasoning that `frictionRefs` authors bare ids and
 * refusing them would under-report. Run over the live corpus (2,776 rows, 2026-08-31) it reported
 * `category` carrying 2,448 pointers across 2,448 nodes — and `category` was the ONLY field in the
 * corpus a bare match ever hit. Every one was false: `renderStoredDoc` stamps the row's KIND into
 * `category`, and `increment` / `arc` / `plan` / `definition` are themselves definition rows, so
 * every artifact appeared to "point at" the definition of its own kind. That inflated
 * {@link LinkageVerdict.unlinkedWithTypedPointer} to 1,899 of 1,948 — a refutation manufactured
 * almost entirely out of an artifact of rendering, which is precisely the shape this module exists
 * to refuse. `frictionRefs` costs nothing here because it does not survive rendering at all (98
 * authored pointers, all naming held rows, 0 on the rendered wire) — so the honest place for it is
 * the RAW reading, reported beside this one, never a rule loosened until it appeared.
 */
function resolveHeldNode(value: string, nodeIds: ReadonlySet<string>): string | null {
  const resolved = resolvePointer(value, nodeIds);
  return resolved.sort === "node" ? resolved.nodeId : null;
}

/**
 * PURE: the integers of an array-shaped field — `supersedes` is a decision-NUMBER array.
 *
 * Both guards are unobservable on their own and both are kept anyway, because what makes them
 * unobservable is a property of the DOWNSTREAM id format rather than of this function: a fabricated
 * or fractional entry becomes a node id like `decision:100.5`, and no row can ever carry that id
 * (a decision row is `adr-` plus exactly four digits), so the bad entry is dropped one step later
 * instead of here. That is a coincidence of the id shape, not a reason to rely on it.
 */
function numbersOf(value: unknown): number[] {
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT — a fabricated entry cannot pad into a
  // four-digit decision id, so it resolves to no held node and is dropped downstream.
  if (!Array.isArray(value)) return [];
  // Stryker disable next-line LogicalOperator,ConditionalExpression: EQUIVALENT — `Number.isInteger`
  // already implies `typeof === "number"`, and a non-integer number's node id can never exist.
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
 * Order the per-kind roll-up: the biggest unlinked population first, ties by kind name.
 *
 * A named comparator rather than an inline arrow, so the two terms are separately visible: SIZE is
 * the reading (which tier is the problem), and the name is only there to make the order stable when
 * two tiers tie.
 */
function byUnlinkedThenKind(a: LinkageKindRow, b: LinkageKindRow): number {
  const bySize = b.unlinked - a.unlinked;
  return bySize === 0 ? a.kind.localeCompare(b.kind) : bySize;
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
  const perRow = new Map<
    string,
    { source: LinkageSource; outward: readonly PointerTarget[]; unwalked: readonly string[] }
  >();
  // Field name → the tally being accumulated. Walked fields are counted here too: a scope statement
  // that reported only what it MISSES would be as unquotable as the headline it exists to qualify.
  const fieldTally = new Map<string, { walked: boolean; pointers: number; nodes: Set<string> }>();
  let danglingPointers = 0;
  let repoFilePointers = 0;
  let unparseablePointers = 0;
  let anchorPointers = 0;

  for (const [nodeId, source] of rows) {
    const bag = bagOf(source.doc);
    const outward = [...readDependsOnPointers(source.doc), ...stringsOf(bag["cites"])].map(
      (pointer) => resolvePointer(pointer, nodeIds),
    );
    // THE FIELD SWEEP. Every field of the row, not a list of the ones expected to matter — the
    // whole point of `pointerFields` is that the pointer surface is read off the corpus. A value
    // naming this same node is skipped by the rule the walk already applies: pointing at yourself
    // is not a connection to anything.
    const unwalkedFields = new Set<string>();
    for (const [field, value] of Object.entries(bag)) {
      for (const candidate of pointerCandidates(value)) {
        const target = resolveHeldNode(candidate, nodeIds);
        if (target === null || target === nodeId) continue;
        const walked = WALKED_FIELD_SET.has(field);
        if (!walked) unwalkedFields.add(field);
        let tally = fieldTally.get(field);
        if (tally === undefined) {
          tally = { walked, pointers: 0, nodes: new Set() };
          fieldTally.set(field, tally);
        }
        tally.pointers += 1;
        tally.nodes.add(nodeId);
      }
    }
    perRow.set(nodeId, { source, outward, unwalked: [...unwalkedFields].sort() });
    for (const target of outward) {
      if (target.sort === "node") {
        // A self-pointer is not a link to anything else and must not rescue a node from the
        // unlinked population by pointing at itself.
        if (target.nodeId === nodeId) continue;
        bucket(outNeighbours, nodeId).add(target.nodeId);
        bucket(inNeighbours, target.nodeId).add(nodeId);
      } else if (target.sort === "anchor") anchorPointers += 1;
      else if (target.sort === "repo-file") repoFilePointers += 1;
      else if (target.sort === "dangling") danglingPointers += 1;
      else unparseablePointers += 1;
    }
    for (const number of numbersOf(bag["supersedes"])) {
      const target = decisionNodeId(number);
      if (!nodeIds.has(target) || target === nodeId) continue;
      bucket(supersedesOut, nodeId).add(target);
      bucket(supersedesIn, target).add(nodeId);
    }
  }

  const nodes: LinkageNode[] = [];
  // Iterating what the first pass WROTE, rather than re-walking `rows` and defaulting a miss to an
  // empty list: the default would be unreachable, and an unreachable default is a branch no reader
  // can evaluate and no test can pin.
  for (const [nodeId, { source, outward, unwalked }] of perRow) {
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
      unwalkedPointerFields: unwalked,
      edgeFreeReason:
        outDegree + inDegree > 0 ? null : edgeFreeReasonFor(source.kind, source.doc, outward),
    });
  }

  const byKindDraft = new Map<
    string,
    { total: number; unlinked: number; isolated: number; offGraph: number; reasons: Map<EdgeFreeReason, number> }
  >();
  for (const node of nodes) {
    let row = byKindDraft.get(node.kind);
    if (row === undefined) {
      row = { total: 0, unlinked: 0, isolated: 0, offGraph: 0, reasons: new Map() };
      byKindDraft.set(node.kind, row);
    }
    row.total += 1;
    if (node.edgeFreeReason === null) continue;
    row.unlinked += 1;
    row.reasons.set(node.edgeFreeReason, (row.reasons.get(node.edgeFreeReason) ?? 0) + 1);
    const offGraph =
      node.supersedesOut + node.supersedesIn + node.anchorOut + node.repoFileOut;
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
    .sort(byUnlinkedThenKind);

  let walkableEdges = 0;
  for (const targets of outNeighbours.values()) walkableEdges += targets.size;
  const unlinked = nodes.filter((node) => node.edgeFreeReason !== null).length;
  const unlinkedWithTypedPointer = nodes.filter(
    (node) => node.edgeFreeReason !== null && carriesUnwalkedPointer(node),
  ).length;

  // Biggest first, ties by field name — `byUnlinkedThenKind`'s rule, for its reason: SIZE is the
  // reading, and the name is only there to make two equal rows print in a stable order.
  const pointerFields = [...fieldTally.entries()]
    .map(([field, tally]) => ({
      field,
      walked: tally.walked,
      pointers: tally.pointers,
      nodes: tally.nodes.size,
    }))
    .sort((a, b) => b.pointers - a.pointers || a.field.localeCompare(b.field));

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
    pointerFields,
    unlinkedWithTypedPointer,
  };
}
