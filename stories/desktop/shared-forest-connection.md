---
id: "shared-forest-connection"
tier: capability
story: desktop
title: "The local backend BROKERS its forest writes to the hosted studio, with a readiness probe that fails closed when the broker is unreachable or the caller is not an authorized builder"
outcome: "The local backend's verdict/presence writes reach the SHARED forest by POSTing the locally-signed verdict / presence to the hosted studio's members-gated write-broker (no local DB connection), with a readiness probe that fails closed (and clear guidance) when the broker is unreachable or the member is not an authorized builder."
status: proposed
proof_mode: integration-test
depends_on: [local-backend-boot]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDITS-EXISTING (editsExisting: true): the
# forest-readiness.ts + .test.ts PAIR ALREADY EXISTS at HEAD — a prior `--real` build (commit 4fddb7c,
# real-mqvjuoxe) landed the DIRECT-keyless-Cloud-SQL-connector version, even though the capability is
# still authored `proposed` (never landed green/healthy). ADR-0117 RE-HOMES it from that direct connector
# to a BROKER HTTP CLIENT: the leaf REWRITES the existing test to assert broker behaviour (ready only when
# the broker authorizes the member as a builder; fail-closed when unreachable/forbidden; brokers-not-direct)
# and REWRITES the existing source from a connector-smoke to a broker readiness probe + POST client. The RED
# the spine observes is a BEHAVIOUR red — the new broker assertions fail against the OLD direct-connector
# source at HEAD (NOT a module-not-found red; the module exists). This is why editsExisting MUST be true:
# a net-new arm would expect the file absent at HEAD and mis-frame the red. The probe/client is offline-
# testable over an INJECTED broker-POST seam (a reachable/authorized double + an unreachable/forbidden
# double drive the ready vs fail-closed paths). The REAL broker endpoint over the network + the member's
# live `builder` grant are operator-attested (a real HTTPS POST to the hosted studio + an in-app builder
# role cannot run in CI), NOT this offline test. The desktop consumes the broker over HTTP and MUST NOT
# import apps/studio/server (the surface boundary) — it holds a configured broker URL + the POST client.
# install: true + a typecheck wall because the client imports the proof-protocol `Verdict` / notice-board
# `PresenceDeclaration` shapes it POSTs across the package boundary (the proof runs in a fresh worktree —
# tsx + tsc need the lockfile-only install, ADR-0031 §2). Single LITERAL source file (no `*`), so the
# default node:test proof on the one test file is legal — no proofCommand.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    editsExisting: true
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

# The local backend BROKERS its forest writes to the hosted studio, fails closed when the broker is unreachable or the caller is not an authorized builder

**Outcome —** The local backend's verdict/presence writes reach the SHARED forest by **POSTing the
locally-signed verdict / presence declaration to the hosted studio's members-gated write-broker** (no
local DB connection), with a readiness probe that fails closed (and clear guidance) when the broker is
unreachable or the member is not an authorized **builder**.

**Depends on —** [`local-backend-boot`](local-backend-boot.md) — the broker client/readiness is the local
backend's write seam; the probe runs as part of the backend this capability stands up.

> **Proof status (honest) — A DIRECT-CONNECTOR VERSION IS ALREADY LANDED; this RE-HOMES it (ADR-0117,
> amends ADR-0113 §6 for friends).** The `forest-readiness.ts`/`.test.ts` pair already exists at HEAD (a
> prior `--real` build, commit 4fddb7c) — the DIRECT keyless Cloud SQL connector probe — though the
> capability is still authored `proposed` (never landed green). ADR-0113 §6 routed the friend's writes
> DIRECTLY to shared Cloud SQL under his own keyless IAM identity (a per-friend `gcloud` grant). **ADR-0117
> replaces that direct path for friends with
> a BROKERED write:** the friend keeps local COMPUTE (the spine runs the gate and SIGNS locally, ADR-0091)
> but his local backend **no longer opens a DB connection** — it POSTs the already-signed verdict / presence
> to the studio's members-gated [`write-broker`](../studio-cloud/write-broker.md), and the SERVER persists
> them under its one service-account DB identity. The collaborators are real: the studio's write-broker
> endpoint (the `write-broker` capability), the proof-protocol `Verdict` / notice-board `PresenceDeclaration`
> shapes the local gate produces, and the `node`/`fetch` HTTP client. **No per-friend Cloud SQL IAM grant;
> the friend holds no DB identity and opens no DB connection.**

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the SHARED-FOREST WRITE READINESS AS A
WHOLE — a probe that, before the loop runs, confirms the local backend can reach the studio's write-broker
AS AN AUTHORIZED BUILDER, OR fails closed with member-actionable guidance (the broker is unreachable / you
are not yet a builder — ask the owner to mark you one in the Members panel). That spans the readiness probe
AND the broker write client, so it is an integration test over an injected broker-POST seam, not a single
isolated assertion.

