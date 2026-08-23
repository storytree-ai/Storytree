/**
 * WHAT THE TRAVERSAL RECORD CAN AND CANNOT SEE OF A DECISION READ — story
 * `context-traversal-transcript`, declared at STORY GRAIN
 * (ADR-0419 / `decision-read-measurement-arc-inc-01`).
 *
 * This header named `transcript-decision-read-ingest` until that capability was actually minted
 * (`linked-session-context-arc-inc-28`). Minting it made the claim checkable, and it turned out to be
 * wrong: this module WRITES NOTHING, so filing a measurement instrument under a write organ would make
 * that capability's stated outcome untrue. The owner of record is `repo-manifest.json` →
 * `sourceOwnership.subtrees`; its `$comment_decision_read_coverage` note carries the full reasoning and
 * names what is still owed — a third capability over the read-back/observability report, which needs
 * its own increment rather than being smuggled into that one.
 *
 * An EXTENSION to `probe:decision-reads`, never a second instrument. The sibling modules here
 * RECOVER reads out of host transcripts and append them; this one reads the traversal record BACK
 * and reports what is in it, because the arc's baseline (`-inc-02`) is about to be frozen on top of
 * it and one of its four questions cannot be computed at all without the finding below.
 *
 * ## THE JOIN IS THE WHOLE POINT, AND IT FAILS SILENTLY
 *
 * Offer-to-follow — "of the decision pointers offered to an agent, what fraction are followed" — is
 * a JOIN between two populations that name the same decision differently:
 *
 *   - the OFFER side, `candidate_set.candidateNodeIds`, records `offerIdOf(ref)`: an `asset:adr-0419`
 *     reference is printed with the scheme stripped (`adr-0419`), and a `doc:decisions/0022-….md`
 *     reference passes through VERBATIM.
 *   - the READ side records whatever route reached the decision: the live CLI observer mints the
 *     artifact id `adr-0022` (a decision is an ordinary Library row since ADR-0403 dec 1), while the
 *     three historical file shapes mint `doc:decisions/0022-….md`.
 *
 * So `doc:decisions/0022-….md` and `adr-0022` are the same decision under two ids, and a join on the
 * RAW id string silently drops every pair that spans the two spellings. It does not throw and it
 * does not read as empty: it computes a plausible, confident, wrong ratio — the exact failure mode
 * this arc keeps finding in its own instruments, and the reason ADR-0419's increment 1 exists at all.
 *
 * The two spellings are deliberately NOT unified at write time — `decision-reads.ts`'s header states
 * why, and rewriting historical ids would break the idempotence the ingest rests on. They are
 * reconciled HERE, at READ time, through `parseDecisionPointer` / `adrNumberOfArtifactId`: the single
 * resolution point ADR-0403 dec 7 insisted on. {@link resolveDecisionId} is that reconciliation and
 * nothing else keys on it.
 *
 * ## MOST DECISION OFFERS ARE UNOBSERVABLE, AND THAT IS SETTLED — SIZED HERE, NEVER "FIXED"
 *
 * A `followed_edge` is recorded only when the answering invocation carries `--from-offer`
 * (ADR-0260 D3 — the id travels in argv, never a recency join), and an agent gets that flag from the
 * follow-up command the render PRINTS. `renderOfferFollowUps` skips any offer id carrying a scheme
 * prefix, so a `doc:`-spelled decision offer is never printed as a followable line.
 *
 * ⚠ THE OBVIOUS "FIX" IS REFUSED, AND HAS BEEN SINCE 2026-08-05. ADR-0312 amends ADR-0260 on exactly
 * this point, owner-directed: the `doc:` blind spot is MEASURED, not closed, and ADR-0260's body now
 * says outright that its old "closing it is a candidate increment" expectation is WITHDRAWN. The
 * reason is not scheduling — it is that closing it would make the surface LESS HONEST.
 * `isFollowableOfferId` gates `decision-point-playback`'s `unobservable` bucket, so the moment such
 * an offer became followable every unanswered one would render `not-followed` — a DECLINED BRANCH
 * the session never declined — for every agent that goes on reading the decision as a file. Do not
 * read the figure below as a worklist item.
 *
 * So this module does what ADR-0312 chose instead: it STATES THE DENOMINATOR, scoped to decisions.
 * `offeredDecisionsUnobservable` is the decision-shaped slice of the same population
 * `computeOfferObservability` already reports corpus-wide, and it is computed by
 * {@link classifyOfferObservability} — the REAL machinery, which builds the argv a follow would use
 * and runs it through the actual allowlist — never by restating a prefix table here. That matters
 * more than it looks: a second copy of the rule would agree with the renderer whatever the renderer
 * did, and the whole value of this figure is that it can disagree.
 *
 * What a baseline must take from it: a near-zero decision follow COUNT is a property of the
 * instrument, not evidence about agent behaviour, and an offer-to-follow rate computed FROM
 * `followed_edge` must be reported over the OBSERVABLE branches rather than the offered ones
 * (ADR-0312's own rule).
 *
 * ⚠ THAT RULE SCOPES THE `followed_edge` ROUTE ONLY — READ LITERALLY IT SHRINKS A MEASUREMENT ~65x.
 * There are TWO routes to offer-to-follow and they cover very different slices of the SAME offer
 * population. `followed_edge` is the narrow one, and {@link classifyOfferObservability} above is
 * exactly what scopes it: a rate resting on it alone rests on the observable slice. The other is the
 * READ RECORD — a recorded READ of the offered decision, in the same context window, at or after the
 * offer — which needs no `--from-offer` and therefore works for EVERY pointer spelling now that
 * decision reads are captured at all. `-inc-02` measured both over the same 3,351 decision offers
 * (`docs/research/decision-read-baseline-2026-08-23.md`, reproducible with
 * `pnpm probe:decision-baseline`):
 *
 *   - `followed_edge`:     51 of 3,351 offers observable (1.5%)  —   2 followed, 3.9%
 *   - the READ RECORD:  3,351 of 3,351 offers          (100%)    — 156 followed, 4.7%
 *
 * So for THIS question the read-record route SUPERSEDES the narrowing. Reporting only the observable
 * rate would rest the arc's third number on 51 offers; reporting only the read-record rate would
 * ignore the `followed_edge` finding. `-inc-02` prints both side by side, and the useful part is that
 * they AGREE on shape (3.9% vs 4.7%) — stronger evidence that offers are noise than either figure
 * alone.
 *
 * What that qualification does NOT touch: the refusal above STANDS — `offeredDecisionsUnobservable`
 * remains a DENOMINATOR and never a defect count, and neither route makes the `doc:` gap a worklist
 * item — and the join rule is untouched either way, since both sides of both routes still resolve
 * through {@link resolveDecisionId} before any comparison.
 *
 * ## EVERY FIGURE IS A FLOOR, AND THE LOCAL RECORD IS ONE BOX'S HISTORY
 *
 * The read side inherits every floor the sibling modules declare — a scraped shell read survives
 * only as much of an opaque command string as a conservative scraper can prove — and adds one of its
 * own: the trace directory is this machine's, so an absence here is an absence on this laptop, never
 * a property of the corpus. And the standing limit outranks all of it: a READ COUNT IS NOT A
 * SUFFICIENCY MEASURE, because a model given insufficient context answers confidently rather than
 * abstaining, so no ratio computed here says an agent had what it needed.
 *
 * ## THE COMPUTATION IS PURE; ONE FUNCTION IS THE I/O BOUNDARY
 *
 * {@link summariseDecisionReadCoverage} and {@link renderDecisionReadCoverage} take events and give
 * back a report — no filesystem, no clock, no `process.env` — so every claim above is testable
 * offline against literal events. {@link collectDecisionReadCoverage} is the single boundary that
 * reads the trace directory, through the capture package's own sink rather than by parsing JSONL
 * again, on the same rule `ingest-decision-reads.ts` follows: the sink is the only reader of its own
 * format.
 */
