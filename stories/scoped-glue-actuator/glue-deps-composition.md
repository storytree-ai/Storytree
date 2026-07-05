---
id: "glue-deps-composition"
tier: capability
story: scoped-glue-actuator
title: "The glue-deps composition — render the real glue-worker agent, build the caller-declared path fence, wire spawnGlueWorker"
outcome: "The drive-side composition renders the REAL glue-worker library agent (fail-closed BEFORE any SDK call when absent) and wires spawnGlueWorker({ unitId, paths, userPrompt }) calling the generalised runner with the caller-declared path predicate + the rendered glue prompt, threaded through buildSpawnDeps / orchestrate() without forking the spawn chain."
status: proposed
proof_mode: integration-test
depends_on: [glue-worker-spawn, spawn-glue-tool]
decisions: [160, 158, 51, 55, 112, 138, 91]
# Node-borne proof config (ADR-0057 keystone). EDIT-EXISTING (editsExisting: true): buildSpawnDeps
# (packages/drive/src/spawn-deps.ts — owned by chat-subagent-spawn's spawn-deps-composition, edited here
# additively under the declared edge) renders the REAL glue-worker library agent
# (renderAgentPrompt(store, "glue-worker") fail-closed BEFORE any SDK call when absent, exactly as it
# renders story-author today) and wires spawnGlueWorker({ unitId, paths, userPrompt }) — building the
# per-call isWriteAllowed predicate from the caller-declared paths and calling the generalised runner
# (cap 1) with the rendered glue prompt. The leaf authors a NEW failing test driving buildSpawnDeps over
# the real seed with a scripted queryFn — RED at HEAD as a RUNTIME red (the glue-worker render + the
# spawnGlueWorker dep do not exist; the fail-closed-on-absent-agent + the paths→predicate assertions fail
# at runtime — NEVER a type-only red), GREEN after the additive composition. A broad (>1-file behaviour:
# the composition + the assertion that the existing story-author composition stays green) EDITS-EXISTING
# source scope REQUIRES a suite proofCommand — run the @storytree/drive suite so a regression in the
# story-author deps is observed. `install: true` + a typecheck wall (imports renderAgentPrompt from
# @storytree/library/store + the generalised runner from @storytree/agent across packages; fresh
# worktree, ADR-0031 §2). Scope stays within packages/drive (ADR-0087) — the agent-side surface/runner
# are CONSUMED dependencies, not co-edited.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/glue-deps-composition.test.ts"
    sourceFile: "packages/drive/src/spawn-deps.ts"
    scope:
      testGlobs: ["packages/drive/src/glue-deps-composition.test.ts", "packages/drive/src/spawn-deps.test.ts"]
      sourceGlobs: ["packages/drive/src/spawn-deps.ts"]
    editsExisting: true
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/drive", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# The glue-deps composition — render the real glue-worker agent, build the fence, wire spawnGlueWorker

**Outcome —** The drive-side composition renders the REAL `glue-worker` library agent (fail-closed BEFORE
any SDK call when absent) and wires `spawnGlueWorker({ unitId, paths, userPrompt })` calling the
generalised runner with the caller-declared path predicate + the rendered glue prompt, threaded through
`buildSpawnDeps` / `orchestrate()` without forking the spawn chain.

**Depends on —** [`spawn-glue-tool`](spawn-glue-tool.md) (the `SpawnSurfaceDeps` shape the glue dep slots
into — the surface consumes `spawnGlueWorker`) and [`glue-worker-spawn`](glue-worker-spawn.md) (the
generalised runner the composed dep calls with the caller-declared path predicate + the rendered prompt).
Cross-story it consumes `renderAgentPrompt` (`@storytree/library/store`) and the runner seam
(`@storytree/agent`).

> **Proof status (honest) — `proposed`.** This is the thin drive-side shell that turns the glue mechanism
> into the LIVE shape — the spawned glue role IS the RENDERED LIBRARY AGENT (ADR-0051/0055's
> one-definition rule, extended to the glue subagent — edit the artifact, regenerate, and the
> terminal-served glue-worker and the spawned glue-worker move together), the write fence is built from the
> caller-declared `paths`, and the whole thing rides the EXISTING `orchestrate` chain, never a fork.

## Guidance

RENDER, NEVER FORK, FAIL CLOSED (ADR-0051/0055 / the `spawn-deps.ts` precedent): the glue worker's system
prompt is `renderAgentPrompt(store, "glue-worker")` (`packages/library/src/store/render-agent.ts`) — the
SAME assembly the terminal `storytree agents glue-worker` serves. A `glue-worker` artifact absent from the
store is a typed error BEFORE any SDK call (no spend on a dead render) — never a stub prompt, never an
inlined copy of the agent's prose (ADR-0160 D4). Get this wrong — inlining the glue prose here — and the
spawned role drifts from the library definition, the exact fork ADR-0051 exists to prevent. (The
`glue-worker` agent artifact itself is authored in the seed + rendered — a seed-authoring prerequisite,
story open-call 1 — not a code unit; this cap proves the FAIL-CLOSED RENDER behaviour, which does have a
test.)

BUILD THE PATH PREDICATE FROM THE CALLER-DECLARED paths (ADR-0160 D1 — the fence half this cap owns):
`spawnGlueWorker({ unitId, paths, userPrompt })` builds the generalised runner's `isWriteAllowed`
predicate from the caller-declared `paths` (a write whose workspace-relative path is under one of `paths`
is allowed; anything else — including `stories/**` — is DENIED) and calls the generalised runner (cap 1)
with that predicate + the rendered glue prompt + the `userPrompt`. This is where the glue worker's fence
becomes the caller's declared scope — the runner is generic; the composition is what makes it glue-scoped.

