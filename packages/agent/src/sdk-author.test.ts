import { test } from "node:test";
import assert from "node:assert/strict";

import { ClaudeAgentAuthor, decideWrite } from "./sdk-author.js";
import type { SdkQueryFn } from "./sdk-author.js";

/**
 * OFFLINE tests for the SDK leaf (ADR-0030): the scope decision is pure code, and the query seam
 * is injectable, so every fail-closed property is provable without spawning the SDK (zero cost).
 * The live wiring is exercised by `storytree node build <id> --live` (the Phase-D smoke).
 */

const CWD = "C:/work/space";

const testOnlyInAuthor = (phase: string, rel: string): boolean =>
  phase === "AUTHOR_TEST" ? rel.endsWith(".test.cjs") : rel === "impl.cjs";

// ── decideWrite: the pure scope decision the PreToolUse hook applies ─────────

test("decideWrite allows an in-scope relative write", () => {
  const d = decideWrite({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "Write",
    toolInput: { file_path: "unit.test.cjs" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.deepEqual(d, { allow: true, relPath: "unit.test.cjs" });
});

test("decideWrite allows an in-scope ABSOLUTE write (relativized against cwd)", () => {
  const d = decideWrite({
    phase: "IMPLEMENT",
    cwd: CWD,
    toolName: "Write",
    toolInput: { file_path: `${CWD}/impl.cjs` },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.deepEqual(d, { allow: true, relPath: "impl.cjs" });
});

test("decideWrite denies the out-of-phase write (impl during AUTHOR_TEST)", () => {
  const d = decideWrite({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "Write",
    toolInput: { file_path: "impl.cjs" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(d.allow, false);
  if (d.allow) return;
  assert.match(d.reason, /phase scope/);
  assert.equal(d.relPath, "impl.cjs");
});

test("decideWrite denies the test write during IMPLEMENT (the test author is not the code author)", () => {
  const d = decideWrite({
    phase: "IMPLEMENT",
    cwd: CWD,
    toolName: "Edit",
    toolInput: { file_path: "unit.test.cjs" },
    isWriteAllowed: testOnlyInAuthor,
  });
  assert.equal(d.allow, false);
});

test("decideWrite denies a path that escapes the workspace", () => {
  const d = decideWrite({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "Write",
    toolInput: { file_path: "../outside.test.cjs" },
    isWriteAllowed: () => true,
  });
  assert.equal(d.allow, false);
  if (d.allow) return;
  assert.match(d.reason, /outside the workspace/);
});

test("decideWrite fails CLOSED on a write call with no readable file_path", () => {
  const d = decideWrite({
    phase: "AUTHOR_TEST",
    cwd: CWD,
    toolName: "Write",
    toolInput: { oops: true },
    isWriteAllowed: () => true,
  });
  assert.equal(d.allow, false);
  if (d.allow) return;
  assert.match(d.reason, /fail-closed/);
});

// ── ClaudeAgentAuthor result mapping over an injected (offline) query seam ───

function scripted(messages: unknown[]): SdkQueryFn {
  return async function* () {
    for (const m of messages) {
      yield m;
    }
  };
}

test("author => ok on an SDK success result, with cost/turns recorded", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: scripted([
      { type: "assistant", text: "writing..." },
      { type: "result", subtype: "success", is_error: false, num_turns: 3, total_cost_usd: 0.0421 },
    ]),
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.deepEqual(r, { ok: true });
  assert.equal(author.runs.length, 1);
  assert.equal(author.runs[0]?.turns, 3);
  assert.equal(author.totalCostUsd, 0.0421);
});

test("author => fail-closed on an SDK error result (max turns / budget)", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: scripted([
      {
        type: "result",
        subtype: "error_max_budget_usd",
        is_error: true,
        num_turns: 9,
        total_cost_usd: 1.01,
        errors: ["budget exceeded"],
      },
    ]),
  });

  const r = await author.author("IMPLEMENT", "implement it");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /error_max_budget_usd/);
  assert.match(r.error, /budget exceeded/);
});

test("author => fail-closed when the stream ends with NO result message", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: scripted([{ type: "assistant", text: "..." }]),
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /without a result message/);
});

test("author => fail-closed when the query itself throws (spawn/auth failure)", async () => {
  const author = new ClaudeAgentAuthor({
    cwd: CWD,
    isWriteAllowed: () => true,
    queryFn: () => {
      throw new Error("ENOENT: claude binary not found");
    },
  });

  const r = await author.author("AUTHOR_TEST", "author the failing test");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.error, /SDK session failed/);
});
