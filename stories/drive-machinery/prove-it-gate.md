---
id: "prove-it-gate"
tier: capability
story: drive-machinery
title: "The prove-it-gate driver (proveUnit)"
outcome: "A unit earns a signed PASS verdict only by walking the whole red→green ladder with spine-observed evidence on a clean committed tree."
status: proposed
proof_mode: integration-test
depends_on: [red-green-phase-machine]
---

# The prove-it-gate driver (proveUnit)

**Outcome —** A unit earns a signed PASS verdict only by walking the whole red→green ladder with spine-observed evidence on a clean committed tree.

**Depends on —** [`red-green-phase-machine`](red-green-phase-machine.md)

> **Proof status (honest) — `proposed`.** The whole walk — including a genuine end-to-end with real
> file writes and a real spawned test process — is covered by real, passing, offline suites
> (`packages/orchestrator/src/prove-it-gate.test.ts` + `prove-it-gate.e2e.test.ts`, part of
> `@storytree/orchestrator` 99/99 — I ran them 2026-06-13). The one residual pocket:
> `gitTreeState` against a REAL repository is exercised offline by the REAL-mode walk
> (`resolve-prove-spec.test.ts:539`) and the worktree suite, not by the gate's own tests (which
> inject the tree seam for determinism — by design, ADR-0020 §4). This is greenfield Storytree work;
> without a current signed pass it remains `proposed` (ADR-0395). Per ADR-0020 `healthy` is only ever
> DERIVED from the signed verdicts this very gate appends.

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

**The pre-signature backstop (ADR-0315).** GATE carries one more refusal: the optional injected
`ProveSpec.backstop`, run after the clean-tree and signer checks and before the signing append. In a
REAL build the drive wires it to the installed worktree's package typecheck + regression suite
(`buildNodeReal`), so a red means the unit is NOT PROVEN — no signing row — rather than a push
withheld over a verdict that was signed anyway. The ordering is load-bearing in both directions: the
two cheap refusals come FIRST (a dirty tree never pays for a typecheck), and the append comes LAST (a
red backstop can leave nothing behind). The outcome is a precondition, never evidence: it does not
enter `verdict.evidence`, which stays exactly the two spine observations. Absent ⇒ unchanged — every
dry-run / live-smoke walk and every builtins-only node carries no backstop.

**The executor seam (ADR-0030 §2):** the gate consumes `PhaseAuthor` as a TYPE from
`@storytree/agent` (`prove-it-gate.ts:18`) and never constructs a leaf — the spine is
author-agnostic by design. See the story's "The PhaseAuthor seam is consumed, not owned" section.

**Refusal observation boundary.** When a CONFIRM_RED or CONFIRM_GREEN transition refuses, the failed
`ProveResult` exposes `failedObservation?: { stdout; stderr; exitCode }`: the immediately preceding
spine-owned `originalProcessResult`, copied verbatim. The phase is the result's own `failedAt`, and
the payload carries no test id. `exitCode: null` remains a real
signal-termination observation. CONFIRM_RED includes an unexpected green and a measured wrong-kind
red; an ordinary non-zero red still advances. The gate does not rerun a command, change the transition
decision, sign or promote a refusal, expose output to the author, or add it to evidence/history.
Authoring, GATE, and backstop refusals have no such payload, as does every pass.

