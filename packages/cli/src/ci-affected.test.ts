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
  { name: "@storytree/app-surface", dir: "packages/app-surface" },
  { name: "@storytree/cli", dir: "packages/cli" },
  { name: "@storytree/context-traversal-capture", dir: "packages/context-traversal-capture" },
  { name: "@storytree/drive", dir: "packages/drive" },
  { name: "@storytree/forest-world", dir: "packages/forest-world" },
  { name: "@storytree/library", dir: "packages/library" },
  { name: "@storytree/model-uat-pilot", dir: "packages/model-uat-pilot" },
  { name: "@storytree/orchestrator", dir: "packages/orchestrator" },
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
  ["pnpm-lock.yaml", "the lockfile is a repo-wide input"],
  ["pnpm-workspace.yaml", "the workspace globs define the graph"],
  [".github/workflows/ci.yml", "the workflow defines the gate itself"],
  ["scripts/check-manifest.mjs", "root scripts are repo-wide inputs"],
  ["tsconfig.base.json", "shared tsconfig is a repo-wide input"],
  ["web", "the web submodule gitlink is outside the graph"],
  ["README.md", "a root file with no measured reader stays wide — the map is opt-in, never a default"],
  ["infra/install.ps1", "infra/** WAS measured (cli + library) and deliberately left unmapped — 13 touches in 800 commits does not earn the staleness risk"],
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

test("a path under the RETIRED docs/decisions/ prefix takes the wider docs/ reader set", () => {
  // The `docs/decisions/` entry retired with the directory (ADR-0403 dec 1): decisions are rows, so
  // a decision edit is not a file change at all. A path shaped like the old one can still be typed —
  // in a stale branch, a rescued patch, an archive — and it must fall through to `docs/`, which is a
  // WIDENING. That direction is the safe one; the failure this file exists to prevent is the other.
  const scope = classifyChangedFiles(["docs/decisions/0394-a-root-path.md"], PROJECTS);
  assert.equal(scope.mode, "affected");
  assert.deepEqual(
    scope.mode === "affected" ? scope.projects : [],
    ["@storytree/app-surface", "@storytree/cli", "@storytree/drive"],
  );
});

test("THE NEGATIVE THAT MATTERS is now about the docs tree, and it still selects the suite that owns the gate", () => {
  // The narrowing has one unacceptable failure: filtering out the suite that catches what the diff
  // broke. It used to be spelled "a duplicate ADR number reaching main"; that gate now runs as
  // `check:adr-health`, a rung outside the `-r` legs entirely, so the affected-scope map cannot
  // filter it out at all. What this still guards is that `docs/` selection survives into the REAL
  // filter chain — asserting the scope object alone would pass even if `pnpmArgsFor` dropped it.
  const scope = classifyChangedFiles(["docs/research/a-note.md"], PROJECTS);
  assert.equal(scope.mode, "affected");
  assert.ok(
    scope.mode === "affected" && scope.projects.includes("@storytree/cli"),
    "a docs reader must be selected",
  );
  assert.match(pnpmArgsFor(scope), /--filter \.\.\.@storytree\/cli(\s|$)/);
});

test("a docs file mixed with package files unions both — narrowing never drops the package's own suite", () => {
  const scope = classifyChangedFiles(
    ["docs/research/a-note.md", "packages/library/src/schema.ts"],
    PROJECTS,
  );
  assert.equal(scope.mode, "affected");
  assert.deepEqual(
    scope.mode === "affected" ? scope.projects : [],
    ["@storytree/app-surface", "@storytree/cli", "@storytree/drive", "@storytree/library"],
  );
  assert.match(scope.reason, /via the root-path reader map/);
});

test("LONGEST prefix wins, proved on a pair that still HAS two depths", () => {
  // The `docs/decisions/` vs `docs/` pair used to prove this and no longer can — the deeper entry
  // retired with its directory (ADR-0403 dec 1). The RULE it demonstrated is untouched and still
  // load-bearing, so it is re-proved where two depths remain: `.claude/agents/` must win over
  // `.claude/`, regardless of the order the entries are written in.
  const agents = classifyChangedFiles([".claude/agents/session-orchestrator.md"], PROJECTS);
  assert.deepEqual(agents.mode === "affected" ? agents.projects : [], ["@storytree/cli"]);

  // And every path under `docs/` — including one shaped like the retired prefix — takes the one
  // remaining docs entry. A DIRECTORY match, so `docs/decisions-archive/` is not `docs/decisions/`.
  for (const file of ["docs/decisions/0394-x.md", "docs/decisions-archive/x.md", "docs/research/survey.md", "docs/glossary.md"]) {
    const scope = classifyChangedFiles([file], PROJECTS);
    assert.equal(scope.mode, "affected", file);
    assert.deepEqual(
      scope.mode === "affected" ? scope.projects : [],
      ["@storytree/app-surface", "@storytree/cli", "@storytree/drive"],
      `${file} must take the docs/ reader set`,
    );
  }
});

// ── ADR-0399: the widened map ────────────────────────────────────────────────

test("THE PRIZE: a guidance-regeneration diff selects ONE project", () => {
  // CLAUDE.md + AGENTS.md + all five harness agent directories move together every time an agent
  // artifact is edited — 611 path-touches across 800 commits, the commonest non-package change
  // shape in the repo — and every one of them bought all 26 projects until these entries existed.
  // cli alone is 34.7% of the summed test work, so this is roughly 65% off the leg.
  const scope = classifyChangedFiles(
    [
      "CLAUDE.md",
      "AGENTS.md",
      ".claude/agents/planner.md",
      ".codex/agents/planner.toml",
      ".cursor/agents/planner.md",
      ".gemini/agents/planner.md",
      ".opencode/agent/planner.md",
      "packages/cli/definitions.generated.json",
    ],
    PROJECTS,
  );
  assert.equal(scope.mode, "affected");
  assert.deepEqual(scope.mode === "affected" ? scope.projects : [], ["@storytree/cli"]);
  assert.equal(pnpmArgsFor(scope), "--filter ...@storytree/cli");
});

