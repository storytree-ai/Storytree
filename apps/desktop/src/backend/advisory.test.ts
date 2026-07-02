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
    activeSessions: async () => null,
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