THE WRITE IS BROKERED, NOT DIRECT (ADR-0117 d.1/d.5 — the core re-homing): the member's verdict/presence
writes are POSTed to the hosted studio's members-gated write-broker over HTTPS; the SERVER persists them
to the shared `events.*` schema. This capability does NOT open a Cloud SQL connection and introduces NO
local store — it ensures the local backend's locally-signed bytes reach the shared forest THROUGH THE
BROKER, and that the connection is honest about its state. The direct-connector code path for the friend is
RETIRED (the owner's own first-party `--pg`/load-corpus tooling may still connect directly; ADR-0117 scopes
the friend).

THE READINESS PROBE CHECKS THE BROKER, NOT A DB SOCKET (ADR-0117 d.5 — what "ready" now means): the probe
confirms (a) the broker endpoint is REACHABLE and (b) the caller is an AUTHORIZED BUILDER (the broker
answers an authorized vs 403/401 result for this member) — NOT that a DB socket on port 3307 is open. This
is the inverse of the old direct-connector probe: there is no keyless IAM grant to check and no raw socket
to open; the authorization that matters is the in-app `builder` role (ADR-0117 d.2), surfaced by the broker.

LOCAL COMPUTE IS PRESERVED, ONLY THE WRITE IS BROKERED (ADR-0117 — ADR-0113 stands): the spine still runs
the prove-it-gate on the member's machine and SIGNS the verdict locally (ADR-0091's gate-runs-then-signs).
This capability does not touch where the work runs or who signs — it changes only WHERE THE PERSISTED BYTES
ENTER THE FOREST: through a validated HTTP POST to the broker instead of a raw DB socket. The broker
validates shape + attribution and persists the local signature unchanged (it never re-signs).

THE BUILDER ROLE IS AN IN-APP GRANT, OPERATOR-ATTESTED (ADR-0117 d.2 — replaces the per-friend IAM grant):
the member's `builder` role is granted IN-APP through the studio Members panel (the owner marks them a
builder; ADR-0043 in-UI invitation extended by ADR-0117). NO `gcloud`, NO Cloud SQL IAM grant. The REAL
brokered write over the network and the live `builder` grant are **operator-attested** (Story UAT leg 5/6)
— a CI run has neither a hosted broker nor an in-app builder role. What CI proves is the PROBE + CLIENT
LOGIC over an injected broker-POST seam.

THE PROBE FAILS CLOSED, NEVER HANGS OR FORGES (the honesty wall, unchanged from the direct-path version):
an unreachable/forbidden broker must yield a clear, member-actionable readiness failure (the broker is
unreachable — is the studio up? / you are not yet an authorized builder — ask the owner), bounded so it
does not hang the way an un-deadlined network call can (the studio's `MEMBERS_RESOLVE_TIMEOUT_MS` /
`withTimeout` precedent in `serve.ts`). It NEVER reports ready when it cannot actually reach the broker as a
builder, and it NEVER silently proceeds to POST into a forest it cannot reach.

THE DESKTOP CONSUMES THE BROKER OVER HTTP — NEVER IMPORTS THE STUDIO SERVER (the surface boundary, ADR-0100
/ ADR-0113 §8): the broker is reached by HTTP POST to a CONFIGURED broker URL, exactly as the renderer
talks to any backend. This module imports NO `apps/studio/server` source (a forbidden surface→surface
coupling); the cross-story edge desktop → studio-cloud is a RUNTIME HTTP edge, not a package import — so no
new `@storytree/*` dep is added to `apps/desktop/package.json` for it (the boundary gate needs no new
declared package edge for an HTTP consumption; the shapes POSTed come from `@storytree/proof-protocol` /
`@storytree/notice-board`, both already reachable transitively).

