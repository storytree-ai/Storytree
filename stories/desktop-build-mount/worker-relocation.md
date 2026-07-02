---
id: "worker-relocation"
tier: capability
story: desktop-build-mount
title: "The worker relocation — the build worker machinery moves into @storytree/drive/build-worker, importing nothing from apps/*, the studio importers re-pointed and green"
outcome: "The build worker machinery (`BuildRegistry`, the `runBuildJob`/`routedBuildRunner`/runner family, `dispatchAcceptedBuild`, the `BuildContext` type) lives in a new `@storytree/drive/build-worker` subpath, importing nothing from `apps/*`; the studio importers (`apiRouter.ts`, `devApi.ts`, the server suites) re-point at the package and stay green."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. THE MODELING CALL (see §"Proof posture" below): a
# pure cut-and-paste relocation is REFACTOR-PARITY, not an isolatable red→green — so the net-new,
# spine-observable assertion is the PACKAGE-BOUNDARY CONTRACT. NET-NEW (no editsExisting): the leaf authors
# a NEW node:test (build-worker-relocation.test.ts) in packages/drive/src that imports the worker trio
# (BuildRegistry, runBuildJob, dispatchAcceptedBuild, the BuildContext type) from a NOT-YET-EXISTING module
# "./build-worker.js" — RED at HEAD because that module does not exist (module-not-found, the right-kind
# red) — then writes packages/drive/src/build-worker.ts (moving the machinery in from apps/studio/server)
# + adds the "./build-worker" subpath to packages/drive/package.json exports (GREEN). The test asserts (a)
# the trio is exported and behaves (a buildable id mints + runs a scripted runner to a terminal passed),
# and (b) build-worker.ts imports NOTHING from apps/* (the ADR-0100 wall — a structural source read,
# mirroring the modelPathBoundary precedent). RUNNER: @storytree/drive is node:test (node --import tsx
# --test "src/**/*.test.ts") — the SAME runner proposal-id-threading.test.ts uses in this package; the new
# test is a node:test file. A SINGLE LITERAL test file (no `*`), so the default node:test proof on the one
# test file is legal — no proofCommand needed for the test scope; BUT the SOURCE scope is broad (the
# relocation moves several files + re-points the studio importers), so the real arm declares a suite
# proofCommand running BOTH the drive suite AND the studio server suite, so the spine observes the parity
# (the studio importers stay green) as well as the new home. `install: true` + a typecheck wall because the
# relocated module is imported across the drive package AND the studio re-point crosses the server tree
# (the proof runs in a fresh worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/build-worker-relocation.test.ts"
    sourceFile: "packages/drive/src/build-worker.ts"
    scope:
      # The net-new test is one literal file; the source scope spans the relocated drive module AND the
      # re-pointed studio importers (apiRouter.ts / devApi.ts / chat-build-dispatch's old home) — both
      # observed by the suite proofCommand below so the spine sees the parity, not just the new home.
      testGlobs: ["packages/drive/src/build-worker-relocation.test.ts"]
      sourceGlobs:
        ["packages/drive/src/build-worker.ts", "apps/studio/server/apiRouter.ts", "apps/studio/server/devApi.ts"]
    install: true
    # A broad (multi-file, cross-package) relocation REQUIRES a suite proofCommand — the default node:test
    # on the single test file cannot observe the studio importers' parity (the re-point must stay green).
    # Run the drive suite (the new home + the relocated worker's behaviour) AND the studio server suite (the
    # re-pointed importers + the 5 existing worker suites) — both green is the relocation's honest verdict.
    proofCommand:
      file: pnpm
      args: ["-r", "--filter", "@storytree/drive", "--filter", "studio", "test"]
    typecheck:
      file: pnpm
      args: ["-r", "--filter", "@storytree/drive", "--filter", "studio", "typecheck"]
---

# The worker relocation — the build worker machinery moves into @storytree/drive/build-worker

**Outcome —** The build worker machinery (`BuildRegistry`, the `runBuildJob` / `routedBuildRunner` / runner
family, `dispatchAcceptedBuild`, the `BuildContext` type) lives in a new `@storytree/drive/build-worker`
subpath, importing nothing from `apps/*`; the studio importers (`apiRouter.ts`, `devApi.ts`, the server
suites) re-point at the package and stay green.

**Depends on —** nothing in-story. This is the ROOT leaf — the relocation everything downstream needs. The
desktop cannot mount a build route until the worker is reachable from a package (it may not import
`apps/studio/server`, ADR-0100). It REUSES the existing worker behaviour verbatim — the move is the
journey, not a rewrite.

