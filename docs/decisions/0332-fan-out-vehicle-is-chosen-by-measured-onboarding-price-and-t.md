---
status: accepted
decided: 2026-08-09
arc: parallel-session-dispatch-arc
amends: [331]
load_bearing: true
---
# ADR-0332: Fan-out vehicle is chosen by measured onboarding price, and the binding constraint is width

## Status

accepted (2026-08-09) — the owner directed on 2026-08-09 that an orchestrator holding an arc should
fan it out rather than work it increment by increment, "where it is safe to do so", and set the
acceptance bar in their own words: "I'd say I was willing to spend 15-20% more tokens for decent
wall clock improvements", with token efficiency taking precedence over wall clock "but only by a
little". Design-time alignment IS ratification (ADR-0110), so the bar in D1 is born accepted rather
than proposed. D2–D5 are the measurement that bar demanded, taken the same day before anything was
built.

## Context

The owner's design has two vehicles with different economics, and the whole question turns on not
collapsing them: **(a) SUBAGENTS**, where the orchestrator dispatches N delegates itself, and
**(b) FRESH SESSIONS**, where it cuts N chips the owner approves and N top-level sessions run. The
owner's note on (b): "this is what typically happens, however it's only recently we have put in the
changes that may allow this to happen safely — previous attempts have overloaded the system."

Three neighbouring findings were already on the books and none of them answers this.
`parallel-red-green-arc` killed SPINE-INTERNAL batching in ONE SHARED WORKTREE (1.099x structural /
1.056x with variance); two of its three killers were shared-worktree artefacts — all 12 batch
refusals were for a custom `proofCommand` and ZERO for glob overlap — and its "13 story chains"
denominator counted the chain as the fan-out unit, excluding the 295 single-node `--real` runs that
are this arc's population. ADR-0331 refused a fan-out primitive for READ-ONLY SWEEPS because the
factory's spawns already overlap, and its scope fence explicitly excludes parallel builds.
ADR-0329 priced session orientation at ~17 turns / $2.56–3.09 and made a unit's size a vehicle
input. ADR-0330 found that delegation RE-PRICES rent rather than removing it, because every delegate
pays a fresh preamble at the cache-WRITE rate — 10x the read rate an orchestrator pays to re-read
its own context — which is why the owner's caching intuition cuts against delegation on tokens.

What nobody had done was price the two vehicles SIDE BY SIDE. ADR-0330's delegate floor (23k, rising
to 64k) suggested subagents onboard far cheaper than sessions, but a floor is a minimum and had
never been read against a session's on the same run.

## Decision

**D1 — THE BAR IS THE TEST, NOT A PREFERENCE.** A fan-out design that costs more than **20% extra
tokens FAILS regardless of the latency it wins**. A design inside the 15–20% band passes only if the
wall-clock win is real. The premium is measured against **the serial baseline the work would
otherwise have taken**, and that baseline is not always one session: where ADR-0275 D2's hard ends
already force a lane into its own session, the orientation is paid either way and fan-out's token
premium is **zero**. Naming which baseline a figure is against is part of meeting this bar.

**D2 — ONBOARDING IS MEASURED, AND THE SAVING IS NOT WHERE ADR-0330's FLOOR SUGGESTED.** One run of
the committed classifier (`packages/cli/src/session-cost.ts`), 60 sessions and 105 delegate
transcripts, span 2026-08-06 → 2026-08-09, both vehicles priced by the same `priceAxes` /
`attributePhases` / `contextTokens`:

| | fresh session | subagent |
|---|---|---|
| first-turn preamble (median) | 85k / $0.53 | **71k / $0.28** |
| orientation phase | 16.2 turns / **$2.56** | see caveat |
| whole life (mean) | 119.3 turns / $22.40 | 30.2 turns / $2.79 |

The **23k delegate floor is a minimum, not a typical cost**, and reading it as one overstates the
case for delegation by ~3x. It is driven entirely by cheap `Explore` delegates (25k median); the
typical delegate carries **71k**, only 16% under a session's 85k. **The preamble axis is not where
the saving is.** The saving is that a delegate is handed a task prompt and therefore skips the
ORIENTATION PHASE a session must pay — $2.56 against a $0.28 first-turn toll, a **9x ratio on
onboarding**. Subagents are therefore the DEFAULT vehicle for fan-out; fresh sessions are correct
only where a D2 hard end already forces one, which is exactly the case where the premium is zero.

