/**
 * THE DECISION-RECORD POINTER, RESOLVED IN EXACTLY ONE PLACE (ADR-0403 dec 7).
 *
 * A Library artifact names a decision record with a pointer, and the corpus carries THREE LIVE
 * SPELLINGS of the same decision. Two name a FILE — `doc:decisions/NNNN-slug.md` (997 pointers) and
 * `doc:docs/decisions/NNNN-slug.md` (38), neither a legacy form and both authored to this day. The
 * third names a ROW — `asset:adr-NNNN` — and arrives with ADR-0403 dec 1, when a decision becomes an
 * ordinary Library artifact and can be named the way every other artifact is.
 *
 * ## ALL THREE RESOLVE. NOTHING IS REWRITTEN, AND THAT IS A DECISION
 *
 * ADR-0403 dec 7 requires both file spellings to RESOLVE; it does not ask for either to be rewritten,
 * and `decision-log-home-arc` inc 03 deliberately declines to. A registered migration rewriting 1,035
 * stored pointers onto the artifact form would migrate them one WRITE at a time, so the corpus would
 * spend an unbounded stretch carrying all three spellings for no gain this module does not already
 * provide — every reader routes through here, so a `doc:` pointer and an `asset:adr-NNNN` pointer
 * already answer identically.
 *
 * What actually has to change when the files are deleted is the RESOLVER, not the pointers: the
 * `-inc-02` reader census names it — the `doc:` scheme stays the scheme for any repository file
 * (research notes keep resolving on disk), so a resolver must route DECISION pointers to the store
 * and everything else to disk. That is inc 05's work, and it is one seam rather than a corpus-wide
 * rewrite.
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
 * Which of the three live spellings a decision pointer used. REPORTED, never normalised silently: an
 * inconsistent pointer spelling is itself a finding, and a reader that only ever saw the normalised
 * form could not tell whether one of them had stopped resolving.
 *
 * Counting by spelling — which `probe:adr-graph` and `combined-dag` already do — is therefore a real
 * census of how the corpus names its decisions, not a migration progress bar: nothing rewrites these,
 * so a shift in the mix is authors changing habit.
 *
 * MATCH POSITIVELY ON THE MEMBER YOU MEAN. A reader that tested `!== "decisions"` to mean "the
 * repo-relative one" was correct for exactly as long as there were two members.
 */
export type DecisionPointerSpelling = "decisions" | "docs/decisions" | "asset";

/** A pointer that names a decision record, resolved. */
export interface DecisionPointer {
  /** The decision's number — from its filename, or from its `adr-NNNN` row id. */
  readonly number: number;
  /** Which live spelling the author wrote — see {@link DecisionPointerSpelling}. */
  readonly spelling: DecisionPointerSpelling;
}

/**
 * The `asset:<id>` Library pointer — the third {@link import("./knowledge.js").CiteScheme}, the one
 * `references` uses, and the scheme a migrated decision is named by.
 *
 * DEFINED ONCE, HERE, and re-exported by every consumer rather than copied: `@storytree/arc` mints
 * an `asset:` citation when a friction route parks an increment, and `@storytree/cli`'s
 * `asset-citation.ts` resolves one — two packages agreeing on a token by copying it is exactly the
 * drift seam `parseCiteRef` exists to prevent. It lives in this module rather than beside its
 * `story:` / `capability:` siblings in `knowledge.ts` because {@link parseDecisionPointer} needs it
 * and this module is deliberately the zod-free bottom of the package.
 */
export const ASSET_REF_PREFIX = "asset:";

/**
 * The id namespace for a decision ROW — `adr-0403` (ADR-0403 dec 1).
 *
 * It lives beside the pointer resolution rather than beside the document converter because
 * {@link parseDecisionPointer} needs it and that function is on the browser-safe root barrel; the
 * converter is a subpath export precisely so its yaml parser stays out of the studio bundle.
 */
export const ADR_ID_PREFIX = "adr-";

/** PURE: the Library artifact id for a decision — `adr-0403`. */
export function adrDocId(decisionNumber: number): string {
  return `${ADR_ID_PREFIX}${String(decisionNumber).padStart(4, "0")}`;
}

/**
 * PURE and TOTAL: the decision number a bare ARTIFACT ID names, or null when it names something else.
 *
 * Strict about the four-digit shape rather than accepting any suffix, so an artifact whose id merely
 * begins `adr-` — `adr-health-notes` is a legal id nobody has minted yet, and exactly the collision
 * this guards — reads as "not a decision" instead of resolving to `NaN` and rendering `ADR-NaN`.
 */
export function adrNumberOfArtifactId(id: string): number | null {
  if (!id.startsWith(ADR_ID_PREFIX)) return null;
  const rest = id.slice(ADR_ID_PREFIX.length);
  return /^\d{4}$/.test(rest) ? Number(rest) : null;
}

/**
 * PURE and TOTAL: the decision a pointer names, or null when it names something else.
 *
 * Null is a legitimate, expected answer — `doc:` is the scheme for ANY repository file and `asset:`
 * for ANY Library artifact, so a pointer at `docs/research/…` or at `merge-ceremony` is a real thing
 * an author may write. It is returned as null and COUNTED by the caller rather than coerced into a
 * decision number, because a pointer quietly rounded to the nearest decision is exactly the
 * confident-wrong-answer failure this module exists to prevent.
 *
 * ALL THREE LIVE SPELLINGS AND ONLY THOSE THREE. The pattern is anchored at the start of the path
 * rather than matched loosely anywhere inside it: a hypothetical `doc:vendor/decisions/0001-x.md`
 * is NOT one of ours, and admitting it would let a foreign directory's numbering collide with the
 * decision log's. Backslashes are folded to `/` first, so a pointer authored on Windows resolves the
 * same as one authored anywhere else.
 */
export function parseDecisionPointer(pointer: string): DecisionPointer | null {
  // THE THIRD SPELLING, and the one the other two are migrating TOWARD (ADR-0403 dec 1, migration
  // #8). Once a decision is an ordinary Library row it is named the way every other artifact is —
  // `asset:adr-0403` — and it is resolved HERE rather than by each reader, so a corpus mid-migration
  // (some rows rewritten, some not) reads identically to one either side of it. Every caller that
  // already routes through this function gained the new form without changing a line, which is the
  // entire reason ADR-0403 dec 7 insisted on one resolution point.
  const assetDecision = adrNumberOfArtifactId(pointer.startsWith(ASSET_REF_PREFIX)
    ? pointer.slice(ASSET_REF_PREFIX.length)
    : "");
  if (assetDecision !== null) return { number: assetDecision, spelling: "asset" };

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
