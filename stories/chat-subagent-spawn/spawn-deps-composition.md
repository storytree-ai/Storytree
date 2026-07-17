---
id: "spawn-deps-composition"
tier: capability
story: chat-subagent-spawn
title: "The spawn-deps composition — render the real story-author agent, stamp session identity, thread the deps through orchestrate"
outcome: "The drive-side composition assembles the REAL spawn deps — the rendered story-author library agent (fail-closed when absent), the claim deps carrying session identity + work-kind intent, the worker-backed dispatch — and threads them through orchestrate() to the runtime without forking the Phase-1/2 chain."
# RETIRED with the chat-subagent-spawn story (ADR-0174 + ADR-0175, owner-directed 2026-07-17): the chat's
# agent-side spawn authority is moot (the embedded terminal running real Claude Code is the interactive
# seat; spawn/landing do not go to app-guide). Retired in place; body kept as history. The `real:` arm is
# dropped, so this capability is no longer REAL-buildable (buildableNodeIds keys on proof.real) —
# packages/cli/src/node-build.test.ts's REAL-buildable snapshot is updated in this pass.
status: retired
proof_mode: integration-test
depends_on: [story-author-spawn, builder-spawn-dispatch, claim-gated-spawn, spawn-tool-surface]
decisions: [137, 51, 112, 108, 138]
# Node-borne proof config (ADR-0057 keystone). EDIT-EXISTING (editsExisting: true): the composition is
# a NEW module (spawn-deps.ts — builds the SpawnDeps the runtime consumes: renderAgentPrompt(store,
# "story-author") fail-closed, the claim deps stamped with session identity + work kind, the
# worker-backed dispatch), and orchestrate.ts (owned by headless-orchestrator, physically in
# @storytree/drive — edited here additively under the declared edge, exactly the proposal-id-threading
# precedent) gains an optional spawn pass-through. The leaf authors a NEW failing test driving
# orchestrate with spawn deps over the real seed — RED at HEAD as a RUNTIME red (orchestrate ignores
# the unknown option; the captured runtime args carry no spawn deps; the assertions fail at runtime —
# never a type-only red), GREEN after the new module + the additive carry. A broad (>1-file)
# edits-existing source scope REQUIRES a suite proofCommand — run the @storytree/drive suite.
# `install: true` + a typecheck wall (imports renderAgentPrompt from @storytree/library/store + the
# runner/gate seams from @storytree/agent across packages; fresh worktree, ADR-0031 §2). Scope stays
# within packages/drive (ADR-0087) — the agent-side surface is a CONSUMED dependency, not co-edited.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
# The `real:` arm was dropped on retirement (explorer-onboarding-arc inc1 / ADR-0175 companion) — see the
# RETIRED note above. proof.command + proof.scope are kept as history.
---

# The spawn-deps composition — render the real agents, stamp identity, thread through orchestrate

**Outcome —** The drive-side composition assembles the REAL spawn deps — the rendered `story-author`
library agent (fail-closed when absent), the claim deps carrying session identity + work-kind intent,
the worker-backed dispatch — and threads them through `orchestrate()` to the runtime without forking
the Phase-1/2 chain.

**Depends on —** [`spawn-tool-surface`](spawn-tool-surface.md) (the `SpawnDeps` shape the runtime
consumes) and the three handlers it composes: [`story-author-spawn`](story-author-spawn.md),
[`builder-spawn-dispatch`](builder-spawn-dispatch.md), [`claim-gated-spawn`](claim-gated-spawn.md).

> **Proof status (honest) — `proposed`, green under a signed `--real` PASS.** Built and proven
> (`packages/drive/src/spawn-deps.ts` + `spawn-deps.test.ts`, 3/3 contracts): the thin shell that
> turns the mechanisms into the LIVE shape — the spawned story-author IS the RENDERED LIBRARY AGENT
> (ADR-0051's one-loop-definition, extended to subagents — edit the artifact, regenerate, and the
> terminal story-author and the spawned story-author move together), the claim carries WHO is
> claiming (session identity + branch + work kind, so the refusal names a real holder and the wisp
> colour layer reads a real role), and the whole thing rides the EXISTING `orchestrate` chain, never
> a fork. Status stays `proposed` — `healthy` is only ever DERIVED from signed verdicts (ADR-0020),
> never authored.

## Guidance

RENDER, NEVER FORK, FAIL CLOSED (ADR-0051 / the `orchestrator-composition` precedent): the
story-author spawn's system prompt is `renderAgentPrompt(store, "story-author")`
(`packages/library/src/store/render-agent.ts`) — the SAME assembly the terminal `storytree agents
story-author` serves. A `story-author` artifact absent from the store is a typed error BEFORE any SDK
call (no spend on a dead render, the `orchestrate` dead-session pattern) — never a stub prompt, never
an inlined copy of the agent's prose. Get this wrong and the spawned role drifts from the library
definition, the exact fork ADR-0051 exists to prevent.

