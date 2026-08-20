---
id: "appearance-uat"
tier: capability
story: wisp-as-story-claim
title: "Appearance UAT — on the forest map, does the graded claim-wisp LOOK right?"
outcome: "The human-eyes leg: on the real forest map, exactly one wisp per claimed story shaped by its grade (exploring hovers, work orbits, waiting queues, a released claim fades), the colour shifts by the active subagent, claimed is visibly distinct from proven-green, and the wisp clears on merge — operator-attested, never self-attested (owner-attested 2026-07-17)."
status: proposed
proof_mode: operator-attested
depends_on: [render-claim-as-wisp, colour-by-subagent, ci-clear-on-merge, take-claim-at-spawn]
decisions: [138, 70, 45, 99]
# OPERATOR-ATTESTED (ADR-0070), the story's UAT node. The headline outcome is a LOOK on the forest map — a
# "does it appear right" judgement an agent cannot drive or self-attest (ADR-0044 attestation ≠ proof; an
# agent can NEVER self-exempt to `healthy`). This is the ADR-0138 §5 honesty wall made visual: claimed must
# look distinct from proven-green. It composes B (render), C (colour), D (clear) and E (claim-at-spawn) into
# the human-witnessed walkthrough. NO `proof:` block — operator-attested capabilities are witnessed,
# not `--real`-built. It carries no `--real` arm and no contracts; its proof is the four HUMAN UAT legs
# below, witnessed by a human running the studio against the live store.
# WITNESS RE-ADJUDICATION 2026-07-26 (ADR-0209 D8): the story's four fused legs split into ELEVEN — seven
# `machine`, four `human`. This capability keeps exactly the four HUMAN ones (story legs 4, 6, 8, 11); the
# counts, placements, contention logic, structural honesty wall and release sweep that were welded onto
# them are `machine` legs now, discharged in B's, C's and A's own harnesses rather than by an operator.
# NARROWED 2026-08-11 (ADR-0348 D6): those four HUMAN legs were DELETED at the STORY tier as user
# EXPERIENCE rather than user ACCEPTANCE claims, so this capability is now the ONLY place they exist —
# the story-leg numbers below are the derivation record, not live pointers. D6 is story-tier only and
# does NOT touch this capability's ADR-0070 stage-2 operator-attested node; whether the owner's
# "doesn't have to exist in a gate" reaches the capability tier is an OPEN FORK ADR-0348 deliberately
# left unanswered — put it to the owner rather than extending D6 by analogy.
# The capability's own `proof_mode` is unchanged — still the operator-attested UAT node, just a narrower
# and more honest one.
---

# Appearance UAT — does the claim-wisp LOOK right?

**Outcome —** The **human-eyes leg**: on the real forest map, exactly **one wisp per claimed story**, the
colour **shifts by the active subagent**, **claimed is visibly distinct from proven-green**, and the **wisp
clears on merge**. **Operator-attested** (ADR-0070), **never self-attested** — this is the story's UAT node
and the ADR-0138 §5 honesty wall made visual.

**Depends on —** [`render-claim-as-wisp`](render-claim-as-wisp.md),
[`colour-by-subagent`](colour-by-subagent.md), [`ci-clear-on-merge`](ci-clear-on-merge.md),
[`take-claim-at-spawn`](take-claim-at-spawn.md) — F composes all four into the single end-to-end
walkthrough.

> **Proof status (honest) — `proposed`, operator-attested (ADR-0070).** A "does it LOOK right" judgement on
> a rendered forest map cannot be machine-driven or self-attested: an agent can never self-exempt a unit to
> `healthy` (ADR-0044 — attestation ≠ proof; only a human-anchored signed verdict or an honest machine UAT
> reaches green). The CI-honest cores beneath this leg are proven in isolation — A's `releaseClaimsByBranch`
> against `storytree_test`, B's pure fold, C's pure colour mapping, E's pure seam. This capability is the
> thin appearance binding witnessed by a human running the studio against the live store. It is the
> story's UAT node; the four legs below are the story's four HUMAN legs (4, 6, 8, 11) after the
> 2026-07-26 witness re-adjudication — the seven `machine` legs are proven elsewhere, not witnessed here.

## Guidance

This is the visual proof, witnessed by a person — it has no unit test and cannot be driven `--real`
(operator-attested, ADR-0070). Bring the studio up against the **live store** (`pnpm db:up` then
`pnpm --filter studio dev`, or the hosted studio) on the forest map and witness the four legs. A surface an
agent cannot exercise is flagged a **human-witness UAT action**, never silently skipped (the gap is
recorded, not hidden). **Set the stage, then judge only the READING** — since 2026-07-26 the countable
half of each bullet below is a machine leg, so an operator who re-checks counts here is doing a spec's
job with an eye.

- **The three stages read apart** — the window-shopper's local orbit beside the tree, the stationary
  queue, the whole-island work orbit. *(The grain is the story, ADR-0138 §2; that the count and the
  anchoring are right is story legs 1–2, not this.)*
- **Contention reads as coordination, not as a duplicate** — a second session queues visibly behind the
  holder rather than appearing as a second island orbit. *(That the store refuses and names the holder is
  the capability [`claim-store-work-time`](claim-store-work-time.md)'s, at
  `packages/notice-board/src/store/claim-store.test.ts`. This read "is story leg 3"; that leg was deleted
  on 2026-08-20 by the ADR-0294 D2 pass as a duplicate of exactly that proof, so the claim is named where
  it lives rather than by a burned ordinal. Corrected in place per ADR-0139.)*
