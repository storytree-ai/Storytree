---
id: "real-build-worktree"
tier: capability
story: drive-machinery
title: "REAL build worktrees and promotion (ADR-0031)"
outcome: "A signed REAL pass survives its worktree: the proven commit is parked on a run-unique claude/real branch that lands through the merge gate."
status: mapped
proof_mode: integration-test
depends_on: [shell-test-observer]
---

# REAL build worktrees and promotion (ADR-0031)

**Outcome —** A signed REAL pass survives its worktree: the proven commit is parked on a run-unique claude/real branch that lands through the merge gate.

**Depends on —** [`shell-test-observer`](shell-test-observer.md)

> **Proof status (honest) — `mapped`, with two `proposed` pockets.** The lifecycle — worktree cut,
> spine commit, promotion branch, push/withhold, install-failure teardown, exit-code regression and
> typecheck observation, the Windows pnpm shim — is covered by a real, passing, offline suite that
> runs real git against throwaway repos (`packages/orchestrator/src/build-worktree.test.ts`, part
> of `@storytree/orchestrator` 99/99 — I ran it 2026-06-13). The pockets: (1) the REAL
> `defaultPnpmInstall` spawn (offline tests inject `installRunner`); (2) the push against the real
> GitHub origin (offline tests push to a local bare remote). Both were exercised by live REAL runs
> (verdict-line PR #29/#32, declare-presence and the notice-board nodes) — operator-attested, not
> standing tests.

## Guidance

The REAL-mode workspace + the ADR-0031 landing rule: a pass that evaporates is unfinished work,
and landing always goes through the merge gate, never around it.

- **`createBuildWorktree`** (`packages/orchestrator/src/build-worktree.ts:55-102`): a FRESH,
  DETACHED `git worktree` of the driving repo's HEAD under a private mkdtemp parent — the leaf
  authors against real repo paths while the session's tree stays untouched; the worktree shares
  the object store, so the spine's post-green commit is a REAL commit object the verdict's
  `commitSha` points at. With `install: true` (ADR-0031 §2, dependency-bearing targets) the
  worktree first gets a LOCKFILE-ONLY `pnpm install --frozen-lockfile --prefer-offline`; an
  install failure tears the worktree down and throws — a half-installed workspace must not look
  buildable. The leaf can never ADD a dependency: `package.json`/`pnpm-lock.yaml` sit outside
  every write scope.
- **`commitAuthored`** (`build-worktree.ts:113-139`): the SPINE commits whatever the leaf authored
  after CONFIRM_GREEN, before the GATE reads the tree — cleanliness is EARNED by a real commit,
  never faked. An already-clean tree returns `committed:false` (the proof ran against what HEAD
  already held — honest).
- **`promoteRealPass`** (`build-worktree.ts:167-217`): parks the proven commit on
  `claude/real/<unit-id>-<run-id>` (run-unique — retries never collide) and pushes when an origin
  exists. **The honesty invariant: the branch tip IS the verdict's `commitSha`** — landing must
  keep it in `main`'s ancestry, so `claude/real/*` merges are NON-SQUASH (ADR-0031). A push
  failure is DATA: the local branch is kept either way (V1's preservation-over-loss rule), and
  `push:false` parks local-only — used when the regression suite or typecheck came back red.
- **`runRegressionSuite` / `runWorktreeTypecheck`** (`build-worktree.ts:227-260`): promotion
  pre-checks in the installed worktree, observed the same honest way the gate observes — exit code
  only, env scrubbed, through a real [`shell-test-observer`](shell-test-observer.md)
  (`build-worktree.ts:21` is the code edge). The typecheck closes a real hole: the proof run is
  tsx-driven (types STRIPPED), so only `tsc --noEmit` sees type-illegal-but-runtime-green code
  (it happened — declare-presence, 2026-06-11).
- **`platformShellCommand`** (`build-worktree.ts:267-277`): on Windows `pnpm` is a `.cmd` shim
  `execFile` cannot spawn — wrapped as `cmd.exe /d /s /c pnpm …`; injectable platform for offline
  tests of both shapes.

## Integration test

**Goal —** The whole REAL lifecycle against a real git repository: cut a detached worktree of a
throwaway repo, author files into it, `commitAuthored` earns genuine cleanliness, the gate's tree
seam reads it, the proven commit is parked and (when an origin exists) pushed, and teardown leaves
nothing registered (`packages/orchestrator/src/build-worktree.test.ts:28`, `:100`, `:130`). The
end-to-end composition — worktree + real proof command + spine commit → signed pass on a genuinely
clean tree — is proven offline at `resolve-prove-spec.test.ts:539`.

## Contracts (6)

1. **`worktree-cut-detached-and-removable`** — a fresh detached worktree at HEAD, torn down idempotently
   - **asserts —** the worktree exists at the repo's HEAD sha; `remove()` unregisters and deletes.
   - **covers —** `packages/orchestrator/src/build-worktree.ts:55-102`
   - **proven by —** `packages/orchestrator/src/build-worktree.test.ts:28` (REAL, passing)
2. **`spine-commit-earns-cleanliness`** — `commitAuthored` commits the leaf's files (attributed to the resolved signer) and an already-clean tree is a no-op
   - **asserts —** dirty → committed, `git status` clean after; clean → `committed:false`, HEAD unchanged.
   - **covers —** `build-worktree.ts:113-139`
   - **proven by —** `build-worktree.test.ts:28` (REAL, passing)
3. **`promotion-parks-run-unique`** — the proven commit lands on `claude/real/<unit>-<run>`; no origin → local only, kept
   - **asserts —** the branch tip IS the proven sha; absence of origin is reported, never thrown.
   - **covers —** `build-worktree.ts:167-204`
   - **proven by —** `build-worktree.test.ts:100` (REAL, passing)
4. **`push-when-origin-withhold-on-demand`** — an origin gets the push; `push:false` parks local-only for forensics
   - **asserts —** pushed to a (local bare) origin; withheld branch still exists locally.
   - **covers —** `build-worktree.ts:182-216`
   - **proven by —** `build-worktree.test.ts:130` (REAL, passing — the GitHub-origin leg is a `proposed` pocket, live-verified by PR #32 et al.)
5. **`install-failure-tears-down`** — the injected installer runs in the worktree; a failure removes the worktree and throws
   - **asserts —** installRunner sees the worktree root; on failure nothing buildable remains.
   - **covers —** `build-worktree.ts:64-80`
   - **proven by —** `build-worktree.test.ts:168` (REAL, passing — the real `defaultPnpmInstall` spawn is the other `proposed` pocket)
6. **`promotion-prechecks-observe-exit-codes`** — regression suite and typecheck read green/red off exit codes only; pnpm is platform-shimmed
   - **asserts —** green/red per exit code via the shared observer; `platformShellCommand` wraps pnpm on win32 and passes everything else through.
   - **covers —** `build-worktree.ts:227-277`
   - **proven by —** `build-worktree.test.ts:195` and `:219` (REAL, passing)
