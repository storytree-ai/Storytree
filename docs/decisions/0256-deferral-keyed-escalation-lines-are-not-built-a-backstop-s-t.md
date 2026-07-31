---
status: accepted
decided: 2026-07-27
amends: [252]
arc: verification-integrity-arc
---
# ADR-0256: Deferral-keyed escalation lines are not built: a backstop's trigger must be observable in-run

## Status

accepted (2026-07-27) — **ratified by the owner in conversation** on 2026-07-27 ("accept ADR-0256"),
after being presented as `proposed` with the residual it makes permanent stated plainly. Owner
direction in conversation IS the ratification (ADR-0110); no second end-of-flow ask.

This settles a build-time fork ADR-0252 D1 left open and explicitly did NOT settle, taken here after
four increments carried it forward unchanged. Recorded as an ADR rather than in source because the
outcome is a decision NOT to build a chartered mechanism, and a "not built" that lives only in a source
comment reads as pending work to the next session — which is exactly what happened four times.

**What the owner ratified is the RESIDUAL, not merely the reasoning.** The consequence below is the
substance of the decision: a signal that merely sits unexamined now escalates nothing, permanently and
by choice, and the obligation to cut the deep pass rests on judgment rather than on machinery for every
class except a blind instrument. That is an owner-level acceptance because it is the owner who carries
it, which is why this was not flipped green by the session that wrote it.

The `amends: [252]` edge is **strictly additive** and now binds: this takes a fork ADR-0252's
*"Not decided here"* section explicitly declined to take, and reverses nothing ADR-0252 decided —
D1's two unbuilt escalation lines move, and nothing else.

## Context

ADR-0252 D1 charters a **warn-escalation backstop**, and states precisely why it must exist: the
expensive adversarial pass is judgment-gated at arc close, and *a judgment gate can decline
indefinitely*, so the continuous mechanical half must be able to force the question.

Exactly **one** escalation line is built: an instrument that FAILED TO RUN — the sweep went blind. It
reds the gate independently of D3's drain ceilings and is excluded from every count, so raising a
ceiling can never discharge it (`packages/cli/src/verification-decay.ts`).

D1 named two further candidate lines and left both unbuilt, stating the residual plainly: the skip risk
is covered *for the blind-instrument class only*, and **a signal that merely sits unexamined still
escalates nothing**. The two candidates:

1. **Age-keyed** — a signal escalates once it has been located for long enough.
2. **Decline-count-keyed** — a signal escalates after N arc-closes declined the deep pass.

D1 fixed two build-time constraints that any line must satisfy: **a line is a property of the SIGNAL and
never of the clock** (the owner rejected all three cadences offered — monthly-or-arc-close, monthly,
arc-close-unconditionally), and **escalating is not adjudicating** (an escalation asserts an obligation
to LOOK, never that a defect exists).

A third constraint is structural. `check:verification-decay` is **offline and read-only** — pure file
reads, no store, no network — which is why it runs identically local and in CI and never SKIPs for want
of a DB. Both candidate lines need persisted per-signal state the sweep deliberately does not have.
Findings already carry a stable `DecayFinding.id` so the ceiling can count them across runs, so the
identity a state store would key on already exists; the question was never the key.

