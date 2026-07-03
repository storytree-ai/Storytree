---
id: "wisp-as-story-claim"
tier: story
title: "The forest wisp becomes a forced, CI-cleared story-claim — one coordination + observability layer"
outcome: "The forest map shows one wisp per claimed story, coloured by the active subagent and visibly distinct from a proven-green bloom, taken at spawn and cleared on the CI merge — so sessions never stomp each other and the map answers both who-is-here and is-a-proof-running."
# Newly MAPPED arc (ADR-0138, proposed): the coordination+observability layer is decomposed and wired,
# not yet built. Status is `proposed` (authored, awaiting build), distinct from `mapped` (untouched) and
# `healthy` (proven in the fold). The honest end-state is reached cap-by-cap (A–E proven red→green) plus
# the operator-attested appearance UAT (F).
status: proposed
proof_mode: operator-attested
# The story's headline outcome is a LOOK on the forest map — one wisp per claimed story, colour by active
# subagent, claimed visibly distinct from proven-green, the wisp clearing on merge. That is a human-eyes
# leg (ADR-0070): the UAT node (capability F) is operator-attested, never self-attested. uat_witness is
# absent ⇒ `human` (ADR-0040 fail-closed) — the appearance cannot be machine-witnessed.
capabilities: [claim-store-work-time, render-claim-as-wisp, colour-by-subagent, ci-clear-on-merge, take-claim-at-spawn, claim-at-declare, appearance-uat]
# The within-story DAG (ADR-0010 §3): A is the root (the claim-store deltas everything stands on); B, C,
# D, E each consume A; F (the appearance UAT) depends on B, C, D, E. Mirrors the capability depends_on.
# claim-at-declare joined AFTER delivery (ADR-0142, landed work documented post-hoc): the declare-time
# acquisition wiring for §3's work-time claim — it consumes A like its siblings; F predates it, so no F
# edge is claimed.
edges:
  - from: render-claim-as-wisp
    to: claim-store-work-time
    rationale: "B reads the work-time `events.node_claim` rows A generalises into map activity."
  - from: colour-by-subagent
    to: claim-store-work-time
    rationale: "C colours the claim-wisp by the active subagent/intent A's work-time claim carries."
  - from: ci-clear-on-merge
    to: claim-store-work-time
    rationale: "D's merge sweep calls A1's `releaseClaimsByBranch` to clear the claim on merge."
  - from: take-claim-at-spawn
    to: claim-store-work-time
    rationale: "E's spawn-seam acquires a work-time claim via A3's work-time `ClaimRequest` intent helper."
  - from: claim-at-declare
    to: claim-store-work-time
    rationale: "The declare-time acquisition (ADR-0142) claims via A3's `workClaimRequest` and adds the session-scoped bulk twins of A1/A2 (`releaseClaimsBySession` / `bumpHeartbeatsBySession`) to the same PgClaimStore."
  - from: appearance-uat
    to: render-claim-as-wisp
    rationale: "F witnesses the rendered claim-wisp B produces (one wisp per claimed story)."
  - from: appearance-uat
    to: colour-by-subagent
    rationale: "F witnesses the colour shift by active subagent C produces."
  - from: appearance-uat
    to: ci-clear-on-merge
    rationale: "F witnesses the wisp clearing on merge D wires."
  - from: appearance-uat
    to: take-claim-at-spawn
    rationale: "F witnesses that a claimed story (claimed at spawn by E) orbits exactly one wisp."
# Deciding ADRs (ADR-0037 §2): 0138 is the decision this story realises; it amends 0121/0033 (the claim),
# supersedes 0048 (fully — the wisp is the claim now, not the build) and corrects 0128 in place (session
# activity IS rendered, honestly), builds on 0137 (the orchestrator that holds + spawns under the claim),
# and keeps the §5 honesty wall (0045/0099). 0142 (amends 0138/0033) landed post-delivery: claim-at-declare
# is the live work-time acquisition, the branch dies on merge (CI-refused reuse), the wisp survives a
# landing as a blink (re-declare re-claims).
decisions: [138, 142, 121, 33, 128, 137, 45, 99, 70]
---

# The forest wisp becomes a forced, CI-cleared story-claim

**Outcome —** The forest map shows **one wisp per claimed story**, coloured by what the orchestrator is
currently doing on the story (authoring / proving / supplementing), **visibly distinct** from a
proven-green bloom, **taken at spawn** and **cleared on the CI merge** — so parallel sessions never stomp
each other and the map answers both *"who is here?"* (the claim) and *"is a proof running?"* (the proving
colour + the bloom).

This story realises [ADR-0138](../../docs/decisions/0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md):
the `events.node_claim` lock (built by ADR-0121 / ADR-0009, today taken only by a `--real` build and
invisible on the map) becomes the single **coordination + observability** layer. The wisp is the render of
the **claim**, not of the build; the build becomes a *colour state* of the claim-wisp (ADR-0048
generalised, not deleted).

