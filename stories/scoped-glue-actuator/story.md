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
# UAT CRITERIA: NONE since 2026-08-21 (ADR-0396 — a retired story's criteria are an obligation against
# a withdrawn journey, so they are deleted and their ordinals burned; the body keeps the history).
# Ordinals 1-6 are all burned. None held proof credit (all read `proven=–`), so ADR-0396 D8's
# keep-the-proven fence did not bite; each key is `superseded` in stories/uat-legacy-dispositions.json
# and the detail artifacts scoped-glue-actuator#uat-5/6 are retired in the live store. The witness note
# above is DATED HISTORY of how the six legs stood on 2026-07-26, not anything current.
capabilities: [glue-worker-spawn, spawn-glue-tool, glue-deps-composition]
# WHY A NEW STORY, NOT AN EDIT TO chat-subagent-spawn (journey-principle + splitting-rule):
#   - chat-subagent-spawn's five capabilities are all LANDED + green under signed --real verdicts; its
#     remaining work is only its operator-attested live UAT legs and the sidecar glue (all of that
#     story's criteria have since been deleted too, ADR-0396). Grafting a NEW
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
#                     modelled as an operator-attested Story-UAT leg with no code unit here (that leg
#                     is deleted, ADR-0396), so the edge is not
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
decisions: [160, 158, 137, 152, 138, 108, 91, 51, 307, 30, 22, 70]
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
is the composed surface run live); it was carried by the two live Story UAT legs at ordinals 5–6 (the
slow-growth-minimal choice, the same pattern `chat-subagent-spawn` used for its own live legs). The
sidecar wiring in `backend-entry.ts` is operator-attested sidecar glue, modelled as those Story-UAT legs
(see Open modeling calls 2). *(Both legs were re-adjudicated `machine` on 2026-07-26 and then deleted
with the rest by ADR-0396 on 2026-08-21, so the composed surface run live is carried by no leg; the UAT
section holds the record.)*

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

> **DELETED — all six criteria, 2026-08-21, under
> [ADR-0396](../../docs/decisions/0396-a-retired-story-s-uat-criteria-are-deleted-with-their-ordina.md).**
> A UAT criterion is a standing acceptance OBLIGATION against a story's outcome, not a record of one.
> This story is `status: retired` (ADR-0175), so its outcome is withdrawn and every criterion under it
> was an obligation against a journey nobody will run. The six legs that stood here — ordinals 1 through
> 6 — are deleted, and **every one of those ordinals is BURNED, never reused** (ADR-0396 D2): no
> `scoped-glue-actuator#uat-<n>` key can ever denote a second criterion.
>
> **Nothing signed was destroyed.** All six read `proven=–` at deletion. `events.attestation` held 8
> rows corpus-wide when probed on 2026-07-26 and not one was a `scoped-glue-actuator#uat-*` id — every
> "attested" mention in this story was forward-looking, so the prose was honest and is now simply moot.
> ADR-0396 D8 keeps a proof-bearing criterion in place when its story retires; none here was one.
>
> **Where the history is.** Each of the six positional keys is recorded `superseded` in
> `stories/uat-legacy-dispositions.json` with its rationale (the ledger still totals 282 keys), the legs
> themselves are in `git log -p` verbatim, and the two detail artifacts they pointed at —
> `scoped-glue-actuator#uat-5` and `#uat-6` — are retired in the live store with the same rationale.
>
> **One leg here was NOT dead code, and its content is carried up below rather than lost.** The leg at
> ordinal 1 was the one of the six that was fully alive and fully covered: `runSpawnWriteScoped` is
> owned by `chat-subagent-spawn`, was never retired, and is green. Deleting the leg removes THIS retired
> story's claim on it; it removes nothing from the live core or its tests.

**Goal (kept — what the journey was FOR) —** A scoped glue intent is DELEGATED, not over-routed: the
orchestrator claims the owning story, spawns a path-fenced glue worker that makes the minimal scoped
edit the task prompt describes (a write outside the fence DENIED), and lands the result through the
existing gate→CI path — having itself written nothing, signed nothing, and never reached for the
whole-story `--real` build. Converse → claim → spawn the path-fenced worker → observe the scoped edit
and the fence denial → the human/CI lands.

### What the deleted legs established, carried up so it is not lost with them

These are the facts the per-leg scope notes had recorded and that the rest of this body does not
otherwise carry (ADR-0396 D3). Several are about code that is STILL LIVE, so read them precisely:

- **`runSpawnWriteScoped` and its story-scoped wrapper SURVIVED the retirement and are green.** The
  ADR-0160 D2 generalisation landed and stands (`packages/agent/src/spawn-story-author.ts:176`,
  exported from `index.ts:104-108`), under `packages/agent/src/spawn-write-scoped.test.ts`, which
  carries all four of the leg's assertions as named tests:
  `sws-writes-fenced-to-caller-declared-scope`, `sws-honours-the-task-prompt-verbatim`,
  `sws-typed-result-never-a-verdict`, `sws-story-author-wrapper-keeps-its-default-scope`. **These three
  `sws-*` ids are the story's only contract ids that still resolve to living tests.**
