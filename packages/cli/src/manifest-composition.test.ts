import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  lobbyDenyRules,
  readRepoManifest,
  readSourceOwnershipMap,
  rootSliceOf,
  sourceOwnershipOf,
  type SourceOwnershipMapRead,
} from "@storytree/drive";

import { parseHierarchyCampMap } from "./hierarchy-camps.js";

/**
 * The manifest composition seam, read by the CLI's readers (`repo-manifest-fragmentation-arc`).
 *
 * The composer lives in `@storytree/drive` (`manifest-fragments.ts`), where its contract is proven over
 * fixtures and fault seeds. This is the other half, over the LIVE manifest, and it is what puts the
 * composer inside `pnpm --filter @storytree/cli test` — the proof command the owning capability
 * `organism-boundary-tooling` carries (the source-ownership map's rule (7)):
 *
 *  - `sourceOwnership` is authored as fragments under `repo-manifest/`, and the map every CLI reader gets
 *    through `readSourceOwnershipMap` is exactly the map the composition holds;
 *  - every other section is authored there too (`repo-manifest-remaining-domains-compose`), and the two the
 *    CLI reads for itself — the hierarchy-camp fence, and the root the write-authority rules derive from —
 *    read in full from the composition.
 *
 * Nothing is set aside: the live manifest composes whole, or this is red. A reader that returns a list
 * returns it in the composed order — sorted — so lists compare as sets. Nothing here reads
 * `repo-manifest.json` for itself: the file is kept as an empty object until it leaves Git.
 */

/** This file sits at `<repo>/packages/cli/src/`. */
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const LIVE_MANIFEST = path.join(REPO_ROOT, "repo-manifest.json");

function composedLive() {
  const composition = readRepoManifest(LIVE_MANIFEST);
  if (!composition.ok) assert.fail(`the live manifest did not compose:\n${composition.faults.map((f) => f.message).join("\n")}`);
  return composition.manifest;
}

test("the CLI's source-ownership reader reads exactly the map the live composition holds", () => {
  const bySubtree = (read: SourceOwnershipMapRead) => {
    assert.deepEqual(read.unread, []);
    return { baseline: read.baseline, subtrees: [...read.subtrees].sort((a, b) => (a.subtree < b.subtree ? -1 : 1)) };
  };
  const held = bySubtree(sourceOwnershipOf(readRepoManifest(LIVE_MANIFEST), "the composed manifest"));
  assert.ok(held.subtrees.length > 500, "the source-ownership map is authored in full");
  assert.deepEqual(bySubtree(readSourceOwnershipMap(LIVE_MANIFEST)), held);
});

test("the hierarchy-camp map and the write wall's root read in full from the composition, where they are authored", () => {
  const manifest = composedLive();

  const camps = parseHierarchyCampMap(JSON.stringify(manifest), "the composed manifest");
  assert.deepEqual(camps.unread, []);
  assert.ok(camps.readers.length > 50, "the hierarchy-camp map is authored in full");

  const rules = lobbyDenyRules(rootSliceOf(manifest), "C:\\code\\storytree");
  for (const dir of ["packages", "stories", "repo-manifest"]) {
    assert.ok(rules.includes(`Write(//c/code/storytree/${dir}/**)`), `the root allow-list lost ${dir}/`);
  }
});
