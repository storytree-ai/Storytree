import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { Store } from "@storytree/storage-protocol";
import { FileToolExecutor, FILE_WRITE_TOOLS } from "@storytree/agent";
import type { PhaseAuthor } from "@storytree/agent";
import {
  OwnedLoopAuthor,
  PathWriteScope,
  rollupStatus,
  rollupStoryGreen,
  scriptedWriterModel,
} from "@storytree/orchestrator";
import type { NodeSpec } from "@storytree/orchestrator";
import type { ReliabilityGate } from "@storytree/library";

import { driveBuildTestsGate } from "./gate-build-driver.js";

/**
 * ADR-0098 (U2) — the gate→loop wiring, proven OFFLINE: a `build-tests` gate carrying a
 * `(build: <node-id>)` reference is driven through the REAL prove-it-gate by a SCRIPTED leaf over a
 * throwaway git fixture (no DB, no API key, no SDK spend). The fixture's existing source is CORRECT
 * but UNTESTABLE-as-is (no `double` seam); the leaf authors a structural-seam red test, then a
 * behaviour-preserving refactor → the WHOLE-suite regression wall goes green → a DRIVEN-tier verdict
 * is signed FOR THE GATE id. The spine's own commit + git-state seams run for real against the
 * worktree; only the leaf's authorship is scripted.
 */

const execFileP = promisify(execFile);
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileP("git", args, { cwd });
  return stdout;
}

// Fixture source lives under a concrete package dir so the spec-borne write-scope globs satisfy the
// ADR-0087 structural bound (a glob must stay within one `packages/<pkg>/`). `.mjs` is ESM regardless
// of package.json, and the proof command `node --test` (no path) discovers `**/*.test.mjs` recursively
// from the worktree root — the whole-package-suite regression wall (ADR-0098 d.2).
const FIXTURE_DIR = "packages/fixture";
const SOURCE_FILE = `${FIXTURE_DIR}/calc.mjs`;
const TEST_FILE = `${FIXTURE_DIR}/double.test.mjs`;

/** A throwaway git repo: correct-but-unseam'd source + a pre-existing GREEN sibling test (the wall). */
async function fixtureRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "storytree-gate-r2-"));
  await git(["init", "-b", "main"], root);
  await git(["config", "user.email", "fixture@storytree.invalid"], root);
  await git(["config", "user.name", "fixture"], root);
  await mkdir(path.join(root, FIXTURE_DIR), { recursive: true });
  // EXISTING + CORRECT: the doubling is inline in run(); there is no `double` seam to import yet.
  await writeFile(
    path.join(root, SOURCE_FILE),
    "export function run() {\n  const out = [];\n  for (const n of [1, 2, 3]) out.push(n * 2);\n  return out;\n}\n",
  );
  // The pre-existing GREEN sibling — the regression-wall sentinel the whole-suite proof must keep green.
  await writeFile(
    path.join(root, `${FIXTURE_DIR}/run.test.mjs`),
    'import test from "node:test";\nimport assert from "node:assert/strict";\n' +
      'import { run } from "./calc.mjs";\ntest("run doubles 1..3", () => assert.deepEqual(run(), [2, 4, 6]));\n',
  );
  await git(["add", "-A"], root);
  await git(["-c", "commit.gpgsign=false", "commit", "-m", "fixture: existing calc (no seam)"], root);
  return root;
}