- **THE RESULT SHAPE AS ORIGINALLY WORDED WAS WRONG and would have gone RED against correct code.** The
  success arm is `{ ok: true, summary, violations }` and the failure arm
  `{ ok: false, error, violations }` — `violations` is present on BOTH, which is how the "the violation
  recorded on the typed result" clause is satisfied at all. A leg asserting exactly
  `{ ok: true, summary }` by deep-equality fails; the honest assertion is that the shape carries no
  verdict/signing/proof field, which is what `sws-typed-result-never-a-verdict` actually pins.
- **THE `gws-*` CONTRACT IDS CITED ELSEWHERE IN THIS SPEC ARE STALE.** The "safety walls" list above
  names `gws-writes-fenced-to-caller-declared-paths`, `gws-honours-the-task-prompt-verbatim` and
  `gws-typed-result-never-a-verdict`; the tests that LANDED are named `sws-*`. The generalisation to a
  role-neutral core renamed them off the glue-worker role.
- **The ADR-0160 D5.i honesty fix OUTLIVED the actuator that motivated it.** `spawn_builder`'s phantom
  `userPrompt` param is still gone and `packages/agent/src/spawn-tool-surface.ts:49` still carries the
  rationale in place. That was the only part of the leg at ordinal 2 a machine could observe after the
  retirement.
- **The `glue-worker` LIBRARY AGENT survives, and is easy to mis-read as dead.** It is still authored
  and rendered to `.claude/agents/glue-worker.md`, and ADR-0182 later gave it a model tier.
  `renderAgentPrompt(store, "glue-worker")` would still return a real prompt; what no longer exists is
  any caller that asks for it on this path. **An agent checking "is the glue-worker agent gone?" and
  concluding the composition leg is intact would have the fact right and the leg wrong.**
- **What did NOT survive:** the `spawn_glue_worker` mount, the `spawnGlueWorker` dep, and the whole live
  walkthrough. `474f55ec refactor(spawn): retire the desktop chat's spawn_glue_worker actuator
  (ADR-0175)` removed them after the actuator was built (`1b094cbe`, ADR-0160) and extended
  (`9495d5e1`). `buildSpawnTools` builds exactly TWO tools today — `spawn_story_author`
  (`spawn-tool-surface.ts:96`) and `spawn_builder` (`:135`) — and `packages/drive/src/spawn-deps.ts`
  composes two spawn deps, `spawnStoryAuthor` (`:126`) and `spawnBuilder` (`:150`). This is the
  `chat-drive-bridge` shape (a correctly-recorded deletion), NOT the `app-guide` shape (an absence that
  WAS the authored brownfield red, ADR-0057). No proof binding was repaired in either direction.
- **The composed-surface leg had drifted into asserting OTHER stories' contracts.** The leg at ordinal
  4 named the chat session's `tools: []` surface and the single-session guard, which belong to
  `chat-subagent-spawn` / `headless-orchestrator` and are asserted there. Read as a whole that leg was
  unwalkable; read clause-by-clause it asserted someone else's contracts. That is a modelling residue
  of the retirement, recorded rather than repaired.
- **THREE facts that are easy to fuse and must be kept apart** — the most reusable thing this story
  produced: **IRREDUCIBLE** = a success condition with no compiler (*no leg on this story was ever
  irreducible*); **CURRENTLY UNWALKABLE** = the surface the leg names no longer exists (*the legs at
  ordinals 2–6 were unwalkable*) — a fact about the SURFACE, independent of which witness kind is
  right, and it NEVER converts a leg to `human`; **RETIRED BUT STILL LIVE** = the retirement moved
  ownership without removing code (the `headless-orchestrator` shape).

### The per-leg witness record, as it stood at deletion — history, describing a list that no longer exists

Read every sentence below as dated: it describes how the six legs stood on 2026-07-26, not how anything
stands now.

As authored, the legs at ordinals 1–4 were automatable by the package suites and the two at 5–6 — a
REAL desktop conversation in which the orchestrator claims the owning story then spawns the glue worker
to perform a scoped edit, landed through the gate→PR path WITHOUT a whole-story `--real` — were
operator-attested. **The 2026-07-26 re-adjudication (ADR-0209 D8) overturned that posture: ALL SIX legs
became `witness: machine`.** No leg stayed `human`; no leg rested `either`.