import {
  classifyOfferObservability,
  listTraversalSessions,
  readTraversalSession,
  LIBRARY_ARTIFACT_SURFACE,
} from "@storytree/context-traversal-capture";
import { isContextVisitEvent } from "@storytree/context-traversal-telemetry";
import type { ContextTraversalEvent } from "@storytree/context-traversal-telemetry";
import { adrNumberOfArtifactId, parseDecisionPointer } from "@storytree/library";

import { DECISION_READ_SURFACES } from "./decision-reads.js";

/**
 * How an id spells the decision it names. REPORTED rather than normalised away, on
 * `DecisionPointerSpelling`'s own rule: an inconsistent spelling is itself the finding, and a reader
 * that only ever saw the resolved number could not tell that one of the spellings had stopped
 * joining.
 *
 * `row` is the fourth member and the one the other three lack a name for: the bare `adr-NNNN`
 * ARTIFACT ID a live CLI read mints. It is not a pointer at all — no scheme, nothing to parse — so
 * `parseDecisionPointer` correctly refuses it, and a reader that used that function alone would
 * classify every post-migration read as "not a decision".
 */
export type DecisionIdSpelling = "row" | "asset" | "decisions" | "docs/decisions";

/** One id resolved to the decision it names, keeping the spelling that named it. */
export interface ResolvedDecisionId {
  readonly number: number;
  readonly spelling: DecisionIdSpelling;
}

