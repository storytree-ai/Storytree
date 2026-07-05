---
id: "spawn-glue-tool"
tier: capability
story: scoped-glue-actuator
title: "The spawn_glue_worker tool — a third claim-gated spawn on the chat surface, plus the spawn_builder userPrompt honesty fix"
outcome: "spawn_glue_worker mounts on buildSpawnTools as a third claim-gated spawn tool (schema { unitId, paths, userPrompt }) — claim-gated on the owning story, the path fence threaded to the runner, the chat keeping NO write tool and no verdict crossing back — AND spawn_builder's phantom userPrompt param is dropped from its schema (ADR-0160 D5.i)."
status: proposed
proof_mode: integration-test
depends_on: [glue-worker-spawn]
decisions: [160, 158, 137, 138, 91, 4, 30]
# Node-borne proof config (ADR-0057 keystone). EDIT-EXISTING (editsExisting: true): buildSpawnTools
# (packages/agent/src/spawn-tool-surface.ts — owned by chat-subagent-spawn's spawn-tool-surface, edited
# here additively under the declared edge) gains a THIRD gate-wrapped tool spawn_glue_worker (schema
# { unitId, paths, userPrompt }, claim-gated on the OWNING story via the SAME claimGatedSpawn), AND drops
# spawn_builder's phantom userPrompt param from its schema (ADR-0160 D5.i — the production dep discards
# it; spawn_glue_worker is now the real home for scoped intent). The leaf authors a NEW failing test that
# drives buildSpawnTools with a recording claim store + recording handlers and asserts the glue tool's
# claim-then-handler ordering + the paths/userPrompt threading + the spawn_builder schema no longer
# advertising userPrompt — RED at HEAD as a RUNTIME red (the glue tool is not built; the spawn_builder
# schema still carries userPrompt; the assertions fail at runtime — NEVER a type-only red, the tool
# advertisement + gate ordering are runtime behaviours), GREEN after the additive mount + the schema drop.
# A broad (>1-file behaviour: the mount + the spawn_builder schema change touch the surface, and the
# regression that spawn_story_author/spawn_builder still gate is observed) EDITS-EXISTING source scope
# REQUIRES a suite proofCommand — run the @storytree/agent suite so the existing surface tests
# (spawn-tool-surface.test.ts) are re-run. `install: true` + a typecheck wall (SDK + cross-package
# imports; fresh worktree, ADR-0031 §2). Scope stays within packages/agent (ADR-0087) — the drive-side
# composition is glue-deps-composition's, not co-edited here.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
  real:
    testFile: "packages/agent/src/spawn-glue-tool.test.ts"
    sourceFile: "packages/agent/src/spawn-tool-surface.ts"
    scope:
      testGlobs: ["packages/agent/src/spawn-glue-tool.test.ts", "packages/agent/src/spawn-tool-surface.test.ts"]
      sourceGlobs: ["packages/agent/src/spawn-tool-surface.ts"]
    editsExisting: true
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/agent", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# The spawn_glue_worker tool — a third claim-gated spawn, plus the spawn_builder honesty fix

**Outcome —** `spawn_glue_worker` mounts on `buildSpawnTools` as a third claim-gated spawn tool (schema
`{ unitId, paths, userPrompt }`) — claim-gated on the owning story, the path fence threaded to the runner,
the chat keeping NO write tool and no verdict crossing back — AND `spawn_builder`'s phantom `userPrompt`
param is dropped from its schema (ADR-0160 D5.i).

**Depends on —** [`glue-worker-spawn`](glue-worker-spawn.md) (the generalised runner the glue tool's
handler drives with the caller-declared `paths` + the `userPrompt`). It consumes `claimGatedSpawn`
(`packages/agent/src/claim-gated-spawn.ts`, chat-subagent-spawn) verbatim — the glue spawn is a third
gated caller, no change to the gate.

> **Proof status (honest) — `proposed`.** This is where ADR-0160 D1 becomes a tool the model can call —
> and where the safety walls the story promises are PINNED BY TESTS, not prose. The chat's power is to
> SPAWN and route, never to write or sign: the only new name on `allowedTools` is
> `mcp__spawn__spawn_glue_worker`; and `spawn_builder`'s phantom `userPrompt` knob is removed so its
> schema stops advertising a scope it never honoured.

## Guidance

