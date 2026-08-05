---
id: "arc-explicit-id-fidelity"
tier: capability
story: library
title: "Explicit arc ids are never silently shortened"
outcome: "An agent scaffolding an arc with an explicit id receives a refusal instead of creating an arc under a silently truncated id."
status: proposed
proof_mode: integration-test
depends_on: [library-cli]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/cli.test.ts"]
    sourceGlobs: ["packages/cli/src/arc.ts"]
  real:
    testFile: "packages/cli/src/cli.test.ts"
    sourceFile: "packages/cli/src/arc.ts"
    editsExisting: true
    scope:
      testGlobs: ["packages/cli/src/cli.test.ts"]
      sourceGlobs: ["packages/cli/src/arc.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/cli", "test"]
---

# Explicit arc ids are never silently shortened

**Outcome —** An agent scaffolding an arc with an explicit id receives a refusal instead of creating
an arc under a silently truncated id.

**Depends on —** [`library-cli`](library-cli.md)

## Guidance

`arc new <id>` treats the explicit id as authored. It normalises that value first, then refuses it
before any store read or write when the normalised result exceeds the 60-character id cap. A
normalised explicit id of exactly 60 characters remains accepted, and an id derived from `--title`
retains its existing capped derivation.

The behavioural red at HEAD is a 61-character normalised explicit id: the shared slug helper cuts it
to 60 characters and lets creation continue under a different id. Add the regression to the
canonical coverage surface, `packages/cli/src/cli.test.ts`. Prove zero store interaction before any
verification read, or make verification reads bypass the spy; test-owned probes must never
contaminate the call ledger whose emptiness proves the refusal happened pre-store.

## Integration test

**Goal —** Drive the real `arcNew` path with an explicit id whose normalised value exceeds the cap and
witness a refusal before store interaction, while pinning the exactly-60 boundary, normalisation
before length checking, and the retained cap for title-derived ids.

## Contracts (1)

1. **`arc-explicit-id-refuses-lossy-cap`** — `arc new` refuses an explicitly authored id that normalises beyond the 60-character cap rather than creating an arc under a truncated id
   - **asserts —** The explicit id is normalised before its length is checked; a normalised value over 60 characters returns `ok:false` before any store read or write, a value of exactly 60 remains accepted, and title-derived ids retain their existing capped derivation. Zero interaction is asserted before any verification read, or verification bypasses the spy; test-owned probes must not enter the call ledger.
   - **covers —** `packages/cli/src/arc.ts` (`arcNew`, explicit-id selection before store access)
   - **would-be test —** Add the regression to `packages/cli/src/cli.test.ts`; at HEAD the shared slug helper truncates an overlength explicit id and creation proceeds under that altered id.
