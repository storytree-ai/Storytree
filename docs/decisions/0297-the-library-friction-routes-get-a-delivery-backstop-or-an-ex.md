---
status: proposed
amends: [168, 298]
---
# ADR-0297: The Library friction routes get a delivery backstop or an explicit exemption

## Status

proposed — drafted 2026-08-03 by the `graduation-synthesist` from friction item
`only-the-tool-route-is-fenced-so-a-library-route-archives-unbuilt` during a board-drain session at
the `check:friction-drain` ceiling. Born `proposed` and NOT `accepted`: batch adjudication is never
owner-directed-in-conversation (ADR-0110), so this is the owner escalation, not a decision already
taken. The owner ratifies through the existing flow.

## Context

ADR-0168 D2 defines the routed lifecycle stage for EVERY friction route as *route set, output cited
in `references`*. ADR-0287 D1 — now ADR-0298 D2 — gave that requirement a mechanical fence for exactly
one route: routing
to `tool` is refused unless the item cites a live `proposal`. The other seven routes accept any
`--reason` string and require no artifact to exist.

Verified in source on this pass rather than taken from the friction item's prose
(`packages/cli/src/friction.ts` `routeFriction`; `FrictionRoute` in
`packages/library/src/knowledge.ts` is a closed 8-member enum):

- The citation refusal is gated strictly on `route === "tool"`. It is the ONLY place in the function
  that refuses a route write because a referenced artifact does not exist.
- No `check:*` script, no `pnpm gate` rung, and no CI step reads a friction item's route and verifies
  the corresponding Library artifact was written. Twenty-three `check-*.ts` files were swept; the
  only friction-relevant hit is `check-friction-drain.ts` reading `route` to classify open-vs-archived
  for the count/age ceiling. It never checks what the route points at.
- `check:arc-proposal-drain` (ADR-0287 D3, carried onto the arc-borne shape by ADR-0298 D3) is
  structurally scoped to the `tool` route's parked arc entries, joined against
  friction `references`, and only the `tool` route ever attaches that citation — so it is reachable
  only through `tool`. There is no Library-route equivalent.

**The triggering measurement.** 2026-08-03 board drain, branch `claude/mystifying-einstein-e32451`
(PR #1099). Eleven items were adjudicated and `check:friction-drain` went from 12 open to 1 open. Of
those eleven, four routed `edit-existing` and one `principle` had NOTHING written — the target
artifacts were all still un-edited, verified independently by `check:corpus-content` reporting zero
drift across the export-scope corpus. The worklist read as delivered while the corpus was unchanged.
The adjudicator flagged it itself rather than concealing it, and the remedy landed only because that
session then spawned a guidance-curator and a librarian-curator explicitly; nothing in the gate, the
CLI, or the ceremony required that second pass.

**The force pulling the other way, and it is real.** ADR-0287 scoped D1 to `tool` deliberately,
because its own Context table measured the five Library routes as healthy — 87.5% to 100% discharged
on 2026-08-02, against `tool`'s 4.8%. That gap is why one route got a fence and five did not.
Measured live for this ADR (2026-08-03, 263 friction items, 255 archived):

| route | count | carries `dischargedBy` |
|---|---|---|
| `tool` | 130 | 20 |
| `nothing` | 45 | — |
| `edit-existing` | 30 | 25 |
| `principle` | 17 | 12 |
| `guardrail` | 16 | 16 |
| `adr` | 8 | 1 |
| `process` | 2 | 2 |
| `definition` | 0 | 0 |

The five Library routes total 65 today, not the 54 the friction item cites — that figure is
traceable to ADR-0287's own 2026-08-02 table, and the difference of 11 is exactly the PR #1099 drain
this ADR is about. So the population at risk is GROWING, and the base rate still reads ~85%.

**The load-bearing complication is the instrument, not the number.** `dischargedBy` is a MANUAL,
OPTIONAL stamp, exactly as ADR-0287's own Context says of its pre-D1 measurement ("a FLOOR, not a
precise rate"). It records that somebody stamped an item, never that an artifact was written. PR
#1099 is a direct counterexample to reading 85% as health: five routes there had nothing written, and
the only reason we know is that the session went looking and a zero-drift corpus check happened to
prove it. For `tool`, absence is countable — the proposal tier makes an unbuilt remedy a listable
row. For the Library routes there is no equivalent signal, so the analogous rate is **currently
unmeasurable rather than known-good**, and this ADR must not be read as asserting the routes are
unhealthy. It asserts we cannot presently tell.

One further asymmetry is worth naming, because it cuts against the routes that look healthiest: an
`edit-existing` item points at an artifact that ALREADY EXISTS, so a citation fence of D1's shape is
structurally impossible for it — citing the target proves nothing. Whatever backstop is chosen for
these five routes cannot simply be D1 again.

ADR-0168 D5 already names `corpus-investigator` verification as MANDATORY on
`edit-existing`/`principle`/`guardrail`. That is a process requirement with no machine backstop
today, and it is the same gap from the other side.

## Decision

**Proposed, for the owner to settle: do the five Library friction routes get a mechanical delivery
backstop, and if so which shape — or is the ceremony deliberately left to hold them?**

This ADR does not pre-commit to building anything. The fork is genuine and the corpus cannot settle
it, because the honest answer depends on a judgement about cost that `asset:meter-fail-closed-caps-in-real-cost`
reserves: whether a fail-closed gate is warranted at a base rate we cannot currently measure.

The options, stated so the owner picks rather than reviews:

- **(a) Symmetry with ADR-0287 D1 — an emission fence per route.** Refuse the route until its output
  artifact is cited. Strongest, and structurally impossible for `edit-existing` as written, since the
  target pre-exists. Would need a distinct test for that route (for example, the target's `updatedAt`
  advancing past the routing).
- **(b) Symmetry with ADR-0287 D3 — a recurrence-driven delivery gate.** Mirror
  `check:arc-proposal-drain`:
  red only when a Library-routed item gains a `reinforcedBy` dated after its routing, i.e. the trap
  demonstrably bit someone again. No tunable ceiling to raise; fails in the quiet direction, which
  ADR-0287 already accepted as a known risk.
- **(c) Ceremony only.** Make the adjudicator spawning the per-route executor an explicit, named step
  of `asset:friction-adjudication` rather than an implicit one. This is precisely what the owner did
  by hand in the session that produced this ADR, and it is free.
- **(d) Explicit exemption.** Record that the five Library routes are deliberately NOT fenced, with
  the 85% figure and its instrument caveat written down, so the next session that notices the
  asymmetry finds a decision instead of a gap and does not re-file this.

(d) is a real option and is listed to be chosen, not as a foil. An unfenced route with a recorded
reason is a different object from an unfenced route nobody considered.

Whichever is picked, one thing is decided by this ADR's existence rather than by its outcome: the
asymmetry is now on the record, so it stops being rediscovered.

## Consequences

**Good.** The gap between ADR-0168 D2's stated lifecycle (*output cited in `references`*, for every
route) and its enforcement (one route) becomes visible and settled either way. If (b) or (a) is
picked, a board drain can no longer read as delivered while the corpus is unchanged — the failure PR
#1099 demonstrated. If (c) or (d) is picked, the ceremony carries the obligation explicitly and the
next adjudicator inherits a decision instead of an asymmetry.

