// ADR-0246 / `foreign-project-forest-arc` inc 1 — the build driver's repo root is a PARAMETER.
//
// This is the D5-critical site: `repoRoot()` feeds `storiesDir`, `createBuildWorktree`, and the
// promotion, so until it reads the parameter a `--real` build can only ever prove storytree's own
// tree. The pure precedence lives in `@storytree/library`'s resolveRepoRoot (tested there); this
// pins that the driver's default actually consults it, and that `rel()` follows it.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_ROOT_ENV } from "@storytree/library";

import { repoRoot, rel } from "./node-build.js";

const DERIVED = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

function withEnv(value: string | undefined, fn: () => void): void {
  const before = process.env[REPO_ROOT_ENV];
  if (value === undefined) delete process.env[REPO_ROOT_ENV];
  else process.env[REPO_ROOT_ENV] = value;
  try {
    fn();
  } finally {
    if (before === undefined) delete process.env[REPO_ROOT_ENV];
    else process.env[REPO_ROOT_ENV] = before;
  }
}

test("repoRoot() falls back to the module-location derivation when unconfigured", () => {
  withEnv(undefined, () => {
    assert.equal(repoRoot(), DERIVED);
  });
});

test("STORYTREE_REPO_ROOT repoints the build driver at a foreign checkout", () => {
  const foreign = path.resolve(path.sep, "work", "some-other-project");
  withEnv(foreign, () => {
    assert.equal(repoRoot(), foreign);
    assert.notEqual(repoRoot(), DERIVED);
  });
});

test("rel() reports paths relative to the CONFIGURED root, not this checkout", () => {
  const foreign = path.resolve(path.sep, "work", "some-other-project");
  withEnv(foreign, () => {
    assert.equal(rel(path.join(foreign, "src", "index.ts")), "src/index.ts");
  });
});

test("a blank STORYTREE_REPO_ROOT is unset, not the filesystem root", () => {
  withEnv("   ", () => {
    assert.equal(repoRoot(), DERIVED);
  });
});
