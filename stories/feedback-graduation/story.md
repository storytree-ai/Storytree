---
id: "feedback-graduation"
tier: story
title: "Feedback graduation — linked feedback is routed by the graduation synthesist"
outcome: "The landed graduation-synthesist routes attributable, connected feedback signal into justified Library work or owner escalation."
status: proposed
proof_mode: UAT
# ALL THREE ORIGINAL CAPABILITIES WERE RETIRED 2026-08-31 (see "Capabilities" below). They are
# absent from this list deliberately — a retired node leaves its story's `capabilities:` array, and
# the three spec files remain on disk as the browsable record. An empty list is legal and has
# precedent (`stories/proof-protocol`, `stories/storage-protocol`, `stories/website`). The story's
# own outcome is DELIVERED and its UAT legs 1-3 are green: they are the only assertion of the landed
# friction seam anywhere in the hierarchy, so this story is emphatically NOT retired with them.
capabilities: []
# Story-level edges: the "Cross-story boundary" section below, encoded (declared
# interfaces, ADR-0010 §4; owner call #3 resolved 2026-06-11). ADR-0036.
# KEPT THROUGH THE 2026-08-31 CAPABILITY RETIREMENT, deliberately and not by oversight. The retired
# nodes were the DECLARED consumers of both interfaces, but the story-grain test is whether this
# story's own UAT needs the upstream outcome, and it still does: UAT leg 4 names comments as an input
# to the synthesis judgement (the comment STORE survives ADR-0425 as the multiplayer revival
# foundation, D5 — only the studio-side commenting SURFACE was retired), and the synthesist authors
# open-questions and born-`proposed` ADRs through `library`'s path. Neither edge is a code import.
depends_on: [studio, library]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, library]
# Deciding ADRs (ADR-0037 §2): 32 = the mechanism, 168 = the landed adjudication seat. Added
# 2026-08-31 with the capability retirement: 68 dissolved the packages the contracts named, 298
# retired the `proposal` kind the synthesis output was specified as, 425 retired the comment
# substrate the cite/archive nodes sat on, and 477 retired the citation tier the signal-graph needed.
decisions: [32, 68, 168, 298, 425, 477]
---

# Feedback graduation — linked feedback is routed by the graduation synthesist

**Outcome —** The landed graduation-synthesist routes attributable, connected feedback signal into
justified Library work or owner escalation.

> **Renamed from `notice-board` (2026-06-11, owner call).** The `notice-board` name now belongs to
> the session-presence coordination story ([`stories/notice-board`](../notice-board/story.md),
> ADR-0033) — the legacy-lineage meaning of the term (sessions seeing each other in flight). This
> story is the *feedback* organ that legacy called the forum: cites, archival, and graduation.

This is the cite / graduation mechanism that ADR-0027
carried forward from the superseded ADR-0014, and that
ADR-0032 now **decides**. The
**post substrate is already built and is NOT re-scoped here**: posts/comments persist as typed
events (`events.comment` projection + append-only `events.comment_event`; `PgCommentStore` in
`packages/library/src/store/pg-comment-store.ts`), and the studio reads/writes them against the
shared store — though **ADR-0425 D1 has since retired studio COMMENTING** (deliberately, with
MULTIPLAYER named as the revival trigger in D2); the comment store itself is kept as that revival's
foundation (D5). ADR-0168 subsequently landed the current graduation route on the `friction` artifact
surface: recurrence appends evidence to `reinforcedBy`, `route: nothing` plus `routeReason` retains a
reasoned tombstone, an implicated arc is reached by a DERIVED read, and the built
`graduation-synthesist` chairs routed synthesis.

**Hierarchy / proof status — ADJUDICATED 2026-08-31; this story now carries ZERO capabilities.** The
three original capability nodes were **RETIRED**, not left `proposed`. They were never built, their
contracts named `packages/core` and `packages/store` (both dissolved by ADR-0068), and each one's
outcome turned out to be either delivered under a different mechanism or decided against outright —
so none of them had anything left to name. The per-node evidence is in the three spec files, which
stay on disk as the record; the summary is under "Capabilities" below.

