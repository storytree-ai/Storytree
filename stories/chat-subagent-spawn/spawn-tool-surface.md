---
id: "spawn-tool-surface"
tier: capability
story: chat-subagent-spawn
title: "The spawn tool surface — mount spawn_story_author + spawn_builder on the chat session, walls pinned by tests"
outcome: "The headless orchestrator session mounts the two typed spawn tools (spawn_story_author / spawn_builder) — each wrapped in the claim gate — while the chat session itself keeps NO Write/Edit/Bash, the single-session guard holds, and no verdict crosses back."
# RETIRED with the chat-subagent-spawn story (ADR-0174 + ADR-0175, owner-directed 2026-07-17): the chat's
# agent-side spawn authority is moot (the embedded terminal running real Claude Code is the interactive
# seat; spawn/landing do not go to app-guide). Retired in place; body kept as history. The `real:` arm is
# dropped, so this capability is no longer REAL-buildable (buildableNodeIds keys on proof.real) —
# packages/cli/src/node-build.test.ts's REAL-buildable snapshot is updated in this pass.
status: retired
proof_mode: integration-test
depends_on: [story-author-spawn, builder-spawn-dispatch, claim-gated-spawn]
decisions: [137, 108, 138, 91, 4, 30]
# Node-borne proof config (ADR-0057 keystone). EDIT-EXISTING (editsExisting: true): the surface builder
# is a NEW module (spawn-tool-surface.ts — builds the mcp__spawn__* tool list from injected handlers +
# the claim gate), and headless-orchestrator.ts (owned by the headless-orchestrator story, edited here
# additively under the declared edge) gains an OPTIONAL `spawn` dep that mounts the surface — mirroring
# exactly how the orientation surface is wired only when a runner is present (the §7 scale-down
# pattern). The leaf authors a NEW failing test that drives runHeadlessOrchestrator with spawn deps and
# asserts the advertised mcp__spawn__* tools + the gate ordering + the walls — RED at HEAD as a RUNTIME
# red (the captured options carry no spawn server; the assertions on advertised tools fail — never a
# type-only red, the type-only-RED trap), GREEN after the new module + the additive mount. A broad
# (>1-file) edits-existing source scope REQUIRES a suite proofCommand (the default single-test-file
# node:test cannot observe a regression across both files) — run the @storytree/agent suite. `install:
# true` + a typecheck wall (SDK + cross-package imports; fresh worktree, ADR-0031 §2). Scope stays
# within packages/agent (ADR-0087) — the drive-side threading is spawn-deps-composition's, not co-edited
# here.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
# The `real:` arm was dropped on retirement (explorer-onboarding-arc inc1 / ADR-0175 companion) — see the
# RETIRED note above. proof.command + proof.scope are kept as history.
---

# The spawn tool surface — mount the spawn tools on the chat session, walls pinned by tests

**Outcome —** The headless orchestrator session mounts the two typed spawn tools
(`spawn_story_author` / `spawn_builder`) — each wrapped in the claim gate — while the chat session
itself keeps NO `Write`/`Edit`/`Bash`, the single-session guard holds, and no verdict crosses back.

**Depends on —** [`story-author-spawn`](story-author-spawn.md) +
[`builder-spawn-dispatch`](builder-spawn-dispatch.md) (the two handlers each tool wraps) and
[`claim-gated-spawn`](claim-gated-spawn.md) (the gate every handler passes through first).

> **Proof status (honest) — `proposed`.** This is where ADR-0137 d.1 becomes a tool the model can
> call — and where the safety walls the story promises are PINNED BY TESTS, not prose. The chat's
> power is to SPAWN and route, never to write or sign: the only new names on `allowedTools` are
> `mcp__spawn__spawn_story_author` and `mcp__spawn__spawn_builder`.

## Guidance

MIRROR THE ORIENTATION SCALE-DOWN, EXACTLY (the `runHeadlessOrchestrator` §7 pattern): the orientation
surface is wired ONLY when a runner is present — no runner, no tools, no dead stubs burning turns. The
spawn surface follows the same shape: an OPTIONAL `spawn` dep on `HeadlessOrchestratorArgs`; absent →
the session is BYTE-IDENTICAL to today's propose-only surface (Phase-1/2 consumers, the terminal
`orchestrate` command, and every existing test are untouched). This is also the honesty property: a
read/propose session never even advertises spawn power.

EVERY HANDLER IS GATE-WRAPPED, THE SURFACE COMPOSES IT (pair the affordance with its fence): the tool
handler is `claimGatedSpawn(gateDeps, handler)` — the surface builder takes the injected handlers and
the gate deps and does the wrapping ITSELF, so there is no constructor path that mounts an ungated
spawn tool. A refused claim returns the holder-naming refusal TEXT to the model (the orchestrator
tells the user who holds the story and waits / picks other work) — a normal tool result, never a
session crash.

THE CHAT KEEPS SPAWN POWER, NOT WRITE POWER (ADR-0137 d.1 — the wall test that matters most):
`tools: []` stays; `allowedTools` = `propose_unit` + the orientation tools + the two spawn tools and
NOTHING else. No `Write`, no `Edit`, no `Bash` — asserted against the captured options, so a future
edit that quietly widens the chat's own reach goes RED here. The writes happen inside the SPAWNED
sessions under their own fences.

