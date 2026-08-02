---
id: "chat-subagent-spawn"
tier: story
title: "The chat spawns the inner loop — the desktop session-orchestrator gains subagent-spawning under the claim-at-spawn wall (ADR-0137 / ADR-0108 Phase 3)"
outcome: "From a desktop chat conversation the session-orchestrator spawns the right subagent under a held story-claim — the story-author to bring a story in, the builder leaf to drive a change red→green through the prove-it-gate — while the chat itself keeps no write tool, hands in no verdict, and leaves landing to the human."
# RETIRED by ADR-0174 + ADR-0175 (companion reconcile, owner-directed 2026-07-17 — explorer-onboarding-arc
# inc 1). The chat's AGENT-side spawn authority is MOOT: ADR-0174 retired the in-app INTERACTIVE
# orchestrator chat in favour of an embedded terminal running REAL Claude Code (the interactive seat is now
# the `embedded-terminal` story), and ADR-0175 held that spawn/landing do NOT belong to the `app-guide`
# concierge. So the chat-driven spawn_story_author / spawn_builder rung this story built has no live seat —
# it is retired in place (like chat-drive-bridge / scoped-glue-actuator), the body kept as history, the
# capability files flipped to `status: retired`. NOT retired: `wisp-as-story-claim` (the claim ledger / map
# wisps stay load-bearing for terminal Claude Code via the noticeboard). The caps keep their `real:` arms in
# this stories/**-only reconcile — dropping them + updating packages/cli/src/node-build.test.ts's
# REAL-buildable snapshot AND removing this story from repo-manifest.json's hostedStories.register are the
# companion code-cleanup PR (edits OUTSIDE stories/**; no code unmount here, ADR-0175 item F).
status: retired
proof_mode: UAT
# Per-leg witness (ADR-0106; RE-ADJUDICATED 2026-07-26 under ADR-0209 D8 — see the UAT section):
# the mechanics legs (the fenced story-author spawn session, the builder dispatch through the existing
# routed worker, the claim-before-spawn gate, the composed spawn tool surface, and the scope-wall
# ABSENCE audit) are machine-witnessed by the package suites over an injected queryFn + scripted
# doubles + the in-memory seed. Only the two LIVE legs stay human, on named bases: leg 5 on SPEND (a
# real `query()` story-author spawn is subscription-billed, ADR-0030/ADR-0010 §5) and leg 6 on SPEND
# PLUS a genuine judgment gap (decision 4's consultative routing has no mechanical classifier, by
# design — "was that the right route?" has no oracle). Leg 7 was human for neither reason: its success
# conditions are shapes and absences over the constructed tool surface, all of which compile — it is
# now `machine` (and per ADR-0209 §6 it is UNSTAMPED until a spec judges it; no owner signs anything).
# The story-level uat_witness is absent → human (the ADR-0040 fail-closed signpost), so the
# machine-driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.
capabilities: [story-author-spawn, builder-spawn-dispatch, claim-gated-spawn, spawn-tool-surface, spawn-deps-composition]
# WHY A NEW STORY, NOT AN EDIT TO headless-orchestrator OR chat-drive-bridge:
#   - headless-orchestrator is ADR-0108 Phases 1–2 and is read/propose ONLY — its proof posture
#     explicitly rests on "no builds, no signing, no landing" and its frontmatter states "Phases 3–5
#     (build/gate drive, landing, hosting) remain out of scope." Granting the session SPAWN authority
#     would break that story's own invariant (the same reasoning that made chat-drive-bridge a new
#     story). This story EDITS headless-orchestrator-owned files additively (the runtime mount, the
#     orchestrate pass-through) under the "code hosted in another story's package → declare the edge"
#     precedent; it does not absorb that story.
#   - chat-drive-bridge is the HUMAN-accept bridge (proposal → the human's click → dispatch → land):
#     its journey ends at the human's Build click. THIS story is the AGENT-side spawn authority ADR-0137
#     sharpens: the orchestrator itself, mid-conversation, spawns the story-author or the builder leaf.
#     Different actor, different gate (the claim wall, not the accept click), different journey — and
#     chat-drive-bridge's four machine caps are landed; grafting spawn authority onto it would be a
#     second journey on a story that is complete-bar-attestation.
#   - wisp-as-story-claim's take-claim-at-spawn built the E1 acquire-or-wait SEAM and explicitly
#     DEFERRED the E2 spawn-path wiring "blocked on ADR-0137 Phase 3 … at that point it likely
#     graduates into its own capability." ADR-0137 is now accepted (2026-07-02); this story's
#     claim-gated-spawn capability is that graduation.
# THE ONE JOURNEY (journey-principle): a co-builder converses with the desktop chat and the
# orchestrator DOES the work by spawning — bring a story in (spawn the story-author) / fix or change
# something (judge, then spawn the story-author for the missing contract and the builder leaf to drive
# it) — always claim-first, never writing or signing itself. Finishing "the chat can spawn the
# story-author" immediately leads the same consumer to need "the chat can spawn the builder" in the
# SAME conversation (decision 4's fix flow chains them: contract authored → contract driven), so they
# are one journey, one story. The splitting-rule's triggers do not fire: the outcome is one sentence
# (spawn the right subagent under a held claim, walls intact), and the proof is one coherent
# walkthrough (converse → claim → spawn → observe → human lands).
#
# Story-level edges (ADR-0010 §4 — consumed cross-story seams, encoded here as frontmatter depends_on;
# the import/consumption evidence at file:line is in "Cross-story boundary" below):
#   - headless-orchestrator — the Phase-1/2 runtime + chat chain this story PROMOTES: the spawn tool
#                     surface mounts into runHeadlessOrchestrator (packages/agent/src/
#                     headless-orchestrator.ts) and the spawn deps thread through orchestrate()
#                     (packages/drive/src/orchestrate.ts) / startChatStream — additive edits to
#                     files that story owns (physically in agent/drive), never a fork of the loop.
#   - wisp-as-story-claim — the claim LAYER this story's wall stands on: the E1 acquire-or-wait seam
#                     (packages/agent/src/spawn-claim.ts, resolveSpawnClaim) + the work-time claim
#                     store deltas (PgClaimStore + workClaimRequest intent + bumpHeartbeat). The
#                     claim-gated-spawn capability REALISES that story's explicitly-deferred E2
#                     contract (orchestrator-acquires-before-spawn).
#   - notice-board  — the claim PRIMITIVE consumed by the gate: ClaimDoc/ClaimResult/workClaimRequest/
#                     bumpHeartbeat (packages/notice-board/src/claim.ts).
#   - agent         — the SDK organism: ADR-0004's single-import-site rule FORCES the spawn runner +
#                     the spawn tool surface into packages/agent (every @anthropic-ai/* import lives
#                     there); the spawned story-author session reuses the published seams — the
#                     injectable SdkQueryFn and the fail-closed PreToolUse write-scope hook pattern
#                     ClaudeAgentAuthor pins (packages/agent/src/sdk-author.ts).
#   - drive-machinery — the physical host of the drive-side pieces (spawn-builder.ts, spawn-deps.ts,
#                     the orchestrate pass-through) and the build ENTRIES the dispatch transitively
#                     drives (@storytree/drive/build). drive imports nothing from cli (ADR-0112).
#   - desktop-build-mount — the relocated build worker the builder spawn dispatches through:
#                     routedBuildRunner / BuildRegistry / runBuildJob + the BuildContext shape
#                     (@storytree/drive/build-worker, relocated by that story per ADR-0133 d.3). The
#                     builder spawn is a THIRD caller of the same worker (after the studio route and
#                     the desktop accept click), never a new build path.
#   - library       — the knowledge surface: renderAgentPrompt(store, "story-author")
#                     (packages/library/src/store/render-agent.ts) — the spawned role IS the rendered
#                     library agent (ADR-0051 extended to subagents), never a forked prompt — plus the
#                     seed corpus / work-hierarchy schema the proofs render.
#   (desktop        — the SURFACE the spawn-capable chat ships on — is reached via desktop-build-mount,
#                     whose declared edges include desktop, so it is NOT re-declared here (redundant-
#                     transitive edge removed, 2026-07-05 map-health cleanup): the sidecar
#                     (apps/desktop/electron/backend-entry.ts) composing the REAL spawn deps into the
#                     chat mount is operator-attested glue with no code unit in this story.)
# DIRECTION / NO CYCLE (ADR-0058): this story is a PURE SOURCE NODE — nothing depends on it. Every
# edge flows DOWN toward the roots (chat-subagent-spawn → {headless-orchestrator, wisp-as-story-claim,
# desktop-build-mount} → … → {agent, notice-board, library}); none of the named stories'
# depends_on lists this story, so the new edges introduce no cycle.
depends_on: [headless-orchestrator, wisp-as-story-claim, notice-board, agent, drive-machinery, desktop-build-mount, library]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [headless-orchestrator, wisp-as-story-claim, drive-machinery, desktop-build-mount]
# Deciding ADRs (ADR-0037 §2): 137 (PRIMARY — chat is the full session-orchestrator; it SPAWNS the
# inner loop; decision 4's a-bug-is-a-missing-contract consultative routing; ADR-authoring the sole
# direct write, out of this story's shipped surface); 108 (Phase 3 drive authority — the phased build
# this realises; d.3 accept-to-land the permanent human gate; d.5 the spine signs; d.6 the
# single-session guard); 138 (the claim-at-spawn wall — no claim, no subagent; ADR-authoring the sole
# claim-free act; §4 trace-driven heartbeat; §5 the subagent role colours the wisp); 136 (the chat
# never reaches story-real-PR; the forest-map Build stays the human's whole-story go-green); 91 (the
# spine observes RED→GREEN and signs; no verdict is ever handed in); 30 (the live SDK runtime; human
# owns the outer loop, amended in degree); 4 (single SDK import site; the orchestrator/agent boundary);
# 51 (the spawned roles are the rendered library agents — one definition, no forks); 112 (drive
# placement; cli → drive, never back); 99 (a synthetic smoke never derives a green — the node-dispatch
# honesty wall the fix-drive routing must respect); 130/131 (the turn cap is the brake; no USD ceiling
# by default); 70 (the live spawn walk is operator-attested).
decisions: [137, 108, 138, 136, 91, 30, 4, 51, 112, 99, 130, 70]
---

