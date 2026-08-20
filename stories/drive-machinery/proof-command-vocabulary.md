---
id: "proof-command-vocabulary"
tier: capability
story: drive-machinery
title: "Node-declared proof command (proof-mode vocabulary beyond node:test)"
outcome: "A node declares its own proof command, so the same prove-it-gate drives non-node:test work red→green from a spec-borne command."
status: proposed
proof_mode: integration-test
depends_on: [spec-borne-proof-config]
decisions: [20, 57]
---

# Node-declared proof command (proof-mode vocabulary beyond node:test)

**Outcome —** A node declares its own proof command, so the same prove-it-gate drives non-node:test
work red→green from a spec-borne command.

**Depends on —** [`spec-borne-proof-config`](spec-borne-proof-config.md)

> **Proof status (honest) — `proposed`, built outer-loop (the bootstrap).** This is ADR-0057 §3's
> expansion B (no new ADR — it ships under the already-decided §3 plan + [ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)'s
> honesty walls). The change is BUILT and its dominant behaviour is observationally verified by a
> real, passing, OFFLINE suite (`proof-config.test.ts` schema legs + `resolve-prove-spec.test.ts`
> resolution/prompt/forge legs). Like the keystone it extends, B is a MULTI-FILE change the
> single-file inner loop cannot yet drive, so it was built outer-loop first. That build order does not
> make this greenfield work brownfield (ADR-0395); without a current signed pass it remains `proposed`.
> The remaining proof work is gate-driving it (awaits expansion C, multi-file builds). A LIVE
> non-node:test red→green (e.g. a `pnpm --filter x test` proof) is an operator-attested `--real`
> smoke, not a standing test — the same posture as the other live legs in this story. The honesty
> walls are PRESERVED: only the proof COMMAND the spine spawns becomes declarable; the spine still
> OBSERVES red/green out-of-band, the leaf still authors testFile→sourceFile, scope is unchanged.

## Guidance

Before B, the REAL-mode proof command was HARD-CODED to `node --import tsx --test <real.testFile>`
([`resolve-prove-spec.ts`](../../packages/orchestrator/src/resolve-prove-spec.ts)): the inner loop
could only prove a single TypeScript `node:test` file pair (gap G1). B lets a node declare its own
proof command in the spec-borne `proof:` block's `real.proofCommand`, so the SAME gate drives a
package suite (`pnpm --filter x test`), another runner, or a shell test — red→green — without
changing the gate.

The change, three touch-points (on top of A's `proof-config.ts` + the resolver):

- **`proof-config.ts`** — `RealProofConfig.proofCommand?: ShellCommand` (zod, `.strict()`, reusing
  the existing `ShellCommandSchema`). Two refines guard it: a declared `cwd` is REFUSED (the spine
  forces cwd to the worktree root — a node declares WHAT to run, never WHERE, so a proof can never
  redirect out of its own worktree); a `pnpm` command REQUIRES `install: true` (a bare no-install
  worktree has no `node_modules`). Absent = the node:test default (the migrated nodes are unchanged).
- **`resolve-prove-spec.ts`** — `realProofCommand(real, workspace)` chooses the declared command
  (platform-shimmed, cwd forced) or the default, in ONE place, so the spine's CONFIRM observations
  and the leaf's `run_proof` feedback tool can never diverge (the one-oracle property). `realPrompts`
  takes the command's display string and a custom-proof brief.
- **`node-build.ts`** (CLI display only) — the `--real` envelope's `real proof:` header derives from
  the same `realProofCommand(...).display` (with a `(declared)` marker for a spec command), so the
  shown command never drifts from the spawned one. Display-only — out of the contract/proof scope.

**Demonstrated targets (scope guard):** B's demonstrated proof commands are test-runner commands —
`pnpm … test` (which covers `check:*` gates run as `pnpm --filter x check:foo`) and `node …`. A
`check:*`-AS-PROOF that is not a red→green test pair is gate-as-proof (ADR-0057 §5 / expansion E),
not B — B widens the OBSERVATION vocabulary, never the single-pair authoring model (constraint 5).
`platformShellCommand` shims `pnpm` on Windows; widening it to `npm`/`yarn`/`npx` is a one-line
follow-up (expansion C territory), so B stays on `pnpm`/`node`.

B widens the **proof oracle** (the red→green observation) only. The promotion BACKSTOPS are
unchanged and independent: an install-bearing node's `--real` promotion still runs the package
regression suite (`buildConfig.command`) AND the package typecheck (ADR-0031 §2) in the worktree
before pushing — "don't break the package" / "no type-illegal-but-runtime-green" remain separate
gates a custom `proofCommand` does not replace.

Trust note: a node declaring its own proof command is a wider authorship surface than A's scope —
but it cannot weaken any honesty wall (a forged-green command is self-defeating: the spine spawns the
SAME command at CONFIRM_RED, and a green there aborts before any implementation). The fail-closed
default and the spine's out-of-band observation are preserved.

> **Open owner call (surfaced, not decided) — bounding an over-declared proof COMMAND.** A
> self-registered node now declares its own *command*, a wider supply-chain surface than A's *scope*
> (whose deferred owner call is in [`spec-borne-proof-config`](spec-borne-proof-config.md)). The
> honesty walls make a forged-green command self-defeating, so this is NOT load-bearing for B's
> correctness — but whether a declared `proofCommand` should carry a STRUCTURAL bound (an allow-list
> of executables; a reject of network/filesystem-mutating shapes) or whether PR-diff review of the
> spec's `proof:` block is the accepted control (the registry status quo, the same answer A took for
> scope) is a genuine **owner decision** — the same family as the deferred approval-gated-trunk
> question. B ships matching the status quo (PR-diff review); this call should be raised before the
> first spec-borne-only B node lands, and if the owner wants a structural bound, that bound gets its
> own ADR.