CAVEAT, stated because the number invites misuse: the subagent "orientation phase" figure ($1.42,
16.3 turns) is **contaminated and is not used above**. `attributePhases` starts `build` at the first
edit or build command, and read-only delegates never edit, so their whole life is classified as
orientation. The first-turn preamble is the only measure with an identical definition on both sides,
which is why the 9x rests on it.

**D3 — THE BREAK-EVEN LANE SIZE, under D1's 20% ceiling.** Extra cost is onboarding × (N−1), so the
total work a fan-out must carry is `O × ((N−1)/0.20 − 1)`:

| lanes | fresh sessions | subagents |
|---|---|---|
| N=2 | $10.23 total / $5.12 per lane | $1.11 / $0.55 |
| N=3 | $23.02 total / **$7.67 per lane** | $2.49 / **$0.83** |
| N=4 | $35.81 total / $8.95 per lane | $3.87 / $0.97 |

At the ~$1.52/node measured on 2026-08-09, a three-lane fresh-session fan-out needs **~5 node builds
per lane** to stay inside the bar; a three-lane subagent fan-out needs about **half a node build** —
i.e. it passes on tokens essentially always. The starting hypothesis of ~$13–20 per lane was
CONSERVATIVE by roughly a factor of two; the measured figure is $7.67.

**D4 — THE WALL-CLOCK CLAIM IS STRAGGLER-BOUND, AND Nx IS NEVER THE NUMBER.** Bootstrapped over 284
real `--real` runs from `events.work_event` (median 317s, p75 691s, p90 1168s, max 3222s, mean
504s), a batch costing max(members):

| lanes | 2 | 3 | 4 | 5 | 8 |
|---|---|---|---|---|---|
| real speedup | 1.31x | **1.59x** | 1.84x | 2.09x | 2.76x |
| efficiency | 65% | 53% | 46% | 42% | 34% |

Three lanes buy **1.59x, not 3x** — the straggler eats roughly half. Any design or briefing that
quotes a linear Nx is wrong on the factory's own measured distribution. The 1.59x at N=3
independently corroborates `parallel-red-green-arc`'s 1.589x separate-worktree dataflow bound,
reached by a different method over a different population.

**D5 — WIDTH IS THE BINDING CONSTRAINT, AND IT REFUSES THE BACKLOG READING FOR NOW.** Both vehicles
clear the token bar and the wall-clock win is real, so the economics permit fan-out. What does not
is the population. Measured 2026-08-09: **17 open increments across 9 of 22 active arcs, and only
TWO arcs hold 2 or more** (`session-decoupling-arc` 2, `verification-integrity-arc` 8). **The median
arc offers exactly one lane, so there is nothing to fan.** An orchestrator-level primitive over
PARKED INCREMENTS is therefore not built: it would serve ~9% of arcs, and 8 of the 17 units sit on a
single arc.

This was a refusal of one READING, not of the arc. The other width — **lanes inside a single ADR-0183
plan** — is a planner-time decomposition and **cannot be counted from the backlog at all**. It was
the only reading with plausible width, and measuring it was this arc's next increment, with nothing
built until it returned a number. **It returned one** (ADR-0333, 2026-08-09): all 58 anchored plans
in the live store were read and the median plan holds **ONE** lane on every reading, the most
generous included, and on that reading the arc's own falsifier fired and the arc closed with nothing
built. **Corrected in place, 2026-08-09 (ADR-0139): that closure did not stand** —
[ADR-0334](0334-plan-lane-width-is-planned-for-not-discovered-the-fan-out-ar.md) found ADR-0333's
58-plan population unrepresentative (10.3% of the store's increments, selected by whether a session
chose to invoke the `planner` at all, and excluding `uat-journey-surgery-arc` — the owner's named
paradigm case — entirely) and reopened the arc the same day; lane width is now designed for at
planning time, not read off the backlog (ADR-0334 D4). The arc is OPEN.

## Consequences

The cheap vehicle is the one already available. Variant (a) needs **no engine**: ADR-0331 established
that the harness runs every spawn block emitted in ONE assistant turn concurrently, so subagent
fan-out is a behaviour, not a build. Variant (b) is the expensive vehicle and is now bounded to the
case where it costs nothing.

**ADR-0331's 1.8–3.6%-removable ceiling does NOT bound this arc, and the reason is the mix.** It
measured the overlap of delegates actually spawned — curators, story-authors, explorers. In this
window **0 of 105 delegates were builder types; no delegate has ever run a `--real` build.** A
delegation mix containing 300–3200s builds would overlap far more than one containing 14-turn
explorers, so the subagent-build cell is untried rather than refused. It STAYS untried: the next
increment measured plan-lane width (ADR-0333) and, on a population later found unrepresentative,
closed the arc; [ADR-0334](0334-plan-lane-width-is-planned-for-not-discovered-the-fan-out-ar.md)
reopened it the same day (corrected in place, 2026-08-09, ADR-0139), still before any build delegate
ran either way. Read that as unmeasured, never as measured-and-refused.

