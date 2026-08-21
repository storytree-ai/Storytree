/**
 * ADR-0223 dec 5's one-time bootstrap: project existing DOWN-TIER citations into authored `dependsOn`
 * edges, as a pure function over stored corpus docs.
 *
 * PURE and total. It decides what the migration WOULD write; `packages/cli/src/standson-bootstrap.ts`
 * is the thin half that reads the store, applies the plan and prints. Keeping the rule here is what
 * lets the acyclic-by-construction property be proven hermetically, against a literal corpus, rather
 * than asserted about a live database nobody can pin down.
 *
 * WHY A SEED IS SAFE AT ALL: every edge it emits strictly DESCENDS {@link KNOWLEDGE_TIERS}. A path
 * that only ever descends a total order cannot return to its start, so the seeded graph is acyclic by
 * construction — not by luck, and not by checking afterwards. The `check:library-dag-acyclic` rung
 * still judges the result, because curators author edges this function never saw.
 *
 * It does NOT make citations "build the DAG" going forward (ADR-0223 dec 5): after the migration
 * `dependsOn` is authored independently and may diverge from `references` freely.
 */

import { DependsOnRef } from "./knowledge.js";

/**
 * The tier order, bedrock → composite (ADR-0223 dec 3, as amended by ADR-0363 D1).
 *
 * TIER 0 IS NOT IN THIS MAP because it is not a kind: it is the ADR set, reached by a `doc:<relpath>`
 * pointer (ADR-0223 dec 4). ADRs are not Library artifacts, carry no `dependsOn` of their own, and are
 * therefore natural sinks — strictly below every kind here and incapable of closing a cycle.
 *
 * A kind ABSENT from this map is outside the DAG: it emits no edge and is never pointed at by a
 * seeded one. THREE kinds are absent, for two reasons:
 *   - `definition` — durable but excluded by ADR-0363 D1: the depth it would contribute buys nothing
 *     a reader uses, and it is the corpus's densest mutually-constitutive citation core.
 *   - `friction`, `open-question` — the transient signal tier (ADR-0223 dec 1/dec 4).
 *
 * All three also sit in `EDGE_FREE_KINDS`, so the schema refuses them the field outright — absence
 * here and refusal there now AGREE for every absent kind, which is the state ADR-0365 D1 restored.
 *
 * `uat-criterion` was the exception and is no longer: it sat in NO tier (so the seed wrote it
 * nothing) and NO `EDGE_FREE_KINDS` (so the schema accepted a hand-authored edge on it) — outside
 * the graph for the seed, inside it for the schema. ADR-0365 D1 resolved that toward INCLUSION on
 * evidence: a `uat-criterion` genuinely cites knowledge (`desktop#uat-2` stands on the principle
 * `human-witness-is-a-judgment-gap-not-cost`), so excluding it would discard real dependency
 * information — unlike `definition`, whose depth buys a reader nothing.
 *
 * TIER 6 HOLDS TWO KINDS, and the ordering rule makes that meaningful rather than sloppy: a
 * same-tier citation is never projected, so `increment` and `uat-criterion` cannot seed edges at
 * each other. Both are work-adjacent OUTERMOST detail — they stand on tiers 1-5 and nothing stands
 * on them. ADR-0365's Consequences records the accepted risk that the two have different lifetimes.
 */
export const KNOWLEDGE_TIERS: ReadonlyMap<string, number> = new Map([
  ["techstack", 1],
  ["principle", 2],
  ["pattern", 2],
  ["guardrail", 2],
  ["process", 3],
  ["agent", 4],
  ["arc", 5],
  ["increment", 6],
  // ADR-0365 D1 — a peer of `increment`, not a successor: same tier, so neither seeds into the other.
  ["uat-criterion", 6],
]);

/** The `doc:` scheme reaching tier 0. */
const DOC_PREFIX = "doc:";
/** The `asset:` scheme reaching a Library artifact. */
const ASSET_PREFIX = "asset:";

/** The minimal stored-doc facts the projection needs. Matches `StoredDoc` structurally. */
export interface CitationSource {
  readonly id: string;
  readonly doc: unknown;
}

/** One artifact's seeded edge set, in STORED pointer form (`asset:<id>` / `doc:<relpath>`). */
export interface BootstrapEdge {
  readonly id: string;
  readonly dependsOn: readonly string[];
}

