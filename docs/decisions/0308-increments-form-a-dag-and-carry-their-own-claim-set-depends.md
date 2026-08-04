---
status: accepted
decided: 2026-08-04
amends: [270]
arc: arcs-hold-increments-arc
---
# ADR-0308: Increments form a DAG and carry their own claim set: depends_on for order, cites for the fence

## Status

accepted (2026-08-04) — decided/directed by the owner in conversation on 2026-08-04, completing the
design pass that produced ADR-0305 and ADR-0306. Design-time alignment IS the ratification
(ADR-0110); no second end-of-flow ask. The owner directed each fork: increments gain `depends_on`;
an increment is held by one session at a time; the binding is per-increment rather than per-arc; and
`cites` is **optional**, because whole classes of work have no capability to name.

## Context

### The increment tier is a chronological list, not a graph

An increment (ADR-0305, formerly `plan`) has no `depends_on`. Order today exists in exactly one
place: `decomposition` prose ordering the units *inside* one increment. **Between** increments there
is no edge at all — the log is chronological, so nothing can say increment 4 waits on 2 and 3, and
nothing can say 5 waits on nothing and could start now.

### The parallelism the original design imagined has no field left

ADR-0183 D2's Context put parallelism at the other grain: a plan is *"reusable across N parallel
sessions that each take a different lane"*, with `lanes` carrying "independent units, expected file
surface per lane as fence hints, contention warnings". ADR-0305 D4 removed `lanes` — no reader ever
distinguished it from the other body headings. That is correct on its own terms and it leaves the
lane-level story with nothing behind it, so the parallelism question has to be answered at the
increment grain or not at all.

### Coordination is reactive, and the refusal arrives late

Claims (ADR-0121/0138/0200/0270) record what a session *is writing now*. ADR-0183's Context named
the gap precisely: *"nothing declares the choreography before the sessions collide."* The claim
ledger does refuse a second `work` claim on a unit — but the refusal fires at **declare** time,
after a session has already chosen its work and stood up a worktree. The information needed to avoid
the collision exists only after the collision is expensive.

### Some work has no capability to claim, and forcing one is worse than empty

Greenfield work is creating the capability, so it cannot claim it. Planning, ADR authoring, and arc
landings never write a capability at all.

