// Tests for the advisory-read helper (apps/desktop/src/backend/advisory.ts).
//
// WHAT IT PINS: the sidecar's advisory overlay reads (verdicts / activity / presence / claims)
// stay ADVISORY on failure — null, never a throw (ADR-0033 under-claiming) — but a failure is no
// longer SILENT: each failing read emits one bounded stderr line naming the read and the cause,
// so an operator inspecting the sidecar output can tell a failing overlay from a genuinely empty
// one. Dedupe pins the bound: the poll cadence (every tree render re-runs all five reads) must
// not turn one down-DB into a log torrent — an unchanged failure logs once per failing streak.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { createAdvisoryReader } from "./advisory.js";
import { createLocalBackend } from "./local-backend.js";
import type { LocalBackendDeps } from "./local-backend.js";

/** Collects log lines instead of writing to stderr — the injected observability seam. */
function captureLog(): { lines: string[]; log: (line: string) => void } {
  const lines: string[] = [];
  return { lines, log: (line) => lines.push(line) };
}

// THE CHIP'S RED→GREEN CORE: a failing advisory read still answers null (the ADR-0033 contract,
// unchanged) AND emits one log line carrying the read's name and the failure message.
test("advisory: a throwing read returns null AND emits a named failure log line", async () => {
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log });

  const result = await advisory("latest-verdicts", async () => {
    throw new Error("relation \"events.verdict\" does not exist");
  });

  assert.equal(result, null, "the advisory-null contract is unchanged — never a throw");
  assert.equal(lines.length, 1, "exactly one log line per failure");
  const line = lines[0];
  assert.ok(line, "the failure was logged");
  assert.ok(line.includes("latest-verdicts"), "the line names WHICH read failed");
  assert.ok(
    line.includes('relation "events.verdict" does not exist'),
    "the line carries the underlying failure message",
  );
});

// A successful read returns the value and logs nothing — observability only on failure.
test("advisory: a successful read returns the value and logs nothing", async () => {
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log });

  const result = await advisory("active-sessions", async () => ["s1"]);

  assert.deepEqual(result, ["s1"]);
  assert.equal(lines.length, 0, "no log noise on the healthy path");
});

// BOUNDED: the same failure repeating (the poll cadence over a down DB) logs ONCE per streak —
// not once per poll.
test("advisory: an unchanged repeated failure is deduped — one line per failing streak", async () => {
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log });
  const failing = async (): Promise<never> => {
    throw new Error("connection refused");
  };

  await advisory("in-flight-builds", failing);
  await advisory("in-flight-builds", failing);
  await advisory("in-flight-builds", failing);

  assert.equal(lines.length, 1, "an identical failure repeating logs exactly once");
});

// Dedupe is PER READ, not global — two different overlays failing both surface.
test("advisory: dedupe is per read name — a second read's failure still logs", async () => {
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log });
  const failing = async (): Promise<never> => {
    throw new Error("connection refused");
  };

  await advisory("in-flight-builds", failing);
  await advisory("in-flight-claims", failing);

  assert.equal(lines.length, 2, "each named read gets its own failure line");
});

// A recovery resets the streak: fail → succeed → fail logs the second failure — the operator
// sees the overlay went down AGAIN, not silence.
test("advisory: a success resets dedupe — a re-failure after recovery logs again", async () => {
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log });

  await advisory("presence", async () => {
    throw new Error("connection refused");
  });
  await advisory("presence", async () => "up");
  await advisory("presence", async () => {
    throw new Error("connection refused");
  });

  assert.equal(lines.length, 2, "the post-recovery failure is a new streak and logs");
});

// A CHANGED failure message within a streak logs — a timeout turning into a missing-table error
// is new information, not a repeat.
test("advisory: a different failure message within a streak logs — new cause, new line", async () => {
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log });

  await advisory("verdict-events", async () => {
    throw new Error("connection refused");
  });
  await advisory("verdict-events", async () => {
    throw new Error("relation missing");
  });

  assert.equal(lines.length, 2, "a changed cause is logged even mid-streak");
  assert.ok(lines[1]?.includes("relation missing"));
});

// The timeout arm is a failure like any other: null + a named log line (never a hang).
test("advisory: a timed-out read returns null and logs the timeout", async () => {
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ timeoutMs: 20, log });

  const result = await advisory("latest-verdicts", () => new Promise<never>(() => {}));

  assert.equal(result, null, "a timeout is an advisory null, not a hang");
  assert.equal(lines.length, 1);
  assert.ok(lines[0]?.includes("latest-verdicts"));
  assert.ok(lines[0]?.includes("timed out"), "the line says the read timed out");
});

// ---------------------------------------------------------------------------
// Route-level composition (the injected-stub pattern of local-backend.test.ts): a backend whose
// overlay seam is an advisory read over a THROWING pool still serves the advisory-null shape on
// the wire — 200 { builds: null }, never a 500 — while the failure lands in the log.
// ---------------------------------------------------------------------------

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

