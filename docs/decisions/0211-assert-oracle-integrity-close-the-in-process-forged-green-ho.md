---
status: accepted
decided: 2026-07-17
amends: [20]
---
# ADR-0211: Assert-oracle integrity: close the in-process forged-green hole in the prove-it-gate

## Status

accepted (2026-07-17) — decided/directed by the owner in conversation on 2026-07-17. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. **amends
[ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)** — it hardens the mechanism behind
ADR-0020's load-bearing "the model never reports the verdict" property without changing the
decision; ADR-0020's four mechanisms all stand.

## Context

A defensive-security review of the prove-it-gate found a real hole in ADR-0020's central guarantee —
**the model can never forge a green.** ADR-0020 re-established V1's process-isolation honesty on one
owned loop by having the deterministic spine OBSERVE red/green itself (§3) rather than trust a model
claim. The live observer ([`ShellTestExecutor`](../../packages/orchestrator/src/shell-test-executor.ts))
derives the verdict from **one signal: the proof command's process exit code** (`exit 0 ⇒ green`).

The gap: that proof command — for a `--real` contract/capability node, the default
`node --import tsx --test <testFile>` — **runs the IMPLEMENT-phase source the leaf authored in the
SAME process and module registry as the test.** A unit test must load and call its source in-process;
that is what a unit test IS. So source authored in IMPLEMENT can subvert the very oracle the test
depends on and force a hollow `exit 0`. Red-first does not help: the source is authored AFTER
CONFIRM_RED is observed, and the AUTHOR_TEST/IMPLEMENT write walls (§2) stop the leaf editing the
test — but it never needs to; it attacks the oracle, not the test.

Two vectors were demonstrated empirically against the real mechanism (Node 24, `node --test`):

- **A — monkeypatch the oracle.** IMPLEMENT source does, at import time,
  `import assert from "node:assert/strict"; assert.equal = () => {}` and exports a wrong
  implementation. Node caches the builtin module object, so the test's later `assert.equal(...)`
  resolves the now-no-op method. Result: `pass 1`, **exit 0**.
- **B — truncate the run.** IMPLEMENT source calls `process.exit(0)` at import time. No assertion
  ever runs, yet `node --test` reports the file as passing and exits 0.

Either drives `proveUnit` to sign a `pass` [Verdict](../../packages/proof-protocol) and, under
`--real --store pg`, persist a `healthy` promotion row. The same exit-code oracle backs the offline
gate (`pnpm -r test`) and CI, so a committed forgery propagates.

Why the existing defences miss it:

- The prior forged-green fix (the `NODE_TEST*` env scrub, `shell-test-executor.ts`) closes a
  DIFFERENT vector — a spawned `node --test` inheriting the runner's `NODE_TEST_CONTEXT` and exiting
  0 without running the file. It is about the child's env, not in-process oracle tampering.
- Per-contract coverage / hollow-test detection ([ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md) /
  [ADR-0127](0127-record-per-contract-coverage-on-the-signed-verdict-shape-adr.md),
  [`proof/contract-coverage.ts`](../../packages/orchestrator/src/proof/contract-coverage.ts)) is a
  **static AST** check: it verifies the test SOURCE contains a substantive `assert.equal(add(2,3),5)`
  and that a vouching test NAMES each contract. Both attack tests have exactly that substantive
  source, so coverage reads them COVERED — it never observes that the assertion was neutralised or
  never executed. The file itself notes it does "no execution, no `t.assert` plan-counting (this
  codebase asserts via `node:assert/strict`, which a runtime reporter never counts)" — the gap this
  ADR names is real and known-open.

Threat model. The leaf is a Claude Agent SDK model we fund. The realistic trigger is not a from-scratch
adversary but a **prompt-injected** leaf (malicious Library/knowledge content or node-spec guidance
folded into its system prompt) or a **misaligned** model producing an obvious subversion. The design
goal follows: fail closed on the easy vectors and make forgery require conspicuous, reviewable,
intent-revealing code — not a perfect defence against arbitrary same-process code, which is
unattainable while a unit test loads its source in-process.

## Decision

**Add a spine-owned assert-oracle guard + out-of-band assertion accounting to the default node:test
proof, and refuse a green the oracle did not actually run — fail-closed.** Two layers, installed by
the spine, never by the leaf:

1. **Guard preload (freeze + count).**
   [`packages/orchestrator/src/proof/assert-oracle-guard.mjs`](../../packages/orchestrator/src/proof/assert-oracle-guard.mjs)
   is a `node --import` preload that runs BEFORE any test/source module loads. It wraps every
   `node:assert` / `node:assert/strict` assertion method to count real invocations into a private
   closure counter, then `Object.freeze`s both modules. A source that reassigns a method (vector A)
   throws a `TypeError` under ESM strict → its import fails → the proof reds. It registers a
   `process.on("exit")` hook FIRST (so it fires even when the source calls `process.exit(0)` —
   vector B) that writes `{assertions: <count>}` to the file named by `STORYTREE_PROOF_REPORT`.

