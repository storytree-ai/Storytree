---
id: "independent-judge-seam"
tier: capability
story: model-judged-uat
arc: model-uat-promotion
title: "The model judge runs as an independent fresh read-only seam"
outcome: "A judge port runs separately from the builder as a fresh read-only call that returns only a structured result; a scripted impl proves the seam offline with no write surface."
status: proposed
proof_mode: integration-test
depends_on: [judge-result-shape]
decisions: [209, 20, 192]
# Node-borne proof config (ADR-0057 / ADR-0192 packages-forward). NET-NEW pair in this story's own
# `@storytree/model-judged-uat` package: AUTHOR_TEST writes judge-seam.test.ts; IMPLEMENT authors
# judge-seam.ts (port + ScriptedJudge). Live Fable/Claude Agent SDK adapter is consumer glue after
# the port is green — not a proof-bound sourceFile here.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/model-judged-uat", "test"]
  scope:
    testGlobs: ["packages/model-judged-uat/src/judge-seam.test.ts"]
    sourceGlobs: ["packages/model-judged-uat/src/judge-seam.ts"]
  real:
    testFile: "packages/model-judged-uat/src/judge-seam.test.ts"
    sourceFile: "packages/model-judged-uat/src/judge-seam.ts"
    scope:
      testGlobs: ["packages/model-judged-uat/src/judge-seam.test.ts"]
      sourceGlobs: ["packages/model-judged-uat/src/judge-seam.ts"]
    install: true
    editsExisting: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/model-judged-uat", "typecheck"]
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
