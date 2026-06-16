---
id: "boundhash-on-verdict"
tier: contract
story: binding-staleness
title: "A verdict records the content-hash of the code it proved"
outcome: "The signed Verdict carries an optional boundHash — the ADR-0016 content-hash (hashSpan) of the proved span at sign time — so a verdict KNOWS what code it proved and drift can be computed against it later; absent on verdicts predating ADR-0016 (back-compat)."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [16]
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the node
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (ADR-0057 §3 expansion C): the
# leaf authors a regression test that FAILS against current behaviour, then edits the EXISTING
# packages/core/src/proof.ts. The red is genuine and runtime: the `Verdict` schema is `.strict()`, so
# `Verdict.parse({ ...validVerdict, boundHash: "…" })` THROWS at HEAD (unrecognized key) until IMPLEMENT
# adds the optional field. `install: true` + a typecheck wall because proof.ts imports `zod` (the proof
# runs in a fresh worktree — tsx + tsc need the lockfile-only install, ADR-0031 §2); single source file,
# so the default node:test proof on the one test file is legal (no proofCommand needed).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/core", "test"]
  scope:
    testGlobs: ["packages/core/src/**/*.test.ts"]
    sourceGlobs: ["packages/core/src/**/*.ts"]
  real:
    testFile: "packages/core/src/boundhash-verdict.test.ts"
    sourceFile: "packages/core/src/proof.ts"
    scope:
      testGlobs: ["packages/core/src/boundhash-verdict.test.ts"]
      sourceGlobs: ["packages/core/src/proof.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/core", "typecheck"]
    editsExisting: true
---

# A verdict records the content-hash of the code it proved

**Outcome —** The signed `Verdict` carries an optional `boundHash` — the ADR-0016 content-hash
(`hashSpan`) of the proved span at sign time — so a verdict **knows what code it proved** and drift can
be computed against it later; absent on verdicts predating ADR-0016 (back-compat).

> **The gap this closes (ADR-0016).** A `Verdict` (`packages/core/src/proof.ts`) records the outcome,
> the commit, the signer and the run — but NOT *which code* it proved. Without that, a verdict can never
> answer "is the code I proved still the code on disk?" — the whole point of the binding/staleness model.
> ADR-0016's anchor keeps IDENTITY (what) separate from VERSION (when); `boundHash` is the verdict's slot
> for the VERSION half: the `hashSpan` of the proved span at sign time, THE drift anchor. This unit adds
> the field; [`gate-emits-change`](gate-emits-change.md) stamps it during the proof.

## Guidance

ONE additive field on the existing `Verdict` zod schema in `packages/core/src/proof.ts`. The `Verdict`
object is `.strict()`, so add the field INSIDE the `z.object({ … })` — anywhere among the existing keys
(e.g. right after `runId`):

```ts
/**
 * ADR-0016 binding anchor: the content-hash (hashSpan) of the proved span at sign time — what lets a
 * verdict know WHICH code it proved, so drift is computable later. OPTIONAL for back-compat: verdicts
 * predating ADR-0016 (and every current caller until gate-emits-change wires it) carry none.
 */
boundHash: z.string().optional(),
```

That is the entire source change. Rules:

- **Keep it `.optional()`** — NEVER required. Existing `Verdict` construction (the gate at
  `packages/orchestrator/src/prove-it-gate.ts`, every test, every persisted verdict) supplies no
  `boundHash`; a required field would break all of them. Under `exactOptionalPropertyTypes` the inferred
  type is `boundHash?: string`, and omitting the key is valid.
- **Keep `.strict()`** on the object — do not relax it. (Strict is exactly what makes the red real.)
- Touch nothing else in `proof.ts` (not `SigningRow`, not the predicates). One field, that's all.

**The red the spine observes (before IMPLEMENT):** the regression test parses a verdict that carries a
`boundHash`. At HEAD the `.strict()` schema rejects the unknown key, so `Verdict.parse({...})` THROWS —
a genuine runtime red against current behaviour. After the field is added, the same parse succeeds.

A valid `Verdict` fixture to build the test on (every required field; copy it verbatim):

```ts
const base = {
  unitId: "u1",
  proofMode: "contract" as const,
  outcome: "pass" as const,
  commitSha: "abc1234",
  signer: "tester@example.com",
  runId: "run-1",
  evidence: [],
  at: "2026-06-16T00:00:00.000Z",
};
```

## Contract

1. **`verdict-records-the-bound-hash`** — the signed `Verdict` can carry, and round-trips, the
   content-hash of the proved span; the field is optional (a verdict without it still parses).
   - **asserts —**
     - `Verdict.parse({ ...base, boundHash: "deadbeefdeadbeefdeadbeefdeadbeef" })` SUCCEEDS and the
       parsed result's `boundHash` equals `"deadbeefdeadbeefdeadbeefdeadbeef"`;
     - `Verdict.parse(base)` (no `boundHash` key) SUCCEEDS and the parsed result's `boundHash` is
       `undefined` (back-compat — a verdict predating ADR-0016 still parses);
     - the schema stays `.strict()`: parsing `{ ...base, bogusKey: 1 }` still THROWS (an unrelated
       unknown key is still rejected — the field added is exactly `boundHash`, not a relaxation).
   - **proven by —** `packages/core/src/boundhash-verdict.test.ts` (authored by the leaf inside the
     gate's AUTHOR_TEST phase; the spine observes the red — the `.strict()` rejection of the `boundHash`
     key on the unedited schema — before IMPLEMENT adds the optional field).
