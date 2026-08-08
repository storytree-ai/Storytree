import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  danglingCiteReasons,
  loadWorkHierarchyIndex,
  resolveCites,
  type WorkUnit,
} from "./work-hierarchy.js";

/**
 * ADR-0306 D1 — the resolver, and the one behaviour it exists to get right.
 *
 * The hierarchy is disk-canonical and BRANCH-DEPENDENT, so "does not resolve" is a statement about
 * one checkout and nothing more. Every test here is written to pin that: a miss is a REPORT with the
 * checkout implied, a scan that never ran reports NOTHING (rather than reporting everything missing),
 * and a partial or malformed tree degrades to a smaller index instead of throwing.
 */

function fixtureTree(): string {
  const root = mkdtempSync(path.join(tmpdir(), "storytree-wh-"));
  const stories = path.join(root, "stories");
  const write = (dir: string, file: string, fm: string): void => {
    mkdirSync(path.join(stories, dir), { recursive: true });
    writeFileSync(path.join(stories, dir, file), `---\n${fm}\n---\n\nbody\n`, "utf8");
  };
  write("library", "story.md", 'id: "library"\ntier: story\ntitle: "The library"');
  write("library", "library-cli.md", 'id: "library-cli"\ntier: capability\nstory: library');
  write("library", "a-contract.md", 'id: "a-contract"\ntier: contract\nstory: library');
  write("agent", "story.md", 'id: "agent"\ntier: story');
  return stories;
}

test("the index carries every tier, keyed by id, with its owning story dir", () => {
  const stories = fixtureTree();
  try {
    const index = loadWorkHierarchyIndex(stories);
    assert.deepEqual(index.get("library"), { id: "library", tier: "story", story: "library" });
    assert.deepEqual(index.get("library-cli"), {
      id: "library-cli",
      tier: "capability",
      story: "library",
    });
    assert.deepEqual(index.get("a-contract"), {
      id: "a-contract",
      tier: "contract",
      story: "library",
    });
    assert.equal(index.size, 4);
  } finally {
    rmSync(path.dirname(stories), { recursive: true, force: true });
  }
});

test("a spec with no `tier` is placed by POSITION, never dropped", () => {
  // An unplaced unit reads as "does not exist", which is the one answer this resolver must not give
  // wrongly — so a half-authored file still lands, at the tier its position implies.
  const stories = fixtureTree();
  try {
    mkdirSync(path.join(stories, "half"), { recursive: true });
    writeFileSync(path.join(stories, "half", "story.md"), "---\nid: \"half\"\n---\n", "utf8");
    writeFileSync(path.join(stories, "half", "a-cap.md"), "---\nid: \"a-cap\"\n---\n", "utf8");
    const index = loadWorkHierarchyIndex(stories);
    assert.equal(index.get("half")?.tier, "story");
    assert.equal(index.get("a-cap")?.tier, "capability");
  } finally {
    rmSync(path.dirname(stories), { recursive: true, force: true });
  }
});

test("a missing or unreadable stories tree yields an EMPTY index, never a throw", () => {
  // The view has to stay derivable on a partial checkout — which is the ordinary case the whole
  // citation edge exists to describe honestly.
  assert.equal(loadWorkHierarchyIndex(path.join(tmpdir(), "no-such-storytree-tree")).size, 0);
});

const INDEX: ReadonlyMap<string, WorkUnit> = new Map<string, WorkUnit>([
  ["library", { id: "library", tier: "story", story: "library" }],
  ["library-cli", { id: "library-cli", tier: "capability", story: "library" }],
]);

test("a ref that lands resolves; one that names nothing here is UNRESOLVED, not an error", () => {
  const resolved = resolveCites(
    ["story:library", "capability:library-cli", "story:not-on-this-branch"],
    INDEX,
  );
  assert.deepEqual(
    resolved.map((r) => r.status),
    ["resolved", "resolved", "unresolved"],
  );
  assert.deepEqual(danglingCiteReasons(resolved), [
    "story:not-on-this-branch (no such story in this checkout)",
  ]);
});

test("a TIER MISMATCH is reported as its own thing, not as absence", () => {
  // Collapsing the two lies in the more expensive direction: `story:library-cli` naming a real
  // capability would read as "no such unit", sending a reader to hunt for something that is right
  // there under a different tier, when the fix is one token.
  const resolved = resolveCites(["story:library-cli", "capability:library"], INDEX);
  assert.deepEqual(
    resolved.map((r) => r.status),
    ["tier-mismatch", "tier-mismatch"],
  );
  assert.equal(resolved[0]?.actualTier, "capability");
  assert.deepEqual(danglingCiteReasons(resolved), [
    "story:library-cli (exists, but as a capability — wrong scheme)",
    "capability:library (exists, but as a story — wrong scheme)",
  ]);
});

test("an asset: ref is NOT-CHECKED here and never counted as dangling", () => {
  // It IS resolvable, just not by a disk scan — it names a Library artifact, and the store is what
  // holds those (health.ts FAILS a dangling one, since an in-library break is a real graph break
  // rather than a branch artefact). It is returned rather than filtered out so a render can show
  // every authored ref instead of a subset that reads as the whole set.
  const resolved = resolveCites(["asset:merge-ceremony"], INDEX);
  assert.deepEqual(resolved, [
    { ref: "asset:merge-ceremony", scheme: "asset", id: "merge-ceremony", status: "not-checked" },
  ]);
  assert.deepEqual(danglingCiteReasons(resolved), []);
});

test("a token of no known scheme is skipped, never given a resolution status", () => {
  // `CiteRef` already refuses one at the write boundary, so reaching here means the doc predates the
  // field or was written around the validated path. Reporting a resolution FAILURE would name the
  // wrong fault — the token is the fault, and it is not this module's to adjudicate.
  assert.deepEqual(resolveCites(["node:library", "doc:decisions/x.md", "library"], INDEX), []);
});

test("an EMPTY index reports every work ref dangling — which is why callers must not fake one", () => {
  // The complement of the `workUnits`-is-optional contract in arc-rollup: an empty map is a real
  // answer ("this checkout has no stories"), so a caller with nothing to scan must OMIT the index
  // rather than pass an empty one. Pinned here so the distinction cannot be quietly lost.
  const resolved = resolveCites(["story:library"], new Map());
  assert.deepEqual(resolved.map((r) => r.status), ["unresolved"]);
});