OFFLINE-TESTABLE BY INJECTION: the probe + client take the broker-POST seam (an `async (path, body) =>
{ status, body }`, or a typed result) as an injected callback. The integration test drives it with an
AUTHORIZED-builder broker double (a reachable POST that accepts), a FORBIDDEN broker double (403 — not a
builder), an UNREACHABLE broker double (network error), and a HANGING double — asserting the ready path,
the fail-closed-not-a-builder path, the fail-closed-unreachable path, and the bounded-never-hangs path. No
real broker, no network, no DB. Production wires the real `fetch`-based POST to the configured broker URL.

## Integration test

**Goal —** Prove that the readiness probe reports the shared forest reachable when the broker accepts the
member AS A BUILDER, and fails CLOSED with member-actionable guidance when the broker is unreachable or
refuses the member (not a builder) — bounded, never hanging, never forging ready — and that the write
client POSTs the locally-signed verdict/presence to the broker (never opening a DB connection), all offline
over an injected broker-POST seam.

The integration test exercises this capability against its **real in-story collaborator** — the readiness
probe + broker write client over an injected broker-POST seam (authorized / forbidden / unreachable /
hanging doubles), POSTing the real proof-protocol `Verdict` / notice-board `PresenceDeclaration` shapes. The
real broker over the network + the member's live `builder` grant are the operator-attested Story UAT legs,
not this test.

The integration test would:

1. Drive the probe with an AUTHORIZED-builder broker double (a reachable POST that accepts) → it reports the
   shared forest READY (the local backend may broker verdicts/presence).
2. Drive the probe with a FORBIDDEN broker double (the broker answers 403 — the member is not a builder) →
   it reports NOT ready with member-actionable guidance (you are not yet an authorized builder — ask the
   owner to mark you one in the Members panel), never a thrown crash.
3. Drive the probe with an UNREACHABLE broker double (network error / connection refused) → NOT ready with
   guidance (the broker is unreachable — is the studio up?), never a hang and never a forged ready.
4. Drive the probe with a broker double that HANGS → the probe is bounded (a deadline, the `serve.ts`
   `withTimeout` precedent) and reports not-ready-due-to-timeout rather than hanging indefinitely.
5. Drive the WRITE client with a locally-signed `Verdict` (and a `PresenceDeclaration`) → it POSTs the
   shape to the broker seam (asserting the body reached the broker POST, attributed to the member), and
   opens NO DB connection (no pg connector in the path) — the broker, not the client, persists.
6. Assert the probe NEVER reports ready unless the broker actually accepted the member as a builder — no
   forged-ready path — and the module imports NO `apps/studio/server` and NO pg connector.

## Contracts (4)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `desktop` suite),
collaborators stubbed. None exist yet; each is the assertion a contract test WILL prove against the real
broker probe/client code once authored (provisional path — re-cite at real `file:line` when built).

1. **`fr-ready-when-broker-accepts-builder`** — a reachable broker that authorizes the member reports ready
   - **asserts —** given a broker-POST double that is reachable and authorizes the caller as a builder, the
     probe reports READY (brokered writes may proceed) — and reports ready ONLY when the broker actually
     accepted (no forged-ready path; an unreachable/forbidden broker is never "ready").
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the ready path) *(provisional path)*
2. **`fr-fails-closed-with-guidance-when-unbrokered`** — unreachable OR not-a-builder yields actionable guidance
   - **asserts —** given a broker-POST double that is unreachable (network error) OR refuses the caller
     (403 — not a builder), the probe reports NOT ready with member-actionable guidance (the broker is
     unreachable — is the studio up? / you are not yet an authorized builder — ask the owner to mark you one),
     never a thrown crash and never silently proceeding to write.
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the fail-closed path)
3. **`fr-bounded-never-hangs`** — a hanging broker is bounded by a deadline
   - **asserts —** given a broker-POST double that never settles, the probe is bounded by a deadline (the
     `serve.ts` `withTimeout` precedent) and reports not-ready-due-to-timeout, never hanging the backend.
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the deadline)
4. **`fr-write-brokers-not-direct`** — the write client POSTs to the broker and opens no DB connection
   - **asserts —** given a locally-signed `Verdict` (and a `PresenceDeclaration`), the write client POSTs
     the shape to the injected broker seam (the body reaches the broker POST, attributed to the member) and
     opens NO DB connection — the module imports no pg connector and no `apps/studio/server` source; the
     broker, not the client, persists. (Re-homing honesty: no direct-connector path survives.)
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the broker write client)

