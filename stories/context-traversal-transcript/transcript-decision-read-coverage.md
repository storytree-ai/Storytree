---
id: "transcript-decision-read-coverage"
tier: capability
story: context-traversal-transcript
arc: linked-session-context-arc
title: "The traversal record is read back, and it reports what it can and cannot see of a decision read"
outcome: "The traversal record's own account of decision reads is reported back — the two recorders counted apart, the decision offers no read shape could ever record a follow for sized as a denominator, and the raw-id join printed beside the resolved one so a ratio that silently drops a spelling cannot pass for a measurement."
status: mapped
proof_mode: integration-test
depends_on: [transcript-decision-read-extraction]
decisions: [260, 312, 403]
# WHY ADR-0419 IS ABSENT THOUGH THE MODULE HEADER AND THIS CAPABILITY'S OWN INCREMENT BOTH NAME IT.
# Deliberate, and the reason is not merely that it is `superseded` (by ADR-0431, 2026-08-23).
# THE RULE, settled on `linked-session-context-arc-inc-28`: a decision is cited when a contract below
# ASSERTS A CLAUSE OF IT — reverse the decision and a contract here has to change — never because the
# unit was BUILT during the work that decision prompted. ADR-0419 decided what a decision's SUPPORT
# EDGE is: `amends` versus `dependsOn`, and the in-place annotation obligation. This module holds no
# opinion about edges and reads none; it counts reads and offers in a traversal record. Not one
# contract below moves if ADR-0419 is reversed — and ADR-0431 duly reversed most of it without
# touching a line of this module. What the header names is PROVENANCE (the module was built to
# measure something ADR-0419 wanted known, under `decision-read-measurement-arc-inc-01`), which is
# ancestry rather than obligation. Do not add it to make the spec agree with the header, and do not
# cite it as binding anywhere: a superseded decision can be argued from, never leaned on.
#
# WHY 403, 312 AND 260 DO QUALIFY, each on a named contract:
#   - ADR-0403 dec 1 made a decision an ORDINARY Library row, so a live read mints the bare `adr-NNNN`
#     ARTIFACT ID and `docs/decisions/` was deleted whole. Contracts 1-3 assert that the `row`
#     spelling resolves and that `parseDecisionPointer` alone refuses it; contract 18 asserts the
#     forward-looking pair whose entire reason is that the historical population can never grow again.
#     Reverse dec 1 and all four are wrong.
#   - ADR-0312 settled that the `doc:` blind spot is MEASURED, not closed, and that a rate computed
#     from `followed_edge` is reported over the OBSERVABLE branches. Contracts 9 and 10 assert both
#     sentences as literal render text.
#   - ADR-0260 D3 is what makes the `followed_edge` route narrow: an answering invocation carries
#     `--from-offer`, never a recency join, and `renderOfferFollowUps` prints no followable line for a
#     scheme-prefixed id. That is precisely the population contract 8 sizes through the real
#     classifier and contract 10 qualifies. Reverse D3 and the unobservable figure is a different
#     number.
#
# WHY ADR-0248 IS ABSENT, checked against the contracts rather than against the sibling pattern (as
# `linked-session-context-arc-inc-34` asked). Its one clause live for this package is the
# window-identity finding in D1. This module never reads, writes or counts `windowId` — it keys on
# `nodeId`, `surfaceId` and `visitId` and nothing else — so no contract below could go red on it.
# ADR-0235 and ADR-0241 are absent on the same test: this module writes no event and is not on the
# capture path, so clause 6's no-content rule and D3's never-fail-the-CLI-closed rule are asserted by
# nothing here. Contract 17's never-throw is a READ-side fail-open of this module's own choosing,
# not an instance of D3.
#
# DELIVERED AND GREEN, BUT NOT SPINE-PROVEN — read this before treating the unit as adoptable.
# `packages/context-traversal-transcript/src/decision-read-coverage.ts` and its 20-case companion
# suite exist at HEAD and pass under `pnpm --filter @storytree/context-traversal-transcript test`.
# They were landed by an ORDINARY hand-authored commit (98ecc9b6, under
# `decision-read-measurement-arc-inc-01`), NOT by a `--real` build. The planned red was therefore
# never observed by storytree's spine and NO SIGNED VERDICT BACKS THIS CAPABILITY. `status: mapped`
# records exactly that; `proposed` would falsely advertise a greenfield unit the spine is expected to
# drive.
#
# THERE IS DELIBERATELY NO `real:` ARM (ADR-0094), on the same ground as both siblings: registering
# one would invite a net-new `--real` drive against files that already exist, whose CONFIRM_RED could
# only be manufactured — the theater ADR-0085 bans and ADR-0097 §2 re-affirms. The spec-borne
# `proof.command` below is the observing command; adoption OBSERVES it green (ADR-0085's brownfield
# route) rather than re-driving it.
#
# WHY `transcript-decision-read-extraction` IS A REAL EDGE AND NOT PADDING. This module imports
# `DECISION_READ_SURFACES` from `./decision-reads.js` and builds its host-transcript route set out of
# it, so contract 7 — which names every host-transcript surface and asserts an unknown one is `other`
# — goes red the moment that sibling adds or renames a surface without this route map following. The
# edge is carried by the runtime import AND by the proof surface, which is why it is declared.
# The occupancy siblings are NOT edges here: nothing in this module or its suite touches them.
#
# This capability was MINTED, not built, by `linked-session-context-arc-inc-34`. No contract below
# invents an obligation: each states what a SHIPPED test already asserts.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-transcript", "test"]
  scope:
    testGlobs: ["packages/context-traversal-transcript/src/decision-read-coverage.test.ts"]
    sourceGlobs: ["packages/context-traversal-transcript/src/decision-read-coverage.ts"]
