---
id: "routed-node-real-dispatch"
tier: capability
story: desktop-build-mount
title: "The routed node dispatch drives the real proof — a chat-accepted NODE unit runs node build --real with persist semantics, never the synthetic --live smoke (ADR-0144)"
outcome: "A NODE-classified unit dispatched through `routedBuildRunner` drives the node's REAL proof with persist semantics — `nodeBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg' })`, never the synthetic non-persisting `--live` smoke — with a mode line that honestly names the real red→green, the persisted signed verdict, and the parked `claude/real/<unit>-<run>` branch the human lands (the story branch unchanged)."
status: proposed
proof_mode: integration-test
depends_on: [worker-relocation]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting: true):
# packages/drive/src/build-worker.ts exists at HEAD (worker-relocation landed it); the leaf authors a
# NEW node:test file (routed-node-real-dispatch.test.ts) that drives the EXISTING routedBuildRunner
# with injected fakes (classify → 'node', scripted nodeBuild/storyBuild capturing opts — exactly the
# pattern build-worker-relocation.test.ts lines 95–110 already uses in this package) and asserts the
# node branch dispatches { real: true, dryRun: false, verdictStore: 'pg' } — RED at HEAD because the
# node branch passes { live: true, dryRun: false, real: false } and omits verdictStore today (a RUNTIME
# opts assertion, not a type-only red — the spine observes a genuine failing assertion). GREEN = the
# single-file edit to build-worker.ts (the ADR-0144 flip). RUNNER: @storytree/drive is node:test
# (node --import tsx --test "src/**/*.test.ts") — NOT vitest; the new test is a node:test file, the
# SAME runner build-worker-relocation.test.ts uses. A SINGLE LITERAL test file + a SINGLE literal
# source file, so the default node:test proof on the one test file is legal — no proofCommand needed,
# and the proof deliberately stays on the DRIVE side only (see §"Standing-test realignment" below:
# the studio suite's stale `{ live: true }` assertion is the ORCHESTRATOR's supplement, outside this
# leaf's write scope — do NOT widen the proof or the scope to apps/studio). `install: true` + a
# typecheck wall because the edit touches the NodeBuildLikeOpts interface consumed across the drive
# package and by the studio/desktop adapters (the proof runs in a fresh worktree — tsx + tsc need the
# lockfile-only install, ADR-0031 §2).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    editsExisting: true
    testFile: "packages/drive/src/routed-node-real-dispatch.test.ts"
    sourceFile: "packages/drive/src/build-worker.ts"
    scope:
      testGlobs: ["packages/drive/src/routed-node-real-dispatch.test.ts"]
      sourceGlobs: ["packages/drive/src/build-worker.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/drive", "typecheck"]
---

# The routed node dispatch drives the real proof — never the synthetic smoke (ADR-0144)

**Outcome —** A NODE-classified unit dispatched through `routedBuildRunner` drives the node's REAL
proof with persist semantics — `nodeBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg' })`,
never the synthetic non-persisting `--live` smoke — with a mode line that honestly names the real
red→green, the persisted signed verdict, and the parked `claude/real/<unit>-<run>` branch the human
lands (the story branch unchanged).

