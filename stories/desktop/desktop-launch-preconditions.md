---
id: "desktop-launch-preconditions"
tier: capability
story: desktop
title: "The Electron sidecar proves a reachable DB and a git checkout before wiring any backend, refusing with a clear reason if either is unmet"
outcome: "Before the desktop sidecar wires any backend, a pure launch-precondition gate proves two preconditions — an available git checkout and a reachable live store (auto-waking it if asleep, bounded) — and returns a typed outcome that refuses with a clear reason naming the unmet precondition, so the sidecar wires the ONE full backend or refuses cleanly, never degrading to a partial read shell (ADR-0176)."
status: proposed
proof_mode: integration-test
depends_on: []
# Deciding ADRs (ADR-0037 §2): 176 is the complete replacement decision this realizes: hard-require DB
# + git at launch, block-until-ready with a bounded auto-wake, retire the degraded read shell, and carry
# forward the tsx-sidecar / boot-read / re-compose boundary from superseded ADR-0119. 60/63 supply
# `ensureLiveDb` (probe → REST auto-wake →
# bounded poll → refuse), reused verbatim as the injected DB half; 70 is the operator-attested block /
# refuse appearance.
decisions: [176, 60, 63, 70]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors a
# test that imports NOT-YET-EXISTING symbols (`ensureLaunchPreconditions` / `describeLaunchRefusal`)
# from a NEW source file under apps/desktop/src/backend (red = module-not-found against the source that
# does not exist at HEAD), then writes that one new source file (green). The module is a PURE
# composition over injected effects (probeGitRepo / ensureDb / log) — NO `pg`, NO `git`, NO
# `electron`/`dom` import (mirroring db-control.ts's `ensureDbUp` + sidecar-startup.ts's
# `acquireBackendStore`); it carries only a TYPE-ONLY `import type { EnsureDbResult } from
# "@storytree/drive"` (erased at compile — no runtime coupling, no new package edge; drive is already a
# declared desktop dep). `install: true` + a typecheck wall because that cross-package TYPE import must
# resolve under tsc in a fresh worktree (tsx + tsc need the lockfile-only install, ADR-0031 §2). Single
# LITERAL source file (no `*`), so the default node:test proof on the one test file is legal — no
# `proofCommand`.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/launch-preconditions.test.ts"
    sourceFile: "apps/desktop/src/backend/launch-preconditions.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/launch-preconditions.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/launch-preconditions.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The Electron sidecar proves a reachable DB and a git checkout before wiring any backend

**Outcome —** Before the desktop sidecar wires any backend, a pure launch-precondition gate proves two
preconditions — an available git checkout and a reachable live store (auto-waking it if asleep,
bounded) — and returns a typed outcome that refuses with a clear reason naming the unmet precondition,
so the sidecar wires the ONE full backend or refuses cleanly, **never degrading to a partial read
shell** (ADR-0176).

**Depends on —** *(none — a root capability: the launch-precondition gate runs at sidecar startup
BEFORE any backend is wired. It consumes `@storytree/drive`'s `ensureLiveDb` and `code-stamp.ts`'s
`gitHead` as INJECTED effects, sharing no in-story cap edge. `local-backend-boot`, `boot-read-routes`,
`chat-sse-mount`, and the rest are wired only WHEN this gate returns `ready` — the gate decides whether
they are stood up at all, it does not consume their outcome.)*

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code; it realizes **ADR-0176**
> (owner-directed 2026-07-09, born accepted per ADR-0110). The seam it REPLACES already exists and is
> real: `apps/desktop/electron/backend-entry.ts` `main()` today calls `acquireBackendStore(() =>
> createPool())` and, on failure, runs `serveDegraded()` — a read-only shell that hand-re-mounts a
> SUBSET of the routes (`sidecar-startup.ts`'s `degradedBackend`) while chat/build/spawn silently 404
> (the recurring *"UAT test criteria unavailable: unknown endpoint"* bug — a second, drifting route table).
> ADR-0176 RETIRES that degraded shell: the sidecar first proves the two launch preconditions, then
> wires the ONE full backend or refuses. The drivers this gate composes already exist and are real:
> `@storytree/drive`'s `ensureLiveDb` (probe → auto-wake via keyless Cloud SQL Admin REST → bounded
> 420 s poll → refuse; `db-control.ts`, ADR-0060 / ADR-0063) and `apps/desktop/src/apply/code-stamp.ts`'s
> `gitHead` (`git rev-parse HEAD` → `null` when there is no repo).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the launch gate AS A WHOLE — the
**git-first ordering** (refuse before waking the DB), the **DB auto-wake passthrough** (reuse
`ensureLiveDb`, carry its `started` / `reason` forward), and the **refusal-message render** — driven end
to end over injected git / DB doubles. It spans the ordered composition AND the refusal renderer, so it
is an integration test over injected seams (the `ensureDbUp` / `acquireBackendStore` shape), not a
single isolated assertion.

