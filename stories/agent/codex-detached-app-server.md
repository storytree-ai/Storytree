---
id: "codex-detached-app-server"
tier: contract
story: agent
capability: live-codex-leaf
arc: mintbox-event-driven-orchestration-arc
title: "Stage one authenticated pinned Codex thread in an exactly owned detached process before any turn starts"
outcome: "A caller can open one authenticated repo-pinned Codex app-server, observe its response-resolved thread/model/effort and exact platform-honest process ownership before work starts, then use that same bounded controller to start a turn, probe it, and terminate its whole owned tree idempotently."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [11, 232, 561]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-detached-app-server.test.ts"]
    sourceGlobs:
      - "packages/agent/src/codex-detached-app-server.ts"
      - "packages/agent/src/index.ts"
  real:
    testFile: "packages/agent/src/codex-detached-app-server.test.ts"
    sourceFile: "packages/agent/src/codex-detached-app-server.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-detached-app-server.test.ts"]
      sourceGlobs:
        - "packages/agent/src/codex-detached-app-server.ts"
        - "packages/agent/src/index.ts"
    install: true
    editsExisting: false
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/agent", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# Stage one authenticated pinned Codex thread in an exactly owned detached process before any turn starts

**Outcome —** A caller can open one authenticated repo-pinned Codex app-server, observe its
response-resolved thread/model/effort and exact platform-honest process ownership before work starts,
then use that same bounded controller to start a turn, probe it, and terminate its whole owned tree
idempotently.

## Why this is a contract under `live-codex-leaf`

The proof-mode boundary decides the tier. This behaviour has no standalone integrated journey: its
honest proof replaces subscription auth, the child process, JSONL protocol, clock, OS ownership and
tree termination with injected collaborators and asserts one public boundary. That is one isolated
automated behaviour — a contract — inside the independently viable live-Codex capability. A seventh
capability would be a shallow boundary over the same `codex-*` runtime surface and would still need
the same stubs. The contract adds no capability edge: any helper it reuses from `codex-author.ts` or
`codex-rate-limits.ts` is inside `live-codex-leaf`, and no other capability's delivered outcome is a
precondition.

The seam is deliberately role-neutral. It knows Codex subscription authentication, protocol identity
and exact process ownership; it knows nothing about Mintbox, Terra, claims, worktrees, lane limits,
graphics, GPUs, or whether a caller should accept the observed identity.

## Proof walkthrough

Drive `openPinnedCodexDetachedThread` through the package barrel with recording fakes for its auth
runner, detached app-server spawner, JSONL messages, clock, platform ownership observer and exact-tree
terminator. No test contacts Codex, a database, or the network.

1. Request one model and reasoning effort. Let the auth runner return the exact ChatGPT-managed login
   result, then let the spawner return a positive child pid. Observe the auth probe completed before
   the first detached spawn, its environment omitted every metered Codex/OpenAI credential, and the
   command names the repository-pinned Codex entrypoint with `app-server --stdio`. Exactly one
   detached app-server is spawned.
2. Answer `initialize`, then `thread/start`, from the fake protocol. Return a thread id, model and
   reasoning effort deliberately different from the requested values. The open call returns those
   three response-produced values, the child pid, and the OS observer's opaque owner handle. Its
   protocol log is initialize -> initialized -> thread/start and contains no turn/start.
3. Run that success once as POSIX and once as Windows. POSIX returns an opaque
   `posix-process-group` owner and Windows an opaque `windows-process-tree` owner. Neither public
   variant exposes or implies the other's semantics; in particular, the Windows child pid is never
   surfaced as a POSIX pgid. A zero/negative pid, missing owner, mismatched owner root, malformed
   thread/start response, or response missing thread/model/effort refuses the open and reaps the
   spawned tree.
4. Call `startTurn` with a non-blank prompt. It sends one bounded `turn/start` for the staged thread on
   the same app-server and returns only its response-produced acceptance/turn identity. A rejected,
   malformed, timed-out or early-exit turn start rejects and triggers exact-tree cleanup. No second
   app-server is spawned.
5. Call `probe` before and after `startTurn`. It uses the same initialized app-server for the bounded
   `account/rateLimits/read` exchange and the same owner observer for OS liveness; it never starts a
   thread, turn or second process. Its public result is typed bounded evidence, not captured stdout or
   a transcript.
6. Call `terminate` twice concurrently and again after it settles. The first call closes protocol I/O,
   terminates only the returned POSIX group or Windows tree, waits within its bound for that owner to
   be observed dead, and all calls resolve to the same terminal observation. The terminator never
   broad-kills by executable name and never targets a pid/owner the open call did not return.
7. For auth refusal, spawn throw, protocol error, app-server early exit, initialize timeout,
   thread/start timeout, invalid identity, startTurn failure and explicit caller termination, inspect
   the recording log. No detached spawn follows failed auth; every failure after a child exists makes
   one bounded idempotent cleanup attempt against that exact owner (or the just-spawned child while
   ownership acquisition itself is failing), and no returned error or durable identity includes raw
   app-server output.

