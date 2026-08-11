---
status: accepted
decided: 2026-08-12
arc: arc-orientation-surface-arc
amends: [314]
---
# ADR-0351: The arc lane state stops implying a session it cannot see: `running` becomes `moving`, and `claimed` is a positive-only ledger join

## Status

accepted (2026-08-12) — the owner raised the defect directly on reading the live surface: *"a lot of
the arcs show up as running atm when i know they dont have active sessions working on them this needs
to be looked at"*, and chose wiring the state to real session claims over a rename when offered the
two. Design-time alignment IS the ratification (ADR-0110).

**Amends ADR-0314**, which stays current. D4's separation of `waiting` from `blocked` is untouched,
and `blocked` stays unlit for exactly the reasons `BLOCKED_IS_DERIVABLE` records. What this ADR
changes is the vocabulary of the two RECENCY states D4 named, and adds one state D4 did not have a
source for.

**Note on numbering:** ADR-0350 was allocated by a parallel session minutes before this one and was
not on any branch when this Decision was written. It has since landed on `main` and been READ:
*"an event that caused another says so — causal edges on the event log"*. It touches neither the claim
ledger nor the arc surface, so there is no contradiction to reconcile.

## Context

`arcState` returned `running` when any increment had landed or been parked within the last seven
days. It never consulted the claim ledger — there is no claim data anywhere in `ArcRollup`, and
`packages/drive/src/arc-rollup.ts` joins none. So the word promised something the predicate could not
see.

**And at current landing velocity the state had also gone degenerate.** Measured on the live surface
on 2026-08-12: all nine visible lanes rendered `RUNNING`. A state that every row shares carries no
information at all, so the label was simultaneously misleading and useless — the owner read it as
"nine sessions are working" and knew that to be false.

**The obvious fix — derive the state FROM the claim ledger — was investigated and does not work, and
the measurement is the reason this ADR exists in the shape it does.** Against the live store:

- `Increment.cites` (ADR-0306 D2's typed pointers) is populated on **18 of 613** increments, and on
  **5 of 613 (0.8%)** for the `capability:` scheme specifically.
- An arc **cannot be a `cites` target at all** — `CiteRef` admits only `story:` / `capability:` /
  `asset:`.
- Claims taken directly on an arc id do happen, but are **64 of 1309 hold spans (~4.9%)**, and the
  documented norm since ADR-0270 D1 / ADR-0346 is to claim the CAPABILITY being written, not the arc.

So a claim-DERIVED `running` would report "nothing claimed" on nearly every arc even while a session
sat on one. That is a confident false negative, and it is strictly worse than the vague-but-honest
recency reading it would replace: the owner's complaint was that the surface asserts something false,
and swapping one false assertion for another is not a fix.

## Decision

**D1 — `running` IS RENAMED TO `moving`.** The predicate is unchanged: something landed or was parked
inside `QUIET_AFTER_DAYS`. Only the word changes, and the word was the whole defect. `moving` says
what is measured, and it pairs with `quiet` inside the momentum vocabulary ADR-0314 D1 already chose
for this surface ("momentum lanes"). Nothing about `quiet`, `waiting`, `closed` or the unlit
`blocked` changes.

This is deliberately NOT presented as the smaller half of the fix. Given D2's coverage, the rename is
the part that actually removes the false claim from every lane the owner was looking at.

**D2 — `claimed` IS ADDED, AS A POSITIVE-ONLY ASSERTION.** A lane reads `claimed` when a live claim on
`GET /api/claims` provably resolves to that arc. It outranks `moving` and `quiet` — it is the only
lane state backed by something other than a date — and it never outranks `waiting`, which stays top
because it is the one state the owner can act on.

**The asymmetry is the design, not a caveat.** A match proves a session is on the arc. A non-match
proves NOTHING, so `arcState` falls through to the recency states and the surface never renders an
"unclaimed" state, and never says "nobody is working on this". This is what makes a partial-coverage
join honest: it can only ever add a true statement, never a false one.

**Three join paths, unioned, each an EXACT match against a member of the arc:** the arc id itself; any
of the arc's own increment ids (which is how `<arc-id>-inc-NN` claims match — as members, never as a
string); and any unit an increment `cites`, with the `story:`/`capability:`/`asset:` scheme stripped,
since claims are taken on bare unit ids.

