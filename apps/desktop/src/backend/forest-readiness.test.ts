// Integration test for the forest-readiness probe (apps/desktop/src/backend/forest-readiness.ts).
//
// WHAT IT PINS (ADR-0117 d.5): the probe confirms the local backend can reach the HOSTED STUDIO'S
// WRITE-BROKER as an AUTHORIZED BUILDER before the agent loop runs — NOT a raw Cloud SQL socket.
//
// The probe takes an injected broker-POST seam (BrokerPostFn: (path, body) => { status, body }) and:
//   - returns { ready: true }  when the broker accepts with a 2xx status (AUTHORIZED BUILDER path)
//   - returns { ready: false, guidance } when the broker returns 403/401 (NOT YET A BUILDER —
//     fail-closed with guidance to ask the owner to grant the builder role via the Members panel)
//   - returns { ready: false, guidance } when the broker is UNREACHABLE (network error —
//     fail-closed with guidance to check whether the studio is up)
//   - returns { ready: false, guidance } when the broker HANGS past the timeoutMs deadline
//     (self-bounding — never stalls indefinitely; guided by the withTimeout/MEMBERS_RESOLVE_TIMEOUT_MS
//     precedent in serve.ts)
//
// INTEGRATION TIER: drives the probe with in-memory broker doubles — no real HTTP, no studio
// process, no Cloud SQL socket, no IAM grant. Four doubles cover the four readiness states:
//   AUTHORIZED (200), FORBIDDEN (403), UNREACHABLE (throws), HANGING (never resolves).
//
// DELETION TEST: removing probeForestReadiness breaks the import. Removing the 2xx-ready path
// causes test 1 to get ready:false. Removing the 403-specific builder-role guidance causes test 2
// to get generic/Cloud-SQL guidance. Removing the unreachable→studio guidance mapping causes test 3
// to get Cloud-SQL guidance. Removing the self-bounding timeout causes test 4 to hang until SIGKILL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Verdict } from "@storytree/proof-protocol";

import { probeForestReadiness, writeToForestBroker, WRITE_BROKER_PATH } from "./forest-readiness.js";
// The broker-post seam is now exported by the implementation (production wires it to a real `fetch`
// POST to the configured broker URL; tests inject in-memory doubles with controlled return values).
import type { BrokerPostFn } from "./forest-readiness.js";

// ---------------------------------------------------------------------------
// 1. AUTHORIZED BUILDER PATH — broker accepts (2xx → ready:true)
// ---------------------------------------------------------------------------

test("forest-readiness: an authorized broker POST returns ready:true", async () => {
  // AUTHORIZED double: the broker accepts the request (member has the builder role, 200 OK).
  const authorizedBroker: BrokerPostFn = async (_path, _body) => ({
    status: 200,
    body: { ok: true },
  });

  // RED-state note: the current implementation expects ForestConnectorFn (() => ForestConnection),
  // not BrokerPostFn. Under tsx types are stripped so the call proceeds at runtime; the current
  // impl treats the double as a DB connector, calls it with no args, receives { status: 200,
  // body: {} }, attempts conn.end() → TypeError: conn.end is not a function, catches the error,
  // and returns { ready: false } — causing the assertion below to FAIL (right-kind red).
  // In the GREEN state (after the new BrokerPostFn-based implementation lands) this passes.
  const result = await probeForestReadiness(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authorizedBroker as any,
    { timeoutMs: 2000 },
  );

  assert.equal(
    result.ready,
    true,
    "an authorized broker POST must yield ready:true — " +
      "the probe must treat a 2xx broker response as ready, not invoke conn.end()",
  );
});

// ---------------------------------------------------------------------------
// 2. FORBIDDEN PATH — broker returns 403 (not yet a builder → fail-closed)
// ---------------------------------------------------------------------------

test("forest-readiness: a 403-forbidden broker fails closed with builder-role guidance", async () => {
  // FORBIDDEN double: the broker returns 403 — the member has not been granted the builder role.
  const forbiddenBroker: BrokerPostFn = async (_path, _body) => ({
    status: 403,
    body: { error: "Forbidden" },
  });

  const result = await probeForestReadiness(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forbiddenBroker as any,
    { timeoutMs: 2000 },
  );

  assert.equal(
    result.ready,
    false,
    "a 403 broker response must yield ready:false — fail closed when not an authorized builder",
  );
  if (result.ready) assert.fail("probe must not report ready on 403");

  assert.ok(
    typeof result.guidance === "string" && result.guidance.length > 0,
    "forbidden result must carry a non-empty guidance string",
  );

  // Must mention the builder role — NOT Cloud SQL / IAM (authorization is an in-app grant via
  // the Members panel, not a gcloud IAM binding; ADR-0117 d.2).
  assert.ok(
    /builder/i.test(result.guidance),
    `guidance for a 403 must mention the builder role; got: "${result.guidance}"`,
  );
  assert.ok(
    !/Cloud SQL/i.test(result.guidance),
    `guidance for a 403 must not mention Cloud SQL (in-app grant, not IAM); got: "${result.guidance}"`,
  );
});

