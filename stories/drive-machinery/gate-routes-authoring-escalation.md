---
id: "gate-routes-authoring-escalation"
tier: contract
story: drive-machinery
capability: prove-it-gate
arc: inner-loop-exit-arc
title: "Route an authoring escalation: end the walk, or let observation overrule it"
outcome: "An authoring escalation ends a walk without a verdict, or is overruled by the spine's own green observation, and never becomes or enters a verdict."
status: proposed
proof_mode: contract-test
depends_on: [confirm-refusal-observation]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/orchestrator", "test"]
  scope:
    testGlobs: ["packages/orchestrator/src/prove-it-gate.escalation.test.ts"]
    sourceGlobs:
      - "packages/orchestrator/src/prove-it-gate.ts"
      - "packages/orchestrator/src/index.ts"
  real:
    testFile: "packages/orchestrator/src/prove-it-gate.escalation.test.ts"
    sourceFile: "packages/orchestrator/src/prove-it-gate.ts"
    scope:
      testGlobs: ["packages/orchestrator/src/prove-it-gate.escalation.test.ts"]
      sourceGlobs:
        - "packages/orchestrator/src/prove-it-gate.ts"
        - "packages/orchestrator/src/index.ts"
    install: true
    editsExisting: true
    proofCommand:
      file: node
      args:
        - "--import"
        - "./scripts/tsx-cache-off.mjs"
        - "--import"
        - "./packages/orchestrator/node_modules/tsx/dist/loader.mjs"
        - "--test"
        - "packages/orchestrator/src/prove-it-gate.escalation.test.ts"
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/orchestrator", "typecheck"]
---

# Route an authoring escalation: end the walk, or let observation overrule it

**Outcome —** An authoring escalation ends a walk without a verdict, or is overruled by the spine's
own green observation, and never becomes or enters a verdict.

## Build order

This contract consumes `AuthoringEscalation` and the widened `AuthorResult` that contract
[`authoring-escalation-shape`](../agent/authoring-escalation-shape.md) adds to the `PhaseAuthor` seam in
story `agent`, so that contract lands first.

That edge is recorded here, not in `depends_on`, because a node's `depends_on` does not cross a story.
ADR-0010 §3 keeps the capability graph inside its story and puts every cross-story edge at the story
tier, where this one is already declared once as `drive-machinery` → `agent`. `story build`'s
topological order refuses a capability edge that leaves its story's capability set, and no capability
or contract in `stories/**` carries a cross-story `depends_on`. Inside this story the contract depends
on [`confirm-refusal-observation`](confirm-refusal-observation.md), whose `failedObservation` path the
IMPLEMENT branch reuses unchanged.

## Proof walkthrough

