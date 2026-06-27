---
status: accepted
load_bearing: true
decided: 2026-06-27
amends: [122]
---
# ADR-0127: Record per-contract coverage on the signed verdict shape (ADR-0122 Option A)

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27 (the minimal
two-list shape · additive/optional · no new signer). Design-time alignment IS the ratification
(ADR-0110); no second end-of-flow ask. BUILT in the same unit.

**Amends** [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) — ADR-0122
built the per-contract coverage check as a LIVE-DERIVABLE tool (`storytree coverage` / `check:coverage`)
and named "no coverage axis on the verdict shape" as a deferred follow-on (its "Option A"); this closes
that follow-on by attesting coverage ON the signed verdict, without overturning anything 0122 decided.

## Context

[ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) made under-coverage
CATCHABLE: a pure classifier maps each declared `## Contracts` behaviour to an OBSERVED test by the
naming convention, and [ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md)
strengthened the input so only a test that VOUCHES (runs AND asserts substantively) counts. But that
coverage fact was only ever **live-derivable** — re-computed each run by `storytree coverage <cap>` and
the `check:coverage` gate sweep against whatever source is on disk *now*. The signed
[`Verdict`](../../packages/proof-protocol/src/proof.ts) (the published, cross-organism message format,
ADR-0068 §3) recorded `proofMode` + `boundHash` for the ONE proved span, with **no link** to the
capability's declared contract set.

So a reader of a historical green could not see *which contracts that green covered* without re-running
the classifier — and a later source change could shift the answer out from under the verdict. ADR-0122
itself named the fix ("Option A — the richer mechanism, recording per-contract coverage on the signed
verdict") and deferred it. This is that follow-on.

Because the `Verdict` shape is the PUBLISHED format every organism `.safeParse()`s across the ADR-0010
§4 boundary, changing it is an owner decision (the owner-fork-bar). The owner directed two points in
conversation on 2026-06-27: (a) record the **minimal** shape — just the covered/uncovered declared-id
lists, NOT a richer per-contract record with the covering test name; and (b) make it **additive /
optional** (default-absent), never a required field.

## Decision

Add an **additive, optional** per-contract coverage axis to the signed verdict, populated at sign time
by reusing the existing classifier — no new signer, no new gate posture (it inherits ADR-0122 /
ADR-0126 / ADR-0020).

1. **Shape (the owner's minimal choice).** A new browser-safe zod shape
   [`ContractCoverageAxis`](../../packages/proof-protocol/src/proof.ts) = `{ covered: string[];
   uncovered: string[] }` (strict), and an OPTIONAL `Verdict.contractCoverage` field. Just the two
   declared-contract-id lists — the contracts a SUBSTANTIVE test covered vs the ones the green
   over-claimed. The covering test name(s) stay live-derivable (`storytree coverage`), not frozen on
   the verdict. Additive/back-compat: default-absent, so every prior stored verdict and every
   non-coverage producer round-trips unchanged (mirrors `boundHash` / `approvedBy`). A reader keys off
   PRESENCE, never absence — a missing axis means "not recorded", never "fully covered".

2. **Population — a lazy GATE-time seam, reusing the ADR-0126 vouching classifier.** The
   prove-it-gate ([`proveUnit`](../../packages/orchestrator/src/prove-it-gate.ts)) gains an optional
   `ProveSpec.contractCoverage` THUNK it consults only once it reaches GATE (a genuinely-signed green —
   an aborted walk stamps nothing). The real-mode resolver
   ([`resolveReal`](../../packages/orchestrator/src/resolve-prove-spec.ts)) injects it: at GATE it reads
   the LEAF-AUTHORED test file (which does not exist at resolve time, so the compute must be lazy),
   extracts the VOUCHING names (`extractVouchingTestNames`, ADR-0126) and runs `classifyDeclaredCoverage`
   against the unit's `## Contracts`. FAIL-CLOSED: a unit with no declared contracts or an unreadable
   test surface yields `undefined` and the gate OMITS the axis (never a false "fully covered").

3. **Scope — the real red→green path only.** Only a `--real` driven green that resolves a unit's
   contracts carries the axis; dry-run / live-smoke prove a SYNTHETIC pair unrelated to the node's
   contracts (so their proveSpec omits the seam), and the `adopted` / `operator-attested` paths prove a
   whole command / human witness, not named per-contract tests (so they round-trip without it — the
   optionality makes this clean, no migration).

4. **Reader.** [`verdictLine`](../../packages/orchestrator/src/proof/verdict-line.ts) appends a
   coverage clause when the axis is present (`… — coverage <covered>/<total> contracts [(⚠ uncovered:
   …)]`), so the attested fact is visible at a glance; omitted entirely when absent (every pre-ADR-0127
   verdict renders exactly as before).

## Consequences

**Good.**
- The coverage fact is now **attested on the signed green**, not merely re-derivable later against
  possibly-changed source — a genuinely-under-covered verdict CARRIES its gap (`uncovered` non-empty), a
  fully-covered one carries the full set (observability-first: the over-claim is on the record).
- Reuses the ADR-0126 vouching classifier wholesale, so the verdict's axis is hollow-aware for free — a
  contract named only by an `assert(true)` reads uncovered ON the verdict, same as in the live tool.
- Fully additive: no existing reader breaks, no stored verdict needs migration, the adopted /
  operator-attested paths are untouched. The honesty walls (ADR-0020 red→green, ADR-0126 vouching) are
  unmoved — this only RECORDS an existing computed fact onto the verdict.

**Bad / costs / deferred (the named follow-ons).**
- **Minimal shape, by owner choice.** The covering test name(s) are NOT frozen on the verdict; an
  audit wanting "contract X covered by test Y at sign time" must re-derive it live. A richer
  per-contract record is a later ADDITIVE bump if a consumer needs it.
- **Static / vouching, not semantic (inherited).** The axis records what ADR-0122/0126 compute — a
  substantive-but-IRRELEVANT assertion under the right name still reads covered. Judging relevance is
  the deeper follow-on (a semantic reviewer-agent, ADR-0122's R4), explicitly owner-sized and not built
  here.
- The axis rides only the `--real` driven-green path; coverage for adopted/operator-attested green is
  out of scope (those modes have no named per-contract test surface to classify).

## References

- [ADR-0122](0122-per-contract-coverage-check-map-each-declared-contract-to-an.md) — **amended**: this
  closes its deferred "no coverage axis on the verdict shape" follow-on ("Option A").
- [ADR-0126](0126-static-ast-hollow-test-detection-a-contract-is-covered-only.md) — the vouching
  extractor (`extractVouchingTestNames`) the GATE-time seam reuses, so the axis is hollow-aware.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) §4 — the signed-verdict honesty floor
  this records onto, unchanged.
- [ADR-0068](0068-dissolve-the-core-god-package-into-organisms.md) §3 — the published verdict SHAPE
  (`@storytree/proof-protocol`) this additively extends.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification-record-t.md) — the owner's
  design-time direction is the ratification (born accepted).
- Code: `packages/proof-protocol/src/proof.ts` (`ContractCoverageAxis` + `Verdict.contractCoverage`),
  `packages/orchestrator/src/prove-it-gate.ts` (the GATE-time seam + stamp),
  `packages/orchestrator/src/resolve-prove-spec.ts` (`computeContractCoverage`, the real-mode injection),
  `packages/orchestrator/src/proof/verdict-line.ts` (the reader). Tests: the `*.test.ts` beside each.
