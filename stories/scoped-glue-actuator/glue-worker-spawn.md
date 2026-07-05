---
id: "glue-worker-spawn"
tier: capability
story: scoped-glue-actuator
title: "The glue-worker spawn runner — the write-scoped SDK runner generalised to a caller-declared path fence honouring a task prompt"
outcome: "The write-scoped SDK runner is generalised to a role-neutral core: a spawned session runs an injected glue-worker prompt with its writes fenced fail-closed to a caller-declared path scope (NOT stories/**), honours the task prompt verbatim, and returns a typed spawn result that is never a verdict — and the existing story-author spawn calls the SAME core with its own predicate."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [160, 158, 137, 30, 4, 91, 130]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable. EDIT-EXISTING (editsExisting: true): the runner ALREADY takes an injectable
# isWriteAllowed predicate + any systemPrompt + any userPrompt (packages/agent/src/spawn-story-author.ts)
# — ADR-0160 D2's generalisation is a role-neutralisation to a runSpawnWriteScoped-shaped core that BOTH
# the story-author spawn and the glue-worker spawn call with their own predicate + prompt. NO new fence:
# the leaf renames/exposes the shared core + adds the glue-worker entry, and the EXISTING story-author
# entry stays green as one caller. The leaf authors a NEW failing test that drives the core with a
# caller-declared path predicate (allow apps/desktop/**, deny stories/** AND packages/agent/**) + a
# scripted queryFn — RED at HEAD as a RUNTIME red (the glue-worker entry / the role-neutral export does
# not exist; the fence-to-caller-paths assertion fails at runtime — NEVER a type-only red, the fence and
# the result shape are runtime behaviours a tsx-stripped run still observes), GREEN after the
# generalisation + the glue entry. A broad (>1-file behaviour: the generalisation must keep the
# story-author caller green) EDITS-EXISTING source scope REQUIRES a suite proofCommand — run the
# @storytree/agent suite so a regression in the story-author caller is observed. `install: true` + a
# typecheck wall because the module imports the SDK (@anthropic-ai/claude-agent-sdk) — the proof runs in
# a fresh worktree (ADR-0031 §2). Scope stays within packages/agent (ADR-0087: one concrete package per
# write scope).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
  real:
    testFile: "packages/agent/src/glue-worker-spawn.test.ts"
    sourceFile: "packages/agent/src/spawn-story-author.ts"
    scope:
      testGlobs: ["packages/agent/src/glue-worker-spawn.test.ts", "packages/agent/src/spawn-story-author.test.ts"]
      sourceGlobs: ["packages/agent/src/spawn-story-author.ts"]
    editsExisting: true
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/agent", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# The glue-worker spawn runner — the write-scoped runner generalised to a caller-declared path fence

**Outcome —** The write-scoped SDK runner is generalised to a role-neutral core: a spawned session runs
an injected glue-worker prompt with its writes fenced fail-closed to a **caller-declared path scope**
(NOT `stories/**`), honours the task prompt verbatim, and returns a typed spawn result that is never a
verdict — and the existing story-author spawn calls the SAME core with its own predicate.

**Depends on —** nothing in-story (a root). Cross-story it consumes the `agent` organism's published
seams: the injectable `SdkQueryFn` (`packages/agent/src/sdk-author.ts`) and the fail-closed PreToolUse
write-scope hook the runner already pins (writes denied BEFORE they land; `Bash` never in the tool
surface). It GENERALISES a `chat-subagent-spawn`-owned file (`spawn-story-author.ts`) additively under the
declared edge (story open-call 3) — the story-author entry stays green as one caller of the shared core.

> **Proof status (honest) — `proposed`.** This is the mechanism behind ADR-0160 D1/D2: the SAME fail-closed
> fence the story-author spawn already uses, generalised so a glue worker can be fenced to
> **caller-declared `paths`** (e.g. `apps/desktop/electron/backend-entry.ts`) instead of `stories/**`, and
> HONOUR the task prompt so "add these 3 routes and stop" reaches the worker. No second fence implementation
> — one write path, two roles.

## Guidance

GENERALISE, NEVER FORK (ADR-0160 D2 — the load-bearing move): `runSpawnStoryAuthor` is ALREADY not
story-specific — it takes an injectable `isWriteAllowed(relPath)` predicate (default `stories/**`), any
injected `systemPrompt`, any `userPrompt`, the fail-closed PreToolUse Write/Edit hook, no `Bash`, and
records every denied write as a typed `ScopeViolation`. Expose the role-neutral core (a
`runSpawnWriteScoped`-shaped seam) and let BOTH the story-author spawn and the glue-worker spawn call it
with their own predicate + system prompt. Do NOT build a parallel write path, a second fence, or a
copy of the hook — that is the exact duplication ADR-0160 D2 forbids. The story-author entry becomes a
thin caller of the shared core (its default `stories/**` predicate), and its existing tests stay green.

THE PATH FENCE IS CALLER-DECLARED, `stories/**` IS NOT DEFAULT (ADR-0160 D1): the glue worker's
`isWriteAllowed` is built from the caller's declared `paths` (composed in `glue-deps-composition`, not
here) — a write outside `paths` is DENIED fail-closed before it lands and recorded as a violation.
`stories/**` is NOT in a glue worker's scope (that is `spawn_story_author`'s job) — the test pins that a
glue predicate that allows `apps/desktop/**` DENIES `stories/**` too, so the two roles cannot bleed into
each other's surface.

