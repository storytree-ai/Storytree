---
status: accepted
decided: 2026-08-09
arc: parallel-session-dispatch-arc
amends: [332]
load_bearing: true
---
# ADR-0333: Plan-lane width is one, so orchestrator-level fan-out has nothing to fan and the arc closes

## Status

accepted (2026-08-09) — the owner set the decision rule before the measurement was taken: if the
median plan holds one lane the arc closes, and if it holds two or more the arc proceeds to the
safety work. Design-time alignment IS ratification (ADR-0110), so the number selects the branch and
this ADR records which branch it selected; there is no second ask. The economics are NOT reopened —
ADR-0332 D2/D3/D4 were measured the same day and stand untouched.

## Context

ADR-0332 D5 refused an orchestrator-level fan-out primitive on **width, not economics**. Both
vehicles clear the owner's 15–20% token bar and the wall-clock win is real (1.31x / 1.59x / 1.84x at
2 / 3 / 4 lanes, bootstrapped over 284 `--real` runs), but only **two of 22 active arcs held two or
more open increments** (17 open across 9 arcs, 8 of them on one arc), so a primitive fanning PARKED
INCREMENTS would serve ~9% of arcs.

D5 was explicit that this refused ONE READING. The other width — **how many independent lanes a
`planner` agent's ADR-0183 decomposition of a SINGLE increment actually holds** — is a planner-time
quantity that cannot be counted from the backlog at all, and D5 named it "the only reading with
plausible width". D5's own re-open condition was written against it: *re-open if plan-lane width
returns a median above one.*

The hazard in answering it was optimism, not difficulty. A hypothetical decomposition always looks
wider than a real one, and the arc was one refusal from closing, so the method had to read plans
that EXIST rather than reason about what a plan could look like.

## Decision

**D1 — THE POPULATION IS EVERY PLAN IN THE STORE, IDENTIFIED MECHANICALLY.** Since the ADR-0305 D1
fold there is no `plan` kind; a plan is an `increment` doc, and the discriminator is its **`anchor`**
— optional at birth precisely because "a parked intention has nothing to be anchored to yet — it is
anchored when it is planned" (`packages/library/src/knowledge.ts`, the field the freshness check in
`packages/cli/src/increment.ts` runs against). Of **563 increments** in the live store, **58 carry an
anchor**: 34 `active`, 18 `closed`, 6 `ready`, spanning **11 arcs** and 2026-07-11 → 2026-08-05. All
58 were read; none was sampled or skipped.

**D2 — THE PLANNER DECLARES ITS OWN LANES, AND ALL 58 DO.** Every one of the 58 carries an explicit
`## Lanes` section (or the `Lane(s), fence(s), and contention` variant) — the planner's own statement
of what is independent, what waits on what, and where lanes contend. The count is read off that
prose, honouring the parked increment's rule that a lane counts as independent only when **its own
dependency sentence names nothing outstanding**. Three readings were taken, each strictly more
generous than the last:

| | median | mean | exactly 1 | ≥2 | max |
|---|---|---|---|---|---|
| **W1** — dispatchable at once, t=0 | **1** | 1.40 | 43/58 (74.1%) | 15/58 (25.9%) | 4 |
| **Wmax** — largest concurrent set anywhere in the plan | **1** | 1.67 | 35/58 (60.3%) | 23/58 (39.7%) | 5 |
| **Build1** — concurrent red→green CODE lanes at t=0 | **1** | 1.21 | 46/58 (79.3%) | 10/58 (17.2%) | 4 |

**The median plan holds ONE lane on every reading, including the most generous one.** D5's re-open
condition is answered NO.

**D3 — THE FINDING SURVIVES BOTH ROBUSTNESS CHECKS, so it is not an artefact of duplicate plans.**
Six re-plan families in the population plan the SAME increment more than once (`plan-model-uat-witness`
v1–v6, the three `chapter2-land-lane-growth` plans, three `directional-dag` plans, two pairs on
`library-tech-tree-overlay`, two `grounded-art` inc-11 plans). Collapsing each to its WIDEST member
leaves **46 unique planned increments**: W1 median still **1** (31/46 single-lane, ≥2 in 32.6%),
Build1 median still **1** (≥2 in 21.7%). Split by authoring date the median is **1 in all three
periods**, with the mean drifting DOWN, not up: 1.44 (n=34, 07-11→07-20) → 1.37 (n=19, 07-24→07-27)
→ 1.20 (n=5, 07-28→08-05).

**D4 — THE WIDTH THAT EXISTS IS CONCENTRATED IN THE SAME SHAPE D5 ALREADY REFUSED.** Nine of the ten
plans with two or more concurrent BUILD lanes sit on **three arcs out of eleven** —
`noticeboard-claim-ledger-arc` (4), `forest-parcels-arc` (3), `library-tech-tree-overlay-arc` (2) —
and **five of eleven arcs produced no multi-lane plan at all**. This is the backlog's 8-of-17-on-one-arc
shape, reproduced one altitude down. A single wide plan among many single-lane ones does not justify
a primitive, and neither does a single wide arc.

**D5 — THE PLANNER ALREADY DECLINES AVAILABLE SPLITS ON THE GROUNDS A PRIMITIVE WOULD HAVE TO BEAT.**
Two plans found genuine independence and refused to dispatch it, unprompted, at planning time:

> "Units 2 and 3 are genuinely independent of each other, but … parallel takers would contend on the
> shared barrel … and on the story's noticeboard WORK claim … **Three small units do not repay the
> split.**" — `linked-session-context-plan-4`

