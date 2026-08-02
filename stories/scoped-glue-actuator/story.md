---
id: "scoped-glue-actuator"
tier: story
title: "The desktop chat gains a scoped glue actuator — a fenced, write-scoped, claim-gated spawn_glue_worker that honours a task prompt (ADR-0160)"
outcome: "From a desktop chat conversation a scoped glue intent ('add 3 routes to backend-entry.ts') is delegated to a path-fenced spawn_glue_worker — claim-gated on the owning story, writing only inside caller-declared paths, honouring the task prompt verbatim — and landed through the existing run_gate / open_landing_pr gate→CI path, while the chat itself keeps no write tool, the worker signs nothing, and the glue never over-routes into a whole-story story build --real."
# RETIRED by ADR-0175 (2026-07-11). This whole story built the desktop chat's scoped-glue actuator — the
# fenced, write-scoped, claim-gated spawn_glue_worker (ADR-0160). ADR-0174 embeds a real in-app terminal
# running Claude Code that makes glue edits NATIVELY, so ADR-0175 retires this chat-driven scoped-write
# rung as REDUNDANT — "THE ONE EXCEPTION" to ADR-0175's "repurpose, don't delete". All three capabilities
# (glue-worker-spawn, spawn-glue-tool, glue-deps-composition) retire with ADR-0175 as their deciding
# record; their `real:` arms are dropped (so the story + its caps are no longer REAL-buildable —
# buildableNodeIds keys on proof.real), and a parallel code-removal drops the actuator's source/tests.
# NOT retired: the glue CONCEPT (ADR-0158 — un-asserted code within a story) and the shared write-scoped
# spawn runner in packages/agent (runSpawnWriteScoped / runSpawnStoryAuthor, owned by chat-subagent-spawn's
# story-author-spawn) — only THIS actuator's spawn_glue_worker rung retires. Body kept as history.
status: retired
proof_mode: UAT
# Per-leg witness (ADR-0106): the offline mechanics legs (the generalised write-scoped runner over an
# injected queryFn honouring a caller-declared path fence + userPrompt, the claim-gated spawn_glue_worker
# tool + the spawn_builder userPrompt-drop honesty fix, the drive-side composition rendering the real
# glue-worker library agent and wiring spawnGlueWorker) are machine-witnessed by the package suites over
# an injected queryFn + scripted doubles + the in-memory seed (real fence, real claim gate, real rendered
# agent — mocks forbidden in the offline-runnable consumed seams). The LIVE leg — a REAL desktop chat
# conversation performing a scoped backend-entry.ts-style edit through the fenced glue worker WITHOUT a
# whole-story --real, landed through the gate→PR path — is human-witness (operator-attested: ADR-0070
# — subscription-billed AND the spawned worker writes real files). The story-level uat_witness is absent
# → human (the ADR-0040 fail-closed signpost), so the machine-driven whole-story UAT node stays withheld;
# the crown derives from the per-leg roll-up.
# RE-ADJUDICATED 2026-07-26 (ADR-0209 D8 — see `## UAT Test Criteria`): ALL SIX legs are now
# `witness: machine`; NO leg stays `human`. The two former human legs (5 the live scoped edit, 6 the
# gate→CI landing) rested entirely on SUBSCRIPTION SPEND, on "real files are written", and on the desktop
# UI being un-driveable by an agent — a cost, a blast-radius and a HARNESS statement respectively, none of
# them a judgment gap (`human-witness-is-a-judgment-gap-not-cost`). Every condition they name is a claim
# row, a tool-call trace, a file diff, a recorded `ScopeViolation`, a gate exit code or a PR draft flag.
# ADR-0184 is the settled precedent: `drive-machinery`'s live `--real` build AND its "Land it" trunk PR
# are both `witness: machine`. This is a story about fences, claims and routing that had tagged its own
# routing mechanics as judgment. Per ADR-0209 §6 both legs return to UNSTAMPED until a spec judges them;
# nothing here goes green and the owner signs nothing. All six legs are machine and UNBOUND (this story
# declares no `## Reliability Gates` section) — a PRE-EXISTING gap, not a regression from this pass.
capabilities: [glue-worker-spawn, spawn-glue-tool, glue-deps-composition]
# WHY A NEW STORY, NOT AN EDIT TO chat-subagent-spawn (journey-principle + splitting-rule):
#   - chat-subagent-spawn's five capabilities are all LANDED + green under signed --real verdicts; its
#     remaining work is only the operator-attested UAT legs 5–7 and the sidecar glue. Grafting a NEW
#     capability (a new spawn ROLE with a new write-fence boundary) onto a story that is
#     complete-bar-attestation is a SECOND JOURNEY on a done story — the exact anti-pattern that story's
#     own frontmatter cites for NOT absorbing headless-orchestrator / chat-drive-bridge. This is the same
#     reasoning applied one increment on.
#   - This is the increment ADR-0158 D4 explicitly routed to story-author + its own build ADR: "a
#     structural fork for story-author + its own build ADR … choosing shape (a) or (b)." ADR-0160
#     resolved the shape (shape (a): a fenced write-scoped glue-subagent honouring a task prompt) and
#     handed the WHAT here. A scoped glue actuator is a NEW spawn role with a NEW fence boundary
#     (caller-declared `paths`, NOT stories/**) — chat-subagent-spawn's spawns write stories/** (author)
#     or drive a whole unit's registered proof (builder); neither can take "edit only these paths and
#     stop." That is a distinct journey: the delegation of a MINIMAL scoped edit, not a whole story or a
#     whole unit's proof.
# THE ONE JOURNEY (journey-principle): a co-builder converses with the desktop chat, and a scoped glue
# intent — "add these 3 routes to backend-entry.ts" — is DELEGATED to a path-fenced worker and LANDED
# through the gate→CI path, never over-routed into a whole-story --real build. Finishing "the runner can
# fence a write to caller-declared paths and honour a task prompt" immediately leads the same consumer to
# need "the chat can CALL it as a claim-gated tool" and then "the sidecar composes the REAL glue-worker
# agent + fence into the chat" — one continuous path from intent to a landed scoped edit. The
# splitting-rule's triggers do not fire: the outcome is one sentence (delegate a path-fenced glue edit
# and land it through the existing gate, walls intact) and the proof is one coherent walkthrough
# (converse → claim → spawn the path-fenced worker → observe the scoped edit + the fence denial → the
# human/CI lands). Length is never a splitting criterion.
# Story-level edges (ADR-0010 §4 — consumed cross-story seams, encoded as frontmatter depends_on; the
# import/consumption evidence at file:line is in "Cross-story boundary" below):
#   - chat-subagent-spawn — the SPAWN AUTHORITY this story extends with a third role. It owns the
#                     generalised write-scoped runner (packages/agent/src/spawn-story-author.ts — already
#                     takes an injectable isWriteAllowed predicate + any systemPrompt + any userPrompt),
#                     the buildSpawnTools surface (packages/agent/src/spawn-tool-surface.ts) that
#                     spawn_glue_worker mounts alongside, the claim gate (claimGatedSpawn,
#                     packages/agent/src/claim-gated-spawn.ts) every spawn passes through, and the
#                     buildSpawnDeps composition (packages/drive/src/spawn-deps.ts) spawnGlueWorker wires
#                     into. This story GENERALISES + EXTENDS those files additively under the declared
#                     edge (edit-first: the fence machinery EXISTS — this role-neutralises it and adds a
#                     third caller), never a fork of the spawn chain.
#   (wisp-as-story-claim — the claim LAYER the glue spawn's wall stands on (the E1 acquire-or-wait seam
#                     + the work-time claim store deltas) — is consumed THROUGH chat-subagent-spawn's
#                     claimGatedSpawn, consumed verbatim (spawn_glue_worker is a third caller of the
#                     same wall, no new claim primitive): a transitive seam via that declared edge, not
#                     re-declared here — redundant-transitive edge removed, 2026-07-05 map-health cleanup.)
#   (notice-board   — the claim PRIMITIVE (ClaimDoc / ClaimResult / workClaimRequest / bumpHeartbeat) —
#                     is consumed BY the gate (chat-subagent-spawn's claimGatedSpawn), not by this
#                     story's own code: transitive via that declared edge, not re-declared here.)
#   - agent         — the SDK organism: ADR-0004's single-import-site rule FORCES the generalised runner +
#                     the spawn tool surface into packages/agent (every @anthropic-ai/* import lives
#                     there); the glue worker reuses the published seams — the injectable SdkQueryFn and
#                     the fail-closed PreToolUse write-scope hook the runner already pins.
#   (drive-machinery — the physical host of spawn-deps.ts, where spawnGlueWorker is composed — hosts a
#                     chat-subagent-spawn-owned file this story edits ADDITIVELY under THAT declared
#                     edge; the drive hosting edge is chat-subagent-spawn's to declare (and it does),
#                     so it is transitive here, not re-declared. Drive imports nothing from cli (ADR-0112).)
#   - library       — the knowledge surface: renderAgentPrompt(store, "glue-worker")
#                     (packages/library/src/store/render-agent.ts) — the spawned glue role IS a rendered
#                     library agent (ADR-0051/0055 extended to subagents, ADR-0160 D4), never a forked
#                     prompt. The `glue-worker` agent artifact is authored in the seed + rendered (agent
#                     tier = seed-canonical, ADR-0055) — a KNOWLEDGE-TIER authoring dependency this story
#                     names but does not model as a capability (see Open modeling calls 1).
#   (desktop        — the SURFACE the glue-actuator-capable chat ships on (and backend-entry.ts, the
#                     very file the incident and the canonical scoped-edit example target) — is reached
#                     via chat-subagent-spawn → desktop-build-mount → desktop; the sidecar wiring stays
#                     an operator-attested Story-UAT leg with no code unit here, so the edge is not
#                     declared directly — redundant-transitive edge removed, 2026-07-05 map-health cleanup.)
# DIRECTION / NO CYCLE (ADR-0058): this story is a PURE SOURCE NODE — nothing depends on it. Every edge
# flows DOWN toward the roots (scoped-glue-actuator → {chat-subagent-spawn, agent, library} → … →
# {notice-board, library}); none of the named stories' depends_on lists this story, so the
# new edges introduce no cycle. (chat-subagent-spawn is itself a pure source node depending on the same
# roots; this story sits one layer above it on the same downward-flowing DAG.)
depends_on: [chat-subagent-spawn, agent, library]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [chat-subagent-spawn]
# Deciding ADRs (ADR-0037 §2): 160 (PRIMARY — the scoped glue actuator is shape (a): a fenced,
# write-scoped, claim-gated spawn_glue_worker MCP tool honouring a task prompt; D2 reuse the fence runner
# generalised, no new write path; D3 land through the existing gate→PR, the D3 boundary of 0158
# preserved; D4 the glue-worker system prompt is a rendered library agent; D5.i drop spawn_builder's
# phantom userPrompt); 158 (the parent — glue is un-asserted code WITHIN a story, proven transitively;
# D3 the write-authority boundary; D4 the tooling gap this closes); 137 (chat gains SPAWN authority; d.1
# "spawn/route, never raw write" — the chat stays tools:[], the wall upheld by shape (a)); 152 (the
# landing surface run_gate / open_landing_pr this actuator lands through, narrowed by 0158 D3); 138 (the
# claim-at-spawn wall — no claim, no subagent; the glue spawn is a third gated caller); 108 (Phase 3
# drive authority the spawn chain realises; d.3 accept-to-land the human gate; d.5 the spine signs); 91
# (the spine observes RED→GREEN and signs; no verdict ever crosses back — the glue worker signs nothing);
# 51 (the spawned glue role IS the rendered library agent — one definition, no forks); 55 (agent tier =
# seed-canonical — the glue-worker prompt is authored in the seed + rendered); 30 (the live SDK runtime;
# human owns the outer loop); 22 (CI re-proves the merge and auto-merges — the transitive re-proof, 0160
# D3); 70 (the live scoped-edit walk is operator-attested).
decisions: [160, 158, 137, 152, 138, 108, 91, 51, 55, 30, 22, 70]
---

