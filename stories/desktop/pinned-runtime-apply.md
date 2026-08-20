---
id: "pinned-runtime-apply"
tier: capability
story: desktop
title: "Apply a landed fix — the desktop reports the code it is running and advances onto merged `main` fast-forward-only, or refuses"
outcome: "A landed fix reaches the running desktop app only by a fast-forward of its pinned-`main` runtime worktree."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [164, 181, 70, 100]
# A greenfield capability registered retrospectively by capability-layer-coverage-arc increment 2
# (2026-08-07). Implementation-before-registration and standing tests do not make it brownfield
# (ADR-0395). The `proof:` block remains spec-borne (ADR-0057); this classification correction does
# not add a `real:` arm or manufacture a verdict.
# TWO-SUITE PROOF COMMAND — the precedent is `post-build-curation-pass`
# (stories/drive-machinery/post-build-curation-pass.md), THIS arc's own increment 1: the same
# multi-package proof-command shape reaching the same conclusion in its own words — it
# names BOTH packages because half its outcome is proven in the other one, since "a single-package
# command would leave that half unproven". The split here is the same: the four pure cores live in
# `apps/desktop` (node:test) and the renderer bridge lives in `apps/studio` (vitest jsdom, proven
# through StoreBanner.test.tsx's desktop legs), so a `desktop`-only command would claim a proof it does
# not run. `worker-relocation` (stories/desktop-build-mount/worker-relocation.md) is the only other
# multi-`--filter` command in the corpus and is cited for the SHAPE only — it is `proposed` and carries
# a `real:` arm, so it differs in proof configuration.
# NOT the `credential-broker` precedent, and the difference is worth pinning so it is not re-derived
# wrongly: that capability DOES span two packages, but its `proof.command` deliberately names just one
# (`--filter studio`). The command naming both suites there is its RELIABILITY GATE (`desktop#gate-1`,
# `pnpm --filter desktop --filter studio test`) — a different instrument with a different job, so it is
# evidence about gates, not about proof commands.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/desktop/src/**/*.test.ts"
      - "apps/studio/src/**/*.test.tsx"
    sourceGlobs:
      - "apps/desktop/src/**/*.ts"
      - "apps/studio/src/**/*.ts"
---

# Apply a landed fix — the desktop reports the code it is running and advances onto merged `main` fast-forward-only, or refuses

**Outcome —** A landed fix reaches the running desktop app only by a fast-forward of its pinned-`main`
runtime worktree.

