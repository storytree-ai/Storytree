---
id: "real-build-worktree"
tier: capability
story: drive-machinery
title: "REAL build worktrees and promotion (ADR-0031)"
outcome: "An install-bearing REAL build whose committed authored head is refused before signing by a red package typecheck preserves that unsigned head on a run-unique local-only forensic branch."
status: proposed
proof_mode: integration-test
depends_on: [shell-test-observer]
---

# REAL build worktrees and promotion (ADR-0031)

**Outcome —** An install-bearing REAL build whose committed authored head is refused before signing by a red package typecheck preserves that unsigned head on a run-unique local-only forensic branch.

**Depends on —** [`shell-test-observer`](shell-test-observer.md)

> **Proof status (honest) — `proposed`, with two live arms and this newly specified refusal-recovery arm still unsigned.** The existing lifecycle — worktree cut,
> spine commit, promotion branch, push/withhold, install-failure teardown, exit-code typecheck
> observation, the Windows pnpm shim — is covered by a real, passing, offline suite that
> runs real git against throwaway repos (`packages/orchestrator/src/build-worktree.test.ts`, part
> of `@storytree/orchestrator` 99/99 — I ran it 2026-06-13). The real `defaultPnpmInstall` spawn is
> now a standing test: `packages/orchestrator/src/build-worktree-defaults.test.ts` runs the frozen
> installer against an offline local dependency, then proves it refuses a manifest that outruns its
> lockfile. The remaining live pocket is the push against the real GitHub origin (offline tests push
> to a local bare remote); live REAL runs exercised it (verdict-line PR #29/#32,
> declare-presence and the notice-board nodes) — operator-attested, not a standing test. The
> pre-signature caller preserving an unsigned red head and the observer carrying
> its raw diagnostics/effective timeout are now exercised by the fast helper/observer tests and the
> actual `storyBuild` caller regression named below; that new refusal-recovery contract remains
> unsigned while this capability is `proposed`.

## Guidance

The REAL-mode workspace + the ADR-0031 survival rule: after `commitAuthored`, when an
install-bearing build's pre-signature package typecheck backstop returns red, that
unsigned authored head is preserved under the run-unique `claude/real-forensics/*` namespace
locally for diagnosis, never pushed or described as proven, promoted, or landable. Signed promotion
and a halted chain's proven prefix remain categorically separate under `claude/real/*`. This is
deliberately the one refusal arm that has both a committed authored head and a package observation:
signer, dirty-tree, other GATE, and pre-commit failures gain no preservation promise here.
`backstop-preservation.ts` plans that local-only retention with `purpose: "unsigned-forensics"` and
assembles only evidence actually observed; `node-build.ts` owns the lifecycle call site, and
`story-build.ts` carries both categories through the public story envelope. A signed green head
still promotes toward the merge gate.

- **`createBuildWorktree`** (`packages/orchestrator/src/build-worktree.ts`): a FRESH,
  DETACHED `git worktree` of the driving repo's HEAD under a private mkdtemp parent — the leaf
  authors against real repo paths while the session's tree stays untouched; the worktree shares
  the object store, so the spine's post-green commit is a REAL commit object the verdict's
  `commitSha` points at. With `install: true` (ADR-0031 §2, dependency-bearing targets) the
  worktree first gets a LOCKFILE-ONLY `pnpm install --frozen-lockfile --prefer-offline`; an
  install failure tears the worktree down and throws — a half-installed workspace must not look
  buildable. The leaf can never ADD a dependency: `package.json`/`pnpm-lock.yaml` sit outside
  every write scope.
- **`commitAuthored`** (`build-worktree.ts` — `commitAuthored` / `CommitScope`): the SPINE commits
  what the leaf authored after CONFIRM_GREEN, before the GATE reads the tree — cleanliness is
  EARNED by a real commit, never faked. It stages the node's **DECLARED scope only**, never
  `git add -A`: a REQUIRED `CommitScope` names `real.scope.testGlobs` ∪ `sourceGlobs`, matched with
  the same `globMatch` predicate `PathWriteScope` walls per-phase writes with — so what the leaf
  could write is exactly what the commit can stage, out of one dialect. The one enumerated addition
  is the ADR-0064 spine-driven `pnpm add` output (`pnpm-lock.yaml` + `**/package.json`), named per
  node because the LEAF structurally cannot write it. Dirty paths outside the scope come back as
  `outOfScope` and are LEFT dirty, so the GATE's own `git status` read fails closed over them rather
  than the commit absorbing work nobody proved — which is what makes the callsite's
  "if anything is still dirty after that commit, the gate fails closed" testable at all. Returns
  `committed:false` when nothing IN SCOPE is dirty (the proof ran against what HEAD already held —
  honest); no commit is ever invented to launder out-of-scope dirt.
