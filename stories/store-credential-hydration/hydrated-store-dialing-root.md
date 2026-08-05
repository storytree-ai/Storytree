---
id: "hydrated-store-dialing-root"
tier: capability
story: store-credential-hydration
arc: diagnosis-honesty-arc
title: "createPool hydrates the database credential before raw store construction"
outcome: "createPool resolves STORYTREE_DB_USER before raw Cloud SQL or pg construction, while a source fence prevents any production bypass."
status: proposed
proof_mode: integration-test
depends_on: []
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

# createPool hydrates the database credential before raw store construction

## Guidance

Make `packages/library/src/store/connection.ts` the composition root it already claims to be. At
the beginning of `createPool`, before resolving the connection options and before constructing a
Cloud SQL `Connector` or pg `Pool`:

1. treat a non-blank `STORYTREE_DB_USER` in the supplied environment as authoritative;
2. treat an absent, empty, or whitespace-only value as a gap and hydrate that gap from
   `STORYTREE_SECRETS_FILE`, falling back to `~/.storytree/secrets.json`;
3. preserve the explicit environment value when the file disagrees;
4. refuse a still-missing value with a message naming `STORYTREE_DB_USER` before any raw connector
   or pool effect runs.

A narrow Node-only helper beside `connection.ts` may own the secrets-file parsing. It reads only the
database credential needed by this boundary, ignores a missing/malformed file, and cannot inject
arbitrary environment keys. Existing caller-side `loadLocalSecrets()` remains valid and idempotent;
it still serves `CLAUDE_CODE_OAUTH_TOKEN`, but it is no longer what makes a database dial safe.

Keep `createPool`'s current lazy placement at its callers and preserve `CreatePoolOptions.user` as
an explicit programmatic override. This capability moves no dial earlier: hydration happens when a
caller actually invokes `createPool`, immediately before the existing data-plane refusal,
connection-option resolution, and raw construction sequence.

The class fence is mechanical and sits with the connection tests. Scan production TypeScript for
imports/construction of `@google-cloud/cloud-sql-connector`'s `Connector` and `pg`'s `Pool`; permit
the raw construction only in `packages/library/src/store/connection.ts`, with tests and generated or
vendor material excluded by an explicit closed rule. The audit derives violations from source files,
not from a roster of today's entry points. All higher-level callers remain free to call `createPool`:
that is the shared path the fence protects.

This root does not select an HTTP store-door credential, alter store authorization, start or wake
Cloud SQL, set a connection timeout, or emit build liveness.

## Contract (1)

1. **`store-dialers-cross-the-hydration-root`** — credential resolution precedes every raw store dial
   - **asserts —** `createPool` preserves an explicit non-blank environment user, hydrates an absent
     or blank user from the canonical secrets file, and refuses a truly missing user with a message
     naming `STORYTREE_DB_USER` before raw `Connector` or `Pool` construction; a repository source
     audit permits those raw constructors only in `connection.ts`.
   - **falsifiability —** the integration test records call order and the user visible to injected
     connector/pool effects for explicit-env, file-hydrated, blank-env, and missing-everywhere cases;
     it supplies a conflicting file value to prove explicit env precedence, asserts zero constructor
     calls on refusal, and rejects a fixture that constructs either raw dependency outside
     `connection.ts`. A caller-side hydration prelude cannot make a bypass pass the audit.

## Integration proof

`packages/library/src/store/connection.test.ts` names the contract verbatim. It drives the production
`createPool` composition with a temporary `STORYTREE_SECRETS_FILE` and recording connector/pool
effects, then runs the raw-constructor source audit over the repository and a deliberately violating
fixture. The proof is offline: no Cloud SQL connector or network socket is opened.