*(Two clauses were demoted out of the outcome to avoid a banned conjunction, and each lives where it is
proven. The VERSION VISIBILITY that makes the apply actionable at all — the `/api/health` `code` field
(the SHA the running build was produced at, vs what the checkout holds now) and the `runtime` field (the
branch and the distance behind `origin/main`) — is contracts 8, 9, 10 and 13. And the FAIL-CLOSED refusal
that gives the outcome its "only" — a configured runtime that is missing, on a stray branch, or outside
`origin/main`'s history is refused rather than served — is contract 2.)*

**Depends on —** nothing within this story. It is an independent root, alongside `credential-broker`,
`local-backend-boot` and `desktop-launch-preconditions`: the four pure cores import no other in-story
capability, and the modules that consume them are consumers, not upstreams — see **Guidance**.

> **Proof status (honest) — `proposed` (greenfield without a current signed pass; NOT `healthy`).** The
> whole decision surface is covered by REAL, passing, offline tests in FIVE colocated files across two
> suites.
>
> **The `apps/desktop` half — 37 tests in four colocated files:**
> `apps/desktop/src/apply/runtime-root.test.ts` (15), `rebuild.test.ts` (8), `code-stamp.test.ts` (7),
> `runtime-status.test.ts` (7). All are part of the `desktop` suite, which I ran on 2026-08-07 — **249
> tests, 249 pass, 0 fail, 0 skipped**. None touches git, the filesystem, a network, or a wall clock:
> every probe (`exists` / `branchOf` / `pinnedToOriginMain` / `readHead` / `readBuilt` / `readBranch` /
> `readBehind`) and the step runner are INJECTED, so the resolve, the recipe, the fail-closed halt and
> the advisory-null paths are all deterministic.
>
> **The `apps/studio` half — 8 tests in one colocated file:** the desktop legs of
> `apps/studio/src/components/StoreBanner.test.tsx` (`:235`, `:246`, `:260`, `:283`, `:295`, `:303`,
> `:311`, `:321`), part of the `studio` vitest/jsdom suite, which I ran on 2026-08-07 — **129 test
> files, 1190 tests, 1190 pass, 0 fail**. They drive the REAL `getDesktopApply()` bridge and the REAL
> shared `StoreBanner` against a health payload carrying both the `code` and `runtime` fields this
> capability produces; only the main-process call across the bridge is faked.
>
> Those tests are evidence, but neither their standing state nor the absence of a gate-driven
> red→green establishes brownfield provenance (ADR-0395).
>
> **The un-asserted pockets, named rather than implied.** (a) `spawnStepRunner` (`rebuild.ts:156-182`) —
> the real `execFile` spawn, including the win32 `cmd.exe /d /s /c` wrap `pnpm`'s `.cmd` shim needs — has
> no offline assertion, and its own header records why (it spawns a real, minutes-long build). The
> injected-seam core `rebuildSteps` / `runRebuild` is fully covered. (b) The four real git readers —
> `gitHead` (`code-stamp.ts:47-60`), `gitBranch` (`runtime-status.ts:30-43`), `gitBehindMain`
> (`:50-63`) and `gitFetchOrigin` (`:70-77`) — are the real-effects wiring; every test injects scripted
> readers, so the `execFile` invocations themselves are unexercised offline while their pure consumers
> (`buildCodeStamp`, both probe factories, `fetchOriginBestEffort`'s swallow) are fully covered. This is
> the same PURE-core / real-effects-wiring shape
> [`live-build-db-preflight`](../drive-machinery/live-build-db-preflight.md) records for `ensureLiveDb`.
> (c) **The `ffToMain` seam itself is glue and is NOT asserted anywhere** — see the stated gap below.
>
> **The stated gap that matters most: no offline test closes the loop.** `electron/main.ts:112` derives
> ONE value — `const ffToMain = runtime.ok && runtime.source === "runtime"` — and that single value
> both gates the rebuild's fast-forward arm (`main.ts:797`) and stamps `health.runtime.pinned` through
> the sidecar env `STORYTREE_DESKTOP_RUNTIME_PINNED` (`main.ts:348`, read at
> `electron/backend-entry.ts:112`). It is the seam that makes the visibility half and the apply half ONE
> organ, and it lives in operator-attested glue: no test asserts that a `source: "launch"` resolution
> yields both an un-nagged banner AND a rebuild that does not pull. Each END is proven — `runtime-root`
> proves the resolution, `rebuild` proves the two recipes, StoreBanner proves `pinned:false` is never
> nagged — but the derivation joining them is witnessed under the Story UAT, not asserted. Recorded as a
> real gap, not implied coverage.
>
> **No reliability gate `(covers:)` this capability.** The story's existing gate-1 names
> `credential-broker` only. Extending an already-signed gate's `(covers:)` list changes what a signed
> verdict claims, so it is a deliberate, id-aware edit for the owner — a stated gap, not a hidden one.

## Guidance

**WHY THIS IS ONE ORGAN AND NOT TWO** (the splitting-rule, ADR-0010 — the fork was live and is decided
here). A tempting cut runs between a version-VISIBILITY organ (`code-stamp` + `runtime-status`) and an
APPLY organ (`runtime-root` + `rebuild`). It is the wrong cut, and the code says so at three places:

- **The two halves share one derived value.** `main.ts:112`'s `ffToMain` is computed from
  `resolveRuntimeRoot`'s `source` and is spent in BOTH halves — the rebuild's fast-forward arm and
  health's `runtime.pinned`. A boundary drawn between them would run straight through a single
  expression.
- **`pinned` is what makes the visibility HONEST.** Without it the update banner nags a developer whose
  launch checkout is legitimately behind `origin/main` — `StoreBanner.test.tsx:311` pins exactly that.
  So the visibility half cannot state its own contract without the apply half's resolution.
- **One affordance, not two.** The shared `StoreBanner` reads `code`/`runtime` and, through
  `getDesktopApply()`, offers the one-click *Rebuild & relaunch*. Delete the visibility half and the
  apply organ has no trigger and no surface; delete the apply half and the visibility is a notice with
  no action — the studio-version-skew trap `code-stamp.ts`'s header names. Neither half is
  independently viable, which is the organ test.

Under the splitting-rule the fused unit also passes both triggers: its outcome states in one sentence
without a conjunction (above), and its proof shares one precondition (a resolved runtime root) and one
observable (the version state of the served runtime, and the refusal that keeps it pinned).

**THE LOOP, IN ORDER.** Five modules, four of them PURE cores over injected effects:

1. **`runtime-root.ts`** (ADR-0181) — `pickConfiguredRuntime(env, configRaw)` (`:38-49`) picks the
   configured runtime path env-wins-then-file (`~/.storytree/desktop.runtime.json`, the seam that lets an
   installed Windows `.lnk`, which sets no env, still engage pinned `main`); `resolveRuntimeRoot(config,
   probes)` (`:106-141`) then decides, FAIL-CLOSED: unconfigured serves the launch checkout
   (`source: "launch"`, today's dev behaviour), configured-but-missing or configured-but-not-pinned
   REFUSES with an actionable `git worktree add` / re-pin hint, and configured-present-pinned serves
   (`source: "runtime"`).
2. **`code-stamp.ts`** (ADR-0164 Ph1) — the `/api/health` `code` field. `buildCodeStamp(startedAt, head)`
   (`:37-40`) compares the SHA the running BUILD was produced at against git HEAD on disk now.
3. **`runtime-status.ts`** (ADR-0181 D3) — the `/api/health` `runtime` field: `branch` + `behind`
   (`createRuntimeStatusProbe`, `:103-112`), plus `fetchOriginBestEffort` (`:90-95`), the single
   launch-time fetch that makes the behind-count truthful without a per-poll network hit.
4. **`rebuild.ts`** (ADR-0164 Ph1 + ADR-0181) — `rebuildSteps(plan)` (`:62-89`) is the ordered recipe,
   LED (when `ffToMain`) by `git fetch origin` → `git merge --ff-only origin/main` → a frozen install;
   `runRebuild(run, steps)` (`:128-139`) runs them through an injected step-runner and STOPS on the
   first non-zero exit, returning the failing step.
5. **`apps/studio/src/lib/desktopApply.ts`** — `getDesktopApply()` (`:34-36`), the renderer's
   feature-detect of `window.desktopApply`. It is how the SHARED `StoreBanner` tells the desktop app
   from the hosted studio: bridge present ⇒ the one-click *Rebuild & relaunch*; absent ⇒ the plain manual
   restart copy.

**`--ff-only` IS THE WHOLE GUARANTEE, AND IT IS ENFORCED BY GIT, NOT BY PROSE (ADR-0181).** ADR-0164's
Rail 2 ("the runtime only ever advances to merged, CI-proven `main`") was aspirational until the recipe
led with `git merge --ff-only origin/main`. A non-fast-forward is a non-zero exit, and `runRebuild` stops
on the first non-zero exit — so the halt happens BEFORE any build runs, and the app is never relaunched
onto un-merged code. The caller relaunches only on `{ ok: true }`, so a failed rebuild leaves the app on
the OLD working build with the error surfaced: never a half-applied state.

**THE RUNNING CODE IS THE BUILD STAMP, NOT HEAD-AT-SPAWN — that distinction IS a contract.** A `git pull`
+ relaunch WITHOUT a rebuild leaves the served `dist`/electron bundle behind while the tsx sidecar's own
HEAD reads current. HEAD-at-spawn alone therefore says "fresh" (silently wrong); the build stamp
`scripts/write-build-stamp.mjs` writes still points at the old commit (stale, correctly). `startedAt`
prefers the stamp and falls back to HEAD-at-spawn only for an un-stamped older build, so that build
behaves exactly as before and never reports a FALSE stale (`code-stamp.test.ts:27`, `:39`).

**EVERY VERSION READ IS ADVISORY AND NEVER THROWS.** No git, no repo, a slow spawn, a missing
`origin/main` ref: each just yields `null` and `/api/health` answers without that field. A partial answer
stays honestly partial (`runtime-status.test.ts:33`). `fetchOriginBestEffort` swallows a failing fetch
outright, so a network hiccup can neither block nor crash sidecar startup — the behind-count simply stays
as of the previous fetch. This is the same contract `apps/studio/server/codeStamp.ts` honours, mirrored
so the two surfaces can never disagree about what "moved" means.

**THE PURE CORES ARE ELECTRON-FREE; THE ELECTRON GLUE IS OPERATOR-ATTESTED (ADR-0070) AND IS NOT IN THIS
CAPABILITY.** `main.ts`'s IPC handler + `app.relaunch()`, the preload bridge, the real fs+git probes it
injects, and `backend-entry.ts`'s health composition are the attested binding — the owner witnesses the
app relaunch onto the new build. `src/apply/` imports no `electron` and no `apps/studio/server` (a
forbidden surface→surface coupling, ADR-0100); `code-stamp.ts` is a deliberate RE-COMPOSITION of the
studio helper, not an import of it.

**Why no `depends_on` edge, in either direction.** Nothing upstream: the five modules import no other
in-story capability. The things that TOUCH them are consumers — `backend-entry.ts` mounts the two probes
into `/api/health` (whose route table is [`local-backend-boot`](local-backend-boot.md) /
[`boot-read-routes`](boot-read-routes.md)), and `main.ts` drives the resolve and the rebuild — and a
consumer is not an upstream. The renderer bridge's own consumer, `StoreBanner.tsx`, is a `studio`
frontend component reached through the compiled dist: that rides the story-level `studio` edge
`stories/desktop/story.md` already declares, and a capability-grain edge would be mechanically refused
anyway — `topoOrderStoryNodes` (`packages/orchestrator/src/story-build.ts:161-168`) rejects any
`depends_on` naming an id outside the owning story's capability set. The
[`live-build-db-preflight`](../drive-machinery/live-build-db-preflight.md) precedent exactly.

**One correction carried forward.** `repo-manifest.json`'s section comment describes
`apps/desktop/src/apply` as "the ADR-0117 brokered rebuild loop". Every file header in that directory
says ADR-0164 / ADR-0181, and ADR-0117 is the *brokered forest write* decision
([`shared-forest-connection`](shared-forest-connection.md)), an unrelated concern. The code is
authoritative; the comment is stale.

## Integration test

**Goal —** Prove the loop closes: that the version the app reports is the version it is RUNNING (not the
one on disk), that the only path from a landed fix to the running app is a fast-forward onto merged
`main`, and that both ends refuse rather than degrade — a runtime that is not pinned is never served, and
a rebuild that cannot fast-forward never reaches a build.

The integration-flavoured proof is the **renderer leg**, and it is real: `StoreBanner.test.tsx:235`,
`:246` and `:260` (passing) drive the REAL `getDesktopApply()` bridge and the REAL shared `StoreBanner`
against a health payload carrying the `code` stamp this capability computes — asserting that the desktop
app shows *Rebuild & relaunch* where the browser shows manual `pnpm studio:down` copy, that clicking it
calls the bridge exactly once and shows the rebuilding state, and that a failed rebuild surfaces the
failing step verbatim while the app stays *"still on the old build"*. Two real collaborators, no stub
between them; only the main-process call across the bridge is faked, which is the design — the real one
spawns a minutes-long build. `:283`–`:321` extend the same composition to the `runtime` field: N-commits-
behind renders with correct plurality, `behind: 0` renders nothing, and `pinned: false` is never nagged.

Underneath, the four `apps/desktop` cores are each proven over injected probes: 15 tests cover every
branch of the resolve (including all four refusal shapes and the config-file precedence), 8 cover both
recipes and every fail-closed halt, 7 cover the build-stamp-vs-HEAD comparison and its advisory nulls,
and 7 cover the branch/behind reads and the swallowed fetch. The authored rung remains `proposed`
until current signed proof exists. The composition that JOINS the two halves — `main.ts:112`'s `ffToMain` — is
operator-attested glue and is the stated gap recorded above, not claimed here.

## Contracts (13)

The test-proven leaf behaviours — each **one isolated automated test** with collaborators stubbed
(ADR-0002). Every contract here has a REAL passing test (`proven by`).

1. **`an-unconfigured-runtime-serves-the-launch-checkout`** — a developer who configures nothing is unaffected
   - **asserts —** with no configured runtime the resolve serves the launch checkout as `source: "launch"`; a blank/whitespace configuration is treated as unconfigured and falls back the same way, never as a configured-but-invalid refusal.
   - **covers —** `apps/desktop/src/apply/runtime-root.ts:110-113`
   - **proven by —** `apps/desktop/src/apply/runtime-root.test.ts:30` and `:35` (REAL, passing)
2. **`a-runtime-not-pinned-to-main-is-refused-never-served`** — the fail-closed guard that gives the outcome its "only"
   - **asserts —** a configured runtime that is MISSING refuses with a `git worktree add <path> origin/main` hint (never a silent fallback to the launch checkout, which would re-introduce the stray-branch bug the configuration exists to prevent); one on a STRAY branch refuses; one whose HEAD is detached but NOT reachable from `origin/main` refuses; and one where git cannot answer at all refuses naming the unknown state. Each refusal is self-contained and actionable.
   - **covers —** `apps/desktop/src/apply/runtime-root.ts:114-139`
   - **proven by —** `apps/desktop/src/apply/runtime-root.test.ts:69`, `:79`, `:89`, `:100` (REAL, passing)
3. **`a-detached-head-at-origin-main-is-the-canonical-pinned-form`** — "on `main`" means PINNED to `main`, not the branch NAME
   - **asserts —** a DETACHED HEAD at `origin/main` serves (the form `git worktree add <path> origin/main` actually produces, which a literal branch-name check rejected); a detached HEAD BEHIND `origin/main` also serves, because the update flow fast-forwards it; and the local `main` branch name still serves for back-compat. The distinction is load-bearing: the canonical runtime worktree leaves the `main` NAME free for the developer's own checkout.
   - **covers —** `apps/desktop/src/apply/runtime-root.ts:127-128`
   - **proven by —** `apps/desktop/src/apply/runtime-root.test.ts:40`, `:48`, `:59` (REAL, passing)
4. **`the-runtime-path-is-env-then-config-file-and-a-bad-config-is-unconfigured`** — an installed shortcut can engage pinned `main` without an env
   - **asserts —** a non-blank env value wins; a blank/whitespace env falls through to the config file's `path` field; neither present yields `null` (the launch fallback); the file path is trimmed and a blank one is unconfigured; and malformed JSON or a missing `path` yields `null` rather than a throw — the fail-closed refusal is reserved for a configured-but-invalid WORKTREE, never an unreadable config file.
   - **covers —** `apps/desktop/src/apply/runtime-root.ts:38-49`
   - **proven by —** `apps/desktop/src/apply/runtime-root.test.ts:112`, `:119`, `:123`, `:127`, `:131`, `:136` (REAL, passing)
5. **`the-rebuild-recipe-leads-with-a-fast-forward-only-advance`** — Rail 2 is a git-enforced invariant, not prose
   - **asserts —** with `ffToMain`, the recipe LEADS with `git fetch origin`, then `git merge --ff-only origin/main`, then a frozen install, before the studio and electron builds; without it (the dev fallback) the recipe is the two builds alone with NO git advance. Every step runs in `plan.root` — the runtime worktree, never the launch checkout.
   - **covers —** `apps/desktop/src/apply/rebuild.ts:62-89`
   - **proven by —** `apps/desktop/src/apply/rebuild.test.ts:29` and `:38` (REAL, passing)
6. **`a-non-fast-forward-halts-the-rebuild-before-any-build-runs`** — fail-closed, first non-zero exit wins
   - **asserts —** every step exiting 0 yields `{ ok: true }` with the steps run IN ORDER; a failing `git merge --ff-only` returns that step and NO build step ever runs; a failing build step stops the steps after it; a failure in the SECOND step is reported after the first passed; and a spawn failure (no numeric exit code) is folded to a non-zero result rather than a rejection — so the runner never throws and the caller relaunches only on `{ ok: true }`.
   - **covers —** `apps/desktop/src/apply/rebuild.ts:128-139`
   - **proven by —** `apps/desktop/src/apply/rebuild.test.ts:56`, `:66`, `:82`, `:98`, `:109` (REAL, passing)
7. **`the-failing-step-carries-its-actionable-tail`** — a build failure's cause is at the END of the log
   - **asserts —** an over-long output is truncated from the FRONT, keeping the last characters, so the operator is shown the error rather than the preamble.
   - **covers —** `apps/desktop/src/apply/rebuild.ts:115-118`
   - **proven by —** `apps/desktop/src/apply/rebuild.test.ts:118` (REAL, passing)
8. **`the-running-code-is-the-build-stamp-not-head-at-spawn`** — the silent-stale case the plain HEAD signal missed
   - **asserts —** a build BEHIND the checkout reads STALE even though HEAD-at-spawn equals HEAD now (the `git pull` + relaunch without a rebuild case); a build stamp EQUAL to HEAD is not stale; NO build stamp falls back to HEAD-at-spawn so an un-stamped older build behaves exactly as before; the stamp reader accepts the `{ sha }` the build writer emits and yields `null` on a missing, malformed, or non-sha file; and the comparison is `null` unless BOTH shas resolved, so an absent stamp is an honest absence and never a FALSE stale.
   - **covers —** `apps/desktop/src/apply/code-stamp.ts:37-40,69-77,89-98`
   - **proven by —** `apps/desktop/src/apply/code-stamp.test.ts:16`, `:22`, `:27`, `:34`, `:39`, `:54` (REAL, passing)
9. **`every-version-read-is-advisory-never-a-throw`** — health answers without the field rather than failing
   - **asserts —** git unreachable yields a `null` code stamp (health answers with no `code` field); git unreachable yields BOTH runtime fields `null`; a PARTIAL answer (branch resolves, behind fails) stays honestly partial rather than collapsing to nothing; and `fetchOriginBestEffort` SWALLOWS a failing fetch (offline, no `origin`) — it resolves and never rejects, so a network hiccup can neither block nor crash sidecar startup.
   - **covers —** `apps/desktop/src/apply/code-stamp.ts:47-60`, `apps/desktop/src/apply/runtime-status.ts:90-95,103-112`
   - **proven by —** `apps/desktop/src/apply/code-stamp.test.ts:48`, `apps/desktop/src/apply/runtime-status.test.ts:28`, `:33`, `:48` (REAL, passing)
10. **`behind-main-is-the-distance-as-of-the-last-fetch`** — an honest figure, not a per-poll network hit
    - **asserts —** on `main` and up to date the probe reports `{ branch: "main", behind: 0 }`; with a merged fix waiting it reports the commit COUNT; a misconfigured runtime on a stray branch surfaces that branch verbatim so the operator can see "not main"; and the best-effort fetch runs git in the given root, which is what makes the count truthful at launch.
    - **covers —** `apps/desktop/src/apply/runtime-status.ts:30-63,103-112`
    - **proven by —** `apps/desktop/src/apply/runtime-status.test.ts:9`, `:14`, `:19`, `:40` (REAL, passing)
11. **`the-apply-affordance-appears-only-where-the-bridge-is-injected`** — the hosted studio shows no non-functional rebuild control
    - **asserts —** with `window.desktopApply` injected, a moved checkout renders a *Rebuild & relaunch* button and the browser-only manual `pnpm studio:down` copy is ABSENT; clicking it calls `rebuildAndRelaunch` exactly once and shows the rebuilding state. The renderer's only path to a rebuild is this injected bridge — it imports no Electron, agent, or build code (ADR-0004 / ADR-0109 §Decision 4).
    - **covers —** `apps/studio/src/lib/desktopApply.ts:34-36`
    - **proven by —** `apps/studio/src/components/StoreBanner.test.tsx:235` and `:246` (REAL, passing)
12. **`a-failed-apply-leaves-the-app-on-the-old-build`** — the fail-closed contract, observable at the surface
    - **asserts —** a rebuild resolving `{ ok: false, step, code, output }` surfaces the failing step, its exit code and its output tail, states the app is *still on the old build*, and RESTORES the affordance so the operator can retry after fixing the cause — never a half-applied state and never a relaunch onto un-merged code.
    - **covers —** `apps/studio/src/lib/desktopApply.ts:12-24`
    - **proven by —** `apps/studio/src/components/StoreBanner.test.tsx:260` (REAL, passing)
13. **`only-a-pinned-runtime-is-nagged-to-update`** — `pinned` is what keeps the visibility honest
    - **asserts —** a PINNED runtime behind `origin/main` renders an "N commits behind main" update banner with the rebuild affordance, in the singular for one commit; `behind: 0` renders NO banner; a runtime that is behind but UNPINNED (the dev launch fallback, whose rebuild does not pull) is NEVER nagged; and the behind-main banner OUTRANKS a database outage, because stale code makes every other signal suspect.
    - **covers —** `apps/desktop/src/apply/runtime-status.ts:17-23`
    - **proven by —** `apps/studio/src/components/StoreBanner.test.tsx:283`, `:295`, `:303`, `:311`, `:321` (REAL, passing)
