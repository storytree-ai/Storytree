/**
 * THE DRAIN WORKLIST (ADR-0419 Decision 3) — the two views a draining session works from, and the
 * evidence each verdict needs.
 *
 * `decision-read-measurement-arc` increment 07.
 *
 * ADR-0419 D3 makes the migration a DEPRECATION rather than a flag day: "No batch is coordinated
 * with any other, any batch size is valid, and a partial pass is a net gain rather than a
 * half-migration." That is only true because increment 05 taught every reader to traverse `amends`
 * AND `dependsOn` (D1), so an edge rehomed from one field to the other never leaves the walk's view.
 * The corpus is therefore consistent at every point of the drain, and this module's job is to hand a
 * session ONE batch of it with the evidence attached.
 *
 * ## ⚠ THIS MODULE CLASSIFIES NOTHING, AND THAT IS THE DESIGN
 *
 * Each accepted `amends` edge gets one of two verdicts. REAL AMENDMENT — something in the target is
 * narrowed, retired or extended, so the target owes an in-place annotation naming the clause that
 * moved. PLAIN SUPPORT — the source rests on the target and changed nothing in it, so the edge is
 * rehomed to the source's `dependsOn`.
 *
 * ADR-0419 D3 states outright why no function here may pick between them: *"Deciding whether an edge
 * is an amendment or plain support is EDITORIAL, so no registry transform can exist and the mixed
 * period will be long."* Migration #7 could forward-migrate `standsOn` lazily because that rename was
 * MECHANICAL and decidable per document; this one is not. A heuristic here would be worse than
 * nothing — it would produce confident stale prose on the annotation side, which is precisely what
 * ADR-0139 D1 forbids, and would do it at exit code 0.
 *
 * So this module GATHERS and PARTITIONS. The verdict is the draining session's, and
 * {@link AmendsEdgeEvidence.sourceParagraphs} exists to make that verdict cheap: an amender that
 * reached into its target usually says so in its own body (ADR-0419's own `**Amends** ADR-0402 — …`
 * paragraphs are the house form), and a source that says nothing about a target it names is the
 * strongest available hint that the edge was plain support all along.
 *
 * ## ⚠ THE TWO PARTITIONS INVERT, AND GETTING IT WRONG LOSES DATA AT EXIT CODE 0
 *
 * This is ADR-0419's stated write-partition hazard, and it is the reason there are two functions
 * here rather than one list a caller slices however it likes.
 *
 *   - ANNOTATION is partitioned by TARGET — {@link AmendsAnnotationVerdict.unannotatedTargets} in
 *     `amends-annotation.ts` is already that view. A decision with six amenders needs ONE coherent
 *     pass over its body, because concurrent writes to the same `body` field are last-write-wins with
 *     no detector (ADR-0352 protects DIFFERENT fields, not the same one).
 *   - REHOMING is partitioned by SOURCE — {@link rehomeWorklistBySource}. An amender may amend
 *     several targets, so a target-partitioned rehome puts two writers inside one `amends` array and
 *     the second silently drops the first's removal.
 *
 * A caller that takes a batch from one view and writes through the other has already lost data. The
 * types do not prevent it — nothing can, since both are lists of numbers — so the partition is named
 * in both function docs and in the probe that prints them.
 *
 * ## THE DENOMINATORS TRAVEL WITH THE WORKLIST
 *
 * {@link AmendsDrainWorklist} carries `edgesScanned` alongside the rows for the reason
 * `evaluateAmendsAnnotation`, `evaluateDependsOnAcyclicity` and `DepthFromWorkVerdict` all carry
 * theirs: "the drain is complete" and "nothing was read" must never print alike. A worklist that is
 * empty because the store was unreachable looks exactly like a worklist that is empty because the
 * backlog is gone, and this repo has already shipped that fault once
 * (`check:library-dag-acyclic` reporting clean over 0 authored edges).
 *
 * Pure and TOTAL: no filesystem, no store, no zod, no clock, no `node:` import. Same discipline as
 * `amends-annotation.ts`, and for the same reason — one judge serves the probe, a future gate rung
 * and the studio.
 */

import { bodyReferencesDecision, type AmendsAnnotationDecision } from "./amends-annotation.js";

