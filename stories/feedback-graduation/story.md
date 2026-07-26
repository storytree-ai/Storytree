---
id: "feedback-graduation"
tier: story
title: "Feedback graduation — linked feedback is routed by the graduation synthesist"
outcome: "The landed graduation-synthesist routes attributable, connected feedback signal into justified Library work or owner escalation."
status: proposed
proof_mode: UAT
capabilities: [cite-event, archive-with-reason, signal-synthesis]
# Story-level edges: the "Cross-story boundary" section below, encoded (declared
# interfaces, ADR-0010 §4; owner call #3 resolved 2026-06-11). ADR-0036.
depends_on: [studio, library]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, library]
decisions: [32, 168] # deciding ADRs: mechanism + landed adjudication seat (ADR-0037 §2)
---

# Feedback graduation — linked feedback is routed by the graduation synthesist

**Outcome —** The landed graduation-synthesist routes attributable, connected feedback signal into
justified Library work or owner escalation.

> **Renamed from `notice-board` (2026-06-11, owner call).** The `notice-board` name now belongs to
> the session-presence coordination story ([`stories/notice-board`](../notice-board/story.md),
> ADR-0033) — the legacy-lineage meaning of the term (sessions seeing each other in flight). This
> story is the *feedback* organ that legacy called the forum: cites, archival, and graduation.

This is the cite / graduation mechanism that [ADR-0027](../../docs/decisions/0027-supersede-adr-0014-notice-board.md)
carried forward from the superseded ADR-0014, and that
[ADR-0032](../../docs/decisions/0032-cite-graduation-mechanism.md) now **decides**. The
**post substrate is already built and is NOT re-scoped here**: posts/comments persist as typed
events (`events.comment` projection + append-only `events.comment_event`; `PgCommentStore` in
`packages/library/src/store/pg-comment-store.ts`), and the studio reads/writes them against the
shared store. ADR-0168 subsequently landed the current graduation route on the `friction` artifact
surface: recurrence appends evidence to `reinforcedBy`, shared `references` link implicated
artifacts, `route: nothing` plus `routeReason` retains a reasoned tombstone, and the built
`graduation-synthesist` chairs routed synthesis.

**Hierarchy / proof status.** The three original capability nodes remain authored `proposed` and
unregistered because they were not built through their own prove-it lineage. That does **not** mean
the current behavior is absent: ADR-0168 landed it through the Library/CLI friction surface and the
seed-canonical agent tier. The remaining deferred pieces are precise: the dedicated `events.cite` /
`events.cite_event` store and the dedicated comment/post archival event projection are still
unbuilt. The current graduation-synthesist and friction routing are landed.

## Design floor (from ADR-0032, the deciding ADR)

- A **comment** is a signal that an artifact needs attention. A **cite** is a typed **link**, not a
  counter: it reinforces a signal *and* connects signals and artifacts — and a cite may target
  another **artifact**, not just a comment — so cites compose into a **signal-graph** across the
  whole system. The dedicated cite-event store remains unbuilt; ADR-0168's landed path realizes
  reinforcement as evidence-bearing `reinforcedBy` entries and cross-artifact links as shared
  `references`. Any count is derived, never stored.
- **Graduation is the landed `graduation-synthesist`**: it reads accumulated signal with the
  whole-system view, applies the `friction-adjudication` process and
  `friction-justification-bar`, sets `route` / `routeReason`, and escalates only genuine owner forks.
  There is **no** deterministic cite-threshold scan and **no** auto-promotion.
- Wrong or handled friction is **archived with a reason**, never deleted:
  `route: nothing` plus `routeReason` retains a re-openable tombstone outside the open worklist.
  The analogous dedicated comment/post archival projection remains unbuilt.
- **No anti-gaming machinery** (cite-density math, forge defences, signal-vs-noise thresholds) — a
  deliberate non-goal per ADR-0032 §5, revisited only on observed evidence of abuse.

## Capabilities (3)

Listed roots-first. The formal node statuses remain `proposed`; the status column distinguishes
those unbuilt node lineages from the current ADR-0168 seams that landed elsewhere.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`cite-event`](cite-event.md) | A dedicated cite is an attributable typed link between comments, cites, and artifacts; the landed friction route currently realizes reinforcement through `reinforcedBy` and `references`. | node `proposed`; dedicated cite store deferred; friction seam landed | — |
| 2 | [`archive-with-reason`](archive-with-reason.md) | A reasoned archival record preserves history outside the live worklist; the landed friction route uses `route: nothing` plus `routeReason`. | node `proposed`; dedicated post archival deferred; friction tombstone landed | — |
| 3 | [`signal-synthesis`](signal-synthesis.md) | The landed `graduation-synthesist` chairs friction adjudication, routes durable essence to its owning author, and escalates genuine owner forks. | node `proposed`; ADR-0168 D5 agent/route landed | `cite-event`, `archive-with-reason` |

## Dependency graph (declared lineage and current route)

The authored capability edges below preserve ADR-0032's dedicated-store design. The landed ADR-0168
route deliberately goes around those unbuilt nodes: the graduation-synthesist consumes friction
artifacts whose `reinforcedBy` and `references` fields carry the graph and whose route carries the
archive reason.

- `signal-synthesis` → `cite-event` — the dedicated-store lineage would traverse cite links.
- `signal-synthesis` → `archive-with-reason` — the dedicated-store lineage would ignore archived
  signal.