This is not hypothetical. ADR-0200 D3 fails `check:declared` for a session holding no claim, so a
session with nothing legitimate to claim must invent something. **Measured in the session that
produced this ADR:** PR #1142 touched four ADR files and no code, and declared on
`library-schema-and-write-validation` — holding, for the duration, a capability it never wrote and
on which a session doing real work there would have been refused. The ledger accepted it because
ADR-0270 D1 deliberately made the machinery unit-id-blind (*"the ledger, the gate … and the map all
already accept any unit id"*). The blindness is a feature; the false claim was the ceremony's fault,
not the substrate's.

## Decision

### D1 — Increments carry `dependsOn`, and the arc's increments become a DAG

`dependsOn?: string[]` — increment ids within the same arc. An increment is takeable when every id it
names is `closed`.

This is the same shape the work hierarchy already uses, and it reuses the same enforcement:
`topoOrderStoryNodes` (`packages/orchestrator/src/story-build.ts`) is a **fail-closed** topo sort
that refuses on a cycle and on an edge naming a unit that is not present. An increment DAG is held
to that function, not to a second implementation of it. **A cycle is a refusal, never a warning** —
the acyclicity gate is not optional, because a cyclic increment graph has no valid execution order
and would present as "nothing is takeable" with no explanation.

Edges are within one arc. A cross-arc dependency is not expressible and is deliberately out of scope
(see D6).

### D2 — `cites` is OPTIONAL, and its capability and story refs are the increment's claim set

ADR-0306 D2 introduced `cites`. This decision fixes its two open properties:

- **Optional, and legitimately empty.** Greenfield, planning, ADR work and arc landings name no
  capability. An increment citing none is correct, not under-specified, and no surface may treat an
  empty `cites` as a defect.
- **The capability and story refs in `cites` ARE what the session claims** when it takes the
  increment. `asset:` refs are Library guidance, not a write surface, and are never claimed.

There is **no increment-level lock beside the capability lock**. Exclusivity falls out of the
existing one: if increment 3 cites `cap-x` and a sibling holds `cap-x`, a second session taking
increment 3 is refused by the partial index that already refuses a second `work` claim per unit. One
ledger, one grain, no new mechanism.

### D3 — Claims are taken on `ready → active`, never held by a `ready` increment

A `ready` increment declares intent; it does not own anything. If merely being authored-and-ready
took the claims, an arc with five planned increments would hold every capability they name before
anyone started, and the board would deadlock on work nobody is doing.

### D4 — Plan-time overlap detection is a READ, not a claim

Two `ready` increments whose `cites` intersect are **reported as contending**. That report is a
comparison of two documents; it takes nothing, blocks nothing, and refuses nothing. It is what
closes ADR-0183's pre-collision gap: the overlap is visible while the increments are still being
sequenced, rather than at the moment the second session declares.

This is the mechanical replacement for what `lanes` carried in prose, and it is why ADR-0306 is a
prerequisite for this decision rather than a later nicety.

### D5 — The claim rule: claim what you are writing

**Writing a capability → claim the capability. Writing an increment whose `cites` names no capability
→ claim the increment id.**

This **amends ADR-0270 D1**, which gave two cases — capability grain by default, story grain for
cross-capability work or a session that does not yet know its unit. It adds a third for work that
has no capability at all. It does not weaken the first two: capability grain remains the default and
story grain remains legitimate where D1 says it is.

The increment id always exists by the time anyone drives it — an increment is authored at `proposal`
or `ready` before it is taken — so there is always a truthful unit to name. No substrate change is
required, for the reason D1 itself recorded: the ledger, `check:declared`, and the map accept any
unit id. ADR-0200 D3 is untouched — a session still must hold a claim; this decision gives the
no-capability cases something honest to hold instead of a borrowed capability.

Greenfield resolves under the same rule with no special case: the first increment claims itself, and
once the capability exists, later increments cite and claim it.

### D6 — Not decided here

- **No cross-arc `dependsOn`.** Edges stay within one arc.
- **No structured `units[]`.** Still parked on `arcs-hold-increments-arc` (ADR-0306 D3).
- **No automatic dispatch.** Nothing in this decision picks an increment for a session or starts
  work; it makes takeability computable, and a human or an orchestrator still chooses.
- **No change to claim grades.** `exploring` / `waiting` / `work` are unchanged, as is ADR-0270 D2's
  queue-don't-ask rule for a refused claim.

## Consequences

**The arc's internals become a real DAG.** Until now they were a depth-1 star — every child holding
one upward pointer, no edges between children, cycles impossible by construction. `dependsOn`
introduces the first intra-arc edge, which is why D1's acyclicity gate is mandatory rather than
hygiene: the property that made cycles unthinkable is exactly the property being given up.

**Multiple sessions can work one arc without a new coordination device.** Takeability is a query
(dependencies closed), exclusivity is the existing capability claim, and contention is visible before
either session commits. The arc stops being implicitly single-driver.

**The false-claim pressure goes away.** A session doing ADR or planning work claims the increment it
is driving rather than borrowing a capability. That is one fewer phantom holder on the board, and
one fewer capability that reads as taken when nobody is writing it.

**Coarse-grain contention should ease, and this is the falsifiable prediction.** Where dispatch has
reached for arc-grain claims — coarser than capability grain, and refusing accordingly — increments
give it a finer unit that still exists for work the capability tier does not model. If queue delay
on shared surfaces does not fall after this lands, the diagnosis was wrong and the remedy should be
re-opened rather than extended.

**An empty `cites` buys nothing but honesty.** Two sessions can both take two different
no-capability increments and still collide in `docs/decisions/` or on the same arc row. The
increment-id claim makes each visible and stops them taking the *same* increment; it does not fence
the files. Sequential ADR numbering is already allocated atomically (ADR-0050) and arc increment
appends are additive, so the residual risk is small — but it is real and is accepted, not solved.

**`dependsOn` is a maintenance surface.** An increment retired or re-planned leaves ids that other
increments still name. The topo sort is fail-closed on a missing id, so this surfaces as a refusal
rather than silent breakage — correct, but it means pruning an increment is no longer free.

## References

- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) — the increment
  kind and its `proposal / ready / active / closed` lifecycle, whose `ready → active` transition D3
  keys on; D4 removed `lanes`, which this replaces mechanically.
- [ADR-0306](0306-typed-work-hierarchy-refs-increments-cite-stories-and-capabi.md) — `cites` and the
  `story:` / `capability:` ref schemes; D2 here fixes its optionality and its claim meaning.
- [ADR-0270](0270-the-claim-ledger-records-a-fiction-same-story-serialisation.md) — D1's capability
  grain, which D5 amends with a third case; D2's queue-don't-ask, unchanged.
- [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) — D3's "an
  unclaimed session fails the gate", untouched; this supplies the missing honest unit rather than an
  exemption.
- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) — D2's lane-level
  parallelism and the Context that named the pre-collision coordination gap.
- `packages/orchestrator/src/story-build.ts` — `topoOrderStoryNodes`, the fail-closed sort D1 reuses.
- `packages/notice-board/src/claim.ts` — `ClaimDoc`, whose unvalidated `unitId` and stored `branch`
  make D5 a ceremony change rather than a substrate one.
