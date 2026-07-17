import test from "node:test";
import assert from "node:assert/strict";
import { releaseBranchClaims, type BranchClaimReleaseStore } from "./ingest-merge.js";

/**
 * Offline: exercises the FAIL-SOFT claim-release path (`releaseBranchClaims`) through FAKE
 * stores. NEVER touches the live DB and NEVER imports `pg` / the connector — the `main()`
 * entry is entry-guarded and never runs here. No STORYTREE_DB_LIVE leg.
 *
 * The presence-half tests (sessionIdFromBranch / retireMergedSession) retired with the
 * presence core (ADR-0200 D7).
 */

/** Capture log lines instead of writing to the console. */
function capture(): { log: (m: string) => void; lines: string[] } {
  const lines: string[] = [];
  return { log: (m: string) => lines.push(m), lines };
}

// ── releaseBranchClaims — the ADR-0138 §4 CI claim-clear (fail-soft) ──────────

/** Records every `releaseClaimsByBranch(branch)` call; returns a canned released count. */
class RecordingClaimStore implements BranchClaimReleaseStore {
  readonly calls: string[] = [];
  /** What `releaseClaimsByBranch()` resolves to: the number of claims released. */
  constructor(private readonly releasedCount: number = 1) {}
  async releaseClaimsByBranch(branch: string): Promise<number> {
    this.calls.push(branch);
    return this.releasedCount;
  }
}

/** A claim store whose release always throws — proves the writer swallows DB errors. */
class ThrowingClaimStore implements BranchClaimReleaseStore {
  callCount = 0;
  async releaseClaimsByBranch(): Promise<number> {
    this.callCount++;
    throw new Error("simulated: DB idle-stopped / connection refused");
  }
}

test("releaseBranchClaims: calls releaseClaimsByBranch with the branch, returns the count", async () => {
  const store = new RecordingClaimStore(3);
  const { log, lines } = capture();

  const released = await releaseBranchClaims(store, "claude/nostalgic-bose-4d127b", log);

  assert.equal(released, 3, "returns the released count");
  assert.deepEqual(store.calls, ["claude/nostalgic-bose-4d127b"], "called once with the branch");
  assert.ok(
    lines.some((l) => l.includes("released 3 claim")),
    "logged the release count",
  );
});

test("releaseBranchClaims: a zero count (branch holds no claims) is a clean no-op", async () => {
  const store = new RecordingClaimStore(0);
  const { log, lines } = capture();

  const released = await releaseBranchClaims(store, "claude/no-claims-here", log);

  assert.equal(released, 0, "zero is a successful no-op, not a failure");
  assert.equal(store.calls.length, 1, "release still attempted");
  assert.ok(
    lines.some((l) => l.includes("nothing to release")),
    "logged the no-op",
  );
});

test("releaseBranchClaims: a THROWING store is swallowed — returns -1, never rejects", async () => {
  const store = new ThrowingClaimStore();
  const { log, lines } = capture();

  // The whole point of the backstop: a DB error must NOT propagate (the merge already landed).
  const released = await releaseBranchClaims(store, "claude/any-branch", log);

  assert.equal(released, -1, "threw internally → -1, but resolved (did not reject)");
  assert.equal(store.callCount, 1, "release was attempted once");
  assert.ok(
    lines.some((l) => l.includes("advisory — ignored")),
    "logged the swallowed failure as advisory",
  );
});

test("releaseBranchClaims: keys on the FULL branch, never a tail-derived sessionId", async () => {
  // node_claim.branch stores the full branch, so a claude/real/* promotion branch must be
  // released by its full name, not its tail segment.
  const store = new RecordingClaimStore(1);
  const { log } = capture();

  await releaseBranchClaims(store, "claude/real/render-claim-as-wisp-abc123", log);

  assert.equal(
    store.calls[0],
    "claude/real/render-claim-as-wisp-abc123",
    "the full branch reaches releaseClaimsByBranch (not the 'render-claim-as-wisp-abc123' tail)",
  );
});
