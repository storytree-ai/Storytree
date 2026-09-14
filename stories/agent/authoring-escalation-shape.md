---
id: "authoring-escalation-shape"
tier: contract
story: agent
capability: phase-author-seam
arc: inner-loop-exit-arc
title: "Admit an authoring escalation only through its phase-bound validator"
outcome: "An authoring leaf's escalation is a typed record whose phase and kind come only from the phase that raised it, admitted through one pure validator the agent package publishes."
status: proposed
proof_mode: contract-test
depends_on: []
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/phase-author.test.ts"]
    sourceGlobs:
      - "packages/agent/src/phase-author.ts"
      - "packages/agent/src/index.ts"
  real:
    testFile: "packages/agent/src/phase-author.test.ts"
    sourceFile: "packages/agent/src/phase-author.ts"
    scope:
      testGlobs: ["packages/agent/src/phase-author.test.ts"]
      sourceGlobs:
        - "packages/agent/src/phase-author.ts"
        - "packages/agent/src/index.ts"
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - "test"
        - "--timeout"
        - "300000"
        - "./packages/agent/src/phase-author.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# Admit an authoring escalation only through its phase-bound validator

**Outcome —** An authoring leaf's escalation is a typed record whose phase and kind come only from the
phase that raised it, admitted through one pure validator the agent package publishes.

## Proof walkthrough

Given the package barrel `packages/agent/src/index.ts`, which the test reads as `./index.js`, and no
I/O:

1. call `parseAuthoringEscalation("AUTHOR_TEST", { statement: "  why  " })` and read
   `{ ok: true, escalation: { phase: "AUTHOR_TEST", kind: "untestable-contract", statement: "why" } }`;
   repeat with an input that also carries an `assertion` and read the identical value, with no
   `assertion` key;
2. call `parseAuthoringEscalation("IMPLEMENT", { statement: "why", assertion: "  assert.equal(x, 1)  " })`
   and read `{ ok: true, escalation: { phase: "IMPLEMENT", kind: "unsatisfiable-test", statement: "why", assertion: "assert.equal(x, 1)" } }`;
3. in each phase give a missing, a blank (whitespace-only) and a non-string `statement`, and on
   IMPLEMENT a missing, a blank and a non-string `assertion`; read `{ ok: false, reason }` each time,
   with `reason` naming the offending field. In either phase give `null`, a string and an array as the
   whole input and read `ok: false`;
4. add `phase` and `kind` keys naming the other phase to an otherwise valid input, and read the same
   value step 1 or step 2 read; and
5. construct a failure `AuthorResult` carrying the escalation step 2 returned, with
   `AuthoringEscalation` and `AuthorResult` imported as types through the barrel.

The observable is the validator's return value, compared deep-equal. Types are erased at run time, so
step 5 is observed by the `@storytree/agent` typecheck backstop over the test file, not by the
red→green; the red→green is the validator.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

This contract changes the `PhaseAuthor` seam in `packages/agent/src/phase-author.ts`, and what
`packages/agent/src/index.ts` publishes from it, and nothing else.

- **The type (ADR-0569 D1).** `AuthoringEscalation` is exactly
  `{ phase: "AUTHOR_TEST"; kind: "untestable-contract"; statement: string } | { phase: "IMPLEMENT"; kind: "unsatisfiable-test"; statement: string; assertion: string }`.
  `AuthorResult`'s failure branch becomes
  `{ ok: false; error: string; exhausted?: boolean; escalation?: AuthoringEscalation }`; the success
  branch is unchanged.
- **The validator (ADR-0569 D1).** `parseAuthoringEscalation(phase: AuthoringPhase, input: unknown)`
  returns `{ ok: true; escalation: AuthoringEscalation } | { ok: false; reason: string }`. It is pure:
  no I/O, no clock, and it never throws, whatever the input. `kind` is derived from `phase` and never
  read from the input, and an input's own `phase` key is ignored. `statement` and `assertion` are
  trimmed and must be non-blank strings. An IMPLEMENT escalation without an assertion is refused,
  because a leaf that cannot name the assertion it cannot satisfy has not found an unsatisfiable
  test. An AUTHOR_TEST escalation carries no `assertion`. A present `assertion` is still validated in
  either phase, so a malformed one is refused even on AUTHOR_TEST, where a well-formed one is dropped —
  the leaf's choice at build `real-mu1lbfen`, on the reading that a malformed field is malformed input.
- **The authority, stated where the type is declared (ADR-0569 D2).** The doc comment on
  `AuthoringEscalation` says an escalation can end a walk without a verdict, and can never advance a
  phase, produce a verdict, or enter a verdict's evidence.
- **Publication.** The barrel exports `parseAuthoringEscalation` as a value and `AuthoringEscalation`
  as a type, beside the existing `AuthoringPhase` / `AuthorResult` / `LiveRuntime` / `PhaseAuthor`
  type exports.

The new field is optional, so every existing `PhaseAuthor` compiles and returns exactly what it
returns today: no leaf returns an escalation because of this contract. `packages/agent` still imports
no storytree package.

## Contracts (1)

1. **`escalation-is-admitted-only-through-the-phase-bound-validator`** — an authoring escalation is a typed record whose phase and kind come only from the raising phase, admitted by one published pure validator.
   - **asserts —** AUTHOR_TEST input `{ statement: "  why  " }` yields `{ ok: true, escalation: { phase: "AUTHOR_TEST", kind: "untestable-contract", statement: "why" } }`, with no `assertion` key even when the input carries one; IMPLEMENT input `{ statement: "why", assertion: "  assert.equal(x, 1)  " }` yields `{ ok: true, escalation: { phase: "IMPLEMENT", kind: "unsatisfiable-test", statement: "why", assertion: "assert.equal(x, 1)" } }`; a missing, blank or non-string `statement` in either phase, and a missing, blank or non-string `assertion` on IMPLEMENT, each yield `{ ok: false, reason }` with the reason naming that field; a non-object input (`null`, a string, an array) yields `ok: false`; `phase` or `kind` keys in the input change nothing; the validator is reached through `./index.js`, and a failure `AuthorResult` carrying `escalation?: AuthoringEscalation` typechecks.
   - **covers —** `AuthoringEscalation`, `parseAuthoringEscalation` and the widened `AuthorResult` in `packages/agent/src/phase-author.ts`, and their publication in `packages/agent/src/index.ts`.
   - **proven by —** a new `packages/agent/src/phase-author.test.ts` through the declared focused bun REAL proof; its type half through the `@storytree/agent` typecheck backstop.
