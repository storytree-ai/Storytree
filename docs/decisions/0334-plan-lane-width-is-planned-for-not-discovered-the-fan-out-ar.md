---
status: accepted
decided: 2026-08-09
arc: parallel-session-dispatch-arc
supersedes: [333]
amends: [332]
load_bearing: true
---
# ADR-0334: Plan-lane width is planned for, not discovered; the fan-out arc reopens

## Status

accepted (2026-08-09) — the owner read ADR-0333's closure the same day it landed and rejected it,
naming the defect precisely: "There would be arcs that can be done via parallel lanes such as the UAT
rewrite one, i pictured this as a decision made when planing arcs as well as before implementing
them. I would of expected my defined exchange rate on wall clock and token cost would yield benefits
to some arcs." Re-opening a closed arc is owner-only, so this is that reversal recorded. Three checks
were run against ADR-0333 before accepting the objection; all three confirmed it. The economics are
NOT reopened — ADR-0332 D2/D3/D4 stand untouched, and this ADR does not re-measure them.

## Context

ADR-0333 answered ADR-0332 D5's re-open condition — *re-open if plan-lane width returns a median
above one* — by reading the `## Lanes` section of every anchored increment in the live store and
finding a median of one on all three readings. It then closed the arc.

The measurement was carefully executed and its numbers are not in dispute. What is in dispute is
whether that population could answer the question, and whether a median is the statistic the decision
turns on. It could not, and it is not.

## Decision

**D1 — THE POPULATION WAS ~10% OF THE WORK, AND SELECTED BY A MECHANISM CORRELATED WITH THE ANSWER.**
Of **564 increments** in the live store, **58 carry an anchor** — 10.3%, drawn from **11 arcs** out of
roughly fifty. The discriminator ADR-0333 D1 used is sound (an increment is anchored when it is
planned), but ADR-0183 D6 makes plans **never mandatory**, so "has an anchored plan" selects for
increments a session chose to route through the `planner` agent. That is not a random sample of the
factory's work.

