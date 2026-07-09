// Code-stamp tests (ADR-0164 Phase 1 + the build-stamp freshness increment). The pure comparison, the
// build-stamp reader, and the probe over injected git/fs readers — no real git, no repo, HEAD never moves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildCodeStamp, createCodeStampProbe, readBuildStamp } from "./code-stamp.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const STAMP = "/dist/build-stamp.json";

test("buildCodeStamp: null unless BOTH shas resolve (an absent stamp is never a false stale)", () => {
  assert.equal(buildCodeStamp(null, B), null);
  assert.equal(buildCodeStamp(A, null), null);
  assert.equal(buildCodeStamp(null, null), null);
});

test("buildCodeStamp: stale is head !== startedAt", () => {
  assert.deepEqual(buildCodeStamp(A, A), { startedAt: A, head: A, stale: false });
  assert.deepEqual(buildCodeStamp(A, B), { startedAt: A, head: B, stale: true });
});

test("probe: startedAt is the BUILD stamp — a build BEHIND the checkout is stale even though HEAD-at-spawn == HEAD", async () => {
  // The pull-and-relaunch-WITHOUT-rebuild trap: the served build was produced at A, the checkout is now
  // at B. HEAD-at-spawn reads B (fresh → silent, the old blind spot); the build stamp reads A → stale.
  const probe = createCodeStampProbe("/repo", STAMP, async () => B /* head */, async () => A /* built */);
  assert.deepEqual(await probe(), { startedAt: A, head: B, stale: true });
});

test("probe: build stamp == HEAD → not stale", async () => {
  const probe = createCodeStampProbe("/repo", STAMP, async () => A, async () => A);
  assert.deepEqual(await probe(), { startedAt: A, head: A, stale: false });
});

test("probe: NO build stamp → falls back to HEAD-at-spawn (an un-stamped build behaves exactly as before)", async () => {
  // No stamp (readBuilt → null): startedAt falls back to the FIRST head read (A, captured once); a later
  // merge moves head to B → stale, exactly the pre-stamp Rail-2 trigger, so older builds don't regress.
  let calls = 0;
  const readHead = async (): Promise<string | null> => (calls++ === 0 ? A : B);
  const probe = createCodeStampProbe("/repo", STAMP, readHead, async () => null);
  assert.deepEqual(await probe(), { startedAt: A, head: B, stale: true });
});

test("probe: git unreachable now → null (health answers without a code field, never a throw)", async () => {
  // head resolves null → buildCodeStamp(_, null) === null, even with a build stamp present.
  const probe = createCodeStampProbe("/repo", STAMP, async () => null, async () => A);
  assert.equal(await probe(), null);
});

test("readBuildStamp: reads the { sha } the build writer emits; null on missing / malformed / non-sha", async () => {
  const dir = await mkdtemp(join(tmpdir(), "code-stamp-"));
  try {
    const good = join(dir, "build-stamp.json");
    await writeFile(good, JSON.stringify({ sha: A }));
    assert.equal(await readBuildStamp(good), A, "a well-formed { sha } round-trips");

    const badJson = join(dir, "bad.json");
    await writeFile(badJson, "{ not json");
    assert.equal(await readBuildStamp(badJson), null, "malformed JSON → null");

    const nullSha = join(dir, "nullsha.json");
    await writeFile(nullSha, JSON.stringify({ sha: null }));
    assert.equal(await readBuildStamp(nullSha), null, "a git-failed stamp ({ sha: null }) → null");

    const notHex = join(dir, "nothex.json");
    await writeFile(notHex, JSON.stringify({ sha: "not-a-sha" }));
    assert.equal(await readBuildStamp(notHex), null, "a non-sha string → null");

    assert.equal(await readBuildStamp(join(dir, "missing.json")), null, "a missing file → null");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
