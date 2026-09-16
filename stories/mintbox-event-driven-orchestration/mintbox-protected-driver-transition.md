---
id: "mintbox-protected-driver-transition"
tier: capability
story: mintbox-event-driven-orchestration
title: "Protected rendering-driver transition — observe first, adopt only after green release"
outcome: "The active rendering-engine proof remains untouched until its own green increment boundary releases its claim and terminal event, after which a fresh coordinator may adopt the newly eligible work."
status: proposed
proof_mode: integration-test
depends_on: [mintbox-supervisor-events]
decisions: [561, 505]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/mintbox-supervisor-adapter.test.ts"]
    sourceGlobs: ["packages/agent/src/mintbox-supervisor-adapter.ts"]
  real:
    testFile: "packages/agent/src/mintbox-supervisor-adapter.test.ts"
    sourceFile: "packages/agent/src/mintbox-supervisor-adapter.ts"
    scope:
      testGlobs: ["packages/agent/src/mintbox-supervisor-adapter.test.ts"]
      sourceGlobs: ["packages/agent/src/mintbox-supervisor-adapter.ts"]
    install: true
    editsExisting: true
    cluster:
      - mintbox-active-proof-is-observe-only
      - mintbox-green-release-is-the-adoption-boundary
    proofCommand:
      file: bun
      args: ["test", "--timeout", "300000", "packages/agent/src/mintbox-supervisor-adapter.test.ts"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# Protected rendering-driver transition — observe first, adopt only after green release

**Outcome —** The active rendering-engine proof remains untouched until its own green increment
boundary releases its claim and terminal event, after which a fresh coordinator may adopt the newly
eligible work.

## Proof walkthrough first

Start with the protected renderer handle and claim live. Run the supervisor's observation/recovery
pass and verify neither the handle nor claim is changed. Then deliver the proof's terminal green event
and released claim, and verify one fresh coordinator sees the lane as eligible.

## Contracts

1. **`mintbox-active-proof-is-observe-only`** — architecture transition never interrupts proof
   - **asserts —** `packages/agent/src/mintbox-supervisor-adapter.ts` may probe the protected renderer
     handle before a terminal-green event and released claim, but cannot stop, restart, re-claim, migrate,
     or replace it.
2. **`mintbox-green-release-is-the-adoption-boundary`** — eligibility follows the proof's own boundary
   - **asserts —** `packages/agent/src/mintbox-supervisor-adapter.ts` makes work eligible only after both
     a matching terminal-green event and released-claim evidence from the real
     `packages/notice-board/src/store/claim-store.ts` boundary; failure remains an event for coordinator
     judgment, not permission to retrofit it.