/**
 * PURE and TOTAL: the decision a TRAVERSAL NODE ID names, or null when it names something else.
 *
 * The reconciliation the header describes, and the only place the four live id forms are brought
 * together. Both authorities are the corpus's own — `adrNumberOfArtifactId` for the row id and
 * `parseDecisionPointer` for the three pointer spellings — so this function invents no rule of its
 * own and cannot drift from what the rest of the corpus considers a decision.
 *
 * Null is an ordinary, expected answer: most traversal node ids name a Library artifact that is not
 * a decision. It is returned as null and COUNTED by the caller, never coerced.
 */
export function resolveDecisionId(nodeId: string): ResolvedDecisionId | null {
  const pointer = parseDecisionPointer(nodeId);
  if (pointer !== null) return { number: pointer.number, spelling: pointer.spelling };

  const row = adrNumberOfArtifactId(nodeId);
  if (row !== null) return { number: row, spelling: "row" };

  return null;
}

/**
 * Which recorder saw a read.
 *
 * `live-cli` is the ambient observer firing as the command runs (`observeCliInvocation`);
 * `host-transcript` is the batch sweep reading the harness's own transcript afterwards. They are
 * SEPARATE EVENTS for the same underlying read when both fire, by construction — different surface,
 * different event id — which `decision-reads.ts`'s header already declares. Counting them apart is
 * therefore mandatory: summing them would double every read the two routes both reached, and the
 * overlap is exactly the population a post-migration session produces.
 */
export type DecisionReadRoute = "live-cli" | "host-transcript" | "other";

const HOST_TRANSCRIPT_SURFACES: ReadonlySet<string> = new Set(Object.values(DECISION_READ_SURFACES));

/** Which recorder a visit's `surfaceId` names. `other` is a real answer, not a fallback for junk:
 * a decision id could in principle be reached on a surface neither recorder owns, and folding that
 * into either one would attribute a read to a recorder that did not make it. */
export function routeOfSurface(surfaceId: string | undefined): DecisionReadRoute {
  if (surfaceId === undefined) return "other";
  if (surfaceId === LIBRARY_ARTIFACT_SURFACE) return "live-cli";
  if (HOST_TRANSCRIPT_SURFACES.has(surfaceId)) return "host-transcript";
  return "other";
}

