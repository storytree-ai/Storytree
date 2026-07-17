---
id: "brokered-local-uat-signing"
tier: capability
story: desktop
title: "A local human signs a declared UAT leg at a clean HEAD and persists the real operator-attested verdict through the forest broker"
outcome: "The desktop backend turns a local human's observation of a declared human-witness UAT test into a real operator-attested verdict pinned to a clean git HEAD and persists it through the injected brokered forest writer, while refusing untrustworthy input or an unpersisted write."
status: proposed
proof_mode: integration-test
depends_on: [shared-forest-connection, boot-read-routes]
decisions: [180, 117, 82]
# Node-borne proof config (ADR-0057 keystone). NET-NEW: the leaf first authors the test importing
# the not-yet-existing local-uat-attest module (module-not-found RED), then authors that one source
# file (GREEN). This pair proves the signing core only. The POST /api/uat/attest dispatcher,
# Electron-session IAP bridge, and frontend permission bit are landed non-leaf composition under
# ADR-0180; they remain outside this proof arm. The source consumes @storytree/orchestrator's
# checkUatProof and the existing injected
# ForestWriter seam, never apps/studio/server. Single LITERAL paths make the default node:test proof
# legal; install + desktop typecheck hold the cross-package imports honest in a fresh worktree.
proof:
  command:
    file: pnpm
    args: ["--filter", "desktop", "test"]
  scope:
    testGlobs: ["apps/desktop/src/**/*.test.ts"]
    sourceGlobs: ["apps/desktop/src/**/*.ts"]
  real:
    testFile: "apps/desktop/src/backend/local-uat-attest.test.ts"
    sourceFile: "apps/desktop/src/backend/local-uat-attest.ts"
    scope:
      testGlobs: ["apps/desktop/src/backend/local-uat-attest.test.ts"]
      sourceGlobs: ["apps/desktop/src/backend/local-uat-attest.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "desktop", "typecheck"]
---

# A local human signs a declared UAT leg through the forest broker

**Outcome —** The desktop backend turns a local human's observation of a declared human-witness UAT
test into a real `operator-attested` verdict pinned to a clean git HEAD and persists it through the
injected brokered forest writer, while refusing untrustworthy input or an unpersisted write.

**Depends on —**
- [`shared-forest-connection`](shared-forest-connection.md) — supplies the existing `ForestWriter`
  boundary whose production implementation reaches `writeToForestBroker`; successful signing is not
  complete until that writer confirms persistence.
- [`boot-read-routes`](boot-read-routes.md) — supplies the local test context exposed to the shared
  frontend, including the deliberately non-admin `LOCAL_ME`. This capability adds signing authority
  from a separately injected local operator identity; it does not falsely promote `LOCAL_ME` to admin.

> **Proof status (honest) — BUILT, signed REAL pass `real-mrezf7px` at commit `54c936c`.** The
> Electron-free signing core is red→green proven. ADR-0180's composition is also landed: the shared
> UI uses `canAttestUat`, the sidecar mounts `POST /api/uat/attest`, and child IPC asks Electron main
> to authenticate through its persistent IAP browser session and POST the signed verdict to the
> hosted broker. That browser/login wiring is operator-attested glue, not part of the core verdict.

## Guidance

WHY THIS IS ONE CAPABILITY: one input crosses one honesty boundary and produces one observable — a
declared human UAT leg becomes a broker-persisted, operator-attested verdict at the exact clean commit
the human observed. Validation, verdict construction, and persistence are one transaction-shaped
journey; separating them would permit a locally "successful" signature whose verdict never reached the
forest.

THE CI-PROVABLE CORE IS `local-uat-attest.ts`: export one pure-to-effectful function (for example
`attestLocalUat`) that receives all context rather than reading global state:

- the requested `testId`, `outcome` (`pass` or `fail`), optional note, and injected sign time;
- the loaded story test context — the declared UAT test criteria, including each test's `id` and resolved
  witness — so an unknown or malformed id cannot mint a unit;
- a separately resolved local operator identity and, when present, the running agent/session identity;
- git state `{ commitSha, clean }`, already resolved by the caller;
- an injected `ForestWriter`.

The implementation validates first, builds the real verdict second, and calls
`forestWriter.write({ type: "verdict", payload: verdict })` last. It imports `checkUatProof` from
`@storytree/orchestrator` and uses the shared proof-protocol `Verdict` shape/build conventions:
`unitId = test.id`, `proofMode = "operator-attested"`, the requested outcome, clean `commitSha`,
trimmed human signer, an injected-time-derived `runId`, `outputVersion: "v1"`, operator-attested
evidence referencing the signer (with only a non-blank trimmed note), and the injected ISO sign time.
It must not import `apps/studio/server` or copy its HTTP router.

THE HONESTY WALLS RUN BEFORE THE WRITER:

1. Refuse a blank/malformed test id, an invalid outcome, malformed test context, or an id absent from
   the declared context. A typo never creates a verdict for an unknown unit.
2. Call the shared `checkUatProof` with the declared witness, the offered
   `{ proofMode: "operator-attested", signer }`, and the injected agent identity when present. This
   refuses a machine-only leg, blank signer, `sandbox:` signer, or signer equal to the running agent.
   `either` remains valid only through the same human guard.
3. Refuse absent/blank HEAD, malformed commit SHA, or `clean: false`. A human cannot attest uncommitted
   bytes while pinning a different committed state.
4. Validate the built object as a real proof-protocol `Verdict` before any effect.
5. Treat the broker result as authoritative: success requires `persisted: true`. A 401/403, malformed
   response, timeout, unreachable broker, or any other `persisted: false` result is a refusal carrying
   the writer's guidance; never echo a successful signature for a verdict that did not persist.

LOCAL IDENTITY IS NOT LOCAL ADMIN. `LOCAL_ME` deliberately remains `role: "member"` because the desktop
does not mount hosted admin surfaces. The operator signer is an explicit trusted local input resolved
by sidecar composition (for example the configured operator/git identity), never a signer supplied by
the renderer request. The eventual route must ignore any client `signer` field.

BROKERED, NEVER DIRECT: the core accepts the already-existing `ForestWriter` interface from
`local-backend.ts`; production composition supplies `createBrokerForestWriter` /
`writeToForestBroker`. The new module opens no DB connection, imports no pg store, and never calls a
hosted server module. The broker persists the locally built signature unchanged.

## Integration test

**Goal —** Prove that a valid declared human UAT leg, a non-agent local operator, and a clean git HEAD
produce one real operator-attested `Verdict` that is persisted through the injected `ForestWriter`,
while every trust or persistence failure refuses before claiming success.

`apps/desktop/src/backend/local-uat-attest.test.ts` uses `node:test` + `node:assert/strict` and an
in-memory writer double; no Electron, HTTP server, DB, hosted broker, or live SDK is involved.

The test would:

1. Supply declared tests containing one `human`, one `machine`, and one `either` leg; a local operator
   email; a distinct agent identity; clean git state with a literal 40-character SHA; and a writer
   double returning `{ persisted: true, status: 201, body: ... }`.
2. Sign the human leg and assert the writer is called exactly once with
   `{ type: "verdict", payload }`; parse the payload as `Verdict` and pin its unit id, proof mode,
   outcome, signer, commit SHA, run id/time, and operator-attested evidence.
3. Assert the machine leg is refused by the shared proof guard and the writer is never called.
4. Assert blank/`sandbox:`/agent-equal signers, dirty or malformed git state, malformed/unknown test
   ids, and invalid outcomes each refuse before the writer.
5. Return a broker refusal from the writer and assert the result remains failed with the broker
   guidance — never a forged persisted/signed success.

## Contracts (3)

1. **`luat-persists-a-real-human-verdict-through-the-broker`**
   - **asserts —** a declared human/either leg, distinct non-agent operator, clean valid HEAD, and
     accepting writer produce a proof-protocol-valid operator-attested verdict and exactly one
     `ForestWriter.write({ type: "verdict", payload })`; success is returned only after
     `persisted: true`.
   - **covers —** `apps/desktop/src/backend/local-uat-attest.ts` (verdict build + broker persistence)
     *(provisional path)*
2. **`luat-refuses-untrustworthy-proof-before-writing`**
   - **asserts —** machine witness, blank/agent signer, dirty or malformed HEAD, malformed/unknown
     test, or invalid outcome returns a typed refusal and calls the writer zero times. Witness and
     no-self-attest decisions come from shared `checkUatProof`.
   - **covers —** `apps/desktop/src/backend/local-uat-attest.ts` (validation + shared trust guard)
     *(provisional path)*
3. **`luat-surfaces-broker-refusal-without-forging-success`**
   - **asserts —** any `persisted: false` writer result remains a failed attestation carrying the
     broker guidance/status; no local result claims the verdict was signed into the forest.
   - **covers —** `apps/desktop/src/backend/local-uat-attest.ts` (persistence result mapping)
     *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

- **TEST first —** add only `apps/desktop/src/backend/local-uat-attest.test.ts`, importing the future
  `attestLocalUat` (or final equivalent) from `"./local-uat-attest.js"`. Name tests with the three
  contract ids above.
- **RED —** the import is module-not-found because `local-uat-attest.ts` does not exist at HEAD.
- **GREEN —** add only `apps/desktop/src/backend/local-uat-attest.ts`, using
  `@storytree/orchestrator`'s `checkUatProof`, proof-protocol validation/build conventions, and the
  injected `ForestWriter`. The desktop package test and typecheck pass.

## Landed non-leaf composition

The capability pair deliberately excludes, while the desktop composition now supplies:

- chaining a `POST /api/uat/attest` dispatcher in `apps/desktop/electron/backend-entry.ts`, resolving
  the declared test context + clean HEAD + local operator identity there, and supplying the real
  broker writer; and
- the frontend permission bit that lets the shared `UatTestCriteriaSection` show its existing signing action
  for this trusted local member without changing `LOCAL_ME` to admin.

Those are composition bindings across already-proven seams, not part of this source/test pair.
They must preserve the fences above: no renderer-supplied signer, no machine-leg click, no dirty-tree
signature, and no success before broker persistence.