## Guidance — the edits-existing slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, **EDITS-EXISTING**): RE-HOME the existing forest-readiness
probe from a direct Cloud SQL connector to a broker HTTP client, test-first. The
`forest-readiness.ts`/`.test.ts` pair **ALREADY EXISTS at HEAD** (commit `4fddb7c` — the direct-connector
version, green in the desktop suite); the leaf **REWRITES both** (this is why `editsExisting: true`).

- **The rewritten test —** `apps/desktop/src/backend/forest-readiness.test.ts` (`node:test` +
  `node:assert/strict`). REPLACE the direct-connector assertions with broker ones: drive the readiness probe
  + broker write client (from `"./forest-readiness.js"`) through an INJECTED broker-POST seam — an
  authorized-builder double, a forbidden 403 double, an unreachable double, and a hanging double — NOT the
  old `ForestConnectorFn` connector double.
- **The RED the spine observes (before IMPLEMENT) — a BEHAVIOUR red, NOT module-not-found.** The module
  already exists, so the import resolves; the red comes from the NEW broker assertions failing against the
  OLD direct-connector source at HEAD (today `probeForestReadiness` opens a DB connector and its fail-guidance
  literally says "ask the owner to run `gcloud … roles/cloudsql.client`" — it has no broker-authorizes-builder
  path, no bounded broker-POST client, and still assumes a direct connection). The leaf MUST author the new
  test so it genuinely goes RED against the existing green source first. Assert the ready path, the
  fail-closed-with-guidance path (unreachable AND not-a-builder), the bounded-never-hangs path, and the
  brokers-not-direct write path.
- **The GREEN —** REWRITE `apps/desktop/src/backend/forest-readiness.ts` from the connector-smoke to: a probe
  that takes the injected broker-POST seam, attempts a bounded reachability/authorization check (the
  `withTimeout` shape), and returns a readiness result — READY only when the broker actually accepted the
  member as a builder, otherwise NOT ready with member-actionable guidance; plus a write client that POSTs the
  locally-signed `Verdict`/`PresenceDeclaration` to the broker (never opening a DB connection). RETIRE the
  `ForestConnectorFn`/`ForestConnection` direct-connector seam (no direct-connector path survives the
  re-home). NO `apps/studio/server` import, NO pg connector. After it, the assertions hold, and the package
  suite + typecheck stay green.

Rules:

- **Brokered, never a direct DB connection** — the writes are POSTed to the studio's write-broker
  (ADR-0117 §1); this capability opens no Cloud SQL connection and adds no local store. The test pins this
  (`fr-write-brokers-not-direct`).
- **Ready means the broker authorizes you as a builder** — not that a DB socket is open. The probe reports
  ready ONLY on an actual broker accept (`fr-ready-when-broker-accepts-builder`).
- **Fail closed with guidance** — unreachable / not-a-builder / hanging → an honest, member-actionable
  not-ready, never a hang and never a forged ready (`fr-fails-closed-with-guidance-when-unbrokered`,
  `fr-bounded-never-hangs`).
- **Consume the broker over HTTP; never import the studio server** — a configured broker URL + a POST
  client; no `apps/studio/server` source import (the surface boundary). The cross-story edge is a runtime
  HTTP edge, not a package import.
- **The `builder` grant is operator-attested** — the member's in-app `builder` role (the Members panel,
  ADR-0117 d.2) replaces the per-friend Cloud SQL IAM grant; the real brokered write over the network is the
  Story UAT human-witness leg, not this offline test.