---

# The traversal record is read back, and it reports what it can and cannot see of a decision read

**Outcome —** The traversal record's own account of decision reads is reported back — the two
recorders counted apart, the decision offers no read shape could ever record a follow for sized as a
denominator, and the raw-id join printed beside the resolved one so a ratio that silently drops a
spelling cannot pass for a measurement.

## Guidance

**What this capability owns.** `packages/context-traversal-transcript/src/decision-read-coverage.ts`
— the read-back report and the single id reconciliation it rests on. It is the third member of this
story's decision-read trio and the only one that WRITES NOTHING. Its siblings move reads in one
direction: `transcript-decision-read-extraction` RECOVERS them out of host transcripts, and
`transcript-decision-read-ingest` WRITES them to disk idempotently. This one runs the other way — it
reads the durable record BACK through the capture package's own sink and reports what is and is not
observable in it. That asymmetry is the whole reason it is its own capability rather than a corner of
`-ingest`: filing a measurement instrument under a write organ would make that capability's stated
outcome untrue, and widening that outcome to cover both would need a conjunction, which is the
splitting rule's own trigger.

**The join is the point, and it fails silently.** Offer-to-follow is a join between two populations
that name the same decision differently. The OFFER side records `offerIdOf(ref)`, so an
`asset:adr-0419` reference is printed with the scheme stripped and a `doc:decisions/0022-….md`
reference passes through verbatim. The READ side records whatever route reached the decision: the
live CLI observer mints the bare artifact id `adr-0022` (a decision is an ordinary Library row since
ADR-0403 dec 1), while the three historical file shapes mint `doc:decisions/…`. So the same decision
carries two ids, and a join on the RAW STRING drops every pair that spans them. It does not throw and
it does not read as empty: it computes a plausible, confident, wrong ratio. `resolveDecisionId` is the
single reconciliation point, and both figures are reported side by side rather than the defect being
silently repaired — because a baseline that computed the raw one and called it offer-to-follow would
be wrong without ever looking wrong.

**The spellings are deliberately NOT unified at write time**, and this module must never be
"simplified" into doing so. `decision-reads.ts` states the reason: rewriting historical ids would
break the idempotence the ingest rests on. They are reconciled HERE, at READ time. An inconsistent
spelling is itself the finding, so the report keeps the spelling that named each id rather than
normalising it away — a reader who only ever saw the resolved number could not tell that one of the
spellings had stopped joining.