Per ADR-0139 this ADR carries `amends: [331]`: ADR-0331's own decision (D1's read-only-sweep refusal,
D2's carve-out for `parallel-red-green-arc`) stands unchanged and untouched — nothing here corrects
its body. What this narrows is the READING of its ceiling: ADR-0331 measured a delegation mix that
never contained a builder, so its number was never evidence about the subagent-build cell either way,
and a reader generalising "fan-out refused" past read-only sweeps (the failure mode this factory has
already made once) would be wrong. The amendment renders beside ADR-0331 rather than being left for a
reader to infer from a title alone.

Accepted knowingly: the 9x onboarding ratio is an ONBOARDING ratio, not a total-cost ratio. ADR-0330
already found delegation re-prices rent rather than removing it, and delegating a build has a second
effect this ADR does not price — the lane's working context never enters the orchestrator's window,
so it is never re-read at cache-read rates on later turns. The **sign** of that effect on total
session cost is genuinely unknown, and D3's break-even should not be read as a claim that three
delegates cost $0.84 more than doing the work in-thread.

The safety fence WOULD have been the live risk, not the economics — and it stays unbuilt: N concurrent
writers has still never become a real condition, because nothing is built on the reopened arc either.
**Corrected in place, 2026-08-09 (ADR-0139):** ADR-0333's closure did not survive —
[ADR-0334](0334-plan-lane-width-is-planned-for-not-discovered-the-fan-out-ar.md) superseded it the same
day and reopened the arc, gating any build behind evidence that its D4 planning-brief change actually
produces wider plans. The ADR-0255/0284 wall is a static deny
block over the primary checkout and is **claim-blind**: a write into a SIBLING worktree is refused by
nothing, de-scoped on zero evidenced instances. N concurrent writers is precisely the condition that
makes that hazard live, and the owner's "previous attempts have overloaded the system" is a second,
separate constraint still to be pinned to a concrete failure mode. Arbitration must be COMPOSED, not
rewritten — `acquireChainClaims` / `releaseChainClaims` in `packages/drive/src/chain-claims.ts`
already does an all-or-nothing set take in canonical sorted lock order at ADR-0270 capability grain.

The first half of D5's re-open condition — *plan-lane width returns a median above one* — was read as
DISCHARGED: ADR-0333 measured it at one. **Corrected in place, 2026-08-09 (ADR-0139):**
[ADR-0334](0334-plan-lane-width-is-planned-for-not-discovered-the-fan-out-ar.md) found that population
unrepresentative and REPLACED the whole re-open condition rather than resolving it — the live falsifier
is now whether plans authored under ADR-0334 D4's width-seeking brief show more independent lanes than
plans authored before it. The backlog half of this D5 condition (three or more arcs holding two or more
independent open increments at once, or a fresh median W1 of two or more) no longer governs reopening;
ADR-0334 is the current test.

## References

- ADR-0333 — the second width reading (all 58 anchored plans, median ONE lane); amends this ADR (D5's
  "unmeasured" prose, corrected in place). Its closure of the arc was itself superseded the same day —
  see ADR-0334 below.
- ADR-0334 — supersedes ADR-0333 and reopens the arc; D2–D4 above stand untouched by it. D5's
  plan-lane-reading prose is corrected in place above to point here (ADR-0139).
- `parallel-session-dispatch-arc` — this arc; the owner's design and the acceptance bar in full.
- ADR-0329 — session orientation is ~17 turns / $2.56–3.09; size is a vehicle input.
- ADR-0330 — delegation re-prices rent; every delegate pays a fresh preamble at the cache-WRITE rate.
- ADR-0331 — fan-out for read-only sweeps is not built; the harness runs one turn's spawns
  concurrently. Amended here (Consequences): its decision stands, its ceiling's reading is narrowed to
  the delegation mix it actually measured.
- ADR-0275 D2 — the hard ends that already force a lane into its own session.
- ADR-0270 — capability-grain claims; `packages/drive/src/chain-claims.ts` is the arbitration to compose.
- ADR-0255 / ADR-0284 — the write-authority wall, and why it is claim-blind.
- `packages/cli/src/session-cost.ts` — the committed classifier both vehicles were priced with.