MOUNT A THIRD GATE-WRAPPED TOOL, MIRROR THE TWO THAT EXIST (the `buildSpawnTools` pattern): the glue tool
is `claimGatedSpawn(gateDeps, handler)` exactly as `spawn_story_author` / `spawn_builder` are — the surface
builder wraps it ITSELF, so there is no constructor path that mounts an ungated spawn tool (ADR-0137 d.1
— pair the affordance with its fence). Its schema is `{ unitId, paths, userPrompt }`:
  - `unitId` — the OWNING story the glue edit lands under (glue lives WITHIN a story, ADR-0158 D1). The
    spawn is CLAIM-GATED on `unitId` via the same gate — a concurrent session holding that story is told
    who holds it and the spawn does not start.
  - `paths` — the caller-declared source scope the write fence permits (threaded into the handler → the
    generalised runner's `isWriteAllowed` predicate, built in `glue-deps-composition`). A write outside
    `paths` is DENIED (the fence, cap 1).
  - `userPrompt` — the scoped task, HONOURED (threaded verbatim), so "add these 3 routes and stop" reaches
    the worker.
A refused claim returns the holder-naming refusal TEXT to the model (a normal tool result, never a crash)
— the SAME `refusalText(heldBy)` the other two spawns use.

DROP spawn_builder's PHANTOM userPrompt (ADR-0160 D5.i — the honesty fix that rides along): `spawn_builder`
advertises a `userPrompt` param in its schema that the production dep silently discards (a builder drives
the WHOLE unit's registered proof — it has no per-run scope). Now that `spawn_glue_worker` is the real home
for scoped intent, remove `userPrompt` from `spawn_builder`'s schema so it stops advertising a knob it never
honoured. This is a SCHEMA change on the existing tool, pinned by a test asserting the param is gone — a
distinct, separately-asserted contract (an example carries its discriminator: the builder has no scope, the
glue worker does).

THE CHAT KEEPS SPAWN POWER, NOT WRITE POWER (ADR-0137 d.1 — consumed, re-asserted at this surface):
`tools: []` stays; the only new `allowedTools` name is `mcp__spawn__spawn_glue_worker`. No `Write`, no
`Edit`, no `Bash`. The write happens inside the SPAWNED glue worker under its caller-declared path fence.
(The chat-session-keeps-no-write wall and the single-session guard are chat-subagent-spawn's contracts,
consumed here — this cap asserts the glue tool does not widen the chat's own reach.)

NO VERDICT CROSSES BACK (ADR-0091 / ADR-0108 d.5): what `spawn_glue_worker` returns to the model is the
handler's typed summary TEXT — the surface never constructs or relays a verdict shape. The glue worker
only edits; landing is the existing gate→PR path.

## Integration test

**Goal —** Prove `buildSpawnTools` mounts `spawn_glue_worker` as a third gate-wrapped tool that runs
claim→handler in order, threads `paths` + `userPrompt` to the handler, and returns the summary (never a
verdict) — AND that `spawn_builder`'s schema no longer advertises `userPrompt` — offline, scripted
handlers + a recording claim store.

Exercised against its **real in-story collaborators** — the real `buildSpawnTools` wrapping the real
`claimGatedSpawn` (recording store) around recording handlers; the SDK `query()` scripted / handlers
recorded (ADR-0010 §5).

The integration test would:

1. Build the tools with spawn deps carrying a recording glue handler → assert `spawn_glue_worker` is among
   the returned tool definitions (schema `{ unitId, paths, userPrompt }`), and invoking it drives the
   claim gate's `claim()` STRICTLY BEFORE the handler; on acquire, the handler receives the caller's
   `paths` + `userPrompt`; on `{ acquired: false, heldBy }` it returns the holder-naming refusal text and
   the handler NEVER runs.
2. Assert the text `spawn_glue_worker` returns to the model is the handler's summary — no verdict-shaped
   payload appears in the tool result.
3. Assert `spawn_builder`'s tool schema no longer carries a `userPrompt` param (ADR-0160 D5.i), while
   `spawn_story_author` / `spawn_builder` still gate (the existing surface tests stay green under the
   suite proofCommand).

## Contracts (4)

1. **`sgt-glue-tool-mounts-claim-gated-with-paths-and-prompt`** — a third gate-wrapped spawn tool honouring
   the scope
   - **asserts —** `buildSpawnTools` returns `spawn_glue_worker` (schema `{ unitId, paths, userPrompt }`)
     gate-wrapped by `claimGatedSpawn`; on an acquired claim the handler receives the caller-declared
     `paths` and the `userPrompt` (threaded to the runner's fence); there is no un-gated constructor path.
   - **covers —** `packages/agent/src/spawn-tool-surface.ts` (the glue tool definition + its gate wrap)
   - **proven by —** `packages/agent/src/spawn-glue-tool.test.ts` (net-new, offline, recording handlers).
2. **`sgt-glue-tool-runs-the-gate-then-the-handler`** — no claim, no glue subagent
   - **asserts —** invoking `spawn_glue_worker` drives claim-acquire STRICTLY BEFORE the handler (recorded
     order); on a refused claim the tool returns the holder-naming refusal text (`sessionId`/`branch`/
     `intent`) as a normal tool result (never a throw) and the handler is NEVER invoked — the ADR-0138 §3
     wall enforced at the surface for the glue spawn too.
   - **covers —** `packages/agent/src/spawn-tool-surface.ts` (the gate-wrapping of the glue tool)
   - **proven by —** `packages/agent/src/spawn-glue-tool.test.ts`.
3. **`sgt-glue-spawn-returns-summary-never-a-verdict`** — the model sees the edit summary, never a verdict
   - **asserts —** the text a `spawn_glue_worker` tool call returns to the model is the handler's typed
     summary; no verdict-shaped payload (verdict/signing/proof-status fields) appears in the tool result —
     the glue worker only edits; the spine signs out-of-band and the chat has structurally nothing to
     relay (ADR-0091).
   - **covers —** `packages/agent/src/spawn-tool-surface.ts` (the glue tool's result fold)
   - **proven by —** `packages/agent/src/spawn-glue-tool.test.ts`.
4. **`sgt-spawn-builder-drops-phantom-userprompt`** — the honesty fix (ADR-0160 D5.i)
   - **asserts —** `spawn_builder`'s tool schema no longer advertises a `userPrompt` param (the production
     dep discarded it; a builder drives the WHOLE unit's registered proof, no per-run scope) — so the
     schema stops advertising a knob it never honoured; `spawn_glue_worker` is now the real home for scoped
     intent.
   - **covers —** `packages/agent/src/spawn-tool-surface.ts` (the `spawn_builder` schema)
   - **proven by —** `packages/agent/src/spawn-glue-tool.test.ts`.