**Bad, and worth weighing before picking (a) or (b).** Every fail-closed gate added here reds local
gates for sessions that did not author the item, which is the exact harm ADR-0290 was written to
correct for `check:corpus-content` and ADR-0252 D3's zero ceilings keep re-teaching. The population
is 65 rows and growing by roughly a drain per day. A backstop mis-shaped for `edit-existing` — the
largest of the five at 30 — would red on the route that is hardest to satisfy mechanically.

**Accepted risk under (c) or (d).** The PR #1099 failure recurs and is caught only if a session goes
looking, exactly as it was that time. Given the delivery signal is unmeasurable for these routes,
that recurrence would also be invisible to the tripwires the adjudicator is supposed to watch.

**Not decided here.** Anything about the `tool` route, which ADR-0287 owns and which this does not
touch; the `nothing` and `adr` routes, whose outputs are a tombstone and an owner escalation rather
than a corpus artifact; and the `--reason`-overwrites-`routeReason` hazard, which is separate and
separately filed.

## References

- `only-the-tool-route-is-fenced-so-a-library-route-archives-unbuilt` (the source friction item; live store, `friction` kind)
- [ADR-0168](0168-session-retro-friction-every-session-feeds-friction-to-the-l.md) — the friction feedback loop; D2's routed lifecycle and D5's route table. Accepted, load-bearing. AMENDED here: D5's route table gains a delivery obligation, or an explicit exemption, for the five Library routes.
- [ADR-0298](0298-proposals-fold-into-arcs-the-deferred-work-tier-is-an-arc-en.md) — the `tool` route's emission, which SUPERSEDED [ADR-0287](0287-the-tool-route-emits-a-proposal-and-the-proposal-tier-carrie.md) on 2026-08-03 by retiring the `proposal` kind and folding deferred work onto the arc that owns it. D2 is the emission fence (an arc that resolves AND carries a parked entry naming the item), D3 the delivery ceiling `check:arc-proposal-drain` (ADR-0287 D3's rule preserved verbatim, only the counted object moved). AMENDED here: the deliberate `tool`-only scoping of that fence is revisited against a re-measured base rate. **This ADR's fork is UNAFFECTED by the fold** — it asks whether the five LIBRARY routes get a backstop, and none of them emitted a proposal either before or after; option (b) simply now mirrors an arc-borne ceiling rather than a kind-borne one.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this is born `proposed`: design-time alignment IS ratification, and batch adjudication is not that.
- [ADR-0290](0290-the-corpus-content-ceiling-measures-what-the-branch-authored.md) — the precedent that a ceiling must charge by authorship, the cost to weigh before adding one.
- `asset:friction-adjudication` (the procedure), `asset:friction-justification-bar` (the floor), `asset:meter-fail-closed-caps-in-real-cost` (the cost rule this fork turns on).
- `packages/cli/src/friction.ts` (`routeFriction`, the `tool`-only citation refusal); `packages/library/src/knowledge.ts` (`FrictionRoute`, the 8-member enum); `packages/cli/src/arc-proposal-drain.ts` (the `tool`-only drain).