**Escalation boundary (contract [`gate-routes-authoring-escalation`](gate-routes-authoring-escalation.md), signed PASS run `real-mu1lv3wm`; ADR-0569).**
An authoring slice's failure may carry a typed `escalation`: the `PhaseAuthor` seam's
`AuthoringEscalation`, from contract
`authoring-escalation-shape` in the `agent` story. Its authority is fail-closed and nothing more: it
can end a walk without a verdict, and it never advances a phase, produces a verdict, enters
`verdict.evidence`, or withholds a signature the observations earn (D2). An IMPLEMENT escalation
cannot veto an observation (D3): CONFIRM_GREEN still runs, a red refuses with the escalation record
beside `failedObservation`, and a green overrules it — the walk signs exactly as it would have without
it, and the result records `overruledEscalation`. An AUTHOR_TEST escalation ends the walk at
AUTHOR_TEST after the spine runs the declared test once (D4). That run is not CONFIRM_RED: no phase
observer fires, no visited phase is recorded, and nothing advances. Its output rides on the returned
`escalation` record, never as `failedObservation`, so the refusal observation boundary above stays
exact. An escalation returned from the other phase's slice fails closed as malformed (D1). The test id
on either record is stamped by the spine, never read from the leaf. The refusal `reason` does not yet
name a standing escalation: an IMPLEMENT escalation that stays red refuses with the CONFIRM_GREEN
refusal and its notes alone, an AUTHOR_TEST reason carries the kind and the slice's `error` but not
the escalation's `statement`, and a mismatch reason already names both phases. Contract
[`confirm-green-refusal-names-standing-escalation`](confirm-green-refusal-names-standing-escalation.md)
(proposed) adds the kind and the statement after the unchanged text, because `story build`'s chain
summary and the gate build driver print the reason alone.

## Integration test

**Goal —** The full honesty loop against real in-story collaborators, nothing stubbed in the
verdict path: a scripted-authorship [`owned-loop-phase-author`](owned-loop-phase-author.md) makes
REAL file writes through the real write wall, a real
[`shell-test-observer`](shell-test-observer.md) spawns the authored test for the genuine red and
the genuine green, and the gate signs exactly one row
(`packages/orchestrator/src/prove-it-gate.e2e.test.ts:160`). The negative twin plants a broken
impl: still red at CONFIRM_GREEN → fail-closed, NO signing row (`prove-it-gate.e2e.test.ts:214`).

## Contracts (11)

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
7. **`backstop-precedes-the-signature`** — a verdict is never signed ahead of the package observation that backs it (ADR-0315)
   - **asserts —** a RED `backstop` refuses at GATE with zero signing rows; a GREEN one is consulted exactly once and signs; an absent seam is unchanged; the seam is NEVER paid for when a cheaper GATE refusal (dirty tree, no signer) already fires, nor when the walk dies before GATE.
   - **covers —** `proveUnit`'s GATE backstop step + `ProveSpec.backstop` (`packages/orchestrator/src/prove-it-gate.ts`)
   - **proven by —** `packages/orchestrator/src/prove-it-gate.test.ts` cases (n)–(r), and end-to-end through the drive in `packages/drive/src/backstop-before-signature.test.ts` (both the single-node and the `promote:false` chain path) (REAL, passing)
8. **`evidence-carries-the-observation-note`** — the verdict records WHY an observation reads as it does, including whether a green was vetted
   - **asserts —** an observation carrying a `note` produces evidence reading `observed <result> [(kind)] — <note>`, on the returned verdict AND the persisted signing row; an observation with no note keeps the bare wording (back-compat).
   - **covers —** `toEvidence` (`packages/orchestrator/src/prove-it-gate.ts`)
   - **proven by —** `packages/orchestrator/src/prove-it-gate.test.ts` cases (s)–(t) (REAL, passing)