**The unobservable count is a DENOMINATOR and never a defect count.** ADR-0312 amends ADR-0260 on
exactly this point, owner-directed: the `doc:` blind spot is measured, not closed, and the reason is
not scheduling. `isFollowableOfferId` gates the `unobservable` bucket, so the moment such an offer
became followable every unanswered one would render as `not-followed` — a DECLINED BRANCH the session
never declined — for every agent that goes on reading the decision as a file. The figure is computed
by `classifyOfferObservability`, the REAL machinery that builds the argv a follow would use and runs
it through the actual allowlist, never by restating a prefix table here. That matters more than it
looks: a second copy of the rule would agree with the renderer whatever the renderer did, and the
whole value of this figure is that it can disagree.

**Two routes reach offer-to-follow, and reporting only the narrow one shrinks the measurement ~65x.**
ADR-0312's rule correctly scopes the `followed_edge` route, which needs `--from-offer` and therefore
only ever sees the observable slice. The other route is the READ RECORD — a recorded read of the
offered decision, in the same window, at or after the offer — which needs no flag and works for every
spelling. Measured over the same 3,351 decision offers: `followed_edge` saw 51 observable and 2
follows; the read record saw 3,351 and 156. The render names BOTH, and the useful part is that they
agree on shape (3.9% vs 4.7%) — stronger evidence that offers are noise than either figure alone.

**The forward-looking pair is the one a baseline must quote.** The whole-record raw join looks healthy
purely because the historical file shapes mint the offers' own spelling — a population that CANNOT
GROW, since `docs/decisions/` was deleted whole on 2026-08-22. Restricted to live reads the same offer
does not join on the raw id at all, so the raw-id join DECAYS toward the share of offers that happen
to be spelled `asset:`. Reading the whole-record figure as reassurance gets the direction of travel
exactly backwards.

**Every figure is a floor, and one limit outranks all of them.** The trace directory is one machine's,
so an absence here is an absence on this laptop and never a property of the corpus. And a READ COUNT
IS NOT A SUFFICIENCY MEASURE: a model given insufficient context answers confidently rather than
abstaining, so no ratio computed here says an agent had what it needed. The render carries that
sentence on every output, not only on the ingest above it.

**Fences that hold at HEAD.** `summariseDecisionReadCoverage` and `renderDecisionReadCoverage` are
PURE — no filesystem, no clock, no `process.env` — so every claim above is testable offline against
literal events. `collectDecisionReadCoverage` is the single I/O boundary, and it reads through the
capture package's sink rather than parsing JSONL again, on the same rule `ingest-decision-reads.ts`
follows: the sink is the only reader of its own format. It never throws on a missing directory. No
transcript or artifact CONTENT enters the report.

## Contracts

Each contract id below is the lead token of the `test(...)` title that proves it in
`packages/context-traversal-transcript/src/decision-read-coverage.test.ts`, per the house
`test("<contract-id>: <prose>")` convention.

1. **`all-four-id-spellings-resolve-to-one-decision-number`**
   - **asserts —** the four live id forms — the bare row id `adr-0022`, `asset:adr-0022`,
     `doc:decisions/0022-….md` and `doc:docs/decisions/0022-….md` — each resolve to
     `{ number: 22, spelling }` carrying their OWN spelling tag, so one decision is reachable under
     every form without the form being erased.
   - **falsifiability —** goes red against dropping any one of the four spellings, against resolving
     to a number while discarding the spelling (which would make an inconsistent spelling
     unreportable), and against either of the two live `doc:` prefixes being handled while the other
     is not — the parser trap that once silently reclassified 371 of 390 pointers as "not a decision".
2. **`the-row-spelling-is-refused-by-the-pointer-parser-alone`**
   - **asserts —** end to end through the summariser rather than through the resolver alone: a single
     LIVE read of the bare row id `adr-0419` yields `decisionVisits: 1`, `decisionVisitsBySpelling.row:
     1` and `decisionVisitsByRoute["live-cli"]: 1` — the row form is not a pointer at all, having no
     scheme to parse, so `parseDecisionPointer` correctly refuses it and only `resolveDecisionId`
     recovers it.
   - **falsifiability —** goes red against an implementation that leans on `parseDecisionPointer`
     alone, which would classify every post-ADR-0403 live read as "not a decision" and report a
     confident zero for the only population that can still grow. Because it asserts through the
     SUMMARISER, it also reds if the resolver keeps working while the summariser stops calling it, or
     if the row spelling is counted under some other tag — neither of which a direct resolver test
     would catch.
