// ADR-0246 / `foreign-project-forest-arc` inc 1 — the repo root is a PARAMETER, proven at a REAL
// reader rather than only at the pure resolver. `loadCorpus` is the sharpest one: its `dataPath`
// derived `apps/studio/data/` from this module's own location, which is precisely the
// "the repo you are reading this code out of" assumption a foreign-project forest has to break.
//
// The test points `STORYTREE_REPO_ROOT` at a temp tree holding a one-artifact seed and asserts the
// load came from THERE — a red→green that fails against the old `fileURLToPath(new URL(...))` form,
// which cannot see the env at all.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";

import { REPO_ROOT_ENV } from "../repo-root.js";
import { loadCorpus } from "./load-corpus.js";

/** The real seed, read through the module-location derivation this test is about to override. */
const realSeed = fileURLToPath(new URL("../../../../apps/studio/data/knowledge.json", import.meta.url));

interface SeedUnit {
  id: string;
  kind: string;
  [k: string]: unknown;
}

/** Build a temp repo root holding `apps/studio/data/knowledge.json` with ONE real artifact in it. */
function stageForeignRoot(unit: SeedUnit): string {
  const root = mkdtempSync(join(tmpdir(), "storytree-repo-root-"));
  const dataDir = join(root, "apps", "studio", "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "knowledge.json"), JSON.stringify([unit], null, 2), "utf8");
  return root;
}

test("STORYTREE_REPO_ROOT repoints loadCorpus's seed at a foreign checkout", async () => {
  const realUnits = JSON.parse(readFileSync(realSeed, "utf8")) as SeedUnit[];
  const one = realUnits[0];
  assert.ok(one, "the real seed must have at least one artifact to borrow");

  const foreignRoot = stageForeignRoot(one);
  const before = process.env[REPO_ROOT_ENV];
  process.env[REPO_ROOT_ENV] = foreignRoot;
  try {
    const store = new InMemoryStore();
    const result = await loadCorpus(store);

    // The foreign seed holds exactly ONE knowledge unit. If `dataPath` had ignored the env and read
    // storytree's own seed, this would be the full corpus (hundreds of artifacts) instead.
    assert.equal(result.knowledge, 1, "loadCorpus must read the seed under STORYTREE_REPO_ROOT");
    assert.ok(realUnits.length > 1, "the real seed is larger than the staged one, so 1 is decisive");

    const docs = await store.queryDocs();
    const ids = docs.map((d) => d.id);
    assert.ok(ids.includes(one.id), "the staged artifact is present");
  } finally {
    if (before === undefined) delete process.env[REPO_ROOT_ENV];
    else process.env[REPO_ROOT_ENV] = before;
    rmSync(foreignRoot, { recursive: true, force: true });
  }
});

test("with STORYTREE_REPO_ROOT unset, loadCorpus reads storytree's own seed as before", async () => {
  const before = process.env[REPO_ROOT_ENV];
  delete process.env[REPO_ROOT_ENV];
  try {
    const store = new InMemoryStore();
    const result = await loadCorpus(store);
    const realUnits = JSON.parse(readFileSync(realSeed, "utf8")) as SeedUnit[];
    assert.equal(result.knowledge, realUnits.length, "the derived fallback is unchanged behaviour");
  } finally {
    if (before !== undefined) process.env[REPO_ROOT_ENV] = before;
  }
});