// ---------------------------------------------------------------------------
// 3. UNREACHABLE PATH — broker throws a network error → fail-closed
// ---------------------------------------------------------------------------

test("forest-readiness: an unreachable broker fails closed with studio-reachability guidance", async () => {
  // UNREACHABLE double: throws a fetch-shaped network error (the studio is down or URL is wrong).
  const unreachableBroker: BrokerPostFn = async (_path, _body) => {
    throw Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" });
  };

  const result = await probeForestReadiness(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    unreachableBroker as any,
    { timeoutMs: 2000 },
  );

  assert.equal(
    result.ready,
    false,
    "a network error from the broker must yield ready:false — fail closed when unreachable",
  );
  if (result.ready) assert.fail("probe must not report ready when the broker throws");

  assert.ok(
    typeof result.guidance === "string" && result.guidance.length > 0,
    "unreachable result must carry a non-empty guidance string",
  );

  // Must mention the studio / broker being unreachable — NOT Cloud SQL or IAM. The member action
  // is "check if the studio is up", not "run pnpm db:up" or "check IAM grant".
  assert.ok(
    /studio|broker/i.test(result.guidance),
    `guidance for an unreachable broker must mention the studio or broker; got: "${result.guidance}"`,
  );
  assert.ok(
    !/Cloud SQL/i.test(result.guidance),
    `guidance for an unreachable broker must not mention Cloud SQL; got: "${result.guidance}"`,
  );
});

// ---------------------------------------------------------------------------
// 4. HANGING PATH — broker never resolves (self-bounding timeout)
// ---------------------------------------------------------------------------

test("forest-readiness: a hanging broker fails closed within the supplied timeout", async () => {
  // HANGING double: never resolves — simulates an indefinitely-hung HTTP request.
  // No OS handles (no timers, no sockets): no handle leak; the process exits cleanly.
  const hangingBroker: BrokerPostFn = () =>
    new Promise<never>(() => {
      /* never resolves — no OS handle */
    });

  const PROBE_TIMEOUT_MS = 50;
  // Outer safety net: fires at GUARD_MS if the probe does NOT self-bound — the test fails clearly
  // rather than hanging until the spine's SIGKILL budget expires.
  const GUARD_MS = PROBE_TIMEOUT_MS + 150;

  let guardTimer: ReturnType<typeof setTimeout> | undefined;
  const outerGuard = new Promise<never>((_, reject) => {
    guardTimer = setTimeout(
      () =>
        reject(
          new Error(
            `probeForestReadiness did not fail-close within ${GUARD_MS}ms — ` +
              `the probe must self-bound when the broker hangs (timeoutMs option required)`,
          ),
        ),
      GUARD_MS,
    );
  });

  try {
    const result = await Promise.race([
      probeForestReadiness(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hangingBroker as any,
        { timeoutMs: PROBE_TIMEOUT_MS },
      ),
      outerGuard,
    ]);

    assert.equal(
      result.ready,
      false,
      "a hanging broker must yield ready:false within the timeout",
    );
    if (result.ready) assert.fail("probe must not report ready when the broker hangs");

    assert.ok(
      typeof result.guidance === "string" && result.guidance.length > 0,
      "timeout result must carry a non-empty guidance string",
    );

    // Must mention the studio / broker — NOT Cloud SQL (the member action is "check if the
    // studio is up", not "run pnpm db:up").
    assert.ok(
      /studio|broker/i.test(result.guidance),
      `guidance for a hanging broker must mention the studio or broker; got: "${result.guidance}"`,
    );
    assert.ok(
      !/Cloud SQL/i.test(result.guidance),
      `guidance for a hanging broker must not mention Cloud SQL; got: "${result.guidance}"`,
    );
  } finally {
    // Always clear the outer guard timer — no handle leak regardless of pass/fail.
    clearTimeout(guardTimer);
  }
});

// ===========================================================================
// WRITE CLIENT (ADR-0117 d.2–d.4, contract `fr-write-brokers-not-direct`)
//
// The positive half of the re-home: the local backend's locally-signed Verdict reaches the SHARED
// forest by POSTing the `{ type, payload }` envelope to the studio's write-broker — opening NO DB
// connection. These cases pin: the EXACT shape reaches the broker POST (attributed to the member);
// a 2xx broker response → persisted; a 401/403/4xx / network-error / hang → a clear NOT-persisted
// result (never a silent success, never a forged "persisted"). Verdict is the ONLY write type —
// the brokered PresenceDeclaration branch retired with self-reported presence (ADR-0200 D7).
// ===========================================================================

