---
id: "story-author-spawn"
tier: capability
story: chat-subagent-spawn
title: "The story-author spawn runner — a write-scoped SDK session fenced to the work-hierarchy surface"
outcome: "A spawned write-scoped SDK session runs an injected story-author prompt with its writes fenced fail-closed to the work-hierarchy surface (stories/**), returning a typed spawn result that is never a verdict."
# RETIRED with the chat-subagent-spawn story (ADR-0174 + ADR-0175, owner-directed 2026-07-17): the chat's
# agent-side spawn authority is moot (the embedded terminal running real Claude Code is the interactive
# seat; spawn/landing do not go to app-guide). Retired in place; body kept as history. The `real:` arm is
# dropped, so this capability is no longer REAL-buildable (buildableNodeIds keys on proof.real) —
# packages/cli/src/node-build.test.ts's REAL-buildable snapshot is updated in this pass.
status: retired
proof_mode: integration-test
depends_on: []
decisions: [137, 30, 4, 51, 130]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable. NET-NEW (no editsExisting): the leaf authors an integration test that imports a
# NOT-YET-EXISTING runner from a NEW module in packages/agent (red = module-not-found at HEAD), then
# writes that one new source file (green). The runner is a sibling of runHeadlessOrchestrator /
# ClaudeAgentAuthor — packages/agent is FORCED by ADR-0004's single-import-site rule (every
# @anthropic-ai/* import lives there). Proven offline through the injectable SdkQueryFn (a scripted
# double — zero live SDK spend, ADR-0010 §5): the double emits Write/Edit tool_use messages inside and
# outside stories/** and the test asserts the fence + the typed result. The RED is a runtime
# module-not-found (never a type-only red — the fence and the result shape are runtime behaviours a
# tsx-stripped run still observes). `install: true` + a typecheck wall because the module imports the
# SDK (@anthropic-ai/claude-agent-sdk) — the proof runs in a fresh worktree (ADR-0031 §2). Scope stays
# within packages/agent (ADR-0087: one concrete package per write scope). Single LITERAL source file,
# so the default node:test proof on the one test file is legal — no proofCommand.
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

# The story-author spawn runner — a write-scoped SDK session fenced to the work-hierarchy surface

**Outcome —** A spawned write-scoped SDK session runs an injected story-author prompt with its writes
fenced fail-closed to the work-hierarchy surface (`stories/**`), returning a typed spawn result that
is never a verdict.

**Depends on —** nothing in-story (a root). Cross-story it consumes the `agent` organism's published
seams: the injectable `SdkQueryFn` (`packages/agent/src/sdk-author.ts`) and the fail-closed PreToolUse
write-scope hook pattern `ClaudeAgentAuthor` pins (writes denied BEFORE they land; `Bash` never in the
tool surface).

> **Proof status (honest) — `proposed`.** This is the mechanism behind ADR-0137 d.1's first arm:
> "bring a story in → spawn the story-author (the live write; often literally one spawn)." The chat
> orchestrator NEVER writes the work hierarchy itself — this runner is where the write happens, in a
> SPAWNED session whose write reach is structurally bounded.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the SPAWNED SESSION AS A WHOLE — an
injected prompt driven through a real SDK-session shape with the write fence enforced across the
session's tool calls and a typed result read off the result message. That spans the session loop, the
fence, and the result fold — an integration test over the injectable `queryFn`, not a single isolated
assertion.

THE RUNNER TAKES A RENDERED PROMPT, IT DOES NOT RENDER ONE (the `runHeadlessOrchestrator` /
`runSdkCurator` shape): `systemPrompt` is injected by the caller. Rendering the REAL `story-author`
library agent (`renderAgentPrompt(store, "story-author")`, fail-closed when absent) is
[`spawn-deps-composition`](spawn-deps-composition.md)'s contract — keeping this module library-free
and the agent package's boundary clean. Get this wrong — rendering here — and you drag
`@storytree/library/store` into a module whose whole job is the SDK session.

