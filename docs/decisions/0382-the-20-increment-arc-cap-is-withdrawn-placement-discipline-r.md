---
status: accepted
decided: 2026-08-18
amends: [377]
arc: arcs-hold-increments-arc
---
# ADR-0382: The 20-increment arc cap is withdrawn; placement discipline replaces it

## Status

accepted (2026-08-18) — owner-directed, recorded on the parked increment
`arc-increment-cap-is-withdrawn-placement-is-the-rule` (`arcs-hold-increments-arc`). Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0377 D3, D4 and D5 — withdraws the numeric increment cap, its at-the-cap refusal,
and the no-grandfather-clause bullet. It does not touch D1 or D2: the surface-ownership floor and
the charter-a-new-arc fallback stand exactly as ADR-0377 left them.

## Context

ADR-0377 bundled two independent decisions. D1/D2 sharpened what "owns" means in ADR-0298 D6 —
surface ownership (the package, panel, or write path a fix will edit), not thematic resemblance —
and kept charter-a-new-arc as the fallback whenever no existing arc owns that surface. D3–D5 added
a second, separate mechanism on top: every arc caps at 20 increments counted cumulatively (closed
increments included, since ADR-0305 D3 makes them durable and nothing prunes them), the 21st write
is refused outright, and the rule carries no grandfather clause — `verification-integrity-arc`, at
75 increments when ADR-0377 was decided, was named as refused at its very next entry.

The cap was premature. Verified 2026-08-18 against `origin/main`: neither `packages/arc/src/arc.ts`
nor `packages/arc/src/increment.ts` carries cap enforcement, and a search across `packages/` for a
cap constant or an at-the-cap refusal returns nothing. D3–D5 landed decided-but-unbuilt and stayed
that way for the full day between acceptance and this reversal — the rule existed only as accepted
prose, never as a built gate, so withdrawing it costs one ADR and no migration or revert.

What bounds an arc's size is placement, which D1/D2 already decided and which this ADR keeps: an
arc that genuinely owns the surface a fix edits is the right home for that fix regardless of how
many increments it already holds: a numeric ceiling on top fences the symptom (a long log) rather
than the cause (mis-placed work), and it refuses a write at exactly the moment a session is trying
to record what it did.

## Decision

1. **Withdraw ADR-0377 D3** — the 20-increment cumulative cap.
2. **Withdraw ADR-0377 D4** — the at-the-cap write refusal.
3. **Withdraw ADR-0377 D5** — the no-grandfather-clause bullet naming `verification-integrity-arc`'s
   next increment as refused. That sentence goes with D3–D4; it does not survive on its own.
4. **ADR-0377 D1 and D2 stand, unamended.** "Owns" still means surface ownership, not thematic
   resemblance, and charter-a-new-arc-when-no-surface-owner remains the fallback ADR-0298 D6 always
   intended. What now bounds an arc's size is that placement discipline alone — an increment that
   belongs to another arc's surface goes there; one that fits no existing arc's surface starts a
   new, narrow one — with no independent numeric ceiling layered on top.
5. **Per ADR-0139, ADR-0377's own body is corrected in place** to remove the withdrawn D3–D5 prose
   and the now-void `verification-integrity-arc` refused-at-76 sentence, so no accepted ADR is left
   carrying a rule that is no longer in force. This ADR's `amends` edge, and its own References
   section, are the record of what was said and why it changed.

## Consequences

- No live behavior changes. Nothing enforced the cap, so nothing needs removing from code or
  reverting — the entire change is in the decision log.
- `verification-integrity-arc`, and any other large arc, is no longer refused a next increment on
  count alone. Its size is answerable only by asking whether it still owns the surfaces its
  increments touch (D1/D2) — a judgment call exercised at fold time, not a mechanical count checked
  at write time.
- ADR-0377 stays `accepted`: its D1/D2 half is live and correct, which is why this is an `amends`
  edge rather than a `supersedes`.

## References

- [ADR-0377](0377-arc-folding-defaults-to-a-new-arc-folding-requires-surface-o.md) — amended by this
  ADR; D1/D2 stand, D3–D5 withdrawn.
- [ADR-0298](0298-proposals-fold-into-arcs-the-deferred-work-tier-is-an-arc-en.md) D6 — the
  fold/charter rule ADR-0377 D1/D2 sharpened and this ADR leaves untouched.
- [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — why ADR-0377's
  body is corrected in place rather than left standing.
- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) D3 — increment
  durability, the reason the withdrawn cap counted closed increments at all.
- Increment `arc-increment-cap-is-withdrawn-placement-is-the-rule` on `arcs-hold-increments-arc` —
  the parked work this ADR closes.
