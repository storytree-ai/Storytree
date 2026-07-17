---
id: "wisp-as-story-claim"
tier: story
title: "The forest wisp IS the claim — graded (hover / orbit / queue), coloured by subagent, cleared on merge"
outcome: "The forest map shows one wisp per claimed story, its shape the claim GRADE (an exploring claim hovers, a work claim orbits, waiting claims queue, a released claim fades on departure), coloured by the active subagent and visibly distinct from a proven-green bloom, taken at workspace creation / declare and cleared on the CI merge — so parallel sessions never stomp each other and the map reads the ONE claim ledger, never a presence row."
# ADR-0200 re-aim (2026-07-16): the noticeboard is the claim ledger, presence retired. The wisp is the
# render of the GRADED claim (exploring hover / work orbit / waiting queue / departure fade), not a
# binary claimed/proven. The render LANDED and was owner-attested 2026-07-17 (claim-grade map wisps
# default-ON hover/queue/orbit + departure fades). ADR-0138 remains the mechanism this story realises;
# ADR-0200 generalises the claim to grades and settles the framing (ADR-0124/0128's "map honest by
# absence" is superseded — the map now populates exactly proportionally to real claim activity).
status: proposed
proof_mode: operator-attested
# The story's headline outcome is a LOOK on the forest map — one wisp per claimed story, colour by active
# subagent, claimed visibly distinct from proven-green, the wisp clearing on merge. That is a human-eyes
# leg (ADR-0070): the UAT node (capability F) is operator-attested, never self-attested. uat_witness is
# absent ⇒ `human` (ADR-0040 fail-closed) — the appearance cannot be machine-witnessed.
capabilities: [claim-store-work-time, render-claim-as-wisp, colour-by-subagent, ci-clear-on-merge, take-claim-at-spawn, claim-at-declare, appearance-uat]
# HOSTED-STORY edges (ADR-0192 landlord rule): this cross-cutting layer landed its organs INSIDE four
# other stories' territories — the claim store in packages/notice-board/src/store, the subagent-colour
# + merge-sweep wiring in packages/drive, the wisp/in-flight render glue in apps/studio, the
# spawn-seam claim in packages/agent — so the hosting is declared (consumer-side) and annotated
# (hosted seams: the story owns no package and adds no @storytree/* import of its own). No cycle:
# none of the four hosts depends on this story (its only consumer is chat-subagent-spawn, above them).
depends_on: [notice-board, drive-machinery, studio, agent]
# ADR-0166 artifact edges: all four are hosted-seam edges (see above) — no code import backs them.
artifact_edges: [notice-board, drive-machinery, studio, agent]
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
# Deciding ADRs (ADR-0037 §2): 0200 is the re-decision this story now realises (the noticeboard is the
# claim ledger; the claim gains grades exploring/waiting/work; presence retired; the map renders by grade
# by default — the `?claims=` flag retires). 0138 is the mechanism it generalises (the wisp IS the claim,
# amending 0121/0033, superseding 0048); 0200 supersedes 0079/0141 (presence-lifecycle machinery) and
# settles 0124/0128's "map honest by absence" (the map now populates proportionally to real claim
# activity). 0142 landed the live work-time acquisition (claim-at-declare; branch dies on merge). Builds
# on 0137 (the orchestrator that holds + spawns under the claim); keeps the §5 honesty wall (0045/0099 —
# a claim state is never a proof).
decisions: [200, 138, 142, 121, 33, 128, 137, 45, 99, 70]
---

# The forest wisp IS the claim — graded, coloured by subagent, cleared on merge

**Outcome —** The forest map shows **one wisp per claimed story**, its shape the claim **GRADE** — an
`exploring` claim **hovers** (stationary at the story: "someone is reading / planning here"), a `work`
claim **orbits** (the exclusive holder), `waiting` claims **queue** behind it, and a released claim
**fades** on departure — coloured by what the orchestrator is currently doing (authoring / proving /
supplementing), **visibly distinct** from a proven-green bloom, **taken at workspace creation / declare**
and **cleared on the CI merge**. Parallel sessions never stomp each other and the map reads the **one
claim ledger**, never a presence row.