/** Why a citation did not become an edge — reported so a small yield can be explained, not guessed. */
export interface BootstrapSkips {
  /** Target sits at the SAME tier: the genuine curation tail ADR-0223 dec 5 hands to curators. */
  readonly sameTier: number;
  /** Target sits ABOVE the source — a "used by", never a dependency. */
  readonly upTier: number;
  /** Target is a kind outside the DAG (definition / friction / open-question — `uat-criterion` left
   *  this set when ADR-0365 D1 placed it at tier 6). */
  readonly targetOutsideDag: number;
  /** Target id is not in the corpus at all — a stale citation. */
  readonly targetAbsent: number;
  /** Pointer is malformed: a `doc:` that is not a relpath, or a ref no {@link DependsOnRef} accepts. */
  readonly malformed: number;
  /**
   * Source already carried an authored `dependsOn` AND the pass found nothing to add — so it is
   * untouched. Since ADR-0373 an artifact that already carries edges is EXTENDED rather than skipped
   * whole (see {@link DependsOnBootstrapPlan.extended}), so this counts only the genuine no-ops.
   */
  readonly alreadyAuthored: number;
}

/** The whole migration, decided. */
export interface DependsOnBootstrapPlan {
  /**
   * Only artifacts that GAIN at least one edge. Since ADR-0373 an entry's `dependsOn` is the artifact's
   * FULL intended set — any pre-existing authored edges first, in their authored order, then the new
   * ones — because the applier patches the whole field. Never a delta.
   */
  readonly edges: readonly BootstrapEdge[];
  /** In-DAG artifacts considered — the denominator, so a thin plan cannot read as a whole corpus. */
  readonly docsScanned: number;
  /** Total edges across {@link edges}, counting only the NEWLY added ones (ADR-0373). */
  readonly edgesPlanned: number;
  /**
   * Artifacts that already carried authored edges and are being EXTENDED rather than seeded from
   * empty (ADR-0373). Reported separately because it is the one number that says whether the second
   * pass reached the artifacts the first pass had already claimed — the agent tier, entirely.
   */
  readonly extended: number;
  readonly skipped: BootstrapSkips;
}

/**
 * The per-kind `refList` citation fields ADR-0373 admits, alongside the envelope `references`.
 *
 * WHY THESE AND NOT `references` ALONE. ADR-0223 dec 5 seeded from `references`, which is a SEE-ALSO
 * citation — "I consulted this". Three of the four fields below are strictly stronger than that: the
 * `storytree agents <name>` renderer INJECTS the cited unit's text into the agent's system prompt, so
 * changing the target changes the agent with no edit to the agent. That is a dependency by any
 * operational test, and the seed was recording the weakest relation in the corpus while ignoring the
 * strongest. `uat-criterion.refs` is the fourth and is a different case: it IS `references` under a
 * per-kind name, unseeded only because of where it is filed — which is why ADR-0365 measured
 * `uat-criterion` at tier 6 seeding exactly zero.
 *
 * `agent.antiPatterns` is included deliberately, though it reads as a negative pointer. Its content is
 * injected exactly like `rules`, so the operational test is identical: change the guardrail and the
 * agent's prompt changes. The polarity is in the content, not in the direction of the dependency.
 *
 * A kind absent from this map contributes only its envelope `references`, unchanged.
 */
const CITATION_REFLISTS: ReadonlyMap<string, readonly string[]> = new Map([
  ["agent", ["context", "rules", "antiPatterns"]],
  ["uat-criterion", ["refs"]],
]);

/**
 * Read a doc's citation pointers defensively: this runs over the LIVE corpus, not a parsed union.
 *
 * The envelope `references` first, then the kind's {@link CITATION_REFLISTS} fields in declared
 * order. Order matters only for reproducibility of the emitted array; duplicates across fields are
 * collapsed downstream by the caller's `seen` set.
 */
function citationsOf(doc: unknown): string[] {
  const payload = doc as { references?: unknown } | null | undefined;
  const raw = Array.isArray(payload?.references) ? payload.references : [];
  const out = raw.filter((entry): entry is string => typeof entry === "string");

  const bag = doc as Record<string, unknown> | null | undefined;
  for (const field of CITATION_REFLISTS.get(kindOf(doc)) ?? []) {
    const value = bag?.[field];
    if (!Array.isArray(value)) continue;
    for (const entry of value) if (typeof entry === "string") out.push(entry);
  }
  return out;
}

