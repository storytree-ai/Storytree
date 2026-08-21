/**
 * THE DECISION-RECORD POINTER, RESOLVED IN EXACTLY ONE PLACE (ADR-0403 dec 7).
 *
 * A Library artifact names a decision record with a `doc:` pointer, and the corpus carries TWO LIVE
 * SPELLINGS of the same file — `doc:decisions/NNNN-slug.md` (371 pointers, measured 2026-08-21) and
 * `doc:docs/decisions/NNNN-slug.md` (19). They are not a legacy form and a current one: both are
 * authored today, both name the same file on disk, and neither is being migrated away.
 *
 * **A PARSER THAT ACCEPTS ONE AND NOT THE OTHER RETURNS A CONFIDENT, PLAUSIBLE, WRONG ANSWER.** The
 * cycle census's own first parser did exactly that: it matched the repo-relative spelling only,
 * silently reclassified 371 of 390 decision-terminating pointers as "not a decision", and reported a
 * densely-wired graph as a sparse one. It was caught only because the distinct-decision count came
 * out absurdly low — luck, not a guard. So this module is the ONE definition, and every reader of
 * the edge resolves through it: the edge census, the union acyclicity proof, and the depth walk.
 *
 * ## THE NODE ID IS NAMESPACED, AND THAT IS A COLLISION GUARD RATHER THAN A STYLE CHOICE
 *
 * A decision that participates in the same graph as a Library artifact needs a node id, and the
 * obvious choice — the `ADR-0223` label — is a LEGAL ARTIFACT ID: `asset:` pointers accept
 * `[A-Za-z0-9_-]+`, which `ADR-0223` satisfies. An artifact that happened to carry that id would
 * silently MERGE with the decision and inherit its edges, which is the same class of failure as the
 * spelling bug above: no error, a plausible graph, a wrong answer. {@link decisionNodeId} therefore
 * mints `decision:0223`, and the colon is what makes the two id spaces disjoint by construction —
 * no artifact id can contain one. The `ADR-0223` label survives for RENDERING only
 * ({@link decisionLabel}), where a human reads it and nothing keys on it.
 *
 * ## WHAT THIS MODULE DELIBERATELY DOES NOT KNOW
 *
 * It knows nothing about `amends` or `supersedes`, and it must not learn: those are the two edge
 * types this arc keeps unsummable BY THE SHAPE OF THE CODE, and a pointer parser that also carried
 * an edge-type notion is where a shared "which edge?" parameter would eventually be born.
 *
 * Pure and browser-safe — it parses strings and touches no filesystem, which is what lets the same
 * resolution run in a probe, in a gate rung and in the studio wire without three implementations.
 */

/** The `dependsOn` / `references` scheme that names a repository file rather than an artifact. */
export const DOC_REF_PREFIX = "doc:";

/** The namespace that keeps decision node ids disjoint from Library artifact ids — see the header. */
export const DECISION_NODE_PREFIX = "decision:";

/**
 * Which of the two live spellings a decision pointer used. REPORTED, never normalised silently: an
 * inconsistent pointer spelling is itself a finding, and a reader that only ever saw the normalised
 * form could not tell whether the second spelling had stopped resolving.
 */
export type DecisionPointerSpelling = "decisions" | "docs/decisions";

/** A `doc:` pointer that names a decision record, resolved. */
export interface DecisionPointer {
  /** The decision's number, from its filename. */
  readonly number: number;
  /** Which live spelling the author wrote — see {@link DecisionPointerSpelling}. */
  readonly spelling: DecisionPointerSpelling;
}

/**
 * PURE and TOTAL: the decision a `doc:` pointer names, or null when it names something else.
 *
 * Null is a legitimate, expected answer — `doc:` is the scheme for ANY repository file, so a pointer
 * at `docs/research/…` is a real thing an author may write. It is returned as null and COUNTED by
 * the caller rather than coerced into a decision number, because a `doc:` pointer quietly rounded to
 * the nearest decision is exactly the confident-wrong-answer failure this module exists to prevent.
 *
 * BOTH LIVE SPELLINGS AND ONLY THOSE TWO. The pattern is anchored at the start of the relative path
 * rather than matched loosely anywhere inside it: a hypothetical `doc:vendor/decisions/0001-x.md`
 * is NOT one of ours, and admitting it would let a foreign directory's numbering collide with the
 * decision log's. Backslashes are folded to `/` first, so a pointer authored on Windows resolves the
 * same as one authored anywhere else.
 */
export function parseDecisionPointer(pointer: string): DecisionPointer | null {
  if (!pointer.startsWith(DOC_REF_PREFIX)) return null;
  const rel = pointer.slice(DOC_REF_PREFIX.length).replace(/\\/g, "/");
  const match = /^(docs\/)?decisions\/(\d{4})-[^/]*\.md$/.exec(rel);
  if (match === null) return null;
  return {
    number: Number(match[2]),
    spelling: match[1] === undefined ? "decisions" : "docs/decisions",
  };
}

/**
 * PURE: the graph node id for a decision — `decision:0223`.
 *
 * The colon is load-bearing: it is what makes this id unrepresentable as a Library artifact id, so a
 * decision and an artifact can never collide in a combined graph. See the header.
 */
export function decisionNodeId(decisionNumber: number): string {
  return `${DECISION_NODE_PREFIX}${String(decisionNumber).padStart(4, "0")}`;
}

/** PURE: how a decision renders for a human — `ADR-0223`. A LABEL; nothing keys on it. */
export function decisionLabel(decisionNumber: number): string {
  return `ADR-${String(decisionNumber).padStart(4, "0")}`;
}

/** PURE: is this graph node id a decision's? The inverse of {@link decisionNodeId}'s namespace. */
export function isDecisionNodeId(id: string): boolean {
  return decisionNumberOfNodeId(id) !== null;
}

/**
 * PURE and TOTAL: the decision number a node id names, or null when the id is not a decision's.
 *
 * Strict about the four-digit shape rather than accepting any suffix, so a malformed id reads as
 * "not a decision" instead of resolving to `NaN` and rendering as `ADR-NaN`.
 */
export function decisionNumberOfNodeId(id: string): number | null {
  if (!id.startsWith(DECISION_NODE_PREFIX)) return null;
  const rest = id.slice(DECISION_NODE_PREFIX.length);
  return /^\d{4}$/.test(rest) ? Number(rest) : null;
}

/** PURE: render a graph node id for a human — decisions as `ADR-NNNN`, artifacts as themselves. */
export function renderCombinedNodeId(id: string): string {
  const decisionNumber = decisionNumberOfNodeId(id);
  return decisionNumber === null ? id : decisionLabel(decisionNumber);
}