3. **`a-non-decision-id-resolves-to-null`**
   - **asserts —** a non-decision id is `null` — a research `doc:` path, an ordinary `asset:` artifact
     — and so is an `adr-`-prefixed id that is not four digits: both the legal artifact id
     `adr-health-notes` and the over-long `adr-04031`.
   - **falsifiability —** goes red against a loose prefix match on `adr-`, which is the collision
     `adrNumberOfArtifactId` exists to guard: it would mint decision reads out of ordinary artifacts
     and inflate every figure in the report.
4. **`a-raw-id-join-silently-loses-the-cross-spelling-pair`**
   - **asserts —** THE ACCEPTANCE CONDITION, in one case: a record that OFFERS
     `doc:decisions/0022-….md` and RECORDS the live read as `adr-0022` yields `offeredDecisionIds: 1`,
     `decisionVisits: 1`, `joinableOnRawId: 0` and `joinableOnDecisionNumber: 1` — and the two figures
     are asserted to be able to DIFFER, strictly.
   - **falsifiability —** goes red against a "fix" that quietly unified the id forms at write time,
     against a resolver that stopped recognising either spelling, and against any summariser that
     computes one figure from the other. The strict inequality is the load-bearing half: without it
     the report cannot report the defect it exists for.
5. **`the-raw-id-figure-is-not-vacuously-zero`**
   - **asserts —** the control for contract 4: a SAME-spelling pair joins on the raw id, giving
     `joinableOnRawId: 1` and `joinableOnDecisionNumber: 1`.
   - **falsifiability —** without this, contract 4's `joinableOnRawId: 0` is equally consistent with a
     summariser that never joins anything, and the finding would rest on a figure that cannot move.
     Goes red against a raw join that is broken outright rather than spelling-blind.
6. **`the-two-recorders-are-counted-apart-never-summed`**
   - **asserts —** one decision read by BOTH recorders — the live observer as the command ran, the
     transcript sweep recovering the same invocation afterwards — is `decisionVisits: 2` with
     `live-cli: 1` and `host-transcript: 1`, while `distinctDecisionsRead` stays 1.
   - **falsifiability —** goes red against summing the routes into one "reads" figure, which would
     double every post-migration read; against de-duplicating the two events into one, which would
     hide that the overlap exists at all; and against a `distinctDecisionsRead` counted per event
     rather than per decision.
7. **`every-host-transcript-surface-is-named-and-unknown-is-other`**
   - **asserts —** `routeOfSurface` maps the live library-artifact surface to `live-cli`, all four
     host-transcript surfaces (file-read, grep, shell, cli-read) to `host-transcript`, and both an
     unrecognised surface and `undefined` to `other`.
   - **falsifiability —** goes red the moment `transcript-decision-read-extraction` adds or renames a
     surface without this route map following — the reason that sibling is a declared edge — and
     against a default that silently files an unknown surface under either real route, which would
     attribute reads to a recorder that never made them.
8. **`the-unobservable-count-comes-from-the-real-classifier`**
   - **asserts —** over four offered ids of which three name a decision, `offeredDecisionsUnobservable`
     equals what `classifyOfferObservability` — the corpus's own machinery — answers for exactly those
     ids, and independently equals the literal 2 (the two `doc:`-spelled decision offers).
   - **falsifiability —** goes red against restating the follow-ability rule as a local prefix table:
     such a copy would agree with the renderer whatever the renderer did, and this figure's entire
     value is that it CAN disagree. The literal 2 is asserted beside the computed expectation so the
     test cannot pass by deriving its expectation from its own subject.
