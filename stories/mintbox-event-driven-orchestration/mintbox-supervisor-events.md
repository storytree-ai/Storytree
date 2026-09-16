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
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs:
      - "packages/agent/src/mintbox-supervisor.test.ts"
      - "packages/agent/src/mintbox-supervisor-adapter.test.ts"
      - "packages/agent/src/codex-rate-limits.test.ts"
    sourceGlobs:
      - "packages/agent/src/mintbox-supervisor.ts"
      - "packages/agent/src/mintbox-supervisor-adapter.ts"
      - "packages/agent/src/codex-rate-limits.ts"
  real:
    testFile: "packages/agent/src/mintbox-supervisor.test.ts"
    sourceFile: "packages/agent/src/mintbox-supervisor.ts"
    scope:
      testGlobs:
        - "packages/agent/src/mintbox-supervisor.test.ts"
        - "packages/agent/src/mintbox-supervisor-adapter.test.ts"
        - "packages/agent/src/codex-rate-limits.test.ts"
      sourceGlobs:
        - "packages/agent/src/mintbox-supervisor.ts"
        - "packages/agent/src/mintbox-supervisor-adapter.ts"
        - "packages/agent/src/codex-rate-limits.ts"
    install: true
    editsExisting: true
    cluster:
      - mintbox-meaningful-events-wake-once
      - mintbox-supervisor-owns-handles-not-transcripts
      - mintbox-three-hour-report-carries-delta
    proofCommand:
      file: bun
      args: ["test", "--timeout", "300000", "packages/agent/src/mintbox-supervisor.test.ts"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# Deterministic Mintbox supervisor events — deduplicated compact Astra wake-ups and reporting

**Outcome —** The Mintbox supervisor owns detached handles and turns each meaningful programme event
into at most one fresh compact Astra coordinator launch with bounded digest, recovery, and usage reporting.

## Proof walkthrough first

Feed completion, failure, dependency-release, empty-ready-worker, and owner/attestation events through
an injected durable state/handle seam, including replay of the same event and a supervisor restart.
Observe one coordinator per dedupe key, recovery from the persisted handle state, a digest without raw
logs, and the next compact three-hour report.

## Contracts

1. **`mintbox-meaningful-events-wake-once`** — only a deduplicated meaningful event creates a coordinator
   - **asserts —** `packages/agent/src/mintbox-supervisor-adapter.ts` persists completion, failure,
     dependency-release, empty-ready-worker, and owner/attestation-gate events as exact wake keys before
     effects, then calls its injected coordinator actuator at most once; repeated delivery and restart
     recovery never request a second live coordinator.
2. **`mintbox-supervisor-owns-handles-not-transcripts`** — liveness survives without conversation history
   - **asserts —** `packages/agent/src/mintbox-supervisor-adapter.ts` persists detached handles while
     `packages/agent/src/mintbox-supervisor.ts` reduces only bounded programme facts and supplies the
     coordinator actuator with that digest, never raw conversation logs.
3. **`mintbox-three-hour-report-carries-delta`** — the backstop reports compact operational state
   - **asserts —** `packages/agent/src/codex-rate-limits.ts` reads the turn-free account snapshot and
     `packages/agent/src/mintbox-supervisor.ts` records each compact report with coordinator/worker
     health, actual model/effort, lanes, last outcome, renderer blocker, ready/blocked 3D lanes,
     parallel-session count, weekly percentage, delta, and action without attributing an account-wide
     delta to one lane.
