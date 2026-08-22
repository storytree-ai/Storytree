<!-- Measurement for bun-runtime-migration-arc increment 1 (2026-08-22). A probe, not a conversion:
     no package's committed test script changed, no `bun install` was run, pnpm-lock.yaml is untouched. -->

# Probe: can Bun run our existing `node:test` suites against pnpm's `node_modules`?

## Status

**Measurement only** — the deliverable of `bun-runtime-migration-arc-inc-01` (read it with
`storytree arc show bun-runtime-migration-arc --pg`). It converts nothing. It exists so the arc's
later increments decide per package on evidence rather than on hope, and so the question is not
re-litigated cold.

**The answer is YES for most of the repo, and a hard NO for one specific class of package.**

Bun resolves pnpm's symlinked `node_modules`, honours `workspace:*` links and `exports` subpath
maps, and runs our `node:test` + `node:assert/strict` suites with **no source change, no config
file, and no `tsx`**. **17 of 23 packages reproduce node's results exactly** — same tests, same
files, same executed assertions, green both ways.

The other 6 fail, and the important half of that finding is not the failure count. **In the four
packages that spawn real child processes, Bun's results are NON-DETERMINISTIC**: across repeated
runs of the same unchanged code, the number of tests Bun even *registers* varied by up to 35, and
the failure count varied by up to 4x. Node, run twice over the same packages, was bit-stable at zero
failures. A runtime whose test count moves between runs cannot hold a gate, so those packages are not
convertible today at any price — see [Class 2](#class-2--bun-registers-a-non-deterministic-number-of-tests-in-process-spawning-packages).

The arc's stop-at-increment-1 branch (a clean "no", closing the arc) **did not fire**. The migration
is viable on a large and identifiable subset — but **that subset is 74% of the packages and only 7.1%
of the test work.** Converting every package that can be converted today saves 2.4% of the test leg,
because the six blocked packages hold 93% of the runtime. The reason to continue this arc is
therefore removing `tsx`, not wall-clock. See [question 3](#3-is-there-a-speedup-worth-chasing).

## What was installed, and where

| | |
|---|---|
| Version | **Bun 1.4.0** (`1.4.0+34cbb9a40`) |
| Binary | `C:\Users\mickh\.bun\bin\bun.exe` — a single 36 MB file |
| Source | `bun-windows-aarch64.zip` from the `oven-sh/bun` `bun-v1.4.0` release |
| Integrity | SHA256 verified against the release `SHASUMS256.txt` (`f473bfe2…18c47`) |
| PATH | **Not modified.** Nothing was added to the user or machine PATH; every command below calls the absolute path. |
| Package manager | **Untouched.** `bun install` was never run; there is no `bun.lock`; `pnpm-lock.yaml` is unchanged. |

**To reverse the install completely: delete `C:\Users\mickh\.bun`.** There is nothing else to undo.

The install was uneventful, which is itself a finding — the arc flagged Windows as Bun's weakest
platform. Worth recording precisely: **this box is Windows 11 on ARM64**, not x64, and Bun ships a
first-class `bun-windows-aarch64` build. That was the single thing most likely to end the arc at
step 1, and it did not.

## The three questions the increment asked

### 1. Does Bun resolve pnpm's symlinked `node_modules` and `workspace:*` links?

**Yes, both, with no configuration.** pnpm's layout is symlinks into a content-addressed store —
`packages/proof-protocol/node_modules/zod` is a link to `node_modules/.pnpm/zod@3.25.76/…`. Bun
followed it on the first attempt.

`workspace:*` needed care to *prove* rather than assume. The obvious candidate,
`packages/storage-protocol`, depends on `@storytree/proof-protocol` — but **only via `import type`,
which TypeScript erases**, so that package demonstrates nothing about runtime resolution. The proof
comes from packages with *value* imports across the workspace, all of which passed with exact
parity: `arc` (→ `drive`, `library`, `storage-protocol`), `model-uat-pilot` (→ `library`,
`model-uat`, `uat-criterion`), `studio-members` and `notice-board` (→ `library`), `library`
(→ `proof-protocol`, `storage-protocol`).

`exports` subpath maps resolve too — the repo uses 14 distinct subpaths, led by
`@storytree/library/store` (44 imports) and `@storytree/library/fixture` (27), and the packages
importing them are in the MATCH set.

Bun also executes the raw TypeScript directly. **`tsx` is not needed under Bun at all** — no loader
flag, no preload, no build step. That is the largest simplification on offer, and it would retire
this repo's `scripts/tsx-cache-off.mjs` workaround for any package that moves.

### 2. Do the test counts match, or what was lost?

For the 17 MATCH packages: **exactly, on every column** — tests, files, passes, and executed
assertions.

For the 6 breaking packages the honest answer is that **the question has no single answer, because
Bun's count is not stable**. Repeated runs of unchanged code:

| package | node (2 runs) | bun run A | bun run B | bun run C |
|---|---|---|---|---|
| `context-traversal-capture` | **80 / 80 pass / 0 fail** (both) | 80 / 77 / 3 | 69 / 65 / 4 | 75 / 62 / 13 |
| `orchestrator` | **543 / 541 / 0** (both) | 512 / 487 / 23 | 529 / 496 / 31 | 538 / 512 / 24 |
| `drive` | 775 / 775 / 0 | 764 / 754 / 10 | 740 / 725 / 15 | 770 / 760 / 10 |
| `cli` | 2050 / 2050 / 0 | 2042 / 2010 / 32 | 2050 / 2015 / 35 | — |
| `context-traversal-transcript` | 40 / 40 / 0 | 40 / 35 / 5 | 40 / 35 / 5 | — |
| `agent` | 161 / 160 / 0 | 161 / 159 / 1 | 161 / 159 / 1 | — |

`transcript` and `agent` are **stable** failures — same count, same failures every run. The other
four move.

The increment specifically warned that a runner executing *fewer* tests would exit 0 and look like a
win. **That silent false-green did not occur**: every run that lost tests also exited non-zero. But
the loss was only ever *quantifiable* because tests and assertions were counted — a pass/fail line
alone never reveals that 35 tests stopped existing.

### 3. Is there a speedup worth chasing?

Over the 23 packages, one instrumented pass each, warm, on a quiet box: **780.1 s → 515.3 s, a
1.51x speedup.**

**That headline is not the number the arc should plan against, and the gap between them is the most
decision-relevant result in this document.** Count the *work*, not the packages:

| | packages | node test work | share of total |
|---|---|---|---|
| Convertible today (MATCH) | 17 | 55.6 s → 37.0 s | **7.1%** |
| Blocked (BREAK) | 6 | 724.5 s → 478.3 s | **92.9%** |

**Converting all 17 convertible packages saves 18.6 s of a 780.1 s test leg — 2.4%.** The 1.51x is
real, but 93% of it is locked inside the six packages that cannot be converted, four of them blocked
on Bun's own non-determinism rather than on anything we can fix. Within the convertible set the
speedup is 1.50x; it is simply applied to very little.

Read the number with four caveats, because it is much softer than it looks:

- **It is not universal.** `procedural-architecture` got *slower* — 6.9 s → 11.9 s — on identical
  test and assertion counts. `orchestrator` also ran slower (64.9 s → 70.6 s).
- **Per-package timings are noisy.** `notice-board` was swept twice by accident and its Bun leg
  measured **2.9 s and then 0.6 s** — a 4.5x spread on the same package on the same box.
- **The node arm ran with tsx's on-disk cache OFF**, per the committed `scripts/tsx-cache-off.mjs`
  preload. That is the honest *local* comparison — it is what a developer's gate actually runs — but
  CI opts the cache back in (`TSX_DISABLE_CACHE: ""`). **This measurement does not predict a CI
  speedup.**
- **This is one sample, sequential, per package.** It is not ADR-0401's interleaved multi-run
  protocol, and its node total is not comparable to the figures recorded in `tsx-cache-off.mjs`
  (which measured a single `pnpm -r` leg, not 23 separate top-level processes).

The largest wins were `drive` 126.1 s → 44.5 s, `context-traversal-capture` 118.2 s → 40.8 s, and
`library` 16.6 s → 4.6 s. Two of those three are in the non-deterministic set, so their speed is
currently unbankable.

## Per-package result

`tests`, `passed` and `assertions` are `node / bun` from the instrumented pass. MATCH means every
column identical and Bun exited 0.

| package | tests | passed | assertions | wall (s) | |
|---|---|---|---|---|---|
| `packages/proof-protocol` | 34 / 34 | 34 / 34 | 102 / 102 | 0.6 / 0.4 | MATCH |
| `packages/storage-protocol` | 50 / 50 | 50 / 50 | 155 / 155 | 0.9 / 0.6 | MATCH |
| `packages/notice-board` | 173 / 173 | 163 / 163 | 584 / 584 | 1.8 / 2.9 | MATCH |
| `packages/studio-members` | 22 / 22 | 20 / 20 | 99 / 99 | 1.2 / 0.6 | MATCH |
| `packages/uat-criterion` | 73 / 73 | 73 / 73 | 135 / 135 | 0.8 / 0.5 | MATCH |
| `packages/arc` | 173 / 173 | 173 / 173 | 892 / 892 | 2.9 / 2.3 | MATCH |
| `packages/model-uat` | 65 / 65 | 65 / 65 | 134 / 134 | 0.7 / 0.4 | MATCH |
| `packages/model-uat-pilot` | 15 / 15 | 15 / 15 | 109 / 109 | 0.9 / 0.5 | MATCH |
| `packages/model-judged-uat` | 18 / 18 | 18 / 18 | 90 / 90 | 0.9 / 0.4 | MATCH |
| `packages/art-authoring` | 52 / 52 | 51 / 51 | 230 / 230 | 1.5 / 1.0 | MATCH |
| `packages/procedural-architecture` | 177 / 177 | 177 / 177 | 3735 / 3735 | 6.9 / 11.9 | MATCH (slower) |
| `packages/forest-world` | 151 / 151 | 151 / 151 | 7194 / 7194 | 2.3 / 1.8 | MATCH |
| `packages/forest-world-r3f` | 20 / 20 | 20 / 20 | 307 / 307 | 2.1 / 1.0 | MATCH (`src/` only) |
| `packages/context-traversal-telemetry` | 15 / 15 | 15 / 15 | 172 / 172 | 2.7 / 1.0 | MATCH |
| `packages/context-traversal-spawn` | 28 / 28 | 28 / 28 | 238 / 238 | 0.9 / 0.6 | MATCH |
| `packages/library` | 475 / 475 | 472 / 472 | 2396 / 2396 | 16.6 / 4.6 | MATCH |
| `apps/desktop` | 251 / 251 | 251 / 251 | 963 / 963 | 11.9 / 6.6 | MATCH |
| `packages/context-traversal-transcript` | 40 / 40 | 40 / 35 | 317 / 264 | 65.7 / 27.6 | **BREAK** (stable) |
| `packages/agent` | 161 / 161 | 160 / 159 | 626 / 625 | 2.5 / 2.1 | **BREAK** (stable) |
| `packages/context-traversal-capture` | 80 / 80 | 80 / 77 | 935 / 903 | 118.2 / 40.8 | **BREAK** (unstable) |
| `packages/orchestrator` | 543 / 512 | 541 / 487 | 1789 / 1651 | 64.9 / 70.6 | **BREAK** (unstable) |
| `packages/drive` | 775 / 764 | 775 / 754 | 4358 / 4313 | 126.1 / 44.5 | **BREAK** (unstable) |
| `packages/cli` | 2050 / 2042 | 2050 / 2010 | 7085 / 6950 | 347.1 / 292.7 | **BREAK** (unstable) |

Two rows deserve a note. **`apps/desktop` matching says nothing about Electron** or the two native
N-API addons (`node-pty`, `@napi-rs/keyring`) — its unit suite does not load them, so the arc's
end-state expectation that desktop stays on Node is untouched by this result. **`forest-world-r3f`
was compared on `src/` only**; its committed script also runs a `harness/**` glob, excluded from
both arms equally.

## The six breaks, classified

### Class 1 — our tests assume `process.execPath` is node (stable, and our bug)

`context-traversal-transcript` (5 failures), `agent` (1), and a share of `cli`'s.

These tests spawn a child using `process.execPath` as "the current runtime". Under Bun that is
`bun.exe`, so the child is a different program than the test intends:

- `transcript-ingest.uat.test.ts:53` — `spawnSync(process.execPath, [LAUNCHER, …])` where `LAUNCHER`
  is `packages/cli/launch.mjs`. That launcher registers tsx's ESM loader in-process and calls
  `node:module`'s `enableCompileCache`; run under Bun it does not produce a working CLI, and the
  assertion reports `ingest exited null`.
- `codex-author.test.ts:128` — sets `CODEX_EXECUTABLE` to `process.execPath`, runs it with
  `--version`, and asserts `/^v\d+\./`. Node prints `v24.15.0` and matches; Bun prints `1.4.0`.
- `tsx-cache-off.test.ts:116` — spawns `process.execPath` with `["--import", <file:// URL>, "-e", …]`.
  Bun reads `--import` as a preload and reports `preload not found`.

**These are fixable in our code, and arguably worth fixing regardless of Bun**: a test that means
"the node binary" should name it rather than infer it from whatever runtime happens to be executing.
That is the same fault class as a check that passes for the wrong reason.

### Class 2 — Bun registers a non-deterministic number of tests in process-spawning packages

This is the finding that decides the arc's sequencing, and it is the one that must not be softened.

In `context-traversal-capture`, `orchestrator`, `drive` and `cli`, **Bun does not run the same set of
tests twice.** The table in question 2 above shows the spread: `capture` ranged 69–80 tests and 3–13
failures; `orchestrator` 512–538 and 23–31; `drive` 740–770 and 10–15. Node, run twice over `capture`
and `orchestrator`, returned identical results both times (80/80/0 and 543/541/0).

The visible mechanism is Bun's `node:test` shim reporting:

```
error: Cannot call test() after the test run has completed
```

Bun loads the same files node does — file counts match `find src -name '*.test.ts'` exactly — but
finishes its run before some of them have registered their tests. Which files lose the race depends
on timing, and these packages are precisely the ones whose module graphs do slow work (spawning
git, real builds, HTTP servers).

**Consequence for the arc: these four packages are not convertible today, at any effort.** The
problem is not that tests fail; it is that the count moves, and a gate cannot be built on a runner
that reports a different denominator each run. This also means a naive conversion could *appear*
green on a lucky run — the exact "a thing that did not run is not a thing that passed" hazard the
increment was written to catch.

**A methodological warning for whoever re-measures this.** The instrument perturbs the phenomenon:
the same `cli` suite ran 2042 tests with an `--preload` counter attached and 2050 without it. Any
future measurement of Bun test counts must run uninstrumented, and must repeat.

### Class 3 — a false-green guard deliberately coupled to `node --test`

`orchestrator/src/shell-test-executor.test.ts:50` asserts as a *precondition* that
`NODE_TEST_CONTEXT` is present:

> `"precondition: the suite itself runs under node --test"`

It exists to prove the spawned observer never inherits `NODE_TEST*` — the forged-green channel. Bun
does not set that variable, so the guard fails under Bun **by design**. Converting `orchestrator`
would require re-expressing an anti-forged-green guard for a runtime whose equivalent channel is
different. That is a design question, not a mechanical edit.

### Class 4 — real-build and prove-it-gate legs

The remaining `orchestrator`, `drive` and `cli` failures are the real red→green, `story build` /
`node build`, and branch-cutting legs, including failures of `git rev-parse HEAD`, `git commit`,
`git push origin main` and `git worktree add --detach`, plus one spawn of `bash.exe`. These inherit
Class 1 and were not diagnosed further, because these packages are excluded by Class 2 anyway.

## What this means for the arc

**The migration is cheap where it is cheap, and the cheap set is large, identifiable in advance, and
cleanly separated from the expensive set.**

- **17 packages convert by editing one string** in their `package.json` — from
  `node --import ../../scripts/tsx-cache-off.mjs --import tsx --test "src/**/*.test.ts"` to
  `bun test src/`. Each is independently reversible in one line, exactly as the arc's intent
  describes, and each stops needing `tsx` for tests.
- **The 6 breaks are one coherent group, not a scattering**: the packages that spawn real processes —
  the leaf/spine/driver layer (`agent`, `orchestrator`, `drive`, `cli`) and the traversal-capture
  pair. That is a good boundary to sequence against.
- **Four of those six are blocked on Bun, not on us.** Class 1 is ours to fix; Class 2 is not, and it
  gates `capture`, `orchestrator`, `drive` and `cli` until Bun's `node:test` registration is
  deterministic.
- **The convertible set is 74% of the packages and 7.1% of the work.** `cli` alone is 44% of measured
  test time and is in the blocked set. Converting everything that *can* convert saves 2.4% of the
  test leg. **So the honest reason to do increments 2+ is not speed** — it is removing `tsx`, and
  positioning for the day Class 2 is fixed. If the arc is sold internally on wall-clock, it will
  under-deliver by an order of magnitude.
- **`pnpm gate`'s scope machinery is unaffected.** `pnpm --filter ...<name> test` runs whatever each
  package's own `test` script says, so a converted package keeps working with the ADR-0304 affected
  classifier and the gate keeps predicting CI. Nothing about ADR-0195 / ADR-0304 D2's
  one-classifier rule is disturbed.

**The one cost that is NOT per-package: CI.** `.github/workflows/ci.yml` runs `ubuntu-latest` with
`actions/setup-node@v6` and pnpm, and has no Bun. The **first** conversion must add a Bun setup step,
or CI goes red on a package whose script now says `bun test`. One-time, on Bun's strongest platform —
but a prerequisite for increment 2, not an afterthought.

### Suggested order for later increments

1. `proof-protocol` — the increment's own named first target: smallest, bottom root, exact parity.
2. The rest of the pure-schema set (`storage-protocol`, `notice-board`, `studio-members`,
   `uat-criterion`, `model-uat*`, `arc`, `forest-world`, `procedural-architecture`).
3. `library`, `apps/desktop`, `forest-world-r3f` — larger, exact parity; `library` shows one of the
   best speedups.
4. **Blocked on us:** `agent` and `context-traversal-transcript` — fix the Class 1 `process.execPath`
   assumptions first; they are stable failures with a known cause.
5. **Blocked on Bun:** `context-traversal-capture`, `orchestrator`, `drive`, `cli`. Do not attempt
   until Class 2 is gone. Re-test with `bun test src/`, uninstrumented, three times, and compare test
   counts before spending any effort on the failures.

## Method, so this is reproducible

Both arms ran the same package's own test files, back to back, on a quiet box (`storytree own --all`
showed every registered row `[gone]` before the sweep).

- node arm: `node --import <repo>/scripts/tsx-cache-off.mjs --import tsx --import <counter> --test "src/**/*.test.ts"`
- bun arm: `bun test --preload <counter> src/`

Test counts came from each runner's own summary. File counts were cross-checked against
`find src -name '*.test.ts'` and matched Bun's "across N files" in every package checked, so the two
runners selected the same files despite using different selectors.

**Assertions were counted by execution, not by grep.** A preload wraps the 13 methods on the
`node:assert/strict` default export and tallies calls, appending the per-process count at exit (node
runs each test file in a child process, so counts are summed). The static call-site count in
`proof-protocol` is 96; the executed count is 102, because some assertions run inside loops — which
is why a static count would have been the wrong instrument.

**The instrument was proved sensitive before being trusted.** A deliberately failing assertion was
injected into `proof-protocol/src/usage-event.test.ts` and both runtimes moved together: 35 tests,
34 pass, **1 fail**, exit 1 under each, and the counter's tally for that file rose 17 → 18. The
injection was then reverted. This negative control was run once, on `proof-protocol`, not on every
package.

### Caveats a later reader should not skip

- **Platform.** Windows 11 on **ARM64**. CI is `ubuntu-latest` on x64. None of the timing transfers,
  and neither does the Class 1 spawn behaviour necessarily.
- **One instrumented sample per package** for the timing table, with measured per-package variance up
  to 4.5x (see `notice-board`). The repeat runs were done only for the unstable packages.
- **The assert counter perturbs Bun's test registration** (see Class 2) — it was present in both arms
  so the assertion comparison is fair, but Bun test *counts* must be re-measured without it.
- Not probed: `bun install` (deliberately — pnpm stays), typecheck under Bun, and the two vitest
  packages (`packages/app-surface`, `apps/studio`), which are not `node:test` and are out of scope
  for this question.