This fork has now been carried forward unchanged across four increments (#955, #956, #963, #965). That
is itself evidence worth recording: the one mechanism designed to catch a signal sitting unexamined has
been the signal sitting unexamined.

## Decision

**Neither deferral-keyed line is built. The blind-instrument line stays the only one.** This is a
decision against, not a further deferral: the candidates are not expensive or awkward, they are
structurally incapable of being backstops.

**1. The deciding property is the DIRECTION of the record, not where the state lives.**

Every candidate storage location was weighed — a committed file in the repo, the live store, derivation
from git history — and the choice does not turn on any of them, which is why the fork could not be
settled by picking one. It turns on what the record *does*:

- A record written to **CLEAR** a condition is **fail-closed**: omit it and the gate stays red.
- A record written to **TRIGGER** a condition is **fail-OPEN**: omit it and the condition never fires.

Both candidates need a trigger-record, and in both cases the party who must write it is the party the
backstop fences.

- **Age** needs a persisted first-seen per finding id. Whoever maintains that record is the session the
  escalation exists to constrain, and a date is *data*, not an act with a name — unlike raising a
  ceiling, which is legible in a diff and whose reason belongs in the commit message (ADR-0252 D3).
  Never writing the first-seen, or resetting it, is invisible and silently disarms the line.
- **Decline-count** needs the decline recorded by the declining party. Nothing produces that record: an
  orchestrator judging the pass unwarranted at arc close is a judgment made in conversation, and a
  silent decline is indistinguishable from no arc close having happened. This is ADR-0249's shape
  exactly — *a cross-check against evidence of unknown provenance is not fail-closed*.

**2. Deriving age from git does not rescue it, and re-keying the clock does not either.**

The git history of a finding's LOCATION is not the age of the SIGNAL. A `stories/**` spec touched for an
unrelated reason resets the clock, so the cheapest way to clear the line becomes *touching the file* — a
drain-avoidance move both cheaper and less visible than the drain. And an age measured in COMMITS is
still a clock, merely scaled to activity instead of to the calendar: the "smuggle the rejected cadence
back under a slower name" that D1's own build-time rule fences.

**3. Contrast the line that works, which is why it works.**

A blind instrument is observed **by the sweep, about itself, in the same run**. Nothing has to be
recorded, remembered, or maintained; there is no input any party can omit. That is the whole reason it
is a backstop and the candidates are not.

**The general rule, stated so it can be reused:** *a fail-closed backstop's firing condition must be
observable in-run, from evidence the fenced party cannot silently omit.*

**4. The age line targets the wrong thing even where it could be built honestly.**

D3's ceiling already governs the STOCK. A signal sitting *within* its ceiling is one the ceiling has
judged tolerable in size. Forcing a ~1.2M-token adversarial pass because a tolerable signal is old
converts a size-governed backlog into an age-governed one — and D1's residual is not "a signal is old",
it is "the pass can be declined". The age line does not target the residual it is nominated to cover.

**5. What IS built instead**, because applying this reasoning to the existing line exposed a real gap in
it. Every instrument's facts come from a loader, and every instrument is subtractive — findings can only
come from facts — so a loader that enumerates nothing yields zero findings, which is indistinguishable
from a healthy repo. Three of the four loaders guarded that; `loadProofBindings` did not. Measured
against the real check by blinding each loader in turn:

- blinding a **guarded** loader → `ESCALATED — 1 signal(s) past the escalation line`, **exit 1**.
- blinding `loadProofBindings` → `WARN — 23 located signal(s), every instrument within its own drain
  ceiling`, `chartered coverage: 4/4 … are sweeping`, **exit 0** — with `contract-binding-drift` having
  read zero specs, its whole section absent from the report, and the located count going **down** (28 →
  23). A blind instrument made the repo look *cleaner*.

The guard is now one named rule (`requireObserved`) at all four sites rather than a convention repeated
three times and forgotten once. Its threshold is **parsed specs** — not spec FILES (files that all fail
to parse mean the instrument understood none of what it opened) and not BINDINGS (a corpus that parses
but declares no proof blocks was fully observed and has nothing to judge, so redding there would fire on
a healthy repo).

## Consequences

**Good.** The backstop keeps exactly one line, and that line is unforgeable by omission — there is no
state file to leave unwritten and no counter to leave unincremented. The fork stops re-presenting itself
as pending work to every session that reads the source. The reasoning generalises into a rule about
fail-closed conditions that the next backstop can be checked against. And the one blind spot inside the
existing line is closed, proven RED end-to-end against the real check rather than in a fixture.

**Bad, and accepted — this is the load-bearing consequence.** ADR-0252 D1's residual becomes
**permanent rather than pending**: the skip risk is covered for the blind-instrument class only, and a
signal that merely sits unexamined escalates nothing, now by decision rather than by deferral. **The
residual is therefore OWNER-FACING and not machine-closable.** The thing being declined is a judgment,
and no offline file-reading sweep can observe a judgment that was never made. D3's per-instrument
ceilings still impose a drain obligation on the SIZE of each backlog, which is real but is not the same
guarantee — a backlog can sit at its ceiling indefinitely without anything forcing the deep pass.

**What would change the answer**, stated so this is testable rather than final: an **in-run observable
that distinguishes examined from unexamined**, which the fenced party cannot suppress by doing nothing.
If adjudication ever leaves a machine-checkable residue the sweep can read — and that residue's ABSENCE
is what fires, rather than its presence — the age line becomes buildable as a *clear*-record and this
decision should be revisited. No such residue exists today.

**Not decided here.** Whether the ceilings themselves should ratchet down mechanically rather than by
norm; and whether the librarian friction drain needs a claim (the concurrent-drain gap, live and
separately open — still open at 2026-08-01: neither `packages/cli/src/friction-drain.ts` nor
`packages/cli/src/friction-lifecycle.ts` takes a claim,
and [ADR-0270](0270-the-claim-ledger-records-a-fiction-same-story-serialisation.md) routes it out
rather than settling it).

**Correction (2026-08-01, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
a third item in that list has been TAKEN, and is removed from it.** It read "whether the general rule in
decision 3 should be promoted to a durable `pattern` or `guardrail` — that is the `guidance-curator`'s
call". The promotion has landed. `pattern:backstop-trigger-must-be-observable-in-run` carries decision
3's sentence — *a fail-closed backstop's firing condition must be observable in the run itself, from
evidence the fenced party cannot silently omit* — and cites this ADR, both candidate lines, and the four
increments by number. It sits beside `pattern:fail-closed-conditions-never-share-a-measure` exactly as
this section anticipated, and neighbours it without duplicating: that one is about a shared MEASURE
letting one condition discharge another, this one about a trigger's PROVENANCE. **Nothing is
re-decided** — the `guidance-curator` made the call this section routed to them, which is this section
working rather than being overturned. Recorded because this ADR's own Context argues that a decision
recorded where it reads as pending gets carried forward unchanged by every session that reads it (four
times: #955, #956, #963, #965); an open *Not decided here* naming work that has since landed is that
same defect, on this ADR's own page.

## References

- ADR-0252 D1 — the warn-escalation backstop this settles the open half of; its "Not decided here"
  section names these two lines as unbuilt and states the residual.
- ADR-0249 — *unattributable evidence is not fail-closed*, the reasoning decision 1 reuses.
- ADR-0168 D4 — `check:friction-drain`, the drain-ceiling shape D3 mirrors and this is deliberately not.
- `packages/cli/src/verification-decay.ts` — the pure judge; `requireObserved`, `evaluateDecayCeiling`'s
  escalation exclusion, and the header's record of why there is one line.
- `packages/cli/src/check-verification-decay.ts` — the disk layer; the four fact loaders and the guard.
- `process:verification-decay-detection` — the deep pass an escalation demands, and the "gaming the D3
  ceiling" failure mode any new mechanism must not reopen.
- `arc:verification-integrity-arc` — the increment log carrying the current state of this work.
