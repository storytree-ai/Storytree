---
status: accepted
load_bearing: true
decided: 2026-06-27
amends: [122]
---
# ADR-0126: Static-AST hollow-test detection: a contract is covered only by a substantively-asserting test

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27 (static AST over a
runtime signal; no new signer; ship the lightweight first slice). Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask. BUILT in the same unit.

**Corrected in place 2026-07-27 per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).**
This decision stands ENTIRELY — static AST over a runtime signal, the vouching-test input, the
conservative bias, no new signer. What was overtaken is a CONSEQUENCE that read as complete: the
`node:test` **options form** of skip (`test(name, { skip: !DB }, fn)`) is a second argument, not a
`.skip`/`.todo` MODIFIER, so `analyzeObservedTests` does not parse it and such a test reports
`skipped: false` / `vouches: true` — running and asserting, to every static reader in the repo. The
gap was not in the deferred-limits list below, so a reader calibrating to this ADR would believe a
non-running test cannot vouch. It is added there, with the measurement. Truth-maintenance, not a
re-decision.

**Amends** [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) — ADR-0122
built the per-contract coverage check on STATIC NAME-PRESENCE and named the hollow-test hole as a
deferred follow-on; this closes that hole, choosing the static path over the runtime one 0122
anticipated, without overturning anything 0122 decided.

## Context

[ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) built the per-contract
coverage check: a capability's declared `## Contracts` map to OBSERVED tests by the naming convention
(`describe("<id>: …")`), flagging any contract no test names. That first slice was deliberately STATIC
NAME-PRESENCE — and 0122 named its own limit: *a test NAMED for a contract counts as covering it even
if it is HOLLOW* (`assert(true)` under the right name). 0122 framed closing that hole as needing "a
runtime-observed coverage signal + the [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) §4
reward-hacking guards," and deferred it.

On 2026-06-27 the owner revisited that deferred fork and chose the STATIC path over the runtime one.
Two forces decided it:

1. **Static AST is the only one of the two candidates that catches the DOCUMENTED failure mode for this
   codebase.** This repo asserts via `node:assert/strict` (`assert(...)`), not the `node:test` runner's
   `t.assert` / `t.plan` API — so the runner never counts those assertions in its reporter output.
   Runtime observation could see *ran / passed / skipped* but NOT assertion *content*; a hollow
   `assert(true)` still runs and passes, so a runtime-reporter approach could not catch it without first
   changing the codebase's test conventions. A static AST reads the literal `true` directly.
