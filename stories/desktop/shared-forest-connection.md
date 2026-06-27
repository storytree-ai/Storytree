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
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (ADR-0057 §3 expansion C): contracts
# 1 & 2 already landed (PR #397) — `forest-readiness.ts` + `forest-readiness.test.ts` EXIST at HEAD, the
# resolving-connector and refused-connector paths are proven. This build completes the DROPPED contract 3
# (`fr-bounded-never-hangs`): the leaf ADDS a hanging-connector regression test that FAILS against the
# CURRENT no-deadline probe (a runtime red — its own node:test per-test timeout fires because the probe
# `await`s a connector that never settles), then EDITS `forest-readiness.ts` to make the connection
# attempt BOUNDED (the `serve.ts` `withTimeout` shape). The red is genuine and runtime, NOT a missing
# symbol: the symbol already exists, the behaviour (an un-deadlined probe) is wrong. Contracts 1 & 2
# re-run in the SAME suite as a no-regression wall — they stay green against the unchanged source, only
# the new contract-3 test goes red, exactly the additive edit-existing shape `drift-reads-store.md` uses.
# `install: true` + a typecheck wall because the probe imports the store connection types across the
# package boundary (the proof runs in a fresh worktree — tsx + tsc need the lockfile-only install,
# ADR-0031 §2). Single LITERAL source file (no `*`), so the default node:test proof on the one test file
# is legal — no `proofCommand` (the edit-existing single-literal-glob exemption, proof-config.ts refine).
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
    editsExisting: true
---

# The local backend's writes reach the shared Cloud SQL, with a readiness probe that fails closed

**Outcome —** The local backend's verdict/presence writes reach the SHARED Cloud SQL, with a readiness
probe that fails closed (and clear guidance) when the member lacks the IAM grant or the DB is down.

**Depends on —** [`local-backend-boot`](local-backend-boot.md) — the connection/readiness is the local
backend's store seam; the probe runs as part of the backend this capability stands up.

> **Proof status (honest) — PARTLY BUILT.** Contracts 1 & 2 (`fr-ready-when-connector-resolves`,
> `fr-fails-closed-with-guidance-when-ungranted`) LANDED in PR #397: `forest-readiness.ts` +
> `forest-readiness.test.ts` exist at HEAD with a signed verdict over those two. Contract 3
> (`fr-bounded-never-hangs`) was DROPPED by that build and is what THIS edit-existing build completes —
> a hanging-connector test + a bounded deadline on the probe. ADR-0113 §6 keeps the SHARED Cloud SQL as
> the source of truth (one living forest) — a per-member local store is explicitly NOT chosen. The
> member's builds, verdicts, and presence write to the same `events.*` schema the owner watches, which
> requires granting his Google identity Cloud SQL IAM access (ADR-0021 keyless) — an **attended
> privileged action performed at delivery**, not code. The connector this rides is real:
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
3. Drive the probe with a connector that HANGS (an `async () => new Promise(() => {})` that never
   settles), passing a SHORT injected deadline (e.g. 50 ms) → the probe resolves to
   `{ ready: false, guidance: <timeout> }` rather than hanging indefinitely (a deadline, the `serve.ts`
   `withTimeout` precedent). Give this test an explicit, GENEROUS node:test per-test timeout (e.g.
   `{ timeout: 5000 }`) so that against the UNCHANGED no-deadline source it FAILS at its own timeout (a
   FINITE red, never a wedge), and after the edit resolves fast within the injected 50 ms (green).
4. Assert the probe NEVER reports ready unless the connector actually resolved — no forged-ready path.

## Contracts (3)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `desktop` suite),
collaborators stubbed. Contracts 1 & 2 are PROVEN (LANDED #397, real tests in `forest-readiness.test.ts`);
contract 3 is the dropped one this edit-existing build completes (its test is added to the same file).

1. **`fr-ready-when-connector-resolves`** — a resolving connector reports the shared forest ready
   - **asserts —** given a connector double that resolves to a usable connection, the probe reports READY
     (writes to the shared store may proceed) — and reports ready ONLY when the connector actually
     resolved (no forged-ready path).
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the ready path) — LANDED #397
2. **`fr-fails-closed-with-guidance-when-ungranted`** — a refused connector yields actionable guidance
   - **asserts —** given a connector double that rejects with a connection-shaped error (ungranted IAM /
     DB down), the probe reports NOT ready with member-actionable guidance (the IAM grant / `db:up`),
     never a thrown crash and never silently proceeding to write.
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the fail-closed path) — LANDED #397
3. **`fr-bounded-never-hangs`** — a hanging connector is bounded by an injectable deadline
   *(THE DROPPED CONTRACT — this build completes it; edit-existing, see "the edit-existing slice" below)*
   - **asserts —** given a connector double that NEVER settles, the probe resolves to
     `{ ready: false, guidance: <timeout-actionable> }` within roughly the injected deadline — it never
     hangs the backend on an un-deadlined Cloud SQL handshake (the real 5–15 min idle-wake / cold-start
     case). The probe takes an injectable timeout (default sensible, e.g. ~5 s à la `serve.ts`'s
     `MEMBERS_RESOLVE_TIMEOUT_MS`) so the test can drive it with a SHORT deadline and assert a bounded
     elapsed wall-clock; the timer is `.unref()`'d so a hung attempt never keeps the process alive.
   - **covers —** `apps/desktop/src/backend/forest-readiness.ts` (the deadline arm of
     `probeForestReadiness` — the `Promise.race([connector(), timeoutThatResolvesNotReady(ms)])` shape)

