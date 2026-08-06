---
status: accepted
load_bearing: true
decided: 2026-06-27
amends: [20]
---
# ADR-0122: Per-contract coverage check: map each declared contract to an observed test

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27 (gate-check
mechanism · no new signer · ship the lightweight first slice). Design-time alignment IS the
ratification (ADR-0110); no second end-of-flow ask. BUILT in the same unit.

**Corrected in place 2026-08-06 per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).**
This decision stands ENTIRELY — the structural classifier, no new signer, the lightweight first slice.
What was overtaken is the whole **deferred** list below, which read as a set of live follow-ons and is
now three closed or ended items: the hollow-test hole was closed by
[ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md) *by the static path,
falsifying this ADR's prediction that closing it needed a runtime signal*; the verdict-shape axis was
closed by [ADR-0127](0127-record-per-contract-coverage-on-the-signed-verdict-shape-adr.md); and the
"not YET a hard gate" deferral ENDED — [ADR-0311](0311-gate-survival-is-evidence-backed-retain-nine-production-catc.md)
D2 retired `check:coverage` from root policy and CI on 2026-08-05, and D5 requires a FRESH decision to
re-add it, so no standing intention to wire it survives. A reader calibrating to this ADR would
otherwise believe three pieces of work are queued that are not. Decision 1's covered-iff-NAMED clause
is annotated where it stands. Truth-maintenance, not a re-decision.

