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
