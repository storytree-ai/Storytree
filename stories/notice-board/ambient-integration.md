---
id: "ambient-integration"
tier: capability
story: notice-board
title: "Presence declares itself — fail-silent session hooks, a statusline glance; a build never writes it"
outcome: "Presence declares itself: fail-silent session hooks and a statusline glance — never via a blocking-capable hook, and a build run NEVER writes session presence (ADR-0199)."
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
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/ambient-presence.test.ts"
    sourceFile: "packages/drive/src/ambient-presence.ts"
    scope:
      testGlobs: ["packages/drive/src/ambient-presence.test.ts"]
      sourceGlobs: ["packages/drive/src/ambient-presence.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# Presence declares itself — fail-silent session hooks, a statusline glance; a build never writes it

**Outcome —** Presence declares itself: fail-silent session hooks and a statusline glance — never
via a blocking-capable hook, and a build run NEVER writes session presence (ADR-0199).

> **Proof status (honest) — `proposed`, registered for REAL build.** The registered proof
> (`packages/drive/src/ambient-presence.test.ts`) covers the MODULE legs offline — the
> module-surface assertion that no build presence wrapper exists, the fail-silent hook handler, the
> statusline glance/heartbeat, the config audit — all against fakes. The wiring note now reads: the
> build path (`node build` / `story build`, every mode) carries no presence calls at all — the
> `.claude/settings.json` hook/statusline entries land spine-side AFTER promotion, the
> presence-store house pattern; the DB-up legs are live-gated and human-verified, never attested
> by a worktree PASS. ADR-0033 Decision 3 fixes the design (the automation ladder is all advisory,
> the V1 hook-loop lesson encoded structurally); ADR-0199 retired the build rung — see the ADRs.

## Guidance

This is the automation rung of the board: presence appears without anyone typing `declare`. Every
path here is **advisory by construction** (ADR-0033 Decision 3) — a presence failure never fails,
blocks, or even speaks into the enclosing action.

The implementation is `packages/drive/src/ambient-presence.ts` — a SELF-CONTAINED module of plain
functions (no Envelope: these are automation surfaces, not choose-your-own-adventure commands).
Do NOT touch `commands.ts`, `main.ts`, `node-build.ts`, or `.claude/settings.json` (all outside
your write scope) — the spine wires the callers afterwards. Reuse the existing seams: import
`PresenceStoreLike` and `SessionIdentity` from `./noticeboard.js` (types only — never the pg
store), and `classifyPresence`/`mergeDeclaration`/`PresenceDeclarationDoc` from
`@storytree/core`. Never recompute staleness thresholds here.

- **The exported surface (exactly this — the offline test and the later spine wiring drive it):**
  - `interface AmbientDeps { store: PresenceStoreLike | null; identity: SessionIdentity | null; now: () => Date }`
    (`store` null = DB not reachable/not requested; `identity` null = not a recognisable worktree).
  - **No build presence wrapper.** ADR-0199 RETIRED the build rung — `withPresence` and
    `BuildPresenceInfo` are DELETED from `ambient-presence.ts`, and the `presence:` ambient-deps
    plumbing is stripped from the build path (`DriveNodeArgs`/`RealBuildArgs`/the story chain/the
    gate build driver). A build's footprint on the shared store is exactly `building`/phase
    work-events (observability) plus the per-unit write-claim (coordination) — never an
    `events.session` row. Builds must NEVER gain a presence write again.
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
- **The test (`packages/drive/src/ambient-presence.test.ts`, the registered REAL proof — offline
  only):** drive the surviving functions directly with a tiny in-memory `PresenceStoreLike` fake
  (one that records calls, one that throws on every call), fake identities, and a fixed `now`.
  Cover: the module-surface leg — `@storytree/drive` exports NO `withPresence` and NO
  `BuildPresenceInfo` (ADR-0199), asserted against the module's exported keys so the wrapper can
  never silently return; `sessionHook` resolves `""` on success, on a throwing store, on null deps, and
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

**Goal —** A build run leaves `events.session` untouched, hooks and statusline degrade to silence,
and nothing notice-board-shaped sits on a blocking-capable hook.

Assert `@storytree/drive` exports no build presence wrapper (`withPresence`/`BuildPresenceInfo`
absent) and that `node build`/`story build` accept no presence deps: run a scripted build with a
presence store that records calls and assert ZERO calls land on it — the launching session's
declaration survives its own builds. Run the hook wrappers and statusline command with the DB
unreachable: exit 0, no output, bounded time. Audit `.claude/settings.json` for forbidden hook
events.

## Contracts (4)

1. **`builds-never-write-session-presence`** — a build run leaves `events.session` untouched (ADR-0199)
   - **asserts —** the drive module exports no build presence wrapper — `withPresence` and
     `BuildPresenceInfo` are absent from `@storytree/drive` — and `node build`/`story build` accept
     no presence deps; a build run makes ZERO session-presence writes, so the launching session's
     own declaration survives its own builds.
   - **proven by —** would-be `packages/drive/src/ambient-presence.test.ts` (module-surface leg),
     with the wiring leg in `packages/cli/src/ambient-wiring.test.ts` (outside the registered
     proof, like the old spine-wiring note)
2. **`session-hooks-fail-silent`** — the SessionStart/SessionEnd wrappers cannot hurt a session
   - **asserts —** (offline legs) the declare/done wrapper scripts exit 0 on DB-down and bad
     input, complete within their timeout bound, and emit nothing when the DB is down; the
     successful pass-through is asserted against a faked store. The real DB-up pass-through is
     live-gated/human-verified, outside the registered proof.
   - **proven by —** would-be `packages/drive/src/ambient-presence.test.ts` (offline; DB-up leg
     live-gated)
3. **`statusline-glance`** — the statusline renders a one-line board summary or nothing
   - **asserts —** with a reachable projection the command prints one line (active count, own
     node, overlap warning) and bumps the session's `lastSeenAt` (debounced — repeated renders
     inside the debounce window write once); on any failure it prints the empty string, writes
     nothing, and exits 0.
   - **proven by —** would-be `packages/drive/src/ambient-presence.test.ts`
4. **`never-blocking-hooks`** — no notice-board hook on a blocking-capable event
   - **asserts —** a config audit of `.claude/settings.json` finds no notice-board hook registered
     on `Stop`, `PreToolUse`, or `UserPromptSubmit`.
   - **proven by —** would-be `packages/drive/src/ambient-presence.test.ts`
