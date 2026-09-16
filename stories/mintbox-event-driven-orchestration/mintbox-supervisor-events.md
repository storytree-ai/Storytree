---
id: "mintbox-supervisor-events"
tier: capability
story: mintbox-event-driven-orchestration
title: "Deterministic Mintbox supervisor events — deduplicated compact Astra wake-ups and reporting"
outcome: "The Mintbox supervisor owns detached handles and turns each meaningful programme event into at most one fresh compact Astra coordinator launch with bounded digest, recovery, and usage reporting."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [561, 505]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/mintbox-event-driven-orchestration", "test"]
  scope:
    testGlobs:
      - "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.test.ts"
      - "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.test.ts"
    sourceGlobs:
      - "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.ts"
      - "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.ts"
  real:
    testFile: "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.test.ts"
    sourceFile: "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.ts"
    scope:
      testGlobs:
        - "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.test.ts"
        - "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.test.ts"
      sourceGlobs:
        - "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.ts"
        - "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.ts"
    install: true
    editsExisting: true
    proofCommand:
      file: bun
      args:
        - test
        - --timeout
        - "300000"
        - packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.test.ts
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/mintbox-event-driven-orchestration", "typecheck"]
---

# Deterministic Mintbox supervisor events — deduplicated compact Astra wake-ups and reporting

**Outcome —** The Mintbox supervisor owns detached handles and turns each meaningful programme event
into at most one fresh compact Astra coordinator launch with bounded digest, recovery, and usage reporting.

## Proof walkthrough first

Feed completion, failure, dependency-release, empty-ready-worker, and owner/attestation events through
an injected durable state/handle seam, including replay of the same event and a supervisor restart.
Observe one coordinator per dedupe key, recovery from the persisted handle state, a digest without raw
logs, and the next compact three-hour report.

## Guidance

This is focused route 3/3. It targets ONLY `mintbox-three-hour-report-carries-delta`; it is a
changed proof input, not a raised acceptance bar.

- In `packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.test.ts`, author
  exactly one NEW static test whose title begins exactly `mintbox-three-hour-report-carries-delta: `.
- Import the public `readCodexRateLimitSnapshot` and `CodexRateLimitSnapshot` type from
  `@storytree/agent`. In the Mintbox-owned test, call that real reader against an injected fake
  app-server process that answers only the JSONL initialise and `account/rateLimits/read` exchange.
  Record its requests and assert that it starts no thread or turn. Do not hand-construct or cast a
  snapshot: each value fed to Mintbox must be the typed `CodexRateLimitSnapshot` returned by the public
  reader.
- Drive two available weekly observations, first 32 and then 37 percent, through the smallest
  story-owned reporting seam on `FileMintboxSupervisorAdapter`. Seed the adapter with the complete
  programme facts plus an observed coordinator handle, then make the latest coordinator's actual
  health/model/effort distinguishable. After the second observation, reopen/recover the adapter and
  assert its persisted compact report carries weekly percent `37`, delta `5`, and that latest
  coordinator health/model/effort—not constants inferred from requested launch flags.
- The SAME test must assert every existing compact field remains present: timestamp, worker health,
  ready/blocked lanes, last outcome, renderer blocker, parallel-session count, and action. Weekly usage
  and its account-wide delta stay report-level facts; assert neither a lane nor worker entry receives
  the delta or any attribution of it.
- Obtain a third reader-produced snapshot whose weekly window is typed `unavailable`. Feed it through
  the same adapter seam and assert the returned and persisted observation remains typed unavailable
  with its reason, does not invent a numeric percentage or delta, and does not advance the last numeric
  baseline from `37`.
- This is mechanically red at current HEAD: `FileMintboxSupervisorAdapter` has no reporting seam and
  consumes no public rate-limit snapshot; `MintboxProgressReport` accepts only a numeric percentage,
  omits the latest coordinator model/effort, and cannot carry typed unavailable usage.

Freeze the signed `mintbox-meaningful-events-wake-once` and
`mintbox-supervisor-owns-handles-not-transcripts` behaviors. Do not add, delete, or edit their tests,
assertions, or implementation in this drive. Do not create or edit the launcher, on-box runtime, or
live-UAT surfaces from later units; the broader scope here exists only for this adapter/reporting seam
and regression coverage.

## Contracts

1. **`mintbox-meaningful-events-wake-once`** — only a deduplicated meaningful event creates a coordinator
   - **asserts —** `packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.ts`
     persists completion, failure, dependency-release, empty-ready-worker, and
     owner/attestation-gate events as exact wake keys before effects, then calls its injected coordinator
     actuator at most once; repeated delivery and restart recovery never request a second live coordinator.
2. **`mintbox-supervisor-owns-handles-not-transcripts`** — liveness survives without conversation history
   - **asserts —** `packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.ts`
     persists detached handles while
     `packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.ts` reduces only bounded
     programme facts and supplies the coordinator actuator with that digest, never raw conversation logs.
3. **`mintbox-three-hour-report-carries-delta`** — the backstop reports compact operational state
   - **asserts —** `packages/mintbox-event-driven-orchestration/src/mintbox-supervisor-adapter.ts`
     consumes the public turn-free rate-limit snapshot from `@storytree/agent`, and
     `packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.ts` records each compact report
     with coordinator/worker health, actual model/effort, lanes, last outcome, renderer blocker,
     ready/blocked 3D lanes, parallel-session count, weekly percentage, delta, and action without
     attributing an account-wide delta to one lane.