const MEMBER = "friend-builder@example.com";

interface BrokerCall {
  path: string;
  body: unknown;
}

/** A broker double that records every POST and returns a fixed response. */
function recordingBroker(response: { status: number; body: unknown }): {
  post: BrokerPostFn;
  calls: BrokerCall[];
} {
  const calls: BrokerCall[] = [];
  const post: BrokerPostFn = async (p, b) => {
    calls.push({ path: p, body: b });
    return response;
  };
  return { post, calls };
}

/** A minimal fully-valid, locally-signed Verdict attributed to the member (signer ≡ member). */
function memberVerdict() {
  return Verdict.parse({
    unitId: "shared-forest-connection#gate-1",
    proofMode: "capability",
    outcome: "pass",
    commitSha: "cafebabecafebabecafebabecafebabecafebabe",
    signer: MEMBER,
    runId: "run-desktop-write-1",
    at: "2026-06-27T10:00:00.000Z",
  });
}

// ---------------------------------------------------------------------------
// 5. THE WRITE REACHES THE BROKER — exact Verdict shape, 2xx → persisted
// ---------------------------------------------------------------------------

test("write client: POSTs the exact { type, payload } Verdict envelope and reports persisted on 2xx", async () => {
  const verdict = memberVerdict();
  const { post, calls } = recordingBroker({ status: 201, body: { ok: true, verdict } });

  const result = await writeToForestBroker(post, { type: "verdict", payload: verdict });

  // The body reached the broker POST — at the write-broker endpoint, as the { type, payload }
  // envelope, carrying the EXACT signed verdict attributed to the member (signer ≡ member).
  assert.equal(calls.length, 1, "exactly one broker POST");
  const call = calls[0];
  assert.ok(call, "the broker seam was called");
  assert.equal(call.path, WRITE_BROKER_PATH, "POSTs to the write-broker endpoint, not a DB socket");
  assert.deepEqual(
    call.body,
    { type: "verdict", payload: verdict },
    "the POST body is the exact { type, payload } envelope with the signed verdict",
  );
  const sentBody = call.body as { payload: { signer: string } };
  assert.equal(sentBody.payload.signer, MEMBER, "the verdict is attributed to the member (signer)");

  assert.equal(result.persisted, true, "a 2xx broker response means persisted");
  if (result.persisted) {
    assert.equal(result.status, 201);
    assert.deepEqual(result.body, { ok: true, verdict }, "carries the broker's response envelope");
  }
});

// ---------------------------------------------------------------------------
// 6. PRESENCE IS RETIRED (ADR-0200 D7) — the ForestWrite union carries NO presence branch
// ---------------------------------------------------------------------------

test("write client: forest-readiness.ts carries no presence write branch (ADR-0200 D7)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "forest-readiness.ts"), "utf8");
  // The union is verdict-only: no `type: "presence"` member and no notice-board shape import.
  assert.ok(
    !/type:\s*"presence"/.test(src),
    "ForestWrite must not carry a presence branch — brokered presence retired with ADR-0200 D7",
  );
  const imports = src
    .split(/\r?\n/)
    .filter((l) => /^\s*import\b/.test(l))
    .join("\n");
  assert.ok(
    !/@storytree\/notice-board/.test(imports),
    "the write client no longer imports the notice-board presence shapes",
  );
});

// ---------------------------------------------------------------------------
// 7. FORBIDDEN — a 403 fails closed (NOT persisted) with builder-role guidance
// ---------------------------------------------------------------------------

test("write client: a 403 broker response fails closed (not persisted) with builder-role guidance", async () => {
  const { post } = recordingBroker({ status: 403, body: { error: "builder or admin role required" } });

  const result = await writeToForestBroker(post, { type: "verdict", payload: memberVerdict() });

  assert.equal(result.persisted, false, "403 must NOT be reported as persisted — never a forged success");
  if (result.persisted) assert.fail("a 403 must never report persisted");
  assert.equal(result.status, 403);
  assert.ok(result.guidance.length > 0, "a forbidden write carries a non-empty guidance string");
  // In-app builder grant (Members panel), NOT a Cloud SQL / IAM binding (ADR-0117 d.2).
  assert.ok(/builder/i.test(result.guidance), `guidance must mention the builder role; got: "${result.guidance}"`);
  assert.ok(
    !/Cloud SQL/i.test(result.guidance),
    `guidance must not mention Cloud SQL (in-app grant, not IAM); got: "${result.guidance}"`,
  );
});

// ---------------------------------------------------------------------------
// 8. BAD SHAPE — a 400 fails closed (NOT persisted)
// ---------------------------------------------------------------------------