# The chat spawns the inner loop — subagent-spawning under the claim-at-spawn wall

> **RETIRED — ADR-0174 + ADR-0175 (companion reconcile, owner-directed 2026-07-17, explorer-onboarding-arc
> inc 1).** The chat's agent-side spawn authority is MOOT: **ADR-0174** retired the in-app *interactive*
> orchestrator chat for an **embedded terminal running real Claude Code** (the interactive seat is now the
> [`embedded-terminal`](../embedded-terminal/story.md) story), and **ADR-0175** held that spawn/landing do
> NOT belong to the `app-guide` concierge. The `spawn_story_author` / `spawn_builder` rung this story built
> therefore has no live seat and is retired IN PLACE (the `chat-drive-bridge` / `scoped-glue-actuator`
> precedent): the body below is kept as history. The code is NOT unmounted here (a separate thin PR,
> ADR-0175). NOT retired: [`wisp-as-story-claim`](../wisp-as-story-claim/story.md) — the claim ledger / map
> wisps stay load-bearing for terminal Claude Code via the noticeboard; the claim path for the terminal is
> the noticeboard `declare`, not this chat spawn.

**Outcome —** From a desktop chat conversation the session-orchestrator spawns the right subagent
under a held story-claim — the **story-author** to bring a story in, the **builder leaf** to drive a
change red→green through the prove-it-gate — while the chat itself keeps no write tool, hands in no
verdict, and leaves landing to the human.