## Framing

The forest map serves two jobs prior ADRs conflated: **observability** ("a proof is being mechanically
driven here") and **coordination** ("another session is working on this story; I should wait / pull main
after its merge / not stomp it"). ADR-0128 found the map honest-by-absence for observability (~92% of work
is not a driven build), but the coordination need is real and demonstrated — the recorded duplicate-build
collisions are sessions stomping each other for lack of a node-anchored "someone is here" signal. ADR-0138
unifies both onto the **claim**: forced at spawn (we own the outer + inner loop, ADR-0137 / ADR-0030),
cleared on the CI merge, staleness as a trace-driven backstop.

**The honesty wall (ADR-0138 §5, non-negotiable):** a claim's presence or colour is **never** a proof.
Only a real build's `CONFIRM_GREEN` + signed verdict paints the green **bloom**
([ADR-0045](../../docs/decisions/0045-live-activity-layer-is-verdict-blooms.md) /
[ADR-0099](../../docs/decisions/0099-synthetic-smoke-verdicts-must-not-derive-a-green-unit.md)). A
claimed-but-not-proven story must look **visibly different** from a proven-green one, or the map silently
inflates proof. This wall is the load-bearing constraint on capabilities B, C, and the appearance UAT F.

**The DAG.** `A → {B, C, D, E} → F`. A (the claim-store work-time deltas) is the root every other piece
stands on. B (render the claim as a wisp), C (colour by subagent/intent), D (CI clear on merge), and E
(take the claim at spawn) each consume A and are independent of each other. F (the operator-attested
appearance UAT) is the human-eyes leg, last, depending on B, C, D, E.

**Post-delivery: the acquisition landed at declare-time (ADR-0142).** E's spawn-path wiring (E2) was
deferred behind ADR-0137 Phase 3, which left the delivered layer with **no live acquisition path** — a
well-behaved session showed no wisp between builds. [ADR-0142](../../docs/decisions/0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md)
(amends 0138/0033) closed that gap the cheap way: `noticeboard declare --node <story> --pg` now also
takes the work-time claim ([`claim-at-declare`](claim-at-declare.md), landed PR #535), `done`
bulk-releases, the statusline heartbeat keeps claims out of stale-reclaim, and CI refuses a PR from an
already-merged head branch (*a branch is one landed unit* — what keeps D's branch-keyed clear from ever
erasing live work). Claim-at-SPAWN (E2) has since landed: its GATE half graduated as
chat-subagent-spawn's [`claim-gated-spawn`](../chat-subagent-spawn/claim-gated-spawn.md)
(`packages/agent/src/claim-gated-spawn.ts`, signed `--real` PASS), and the runtime mount followed
(that story's `spawn-tool-surface` / `spawn-deps-composition` caps, signed `--real` PASSes — the
claim-gated spawn tools mounted on `runHeadlessOrchestrator`, the real spawn deps threaded through
`orchestrate()`); only the desktop sidecar glue composing real deps (`backend-entry.ts`,
operator-attested) still stands between here and the spawn being the live hard point alongside the
declare-time wiring.

## Story UAT

The single human-witnessed walkthrough that proves the story's goal end-to-end on the **real forest map**.
Operator-attested (ADR-0070): an agent cannot drive or self-attest a "does it LOOK right" judgement — this
is the §5 honesty wall made visual. Each leg is _(witness: human)_.

1. **One wisp per claimed story.** _(witness: human)_ With the studio open on the forest map, a session
   claims a story (live path: the declare ceremony, [`claim-at-declare`](claim-at-declare.md) / ADR-0142;
   the spawn-path gate is built and mounted — chat-subagent-spawn's `claim-gated-spawn` via its
   `spawn-tool-surface` / `spawn-deps-composition` caps — awaiting only the desktop sidecar glue) and
   exactly **one** wisp orbits **that story's**
   node — not its capabilities, not a second wisp. A second session claiming the same story is **refused
   and told the holder** (no second wisp appears).
2. **Colour shifts by the active subagent.** _(witness: human)_ As the orchestrator authors (story-author),
   then proves (the red→green leaf), then supplements (glue) on the claimed story, the wisp's colour
   **changes** to reflect the active subagent/intent — distinguishable to the eye across the three states.
3. **Claimed is visibly distinct from proven-green.** _(witness: human)_ A claimed-but-not-proven story's
   wisp looks **clearly different** from a story that carries a real signed-verdict green **bloom**
   (ADR-0045) — the §5 honesty wall holds on the map; a claim never reads as a proof.
4. **The wisp clears on merge.** _(witness: human)_ When the holder's branch merges (the CI merge job runs
   the claim-release sweep, D), the story's claim-wisp **disappears** from the map — no stale zombie wisp
   left behind.
