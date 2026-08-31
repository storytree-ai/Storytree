---
id: "archive-with-reason"
tier: capability
story: feedback-graduation
title: "Wrong posts are archived with a reason, never deleted (RETIRED)"
outcome: "A wrong post is archived by a reasoned event that preserves history and removes it from the live surface."
status: retired
proof_mode: integration-test
depends_on: []
decisions: [32, 68, 168, 196, 425]
# RETIRED 2026-08-31, and deliberately carrying NO `proof:` block: this capability was never built,
# so there is no arm to remove and none to add. Its outcome is delivered in full by the landed
# friction route; the body below maps each contract onto the mechanism that discharges it, and names
# the one residual gap — which is an ergonomics gap in a BUILT surface, not a missing capability.
---

# Wrong posts are archived with a reason, never deleted (RETIRED)

**Outcome —** A wrong post is archived by a reasoned event that preserves history and removes it
from the live surface.

> **RETIRED 2026-08-31.** Every element of this outcome — reasoned, history-preserving, removed from
> the live surface, reversible — is delivered by the landed friction route. The schema says so in its
> own words: `FrictionRoute`'s doc comment in `packages/library/src/knowledge.ts` reads
> "**`nothing` is the archive-with-reason tombstone**". A node whose outcome is discharged by name
> elsewhere is retired, not re-scoped.
>
> **This node was never built.** Its own body said "Would-be tests only", and its three contracts
> named `packages/core/src/archive.test.ts` and `packages/store/src/archive-store.test.ts` — both in
> packages **ADR-0068 DISSOLVED**, so the spec had been naming an impossible destination.
>
> **Its substrate is retired as well.** This capability archives a *post*, and posts live on the
> comment substrate. **ADR-0425 D1 retired studio commenting** deliberately, naming MULTIPLAYER as
> the revival trigger (D2); the comment store is kept as that revival's foundation (D5), but no live
> surface files a post to archive.

## Where the outcome went — verified at source 2026-08-31

ADR-0168 D2 built the same semantics on the `friction` artifact instead of on posts, and ADR-0196 D2
simplified the lifecycle it projects into. The mapping is one-to-one:

| this capability wanted | the landed friction route | proven by (`packages/cli/src/friction.test.ts`) |
|---|---|---|
| archival carries a REQUIRED reason | `friction route --route nothing --reason <text>`; the justification is mandatory | "route refuses a missing --reason (the justification is mandatory)" |
| archived leaves the LIVE surface | `lifecycleOf` derives `archived` from the route; the drain worklist counts `open` only | "lifecycleOf projects open / archived from route (ADR-0196 D2 collapse)", "list groups items by derived lifecycle with counts" |
| history PRESERVED, never deleted | the item is RETAINED as a tombstone and still accepts later recurrence evidence | "reinforce records a recurrence on an ARCHIVED item (tombstone re-open is adjudication's)" |
| reversible by the same mechanism | re-routing is the same verb; a foreign overwrite is REFUSED and the standing reason survives byte-for-byte | "route refuses to overwrite ANOTHER branch's adjudication, and its routeReason survives byte-for-byte", "--re-route lets a deliberate foreign overwrite through" |

The "additive, never destructive" property this capability specified is held by the STORE rather than
by the friction surface: library writes are append-only events behind a projection — the exact
"history-event + projection" shape this spec's own guidance described — and a superseded value is
recoverable with `storytree library artifact history <id> --field <f>`.

## The one residual gap — reported, NOT re-scoped into a capability

`archival-is-additive` is satisfied at the event log and **not** at the friction read surface. A
**same-branch** re-route silently overwrites the projected `routeReason`, by design: the test
"the SAME branch re-routing its own item is never refused (correcting your own adjudication is
normal)" pins that behaviour deliberately. So the guard is asymmetric — a PEER's justification is
protected byte-for-byte and cannot be lost silently, while your own prior reason is replaced in the
projection and survives only in the append-only log, one `library artifact history` hop away that no
friction read offers.

That is an ergonomics gap in a surface that is already built, owned and tested — not an undelivered
capability. Minting a node for it would put a capability in front of existing story-grain-owned code
to add one read affordance. Recorded here as the honest residue, and raised as a follow-up rather
than carried as live hierarchy.

## Contracts (3) — all three retired with the node

Restated as dispositions; none names a live destination, since both original destinations were
dissolved by ADR-0068.

1. **`archival-requires-reason`**
   - **asserts —** a reason-less or unattributable `archive` is refused.
   - **disposition —** DELIVERED. `route` refuses a missing `--reason`; the actor is resolved from
     the branch, and an UNATTRIBUTED standing route is treated fail-closed as another's.
2. **`archival-is-additive`**
   - **asserts —** `archive` appends; it never deletes or mutates history.
   - **disposition —** DELIVERED AT THE STORE, with the read-surface gap named above. The archived
     item itself is retained and re-openable; no event is deleted.
3. **`archived-leaves-projection`**
   - **asserts —** an `archive`d post leaves the live read surface.
   - **disposition —** DELIVERED. `lifecycleOf` projects `archived` from the route and the worklist
     counts `open` only, while the item stays readable and reinforceable.
