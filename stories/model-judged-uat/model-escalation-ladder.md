---
id: "model-escalation-ladder"
tier: capability
story: model-judged-uat
arc: model-uat-promotion
title: "Model-judge outcomes escalate by capability without laundering FAIL"
outcome: "Structured outcomes route by the locked ladder: FAIL → build; advanced INCONCLUSIVE → frontier; frontier INCONCLUSIVE → human exception; PASS → signable — never laundering FAIL into human green."
# RETIRED 2026-08-20 with its parent story (ADR-0247 D5, which names that story on its retirement
# worklist by id). The code is NOT unmounted by this flip — ADR-0247 D5 makes each package retirement
# its own provable unit, and that unit is still open.
status: retired
proof_mode: integration-test
depends_on: [judge-result-shape]
decisions: [209, 20, 192]
# Node-borne proof config (ADR-0057 / ADR-0192 packages-forward). NET-NEW pair in this story's own
# `@storytree/model-judged-uat` package: AUTHOR_TEST writes escalation.test.ts; IMPLEMENT authors
# escalation.ts. Consumes tier vocabulary from `@storytree/model-uat` as a package dependency.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-judged-uat", "test"]
  scope:
    testGlobs: ["packages/model-judged-uat/src/escalation.test.ts"]
    sourceGlobs: ["packages/model-judged-uat/src/escalation.ts"]
  real:
    testFile: "packages/model-judged-uat/src/escalation.test.ts"
    sourceFile: "packages/model-judged-uat/src/escalation.ts"
    scope:
      testGlobs: ["packages/model-judged-uat/src/escalation.test.ts"]
      sourceGlobs: ["packages/model-judged-uat/src/escalation.ts"]
    install: true
    editsExisting: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-judged-uat", "typecheck"]
---

# Model-judge outcomes escalate by capability without laundering FAIL

**Outcome —** Structured outcomes route by the locked ladder: FAIL → build; advanced INCONCLUSIVE →
frontier; frontier INCONCLUSIVE → human exception; PASS → signable — never laundering FAIL into
human green.

## Guidance

- Author the classifier in `packages/model-judged-uat/src/escalation.ts`. Inputs: structured
  outcome, the criterion's required tier (`advanced`/`frontier`), and whether a stronger frontier
  judge is available. Output: a typed next action ∈ {`sign`, `build`, `escalate-frontier`,
  `escalate-human`} (names may settle at build — keep the four routes distinct) (ADR-0209 D4).
- **Locked ladder — do not reopen:**
  - PASS → `sign` (spine may sign the validated payload).
  - FAIL → `build` (implementation or rubric repair). **Never** `escalate-human`.
  - advanced INCONCLUSIVE → `escalate-frontier` when a frontier judge is available; otherwise HOLD
    honestly (unavailable tier holds — do not downgrade or invent a human path).
  - frontier INCONCLUSIVE → `escalate-human` (exceptional only).
- **FAIL laundering is a hard refuse.** Any attempt to map FAIL → human green / exceptional human
  must be rejected by the classifier, not warned.
- Human-declared criteria never enter this ladder (they go straight to operator attestation) —
  out of scope here; callers only invoke this for `model` witness results.
- Test-author ≠ code-author (`escalation.test.ts` → `escalation.ts`).

## Contracts (3)

1. **`escalation-routes-pass-fail-inconclusive`** — the four honest routes
   - **asserts —** PASS→sign; FAIL→build; advanced INCONCLUSIVE→escalate-frontier (frontier
     available); frontier INCONCLUSIVE→escalate-human (ADR-0209 D4).
2. **`escalation-unavailable-frontier-holds`** — no silent downgrade
   - **asserts —** advanced INCONCLUSIVE with no available frontier judge HOLDS (or equivalent
     typed hold) — not downgraded to advanced retry forever, not relabelled human (ADR-0209 D2/D4).
3. **`escalation-refuses-fail-to-human`** — FAIL cannot be laundered
   - **asserts —** FAIL never yields `escalate-human` or a signable human-green path; explicit
     override attempts are refused (ADR-0209 D4).