/** A count per member of a small closed set, always fully populated so a zero is stated. */
export type CountsBy<K extends string> = Readonly<Record<K, number>>;

export interface DecisionReadCoverage {
  /** Trace sessions the events came from — the denominator for "this box's history". */
  readonly sessions: number;
  /** Every read event seen, decision or not. The honest denominator for the share below. */
  readonly visits: number;

  /** Reads whose node id resolves to a decision. */
  readonly decisionVisits: number;
  /** Those reads by RECORDER. Never summed into one "reads" figure — see {@link DecisionReadRoute}. */
  readonly decisionVisitsByRoute: CountsBy<DecisionReadRoute>;
  /** Those reads by the SPELLING the id used. */
  readonly decisionVisitsBySpelling: CountsBy<DecisionIdSpelling>;
  /** Distinct decisions reached by any route. */
  readonly distinctDecisionsRead: number;

  /** Candidate sets (one per offering render) seen. */
  readonly candidateSets: number;
  /** Every offered id across them, decision or not. */
  readonly offeredIds: number;
  /** Offered ids that resolve to a decision. */
  readonly offeredDecisionIds: number;
  /** Those offers by the SPELLING the id used. */
  readonly offeredDecisionsBySpelling: CountsBy<DecisionIdSpelling>;
  /**
   * Decision offers no CLI read shape could ever record a follow for — the decision-shaped slice of
   * `computeOfferObservability`'s `unobservable` population, classified by the real machinery.
   *
   * A DENOMINATOR, never a defect count: ADR-0312 settled that this gap is measured rather than
   * closed, because making these offers followable would render every unanswered one as a declined
   * branch. See the header.
   */
  readonly offeredDecisionsUnobservable: number;
  /** Distinct decisions offered. */
  readonly distinctDecisionsOffered: number;

  /**
   * THE ACCEPTANCE CONDITION, as two numbers that must differ before anyone trusts a ratio.
   *
   * `joinableOnRawId` counts offered decision ids that appear VERBATIM as some read's node id.
   * `joinableOnDecisionNumber` counts offered decision ids whose DECISION was read under any
   * spelling. The gap between them is exactly what a raw-string join throws away, and it is reported
   * rather than silently repaired because a baseline that computed the first number and called it
   * offer-to-follow would be wrong without ever looking wrong.
   */
  readonly joinableOnRawId: number;
  readonly joinableOnDecisionNumber: number;

  /**
   * THE SAME TWO FIGURES AGAINST THE LIVE READS ALONE, and the pair that actually predicts anything.
   *
   * The whole-record figures above are dominated by a population that CANNOT GROW: the three
   * historical file shapes mint `doc:decisions/…`, which matches the offers' own spelling on the raw
   * string — and `docs/decisions/` was deleted whole on 2026-08-22 (ADR-0403 dec 1), so not one more
   * of them will ever be recorded. Every read from here on is a live `adr-NNNN`.
   *
   * So a healthy-looking whole-record join is a fact about history, and reading it as reassurance
   * gets the direction of travel exactly backwards: the raw-id join DECAYS toward the share of
   * offers that happen to be spelled `asset:`. These two figures are what a baseline must quote,
   * because they are the ones that describe the corpus a later trial will actually be measured in.
   */
  readonly joinableOnRawIdLiveReads: number;
  readonly joinableOnDecisionNumberLiveReads: number;

  /** `followed_edge` events seen. */
  readonly followedEdges: number;
  /** Those whose ANSWERING visit read a decision — the numerator offer-to-follow actually needs. */
  readonly followedEdgesToADecision: number;
}

function emptyCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
}

const SPELLINGS: readonly DecisionIdSpelling[] = ["row", "asset", "decisions", "docs/decisions"];
const ROUTES: readonly DecisionReadRoute[] = ["live-cli", "host-transcript", "other"];

