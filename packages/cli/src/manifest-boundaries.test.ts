import test from "node:test";
import assert from "node:assert/strict";

import {
  findMonolithReads,
  judgeMonolithReads,
  MONOLITH,
  MONOLITH_READ_ALLOWANCES,
  type MonolithRead,
  type SourceModule,
} from "./manifest-boundaries.js";

/**
 * The manifest seam's boundary (`manifest-boundaries.ts`): what counts as a direct read of
 * `repo-manifest.json`, and how the reads found are judged against their allowances.
 *
 * Every fixture is a module's TEXT, never a file, so nothing here reads the repository — `check:boundaries`
 * runs the same judge over the real tree, this file included. Every fixture expected to find nothing sits
 * beside one that finds something in the same text, so no empty result can pass because the scan saw nothing.
 */

/** A module whose line N is the Nth line given. */
function source(path: string, ...lines: string[]): SourceModule {
  return { path, text: lines.join("\n") };
}

function readsOf(...modules: SourceModule[]): readonly MonolithRead[] {
  return findMonolithReads(modules).reads;
}

function at(path: string, line: number, call: string): MonolithRead {
  return { path, line, call };
}

// ---------------------------------------------------------------------------
// What a read is
// ---------------------------------------------------------------------------

test("each reader handed the path is a read — at its line, through the call it reads with", () => {
  const tool = source(
    "tools/read.ts",
    'import { readFileSync } from "node:fs";',
    'const a = readFileSync("repo-manifest.json", "utf8");',
    'const b = await io.readFile("../repo-manifest.json");',
    'const c = readJson("repo-manifest.json");',
    'const d = readOrNull("repo-manifest.json");',
    'const e = git.show(base, "repo-manifest.json");',
    'const f = require("../../repo-manifest.json");',
    'const g = await import("../../repo-manifest.json");',
    'writeFileSync("repo-manifest.json", "{}");',
  );
  assert.deepEqual(readsOf(tool), [
    at("tools/read.ts", 2, "readFileSync"),
    at("tools/read.ts", 3, "readFile"),
    at("tools/read.ts", 4, "readJson"),
    at("tools/read.ts", 5, "readOrNull"),
    at("tools/read.ts", 6, "show"),
    at("tools/read.ts", 7, "require"),
    at("tools/read.ts", 8, "import"),
  ]);
});

test("a static import or re-export of the aggregate is a read; a declaration naming no module is not", () => {
  const tool = source(
    "tools/imports.ts",
    'import "./side-effect.js";',
    'import manifest from "../../repo-manifest.json" with { type: "json" };',
    'import * as fs from "node:fs";',
    "export { manifest };",
    'export { default as raw } from "./repo-manifest.json";',
    "let later;",
  );
  assert.deepEqual(readsOf(tool), [at("tools/imports.ts", 2, "import"), at("tools/imports.ts", 5, "import")]);
});

test("the path passes through every builder and wrapper that keeps it a path to the same file", () => {
  const tool = source(
    "tools/built.ts",
    'readFileSync(join(root, "repo-manifest.json"));',
    'readFileSync(path.resolve(root, "repo-manifest.json"));',
    'readFileSync(fileURLToPath(new URL("../repo-manifest.json", import.meta.url)));',
    "readFileSync(`${root}/repo-manifest.json`);",
    'readFileSync(root + "/repo-manifest.json");',
    'readFileSync(override ?? "repo-manifest.json");',
    'readFileSync(local ? "repo-manifest.json" : remote);',
    'readFileSync(local ? remote : "repo-manifest.json");',
    'readFileSync(("repo-manifest.json"));',
    'readFileSync("repo-manifest.json" as string);',
    'readFileSync("repo-manifest.json" satisfies string);',
    'const MANIFEST = "repo-manifest.json";',
    "readFileSync(MANIFEST!);",
    "readFileSync(`${root}/${MANIFEST}`);",
  );
  assert.deepEqual(
    readsOf(tool).map((read) => read.line),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14],
  );
});