THE WRITE FENCE IS THE `ClaudeAgentAuthor` HOOK PATTERN, NOT A NEW MECHANISM (ADR-0030 / the
sdk-author.ts wall): a fail-closed PreToolUse-style scope check denies every `Write`/`Edit` whose
workspace-relative path falls outside the work-hierarchy scope (`stories/**`) BEFORE the write lands,
recording the violation; `Bash` is NEVER in the tool surface (a shell write would bypass the fence).
The predicate is injectable/structural (like `isWriteAllowed`) so the test drives both arms offline.
The spawned story-author writes story/capability frontmatter-md files — disk-canonical per ADR-0039;
live `--pg` knowledge writes are explicitly OUT of this unit (story-level open call 3).

THE RESULT IS A SPAWN SUMMARY, NEVER A VERDICT (ADR-0091): `{ ok: true, summary, turns?, costUsd? }`
read off the SDK result message, or `{ ok: false, error }` on a dead/empty/errored session — never a
thrown crash, never a forged success, and the shape carries NO verdict/signing/proof field the chat
could relay (the shape is the wall: there is nothing verdict-like to hand in).

THE TURN CAP IS THE BRAKE (ADR-0130/0131): the session carries a `maxTurns` ceiling (default 16,
caller-overridable) and NO USD ceiling unless explicitly opted in — the same posture as every SDK
session in the repo.

## Integration test

**Goal —** Prove that the runner drives one SDK session over an injected prompt with the write fence
enforced fail-closed and surfaces a typed spawn result — offline, through a scripted `queryFn`, zero
live spend.

Exercised against its **real in-story collaborators** — the real runner + the real fence predicate
wiring; only the SDK `query()` is scripted (ADR-0010 §5).

The integration test would:

1. Drive the runner with a scripted session that Writes `stories/demo/story.md` (inside scope) then
   attempts `packages/agent/src/evil.ts` (outside scope) — assert the first is permitted, the second
   is DENIED before landing and recorded as a violation on the result.
2. Assert the session options carry NO `Bash` in the tool surface and a `maxTurns` ceiling.
3. Assert a successful session returns `{ ok: true, summary: <final text> }` with no verdict-shaped
   field; a scripted dead/empty session returns `{ ok: false, error }` — never a throw, never a
   forged success.

## Contracts (3)

1. **`sas-write-scope-fenced-to-the-work-hierarchy`** — writes outside `stories/**` are denied
   fail-closed before they land
   - **asserts —** a scripted session's `Write`/`Edit` inside the work-hierarchy scope is permitted;
     one outside it is DENIED by the fail-closed scope check BEFORE the write lands and recorded as a
     typed violation on the result; `Bash` is never present in the session's tool surface (no shell
     bypass of the fence).
   - **covers —** `packages/agent/src/spawn-story-author.ts` (the fence wiring)
   - **proven by —** `packages/agent/src/spawn-story-author.test.ts` (net-new, offline, scripted
     `queryFn`).
2. **`sas-typed-result-never-a-verdict`** — the spawn result is a summary shape with no verdict field
   - **asserts —** a successful session returns `{ ok: true, summary }` read off the SDK result
     message; a dead/empty/errored session returns `{ ok: false, error }` (never a thrown crash,
     never a forged success); the result type carries NO verdict/signing/proof-status field —
     structurally nothing verdict-like exists for the chat to relay (ADR-0091).
   - **covers —** `packages/agent/src/spawn-story-author.ts` (the result fold + the result type)
   - **proven by —** `packages/agent/src/spawn-story-author.test.ts`.
3. **`sas-turn-cap-is-the-brake`** — the spawned session is turn-capped, not dollar-capped
   - **asserts —** the options handed to `queryFn` carry a `maxTurns` ceiling (default 16,
     caller-overridable) and NO USD budget unless one is explicitly passed (ADR-0130/0131 — the
     subscription-funded posture every SDK session in the repo holds).
   - **covers —** `packages/agent/src/spawn-story-author.ts` (the options assembly)
   - **proven by —** `packages/agent/src/spawn-story-author.test.ts` (captured options off the
     scripted `queryFn`).