- **The §5 honesty wall holds on the map** — a claimed-but-not-proven wisp must read as **clearly different**
  from a real signed-verdict green **bloom** (ADR-0045). If they look alike, the map inflates proof and this
  leg FAILS regardless of the data.
- **The departure reads as a walking-away** — after the holder's branch merges and the CI sweep runs
  (capability D), the claim-wisp fades and goes, and that fade reads as *just left* rather than as a claim
  that was dropped. *(That the rows were actually released and that no zombie survives the window are
  story legs 9–10.)*

## UAT (operator-attested — the story's UAT node)

The **human-witnessed** legs that prove the story's goal on the real forest map. An agent may set the
stage (claim a story, drive a build) but a human renders the verdict.

> **Re-adjudicated 2026-07-26 (ADR-0209 D8).** These four legs used to be the story's WHOLE UAT set, each
> fusing a countable claim onto a felt one. The story's `## UAT Test Criteria` then carried **eleven** legs
> — seven `machine`, four `human` — and this capability kept exactly the four HUMAN ones, renumbered to
> match the story: **story legs 4, 6, 8 and 11**. The counts, placements, contention logic, structural
> honesty wall and merge-release sweep that were welded onto these legs became **story legs 1, 2, 3, 5, 7,
> 9 and 10**, discharged by specs in B's, C's and A's own harnesses — not by an operator's eye. *(Legs 3
> and 7 of that set were themselves deleted on 2026-08-20 by the ADR-0294 D2 pass, as duplicates of the
> capability-tier proof they named; the story now carries 1, 2, 5, 9 and 10. Nothing this capability
> claims changes — the felt half was never on those legs. Corrected in place per ADR-0139.)* Nothing felt
> was reclassified; the human set got NARROWER and more honest, not weaker.
>
> **NARROWED AGAIN 2026-08-11 (ADR-0348 D6): the four story-tier human legs are DELETED.** The story now
> carries seven `machine` legs and zero `human` ones, so **legs a–d below are the only place these four
> claims exist** and the "story leg N" labels are the DERIVATION RECORD, not live pointers — those
> ordinals were burned, never reassigned, so none of them now denotes a different claim. Because this
> capability already restated all four near-verbatim, D6 COMPLETES ADR-0294 D3 here rather than
> diverging from it, and nothing needed relocating. **D6 is story-tier only** and leaves this
> capability's ADR-0070 stage-2 operator-attested node exactly as it was.
>
> **Owner-attested 2026-07-17** (the graded claim-wisps landed default-ON — hover / queue / orbit +
> departure fades — and the owner signed the look; ADR-0200 D7 gated the presence-core retirement on that
> attestation). That signature was given against the *hover / queue / orbit* claim now carried by **leg
> a** below (story leg 4) and the *departure fade* claim now carried by **leg d** (story leg 11). It never
> covered legs b or c. Per ADR-0209 D6 every re-adjudicated leg returns UNSTAMPED — so the attestation is
> preserved here as a RECORD with a leg to attach to, not as a live green, and **whether it carries
> forward onto the split legs or must be re-signed is an open owner call** (story `## Open modeling
> calls`, call 1). No agent resolves that in either direction. **The 2026-08-11 story-tier deletion does
> not resolve it either** — it moves the question one rung down, onto legs a and d here, and this
> preamble is now the COMPLETE copy of the record. The call stays OPEN; ADR-0348 D7's supersession
> ruling reaches `agent` leg 1 only and is deliberately not generalised.

- **a. The three stages READ apart at a glance** _(story leg 4 — witness: human; the 2026-07-17 signature
  was given here)_ — an `exploring` window-shopper, a `waiting` queue and a `work` island orbit on one
  story are legible as three DIFFERENT things without a tooltip, not a soup of near-identical dots.
- **b. The three colour states are distinguishable to the eye** _(story leg 6 — witness: human; NOT in the
  2026-07-17 attestation)_ — authoring / proving / supplementing read as three different states at map
  scale and map opacity, and none of them reads as *green / proven*.
- **c. Claimed LOOKS clearly different from proven-green** _(story leg 8 — witness: human; NOT in the
  2026-07-17 attestation)_ — the §5 honesty wall on the map, including the hard case of one story carrying
  a claim wisp AND an in-window bloom at once. If they look alike this FAILS regardless of what the data
  says — and the structural proof that the two families share no code is precisely NOT this claim. *(That
  structural proof was story leg 7 until the ADR-0294 D2 pass deleted it on 2026-08-20 as a duplicate; it
  lives at `render-claim-as-wisp`'s `claim-activity-is-visibly-distinct-from-proven-green`, `render-core`'s
  §5 walks in `packages/forest-world/src/scene.test.ts`, and `app-surface-world-view`'s class-level walls
  in `packages/app-surface/src/SceneView.test.tsx`. Corrected in place per ADR-0139.)*
- **d. The departure reads as *just left*, not as *lost*** _(story leg 11 — witness: human; the 2026-07-17
  signature was given here)_ — the fade reads as a session having walked away, never as a claim dropped or
  silently vanished. A permanent regression case: the opposite reading was a real recorded defect
  (`friction-released-build-wisp-reads-as-lost-claim`).