## Integration test

**Goal —** A node with a spec-borne `real.proofCommand` resolves into a `ProveSpec` whose CONFIRM
observations AND `run_proof` feedback spawn THAT command (cwd forced to the worktree, pnpm
platform-shimmed), the briefs name it, and a node with no `proofCommand` resolves to the exact
pre-B node:test default — proving the proof command became declarable without changing the gate or
breaking the migrated nodes. The honesty wall is proven by a genuine offline walk: an always-green
declared command still fails CONFIRM_RED.

## Contracts (5)

1. **`proof-command-defaults-to-node-test`** — a `real:` arm with NO `proofCommand` resolves to the exact pre-B default
   - **asserts —** `realProofCommand` returns `node --import tsx --test <abs(workspace,testFile)>`, cwd=workspace, the unchanged display; the migrated nodes carry no `proofCommand`.
   - **covers —** `packages/orchestrator/src/proof-config.ts`, `resolve-prove-spec.ts` (`realProofCommand`)
   - **proven by —** `resolve-prove-spec.test.ts` ("B — realProofCommand defaults …", "B — every migrated real node stays the node:test default") + `proof-config.test.ts` (REAL, passing)
2. **`declared-proof-command-is-spawned`** — a declared `proofCommand` is what the spine spawns, cwd forced to the worktree, pnpm platform-shimmed
   - **asserts —** `realProofCommand` chooses the declared command with `cwd === workspace`; a pnpm command deep-equals `platformShellCommand({...,cwd})`.
   - **covers —** `resolve-prove-spec.ts` (`realProofCommand`), `build-worktree.ts` (`platformShellCommand`, unchanged)
   - **proven by —** `resolve-prove-spec.test.ts` ("B — a declared no-deps proofCommand …", "B — a declared pnpm proofCommand delegates …") (REAL, passing)
3. **`one-oracle-two-consumers`** — the spine's CONFIRM command and the leaf's `run_proof` are the SAME command; the briefs name it
   - **asserts —** real-mode arms `run_proof` off the declared command; `realPrompts` name the declared command + the custom-proof brief, not tsx-on-one-file.
   - **covers —** `resolve-prove-spec.ts` (the single `realProofCommand` feeds the executor AND `feedbackCommandsFor`)
   - **proven by —** `resolve-prove-spec.test.ts` ("B — real-mode arms run_proof …", "B — realPrompts name the declared command …") (REAL, passing)
4. **`declared-command-cannot-redirect-or-forge`** — a declared `cwd` is refused at parse; an always-green declared command still fails CONFIRM_RED
   - **asserts —** the forced-cwd refine throws; a genuine offline walk with an always-exit-0 `proofCommand` fails closed at CONFIRM_RED (no forged green).
   - **covers —** `proof-config.ts` (the cwd refine), `prove-it-gate.ts` (UNCHANGED — a green at CONFIRM_RED aborts)
   - **proven by —** `proof-config.test.ts` ("B — malformed: a proofCommand carrying a cwd is loud") + `resolve-prove-spec.test.ts` ("B — a trivially-green declared proofCommand still fails CONFIRM_RED") (REAL, passing)
5. **`declared-command-parity-and-deps-guard`** — a `proofCommand` round-trips with no materialized-undefined keys; a pnpm command requires install:true; parity intact
   - **asserts —** `parseNodeBuildConfig` deep-equals the input (no `proofCommand`/`cwd` invented); the migrated 7 carry no `proofCommand` (the A parity guard stays green); a pnpm command without `install:true` is LOUD.
   - **covers —** `proof-config.ts` (the parse builder + the pnpm⇒install refine)
   - **proven by —** `proof-config.test.ts` ("B — a real arm with a declared (node) proofCommand parses and round-trips", "B — malformed: a pnpm proofCommand WITHOUT install:true is loud", the no-install `proofCommand`-absent guard) (REAL, passing)
