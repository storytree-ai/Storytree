import test from "node:test";
import assert from "node:assert/strict";

import {
  auditGateCommandFileRefs,
  candidatePaths,
  extractFilterTargets,
  extractGateCommandPathTokens,
} from "./gate-command-file-audit.js";

function story(gates: string): string {
  return ["---", "id: s", "---", "", "## Reliability Gates", "", gates, ""].join("\n");
}

// ---------------------------------------------------------------------------
// extractGateCommandPathTokens — the extraction rule in isolation
// ---------------------------------------------------------------------------

test("extracts a --test positional run through a pnpm --filter package", () => {
  assert.deepEqual(
    extractGateCommandPathTokens(
      "pnpm --filter @storytree/drive exec node --import tsx --test src/landing-deps.test.ts",
    ),
    ["src/landing-deps.test.ts"],
  );
});

test("extracts every fs.readFileSync path out of an inline node -e script", () => {
  const cmd =
    "node --input-type=module -e \"import fs from 'node:fs';const c=fs.readFileSync('.github/workflows/ci.yml','utf8'),d=fs.readFileSync('packages/cli/src/gate-order.ts','utf8');\"";
  assert.deepEqual(extractGateCommandPathTokens(cmd), [
    ".github/workflows/ci.yml",
    "packages/cli/src/gate-order.ts",
  ]);
});

test("extracts a pnpm `test -- <path>` passthrough and an `exec vitest run <path>` positional", () => {
  assert.deepEqual(extractGateCommandPathTokens("pnpm --filter studio test -- server/api.test.ts"), [
    "server/api.test.ts",
  ]);
  assert.deepEqual(
    extractGateCommandPathTokens("pnpm --filter studio exec vitest run src/x/Y.test.tsx"),
    ["src/x/Y.test.tsx"],
  );
});

test("a bare test-suite command with no path token extracts nothing", () => {
  assert.deepEqual(extractGateCommandPathTokens("pnpm --filter @storytree/drive test"), []);
});

test("a criterion id, a bare backticked identifier, and prose-only quoted content extract nothing", () => {
  assert.deepEqual(extractGateCommandPathTokens("pnpm test uatc_027e3e8ad2253d327fc15c07"), []);
  assert.deepEqual(extractGateCommandPathTokens("seed-corpus-scripts"), []);
  assert.deepEqual(
    extractGateCommandPathTokens(
      "node -e \"for(const s of ['check:boundaries','uses: actions/checkout@v6'])x(s)\"",
    ),
    [],
  );
});

test("a URL is never mistaken for a repo path even when it looks path-shaped", () => {
  assert.deepEqual(
    extractGateCommandPathTokens("curl https://example.com/foo/bar.json"),
    [],
  );
});

test("a duplicated path token is reported once, in first-seen order", () => {
  assert.deepEqual(
    extractGateCommandPathTokens("cat a/b.ts && cat a/b.ts && cat c/d.ts"),
    ["a/b.ts", "c/d.ts"],
  );
});

// ---------------------------------------------------------------------------
// extractFilterTargets / candidatePaths — resolving a token against a --filter cwd
// ---------------------------------------------------------------------------

test("extractFilterTargets reads every --filter value, deduplicated, first-seen order", () => {
  assert.deepEqual(extractFilterTargets("pnpm --filter desktop --filter studio test"), [
    "desktop",
    "studio",
  ]);
  assert.deepEqual(extractFilterTargets("pnpm test"), []);
});

test("candidatePaths always tries the repo-root reading, plus one per resolvable filter", () => {
  const dirs = new Map([["@storytree/drive", "packages/drive"]]);
  assert.deepEqual(
    candidatePaths(
      "src/landing-deps.test.ts",
      "pnpm --filter @storytree/drive exec node --test src/landing-deps.test.ts",
      dirs,
    ),
    ["src/landing-deps.test.ts", "packages/drive/src/landing-deps.test.ts"],
  );
});

test("an unresolvable --filter target is skipped rather than guessed at", () => {
  assert.deepEqual(
    candidatePaths("src/x.ts", "pnpm --filter @storytree/typo-pkg test -- src/x.ts", new Map()),
    ["src/x.ts"],
  );
});

// ---------------------------------------------------------------------------
// auditGateCommandFileRefs — the corpus-level audit
// ---------------------------------------------------------------------------

const packageDirs = new Map([["@storytree/drive", "packages/drive"]]);

test("a live gate naming a file this checkout does not have is reported", () => {
  const body = story(
    "1. **Dead** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx --test src/landing-deps.test.ts`.",
  );
  const rows = auditGateCommandFileRefs(
    [{ storyId: "s", sourcePath: "stories/s/story.md", body }],
    packageDirs,
    () => false,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.gateId, "s#gate-1");
  assert.equal(rows[0]!.token, "src/landing-deps.test.ts");
  assert.deepEqual(rows[0]!.triedPaths, [
    "src/landing-deps.test.ts",
    "packages/drive/src/landing-deps.test.ts",
  ]);
  assert.match(rows[0]!.detail, /can never run/);
});

test("the same gate is clean once the file exists at EITHER tried path", () => {
  const body = story(
    "1. **Live** _(gate: observe)_ `pnpm --filter @storytree/drive exec node --import tsx --test src/landing-deps.test.ts`.",
  );
  const rows = auditGateCommandFileRefs(
    [{ storyId: "s", sourcePath: "p", body }],
    packageDirs,
    (p) => p === "packages/drive/src/landing-deps.test.ts",
  );
  assert.deepEqual(rows, []);
});

test("a RETIRED gate naming a dead file is never audited — retiring is what silences it", () => {
  const body = story(
    "1. **Dead, kept for ordinals** _(gate: observe)_ _(retired)_ `pnpm --filter @storytree/drive exec node --import tsx --test src/landing-deps.test.ts`.",
  );
  const rows = auditGateCommandFileRefs(
    [{ storyId: "s", sourcePath: "p", body }],
    packageDirs,
    () => false,
  );
  assert.deepEqual(rows, []);
});

test("a gate whose command names no path token at all is never audited", () => {
  const body = story("1. **The suite is green** _(gate: observe)_ `pnpm --filter @storytree/drive test`.");
  const rows = auditGateCommandFileRefs([{ storyId: "s", sourcePath: "p", body }], packageDirs, () => false);
  assert.deepEqual(rows, []);
});

test("rows are ordered by source path, then gate id, then token — never reader traversal order", () => {
  const mk = (path: string): string => story(`1. **Dead** _(gate: observe)_ \`cat ${path}\`.`);
  const rows = auditGateCommandFileRefs(
    [
      { storyId: "s", sourcePath: "stories/z/story.md", body: mk("b/dead.ts") },
      { storyId: "s", sourcePath: "stories/a/story.md", body: mk("a/dead.ts") },
    ],
    new Map(),
    () => false,
  );
  assert.deepEqual(
    rows.map((r) => r.sourcePath),
    ["stories/a/story.md", "stories/z/story.md"],
  );
});

test("an unparseable story THROWS rather than being skipped as clean", () => {
  const body = story("1. **Bad kind** _(gate: rubberstamp)_ `pnpm test`.");
  assert.throws(() =>
    auditGateCommandFileRefs([{ storyId: "s", sourcePath: "p", body }], packageDirs, () => false),
  );
});

test("an empty corpus returns no rows (and the audit is not confused by it)", () => {
  assert.deepEqual(auditGateCommandFileRefs([], packageDirs, () => false), []);
});