**Depends on —** [`worker-relocation`](worker-relocation.md) — the routing being changed lives in the
relocated worker (`packages/drive/src/build-worker.ts`, the `@storytree/drive/build-worker` subpath
that capability delivered). This capability EDITS that file's node branch; it cannot exist until the
worker's package home does. It consumes the chat accept→dispatch semantics through the story's
existing `chat-drive-bridge` edge (the accept click is the dispatch's caller — unchanged here).

> **Proof status (honest) — `proposed`, EDIT-EXISTING over the relocated worker.** This is the
> owner-directed **ADR-0144** change (Option A of `oq-fix-drive-build-shape`, which ADR-0137's
> consequences deferred): the chat agent is the `session-orchestrator`, and slow growth means it
> proposes NODE-tier units by design — yet a chat-accepted node build today routes to
> `nodeBuild(unitId, { live: true, dryRun: false, real: false })`, the synthetic `add(2,3)` smoke:
> the node's REAL proof never runs and nothing persists. The most common accepted build is a
> throwaway demo. This capability flips the node branch to the node's real red→green with persist
> semantics, and makes the sink's mode line tell the truth about the new shape. **Landing stays the
> human gate (ADR-0136 intact):** only the story branch opens the auto-merging PR; a node `--real`
> PASS parks a `claude/real/<unit>-<run>` branch (ADR-0031) the human lands via a NON-SQUASH PR.

## Guidance

**THIS BUILD — the current `--real` increment (edit-existing): the ADR-0144 node-branch flip.** Today
`routedBuildRunner` (`packages/drive/src/build-worker.ts`, ~lines 324–345) routes a NODE-classified
unit to `nodeBuild(unitId, { live: true, dryRun: false, real: false, ...actorOpt })` — the synthetic
non-persisting smoke — and its sink line says "proves the build pipeline on a synthetic task". Per
ADR-0144 the node branch must instead drive the node's REAL proof with persist semantics:
`nodeBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg', ...actorOpt })`. The edit is
**additive and minimal, in ONE file**:

- **EDIT-EXISTING, runtime-assertion red.** Author
  `packages/drive/src/routed-node-real-dispatch.test.ts` (a `node:test` file —
  `import { test } from "node:test"; import assert from "node:assert/strict"`, the `@storytree/drive`
  convention; NOT vitest) driving the EXISTING `routedBuildRunner` with injected fakes: a `classify`
  returning `'node'` (and, separately, `'story'`), and scripted `nodeBuild` / `storyBuild` doubles
  that CAPTURE the opts they receive — exactly the pattern `build-worker-relocation.test.ts` (lines
  95–110) and the studio's `buildWorker.test.ts` already use. RED at HEAD because the node branch
  passes `{ live: true, dryRun: false, real: false }` and omits `verdictStore` today — the new test's
  opts assertions FAIL against current code (a genuine RUNTIME red the spine observes; no type-only
  trap here).
- **FLIP the node branch opts.** The node arm of `routedBuildRunner` becomes
  `deps.nodeBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg', ...actorOpt })`. It must
  NOT pass `live: true`, must NOT pass `real: false`, and must NOT omit `verdictStore` — the real
  drive's verdict PERSISTS to `events.work_event`/`events.verdict` (the build wisps and blooms
  honestly, ADR-0048). And it must NOT pass `openPr` — see the ADR-0136 wall below.
- **MAKE `NodeBuildLikeOpts.live` OPTIONAL.** The interface (same file) currently requires
  `live: boolean`; the real dispatch no longer passes it, so it becomes `live?: boolean`. This is
  deliberately compile-safe for the two adapters that construct routed deps —
  `apps/studio/server/devApi.ts` and `apps/desktop/electron/backend-entry.ts` both wrap the lazy
  `nodeBuild` as `(id, opts) => nodeBuild(id, { dryRun: false, real: false, ...opts })` with the
  routed opts SPREAD LAST, so they keep compiling untouched and the routed `{ real: true, … }` wins.
  Do NOT edit the adapters.
- **RETELL the mode line honestly.** The node branch's `sink(...)` line currently says
  "single-node --live — proves the build pipeline on a synthetic task". It must now name the NEW
  shape: a **real** red→green on the node that **persists the signed verdict**, whose PASS **parks a
  `claude/real/<unit>-<run>` branch** (ADR-0031) the human lands via a **non-squash PR** — no
  auto-PR (only a story `--real` opens the auto-merging PR, ADR-0136). This line is what the chat
  transcript streams back to the human; it is the landing affordance's honesty, so the test asserts
  its substance (real drive + parked-branch landing), not its exact prose.
