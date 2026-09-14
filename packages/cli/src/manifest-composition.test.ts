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
  type ManifestJson,
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
 * Set aside first: the declarations the live map carries COVERED, which the composer refuses by design.
 * A reader that returns a list returns it in the composed order — sorted — so lists compare as sets.
 */

/** This file sits at `<repo>/packages/cli/src/`. */
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

function isObj(value: ManifestJson | undefined): value is ManifestObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The live manifest with `subtrees` removed from `sourceOwnership.subtrees`, and nothing else touched. */
function without(manifest: ManifestObject, subtrees: readonly string[]): ManifestObject {
  const section = manifest["sourceOwnership"];
  const map = isObj(section) ? section["subtrees"] : undefined;
  if (!isObj(section) || !isObj(map)) assert.fail("the live manifest has no sourceOwnership.subtrees map");
  const kept: Record<string, ManifestJson> = {};
  for (const [key, owner] of Object.entries(map)) {
    if (!subtrees.includes(key)) kept[key] = owner;
  }
  return { ...manifest, sourceOwnership: { ...section, subtrees: kept } };
}

function composedLive() {
  const whole: ManifestObject = JSON.parse(readFileSync(path.join(REPO_ROOT, "repo-manifest.json"), "utf8"));
  const first = composeManifest(splitManifest(whole));
  const covered = first.ok ? [] : first.faults.flatMap((f) => (f.kind === "overlapping-declaration" ? [f.specific.subtree] : []));
  const committed = without(whole, covered);
  const second = composeManifest(splitManifest(committed));
  if (!second.ok) assert.fail(`the live manifest did not compose:\n${second.faults.map((f) => f.message).join("\n")}`);
  return { committed: JSON.stringify(committed), composed: JSON.stringify(second.manifest) };
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
