/**
 * THE IN-PLACE ANNOTATION FLOOR (ADR-0419 Decision 4) — does an amended decision's own body tell a
 * reader which clause moved, or does it silently make them go follow an edge?
 *
 * `decision-read-measurement-arc` increment 05.
 *
 * ADR-0139 D4 has required this since it was written: `supersedes` means the target leaves the
 * current set, `amends` means it STAYS — and what `amends` uniquely says, which neither `status` nor
 * the edge's name states outright, is that **reading the target alone is now insufficient**. The
 * remedy has always been an in-place annotation on the TARGET. ADR-0419 measured the floor and found
 * it not holding: of 446 accepted `amends` edges on the live store (2026-08-23), 174 have a target
 * whose body does not so much as mention the amender's number, and 58 amended decisions name NONE of
 * their amenders. ADR-0020 is the worst case — six accepted amendments, none named, and the
 * second-most-pointed-at decision in the corpus.
 *
 * So this module adds a MECHANICAL floor beneath an editorial rule. It is the pure judge; a gate
 * rung, when one exists, is a thin store read around it.
 *
 * ## ⚠ THIS IS NOT WIRED TO THE GATE, AND THAT IS DELIBERATE
 *
 * ADR-0419's Consequences say it outright: *"The new rung will red the gate on 174 edges the day it
 * is enabled, so it lands disabled or scoped and is turned on as the drain completes."* Nothing in
 * `gate-order.ts` runs this, no `check:` entry point exists, and none should be added until the
 * backlog is drained (ADR-0419 Decision 3 — by deprecation, any batch size, no flag day). What
 * lands here is a tested predicate and the burndown numbers a draining session watches fall.
 *
 * ## ⚠ THE LIMIT, DECLARED WHERE IT IS DECLARED: THIS CATCHES **ABSENCE**, NEVER **THINNESS**
 *
 * A target body containing nothing but a bare `amended by 0271` PASSES this predicate and STILL
 * FAILS ADR-0139 D4. `adr list` already derives and prints the edge, so a bare number is the
 * double-entry ADR-0037 §1 forbids; what the body owes a reader is WHICH CLAUSE MOVED. That bar is
 * a librarian's editorial judgment and no regex can hold it.
 *
 * **A green from this function is therefore never compliance.** It is the weakest possible statement
 * — "somebody at least mentioned the number" — and a later reader who quotes it as "the annotation
 * obligation is met" has quoted the wrong instrument. Say so wherever the figure is printed.
 *
 * ## WHAT "REFERENCES THE AMENDER" MEANS HERE, AND WHY THE NUMBER IS A **CEILING**
 *
 * {@link bodyReferencesDecision} matches the amender's number in the two spellings the corpus
 * actually writes — a zero-padded four-digit run (`0271`, which is how `adr list` renders an edge and
 * how `ADR-0271` / `adr-0271` / `#0271` all contain it) or an explicit `ADR-`-prefixed form with any
 * padding (`ADR-271`). Both are bounded by non-digits, so `10419` never annotates 0419.
 *
 * It is PERMISSIVE on purpose, and the resulting figure is a **CEILING TWICE OVER**:
 *
 *   1. Any mention counts. A number appearing in the target's own `## References` list, inside a
 *      fenced code block quoting frontmatter, or in a sentence about something else entirely, all
 *      read as annotated. Fenced code is NOT stripped — see below.
 *   2. Even a genuine mention may be the bare-number double-entry above rather than the clause-level
 *      detail D4 asks for.
 *
 * The permissiveness is chosen rather than tolerated. This instrument's job is to catch ABSENCE, and
 * its two error directions are not symmetric: a false POSITIVE (an incidental mention read as an
 * annotation) understates the backlog, while a false NEGATIVE reds a gate on a decision that is
 * genuinely annotated. Understating a backlog that a human is draining in batches is recoverable;
 * a wrong red on a fail-closed rung is the failure that gets an instrument switched off. When this
 * is eventually wired, the number it reports is the OPTIMISTIC end of the range and must be printed
 * as one.
 *
 * The ONE tightening that is not optional is padding. An unpadded bare match would make `20 minutes`
 * annotate ADR-0020 — the very decision ADR-0419 names as the worst case — so the bare form requires
 * the padded run and only the `ADR-` prefix licenses the short one.
 *
 * ## THE EXPECTATION IS NOT DERIVED FROM ITS OWN SUBJECT
 *
 * The `an-expectation-derived-from-its-subject-cannot-fail` fault class is the commonest green-that-
 * verified-nothing in this repo, and ADR-0419 Decision 4 fences it explicitly. Here the expected set
 * comes from the `amends` FIELD and the thing checked is BODY PROSE. Two different sources, written
 * at different times by different hands — which is exactly what lets this function genuinely fail.
 * Never re-derive the expectation from the body (e.g. by scanning for "amended by" lines): the check
 * would then be permanently green and would say nothing at all.
 *
 * ## DIRECTION: THE OBLIGATION IS ON THE **TARGET**, AND INVERTING IT IS THE EASY MISTAKE
 *
 * ADR-0419's own body carries `**Amends** ADR-0402 — ...` paragraphs. Those are the AMENDER
 * describing what it reached into, and they discharge nothing: the obligation is that ADR-0402's
 * body says it was amended by 0419 and what that narrowed. So the search is always
 * `target.body` for `source.number`, never the reverse.
 *
 * ## THE DENOMINATORS ARE PART OF THE VERDICT, NOT AN AFTERTHOUGHT
 *
 * {@link AmendsAnnotationVerdict} reports how many rows it saw and how many edges it judged for the
 * reason `evaluateDependsOnAcyclicity` and `DepthFromWorkVerdict` do: *"every edge is annotated"* and
 * *"there were no edges to check"* must never print alike. A checker that returns clean because it
 * saw nothing is this repo's most-repeated fault, and it has already shipped once —
 * `check:library-dag-acyclic` reported `PASS — no dependsOn cycle across 1701 artifacts (0 authored
 * edges)` from an instrument blind to its own subject. {@link isVacuousAmendsAnnotationRead} is the
 * rule that names that state; it is deliberately kept OUT of {@link AmendsAnnotationVerdict.annotated}
 * because vacuity is a fact about the READ, not about the corpus.
 *
 * ## `supersedes` IS ABSENT FROM THE INPUT TYPE, AND THAT IS THE FENCE
 *
 * {@link AmendsAnnotationDecision} does not carry `supersedes`, exactly as `AmendsOnlyDecision` in
 * `decision-amends-seam.ts` does not — so this function cannot read it even by mistake, and there is
 * nowhere to put an edge-type parameter that a later caller would eventually pass wrong. A
 * superseding decision imposes no in-place annotation obligation: its target has LEFT the current
 * set, and `supersede-consistency` in `adr-health.ts` already binds that pair from both directions.
 * `AdrDocumentFields` (`adr-doc.ts`) is structurally assignable to this type, which is the point —
 * the caller hands over the whole record and the PARAMETER TYPE performs the exclusion.
 *
 * Pure and TOTAL: no filesystem, no store, no zod, no clock, no `node:` import. It runs over rows a
 * caller already holds, so the same judge serves a probe, a future gate rung and the studio.
 */