STAMP THE IDENTITY THE CLAIM NEEDS (ADR-0138 §2/§5): the composed gate deps carry the session's
`sessionId` + `branch` (the ADR-0033 identity key the sidecar already derives) and stamp the work
KIND per tool (`spawn_story_author` → the authoring kind; `spawn_builder` → the driving kind) into
the claim's `intent` — so a refusal names a REAL holder and the wisp's colour-by-subagent layer
(wisp-as-story-claim, consuming the same `intent`) shows a real role. Blank identity is a fail-closed
refusal (the `ClaimDoc` wall), never a default.

THREAD, DON'T REBUILD (the proposal-id-threading precedent, ADR-0112): `orchestrate()` gains an
optional spawn-deps pass-through to `runHeadlessOrchestrator` — an additive carry on the EXISTING
Phase-1/2 chain (the real `session-orchestrator` render, the orientation runner, the single-session
guard, `startChatStream` above it all untouched). Absent deps → today's behaviour, byte-identical.
The REAL store/claim-store/BuildContext composition happens in the desktop sidecar
(`backend-entry.ts` — which already builds the pg claim reads, the `BuildContext`, and the session
identity), as operator-attested glue over THIS provable composition; this module is what makes that
glue thin.

DRIVE IMPORTS NOTHING FROM CLI (ADR-0112's hard invariant): the composition reaches
`@storytree/agent` (the runner/gate/surface seams) and `@storytree/library/store`
(`renderAgentPrompt`) — never `@storytree/cli`.

## Integration test

**Goal —** Prove the composition renders the real story-author agent fail-closed, stamps identity +
work kind into the claim deps, and threads the assembled spawn deps through the real `orchestrate`
chain unchanged — offline, over the real seed corpus, scripted `queryFn`, injected claim
store/worker doubles.

Exercised against its **real in-story collaborators** — the real `renderAgentPrompt` over the real
seed (`loadCorpus` + `InMemoryStore`), the real `orchestrate` composition, the real surface/gate
seams; the SDK `query()` scripted and the claim store / build runner injected (ADR-0010 §5).

The integration test would:

1. Build the spawn deps over the real seed → assert the story-author handler's system prompt is the
   REAL rendered `story-author` agent (non-empty, carries the role — not a stub); remove/withhold the
   artifact → a typed error before any SDK call.
2. Assert the composed claim deps carry the supplied `sessionId`/`branch` and stamp the per-tool work
   kind as the claim `intent`; blank identity → fail-closed.
3. Drive `orchestrate` WITH the spawn deps (scripted `queryFn`) → the runtime received them (the
   spawn tools advertised on the captured options) and the chain is otherwise unchanged (the real
   `session-orchestrator` render, the guard, the result shape); WITHOUT them → today's propose-only
   behaviour, byte-identical.

## Contracts (3)

1. **`sdc-renders-the-real-story-author-agent`** — the spawned role is the rendered library agent,
   fail-closed
   - **asserts —** the composed story-author spawn prompt is `renderAgentPrompt(store,
     "story-author")` over the real corpus (non-empty, carries the story-author role/guidance — not a
     stub, not an inlined fork); a store with no `story-author` agent yields a typed error BEFORE any
     SDK call (no spend on a dead render). ADR-0051's one-definition rule, extended to spawned
     subagents.
   - **covers —** `packages/drive/src/spawn-deps.ts` (the render + fail-closed arm)
   - **proven by —** `packages/drive/src/spawn-deps.test.ts` (net-new, offline, real seed).
2. **`sdc-claim-deps-carry-session-identity-and-role`** — the claim knows who and what kind
   - **asserts —** the composed gate deps carry the supplied `sessionId` + `branch` verbatim and
     stamp each spawn tool's work kind into the claim `intent` (authoring vs driving — the role the
     wisp colour layer reads, ADR-0138 §5); blank/whitespace identity is a fail-closed typed error
     (the `ClaimDoc` non-blank wall), never a defaulted claim.
   - **covers —** `packages/drive/src/spawn-deps.ts` (the claim-deps assembly)
   - **proven by —** `packages/drive/src/spawn-deps.test.ts`.
3. **`sdc-threads-spawn-deps-through-orchestrate-without-a-fork`** — an additive carry on the
   existing chain
   - **asserts —** `orchestrate()` passes the spawn deps through to the runtime (the spawn tools
     appear on the captured session options) while the Phase-1/2 chain is otherwise untouched — the
     real `session-orchestrator` render, the orientation pass-through, the single-session guard, and
     the result shape all unchanged; calling WITHOUT spawn deps reproduces today's propose-only
     behaviour byte-identically (no regression for the terminal `orchestrate` command or the existing
     chat mounts).
   - **covers —** `packages/drive/src/orchestrate.ts` (the additive pass-through) +
     `packages/drive/src/spawn-deps.ts`
   - **proven by —** `packages/drive/src/spawn-deps.test.ts` (drives the real `orchestrate` with a
     scripted `queryFn`).