**Amends** [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — ADR-0020 made red→green
non-forgeable for *the test the leaf authored*; this adds a check that every *declared* contract has
a test, without overturning anything ADR-0020 decided.

## Context

ADR-0020's honesty property is genuinely strong: the spine advances the phase machine, observes the
RED then the GREEN of the **new** test out-of-band, and signs the verdict spine-side against a clean
commit — so a leaf can never forge the test it authored. But that property is scoped to **one** test:

- a `--real` build declares exactly one `testFile` / `sourceFile`
  ([`RealProofConfig`](../../packages/orchestrator/src/proof-config.ts));
- the executor returns one aggregate exit code
  ([`ShellTestExecutor`](../../packages/orchestrator/src/shell-test-executor.ts)) — it does not
  enumerate which tests ran;
- the signed [`Verdict`](../../packages/proof-protocol/src/proof.ts) records `proofMode` + `boundHash`
  for that one proved span, with no link back to the capability's full `## Contracts` list.

So a capability that declares N contracts can reach a signed green on **one** proven test. The leaf
reliably drops the hardest robustness/concurrency contract — documented: `fr-bounded-never-hangs`
(`stories/desktop/shared-forest-connection.md`) is one of four declared contracts on a capability
whose only test proves none of them. Coverage is the orchestrator/reviewer's job and **nothing caught
under-coverage**. So "trustworthy" was correctly scoped to *"cannot forge the authored test,"* not
*"the whole spec is proven."*

This is the same SHAPE of hole [ADR-0099](0099-synthetic-smoke-verdicts-must-not-derive-a-green-unit.md)
closed for the synthetic-vs-real *basis* axis, and the contract-level analogue of the capability-level
coverage guarantee [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)
makes ("a green crown MEANS the untested pockets got real coverage"). ADR-0097's capability→gate
covers-diff already exists as the [adoption-proposal classifier](../../packages/orchestrator/src/proof/adoption-proposal.ts);
this is the tier **below** it: contract→test.

## Decision

The owner ratified all three (the recommended path):

1. **Mechanism — a structural gate check (tooling), not a process step or a reviewer agent.** A pure,
   offline, deterministic classifier maps each declared contract to an OBSERVED test by the naming
   convention — a contract is covered iff some test NAMES it (the `describe("<contract-id>: …")`
   convention, proven real by `declare-presence`'s three contracts naming `presence.test.ts`'s three
   suites). It mirrors `classifyAdoption` one tier down. No store / git / clock.
   **Narrowed by ADR-0126 (2026-06-27): naming is necessary but no longer sufficient** — the classifier
   is unchanged, but its INPUT is now the VOUCHING test names only (a test that runs AND asserts
   substantively), so a contract is covered iff some *vouching* test names it. **And "gate check" is
   now half-true (ADR-0311 D2, 2026-08-05):** the mechanism is a structural CHECK as decided, but the
   `check:coverage` gate rung is retired; `storytree coverage` is the live surface.
2. **Authority — no new signer (structural).** The check is code (like `adr-number-unique`); it needs
   no human coverage attestation. A contract with no honest isolatable test falls to the existing
   `operator-attested` proof mode — a human, never an agent self-sign.
3. **Scope — the lightweight first slice now; heavier work deferred.** Ship the minimal check: every
   declared contract maps to an observed test; flag the uncovered.

Built as three pure units + a CLI surface, mirroring the adoption feature's layering:
- [`parseContracts`](../../packages/library/src/contracts.ts) (`@storytree/library`) — parse a
  capability's `## Contracts` prose into declared contract ids (like `parseReliabilityGates`).
- [`classifyContractCoverage`](../../packages/orchestrator/src/proof/contract-coverage.ts) +
  `extractTestNames` (`@storytree/orchestrator`) — the pure classifier + static test-name extraction.
  `NodeSpec` gains a `contracts` field, parsed off the body alongside `reliabilityGates` / `uatTests`.
- [`storytree coverage <capability-id>`](../../packages/cli/src/coverage.ts) (`@storytree/cli`) — the
  offline report: it exits non-zero when a contract is uncovered (a green would over-claim) and passes
  when every contract is named. Pure-by-injection (the unit loader is a seam).

## Consequences

**Good.**
- Under-coverage is now CATCHABLE — `storytree coverage <cap>` flags the dropped contract the signed
  green silently omitted (observability-first: the gap is now a surface, not invisible). Run against
  the documented case it flags all four broker contracts incl. `fr-bounded-never-hangs`; against
  `declare-presence` it reports 3/3 covered.
- The naming convention (a test name carries its contract's id) becomes a checkable standard.
- No honesty wall is moved; ADR-0020's red→green property is untouched. This only ADDS a completeness
  check on top of it.

**Bad / costs / deferred (the named follow-ons — the heavier work the owner deferred).**
*Three of these four are no longer deferred; each is marked with what closed or ended it (per the
correction above). Only the reviewer-agent remains open.*
- **Static name-presence, not runtime observation.** A test NAMED for a contract counts as covering
  it. This catches the DOCUMENTED failure mode (a DROPPED contract — no test names it). It does NOT
  catch a HOLLOW test (`assert(true)` under the right name) — that needs a runtime-observed coverage
  signal + the ADR-0020 §4 reward-hacking guards, deferred.
  **CLOSED by [ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md)
  (2026-06-27), and it closed the hole the OTHER way:** the owner revisited this fork and chose a
  STATIC-AST vouching check over the runtime signal this bullet names as what it "needs". So the
  requirement stated here was a prediction and is FALSIFIED — a runtime-observed signal was never
  built and is not what the fix took. (0126's own reasoning: this repo asserts via
  `node:assert/strict`, which a runtime reporter cannot see the CONTENT of, and executing
  leaf-authored code to observe coverage is the reward-hacking surface ADR-0020 §4 guards against.)
- **Not yet a hard gate in `pnpm gate` / CI.** The first slice is the per-unit CHECK (the command +
  the classifier, proven by a real red→green); wiring it as a build-blocking step is deferred so it
  does not strand legitimately-unbuilt `proposed` capabilities (which are honestly uncovered).
  **The deferral ENDED unwired (ADR-0311 D2, 2026-08-05):** `check:coverage` — which did exist as a
  WARN-only rung — was retired from root policy and CI along with fifteen others, on the evidence
  that it caught no production defect. D5 makes re-addition cost a FRESH decision, so this is not a
  follow-on still queued behind the first slice; the honest current state is that the check lives
  only at `storytree coverage`, on demand. The concern that motivated the deferral (stranding
  legitimately-unbuilt `proposed` capabilities) was never resolved — it was overtaken.
- **No coverage axis on the verdict shape.** Recording per-contract coverage on the signed verdict
  (the Option-A-style richer mechanism) is deferred; the check is live-derivable today.
  **CLOSED by [ADR-0127](0127-record-per-contract-coverage-on-the-signed-verdict-shape-adr.md)
  (2026-06-27), which took the minimal two-list shape** the owner directed rather than the richer
  per-contract record; the axis has since (2026-08-06) gained an `unreadTitles` qualifier so a frozen
  `uncovered` says whether it is a claim about the tests or about the checker. This is why the
  coverage fact is no longer *only* live-derivable: for a `--real` driven green it is also frozen on
  the signature.
- A larger **reviewer-agent** that judges coverage semantically (does the test actually exercise the
  contract?) remains the escalation path if name-presence proves too weak. **Still open** — the one
  item on this list that is (ADR-0126 re-states it as its own deferred semantic-gap limit).

## References

- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — **amended**: red→green is enforced for
  the authored test; this adds the per-contract completeness check the §3 single-test observation
  leaves open.
- [ADR-0099](0099-synthetic-smoke-verdicts-must-not-derive-a-green-unit.md) — the same fail-closed
  shape on the synthetic-vs-real BASIS axis (precedent for the kind of wall).
- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) /
  [ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md) — the
  capability-level coverage guarantee + classifier this extends one tier down (contract→test).
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — owner's
  design-time decision is the ratification (born accepted).
- Code: `packages/library/src/contracts.ts`, `packages/orchestrator/src/proof/contract-coverage.ts`,
  `packages/cli/src/coverage.ts`, `packages/orchestrator/src/node-spec.ts` (the `contracts` field).