**The story itself is emphatically NOT retired, and its outcome is DELIVERED.** The behaviour lives
on the Library/CLI friction surface and in the live `graduation-synthesist` agent, and this story's
UAT legs 1-3 are the ONLY assertion of that landed seam anywhere in the hierarchy. What no longer
exists is any claim that a dedicated `events.cite` store or a dedicated comment/post archival
projection is still coming: the first is foreclosed by ADR-0477 D1 and the second by ADR-0425 D1.

## Design floor (from ADR-0032, the deciding ADR)

- A **comment** is a signal that an artifact needs attention. A **cite** is a typed **link**, not a
  counter: it reinforces a signal *and* connects signals and artifacts — and a cite may target
  another **artifact**, not just a comment — so cites compose into a **signal-graph** across the
  whole system. **The dedicated cite-event store was never built and is now foreclosed:** ADR-0477 D1
  (2026-08-29, owner-directed) retired the `references` field corpus-wide and made the authored
  `depends_on` edge "the ONLY edge the library carries", which is precisely the second pointer set a
  signal-graph would need. ADR-0168's landed path realizes REINFORCEMENT as evidence-bearing
  `reinforcedBy` entries; the surviving cross-artifact relation is DERIVED (an arc whose OPEN
  increment names the item in `frictionRefs`), never a stored citation. Any count is derived, never
  stored.
- **Graduation is the landed `graduation-synthesist`**: it reads accumulated signal with the
  whole-system view, applies the `friction-adjudication` process and
  `friction-justification-bar`, sets `route` / `routeReason`, and escalates only genuine owner forks.
  There is **no** deterministic cite-threshold scan and **no** auto-promotion.
- Wrong or handled friction is **archived with a reason**, never deleted:
  `route: nothing` plus `routeReason` retains a re-openable tombstone outside the open worklist.
  The analogous dedicated comment/post archival projection was never built and is not coming — its
  substrate went with ADR-0425 D1. One asymmetry is worth knowing: a PEER's `routeReason` is
  protected byte-for-byte against overwrite, while a SAME-BRANCH re-route replaces your own prior
  reason in the projection, recoverable only from the append-only log
  (`storytree library artifact history <id> --field routeReason`).
- **No anti-gaming machinery** (cite-density math, forge defences, signal-vs-noise thresholds) — a
  deliberate non-goal per ADR-0032 §5, revisited only on observed evidence of abuse.

## Capabilities (0) — all three RETIRED 2026-08-31

This story carries no capabilities. That is a recorded adjudication, not an authoring gap: all three
original nodes described ADR-0032's **dedicated-store design**, which was superseded in practice and
then foreclosed by decision. Each spec file stays on disk with its own evidence and its contracts
restated as dispositions.

| retired node | end-state | why |
|---|---|---|
| [`cite-event`](cite-event.md) | RETIRE | Two halves, settled in opposite directions. Reinforcement is DELIVERED — ADR-0168 D2 says `reinforcedBy` "realizes ADR-0032's cite-as-reinforcement **without building the cite store**". The signal-graph half is DECIDED AGAINST — ADR-0477 D1 retired the citation tier and made `depends_on` the only edge the library carries. |
| [`archive-with-reason`](archive-with-reason.md) | RETIRE | Outcome delivered in full by the friction route, by name: `FrictionRoute`'s own schema comment reads "`nothing` is the archive-with-reason tombstone". Reasoned, retained, re-openable, and out of the open worklist — each half pinned by a test in `friction.test.ts`. |
| [`signal-synthesis`](signal-synthesis.md) | RETIRE | The "future synthesis agent" it describes EXISTS — `graduation-synthesist`, un-parked and built by ADR-0168 D5 on owner direction. The condition it was deferred on (identity §1) is the very fork that ADR exercised. |

