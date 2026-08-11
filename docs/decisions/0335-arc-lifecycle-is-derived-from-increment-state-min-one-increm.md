---
status: accepted
decided: 2026-08-09
amends: [239, 305]
---
# ADR-0335: Arc lifecycle is derived from increment state — min one increment, auto-close, auto-reopen

## Status

accepted (2026-08-09) — decided/directed by the owner in conversation on 2026-08-09. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0239 — narrows its "closure is never derived, always explicit" line to the specific
signal ADR-0239 measured and rejected (plan state), not the one this ADR derives from (increment
state). ADR-0239's own `arc close` verb, its owner-only re-open discipline for an EXPLICIT close, and
its "status is a projection of prose" principle all stand; what changes is that a SECOND, narrower
closure signal now exists alongside the explicit one, and it can also open the arc back up again
mechanically. **Amends** ADR-0305 — adds a birth invariant (an arc is never observably at zero
increments) that ADR-0305's `arc new` did not carry, and gives the increment tier's own status field
(`proposal` / `ready` / `active` / `closed`) a second reader: the arc's own `lifecycle`.

## Context

ADR-0239 decided arc closure must be stored, explicit state, written only by `arc close --outcome`,
because deriving it from PLAN state was measured against the live store and closed all 15 arcs
including 6 genuinely live ones — a 100% false-positive rate, since "all plans consumed" is an arc's
normal resting state *between* increments, not an end state, and plans are optional so most
genuinely-closed arcs had zero of them.

That decision is still correct for the signal it measured. But it left two gaps the owner surfaced in
conversation on 2026-08-09, while reviewing the studio's arc surface (ADR-0267/ADR-0314):

1. **An arc's `lifecycle` never moves on its own, so a fully-drained arc — every increment closed,
   nothing proposed, nothing active — reads identically to a genuinely in-flight one.** The map/studio
   surface (ADR-0267 D7) promises "currently running" as a signal the owner can trust; a drained arc
   sitting at `active` forever breaks that promise, and nothing short of a session remembering to run
   `arc close` fixes it.
2. **`arc new` (ADR-0183) scaffolds an arc with ZERO increments, indistinguishable at the `lifecycle`
   field from #1's drained arc.** Two different "arc has nothing left to do" causes — never started,
   and already finished — collapse onto the same observable state.

The owner's framing resolves the exact failure mode ADR-0239 measured: **increment status is not the
signal ADR-0239 rejected.** Plan state was rejected because a plan is optional, ephemeral per-increment
scratch that is normally EMPTY between increments — "all plans consumed" says nothing about the arc.
An increment's own `status` (ADR-0305 D2: `proposal → ready → active → closed`) is neither optional nor
ephemeral — it IS the arc's landing log, durable and append-only (ADR-0305 D3, nothing prunes it) — so
"every increment this arc has is `closed`" is a direct read of the log's own state, not an inference
from a side artifact. Re-running ADR-0239's own falsifier against this signal instead of plan state
would not have produced the false-positive: a live arc always has at least one `proposal`/`ready`/
`active` increment once #2 is closed, because #2 makes zero-increment arcs impossible.

The owner also named the mitigation that changes the risk calculus ADR-0239 weighed: **"we can always
reopen them if needed."** ADR-0239 treated closure as a one-way, human-only gate specifically because a
wrong auto-close was costly to detect and correct. Making the SAME signal also drive re-opening turns a
false auto-close into a self-correcting state rather than a silent, sticky one: the moment real work
resumes (a new increment is parked), the arc mechanically reopens.

## Decision

**1. An arc is never observably at zero increments.** `arc new` now requires `--objective` and
`--body` (the same two fields `arc increment new` already asks for) alongside `--title`/`--intent`/
`--end-state`, and bundles a first increment — status `proposal`, id `<arc>-inc-01`, title derived
from `--objective`'s first sentence — into the same command, written immediately after the arc doc
(order matters: the arc must exist before an increment can cite it, so on interruption the failure
mode is a zero-increment arc recoverable by `arc increment new`, never an orphan increment with no
arc — the same "order is the mitigation" reasoning ADR-0239 D2 already uses for `arc close`).

**2. Arc `lifecycle` is recomputed from increment state after every increment write.** A new
function, shared by `arc increment add|new|close`, asks one question of the store: does this arc
have ANY increment whose status is forward-looking (`proposal`/`ready`/`active` — the existing
`isForwardLooking` split every arc surface already uses, ADR-0314)? No → `lifecycle: closed`.
Yes → `lifecycle: active`. The write happens only when the computed value differs from the stored
one, so it is silent on every call that does not change anything.