/**
 * The status a decision must carry for its `amends` edges to oblige anything.
 *
 * MATCHED POSITIVELY, never by exclusion (`decision-pointer.ts`'s rule: a reader that tested
 * `!== "superseded"` to mean "current" was correct for exactly as long as there were two members).
 * A `proposed` amender has not been decided and a `superseded` one is dead, so neither reaches into
 * anything — which is the same rule `loadBearingReach` applies when it declines to pull a non-accepted
 * amender into the calibrate-to-these set (ADR-0139).
 */
const ACCEPTED = "accepted";

/**
 * The ONLY view of a decision this judge is allowed to see.
 *
 * `supersedes` is absent by design — see the header. `status` is typed as the wide `string` rather
 * than the three-member union deliberately: the caller has usually just projected an untrusted
 * stored row (`adrDocumentFieldsOf` degrades an unreadable status to `proposed`), and this function
 * must be total over whatever arrives rather than a second place a surprise value throws.
 */
export interface AmendsAnnotationDecision {
  /** The decision's number — its identity. */
  readonly number: number;
  /** Its lifecycle status. Only {@link ACCEPTED} amenders impose the obligation. */
  readonly status: string;
  /** The decisions this one reaches into. NEVER the ones it supersedes. */
  readonly amends: readonly number[];
  /** The whole decision document, as stored. The thing actually checked. */
  readonly body: string;
}