**Why.** The legs at 5 and 6 were `human` on three stated grounds — the run is **subscription-billed**,
the spawned worker **writes real files**, and the scoped edit **"is not exercised unattended"** (i.e.
no agent can drive the Electron chat). Those are a COST, a BLAST RADIUS and a MISSING HARNESS. None is
a judgment gap, and `human-witness-is-a-judgment-gap-not-cost` puts all three on the machine rung:
*"a success that is machine-observable but merely expensive, live, or not-yet-harnessed is `machine` …
never `human` to stand in for a missing harness."* Strip the three and nothing no-compiler is left:
every condition those legs named is a claim-store row, a tool-call trace, a file diff, a recorded
`ScopeViolation`, a gate exit code, a PR draft flag or a CI check status. **ADR-0184 is the settled
precedent** — `drive-machinery`'s live `--real` build and its "Land it" NON-DRAFT trunk PR are both
`witness: machine`, gate-bound. A live subscription run and an outward trunk landing are machine when
the success is read off a git/CI fact. This was the subject-matter trap: a story whose entire subject
is fences, claims and routing had tagged its own routing mechanics as judgment.

**The one leg that could have looked like a counter-example, distinguished.** `chat-drive-bridge`'s
live leg stayed `human` on a superficially identical "spend + outward write" pairing. It is genuinely
different: its load-bearing condition is that **a human's CLICK** caused the build, and its own
insufficiency clause records that nothing distinguishes an operator-initiated run from an
agent-initiated one on that surface — an unobservable PROVENANCE fact. Neither leg here asserted human
provenance; here the human types the setup intent and the verdict is entirely about what the
ORCHESTRATOR then did, which the trace records.

**ZERO SPLITS, reasoned.** One clause was judgment-shaped: the leg at ordinal 6's *"where a residual
glue edit is genuinely un-reachable even transitively, it was operator-attested or escalated (ADR-0158
D3)."* It was REMOVED rather than split into its own human leg. It is a conditional restatement of
ADR-0158 D3's policy, not a verdict the walkthrough produces — in the walk as specified the gate
reaches the edit transitively, so no such residual arises and the clause is vacuous. Splitting a
vacuous conditional off would have minted a permanently-unwalkable owner signature over a case the walk
may never generate. A second removal, on the leg at ordinal 5: *"(visible as the story's wisp)"* — the
wisp is a studio RENDER of the claim row, and routing a machine leg's verdict through a UI paint
invites exactly the harness-for-judgment substitution that pass was correcting; the claim row is the
fact.

**NO leg was ever gate-bound, and that was deliberate.** This story declares NO `## Reliability Gates`
section, so there was no gate id to name: every machine leg here resolved `refused` for want of a
binding — a PRE-EXISTING open gap on the legs at ordinals 1–4 that 5–6 joined, NOT a regression that
pass introduced. Minting an `observe` gate over capabilities whose `real:` arms were dropped at
retirement, and whose subject code no longer exists, is precisely the rubber-stamp ADR-0097 §2 bans.
The honest state was: machine and unbound.

The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the
machine-driven whole-story UAT node stayed withheld; the crown derived from the per-leg roll-up, and
now derives from the ADR-0085 own-proof union over a story that declares no criteria (ADR-0294 D5).

**End state, as authored —** the desktop chat can DELEGATE a scoped glue edit to a path-fenced worker
and land it through the existing gate/CI path, with every wall held: claim before spawn, fenced writes
in the spawned worker only (scoped to caller-declared `paths`, not `stories/**`), the task prompt
honoured, the spine the sole signer, the human/CI the sole lander — and the whole-story `--real` build
is never the tool a scoped glue intent reaches for. *(Authored goal, never a record of achievement: the
actuator was deleted by `474f55ec` under ADR-0175, the story is retired, and it now carries no criteria
at all.)*

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
awaited the operator's live scoped-edit attestation on the two live legs. *(Authoring-time history:
those legs were re-adjudicated `machine` on 2026-07-26 — so no attestation was owed even then — and
ADR-0396 deleted every criterion on 2026-08-21, so the story now declares none. The caps' `real:` arms
are dropped, so the `story build --real` command quoted above cannot run either.)*

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
2. **The sidecar wiring was modelled as Story-UAT legs, NOT a capability (modelling call — STILL OPEN,
   and now without a subject).** The `backend-entry.ts` edit that composes the REAL glue dep into the
   chat mount is sidecar glue — a `node:test` over it would spawn subscription-billed sessions on a gate
   pass (the live spend ADR-0010 §5 forbids), exactly as chat-subagent-spawn / desktop-build-mount model
   their `backend-entry.ts` edits. I modelled it as the two Story-UAT legs that stood at ordinals 5–6
   (the composed surface run live), NOT a fourth capability with a `real:` arm. This mirrors the
   precedent's "the live spawn walk is NOT a sixth capability." Confirm, or promote it to a witnessed
   glue capability if you want it tracked separately.
   > **Recorded 2026-08-21 (ADR-0396), and deliberately NOT an answer.** The two legs this call names
   > were deleted with the rest of this retired story's criteria, and `474f55ec` (ADR-0175) had already
   > deleted the `spawnGlueWorker` dep the wiring would have composed. So the call has no subject left:
   > answering it either way would decide nothing about any code that exists. It is left OPEN as
   > authored rather than closed, because **the deletion is not a verdict on the modelling question** —
   > if the scoped-glue actuator is ever rebuilt, this call is still the right question to ask about its
   > sidecar wiring, and the answer is still the owner's.
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