This one rule produces both directions with no separate "reopen" code path:
   - **Auto-close**: the last open increment on an arc closes (`arc increment close`, or a landing
     recorded directly via `arc increment add` that happens to be the last open item) → no
     forward-looking increment remains → the arc closes.
   - **Auto-reopen**: a new increment is PARKED on a closed arc (`arc increment new`, status
     `proposal`) → that increment is forward-looking → the arc reopens.
   - Recording a past landing on an already-closed arc via `arc increment add` does **not** reopen
     it: the increment `arc increment add` creates is born `closed` (ADR-0305), so it is never itself
     the forward-looking increment that would flip the rule — correctly, since nothing about that
     write leaves open work behind.

**3. `arc close --outcome` (ADR-0239 D2) is UNCHANGED and stays the stronger, explicit override.** It
still asserts the end-state condition was met, in prose, and still force-closes an arc even with open
increments remaining — an owner call the mechanical rule never makes on its own. Re-opening a
CLOSED-BY-`arc close` arc has no bare verb here; it reopens the same way any auto-closed arc does, by
parking new work (`arc increment new`), which is the owner's own "we can always reopen them if
needed."

*(Corrected in place 2026-08-09, per ADR-0139 — this sentence's last clause no longer holds.
[ADR-0337](0337-an-agent-may-reopen-a-closed-arc-arc-reopen-records-why-then.md), owner-directed the
same day in a parallel session that did not yet know of this ADR, **adds the bare verb**:
`storytree arc reopen <id> --reason <text|@file> --pg`. The two decisions are compatible and the
owner resolved the overlap in favour of keeping both — parking work stays the ordinary way an arc
reopens, and the verb covers the case this rule cannot express: a closure that was WRONG, where there
is no new work to park and the stated reason is the whole point. Note this ADR's own framing already
anticipated the shape: it accepts that `arc close` force-closes past open increments and can later be
overtaken by the recompute, so an explicit override whose effect the derived rule may revisit is
already this design's accepted property — `arc reopen` is that same bargain in the other direction,
not a new one.)*

**4. `check:agents`/no new gate rung.** This is existing-increment-write behaviour, not a new
invariant a session must remember — nothing to check for compliance, only to test for correctness.

## Consequences

**Good.** A drained arc stops reading as "currently running" without anyone having to remember to
close it; a resumed arc stops reading as "finished" the moment real work is parked on it; `arc new`
can never again produce the #2 gap. ADR-0267 D7's "currently running" signal on the studio map becomes
trustworthy without a curation step. The Library/studio drawer gains a `--closed`/`--all` (CLI already
had this — ADR-0239 D3) way to still SEE closed arcs, so nothing disappears, it just stops crowding
the active worklist.

**Bad / accepted risk.** `arc new` is one command heavier — two required fields, not zero — which is
the same trade ADR-0305 D4 already named as the fold's "main ergonomic cost" for `arc increment add`
on a closed arc; this extends it to arc BIRTH. A session that mints many increments in a tight loop
now triggers the recompute query on every one — an extra `queryDocs({kind:"increment"})` per write —
acceptable because arc writes are a human-paced ceremony action (ADR-0271), never a hot loop. The
recompute is best-effort: a validation failure on the lifecycle-only flip is reported as a WARNING in
the command's own output rather than failing the increment write that already succeeded (the write
that already happened must never be thrown away over a bookkeeping projection) — so a session must
still read the command's output rather than assume the flip always lands silently.

**Named limit, same shape as ADR-0239's own.** The mechanical signal answers "is there open work
recorded on this arc," never "was the arc's `endState` actually met." An arc can auto-close with
undocumented follow-on work nobody parked yet — the same irreducible judgment ADR-0239's Consequences
already named for the explicit path, now also applicable to the derived one, mitigated the same way:
by reopening being cheap.

## References

- [ADR-0239](0239-arc-closure-is-stored-state-an-arc-lifecycle-field-written-f.md) — the falsifier this
  ADR narrows (plan-state derivation, not increment-state).
- [ADR-0305](0305-arcs-hold-increments-one-durable-typed-tier-replaces-increme.md) — the increment
  tier's `status` field (D2) and durability (D3) this ADR reads as its signal.
- [ADR-0267](0267-arcs-take-the-map-s-primary-top-drawer-slot-the-library-beco.md) /
  [ADR-0314](0314-the-arc-surface-is-momentum-lanes-with-a-briefing-panel-bars.md) — the studio surface
  whose "currently running" / briefing-panel affordances motivated this.
- `packages/cli/src/arc.ts` — `arcNew`, `arcIncrementAdd`, `arcIncrementNew`, `arcIncrementClose`.
