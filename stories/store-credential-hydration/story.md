---
id: "store-credential-hydration"
tier: story
title: "Every direct live-store dial hydrates its database credential at createPool"
outcome: "Every direct live-store dial resolves STORYTREE_DB_USER at the shared createPool choke point before constructing a connector or pool."
status: proposed
proof_mode: UAT
uat_witness: machine
arc: diagnosis-honesty-arc
# The capability is hosted in the library's node-only store subpath: every current direct-Postgres
# caller already consumes createPool through that declared boundary.
depends_on: [library]
artifact_edges: [library]
capabilities: [hydrated-store-dialing-root]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/library", "test"]
  scope:
    testGlobs: ["packages/library/src/store/connection.test.ts"]
    sourceGlobs: ["packages/library/src/store/connection.ts", "packages/library/src/store/db-credential.ts"]
  real:
    testFile: "packages/library/src/store/connection.test.ts"
    sourceFile: "packages/library/src/store/connection.ts"
    scope:
      testGlobs: ["packages/library/src/store/connection.test.ts"]
      sourceGlobs: ["packages/library/src/store/connection.ts", "packages/library/src/store/db-credential.ts"]
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/library", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/library", "typecheck"]
---

# Every direct live-store dial hydrates its database credential at createPool

**Outcome —** Every direct live-store dial resolves `STORYTREE_DB_USER` at the shared `createPool`
choke point before constructing a connector or pool.

## The journey

The consumer is any storytree process about to dial the live Postgres store. The CLI, studio server
in development and hosted modes, desktop backend, build drivers, checks, migrations, and notice-board
ingest already converge on `@storytree/library/store`'s `createPool`. That existing boundary must give
each caller the same result: a real environment value wins; an absent or blank value is hydrated from
the canonical user secrets file; and a truly missing value is refused while the process can still
name `STORYTREE_DB_USER`, before Cloud SQL machinery can turn it into a database symptom.

This is one journey because every caller shares one precondition (a direct store dial) and one
observable (the raw connector boundary sees a resolved database user, or is never entered). The
constructor fence is part of that observable: it keeps `createPool` the choke point when a future
entry point is added, rather than requiring that caller to remember a hydration prelude.

## Capability

| # | capability | outcome | depends on |
|---|---|---|---|
| 1 | [`hydrated-store-dialing-root`](hydrated-store-dialing-root.md) | `createPool` resolves the database credential before raw Cloud SQL or pg construction, and raw construction is mechanically confined to that module. | — |

There is one capability and no within-story dependency edge.

## UAT Test Criteria

**Goal —** Drive the public pool-opening boundary through every credential source and prove there is
no second raw dialing path around it.

1. **createPool resolves the credential before dialing, and remains the only dialer.** _(witness: machine)_ _(proof-gate: store-credential-hydration#gate-1)_ Invoke the real `createPool` composition through recording connector/pool effects with: a non-blank environment user plus a conflicting fixture secret; an absent user plus a `STORYTREE_SECRETS_FILE` fixture; a blank user plus that fixture; and neither source available. **Success —** the explicit environment value wins unchanged; absent and blank values hydrate to the fixture user; the truly missing case refuses with `STORYTREE_DB_USER` before either raw constructor runs; and a repository audit finds raw Cloud SQL `Connector` or pg `Pool` construction only in `packages/library/src/store/connection.ts`. A violating production fixture outside that file makes the audit red. _(criterion-id: uatc_741bc9e6e6f14b88bb49a189)_ _(revision-id: uatr1:7c78e6e25ad54428)_

## Reliability Gates

1. **The connection composition and raw-constructor fence are green** _(gate: observe)_
   `pnpm --filter @storytree/library test`. The suite drives credential resolution with fixture files
   and recording connector/pool effects, then audits production source for a second raw construction
   site. It performs no live database connection.

## Scope fence

- This story owns database-credential hydration before **direct Postgres dialing**. It does not
  choose or mint the bearer/OIDC credential a remote web session presents to the already-built HTTP
  store door; that remains `remote-session-access-arc`.
- This story changes no write payload, stored row, event attribution, or CLI write-success rule;
  those remain `cli-write-fidelity-arc`.
- This story does not bound Cloud SQL activation, add progress output, emit build heartbeats, or
  distinguish a slow external dependency from a wedged one. Those are later increments of
  `diagnosis-honesty-arc`.
- Existing caller-side `loadLocalSecrets()` calls may remain for Claude-token hydration and are
  harmlessly idempotent. They are not the database-credential guarantee: `createPool` is.