/** A stories dir holding ONE referenced R2 build node (`seed-runner`) under a story dir. */
async function fixtureStories(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "storytree-gate-r2-stories-"));
  const storyDir = path.join(dir, "fix-story");
  await mkdir(storyDir, { recursive: true });
  await writeFile(
    path.join(storyDir, "seed-runner.md"),
    [
      "---",
      'id: "seed-runner"',
      "tier: capability",
      'story: "fix-story"',
      'title: "seed runner seam"',
      'outcome: "the seed orchestration gets a behaviour-preserving tested seam"',
      "status: proposed",
      "proof_mode: integration-test",
      "depends_on: []",
      "proof:",
      "  command:",
      "    file: node",
      '    args: ["--version"]',
      "  scope:",
      `    testGlobs: ["${TEST_FILE}"]`,
      `    sourceGlobs: ["${SOURCE_FILE}"]`,
      "  real:",
      `    testFile: "${TEST_FILE}"`,
      `    sourceFile: "${SOURCE_FILE}"`,
      "    scope:",
      `      testGlobs: ["${TEST_FILE}"]`,
      `      sourceGlobs: ["${SOURCE_FILE}"]`,
      "    refactorForTests: true",
      "    proofCommand:",
      "      file: node",
      '      args: ["--test"]',
      "---",
      "# seed runner",
      "",
    ].join("\n"),
  );
  return dir;
}

/** The scripted R2 leaf: a structural-seam red test, then a behaviour-preserving refactor. */
const SEAM_TEST =
  'import test from "node:test";\nimport assert from "node:assert/strict";\n' +
  'import { double } from "./calc.mjs";\ntest("double doubles", () => assert.equal(double(3), 6));\n';
const REFACTORED =
  "export function double(n) {\n  return n * 2;\n}\n" +
  "export function run() {\n  return [1, 2, 3].map(double);\n}\n";

function scriptedR2Author(_spec: NodeSpec, worktreeRoot: string): PhaseAuthor {
  return new OwnedLoopAuthor({
    model: scriptedWriterModel([
      { path: TEST_FILE, content: SEAM_TEST }, // AUTHOR_TEST: the missing-seam (structural) red
      { path: SOURCE_FILE, content: REFACTORED }, // IMPLEMENT: behaviour-preserving refactor
    ]),
    tools: new FileToolExecutor({ rootDir: worktreeRoot }),
    scope: new PathWriteScope({ testGlobs: [TEST_FILE], sourceGlobs: [SOURCE_FILE] }),
    writeTools: FILE_WRITE_TOOLS,
  });
}

const CAP_ID = "seed-corpus-scripts";
function buildTestsGate(over: Partial<ReliabilityGate> = {}): ReliabilityGate {
  return {
    id: "fix-story#gate-1",
    title: "Seed orchestration gets a tested seam",
    kind: "build-tests",
    covers: [CAP_ID],
    buildNode: "seed-runner",
    ...over,
  };
}

// ── the load-bearing R2 walk ─────────────────────────────────────────────────