> "Lane A and Lane B share no file and no story, so they are genuinely independent and could be taken
> by two sessions. **In practice one session should run them sequentially — Lane B is ~20 minutes and
> the cost of a second claim, worktree, and PR exceeds the parallelism won.**"
> — `linked-session-context-plan-6`

That is ADR-0329's vehicle rule being applied by hand, ahead of any primitive, and it says the
primitive would have been declined in at least two of the fifteen W1≥2 cases even though the width
was real. The measured `Build1 ≥ 2` share of 17.2% is therefore an upper bound on where a primitive
could act, not an estimate of where it would be used.

**D6 — THE DECLARED LANES DO NOT DELIVER THEIR NOMINAL WIDTH, because the LANDINGS serialise.** Every
multi-lane plan that reaches three or four lanes names a shared consolidation surface the builds
avoid but the landings cannot — `packages/cli/src/node-build.test.ts` (the REAL-buildable snapshot),
the story's `capabilities: []` append, and `packages/cli/src/main.ts` / `commands.ts` as repeat
merge-conflict sites. `library-tech-tree-overlay-plan-9` states it directly: "those consolidation
edits DO contend … so **sequence the three landings** … not the builds." A three-lane plan therefore
buys less than ADR-0332 D4's 1.59x, which was already the straggler-discounted figure and not 3x.

**D7 — THE ARC CLOSES.** Both named widths are measured and both are one: the backlog reading (D5 of
ADR-0332) and the plan reading (here). `parallel-session-dispatch-arc`'s own falsifier — "that the
width does not exist … if the median arc offers one, an orchestrator-level fan-out primitive has
nothing to fan" — has fired on the only two places the width could have lived. **Nothing is built.**
The write fence stays as ADR-0332 left it: claim-blind, de-scoped on zero evidenced instances, and
NOT made claim-aware, because the condition that would make that hazard live is the thing not being
built.

## Consequences

**What this does NOT say.** It does not say parallel dispatch never pays. It says the MEDIAN plan
offers one lane, so a general orchestrator-level primitive has no population. A pocket exists and is
nameable: the wide plans are multi-SURFACE work — a wire/server lane beside a render lane beside a
scene-core lane (`noticeboard-claim-ledger-plan-6`'s four-way drive+cli / studio-server / studio-src
/ desktop split is the widest honest example). An orchestrator that finds itself holding such a plan
should still fan it out — that is a behaviour, not an engine, and ADR-0332's Consequences already
established that subagent fan-out needs no build because the harness runs one turn's spawn block
concurrently.

**The vehicle question does not reopen.** ADR-0332 D2 settled it: $2.56 session orientation against a
$0.28 delegate first-turn toll, a 9x onboarding ratio, so subagents are the default and fresh sessions
are correct only where an ADR-0275 D2 hard end already forces one. If the pocket above is ever worked,
that answer is already in hand and must not be re-measured.

**Accepted knowingly, and this is the honest weakness.** The population is what the `planner` agent
HAS produced, not what it COULD produce under a brief that asked for width. A planner authoring for a
single consuming session has no reason to maximise lane count, so the measurement partly reflects the
brief rather than the work's intrinsic decomposability. That confound was accepted rather than
removed, for two reasons. First, removing it means authoring new plans under a width-seeking brief,
which is exactly the hypothetical-decomposition optimism the increment forbade — and re-authoring 58
plans to test a primitive nobody has asked for inverts the cost the primitive was meant to save.
Second, the confound cuts the wrong way to rescue the arc: D5's two economic refusals show the planner
declining width it had ALREADY FOUND, so a brief that produced more lanes would not, by itself,
produce more dispatches.

**The re-open condition, narrowed.** ADR-0332 D5's condition (re-open if plan-lane width returns a
median above one) is DISCHARGED, not left standing. Re-open this arc only on new evidence of the
population, not of the economics: **three or more arcs each holding two or more independent open
increments at once**, or a run of plans in which the median W1 is two or more. A single wide plan is
not that evidence, and neither is a single wide arc — that is the shape both refusals already
rejected.

**Do not re-derive.** The 58-plan read, its three readings, the dedupe and the temporal split are
this arc's second and last measurement. A later session that wants the number should read this ADR,
not re-run the sweep.

Per ADR-0139 this ADR carries `amends: [332]`. ADR-0332's decisions all stand and its body is
corrected in place only where D5 said the plan reading "is unmeasured" — that sentence was true when
written and is now overtaken by fact, not by re-decision, so it is fixed in place and points here
rather than being left to read as an open worklist item.

## References

- ADR-0332 — the arc's charter: the acceptance bar (D1), the onboarding price (D2), the break-even
  lane size (D3), the straggler-bound speedup (D4), and the backlog width refusal (D5) this amends.
- ADR-0331 — fan-out refused for read-only sweeps; the harness runs one turn's spawns concurrently.
- ADR-0329 — a unit's SIZE is a vehicle input, and size may never produce a decline. D5 above is that
  rule being applied at planning time.
- ADR-0330 — delegation re-prices rent; every delegate pays a fresh preamble at the cache-WRITE rate.
- ADR-0305 D1 — the fold that made a plan an `increment`, so the `anchor` is the plan discriminator.
- ADR-0183 D2 — the plan tier: git-anchored choreography, freshness-checked at consumption.
- `packages/library/src/knowledge.ts` — the `Increment` schema; `anchor` optional, stamped at planning.
- `packages/cli/src/increment.ts` — the freshness check the anchor exists to serve.
- `parallel-session-dispatch-arc` — the arc, its falsifier, and the increment log carrying both
  width readings.
