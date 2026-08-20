// Affected-only PR test scope (ADR-0195): the classification rules are the load-bearing safety
// surface — an under-selection here is a PR merging untested — so every FULL trigger and the
// affected mapping are pinned red→green. The CI shell (ci-affected-main.ts) stays thin and is
// exercised structurally (fail-open wiring) rather than by spawning git here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  classifyChangedFiles,
  discoverWorkspaceProjects,
  pnpmArgsFor,
  type WorkspaceProject,
} from "./ci-affected.js";

/** A representative workspace slice — names/dirs mirror the real repo shape. */
const PROJECTS: WorkspaceProject[] = [
  { name: "@storytree/cli", dir: "packages/cli" },
  { name: "@storytree/drive", dir: "packages/drive" },
  { name: "@storytree/forest-world", dir: "packages/forest-world" },
  { name: "@storytree/library", dir: "packages/library" },
  { name: "desktop", dir: "apps/desktop" },
  { name: "studio", dir: "apps/studio" },
];

test("in-package diff → affected, with the changed projects listed (dependents are pnpm's job)", () => {
  const scope = classifyChangedFiles(
    ["packages/library/src/schema.ts", "packages/library/src/knowledge.ts"],
    PROJECTS,
  );
  assert.deepEqual(scope, {
    mode: "affected",
    projects: ["@storytree/library"],
    reason: "all 2 changed file(s) map to workspace projects",
  });
});

test("multi-project diff → affected with each owner, deduped and sorted", () => {
  const scope = classifyChangedFiles(
    ["apps/studio/src/App.tsx", "packages/library/src/schema.ts", "apps/studio/server/serve.ts"],
    PROJECTS,
  );
  assert.equal(scope.mode, "affected");
  assert.deepEqual(scope.mode === "affected" ? scope.projects : [], ["@storytree/library", "studio"]);
});

test("windows separators and ./ prefixes normalise before mapping", () => {
  const scope = classifyChangedFiles(["./packages\\library\\src\\schema.ts"], PROJECTS);
  assert.equal(scope.mode, "affected");
});

// ── FULL triggers: everything the pnpm graph cannot see ─────────────────────

for (const [file, why] of [
  ["stories/approval-gated-trunk/story.md", "stories/** feeds cli's validate-corpus + drive's node-build tests"],
  ["docs/research/agentic-foundation-survey.md", "docs/** outside the reader map is unmapped"],
  ["pnpm-lock.yaml", "the lockfile is a repo-wide input"],
  ["pnpm-workspace.yaml", "the workspace globs define the graph"],
  [".github/workflows/ci.yml", "the workflow defines the gate itself"],
  ["scripts/check-manifest.mjs", "root scripts are repo-wide inputs"],
  ["tsconfig.base.json", "shared tsconfig is a repo-wide input"],
  ["CLAUDE.md", "root docs are outside the graph"],
  ["web", "the web submodule gitlink is outside the graph"],
] as const) {
  test(`root-path change → FULL (${why})`, () => {
    const scope = classifyChangedFiles([file, "packages/library/src/schema.ts"], PROJECTS);
    assert.equal(scope.mode, "full");
    assert.match(scope.reason, /outside the workspace dependency graph/);
    assert.ok(scope.reason.startsWith(file), `reason names the offending file: ${scope.reason}`);
  });
}

test("studio data (apps/studio/data/**) → FULL even though it sits inside an app", () => {
  const scope = classifyChangedFiles(["apps/studio/data/comments.json"], PROJECTS);
  assert.equal(scope.mode, "full");
  assert.match(scope.reason, /read across package boundaries/);
});

test("corpus seed match is a dir-prefix, not a string prefix", () => {
  const nested = classifyChangedFiles(["apps/studio/data/sub/x.json"], PROJECTS);
  assert.equal(nested.mode, "full");
  const sibling = classifyChangedFiles(["apps/studio/dataFixtures.ts"], PROJECTS);
  assert.equal(sibling.mode, "affected");
});

test("any package.json → FULL (manifests are the selection graph's own inputs)", () => {
  for (const file of ["package.json", "packages/library/package.json", "apps/studio/package.json"]) {
    const scope = classifyChangedFiles([file], PROJECTS);
    assert.equal(scope.mode, "full", file);
    assert.match(scope.reason, /selection graph/);
  }
});

test("a file under packages/ that maps to no project → FULL (conservative unknown)", () => {
  for (const file of ["packages/README.md", "packages/ghost-package/src/x.ts"]) {
    const scope = classifyChangedFiles([file], PROJECTS);
    assert.equal(scope.mode, "full", file);
  }
});

test("empty change set → FULL, never a zero-filter run", () => {
  assert.equal(classifyChangedFiles([], PROJECTS).mode, "full");
  assert.equal(classifyChangedFiles(["", "  "], PROJECTS).mode, "full");
});

// ── args rendering ───────────────────────────────────────────────────────────

test("pnpmArgsFor: full → -r; affected → a dependents-inclusive --filter chain", () => {
  assert.equal(pnpmArgsFor({ mode: "full", reason: "x" }), "-r");
  assert.equal(
    pnpmArgsFor({ mode: "affected", projects: ["@storytree/library", "studio"], reason: "x" }),
    "--filter ...@storytree/library --filter ...studio",
  );
});