/**
 * The status a decision must carry for its `amends` edges to be drain work.
 *
 * MATCHED POSITIVELY, never by exclusion — `amends-annotation.ts`'s rule, itself
 * `decision-pointer.ts`'s. A `proposed` amender has not been decided and a `superseded` one is dead,
 * so neither obliges an annotation nor owns an edge worth rehoming.
 */
const ACCEPTED = "accepted";

/**
 * How many paragraphs of the source's own prose travel with an edge.
 *
 * A cap rather than the whole body: the evidence a verdict needs is what the SOURCE says about THIS
 * target, and an uncapped dump would put the entire decision log through a terminal on the first
 * run. Three is what the house `**Amends** ADR-NNNN — …` form plus its surrounding context occupies;
 * a source that needs more than three paragraphs to explain one edge is an editorial read either way.
 */
const SOURCE_PARAGRAPH_CAP = 3;

/** One accepted `amends` edge, with everything a verdict on it needs. */
export interface AmendsEdgeEvidence {
  /** The amending decision — the row whose `amends` array holds this edge. */
  readonly source: number;
  /** The amended decision. */
  readonly target: number;
  /**
   * The target's status, REPORTED rather than filtered on — `UnannotatedAmendsTarget`'s rule.
   *
   * A `superseded` target has left the current set, so a draining caller may reasonably skip it;
   * ADR-0419 D4 carves out no such exception and this module does not invent one.
   */
  readonly targetStatus: string;
  /** Whether the target is resolvable in the rows this read holds. A dangling edge is not drain work. */
  readonly targetResolved: boolean;
  /**
   * Whether the target's body mentions the source at all — the CEILING from `amends-annotation.ts`.
   *
   * `true` here is the weakest possible statement ("somebody mentioned the number") and is NEVER
   * compliance with ADR-0139 D4, which asks for the clause that moved. It is carried so a batch can
   * be taken from the silent edges first, not so a caller can declare an edge discharged.
   */
  readonly targetMentionsSource: boolean;
  /**
   * The source's own paragraphs that mention this target, capped at {@link SOURCE_PARAGRAPH_CAP}.
   *
   * THE EVIDENCE FOR THE EDITORIAL VERDICT, and it reads in both directions: prose describing what
   * the source narrowed in the target argues REAL AMENDMENT, while an empty list on a source that
   * nonetheless names the target in its `amends` field is the strongest available hint of PLAIN
   * SUPPORT. Neither is decisive — see the header on why nothing here classifies.
   */
  readonly sourceParagraphs: readonly string[];
}

/** One amending decision and every accepted `amends` edge it owns. The REHOMING unit of work. */
export interface RehomeSourceRow {
  /** The amending decision's number — the partition key, since rehoming writes the SOURCE's array. */
  readonly number: number;
  /** Its status. Always {@link ACCEPTED}; carried so a printed row is self-describing. */
  readonly status: string;
  /** Its edges, ascending by target. Deduped, so the count is edges rather than array slots. */
  readonly edges: readonly AmendsEdgeEvidence[];
}

/**
 * The rehoming worklist and its denominators.
 *
 * Read {@link sources} ONLY alongside {@link edgesScanned}: an empty worklist over zero scanned
 * edges is an unread corpus, not a drained one.
 */
export interface AmendsDrainWorklist {
  /** Amending decisions with at least one accepted edge, ascending by number. */
  readonly sources: readonly RehomeSourceRow[];
  /** How many decision rows were read. A reading of 0 is "nothing was measured", never "healthy". */
  readonly decisionsScanned: number;
  /** THE DENOMINATOR: accepted `amends` edges seen, deduped per source. Includes dangling ones. */
  readonly edgesScanned: number;
  /** Of those, the ones whose target this read holds. */
  readonly edgesResolved: number;
  /** Edges whose target body does not mention the source — the burndown, and the batch to take first. */
  readonly edgesSilent: number;
}

