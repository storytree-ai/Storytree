---
id: "scoped-glue-actuator"
tier: story
title: "The desktop chat gains a scoped glue actuator — a fenced, write-scoped, claim-gated spawn_glue_worker that honours a task prompt (ADR-0160)"
outcome: "From a desktop chat conversation a scoped glue intent ('add 3 routes to backend-entry.ts') is delegated to a path-fenced spawn_glue_worker — claim-gated on the owning story, writing only inside caller-declared paths, honouring the task prompt verbatim — and landed through the existing run_gate / open_landing_pr gate→CI path, while the chat itself keeps no write tool, the worker signs nothing, and the glue never over-routes into a whole-story story build --real."
status: proposed
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
#   - wisp-as-story-claim — the claim LAYER the glue spawn's wall stands on: the E1 acquire-or-wait seam
#                     (resolveSpawnClaim, packages/agent/src/spawn-claim.ts) + the work-time claim store
#                     deltas (PgClaimStore + workClaimRequest intent + bumpHeartbeat). spawn_glue_worker
#                     is a THIRD claim-gated spawn on the same wall — no new claim primitive.
#   - notice-board  — the claim PRIMITIVE consumed by the gate: ClaimDoc / ClaimResult / workClaimRequest
#                     / bumpHeartbeat (packages/notice-board/src/claim.ts).
#   - agent         — the SDK organism: ADR-0004's single-import-site rule FORCES the generalised runner +
#                     the spawn tool surface into packages/agent (every @anthropic-ai/* import lives
#                     there); the glue worker reuses the published seams — the injectable SdkQueryFn and
#                     the fail-closed PreToolUse write-scope hook the runner already pins.
#   - drive-machinery — the physical host of spawn-deps.ts + the orchestrate pass-through; drive imports
#                     nothing from cli (ADR-0112). spawnGlueWorker is composed here.
#   - library       — the knowledge surface: renderAgentPrompt(store, "glue-worker")
#                     (packages/library/src/store/render-agent.ts) — the spawned glue role IS a rendered
#                     library agent (ADR-0051/0055 extended to subagents, ADR-0160 D4), never a forked
#                     prompt. The `glue-worker` agent artifact is authored in the seed + rendered (agent
#                     tier = seed-canonical, ADR-0055) — a KNOWLEDGE-TIER authoring dependency this story
#                     names but does not model as a capability (see Open modeling calls 1).
#   - desktop       — the SURFACE the glue-actuator-capable chat ships on: the sidecar
#                     (apps/desktop/electron/backend-entry.ts) composes the REAL glue dep (the pg claim
#                     store, the repo cwd, the session identity) into the chat mount — sidecar glue,
#                     operator-attested like the rest of that file (and the very file the incident and the
#                     canonical scoped-edit example target).
# DIRECTION / NO CYCLE (ADR-0058): this story is a PURE SOURCE NODE — nothing depends on it. Every edge
# flows DOWN toward the roots (scoped-glue-actuator → {chat-subagent-spawn, wisp-as-story-claim, desktop}
# → … → {agent, notice-board, library}); none of the named stories' depends_on lists this story, so the
# new edges introduce no cycle. (chat-subagent-spawn is itself a pure source node depending on the same
# roots; this story sits one layer above it on the same downward-flowing DAG.)
depends_on: [chat-subagent-spawn, wisp-as-story-claim, notice-board, agent, drive-machinery, library, desktop]
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

