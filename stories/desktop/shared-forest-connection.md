---
id: "shared-forest-connection"
tier: capability
story: desktop
title: "The local backend's writes reach the shared Cloud SQL, with a readiness probe that fails closed when ungranted or down"
outcome: "The local backend's verdict/presence writes reach the SHARED Cloud SQL, with a readiness probe that fails closed (and clear guidance) when the member lacks the IAM grant or the DB is down."
status: proposed
proof_mode: integration-test
depends_on: [local-backend-boot]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (no editsExisting): the leaf authors an
# integration test that imports a NOT-YET-EXISTING symbol from a NEW source file under apps/desktop/src
# (red = module-not-found against the source that does not exist at HEAD), then writes that one new
# source file (green). The new module is the shared-forest READINESS probe — a pure-ish connection-smoke
# over an INJECTED connector seam (so it is offline-testable: a refused/granted connector double drives
# the fail-closed vs ready paths). The REAL Cloud SQL connection + the member's live IAM grant are
# operator-attested (a real DB socket on port 3307 + a keyless IAM grant cannot run in CI), NOT this
# offline test. `install: true` + a typecheck wall because the probe imports the store connection types
# across the package boundary (the proof runs in a fresh worktree — tsx + tsc need the lockfile-only
# install, ADR-0031 §2). Single LITERAL source file (no `*`), so the default node:test proof on the one
# test file is legal — no `proofCommand`.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/forest-readiness.test.ts"
    sourceFile: "apps/desktop/src/backend/forest-readiness.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/forest-readiness.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/forest-readiness.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# The local backend's writes reach the shared Cloud SQL, with a readiness probe that fails closed

**Outcome —** The local backend's verdict/presence writes reach the SHARED Cloud SQL, with a readiness
probe that fails closed (and clear guidance) when the member lacks the IAM grant or the DB is down.

**Depends on —** [`local-backend-boot`](local-backend-boot.md) — the connection/readiness is the local
backend's store seam; the probe runs as part of the backend this capability stands up.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. ADR-0113 §6 keeps the
> SHARED Cloud SQL as the source of truth (one living forest) — a per-member local store is explicitly
> NOT chosen. The member's builds, verdicts, and presence write to the same `events.*` schema the owner
> watches, which requires granting his Google identity Cloud SQL IAM access (ADR-0021 keyless) — an
> **attended privileged action performed at delivery**, not code. The connector this rides is real:
> `@storytree/store`'s keyless Cloud SQL IAM connection (the Node connector + ambient ADC, ADR-0021),
> the SAME path `@storytree/drive`'s `--store pg` build persistence uses.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the SHARED-FOREST READINESS AS A WHOLE — a
probe that, before the loop runs, confirms the local backend can reach the shared Cloud SQL OR fails
closed with member-actionable guidance (the IAM grant is missing / the DB is idle-stopped). That spans
the probe AND the connector seam, so it is an integration test over an injected connector, not a single
isolated assertion.

THE FOREST IS SHARED, NOT LOCAL (ADR-0113 §6 — the whole point of sharing with the circle): the member's
verdict/presence writes go to the SHARED Cloud SQL (`events.work_event`/`events.verdict`/presence), so
his work blooms in the forest the owner watches. This capability does NOT introduce a local store; it
ensures the local backend's writes land in the shared one and that the connection is honest about its
state.

THE LIVE GRANT IS AN ATTENDED PRIVILEGED ACTION, OPERATOR-ATTESTED (ADR-0021 / ADR-0113 §6): the member's
Google identity must be granted Cloud SQL IAM access at delivery — a keyless grant the OWNER performs
(`gcloud`/REST), an attended privileged action (the "attempt privileged actions, approve inline" posture),
NOT something this code does. The REAL connection over the data socket (port 3307) and the grant itself
are **operator-attested** (Story UAT leg 5/6) — a CI run has neither the grant nor the socket. What CI
proves is the PROBE LOGIC over an injected connector.