/**
 * PURE: split a decision body into paragraphs that mention a given decision number.
 *
 * Paragraphs are blank-line separated, which is how every decision in this corpus is written, and
 * are returned TRIMMED but otherwise byte-exact — a caller is reading them to make an editorial call
 * and a paraphrase here would be the third-hand summary the whole arc exists to avoid.
 *
 * FENCED CODE IS NOT STRIPPED, matching {@link bodyReferencesDecision}. A frontmatter block quoting
 * `amends: [139]` therefore reads as a mentioning paragraph. That is the permissive direction on
 * purpose: this is evidence handed to a human judgment, where a false positive costs one glance and
 * a false negative hides the one paragraph that decides the verdict.
 *
 * TOTAL over untrusted input: a non-positive or non-integer number, and an empty body, both return
 * an empty list rather than throwing.
 */
export function mentioningParagraphs(
  body: string,
  decisionNumber: number,
  cap: number = SOURCE_PARAGRAPH_CAP,
): string[] {
  if (!Number.isInteger(decisionNumber) || decisionNumber <= 0) return [];
  if (body === "") return [];
  const found: string[] = [];
  for (const raw of body.split(/\n[ \t]*\n/)) {
    if (found.length >= cap) break;
    const paragraph = raw.trim();
    if (paragraph === "") continue;
    if (bodyReferencesDecision(paragraph, decisionNumber)) found.push(paragraph);
  }
  return found;
}

/**
 * PURE: the REHOMING worklist, partitioned by SOURCE (ADR-0419's write-partition hazard).
 *
 * ⚠ USE THIS VIEW ONLY TO WRITE A SOURCE'S `amends` ARRAY. The annotation half is partitioned by
 * TARGET and lives in `evaluateAmendsAnnotation`; taking a batch from one view and writing through
 * the other puts two writers in one field, and last-write-wins has no detector here.
 *
 * The FIRST row wins on a duplicate number, matching `evaluateAmendsAnnotation`,
 * `decisionAmendsResolver` and `findDependsOnCycles` — re-pointing a number at a later row would
 * silently re-target every edge that names it. A source's duplicate `amends` entries are deduped and
 * malformed ones are skipped, both exactly as the annotation judge does, so the two views report the
 * same denominator over the same corpus and can be compared across a batch.
 *
 * Sources with no accepted edge are omitted rather than listed empty: this is a worklist, and a row
 * with nothing to do on it is not work. The corpus-wide counts are on {@link AmendsDrainWorklist}.
 */
export function rehomeWorklistBySource(
  rows: readonly AmendsAnnotationDecision[],
): AmendsDrainWorklist {
  const byNumber = new Map<number, AmendsAnnotationDecision>();
  for (const row of rows) {
    if (byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }

  const sources: RehomeSourceRow[] = [];
  let edgesScanned = 0;
  let edgesResolved = 0;
  let edgesSilent = 0;

  const ordered = [...byNumber.values()].sort((a, b) => a.number - b.number);
  for (const source of ordered) {
    if (source.status !== ACCEPTED) continue;
    const seen = new Set<number>();
    const edges: AmendsEdgeEvidence[] = [];
    for (const target of [...source.amends].sort((a, b) => a - b)) {
      if (!Number.isInteger(target) || target <= 0) continue;
      if (seen.has(target)) continue;
      seen.add(target);
      edgesScanned += 1;
      const targetRow = byNumber.get(target);
      const resolved = targetRow !== undefined;
      if (resolved) edgesResolved += 1;
      // A DANGLING target reads as `false` here and is NOT counted into `edgesSilent`: an
      // unresolvable pointer is a different fault (`adr-edge-integrity`, ADR-0037 §3), and folding
      // the two would make a broken pointer indistinguishable from a missing annotation — the same
      // separation `AmendsAnnotationVerdict.annotated` keeps.
      const mentions = targetRow !== undefined && bodyReferencesDecision(targetRow.body, source.number);
      if (resolved && !mentions) edgesSilent += 1;
      edges.push({
        source: source.number,
        target,
        targetStatus: targetRow?.status ?? "(unresolved)",
        targetResolved: resolved,
        targetMentionsSource: mentions,
        sourceParagraphs: mentioningParagraphs(source.body, target),
      });
    }
    if (edges.length > 0) {
      sources.push({ number: source.number, status: source.status, edges });
    }
  }

  return {
    sources,
    decisionsScanned: byNumber.size,
    edgesScanned,
    edgesResolved,
    edgesSilent,
  };
}