THE GUARD AND THE VERDICT WALL ARE PRESERVED, NOT RE-IMPLEMENTED: the single-session guard
(ADR-0108 d.6) stays the composition-level + module-level brake it already is — a spawned subagent
runs WITHIN the one orchestration (its `queryFn` session is the handler's, not a second
`runHeadlessOrchestrator` call), so spawning must neither release nor bypass the guard. And what a
spawn tool returns to the model is the handler's typed summary / progress TEXT — the surface never
constructs or relays a verdict shape (ADR-0091: the spine signs out-of-band inside the worker; the
chat has nothing to hand in).

## Integration test

**Goal —** Prove the composed session advertises the spawn tools only when deps are present, runs
claim→handler in order per call, and holds every wall (no write tools, guard intact, no verdict back)
— offline, scripted `queryFn`, injected handlers + gate deps.

Exercised against its **real in-story collaborators** — the real surface builder wrapping the real
claim gate (recording store) around recording handlers; the SDK `query()` scripted (ADR-0010 §5).

The integration test would:

1. Run `runHeadlessOrchestrator` WITHOUT spawn deps → captured options carry no `mcp__spawn__*`
   server/tools (today's surface, unchanged). Run WITH deps → both spawn tools advertised.
2. Script a session that invokes `spawn_story_author` → assert the gate's claim call preceded the
   handler, and the handler's typed summary text returned to the model; script a refused claim →
   the refusal text names the holder and the handler never ran.
3. Assert the captured `allowedTools`/`tools` carry NO `Write`/`Edit`/`Bash` with spawn deps present.
4. Start a second concurrent orchestration while the first (spawn-capable) runs → still refused
   (`session in-flight`), and a spawn inside the first does not release the guard.
5. Script a `spawn_builder` call → the text returned to the model is progress/status; assert no
   verdict-shaped payload appears in any tool result.

## Contracts (5)

1. **`sts-spawn-tools-mounted-only-with-deps`** — spawn power is opt-in per composition, absent by
   default
   - **asserts —** without a `spawn` dep the session's captured options are byte-identical to today's
     propose-only surface (no `mcp__spawn__*` names anywhere); with the dep, exactly
     `mcp__spawn__spawn_story_author` + `mcp__spawn__spawn_builder` join `allowedTools` and the spawn
     MCP server is mounted.
   - **covers —** `packages/agent/src/spawn-tool-surface.ts` + the additive mount in
     `packages/agent/src/headless-orchestrator.ts`
   - **proven by —** `packages/agent/src/spawn-tool-surface.test.ts` (net-new, offline, scripted
     `queryFn`).
2. **`sts-tool-call-runs-the-gate-then-the-handler`** — no claim, no subagent, per tool call
   - **asserts —** invoking a spawn tool off the wired server drives claim-acquire STRICTLY BEFORE
     the handler (recorded order); on a refused claim the tool returns the holder-naming refusal text
     to the model as a normal tool result (never a throw) and the handler is NEVER invoked — the
     ADR-0138 §3 wall enforced at the surface, not just available beside it.
   - **covers —** `packages/agent/src/spawn-tool-surface.ts` (the gate-wrapping composition)
   - **proven by —** `packages/agent/src/spawn-tool-surface.test.ts`.
3. **`sts-chat-session-keeps-no-write-bash`** — spawn power, never write power
   - **asserts —** with spawn deps present, the session's `tools` stays `[]` and `allowedTools`
     contains NO `Write`/`Edit`/`Bash` (nor any other write-capable name) — the ONLY additions over
     the propose-only surface are the two spawn tool names. A future widening of the chat's own reach
     turns this contract red (ADR-0137 d.1's wall, pinned).
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the options assembly with the mount)
   - **proven by —** `packages/agent/src/spawn-tool-surface.test.ts` (captured options).
4. **`sts-single-session-guard-holds`** — one orchestration at a time, spawns included
   - **asserts —** while a spawn-capable session is in flight, a second `runHeadlessOrchestrator`
     call is refused with the typed in-flight error (ADR-0108 d.6, unchanged); a spawn inside the
     running session neither releases nor bypasses the guard (the spawned work runs WITHIN the one
     orchestration's claim).
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the guard, preserved under the mount)
   - **proven by —** `packages/agent/src/spawn-tool-surface.test.ts`.
5. **`sts-no-verdict-crosses-back`** — the model sees progress, never a verdict
   - **asserts —** the text a `spawn_builder` tool call returns to the model is the dispatch's
     progress/status fold; no verdict-shaped payload (verdict/signing/proof-status fields) appears in
     any spawn tool result — the spine signs out-of-band and the chat surface has structurally
     nothing to relay (ADR-0091 / ADR-0108 d.5).
   - **covers —** `packages/agent/src/spawn-tool-surface.ts` (the result folds)
   - **proven by —** `packages/agent/src/spawn-tool-surface.test.ts`.