WHY THIS IS A ROOT + WHY IT FRONT-RUNS THE KEYSTONE: it imports no other in-story capability. It runs at
sidecar startup, and its typed outcome DECIDES whether `local-backend-boot`'s backend (and everything
mounted on it) gets wired at all. `local-backend-boot` stands the backend up; THIS gate stands in front
of it — an independent root alongside `credential-broker` and `local-backend-boot`, sharing no in-story
edge.

THE GATE IS A PURE COMPOSITION OVER INJECTED EFFECTS (the standalone-resilient-library shape, mirroring
`db-control.ts`'s `ensureDbUp` and `sidecar-startup.ts`'s `acquireBackendStore`): the module under
`apps/desktop/src/backend/launch-preconditions.ts` takes its effects as injected callbacks and has NO
`pg`, NO `git`, and NO `electron` / `dom` import, so `node:test` drives it headlessly with no real DB,
no real git, and no live SDK. It carries only a **type-only** `import type { EnsureDbResult } from
"@storytree/drive"` — erased at compile, so it adds no runtime coupling and no new package edge (drive
is already a declared desktop dep). The Electron `main()` wiring (below) is the operator-attested
binding, not part of this core.

GIT-FIRST ORDERING IS LOAD-BEARING (ADR-0176 §1 — the fence): the gate checks the git checkout FIRST. If
`probeGitRepo()` is false (no repo), it refuses IMMEDIATELY with `unmet: "git-repo"` and NEVER calls
`ensureDb` — waking the DB would be pointless when there is no checkout to build from, and re-probing on
Retry is the only path that helps. The test PINS this fence with an `ensureDb` spy that must never fire
on the git-absent path. This ordering guarantee is the single most load-bearing assertion of the cap.

THE DB HALF REUSES `ensureLiveDb`, PASSED THROUGH VERBATIM (ADR-0176 §1 / ADR-0060 / ADR-0063): when the
checkout is present, the gate calls the injected `ensureDb` — wired in production to
`@storytree/drive`'s `ensureLiveDb` (probe → if down, wake via REST → poll until it answers or the
bounded 420 s ceiling elapses → refuse with a clear reason). The gate does NOT reinvent the retry loop;
it CARRIES the `EnsureDbResult` forward: `{ ok: true, started }` becomes `{ ok: true, startedDb: started
}` (so the caller knows whether it had to cold-start), and `{ ok: false, reason }` becomes `{ ok: false,
unmet: "db", reason }` (the drive refusal reason surfaced unchanged — a genuinely-unreachable DB refuses
rather than hanging forever).

THE REAL WIRINGS ARE INJECTED, NEVER IMPORTED BY THE CORE: the sidecar glue (operator-attested, below)
wires `ensureDb: () => ensureLiveDb((m) => console.error(...))` and `probeGitRepo: async () => (await
gitHead(repoRoot)) !== null` (repo present ⇔ `gitHead` resolves a sha, ADR-0176 Context). The pure core
takes both as deps so the test passes doubles and touches no real DB / git.

THE TYPED OUTCOME (pin these — the leaf authors to them, the Electron `main()` branches on them, the
refuse screen renders them):
- `LaunchPreconditionResult` = `{ ok: true; startedDb: boolean } | { ok: false; unmet: "git-repo" |
  "db"; reason: string }`.
- `ensureLaunchPreconditions(deps): Promise<LaunchPreconditionResult>` where `deps` =
  `{ probeGitRepo(): Promise<boolean>; ensureDb(): Promise<EnsureDbResult>; log(m: string): void }`.
