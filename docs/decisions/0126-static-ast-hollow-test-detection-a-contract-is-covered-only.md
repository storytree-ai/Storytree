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

**Corrected in place again 2026-08-06 per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).**
The decision still stands ENTIRELY. What was overtaken this time is the CONSERVATIVE-BIAS claim below —
"it flags only a clearly-hollow test … never a real test" — which was stated as if it covered the whole
classifier and did not. It holds on the axis it was decided for (HOLLOWNESS) and never held on a second
axis nobody had named: whether the classifier can READ a test's title at all. A title it could not read
was dropped from the observed set, so an honest, substantively-asserting test flagged its contract
UNCOVERED — the exact false-hollow this ADR's bias exists to prevent, arriving through a door the bias
was not written to cover. Measured and FIXED 2026-08-06 (see the two-axis limit below);
truth-maintenance, not a re-decision.

**Also corrected in place 2026-08-06 — a SECOND, unrelated overtaking found on the same pass.**
[ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md) D2 retired
`check:coverage` from root policy and CI on 2026-08-05, so this ADR's present-tense claims that the
check runs *at the gate* — and its instruction to **run** `pnpm check:coverage` — described wiring
that no longer exists: no `package.json` declares that script, and it is absent from the gate plan
(`packages/cli/src/gate-order.ts` lists it under `retiredBy: "ADR-0311 D2"`). `check-coverage.ts` /
`coverage-gate.ts` / `coverage-drain.ts` survive as source only, which ADR-0311 D5 explicitly warns
is *not* evidence that the old gate policy stands. The DECISION here is untouched — ADR-0126 chose
the static-AST path and added **no signer and no gate posture of its own**, and `storytree coverage`,
the on-demand surface it actually decided, is live and was re-run at this seat. Only the wiring
sentences are re-tensed below. This is the decision-log instance of the class the friction item
`retired-rung-leaves-prose-asserting-it-still-runs` measured across `packages/cli/src`; that audit
swept source banners and printed output, not ADR bodies.

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
  sweep) swap `extractTestNames` → `extractVouchingTestNames`. **Since 2026-08-06** `loadCoverageUnit`
  calls `readTestSurface` instead — the same vouching names, plus the count of titles the reader could
  not read in full; `loadRealBuildCoverageUnits` still calls `extractVouchingTestNames`, now behind a
  rung that no longer runs (see the Status correction above).
- **No new signer, no new gate posture** (inherits ADR-0122 / ADR-0020): it is a structural check —
  WARN-only at the gate (`check:coverage`), exits-non-zero on demand (`storytree coverage`). No store /
  git / clock / execution. **As of ADR-0311 D2 the gate half is GONE** — the `check:coverage` rung was
  retired from root policy and CI, leaving the on-demand verb as the only live surface. The decision
  itself is unaffected, and this is the direction it always pointed: *no new gate posture* was the
  claim, and there is now none.

Detection is CONSERVATIVE by design: it flags only a clearly-hollow test (no assertion, a constant-only
assertion, or a skip), biasing toward "covered" to avoid false-hollows (telling an honest author their
real test does not count). A false-real (a missed hollow) is no worse than the name-presence status quo;
a false-hollow would erode trust, so the line is drawn to avoid it.

**Scoped 2026-08-06: that bias is the HOLLOWNESS axis's, and it is not the classifier's only fold.**
Reading a test's TITLE is a second axis, and it folds the other way — a title that cannot be read
statically vouches for nothing, because a name never seen cannot be shown to carry a contract id. The
two are compatible only under one rule, which the code now enforces: **whatever is statically readable
MUST be read.** A readable title left unread routes an honest test into the uncovered bucket, i.e. the
readability fold delivers the false-hollow the hollowness fold exists to prevent. And because the folds
disagree, an UNREAD title may never share a bucket with an ABSENT test: "I could not read six titles"
and "six tests are missing" are different claims about different things, so `readTestSurface` returns
the count of unreadable titles alongside the vouching names and `storytree coverage` prints it, rather
than letting a `0/N` silently mean either.

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
  deferred to keep this slice tight. **Partly closed 2026-08-06:** the THIRD case — a test whose title
  this checker could not read — is now separated out and reported (`readTestSurface`'s `unreadTitles`,
  rendered by `storytree coverage`). Dropped-vs-hollow remains undistinguished, as deferred here.
