import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  releaseBranchClaims,
  parseMergedHeadRefs,
  type BranchClaimReleaseStore,
} from "./ingest-merge.js";

/**
 * Offline: exercises the FAIL-SOFT claim-release path (`releaseBranchClaims`) through FAKE
 * stores. NEVER touches the live DB and NEVER imports `pg` / the connector — the `main()`
 * entry is entry-guarded and never runs here. No STORYTREE_DB_LIVE leg.
 *
 * The presence-half tests (sessionIdFromBranch / retireMergedSession) retired with the
 * presence core (ADR-0200 D7).
 */

/** Capture log lines instead of writing to the console. */
function capture() {
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

// ── IDEMPOTENCE: two callers, one merge (ADR-0345 D4 / ADR-0304 D3) ──────────

/**
 * A claim store with REAL release semantics: rows keyed by branch, delete-what-matches, and the
 * waiter promotion the live store performs in the same transaction. Enough to prove the property
 * the merge-queue fix depends on — that a merge seen by BOTH the automerge job and claim-release.yml
 * is a clean no-op the second time, and that the second release cannot disturb the waiter the first
 * one promoted (the waiter's row carries its OWN branch).
 */
class StatefulClaimStore implements BranchClaimReleaseStore {
  readonly rows: { unitId: string; branch: string; grade: "work" | "waiting" }[] = [];
  releaseCalls = 0;

  constructor(rows: { unitId: string; branch: string; grade: "work" | "waiting" }[]) {
    this.rows.push(...rows);
  }

  async releaseClaimsByBranch(branch: string): Promise<number> {
    this.releaseCalls++;
    const removed = this.rows.filter((r) => r.branch === branch);
    for (const row of removed) this.rows.splice(this.rows.indexOf(row), 1);
    // The live store promotes each freed unit's oldest live waiter inside the same transaction.
    for (const row of removed) {
      const waiter = this.rows.find((r) => r.unitId === row.unitId && r.grade === "waiting");
      if (waiter !== undefined) waiter.grade = "work";
    }
    return removed.length;
  }
}

test("releaseBranchClaims: a SECOND release of the same branch is a clean no-op (both callers fire)", async () => {
  // Under a merge queue the automerge job's step and claim-release.yml can both see one merge.
  const store = new StatefulClaimStore([
    { unitId: "unit-alpha", branch: "claude/merged", grade: "work" },
    { unitId: "unit-beta", branch: "claude/merged", grade: "work" },
  ]);
  const { log, lines } = capture();

  const first = await releaseBranchClaims(store, "claude/merged", log);
  const second = await releaseBranchClaims(store, "claude/merged", log);

  assert.equal(first, 2, "the first release clears both claims");
  assert.equal(second, 0, "the second finds nothing — a no-op, NOT a failure (never -1)");
  assert.equal(store.releaseCalls, 2, "both releases were genuinely attempted");
  assert.equal(store.rows.length, 0, "no rows resurrected or double-counted");
  assert.ok(
    lines.some((l) => l.includes("nothing to release")),
    "the second release logged the no-op",
  );
});

test("releaseBranchClaims: a second release does NOT disturb the waiter the first one promoted", async () => {
  // The real hazard of double-firing: the promoted waiter now holds the unit on ITS OWN branch, and
  // a release keyed on the MERGED branch must not touch it.
  const store = new StatefulClaimStore([
    { unitId: "unit-alpha", branch: "claude/merged", grade: "work" },
    { unitId: "unit-alpha", branch: "claude/waiting-session", grade: "waiting" },
  ]);
  const { log } = capture();

  await releaseBranchClaims(store, "claude/merged", log);
  const promoted = store.rows.find((r) => r.branch === "claude/waiting-session");
  assert.equal(promoted?.grade, "work", "the first release promoted the waiter (live-store contract)");

  const second = await releaseBranchClaims(store, "claude/merged", log);

  assert.equal(second, 0, "the second release clears nothing");
  assert.equal(store.rows.length, 1, "the promoted session keeps its claim");
  assert.equal(
    store.rows[0]?.branch,
    "claude/waiting-session",
    "and it is the promoted waiter's own branch that survives",
  );
});

// ── parseMergedHeadRefs: one merge is not always one branch ──────────────────

test("parseMergedHeadRefs: splits a BATCH (a queue merge can land several PRs in one push)", () => {
  assert.deepEqual(
    parseMergedHeadRefs("claude/one\nclaude/two\nclaude/three"),
    ["claude/one", "claude/two", "claude/three"],
    "newline-separated (how the resolver emits them)",
  );
  assert.deepEqual(
    parseMergedHeadRefs("claude/one, claude/two"),
    ["claude/one", "claude/two"],
    "comma-separated with surrounding space",
  );
});

test("parseMergedHeadRefs: trims, drops blanks, and dedupes order-preservingly", () => {
  assert.deepEqual(
    parseMergedHeadRefs("  claude/one  \n\n claude/two \nclaude/one\n"),
    ["claude/one", "claude/two"],
    "one branch released once, in first-seen order",
  );
  assert.deepEqual(parseMergedHeadRefs(""), [], "empty input yields no branches");
  assert.deepEqual(parseMergedHeadRefs("   \n  "), [], "whitespace-only yields no branches");
  assert.deepEqual(parseMergedHeadRefs(undefined), [], "undefined yields no branches");
});

test("parseMergedHeadRefs: keeps ANY branch shape — no claude/* filtering", () => {
  // The `claude/*` gate is what cost PR #1024's `worktree-…` claim its machine clear.
  assert.deepEqual(
    parseMergedHeadRefs("worktree-adr0270-capability-grain\nclaude/real/x-abc123\nrenovate/pg-8"),
    ["worktree-adr0270-capability-grain", "claude/real/x-abc123", "renovate/pg-8"],
    "lobby-ceremony, promotion and non-session branch shapes all survive parsing",
  );
});

// ── The CI wiring (ci-clear-on-merge): the YAML that invokes this writer ──────

/** The repo-root workflow this writer is wired into (packages/notice-board/src/store → root). */
const CI_YAML_URL = new URL("../../../../.github/workflows/ci.yml", import.meta.url);

/** The merge-queue-reachable release path (ADR-0345 D4) — the second caller of this writer. */
const CLAIM_RELEASE_YAML_URL = new URL(
  "../../../../.github/workflows/claim-release.yml",
  import.meta.url,
);

test("ci.yml wiring: the claim-release writer runs for ANY merged head branch — no claude/* shape gate", () => {
  const yaml = readFileSync(CI_YAML_URL, "utf8");

  // The automerge job must still invoke this writer at all (the capability's wiring assertion).
  assert.ok(
    yaml.includes("src/store/ingest-merge.ts"),
    "the automerge job invokes the ingest-merge claim-release writer",
  );

  // Claims are keyed by the FULL head branch, and any branch shape can hold them: the ADR-0200 D3
  // lobby ceremony mints `worktree-…` branches, and PR #1024's `worktree-adr0270-capability-grain`
  // work claim survived its merge by 46 minutes because every release step was gated
  // `startsWith(head.ref, 'claude/')`. The machine clear (ADR-0142) must not depend on shape.
  assert.ok(
    !yaml.includes("startsWith(github.event.pull_request.head.ref, 'claude/')"),
    "no automerge step is gated on a claude/* head-ref prefix — the claim clear must run for every merged branch shape",
  );
});

// ── The merge-queue-reachable wiring (ADR-0345 D4 / ADR-0304 D3) ─────────────

test("claim-release.yml: the writer has a SECOND caller that a merge queue can reach", () => {
  const yaml = readFileSync(CLAIM_RELEASE_YAML_URL, "utf8");

  // THE WHOLE POINT. ci.yml's automerge job is `pull_request`-only and gated on
  // `steps.merge.outputs.merged == 'true'`; under a merge queue `gh pr merge` QUEUES, so that gate
  // is false for every PR and the queue's later merge would release nothing. If this assertion ever
  // fails, switching the queue on strands every merged branch's claims forever, silently.
  assert.ok(
    yaml.includes("src/store/ingest-merge.ts"),
    "claim-release.yml invokes the ingest-merge claim-release writer",
  );

  // Keyed on the merge that ACTUALLY landed on main — the trigger a queue merge produces.
  assert.match(
    yaml,
    /on:[\s\S]*?push:\s*\n\s*branches:\s*\[main\]/,
    "triggered by a push to main (the merge-queue merge, and a human UI merge)",
  );

  // The PR-side view of the same merge, and the guard that a merely-CLOSED PR releases nothing —
  // its session may still be working, and erasing a live claim is worse than a late release.
  assert.ok(
    yaml.includes("github.event.pull_request.merged == true"),
    "a closed-but-not-merged PR releases nothing",
  );

  // Loud here, precisely because this workflow gates nothing — the defect being fixed is a SILENT
  // release failure, so a swallowed one here would rebuild the same class.
  assert.ok(
    yaml.includes('STORYTREE_CLAIM_RELEASE_STRICT: "1"'),
    "the standalone release runs in STRICT mode so a failed release is a red run, not a silent one",
  );

  // Same claim-shape blindness the automerge job is held to.
  assert.ok(
    !yaml.includes("claude/*") && !yaml.includes("startsWith(github.ref, 'claude/')"),
    "no branch-shape gate — claims are keyed on the FULL branch, any shape (PR #1024)",
  );
});

test("claim-release.yml: a cancelled run would be a LOST release, so it never cancels", () => {
  const yaml = readFileSync(CLAIM_RELEASE_YAML_URL, "utf8");
  assert.ok(
    yaml.includes("cancel-in-progress: false"),
    "in-progress claim releases are never cancelled (a cancelled release is a lost release)",
  );
});