The observable is the public return value plus the fake auth, command, protocol, ownership, clock and
termination logs. The real package typecheck proves publication through `packages/agent/src/index.ts`.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file before
writing. The contract id in a phase prompt is an index, never a substitute for the proof walkthrough
and the full assertion below.

**One public deep module.** Author `packages/agent/src/codex-detached-app-server.ts` and publish only
the narrow role-neutral types plus `openPinnedCodexDetachedThread` through
`packages/agent/src/index.ts`. The module hides authentication, repo-pinned command resolution,
generated v2 JSONL protocol, request correlation, detachment, ownership, bounds and cleanup. Do not
export raw child-process objects, the generated `@openai/codex` protocol types, stdout/stderr, argv,
or a transcript. Do not add another `@openai/codex` import site outside `@storytree/agent`.

**Authenticate before detaching.** Run the bounded `codex login status` preflight with the existing
case-insensitive metered-credential scrub and admit only the existing exact ChatGPT-managed result.
An API-key login, ambiguity, timeout or error starts no app-server. The app-server itself comes from
the repository-pinned `@openai/codex` entrypoint (or the existing absolute executable override), with
the same scrubbed environment. It is the only detached app-server this open call may create.

**Stage before work.** Speak the pinned dependency's generated v2 protocol: initialize, send the
initialized notification, then `thread/start`. Do not issue `turn/start` inside the open call. The
returned `threadId`, resolved model and resolved reasoning effort come from `ThreadStartResponse`, not
the request, argv, intended defaults, exit status, caller prose or a log line. Reject missing or
malformed response identity. `startTurn` accepts a non-blank role-neutral prompt and runs later, on
that same initialized app-server and staged thread.

**Ownership is observed, opaque and platform-honest.** The positive pid is the spawned OS child's pid.
The public owner is a discriminated opaque value: `posix-process-group` only when a POSIX process group
was acquired and observed for that child; `windows-process-tree` only when a Windows-owned tree/job
rooted at that child was acquired and observed. The token may be persisted but its representation is
not caller policy. Never call a Windows pid a pgid, never fall back to an unowned bare pid, and never
broad-kill by image name. If exact ownership cannot be acquired, the open fails and cleans up the
just-spawned child within the same bound.

**One controller, one process, bounded all the way down.** `startTurn`, `probe` and `terminate` operate
on the same app-server. `probe` combines exact-owner liveness with a typed rate-limit observation made
through `account/rateLimits/read` on that same channel, so a caller can take before/after account-wide
observations without starting another app-server. Every protocol request and every cleanup wait has a
positive finite bound with a safe default. A protocol error, write error, early exit, timeout, invalid
identity or failed `startTurn` terminates the owned tree before rejecting. `terminate` is concurrent-
safe and idempotent, waits for observed death, and retains only bounded diagnostic detail.

**The red is runtime-observed.** Both source and test files are absent at the authored baseline. The
new test imports `openPinnedCodexDetachedThread` as a value through `./index.js`; module/export absence
is the net-new runtime red. Every assertion operates on returned values or recording fakes, never only
on erased TypeScript types. `real.scope.sourceGlobs` includes the new implementation and existing
barrel, so the package suite is the explicit `proofCommand` over both edited files.

**Tests.** Use `node:test` and `node:assert/strict`, with every await bounded and every fake settling
deterministically. Every test title begins with
`detached-codex-thread-is-staged-owned-and-bounded:` so coverage binds the one contract line below.
Literal protocol method names and platform discriminants appear in assertions rather than being read
back from production constants.

## Contracts (1)

1. **`detached-codex-thread-is-staged-owned-and-bounded`** — one authenticated pinned app-server yields response identity and exact process ownership before any turn, then remains bounded and exactly terminable.
   - **asserts —** `openPinnedCodexDetachedThread`, reached through the package barrel, completes an
     exact ChatGPT-managed auth preflight with metered credentials scrubbed before it spawns exactly
     one detached repo-pinned `app-server --stdio`; sends initialize -> initialized -> thread/start
     and no turn/start; returns the v2 `ThreadStartResponse`'s thread id, resolved model and resolved
     reasoning effort even when they differ from the request, plus the spawned child's positive pid
     and an OS-observed opaque owner discriminated honestly as either a POSIX process group or a
     Windows-owned process tree; exposes bounded `startTurn`, `probe` and concurrent-safe idempotent
     `terminate` over that same app-server, with `probe` reading owner liveness and account rate limits
     without another process; rejects auth, spawn, protocol, timeout, exit, identity and turn-start
     failures fail-closed; and after every post-spawn failure or caller termination attempts bounded
     cleanup of only that exact group/tree and confirms its death, while no public identity or error
     persists raw protocol output and no Agent type or branch contains Mintbox/Terra policy.
   - **covers —** `packages/agent/src/codex-detached-app-server.ts` and its narrow publication from
     `packages/agent/src/index.ts`.
   - **proven by —** `packages/agent/src/codex-detached-app-server.test.ts` through the declared
     focused REAL proof, with the complete `@storytree/agent` suite and typecheck as walls.