## What this is

This is **ADR-0108 Phase 3 (drive authority), built the way ADR-0137 sharpened it** (accepted
2026-07-02): the desktop chat's session-orchestrator gains **orchestration (spawn) power, not raw
`Write`/`Bash`**. When this story was authored the chat runtime (`runHeadlessOrchestrator`,
`packages/agent/src/headless-orchestrator.ts`) was read/propose only — `tools: []` + the read-only
orientation surface + `propose_unit`; it could orient and propose, and the human's accept click could
dispatch a build (chat-drive-bridge / desktop-build-mount), but the orchestrator itself could not SPAWN
anything. "Chat brings a story in" and "chat fixes a bug through the inner loop" were unreachable — not
undecided (ADR-0108 decided them; ADR-0137 sharpened how), just unbuilt. *(Build state: all five
capabilities below are green under signed `--real` verdicts — the agent-side mount AND the drive-side
composition included: `packages/drive/src/spawn-deps.ts` assembles the real spawn deps and
`orchestrate()` threads them through to the runtime. What keeps the DESKTOP chat propose-only today is
only the sidecar glue — `apps/desktop/electron/backend-entry.ts` does not yet compose real spawn deps
into the chat mount (operator-attested wiring) — plus the operator-attested UAT legs 5–6 (leg 7
re-adjudicated to `machine` 2026-07-26; the scope walls are absences, not an attestation).)*

The build shape ADR-0137 decision 1 pins, verbatim:

- **Bring a story in (`mapped`/`proposed`)** → spawn the **story-author** — the work-hierarchy write
  happens in the SPAWNED agent (a write-scoped SDK session running the rendered `story-author` library
  agent, fenced to `stories/**`), never in the chat.
- **Bug fix / change** → spawn the **inner-loop builder leaf** — route the unit through the EXISTING
  prove-it-gate machinery (the relocated routed worker); the spine observes RED→GREEN and SIGNS, CI
  re-proves, the human lands. Decision 4's routing judgment (*under-specified story, or
  right-contract-wrong-impl?* — **a bug is a missing contract**) is the ORCHESTRATOR'S consultative
  call, made in conversation off its rendered guidance; this story ships the spawn MECHANISMS that
  judgment routes through, not a mechanical classifier.
- **The claim-at-spawn wall (ADR-0138 §3)** — the orchestrator takes the ADR-0121 story-claim BEFORE
  any spawn; a refused claim names the holder and means wait / pick other work; **no claim, no
  subagent**. ADR-authoring is the sole claim-free act (it has no story node) — and it is also the one
  direct write ADR-0137 d.2 reserves for the orchestrator, which this story deliberately does NOT ship
  (see Open modeling calls).

It ADHERES TO the existing strong scaffolding — the prove-it-gate, the phase machine, the signing
spine, the relocated build worker, the claim store — it spawns INTO it, never reinvents or bypasses it.

## Honest proof posture — `proposed`, spawn power only, part-scripted / part-attested

This spec is authored FIRST, before any implementation, to bound the Phase-3 journey and size the
units; the inner loop builds it (this story authors the work hierarchy only). Every contract below
describes the isolated unit test that proves a leaf; the capability describes the integration test
that proves it against real in-story collaborators; the Story UAT below describes the acceptance
walkthrough that proves the whole spawn authority.

**The safety walls (encoded in the contracts + the Story UAT — pinned by TESTS, not by prose):**

- **The chat keeps NO `Write`/`Edit`/`Bash` — spawn power only (ADR-0137 d.1).** The chat session's
  own tool surface stays `tools: []`; the ONLY additions are the typed spawn tools. The write happens
  in the SPAWNED story-author under a fail-closed PreToolUse-style scope fence (the
  `ClaudeAgentAuthor` hook pattern); the code change happens in the SPAWNED leaf under the gate's
  per-phase write scope. Pinned by `sts-chat-session-keeps-no-write-bash` +
  `sas-write-scope-fenced-to-the-work-hierarchy`.