THE TASK PROMPT IS HONOURED (ADR-0160 D1): the injected `userPrompt` is threaded to the spawned session
verbatim, so "add these 3 routes to `backend-entry.ts` and stop" reaches the worker. This is the runner's
existing behaviour (`userPrompt` is already a first-class arg) — the generalisation must KEEP it, not drop
it (the anti-pattern ADR-0160 D5.i corrects on `spawn_builder`).

THE RESULT IS A SPAWN SUMMARY, NEVER A VERDICT (ADR-0091): `{ ok: true, summary, turns?, costUsd?,
violations }` read off the SDK result message, or `{ ok: false, error, violations }` on a
dead/empty/errored session — never a thrown crash, never a forged success, and the shape carries NO
verdict/signing/proof field the chat could relay (the shape is the wall). The glue worker only EDITS; it
signs nothing — landing is the existing gate→PR path (`glue-deps-composition` folds the summary to text).

THE TURN CAP IS THE BRAKE (ADR-0130/0131): the session carries a `maxTurns` ceiling (default 16,
caller-overridable) and NO USD ceiling unless explicitly opted in — the same posture as every SDK session
in the repo.

## Integration test

**Goal —** Prove the generalised core drives one SDK session over an injected glue-worker prompt with the
write fence enforced fail-closed against a CALLER-DECLARED path scope, honours the task prompt, and
surfaces a typed spawn result — AND that the story-author entry still fences to `stories/**` (the
generalisation kept the existing caller green) — offline, through a scripted `queryFn`, zero live spend.

Exercised against its **real in-story collaborators** — the real generalised runner + the real fence
predicate wiring; only the SDK `query()` is scripted (ADR-0010 §5).

The integration test would:

1. Drive the glue-worker entry with a caller-declared predicate allowing `apps/desktop/**` and a scripted
   session that Writes `apps/desktop/electron/backend-entry.ts` (inside scope) then attempts
   `packages/agent/src/evil.ts` (outside) and `stories/demo/story.md` (outside — a glue worker is not a
   story author) — assert the first is permitted, the last two are DENIED before landing and recorded as
   violations on the result.
2. Assert the session options carry NO `Bash` in the tool surface, a `maxTurns` ceiling, and the injected
   `userPrompt` threaded to the scripted `queryFn` verbatim.
3. Assert a successful session returns `{ ok: true, summary }` with no verdict-shaped field; a scripted
   dead/empty session returns `{ ok: false, error }` — never a throw, never a forged success.
4. Drive the SAME core through the story-author entry with the default `stories/**` predicate → assert a
   `stories/**` write is permitted and a non-`stories/**` write DENIED (the generalisation did not break
   the existing caller — the story-author spawn suite stays green under the suite proofCommand).

## Contracts (4)

1. **`gws-writes-fenced-to-caller-declared-paths`** — writes outside the caller-declared `paths` are
   denied fail-closed before they land; `stories/**` is not default
   - **asserts —** a scripted glue session's `Write`/`Edit` inside a caller-declared path scope (e.g.
     `apps/desktop/**`) is permitted; one outside it — INCLUDING `stories/**` (a glue worker is not a
     story author) — is DENIED by the fail-closed scope check BEFORE the write lands and recorded as a
     typed violation; `Bash` is never present in the session's tool surface (no shell bypass).
   - **covers —** `packages/agent/src/spawn-story-author.ts` (the generalised fence + the glue-worker
     entry)
   - **proven by —** `packages/agent/src/glue-worker-spawn.test.ts` (net-new test, offline, scripted
     `queryFn`).
2. **`gws-honours-the-task-prompt-verbatim`** — the scoped task reaches the worker
   - **asserts —** the injected `userPrompt` (e.g. "add these 3 routes to `backend-entry.ts` and stop")
     is threaded to the spawned session verbatim (captured off the scripted `queryFn`) — the glue worker
     honours the task prompt, the affordance the chat lacked (ADR-0160 D1). (Contrast `spawn_builder`,
     whose per-run scope is a phantom — ADR-0160 D5.i, corrected in `spawn-glue-tool`.)
   - **covers —** `packages/agent/src/spawn-story-author.ts` (the prompt threading in the shared core)
   - **proven by —** `packages/agent/src/glue-worker-spawn.test.ts`.
3. **`gws-typed-result-never-a-verdict`** — the spawn result is a summary shape with no verdict field
   - **asserts —** a successful session returns `{ ok: true, summary, violations }` read off the SDK
     result message; a dead/empty/errored session returns `{ ok: false, error, violations }` (never a
     thrown crash, never a forged success); the result type carries NO verdict/signing/proof-status field
     — structurally nothing verdict-like exists for the chat to relay (ADR-0091).
   - **covers —** `packages/agent/src/spawn-story-author.ts` (the result fold + the result type)
   - **proven by —** `packages/agent/src/glue-worker-spawn.test.ts`.
4. **`gws-generalisation-keeps-the-story-author-caller-green`** — one core, two roles, no regression
   - **asserts —** the story-author spawn entry drives the SAME generalised core with its default
     `stories/**` predicate — a `stories/**` write permitted, a non-`stories/**` write DENIED — so the
     role-neutralisation did not fork the fence or break the existing caller (the declared-edge invariant,
     story open-call 3). Proven under the suite `proofCommand` so a regression in the story-author caller
     is observed, not just the new glue entry.
   - **covers —** `packages/agent/src/spawn-story-author.ts` (the shared core consumed by both entries)
   - **proven by —** `packages/agent/src/glue-worker-spawn.test.ts` + the existing
     `packages/agent/src/spawn-story-author.test.ts` (both in the real scope, run under the suite
     proofCommand).
