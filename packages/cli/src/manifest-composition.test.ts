import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  composeManifest,
  lobbyDenyRules,
  parseSourceOwnershipMap,
  splitManifest,
  type ManifestObject,
} from "@storytree/drive";

import { parseHierarchyCampMap, type HierarchyCampDeclaration } from "./hierarchy-camps.js";

/**
 * The manifest composition seam, read by the readers that are to move onto it
 * (`repo-manifest-fragmentation-arc` increment 1).
 *
 * The composer lives in `@storytree/drive` (`manifest-fragments.ts`), where its contract is proven over
 * fixtures and fault seeds. This is the other half: the hierarchy-camp fence, the source-ownership map
 * and the write-authority rules must read the COMPOSED live manifest exactly as they read the committed
 * one. It is also what puts the composer inside `pnpm --filter @storytree/cli test`, the proof command
 * the owning capability `organism-boundary-tooling` carries (the source-ownership map's rule (7)).
 *
 * Nothing is set aside: the live map carries no declaration another COVERS — the three it did were
 * narrowed away by `repo-manifest-covered-declarations-resolved` — so it composes whole, or this is red.
 * A reader that returns a list returns it in the composed order — sorted — so lists compare as sets.
 */

/** This file sits at `<repo>/packages/cli/src/`. */
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function composedLive() {
  const whole: ManifestObject = JSON.parse(readFileSync(path.join(REPO_ROOT, "repo-manifest.json"), "utf8"));
  const composed = composeManifest(splitManifest(whole));
  if (!composed.ok) assert.fail(`the live manifest did not compose:\n${composed.faults.map((f) => f.message).join("\n")}`);
  return { committed: JSON.stringify(whole), composed: JSON.stringify(composed.manifest) };
}

test("the CLI's manifest readers read the composed live manifest exactly as they read the committed one", () => {
  const { committed, composed } = composedLive();

  const byPath = (readers: readonly HierarchyCampDeclaration[]) => [...readers].sort((a, b) => (a.path < b.path ? -1 : 1));
  const campsBefore = parseHierarchyCampMap(committed, "the committed manifest");
  const campsAfter = parseHierarchyCampMap(composed, "the composed manifest");
  assert.deepEqual([campsBefore.unread, campsAfter.unread], [[], []]);
  assert.ok(campsBefore.readers.length > 50, "the hierarchy-camp map is authored in full");
  assert.deepEqual(byPath(campsAfter.readers), byPath(campsBefore.readers));

  const bySubtree = (text: string) => {
    const map = parseSourceOwnershipMap(text, "manifest");
    assert.deepEqual(map.unread, []);
    return { baseline: map.baseline, subtrees: [...map.subtrees].sort((a, b) => (a.subtree < b.subtree ? -1 : 1)) };
  };
  const ownershipBefore = bySubtree(committed);
  assert.ok(ownershipBefore.subtrees.length > 500, "the source-ownership map is authored in full");
  assert.deepEqual(bySubtree(composed), ownershipBefore);

  assert.deepEqual(lobbyDenyRules(JSON.parse(composed), "C:\\code\\storytree"), lobbyDenyRules(JSON.parse(committed), "C:\\code\\storytree"));
});