> **Proof status (honest) — `proposed`, the package-boundary contract of a relocation.** This is the
> KEYSTONE of ADR-0133 d.3: the worker (`routedBuildRunner` → `story build --real`, which persists verdicts
> + opens the auto-merging PR) already exists and is green — but it lives in `apps/studio/server`, and an
> app may not import another app's server (ADR-0100), so the desktop (where chat ships) cannot reach it.
> This capability MOVES the worker machinery DOWN into a shared `@storytree/drive/build-worker` subpath both
> surfaces may import, re-points the studio importers at the package, and proves the move with a NET-NEW
> package-boundary contract: the new subpath EXPORTS the worker trio AND imports nothing from `apps/*`
> (the wall the relocation exists to satisfy), with the studio suites still green from the new home.

## Proof posture — a relocation is not a free refactor (READ THIS)

A pure cut-and-paste — move `buildWorker.ts` + `buildRegistry.ts` + `chat-build-dispatch.ts` from
`apps/studio/server` to `packages/drive/src`, re-point the importers — is **refactor-parity**: the EXISTING
suites pass from the new home, and nothing goes red→green by writing NEW behaviour. The `proof-walkthrough-
first` discipline forces the question: *is there a coherent, isolatable red→green leaf at this tier, or is
this a re-tier?* The answer is YES, there is a genuine net-new leaf — but it is NOT "re-run the old
behaviour tests"; it is the **package-boundary contract the relocation creates**:

- **The net-new RED is real and module-not-found.** `@storytree/drive/build-worker` does NOT exist at HEAD.
  A test that imports `{ BuildRegistry, runBuildJob, dispatchAcceptedBuild }` and the `BuildContext` type
  from `"./build-worker.js"` fails module-not-found at HEAD — the right-kind net-new red (the same shape
  chat-build-dispatch used for `dispatchAcceptedBuild`, re-homed). It goes green ONLY when the relocation
  lands the new module + the subpath export.
- **The net-new GREEN asserts the WALL, not just the move.** The relocated module's reason-to-exist is that
  the desktop can import it WITHOUT importing `apps/studio/server` (ADR-0100). So the contract asserts
  STRUCTURALLY that `build-worker.ts` imports nothing from `apps/*` — a source read, exactly the
  `modelPathBoundary.test.ts` precedent (which holds `apps/studio/src` to "imports no agent/drive/model").
  That assertion is FALSE before the relocation (the machinery is IN `apps/studio/server`) and TRUE after —
  a genuine behaviour the gate observes.