- **UPDATE the stale ADR-0099-B routing comments in the SAME file.** The block comment above the node
  branch (and the `routedBuildRunner` doc comment's node-arm description) still describe the ADR-0099-B
  synthetic-smoke shape ("must NOT persist … omits verdictStore … the legitimate go-green is the
  story affordance"). Rewrite them to the ADR-0144 shape: ADR-0099-B bars only SYNTHETIC persists — a
  real drive of an existing contract is a genuine red→green, so persisting it is correct, not a
  back-door; the synthetic `--live` smoke remains available at the CLI, it is simply no longer what a
  human's accept dispatches. Stale comments here would mis-brief every future leaf that reads this
  file.
- **EVERYTHING ELSE in `build-worker.ts` STAYS.** The story branch
  (`storyBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg', openPr: true, ...actorOpt })`
  + its mode line) is UNCHANGED. `buildRunnerFromNodeBuild` (the standalone `--live` smoke adapter)
  and `adoptRunnerFromAdoptStory` are UNTOUCHED — ADR-0144 changes what an ACCEPT dispatches, not
  whether the smoke exists. The registry, `runBuildJob`, and `dispatchAcceptedBuild` are untouched.
- **The RED the spine observes:** the new test's node-branch assertions fail — `nodeBuild` receives
  `{ live: true, dryRun: false, real: false }` with `verdictStore` undefined, and the mode line names
  the synthetic task. **The GREEN:** the node branch dispatches
  `{ real: true, dryRun: false, verdictStore: 'pg' }` (no `live: true`, no `real: false`, no
  `openPr`), the mode line names the real drive + the parked-branch landing, and the story branch
  still receives exactly `{ real: true, dryRun: false, verdictStore: 'pg', openPr: true }`.

**The ADR-0136 wall — landing stays the human gate (do NOT "complete" the journey with an auto-PR).**
Only `story build --real` opens the auto-merging PR. A node `--real` PASS parks its proven commit on a
`claude/real/<unit>-<run>` branch (ADR-0031) and surfaces it in the build envelope/transcript (the
`promoted:` line + the `gh pr create` follow-on) — the human lands it deliberately, merging NON-SQUASH
so the verdict's commit stays an ancestor of main. Passing `openPr: true` on the node branch would be
a net-new outward-facing landing mechanism per node accept — OQ Option C territory, a future owner
fork explicitly NOT taken by ADR-0144. The test pins its absence.

**Why persisting is CORRECT here, not a forge (ADR-0099-B).** ADR-0099-B bars `--store pg` for any
SYNTHETIC walk — a scripted/`add(2,3)` PASS in `events.verdict` would be a forged green, and
`resolveVerdictStore` still refuses it downstream. A `--real` node drive is the OPPOSITE case: the
leaf authors the node's real test/impl in a fresh worktree, the spine observes a genuine RED→GREEN and
SIGNS (ADR-0091 — the dispatch is a build INTENT; the caller never signs), so the persisted verdict is
the honest artifact. The walls are otherwise unchanged: ADR-0121's per-unit claim still refuses a
concurrent duplicate `--real`; ADR-0130's turn cap remains the runaway brake.

## Standing-test realignment — the ORCHESTRATOR's supplement, NOT this leaf's

`apps/studio/server/buildWorker.test.ts` ("routes a NODE id to nodeBuild --live") currently asserts the
node branch passes `{ live: true }` with `verdictStore` undefined — it will go RED when this routing
flips. That standing-test realignment is the **orchestrator's supplement in the same PR, OUTSIDE this
leaf's write scope** (the scope is the one drive test file + `build-worker.ts`; the write-scoped
executor will refuse a studio edit, and the leaf must NOT try to fix it, widen its scope, or add the
studio suite to its proof). The `buildRunnerFromNodeBuild` studio test ("Phase-1 options … live,
NON-persisting") stays GREEN — that adapter is untouched. The drive package's own
`build-worker-relocation.test.ts` routing assertion captures only WHICH entry fires, not the opts, so
it also stays green.

WHY THIS IS A CAPABILITY (not a contract): its honest proof spans the ROUTED DISPATCH AS A WHOLE — the
node branch's opts flip, the absence of the synthetic shape, the mode line's landing honesty, AND the
story branch's unchanged contract — exercised as one integration of `routedBuildRunner` against
scripted build entries. That crosses the routing decision, the opts contract on both arms, and the
human-facing transcript line, so it is an integration test of the dispatch's behaviour, not a single
isolated assertion.

## Integration test

**Goal —** Prove a NODE-classified unit dispatched through `routedBuildRunner` drives the real proof
with persist semantics (never the synthetic smoke), tells the human the honest landing story, and
leaves the story branch untouched.

The integration test exercises this capability against the **real `routedBuildRunner`** with injected
fakes only at the declared seams (`classify`, `nodeBuild`, `storyBuild` — scripted doubles capturing
their opts; no SDK spend, ADR-0010 §5). No stubs of the routing under test.

The integration test would:

1. Build `routedBuildRunner({ classify: async () => 'node', nodeBuild, storyBuild })` with scripted
   entries capturing `(unitId, opts)`; drive it with a node id and a `lines[]` sink.
2. Assert `nodeBuild` was called once (and `storyBuild` never) with opts matching
   `{ real: true, dryRun: false, verdictStore: 'pg' }`.
3. Assert the synthetic shape is GONE: `opts.live` is NOT `true`, `opts.real` is NOT `false`,
   `opts.verdictStore` is NOT undefined — and `opts.openPr` is undefined (no node-level auto-PR,
   ADR-0136).
4. Assert the emitted mode line names the REAL drive and the PARKED-BRANCH landing (substance, not
   exact prose: a real red→green that persists the signed verdict; a PASS parks a
   `claude/real/<unit>-<run>` branch the human lands via a non-squash PR) and no longer names a
   synthetic task.
5. Drive the SAME runner with `classify: async () => 'story'` and assert `storyBuild` receives exactly
   `{ real: true, dryRun: false, verdictStore: 'pg', openPr: true }` (unchanged) and `nodeBuild` never
   fires — the flip did not leak into the story arm.
6. Assert an `actor` in the deps is still threaded onto the node branch's opts (the actorOpt spread
   survives the flip).

## Contracts (4)

The test-proven leaf behaviours — each **one named, substantive test** in
`packages/drive/src/routed-node-real-dispatch.test.ts` (`node:test`), the build entries injected as
scripted doubles.

> **COVERAGE CONVENTION — REQUIRED, or the verdict reads 0/4 (ADR-0122 / ADR-0126).** The
> contract-coverage classifier is STRUCTURAL: a contract is "covered" only when some test's NAME inside
> `real.testFile` carries the contract id VERBATIM as its prefix (the convention
> `test("<contract-id>: …")`) AND that test asserts something SUBSTANTIVE. Author **one named,
> substantive test per contract below**, its name beginning with the contract id. Target: **4/4.**

1. **`rnrd-node-accept-drives-real-persist`** — the node branch dispatches the real proof with persist
   semantics
   - **asserts —** a NODE-classified dispatch calls `nodeBuild` once with opts matching
     `{ real: true, dryRun: false, verdictStore: 'pg' }` (an injected `actor` threaded through), and
     `storyBuild` never fires. FALSE at HEAD (the branch passes `live: true` / `real: false` and omits
     `verdictStore`) — the ADR-0144 flip is the green.
   - **covers —** `packages/drive/src/build-worker.ts` (the `routedBuildRunner` node arm)
2. **`rnrd-no-synthetic-smoke-on-accept`** — the synthetic non-persisting shape is unreachable from an
   accept
   - **asserts —** the node branch's opts carry NO `live: true`, NO `real: false`, and NO undefined
     `verdictStore` — the synthetic `--live` smoke (which per ADR-0099-B must never persist, and whose
     `--store pg` would be refused downstream as a synthetic walk) is no longer what the routed
     dispatch runs. The smoke stays a CLI pipeline check; it is not what a human's accept dispatches.
   - **covers —** `packages/drive/src/build-worker.ts` (the node-arm opts contract)
3. **`rnrd-mode-line-names-real-and-parked-branch`** — the transcript tells the human the honest
   landing story
   - **asserts —** the node branch's sink mode line names a REAL red→green that PERSISTS the signed
     verdict and states that a PASS parks a `claude/real/<unit>-<run>` branch (ADR-0031) the human
     lands via a NON-SQUASH PR — and the opts carry no `openPr` (only a story `--real` opens the
     auto-merging PR, ADR-0136: landing stays the human gate). The old "synthetic task" wording is
     gone.
   - **covers —** `packages/drive/src/build-worker.ts` (the node-arm sink line + the openPr absence)
4. **`rnrd-story-routing-unchanged`** — the story arm's contract is untouched
   - **asserts —** a STORY-classified dispatch still calls `storyBuild` once with exactly
     `{ real: true, dryRun: false, verdictStore: 'pg', openPr: true }` (`nodeBuild` never fires) and
     its mode line still names the whole-story auto-merging PR — the flip changed one arm, not the
     router.
   - **covers —** `packages/drive/src/build-worker.ts` (the `routedBuildRunner` story arm)

## Guidance — the edit-existing slice that earns the signed verdict

The edit-existing rung toward `healthy` (ADR-0057 §3): a regression-style test that FAILS against the
current node-branch opts → the one-file flip that makes it pass.

- **The test —** `packages/drive/src/routed-node-real-dispatch.test.ts` (`node:test` +
  `node:assert/strict`, the same runner every `@storytree/drive` `*.test.ts` uses). It imports
  `routedBuildRunner` (+ the `NodeBuildLike`/`StoryBuildLike`/`BuildKind` types as needed) from
  `"./build-worker.js"`, builds scripted `nodeBuild`/`storyBuild` doubles that capture their opts, and
  drives both classifications through a `lines[]` sink.
- **The RED the spine observes (before IMPLEMENT) —** the node-branch assertions fail against HEAD:
  the captured opts are `{ live: true, dryRun: false, real: false }` with `verdictStore` undefined,
  and the mode line names the synthetic task. A genuine runtime red — no type-only-red trap.
- **The GREEN —** the single-file edit to `packages/drive/src/build-worker.ts`: the node arm
  dispatches `{ real: true, dryRun: false, verdictStore: 'pg', ...actorOpt }`, the mode line names the
  real drive + parked-branch landing, `NodeBuildLikeOpts.live` becomes optional, and the stale
  ADR-0099-B routing comments are rewritten to the ADR-0144 shape. The one test file + the drive
  typecheck are green.

Rules:

- **Flip the node arm, nothing else** — the story arm, `buildRunnerFromNodeBuild`,
  `adoptRunnerFromAdoptStory`, the registry, `runBuildJob`, and `dispatchAcceptedBuild` all stay
  byte-identical (`rnrd-story-routing-unchanged` pins the story arm).
- **No node-level auto-PR** — never pass `openPr` on the node branch; landing is the human's non-squash
  merge of the parked branch (`rnrd-mode-line-names-real-and-parked-branch`, ADR-0136/ADR-0031).
- **Persist is correct BECAUSE it is real** — `verdictStore: 'pg'` on a real drive is the honest
  artifact (ADR-0144); only synthetic persists are barred (ADR-0099-B). The dispatch stays an INTENT —
  the spine signs (ADR-0091).
- **Keep `live` optional, adapters untouched** — `NodeBuildLikeOpts.live?: boolean`; the studio/desktop
  adapters spread routed opts last and keep compiling — do NOT edit `devApi.ts` or `backend-entry.ts`.
- **Name every test for its contract (coverage convention)** — each contract gets one substantive test
  whose name STARTS with the contract id verbatim, so the ADR-0122/0126 classifier reads 4/4.
- **Stay inside the write scope** — the one test file + `build-worker.ts` (ADR-0087). The studio
  suite's stale `{ live: true }` assertion going red is the ORCHESTRATOR's realignment in the same PR,
  not yours — do not touch `apps/studio`.