test("write client: a 400 broker response fails closed (not persisted) — the broker rejected the shape", async () => {
  const { post } = recordingBroker({ status: 400, body: { error: "invalid verdict shape" } });

  const result = await writeToForestBroker(post, { type: "verdict", payload: memberVerdict() });

  assert.equal(result.persisted, false, "a 400 must NOT be reported as persisted");
  if (result.persisted) assert.fail("a 400 must never report persisted");
  assert.equal(result.status, 400);
  assert.ok(result.guidance.length > 0, "a rejected write carries a non-empty guidance string");
});

// ---------------------------------------------------------------------------
// 9. UNAUTHENTICATED — a 401 fails closed (NOT persisted)
// ---------------------------------------------------------------------------

test("write client: a 401 broker response fails closed (not persisted) — authentication required", async () => {
  const { post } = recordingBroker({ status: 401, body: { error: "authentication required" } });

  const result = await writeToForestBroker(post, { type: "verdict", payload: memberVerdict() });

  assert.equal(result.persisted, false, "a 401 must NOT be reported as persisted");
  if (result.persisted) assert.fail("a 401 must never report persisted");
  assert.equal(result.status, 401);
  assert.ok(result.guidance.length > 0, "an unauthenticated write carries a non-empty guidance string");
});

// ---------------------------------------------------------------------------
// 10. UNREACHABLE — a network error fails closed (NOT persisted, status null)
// ---------------------------------------------------------------------------

test("write client: an unreachable broker (throws) fails closed (not persisted, no forged success)", async () => {
  const post: BrokerPostFn = async () => {
    throw Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" });
  };

  const result = await writeToForestBroker(post, { type: "verdict", payload: memberVerdict() });

  assert.equal(result.persisted, false, "a network error must NEVER be reported as persisted");
  if (result.persisted) assert.fail("an unreachable broker must never report persisted");
  assert.equal(result.status, null, "no HTTP status for a network error");
  assert.ok(result.guidance.length > 0, "an unreachable write carries a non-empty guidance string");
  assert.ok(/studio|broker/i.test(result.guidance), "guidance points at studio/broker reachability");
  assert.ok(!/Cloud SQL/i.test(result.guidance), "guidance must not mention Cloud SQL");
});

// ---------------------------------------------------------------------------
// 11. HANGING — bounded by the timeout (NOT persisted, never hangs)
// ---------------------------------------------------------------------------

test("write client: a hanging broker is bounded by the timeout (not persisted, never hangs)", async () => {
  // HANGING double: never resolves — no OS handles, so the process still exits cleanly.
  const post: BrokerPostFn = () => new Promise<never>(() => {});

  const WRITE_TIMEOUT_MS = 50;
  const GUARD_MS = WRITE_TIMEOUT_MS + 150;
  let guardTimer: ReturnType<typeof setTimeout> | undefined;
  const outerGuard = new Promise<never>((_, reject) => {
    guardTimer = setTimeout(
      () => reject(new Error(`writeToForestBroker did not self-bound within ${GUARD_MS}ms`)),
      GUARD_MS,
    );
  });

  try {
    const result = await Promise.race([
      writeToForestBroker(post, { type: "verdict", payload: memberVerdict() }, { timeoutMs: WRITE_TIMEOUT_MS }),
      outerGuard,
    ]);

    assert.equal(result.persisted, false, "a hanging broker must NOT be reported as persisted");
    if (result.persisted) assert.fail("a hanging broker must never report persisted");
    assert.equal(result.status, null, "no HTTP status for a timed-out write");
    assert.ok(result.guidance.length > 0, "a timed-out write carries a non-empty guidance string");
    assert.ok(/studio|broker/i.test(result.guidance), "guidance points at studio/broker reachability");
  } finally {
    clearTimeout(guardTimer);
  }
});

// ---------------------------------------------------------------------------
// 12. BROKERS, NOT DIRECT — the module imports no DB connector and no studio server
// ---------------------------------------------------------------------------

test("write client: forest-readiness.ts imports no pg connector and no studio server (brokers-not-direct)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "forest-readiness.ts"), "utf8");
  // Check IMPORT lines only — prose comments legitimately mention these names.
  const imports = src
    .split(/\r?\n/)
    .filter((l) => /^\s*import\b/.test(l))
    .join("\n");

  assert.ok(!/cloud-sql-connector/.test(imports), "must not import the Cloud SQL connector");
  assert.ok(!/\bfrom\s+["']pg["']/.test(imports), "must not import pg");
  assert.ok(!/@storytree\/store/.test(imports), "must not import the dissolved @storytree/store");
  assert.ok(!/@storytree\/library\/store/.test(imports), "must not import the library node-only pg store");
  assert.ok(!/studio\/server/.test(imports), "must not import the studio server (surface boundary, ADR-0100)");
});