- `describeLaunchRefusal(result): string` — the user-facing refuse-screen copy per `unmet` type:
  `"git-repo"` → *"run storytree from a git checkout"* (the ADR-0176 §1 phrase); `"db"` → a
  DB-unreachable lead-in carrying the passthrough `reason` (drive's refusal text). It is called only on
  a refusal (`ok: false`); a couple of assertions prove the two branches render distinct,
  precondition-naming messages.

THE CI-PROVABLE CORE IS ELECTRON-FREE; THE LAUNCH EXPERIENCE IS OPERATOR-ATTESTED GLUE (ADR-0158 /
ADR-0070 / ADR-0176 §5): the following are **un-asserted connective code within the story** — proven
transitively and operator-attested (the look), NOT a machine leg of this cap, exactly as the sidecar's
build / spawn / overlay wiring already is:
- DELETING `serveDegraded` (`backend-entry.ts`) and `degradedBackend` (`sidecar-startup.ts`) — the
  retired second route table.
- WIRING the gate into `backend-entry.ts` `main()`: run `ensureLaunchPreconditions` first, wire the ONE
  full backend only when `ok`, and on a refusal exit with the typed reason (surfaced through
  `describeSidecarExit`) instead of serving a subset.
- The Electron `main.ts` splash (*"starting — connecting to the database"*) → studio-on-handshake →
  refuse screen (naming the unmet precondition, with a **Retry** that re-runs the gate) window flow.

These have no isolatable offline red→green (a `node:test` over them would open a real DB / spawn the
Electron shell); the orchestrator supplements them and the owner witnesses the appearance under Story
UAT leg 8. Keep this capability pointed at the pure gate + renderer only.

OFFLINE-TESTABLE BY INJECTION: the gate takes `probeGitRepo` / `ensureDb` / `log` as injected callbacks;
the test drives it with boolean / `EnsureDbResult` doubles and a `log` spy — no real git, no DB, no live
SDK. Production wires the real `gitHead` + `ensureLiveDb`, the same injection shape `node-build.ts` /
`story-build.ts` already use for `ensureDb`.

## Integration test

**Goal —** Prove that the launch-precondition gate, over injected git / DB doubles, (a) refuses on a
missing checkout WITHOUT waking the DB, (b) returns ready — carrying `startedDb` — when both preconditions
hold, (c) surfaces the drive DB-refusal reason unchanged when the store is unreachable, and (d) renders a
distinct, precondition-naming refuse message per `unmet` type — entirely in-process, no Electron, no live
SDK, no DB, no git.

The integration test exercises this capability against its **injected seams** — a `probeGitRepo` boolean
double, an `ensureDb` double returning a real `EnsureDbResult`, and a `log` spy — with no stubs inside
the gate's own composition (the ordering + passthrough logic IS the unit under test).

The integration test would:

1. **Git absent, DB never woken.** Drive `ensureLaunchPreconditions` with `probeGitRepo → false` and an
   `ensureDb` **spy** → the result is `{ ok: false, unmet: "git-repo" }` AND the spy recorded ZERO calls
   (the git-first fence: no checkout ⇒ do not wake the DB).
2. **Both preconditions met.** Drive it with `probeGitRepo → true` and `ensureDb → { ok: true, started:
   true }` → the result is `{ ok: true, startedDb: true }` (the drive result's `started` carried forward
   as `startedDb`); repeat with `started: false` → `{ ok: true, startedDb: false }`.
3. **DB refuses, reason passed through.** Drive it with `probeGitRepo → true` and `ensureDb → { ok:
   false, reason: "<drive refusal>" }` → the result is `{ ok: false, unmet: "db", reason: "<drive
   refusal>" }` (the drive reason surfaced verbatim, never reworded away).
4. **Refuse-screen copy per unmet type.** `describeLaunchRefusal({ ok: false, unmet: "git-repo", ... })`
   returns a message naming the checkout (mentions *git* / *checkout*); `describeLaunchRefusal({ ok:
   false, unmet: "db", reason })` returns a message that includes the passthrough `reason` — the two
   branches are distinct and each names its unmet precondition.
5. (structural) Assert the module imports NO `electron`, NO `pg`/`git`, and NO `apps/studio/server` —
   the pure, Electron-free core (the `EnsureDbResult` import is type-only).

## Contracts (4)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `desktop` suite),
effects injected. None exist yet; each is the assertion a contract test WILL prove against the real
launch-preconditions code once authored (provisional path — re-cite at real `file:line` when built). All
four are proven by the single `proof.real.testFile`
(`apps/desktop/src/backend/launch-preconditions.test.ts`), so `check:coverage` credits each by its
`<id>:`-named test.

1. **`lp-git-absent-refuses-without-waking-db`** — no checkout ⇒ git-repo refusal AND the DB is never woken
   - **asserts —** with `probeGitRepo → false`, `ensureLaunchPreconditions` returns `{ ok: false, unmet:
     "git-repo" }` and calls the injected `ensureDb` ZERO times (the ADR-0176 §1 git-first fence — waking
     the DB is pointless without a checkout). This is the load-bearing ordering guarantee.
   - **covers —** `apps/desktop/src/backend/launch-preconditions.ts` (the git-first gate + the fence) *(provisional path)*
2. **`lp-both-preconditions-met-returns-ready`** — checkout present + DB ready ⇒ ready, carrying startedDb
   - **asserts —** with `probeGitRepo → true` and `ensureDb → { ok: true, started }`, the gate returns
     `{ ok: true, startedDb: started }` — the drive result's `started` (whether it had to cold-start the
     instance) carried forward as `startedDb`, for both `started: true` and `started: false`.
   - **covers —** `apps/desktop/src/backend/launch-preconditions.ts` (the ready path)
