---
status: accepted
decided: 2026-08-09
arc: session-cost-arc
amends: [288, 319]
load_bearing: true
---
# ADR-0329: A small unit is driven in-thread, not cut into a fresh session

## Status

accepted (2026-08-09) — decided/directed by the owner in conversation on 2026-08-09. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The owner observed sessions being cut for small things and named it as waste happening now. The
observation is the trigger; what follows is the mechanism, and it is narrower than "we cut too many
sessions".

**ADR-0288 D2 already prices a session** — ~90–120 min wall-clock per PR, of which the repo-wide gate
is 46–52%, plus a slot in the owner's picker and the attention to click it — and weighs that against
*what it costs to leave the thing undone*. That is a VALUE test with a session price as its reference
point, and it is the right test for the question it asks. **What nothing asks is how BIG the unit is.**
Two follow-ups whose cost-of-being-left-undone is identical are priced identically by D2 whether the
work is fifteen turns or two hundred. The small one is not cheaper to queue; it is *proportionally far
more expensive*, and D2 has no way to see that.

ADR-0319 D2b does not see it either. It splits the vehicle from the dispatch — drive it in-thread on a
fresh worktree, or cut a fresh session — and assigns the choice to "the session's own remaining context
headroom, plus ADR-0275 D2's hard ends". Headroom is a property of the SESSION. Size is a property of
the UNIT. So the unit's size is absent from both the queue-or-not decision and the vehicle decision,
which is the whole of the path a follow-up travels.

**The overhead is now measured rather than asserted** (`session-cost-arc`, `storytree session-cost`).
Across the two windows that arc's post-intervention re-measurement priced — 60 sessions of
2026-08-05 → 08-08 and the 10 that started after the interventions landed — the orientation phase, the
turns a session spends working out what to do before its first edit or build command, came to:

| window | orientation turns / session | orientation cost / session | share of session cost |
|--------|----------------------------:|---------------------------:|----------------------:|
| 60 sessions (pre) | 16.9 | $2.56 | 9.3% |
| 10 sessions (post) | 18.5 | $3.09 | 10.1% |

