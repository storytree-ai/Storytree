---
id: "prove-it-gate"
tier: capability
story: drive-machinery
title: "The prove-it-gate driver (proveUnit)"
outcome: "A unit earns a signed PASS verdict only by walking the whole red→green ladder with spine-observed evidence on a clean committed tree."
status: mapped
proof_mode: integration-test
depends_on: [red-green-phase-machine]
---

# The prove-it-gate driver (proveUnit)

**Outcome —** A unit earns a signed PASS verdict only by walking the whole red→green ladder with spine-observed evidence on a clean committed tree.

**Depends on —** [`red-green-phase-machine`](red-green-phase-machine.md)

> **Proof status (honest) — `mapped`.** The whole walk — including a genuine end-to-end with real
> file writes and a real spawned test process — is covered by real, passing, offline suites
> (`packages/orchestrator/src/prove-it-gate.test.ts` + `prove-it-gate.e2e.test.ts`, part of
> `@storytree/orchestrator` 99/99 — I ran them 2026-06-13). The one residual pocket:
> `gitTreeState` against a REAL repository is exercised offline by the REAL-mode walk
> (`resolve-prove-spec.test.ts:539`) and the worktree suite, not by the gate's own tests (which
> inject the tree seam for determinism — by design, ADR-0020 §4). Brownfield `mapped`; per
> ADR-0020 `healthy` is only ever DERIVED from the signed verdicts this very gate appends.

## Guidance

The WORKING gate (ADR-0020) on top of the phase-machine skeleton: `proveUnit`
(`packages/orchestrator/src/prove-it-gate.ts:92-178`) walks
`AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`, the spine owning every transition.
The load-bearing property: **the model never reports the verdict.** The leaf `PhaseAuthor` is
handed exactly two authoring slices (`prove-it-gate.ts:98`, `:120`); red/green is OBSERVED via the
injected `TestExecutor` (`prove-it-gate.ts:111`, `:132`); and at GATE the spine refuses to sign
unless the tree is clean and a signer resolves through the fail-closed V1 chain
(`resolveSigner`, `prove-it-gate.ts:143-155`). On EVERY abort, NO signing row is written — an
unproven unit leaves no promotion event behind (proof is non-authorable). The signed `Verdict`
pins unitId, proof mode, commit, signer, runId, the two captured observations as evidence, and the
injected timestamp (`prove-it-gate.ts:157-175`); the append (`kind:"signing"`) is what
[`work-verdict-event-log`](work-verdict-event-log.md)'s rollup derives `healthy` from.

Determinism is structural: every seam (`author`, `testExecutor`, `store`, `treeState`, `now`) is
injected via `ProveSpec` (`prove-it-gate.ts:48-72`), so the whole walk is offline-testable;
`gitTreeState` (`prove-it-gate.ts:200-206`) is the real tree seam callers inject
(`git rev-parse HEAD` + `git status --porcelain`).

**The executor seam (ADR-0030 §2):** the gate consumes `PhaseAuthor` as a TYPE from
`@storytree/agent` (`prove-it-gate.ts:18`) and never constructs a leaf — the spine is
author-agnostic by design. See the story's "The PhaseAuthor seam is consumed, not owned" section.

## Integration test

**Goal —** The full honesty loop against real in-story collaborators, nothing stubbed in the
verdict path: a scripted-authorship [`owned-loop-phase-author`](owned-loop-phase-author.md) makes
REAL file writes through the real write wall, a real
[`shell-test-observer`](shell-test-observer.md) spawns the authored test for the genuine red and
the genuine green, and the gate signs exactly one row
(`packages/orchestrator/src/prove-it-gate.e2e.test.ts:160`). The negative twin plants a broken
impl: still red at CONFIRM_GREEN → fail-closed, NO signing row (`prove-it-gate.e2e.test.ts:214`).

## Contracts (6)

1. **`happy-path-signs-exactly-once`** — red then green, clean tree, signer present → a signed pass and exactly one signing row
   - **asserts —** `ok:true`, the verdict's fields pinned, one `kind:"signing"` event.
   - **covers —** `packages/orchestrator/src/prove-it-gate.ts:92-178`
   - **proven by —** `packages/orchestrator/src/prove-it-gate.test.ts:106` (REAL, passing)
2. **`forged-green-dies-at-confirm-red`** — a green observed where the red must be aborts the walk, no row
   - **asserts —** `failedAt: "CONFIRM_RED"`, no signing event (the ADR-0020 §3 attack stopped).
   - **covers —** `prove-it-gate.ts:110-115`
   - **proven by —** `prove-it-gate.test.ts:147` (REAL, passing)
3. **`red-at-confirm-green-fails-closed`** — an implementation that never goes green is not proven
   - **asserts —** `failedAt: "CONFIRM_GREEN"`, no row.
   - **covers —** `prove-it-gate.ts:131-136`
   - **proven by —** `prove-it-gate.test.ts:212` (REAL, passing)
4. **`dirty-tree-refuses-at-gate`** — a pass without a clean committed tree is forgeable, so the gate refuses
   - **asserts —** `failedAt: "GATE"` with the dirty-tree reason, no row.
   - **covers —** `prove-it-gate.ts:143-150`
   - **proven by —** `prove-it-gate.test.ts:169` (REAL, passing)
5. **`no-signer-no-verdict`** — an unattributable verdict is refused at GATE
   - **asserts —** empty signer inputs → `failedAt: "GATE"`, no row.
   - **covers —** `prove-it-gate.ts:152-155`
   - **proven by —** `prove-it-gate.test.ts:194` (REAL, passing)
6. **`real-tree-seam-is-real`** — `gitTreeState` reads commit + cleanliness off a genuine repository
   - **asserts —** constructible seam (`prove-it-gate.test.ts:237`); against a REAL worktree it returns the spine-commit's sha with `clean:true` after `commitAuthored` ran.
   - **covers —** `prove-it-gate.ts:200-206`
   - **proven by —** `packages/orchestrator/src/resolve-prove-spec.test.ts:539` and `build-worktree.test.ts:28` (REAL, passing)