Given a real `ShellTestExecutor` whose ordinary child commands each append one marker to a temporary
file (the orchestrator's `nodeEvalExecutor` builds such children; never a `RecordingTestExecutor`), an
inline scripted `PhaseAuthor` whose two slices return fixed results, a recording `onPhase`, and a
recording signing store:

1. **AUTHOR_TEST escalation.** The AUTHOR_TEST slice returns `{ ok: false, error, escalation }` with an
   AUTHOR_TEST escalation. Read one marker; no IMPLEMENT request; `onPhase` called with `AUTHOR_TEST`
   only; no signing row; and a result with `failedAt: "AUTHOR_TEST"`,
   `phasesVisited: ["AUTHOR_TEST"]`, `escalation` deep-equal to
   `{ raised: <the returned escalation>, testId: <spec.testId>, observation: <that child's exact stdout, stderr and exitCode> }`,
   no `failedObservation`, and a `reason` containing the escalation's `kind`. Read the same shape once
   with a child that exits red and once with a child that exits green.
2. **IMPLEMENT escalation, still red.** AUTHOR_TEST succeeds over a red child; the IMPLEMENT slice
   returns an IMPLEMENT escalation and the child stays red. Read `CONFIRM_GREEN` among the visited
   phases, two markers, no signing row, `failedAt: "CONFIRM_GREEN"`, `failedObservation` equal to the
   second child's exact output, and `escalation` deep-equal to `{ raised, testId }` with no
   `observation` key.
3. **IMPLEMENT escalation, overruled.** The child exits red at CONFIRM_RED and green at CONFIRM_GREEN
   (for example it checks for a file the scripted IMPLEMENT slice writes), and the IMPLEMENT slice
   returns an IMPLEMENT escalation. Read exactly one signing row, `ok: true`, `overruledEscalation`
   deep-equal to `{ raised, testId }`, no `escalation`, and a verdict deep-equal to the verdict of the
   identical walk whose IMPLEMENT slice returns `{ ok: true }` (same `now`, `runId`, signer inputs and
   tree). With a dirty tree instead, read `failedAt: "GATE"` carrying `overruledEscalation`, with no
   `escalation`, no `failedObservation` and no signing row.
4. **Phase mismatch.** An IMPLEMENT escalation returned from the AUTHOR_TEST slice fails closed at
   AUTHOR_TEST with no marker; an AUTHOR_TEST escalation returned from the IMPLEMENT slice fails closed
   at IMPLEMENT with only the CONFIRM_RED marker. Neither result carries `escalation` or
   `overruledEscalation`, and neither writes a signing row.
5. **Exhausted and escalating.** A slice returning `exhausted: true` together with an escalation is
   routed as that escalation: at AUTHOR_TEST it reads as step 1 and never reaches CONFIRM_RED; at
   IMPLEMENT it carries the record step 2 or step 3 carries.
6. **Regression.** A plain AUTHOR_TEST error still fails at AUTHOR_TEST with no marker, and a plain
   IMPLEMENT error still fails at IMPLEMENT with only the CONFIRM_RED marker; neither carries an
   escalation key. An exhausted slice without an escalation still falls through to its CONFIRM
   observation.

What a standing IMPLEMENT escalation's `reason` and a mismatch `reason` say is contract
[`confirm-green-refusal-names-standing-escalation`](confirm-green-refusal-names-standing-escalation.md)'s
to prove: this contract's signed proof (run `real-mu1lv3wm`) matched only the CONFIRM_GREEN wording
in the first and asserted nothing about the second.

**Declared gap at landing (ADR-0563 D3 — no mutation rung reaches `packages/orchestrator`).** The
signed proof did not use the setup this walkthrough names. `prove-it-gate.escalation.test.ts` drives
`proveUnit` with `RecordingTestExecutor` observations and a `FakeAuthor`, not `ShellTestExecutor`
children. It therefore reads a call record rather than child-written markers, and it never exercises:
`failedObservation` on an escalation path, step 1's red child, the absence of an IMPLEMENT request,
step 5, an AUTHOR_TEST escalation returned from the IMPLEMENT slice, step 3's verdict deep-equality,
or step 6. The routing those clauses describe was confirmed present in the landed `prove-it-gate.ts`
by reading the code — a check that the behaviour exists, not a judgement of the test. Contract
`confirm-green-refusal-names-standing-escalation` (signed PASS, run `real-mu1njft0`) drives the
standing-IMPLEMENT and AUTHOR_TEST escalation walks over real `ShellTestExecutor` children, which
covers part of that gap.

The observable is the discriminated `ProveResult`, the child-written marker count, the `onPhase`
record and the signing store. Resolver command calls do not prove a spawn count: production may
resolve once and spawn twice.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file —
`## Proof walkthrough` and the full assertion under `## Contracts (1)` — before writing. The
contract-id briefing in the phase prompt is an index, never a substitute for that reading.

`proveUnit` in `packages/orchestrator/src/prove-it-gate.ts` owns the routing, and
`packages/orchestrator/src/index.ts` exports the new type beside `ProveResult`. These names are fixed,
because contract `node-build-escalation-envelope` reads them:

- `export type EscalationRecord = { raised: AuthoringEscalation; testId: string; observation?: TestObservation["originalProcessResult"] }`;
- the failure variant of `ProveResult` gains `escalation?: EscalationRecord` and
  `overruledEscalation?: EscalationRecord`, and the pass variant gains
  `overruledEscalation?: EscalationRecord`.

An absent key stays absent, never `undefined`, as `failedObservation` already does, so every result
without an escalation is unchanged.

- **Fail-closed authority only (ADR-0569 D2).** An escalation can end a walk without a verdict. It
  never advances a phase, produces a verdict, withholds a signature the observations earn, or enters
  `verdict.evidence`, which stays exactly the two CONFIRM observations.
- **IMPLEMENT cannot veto an observation (ADR-0569 D3).** The spine visits CONFIRM_GREEN and observes
  exactly as it would without the escalation. On red, PR #1910's `failedObservation` path runs
  unchanged and the record rides beside it; the failure output is not copied onto the record. On
  green the escalation is overruled: the walk proceeds to GATE and signs exactly as it would have,
  and the result — the pass, or a later GATE refusal — records `overruledEscalation`.
- **AUTHOR_TEST ends the walk after one observation that gates nothing (ADR-0569 D4).** When the
  AUTHOR_TEST slice escalates, the spine runs `spec.testExecutor.run(spec.testId)` once and returns a
  failure at AUTHOR_TEST. That run is not CONFIRM_RED: it calls no `onPhase`, is not pushed onto
  `phasesVisited`, does not pass through `nextPhase`, and advances nothing whatever it observes. Its
  `originalProcessResult` becomes the record's `observation`, never `failedObservation`; an executor
  that supplies no process result leaves `observation` absent.
- **A mismatched phase is malformed (ADR-0569 D1).** An escalation whose `phase` is not the phase of
  the slice that returned it fails closed at that slice's phase, with no record of either kind.
- **The spine stamps the test id.** A record's `testId` is `spec.testId`, never a value read from the
  leaf.
- **The gate trusts only the type.** `@storytree/agent` stays a type-only import: the gate never
  constructs a leaf and does not call the agent's validator. It checks only that the escalation's
  phase matches the slice.

Unchanged: a slice with no escalation (a success, a plain error, or exhaustion's fall-through), the
GATE refusals and their order, the signing append, and `toEvidence`.

## Contracts (1)

1. **`escalation-ends-the-walk-or-is-overruled-by-observation`** — an authoring escalation ends a walk without a verdict or is overruled by the spine's green observation, and never becomes a verdict.
   - **asserts —** an AUTHOR_TEST escalation spawns the declared test exactly once, never requests IMPLEMENT, calls `onPhase` for AUTHOR_TEST only, writes no signing row, and returns `failedAt: "AUTHOR_TEST"` with `phasesVisited: ["AUTHOR_TEST"]`, `escalation: { raised, testId, observation }` carrying that child's exact stdout/stderr/exitCode, no `failedObservation`, and a reason containing the kind — whether that run is red or green. An IMPLEMENT escalation still visits CONFIRM_GREEN: still red, it spawns twice, signs nothing, and returns `failedAt: "CONFIRM_GREEN"` with `failedObservation` equal to the second child's output and `escalation: { raised, testId }` with no `observation`; turned green, it signs exactly one verdict deep-equal to the unescalated walk's and returns `overruledEscalation: { raised, testId }` with no `escalation`, and a dirty-tree GATE refusal after the overrule carries `overruledEscalation` with no `escalation` or `failedObservation`. An escalation returned from the other phase's slice fails closed at that slice with no further spawn and no record of either kind. `exhausted: true` with an escalation routes as the escalation. A plain authoring error, and exhaustion without an escalation, behave as before, with no escalation keys and no extra spawn.
   - **covers —** `proveUnit`'s escalation routing and the `ProveResult` / `EscalationRecord` types in `packages/orchestrator/src/prove-it-gate.ts`, and the `EscalationRecord` export in `packages/orchestrator/src/index.ts`.
   - **proven by —** a new `packages/orchestrator/src/prove-it-gate.escalation.test.ts` over ordinary `ShellTestExecutor` child commands, through the declared focused REAL proof; the full orchestrator package suite and typecheck remain pre-signature backstops.