**A `startsWith(<arc-id>-)` rule was tried and REMOVED, and the removal is the load-bearing part.** It
looked free — it appeared to buy the `<arc-id>-inc-NN` case — but that case is already the
increment-id path, so all the prefix added was false positives: any arc whose id is a prefix of
another unit's id would silently absorb that unit's claims and report a session onto an arc it had
never touched. A signal that asserts only the positive cannot afford a false positive; it is the only
thing the signal says. (Its own test caught this, on an arc fixture with the id `a`.)

**D3 — THE LEDGER IS FETCHED WHILE THE ARCS LENS IS OPEN, not always.** `useSessionClaimGroups` now
takes `sessionDock || drawerLens === 'arcs'`. This widens WHICH open surface counts; it does not
create an always-on cost class, and the hook's drawer-scoping discipline is otherwise unchanged.

**D4 — `claimed` NAMES WHO, deduped by session.** The chip carries a title naming the holding
sessions and the matched unit ids. One session holding three of an arc's units is ONE session on the
arc, not three.

## Consequences

**Good.** No lane asserts a live session any more unless one is provably there. The degenerate
all-lanes-`RUNNING` reading is gone, so the state discriminates again. `claimed`, when it fires, is
trustworthy in the strong sense — every path is an exact membership match — which is what lets it be
rendered as the most emphatic chip on the surface. And the surface gained a real use of the claim
ledger without inventing a second claim model.

**Bad, and accepted.** `claimed` will fire RARELY at today's authoring habits — most sessions claim a
capability their arc's increments do not cite, and only ~5% of hold spans name an arc id. So the new
state is close to dormant on day one, and someone reading the surface may reasonably conclude the
join is broken when it is merely uncovered. That is the honest version and it is a deliberate trade
against the false-negative alternative; the remedy is authoring discipline (`arc increment new
--cites capability:<id>`), not code. Until that coverage improves, `moving`/`quiet` remain what most
lanes read, and they now claim only recency — which is all they ever measured.

**A second consequence worth stating: this makes `cites` coverage load-bearing for the first time.**
`cites` was previously a documentation nicety; it is now the widest of the three join paths and the
only one that scales with how sessions actually claim. If `claimed` is to become useful rather than
rare, that is the lever, and it belongs to the arc/increment authoring flow rather than to this
surface.

**Not decided here.** Whether to narrow `QUIET_AFTER_DAYS` (seven days lights nearly every arc at
current velocity, so `moving` is honest but still weakly discriminating); whether `claimed` should
also surface in the briefing panel rather than only on the lane chip; and whether increment authoring
should REQUIRE a `cites` capability ref, which is a work-hierarchy question for `story-author` and
the arc verbs, not a studio one.

## References

- **ADR-0314** — **amended by this ADR.** D4 named `running`/`quiet` and left `blocked` unlit; the
  unlit `blocked` and its refusal are untouched, and D1 here only renames one of the two recency
  states. D1/D2/D3/D6/D9 unaffected.
- **ADR-0306 D2** — `Increment.cites` typed pointers, the widest of D2's three join paths, and the
  field whose 0.8% `capability:` coverage forced the positive-only shape.
- **ADR-0270 D1 / ADR-0346** — claims bind at CAPABILITY grain, with the arc id used only for
  cross-capability work; the reason an arc-id claim is a minority path rather than the norm.
- **ADR-0200 D7** — the claim ledger and `GET /api/claims`, whose existing payload this reuses
  unchanged.
- **ADR-0349** — the sibling landing on the same surface in the same session (the floor-health lamp
  and the arc surface's own heading).
- `apps/studio/src/lib/arcSurface.ts` — `arcClaimants` carries the measured coverage figures beside
  the code they justify.