THREAD, DON'T REBUILD (the `buildSpawnDeps` precedent, ADR-0112): the composed `spawnGlueWorker` slots into
the SAME `SpawnSurfaceDeps` the surface consumes and rides the EXISTING `orchestrate()` pass-through —
additive on the existing spawn chain (the story-author render, the builder dispatch, the claim deps, the
single-session guard untouched). Absent → today's behaviour, byte-identical (the story-author + builder
deps still compose). The REAL store/claim-store composition happens in the desktop sidecar
(`backend-entry.ts`), as operator-attested glue over THIS provable composition; this module keeps that glue
thin.

DRIVE IMPORTS NOTHING FROM CLI (ADR-0112's hard invariant): the composition reaches `@storytree/agent`
(the generalised runner) and `@storytree/library/store` (`renderAgentPrompt`) — never `@storytree/cli`.

NO VERDICT, ONLY A FOLDED SUMMARY (ADR-0091): `spawnGlueWorker` folds the runner's typed result to a
summary string for the chat surface (with a fence-denial note when violations occurred) — never a verdict.
The glue worker only edits; landing is the existing gate→PR path.

## Integration test

**Goal —** Prove the composition renders the real `glue-worker` agent fail-closed, builds the
caller-declared path predicate correctly, and wires `spawnGlueWorker` into the spawn deps threaded through
the real `orchestrate` chain unchanged — offline, over the real seed corpus, scripted `queryFn`, injected
claim-store double.

Exercised against its **real in-story collaborators** — the real `renderAgentPrompt` over the real seed
(`loadCorpus` + `InMemoryStore`), the real generalised runner, the real `orchestrate` composition; the SDK
`query()` scripted and the claim store injected (ADR-0010 §5).

The integration test would:

1. Build the glue deps over the real seed → assert the glue worker's system prompt is the REAL rendered
   `glue-worker` agent (non-empty, carries the glue-worker role — not a stub); remove/withhold the
   artifact → a typed error before any SDK call.
2. Drive `spawnGlueWorker({ unitId, paths: ["apps/desktop/electron/backend-entry.ts"], userPrompt })` with
   a scripted session that writes inside `paths` (allowed) and outside it (DENIED) → assert the fence
   predicate was built from `paths` and the `userPrompt` was honoured; the result folds to a summary
   string (never a verdict), with a fence-denial note when a violation occurred.
3. Compose the deps and thread them through the real `orchestrate` (scripted `queryFn`) → the runtime
   received a `spawnGlueWorker` dep and the chain is otherwise unchanged (the story-author render, the
   builder dispatch, the guard); WITHOUT the glue dep → today's spawn behaviour, byte-identical (the
   existing story-author + builder deps still compose — the `spawn-deps.test.ts` suite stays green under
   the proofCommand).

## Contracts (3)

1. **`gdc-renders-the-real-glue-worker-agent`** — the spawned glue role is the rendered library agent,
   fail-closed
   - **asserts —** the composed glue worker's system prompt is `renderAgentPrompt(store, "glue-worker")`
     over the real corpus (non-empty, carries the glue-worker role/guidance — not a stub, not an inlined
     fork); a store with no `glue-worker` agent yields a typed error BEFORE any SDK call (no spend on a
     dead render). ADR-0051/0055's one-definition rule, extended to the spawned glue subagent (ADR-0160
     D4).
   - **covers —** `packages/drive/src/spawn-deps.ts` (the glue render + fail-closed arm)
   - **proven by —** `packages/drive/src/glue-deps-composition.test.ts` (net-new, offline, real seed).
2. **`gdc-fence-built-from-caller-declared-paths-and-honours-prompt`** — the composition makes the runner
   glue-scoped
   - **asserts —** `spawnGlueWorker({ unitId, paths, userPrompt })` calls the generalised runner with an
     `isWriteAllowed` predicate BUILT FROM `paths` (a write under a declared path allowed; anything else —
     including `stories/**` — DENIED) and threads the `userPrompt` verbatim; the runner's typed result is
     folded to a summary string (never a verdict), with a fence-denial note when violations occurred.
   - **covers —** `packages/drive/src/spawn-deps.ts` (the `spawnGlueWorker` wiring + the path→predicate
     builder)
   - **proven by —** `packages/drive/src/glue-deps-composition.test.ts`.
3. **`gdc-threads-glue-dep-through-orchestrate-without-a-fork`** — an additive carry on the existing chain
   - **asserts —** `buildSpawnDeps` composes `spawnGlueWorker` into the `SpawnSurfaceDeps` and
     `orchestrate()` threads it to the runtime while the existing spawn chain is otherwise untouched — the
     story-author render, the builder dispatch, the claim deps, and the single-session guard all unchanged;
     composing WITHOUT the glue dep reproduces today's spawn behaviour byte-identically (no regression for
     the existing chat mounts or the `spawn-deps.test.ts` suite).
   - **covers —** `packages/drive/src/spawn-deps.ts` (the additive composition) +
     `packages/drive/src/orchestrate.ts` (the pass-through, consumed unchanged)
   - **proven by —** `packages/drive/src/glue-deps-composition.test.ts` (drives the real `orchestrate` with
     a scripted `queryFn`).