- **The classifier read only a bare string literal or a template as a title, so a title assembled from
  several literals was invisible — found and FIXED 2026-08-06, MEASURED not predicted.** `testCallName`
  accepted `ts.isStringLiteralLike` or `ts.isTemplateExpression` and returned null for anything else, so
  `matchTestCall` dropped the whole declaration: a title split across two lines as
  `test("<id>: …" + "…", …)` — the ordinary way to keep a long title inside the line limit — was not an
  observed test at all, and its contract read UNCOVERED. Nothing about that title is dynamic; it is
  fully static and trivially foldable. A bare parenthesised literal `("<id>: …")` was dropped for the
  same reason. **The wrong outcome went out under a signature**: PR #1172 stamped
  `coverage 0/6 contracts` onto capability `offer-set-render-agreement`'s signed `--real` verdict while
  all six tests existed, named their contracts verbatim, asserted substantively, and passed — and since
  [ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md) retired
  `check:coverage` as a gate rung, the stamped number is what survives. Re-measured through the real
  `storytree coverage` path on 2026-08-06 by splitting one live title: `5/6, 1 UNCOVERED` before the
  fix, `6/6` after, with nothing else changed. `readTestCallTitle` now folds `+` over literals
  recursively and reads through parentheses — **literals only, never evaluating a runtime expression**
  — and marks a partially-static title so it is reported rather than passed off as a clean read. A
  related residual is deliberately unchanged: a title with a genuinely runtime part still contributes
  only its literal text (the pre-existing template rule), which is why the count exists.
- **The reader was CLONED into a second package, and the clone would have silently diverged — deleted
  2026-08-06.** `findOptionsFormSkips` (`packages/cli/src/verification-decay.ts`, ADR-0252 D1) carried a
  hand-kept copy of `testCallName` whose own comment named the hazard: its names are JOINED against
  `extractVouchingTestNames`'s output, so a different spelling makes the join miss and the
  `vacuous-proof` instrument "under-report while still looking healthy". Teaching this classifier to
  fold concatenated titles would have realised exactly that. The copy now delegates to the exported
  `readTestCallTitle` (both packages resolve the same `typescript`), so the agreement is structural
  rather than remembered, and a test pins it.
- **It reads only the `.skip`/`.todo` MODIFIER, so the OPTIONS form of skip is invisible — added
  2026-07-27, MEASURED not predicted.** `analyzeObservedTests` derives `skipped` from
  `test.skip(name, fn)`; `node:test` equally accepts `test(name, { skip: !DB }, fn)`, a second
  argument the classifier never inspects. Such a test reports `skipped: false`, and if its body
  asserts, `vouches: true` — so a test that DOES NOT RUN is, to this check, a test that runs and
  asserts. The wrong outcome is live in this repo: `stories/wisp-as-story-claim/claim-store-work-time.md`
  declares `release-claims-by-branch-clears-the-branch`, whose only test carries `{ skip: !DB }` in
  `packages/notice-board/src/store/claim-store-release-by-branch.live.test.ts`; run offline and the
  check prints `claim-store-work-time: 2/3 uncovered`, naming the OTHER two — that contract reads
  COVERED, proven by a test that did not execute. **Re-tensed 2026-08-06:** this originally read *run
  `pnpm check:coverage` offline (the default for the whole gate and for CI)*, and ADR-0311 D2 retired
  that rung, so the sentence was handing a reader a command that no longer exists. The live
  reproduction is `pnpm storytree coverage claim-store-work-time`, re-run at this seat on 2026-08-06:
  same `2/3`, same two names, the skipped test still reading COVERED. The blind spot is the
  classifier's, not the rung's, so retiring the rung did not touch it. Located across 7 test files by the `vacuous-proof` instrument of `pnpm
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
  `uncovered` ceiling. **Re-tensed 2026-08-06:** that re-baseline obligation lapsed with ADR-0311 D2 —
  `coverage-drain.ts` and its ceiling still compile, but nothing reads them at the gate, so the patch
  no longer owes a ceiling bump to keep anything green. The 119 → 120 / exactly-one-contract
  MEASUREMENT stands; only its consequence for a merge does not. **Nothing is re-decided**: ADR-0126
  chose the static-AST path and shipped the
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
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — the owner's
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
