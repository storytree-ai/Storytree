---
status: accepted
decided: 2026-08-17
amends: [298]
arc: verification-integrity-arc
---
# ADR-0377: Arc folding defaults to a new arc; folding requires surface ownership; arcs cap at 20 increments

## Status

accepted (2026-08-17) — decided/directed by the owner in conversation on 2026-08-17. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0298 D6 — sharpens what "owns" means (surface, not theme) and adds an independent
increment cap. It does not overturn D6's shape: fold-if-owned, charter-if-not was always the rule.

## Context

The open question `oq-does-fold-by-default-have-an-ownership-floor-surface-or-t` measured what D6
actually produces in practice. D6 already reads: *"find the arc that owns this remedy and park an
entry on it; charter a new arc only when no existing arc owns the work."* But "owns" was never
defined, and the largest recipient in the corpus — `verification-integrity-arc` — absorbed 20
friction ids across 14 parked entries over 19 days by satisfying "owns" through **thematic
resemblance** ("this is verification-shaped") rather than through owning the surface any fix
actually edits. It never trended toward zero. Over the same window, ten narrowly-chartered arcs
(2026-08-03 → 08-13) absorbed 40 friction ids between them by genuinely owning the surfaces they
touched, and all ten closed honestly.

Separately, ADR-0305 D3 made increments durable — nothing prunes a closed one. An arc's increment
log is read in full by `arc show`, so an arc that keeps absorbing entries (by any reading of
"owns") accumulates a log that costs a reader's or an agent's context regardless of whether the
folding itself was ever well-gated. That is a distinct failure mode from the thematic-match
loophole, and needs its own backstop rather than relying on the ownership fix to catch it too.

## Decision

1. **"Owns" in D6 means surface ownership**, not thematic resemblance. An arc owns a remedy only
   when it owns the actual surface — the package, panel, or write path — the fix will edit. A
   defect being *describable* as belonging to the arc's subject ("verification", "quality") is not
   sufficient; almost every defect in this corpus can be so described, which is exactly why the
   thematic reading admitted nearly everything.
2. **Charter a new, narrow arc whenever no existing arc owns the surface.** This was already D6's
   stated fallback — sharpening "owns" is what makes it bite in practice instead of being satisfied
   by the first thematically-adjacent arc found. Chartering stays first-class and free, per D6's own
   words: "the failure being fenced is minting a HOMELESS item, not chartering an arc."
3. **Every arc caps at 20 increments, counted cumulatively — closed increments included.** Closed
   increments are never pruned (ADR-0305 D3) and are exactly what floods a reader's or an agent's
   context on `arc show`; a cap on open increments alone would not touch that cost at all.
4. **At the cap, the write is refused.** No 21st increment — landing record or parked entry — may
   be added to that arc. The driving session charters a successor arc instead; the successor
   records a reference back to the exhausted arc (a predecessor/provenance link) so the trail is
   not lost, the way `supersedes` keeps a superseded ADR's history reachable.
5. **No grandfather clause.** `verification-integrity-arc` sits at 75 increments today — 55 over
   the cap — and none of that history is touched, nor are its six currently in-flight entries. Its
   very next new increment (the 76th) is refused under the same rule as any other arc at 20; it
   simply becomes the first entry of a successor arc instead.

## Consequences

- More arcs, going forward, wherever no existing arc genuinely owns the edited surface. This is the
  cost side the owner weighed directly against the alternative (one arc reading as "active"
  indefinitely while actually being an unsorted intake queue). The marginal cost is one more line on
  the arc worklist, not new process — chartering was already free.
- The one measured failure mode — a broad, thematically-matched arc absorbing everything and never
  draining — loses its mechanism twice over: it can no longer be fed by theme alone once "owns"
  means surface, and even a legitimately busy arc cannot grow its log without bound once it hits 20.
- `verification-integrity-arc`'s six in-flight entries land as planned; the arc still auto-closes
  behind them per ADR-0335 once drained (untouched by this ADR). Anything that would have been its
  76th entry becomes a successor arc's first.
- This does not reverse D6's shape. "Owns" was always the operative word; this forecloses the
  thematic-resemblance reading that let it be satisfied without genuine ownership, and adds an
  independent, mechanical backstop (the cap) for the case where ownership-gating alone still isn't
  tight enough for a given arc.

## References

- [ADR-0298](0298-proposals-fold-into-arcs-the-deferred-work-tier-is-an-arc-en.md) D6 — the fold/charter rule this amends (corrected in place to point here).
- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) D3 — increments are durable; why the cap counts closed ones.
- [ADR-0335](0335-arc-lifecycle-is-derived-from-increment-state-min-one-increm.md) — mechanical arc lifecycle; unaffected, the cap is an independent write-time gate.
- `oq-does-fold-by-default-have-an-ownership-floor-surface-or-t` — the open question this answers.
- Library: `asset:edit-first-curation`, `asset:arc`.