9. **`the-render-states-the-refusal-so-the-denominator-is-not-a-worklist`**
   - **asserts —** the rendered report carries `NOT A WORKLIST ITEM`, names `ADR-0312`, labels the
     population `UNOBSERVABLE`, and states that a rate is reported `over the OBSERVABLE branches`.
   - **falsifiability —** goes red against printing the size without the refusal, which would invite
     exactly the repair ADR-0312 refused — making the offers followable, and thereby rendering every
     unanswered one as a declined branch the session never declined.
10. **`the-render-names-both-offer-to-follow-routes`**
    - **asserts —** the render qualifies the narrowing rather than deleting it: it still carries
      `over the OBSERVABLE branches` and `computed FROM \`followed_edge\``, AND names the `READ RECORD`
      route beside it with both measured figures verbatim (`51 of 3,351 observable (1.5%), 2 followed
      (3.9%)` and `3,351 of 3,351 (100%), 156 followed (4.7%)`) and the research file that reproduces
      them. It also asserts the two settled points survive the qualification — `NOT A WORKLIST ITEM`,
      and the join clause matched TOGETHER with the sentence that carries it.
    - **falsifiability —** goes red against a render that states only the narrowing, which would steer
      the next measurement onto 1.5% of its own evidence; against deleting the ADR-0312 rule to make
      room for the wider route; and against dropping the provenance file. The join clause is
      deliberately matched as part of its carrying sentence rather than alone, because
      `resolveDecisionId` already appears in the join verdict further up — matched alone it would be
      satisfied by text this contract does not guard, which is the vacuous-green fault class.
11. **`a-followed-edge-counts-only-when-its-answering-visit-read-a-decision`**
    - **asserts —** over a record holding two followed edges — one answering a visit that read
      `adr-0022`, one answering a visit that read an ordinary artifact — `followedEdges: 2` and
      `followedEdgesToADecision: 1`.
    - **falsifiability —** goes red against counting every followed edge as a decision follow, which
      would supply offer-to-follow with a numerator that is not about decisions at all, and against
      attributing on the OFFER rather than on the answering visit's actual read.
12. **`a-followed-edge-with-no-answering-visit-fails-closed`**
    - **asserts —** a followed edge naming a visit this record does not hold counts as
      `followedEdges: 1` and `followedEdgesToADecision: 0`.
    - **falsifiability —** the record is incomplete by construction — a trace truncated mid-write, or
      an edge whose answering visit landed in another session's file. Goes red against any guess that
      resolves the dangling edge to a decision, and against dropping the edge from `followedEdges`
      entirely, which would hide the incompleteness rather than fail closed over it.
13. **`non-decision-offers-and-reads-touch-no-decision-figure`**
    - **asserts —** the populations are counted independently: two non-decision offers and one
      non-decision read give `offeredIds: 2`, `visits: 1`, and `offeredDecisionIds`, `decisionVisits`,
      `joinableOnRawId` and `joinableOnDecisionNumber` all 0.
    - **falsifiability —** goes red against any leakage from the general populations into the decision
      figures — the shape that would make every ratio in the report a function of ordinary traffic.
14. **`the-render-states-the-join-verdict-not-two-bare-numbers`**
    - **asserts —** on a record where the spellings span, the render states the VERDICT —
      `A RAW-ID JOIN LOSES 1 PAIR(S) AND REPORTS NO ERROR` — names `resolveDecisionId`, carries
      `A READ COUNT IS NOT A SUFFICIENCY MEASURE`, and NAMES the holes it has not sized (`STUDIO`,
      `adr pull`).
    - **falsifiability —** goes red against printing two numbers and leaving the reader to take them
      either way, against dropping the sufficiency limit (which rides on every render, not only on the
      ingest above it), and against a sized list that reads as the whole list because the unsized holes
      go unnamed.
15. **`agreement-is-not-a-licence-to-join-on-the-raw-id`**
    - **asserts —** when nothing in the record spans the spellings, the render does NOT emit the
      loss verdict, and DOES state that the agreement is `not a licence to join on the raw id`.
    - **falsifiability —** goes red against a render that stays silent when the two figures agree —
      silence there reads as endorsement — and against one that cries loss unconditionally. With
      contract 14 this pins the verdict from both sides.
