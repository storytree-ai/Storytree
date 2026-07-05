// Code-stamp tests (ADR-0164 Phase 1). The pure comparison + the probe over an injected git reader —
// no real git, no repo, HEAD never moves.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCodeStamp, createCodeStampProbe } from "./code-stamp.js";

const A = "a".repeat(40);
const B = "b".repeat(40);

test("buildCodeStamp: null unless BOTH shas resolve (an absent stamp is never a false stale)", () => {
  assert.equal(buildCodeStamp(null, B), null);
  assert.equal(buildCodeStamp(A, null), null);
  assert.equal(buildCodeStamp(null, null), null);
});

test("buildCodeStamp: stale is head !== startedAt", () => {
  assert.deepEqual(buildCodeStamp(A, A), { startedAt: A, head: A, stale: false });
  assert.deepEqual(buildCodeStamp(A, B), { startedAt: A, head: B, stale: true });
});

test("probe: fresh checkout — startedAt equals the current HEAD → not stale", async () => {
  const probe = createCodeStampProbe("/repo", async () => A);
  assert.deepEqual(await probe(), { startedAt: A, head: A, stale: false });
});

test("probe: HEAD advanced under the running app → stale (the Rail-2 trigger)", async () => {
  // startedAt is captured once (first read = A); subsequent reads return B (a merge landed).
  let calls = 0;
  const read = async (): Promise<string | null> => (calls++ === 0 ? A : B);
  const probe = createCodeStampProbe("/repo", read);
  const stamp = await probe();
  assert.deepEqual(stamp, { startedAt: A, head: B, stale: true });
});

test("probe: git unreachable → null (health answers without a code field, never a throw)", async () => {
  const probe = createCodeStampProbe("/repo", async () => null);
  assert.equal(await probe(), null);
});