test("an EXACT-file entry is not a string prefix — CLAUDE.md.bak inherits nothing", () => {
  // `CLAUDE.md` carries no trailing slash, so it must match that path and no other. A `startsWith`
  // would hand any `CLAUDE.md*` sibling a reader set nobody measured for it.
  const mapped = classifyChangedFiles(["CLAUDE.md"], PROJECTS);
  assert.deepEqual(mapped.mode === "affected" ? mapped.projects : [], ["@storytree/cli"]);
  for (const file of ["CLAUDE.md.bak", "CLAUDE.md.orig", "AGENTS.md.rej"]) {
    const scope = classifyChangedFiles([file], PROJECTS);
    assert.equal(scope.mode, "full", file);
    assert.match(scope.reason, /outside the workspace dependency graph/);
  }
});

test(".claude/agents/ is narrower than .claude/, and the deeper entry wins", () => {
  const agents = classifyChangedFiles([".claude/agents/explorer.md"], PROJECTS);
  assert.deepEqual(agents.mode === "affected" ? agents.projects : [], ["@storytree/cli"]);
  // …while settings.json takes the wider set, because drive's suites read it too.
  const settings = classifyChangedFiles([".claude/settings.json"], PROJECTS);
  assert.deepEqual(settings.mode === "affected" ? settings.projects : [], [
    "@storytree/cli",
    "@storytree/drive",
  ]);
});

test("a story-only diff narrows to the seven measured readers — and still runs validate-corpus's owner", () => {
  // The negative that matters here is the mirror of the ADR one: `stories/**` is guarded by cli's
  // validate-corpus, so cli must be selected AND must survive into the real filter chain.
  const scope = classifyChangedFiles(["stories/ci-cd/green-gate.md"], PROJECTS);
  assert.equal(scope.mode, "affected");
  assert.deepEqual(scope.mode === "affected" ? scope.projects : [], [
    "@storytree/cli",
    "@storytree/context-traversal-capture",
    "@storytree/drive",
    "@storytree/library",
    "@storytree/model-uat-pilot",
    "@storytree/orchestrator",
    "studio",
  ]);
  assert.match(pnpmArgsFor(scope), /--filter \.\.\.@storytree\/cli(\s|$)/);
});

test("EVERY map entry fails WIDE when one of its readers is absent, not just the ADR one", () => {
  // The stale-map hazard applies to all eleven entries, and a test pinning only the first would let
  // a later entry narrow to a ghost. Each entry is exercised through a file it governs.
  const governed: readonly (readonly [file: string, missing: string])[] = [
    ["docs/decisions/0394-x.md", "@storytree/drive"],
    ["docs/research/x.md", "@storytree/app-surface"],
    ["stories/x/story.md", "@storytree/orchestrator"],
    ["CLAUDE.md", "@storytree/cli"],
    [".claude/agents/x.md", "@storytree/cli"],
    [".claude/settings.json", "@storytree/drive"],
    [".codex/agents/x.toml", "@storytree/cli"],
  ];
  for (const [file, missing] of governed) {
    const shrunk = PROJECTS.filter((p) => p.name !== missing);
    const scope = classifyChangedFiles([file], shrunk);
    assert.equal(scope.mode, "full", `${file} must fail wide when ${missing} is gone`);
    assert.match(scope.reason, /absent from this workspace/);
  }
});

test("no entry can render an EMPTY scope — the map only ever selects at least one project", () => {
  // A path measured to have zero readers is mapped UP to its writer, never down to an empty list.
  // An empty scope would be a SECOND terminal state that runs nothing, and its failure mode is a
  // branch gating green having tested nothing. This asserts the property rather than the policy, so
  // a future entry written with `projects: []` reds right here.
  for (const file of [
    "docs/decisions/x.md",
    "docs/x.md",
    "stories/x/story.md",
    "CLAUDE.md",
    "AGENTS.md",
    ".claude/agents/x.md",
    ".claude/settings.json",
    ".codex/x.toml",
    ".cursor/x.md",
    ".gemini/x.md",
    ".opencode/agent/x.md",
  ]) {
    const scope = classifyChangedFiles([file], PROJECTS);
    assert.equal(scope.mode, "affected", file);
    assert.ok(scope.mode === "affected" && scope.projects.length > 0, `${file} selected nothing`);
    assert.notEqual(pnpmArgsFor(scope), "-r", `${file} fell back to the full run`);
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
  // pnpm cannot select. Against the REAL workspace it must still resolve to exactly its readers.
  const scope = classifyChangedFiles(
    ["docs/research/a-note.md"],
    discoverWorkspaceProjects(repoRoot),
  );
  assert.equal(scope.mode, "affected", `the reader map has gone stale: ${scope.reason}`);
  assert.deepEqual(
    scope.mode === "affected" ? scope.projects : [],
    ["@storytree/app-surface", "@storytree/cli", "@storytree/drive"],
  );
});

test("real-repo classification: a cli-only diff selects @storytree/cli", () => {
  const scope = classifyChangedFiles(
    ["packages/cli/src/ci-affected.ts"],
    discoverWorkspaceProjects(repoRoot),
  );
  assert.deepEqual(scope.mode === "affected" ? scope.projects : scope, ["@storytree/cli"]);
});
