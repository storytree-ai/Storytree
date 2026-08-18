import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { gatherSourceFiles, ownershipCommand, ownershipHelp, type OwnershipFacts } from "./ownership.js";

// The COMMAND layer over the pure judge (`source-ownership.test.ts` proves the rules themselves).
// Pure-by-injection: `gather` is a seam, so these run offline against fixtures with no disk walk.

const facts = (over: Partial<OwnershipFacts> = {}): OwnershipFacts => ({
  files: ["packages/cli/src/a.ts", "packages/cli/src/b.ts", "apps/studio/src/c.tsx"],
  declarations: [{ subtree: "packages/cli/src/a.ts", owner: "organism-boundary-tooling" }],
  knownUnitIds: ["organism-boundary-tooling", "cli"],
  storyIds: ["cli"],
  ...over,
});

test("the report is ok:true even when almost everything is unowned — it REPORTS, it does not gate", () => {
  // THE LOAD-BEARING ONE. At 92.7% unowned a blocking rung would red the repo on day one, which is
  // exactly why ADR-0310 D3 / ADR-0317 D2 ship this report-only. An `ok:false` here would turn the
  // instrument into the gate it deliberately is not.
  const env = ownershipCommand({ gather: () => facts() });
  assert.equal(env.ok, true);
  assert.match(env.body, /REPORT ONLY/);
  assert.match(env.body, /unowned: 2/);
});

test("an empty disk walk REFUSES rather than reporting a vacuous 100%", () => {
  // 0 of 0 files owned is trivially "total" — a green over an empty denominator, and the one shape
  // of this report that would actively mislead.
  const env = ownershipCommand({ gather: () => facts({ files: [] }) });
  assert.equal(env.ok, false);
  assert.match(env.body, /vacuous/);
});

test("a package filter narrows BOTH sides so the percentages stay honest", () => {
  const env = ownershipCommand({ gather: () => facts() }, { pkg: "packages/cli" });
  assert.equal(env.ok, true);
  assert.match(env.body, /files: 2/, "the denominator is the slice, not the whole tree");
  assert.doesNotMatch(env.body, /apps\/studio/);
});

test("a package filter naming nothing refuses instead of reporting an empty slice as clean", () => {
  const env = ownershipCommand({ gather: () => facts() }, { pkg: "packages/nope" });
  assert.equal(env.ok, false);
  assert.match(env.body, /no source files under "packages\/nope"/);
});

test("the whole-tree baseline is NOT applied to a single-package slice", () => {
  // Comparing one package's unowned count against a tree-wide baseline would manufacture a trend
  // that is arithmetic nonsense — a large fake improvement every time the filter is used.
  const withBaseline = facts({ baseline: { date: "2026-08-06", files: 521, unowned: 483 } });
  const sliced = ownershipCommand({ gather: () => withBaseline }, { pkg: "packages/cli" });
  assert.doesNotMatch(sliced.body, /trend since/);

  const whole = ownershipCommand({ gather: () => withBaseline });
  assert.match(whole.body, /trend since 2026-08-06/);
});

test("help states the report-only posture and that it reads neither proof field", () => {
  const env = ownershipHelp();
  assert.equal(env.ok, true);
  assert.match(env.body, /REPORT ONLY/);
  assert.match(env.body, /proof\.real\.sourceFile/);
  assert.match(env.body, /write fence/);
});

// THE EXTENSION APERTURE (`ownership-walk-extension-aperture`, 2026-08-18). `gatherSourceFiles` does
// real disk I/O, so these run against a throwaway checkout shape rather than injected facts — the same
// tradeoff `check-declared.test.ts` makes for its own real-git arm.
test("gatherSourceFiles widens to .mts/.cts/.mjs/.cjs, excludes their .test. variants, and keeps .d.* declaration files IN (matching the pre-existing .d.ts treatment)", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "ownership-aperture-"));
  try {
    const srcDir = path.join(repoRoot, "packages", "widget", "src");
    mkdirSync(srcDir, { recursive: true });
    const files: Record<string, string> = {
      "index.ts": "export {};",
      "index.tsx": "export {};",
      "index.test.ts": "export {};",
      "index.test.tsx": "export {};",
      "script.mts": "export {};",
      "script.test.mts": "export {};",
      "legacy.cts": "export {};",
      "legacy.test.cts": "export {};",
      "run.mjs": "export {};",
      "run.test.mjs": "export {};",
      "run.cjs": "module.exports = {};",
      "run.test.cjs": "module.exports = {};",
      "types.d.ts": "export {};",
      "types.d.mts": "export {};",
      "types.d.cts": "export {};",
      "notes.md": "not source",
    };
    for (const [name, contents] of Object.entries(files)) {
      writeFileSync(path.join(srcDir, name), contents);
    }

    const found = new Set(gatherSourceFiles(repoRoot).map((f) => path.posix.basename(f)));

    // Every non-test extension is walked, .d.* included (the pre-existing .d.ts precedent extended).
    for (const name of [
      "index.ts",
      "index.tsx",
      "script.mts",
      "legacy.cts",
      "run.mjs",
      "run.cjs",
      "types.d.ts",
      "types.d.mts",
      "types.d.cts",
    ]) {
      assert.ok(found.has(name), `expected ${name} to be walked as source`);
    }
    // Every `.test.<ext>` variant is excluded, mirroring the original `.test.ts`/`.test.tsx` rule.
    for (const name of [
      "index.test.ts",
      "index.test.tsx",
      "script.test.mts",
      "legacy.test.cts",
      "run.test.mjs",
      "run.test.cjs",
    ]) {
      assert.ok(!found.has(name), `expected ${name} to be excluded as a test file`);
    }
    assert.ok(!found.has("notes.md"), "a non-source extension is never walked");
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});