/** One amended decision that is still owed at least one in-place annotation. The burndown row. */
export interface UnannotatedAmendsTarget {
  /** The amended decision's number — the unit of work, since annotation is partitioned by TARGET. */
  readonly number: number;
  /**
   * The target's own status, REPORTED rather than filtered on.
   *
   * A `superseded` target has left the current set and annotating it is archaeology, so a draining
   * caller may well skip it — but ADR-0419 Decision 4 carves out no such exception and this judge
   * does not invent one. The caller decides; see {@link isVacuousAmendsAnnotationRead} for the same
   * report-don't-decide split.
   */
  readonly status: string;
  /** How many accepted amenders point at it in total — the per-target denominator. */
  readonly acceptedAmenders: number;
  /** The amenders its body does not mention, ascending. How much this one row still owes. */
  readonly missingAmenders: readonly number[];
}

/**
 * The corpus-wide annotation verdict — denominators and burndown, not a boolean.
 *
 * Read {@link annotated} ONLY alongside {@link edgesJudged}: with no edges in scope the flag is
 * vacuously true, which is the whole reason the counts are here.
 */
export interface AmendsAnnotationVerdict {
  /**
   * True iff every JUDGED accepted `amends` edge has an annotated target.
   *
   * Vacuously true on an empty read — pair it with {@link edgesJudged}, or ask
   * {@link isVacuousAmendsAnnotationRead}. Dangling edges do not flip it: an unresolvable pointer is
   * a different fault, already caught by `adr-edge-integrity` (ADR-0037 §3), and folding the two
   * would make a broken pointer indistinguishable from a missing annotation.
   */
  readonly annotated: boolean;
  /** How many decision rows were judged. A reading of 0 is "nothing was measured", never "healthy". */
  readonly decisionsScanned: number;
  /** THE DENOMINATOR: accepted `amends` edges seen, deduped per source. Includes dangling ones. */
  readonly edgesScanned: number;
  /** Of those, the ones whose target this read actually holds — the set that could be judged. */
  readonly edgesJudged: number;
  /** Judged edges whose target body references the amender. A CEILING — see the header. */
  readonly edgesAnnotated: number;
  /** Judged edges whose target body does not. THE BURNDOWN NUMBER (174 live on 2026-08-23). */
  readonly edgesUnannotated: number;
  /** Accepted `amends` edges naming a decision this read does not hold. Counted, never dropped. */
  readonly danglingEdges: number;
  /** The distinct decision numbers behind {@link danglingEdges}, ascending. */
  readonly danglingTargets: readonly number[];
  /** Distinct decisions in hand that at least one accepted `amends` edge points at. */
  readonly targetsScanned: number;
  /** Of those, the ones whose body mentions EVERY one of their accepted amenders. */
  readonly targetsAnnotated: number;
  /**
   * Every target still owed an annotation, ascending by number.
   *
   * ASCENDING and deduped so two runs over the same corpus print identically — a burndown a session
   * watches fall cannot be read off an unstable order. The partition unit is the TARGET, matching
   * ADR-0419's write-partition hazard: a decision with six amenders needs ONE coherent pass, because
   * concurrent writes to the same `body` field are last-write-wins with no detector (ADR-0352
   * protects DIFFERENT fields, not the same one).
   */
  readonly unannotatedTargets: readonly UnannotatedAmendsTarget[];
  /**
   * `amends` entries that were not usable decision numbers, counted rather than silently skipped.
   *
   * Unreachable through the typed write path and reachable through a defensive read
   * (`adrDocumentFieldsOf` filters on `typeof === "number"`, which admits `NaN` and `3.5`). Excluded
   * from {@link edgesScanned} because a non-number is not an edge; reported so a read that dropped
   * something can never look like a read that saw nothing to drop.
   */
  readonly malformedTargets: number;
}

