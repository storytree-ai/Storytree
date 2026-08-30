---
id: "judge-result-shape"
tier: capability
story: model-judged-uat
arc: model-uat-promotion
title: "A model-judge result is structured PASS, FAIL, or INCONCLUSIVE"
outcome: "A model-judge result validates as structured PASS, FAIL, or INCONCLUSIVE with per-criterion evidence refs and rationale — and refuses a malformed or self-signing payload."
# RETIRED 2026-08-20 with its parent story (ADR-0247 D5, which names that story on its retirement
# worklist by id). The code is NOT unmounted by this flip — ADR-0247 D5 makes each package retirement
# its own provable unit, and that unit is still open.
status: retired
proof_mode: integration-test
depends_on: []
decisions: [209, 20, 192]
# Node-borne proof config (ADR-0057 / ADR-0192 packages-forward). NET-NEW pair in this story's own
# `@storytree/model-judged-uat` package: AUTHOR_TEST writes judge-result.test.ts importing the missing
# judge-result.ts; IMPLEMENT authors the zod result schema. `install: true` for zod/tsx; typecheck
# closes the tsx type-stripping gap. No DB / SDK.
# PROOF BINDING REMOVED 2026-08-31 — the package it named is gone. `@storytree/model-judged-uat` was DELETED
# by `model-uat-family-consolidation-arc` increment 1 (ADR-0247 D5's first package retirement), so
# the `proof:` block that stood here bound a test file, a source file and a `pnpm --filter` target
# that no longer exist. Leaving it would not have been inert: a dead `--filter` EXITS 0 WITHOUT
# RUNNING, which is a proof command that can only ever report success. `check:verification-decay`'s
# `contract-binding-drift` instrument (ceiling 0) and the `coverage-drain` sweep both red on exactly
# that, and ADR-0252 D3 forbids raising a ceiling to absorb it — of the three sanctioned drains
# (author a test, split/retire, repair the binding), only REPAIR applies here: the code is gone so no
# test can be authored, and this node was already `status: retired`, which by itself cleared nothing
# because no instrument filters on it.
#
# The node is KEPT as a browsable row, per ADR-0247 D2 (a retirement, not a deletion — the tier can
# be brought back). It simply no longer registers a real-build surface. This is the shape
# `stories/studio-build` already holds: retired, body kept as history, binding no file, breaching no
# ceiling. The implementation stays recoverable in git history.
---

# A model-judge result is structured PASS, FAIL, or INCONCLUSIVE

**Outcome —** A model-judge result validates as structured PASS, FAIL, or INCONCLUSIVE with
per-criterion evidence refs and rationale — and refuses a malformed or self-signing payload.

## Guidance

- Author the result schema in the story-owned `packages/model-judged-uat/src/judge-result.ts`.
  Outcomes are exactly `PASS | FAIL | INCONCLUSIVE` (ADR-0209 D3). This is the **judge's**
  structured output — distinct from proof-protocol's binary `Outcome` (`pass`/`fail`) used on
  spine-signed verdicts. Do not silently widen proof-protocol here; mapping PASS→signed pass and
  FAIL→signed fail (with INCONCLUSIVE never becoming a signed green) is the spine/escalation
  concern.
- **Required fields:** criterion id, structured outcome, evidence references, and rationale. Empty
  evidence/rationale on a decisive PASS/FAIL is refused; INCONCLUSIVE still requires a rationale
  explaining why judgment could not conclude.
- **No self-signing fields.** The schema must refuse any payload that attempts to carry a signature,
  `signedBy`, or verdict-seal field the model could mint — the spine alone signs (ADR-0209 D3 /
  ADR-0020).
- Pure zod + helpers. Test-author ≠ code-author (`judge-result.test.ts` → `judge-result.ts`).

## Contracts (3)

1. **`judge-result-three-outcomes-round-trip`** — PASS / FAIL / INCONCLUSIVE each validate
   - **asserts —** well-formed results for all three outcomes parse and round-trip with criterion id,
     evidence refs, and rationale present.
2. **`judge-result-refuses-malformed`** — malformed bodies are refused at the boundary
   - **asserts —** missing criterion id, unknown outcome, empty required evidence/rationale, or
     unknown fields under `.strict()` are refused — never coerced into a fake judgment.
3. **`judge-result-refuses-self-signing`** — the model cannot seal its own green
   - **asserts —** a payload carrying signature / signedBy / verdict-seal style fields is refused at
     the schema boundary (ADR-0209 D3).