Common to all three: none was ever built, and every contract named `packages/core` or
`packages/store` — **both dissolved by ADR-0068** — so each spec had been naming a destination that
could not exist. No `proof:` block was authored for any of them, because none has code to name.

## Dependency graph

**Empty — there are no live capability edges.** The one authored edge, `signal-synthesis` →
`cite-event` / `archive-with-reason`, is KEPT in the retired spec's frontmatter as lineage: all three
were adjudicated together in one pass, and clearing it would erase why they travel as one. Nothing
live depends on any of them.

The landed ADR-0168 route always went AROUND those nodes rather than through them: the
graduation-synthesist consumes friction artifacts whose `reinforcedBy` carries the recurrence
evidence and whose `route` carries the archive reason, and reaches an implicated arc by a DERIVED
read rather than by a stored citation.

**Cross-story boundary (owner call #3 — resolved, declared 2026-06-11):** every capability here
consumes the **comment/post substrate** owned by `studio`
([declared interface](../studio/interface-comment-substrate.md) — `events.comment*` via
the store seam), and the landed graduation-synthesist routes through the **open-question / proposal
authoring path** owned by the `library` story
([declared interface](../library/interface-oq-proposal-authoring.md) — the ADR-0018 OQ→ADR flow).
Per ADR-0010 §4 these are declared interfaces, not absorbed behaviour.

## UAT Test Criteria

**Goal —** Feedback becomes attributable, connected signal: recurrence reinforces an existing item,
the implicated arc is reachable from the item, a reasoned tombstone removes handled signal from the
open worklist without erasing it, and the graduation synthesist judges what durable guidance (if any)
the accumulated signal warrants.

> **Current seam (ADR-0168, corrected 2026-08-31 for ADR-0477).** The dedicated `events.cite` store
> was never built and is now foreclosed. The landed graduation path realizes the same semantic roles
> on `friction` artifacts: `reinforcedBy` is the attributable reinforcement edge, and
> `route: nothing` plus `routeReason` is the reasoned, retained tombstone.
> **The cross-artifact link is no longer a stored citation.** ADR-0477 D1 retired the `references`
> field corpus-wide — `friction.test.ts` now pins its ABSENCE ("the retired citation field is never
> written") — so the relation is DERIVED instead: an arc carrying an OPEN increment that names the
> item in `frictionRefs` is what parks its remedy, and `friction route --route tool` reads that
> derivation rather than writing an edge back onto the row (ADR-0298 D2). Leg 2 was rewritten onto
> that mechanism in the same pass; it previously asserted the retired field and cited a test that no
> longer exists, which the green gate could not have revealed. The first three legs are
> machine-witnessed by the narrow CLI friction suite. Leg 4 remains human because deciding whether
> signal contains durable essence, and what it should become, is the synthesist's genuine judgment
> gap; a schema or generated-agent check can prove wiring but cannot honestly prove that judgment.

> **The three capabilities named below were RETIRED on 2026-08-31 — and that STRENGTHENS these legs
> rather than weakening them.** The ADR-0294 D2 note that follows already found there was no
> capability rung signing this story rung. The adjudication confirmed why and made it explicit in the
> hierarchy: the three nodes described a dedicated-store design that was superseded in practice and
> then decided against, so they were retired rather than left `proposed`. These legs remain the only
> assertion of the landed friction seam anywhere in the hierarchy, and no capability will ever
> duplicate them.

> **ADR-0294 D2 pass — 2026-08-21: legs 1, 2 and 3 were examined and KEPT. Nothing here was deleted,
> and a later pass should not re-open them without new evidence.** They were candidates only because
> their gate command names one package (`pnpm --filter @storytree/cli exec node --import tsx --test
> src/friction.test.ts`) and `packages/cli` carries no story-rung `*.uat.test.ts`. Applying the
> discriminator D2 actually requires — *read the suite; the binding is not the proof* — the premise
> fails: **there is no capability rung signing this story rung, because no capability proves this
> behaviour at all.** This story's three capabilities were authored against the `events.cite` design
> ADR-0168 records as never built, and every one of their contracts was a would-be pointed at files
> that do not exist: [`cite-event`](cite-event.md) contracts 1–3 named
> `packages/core/src/cite.test.ts` and `packages/store/src/cite-store.test.ts` — both in packages
> ADR-0068 DISSOLVED — and [`archive-with-reason`](archive-with-reason.md) was the same shape;
> [`signal-synthesis`](signal-synthesis.md) was explicitly headed "Contracts (would-be)". *(All three
> are now RETIRED — 2026-08-31 — which is the end-state this observation was pointing at.)* Meanwhile
> `packages/cli/src/friction.test.ts` is owned at STORY grain — `repo-manifest.json` →
> `sourceOwnership.subtrees` maps `packages/cli/src/*friction*.ts` to `feedback-graduation`, not to
> any capability. So these legs are the ONLY assertion of the landed friction seam anywhere in the
> hierarchy; deleting them would delete the claim, not relocate it, which is exactly the case
> ADR-0294 D2 reserves ("a criterion with no such node is NOT a duplicate").
>
> **What IS true, and is a D1 observation rather than a D2 one:** three legs each asserting one
> command's behaviour read as a specification, not a walkthrough, and they already share one gate and
> one test file. Folding them into a single journey step — file an item, reinforce it with recurrence
> evidence, park its remedy on an arc and route it there, then route it to `nothing` with a reason and
> reinforce the archived item — is the honest D1 shape. *(Restated 2026-08-31: the original wording
> opened with "file an item carrying a resolvable reference", which ADR-0477 D1 made impossible.)*
> That is a re-authoring, not a deletion, and it
> is deliberately NOT done here: this increment's mandate is D2, and merging criteria mints a new
> criterion identity and would be the corpus's first use of the `(lineage: merged-from …)` tag. Left
> for whoever executes D1 on this story.

1. **Cite (reinforce)** _(witness: machine)_ _(proof-gate: feedback-graduation#gate-1)_: reinforce an _(criterion-id: uatc_a37bd1982dbf19f121cdfff0)_ _(revision-id: uatr1:90dc464b4a920069)_
   existing friction item with concrete recurrence evidence. **Success —** the command appends an
   attributable `{ branch, date, evidence }` entry to `reinforcedBy`, re-filing
   the same id is refused, and recurrence is represented by those links rather than a stored vote
   counter. *(proven by `friction.test.ts`: “reinforce appends a reinforcedBy entry (never a twin)”
   and “new refuses re-filing an existing id”.)*
2. **Link across artifacts (the derived edge)** _(witness: machine)_ _(proof-gate: feedback-graduation#gate-1)_: _(criterion-id: uatc_c628af1bba458b7c60a5afe9)_ _(revision-id: uatr1:ef7bfdae6e8b3c61)_ _(previous-revision-id: uatr1:24bc0e85d6af42f7)_
   park a friction item's remedy on the arc that owns it, then route the item there. **Success —**
   the arc-to-item relation is DERIVED from an OPEN increment naming the item, never written back
   onto the row: routing to `tool` is refused until such an entry exists, an entry naming a different
   item does not park this one, and the bare command succeeds the moment one does — so signal cannot
   claim a link nothing carries. *(proven by `friction.test.ts`: “routing to `tool` is refused until
   the item cites an arc that parks it (ADR-0298 D2)”, “an entry naming a DIFFERENT friction item
   does not park this one”, and “an OPEN entry naming the item parks it WITHOUT --arc — the derived
   read is what answers”.)*
3. **Archive** _(witness: machine)_ _(proof-gate: feedback-graduation#gate-1)_: route a handled item _(criterion-id: uatc_4373de56ee04814cef691bb0)_ _(revision-id: uatr1:beb5000e76d5e965)_
   to `nothing` with a reason, then reinforce the archived item with later recurrence evidence.
   **Success —** `route: nothing` projects to `archived`, a missing `--reason` is refused, and the
   retained item still accepts a `reinforcedBy` entry instead of being deleted. *(proven by
   `friction.test.ts`: “lifecycleOf projects open / archived from route”, “route refuses a missing
   --reason”, and “reinforce records a recurrence on an ARCHIVED item”.)*
4. **Synthesis** _(witness: human)_
   _(witness-basis: whether this evidence earns this guidance is a sufficiency and durability value
   call with NO oracle — no schema, count or generated-agent check can decide it — so this is a
   judgment gap rather than a missing harness. It therefore dissolves under neither a new harness nor
   cheaper spend; it would retire only if the justification bar itself became a mechanical predicate,
   which would be a narrower claim than the one this leg makes.)_: the graduation-synthesist reads the connected friction signal _(criterion-id: uatc_03ea0411c6fce01ae8ff93bd)_ _(revision-id: uatr1:dded338fa5c3cb96)_ _(previous-revision-id: uatr1:e1bb663cf55612da)_
   with comments, agent-memory candidates, and the decision log, applies the
   `friction-adjudication` process and `friction-justification-bar`, and routes the durable essence.
   **Success —** the chosen `route` and its `routeReason` clear the justification bar against the
   evidence actually cited — the evidence *supports* the claim, and the essence is durable enough to
   be worth guidance at all — and only a genuine `owner-fork-bar` fork is escalated. Sufficiency and
   durability are value calls with **no compiler**: no schema, count, or generated-agent check can
   decide whether this evidence earns this guidance. That is a judgment gap, not a missing harness
   (`human-witness-is-a-judgment-gap-not-cost`).
   *Scope (re-adjudicated 2026-07-26, ADR-0209 D8; re-pointed 2026-08-31): the mechanically checkable
   half formerly fused into this leg — that the emitted artifact carries a walkable link back to the
   signal it was synthesised from — is **not** part of this human verdict. It was referenced to a
   would-be contract on `signal-synthesis`, which is now RETIRED; the walk itself is real and is
   proven by the derived arc-to-item read that leg 2 above asserts, plus the `--discharged-by`
   delivery stamp. The scope SPLIT is unchanged — only the pointer moved, from a would-be contract to
   the leg that actually proves it. This leg judges only whether the routing call was right.*

## Reliability Gates

1. **The landed reinforcement, cross-artifact-link, and reasoned-archive seams are green**
   _(gate: observe)_ `pnpm --filter @storytree/cli exec node --import tsx --test src/friction.test.ts`.
   The narrow suite directly exercises the real friction command dispatch against an in-memory
   store: it appends evidence-bearing `reinforcedBy` links without duplicating an item, derives the
   cross-artifact link from an arc's OPEN increment naming the item (refusing the `tool` route until
   one exists, and writing nothing back onto the row), and retains a reasoned `route: nothing`
   tombstone that can record later recurrence. *(Corrected 2026-08-31: this read "accepts only
   resolvable cross-artifact `references`" — ADR-0477 D1 retired that field, and the suite now pins
   its absence.)* This gate exists only for UAT legs 1–3 and claims no coverage of the synthesis
   judgment in leg 4.

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
   *(Amended 2026-08-31 with the capability retirement — the DECLARATIONS stand, both consumers
   changed. The comment substrate's declared consumers were `cite-event` and `archive-with-reason`,
   now retired, and ADR-0425 D1 retired studio commenting itself; the substrate keeps its own value
   as the named MULTIPLAYER revival foundation (D5), and this story no longer consumes it. The
   authoring path's declared consumer was `signal-synthesis`, now retired; the live
   `graduation-synthesist` consumes that path in a changed form — the `proposal` half was retired by
   ADR-0298 D2 in favour of a parked arc increment, leaving the `open-question` and born-`proposed`
   ADR halves. Both interface files still name the retired nodes and are their owning stories' to
   correct, not this one's.)*