/**
 * The decision-log size at or above which ZERO accepted `amends` edges can only mean the READER is
 * blind.
 *
 * A threshold, not a proof, and calibrated against the two corpora that actually exist rather than
 * chosen for roundness: the hermetic fixture (`@storytree/library/fixture`) holds **zero** `adr`
 * rows, so a fixture-backed read legitimately sees nothing; the live store held **412** decisions
 * carrying **446** accepted `amends` edges on 2026-08-23. 100 sits an order of magnitude above the
 * corpus that may honestly read zero and well below the one that may not.
 *
 * Re-measure rather than inherit it — the live figure has moved twice already.
 */
export const VACUOUS_AMENDS_ANNOTATION_READ_FLOOR = 100;

/**
 * True when a verdict is VACUOUS: a decision log large enough to be the real one, and not one
 * accepted `amends` edge seen.
 *
 * WHY THIS IS A RULE AND NOT JUST A PRINTED NUMBER — the same reason `isVacuousDependsOnRead` gives.
 * A verdict can report its denominators honestly and still be COLLAPSED by a caller that prints the
 * zero and then exits 0. An instrument that cannot see its subject must not report success.
 *
 * Deliberately NOT folded into {@link AmendsAnnotationVerdict.annotated}: a decision log with no
 * amendments genuinely owes no annotations, and saying otherwise would make the judge lie in the
 * other direction. The caller decides what an unverifiable read costs it.
 */
export function isVacuousAmendsAnnotationRead(verdict: AmendsAnnotationVerdict): boolean {
  return (
    verdict.edgesScanned === 0 &&
    verdict.decisionsScanned >= VACUOUS_AMENDS_ANNOTATION_READ_FLOOR
  );
}

/**
 * PURE: the spellings of a decision number that count as a mention.
 *
 * Two alternatives, and the split is load-bearing (see the header's padding note):
 *
 *   - `adr[-\s]?0*NNN` — an explicit `ADR-`/`adr-` label at any padding, case-insensitive. This is
 *     what licenses the SHORT form: `ADR-20` is unambiguous, `20` is not.
 *   - `NNNN` — the zero-padded four-digit run on its own. It is what `adr list` prints, and it is
 *     also the tail of `ADR-0020` / `#0020` / `asset:adr-0020`, so the padded alternative subsumes
 *     every prefixed spelling this repo writes, including the en-dash one the label form misses.
 *
 * Both are fenced by non-digit boundaries, so `10419` does not annotate 0419 and `20419` does not
 * annotate 0419 either. The digits are interpolated raw because they are digits — there is no regex
 * metacharacter to escape, and adding an escape helper here would imply otherwise.
 */
function decisionMentionPattern(decisionNumber: number): RegExp {
  const digits = String(decisionNumber);
  const padded = digits.padStart(4, "0");
  return new RegExp(`(?<!\\d)(?:adr[-\\s]?0*${digits}|${padded})(?!\\d)`, "i");
}

/**
 * PURE and TOTAL: does this body mention that decision at all?
 *
 * ABSENCE ONLY — a `true` here is the weakest statement the header describes, never compliance with
 * ADR-0139 D4. A non-positive or non-integer number, and an empty body, both read `false` rather
 * than throwing: this is the read side of what will become a fail-closed rung, and a surprise row
 * must not be where the gate goes down (`depends-on.ts`'s standing rule).
 */