test("drives a build-tests gate's R2 red→green and signs a DRIVEN verdict FOR the gate id; the gate greens its covered cap", async () => {
  const stories = await fixtureStories();
  const repo = await fixtureRepo();
  const store: Store = new InMemoryStore();
  try {
    const gate = buildTestsGate();
    const env = await driveBuildTestsGate(gate, "builder@example.com", {
      storiesDir: stories,
      repoRoot: repo,
      store, // the test OWNS the store, so it can roll up the events below
      promote: false, // no remote to push to
      authorOverride: scriptedR2Author,
    });
    assert.equal(env.ok, true, env.body);
    assert.match(env.body, /gate run fix-story#gate-1 — BUILD-TESTS \(REAL\)/);
    assert.match(env.body, /build node:  seed-runner/);
    // A DRIVEN tier (integration-test → capability), NEVER adopted (ADR-0098 d.4).
    assert.match(env.body, /proof mode:  integration-test → capability/);
    assert.match(env.body, /a DRIVEN tier, never adopted/);
    assert.match(env.body, /rollup:      healthy/);

    const events = await store.readEvents();
    // The signed verdict attributes to the GATE id (not the referenced node id).
    assert.equal(rollupStatus(gate.id, events), "healthy");
    assert.equal(rollupStatus("seed-runner", events), null, "the verdict signs FOR the gate, not the build node");
    // ADR-0098 d.4: the verdict carries the referenced node's DRIVEN tier (integration-test →
    // capability), NEVER `adopted` — a build-tests green is strong driven provenance, not observe.
    const verdicts = events
      .map((e) => e.doc as { unitId?: string; proofMode?: string; outcome?: string })
      .filter((d) => d.unitId === gate.id && d.proofMode !== undefined);
    assert.equal(verdicts.length, 1, "exactly one signed verdict for the gate id");
    assert.equal(verdicts[0]!.outcome, "pass");
    assert.equal(verdicts[0]!.proofMode, "capability");
    assert.notEqual(verdicts[0]!.proofMode, "adopted");
    // ADR-0097: the gate's `(covers:)` greens the brownfield capability. The gate is BOTH an own-proof
    // obligation (the second arg) AND the coverage source (the fourth) — exactly how `story build`
    // rolls the crown (`[...uat, ...gates]` as obligations, `reliabilityGates` as coverage).
    assert.equal(rollupStoryGreen([CAP_ID], [gate], events, [gate]), "healthy");
    // Without the gate's coverage the brownfield cap is unproven — the gate is what greens it.
    assert.equal(rollupStoryGreen([CAP_ID], [], events, []), null);
  } finally {
    await rm(stories, { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  }
});

test("U3 regression wall: an R2 refactor that REGRESSES the sibling test reds the suite → no verdict signed", async () => {
  const stories = await fixtureStories();
  const repo = await fixtureRepo();
  const store: Store = new InMemoryStore();
  try {
    // The refactor introduces `double` (its own test passes) BUT regresses run() (now [3,5,7]) — the
    // pre-existing run.test.mjs goes red, so the WHOLE suite is red at CONFIRM_GREEN: no green signed.
    const REGRESSED =
      "export function double(n) {\n  return n * 2;\n}\n" +
      "export function run() {\n  return [1, 2, 3].map((n) => double(n) + 1);\n}\n";
    const regressingAuthor = (_spec: NodeSpec, worktreeRoot: string): PhaseAuthor =>
      new OwnedLoopAuthor({
        model: scriptedWriterModel([
          { path: TEST_FILE, content: SEAM_TEST },
          { path: SOURCE_FILE, content: REGRESSED },
        ]),
        tools: new FileToolExecutor({ rootDir: worktreeRoot }),
        scope: new PathWriteScope({ testGlobs: [TEST_FILE], sourceGlobs: [SOURCE_FILE] }),
        writeTools: FILE_WRITE_TOOLS,
      });
    const env = await driveBuildTestsGate(buildTestsGate(), "builder@example.com", {
      storiesDir: stories,
      repoRoot: repo,
      store,
      promote: false,
      authorOverride: regressingAuthor,
    });
    assert.equal(env.ok, false, env.body);
    assert.match(env.body, /failed closed at CONFIRM_GREEN/);
    // Halt is never a pass: no signed verdict, so the gate never greens (it stalls at the `building`
    // lifecycle mark — a regression can NEVER turn the gate healthy, the U3 regression-wall guarantee).
    assert.notEqual(rollupStatus("fix-story#gate-1", await store.readEvents()), "healthy");
  } finally {
    await rm(stories, { recursive: true, force: true });
    await rm(repo, { recursive: true, force: true });
  }
});

// ── fail-closed refusals (no worktree, no spend) ──────────────────────────────

test("refuses a build-tests gate with no (build:) reference", async () => {
  const env = await driveBuildTestsGate(buildTestsGate({ buildNode: undefined }), "builder@example.com", {
    storiesDir: ".",
    repoRoot: ".",
    store: new InMemoryStore(),
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /names no build to drive/);
});

test("refuses when the referenced build node spec does not exist", async () => {
  const stories = await fixtureStories();
  try {
    const env = await driveBuildTestsGate(buildTestsGate({ buildNode: "ghost-node" }), "builder@example.com", {
      storiesDir: stories,
      repoRoot: ".",
      store: new InMemoryStore(),
    });
    assert.equal(env.ok, false);
    assert.match(env.body, /references build node "ghost-node"/);
  } finally {
    await rm(stories, { recursive: true, force: true });
  }
});