/** A doc's already-authored `dependsOn`, in authored order. */
function authoredEdgesOf(doc: unknown): string[] {
  const payload = doc as { dependsOn?: unknown } | null | undefined;
  return Array.isArray(payload?.dependsOn)
    ? payload.dependsOn.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function kindOf(doc: unknown): string {
  const payload = doc as { kind?: unknown } | null | undefined;
  return typeof payload?.kind === "string" ? payload.kind : "";
}

/**
 * PURE: decide the whole one-time bootstrap (ADR-0223 dec 5).
 *
 * A citation seeds an edge iff the target is STRICTLY more foundational than the source: a
 * `doc:<relpath>` ADR (tier 0, always), or an artifact whose kind sits at a lower
 * {@link KNOWLEDGE_TIERS} tier. Same-tier and up-tier citations are dropped — the former ARE the
 * curation tail, and inferring them is exactly the arbitrary-winner problem ADR-0363 D1 refused.
 *
 * Every emitted entry is checked against {@link DependsOnRef}. The migration writes into a validated
 * field, so a pointer the schema would reject must be dropped HERE, where it can be counted and
 * reported, rather than at the write, where it would fail one artifact for reasons the operator
 * cannot see. A bare `doc:0241` is the real instance: it satisfies the regex but is not a relpath, so
 * it is caught by the separate relpath rule below.
 *
 * An artifact that already carries `dependsOn` is EXTENDED, not skipped whole (ADR-0373). The seed had
 * to change here or the decision could not land at all: all 13 agents were already seeded from their
 * envelope `references` by ADR-0223 dec 5's first pass, so a skip-whole rule would have read every new
 * `rules` / `context` / `antiPatterns` field and written none of them.
 *
 * "Never overwrite authored curation" is PRESERVED — the emitted set is the existing edges in their
 * authored order followed by the new ones, so nothing is ever removed or reordered. What is given up
 * is "never re-add": an edge a curator DELIBERATELY DELETED comes back if it is also derivable from a
 * citation field, because a deleted edge and a never-seeded one are indistinguishable in the stored
 * doc. Accepted knowingly and stated in ADR-0373 — the first pass landed 2026-08-14 and the same-tier
 * curation tail it handed to curators is untouched, so there is no deletion history to lose yet. If
 * curation deletions ever become common, the fix is to record them, not to restore the skip.
 */
export function projectDependsOnFromCitations(docs: readonly CitationSource[]): DependsOnBootstrapPlan {
  const tierById = new Map<string, number | undefined>();
  const knownIds = new Set<string>();
  for (const row of docs) {
    knownIds.add(row.id);
    tierById.set(row.id, KNOWLEDGE_TIERS.get(kindOf(row.doc)));
  }

  const edges: BootstrapEdge[] = [];
  let docsScanned = 0;
  let edgesPlanned = 0;
  let sameTier = 0;
  let upTier = 0;
  let targetOutsideDag = 0;
  let targetAbsent = 0;
  let malformed = 0;
  let alreadyAuthored = 0;
  let extended = 0;

  for (const row of docs) {
    const sourceTier = KNOWLEDGE_TIERS.get(kindOf(row.doc));
    if (sourceTier === undefined) continue;
    docsScanned += 1;

    // Pre-load the authored edges into `seen` so they are never duplicated, and carry them at the
    // head of the emitted set so authored order survives the patch (ADR-0373).
    const authored = authoredEdgesOf(row.doc);
    const seen = new Set<string>(authored);
    const dependsOn: string[] = [];

    for (const entry of citationsOf(row.doc)) {
      let pointer: string;

      if (entry.startsWith(DOC_PREFIX)) {
        // Tier 0. A real `doc:` target is a repo-relative PATH; the corpus also holds a handful of
        // bare `doc:0241` / `doc:0235-....md` citations that name an ADR without locating one. They
        // pass DependsOnRef (digits and dots are legal) and would land as permanently dangling
        // pointers in an authored field, so the relpath rule is what actually rejects them.
        if (!entry.slice(DOC_PREFIX.length).includes("/")) {
          malformed += 1;
          continue;
        }
        pointer = entry;
      } else {
        const target = entry.startsWith(ASSET_PREFIX) ? entry.slice(ASSET_PREFIX.length) : entry;
        if (!knownIds.has(target)) {
          targetAbsent += 1;
          continue;
        }
        const targetTier = tierById.get(target);
        if (targetTier === undefined) {
          targetOutsideDag += 1;
          continue;
        }
        if (targetTier === sourceTier) {
          sameTier += 1;
          continue;
        }
        if (targetTier > sourceTier) {
          upTier += 1;
          continue;
        }
        pointer = `${ASSET_PREFIX}${target}`;
      }

      if (!DependsOnRef.safeParse(pointer).success) {
        malformed += 1;
        continue;
      }
      if (seen.has(pointer)) continue;
      seen.add(pointer);
      dependsOn.push(pointer);
    }

    if (dependsOn.length === 0) {
      // Nothing new. An artifact that already had edges is a genuine no-op; one that had none simply
      // cites nothing seedable.
      if (authored.length > 0) alreadyAuthored += 1;
      continue;
    }
    if (authored.length > 0) extended += 1;
    edges.push({ id: row.id, dependsOn: [...authored, ...dependsOn] });
    edgesPlanned += dependsOn.length;
  }

  return {
    edges,
    docsScanned,
    edgesPlanned,
    extended,
    skipped: { sameTier, upTier, targetOutsideDag, targetAbsent, malformed, alreadyAuthored },
  };
}
