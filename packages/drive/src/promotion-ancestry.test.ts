import test from "node:test";
import assert from "node:assert/strict";

import { orphanedProvenCommits, PROVEN_COMMITS, type CommitOracle } from "./promotion-ancestry.js";

/** A fake oracle so the gate's teeth are provable offline (shallow-safe — no real git). */
function fakeOracle(present: (sha: string) => boolean, ancestor: (sha: string) => boolean): CommitOracle {
  return { present, ancestorOfHead: ancestor };
}

test("orphanedProvenCommits: all present + ancestor → nothing orphaned (the green case)", () => {
  const out = orphanedProvenCommits(
    PROVEN_COMMITS,
    fakeOracle(() => true, () => true),
  );
  assert.deepEqual(out, []);
});

test("orphanedProvenCommits: a present-but-not-ancestor commit is flagged (squash/orphan — the teeth)", () => {
  const target = PROVEN_COMMITS[0]!.sha;
  const out = orphanedProvenCommits(
    PROVEN_COMMITS,
    fakeOracle(() => true, (sha) => sha !== target),
  );
  assert.equal(out.length, 1);
  assert.ok(out[0]!.includes(target));
  assert.match(out[0]!, /NOT an ancestor/);
});

test("orphanedProvenCommits: an absent object is flagged, never silently passed", () => {
  const target = PROVEN_COMMITS[1]!.sha;
  const out = orphanedProvenCommits(
    PROVEN_COMMITS,
    fakeOracle((sha) => sha !== target, () => true),
  );
  assert.equal(out.length, 1);
  assert.ok(out[0]!.includes(target));
  assert.match(out[0]!, /commit object not found/);
});

test("PROVEN_COMMITS: the gate pins real drive-machinery proof commits (never silently emptied)", () => {
  // An emptied list would make the gate a rubber stamp — it must always assert against real commits.
  assert.ok(PROVEN_COMMITS.length >= 5);
  for (const c of PROVEN_COMMITS) {
    assert.match(c.sha, /^[0-9a-f]{7,40}$/);
    assert.ok(c.node.length > 0);
  }
});