- **No claim, no subagent (ADR-0138 §3).** Every spawn tool call runs the claim gate FIRST; a refusal
  names the holder and spawns nothing. Pinned by `cgs-claim-precedes-every-spawn` +
  `cgs-refusal-surfaces-the-holder-and-spawns-nothing` + `sts-tool-call-runs-the-gate-then-the-handler`.
- **The spine signs, never the chat (ADR-0091 / ADR-0108 d.5).** The builder spawn is a build INTENT
  into the existing worker; progress crosses back as text; no verdict object ever crosses back into
  the chat surface, and the chat holds no signing key. Pinned by `bsd-progress-is-text-never-a-verdict`
  + `sts-no-verdict-crosses-back`.
- **This story adds no landing path (ADR-0108 d.3 / ADR-0136 as authored; see the ADR-0152 scope note).**
  Nothing HERE lands: the spawn surface carries no PR, merge, or land verb, so the spawned leaf's work
  reaches the trunk only through a gate this story does not own, and CI is the independent judge
  (ADR-0022). Asserted structurally — an ABSENCE on the spawn tools.
  > **SCOPE NOTE (corrected 2026-07-26).** This bullet was authored as "accept-to-land stays the human
  > gate … nothing merged without the human's ceremony". **[ADR-0152](../../docs/decisions/0152-lift-the-phase-2-landing-wall-the-desktop-orchestrator-runs.md)**
  > (accepted 2026-07-04, *amends* ADR-0137) LIFTED that wall for the desktop orchestrator: the SAME
  > session now mounts `run_gate` / `open_landing_pr` / `poll_pr_checks` when landing deps are present,
  > so it runs the merge ceremony itself and CI auto-merges. The narrow claim above (this story's spawn
  > surface adds no landing verb) is still TRUE and still compiles; the wider claim ("the session cannot
  > land") is FALSE today and must never be asserted — a leg holding the wider claim would go red
  > against correct code. The spine is still the sole signer (ADR-0091/ADR-0020) and CI still re-proves
  > before the trunk (ADR-0022) — those are unchanged.
- **One orchestration at a time (ADR-0108 d.6).** The single-session guard is preserved; a spawned
  subagent runs WITHIN the one session's claim, never as a second orchestration. Pinned by
  `sts-single-session-guard-holds`.

**Sequencing note — the fix-drive build shape (OQ-A, `oq-fix-drive-build-shape` — RESOLVED by
[ADR-0144](../../docs/decisions/0144-chat-accepted-node-builds-run-the-real-proof-and-persist-the.md),
2026-07-02, which landed BEFORE `builder-spawn-dispatch` was built).** The routed node dispatch drives
`node build --real` with persist semantics (the node's real proof, a real-proof `building` event →
the wisp, signed verdict to `events.verdict`, PASS parked on a `claude/real/*` branch); the synthetic
`node build --live` smoke (ADR-0099-B) stays a CLI-only pipeline check, never what a dispatch drives.
This story's `builder-spawn-dispatch` consumed `routedBuildRunner`'s tier routing **verbatim** and
must NOT re-implement or fork it — it inherited the `--real` node drive with zero change here,
exactly as sequenced. Do not build the routing twice.

Status stays `proposed` for every unit — `healthy` is earned through the prove-it-gate AND the
operator's live-spawn attestation; it is never authored (ADR-0020).

## Capabilities (5)

Listed roots-first (a capability appears after everything it depends on). All five are **proof-wired**
(ADR-0057 — each carries a `proof:` block with a `real:` arm), so they form a dependency-closed,
acyclic set in which every member resolves a `real:` arm — what makes the WHOLE story
story-`real`-buildable (`isStoryBuildable`). The live spawn walk is NOT a sixth capability (it has no
separate code — it is the composed surface run live); it is the human-witness Story UAT legs 5–6, the
slow-growth-minimal choice (the headless-orchestrator leg-4 pattern). (Leg 7 — the scope-wall
audit — is `machine`: it inspects the constructed surface and needs no live walk.)

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`story-author-spawn`](story-author-spawn.md) | A spawned write-scoped SDK session runs an injected story-author prompt with its writes fenced fail-closed to the work-hierarchy surface (`stories/**`), returning a typed spawn result that is never a verdict. | — |
| 2 | [`builder-spawn-dispatch`](builder-spawn-dispatch.md) | Given the unit the orchestrator decided to drive, a spawn-side dispatch validates it buildable and routes it through the EXISTING routed build worker, returning a typed runId and folding coarse progress back as conversation text — a build intent, never a verdict path. | — |
| 3 | [`claim-gated-spawn`](claim-gated-spawn.md) | Every spawn is claim-gated: the story-claim is acquired (work-kind intent stamped) BEFORE the spawn function runs, a refusal names the holder and spawns nothing, and the loop's trace signals bump the claim heartbeat so a live spawn never ages out — realising wisp-as-story-claim's deferred E2 contract. | — |
| 4 | [`spawn-tool-surface`](spawn-tool-surface.md) | The headless orchestrator session mounts the two typed spawn tools (`spawn_story_author` / `spawn_builder`) — each wrapped in the claim gate — while the chat session itself keeps NO Write/Edit/Bash, the single-session guard holds, and no verdict crosses back. | `story-author-spawn`, `builder-spawn-dispatch`, `claim-gated-spawn` |
| 5 | [`spawn-deps-composition`](spawn-deps-composition.md) | The drive-side composition assembles the REAL spawn deps — the rendered `story-author` library agent (fail-closed when absent), the claim deps carrying session identity + work-kind intent, the worker-backed dispatch — and threads them through `orchestrate()` to the runtime without forking the Phase-1/2 chain. | `story-author-spawn`, `builder-spawn-dispatch`, `claim-gated-spawn`, `spawn-tool-surface` |