9. **`confirm-refusal-returns-only-the-original-spine-observation`** — a final CONFIRM refusal returns its original command observation without weakening proof authority
   - **asserts —** an unexpected CONFIRM_RED green returns that one observation; an explicit `expectedRed` rejects a measured wrong-kind red and returns that one red observation; after an advancing red, a CONFIRM_GREEN red returns the second observation. Each CONFIRM_RED refusal spawns once, the CONFIRM_GREEN path spawns twice total, and none performs a diagnostic rerun. Every case writes zero signing rows; a pass and authoring/GATE/backstop/non-shell failures expose no failed observation.
   - **covers —** `packages/orchestrator/src/prove-it-gate.ts` failed-result construction at CONFIRM_RED and CONFIRM_GREEN
   - **proven by —** additions to `packages/orchestrator/src/prove-it-gate.test.ts` through contract [`confirm-refusal-observation`](confirm-refusal-observation.md), signed PASS (run `real-mu0aic0k`, per `inner-loop-exit-arc`'s increment log). Declared gap at landing (PR #1910): those tests drive `proveUnit` with hand-built observations rather than `ShellTestExecutor` child commands, so the spawn-count and measured wrong-kind clauses are not exercised by that proof; `packages/drive/src/node-build-refusal-observation.test.ts` exercises the CONFIRM_GREEN transport over a real child.
10. **`escalation-ends-the-walk-or-is-overruled-by-observation`** — an authoring escalation ends a walk without a verdict or is overruled by the spine's green observation, and never becomes a verdict
    - **asserts —** an AUTHOR_TEST escalation spawns the declared test once, never requests IMPLEMENT, calls `onPhase` for AUTHOR_TEST only, writes no signing row, and returns `failedAt: "AUTHOR_TEST"` with the record (`raised`, `testId`, that run's exact output) and no `failedObservation`, whether that run is red or green; an IMPLEMENT escalation still visits CONFIRM_GREEN — still red, it refuses with `failedObservation` and the record without `observation`; turned green, it signs a verdict deep-equal to the unescalated walk's and records `overruledEscalation`, which a later GATE refusal also carries; an escalation returned from the other phase's slice fails closed at that slice with no record; `exhausted: true` with an escalation routes as the escalation; a plain authoring error and plain exhaustion are unchanged.
    - **covers —** `proveUnit`'s escalation routing, `ProveResult`'s `escalation` / `overruledEscalation`, and `EscalationRecord` (`packages/orchestrator/src/prove-it-gate.ts`, exported through `packages/orchestrator/src/index.ts`)
    - **proven by —** `packages/orchestrator/src/prove-it-gate.escalation.test.ts` through contract [`gate-routes-authoring-escalation`](gate-routes-authoring-escalation.md), signed PASS (run `real-mu1lv3wm`). Not exercised by that proof: the test drives `proveUnit` with `RecordingTestExecutor` observations and a `FakeAuthor` double rather than `ShellTestExecutor` child commands, so no child-written marker count is read; nor are `failedObservation` on any escalation path, step 1's red child, the absence of an IMPLEMENT request, the exhausted-and-escalating route, an escalation returned from the IMPLEMENT slice, the verdict's deep equality with the unescalated walk's, or the step-6 regressions. Its standing-IMPLEMENT and mismatch reason clauses moved to contract 11.
11. **`standing-escalation-is-named-in-its-refusal-reason`** — a refusal names the authoring escalation it carries or rejects in its reason, after the reason it gives without one
    - **asserts —** a standing IMPLEMENT escalation refuses at CONFIRM_GREEN with a reason that begins byte for byte with the same walk's reason without it — the CONFIRM_GREEN refusal, then any oracle or raise-the-ceiling note — and continues with the kind and the statement verbatim, while `failedAt`, `failedObservation`, the record and the zero signing rows stay as contract 10 specifies them; an AUTHOR_TEST escalation's reason carries the kind and the statement; each phase-mismatch reason names both phases; a walk with no escalation refuses with exactly today's CONFIRM_GREEN text, and the GATE refusal after an overrule gives exactly the reason the same walk gives without the escalation.
    - **covers —** the refusal reasons on `proveUnit`'s escalation paths (`packages/orchestrator/src/prove-it-gate.ts`)
    - **proven by —** contract [`confirm-green-refusal-names-standing-escalation`](confirm-green-refusal-names-standing-escalation.md): a new `packages/orchestrator/src/prove-it-gate.escalation-reason.test.ts` over ordinary `ShellTestExecutor` child commands (proposed; not yet built)
