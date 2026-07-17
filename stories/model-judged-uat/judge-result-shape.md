---
id: "judge-result-shape"
tier: capability
story: model-judged-uat
arc: model-uat-promotion
title: "A model-judge result is structured PASS, FAIL, or INCONCLUSIVE"
outcome: "A model-judge result validates as structured PASS, FAIL, or INCONCLUSIVE with per-criterion evidence refs and rationale — and refuses a malformed or self-signing payload."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [209, 20, 192]
# Node-borne proof config (ADR-0057 / ADR-0192 packages-forward). NET-NEW pair in this story's own
# `@storytree/model-judged-uat` package: AUTHOR_TEST writes judge-result.test.ts importing the missing
# judge-result.ts; IMPLEMENT authors the zod result schema. `install: true` for zod/tsx; typecheck
# closes the tsx type-stripping gap. No DB / SDK.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-judged-uat", "test"]
  scope:
    testGlobs: ["packages/model-judged-uat/src/judge-result.test.ts"]
    sourceGlobs: ["packages/model-judged-uat/src/judge-result.ts"]
  real:
    testFile: "packages/model-judged-uat/src/judge-result.test.ts"
    sourceFile: "packages/model-judged-uat/src/judge-result.ts"
    scope:
      testGlobs: ["packages/model-judged-uat/src/judge-result.test.ts"]
      sourceGlobs: ["packages/model-judged-uat/src/judge-result.ts"]
    install: true
    editsExisting: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-judged-uat", "typecheck"]
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