export function bodyReferencesDecision(body: string, decisionNumber: number): boolean {
  if (!Number.isInteger(decisionNumber) || decisionNumber <= 0) return false;
  if (body === "") return false;
  return decisionMentionPattern(decisionNumber).test(body);
}

/**
 * PURE: judge a whole decision log for ADR-0419 Decision 4's in-place annotation floor.
 *
 * The FIRST row wins on a duplicate number, matching `decisionAmendsResolver` and
 * `findDependsOnCycles` — re-pointing a number at a later row would silently re-target every edge
 * that names it. A source's duplicate `amends` entries are deduped, so the denominator counts EDGES
 * rather than array slots.
 *
 * A SELF-AMENDING row (`amends` naming its own number) is an authoring error `adr-edge-integrity`
 * does not currently refuse; it is judged like any other edge and will always read as annotated,
 * because every decision's `# ADR-NNNN:` H1 contains its own number. Noted rather than special-cased:
 * zero instances live, and a carve-out for a state that does not occur is a branch nobody can test.
 */
export function evaluateAmendsAnnotation(
  rows: readonly AmendsAnnotationDecision[],
): AmendsAnnotationVerdict {
  const byNumber = new Map<number, AmendsAnnotationDecision>();
  for (const row of rows) {
    if (byNumber.has(row.number)) continue;
    byNumber.set(row.number, row);
  }

  const amendersByTarget = new Map<number, number[]>();
  const danglingTargets = new Set<number>();
  let edgesScanned = 0;
  let danglingEdges = 0;
  let malformedTargets = 0;

  // Sorted so the accumulated amender lists arrive in a stable order regardless of how the caller's
  // store happened to page its rows — the burndown must print the same way twice.
  const sources = [...byNumber.values()].sort((a, b) => a.number - b.number);
  for (const source of sources) {
    if (source.status !== ACCEPTED) continue;
    const seen = new Set<number>();
    for (const target of source.amends) {
      if (!Number.isInteger(target) || target <= 0) {
        malformedTargets += 1;
        continue;
      }
      if (seen.has(target)) continue;
      seen.add(target);
      edgesScanned += 1;
      if (!byNumber.has(target)) {
        danglingEdges += 1;
        danglingTargets.add(target);
        continue;
      }
      const amenders = amendersByTarget.get(target);
      if (amenders === undefined) amendersByTarget.set(target, [source.number]);
      else amenders.push(source.number);
    }
  }

  const unannotatedTargets: UnannotatedAmendsTarget[] = [];
  let edgesAnnotated = 0;
  let targetsAnnotated = 0;
  for (const targetNumber of [...amendersByTarget.keys()].sort((a, b) => a - b)) {
    const target = byNumber.get(targetNumber);
    const amenders = amendersByTarget.get(targetNumber);
    // Both lookups are populated by the loop above; the guard keeps the read total rather than
    // asserting, since `noUncheckedIndexedAccess` makes the possibility explicit either way.
    if (target === undefined || amenders === undefined) continue;
    const missingAmenders = amenders
      .filter((amender) => !bodyReferencesDecision(target.body, amender))
      .sort((a, b) => a - b);
    edgesAnnotated += amenders.length - missingAmenders.length;
    if (missingAmenders.length === 0) {
      targetsAnnotated += 1;
      continue;
    }
    unannotatedTargets.push({
      number: targetNumber,
      status: target.status,
      acceptedAmenders: amenders.length,
      missingAmenders,
    });
  }

  const edgesJudged = edgesScanned - danglingEdges;
  return {
    annotated: edgesJudged === edgesAnnotated,
    decisionsScanned: byNumber.size,
    edgesScanned,
    edgesJudged,
    edgesAnnotated,
    edgesUnannotated: edgesJudged - edgesAnnotated,
    danglingEdges,
    danglingTargets: [...danglingTargets].sort((a, b) => a - b),
    targetsScanned: amendersByTarget.size,
    targetsAnnotated,
    unannotatedTargets,
    malformedTargets,
  };
}