test("a mention, a seam call, and a value computed from one are not reads", () => {
  const lines = [
    '// readFileSync("repo-manifest.json") in a comment reads nothing',
    'const LIVE = path.join(root, "repo-manifest.json");',
    "const composition = readRepoManifest(LIVE);",
    "const text = readFileSync(composedManifestText(composition));",
    'readFileSync(normalise("repo-manifest.json"));',
    // A `new` with no argument list builds nothing, even when what it names is a builder.
    "readFileSync(new URL);",
    'throw new Error("repo-manifest.json did not compose");',
    'execFileSync("git", ["log", "--", "repo-manifest.json"]);',
    'console.log("show", "the fragments");',
    // A message may spell a whole `git show` of the path; only something that runs a command reads it.
    'console.log("run git show HEAD:repo-manifest.json to see it");',
    'execFileSync("git", ["shown", "repo-manifest.json"]);',
    "readFileSync(`${root}/repo-manifest/${domain}.json`);",
  ];
  assert.deepEqual(readsOf(source("tools/seam.ts", ...lines)), []);
  // Not vacuous: the same module reads, the moment what it hands a reader is the path itself.
  assert.deepEqual(readsOf(source("tools/seam.ts", ...lines, "readFileSync(LIVE);")), [at("tools/seam.ts", 13, "readFileSync")]);
});

test("a binding carries the path when its initializer does — however many bindings away, in any declaration order", () => {
  const tool = source(
    "tools/bound.ts",
    "const manifestPath = join(repoRoot, MANIFEST);",
    'const MANIFEST = "repo-manifest.json";',
    'const unrelated = join(repoRoot, "stories");',
    'const text = readFileSync(manifestPath, "utf8");',
    'const other = readFileSync(unrelated, "utf8");',
  );
  assert.deepEqual(readsOf(tool), [at("tools/bound.ts", 4, "readFileSync")]);
});

test("an exported carrying binding carries the path into every module importing it — by name, under another, or through a namespace", () => {
  const scan = findMonolithReads([
    source("consumer/transitive.ts", 'import { MANIFEST_PATH } from "../paths.js";', "readFileSync(MANIFEST_PATH);"),
    source(
      "paths.ts",
      'import { REPO_MANIFEST, REPO_MANIFEST_TREE } from "@storytree/drive";',
      "export const MANIFEST_PATH = join(ROOT, REPO_MANIFEST);",
      "export const FRAGMENTS = join(ROOT, REPO_MANIFEST_TREE);",
    ),
    source("consumer/aliased.ts", 'import { REPO_MANIFEST as AGGREGATE } from "@storytree/drive";', "readFileSync(AGGREGATE);"),
    source(
      "drive/manifest-fragments.ts",
      'export const REPO_MANIFEST = "repo-manifest.json";',
      'export const REPO_MANIFEST_TREE = "repo-manifest";',
      'const PRIVATE_COPY = "repo-manifest.json";',
    ),
    source("consumer/namespace.ts", 'import * as drive from "@storytree/drive";', "readFileSync(drive.REPO_MANIFEST);"),
    source("consumer/unrelated.ts", 'import { join } from "node:path";', 'export const ANSWER = join("a", "b");'),
    source(
      "consumer/private.ts",
      'import { PRIVATE_COPY, REPO_MANIFEST_TREE } from "../drive/manifest-fragments.js";',
      "readFileSync(PRIVATE_COPY);",
      "readFileSync(REPO_MANIFEST_TREE);",
    ),
  ]);
  assert.deepEqual(scan.reads, [
    at("consumer/transitive.ts", 2, "readFileSync"),
    at("consumer/aliased.ts", 2, "readFileSync"),
    at("consumer/namespace.ts", 2, "readFileSync"),
  ]);
  assert.equal(scan.examined, 6, "every module but the one naming neither the path nor a binding of it");
});

