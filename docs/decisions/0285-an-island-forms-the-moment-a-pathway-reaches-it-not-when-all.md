---
status: accepted
decided: 2026-08-02
arc: act2-intro-forest-regrow-arc
amends: [283, 282]
---
# ADR-0285: An island forms the moment a pathway reaches it, not when all its ground has settled

## Status

accepted (2026-08-02) — decided/directed by the owner in conversation on 2026-08-02. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADR-0283 D1 replaced the Act 2 regrow's wave barrier with edge-driven scheduling: base nodes form
from nothing, a settled island grows its outgoing pathways, and a downstream island forms once a
pathway has arrived. Its D1.3 kept ADR-0282 D3's ordering invariant on top of that as a clamp — an
island "still may not form before EVERY island it stands on has settled".

The owner watched the first edge-driven build run and said the growth still reads rank by rank:
*"you're restricting or locking the island growth to row by row … if you grow the island as soon as
the pathway is done it will look way more organic."*

That is a correct diagnosis of the clamp, and it is measurable rather than a matter of taste. On the
real 40-island corpus, with the clamp in place:

- **26 of the 36 pathway-reached islands took their start time from the CLAMP, not from any
  arrival.** Only 10 actually formed when a road reached them.
- Islands sat beside a finished road, visibly waiting, for up to **6.3 s of a 9.3 s run**; the total
  island-time spent waiting with a road already touching them was **63 s**.

The mechanism is structural, not a tuning miss. A node's dependency set spans several DAG depths, so
`max(every dependency's settle)` is dominated by its DEEPEST dependency. Clamping on that re-derives
depth as the schedule — the wave barrier ADR-0283 set out to remove, wearing an edge-shaped costume.

## Decision

**An island's start time IS the arrival of the first incoming pathway. Nothing else gates it.**

The clamp is removed. `startMs(v) = min over v's routed incoming edges of (settle(from) + drawMs)`,
where a pathway still leaves only a SETTLED island (ADR-0283 D1.2, unchanged) and only a real
`depends_on` edge counts as an arrival.

This REVERSES ADR-0282 D3's ordering invariant and the clause of ADR-0283 D1.3 that carried it
forward. Both are amended here rather than superseded: everything else in those decisions — the
order derived from the real story graph, growth along the real routed geometry, base nodes as the
only spontaneous islands, no scripted sequence — stands untouched.

**What is given up:** the claim that all the ground beneath an island is complete before it appears.
A later-settling dependency's road now draws INTO an island that already exists, which is the
ordinary arrival beat the map has always had.

**What is kept, and is the claim the intro actually makes:** the CAUSAL invariant. A pathway leaves
only a settled island, so an island still never appears before the island that reached it has
settled, and still never appears unreached. That is strictly stronger than "in dependency order" —
it is what makes the regrow read as *the project was built this way* rather than as a sorted fill-in.

The unreached and cyclic fallbacks are unaffected: an island no pathway can reach has no arrival to
key on, so it still keys on its dependencies (ADR-0283's `unreachedStoryIds`), and a cycle still
lands at the tail.

## Consequences

**Good.**

- The growth stops reading as ranks. Two thirds of the corpus's islands were being held back by a
  dependency they were not visibly connected to; they now appear where and when a road reaches them.
- Total regrow duration drops from **9.3 s to 5.9 s** on the real corpus (graph-only pacing) — the
  clamp was the long pole, and ADR-0283 had flagged deep-corpus duration as a carried-forward risk.
- The schedule is now genuinely local: a node's start depends only on its incoming edges, so nothing
  in the plan has to reason about the graph globally.

**Costs and risks.**

- An island can now appear while a road from a deeper dependency is still drawing toward it. That is
  a real weakening of what the picture asserts, and it is deliberate.
- ADR-0282 D3's invariant had a test pinning it. That test is replaced, not deleted, by one pinning
  the causal invariant — but a future reader comparing the two should land here, not file a bug.
- The frame-cost floor is untouched (ADR-0283 D3), and a shorter run means the heavy final third
  arrives sooner.

## References

- [ADR-0283](0283-act-2-growth-follows-the-edge-pathways-grow-from-settled-nod.md) — edge-driven
  growth; D1.3's ordering clamp is amended here, the rest stands.
- [ADR-0282](0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md) — the Act 2 intro
  architecture; D3's ordering invariant is amended here, its order-from-the-real-graph rule is not.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the owner holds
  the LOOK verdict; this decision came from the owner watching a build.
- `packages/app-surface/src/forest-regrow.ts` — the schedule; `forest-regrow.test.ts` pins the causal
  invariant that replaces the ordering one.
- Arc `act2-intro-forest-regrow-arc` — this initiative.