Stable across a 6× difference in population size. On top of it sits the eagerly-loaded preamble —
~85k tokens per ADR-0323 §1, re-read on every turn — which a fresh session pays as a cache WRITE on
its first turn and then as cache read forever after. (That 85k figure is ADR-0323's and has not been
re-verified since; `session-cost-arc`'s next increment re-measures it. Nothing in this ADR turns on
its exact value, only on orientation's, which is measured here.)

So a session's fixed overhead before any work happens is **roughly 17–18 turns and ~$2.60–3.10**.
**A unit whose expected work is under about twenty turns therefore spends more on orientation than on
the work.** Cutting a fresh session for it pays that overhead a second time, because the session
standing at the closing leg has already paid it — its orientation is spent, its worktree discipline is
known, its context is warm on exactly the surface the follow-up touches.

There is one more force, and it is why the remedy below is not "decline small things". ADR-0288 D5
gives a declined follow-up **no durable record by default**, deliberately, so that declining does not
rebuild the queue in another table. That is correct for work that should not exist. It is destructive
for work that is small and *valuable*: a size test that routes into D5 would quietly delete real work
whose only defect was being cheap to do. The size of a unit says nothing about whether it is worth
doing.

## Decision

**A unit's SIZE is a vehicle input, never a queue input.** It moves work between vehicles; it never
removes work.

**D1 — The vehicle choice gains a size test, beside the headroom test it already has.** ADR-0319 D2b
assigns the per-lane vehicle choice to the session on its own remaining context headroom. That input
stands and is joined by a second: **the unit's expected size against a session's measured fixed
overhead — ~17–18 orientation turns and ~$2.60–3.10 (Context).** A unit expected to be smaller than
its own orientation is a reason to DRIVE IT IN-THREAD, where that overhead is already spent, and a
reason NOT to cut a fresh session for it. This inverts the standing instinct: smallness has been read
as "cheap enough to hand off", and it is the opposite — smallness is what makes handing off expensive
relative to the work.

The in-thread vehicle keeps every mechanic it already has: the moment repo code is touched, a fresh
worktree on a fresh branch cut from freshly-fetched `origin/main` and re-declared claims at ADR-0270
grain — mechanical and mandatory, never judged (ADR-0275 D1 Axis 1).

**D2 — The size test may never produce a DECLINE.** It selects a vehicle. A unit that clears
ADR-0288 D2's bar is dispatched; if it is too small to be worth its own session it is driven here, and
if no in-thread vehicle is available it is chipped anyway. Routing a small-but-valuable follow-up into
a decline would send it through ADR-0288 D5's no-durable-record path and lose it, which is the one
outcome this ADR must not cause. **If you find yourself declining something because it is small, you
have used this rule backwards.**

**D3 — ADR-0319 D2b's one-lane-in-thread cap binds LARGE lanes, not small ones.** That cap exists for
a stated reason: taking parallel lanes serially in-thread re-creates the queue the arc unwinds, "a
serial chain wearing a different hat". The reason holds when each lane is large enough that
serialising costs real wall-clock. **It inverts below the overhead threshold.** Three fifteen-turn
riders taken in-thread cost ~45 turns of work against the ~51 turns of pure orientation three fresh
sessions would spend before starting — so the cap, applied there, buys the serialisation it was
written to prevent and pays a premium for it. Small lanes may therefore be taken together in-thread.
The cap is unchanged for anything at or above the threshold, and D4's fences still bound both.

**D4 — Scope fence, stated exactly.**

- **ADR-0288 D2's bar is untouched.** Whether a follow-up is worth doing at all is still its value
  against the cost of leaving it undone, and "I cannot name that cost" still puts it below the bar.
  This ADR never makes a below-the-bar item queueable because it is small.
- **ADR-0319 D2a's dispatch default is untouched.** An unblocked lane is still dispatched; D1 only
  chooses its vehicle.
- **ADR-0275 D2's hard ends are untouched, and they OUTRANK D1.** At a workstream fork, ~3
  continuations, degraded context or an owner-gated leg, the in-thread vehicle is off the table for
  that lane no matter how small it is — a small unit is not a licence to continue past a hard end.
  ADR-0288 D1's separation is what lets this compose: a hard end says this session must not carry the
  work, and this ADR only ever speaks to sessions that still may.
- **Silence stays forbidden (ADR-0288 D3).** The debrief already records which vehicle each dispatched
  lane got and why (ADR-0319 D5); a lane driven in-thread on size grounds says so in that line.
- **This is not a mandate to keep working.** ADR-0319 D5's fence — "the failure this ADR fixes is a
  lane left parked, never 'a session that kept working'" — binds here identically. A session with no
  headroom hands off a small lane and is right to.

**D5 — Falsifiable prediction and a revert rule.** Measured per fork-close, over the next window:

- **(a)** The owner does not observe sessions being cut for small things again. A repeat of the
  observation that triggered this ADR is a direct refutation — it is the only signal the owner raised.
- **(b)** No follow-up is declined *on size grounds*. D2 forbids it; a decline whose stated reason is
  the unit's smallness refutes D2's guard and means the rule is being read backwards. The remedy is to
  sharpen D2's wording, not to withdraw D1.
- **(c)** Sessions do not grow monotonically. If in-thread riders push median session length up such
  that context-rent growth exceeds the orientation saved, D1's threshold is too generous and should be
  lowered — this is measurable directly with `storytree session-cost`, and the arithmetic is the same
  one that produced the threshold.

If (a) fails, the size test is not the binding constraint and this ADR should be superseded rather
than tuned. If (c) fails, lower the threshold; do not remove the test.

**D6 — Where the rule lands, and both surfaces change together or the corpus contradicts itself.**
The same two artifacts ADR-0288 D6 and ADR-0319 D6 name, both **live-canonical** (ADR-0307 D1):

- `session-orchestrator` (kind `agent`) step 6(d) — the vehicle fork gains the size input and D2's
  never-a-decline guard.
- `merge-ceremony` (kind `process`) step 9(d) — the same addition beside the continue-or-inert fork,
  and its failure-mode list gains **"Cutting a fresh session for a unit smaller than its own
  orientation"** next to the existing "Declining a follow-up in SILENCE".

Edited with `storytree library artifact edit … --pg`, then regenerated with
`pnpm build:guidance && pnpm build:agents`; `pnpm gate`'s `check:guidance` / `check:agents` rungs fail
if an edit lands without them.

## Consequences

**Good.** The cheapest work stops being the most expensive to queue. A fifteen-turn follow-up on a
surface this session is already warm on gets done here for roughly its own size, instead of costing a
fresh induction plus seventeen turns of re-orientation to rediscover context that was live thirty
seconds earlier. It also removes a perverse incentive the previous rules created between them: under
ADR-0288 D2 alone, the way to make a small item "worth a session" was to grow its scope until it
justified one, which is the opposite of `asset:slow-growth-minimum-to-green`.

**Bad / the honest risks.** The obvious one is that D1 becomes a licence to keep working — a session
that drives rider after rider until its context is degraded, arriving at exactly the failure ADR-0275
D2's hard ends exist to prevent. D4 fences it and D5(c) measures it, but the fence is prose and the
measurement is after the fact, so this is a real exposure and it is accepted knowingly: the
alternative, leaving the vehicle choice blind to size, is the waste the owner is observing today.

Second, "expected size" is an ESTIMATE made before the work, and estimates of small units are
optimistic in a well-known direction. A unit judged fifteen turns and turning out to be a hundred has
been driven in-thread on a false premise. This is survivable rather than fixed: ADR-0275 D2's hard
ends still fire mid-unit on degraded context, so the failure mode is a session that hands off later
than ideal, not one that cannot hand off. Sessions should read the estimate as a threshold test —
*is this obviously smaller than orientation?* — rather than as a forecast to be precise about.

Third, D3 genuinely widens what one session may take in-thread, and it does so by carving an
exception into a rule (ADR-0319 D2b's cap) that was written against a measured pathology. The carve is
justified by arithmetic rather than by taste, and it is bounded by the same threshold as D1 — but if
D5(c) shows sessions lengthening, D3 is the first thing to withdraw, before D1.

**Neutral.** ADR-0288 and ADR-0319 both stay accepted and are AMENDED, not superseded: ADR-0288's bar
and ADR-0319's dispatch default are untouched, and only ADR-0319 D2b's vehicle-choice inputs and its
one-lane cap are qualified. Per ADR-0139 this ADR carries `amends: [288, 319]` so the amendment renders
beside each decision it qualifies and is pulled into the load-bearing set transitively.

**What this ADR explicitly does NOT do.** It does not lower ADR-0288's bar, does not weaken any of
ADR-0275 D2's four hard ends, does not make a chip harder to create, and does not touch what a session
PROVES. An increment that lowers session count by lowering evidence has missed the point of the owning
arc and should be reverted (ADR-0323 Consequences).

## References

- `session-cost-arc` — the owning arc; its post-intervention re-measurement is where the orientation
  figures in Context come from.
- ADR-0288 D2 / D5 — the value bar this ADR leaves alone, and the no-durable-record path D2 must not
  route small work into.
- ADR-0319 D2b / D5 — the vehicle fork this ADR adds an input to, and the one-lane cap D3 qualifies.
- ADR-0275 D1 Axis 1 / D2 — the mandatory fresh worktree, and the four hard ends that outrank D1.
- ADR-0323 — session cost is context rent; the preamble figure Context cites and the instrument D5
  measures with.
- ADR-0307 D1 — the agent tier is live-canonical; how D6's edits are applied.
- ADR-0139 — correct-in-place and the `amends` edge semantics used here.
- `asset:slow-growth-minimum-to-green` — the principle the removed incentive was working against.
- `asset:session-cutting` — the chip vehicle, unchanged.