test("pnpmArgsFor: an unsafe or empty project list falls back to -r (full is always safe)", () => {
  assert.equal(pnpmArgsFor({ mode: "affected", projects: [], reason: "x" }), "-r");
  assert.equal(pnpmArgsFor({ mode: "affected", projects: ["bad name"], reason: "x" }), "-r");
  assert.equal(pnpmArgsFor({ mode: "affected", projects: ["a;rm"], reason: "x" }), "-r");
});

// ── the root-path reader map (ADR-0394): narrow ONLY where the readers were measured ─────────

test("a decision-only diff narrows to the packages that READ decision files — not everything, not nothing", () => {
  const scope = classifyChangedFiles(["docs/decisions/0394-a-root-path.md"], PROJECTS);
  assert.equal(scope.mode, "affected");
  assert.deepEqual(
    scope.mode === "affected" ? scope.projects : [],
    ["@storytree/cli", "@storytree/drive"],
  );
});

test("THE NEGATIVE THAT MATTERS: a branch adding an ADR still runs the suite that owns adr-number-unique", () => {
  // The narrowing has exactly one unacceptable failure — a duplicate ADR number reaching `main`
  // because the suite that catches it was filtered out. `adr-health.test.ts` lives in
  // @storytree/cli, so cli must be selected AND must survive into the real filter chain; asserting
  // the scope object alone would pass even if `pnpmArgsFor` dropped it.
  const scope = classifyChangedFiles(["docs/decisions/0999-duplicate-number.md"], PROJECTS);
  assert.equal(scope.mode, "affected");
  assert.ok(
    scope.mode === "affected" && scope.projects.includes("@storytree/cli"),
    "the adr-health owner must be selected",
  );
  assert.match(pnpmArgsFor(scope), /--filter \.\.\.@storytree\/cli(\s|$)/);
});

test("a decision file mixed with package files unions both — narrowing never drops the package's own suite", () => {
  const scope = classifyChangedFiles(
    ["docs/decisions/0394-x.md", "packages/library/src/schema.ts"],
    PROJECTS,
  );
  assert.equal(scope.mode, "affected");
  assert.deepEqual(
    scope.mode === "affected" ? scope.projects : [],
    ["@storytree/cli", "@storytree/drive", "@storytree/library"],
  );
  assert.match(scope.reason, /via the root-path reader map/);
});

test("the map matches a DIRECTORY, not a string prefix — every other docs path still fails wide", () => {
  for (const file of ["docs/decisions-archive/x.md", "docs/research/survey.md", "docs/glossary.md"]) {
    const scope = classifyChangedFiles([file], PROJECTS);
    assert.equal(scope.mode, "full", file);
    assert.match(scope.reason, /outside the workspace dependency graph/);
  }
});

test("a STALE map fails WIDE: a reader this workspace no longer has forces the full run", () => {
  // The rename hazard, and the reason the map names packages rather than directories. If
  // `@storytree/drive` were renamed away, narrowing to whatever names still resolved would silently
  // under-select — a green earned by not running the suite that would have failed.
  const withoutDrive = PROJECTS.filter((p) => p.name !== "@storytree/drive");
  const scope = classifyChangedFiles(["docs/decisions/0394-x.md"], withoutDrive);
  assert.equal(scope.mode, "full");
  assert.match(scope.reason, /@storytree\/drive/);
  assert.match(scope.reason, /absent from this workspace/);
});

// ── real-repo integration ────────────────────────────────────────────────────

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

test("discoverWorkspaceProjects finds the real workspace (packages/* + apps/*)", () => {
  const projects = discoverWorkspaceProjects(repoRoot);
  const byName = new Map(projects.map((p) => [p.name, p.dir]));
  assert.equal(byName.get("@storytree/cli"), "packages/cli");
  assert.equal(byName.get("studio"), "apps/studio");
  assert.equal(byName.get("desktop"), "apps/desktop");
  assert.ok(projects.length >= 13, `expected ≥13 projects, found ${projects.length}`);
  for (const p of projects) {
    assert.match(p.dir, /^(packages|apps)\/[^/]+$/, p.dir);
  }
});

test("real repo: every project the reader map names still exists, so the map cannot narrow to a ghost", () => {
  // The map is measured evidence with a shelf life: a package rename would leave it naming a project
  // pnpm cannot select. Against the REAL workspace it must still resolve to exactly its two readers.
  const scope = classifyChangedFiles(
    ["docs/decisions/0394-a-root-path.md"],
    discoverWorkspaceProjects(repoRoot),
  );
  assert.equal(scope.mode, "affected", `the reader map has gone stale: ${scope.reason}`);
  assert.deepEqual(
    scope.mode === "affected" ? scope.projects : [],
    ["@storytree/cli", "@storytree/drive"],
  );
});

test("real-repo classification: a cli-only diff selects @storytree/cli", () => {
  const scope = classifyChangedFiles(
    ["packages/cli/src/ci-affected.ts"],
    discoverWorkspaceProjects(repoRoot),
  );
  assert.deepEqual(scope.mode === "affected" ? scope.projects : scope, ["@storytree/cli"]);
});