/**
 * Summarise what a traversal record holds about decision reads and decision offers.
 *
 * TOTAL over untrusted input: the events come off disk, so a malformed or unfamiliar event is
 * skipped rather than thrown on. Every population is counted independently — nothing here derives
 * an expectation from the thing it is measuring, which is the fault class
 * (`an-expectation-derived-from-its-subject-cannot-fail`) that would make this report incapable of
 * reporting a defect: the set of "what counts as a decision" comes from `@storytree/library`, and
 * the two join figures are computed from the two sides SEPARATELY and then compared.
 */
export function summariseDecisionReadCoverage(
  events: readonly ContextTraversalEvent[],
  sessions: number,
): DecisionReadCoverage {
  const decisionVisitsByRoute = emptyCounts(ROUTES);
  const decisionVisitsBySpelling = emptyCounts(SPELLINGS);
  const offeredDecisionsBySpelling = emptyCounts(SPELLINGS);

  let visits = 0;
  let decisionVisits = 0;
  let candidateSets = 0;
  let offeredIds = 0;
  let offeredDecisionIds = 0;
  let offeredDecisionsUnobservable = 0;
  let followedEdges = 0;

  const decisionsRead = new Set<number>();
  const decisionsOffered = new Set<number>();
  /** Every node id under which SOME read was recorded — the raw-string join's right-hand side. */
  const readNodeIds = new Set<string>();
  /** The same two, restricted to the LIVE recorder — the only population that can still grow. */
  const decisionsReadLive = new Set<number>();
  const readNodeIdsLive = new Set<string>();
  /** Offered decision ids, kept with duplicates so the join reports OFFERS, not distinct pointers. */
  const offeredDecisionNodeIds: string[] = [];
  /** visitId → the decision that visit read, for attributing a followed edge to its target. */
  const decisionOfVisit = new Map<string, number>();
  const followTargets: string[] = [];

  for (const event of events) {
    if (isContextVisitEvent(event)) {
      visits += 1;
      readNodeIds.add(event.nodeId);
      const route = routeOfSurface(event.surfaceId);
      if (route === "live-cli") readNodeIdsLive.add(event.nodeId);
      const resolved = resolveDecisionId(event.nodeId);
      if (resolved !== null) {
        decisionVisits += 1;
        decisionVisitsByRoute[route] += 1;
        decisionVisitsBySpelling[resolved.spelling] += 1;
        decisionsRead.add(resolved.number);
        if (route === "live-cli") decisionsReadLive.add(resolved.number);
        decisionOfVisit.set(event.visitId, resolved.number);
      }
      continue;
    }

    if (event.kind === "candidate_set") {
      candidateSets += 1;
      for (const id of event.candidateNodeIds) {
        offeredIds += 1;
        const resolved = resolveDecisionId(id);
        if (resolved === null) continue;
        offeredDecisionIds += 1;
        offeredDecisionsBySpelling[resolved.spelling] += 1;
        decisionsOffered.add(resolved.number);
        offeredDecisionNodeIds.push(id);
        // The REAL machinery (it builds the follow argv and runs the actual allowlist), never a
        // restated prefix table: a local copy of the rule would agree with the renderer whatever the
        // renderer did, and this figure's whole value is that it can disagree.
        if (!classifyOfferObservability(id).observable) offeredDecisionsUnobservable += 1;
      }
      continue;
    }

    if (event.kind === "followed_edge") {
      followedEdges += 1;
      followTargets.push(event.toVisitId);
    }
  }

  let followedEdgesToADecision = 0;
  for (const toVisitId of followTargets) {
    if (decisionOfVisit.has(toVisitId)) followedEdgesToADecision += 1;
  }

  let joinableOnRawId = 0;
  let joinableOnDecisionNumber = 0;
  let joinableOnRawIdLiveReads = 0;
  let joinableOnDecisionNumberLiveReads = 0;
  for (const id of offeredDecisionNodeIds) {
    if (readNodeIds.has(id)) joinableOnRawId += 1;
    if (readNodeIdsLive.has(id)) joinableOnRawIdLiveReads += 1;
    const resolved = resolveDecisionId(id);
    if (resolved === null) continue;
    if (decisionsRead.has(resolved.number)) joinableOnDecisionNumber += 1;
    if (decisionsReadLive.has(resolved.number)) joinableOnDecisionNumberLiveReads += 1;
  }

  return {
    sessions,
    visits,
    decisionVisits,
    decisionVisitsByRoute,
    decisionVisitsBySpelling,
    distinctDecisionsRead: decisionsRead.size,
    candidateSets,
    offeredIds,
    offeredDecisionIds,
    offeredDecisionsBySpelling,
    offeredDecisionsUnobservable,
    distinctDecisionsOffered: decisionsOffered.size,
    joinableOnRawId,
    joinableOnDecisionNumber,
    joinableOnRawIdLiveReads,
    joinableOnDecisionNumberLiveReads,
    followedEdges,
    followedEdgesToADecision,
  };
}