## Dependency graph (will be code-derived)

These are **within-story** edges. Until the code exists they are authored from the intended data-flow;
when the units are built they MUST be re-derived from the real imports/calls between capabilities
(static analysis, ADR-0010 §3) and corrected if the code disagrees. The graph is acyclic; capabilities
1–3 are independent roots.

- `spawn-tool-surface` → `story-author-spawn`, `builder-spawn-dispatch`, `claim-gated-spawn`
  - The tool surface is the composition point: each spawn tool's handler is the claim gate (3)
    wrapping a spawn runner (1 or 2), so the surface couples to all three seams — the gate's
    decision shape and each handler's typed args/result.
- `spawn-deps-composition` → `spawn-tool-surface` (and constructs 1/2/3's handlers)
  - The composition is the thin drive-side shell: it renders the story-author prompt, composes the
    claim deps and the worker-backed dispatch, and passes the assembled spawn deps into the runtime
    through `orchestrate()` — it owns no spawn logic of its own (the `orchestrator-composition` →
    `headless-session-runner` pattern, one story up).

## Cross-story boundary (ADR-0010 §4)

Authored from the intended consumed seams (re-verify against real imports when built). All eight seams
are CONSUMED, not absorbed — seven as declared `depends_on` edges; the desktop surface is reached
transitively via desktop-build-mount (see its bullet) — and this story owns the SPAWN AUTHORITY (the fenced story-author runner, the
worker-routed builder dispatch, the claim gate, the tool surface, the deps composition), never the SDK
seam, the claim store, the build worker, the loop definitions, or the chat chain.

- **`headless-orchestrator`** — the runtime + chain this story promotes. The spawn tool surface
  mounts into `runHeadlessOrchestrator` (`packages/agent/src/headless-orchestrator.ts` — an additive
  optional `spawn` dep, mirroring how the orientation surface is wired only when a runner is present)
  and the spawn deps thread through `orchestrate()` (`packages/drive/src/orchestrate.ts`) exactly as
  `proposedUnitId` threaded through it (chat-drive-bridge precedent: additive edits to that story's
  drive/agent-resident files under the declared edge, never a fork). The single-session guard is
  consumed unchanged. *(Corrected 2026-07-26: this sentence also claimed "the `propose_unit` surface
  [is] consumed unchanged" — falsified by **ADR-0155**, which retired `propose_unit` outright. The
  orchestrator now DRIVES via its spawn + landing tools rather than proposing a unit for a human's
  accept click, so there is no propose surface left to consume; the dep-less baseline this story's
  spawn tools scale down to is ORIENTATION-only. See leg 4's scope note.)*
- **`wisp-as-story-claim`** — the claim layer. The gate consumes the E1 acquire-or-wait seam
  (`resolveSpawnClaim`, `packages/agent/src/spawn-claim.ts`) and the work-time claim-store deltas
  (`PgClaimStore.claim()` / `bumpHeartbeat`), and REALISES that story's deferred E2 contract
  (`orchestrator-acquires-before-spawn` in `take-claim-at-spawn.md` — "when Phase 3 lands, this
  becomes a real contract (likely its own capability)"; `claim-gated-spawn` is that capability — built,
  green under a signed `--real` PASS). The
  wisp RENDER + colour-by-subagent stay that story's (the gate stamps the work-kind `intent` the
  colour layer reads; witnessing the colour is that story's appearance UAT, not duplicated here).
- **`notice-board`** — the claim primitive: `workClaimRequest` / `ClaimResult` / `bumpHeartbeat`
  (`packages/notice-board/src/claim.ts`).
- **`agent`** — the SDK organism. The spawn runner + tool surface physically live in `packages/agent`
  (FORCED by ADR-0004's single-import-site rule), reusing the published seams: the injectable
  `SdkQueryFn` and the fail-closed PreToolUse write-scope hook pattern (`packages/agent/src/
  sdk-author.ts` — the same "writes denied BEFORE they land; Bash not in the tool surface" wall the
  gated leaf runs under).
- **`drive-machinery`** — the physical host of `spawn-builder.ts` / `spawn-deps.ts` and of the
  orchestrate pass-through; the build entries the worker drives. `@storytree/drive` imports nothing
  from `@storytree/cli` (ADR-0112).
- **`desktop-build-mount`** — the relocated build worker reused verbatim: `routedBuildRunner` /
  `BuildRegistry` / `runBuildJob` + the `BuildContext` shape (`@storytree/drive/build-worker`,
  relocated per ADR-0133 d.3). The builder spawn is a THIRD caller of the same worker (after the
  studio `/api/build` route and the desktop accept click) — never a new build path (ADR-0090).
- **`library`** — `renderAgentPrompt(store, "story-author")`
  (`packages/library/src/store/render-agent.ts`): the spawned role IS the rendered library agent
  (ADR-0051's one-loop-definition, extended to the spawned subagents — edit the artifact, regenerate,
  and the terminal story-author and the spawned story-author move together); plus the seed corpus the
  offline proofs render. CONSUMED — this story owns no prompt assembly and no schema.
- **`desktop`** *(transitive — reached via desktop-build-mount's declared `desktop` edge, not a
  declared `depends_on` here)* — the surface the spawn-capable chat ships on. The sidecar
  (`apps/desktop/electron/backend-entry.ts`) composes the REAL deps (the pg claim store, the live
  `BuildContext` it already builds, the repo cwd, the session identity/branch) into the chat mount —
  sidecar glue, operator-attested like the rest of that file (a `node:test` over it would spawn
  subscription-billed sessions on a gate pass, the live spend ADR-0010 §5 forbids).

## UAT Test Criteria

The integrated **acceptance walkthrough** that proves the whole spawn authority — converse → claim →
spawn → observe → the human lands — meets its outcome end-to-end. Minimal-first (one coherent journey),
defect-driven thereafter. Mocks are forbidden in the consumed seams that CAN run offline: the claim
gate runs the real E1 seam over the real `ClaimResult` shape; the composition renders the REAL
`story-author` library agent over the real seed; the dispatch routes to the real worker registry. Only
the SDK `query()` is scripted offline, and the claim store / build runner are injected doubles
(ADR-0010 §5 — a live SDK-billed spawn is never run on a gate pass); the live spawns are the
operator-attested legs.

> **HONEST status — `proposed`, part-scripted / part-attested.** Legs 1–4 and 7 are automatable by
> the package suites (`@storytree/agent` + `@storytree/drive`) over an injected `queryFn` + scripted
> doubles + the in-memory seed. Legs 5–6 — a REAL desktop conversation in which the orchestrator
> claims and actually spawns (real files authored by the spawned story-author; a real spine-signed
> drive) — are **operator-attested**, NOT standing tests.
>
> **Per-leg witness (ADR-0106; RE-ADJUDICATED 2026-07-26, ADR-0209 D8).** Legs 1–4 and 7 are
> `witness: machine`; legs 5–6 are `witness: human`. No leg rests `either`.
>
> **What the re-adjudication changed and why.** Leg 7 ("the scope walls held throughout") was tagged
> `human` because it read as the retrospective companion to the live walk. But **being *about* a live
> walk is not the same as needing one**: every condition it states is a SHAPE or an ABSENCE on the
> constructed tool surface — `tools: []`, the claim gate wrapped at construction, no PR/merge verb on
> the spawn server, no ADR-write tool anywhere, the typed `single-session` refusal — and all of those
> compile. It is now `machine`. Per **ADR-0209 §6** a re-adjudicated leg returns to UNSTAMPED until a
> spec judges it: tagging it `machine` records which witness is RIGHT, not that a proof exists, and
> the owner signs nothing here.
>
> Legs 5 and 6 stay `human` on **explicitly different bases**, because the bases behave differently:
> - **Leg 5 — SPEND only.** A live `query()` story-author spawn is subscription-billed (ADR-0030), so
>   it can never run on a gate pass (ADR-0010 §5). Nobody judges anything: every shape the walk
>   touches is proven by a machine leg. If that spawn ever became free to run, leg 5 would become
>   machine.
> - **Leg 6 — NO COMPILER, plus spend.** Decision 4's routing (*under-specified story, or
>   right-contract-wrong-impl?*) is a **consultative judgment this story deliberately does not ship a
>   classifier for**. "Was that the right route for this defect?" has no oracle — only a reader can
>   grade it. That basis survives even if the spend vanished.
>
> The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the
> machine-driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.

**Goal —** A desktop chat conversation makes work HAPPEN by spawning: the orchestrator claims the
story, spawns the story-author to author it (or the missing contract), spawns the builder leaf to
drive a change red→green, watches the spine sign — having itself written nothing, signed nothing, and
landed nothing.

1. **A spawned story-author session is write-fenced and returns a typed result.** _(criterion-id: uatc_a6adc168580b6f517d56f0a9)_ _(revision-id: uatr1:37cbdb285b825091)_
   _(witness: machine)_ Drive the story-author spawn runner with an injected scripted `queryFn` whose
   session writes inside `stories/<id>/` and attempts one write outside it. **Success —** the inside
   write is allowed, the outside write is DENIED fail-closed before it lands (the violation recorded
   on the typed result), `Bash` is never in the session's tool surface, and the runner returns
   `{ ok: true, summary }` — a result shape with no verdict/signing field; a dead/empty session
   returns `{ ok: false, error }`, never a forged success.
2. **The builder dispatch routes through the existing worker and refuses garbage.** _(criterion-id: uatc_44fb5fc2ef8339fe5e1fcebb)_ _(revision-id: uatr1:d39bdafa567014dd)_
   _(witness: machine)_ Call the builder spawn dispatch with a buildable unit id over an injected
   scripted routed runner + the real registry/discovery/seed. **Success —** the unit is validated
   buildable and dispatched to the SAME routed worker the accept click uses (a typed `{ runId }`
   back), the worker's coarse progress folds back as conversation TEXT, an unknown/unbuildable id is a
   typed refusal (never dispatched), and no verdict object exists anywhere on the dispatch's surface.
3. **No claim, no subagent — and a live spawn never ages out.** _(witness: machine)_ Run the claim _(criterion-id: uatc_4656da28bd2ddfe3f5c9d464)_ _(revision-id: uatr1:aa8acbc99f59d11b)_
   gate over both `ClaimResult` arms with an injected claim store and a recording spawn fn.
   **Success —** the claim (work-kind intent stamped) is acquired BEFORE the spawn fn runs; a refused
   claim returns a typed wait decision naming the holder (`sessionId`/`branch`/`intent`) and the spawn
   fn is NEVER invoked; trace signals during the spawned run bump the claim heartbeat (ADR-0138 §4);
   a blank story id is a fail-closed refusal, never a claim-free spawn.
4. **The composed surface holds every wall.** _(witness: machine)_ Drive the spawn-capable session _(criterion-id: uatc_bebc9b04ff1a0c4c0e5b99ba)_ _(revision-id: uatr1:d516f67eb2fb2b66)_
   with a scripted `queryFn` whose session invokes `spawn_story_author`. **Success —** the two spawn
   tools are advertised only when spawn deps are present (a dep-less session is byte-identical to the
   ORIENTATION-ONLY baseline — `tools: []` plus the read-only orientation tools, and nothing else);
   the tool call runs claim→handler in order and a refused claim returns the holder-naming refusal to
   the model with no handler run; the chat session's own tool surface carries NO `Write`/`Edit`/`Bash`;
   a second concurrent orchestration is still refused; and the text returned to the model from a
   builder spawn carries progress, never a verdict payload.
   > **SCOPE NOTE (corrected 2026-07-26, alongside the ADR-0209 D8 re-adjudication).** This leg was
   > authored as "byte-identical to today's **propose-only** surface". **ADR-0155** retired
   > `propose_unit`: the session carries no propose/accept declaration surface any more
   > (`packages/agent/src/headless-orchestrator.ts:270` — "the orchestrator DRIVES via its spawn +
   > landing tools … there is no `propose_unit` declaration surface"), so the dep-less baseline is
   > ORIENTATION-only. The scale-down claim itself is unchanged and still compiles — absent spawn
   > deps, no spawn tool is advertised — only the NAME of the baseline was stale, and a spec written
   > from the old wording would have gone RED against correct code (the same failure shape as the
   > ADR-0152 landing-wall claim corrected on leg 7). The leg's id, position, and `machine` witness
   > are unchanged; only the factually wrong description moved.
5. **Live: the chat brings a story in by spawning the story-author.** _(criterion-id: uatc_65f364261f271dee7271115d)_ _(revision-id: uatr1:ee6835bd189837f0)_
   _(witness: human)(detail: chat-subagent-spawn#uat-5)_ In the desktop app, converse until the
   orchestrator decides a story should exist. **Success —** the orchestrator takes the story-claim
   (visible as the story's wisp — authoring colour, witnessed properly in wisp-as-story-claim's
   appearance UAT), spawns the story-author, and `stories/<id>/story.md` (+ capability files) appear
   authored by the SPAWNED agent. *(HUMAN on the **SPEND** basis, and on that basis alone: a live
   `query()` story-author session is subscription-billed (ADR-0030), so ADR-0010 §5 forbids it on a
   gate pass. Nothing here is a judgment call. The SHAPES this walk touches are each proven by a
   machine leg and are deliberately NOT restated as human conditions: the write fence + typed
   non-verdict result by leg 1, the claim-before-spawn ordering and the holder-naming refusal of a
   concurrent claimant by leg 3, and "the chat itself wrote no file" by leg 7's absence audit.)*
6. **Live: a bug becomes a contract and is driven through the gate.** _(criterion-id: uatc_10e4514e1271034569a02b50)_ _(revision-id: uatr1:e00526bb66704d7e)_
   _(witness: human)(detail: chat-subagent-spawn#uat-6)_ Raise a real defect in conversation.
   **Success —** the orchestrator makes decision 4's consultative judgment (under-specified story →
   spawn the story-author to add the missing contract, then spawn the builder to drive it;
   right-contract-wrong-impl → straight to the builder) **and a competent reader agrees that was the
   right route for this defect**; the dispatched drive runs on the REAL worker; and the spine
   observes RED→GREEN and SIGNS, the chat having handed in nothing. *(HUMAN on TWO bases, named
   separately. **(a) NO COMPILER** — this story ships the spawn MECHANISMS the judgment routes
   through, explicitly "not a mechanical classifier", so the routing verdict has no oracle; this
   basis holds even if the run were free. **(b) SPEND** — the conversation and the drive it
   dispatches are both subscription-billed. NOTE: the node→`--real` routing landed as ADR-0144 before
   this story was built, so a node-tier dispatch runs the node's REAL persisted proof — this leg
   carries its full force. LANDING SCOPE (ADR-0152): as authored this leg ended "and the work reaches
   the trunk only through the existing human-gated ceremony" — that clause is REMOVED because
   ADR-0152 lifted the landing wall for the desktop orchestrator; the surviving, still-true claim is
   that CI independently re-proves before the trunk (ADR-0022) and the spine remains the sole signer.)*
7. **The scope walls are ABSENCES on the composed surface — no live walk required.** _(criterion-id: uatc_388554633704363c1a1cb308)_ _(revision-id: uatr1:496aeea5ebfe3ae4)_
   _(witness: machine)(detail: chat-subagent-spawn#uat-7)_ Audit the assembled
   `runHeadlessOrchestrator` session and the spawn tool definitions it mounts, with and without spawn
   deps. **Success —** the session's own `tools` is `[]` and its `allowedTools` names ONLY in-process
   MCP tools, so no `Write`/`Edit`/`Bash` is reachable at any point; BOTH spawn tools are claim-gated
   by CONSTRUCTION (`buildSpawnTools` wraps every handler, so there is no constructor path that
   mounts an ungated spawn); the spawn server advertises exactly `spawn_story_author` +
   `spawn_builder`, and neither carries a PR, merge, or land verb; NO tool on ANY mounted server
   writes an ADR (ADR-authoring, the sole claim-free act, is a deliberately-unshipped follow-on —
   Open modeling call 1); and a second concurrent orchestration is still refused with the typed
   `single-session` reason. **SCOPE — read before asserting (ADR-0152):** this leg asserts that THIS
   STORY'S spawn path adds no landing verb. It must NOT assert that the session as a whole cannot
   land: ADR-0152 mounts `run_gate` / `open_landing_pr` / `poll_pr_checks` on the same session when
   landing deps are present, so the wider assertion would go RED against correct code.

End state — the desktop chat is the SAME orchestrator the terminal session is (spawn subagents,
delegate red→green), with every wall held: claim before spawn, fenced writes in the spawned agent
only, the spine the sole signer, the human the sole lander.

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the offline legs (1–4)
green under the package suites, the walls-absence audit (7) machine-witnessed alongside them, and
only the live spawns (5–6) operator-attested — with the capabilities' integration tests and
contracts green underneath. The
capability/contract obligations are minimal-to-green (slow growth): the runner, dispatch, and gate are
isolatable over injected doubles; the surface and composition are integration tests against the real
in-story collaborators (the real E1 seam, the real rendered `story-author` agent, the real seed) with
the SDK `query()` scripted (ADR-0010 §5).

**Honest status — `proposed`.** Authored status stays `proposed` everywhere: per ADR-0020, `healthy`
is only ever DERIVED from signed verdicts. All five capabilities now carry signed `--real`
PASS verdicts (`story-author-spawn`, `builder-spawn-dispatch`, `claim-gated-spawn`,
`spawn-tool-surface` — the agent-side mount, an optional `spawn` dep on `runHeadlessOrchestrator` —
and `spawn-deps-composition` — the drive-side composition, `packages/drive/src/spawn-deps.ts`,
threaded through `orchestrate()`). What keeps the desktop chat propose-only today is only the sidecar
glue (`backend-entry.ts` does not yet compose real spawn deps into the chat mount — operator-attested
wiring) plus the operator-attested legs 5–6. The five capabilities are proof-wired so the spine can drive their offline suites
red→green (`pnpm storytree story build chat-subagent-spawn --real`); the story's own machine-driven
UAT node is WITHHELD (`uat_witness` absent → human, ADR-0040), and the crown additionally awaits the
operator's live-spawn attestation (legs 5–6; leg 7 is `machine` and UNSTAMPED until a spec judges
it, ADR-0209 §6).

## Open modeling calls (for the owner / the orchestrator)

1. **The direct ADR-write tool is deliberately NOT in this story (surfaced, not decided away).**
   ADR-0137 d.2 grants the orchestrator ONE direct write — authoring ADRs (`adr new` + the body) —
   because the discussion context lives in the chat. Shipping that write surface (a scoped write tool
   or a brokered `adr new` verb on the chat session) is a SEPARATE increment with its own walls
   (ADR-0117's broker question applies); this story ships spawn power only, and the claim gate's
   "ADR-authoring is the sole claim-free act" is honoured by construction (no ADR path exists here to
   gate). Follow-on story/capability when the owner wants it.
2. **The fix-drive `--real` routing belonged to the sibling increment (sequencing, not a fork —
   RESOLVED).** The sibling ("route chat-accepted node builds to `node build --real`", resolving
   `oq-fix-drive-build-shape` / OQ-A) landed as ADR-0144 (2026-07-02) BEFORE `builder-spawn-dispatch`
   was built, so the dispatch consumed the worker's routing verbatim and inherited the `--real` node
   drive free — UAT leg 6 carries its full force. The routing was built once, in the worker.
3. **The spawned story-author's LIVE-store knowledge writes are out of the minimal journey.** The
   work hierarchy is disk-canonical (`stories/` frontmatter-md, ADR-0039), so the fenced `stories/**`
   write scope covers the bring-a-story-in journey. Live `--pg` Library artifact writes from the
   SPAWNED story-author (knowledge-tier authoring) would need a DB-writing tool surface in the spawned
   session — a follow-on with its own scope decision, not smuggled in here.
4. **Subagent-role → wisp colour is consumed, not built.** The gate stamps the work-kind `intent`
   (`orchestrate`, and the role via the composition's claim deps) that wisp-as-story-claim's
   colour-by-subagent reads (ADR-0138 §5); witnessing the colour is THAT story's appearance UAT. If
   the colour layer needs a finer role vocabulary than `WorkClaimKind` carries today, that is a small
   amend to `notice-board`'s claim schema owned by wisp-as-story-claim — flagged, not built here.