THE PROBE FAILS CLOSED, NEVER HANGS OR FORGES (the honesty wall): a refused/ungranted/idle connector must
yield a clear, member-actionable readiness failure (you need the Cloud SQL IAM grant / the DB is down —
`db:up`), bounded so it does not hang for minutes the way an un-deadlined Cloud SQL connector handshake
can (the studio's `MEMBERS_RESOLVE_TIMEOUT_MS` precedent in `serve.ts`). It NEVER reports ready when it
cannot actually connect, and it NEVER silently proceeds to write into a forest it cannot reach.

OFFLINE-TESTABLE BY INJECTION: the probe takes the connector (an `async () => connection`) as an injected
callback. The integration test drives it with a GRANTED connector double (resolves) and a
REFUSED/ungranted connector double (rejects with a connection-shaped error) — asserting the ready path and
the fail-closed guidance path. No real Cloud SQL, no grant, no socket. Production wires the real keyless
`@storytree/store` connector (the same `--store pg` path the build persistence uses).

## Integration test

**Goal —** Prove that the readiness probe reports the shared forest reachable when the connector resolves,
and fails CLOSED with member-actionable guidance when it does not (ungranted / DB down) — bounded, never
hanging, never forging ready, all offline over an injected connector.

The integration test exercises this capability against its **real in-story collaborator** — the readiness
probe over an injected connector seam (a granted double and a refused double). The real Cloud SQL
connection + the member's IAM grant are the operator-attested Story UAT legs, not this test.

The integration test would:

1. Drive the probe with a GRANTED connector double (resolves to a usable connection) → it reports the
   shared forest READY (the local backend may persist verdicts/presence to the shared store).
2. Drive the probe with a REFUSED/ungranted connector double (rejects with a connection-shaped error) →
   it reports NOT ready with member-actionable guidance (the member needs the Cloud SQL IAM grant
   (ADR-0021), or the DB is idle-stopped — `db:up`), never a thrown crash.
3. Drive the probe with a connector that HANGS → the probe is bounded (a deadline, the `serve.ts`
   `withTimeout` precedent) and reports not-ready-due-to-timeout rather than hanging indefinitely.
4. Assert the probe NEVER reports ready unless the connector actually resolved — no forged-ready path.

## Contracts (3)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `desktop` suite),
collaborators stubbed. None exist yet; each is the assertion a contract test WILL prove against the real
probe code once authored (provisional path — re-cite at real `file:line` when built).

1. **`fr-ready-when-connector-resolves`** — a resolving connector reports the shared forest ready
   - **asserts —** given a connector double that resolves to a usable connection, the probe reports READY
     (writes to the shared store may proceed) — and reports ready ONLY when the connector actually
     resolved (no forged-ready path).
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the ready path) *(provisional path)*
2. **`fr-fails-closed-with-guidance-when-ungranted`** — a refused connector yields actionable guidance
   - **asserts —** given a connector double that rejects with a connection-shaped error (ungranted IAM /
     DB down), the probe reports NOT ready with member-actionable guidance (the IAM grant / `db:up`),
     never a thrown crash and never silently proceeding to write.
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the fail-closed path)
3. **`fr-bounded-never-hangs`** — a hanging connector is bounded by a deadline
   - **asserts —** given a connector double that never settles, the probe is bounded by a deadline (the
     `serve.ts` `withTimeout` precedent) and reports not-ready-due-to-timeout, never hanging the backend.
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the deadline)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the readiness probe as a
new module, test-first.

- **The new test —** `apps/desktop/src/backend/forest-readiness.test.ts` (`node:test` +
  `node:assert/strict`). Import `{ probeForestReadiness }` (or the chosen name) from
  `"./forest-readiness.js"`. Build a granted connector double, a refused connector double, and a hanging
  connector double.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `forest-readiness.ts`
  does not exist at HEAD, so the test fails module-not-found (the net-new missing-symbol red). Assert the
  ready path, the fail-closed-with-guidance path, and the bounded-never-hangs path.
- **The GREEN —** write `apps/desktop/src/backend/forest-readiness.ts`: a function that takes the injected
  connector, attempts a bounded connection (the `withTimeout` shape), and returns a readiness result —
  READY only on an actual resolve, otherwise NOT ready with member-actionable guidance (IAM grant / DB
  down / timeout). After it, the import resolves, the assertions hold, and the package suite + typecheck
  stay green.

Rules:

- **Shared forest, never a local store** — the writes target the SHARED Cloud SQL (ADR-0113 §6); this
  capability adds no local store.
- **Fail closed with guidance** — ungranted/down/hanging → an honest, member-actionable not-ready, never
  a hang and never a forged ready. The tests pin all three (`fr-fails-closed-with-guidance-when-ungranted`,
  `fr-bounded-never-hangs`, the no-forged-ready half of `fr-ready-when-connector-resolves`).
- **The live grant is operator-attested** — the member's Cloud SQL IAM grant (ADR-0021) is an attended
  privileged action the owner performs at delivery; the real connection over the data socket is the
  Story UAT human-witness leg, not this offline test.