/**
 * THE I/O BOUNDARY: read every trace session under `traceDir` and summarise them as one corpus.
 *
 * Merged rather than reported per session, because the join is a corpus-level question — an offer
 * made in one window and answered in another is still the corpus offering and the corpus reading. It
 * does mean this figure says nothing about any ONE session's behaviour, which is the same distinction
 * `classifyTraceIdentity` makes for the read counts and is why no per-session ratio is computed here.
 *
 * TOTAL: an unreadable directory yields an empty corpus rather than a throw, matching
 * `listTraversalSessions`, so a machine with no traces reports zeroes instead of failing. A zero from
 * this function is a machine with no history, and the render says which populations were empty.
 */
export function collectDecisionReadCoverage(args: { readonly traceDir: string }): DecisionReadCoverage {
  const summaries = listTraversalSessions({ dir: args.traceDir });
  const events: ContextTraversalEvent[] = [];
  for (const summary of summaries) {
    const { replay } = readTraversalSession({ dir: args.traceDir, sessionId: summary.sessionId });
    events.push(...replay.events);
  }
  return summariseDecisionReadCoverage(events, summaries.length);
}

function percent(part: number, whole: number): string {
  if (whole === 0) return "n/a";
  return `${((100 * part) / whole).toFixed(1)}%`;
}

function renderCounts<K extends string>(counts: CountsBy<K>): string {
  const entries = Object.entries(counts) as [K, number][];
  const present = entries.filter(([, n]) => n > 0);
  if (present.length === 0) return "none";
  return present.map(([key, n]) => `${key}=${n}`).join(", ");
}

/**
 * Render the coverage report — the section `probe:decision-reads` prints beneath its ingest.
 *
 * It states the join VERDICT in words rather than leaving two numbers side by side, because the
 * failure it exists to prevent is a reader taking the raw-id figure for the answer. Every claim it
 * makes is one the numbers above support; where it cannot size something it says so and names it.
 */
