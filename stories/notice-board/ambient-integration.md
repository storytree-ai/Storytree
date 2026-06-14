---
id: "ambient-integration"
tier: capability
story: notice-board
title: "Presence declares itself — spine-side, fail-silent hooks, a statusline glance"
outcome: "Presence declares itself: spine-side around SDK builds, fail-silent session hooks, a statusline glance — never via a blocking-capable hook."
status: proposed
proof_mode: integration-test
depends_on: [noticeboard-cli, tree-view]
# Node-borne proof config (ADR-0057): authoring this block makes the node buildable — no
# NODE_BUILD_REGISTRY edit. Mirrors the registry's NodeBuildConfig shape EXACTLY (a parity guard
# asserts equality). Pure module legs only; the spine wires node-build, .claude/settings.json hooks,
# and the statusline AFTER promotion (excluded from scope). install:true (imports @storytree/core).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
  real:
    testFile: "packages/cli/src/ambient-presence.test.ts"
    sourceFile: "packages/cli/src/ambient-presence.ts"
    scope:
      testGlobs: ["packages/cli/src/ambient-presence.test.ts"]
      sourceGlobs: ["packages/cli/src/ambient-presence.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
---

# Presence declares itself — spine-side, fail-silent hooks, a statusline glance

**Outcome —** Presence declares itself: spine-side around SDK builds, fail-silent session hooks, a
statusline glance — never via a blocking-capable hook.

> **Proof status (honest) — `proposed`, registered for REAL build.** The registered proof
> (`packages/cli/src/ambient-presence.test.ts`) covers the MODULE legs offline — the build
> wrapper, the fail-silent hook handler, the statusline glance/heartbeat, the config audit — all
> against fakes. The spine wiring (calling `withPresence` from `node build`, the
> `.claude/settings.json` hook/statusline entries) lands spine-side AFTER promotion, the
> presence-store house pattern; the DB-up legs are live-gated and human-verified, never attested
> by a worktree PASS. ADR-0033 Decision 3 fixes the design: the automation ladder is all
> advisory, and the V1 hook-loop lesson is encoded structurally — see the ADR for the lesson.

## Guidance

This is the automation rung of the board: presence appears without anyone typing `declare`. Every
path here is **advisory by construction** (ADR-0033 Decision 3) — a presence failure never fails,
blocks, or even speaks into the enclosing action.

The implementation is `packages/cli/src/ambient-presence.ts` — a SELF-CONTAINED module of plain
functions (no Envelope: these are automation surfaces, not choose-your-own-adventure commands).
Do NOT touch `commands.ts`, `main.ts`, `node-build.ts`, or `.claude/settings.json` (all outside
your write scope) — the spine wires the callers afterwards. Reuse the existing seams: import
`PresenceStoreLike` and `SessionIdentity` from `./noticeboard.js` (types only — never the pg
store), and `classifyPresence`/`mergeDeclaration`/`PresenceDeclarationDoc` from
`@storytree/core`. Never recompute staleness thresholds here.

- **The exported surface (exactly this — the offline test and the later spine wiring drive it):**
  - `interface AmbientDeps { store: PresenceStoreLike | null; identity: SessionIdentity | null; now: () => Date }`
    (`store` null = DB not reachable/not requested; `identity` null = not a recognisable worktree).
  - `interface BuildPresenceInfo { nodeId: string; runId: string; mode: string }`.
  - `async function withPresence<T>(deps: AmbientDeps, info: BuildPresenceInfo, fn: () => Promise<T>): Promise<T>`
    — the spine-side build wrapper. Declare before `fn` (doc: `sessionId`/`branch` from
    `deps.identity`, `workingOn` = a short prose line naming the mode and run id, `nodes:
    [info.nodeId]`, `status: "active"`, `startedAt`/`lastSeenAt` from `deps.now()`), run `fn`,
    mark `done` in a `finally`. EVERY presence failure — null store, null identity, a `declare`
    or `done` that throws — is swallowed silently: `fn`'s result (or its thrown error) passes
    through unchanged. The wrapper must never add output of its own.
  - `async function sessionHook(kind: "start" | "end", deps: AmbientDeps, opts: { workingOn: string; timeoutMs: number }): Promise<string>`
    — the fire-and-forget hook handler: `start` declares (with `opts.workingOn`, empty `nodes`),
    `end` marks done. Race the store call against `opts.timeoutMs`; ALWAYS resolve `""` — never
    throw, never reject, no output on any path (success included): silence is the contract.
  - `interface HeartbeatState { readLastBump: () => string | null; writeLastBump: (iso: string) => void }`
    — injected persistence for the debounce window; never a module-level global.
  - `async function statuslineGlance(deps: AmbientDeps, state: HeartbeatState, debounceMs: number): Promise<string>`
    — the glance + heartbeat. On success: ONE line — active-session count, own declared node(s),
    and an overlap warning when another active session declares a node this session also
    declares. On ANY failure (null store/identity, a throwing store): return `""` — an empty
    string cannot loop the agent. The heartbeat: when `readLastBump()` is null or older than
    `debounceMs` relative to `deps.now()`, re-declare this session's current doc with
    `lastSeenAt` = now (the store's merge anchors `startedAt`) and `writeLastBump`; inside the
    window, write nothing (owner call 2, resolved 2026-06-11 — ADR-0033 Owner decisions).
  - `function auditHookConfig(settingsJsonText: string): string[]` — the never-blocking-hooks
    audit: parse the settings JSON text and return one violation string per hook entry registered
    under `Stop`, `PreToolUse`, or `UserPromptSubmit` whose command mentions `noticeboard` or
    `ambient-presence`; `[]` when clean. Hooks on those events that are NOT notice-board-shaped
    are NOT violations — other automation legitimately lives there.
- **The test (`packages/cli/src/ambient-presence.test.ts`, the registered REAL proof — offline
  only):** drive all four functions directly with a tiny in-memory `PresenceStoreLike` fake (one
  that records calls, one that throws on every call), fake identities, and a fixed `now`. Cover:
  `withPresence` declares before `fn` and marks done in a `finally` even when `fn` throws (assert
  call order); with the throwing store or null deps the result/error of `fn` is identical and
  nothing escapes; `sessionHook` resolves `""` on success, on a throwing store, on null deps, and
  when the store hangs past `timeoutMs` (use a never-resolving promise + tiny timeout);
  `statuslineGlance` renders the count/node/overlap line, returns `""` with a throwing store,
  bumps once for two renders inside the debounce window and again past it (assert declare-call
  counts and `writeLastBump`); `auditHookConfig` flags a planted noticeboard hook under `Stop`
  and a planted `ambient-presence` hook under `PreToolUse`, and returns `[]` for a fixture with
  notice-board hooks only on `SessionStart`/`SessionEnd` plus an unrelated `PreToolUse` hook
  (NOT notice-board-shaped — must not be flagged). All fixtures are inline strings — do NOT read
  `.claude/settings.json` from disk (it is not a committed file). Assert on fragments and call
  counts — never byte-exact whole lines (brittle assertions are how this build dies).

## Integration test (would-be)

**Goal —** Presence appears around a build, hooks and statusline degrade to silence, and nothing
notice-board-shaped sits on a blocking-capable hook.

Run a scripted `node build` with a presence store that records calls: assert declare-before-leaf
and done-in-finally; rerun with a store that throws and assert the build result is byte-identical.
Run the hook wrappers and statusline command with the DB unreachable: exit 0, no output, bounded
time. Audit `.claude/settings.json` for forbidden hook events.

## Contracts (4)

1. **`spine-declares-around-builds`** — builds declare presence; a presence failure never fails a build
   - **asserts —** `node build`/`story build` (`--live`/`--real`, `--store pg`) declare (node id,
     run id prose) before the leaf runs and mark done in a `finally`; with a presence store that
     throws on every call, the build result is unchanged.
   - **proven by —** would-be `packages/cli/src/ambient-presence.test.ts`
2. **`session-hooks-fail-silent`** — the SessionStart/SessionEnd wrappers cannot hurt a session
   - **asserts —** (offline legs) the declare/done wrapper scripts exit 0 on DB-down and bad
     input, complete within their timeout bound, and emit nothing when the DB is down; the
     successful pass-through is asserted against a faked store. The real DB-up pass-through is
     live-gated/human-verified, outside the registered proof.
   - **proven by —** would-be `packages/cli/src/ambient-presence.test.ts` (offline; DB-up leg
     live-gated)
3. **`statusline-glance`** — the statusline renders a one-line board summary or nothing
   - **asserts —** with a reachable projection the command prints one line (active count, own
     node, overlap warning) and bumps the session's `lastSeenAt` (debounced — repeated renders
     inside the debounce window write once); on any failure it prints the empty string, writes
     nothing, and exits 0.
   - **proven by —** would-be `packages/cli/src/ambient-presence.test.ts`
4. **`never-blocking-hooks`** — no notice-board hook on a blocking-capable event
   - **asserts —** a config audit of `.claude/settings.json` finds no notice-board hook registered
     on `Stop`, `PreToolUse`, or `UserPromptSubmit`.
   - **proven by —** would-be `packages/cli/src/ambient-presence.test.ts`