test("a git show of the path handed to anything that runs a command is a read — and only the call that runs it", () => {
  const scan = findMonolithReads([
    source("drive.ts", 'export const REPO_MANIFEST = "repo-manifest.json";'),
    source(
      "tools/history.ts",
      'import { REPO_MANIFEST } from "@storytree/drive";',
      'execFileSync("git", ["show", `${base}:repo-manifest.json`]);',
      'git(["show", `${base}:${REPO_MANIFEST}`]);',
      "execSync(`git show ${base}:repo-manifest.json`);",
      'spawnSync("git", ["show", "HEAD:repo-manifest.json"]);',
      'execFile("git", ["show", "HEAD:repo-manifest.json"], done);',
      "exec(`git show HEAD:repo-manifest.json`, done);",
      'spawn("git", ["show", "HEAD:repo-manifest.json"]);',
      'console.log(execFileSync("git", ["show", "HEAD:repo-manifest.json"]));',
    ),
  ]);
  assert.deepEqual(scan.reads, [
    at("tools/history.ts", 2, "execFileSync"),
    at("tools/history.ts", 3, "git"),
    at("tools/history.ts", 4, "execSync"),
    at("tools/history.ts", 5, "spawnSync"),
    at("tools/history.ts", 6, "execFile"),
    at("tools/history.ts", 7, "exec"),
    at("tools/history.ts", 8, "spawn"),
    at("tools/history.ts", 9, "execFileSync"),
  ]);
});

// ---------------------------------------------------------------------------
// How the reads are judged
// ---------------------------------------------------------------------------

test("an unallowed read is refused with every line it reads at, and the seam named as the repair", () => {
  assert.deepEqual(judgeMonolithReads([at("tools/a.ts", 3, "readFileSync"), at("tools/a.ts", 9, "show")], []), [
    "tools/a.ts reads repo-manifest.json directly 2 time(s) and is allowed 0: line 3 (readFileSync), line 9 (show). " +
      "Read the manifest through its composition seam instead — readRepoManifest (@storytree/drive) composes the " +
      "fragments under repo-manifest/ and refuses what it cannot read (ADR-0556 D3).",
  ]);
});

test("an allowance is exact: met it is silent, exceeded it refuses, and unmet it is stale", () => {
  const allowance = { path: "tools/legacy.ts", reads: 1, why: "the compatibility path" };
  const once = [at("tools/legacy.ts", 4, "show")];
  assert.deepEqual(judgeMonolithReads(once, [allowance]), []);
  assert.deepEqual(judgeMonolithReads([...once, at("tools/legacy.ts", 8, "readFileSync")], [allowance]), [
    "tools/legacy.ts reads repo-manifest.json directly 2 time(s) and is allowed 1: line 4 (show), line 8 (readFileSync). " +
      "Read the manifest through its composition seam instead — readRepoManifest (@storytree/drive) composes the " +
      "fragments under repo-manifest/ and refuses what it cannot read (ADR-0556 D3).",
  ]);
  assert.deepEqual(judgeMonolithReads([], [allowance]), [
    "tools/legacy.ts is allowed 1 direct read(s) of repo-manifest.json and makes 0 — the allowance is stale: lower " +
      "it in MONOLITH_READ_ALLOWANCES (packages/cli/src/manifest-boundaries.ts), or delete it at zero.",
  ]);
});

test("the refusals come in the order their reads were found, then the stale allowances", () => {
  const judged = judgeMonolithReads(
    [at("tools/b.ts", 1, "readFile"), at("tools/a.ts", 1, "readFile")],
    [
      { path: "tools/c.ts", reads: 1, why: "stale" },
      { path: "tools/a.ts", reads: 1, why: "allowed" },
    ],
  );
  assert.deepEqual(
    judged.map((refusal) => refusal.split(" ")[0]),
    ["tools/b.ts", "tools/c.ts"],
  );
});

test("the only allowance is the seam's merge-base compatibility read, and it names the increment that deletes it", () => {
  assert.equal(MONOLITH, "repo-manifest.json");
  assert.deepEqual(
    MONOLITH_READ_ALLOWANCES.map(({ path, reads }) => ({ path, reads })),
    [{ path: "packages/drive/src/source-ownership-map.ts", reads: 1 }],
  );
  const why = MONOLITH_READ_ALLOWANCES[0]?.why ?? "";
  assert.match(why, /reads the aggregate at a merge-base commit from before the fragment tree existed/);
  assert.match(why, /deleted with the aggregate by repo-manifest-aggregate-leaves-git/);
});