# The desktop chat's scoped glue actuator — a fenced, write-scoped, claim-gated spawn_glue_worker

**Outcome —** From a desktop chat conversation a scoped glue intent — *"add 3 routes to
`backend-entry.ts`"* — is delegated to a path-fenced **`spawn_glue_worker`** (claim-gated on the owning
story, writing only inside caller-declared `paths`, honouring the task prompt verbatim) and landed
through the existing `run_gate` / `open_landing_pr` gate→CI path — while the chat itself keeps no write
tool, the worker signs nothing, and the glue never over-routes into a whole-story `story build --real`.

> **RETIRED — ADR-0175 (2026-07-11).** The `spawn_glue_worker` scoped-glue actuator retires as
> **redundant**. ADR-0174 embeds a real in-app terminal running Claude Code that makes glue edits
> natively, so the chat-driven scoped-write rung this story built is superseded — ADR-0175's *"THE ONE
> EXCEPTION"* to its own *"repurpose, don't delete"*. What does **NOT** retire: the **glue concept**
> (ADR-0158 — un-asserted connective code proven transitively within a story) and the shared
> **write-scoped spawn runner** (`runSpawnWriteScoped` / `runSpawnStoryAuthor` in `packages/agent`, owned
> by `chat-subagent-spawn`) — only this actuator (the `spawn_glue_worker` rung and its three capabilities)
> is retired. The three capabilities have their `real:` arms dropped, so the story is no longer
> REAL-buildable; the body below is kept as history.