2. **Fail-closed green cross-check.**
   [`packages/orchestrator/src/proof/oracle-accounting.ts`](../../packages/orchestrator/src/proof/oracle-accounting.ts)
   resolves the guard URL (off the spine's OWN module, never a worktree copy), picks a per-build
   report path in the OS temp dir (OUTSIDE the worktree, so writing it never dirties the tree the
   GATE proves clean), and reads the count back. `ShellTestExecutor` gains an optional
   `verifyGreen(out)` seam: on an `exit 0` observation it consults the report and **downgrades the
   green to a fail-closed RED (with a forensic note) when fewer than one real assertion executed** —
   a missing/unreadable report counts as zero. The resolver
   ([`resolve-prove-spec.ts`](../../packages/orchestrator/src/resolve-prove-spec.ts)) forces the
   report env onto the ONE proof command both the spine's CONFIRM observation and the leaf's
   `run_proof` spawn, and wires `verifyGreen` for default-command real nodes. A downgraded green
   becomes a red at CONFIRM_GREEN → `nextPhase` fails closed → no verdict is signed.

**This is the FLOOR (owner-chosen over "freeze-only" and over the maximal cross-check).** Freeze
alone defeats vector A but NOT B (`process.exit(0)` sails through a frozen oracle); the out-of-band
count is what catches B. Requiring `>= 1` real assertion closes both demonstrated vectors, since both
leave zero.

**Scope.** The veto is wired only for the DEFAULT `node --import tsx --test <file>` command, whose
tests assert via `node:assert/strict` — the convention the coverage classifier already assumes.
Custom-`proofCommand` nodes (package suites, vitest, the R2 refactor-for-tests wall) may assert via an
API the guard does not count, so they keep exit-code-only observation for now (see follow-ons).

**Honest limit (stated, not hidden).** No in-process oracle is perfectly tamper-proof against
arbitrary same-process code: a determined attacker could run one dummy `assert.equal(1, 1)` then
`process.exit(0)` to reach a count of 1. Defeating THAT is the maximal follow-on below. The floor
fails closed on the easy vectors and raises the cost of forgery to conspicuous code; the assertion
count is already written so a later cross-check can consume it.

## Consequences

- **ADR-0020's guarantee is restored for the common path.** A leaf that authors an honest red test
  then forges the green (either vector) now fails closed at CONFIRM_GREEN with no signing row —
  proven end-to-end through `proveUnit` in a real worktree
  ([`resolve-prove-spec.test.ts`](../../packages/orchestrator/src/resolve-prove-spec.test.ts), the
  ADR-0211 cases) and at the unit level with before/after controls
  ([`proof/oracle-accounting.test.ts`](../../packages/orchestrator/src/proof/oracle-accounting.test.ts)).
- **No false greens; a small, loud false-RED surface.** The cross-check can only turn a green into a
  red, never the reverse — so it can never manufacture a pass. A legitimate default-command test that
  asserts ONLY via bare `assert(x)` (never a counted method like `assert.ok`/`assert.equal`) would
  false-red; this is vanishingly rare given the codebase convention and fails CLOSED (a loud,
  recoverable red, never a silent forged green).
- **Negligible cost.** One extra `--import` of a builtins-only module and one temp-file read per
  observation; no new services, no network, no DB. The guard loads from the spine's committed copy,
  so it works in a bare worktree with no `node_modules`.
- **Custom-command nodes remain on the exit-code oracle** — a narrower, documented residual (below).
- **Forensics.** `TestObservation` gains an optional `note`; a refused green explains WHY (the proof
  exited 0 but did not exercise the oracle) in the gate's fail-closed reason, not just "not green".

### Follow-ons (not decided here)

- **Maximal cross-check (raise the floor).** Cross-check the runtime assertion count against the
  spine's static parse of the frozen test surface (reuse ADR-0126's `analyzeObservedTests`): require
  that every vouching test the spine parsed actually completed and asserted at runtime. This defeats
  the "dummy assert then exit" attacker, at the cost of a false-RED risk on tests whose assertions are
  conditional — which is why it is deferred, not shipped in the floor.
- **Custom-command coverage.** Extend accounting to package-suite / vitest proofs (count `expect`
  too, or a runner-level assertion plan) so custom-`proofCommand` nodes are no longer exit-code-only.

## References

- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) (the amended decision — spine-observed
  red/green, "the model never reports the verdict").
- [ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md) / [ADR-0127](0127-record-per-contract-coverage-on-the-signed-verdict-shape-adr.md) (the
  static hollow-test / coverage checks this complements at runtime).
- [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) (the db-proof env this composes with on the one command),
  [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) (born-accepted).
- Code: [`assert-oracle-guard.mjs`](../../packages/orchestrator/src/proof/assert-oracle-guard.mjs),
  [`oracle-accounting.ts`](../../packages/orchestrator/src/proof/oracle-accounting.ts),
  [`shell-test-executor.ts`](../../packages/orchestrator/src/shell-test-executor.ts),
  [`resolve-prove-spec.ts`](../../packages/orchestrator/src/resolve-prove-spec.ts),
  [`prove-it-gate.ts`](../../packages/orchestrator/src/prove-it-gate.ts).
