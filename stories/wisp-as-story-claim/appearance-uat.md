---
id: "appearance-uat"
tier: capability
story: wisp-as-story-claim
title: "Appearance UAT — on the forest map, does the claim-wisp LOOK right?"
outcome: "The human-eyes leg: on the real forest map, exactly one wisp per claimed story, the colour shifts by the active subagent, claimed is visibly distinct from proven-green, and the wisp clears on merge — operator-attested, never self-attested."
status: proposed
proof_mode: operator-attested
depends_on: [render-claim-as-wisp, colour-by-subagent, ci-clear-on-merge, take-claim-at-spawn]
decisions: [138, 70, 45, 99]
# OPERATOR-ATTESTED (ADR-0070), the story's UAT node. The headline outcome is a LOOK on the forest map — a
# "does it appear right" judgement an agent cannot drive or self-attest (ADR-0044 attestation ≠ proof; an
# agent can NEVER self-exempt to `healthy`). This is the ADR-0138 §5 honesty wall made visual: claimed must
# look distinct from proven-green. It composes B (render), C (colour), D (clear) and E (claim-at-spawn) into
# the single human-witnessed walkthrough. NO `proof:` block — operator-attested capabilities are witnessed,
# not `--real`-built. It carries no `--real` arm and no contracts; its proof is the four UAT legs below,
# witnessed by a human running the studio against the live store.
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
> story's UAT node; the four legs below mirror the story-level Story UAT.

## Guidance

This is the visual proof, witnessed by a person — it has no unit test and cannot be driven `--real`
(operator-attested, ADR-0070). Bring the studio up against the **live store** (`pnpm db:up` then
`pnpm --filter studio dev`, or the hosted studio) on the forest map and witness the four legs. A surface an
agent cannot exercise is flagged a **human-witness UAT action**, never silently skipped (the gap is
recorded, not hidden).

- **One claim drives exactly one wisp on the STORY node** — not on its capabilities, not two. The grain is
  the story (ADR-0138 §2).
- **A second claim on the same story is refused** — no second wisp; the holder is named (the coordination
  payoff: sessions stop stomping each other).
- **The §5 honesty wall holds on the map** — a claimed-but-not-proven wisp must read as **clearly different**
  from a real signed-verdict green **bloom** (ADR-0045). If they look alike, the map inflates proof and this
  leg FAILS regardless of the data.
- **The wisp clears on merge** — after the holder's branch merges and the CI sweep runs (capability D), the
  claim-wisp disappears; no stale zombie remains.

## UAT (operator-attested — the story's UAT node)

The four human-witnessed legs that prove the story's goal end-to-end on the real forest map. Each is
_(witness: human)_; an agent may set the stage (claim a story, drive a build) but a human renders the verdict.

1. **One wisp per claimed story.** _(witness: human)_ A claimed story shows exactly one wisp on its node; a
   second session claiming it is refused and told the holder (no second wisp).
2. **Colour shifts by the active subagent.** _(witness: human)_ As the orchestrator authors → proves →
   supplements on the claimed story, the wisp's colour changes across the three states, distinguishably.
3. **Claimed is visibly distinct from proven-green.** _(witness: human)_ The claimed-but-not-proven wisp
   looks clearly different from a story carrying a real signed-verdict green bloom — the §5 honesty wall, on
   the map.
4. **The wisp clears on merge.** _(witness: human)_ When the holder's branch merges (the CI release sweep
   runs), the story's claim-wisp disappears — no stale zombie wisp.