Authored from the intended consumed seams (re-verify against real imports when built). All seven are
CONSUMED, not absorbed — this story owns the SCOPED GLUE ACTUATOR (the generalisation of the fence runner,
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
- **`wisp-as-story-claim`** — the claim layer. The glue spawn consumes the E1 acquire-or-wait seam
  (`resolveSpawnClaim`, `packages/agent/src/spawn-claim.ts`) and the work-time claim-store deltas
  (`PgClaimStore.claim()` / `bumpHeartbeat`, injected) via `claimGatedSpawn`, claim-gated on the OWNING
  story `unitId`. No new claim primitive; the glue spawn is a third caller of the same wall.
- **`notice-board`** — the claim primitive: `workClaimRequest` / `ClaimResult` / `bumpHeartbeat`
  (`packages/notice-board/src/claim.ts`).
- **`agent`** — the SDK organism. The generalised runner + the tool surface physically live in
  `packages/agent` (FORCED by ADR-0004's single-import-site rule), reusing the published seams: the
  injectable `SdkQueryFn` and the fail-closed PreToolUse write-scope hook (`packages/agent/src/
  spawn-story-author.ts` / `sdk-author.ts` — the same "writes denied BEFORE they land; Bash not in the
  tool surface" wall).
- **`drive-machinery`** — the physical host of `spawn-deps.ts` and of the orchestrate pass-through.
  `@storytree/drive` imports nothing from `@storytree/cli` (ADR-0112).
- **`library`** — `renderAgentPrompt(store, "glue-worker")`
  (`packages/library/src/store/render-agent.ts`): the spawned glue role IS the rendered library agent
  (ADR-0051/0055's one-definition rule, extended to the spawned subagent — edit the artifact, regenerate,
  and the terminal-served glue-worker and the spawned glue-worker move together). The `glue-worker` agent
  artifact is authored in the seed (`apps/studio/data/knowledge.json`) + rendered offline (agent tier =
  seed-canonical, ADR-0055) — a KNOWLEDGE-TIER authoring dependency (see Open modeling calls 1). CONSUMED
  — this story owns no prompt assembly and no schema.
- **`desktop`** — the surface the glue-actuator-capable chat ships on. The sidecar
  (`apps/desktop/electron/backend-entry.ts`) composes the REAL glue dep (the pg claim store, the repo
  cwd, the session identity) into the chat mount — sidecar glue, operator-attested like the rest of that
  file (a `node:test` over it would spawn subscription-billed sessions on a gate pass, the live spend
  ADR-0010 §5 forbids). `backend-entry.ts` is also the very file the incident targeted and the canonical
  scoped-edit example.

## Story UAT

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
> files written inside the fence), landed through the gate→PR path WITHOUT a whole-story `--real` — are
> **operator-attested** (subscription-billed AND the spawned worker writes real files; the scoped edit is
> not exercised unattended), NOT standing tests.
>
> **Per-leg witness (ADR-0106).** Legs 1–4 are `witness: machine`; legs 5–6 are `witness: human`. No leg
> rests `either`. The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so
> the machine-driven whole-story UAT node stays withheld; the crown derives from the per-leg roll-up.

**Goal —** A scoped glue intent is DELEGATED, not over-routed: the orchestrator claims the owning story,
spawns a path-fenced glue worker that makes the minimal scoped edit the task prompt describes (a write
outside the fence DENIED), and lands the result through the existing gate→CI path — having itself written
nothing, signed nothing, and never reached for the whole-story `--real` build.

1. **A spawned glue worker is write-fenced to caller-declared paths and honours the task prompt.**
   _(witness: machine)_ Drive the generalised runner with an injected scripted `queryFn` whose session
   Writes inside a declared path (e.g. `apps/desktop/electron/backend-entry.ts`) and attempts one write
   outside it (e.g. `packages/agent/src/evil.ts`). **Success —** the inside write is allowed, the outside
   write is DENIED fail-closed before it lands (the violation recorded on the typed result), `stories/**`
   is NOT allowed by the glue predicate (a glue worker is not a story author), `Bash` is never in the
   session's tool surface, the injected `userPrompt` is threaded to the session verbatim, and the runner
   returns `{ ok: true, summary }` — a result shape with no verdict/signing field; a dead/empty session
   returns `{ ok: false, error }`, never a forged success. The SAME core, driven with the `stories/**`
   predicate, still fences a story-author session (the generalisation kept the existing caller green).
2. **`spawn_glue_worker` runs claim→handler and threads the fence; `spawn_builder` sheds its phantom
   knob.** _(witness: machine)_ Drive `buildSpawnTools` with a recording claim store + a recording glue
   handler. **Success —** invoking `spawn_glue_worker` (schema `{ unitId, paths, userPrompt }`) runs the
   claim gate STRICTLY BEFORE the handler; a refused claim returns the holder-naming refusal TEXT to the
   model and the handler NEVER runs; on acquire, the handler receives the caller-declared `paths` (threaded
   to the runner's fence) and the `userPrompt`; and `spawn_builder`'s schema no longer advertises a
   `userPrompt` param (ADR-0160 D5.i — the phantom knob is gone).
3. **The composition renders the real glue-worker agent fail-closed and wires the path fence.**
   _(witness: machine)_ Build the glue deps over the real seed. **Success —** the glue worker's system
   prompt is the REAL rendered `glue-worker` agent (`renderAgentPrompt(store, "glue-worker")`, non-empty,
   carries the glue-worker role — not a stub); a store with no `glue-worker` agent yields a typed error
   BEFORE any SDK call (no spend on a dead render); and `spawnGlueWorker({ unitId, paths, userPrompt })`
   calls the generalised runner with an `isWriteAllowed` predicate built from the caller-declared `paths`
   (a write inside `paths` allowed, one outside DENIED) and the `userPrompt` honoured — threaded through
   `orchestrate()` without forking the spawn chain.
4. **The composed surface holds every wall.** _(witness: machine)_ Drive the spawn-capable session with a
   scripted `queryFn` whose session invokes `spawn_glue_worker`. **Success —** the glue tool is advertised
   only when spawn deps are present (a dep-less session is byte-identical to today's surface); the tool
   call runs claim→handler in order; the chat session's own tool surface carries NO `Write`/`Edit`/`Bash`
   (spawn power only); the single-session guard still holds; and the text returned to the model from a
   glue spawn carries the worker's summary, never a verdict payload.
5. **Live: a scoped glue intent is delegated to a path-fenced worker, not over-routed.**
   _(witness: human)_ In the desktop app, converse a scoped glue intent — *"add these 3 routes to
   `apps/desktop/electron/backend-entry.ts` and stop."* **Success —** the orchestrator takes the owning
   story-claim (visible as the story's wisp), spawns `spawn_glue_worker` scoped to
   `apps/desktop/electron/backend-entry.ts`, and the three routes appear in that file authored by the
   SPAWNED worker — the chat itself wrote no file, and NO whole-story `story build --real` was run; an
   attempt by the worker to write outside the declared `paths` is denied. *(operator-attested —
   subscription-billed, and real files are written.)*
6. **Live: the scoped edit lands through the existing gate→CI path, walls intact.**
   _(witness: human)_ **Success —** the chat lands the glue edit through `run_gate` (`pnpm gate` re-proves
   the whole tree, including the owning story's registered tests) then `open_landing_pr` (a NON-DRAFT PR;
   CI independently re-proves the merge with main, ADR-0022) — WITHOUT re-running the owning story's
   `--real` build; the chat session held NO write tool at any point (spawn power only); the glue worker
   signed nothing (no verdict crossed back); ONE orchestration ran at a time; and every spawn was
   claim-first. Where a residual glue edit is genuinely un-reachable even transitively, it was
   operator-attested or escalated (ADR-0158 D3), never autonomously landed as un-proven surface.

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
