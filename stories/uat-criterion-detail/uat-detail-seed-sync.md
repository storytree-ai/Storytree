---
id: "uat-detail-seed-sync"
tier: capability
story: uat-criterion-detail
arc: model-uat-promotion
title: "Detail artifacts reconcile seed-canonical like the agent tier"
outcome: "The detail kind is seed-canonical: reconcile upserts every seed detail into a target store and deletes target-only details of that kind, touching no other kind, idempotently."
status: proposed
proof_mode: integration-test
depends_on: [uat-detail-kind]
decisions: [209, 55, 192]
# Node-borne proof config (ADR-0057 / ADR-0192). NET-NEW pair: AUTHOR_TEST writes
# detail-seed-sync.test.ts importing the missing detail-seed-sync.ts; IMPLEMENT authors the
# reconcile against storage-protocol Store. Offline InMemoryStore only — no live DB in the leaf.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/uat-criterion", "test"]
  scope:
    testGlobs: ["packages/uat-criterion/src/detail-seed-sync.test.ts"]
    sourceGlobs: ["packages/uat-criterion/src/detail-seed-sync.ts"]
  real:
    testFile: "packages/uat-criterion/src/detail-seed-sync.test.ts"
    sourceFile: "packages/uat-criterion/src/detail-seed-sync.ts"
    scope:
      testGlobs: ["packages/uat-criterion/src/detail-seed-sync.test.ts"]
      sourceGlobs: ["packages/uat-criterion/src/detail-seed-sync.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/uat-criterion", "typecheck"]
---

# Detail artifacts reconcile seed-canonical like the agent tier

**Outcome —** The detail kind is seed-canonical: reconcile upserts every seed detail into a target
store and deletes target-only details of that kind, touching no other kind, idempotently.

## Guidance

- Author `packages/uat-criterion/src/detail-seed-sync.ts` as the ADR-0055-class reconciler for THIS
  kind only — the deliberate extension of the seed-canonical exception beyond agents (ADR-0209 D5).
  Mirror the `reconcileAgents` shape (`packages/library/src/store/sync-agents.ts`): upsert every
  source detail, delete every target detail whose id is absent from source, report
  before/upserted/deleted/after/`inSync`.
- **Kind-fenced:** ONLY docs whose `kind ===` the detail-kind constant are read or written. A
  principle / agent / open-question / any other kind in either store is never touched — the same
  wall ADR-0055 put around agents.
- **Store seam only:** depend on `@storytree/storage-protocol`'s `Store` / `InMemoryStore`. Do NOT
  import `@storytree/library/store` in this leaf — seed loading via `loadCorpus` and the CLI
  `sync-… --pg` command are consumer glue after the port is green (ADR-0192).
- **Idempotent:** a second reconcile against an already-synced target upserts identical content and
  deletes nothing.
- **Diff helper:** export a read-only id-set diff (seed vs live) for the future WARN-only
  `check:…-sync` gate-tail — prove it offline; wiring into `pnpm gate` is CLI consumer glue.
- Offline only in this leaf: tests drive two `InMemoryStore`s. No Cloud SQL, no `--pg`.

## Contracts (3)

1. **`detail-sync-upserts-and-deletes-kind-only`** — reconcile makes the target equal the seed for this kind
   - **asserts —** given a seed with detail ids A,B and a target with detail B,C plus an unrelated
     other-kind doc X: after reconcile, target details are exactly {A,B}, C is deleted, X is
     untouched, and `inSync` is true.
2. **`detail-sync-is-idempotent`** — a second run is a no-op
   - **asserts —** running reconcile twice yields the same after-set, empty deleted on the second
     run, and `inSync` stays true.
3. **`detail-diff-reports-drift-without-writes`** — the read-only diff names missing/extra ids
   - **asserts —** a drifted target reports `missing` / `extra` / `inSync: false` with no writes to
     either store (the check:…-sync posture).
