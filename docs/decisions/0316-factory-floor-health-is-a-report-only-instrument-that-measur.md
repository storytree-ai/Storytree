---
status: proposed
arc: factory-floor-health-arc
amends: [314]
---
# ADR-0316: Factory-floor health is a report-only instrument that measures distinct bottlenecks and refuses to report a ratio it cannot rate-normalise

## Status

proposed — 2026-08-06. The owner directed the ARC ("measuring factory floor health deserves its own
arc and discussion so please cut a fresh session to land the arc on that") but explicitly asked for
the discussion, so none of the decisions below were directed and under ADR-0110 this is `proposed`,
not `accepted`. D1–D4 are what a session would otherwise have to invent per increment; D5 is the
surface fork the owner asked to discuss, and it is deliberately deferred rather than answered here.

**Amends ADR-0314**, which stays current. Nothing ADR-0314 decided is reversed: its D7 factory-floor
health strip is still that surface's to build, and D7's distinct-bottleneck-never-volume rule is
carried forward verbatim by D3 rather than restated as new. What the edge records is that D7 is no
longer wholly self-describing — a reader of it alone would take `arc-orientation-surface-arc` to own
factory-floor health end to end, whereas the INSTRUMENT that computes the signal D7 renders now sits
on `factory-floor-health-arc` under D1–D4. Because this ADR is `proposed`, the edge renders on
ADR-0314 as a status-labelled back-edge (*amended by 0316 (proposed)*) and pulls nothing into the
load-bearing set until the owner ratifies.

## Context

The factory has no instrument that can answer "is the factory getting better?". Every attempt has
cost a full session of hand-run archaeology, so the answers are un-reproducible, un-watched, and
stale the day after. Three attempts are on record and each failed differently — and the three
failures, not the ambition, are what this ADR is about.

**A signal with no reader.** `friction-adjudication` names recurrence extinction as the standing
success signal every adjudicator must watch and as the tripwire for the loop producing bloat instead
of learning. Nothing computes it: `friction list` prints a raw reinforcement count, which cannot
discriminate evidence gathered BEFORE an item was routed from recurrence AFTER it, and only the
second is the signal. It has been firing unobserved — `sdk-leaf-drops-contract-id-test-names` was
routed `guardrail` on 2026-07-11 and reinforced eight times afterwards, latest 07-28.

**A measurement that proves nothing at the wrong sample.** `session-decoupling-arc`'s close condition
two requires its re-sync ratio be measured at a dispatch rate comparable to 2026-08-03 (~40+ sessions,
~34 landings/day) and states that a lower-dispatch measurement proves nothing, because the whole
claim is that interference is superlinear in concurrency. The daily series across 2026-08-01..06 runs
0.40 / 0.39 / 0.89 / 0.27 / 0.33 / 0.56 — a quiet day is indistinguishable from a fixed one on the
ratio alone. `session-decoupling-arc-inc-22` had to open with a hand-written warning telling readers
not to count itself as the test. A number that needs a prose warning attached is a defect in the
number.

**Two metrics that counted the wrong noun.** The closed
`factory-self-load-tune-the-guidance-loop-back-to-evidence-arc` closed on two figures — agent-started
session share, and machinery-friction share — and both COUNTED FILINGS. A hundred reports of one
bottleneck score identically to a hundred reports of a hundred, so the metric tracks how loud the
factory is rather than how well it works. The evidence: 268 items against 360 filings, 19% of items
reinforced at all, 7 of the 10 most-reinforced landing on one coupling channel, and six sessions
filing one corpus-content defect as six new items.

The forces in play are in tension. A health metric wants to be watched, which argues for wiring it
somewhere that runs on its own. But ADR-0311 retired sixteen gate rungs on 2026-08-06 for lack of
evidence, and `gate-machinery-audit-arc` closed on that finding the same day — so the standing
posture is delete-by-default, re-add on evidence. And a health metric that blocks a merge converts a
measurement into a tax on whoever happens to be landing when it drifts, which is how a measurement
becomes something sessions route around rather than read.

## Decision

**D1 — REPORT-ONLY.** Factory-floor health ships as a verb a session, a librarian pass, or the owner
RUNS. It is not a gate rung, it does not block a merge, and it has no threshold that reds anything.
This reads ACROSS from ADR-0311 rather than quoting a general rule from it: that ADR's Decision is a
retrospective disposition of twenty-five existing rungs, and its one forward-looking clause (D5) is
scoped to RE-ADDING a retired check — requiring new production-catch evidence plus an ADR explaining
why recurring merge cost is now justified. This instrument could not clear a bar of that shape even in
principle, because a health trend by construction reports a direction rather than a defect — there is
no threshold whose breach identifies a specific wrong thing to fix. It also matches
`first-class-edges-arc`'s end-state item 3, which ships its coverage report report-only for the
adjacent reason (a blocking version would red the repo against 398 files on day one).

**D2 — RATE-NORMALISE OR REFUSE, AND REFUSAL IS A FIRST-CLASS OUTPUT.** Every figure carries the
window and the sample it was computed over. Where a figure is rate-sensitive and the window's
dispatch rate is not comparable to the reference it is being read against, the command names the
condition that failed and DECLINES to render the figure as a trend, rather than printing a number
that reads as progress. A quiet week must not be able to look like a win. Figures that are
rate-normalised by construction — per-landing absorbed churn, channel-composition shares — are always
reportable. This is the single behaviour separating this instrument from the metrics it replaces, and
it is testable: feed it the 2026-08-06 window (25 merges/day against a 34-landing reference) and it
must refuse.

**D3 — DISTINCT BOTTLENECKS, NEVER VOLUME.** The rule is ADR-0314 D7's and is not new here: *"The
unit is the DISTINCT bottleneck and its recurrence rate, never filing volume"* — decided there against
this same `factory-self-load-…-arc` trap, for the strip that RENDERS the signal. What this ADR does is
carry that rule to the instrument that COMPUTES it, and add the audit half below. No figure this
instrument reports as a health measure may be a filing count, a session count, or any raw volume. Where it counts friction, it counts
un-discharged routed items collapsed by cause, and it STATES the collapsing rule in its own output —
a distinctness count whose rule is hidden is just a different unaudited number. Volume may appear as
clearly-labelled context. This binds every increment on `factory-floor-health-arc`, because volume is
the easiest thing to count and always produces a number.

**D4 — THE INSTRUMENT MEASURES; IT DOES NOT ADJUDICATE.** It reports what is true and names the items
behind each figure. It does not re-route friction, does not discharge items, does not close arcs, and
does not decide what a signal MEANS. Whole-system friction adjudication stays with the
graduation-synthesist (ADR-0168 D5), each arc keeps its own close condition, and anything either
escalates goes to the owner. An instrument that adjudicates is out of scope; an instrument nobody can
act on is a failure of the arc.

**D5 — THE STUDIO PANEL IS ALREADY DECIDED AND IS THIS ARC'S CONSUMER; ONLY THE CRON REPORT IS
DEFERRED.** An earlier draft of this ADR deferred three candidate escalations — a gate rung, a
scheduled/cron report, and a studio panel — behind this arc's falsifier. That was wrong on the third,
and the correction is the substance of D5.

ADR-0314 D7 is accepted and owner-directed (2026-08-04): the arc surface carries a factory-floor
health strip that *"goes loud when a shared bottleneck recurs"*, parked on
`arc-orientation-surface-arc` as `factory-floor-health-signal`. A falsifier on THIS arc cannot gate a
surface an accepted ADR already directed — that would be a session overriding an owner decision by
sequencing. So the panel is not deferred, not this arc's to gate, and not this arc's to build. It is
named here as the instrument's first committed CONSUMER.

**AND THAT INVERTS THE DEPENDENCY, WHICH IS THE POINT WORTH RECORDING.** The
`factory-floor-health-signal` entry states that *"the signal already exists in the data — this is a
rendering and thresholding job, not new instrumentation"*, and then one paragraph later fixes the unit
as *"the DISTINCT bottleneck and its recurrence rate"*, never filing volume. Both cannot hold. What
exists in the data today is the raw reinforcement count — precisely the volume figure that entry, D3,
and ADR-0314 D7 all forbid. The distinct-bottleneck-and-recurrence-rate unit it mandates is computed
by nothing: recurrence-since-route needs the `events.library_event` route-timestamp join, and
distinctness needs a stated collapsing rule. So D7's strip is not merely served by this arc — it is
currently **unbuildable without it**, and a session that builds the strip on the "no new
instrumentation" reading will ship the volume metric its own entry forbids, on a screen, where it is
harder to argue with. That prose is overtaken and is corrected in place on the entry (ADR-0139).

**What remains genuinely open is one thing: a scheduled/cron report** — whether health is PUSHED on a
cadence or only PULLED by a session, a librarian pass, or the owner. D1 already answers the gate rung
(no). The cron question stays deferred behind the falsifier below, because it is the one escalation
with no evidence either way and no owner direction.

## Consequences

**Good.** The instrument cannot manufacture a false confirmation of the kind
`session-decoupling-arc-inc-22` had to warn about in prose, because refusal is built into it. The
ancestor arc's filing-count error cannot be reproduced by accident, because D3 forbids the shape
rather than the two specific metrics. Report-only means the instrument can ship, be wrong, and be
corrected without ever having blocked a landing — which is the posture that lets it be built at all
under ADR-0311's delete-by-default stance. And D4 keeps a measurement surface from quietly becoming a
second adjudicator competing with the graduation-synthesist.

**Bad, and accepted.** Report-only means nothing forces anyone to look. D7's strip mitigates that but
does not close it, and the distinction matters for how the arc is falsified: a figure being RENDERED
is not the same as a figure being CONSUMED. The falsifier therefore tests whether any output CHANGED A
DECISION — an arc closed or held open, an item re-routed, a guardrail re-examined, an owner action
taken off the strip — rather than whether the verb was merely invoked, which D7 would satisfy
trivially and vacuously. D2 means
the command will sometimes answer "I cannot tell you", which is less satisfying than a number and
will feel like a defect to a session that wants a figure; that is the intended trade, since the
alternative is the number that misled. D3 makes the friction figure more expensive to compute than a
count, and the collapsing rule will be arguable — mitigated by requiring the rule be printed, so the
argument is about something visible.

**Not decided here.** Whether the three questions live behind one verb or several; the exact command
surface; the collapsing rule for distinctness; and whether health is pushed on a cadence (D5's one
remaining open escalation). Those are increment-level or owner-level calls.

**Sequencing consequence.** Because D7's strip cannot render the unit it mandates until this arc's
instrument exists, `factory-floor-health-arc` sits on `arc-orientation-surface-arc`'s critical path —
not the reverse. The owner picked the momentum-lanes layout on 2026-08-05, so that arc's build is
otherwise unblocked; a session reaching `factory-floor-health-signal` before this instrument lands
should build the strip's frame and leave the figure unwired rather than substitute a volume count.

**Not a concurrency cap.** Measuring dispatch rate is required by D2. Throttling it is the option the
owner rejected on 2026-08-04 on the ground that the system was divided into story nodes precisely so
work could run in parallel. An instrument reports; it does not gate dispatch.

## References

- `factory-floor-health-arc` — the arc this ADR is chartered under, and its three parked entries.
- **ADR-0168** — session-retro friction; D5 seats whole-system adjudication with the
  graduation-synthesist, the boundary D4 respects. Its `friction-adjudication` process names
  recurrence extinction as the standing success signal, which the arc's first parked entry
  (`recurrence-extinction-instrument`) mechanises. ADR-0311 amends ADR-0168, but only its claim that a
  named check must be a gate rung — the D5 seat is untouched and current.
- **ADR-0311** — retired sixteen gate rungs for lack of evidence; the precedent D1 follows.
- **ADR-0110** — design-time alignment is ratification; why this ADR is `proposed`.
- **ADR-0314** — **amended by this ADR.** Its D7 decided the factory-floor health strip
  (owner-directed 2026-08-04) and stated the distinct-bottleneck-never-volume rule D3 carries to the
  instrument; `arc-orientation-surface-arc` holds the parked `factory-floor-health-signal` entry. D7
  stays current, but a reader of D7 alone would take that arc to own factory-floor health end to end,
  and the COMPUTATION moves here — which is what the `amends` edge records.
- **ADR-0310** (`proposed`, not ratified) / `first-class-edges-arc` — end-state item 1 (a read verb
  over `events.claim_event`) and item 3 (the file→capability coverage report) are dependencies this
  arc consumes, never duplicates. What is depended on is the ARC's live end-state, which stands on its
  own; nothing here may assume ADR-0310's own D4 owner-fork is settled.
- `session-decoupling-arc` — its close-condition-two clause is the source of D2's constraint;
  increment 22 records the hand measurement this arc's second entry mechanises.
- `the-recurrence-extinction-success-signal-has-no-instrument` — the live routed friction item parked
  as `recurrence-extinction-instrument`.