This story realises [ADR-0138](../../docs/decisions/0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md)
as generalised by
[ADR-0200](../../docs/decisions/0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md):
the `events.node_claim` lock (ADR-0121 / ADR-0009) is the single **coordination + observability** ledger,
and the claim now carries three **grades** (exploring / waiting / work). The wisp is the render of the
**graded claim**, not of the build; the build stays a *colour state* of the work-grade claim-wisp
(ADR-0048 generalised, not deleted). The [`notice-board`](../notice-board/story.md) story owns the ledger
machinery + the CLI/dock views; this story owns the **forest-map render**.

> **ADR-0200 re-aim (one ledger; render landed + owner-attested 2026-07-17).** Two things changed under
> this story's feet and are now reflected: (1) the self-reported **presence layer retired** — the map
> reads ONLY the claim ledger (`events.node_claim`), never `events.session`; "no presence-sourced
> wisps" is structural now. (2) The claim **gained grades** — the wisp render is no longer binary
> (claimed vs proven) but graded (hover / orbit / queue) plus a **departure fade** for a just-released
> claim (`foldDepartures`, `packages/notice-board/src/claim.ts`), fixing the
> `friction-released-build-wisp-reads-as-lost-claim` item. The grade renders landed default-ON and the
> owner attested the look on 2026-07-17 (hover / queue / orbit + departure fades; the `?claims=` flag
> retired, ADR-0200 D7). The §5 honesty wall is untouched — no claim grade or colour is ever a proof.

## Framing

The forest map serves two jobs prior ADRs conflated: **observability** ("a proof is being mechanically
driven here") and **coordination** ("another session is working on this story; I should wait / pull main
after its merge / not stomp it"). ADR-0128 read the bare map as honest-by-absence for observability; the
coordination need is real and demonstrated — the recorded duplicate-build collisions are sessions
stomping each other for lack of a node-anchored "someone is here" signal. **ADR-0200 settled the tension**
ADR-0124/0128 left open (an unclaimed session was invisible): sessions are **forced onto the ledger at
workspace creation**, so the map now populates **exactly proportionally to real claim activity** — hover =
intent, orbit = work, queue = contention, colour = proof in flight, empty = genuinely nothing. Both jobs
unify onto the **graded claim**: forced at workspace creation (we own the outer + inner loop,
ADR-0137 / ADR-0030), cleared on the CI merge, staleness as one trace-driven backstop across all grades.

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
is the §5 honesty wall made visual. Each leg is _(witness: human)_. **The grade renders landed default-ON
and the owner attested the look on 2026-07-17** (hover / queue / orbit + departure fades); these legs are
the standing walkthrough that re-witnesses the goal after any change.

1. **One wisp per claimed story, shaped by grade.** _(witness: human)_ With the studio open on the forest
   map, a session claims a story (live paths: `worktree create --node` takes the `exploring` claim, or the
   declare ceremony, [`claim-at-declare`](claim-at-declare.md); the spawn-path gate is
   chat-subagent-spawn's `claim-gated-spawn`) and exactly **one** wisp sits on **that story's** node — not
   its capabilities, not a second wisp. An `exploring` claim **hovers** (stationary); a `work` claim
   **orbits**. A second session taking the **work** claim on the same story is **refused and told the
   holder** or **queues** as a `waiting` wisp — never a second orbiting wisp.
2. **Colour shifts by the active subagent.** _(witness: human)_ As the orchestrator authors (story-author),
   then proves (the red→green leaf), then supplements (glue) on the claimed story, the work-wisp's colour
   **changes** to reflect the active subagent/intent — distinguishable to the eye across the three states.
3. **Claimed is visibly distinct from proven-green.** _(witness: human)_ A claimed-but-not-proven story's
   wisp (any grade) looks **clearly different** from a story that carries a real signed-verdict green
   **bloom** (ADR-0045) — the §5 honesty wall holds on the map; no claim grade or colour ever reads as a
   proof.
4. **The wisp clears on merge, with a legible departure.** _(witness: human)_ When the holder's branch
   merges (the CI merge job runs the claim-release sweep, D), the story's claim-wisp **fades on departure**
   (`foldDepartures` — a released claim reads as *just left* for the departure window, not silently gone)
   and then **disappears** — no stale zombie wisp, and no exit mistaken for a lost claim.
