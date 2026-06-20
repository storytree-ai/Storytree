import test from "node:test";
import assert from "node:assert/strict";
import {
  sessionIdFromBranch,
  retireMergedSession,
  type MergeRetireStore,
} from "./ingest-merge.js";

/**
 * Offline: exercises the PURE arg-derivation (`sessionIdFromBranch`) and the FAIL-SOFT
 * retire path (`retireMergedSession`) through FAKE stores. NEVER touches the live DB and
 * NEVER imports `pg` / the connector — the `main()` entry is entry-guarded and never runs
 * here. No STORYTREE_DB_LIVE leg.
 */

// ── Fakes ────────────────────────────────────────────────────────────────────

/** Records every `done(sessionId, lastSeenAt)` call; returns a canned result. */
class RecordingStore implements MergeRetireStore {
  readonly calls: { sessionId: string; lastSeenAt: string }[] = [];
  /** What `done()` resolves to: a retired doc (object) or `null` (no row). */
  constructor(private readonly resolveWith: unknown = { status: "done" }) {}
  async done(sessionId: string, lastSeenAt: string): Promise<unknown> {
    this.calls.push({ sessionId, lastSeenAt });
    return this.resolveWith;
  }
}

/** A store whose `done()` always throws — proves the writer swallows DB errors. */
class ThrowingStore implements MergeRetireStore {
  callCount = 0;
  async done(): Promise<unknown> {
    this.callCount++;
    throw new Error("simulated: DB idle-stopped / connection refused");
  }
}

/** Capture log lines instead of writing to the console. */
function capture(): { log: (m: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (m: string) => lines.push(m), lines };
}

// ── sessionIdFromBranch — pure derivation ────────────────────────────────────

test("sessionIdFromBranch: full claude head ref → tail after last slash", () => {
  assert.equal(sessionIdFromBranch("claude/nostalgic-bose-4d127b"), "nostalgic-bose-4d127b");
  assert.equal(sessionIdFromBranch("claude/oq-hygiene-gate-b71a"), "oq-hygiene-gate-b71a");
});

test("sessionIdFromBranch: slashed claude/real/* name → only the final segment", () => {
  // claude/real/<unit>-<run> head refs (ADR-0031) reduce to the run-tagged tail; this
  // never matches a session projection row, so done() simply no-ops on it.
  assert.equal(sessionIdFromBranch("claude/real/verdict-line-abc123"), "verdict-line-abc123");
});

test("sessionIdFromBranch: bare sessionId (no slash) is returned unchanged", () => {
  // The manual one-shot can pass a plain sessionId; derivation must be idempotent on it.
  assert.equal(sessionIdFromBranch("hardcore-lehmann-b71a0e"), "hardcore-lehmann-b71a0e");
});

test("sessionIdFromBranch: a non-session branch (e.g. main) passes through", () => {
  assert.equal(sessionIdFromBranch("main"), "main");
});

test("sessionIdFromBranch: surrounding whitespace is trimmed before splitting", () => {
  assert.equal(sessionIdFromBranch("  claude/nostalgic-bose-4d127b\n"), "nostalgic-bose-4d127b");
});

// ── retireMergedSession — done() is called with the derived id ───────────────

test("retireMergedSession: calls done() with the derived id + mergedAt, returns true", async () => {
  const store = new RecordingStore({ status: "done" });
  const { log, lines } = capture();
  const mergedAt = "2026-06-13T05:00:00.000Z";

  const ok = await retireMergedSession(store, "nostalgic-bose-4d127b", mergedAt, log);

  assert.equal(ok, true, "resolved cleanly");
  assert.equal(store.calls.length, 1, "done() called exactly once");
  assert.deepEqual(store.calls[0], { sessionId: "nostalgic-bose-4d127b", lastSeenAt: mergedAt });
  assert.ok(
    lines.some((l) => l.includes("retired presence")),
    "logged the retire",
  );
});

test("retireMergedSession: a null result (no row) is a clean no-op, still returns true", async () => {
  const store = new RecordingStore(null); // simulate PgPresenceStore.done() finding no row
  const { log, lines } = capture();

  const ok = await retireMergedSession(store, "non-session-branch", "2026-06-13T05:00:00.000Z", log);

  assert.equal(ok, true, "null is a successful no-op, not a failure");
  assert.equal(store.calls.length, 1, "done() still attempted");
  assert.ok(
    lines.some((l) => l.includes("nothing to retire")),
    "logged the no-op",
  );
});

test("retireMergedSession: a THROWING store is swallowed — returns false, never rejects", async () => {
  const store = new ThrowingStore();
  const { log, lines } = capture();

  // The whole point of the backstop: a DB error must NOT propagate (the merge already landed).
  const ok = await retireMergedSession(store, "any-session", "2026-06-13T05:00:00.000Z", log);

  assert.equal(ok, false, "threw internally → false, but resolved (did not reject)");
  assert.equal(store.callCount, 1, "done() was attempted once");
  assert.ok(
    lines.some((l) => l.includes("advisory — ignored")),
    "logged the swallowed failure as advisory",
  );
});

test("retireMergedSession: derived id flows end-to-end (branch → done())", async () => {
  const store = new RecordingStore();
  const { log } = capture();

  await retireMergedSession(
    store,
    sessionIdFromBranch("claude/oq-hygiene-gate-b71a"),
    "2026-06-13T05:00:00.000Z",
    log,
  );

  assert.equal(store.calls[0]?.sessionId, "oq-hygiene-gate-b71a", "tail-derived id reaches done()");
});