export function renderDecisionReadCoverage(coverage: DecisionReadCoverage): string {
  const lines: string[] = [];

  lines.push("WHAT THE TRAVERSAL RECORD HOLDS FOR DECISIONS — the local trace corpus, read back");
  lines.push(
    `${coverage.sessions} trace session(s), ${coverage.visits} read event(s), of which ` +
      `${coverage.decisionVisits} (${percent(coverage.decisionVisits, coverage.visits)}) named a ` +
      `decision, reaching ${coverage.distinctDecisionsRead} distinct decision(s)`,
  );
  lines.push(`  by recorder:  ${renderCounts(coverage.decisionVisitsByRoute)}`);
  lines.push(`  by id form:   ${renderCounts(coverage.decisionVisitsBySpelling)}`);
  lines.push(
    "  The two recorders are counted APART and must never be summed: a post-migration read can be " +
      "seen by both (the live observer as it runs, the transcript sweep afterwards) and they emit " +
      "separate events by construction.",
  );
  lines.push("");

  lines.push(
    `${coverage.candidateSets} candidate set(s) offered ${coverage.offeredIds} pointer(s), of which ` +
      `${coverage.offeredDecisionIds} (${percent(coverage.offeredDecisionIds, coverage.offeredIds)}) ` +
      `led into the decision log, naming ${coverage.distinctDecisionsOffered} distinct decision(s)`,
  );
  lines.push(`  by id form:   ${renderCounts(coverage.offeredDecisionsBySpelling)}`);
  lines.push("");

  lines.push("THE JOIN — offers and reads name the same decision differently, and it fails SILENTLY");
  lines.push(
    `  ${coverage.joinableOnRawId} of ${coverage.offeredDecisionIds} decision offer(s) ` +
      `(${percent(coverage.joinableOnRawId, coverage.offeredDecisionIds)}) match a recorded read on ` +
      "the RAW id string",
  );
  lines.push(
    `  ${coverage.joinableOnDecisionNumber} of ${coverage.offeredDecisionIds} ` +
      `(${percent(coverage.joinableOnDecisionNumber, coverage.offeredDecisionIds)}) match once both ` +
      "sides are resolved to a decision NUMBER (`resolveDecisionId`)",
  );
  if (coverage.joinableOnDecisionNumber > coverage.joinableOnRawId) {
    lines.push(
      `  → A RAW-ID JOIN LOSES ${coverage.joinableOnDecisionNumber - coverage.joinableOnRawId} ` +
        "PAIR(S) AND REPORTS NO ERROR. A live CLI read mints the artifact id `adr-NNNN`; an offer " +
        "written as `doc:decisions/NNNN-slug.md` passes through verbatim. Any consumer computing " +
        "reach or offer-to-follow MUST resolve both sides through `resolveDecisionId` first.",
    );
  } else {
    lines.push(
      "  → The two agree on this record. That is not a licence to join on the raw id: it means this " +
        "box has not yet recorded a pair spanning the two spellings, not that the spellings match.",
    );
  }
  lines.push("");
  lines.push("  AND THE SAME JOIN AGAINST THE LIVE READS ALONE — the forward-looking pair:");
  lines.push(
    `    raw id:          ${coverage.joinableOnRawIdLiveReads} of ${coverage.offeredDecisionIds} ` +
      `(${percent(coverage.joinableOnRawIdLiveReads, coverage.offeredDecisionIds)})`,
  );
  lines.push(
    `    decision number: ${coverage.joinableOnDecisionNumberLiveReads} of ${coverage.offeredDecisionIds} ` +
      `(${percent(coverage.joinableOnDecisionNumberLiveReads, coverage.offeredDecisionIds)})`,
  );
  lines.push(
    "    READ THESE, NOT THE PAIR ABOVE. The whole-record figures are carried by the three " +
      "HISTORICAL file shapes, which mint `doc:decisions/…` and therefore match the offers' own " +
      "spelling for free — and `docs/decisions/` was deleted whole on 2026-08-22, so that population " +
      "can never grow again. Every read from here on is a live `adr-NNNN`, so the raw-id join DECAYS " +
      "toward the share of offers spelled `asset:`. A healthy whole-record number is a fact about " +
      "history and says nothing about the corpus a later trial will be measured in.",
  );
  lines.push("");

  lines.push("OFFER-TO-FOLLOW FOR A DECISION — the denominator, not a defect count:");
  lines.push(
    `  ${coverage.followedEdges} followed-edge event(s) recorded, ${coverage.followedEdgesToADecision} ` +
      "of them answering an offer with a decision",
  );
  lines.push(
    `  ${coverage.offeredDecisionsUnobservable} of ${coverage.offeredDecisionIds} decision offer(s) ` +
      `(${percent(coverage.offeredDecisionsUnobservable, coverage.offeredDecisionIds)}) are ` +
      "UNOBSERVABLE — no CLI read shape records a follow for them, so no edge could ever land",
  );
  lines.push(
    "  So an offer-to-follow RATE computed FROM `followed_edge` must be taken over the OBSERVABLE " +
      "branches, never over the offered ones (ADR-0312's own rule), and a near-zero follow COUNT " +
      "here is a property of the instrument rather than evidence about what agents do.",
  );
  lines.push(
    "  ⚠ THAT RULE SCOPES THE `followed_edge` ROUTE ONLY, AND READ LITERALLY IT SHRINKS A " +
      "MEASUREMENT ~65x. There are TWO routes to offer-to-follow over the same offer population. " +
      "The second is THE READ RECORD — a recorded READ of the offered decision, in the same context " +
      "window, at or after the offer — which needs no `--from-offer` and so works for EVERY pointer " +
      "spelling. Measured by `-inc-02` over the same 3,351 decision offers: `followed_edge` sees 51 " +
      "of 3,351 observable (1.5%), 2 followed (3.9%); the read record sees 3,351 of 3,351 (100%), " +
      "156 followed (4.7%). For THIS question the read-record route SUPERSEDES the narrowing — " +
      "resting the figure on 51 offers is the larger error — so report BOTH: the useful part is " +
      "that they AGREE on shape. Full working: " +
      "`docs/research/decision-read-baseline-2026-08-23.md` (`pnpm probe:decision-baseline`).",
  );
  lines.push(
    "  Neither route changes what the figure above IS: it stays a DENOMINATOR, and both routes still " +
      "resolve both sides through `resolveDecisionId` before any comparison.",
  );
  lines.push(
    "  ⚠ NOT A WORKLIST ITEM. Making these offers followable is REFUSED, owner-directed since " +
      "2026-08-05: ADR-0312 amends ADR-0260 on exactly this point, and ADR-0260's body records that " +
      "its earlier \"closing it is a candidate increment\" expectation is WITHDRAWN. The gap is " +
      "measured rather than closed because closing it would make the surface LESS honest — " +
      "`isFollowableOfferId` gates the `unobservable` bucket, so every unanswered `doc:` offer would " +
      "start rendering as `not-followed`, a declined branch the session never declined.",
  );
  lines.push("");

  lines.push("WHAT THIS SECTION STILL CANNOT SEE:");
  lines.push(
    "  - `storytree adr pull <n>` is INVISIBLE to the live observer — `observeCliInvocation` has no " +
      "`adr` branch at all, so every verb in that area records nothing as it runs. The transcript " +
      "sweep DOES recover `adr pull`, so the read survives, but only until the next batch run and " +
      "only on a machine whose transcripts are present.",
  );
  lines.push(
    "  - `adr list` is a SEARCH over the log and names no single decision; both recorders decline it " +
      "on purpose, and minting a read per invocation would manufacture history.",
  );
  lines.push(
    "  - `adr push` / `adr new` are WRITES, and `library artifact adr-NNNN --set …` is a write " +
      "wearing a read's shape. None is a read and none is recorded as one.",
  );
  lines.push(
    "  - The STUDIO reads a decision straight out of the store with no CLI invocation and no host " +
      "tool call, so neither recorder can see it. UNSIZED — there is no reader-side telemetry to " +
      "count it with, which is a named hole and not an estimate.",
  );
  lines.push(
    "  - Everything the ingest above already declares: Codex runs, the primary checkout, shell reads " +
      "that do not name a path literally, non-tool reads. Those are its floors and they are this " +
      "section's floors too.",
  );
  lines.push(
    "  - And the standing limit: A READ COUNT IS NOT A SUFFICIENCY MEASURE. A model given " +
      "insufficient context answers confidently rather than abstaining, so no figure here says an " +
      "agent had what it needed — only that something was put in front of it.",
  );

  return lines.join("\n");
}