The arc the owner named as the paradigm case, **`uat-journey-surgery-arc`, has ZERO anchored plans
across its 5 increments** — it never entered the population at all. Its shape is precisely the width
in question: per-story cleanups across 40 stories, each writing its own `stories/<name>/story.md`,
and two of its increments (#1169 `uat-detail-studio`, #1174 `studio-cloud`) **already landed as
separate single-story PRs**, which is independent lanes demonstrated in production rather than
declared on paper. A third did eleven stories in one pass. A measurement that excludes the clearest
positive case cannot settle the question it was asked.

**D2 — ADR-0333 D5's REBUTTAL OF ITS OWN CONFOUND IS FALSIFIED BY ADR-0332 D2.** ADR-0333 named the
endogeneity honestly ("the population is what the `planner` agent HAS produced, not what it COULD
produce under a brief that asked for width") and then dismissed it, arguing the confound "cuts the
wrong way" because two plans declined width they had already found. Read what those plans actually
said:

> "**Three small units do not repay the split.**" — `linked-session-context-plan-4`
> "the cost of **a second claim, worktree, and PR** exceeds the parallelism won."
> — `linked-session-context-plan-6`

Both price the **fresh-session** vehicle. ADR-0332 D2 measured that vehicle at **$2.56** and the
subagent at **$0.28** — a 9x ratio — and a subagent lane needs **no** second worktree, no second PR
and no second claim, because it runs inside the parent session's claim. The planner declined those
splits on a cost model that is nine times too high for the vehicle ADR-0332 makes the default. The
two quotes ADR-0333 leaned on hardest are therefore the **strongest evidence FOR the confound**, not
against it. Its rebuttal is self-undermining, and with it falls the reason the confound was accepted
rather than removed.

**D3 — A MEDIAN IS THE WRONG STATISTIC FOR AN OPT-IN RULE.** The primitive is never invoked on the
median plan; it is invoked where width exists. On **ADR-0333's own table**, width is not rare:

| reading | ≥2 lanes |
|---|---|
| Wmax — largest concurrent set anywhere | **23/58 (39.7%)** |
| W1 — dispatchable at once | 15/58 (25.9%) |
| Build1 — concurrent red→green code lanes | 10/58 (17.2%) |

Against ADR-0332 D3's break-even — **$0.83 per lane** for a three-lane subagent fan-out, about half a
node build — a quarter to two-fifths of plans clear the bar. ADR-0333 D4's concentration finding
(nine of ten multi-build-lane plans on three arcs) is an argument for **targeting** the primitive, not
for refusing it: it names where to point it.

**D4 — WIDTH IS A PLANNING-TIME DECISION, NOT A PROPERTY DISCOVERED AFTER THE FACT (owner-directed).**
This is the design correction and it is what the measurement inverted. The `planner` agent already
declares lanes (workflow step 3), but nothing asks it to **plan for** them — to decompose so that
independent lanes EXIST where the work allows, rather than to report whatever independence happened
to fall out of a decomposition authored for one consuming session. The planner's guidance is amended
so that step 3:

  (a) decomposes **for** independent lanes where the material allows, treating lane count as a
      design output rather than an observation;
  (b) prices any split it is considering at the **subagent** vehicle ($0.28, no second worktree /
      claim / PR) and names the vehicle explicitly whenever it declines one on cost — a decline
      priced at the fresh-session rate is now a stated error, per D2;
  (c) continues to name where lanes CONTEND, which ADR-0333 D6 showed is the real limit: the builds
      may be independent while the LANDINGS serialise on shared consolidation surfaces
      (`packages/cli/src/node-build.test.ts`, the story `capabilities:` append,
      `packages/cli/src/main.ts`). Sequencing landings while fanning builds stays the correct shape.

**D5 — THE EVIDENCE IS TAKEN FORWARD, NOT BACKWARD, AND 58 STALE PLANS ARE NOT RE-AUTHORED.**
ADR-0333 was right that re-authoring its population under a width-seeking brief would be exactly the
hypothetical-decomposition optimism the work forbade, and that the cost would invert the saving. So
the amended brief in D4 is the intervention, and the **next plans authored under it are the
evidence**. Nothing is built beyond the guidance change until that evidence exists. **Corrected in
place, 2026-08-10 (ADR-0139):** that is no longer the only evidence path.
[ADR-0340](0340-lane-width-is-real-and-gated-on-shared-registries-not-on-t.md) found a second,
retrospective one — landed git file sets, authored by no brief and available over the whole history
rather than an opt-in tenth of it — and read width directly from it without waiting on new plans. The
parked increment reading plans authored under this D4 brief is not made redundant by that reading; it
remains the only forward test of the intervention itself (ADR-0340 D5).

**D6 — THE ARC REOPENS, and ADR-0333's re-open condition is REPLACED, not merely met.** Its condition
("three or more arcs each holding two or more independent open increments at once, or a run of plans
in which the median W1 is two or more") is retired for the reason in D3: it is a median test on an
opt-in primitive, and it would have kept the arc closed while two-fifths of plans carried width. The
arc's falsifier is now: **plans authored under the D4 brief show no more independent lanes than plans
authored before it** — i.e. the intervention does not move the distribution. That is a test of the
intervention rather than of the old regime, which is what D1 established the previous number could
not be. **Corrected in place, 2026-08-10 (ADR-0139):** this falsifier is amended.
[ADR-0340](0340-lane-width-is-real-and-gated-on-shared-registries-not-on-t.md) D5 found a
declared-width-only test confounded — a width-seeking brief can raise a plan's stated lane count
whether or not anything can actually be dispatched, because shared registries can re-serialise the
landings regardless of what the plan declares. The falsifier now requires BOTH halves: declared width
rising **and** the resulting landings being file-disjoint on the same instrument ADR-0340 D1 built.

## Consequences

The economics never moved and must not be re-litigated. ADR-0332 D2 (onboarding: $2.56 session vs
$0.28 subagent, 9x), D3 (break-even lane size) and D4 (the straggler tax — 1.31x / 1.59x / 1.84x at
2 / 3 / 4 lanes, never Nx) are measured, stand, and are load-bearing on this arc. This ADR reverses a
reading of the population, nothing else.

ADR-0333's MEASUREMENT survives its supersession and is worth keeping browsable: the 58-plan read,
its three readings, the six re-plan families, the temporal split, and above all **D6's landing-serialisation
finding**, which is the most durable thing it produced and is carried forward verbatim into D4(c)
here. Superseding was chosen over an `amends` edge for one reason: ADR-0333's headline decision — and
its title — is "the arc closes", and that is now false. ADR-0139 requires an accepted ADR to be true
IN FULL, so an ADR whose title states a reversed decision cannot stay green with a footnote.

**Separately, this ADR carries `amends: [332]` (ADR-0139), and the two edges answer different
questions.** `supersedes: [333]` retires ADR-0333 from the current set. `amends: [332]` records that
ADR-0332 stays current but is no longer wholly self-describing: its D5 and Consequences had embedded
ADR-0333's now-superseded conclusion — "the arc is CLOSED", the "DISCHARGED" first half of the re-open
condition, and "the arc closed" as the stated reason the safety fence stayed unbuilt — as prose citing
ADR-0333 by name and number. Those three passages are corrected in place in ADR-0332 (this pass) to
point here instead. ADR-0332 D1–D4 and its own D5 backlog-reading refusal (the 17-open-increments
finding) are untouched; only the plan-lane-reading citation is repointed.

**Accepted knowingly: this ADR does not prove width exists.** It proves the previous measurement
could not settle the question — a 10% population, selected by a mechanism correlated with the answer,
excluding the clearest positive case, judged by a median on an opt-in rule. Those are different
claims and this one is weaker. The owner's judgement that some arcs decompose into parallel lanes
(the UAT rewrite being the named case) is what carries the reopening, and D6's falsifier is what will
test it. If plans authored under the D4 brief show no more width than those before it, the arc closes
again — and that closure will rest on evidence about the intervention rather than about the regime it
replaced.

**THE ARC'S `lifecycle` BIT COULD NOT BE FLIPPED, AND THAT IS A MECHANISM GAP, NOT A DECISION.**
D6 reopens the arc; the live doc still reads `closed`. There is no verb: `arc close` refuses when the
arc is already closed (`packages/cli/src/arc.ts:1303`) and `library artifact edit --set
lifecycle=active` is refused unconditionally for an arc (`packages/cli/src/commands.ts:850`), with no
flag, env var or owner path in either. A repo-wide search finds no `arc reopen` verb at all. So
ADR-0239 D2's "re-opening is OWNER-only" is aspirational prose — mechanically it is **nobody**-only
through the CLI, and the owner cannot exercise the authority the guard reserves for them. This was
NOT routed around: no direct store write was made to flip a bit the CLI refuses. The decision record
is the load-bearing artifact and it is correct — this ADR is `accepted` and supersedes ADR-0333 —
but until a verb exists, `arc list` will show this arc closed while its own accepted ADR says it is
open, and any reader querying arcs rather than ADRs will miss the reopening. Building the owner-gated
verb is the obvious repair and is deliberately NOT done here: it changes a governance gate, and doing
that to unblock the session that tripped it is the wrong reason.

Still not built, and still gated: the claim-blind write fence (ADR-0255/0284 — a write into a SIBLING
worktree is refused by nothing), and the owner's "previous attempts have overloaded the system", which
remains unpinned to a concrete failure mode. Both sit behind the D6 evidence, not beside it. Note that
the subagent vehicle D4(b) makes the default is the one that does NOT open a second worktree, so the
sibling-worktree hazard is not on the near path.

## References

- ADR-0340 — amends this ADR: D5's "the next plans are the evidence" is corrected in place above to
  name a second, retrospective evidence path (landed git file sets); D6's falsifier is corrected in
  place above to point at ADR-0340 D5's amendment, which requires delivered width alongside declared
  width.
- ADR-0333 — superseded here: the 58-plan measurement, whose numbers stand and whose closure does not.
- ADR-0332 — the arc's charter and its economics: the bar (D1), onboarding (D2), break-even (D3),
  the straggler tax (D4) — all untouched by this ADR. Amended here (Consequences): its D5 and
  Consequences prose citing ADR-0333's plan-lane conclusion is corrected in place to point here.
- ADR-0331 — fan-out refused for read-only sweeps; the harness runs one turn's spawn block concurrently,
  which is why D4's intervention needs no engine.
- ADR-0329 — a unit's SIZE is a vehicle input, and size may never produce a decline. D4(b) supplies the
  price that rule was being applied without.
- ADR-0183 D5/D6 — the plan tier and the fact that plans are never mandatory, which is D1's selection effect.
- `planner` (library agent) — the artifact amended by D4; regenerate the projections after editing.
- `uat-journey-surgery-arc` — the named paradigm case, absent from ADR-0333's population.