## What this is

This is **the build ADR-0158 D4 called for, in the shape ADR-0160 chose** (shape (a), accepted
2026-07-05): a fenced, write-scoped, claim-gated **`spawn_glue_worker`** MCP tool that HONOURS a task
prompt, mounted as a THIRD spawn tool on the chat's existing (optional) spawn surface alongside
`spawn_story_author` / `spawn_builder`.

**The incident it closes (ADR-0158 / ADR-0160 Context).** The desktop chat session-orchestrator,
handed a scoped pure-wiring intent — *"add 3 missing routes to
`apps/desktop/electron/backend-entry.ts`"* — routed it as a whole-story `story build desktop-build-mount
--real` (a full billed red→green + an auto-merging PR), because its actuator surface has **no rung for a
minimal scoped edit**. `spawn_story_author` only writes `stories/**`; `spawn_builder` drives a whole
unit's registered proof; neither can take "add these 3 routes to this file and stop." The guidance
already says *delegate the glue to a subagent* — it named an affordance the surface lacked. This story
builds that affordance.

**The machinery already exists — this GENERALISES it, never a new write path (ADR-0160 D2).**
`runSpawnStoryAuthor` (`packages/agent/src/spawn-story-author.ts`) is already **not story-specific**: it
takes an injectable `isWriteAllowed(relPath)` predicate (default `stories/**`), any injected
`systemPrompt`, any `userPrompt`, a fail-closed `PreToolUse` Write/Edit hook, no `Bash` (a shell write
would bypass the fence), and records every denied write as a typed `ScopeViolation`. The glue actuator is
a near-exact reuse: the SAME fence, a **caller-declared path scope** instead of `stories/**`, and a
glue-worker system prompt. The runner is generalised to a role-neutral write-scoped core (a
`runSpawnWriteScoped`-shaped seam) that BOTH the story-author spawn and the glue-worker spawn call with
their own predicate + prompt — one fence implementation, two roles. No second fence, no raw write verb on
the chat, `Bash` never in the surface (ADR-0137 d.1 held).

**Landing is unchanged (ADR-0160 D3 / ADR-0158 D3 preserved).** The glue worker only *edits*; it signs
nothing. The chat lands the result through the `run_gate` + `open_landing_pr` tools it already has:
`pnpm gate` re-proves the whole tree (including the owning story's registered tests), then a NON-DRAFT PR
opens and CI independently re-proves the merge with main (ADR-0022) — *without* re-running the owning
story's `--real` build. That transitive re-proof at the gate/story altitude is exactly ADR-0158 D1's
"glue is proven transitively." Where a glue edit is genuinely not reachable even transitively, the honest
options remain ADR-0158 D3's: operator-attest the residual or escalate it. This story closes the
*delegation* gap; it does not widen the *proof* boundary — no landing verb is added to any spawn surface.

It ADHERES TO the existing strong scaffolding — the write-scope fence, the claim gate, the rendered-agent
composition, the gate→PR landing surface — it reuses INTO it, never reinvents or bypasses it.

## Honest proof posture — `proposed`, spawn power only, part-scripted / part-attested

This spec is authored FIRST, before any implementation, to bound the actuator journey and size the units;
the inner loop builds it (this story authors the work hierarchy only). Every contract below describes the
isolated unit test that proves a leaf; the capability describes the integration test that proves it
against real in-story collaborators; the Story UAT below describes the acceptance walkthrough that proves
the whole scoped-glue actuator.

**The safety walls (encoded in the contracts + the Story UAT — pinned by TESTS, not by prose):**

- **The chat keeps NO `Write`/`Edit`/`Bash` — spawn power only (ADR-0137 d.1).** The chat session's own
  tool surface stays `tools: []`; the ONLY addition is one more typed spawn tool (`spawn_glue_worker`).
  The write happens in the SPAWNED glue worker under the fail-closed PreToolUse scope fence, this time
  scoped to caller-declared `paths`. Pinned by `sgt-chat-session-keeps-no-write-bash` (via the surface
  cap's tests) + `gws-writes-fenced-to-caller-declared-paths`.
- **No claim, no subagent (ADR-0138 §3).** The `spawn_glue_worker` tool call runs the claim gate FIRST,
  claim-gated on the OWNING story `unitId`; a refusal names the holder and spawns nothing. Pinned by
  `sgt-glue-tool-runs-the-gate-then-the-handler` (reusing the built `claimGatedSpawn`).
- **The path fence is fail-closed AND honours the task prompt (ADR-0160 D1).** A write outside `paths` is
  DENIED before it lands and recorded as a `ScopeViolation`; `stories/**` is NOT in a glue worker's
  default scope (that is `spawn_story_author`'s job); the `userPrompt` is threaded to the worker verbatim.
  Pinned by `gws-writes-fenced-to-caller-declared-paths` + `gws-honours-the-task-prompt-verbatim`.
- **The spine signs, never the chat (ADR-0091 / ADR-0108 d.5).** The glue worker returns a typed spawn
  summary; NO verdict object ever crosses back into the chat surface, and the chat holds no signing key.
  The worker only edits — landing is the existing gate→PR path. Pinned by
  `gws-typed-result-never-a-verdict`.
- **Landing stays the human/CI gate (ADR-0152 / ADR-0022 / ADR-0160 D3).** Nothing here lands: the
  glue worker's edit reaches the trunk only through the existing `run_gate` / `open_landing_pr` +
  CI-re-proves ceremony. This story adds no landing path — asserted structurally (no PR/merge verb exists
  on any spawn surface).
- **The honesty correction rides along (ADR-0160 D5.i).** `spawn_builder`'s schema advertises a
  `userPrompt` the production dep discards — now that `spawn_glue_worker` is the real home for scoped
  intent, `spawn_builder`'s phantom knob is DROPPED from its schema (a builder drives the *whole* unit's
  registered proof; it has no per-run scope). Pinned by `sgt-spawn-builder-drops-phantom-userprompt`.

Status stays `proposed` for every unit — `healthy` is earned through the prove-it-gate AND the operator's
live scoped-edit attestation; it is never authored (ADR-0020).

## Capabilities (3)

Listed roots-first (a capability appears after everything it depends on). All three are **proof-wired**
(ADR-0057 — each carries a `proof:` block with a `real:` arm), so they form a dependency-closed, acyclic
set in which every member resolves a `real:` arm — what makes the WHOLE story story-`real`-buildable
(`isStoryBuildable`). The live scoped-edit walk is NOT a fourth capability (it has no separate code — it
is the composed surface run live); it is the human-witness Story UAT leg (the slow-growth-minimal choice,
the chat-subagent-spawn leg-5..7 pattern). The sidecar wiring in `backend-entry.ts` is operator-attested
sidecar glue, modelled as a Story-UAT human leg (see Open modeling calls 2).

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`glue-worker-spawn`](glue-worker-spawn.md) | The write-scoped SDK runner is generalised to a role-neutral core: a spawned session runs an injected glue-worker prompt with its writes fenced fail-closed to a caller-declared path scope (NOT `stories/**`), honours the task prompt verbatim, and returns a typed spawn result that is never a verdict — and the existing story-author spawn calls the SAME core with its own predicate. | — |
| 2 | [`spawn-glue-tool`](spawn-glue-tool.md) | `spawn_glue_worker` mounts on `buildSpawnTools` as a third claim-gated spawn tool (schema `{ unitId, paths, userPrompt }`) — claim-gated on the owning story, the path fence threaded to the runner, the chat keeping NO write tool and no verdict crossing back — AND `spawn_builder`'s phantom `userPrompt` param is dropped from its schema (ADR-0160 D5.i). | `glue-worker-spawn` |
| 3 | [`glue-deps-composition`](glue-deps-composition.md) | The drive-side composition renders the REAL `glue-worker` library agent (fail-closed BEFORE any SDK call when absent) and wires `spawnGlueWorker({ unitId, paths, userPrompt })` calling the generalised runner with the caller-declared path predicate + the rendered glue prompt, threaded through `buildSpawnDeps` / `orchestrate()` without forking the spawn chain. | `glue-worker-spawn`, `spawn-glue-tool` |

## Dependency graph (will be code-derived)

These are **within-story** edges. Until the code exists they are authored from the intended data-flow;
when the units are built they MUST be re-derived from the real imports/calls between capabilities (static
analysis, ADR-0010 §3) and corrected if the code disagrees. The graph is acyclic; capability 1 is the
independent root.

- `spawn-glue-tool` → `glue-worker-spawn`
  - The tool's handler wraps `claimGatedSpawn` (consumed from chat-subagent-spawn, not re-implemented)
    around a call into the generalised runner (1) — so the surface couples to the runner's caller-declared
    path-fenced entry (the `paths` → `isWriteAllowed` predicate + `userPrompt` threading).
- `glue-deps-composition` → `spawn-glue-tool` (and constructs 1's glue handler)
  - The composition is the thin drive-side shell: it renders the real `glue-worker` prompt, builds the
    per-call path predicate from the caller-declared `paths`, and composes `spawnGlueWorker` into the
    `SpawnSurfaceDeps` the surface (2) consumes — it owns no fence logic of its own (the
    `spawn-deps-composition` → `spawn-tool-surface` pattern, mirrored from chat-subagent-spawn).

## Cross-story boundary (ADR-0010 §4)

Authored from the intended consumed seams (re-verify against real imports when built). All seven seams
are CONSUMED, not absorbed — three as declared `depends_on` edges (chat-subagent-spawn, agent, library);
the other four (wisp-as-story-claim, notice-board, drive-machinery, desktop) are reached TRANSITIVELY
through chat-subagent-spawn's declared edges and are noted below without being re-declared — and this
story owns the SCOPED GLUE ACTUATOR (the generalisation of the fence runner,
the `spawn_glue_worker` tool + the `spawn_builder` honesty fix, the glue deps composition), never the
fence machinery's origin, the claim store, the loop definitions, or the chat chain.

- **`chat-subagent-spawn`** — the spawn authority this story extends with a third role, edited additively
  under the declared edge (edit-first, ADR-0160 D2's "generalise, not a new path"):
  - `packages/agent/src/spawn-story-author.ts` — GENERALISED to a role-neutral write-scoped runner (a
    `runSpawnWriteScoped`-shaped core) that both the story-author spawn and the glue-worker spawn call
    with their own `isWriteAllowed` predicate + system prompt. It ALREADY takes the injectable predicate
    + any `systemPrompt` + any `userPrompt` — the generalisation is a rename/role-neutralisation, not a
    rewrite; the story-author entry stays green as one caller of the shared core.
  - `packages/agent/src/spawn-tool-surface.ts` — `buildSpawnTools` gains `spawn_glue_worker` mounted
    alongside `spawn_story_author` / `spawn_builder`, each gate-wrapped by the SAME `claimGatedSpawn`; and
    `spawn_builder`'s phantom `userPrompt` param is dropped from its schema (ADR-0160 D5.i).
  - `packages/agent/src/claim-gated-spawn.ts` — `claimGatedSpawn` is CONSUMED verbatim (the glue spawn is
    a third gated caller); no change to the gate.
  - `packages/drive/src/spawn-deps.ts` — `buildSpawnDeps` renders the new `glue-worker` agent + wires
    `spawnGlueWorker`, threaded through the existing `orchestrate()` pass-through additively.
- **`wisp-as-story-claim`** *(transitive — consumed through chat-subagent-spawn's `claimGatedSpawn`,
  under that declared edge)* — the claim layer. The glue spawn consumes the E1 acquire-or-wait seam
  (`resolveSpawnClaim`, `packages/agent/src/spawn-claim.ts`) and the work-time claim-store deltas
  (`PgClaimStore.claim()` / `bumpHeartbeat`, injected) via `claimGatedSpawn`, claim-gated on the OWNING
  story `unitId`. No new claim primitive; the glue spawn is a third caller of the same wall.
- **`notice-board`** *(transitive — consumed by the gate, not by this story's own code)* — the claim
  primitive: `workClaimRequest` / `ClaimResult` / `bumpHeartbeat`
  (`packages/notice-board/src/claim.ts`).
- **`agent`** — the SDK organism. The generalised runner + the tool surface physically live in
  `packages/agent` (FORCED by ADR-0004's single-import-site rule), reusing the published seams: the
  injectable `SdkQueryFn` and the fail-closed PreToolUse write-scope hook (`packages/agent/src/
  spawn-story-author.ts` / `sdk-author.ts` — the same "writes denied BEFORE they land; Bash not in the
  tool surface" wall).
- **`drive-machinery`** *(transitive — `spawn-deps.ts` is a chat-subagent-spawn-owned file edited
  additively under that declared edge; the drive hosting edge is chat-subagent-spawn's)* — the physical
  host of `spawn-deps.ts` and of the orchestrate pass-through.
  `@storytree/drive` imports nothing from `@storytree/cli` (ADR-0112).
- **`library`** — `renderAgentPrompt(store, "glue-worker")`
  (`packages/library/src/store/render-agent.ts`): the spawned glue role IS the rendered library agent
  (ADR-0051/0055's one-definition rule, extended to the spawned subagent — edit the artifact, regenerate,
  and the terminal-served glue-worker and the spawned glue-worker move together). The `glue-worker` agent
  artifact is authored in the seed (`apps/studio/data/knowledge.json`) + rendered offline (agent tier =
  seed-canonical, ADR-0055) — a KNOWLEDGE-TIER authoring dependency (see Open modeling calls 1). CONSUMED
  — this story owns no prompt assembly and no schema.
- **`desktop`** *(transitive — reached via chat-subagent-spawn → desktop-build-mount → desktop; not a
  declared `depends_on` here)* — the surface the glue-actuator-capable chat ships on. The sidecar
  (`apps/desktop/electron/backend-entry.ts`) composes the REAL glue dep (the pg claim store, the repo
  cwd, the session identity) into the chat mount — sidecar glue, operator-attested like the rest of that
  file (a `node:test` over it would spawn subscription-billed sessions on a gate pass, the live spend
  ADR-0010 §5 forbids). `backend-entry.ts` is also the very file the incident targeted and the canonical
  scoped-edit example.

## UAT Test Criteria

The integrated **acceptance walkthrough** that proves the whole scoped-glue actuator — converse → claim →
spawn the path-fenced glue worker → observe the scoped edit + the fence denial → the human/CI lands —
meets its outcome end-to-end. Minimal-first (one coherent journey), defect-driven thereafter. Mocks are
forbidden in the consumed seams that CAN run offline: the claim gate runs the real E1 seam over the real
`ClaimResult` shape; the composition renders the REAL `glue-worker` library agent over the real seed; the
fence is the real PreToolUse hook over the real predicate. Only the SDK `query()` is scripted offline, and
the claim store is an injected double (ADR-0010 §5 — a live SDK-billed spawn is never run on a gate pass);
the live scoped edit is the operator-attested leg.

> **HONEST status — `proposed`, part-scripted / part-attested.** Legs 1–4 are automatable by the package
> suites (`@storytree/agent` + `@storytree/drive`) over an injected `queryFn` + scripted doubles + the
> in-memory seed. Legs 5–6 — a REAL desktop conversation in which the orchestrator claims the owning
> story then actually spawns the glue worker to perform a scoped `backend-entry.ts`-style edit (real
> files written inside the fence), landed through the gate→PR path WITHOUT a whole-story `--real` — were
> authored as **operator-attested**, NOT standing tests. *(That authored posture is what the 2026-07-26
> re-adjudication below overturned.)*
>
> **Per-leg witness (ADR-0106; RE-ADJUDICATED 2026-07-26, ADR-0209 D8).** ALL SIX legs are
> `witness: machine`. No leg stays `human`; no leg rests `either`.
>
> **What the re-adjudication changed, and why.** Legs 5 and 6 were `human` on three stated grounds — the
> run is **subscription-billed**, the spawned worker **writes real files**, and the scoped edit **"is not
> exercised unattended"** (i.e. no agent can drive the Electron chat). Those are a COST, a BLAST RADIUS
> and a MISSING HARNESS. None of them is a judgment gap, and
> `human-witness-is-a-judgment-gap-not-cost` puts all three on the machine rung: *"a success that is
> machine-observable but merely expensive, live, or not-yet-harnessed is `machine` … never `human` to
> stand in for a missing harness."* Strip the three and nothing no-compiler is left. Every condition
> these legs name is a claim-store row, a tool-call trace, a file diff, a recorded `ScopeViolation`, a
> gate exit code, a PR draft flag or a CI check status — refusals, absences, shapes and counts, every one
> of which compiles. **ADR-0184 is the settled precedent**: `drive-machinery`'s live `--real` build
> (`#uat-3`) AND its "Land it" NON-DRAFT trunk PR (`#uat-4`) are both `witness: machine`, gate-bound to
> `#gate-6` / `#gate-5`. A live subscription run and an outward trunk landing are machine when the
> success is read off a git/CI fact. This is the subject-matter trap: a story whose entire subject is
> fences, claims and routing had tagged its own routing mechanics as judgment.
>
> **The one leg that could have looked like a counter-example, distinguished.**
> `chat-drive-bridge`#uat-5 stayed `human` on a superficially identical "spend + outward write" pairing.
> It is genuinely different: its load-bearing condition is that **a human's CLICK** caused the build, and
> its own insufficiency clause records that nothing distinguishes an operator-initiated run from an
> agent-initiated one on that surface — an unobservable PROVENANCE fact. Neither leg here asserts human
> provenance. Here the human types the setup intent; the verdict is entirely about what the ORCHESTRATOR
> then did, which the trace records.
>
> **ZERO SPLITS, reasoned.** One clause was judgment-shaped: leg 6's *"where a residual glue edit is
> genuinely un-reachable even transitively, it was operator-attested or escalated (ADR-0158 D3)."* It was
> REMOVED rather than split into its own human leg. It is a conditional restatement of ADR-0158 D3's
> policy, not a verdict this walkthrough produces — in the walk as specified (three routes into
> `backend-entry.ts`, with `pnpm gate` re-proving the tree) the gate reaches the edit transitively, so no
> such residual arises and the clause is vacuous. Splitting a vacuous conditional off would mint a
> permanently-unwalkable owner signature over a case the walk may never generate.
>
> **The coverage claim was CHECKED, not trusted — and it is HALF true.** The original text asserts legs
> 1–4 are covered by the `@storytree/agent` + `@storytree/drive` suites. **Leg 1 is**:
> `packages/agent/src/spawn-write-scoped.test.ts` carries all four of its assertions as named tests
> (`sws-writes-fenced-to-caller-declared-scope`, `sws-honours-the-task-prompt-verbatim`,
> `sws-typed-result-never-a-verdict`, `sws-story-author-wrapper-keeps-its-default-scope`). **Legs 2–4 are
> NOT**: ADR-0175 removed the `spawn_glue_worker` mount and the `spawnGlueWorker` composition along with
> their tests (see each leg's scope note). Both suites ran green on 2026-07-26 — `@storytree/agent` 189
> pass / 0 fail, `@storytree/drive` 318 pass / 0 fail — which is exactly how the absence was established:
> the suites are healthy and simply no longer contain glue-tool or glue-deps tests.
>
> **The absent sources are a DELIBERATE, RECORDED deletion — no dead binding, nothing repaired.** The
> actuator was built (`1b094cbe`, ADR-0160), extended (`9495d5e1`), then removed by
> `474f55ec refactor(spawn): retire the desktop chat's spawn_glue_worker actuator (ADR-0175)`. This is
> the `chat-drive-bridge` shape (a correctly-recorded deletion), NOT the `app-guide` shape (an absence
> that WAS the authored brownfield red, ADR-0057). No proof binding was repaired in either direction.
>
> **No prior attestation is claimed, and none exists.** `events.attestation` holds 8 rows corpus-wide
> (probed live 2026-07-26: seq 1–8, ids `uat-attestation#uat-1` ×2, `_deploy-verify#uat-1`,
> `invite-notify#uat-1`, `studio-members#uat-{2,3}`, `agent#uat-5`, `embedded-terminal#uat-5`). Not one
> is a `scoped-glue-actuator#uat-*` id. Every "attested" mention in this story is forward-looking — it
> says the crown *awaits* an attestation — so the prose was honest; it is now simply moot.
>
> **NO leg is gate-bound, and that is deliberate.** This story declares NO `## Reliability Gates`
> section, so there is no gate id to name: every machine leg here resolves `refused` for want of a
> binding. That is a PRE-EXISTING open gap on legs 1–4 which legs 5–6 now join, NOT a regression this
> pass introduced. Minting an `observe` gate over capabilities whose `real:` arms were dropped at
> retirement — and whose subject code no longer exists — is precisely the rubber-stamp ADR-0097 §2 bans.
> The honest state is: machine and unbound. Per ADR-0209 §6 legs 5–6 are UNSTAMPED until a spec judges
> them — the tag records which witness is RIGHT, not that a proof exists, and the owner signs nothing.
>
> The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the
> machine-driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.

**Goal —** A scoped glue intent is DELEGATED, not over-routed: the orchestrator claims the owning story,
spawns a path-fenced glue worker that makes the minimal scoped edit the task prompt describes (a write
outside the fence DENIED), and lands the result through the existing gate→CI path — having itself written
nothing, signed nothing, and never reached for the whole-story `--real` build.

> **PRECONDITION SCOPE NOTE (recorded 2026-07-26 alongside the ADR-0209 D8 re-adjudication) — this story
> is RETIRED *and* its subject code is GONE, so legs 2–6 are CURRENTLY UNWALKABLE.** ADR-0175 did not
> merely move ownership here; `474f55ec` deleted the `spawn_glue_worker` tool, the `spawnGlueWorker`
> composition and their tests. `buildSpawnTools` builds TWO tools today (`spawn_story_author`,
> `spawn_builder`), and `packages/drive/src/spawn-deps.ts` composes two spawn deps. **Three facts that
> are easy to fuse and must be kept apart:**
> - **IRREDUCIBLE** — a success condition with no compiler. *No leg on this story is irreducible.*
> - **CURRENTLY UNWALKABLE** — the surface the leg names no longer exists. *Legs 2–6 are unwalkable;
>   only their still-live fragments (below) can be exercised at all.* This is a fact about the SURFACE,
>   independent of which witness kind is right — it never converts a leg to `human`.
> - **RETIRED BUT STILL LIVE** — the retirement moved ownership without removing code (the
>   `headless-orchestrator` shape). *Only leg 1 is in this state here*, and it is not even retired
>   substrate: `runSpawnWriteScoped` is OWNED BY `chat-subagent-spawn`, was never retired, and is green.
>
> **What survived the retirement, and therefore what each leg can still say.** (a) The role-neutral
> **`runSpawnWriteScoped`** core and its `stories/**` wrapper (`packages/agent/src/spawn-story-author.ts`,
> exported from `index.ts:104-108`) — the ADR-0160 D2 generalisation LANDED and STANDS, under
> `spawn-write-scoped.test.ts`. (b) The ADR-0160 **D5.i honesty fix** — `spawn_builder`'s phantom
> `userPrompt` is still dropped (`packages/agent/src/spawn-tool-surface.ts:49`). (c) The **`glue-worker`
> library agent artifact** itself, still authored in `apps/studio/data/knowledge.json` and rendered to
> `.claude/agents/glue-worker.md` — it outlived the actuator and now carries an ADR-0182 model tier.
> What did NOT survive: the `spawn_glue_worker` mount, the `spawnGlueWorker` dep, and the whole live
> walkthrough legs 5–6 describe.

1. **A spawned glue worker is write-fenced to caller-declared paths and honours the task prompt.** _(criterion-id: uatc_4144b34c5efc5273e4a20161)_ _(revision-id: uatr1:963f74f218453c16)_
   _(witness: machine)_ Drive the generalised runner with an injected scripted `queryFn` whose session
   Writes inside a declared path (e.g. `apps/desktop/electron/backend-entry.ts`) and attempts one write
   outside it (e.g. `packages/agent/src/evil.ts`). **Success —** the inside write is allowed, the outside
   write is DENIED fail-closed before it lands (the violation recorded on the typed result), `stories/**`
   is NOT allowed by the glue predicate (a glue worker is not a story author), `Bash` is never in the
   session's tool surface, the injected `userPrompt` is threaded to the session verbatim, and the runner
   returns `{ ok: true, summary }` — a result shape with no verdict/signing field; a dead/empty session
   returns `{ ok: false, error }`, never a forged success. The SAME core, driven with the `stories/**`
   predicate, still fences a story-author session (the generalisation kept the existing caller green).
   *(SCOPE NOTE, corrected in place 2026-07-26 — witness, id and position unchanged. **This is the ONE
   leg of the six that is fully alive and covered.** `runSpawnWriteScoped` exists and is exported
   (`packages/agent/src/spawn-story-author.ts:176`, `index.ts:108`), and all four assertions above are
   named tests in `packages/agent/src/spawn-write-scoped.test.ts` — ran green 2026-07-26. **Two prose
   corrections.** (i) THE RESULT SHAPE IS WRONG AS WRITTEN and would go RED against correct code: the
   success arm is `{ ok: true, summary, violations }` and the failure arm `{ ok: false, error,
   violations }` — `violations` is present on BOTH, which is how the leg's own "the violation recorded on
   the typed result" clause is satisfied at all. A machine leg asserting exactly `{ ok: true, summary }`
   by deep-equality fails; the honest assertion is that the shape carries no verdict/signing/proof field,
   which is what `sws-typed-result-never-a-verdict` actually pins. (ii) THE CONTRACT IDS CITED FOR THIS
   LEG ELSEWHERE IN THIS SPEC ARE STALE: the "safety walls" list above names
   `gws-writes-fenced-to-caller-declared-paths`, `gws-honours-the-task-prompt-verbatim` and
   `gws-typed-result-never-a-verdict`; the tests that LANDED are named `sws-*`, not `gws-*` — the
   generalisation to a role-neutral core renamed them off the glue-worker role. Those three are the
   story's only contract ids that still resolve to living tests.)*
2. **`spawn_glue_worker` runs claim→handler and threads the fence; `spawn_builder` sheds its phantom knob.** _(criterion-id: uatc_4c4d3e6ccbb40691803b8c9b)_ _(revision-id: uatr1:a8bf20efa5ba0e18)_
   _(witness: machine)_ Drive `buildSpawnTools` with a recording claim store + a recording glue
   handler. **Success —** invoking `spawn_glue_worker` (schema `{ unitId, paths, userPrompt }`) runs the
   claim gate STRICTLY BEFORE the handler; a refused claim returns the holder-naming refusal TEXT to the
   model and the handler NEVER runs; on acquire, the handler receives the caller-declared `paths` (threaded
   to the runner's fence) and the `userPrompt`; and `spawn_builder`'s schema no longer advertises a
   `userPrompt` param (ADR-0160 D5.i — the phantom knob is gone).
   *(SCOPE NOTE, corrected in place 2026-07-26 — witness, id and position unchanged. **THE LEG'S TITLE
   WAS ALSO REPAIRED: only its LINE WRAPPING.** The bold lead used to break across two source lines, so
   `BOLD_LEAD` — which matches an item's FIRST line only — never fired and the parser fell through to the
   raw first line, yielding a truncated title beginning with a literal `**`. Unwrapping the lead onto one
   line is the whole fix; the witness, the id, the position, the annotation run and every success word
   are byte-identical. **This leg is now HALF FALSE and cannot be walked as written.** The
   `spawn_glue_worker` clauses are dead: `474f55ec` (ADR-0175) removed the mount, and `buildSpawnTools`
   builds exactly TWO tools today — `spawn_story_author` (`spawn-tool-surface.ts:96`) and `spawn_builder`
   (`:135`). The `spawn_builder` clause, by contrast, is TRUE AND STILL LANDED: the phantom `userPrompt`
   is gone and `:49` still carries the ADR-0160 D5.i rationale in place. So the D5.i honesty fix outlived
   the actuator that motivated it — the only part of this leg a machine could observe today.)*
3. **The composition renders the real glue-worker agent fail-closed and wires the path fence.** _(criterion-id: uatc_dd77a59ac6be69518cfd4441)_ _(revision-id: uatr1:b7e9b39bc4c76152)_
   _(witness: machine)_ Build the glue deps over the real seed. **Success —** the glue worker's system
   prompt is the REAL rendered `glue-worker` agent (`renderAgentPrompt(store, "glue-worker")`, non-empty,
   carries the glue-worker role — not a stub); a store with no `glue-worker` agent yields a typed error
   BEFORE any SDK call (no spend on a dead render); and `spawnGlueWorker({ unitId, paths, userPrompt })`
   calls the generalised runner with an `isWriteAllowed` predicate built from the caller-declared `paths`
   (a write inside `paths` allowed, one outside DENIED) and the `userPrompt` honoured — threaded through
   `orchestrate()` without forking the spawn chain.
   *(SCOPE NOTE, corrected in place 2026-07-26 — witness, id and position unchanged. **The whole leg is
   dead code and cannot be walked**: `474f55ec` (ADR-0175) removed the `glue-worker` render and the
   `spawnGlueWorker` wiring from `packages/drive/src/spawn-deps.ts`, which composes exactly two spawn
   deps today — `spawnStoryAuthor` (`:126`) and `spawnBuilder` (`:150`). **One thing here is NOT dead and
   is easy to mis-read as dead: the `glue-worker` LIBRARY AGENT.** It survives, authored in
   `apps/studio/data/knowledge.json` and rendered to `.claude/agents/glue-worker.md` (and the `.cursor` /
   `.gemini` views), and ADR-0182 later gave it a model tier. `renderAgentPrompt(store, "glue-worker")`
   would still return a real prompt today; what no longer exists is any caller that asks for it on this
   path. An agent checking "is the glue-worker agent gone?" and concluding the leg is intact would have
   the fact right and the leg wrong.)*
4. **The composed surface holds every wall.** _(witness: machine)_ Drive the spawn-capable session with a _(criterion-id: uatc_5e1c72ab050ed55eda756dd9)_ _(revision-id: uatr1:6028442d93035d2a)_
   scripted `queryFn` whose session invokes `spawn_glue_worker`. **Success —** the glue tool is advertised
   only when spawn deps are present (a dep-less session is byte-identical to today's surface); the tool
   call runs claim→handler in order; the chat session's own tool surface carries NO `Write`/`Edit`/`Bash`
   (spawn power only); the single-session guard still holds; and the text returned to the model from a
   glue spawn carries the worker's summary, never a verdict payload.
   *(SCOPE NOTE, corrected in place 2026-07-26 — witness, id and position unchanged. **The glue half is
   dead**: there is no `spawn_glue_worker` to advertise, so "the glue tool is advertised only when spawn
   deps are present" has no subject. **The rest of the leg's walls are ALIVE but are NOT this story's** —
   the chat session's `tools: []` surface and the single-session guard belong to `chat-subagent-spawn` /
   `headless-orchestrator` and are asserted there. Read as a whole this leg is unwalkable; read
   clause-by-clause it now asserts other stories' contracts. That is a modelling residue of the
   retirement, recorded rather than repaired — this pass adjudicates witnesses, it does not re-tier.)*
5. **Live: a scoped glue intent is delegated to a path-fenced worker, not over-routed.** _(criterion-id: uatc_ba556afec8c776bf44347cc5)_ _(revision-id: uatr1:f59aabadd0f053ef)_
   _(witness: machine)(detail: scoped-glue-actuator#uat-5)_ In the desktop app, converse a scoped glue
   intent — *"add these 3 routes to `apps/desktop/electron/backend-entry.ts` and stop."* **Success —** the
   orchestrator takes the owning story-claim, spawns `spawn_glue_worker` scoped to
   `apps/desktop/electron/backend-entry.ts`, and the three routes appear in that file authored by the
   SPAWNED worker — the chat itself wrote no file, and NO whole-story `story build --real` was run; an
   attempt by the worker to write outside the declared `paths` is denied and recorded as a typed
   `ScopeViolation`.
   *(Re-adjudicated human → machine 2026-07-26, ADR-0209 D8. Its stated basis was **"operator-attested —
   subscription-billed, and real files are written."** Both halves are disqualified premises, and the
   implicit third — that no agent can drive the Electron chat — is a MISSING HARNESS, the plainest form
   of the thing `human-witness-is-a-judgment-gap-not-cost` refuses. The subscription leaf is not a paid
   meter (ADR-0030/0130); "real files are written" is blast radius, which the fence itself bounds and
   which ADR-0010 §5 addresses by keeping the walk OFF a gate pass — answered by a DELIBERATE
   spine-signed run, never by a human glyph. Strip all three and every remaining condition compiles: the
   claim is a claim-store row, the spawn and the absent `--real` are read off the session's COMPLETE tool
   trail, the three routes are a file diff, and the fence denial is a `ScopeViolation` on the typed
   result — already compiled offline by leg 1's `sws-writes-fenced-to-caller-declared-scope`. ADR-0184
   settled this shape: `drive-machinery`#uat-3, a live `--real` build, is machine. **Removed:** "(visible
   as the story's wisp)" — the wisp is a studio RENDER of the claim row, and routing a machine leg's
   verdict through a UI paint invites exactly the harness-for-judgment substitution this pass is
   correcting; the claim row is the fact. Per ADR-0209 §6 this leg is UNSTAMPED until a spec judges it,
   and no spec can exist while the actuator is deleted — machine, unbound, and unwalkable.)*
6. **Live: the scoped edit lands through the existing gate→CI path, walls intact.** _(criterion-id: uatc_18e3d2544bc6df559ff9a24c)_ _(revision-id: uatr1:882424f716078e10)_
   _(witness: machine)(detail: scoped-glue-actuator#uat-6)_ **Success —** the chat lands the glue edit
   through `run_gate` (`pnpm gate` re-proves the whole tree, including the owning story's registered
   tests) then `open_landing_pr` (a NON-DRAFT PR; CI independently re-proves the merge with main,
   ADR-0022) — WITHOUT re-running the owning story's `--real` build; the chat session held NO write tool
   at any point (spawn power only); the glue worker signed nothing (no verdict crossed back); ONE
   orchestration ran at a time; and every spawn was claim-first.
   *(Re-adjudicated human → machine 2026-07-26, ADR-0209 D8. This leg stated NO basis of its own at all —
   it inherited "subscription-billed AND the spawned worker writes real files" from the section preamble,
   which is a cost plus a blast radius, not a judgment. Every condition is a compiled fact: a gate exit
   code, a PR `isDraft` flag, a CI check status, the absence of a `story build --real` invocation in the
   COMPLETE tool trail together with the absence of any new `events.verdict` row for this story, a
   `tools: []` surface, a result shape with no verdict field, the single-session guard, and claim-then-
   handler ordering. **ADR-0184 is directly on point**: `drive-machinery`#uat-4 "Land it" — open the PR,
   CI auto-merges onto the trunk — is `witness: machine`, gate-bound to `#gate-5`. An outward trunk
   landing is machine when its success is a git/CI fact. **Removed:** the trailing clause *"where a
   residual glue edit is genuinely un-reachable even transitively, it was operator-attested or escalated
   (ADR-0158 D3), never autonomously landed as un-proven surface."* That was the one judgment-shaped
   fragment on this story, and it is a conditional restatement of ADR-0158 D3's policy rather than a
   verdict this walkthrough produces — for the specified walk `pnpm gate` reaches the edit transitively,
   so the residual never arises. It was NOT split into its own human leg: splitting a vacuous conditional
   would mint a permanently-unwalkable owner signature over a case the walk may never generate. Machine,
   unbound, and unwalkable.)*

End state — the desktop chat can DELEGATE a scoped glue edit to a path-fenced worker and land it through
the existing gate/CI path, with every wall held: claim before spawn, fenced writes in the spawned worker
only (scoped to caller-declared `paths`, not `stories/**`), the task prompt honoured, the spine the sole
signer, the human/CI the sole lander — and the whole-story `--real` build is never the tool a scoped glue
intent reaches for.

## Proof

The story carries the UAT (above); it is proven when that walkthrough passes — the offline legs (1–4)
green under the package suites, the live scoped edit (5) and the landing (6) operator-attested — with the
capabilities' integration tests and contracts green underneath. The capability/contract obligations are
minimal-to-green (slow growth): the generalised runner is isolatable over injected doubles; the tool
surface and the composition are integration tests against the real in-story collaborators (the real
`claimGatedSpawn`, the real rendered `glue-worker` agent, the real seed, the real fence) with the SDK
`query()` scripted (ADR-0010 §5).

**Honest status — `proposed`.** Authored status stays `proposed` everywhere: per ADR-0020, `healthy` is
only ever DERIVED from signed verdicts. The three capabilities are proof-wired so the spine can drive
their offline suites red→green (`pnpm storytree story build scoped-glue-actuator --real`); the story's own
machine-driven UAT node is WITHHELD (`uat_witness` absent → human, ADR-0040), and the crown additionally
awaits the operator's live scoped-edit attestation (legs 5–6).

## Open modeling calls (for the owner / the orchestrator)

1. **The `glue-worker` library agent is a KNOWLEDGE-TIER dependency, NOT a capability (modelling call).**
   ADR-0160 D4 requires the glue worker's system prompt to be a rendered Library `glue-worker` agent
   (ADR-0051/0055 — one definition, rendered, seed-canonical), fail-closed BEFORE any SDK call when
   absent. I modelled this as a NOTED cross-story dependency on `library` (an authoring prerequisite),
   NOT as its own capability — because an agent artifact is authored in the seed (`knowledge.json`) and
   rendered offline (agent tier = seed-canonical, the ADR-0055 inverse of the live-canonical default), so
   it has no isolatable red→green `real:` arm to prove; the FAIL-CLOSED render behaviour that DOES have a
   test lives in `glue-deps-composition` (contract `gdc-renders-the-real-glue-worker-agent`). The
   authoring obligation: before the composition can render green, the `glue-worker` agent must exist in
   the seed + be synced live (`pnpm storytree library sync-agents --pg`). This is an orchestrator/owner
   sequencing item, not a unit in this DAG. Confirm this modelling, or split it into its own
   seed-authoring capability if you prefer it tracked as a node.
2. **The sidecar wiring is an operator-attested Story-UAT leg, NOT a capability (modelling call).** The
   `backend-entry.ts` edit that composes the REAL glue dep into the chat mount is sidecar glue — a
   `node:test` over it would spawn subscription-billed sessions on a gate pass (the live spend ADR-0010 §5
   forbids), exactly as chat-subagent-spawn / desktop-build-mount model their `backend-entry.ts` edits.
   I modelled it as the operator-attested Story-UAT legs 5–6 (the composed surface run live), NOT a fourth
   capability with a `real:` arm. This mirrors the precedent's "the live spawn walk is NOT a sixth
   capability." Confirm, or promote it to a witnessed glue capability if you want it tracked separately.
3. **The generalisation touches a chat-subagent-spawn-owned file — declared-edge, not absorption.**
   `glue-worker-spawn` GENERALISES `packages/agent/src/spawn-story-author.ts` (renaming its core toward
   `runSpawnWriteScoped`) — a file physically owned by chat-subagent-spawn's `story-author-spawn`
   capability. This is the "code hosted in another story's package → declare the edge, edit additively"
   precedent (the same move chat-subagent-spawn made against headless-orchestrator's files). The
   story-author spawn's existing tests MUST stay green (it becomes one caller of the shared core). Flagged
   so the orchestrator sequences the generalisation to keep the existing `--real` verdict honest — the
   build must not red the story-author spawn suite.
4. **A build-time snapshot obligation (node-build.test.ts).** `packages/cli/src/node-build.test.ts`'s
   `REAL-buildable nodes:` regex is an exact alphabetically-sorted list. The three new `real:`-armed caps
   (`glue-deps-composition`, `glue-worker-spawn`, `spawn-glue-tool`) MUST be inserted into that list (and
   a per-story comment block added) when these files land, or `@storytree/cli test` reds. Authored here as
   a known obligation for the builder/orchestrator (it is the frequent merge-conflict point the memory
   flags), not a defect in this authoring.