- **`promoteRealPass`** (`packages/orchestrator/src/build-worktree.ts`): parks the proven commit on
  `claude/real/<unit-id>-<run-id>` (run-unique — retries never collide) and pushes when an origin
  exists. **The honesty invariant: the branch tip IS the verdict's `commitSha`** — landing must
  keep it in `main`'s ancestry, so `claude/real/*` merges are NON-SQUASH (ADR-0031). A push
  failure is DATA: the local branch is kept either way (V1's preservation-over-loss rule).
  `purpose` defaults to `signed-promotion`, so a signed/proven prefix remains under
  `claude/real/*` even when its caller deliberately withholds the push. The distinct
  `purpose: "unsigned-forensics"` arm parks an already-committed pre-signature-red authored head at
  `claude/real-forensics/<unit-id>-<run-id>` and requires `push:false` with no PR. That category is
  **forensic preservation, not promotion**: it creates no verdict, spreads nothing, and cannot
  collide with the same unit/run's signed prefix. A signer, tree-state, other GATE, or pre-commit
  refusal does not enter this arm.
- **`runWorktreeTypecheck`**
  (`packages/orchestrator/src/build-worktree.ts`): the pre-signature
  package check in the installed worktree, observed the same honest way the gate observes — red/green
  is decided from the exit code only, while `WorktreeCommandObservation` keeps the same captured
  `originalProcessResult` (stdout, stderr and an exit code that may be `null`) plus the command's
  effective `timeoutMs` available to the refusal caller for bounded diagnosis; env scrubbed by the
  real [`shell-test-observer`](shell-test-observer.md), reached through the module's
  `ShellTestExecutor` import.
  The typecheck closes a real hole: the proof run is
  tsx-driven (types STRIPPED), so only `tsc --noEmit` sees type-illegal-but-runtime-green code
  (it happened — declare-presence, 2026-06-11). It is the only package command a build runs: ADR-0580
  D2 deleted the regression-suite observer (`runRegressionSuite`) and left package-suite regression to
  the landing gate and CI.
- **`platformShellCommand`** (`packages/orchestrator/src/build-worktree.ts`): on Windows `pnpm` is a `.cmd` shim
  `execFile` cannot spawn — wrapped as `cmd.exe /d /s /c pnpm …`; injectable platform for offline
  tests of both shapes.

## Integration test

**Goal —** The whole REAL lifecycle against a real git repository: cut a detached worktree of a
throwaway repo, author files into it, `commitAuthored` earns genuine cleanliness, the gate's tree
seam reads it, the proven commit is parked and (when an origin exists) pushed, and teardown leaves
nothing registered (`packages/orchestrator/src/build-worktree.test.ts`, tests beginning
`"createBuildWorktree cuts…"`, `"promoteRealPass parks…"` and `"promoteRealPass pushes…"`). The
end-to-end composition — worktree + real proof command + spine commit → signed pass on a genuinely
clean tree — is proven offline at `resolve-prove-spec.test.ts:539`. The refusal-recovery composition
is exercised at its actual public caller by `packages/drive/src/story-backstop-forensics.test.ts`:
real git and real detached worktrees cover a first-node red with no proven prefix and a later
story-node red where the signed prefix and unsigned attempt must survive under distinct refs.

## Contracts (6)

1. **`worktree-cut-detached-and-removable`** — a fresh detached worktree at HEAD, torn down idempotently
   - **asserts —** the worktree exists at the repo's HEAD sha; `remove()` unregisters and deletes.
   - **covers —** `createBuildWorktree` in `packages/orchestrator/src/build-worktree.ts`
   - **proven by —** `packages/orchestrator/src/build-worktree.test.ts`, `"createBuildWorktree cuts a detached worktree at HEAD…"` (REAL, passing)
2. **`spine-commit-earns-cleanliness`** — `commitAuthored` commits the leaf's files within the node's DECLARED scope (attributed to the resolved signer); nothing-in-scope-dirty is a no-op, and out-of-scope dirt is left for the gate to refuse
   - **asserts —** in-scope dirty → committed, and the attested tree holds the proved paths and NOTHING else (a sibling walk's half-written NEW file and an EDIT to a HEAD-tracked file both stay out, and stay dirty, so `gitTreeState` reads `clean:false`); the enumerated ADR-0064 spine output (`pnpm-lock.yaml` + `**/package.json`) IS staged while a rogue path is not; nothing in scope dirty → `committed:false`, HEAD unchanged — including when EVERY dirty path is out of scope, where no commit is invented and the GATE is left to refuse.
   - **covers —** `build-worktree.ts` — `commitAuthored`, `CommitScope`, `dirtyPaths`
   - **proven by —** `build-worktree.test.ts` — `"createBuildWorktree cuts a detached worktree at HEAD; commitAuthored earns real cleanliness…"`, `"commitAuthored stages ONLY the declared scope…"`, `"commitAuthored stages the spine's OWN enumerated output (ADR-0064 pnpm add)…"`, `"commitAuthored commits NOTHING when every dirty path is out of scope…"` (REAL, passing)
3. **`promotion-parks-run-unique`** — the proven commit lands on `claude/real/<unit>-<run>`; no origin → local only, kept
   - **asserts —** the branch tip IS the proven sha; absence of origin is reported, never thrown.
   - **covers —** `promoteRealPass` in `packages/orchestrator/src/build-worktree.ts`
   - **proven by —** `packages/orchestrator/src/build-worktree.test.ts`, `"promoteRealPass parks the proven commit on a run-unique branch…"` (REAL, passing)
4. **`push-when-origin-withhold-on-demand`** — signed promotion/proven-prefix refs stay under `claude/real/*`, while an unsigned backstop head is retained under a collision-free local-only forensic namespace
   - **asserts —** a signed green head is pushed to a (local bare) origin; a signed/proven prefix withheld locally still uses exactly `claude/real/<unit>-<run>`. Only an install-bearing pre-signature typecheck red with an already-committed authored HEAD requests `purpose: "unsigned-forensics"`, which parks that head at exactly `claude/real-forensics/<unit>-<run>`, requires `push:false`, refuses a PR, and leaves origin without that ref. The two categories may coexist for the same unit/run at distinct SHAs, and the caller labels only the forensic branch as unsigned evidence rather than a promotion or landing candidate. A signer, dirty-tree, other GATE, or pre-commit refusal creates no forensic branch under this contract.
   - **covers —** purpose selection and namespace/guard handling in `promoteRealPass` (`packages/orchestrator/src/build-worktree.ts`); `planBackstopPreservation` and `assembleBackstopResultEvidence` in `packages/drive/src/backstop-preservation.ts`; the lifecycle call site in `packages/drive/src/node-build.ts`; signed-prefix/forensic propagation in `packages/drive/src/story-build.ts`; and unsigned-ref rendering in `packages/drive/src/backstop-report.ts`.
   - **proven by —** `packages/orchestrator/src/build-worktree.test.ts` covers signed push/withhold mechanics, proves that `unsigned-forensics` and the same run's signed prefix produce distinct `claude/real-forensics/*` and `claude/real/*` refs, and rejects an unsigned request that omits explicit push withholding through the guard that also forbids a PR (the real GitHub-origin leg remains a `proposed` pocket, live-verified by PR #32 et al.); `packages/drive/src/backstop-preservation.test.ts` covers the refusal/HEAD decision, explicit purpose and evidence shape; `packages/drive/src/backstop-report.test.ts` covers the exact unsigned warning; and `packages/drive/src/story-backstop-forensics.test.ts` proves at the public `storyBuild` caller that first-node and later-story-node reds retain the intended trees under collision-free local refs, render them honestly, tear down the disposable worktree and spread neither halted-chain ref to origin.
5. **`install-failure-tears-down`** — the injected installer runs in the worktree; a failure removes the worktree and throws
   - **asserts —** installRunner sees the worktree root; on failure nothing buildable remains.
   - **covers —** the install arm of `createBuildWorktree` in `packages/orchestrator/src/build-worktree.ts`
   - **proven by —** `packages/orchestrator/src/build-worktree.test.ts`, `"createBuildWorktree install seam…"`, proves the injected-runner success and teardown-on-failure composition; `packages/orchestrator/src/build-worktree-defaults.test.ts`, `"defaultPnpmInstall runs the real frozen installer…"`, executes the production default against an offline locked local dependency, observes the dependency materialise, and proves frozen-lockfile refusal when the manifest is made stale (REAL, passing)
6. **`promotion-prechecks-observe-exit-codes`** — the package typecheck reads green/red off its exit code while retaining the captured process diagnostics; pnpm is platform-shimmed
   - **asserts —** green/red is derived only from the typecheck's exit code via the worktree command observer; each `WorktreeCommandObservation` also carries `originalProcessResult` with captured stdout, stderr and the numeric-or-`null` exit code, plus the effective `timeoutMs` (`command.timeoutMs` or today's shared default), for the caller to bound when rendering. A `null` exit remains distinguishable from an ordinary non-zero assertion failure and is paired with the budget after which the command may have been killed. This observation widens no budget: ADR-0104 still governs only the resolved node proof command, and changing which timeout the package backstop receives is outside this repair. The typecheck is the only precheck a build makes: ADR-0580 D2 took the package regression suite out of the build, so there is no suite observation to assert. `platformShellCommand` wraps pnpm on win32 and passes everything else through.
   - **covers —** `WorktreeCommandObservation`, `runWorktreeTypecheck` and `platformShellCommand` in `packages/orchestrator/src/build-worktree.ts`; bounded refusal rendering in `packages/drive/src/backstop-report.ts`.
   - **proven by —** `packages/orchestrator/src/build-worktree.test.ts` (`"runWorktreeTypecheck observes green/red by exit code only…"`) proves exact captured stdout/stderr, numeric exit code and explicit/default effective-timeout propagation plus the platform shim; `packages/drive/src/backstop-report.test.ts` proves the numeric and `null` rendering shapes without inventing a retry; and `packages/drive/src/backstop-forensic-integration.test.ts` proves exact typecheck observation payloads in the real lifecycle, on both the single-node and the chain (`promote: false`) paths.