## Guidance — the edit-existing slice that completes contract 3

The brownfield rung toward `healthy` (ADR-0057 §3, EDIT-EXISTING): contracts 1 & 2 already landed (PR
#397) — `forest-readiness.ts` and `forest-readiness.test.ts` EXIST at HEAD. This build completes the
DROPPED contract 3 (`fr-bounded-never-hangs`): the probe currently does `await connector()` with NO
deadline, so a hanging Cloud SQL handshake (the real 5–15 min idle-wake / cold-start case) would hang the
backend forever. Add a hanging-connector regression test that fails against that behaviour, then bound the
probe. Do NOT touch the resolving-connector or refused-connector tests/paths — they are proven; this is
purely additive.

- **What exists at HEAD —** `probeForestReadiness(connector)` returns `{ ready: true }` on resolve and
  `{ ready: false, guidance }` on reject — but it `await`s the connector with no timeout. The
  resolving-connector and refused-connector tests already pass. Read them; do not change them.
- **EXTEND the existing test —** `apps/desktop/src/backend/forest-readiness.test.ts`. ADD ONE test for the
  hanging path. Drive the probe with a connector that NEVER settles
  (`async () => new Promise<ForestConnection>(() => {})`) and a SHORT injected deadline (e.g. 50 ms).
  Assert the result is `{ ready: false }` with member-actionable guidance (mentioning the timeout / DB
  idle-wake). Give the test an explicit, GENEROUS node:test per-test timeout so the red is FINITE, not a
  wedge:

  ```ts
  test("forest-readiness: a hanging connector is bounded, never hangs", { timeout: 5000 }, async () => {
    const hangingConnector: ForestConnectorFn = () => new Promise<ForestConnection>(() => {});
    const started = Date.now();
    const result = await probeForestReadiness(hangingConnector, { timeoutMs: 50 });
    assert.equal(result.ready, false, "a hanging connector must fail closed, not report ready");
    if (result.ready) assert.fail("probe must not report ready when the connector hangs");
    assert.ok(/timeout|timed out|idle|db:up|Cloud SQL/i.test(result.guidance), "guidance must be actionable");
    assert.ok(Date.now() - started < 4000, "the probe must resolve well within the injected deadline, not hang");
  });
  ```

- **The RED the spine observes (before IMPLEMENT) —** this is a RUNTIME red, NOT a missing symbol
  (`probeForestReadiness` already exists). Against the UNCHANGED no-deadline source the probe `await`s the
  never-settling connector forever, so the new test never resolves and FAILS at its own `{ timeout: 5000 }`
  node:test deadline — a finite, observed red. Contracts 1 & 2 stay GREEN in the same run (the
  no-regression wall) — only the new test is red.
- **The GREEN (the edit) —** EDIT `apps/desktop/src/backend/forest-readiness.ts` to make the connection
  attempt bounded. Add an injectable timeout (an options arg, e.g.
  `probeForestReadiness(connector, { timeoutMs = 5000 } = {})`) and race the connector against a timer that
  RESOLVES to `{ ready: false, guidance: <timeout-actionable> }` (the `serve.ts` `withTimeout` precedent —
  but resolve-not-ready rather than reject, so the existing try/catch shape stays simple):
  `Promise.race([attemptConnect(connector), timeoutThatResolvesNotReady(timeoutMs)])`. Keep the resolving
  and refused paths byte-identical in behaviour. `.unref()` the timer so a hung attempt never keeps the
  process alive. After the edit, the hanging test resolves fast within 50 ms (green), the other two stay
  green, and the package suite + typecheck stay green.

Rules:

- **Shared forest, never a local store** — the writes target the SHARED Cloud SQL (ADR-0113 §6); this
  capability adds no local store.
- **Fail closed with guidance** — ungranted/down/hanging → an honest, member-actionable not-ready, never
  a hang and never a forged ready. The tests pin all three (`fr-fails-closed-with-guidance-when-ungranted`,
  `fr-bounded-never-hangs`, the no-forged-ready half of `fr-ready-when-connector-resolves`).
- **The live grant is operator-attested** — the member's Cloud SQL IAM grant (ADR-0021) is an attended
  privileged action the owner performs at delivery; the real connection over the data socket is the
  Story UAT human-witness leg, not this offline test.