**Cross-story boundary (owner call #3 — resolved, declared 2026-06-11):** every capability here
consumes the **comment/post substrate** owned by `studio`
([declared interface](../studio/interface-comment-substrate.md) — `events.comment*` via
the store seam), and the landed graduation-synthesist routes through the **open-question / proposal
authoring path** owned by the `library` story
([declared interface](../library/interface-oq-proposal-authoring.md) — the ADR-0018 OQ→ADR flow).
Per ADR-0010 §4 these are declared interfaces, not absorbed behaviour.

## UAT Test Criteria

**Goal —** Feedback becomes attributable, connected signal: recurrence reinforces an existing item,
references link it to implicated artifacts, a reasoned tombstone removes handled signal from the
open worklist without erasing it, and the graduation synthesist judges what durable proposal (if any)
the accumulated signal warrants.

> **Current seam (ADR-0168).** The dedicated `events.cite` store was never built. The landed
> graduation path realizes the same semantic roles on `friction` artifacts: `reinforcedBy` is the
> attributable reinforcement edge, shared `references` are the cross-artifact links, and
> `route: nothing` plus `routeReason` is the reasoned, retained tombstone. The first three legs are
> therefore machine-witnessed by the narrow CLI friction suite. Leg 4 remains human because deciding
> whether signal contains durable essence, and what it should become, is the synthesist's genuine
> judgment gap; a schema or generated-agent check can prove wiring but cannot honestly prove that
> judgment.

1. **Cite (reinforce)** _(witness: machine)_ _(proof-gate: feedback-graduation#gate-1)_: reinforce an
   existing friction item with concrete recurrence evidence. **Success —** the command appends an
   attributable `{ branch, date, evidence }` entry to `reinforcedBy`, re-filing
   the same id is refused, and recurrence is represented by those links rather than a stored vote
   counter. *(proven by `friction.test.ts`: “reinforce appends a reinforcedBy entry (never a twin)”
   and “new refuses re-filing an existing id”.)*
2. **Cite (link across artifacts)** _(witness: machine)_ _(proof-gate: feedback-graduation#gate-1)_:
   capture a friction item whose shared `references` points to an implicated Library artifact.
   **Success —** a resolvable reference is accepted as the cross-artifact edge and an unresolved
   reference is refused, so signal cannot claim a dangling graph link. *(proven by
   `friction.test.ts`: “new refuses an unresolvable reference; a resolvable one passes”.)*
3. **Archive** _(witness: machine)_ _(proof-gate: feedback-graduation#gate-1)_: route a handled item
   to `nothing` with a reason, then reinforce the archived item with later recurrence evidence.
   **Success —** `route: nothing` projects to `archived`, a missing `--reason` is refused, and the
   retained item still accepts a `reinforcedBy` entry instead of being deleted. *(proven by
   `friction.test.ts`: “lifecycleOf projects open / archived from route”, “route refuses a missing
   --reason”, and “reinforce records a recurrence on an ARCHIVED item”.)*
4. **Synthesis** _(witness: human)_: the graduation-synthesist reads the connected friction signal
   with comments, agent-memory candidates, and the decision log, applies the
   `friction-adjudication` process and `friction-justification-bar`, and routes the durable essence.
   **Success —** the chosen `route` and its `routeReason` clear the justification bar against the
   evidence actually cited — the evidence *supports* the claim, and the essence is durable enough to
   be worth guidance at all — and only a genuine `owner-fork-bar` fork is escalated. Sufficiency and
   durability are value calls with **no compiler**: no schema, count, or generated-agent check can
   decide whether this evidence earns this guidance. That is a judgment gap, not a missing harness
   (`human-witness-is-a-judgment-gap-not-cost`).
   *Scope (re-adjudicated 2026-07-26, ADR-0209 D8): the mechanically checkable half formerly fused
   into this leg — that the emitted artifact carries a walkable link back to the signal it was
   synthesised from — is **not** part of this human verdict. It is already authored as
   [`signal-synthesis`](signal-synthesis.md) would-be contract 2 `provenance-is-walkable`, so it is
   referenced here rather than split into a new leg. This leg judges only whether the routing call
   was right.*

## Reliability Gates

1. **The landed reinforcement, cross-artifact-link, and reasoned-archive seams are green**
   _(gate: observe)_ `pnpm --filter @storytree/cli exec node --import tsx --test src/friction.test.ts`.
   The narrow suite directly exercises the real friction command dispatch against an in-memory
   store: it appends evidence-bearing `reinforcedBy` links without duplicating an item, accepts only
   resolvable cross-artifact `references`, and retains a reasoned `route: nothing` tombstone that can
   record later recurrence. This gate exists only for UAT legs 1–3 and claims no coverage of the
   synthesis judgment in leg 4.

## Open modeling calls (for the owner)

1. **RESOLVED by ADR-0032 — cite identity (ADR-0014's C4).** Identity is provenance on the cite
   `actor`, not a gate in a threshold. `citedBy`/`actor` resolves through the fail-closed signer
   chain; what an *agent-session* cite is worth is the residual that ties to `open-questions.md` §1
   and is the current graduation-synthesist's concern, not the cite primitive's.
2. **RESOLVED by ADR-0032 and LANDED by ADR-0168 D5 — graduation shape.** Not a deterministic
   threshold scan: the graduation-synthesist chairs evidence-justified routing and escalates genuine
   owner forks. No threshold policy to set; no anti-gaming machinery to build.
3. **RESOLVED (2026-06-11) — the cross-story interfaces are declared** per ADR-0010 §4, alongside
   their owning stories (ADR-0010 names no canonical location; the schema term stays provisional):
   the **comment substrate** at
   [`stories/studio/interface-comment-substrate.md`](../studio/interface-comment-substrate.md)
   and the **OQ/proposal authoring path** at
   [`stories/library/interface-oq-proposal-authoring.md`](../library/interface-oq-proposal-authoring.md).
   This story is their first declared consumer.
