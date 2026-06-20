import test from "node:test";
import assert from "node:assert/strict";
import { reapStaleSessions, type ReaperStore } from "./reaper.js";
import type { PresenceDeclarationDoc } from "../presence.js";

/**
 * Offline: exercises the FAIL-SOFT possibly-dead sweep (`reapStaleSessions`) through a FAKE
 * store. NEVER touches the live DB and NEVER imports `pg` / the connector. The sweep is the
 * durable backstop the one-shot merge-retire cannot be: it catches sessions that re-declared
 * after their merge, merged under a different branch, or never merged at all (ADR-0041
 * "Known limitation" — the data-side janitor it reserved).
 */

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** A fixed "now" so every band is deterministic (no clock reads). */
const NOW = new Date("2026-06-20T12:00:00.000Z");

/** Elapsed-from-NOW helpers, in ISO. */
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function doc(
  sessionId: string,
  lastSeenAt: string,
  status: "active" | "done" = "active",
): PresenceDeclarationDoc {
  return {
    sessionId,
    branch: `claude/${sessionId}`,
    workingOn: `interactive session on claude/${sessionId}`,
    nodes: [],
    status,
    startedAt: "2026-06-10T00:00:00.000Z",
    lastSeenAt,
  };
}

// ── Fakes ───────────────────────────────────────────────────────────────────

/** Records every done() call; listActive returns only the active rows (like the real store). */
class FakeReaperStore implements ReaperStore {
  readonly doneCalls: { sessionId: string; lastSeenAt: string }[] = [];
  constructor(private readonly rows: PresenceDeclarationDoc[]) {}
  async listActive(): Promise<PresenceDeclarationDoc[]> {
    return this.rows.filter((d) => d.status === "active");
  }
  async done(sessionId: string, lastSeenAt: string): Promise<unknown> {
    this.doneCalls.push({ sessionId, lastSeenAt });
    return { status: "done" };
  }
}

/** listActive throws — proves the sweep swallows a list failure (DB idle-stopped). */
class ListThrowingStore implements ReaperStore {
  doneCount = 0;
  async listActive(): Promise<PresenceDeclarationDoc[]> {
    throw new Error("simulated: DB idle-stopped on listActive");
  }
  async done(): Promise<unknown> {
    this.doneCount++;
    return null;
  }
}

/** done() throws for one specific id — proves one bad row doesn't abort the sweep. */
class PartialThrowingStore implements ReaperStore {
  readonly succeeded: string[] = [];
  constructor(
    private readonly rows: PresenceDeclarationDoc[],
    private readonly throwFor: string,
  ) {}
  async listActive(): Promise<PresenceDeclarationDoc[]> {
    return this.rows.filter((d) => d.status === "active");
  }
  async done(sessionId: string): Promise<unknown> {
    if (sessionId === this.throwFor) throw new Error("simulated: transient write failure");
    this.succeeded.push(sessionId);
    return { status: "done" };
  }
}

function capture(): { log: (m: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (m: string) => lines.push(m), lines };
}

// ── The sweep ─────────────────────────────────────────────────────────────────

test("reapStaleSessions: retires only possibly-dead active rows, preserving lastSeenAt", async () => {
  const oldSeen = hoursAgo(120);
  const store = new FakeReaperStore([
    doc("fresh-one", minutesAgo(10)), // fresh — keep
    doc("stale-one", hoursAgo(2)), // stale (1–4h) — keep
    doc("dead-one", hoursAgo(5)), // possibly-dead — reap
    doc("dead-two", oldSeen), // possibly-dead — reap
  ]);
  const { log, lines } = capture();

  const retired = await reapStaleSessions(store, NOW, log);

  assert.equal(retired, 2, "exactly the two possibly-dead rows are reaped");
  assert.deepEqual(
    store.doneCalls.map((c) => c.sessionId).sort(),
    ["dead-one", "dead-two"],
    "fresh and stale are left untouched",
  );
  const deadTwo = store.doneCalls.find((c) => c.sessionId === "dead-two");
  assert.equal(deadTwo?.lastSeenAt, oldSeen, "done() preserves the row's original lastSeenAt");
  assert.ok(
    lines.some((l) => l.includes("swept 2")),
    "summary logged",
  );
});

test("reapStaleSessions: boundary — exactly 4h is possibly-dead (reaped), just under is stale (kept)", async () => {
  const store = new FakeReaperStore([
    doc("at-threshold", hoursAgo(4)), // == 4h → possibly-dead → reap
    doc("just-under", new Date(NOW.getTime() - (4 * 3_600_000 - 1)).toISOString()), // 1ms under → stale → keep
  ]);

  const retired = await reapStaleSessions(store, NOW, () => {});

  assert.equal(retired, 1);
  assert.deepEqual(
    store.doneCalls.map((c) => c.sessionId),
    ["at-threshold"],
  );
});

test("reapStaleSessions: nothing possibly-dead → zero retires, no done() calls", async () => {
  const store = new FakeReaperStore([doc("fresh-one", minutesAgo(5)), doc("stale-one", hoursAgo(3))]);
  const { log, lines } = capture();

  const retired = await reapStaleSessions(store, NOW, log);

  assert.equal(retired, 0);
  assert.equal(store.doneCalls.length, 0);
  assert.ok(lines.some((l) => l.includes("no possibly-dead")));
});

test("reapStaleSessions: a listActive failure is swallowed — returns 0, never rejects", async () => {
  const store = new ListThrowingStore();
  const { log, lines } = capture();

  const retired = await reapStaleSessions(store, NOW, log);

  assert.equal(retired, 0, "list failure → 0, not a throw");
  assert.equal(store.doneCount, 0, "no done() attempted when the list never came back");
  assert.ok(lines.some((l) => l.includes("advisory — ignored")));
});

test("reapStaleSessions: one row's done() throwing does not abort the rest of the sweep", async () => {
  const store = new PartialThrowingStore(
    [doc("dead-a", hoursAgo(10)), doc("dead-b", hoursAgo(10)), doc("dead-c", hoursAgo(10))],
    "dead-b",
  );
  const { log, lines } = capture();

  const retired = await reapStaleSessions(store, NOW, log);

  assert.equal(retired, 2, "two succeeded; the throwing one is counted out but not fatal");
  assert.deepEqual(store.succeeded.sort(), ["dead-a", "dead-c"]);
  assert.ok(lines.some((l) => l.includes("dead-b") && l.includes("advisory — ignored")));
});