// ---------------------------------------------------------------------------
// claim-wisp-cold-start (FIX 2b): the claims read gets a SOFTER per-read budget so a slow-but-
// under-budget DB cold-start survives (the fresh claim wisp is not dropped at 4s) — WITHOUT slowing
// the other four reads or letting /api/tree hang. The softening is a per-call timeoutMs override
// (and/or retryOnce). Timers are driven DETERMINISTICALLY: `setTimeout` is mocked (node:test mock
// timers) and advanced with tick(); the read fn is an ON-DEMAND-RESOLVED deferred we control — NO
// real wall-clock wait. `flush` drains the microtask queue so the Promise.race settles after a tick.
// ---------------------------------------------------------------------------

/** A promise whose resolution we trigger by hand — the controllable cold-start read. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Yield enough microtask turns for a settled Promise.race to propagate to its awaiter. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

// cwc-claims-read-survives-cold-start — a claims read with the softer budget, given a fn that
// resolves AFTER the shared 4s but WITHIN the softened budget, returns the CLAIM (not null).
// RED at HEAD: createAdvisoryReader ignores the per-call override, so the read nulls at 4s.
test("cwc-claims-read-survives-cold-start", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log }); // shared default 4s

  // A cold-starting DB: the query is a deferred we resolve after advancing past the shared 4s.
  const claim = [{ unitId: "spawn-visibility", kind: "claim" as const }];
  const d = deferred<typeof claim>();

  // The claims read opts into a softer 10s per-read budget at its call site.
  const read = advisory("in-flight-claims", () => d.promise, { timeoutMs: 10_000 });

  // Advance past the shared 4s (the old drop point) but UNDER the softened 10s: no timeout fires.
  t.mock.timers.tick(5_000);
  await flush();
  // The cold-start warms up and the query resolves — within the softened budget.
  d.resolve(claim);
  const result = await read;

  assert.deepEqual(
    result,
    claim,
    "the claim survives a slow-but-under-budget cold-start — not dropped at 4s",
  );
  assert.equal(lines.length, 0, "a survived cold-start is not a failure — nothing logged");
});

// cwc-only-the-claims-read-gets-the-softer-budget — a NON-claims read (no override) given the same
// slow cold-start STILL nulls at the shared 4s. The softening is targeted, never a blanket raise.
test("cwc-only-the-claims-read-gets-the-softer-budget", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log }); // shared default 4s

  // A deferred that never resolves within the window — the slow cold-start.
  const d = deferred<string>();

  // No opts → the shared 4s applies. This read should time out at 4s.
  const read = advisory("latest-verdicts", () => d.promise);

  // Advance to the shared 4s: the timeout arm wins for a non-claims read.
  t.mock.timers.tick(4_000);
  await flush();
  const result = await read;

  assert.equal(result, null, "a non-claims read keeps the shared 4s — nulls, never a blanket raise");
  assert.equal(lines.length, 1, "the timeout is logged as a failure");
  assert.ok(lines[0]?.includes("latest-verdicts"));
  assert.ok(lines[0]?.includes("timed out"));
});

// cwc-still-null-on-genuine-failure — a genuinely failing claims read (throws) still returns null
// (never a throw); with retryOnce the fn is invoked at most TWICE (retry fires at most once — no
// unbounded loop), so a genuinely down DB still nulls promptly.
test("cwc-still-null-on-genuine-failure", async () => {
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log });

  let calls = 0;
  const failing = async (): Promise<never> => {
    calls += 1;
    throw new Error("connection refused");
  };

  const result = await advisory("in-flight-claims", failing, {
    timeoutMs: 10_000,
    retryOnce: true,
  });

  assert.equal(result, null, "a genuinely failing claims read still nulls — never a throw (ADR-0033)");
  assert.equal(calls, 2, "retryOnce fires at most ONCE — the fn is invoked twice, no unbounded loop");
  assert.equal(lines.length, 1, "one failure line for the streak");
});

test("advisory: a failing overlay read logs AND the route still answers the advisory-null shape", async () => {
  const { lines, log } = captureLog();
  const advisory = createAdvisoryReader({ log });

  // The backend-entry composition in miniature: the seam is advisory() over a read that throws
  // (a stopped DB / missing table), injected exactly like local-backend.test.ts's stub backend.
  const backend: LocalBackendDeps["backend"] = {
    listAssets: async () => [],
    health: async () => ({ db: "unreachable" as const }),
    latestVerdicts: async () => advisory("latest-verdicts", async () => {
      throw new Error("connection refused");
    }),
    inFlightBuilds: async () =>
      advisory("in-flight-builds", async () => {
        throw new Error("connection refused");
      }),
  };
  const handler = createLocalBackend({
    storiesDir: "/tmp/advisory-test-stories-empty",
    docsDir: "/tmp/advisory-test-docs-empty",
    backend,
    store: "pg",
  });

  await withServer(handler, async (base) => {
    const res = await fetch(`${base}/api/activity`);
    assert.equal(res.status, 200, "the advisory contract holds on the wire — 200, not a 500");
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body["builds"], null, "{ builds: null } — the under-claiming shape, unchanged");
  });

  assert.ok(
    lines.some((l) => l.includes("in-flight-builds") && l.includes("connection refused")),
    "the operator can see WHY the overlay is absent",
  );
});