16. **`an-empty-record-renders-zeroes-and-never-nan`**
    - **asserts —** an empty record summarises to zeroes and renders `n/a`, with `NaN` asserted ABSENT
      from the output.
    - **falsifiability —** goes red against dividing by a zero denominator anywhere in the report. The
      absence assertion is the carrying half: a percentage that renders `NaN%` is a number-shaped
      thing a reader can quote.
17. **`a-missing-trace-directory-is-an-empty-corpus-never-a-throw`**
    - **asserts —** `collectDecisionReadCoverage` over a directory that does not exist returns
      `sessions: 0`, `visits: 0` — an answer, not a crash.
    - **falsifiability —** goes red against throwing at the I/O boundary, which would make the report
      unusable on any machine that has never captured a trace, and against inventing a session row for
      a directory that is not there.
18. **`the-live-only-pair-removes-the-flattering-historical-half`**
    - **asserts —** over a record holding one offer and BOTH a historical read and a live read of the
      same decision: `joinableOnRawId: 1` (the whole record looks healthy),
      `joinableOnRawIdLiveReads: 0` (the number that predicts), and
      `joinableOnDecisionNumberLiveReads: 1`. The render carries `READ THESE, NOT THE PAIR ABOVE` and
      `DECAYS`.
    - **falsifiability —** goes red against reporting only the whole-record pair, which flatters the
      raw join with a population that can never grow again; against live-only figures fed by every
      route; and against a render that prints the forward-looking pair without saying which pair to
      read.
19. **`the-live-only-join-is-not-vacuously-zero`**
    - **asserts —** the control for contract 18: because `offerIdOf` strips `asset:`, an
      `asset:adr-0022` reference is OFFERED as `adr-0022` — byte-identical to what a live read mints —
      so `joinableOnRawIdLiveReads: 1` and `joinableOnDecisionNumberLiveReads: 1`.
    - **falsifiability —** without it, contract 18's live-only zero is consistent with a figure that
      can never be anything else. That `asset:`-spelled slice is the only part a raw join will still
      see once the historical half stops growing, so a figure blind to it would be permanently zero
      and permanently uninformative.
20. **`a-transcript-only-read-counts-for-neither-live-only-figure`**
    - **asserts —** a decision reached ONLY by the transcript sweep gives `joinableOnRawId: 1` and
      `joinableOnDecisionNumber: 1` on the whole record, while BOTH live-only figures stay 0.
    - **falsifiability —** goes red against live-only sets that are fed by any route and merely look
      right whenever the live observer happened to see the same decision — the flattering-by-history
      error contract 18 exists to remove, reintroduced one level down.

## Integration evidence

`packages/context-traversal-transcript/src/decision-read-coverage.test.ts` runs offline with no DB, no
API key and no model, under `pnpm --filter @storytree/context-traversal-transcript test`. Nineteen of
its twenty cases are PURE over hand-authored literal events; the twentieth exercises the single I/O
boundary against a directory that does not exist, which is the one filesystem behaviour worth pinning
here. There is no fixture corpus and no temporary directory, because there is nothing to write.

Every expectation is a hand-authored literal, never computed from the summariser under test — the
`an-expectation-derived-from-its-subject-cannot-fail` discipline. Contract 8 is the deliberate
exception that proves the rule: it compares against `classifyOfferObservability`, which is a DIFFERENT
module and the whole point of the assertion, and it pins the literal 2 beside that comparison so the
test still fails if both sides move together.

The assertions are written against the three ways this instrument fails while LOOKING finished: it
joins on the raw id and reports a confident, wrong ratio (contracts 4, 5, 18, 19, 20); it sums the two
recorders and doubles every post-migration read (contract 6); or it prints a denominator as though it
were a defect count and invites the repair ADR-0312 refused (contracts 9, 10). Each has a contract
above that goes red on it, and every one of the three is paired with a control so that no figure in
the report rests on a number that cannot move.

**No signed verdict backs this capability.** The suite is green and observed by the command above, but
it was never driven red→green by the spine (see the frontmatter note). Any adoption must OBSERVE the
command green under ADR-0085's brownfield route; it must not manufacture a red against files that
already exist.