- **The PARITY is the second half of the verdict, observed by the suite proofCommand.** A relocation that
  exported cleanly but broke the studio importers would be a regression dressed as a move. So the real arm's
  `proofCommand` runs BOTH the drive suite (the new home + the worker's behaviour) AND the studio server
  suite (the re-pointed importers + the 5 existing worker suites). Both green is the honest verdict: the
  worker works from its new home AND the studio still builds over it.

If a future reader finds this still reads as "just a move with a boundary assertion stapled on", the
re-tier is to a CONTRACT under a different capability — but it is NOT free refactor noise: the boundary
contract is exactly what ADR-0100 makes load-bearing, and it is the precondition the whole story rests on.

## Guidance

**THIS BUILD — the current `--real` increment (net-new module + subpath, the relocation).** Today the
worker machinery lives in `apps/studio/server` (`buildWorker.ts`, `buildRegistry.ts`,
`chat-build-dispatch.ts`) and the `BuildContext` type in `apiRouter.ts`. This increment MOVES that
machinery into `packages/drive/src/build-worker.ts`, exposes it on a new `@storytree/drive/build-worker`
subpath, and re-points the studio importers at the package — proving the move with the net-new
package-boundary test.

- **NET-NEW, missing-symbol red.** Author `packages/drive/src/build-worker-relocation.test.ts` (a
  `node:test` file — `import { test } from "node:test"; import assert from "node:assert/strict"`, the
  `@storytree/drive` convention) importing `{ BuildRegistry, runBuildJob, dispatchAcceptedBuild }` + the
  `BuildContext` type from `"./build-worker.js"` — which does NOT exist at HEAD, so the test fails
  module-not-found (the net-new red). Then write the one new source file + the subpath export (green).
- **MOVE the machinery, do not rewrite it.** `packages/drive/src/build-worker.ts` receives the EXACT
  contents of `apps/studio/server/buildWorker.ts` (`BuildEnvelope` / `BuildRunner` / `NodeBuildLike` /
  `runBuildJob` / `failureReason` / `buildRunnerFromNodeBuild` / `adoptRunnerFromAdoptStory` / `BuildKind` /
  `StoryBuildLike` / `RoutedBuildDeps` / `routedBuildRunner`), `apps/studio/server/buildRegistry.ts`
  (`BuildRegistry` + its types — imports only `node:crypto`), `apps/studio/server/chat-build-dispatch.ts`
  (`dispatchAcceptedBuild` + `DispatchResult`), and the `BuildContext` interface lifted out of
  `apiRouter.ts`. Whether `BuildRegistry` stays its own `build-registry.ts` module in the package or folds
  into one `build-worker.ts` is an implementation choice — the SUBPATH exports the trio either way. Behaviour
  is unchanged: a buildable id still mints + runs; an un-buildable id is still a typed refusal; the
  single-build guard still surfaces. Get this wrong — "improving" the worker while moving it — and the
  parity verdict (the studio suites) will catch the drift, but the move is no longer a clean relocation.
- **EXPORT the new subpath.** Add `"./build-worker": "./src/build-worker.ts"` to
  `packages/drive/package.json` `exports` (beside `"./build"` and `"./secrets"`). This is what makes
  `@storytree/drive/build-worker` resolvable from the desktop (capability 2) and the studio (the re-point).
- **RE-POINT the studio importers, keep them green.** `apps/studio/server/apiRouter.ts` (imports
  `runBuildJob` / `BuildRunner` / `BuildRegistry` + defines `BuildContext`), `apps/studio/server/devApi.ts`
  (imports `BuildRegistry` / `routedBuildRunner` / `adoptRunnerFromAdoptStory`), and the moved
  `chat-build-dispatch` consumers now import from `@storytree/drive/build-worker` instead of the local
  `./buildWorker.js` / `./buildRegistry.js` / `./chat-build-dispatch.js`. The five server suites
  (`buildRegistry.test.ts`, `buildWorker.test.ts`, `chat-build-dispatch.test.ts`,
  `buildApi.integration.test.ts`, `adoptApi.integration.test.ts`) re-point too (or are deleted if their
  coverage is fully carried by the relocated suite — but the SAFE move is re-point + keep, so parity is
  visible). The studio's `handleBuild` / `handleAdopt` HTTP handlers STAY in `apiRouter.ts` as thin wrappers
  over the relocated `runBuildJob` + `BuildContext` (ADR-0090's single boundary, two callers).
- **The WALL is the contract.** The relocated `build-worker.ts` must import NOTHING from `apps/*` (and
  nothing that would pull the studio into a frontend graph) — it imports only `node:crypto` (for the
  registry) and the build entries it drives are injected (the `RoutedBuildDeps` / `BuildContext` shape),
  never imported from a surface. Assert this structurally (read the source, scan its import specifiers). This
  is the ADR-0100 property that makes the desktop mount legal.
- **The RED the spine observes:** module-not-found on `@storytree/drive/build-worker` (`./build-worker.js`).
  **The GREEN:** the new module exports the trio; a buildable id minted on the real relocated registry runs
  a scripted runner to a terminal `passed` with its progress on the transcript; `build-worker.ts` imports
  nothing from `apps/*`; AND the studio server suite stays green from the re-point (the parity half,
  observed by the suite proofCommand).

WHY THIS IS A CAPABILITY (not a contract): its honest proof spans the RELOCATION AS A WHOLE — the new
subpath resolves and exports the trio, the relocated worker behaves (a buildable id mints + runs over the
REAL relocated `BuildRegistry` + `runBuildJob` with a scripted runner), the boundary wall holds (no `apps/*`
import), AND the studio importers stay green (parity, observed by the suite proofCommand). That crosses the
export surface, the worker behaviour, the boundary, and the cross-package parity, so it is an integration
test of the relocation, not a single isolated assertion.

REUSES THE ADR-0090 WORKER VERBATIM (ADR-0133 d.3): the relocation MOVES the existing worker; it adds no
build path, no second orchestrator boundary. `routedBuildRunner` still routes a STORY id → `story build
--real` and a NODE id → `node build --live` exactly as before; the move changes WHERE the machinery lives,
not WHAT it does. *(Historical note: the node arm's `--live` opts were later re-decided by ADR-0144 —
the routed node dispatch now drives `node build --real` with persist semantics; that flip is the sibling
capability [`routed-node-real-dispatch`](routed-node-real-dispatch.md), not part of this relocation.)* The studio Build button and (after capabilities 2–3) the desktop both drive the SAME
relocated worker — one worker, two surfaces.

PROOF INTEGRITY (ADR-0091): the relocated dispatch + worker hold no signing key and no verdict path; the
spine inside `runBuildJob` observes RED→GREEN from real exit codes and SIGNS; CI re-proves green before the
trunk (ADR-0022). The relocation moves this property to the package level unchanged — the worker was never a
forge pathway in `apps/studio/server`, and it is not one in `@storytree/drive`.

OFFLINE-TESTABLE BY INJECTION: the test injects a SCRIPTED `BuildRunner` (emits coarse lines + a terminal
envelope, no SDK) and an injected `isBuildable`, over the REAL relocated `BuildRegistry` — so the relocated
worker's behaviour is proven WITHOUT a live SDK-billed build on every gate pass (ADR-0010 §5). The live
driven build is chat-drive-bridge's operator-attested leg, not this story's.

## Integration test

**Goal —** Prove the worker machinery is reachable from `@storytree/drive/build-worker` (a NEW subpath,
module-not-found at HEAD), behaves identically from its new home, imports nothing from `apps/*` (the
ADR-0100 wall), and that the studio importers re-point at the package and stay green (parity).

The integration test exercises this capability against its **real in-package collaborators** — the real
relocated `BuildRegistry` and the real relocated `runBuildJob` — with a SCRIPTED `BuildRunner` and an
injected `isBuildable` (no SDK spend, ADR-0010 §5). The cross-package parity is observed by the real arm's
suite `proofCommand` (the studio server suite). No stubs of the registry/worker machinery.

The integration test would:

1. Import `{ BuildRegistry, runBuildJob, dispatchAcceptedBuild }` + the `BuildContext` type from
   `"./build-worker.js"` — at HEAD this fails module-not-found (the net-new red); after the relocation the
   import resolves.
2. Build a REAL relocated `BuildRegistry`, an injected `isBuildable` returning true, and a scripted
   `BuildRunner` that emits coarse lines then a passing envelope; call `dispatchAcceptedBuild(unitId, {
   registry, runner, isBuildable })` and assert `{ ok: true, runId }`, and once the fire-and-forget job
   drains, the run is terminal `passed` with the scripted progress lines on its `transcript` — proving the
   moved machinery behaves identically from its new home.
3. Assert `routedBuildRunner` is exported from the subpath and routes by kind unchanged (a `classify`
   returning `'story'` selects the story branch; `'node'` the node branch) — the routing moved intact.
4. Assert (STRUCTURALLY) that `packages/drive/src/build-worker.ts` imports NOTHING from `apps/*` — read the
   source, scan its import specifiers; none resolves into a surface package (the ADR-0100 wall the
   relocation exists to satisfy, mirroring the `modelPathBoundary.test.ts` precedent).
5. Assert an un-buildable id (`isBuildable` false) returns a typed `{ ok: false, reason }` and the worker
   is NEVER invoked (the typed-refusal behaviour moved intact).
6. PARITY (observed by the suite proofCommand, not this test file): the re-pointed studio server suite
   (`buildWorker.test.ts`, `buildRegistry.test.ts`, `chat-build-dispatch.test.ts`,
   `buildApi.integration.test.ts`, `adoptApi.integration.test.ts`) stays green from the new home — the
   studio importers (`apiRouter.ts`, `devApi.ts`) build over `@storytree/drive/build-worker` with no
   behaviour change.

## Contracts (4)

The test-proven leaf behaviours — each **one named, substantive test** in the `@storytree/drive` suite
(`node:test`), the build runner injected as a scripted double, over the real relocated registry.

> **COVERAGE CONVENTION — REQUIRED, or the verdict reads 0/4 (ADR-0122 / ADR-0126).** The contract-coverage
> classifier is STRUCTURAL: a contract is "covered" only when some test's NAME carries the contract id as a
> whole token (the convention `test("<contract-id>: …")`) AND that test asserts something SUBSTANTIVE. A
> descriptive-only test name leaves the contract UNCOVERED even though the behaviour is tested — a signed
> green then over-claims. So author **one named, substantive test per contract below**, its name beginning
> with the contract id, and ASSERT ALL FOUR. Target: **4/4 covered.**

1. **`wr-subpath-exports-the-worker-trio`** — the new home resolves and exports the machinery
   - **asserts —** `@storytree/drive/build-worker` (`./build-worker.js`) exports `BuildRegistry`,
     `runBuildJob`, `dispatchAcceptedBuild`, `routedBuildRunner`, and the `BuildContext` type; importing
     them resolves (it does NOT at HEAD — the net-new module-not-found red). The relocation's existence
     proof.
   - **covers —** `packages/drive/src/build-worker.ts` (the relocated module + its exports) *(provisional path)*
2. **`wr-relocated-worker-behaves`** — the moved machinery runs identically
   - **asserts —** over the REAL relocated `BuildRegistry` + a scripted `BuildRunner`,
     `dispatchAcceptedBuild` validates `isBuildable`, mints a run, fires `runBuildJob`, returns `{ ok: true,
     runId }`, and once drained the run is terminal `passed` with the scripted progress on its `transcript`
     — identical behaviour from the new home (parity at the unit level).
   - **covers —** `packages/drive/src/build-worker.ts` (the relocated dispatch + worker composition)
3. **`wr-imports-nothing-from-apps`** — the ADR-0100 wall the relocation satisfies
   - **asserts —** `packages/drive/src/build-worker.ts` imports NOTHING from `apps/*` (a structural source
     read of its import specifiers) — the property that makes the desktop mount legal (the desktop may not
     import `apps/studio/server`, so the worker must be importable WITHOUT one). FALSE before the relocation,
     TRUE after — the boundary contract, mirroring `modelPathBoundary.test.ts`.
   - **covers —** `packages/drive/src/build-worker.ts` (the import surface)
4. **`wr-typed-refusal-moved-intact`** — the safe-write refusals survive the move
   - **asserts —** an un-buildable id (`isBuildable` false) returns a typed `{ ok: false, reason }` and the
     worker is NEVER invoked; a second concurrent dispatch returns the single-build refusal — the
     typed-refusal + intent-not-verdict behaviour (no signing key, no verdict path) moved intact (ADR-0091).
   - **covers —** `packages/drive/src/build-worker.ts` (the validation + single-build guard + construction)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): the worker relocates as a new module
in `@storytree/drive`, test-first, beside the build entries it already drives.

- **The test —** `packages/drive/src/build-worker-relocation.test.ts` (`node:test` + `node:assert/strict`,
  the SAME runner the existing `@storytree/drive` `*.test.ts` use — e.g. `proposal-id-threading.test.ts`).
  It imports the trio + `BuildContext` from `"./build-worker.js"`, builds a REAL relocated `BuildRegistry`,
  an injected `isBuildable`, and a scripted `BuildRunner` (emits coarse lines + a terminal envelope; no
  SDK). It awaits the fire-and-forget job's drain before asserting the terminal run state (poll the registry
  / await a settle, the pattern the existing `buildWorker.test.ts` uses).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `build-worker.ts` does
  not exist at HEAD and the subpath is not in `package.json` exports, so the test fails module-not-found (the
  net-new missing-symbol red). It asserts the export surface, the relocated behaviour, the no-`apps/*` wall,
  and the typed refusals.
