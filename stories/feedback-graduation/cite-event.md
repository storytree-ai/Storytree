---
id: "cite-event"
tier: capability
story: feedback-graduation
title: "Cites are attributable typed links; counts are derived, never stored (RETIRED)"
outcome: "A cite is an attributable typed link between comments, cites, and artifacts; counts are derived, never stored."
status: retired
proof_mode: integration-test
depends_on: []
decisions: [32, 68, 168, 425, 477]
# RETIRED 2026-08-31, and deliberately carrying NO `proof:` block: this capability was never built,
# so there is no arm to remove and none to add. Its two halves are settled in opposite directions —
# one DELIVERED elsewhere, one DECIDED AGAINST — and the body below records which is which.
---

# Cites are attributable typed links; counts are derived, never stored (RETIRED)

**Outcome —** A cite is an attributable typed link between comments, cites, and artifacts; counts
are derived, never stored.

> **RETIRED 2026-08-31.** Not abandoned and not deferred: every part of this outcome now has a
> settled answer, and the two halves settled in OPPOSITE directions. The reinforcement half was
> delivered under a different mechanism; the signal-graph half was decided against at the corpus
> level. Nothing is left for this node to name, so it is retired rather than re-scoped.
>
> **This node was never built.** The original body said so honestly ("`proposed`, greenfield.
> Nothing exists: no schema, no store surface, no tests") and that never changed. What changed is
> that its three contracts pointed at `packages/core` and `packages/store`, and **ADR-0068 DISSOLVED
> both packages** — so by 2026-08-31 the spec was naming a destination that could not exist.

## Why it is retired — the two halves, verified at source 2026-08-31

**Half 1 — reinforcement. DELIVERED, in a different form.** ADR-0168 D2 says it in terms: the
friction artifact's `reinforcedBy` field "realizes ADR-0032's cite-as-reinforcement **without
building the cite store**". The properties this capability specified survived the move intact —
recurrence appends `{ branch, date, evidence }` to the existing item rather than minting a twin,
evidence is REQUIRED on every entry (an evidence-free "me too" is refused fail-closed), attribution
is the filing branch, and `reinforcedBy.length` is testimony an adjudicator weighs and never a stored
counter to increment or forge. Built and tested in `packages/cli/src/friction.test.ts` ("reinforce
appends a reinforcedBy entry (never a twin)", "reinforce without --evidence is refused", "new refuses
re-filing an existing id"). That code is owned at STORY grain — `repo-manifest.json` maps
`packages/cli/src/*friction*.ts` to `feedback-graduation` — so re-scoping this node onto it would
mint a capability for behaviour the corpus already owns and already proves.

**Half 2 — the signal-graph. DECIDED AGAINST, not merely unbuilt.** This capability's stated point
was traversal: "the read surface is *traversal* — given any endpoint, the cites touching it". That
requires a second pointer set beside the authored hierarchy edge, and **ADR-0477 D1 (2026-08-29,
owner-directed) retired exactly that**: the `references` field and the `Sources:` block are gone
corpus-wide, ~4,063 refs deleted, and "the deliberately authored `depends_on` edge is the ONLY edge
the library carries." The owner's words: *"the end goal is really to just have the depends_on edge,
these citations in my opinion are noise."* Building `events.cite` now would re-introduce the second
pointer set that decision removed. The friction surface followed the same rule: its `references`
field is retired, and `friction.test.ts` actively pins the absence ("the retired citation field is
never re-created", "the retired citation field is never written").

**And its substrate is retired too.** Cites were designed to sit ON the comment/post substrate
(`stories/studio/interface-comment-substrate.md` still declares this node as a consumer). **ADR-0425
D1 retired studio commenting**, deliberately, with MULTIPLAYER named as the revival trigger (D2).
The comment STORE is kept as the revival foundation (D5), but there is no live commenting surface for
a cite to link.

## What replaced the cross-artifact link, where one survived

The friction tier still relates an item to an implicated artifact — but the relation is **DERIVED,
never stored**. An arc carrying an OPEN increment whose `frictionRefs` names the item is what parks
that item's remedy, and `friction route --route tool` reads that derivation rather than a citation
written back onto the row (ADR-0298 D2; ADR-0477 D1 removed the write-back). Proven by
`friction.test.ts`: "an OPEN entry naming the item parks it WITHOUT --arc — the derived read is what
answers", "an entry naming a DIFFERENT friction item does not park this one", and "routing to `tool`
is refused until the item cites an arc that parks it". This is the surviving descendant of the
cite-as-cross-link idea, and it is proven at STORY grain by this story's own UAT leg 2.

## The original design (historical record — ADR-0032 §2)

Kept so the retirement is legible, NOT as work to pick up. A cite was to be
`{ from, to, why, actor, at }`, each endpoint one of a comment / a cite / an artifact, with `actor`
resolved through the fail-closed signer chain, `why` required prose, counts projected from the log at
read time, and no anti-gaming machinery (ADR-0032 §5).

## Contracts (3) — all three retired with the node

Restated as dispositions. **None of these names a live destination**: their original "proven by"
lines pointed at `packages/core/src/cite.test.ts` and `packages/store/src/cite-store.test.ts`, both
in packages ADR-0068 dissolved.

1. **`cite-requires-attribution`**
   - **asserts —** an unattributable or why-less `cite` is refused.
   - **disposition —** DELIVERED in the friction form. `reinforce` refuses a missing `--evidence`
     fail-closed, and `friction new` refuses evidence-free and non-concrete evidence; provenance
     stamps the filing branch. The refusal this contract wanted exists; the object it guards is a
     friction reinforcement rather than a cite.
2. **`cite-links-typed-endpoints`**
   - **asserts —** a `cite` records typed from/to endpoints and is traversable.
   - **disposition —** SUPERSEDED by ADR-0477 D1. A stored, traversable second edge set is the thing
     that decision removed corpus-wide. The surviving relation is derived, not traversed.
3. **`cite-store-parity`**
   - **asserts —** `cite` records persist through the `Store` seam with parity.
   - **disposition —** MOOT. There is no cite store to hold to parity, and no decision leaves room
     for one. The store seam's parity discipline itself is alive and owned elsewhere
     (`storage-protocol`'s `./parity` suite).