3. **`lp-db-refusal-passes-through-reason`** — checkout present + DB unreachable ⇒ db refusal, reason verbatim
   - **asserts —** with `probeGitRepo → true` and `ensureDb → { ok: false, reason }`, the gate returns
     `{ ok: false, unmet: "db", reason }` — the `ensureLiveDb` refusal reason surfaced UNCHANGED (a
     genuinely-unreachable DB refuses rather than hanging; the reason is the operator's actionable text).
   - **covers —** `apps/desktop/src/backend/launch-preconditions.ts` (the db-refusal passthrough)
4. **`lp-refusal-message-names-the-unmet-precondition`** — describeLaunchRefusal renders distinct per-unmet copy
   - **asserts —** `describeLaunchRefusal` maps a `git-repo` refusal to a message naming the checkout
     (*"run storytree from a git checkout"*, ADR-0176 §1) and a `db` refusal to a message carrying the
     passthrough `reason`; the two are distinct and each names its unmet precondition (what the refuse
     screen shows).
   - **covers —** `apps/desktop/src/backend/launch-preconditions.ts` (`describeLaunchRefusal`)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the launch-precondition
gate as a new module, test-first.

- **The new test —** `apps/desktop/src/backend/launch-preconditions.test.ts` (`node:test` +
  `node:assert/strict`, the package convention — no Electron / DOM / DB / SDK / git, exactly as
  `local-backend.test.ts` and `boot-read-routes.test.ts` do). Import `{ ensureLaunchPreconditions,
  describeLaunchRefusal }` from `"./launch-preconditions.js"`. Build the injected doubles inline: a
  `probeGitRepo` returning a scripted boolean, an `ensureDb` returning a scripted `EnsureDbResult` (and,
  for contract 1, a spy that records its call count), and a `log` spy.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `launch-preconditions.ts` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red, ADR-0057). Assert the four contract behaviours above.
- **The GREEN —** write `apps/desktop/src/backend/launch-preconditions.ts`: export the
  `LaunchPreconditionResult` type, the `LaunchPreconditionDeps` interface, `ensureLaunchPreconditions`
  (git-first: if `!(await probeGitRepo())` return the git-repo refusal WITHOUT touching `ensureDb`; else
  `await ensureDb()` and map its `EnsureDbResult` to the ready / db-refusal outcome), and
  `describeLaunchRefusal`. Carry only `import type { EnsureDbResult } from "@storytree/drive"`. NO `pg`,
  NO `git`, NO `electron` / `dom`, NO `apps/studio/server` import. After it, the import resolves, the
  assertions hold, and the package suite + typecheck stay green. The Electron `main()` then wires the
  real `ensureLiveDb` + `gitHead` into this gate and DELETES `serveDegraded` / `degradedBackend`
  (operator-attested glue, not CI).

Rules:

- **Git-first, DB second — never wake the DB without a checkout** (the ADR-0176 §1 fence). The test pins
  the zero-call ensureDb spy (`lp-git-absent-refuses-without-waking-db`).
- **Reuse `ensureLiveDb`; do not reinvent the retry loop.** The DB half is the injected `ensureDb`; its
  `EnsureDbResult` is carried forward (`started → startedDb`, `reason` verbatim), not re-derived
  (`lp-both-preconditions-met-returns-ready`, `lp-db-refusal-passes-through-reason`).
- **Pure, Electron-free core** — no `pg` / `git` / `electron` / `dom` import; only a TYPE-ONLY
  `EnsureDbResult` import. The shell wiring (the gate in `main()`, the splash / refuse window) is the
  operator-attested binding, proven transitively under Story UAT leg 8 — NOT a machine leg here
  (ADR-0158 / ADR-0070 / ADR-0176 §5).
- **Refuse cleanly, never degrade** — a refusal is a typed outcome the sidecar exits on; there is no
  partial read shell. `serveDegraded` / `degradedBackend` are deleted in the glue that consumes this
  gate (the change that kills the drift class, ADR-0176 §2).
