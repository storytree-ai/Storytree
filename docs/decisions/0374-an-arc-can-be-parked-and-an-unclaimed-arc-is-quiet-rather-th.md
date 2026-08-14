---
status: accepted
decided: 2026-08-15
amends: [335, 351]
arc: arc-orientation-surface-arc
---
# ADR-0374: An arc can be PARKED, and an unclaimed arc is quiet rather than moving

## Status

accepted (2026-08-15) — decided/directed by the owner in conversation on 2026-08-15. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Amends **ADR-0335** (lifecycle is mechanical) by carving out exactly one curated state, and
**ADR-0351** (`running` → `moving`) by finishing a correction that ADR only half-made. Neither is
superseded: ADR-0335's rule still governs every arc it can actually see, and ADR-0351's diagnosis of
`running` was right — it is the remedy that was too small.

## Context

Three faults on the arc surface, reported together by the owner. They look like three unrelated
tweaks; two of them are the same fault seen from different sides.

**1. `All` is not a useful view.** The scope toggle offered `Active | Closed | All`. `All` drew every
arc in one column, distinguished only by the small state chip on each lane — so the reader had to
re-derive, per lane, the very thing the scope buttons exist to answer. It is the union of three
answers to a question that has exactly one answer per arc.

**2. There is nowhere to put a decided non-priority.** `remote-session-access-arc` ("Remote sessions
reach the live store") was descoped by the owner on 2026-08-04 — *"not a priority, its only a nice to
have"* — and still carries an open increment. The lifecycle had two values and both lie about it:

- Left `active`, it sits on the worklist looking like work somebody is about to pick up. It did
  exactly that for eleven days.
- Forced `closed`, it asserts an end state that was never met — and `arc close` REFUSES it anyway
  (ADR-0347 D1, no override), because closing over open work loses the work. That refusal is
  correct and is not the thing to relax.

The gap is structural rather than an oversight. ADR-0335 made `lifecycle` a projection of the
increment log, and the log physically cannot hold "the owner decided not to do this": an arc with
open work and an arc with open work nobody intends to start have identical logs.

**3. `moving` still implied something it could not see.** ADR-0351 D1 renamed `running` to `moving`
because the predicate was pure recency over the increment log and never touched the claim ledger, so
`running` claimed a live session it had no way to observe. The rename made the word honest about its
own mechanism — but the owner's objection was never only to the word. **Recency was not the
question.** An arc nothing is claimed on, and with nothing waiting on the owner, is quiet whatever
landed on it last week. And the state stayed degenerate after the rename for the same reason it was
degenerate before it: at landing velocity almost every visible lane fell inside the window, so
`moving` discriminated nothing, exactly as `RUNNING` had.

## Decision

**D1 — `parked` is a third `ArcLifecycle` value: `active | parked | closed`.** It means *open work the
owner has decided not to do for now*. It is NOT `closed`, and the difference earns the third value
rather than reusing the second: a closed arc's end state was MET, so its open work is gone and
ADR-0347 refuses a close while any remains; a parked arc's end state was not met — the work is still
there, still wanted, just not now. `lifecycleOf` projects both onto the triad's `archived`
(ADR-0196 D4's one projection), because the triad answers "is this on the worklist" and neither is;
the arc tier is where the two stay distinct. Fail-open on read, like its `closed` sibling: an
unrecognised value reads `active`, since an arc wrongly shown is noticed and an arc wrongly hidden is
not.

**D2 — `parked` is CURATED, and the mechanical rule yields to it.** This is the load-bearing half.
A parked arc holds open work by definition, so ADR-0335's rule derives `active` for every one of
them. Unfenced, the next unrelated increment write would un-park it, and `arc reconcile --write`
would un-park the entire shelf in a single run — in both cases erasing the owner's decision as a side
effect of something that was not about the arc's lifecycle at all, with no prose anywhere recording
the reversal. So the write-time trigger and the sweep both consult ONE exported predicate
(`isCuratedLifecycle`) and skip a parked arc, the sweep COUNTING what it declined to judge rather
than folding it into `agreed` — "we did not look at this" is a third outcome, not agreement.

This does not weaken ADR-0335, whose point is that nobody should have to REMEMBER to flip a
lifecycle. Parking is the one transition that is a remembered judgement by construction. `closed` is
deliberately NOT curated even though `arc close` is deliberate: a closed arc's log genuinely derives
`closed`, so rule and judgement agree and there is nothing to protect. `parked` is the only state
where they disagree by design.

**D3 — `storytree arc park <id> --reason <text|@file> --pg`, with `arc reopen` as the way back.** It
carries ADR-0239 D2's discipline unchanged — the state is a projection of prose that supports it, so
`--reason` is required exactly as `--outcome` is on close, and `library artifact edit --set
lifecycle=parked` stays refused at the generic edit surface. It writes increment-first for the same
reason both siblings do. **It deliberately does not refuse over open increments**: that is not a
weaker `arc close` but precisely the case `arc close` was hardened against — ADR-0347 protects
against work vanishing under a claim the initiative finished, and parking makes no such claim. The
work stays open and findable. `arc reopen` gains the parked shelf rather than a fourth verb existing:
a curated state that the mechanical rule cannot restore MUST have an explicit return path, and reopen
already is one, requiring exactly the prose a return should carry.

**D4 — `moving` is deleted; `quiet` is the fall-through.** `arcState` now reads, in order: the stored
lifecycles (`closed`, `parked`) → `waiting` → `claimed` → `quiet`. Quiet stops being a computed
judgement and becomes a residual: an arc nobody is claiming, with nothing waiting on the owner, IS
quiet. The predicate is DELETED rather than re-tuned — widening the window would only move the
degeneracy, because the fault is that recency does not answer the question. `arcState` still takes
`now` (published shape, every caller injects it) and the lane list still sorts on `lastActivityAt`:
**the surface reads the clock to ORDER lanes, never to label one.**

**D5 — the surface's scopes become `Active | Parked | Closed`, and `All` is removed.** One scope per
lifecycle, so the toggle is a partition rather than a set of filters, and every arc is reachable
through exactly one of the three. The CLI keeps `--all` and gains `--parked`: a terminal reader can
grep a long list and scan the `[closed]` / `[parked]` tags, which is the affordance the drawn lanes
do not have.

## Consequences

**Good.** A decided non-priority now has an honest home, and the fact that it was a decision — with
its reason — is on the arc's own increment log rather than in a chat transcript. The active worklist
stops carrying work nobody intends to start, which is what the surface's default scope is FOR. The
lane vocabulary is smaller and each state now says something a reader can act on: three of the five
are read from stored facts, one from the claim ledger, and `quiet` is honestly the absence of both.

**The cost, stated plainly: a parked arc can now sit stale in a way no other arc can.** Every other
lifecycle self-corrects — ADR-0239's rot argument, that an unclosed arc keeps showing up on the
worklist until someone deals with it, is exactly what D2 switches off for this one state. An arc
parked and forgotten will stay parked forever, because the only thing that can un-park it is a human
running `arc reopen`. That is the deliberate trade for not having the rule silently reverse the
owner: a state that both holds a decision and self-corrects is not available, because self-correcting
means overriding the decision. The mitigation is visibility, not automation — `arc reconcile` names
the parked count instead of skipping silently, `arc list` footers the count beside the closed one,
and the shelf is one click away on the surface. **If parked arcs accumulate unread, the remedy is a
staleness READING on the shelf (the ADR-0358 park-lease shape), never restoring the sweep's authority
over the state.**

**A second cost: `quiet` now covers a wider range than before**, from an arc that landed yesterday to
one untouched since June. That is the decision rather than a regression — the lane still sorts by
recency within the state, so the ordering carries what the label deliberately no longer claims.

**Not affected.** Nothing about the gate, and no migration: `parked` is a new enum VALUE on an
existing optional-with-default field, so every existing arc doc validates unchanged and reads
`active`. The first live doc carrying it must be written AFTER this lands, or a pre-merge checkout's
`.strict()` schema refuses that row on every write path that re-validates it.

## References

- ADR-0335 — lifecycle is mechanical (amended here by exactly one curated state).
- ADR-0351 — `running` → `moving`, and the claim-ledger-backed `claimed` state (its D1 finished here).
- ADR-0347 — `arc close` refuses over open increments; the refusal this ADR routes around rather than
  relaxes.
- ADR-0337 — `arc reopen`, widened here to cover the parked shelf.
- ADR-0239 — the arc list is a worklist, active by default; the state-is-a-projection-of-prose rule.
- ADR-0314 / ADR-0267 — the arc surface, its lane states and the briefing panel.
- ADR-0196 — the universal lifecycle triad and its one projection (`lifecycleOf`).
- `packages/arc/src/arc-rollup.ts` (`isCuratedLifecycle`, `arcLifecycleOf`, `reconcileArcLifecycles`),
  `packages/arc/src/arc.ts` (`arcPark`, `recomputeArcLifecycle`), `packages/library/src/knowledge.ts`
  (`ArcLifecycle`), `apps/studio/src/lib/arcSurface.ts` (`arcState`, `ArcLaneScope`).
