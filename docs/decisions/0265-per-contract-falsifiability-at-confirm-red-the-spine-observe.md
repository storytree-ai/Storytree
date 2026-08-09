---
status: proposed
amends: [20]
arc: verification-integrity-arc
---
# ADR-0265: Per-contract falsifiability at CONFIRM_RED: the spine observes one red per file, not per contract

## Status

proposed (2026-07-29) — the owner directed that this fork be RECORDED, not which way it resolves.
Raised by the friction adjudication of 2026-07-28, where the item
`confirm-red-is-file-granular-so-a-green-on-arrival-contract-is-invisible` was routed `adr` after the
owner's own steer — fold it into the clause-counting lane — was tested against source and found to
rest on a conflation. This records the measured gap and the fork; the resolution is the owner's to
ratify.

**Amends** [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the `amends: [20]` edge binds
only on acceptance. ADR-0020's decision stands entire: red-before-green is enforced by the
deterministic spine as a phase machine, the executor observes and the model never reports. This holds
that observation's GRANULARITY against a per-contract escalation, and overturns none of it. The same
additive shape as the SIX existing `amends: [20]` edges — 0080, 0099, 0104, 0122, 0149, and nearest of
all [ADR-0211](0211-assert-oracle-integrity-close-the-in-process-forged-green-ho.md), which hardened
WHAT counts as a trustworthy green without changing who observes it. A seventh additive edge on
ADR-0020 is the established pattern, not a new one. Note 0122 among them: ADR-0262 amends 0122, so the
two lanes are cousins in the log — this one amends 0020 directly, that one reaches it through 0122.

## Context

**The gap.** The prove-it-gate's `CONFIRM_RED` observes ONE red over a whole test file, not one per
declared contract. A contract that the pre-implementation baseline already satisfies therefore passes
the red gate carried by its file-mates, and the signed verdict records nothing to distinguish it from
a contract whose red was real.

**Measured on the spine, re-verified against `origin/main` at 68b8aed8+:**

- [prove-it-gate.ts:159](../../packages/orchestrator/src/prove-it-gate.ts) makes exactly ONE
  `spec.testExecutor.run(spec.testId)` call for the red, and one at `:188` for the green.
- `ProveSpec.testId` is a scalar `string` ([prove-it-gate.ts:68](../../packages/orchestrator/src/prove-it-gate.ts)).
- `TestObservation` ([phase-machine.ts:32-43](../../packages/orchestrator/src/phase-machine.ts)) carries
  a single scalar `result: "red" | "green"` and a single scalar `testId`.
- The signed verdict is handed exactly TWO evidence rows —
  `evidence: [toEvidence(redObs), toEvidence(greenObs)]`
  ([prove-it-gate.ts:237](../../packages/orchestrator/src/prove-it-gate.ts)).

So the red is one process exit code over one file, and that is all the verdict can ever say.

**The live instance.** `map-server-memo` (run `real-ms435bx2`, 2026-07-28) declares 9 contracts.
Running the completed test file against the reverted implementation gives `8 failed | 8 passed`: four
contracts are GREEN in the pre-implementation baseline. They are not vacuous — they are guard-rails,
and a server that memoizes nothing satisfies them trivially. It re-walks every request, so nothing is
stale, nothing is poisoned, and no route carries a header it should not. Establishing their real red
took three hand-built mutants. The ceremony gave no signal for any of it.

**This is NOT the clause-counting lane, and that lane has since closed.**
[ADR-0262](0262-contract-clauses-are-declared-but-not-observable-check-cover.md) decided
`check:coverage` stays NAME-granular (D1), refused the clause segmenter outright (D3), and left clause
identity as an open fork it does not take (D4). Two facts make the distinction load-bearing rather
than rhetorical:

1. `check:coverage` and [ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md)
   are STATIC — they read the finished source and ask whether each declared contract has a named,
   non-hollow test. This gap is DYNAMIC and TEMPORAL: it is a property of what the spine observed at
   one phase transition, not of the finished file.
2. Commit `99a2ae48` already closed the name-match gap on this very capability, 0 of 9 to 9 of 9. All
   four green-on-arrival contracts now carry a named test with real, runtime-derived assertions — so a
   clause-granular counter would have CREDITED all four. No static check can reach this.

Had the item been folded into the clause lane as first proposed, it would have been archived into a
lane that then decided not to count clauses at all, and the defect would have been lost.

**A channel already exists, and its limits are the shape of the fork.**
[ADR-0211](0211-assert-oracle-integrity-close-the-in-process-forged-green-ho.md) (accepted, amends 20)
and [ADR-0249](0249-oracle-report-freshness-an-unattributable-observation-is-not.md) already built an
out-of-band evidence channel richer than an exit code: a `node --import` guard preload freezes
`node:assert`, writes a report the spine reads back, and `resetOracleReport` / `verifyOracleExercised`
wire a reset-before / read-after freshness protocol that makes the reading attributable by
construction. The spine already downgrades an exit-0 green on that evidence. Two limits matter here:

- **The report carries COUNTS, not IDENTITY.** `oracle-accounting.ts` states it outright: "the report
  body carries no run identity". It can say assertions ran; it cannot say which contract they belong to.
- **It is wired only for the DEFAULT `node --import tsx --test <file>` command.** ADR-0211 records
  custom-`proofCommand` nodes as keeping "exit-code-only observation for now". `map-server-memo` proves
  via `pnpm --filter studio exec vitest run` — a custom command. The friction was found in precisely
  the class with NO oracle coverage at all.

## Decision

**1. The gap is REAL, NAMED, and distinct from BOTH its neighbours.** A contract green in the
pre-implementation baseline is invisible to the ceremony and indistinguishable, on the signed verdict,
from a proven one. ADR-0262 does not close it and cannot: that lane is static, this one is temporal.
[ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md) does not close it
either, and the reason is GRANULARITY. ADR-0098 already names "green-on-arrival" by that exact term
and disposes of it: untested, correct, testable-as-is code is NOT a build-tests target — it is
observe / characterization work signed `adopted`, and forcing a fake red onto it is the theater
ADR-0085 / ADR-0097 ban. But that boundary is drawn at the UNIT, and it is classified BEFORE the build
(ADR-0098's Layer 2, the adoption proposal's job). This finding sits BELOW it: a unit that is
legitimately red-green at the file level — `map-server-memo`'s baseline really does give `8 failed` —
can still carry green-on-arrival CONTRACTS inside it, which no unit-level classification can see and
which the build then signs green. So the PHENOMENON is named in the corpus and this GRANULARITY of it
is not, which is the same shape as the distinction against ADR-0262 one axis over. Meanwhile the build
prints coverage N of N beside `observation:red` and `observation:green`, which implies the opposite.

**2. No mechanism is built here.** This ADR records the fork; it does not take it. The reason is that
every candidate route crosses a decided boundary, and the routes differ in cost by roughly an order of
magnitude.

**3. The open fork — WHAT to observe.** None costed here:

- **(a) Extend the oracle report to carry per-test identity.** Structurally the cheapest: the channel,
  the provenance discipline, and the fail-closed precedent all exist (ADR-0211 / ADR-0249). It
  inherits ADR-0211's scope limit — default `node:test` only — so it would NOT have caught this
  instance, and closing that requires generalising the guard to custom runners first.
- **(b) Parse per-test results from runner output.** Covers vitest and `node:test` alike, which is
  where the evidence actually lives, at the cost of runner-specific parsing in the executor and
  changing `TestObservation` from a scalar to a list.
- **(c) Declare falsifiability in the spec and check it statically.** ADR-0262 D5 already NAMED this
  and deliberately left it out: `falsifiability` is present on 38 of 947 contracts, and a check on it
  would open an advisory list at roughly 900 entries inside the very gate whose warn-list hygiene this
  arc is bounding. It needs its own increment and its own baseline.

**4. The second, independent fork — WHAT TO DO with a green-on-arrival contract.** Refuse the build,
warn, or merely record it on the verdict. ADR-0020 currently decides enforcement is spine-side and
file-shaped; this axis is not settled anywhere. Note that (a) and (b) both change what the signed
`Verdict` carries, and `Verdict` / `EvidenceRef` live in `proof-protocol`, the published port every
organism reads across the seam ([ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) section 3). The
precedent is exact: adding the last contract-granular axis, `Verdict.contractCoverage`, took
[ADR-0127](0127-record-per-contract-coverage-on-the-signed-verdict-shape-adr.md), and ADR-0262 D4
records that moving that shape is an owner call under the owner-fork-bar. Route (c) leaves the shape
untouched.

**5. SCOPE THE BAR HONESTLY — per-test red is the WEAKER of two bars.** Per-contract red at
CONFIRM_RED catches only the null-implementation case: the contract that is green because nothing is
implemented yet. This instance establishes that guard-rail contracts have a different failure mode —
their real red is a plausible WRONG implementation, which took three hand-built mutants to produce.
Per-contract falsifiability and mutation-grade falsifiability are two different answers at two very
different costs, and an ADR that resolves this fork should say which one it is buying. Buying the
cheaper one and describing it as the stronger would reproduce, one layer up, the exact defect this
ADR is about.

## Consequences

**Good.** The gap is stated where a session will find it, against a ceremony whose output currently
implies the opposite. The distinction from ADR-0262 is recorded with the evidence that settles it, so
the next reader does not re-litigate the conflation this item was nearly archived under. The
adjacency is now visible: ADR-0262 D4 route (a) and this ADR's routes (a) and (b) both move the
`Verdict` shape, so they are cheaper decided together than separately.

**Bad / accepted.** Nothing is fixed by recording this. Until the fork resolves, a guard-rail contract
can still ship signed-green while asserting nothing that could fail, and `check:coverage` will keep
reading it N/N — the two surfaces agreeing on a number neither can justify. This also adds a third
`proposed` ADR awaiting an owner signature on one arc, which the open friction item
`adr-awaiting-an-owner-signature-looks-exactly-like-an-unfinished-draft` names as its own defect.

**Escalated, not decided.** Both forks above are the owner's: what to observe (3), and what to do
about it (4). ADR-0262's fork should be considered in the same sitting.

## References

- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — red-green enforcement on the owned
  loop; the file-shaped observation this amends.
- [ADR-0211](0211-assert-oracle-integrity-close-the-in-process-forged-green-ho.md) — the assert-oracle
  channel and its default-command-only scope.
- [ADR-0249](0249-oracle-report-freshness-an-unattributable-observation-is-not.md) — the reset/verify
  freshness protocol that makes out-of-band evidence attributable.
- [ADR-0262](0262-contract-clauses-are-declared-but-not-observable-check-cover.md) — the static
  sibling; `check:coverage` stays name-granular.
- [ADR-0098](0098-a-build-tests-capable-inner-loop-refactor-for-testability-ea.md) — the UNIT-granular
  sibling: it names "green-on-arrival" and routes a wholly-green-on-arrival unit to `adopted` rather
  than build-tests. Its boundary stands entire; this ADR reports a residue one tier below it, inside a
  unit whose file-level red is genuine.
- [ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md) /
  [ADR-0127](0127-record-per-contract-coverage-on-the-signed-verdict-shape-adr.md) — the static
  vouching input and the verdict axis.
- [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) section 3 — `proof-protocol` as the published port.
- `packages/orchestrator/src/prove-it-gate.ts`, `phase-machine.ts`, `shell-test-executor.ts`,
  `proof/oracle-accounting.ts` — the measured mechanism. `resolve-prove-spec.ts` holds the conditional
  that scopes the oracle channel, and since `custom-proof-command-red-accounting` (2026-08-09) it reads
  that scope off ONE classifier, `proof/proof-route.ts` — `realProofCommand` returns
  `accounted: true` for any SINGLE-FILE `node:test` command over the node's own test file (default or
  declared) and `false` for a suite or a foreign runner, with `beforeRun`/`verifyGreen` wired only when
  it is true — so it, not `shell-test-executor.ts`, is where routes (a) and (b) would be built.
- `stories/studio/map-server-memo.md` — the capability the gap was found on; custom vitest
  `proofCommand`.
- Friction item `confirm-red-is-file-granular-so-a-green-on-arrival-contract-is-invisible`.