2. **Static AST stays consistent with everything already built.** The whole coverage mechanism is pure,
   offline, deterministic, no execution (it mirrors `classifyAdoption` one tier down). ADR-0020 §4
   already names "no `assert(true)` / skipped-test equivalents" as spine/**lint** rules — i.e. static
   checks. A static hollow-check is the lint-shaped tool that framing points at; a runtime executor
   would introduce the very reward-hacking surface (executing leaf-authored code to *observe* coverage)
   that ADR-0020 §4 guards against.

## Decision

Strengthen the coverage check's INPUT, not its classifier: a declared contract is covered only by a
test that VOUCHES for it — a test that **(a)** runs (is not `.skip`/`.todo`, nor nested under one) AND
**(b)** asserts something SUBSTANTIVE somewhere in its lexical region (including nested tests).

- A **substantive assertion** is an `assert`/`expect` call (the two assertion APIs this repo uses) with
  ≥1 argument that is not a trivially-constant literal. `assert(true)`, `expect(true).toBe(true)`,
  `assert.equal(1, 1)` are NOT substantive (constant-only → hollow); `assert.ok(result.bounded)`,
  `expect(x).toBe(5)`, `await assert.rejects(connect(hangs))` are.
- Implemented as `analyzeObservedTests` + `extractVouchingTestNames` in
  [`contract-coverage.ts`](../../packages/orchestrator/src/proof/contract-coverage.ts), parsing the test
  source with the **TypeScript compiler AST** (already a devDependency of the package; the proof module
  is node-only; an AST is robust against the strings / comments / templates a hand-rolled brace-scanner
  would misread — correctness matters for an honesty mechanism). The pure name-matching classifier
  `classifyContractCoverage` is UNCHANGED — it simply receives only the vouching names. The two
  production loaders ([`loadCoverageUnit`](../../packages/cli/src/commands.ts) for `storytree coverage`,
  [`loadRealBuildCoverageUnits`](../../packages/cli/src/coverage-gate.ts) for the `check:coverage`
  sweep) swap `extractTestNames` → `extractVouchingTestNames`.
- **No new signer, no new gate posture** (inherits ADR-0122 / ADR-0020): it is a structural check —
  WARN-only at the gate (`check:coverage`), exits-non-zero on demand (`storytree coverage`). No store /
  git / clock / execution.

Detection is CONSERVATIVE by design: it flags only a clearly-hollow test (no assertion, a constant-only
assertion, or a skip), biasing toward "covered" to avoid false-hollows (telling an honest author their
real test does not count). A false-real (a missed hollow) is no worse than the name-presence status quo;
a false-hollow would erode trust, so the line is drawn to avoid it.

## Consequences

**Good.**
- The documented reward-hack — a test named for a contract but proving nothing (`assert(true)`) — no
  longer counts as coverage. The hole ADR-0122 named is closed at the structural tier.
- Skipped tests named for a contract no longer count either (they never run) — a strictly stronger
  signal than name-presence, at no extra cost. **Scoped per the correction above: this holds for the
  `.skip`/`.todo` MODIFIER form only, which is what the classifier parses. The options form is a
  measured blind spot — see the last deferred limit below.**
- Stays pure / offline / deterministic / sub-second; drops straight into the existing `storytree
  coverage` + `check:coverage` surfaces with no execution and no new dependency.
- The real corpus is unchanged at the moment of landing (16 WARN'd capabilities before and after,
  `declare-presence` still fully covered) — confirming no false-hollow regression. The change is
  PREVENTIVE (a future hollow test will not slip through), not a retroactive re-flagging.

**Bad / costs / deferred (the named escalation path).**
- It does not catch a SEMANTIC gap: a test that asserts something substantive but IRRELEVANT to its
  contract (`assert.ok(unrelated)` under the right name) still reads covered. Judging relevance is the
  deeper follow-on — a semantic reviewer-agent (ADR-0122's R4), explicitly owner-sized and not built
  here.
- The substantive/hollow line is a deliberate first cut: constant-folding stops at literals / unary /
  binary, so it does not evaluate `String(1)` or a `const` that resolves to a literal. A determined
  adversary can still write a non-trivially-constant-but-meaningless assertion; that too is the semantic
  reviewer's job, not a structural check's.
- The report still says only "no substantive test covers it" — it does not yet DISTINGUISH a dropped
  contract (no test names it) from a hollow one (a test names it but is hollow). A cheap refinement,
  deferred to keep this slice tight.
- **It reads only the `.skip`/`.todo` MODIFIER, so the OPTIONS form of skip is invisible — added
  2026-07-27, MEASURED not predicted.** `analyzeObservedTests` derives `skipped` from
  `test.skip(name, fn)`; `node:test` equally accepts `test(name, { skip: !DB }, fn)`, a second
  argument the classifier never inspects. Such a test reports `skipped: false`, and if its body
  asserts, `vouches: true` — so a test that DOES NOT RUN is, to this check, a test that runs and
  asserts. The wrong outcome is live in this repo: `stories/wisp-as-story-claim/claim-store-work-time.md`
  declares `release-claims-by-branch-clears-the-branch`, whose only test carries `{ skip: !DB }` in
  `packages/notice-board/src/store/claim-store-release-by-branch.live.test.ts`; run `pnpm check:coverage`
  offline (the default for the whole gate and for CI) and it prints `claim-store-work-time: 2/3
  uncovered`, naming the OTHER two — that contract reads COVERED, proven by a test that did not
  execute. Located across 7 test files by the `vacuous-proof` instrument of `pnpm
  check:verification-decay` (ADR-0252 D1), which is where the current count lives.
  **The skip itself is usually CORRECT** — these are mostly live-DB proofs that cannot run without a
  database (ADR-0064) — so the defect is the INVISIBILITY, never "this should not skip", and the fix
  is either the visible idiom (`store.test.ts`) or teaching this classifier the options form.
  **Correction (2026-07-28, per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):
  this sentence read "The latter is a STORY-SHAPE call, not a patch: it would move every contract those
  tests vouch for into `check:coverage`'s WARN backlog", and the cost it asserts was never measured.**
  Measured on 2026-07-28 by re-running the real sweep with every options-form-skipped test name removed:
  the backlog moves 119 → 120 uncovered contracts, and the capability count not at all. **Exactly ONE
  contract** — `release-claims-by-branch-clears-the-branch` on `claim-store-work-time`. The reason is
  this ADR's own text two paragraphs up: of the 7 files the `vacuous-proof` instrument locates, only
  `claim-store-release-by-branch.live.test.ts` is a live capability's registered `real.testFile`; the
  other six bind no capability's `real.testFile` or name no declared contract, which the instrument's
  own stated false positive already predicted ("a test whose name matches no declared contract makes
  nothing read covered"). So the fix is a PATCH plus a one-line ceiling re-baseline in the same commit,
  not a story-shape call — the number is recorded in advance at `DEFAULT_COVERAGE_DRAIN_CONFIG`
  (`packages/cli/src/coverage-drain.ts`), which names this as the one legitimate upward move of the
  `uncovered` ceiling. **Nothing is re-decided**: ADR-0126 chose the static-AST path and shipped the
  modifier-only classifier, and neither changes. What is corrected is an unmeasured cost estimate that
  was re-quoted rather than re-derived, and on that reading deferred bounding `check:coverage` — the
  worklist ADR-0252 names as its own live counter-example — behind three other increments. A related
  residual is unchanged by that fix — an IMPERATIVE runtime
  skip in the body (`t.skip(…)`) is invisible to the AST for the same reason, and is not counted here.

## References

- [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) — **amended**: this
  closes the hollow-test hole 0122 named as a deferred follow-on, choosing the static path over the
  runtime one 0122 anticipated.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) §4 — the reward-hacking guards ("no
  `assert(true)` / skipped-test equivalents" as lint rules) this realizes one tier down, on the coverage
  check.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification-record-t.md) — the owner's
  design-time direction is the ratification (born accepted).
- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) D1 — the
  `vacuous-proof` instrument that MEASURED this ADR's options-form blind spot and reports its current
  count on every gate; the judge's reasoning is `packages/cli/src/verification-decay.ts`
  (`findVacuousProof`). It LOCATES the blind spot in this classifier's input and never re-derives
  coverage.
- [ADR-0211](0211-assert-oracle-integrity-close-the-in-process-forged-green-ho.md) /
  [ADR-0249](0249-oracle-report-freshness-an-unattributable-observation-is-not.md) — the runtime
  assert-oracle complement to this static check, and the *a proof that cannot fail is not a proof*
  class the options-form blind spot belongs to. Their veto is scoped to `--real` default-command
  proofs, where the spine forces the DB env, so it does not observe this offline reading.
- Code: `packages/orchestrator/src/proof/contract-coverage.ts` (`analyzeObservedTests` /
  `extractVouchingTestNames` + the AST helpers), `packages/orchestrator/src/proof/contract-coverage.test.ts`
  (the red→green), `packages/cli/src/commands.ts` + `packages/cli/src/coverage-gate.ts` (the loaders),
  `packages/cli/src/coverage.ts` (the report wording).
