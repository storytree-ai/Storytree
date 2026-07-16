// Offline table-tests for the pure claim-gate decision (ADR-0200 D3): a session lands only while
// it HOLDS a live claim — any grade. The I/O arms (SKIP offline, the PgClaimStore read) stay in
// the script's main() and are not exercised here.
import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateDeclared } from "./check-declared.js";

const SESSION = "lucid-carson-2fe321";

test("fail on zero claims — the unclaimed session cannot land", () => {
  const res = evaluateDeclared({ sessionId: SESSION, claims: [] });
  assert.equal(res.verdict, "fail");
  assert.match(res.message, new RegExp(SESSION));
  // The guidance names the claim ceremony, not the retired presence wording.
  assert.match(res.message, /noticeboard claim/);
  assert.match(res.message, /worktree create/);
  assert.match(res.message, /noticeboard declare/);
  assert.match(res.message, /ADR-0200/);
});

test("ok on one exploring claim (a `worktree create` birth claim passes)", () => {
  const res = evaluateDeclared({
    sessionId: SESSION,
    claims: [{ unitId: "notice-board", grade: "exploring" }],
  });
  assert.equal(res.verdict, "ok");
  assert.match(res.message, /notice-board/);
});

test("ok on one work claim (a `declare --node` claim passes; absent grade IS work)", () => {
  const res = evaluateDeclared({
    sessionId: SESSION,
    claims: [{ unitId: "notice-board" }],
  });
  assert.equal(res.verdict, "ok");
  assert.match(res.message, /notice-board/);
  assert.match(res.message, /work/);
});

test("ok on multiple mixed grades — the message lists every claimed unit", () => {
  const res = evaluateDeclared({
    sessionId: SESSION,
    claims: [
      { unitId: "notice-board", grade: "work" },
      { unitId: "studio-members", grade: "exploring" },
      { unitId: "library-cli", grade: "waiting" },
    ],
  });
  assert.equal(res.verdict, "ok");
  assert.match(res.message, /notice-board/);
  assert.match(res.message, /studio-members/);
  assert.match(res.message, /library-cli/);
});
