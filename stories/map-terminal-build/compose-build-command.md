---
id: "compose-build-command"
tier: capability
story: map-terminal-build
title: "Compose the storytree build command from a unit id + scope + runtime — the pure string the map click seeds into the terminal"
outcome: "A pure `composeBuildCommand({ unitId, scope, runtime })` function returns the exact `storytree` CLI command a forest-map Build click should run: `scope: 'story'` → `pnpm storytree story build <unitId> --real --store pg --runtime <runtime>`, `scope: 'node'` → `pnpm storytree node build <unitId> --real --store pg --runtime <runtime>` — the CLI equivalents of what the selected Claude or Codex in-app dispatch drives, so the seeded command targets the clicked unit and runtime with no build engine, no @storytree/agent, no model path."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (`editsExisting: true`): the source
# and its focused vitest test already exist at HEAD, so a future drive must author a behavioural
# regression assertion against the current composer rather than manufacture the original
# module-not-found red. It is a PURE function (no React, no jsdom, no window, no seam): given
# { unitId, scope, runtime } it returns a deterministic command STRING. SCOPE = apps/studio/src (the
# composer is a studio-surface helper the
# BuildSection re-point imports; the desktop renders the COMPILED studio dist, ADR-0090 d.4). It adds NO
# `@storytree/*` dep and NO model path — a string builder, not a build engine (the app RUNS nothing; it
# hands the user a command to run).
#
# CRITICAL — the real arm declares an explicit `proofCommand` (the vitest-runner-mismatch correction,
# the chat-panel / terminal-dock-panel precedent): the studio suite is VITEST, NOT node:test.
# resolveProveSpec's DEFAULT real proof command is `node --import tsx --test <testFile>` (node:test),
# which cannot run a vitest `describe`/`it`/`expect` test. So this cap MUST declare a `real.proofCommand`
# that runs the ONE test file under VITEST: `pnpm --filter studio exec vitest run src/lib/buildCommand.test.ts`
# (`--filter studio exec` relocates cwd into apps/studio, so the path is package-relative; the pure test
# runs fine in vitest's default node environment — no `@vitest-environment jsdom` pragma needed).
# `install: true` + a typecheck wall because the --real proof runs in a FRESH worktree (tsx + tsc +
# vitest need the lockfile-only install, ADR-0031 §2). `install:true` requires `real.typecheck`; a pnpm
# proofCommand requires `install:true`.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/lib/buildCommand.test.ts"
    sourceFile: "apps/studio/src/lib/buildCommand.ts"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/lib/buildCommand.test.ts"]
      sourceGlobs: ["apps/studio/src/lib/buildCommand.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is vitest, not node:test — so the default `node --test` real proof cannot run
    # this vitest `.test.ts`. Run the ONE test file under vitest (`--filter studio exec` → cwd apps/studio).
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/lib/buildCommand.test.ts"
---

# Compose the storytree build command from a unit id + scope + runtime

**Outcome —** A pure `composeBuildCommand({ unitId, scope, runtime })` returns the exact `storytree` CLI command
a forest-map **Build** click should run:

- `scope: 'story'` → `pnpm storytree story build <unitId> --real --store pg --runtime <runtime>`
- `scope: 'node'`  → `pnpm storytree node build <unitId> --real --store pg --runtime <runtime>`

These are the CLI equivalents of what the in-app dispatch drove
([`routedBuildRunner`](../../packages/drive/src/build-worker.ts): a story → `storyBuild(id, { real: true,
verdictStore: 'pg', openPr: true })`, a node → `nodeBuild(id, { real: true, verdictStore: 'pg' })`,
ADR-0144) — so the seeded command targets the clicked unit and behaves identically to the old dispatch,
only run by the user's own Claude Code in the terminal instead of by the app's SDK author. A string
builder: no build engine, no `@storytree/agent`, no model path.

**Depends on —** nothing (within `map-terminal-build`). A self-contained pure helper — it imports
nothing (not even React). It is the ROOT the [`map-build-seeds-terminal`](map-build-seeds-terminal.md)
capability imports; the dock's seed-handling cap ([`terminal-tabs`' seed-opens-new-tab](../terminal-tabs/seed-opens-new-tab.md),
originally `terminal-dock-seed`) never sees it (the composed string reaches the dock as an opaque `command`
through the story's TreeView glue).

> **Proof status (honest) — BUILT & SIGNED.** The gated build at `4cd0d30f` created
> `buildCommand.ts` and its focused test; the current implementation also carries the selected
> `claude|codex` runtime. The authored baseline remains `proposed` because green is derived from signed
> proof, never painted in frontmatter. Whether the resulting invocation is the RIGHT form to seed on the
> member's shell remains the story's operator-attested UAT leg 6; the machine proof pins only that the
> function composes the authored string deterministically per scope and runtime.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: even though the function is small, it is the independently
inner-loop-buildable seam of this story — the unit that carries a spec-borne `real:` arm the spine drives
red→green (a contract is a leaf assertion UNDER a capability, never independently `--real` buildable). Its
honest proof spans BOTH command shapes, unit-id interpolation, and runtime selection so the seeded build
targets the clicked node with the chosen authoring runtime — four isolatable assertions over one pure
function, now re-proved as edit-existing behaviour.

WHY IT IS A SEPARATE CAPABILITY FROM [`map-build-seeds-terminal`](map-build-seeds-terminal.md) (the
splitting-rule, ADR-0010): the composer proves the STRING (given a unit + scope, what command) with no
React, no window, no seam — a pure unit test. `map-build-seeds-terminal` proves the BUTTON WIRING (on the
desktop, a Build click calls `onSeedTerminal(<composed>)` instead of POSTing `api.build`) — a jsdom
component test over a mocked bridge + a spy. Distinct observable, distinct suite shape, distinct
isolatable red. They are joined by a real import edge (`map-build-seeds-terminal` imports
`composeBuildCommand`), which is the one within-story `depends_on` — see the story's within-story graph.

THE COMMAND MIRRORS THE SELECTED DISPATCH, IT DOES NOT REINVENT IT (the honest-parity discipline). The in-app
dispatch drives `real: true` + `verdictStore: 'pg'` for BOTH kinds and carries the selected Claude or Codex
runtime (ADR-0144 flipped the node branch off
the old synthetic `--live` smoke). The CLI's own defaults carry the remaining behaviour: a `story build
--real` OPENS the auto-merging PR (`openPr` is the story default — ADR-0136), a `node build --real` PARKS
a `claude/real/<unit>-<run>` branch for the human to land non-squash (ADR-0031 / ADR-0136). So the SAME
`--real --store pg --runtime <runtime>` suffix yields the right behaviour per kind without the composer encoding `openPr` — it
is a CLI default, not a flag the function writes. Do NOT add `--live`, `--dry-run`, `--budget`, or
`--open-pr`: the composer emits exactly the dispatch's two shapes, nothing speculative (slow growth).

A STRING BUILDER, NEVER A BUILD ENGINE — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). The
function returns TEXT. It imports no `@storytree/agent`, no `@storytree/drive`, no spine, no model path
(all on the `apps/studio/src` model-path FORBIDDEN list, `modelPathBoundary.test.ts`). The app never runs
the command — it hands the user a command to run in the terminal (that is the whole ADR-0174 premise: the
real tool runs it, the app composes the intent). So this cap adds NO forbidden coupling and NO new
`@storytree/*` edge.

OFFLINE, DETERMINISTIC, NO SEAM. `@vitest-environment` is not needed — the test
imports the function and asserts its return string for a few `{ unitId, scope, runtime }` inputs. No `fetch`, no
socket, no DB, no window, no React, no fake timers. The leaf keeps the shape minimal (an object arg with
`unitId: string` + `scope: 'story' | 'node'` + `runtime: 'claude' | 'codex'`, returning a `string`) — it
must stay pure and import-free.

## Integration test

**Goal —** Prove that `composeBuildCommand` returns the exact `pnpm storytree story build <id> --real --store
pg --runtime <runtime>` for a story scope and `pnpm storytree node build <id> --real --store pg --runtime
<runtime>` for a node scope, embedding the supplied `unitId` and selected runtime so the seeded command
targets the clicked unit with the requested authoring runtime. Entirely in-process: a pure function, no
seam, no async, no environment.

The test exercises the capability against its real shape — the pure function — with a handful of
`{ unitId, scope, runtime }` inputs. No stubs (there is nothing to stub); the composition is real.

The test does:

1. Import `{ composeBuildCommand }` from `"./buildCommand"` — the existing source under proof.
2. `composeBuildCommand({ unitId: 'map-terminal-build', scope: 'story', runtime: 'claude' })` → assert it
   equals `pnpm storytree story build map-terminal-build --real --store pg --runtime claude`.
3. `composeBuildCommand({ unitId: 'compose-build-command', scope: 'node', runtime: 'codex' })` → assert it
   equals `pnpm storytree node build compose-build-command --real --store pg --runtime codex`.
4. Compose twice with DIFFERENT unit ids (same scope) → assert the two commands differ only by the id,
   with the id placed verbatim — the per-unit routing that makes the seeded build target the clicked node.
5. Compose the same unit and scope with each supported runtime → assert only the final runtime selector
   changes, so the Build click cannot silently fall back to the wrong authoring runtime.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest,
`apps/studio/src/lib/buildCommand.test.ts`). All four now EXIST and pass; the
`*(provisional path)*` markers below are retained where a real `file:line` has not been re-cited.
Per ADR-0122 (`storytree coverage`), each contract id is the lead of a distinctly-named test, so
`storytree coverage compose-build-command` reports 4/4.

1. **`cbc-composes-story-real-build`** — a story scope composes the whole-story real build command
   - **asserts —** `composeBuildCommand({ unitId, scope: 'story', runtime })` equals exactly `pnpm storytree story
     build <unitId> --real --store pg --runtime <runtime>` — the CLI equivalent of the dispatch's `storyBuild(id, { real:
     true, verdictStore: 'pg', openPr: true })` (the `--real` story build opens the auto-merging PR by CLI
     default, ADR-0136). No `--live` / `--dry-run` / `--budget`. *(Corrected 2026-07-25: this line said
     bare `storytree story build …`, contradicting both the `pnpm ` prefix rule below and the landed
     `buildCommand.ts:15` / its passing test.)*
   - **covers —** `apps/studio/src/lib/buildCommand.ts` (the story branch) *(provisional path)*
2. **`cbc-composes-node-real-build`** — a node scope composes the single-node real build command
   - **asserts —** `composeBuildCommand({ unitId, scope: 'node', runtime })` equals exactly `pnpm storytree node
     build <unitId> --real --store pg --runtime <runtime>` — the CLI equivalent of the dispatch's `nodeBuild(id, { real: true,
     verdictStore: 'pg' })` (ADR-0144; the `--real` node build parks a `claude/real/<unit>-<run>` branch
     by CLI default, ADR-0031 / ADR-0136). It is NOT the old synthetic `--live` smoke. *(Corrected
     2026-07-25 — same missing `pnpm ` prefix as contract 1.)*
   - **covers —** `apps/studio/src/lib/buildCommand.ts` (the node branch) *(provisional path)*
3. **`cbc-embeds-the-unit-id-verbatim`** — the unit id is interpolated verbatim, so the command targets the clicked unit
   - **asserts —** the supplied `unitId` appears verbatim in the composed command for both scopes; two
     distinct ids yield two commands differing only by the id — the per-unit routing that makes a Build
     click seed a build of the CLICKED node, mirroring the dispatch's per-unit `nodeBuild`/`storyBuild`
     call.
   - **covers —** `apps/studio/src/lib/buildCommand.ts` (the id interpolation) *(provisional path)*
4. **`cbc-selects-the-requested-runtime`** — the command preserves the selected authoring runtime
   - **asserts —** for the same unit and scope, selecting `claude` or `codex` changes only the final
     `--runtime` value; the composer never drops the selector or substitutes the compatibility default.
   - **covers —** `apps/studio/src/lib/buildCommand.ts` (the runtime interpolation)

## Guidance — re-proving the existing composer honestly

The composer and its test exist. A future `--real` drive is therefore an edit-existing proof
(`real.editsExisting: true`): it must begin with a behavioural regression assertion against the current
implementation, never with the original missing-module premise.

- **The focused test —** `apps/studio/src/lib/buildCommand.test.ts` (vitest — `describe`/`it`/`expect` from
  `'vitest'`, the studio convention; NO jsdom pragma needed for a pure function, NO seam, NO fake timers).
  Import `{ composeBuildCommand }` from `"./buildCommand"`. Name each test for its contract id (`cbc-…`)
  so `storytree coverage compose-build-command` reports 4/4 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** a new behavioural assertion fails against the
  existing composer. A missing `buildCommand.ts` / module-not-found red is stale and forbidden.
- **The GREEN —** adjust the existing pure `composeBuildCommand({ unitId, scope, runtime })` while
  preserving the exact `pnpm storytree ${scope} build ${unitId} --real --store pg --runtime ${runtime}`
  contract and its import-free boundary. `pnpm --filter studio test` + `pnpm --filter studio typecheck`
  remain the regression wall.

Rules:

- **Mirror the selected dispatch, don't reinvent it** — exactly `pnpm storytree <scope> build <id> --real --store pg --runtime <runtime>`;
  no `--live` / `--dry-run` / `--budget` / `--open-pr` (the CLI defaults carry openPr-vs-park-branch).
- **The `pnpm ` prefix is deliberate (orchestrator-settled from a verified fact, operator-attested at UAT
  leg 6).** ADR-0174's text writes bare `storytree story build …`, but the embedded terminal spawns the
  platform shell (PowerShell on Windows) at the pinned-main runtime worktree root (ADR-0181;
  `apps/desktop/electron/main.ts` `cwd: serveRoot`), where a bare `storytree` is not on `PATH` but `pnpm
  storytree …` IS the documented, runnable invocation (CLAUDE.md). So the composer emits the RUNNABLE form
  — the whole point of ADR-0174 is a command the user can actually run. The pre-fill is editable and the
  final prefix is operator-attested at UAT leg 6; if the owner keeps a global `storytree` bin, dropping
  `pnpm ` is a one-token change to this one function + its `cbc-*` contracts.
- **Pure and import-free** — the function takes `{ unitId, scope, runtime }` and returns a string; no seam, no
  window, no async, no `@storytree/*` import (a string builder, not a build engine — ADR-0004).
- **The string's CORRECTNESS is operator-attested, not machine-asserted** (ADR-0070) — the machine proof
  pins that the function composes the AUTHORED string per scope; whether that string launches the build
  the owner expects on the member's shell is the story's UAT leg 6.
- **Compose only, wire nothing (slow growth)** — this returns a command. It does NOT feature-detect the
  bridge, seed the terminal, or touch the Build button (that is `map-build-seeds-terminal`), and it does
  NOT sign / build / open a PR (the interactive surface composes intent; the prove-it-gate leaf is
  untouched — ADR-0174 / ADR-0091).
