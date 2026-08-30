---
id: "independent-judge-seam"
tier: capability
story: model-judged-uat
arc: model-uat-promotion
title: "The model judge runs as an independent fresh read-only seam"
outcome: "A judge port runs separately from the builder as a fresh read-only call that returns only a structured result; a scripted impl proves the seam offline with no write surface."
# RETIRED 2026-08-20 with its parent story (ADR-0247 D5, which names that story on its retirement
# worklist by id). The code is NOT unmounted by this flip — ADR-0247 D5 makes each package retirement
# its own provable unit, and that unit is still open.
status: retired
proof_mode: integration-test
depends_on: [judge-result-shape]
decisions: [209, 20, 192]
# Node-borne proof config (ADR-0057 / ADR-0192 packages-forward). NET-NEW pair in this story's own
# `@storytree/model-judged-uat` package: AUTHOR_TEST writes judge-seam.test.ts; IMPLEMENT authors
# judge-seam.ts (port + ScriptedJudge). Live Fable/Claude Agent SDK adapter is consumer glue after
# the port is green — not a proof-bound sourceFile here.
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

# The model judge runs as an independent fresh read-only seam

**Outcome —** A judge port runs separately from the builder as a fresh read-only call that returns
only a structured result; a scripted impl proves the seam offline with no write surface.

## Guidance

- Author the judge port in `packages/model-judged-uat/src/judge-seam.ts`. The port accepts a
  criterion + detail context (ids, one-liner, detail body/hash, required tier) and a registered
  judge identity, and returns only a `judge-result-shape` structured result (ADR-0209 D3).
- **Independence:** the seam is a separate call from the builder — no shared mutable builder
  transcript, no write tools, no path to edit the repo or Library. Prove this with a `ScriptedJudge`
  that returns canned structured results and whose type/API surface has no write methods.
- **Fresh context:** each `judge(...)` invocation takes the full context as arguments; the scripted
  impl must not retain prior-call builder state that would let a second judgment see the builder's
  scratchpad. Independence is an observable seam contract, not a comment.
- **Live Fable is out of band for this leaf.** The Claude Agent SDK frontier adapter plugs in behind
  this port later as consumer glue; leaf proofs stay offline and machine-witnessed.
- Test-author ≠ code-author (`judge-seam.test.ts` → `judge-seam.ts`).

## Contracts (3)

1. **`judge-seam-returns-structured-result-only`** — the port's return type is the result schema
   - **asserts —** a ScriptedJudge given a criterion+detail context returns a parsed
     PASS/FAIL/INCONCLUSIVE result; it does not return a signed verdict or free-form prose blob.
2. **`judge-seam-has-no-write-surface`** — read-only by construction
   - **asserts —** the judge port / ScriptedJudge API exposes no write/edit/delete/tool-exec method;
     attempts to pass a write capability into the seam are a type/construction error or explicit
     refuse (ADR-0209 D3).
3. **`judge-seam-fresh-context-per-call`** — calls do not share builder scratch state
   - **asserts —** two sequential `judge` calls with distinct contexts each see only the context
     arguments for that call; the scripted impl does not leak prior-call scratch into the second
     result.