- **The GREEN —** `packages/drive/src/build-worker.ts` (the machinery moved in from `apps/studio/server`) +
  the `"./build-worker"` subpath in `packages/drive/package.json`; the studio importers re-pointed at the
  package. The import resolves, the assertions hold, the drive suite + the studio server suite + both
  typechecks are green (the parity half, observed by the suite proofCommand).

Rules:

- **Move, don't rewrite** — the relocated machinery is byte-for-byte the existing worker (modulo import
  paths); add no build path, no second boundary (ADR-0090). The parity verdict (the studio suites) is the
  guard against silent drift.
- **The wall is the point** — `build-worker.ts` imports nothing from `apps/*` (`wr-imports-nothing-from-apps`,
  ADR-0100). This is the property the whole story rests on; assert it structurally.
- **Re-point AND keep green** — the studio importers (`apiRouter.ts`, `devApi.ts`) import from the package;
  the five server suites stay green from the new home (parity). The studio's `handleBuild` HTTP wrapper stays
  in `apps/studio/server`, now a thin wrapper over the relocated `runBuildJob`.
- **Intent, never a verdict** — the relocated dispatch holds no signing key, no verdict writer
  (`wr-typed-refusal-moved-intact`, ADR-0091). The spine signs; CI lands. The property moves unchanged.
- **Name every test for its contract (coverage convention)** — each contract gets one substantive test
  whose name begins with the contract id, so the ADR-0122/0126 classifier reads 4/4.
- **Stay in `@storytree/drive` (+ the studio re-point)** — the write scope is the new drive module + the
  studio importers it re-points (ADR-0087: one concrete relocation). The desktop mount is capability 2; do
  NOT mount anything on the desktop here.
