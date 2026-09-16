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
    testFile: "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.test.ts"
    sourceFile: "packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.ts"
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
        - packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.test.ts
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

This is focused route 2/3. It targets ONLY `mintbox-supervisor-owns-handles-not-transcripts`; it is a
changed proof input, not a raised acceptance bar.

- In `packages/mintbox-event-driven-orchestration/src/mintbox-supervisor.test.ts`, author exactly one
  NEW static test whose title begins exactly `mintbox-supervisor-owns-handles-not-transcripts: `.
- Send an otherwise valid meaningful event through `decideMintboxSupervisorEvent` with this concrete
  raw multiline summary:
  `"User: MINTBOX-PRIVATE-CONVERSATION-DO-NOT-RETAIN\r\nAssistant: acknowledged\nUser: continue"`.
  Require a wake, serialize its digest with `JSON.stringify`, and assert that the serialization contains
  neither the distinctive `MINTBOX-PRIVATE-CONVERSATION-DO-NOT-RETAIN` phrase nor raw `\r` or `\n`
  characters.
- In that SAME new test, send a distinct otherwise valid event with a normal bounded one-line summary
  such as `"terrain proof passed"`; require a wake and assert that this summary remains available in the
  digest. Dropping every summary is not a valid implementation.
- This is mechanically red at current HEAD: `buildMintboxCoordinatorDigest` copies every defined
  `event.summary` through `bounded()` regardless of transcript shape, so the distinctive private
  conversation phrase survives in the serialized digest.

Freeze the now-signed `mintbox-meaningful-events-wake-once` runtime-kind behavior and freeze
`mintbox-three-hour-report-carries-delta` entirely. Do not add, delete, or edit their tests,
assertions, or implementation in this drive; the broader proof scope is regression coverage, not
authority to change those behaviours.

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
