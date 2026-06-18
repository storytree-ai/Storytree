import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { InMemoryStore } from "@storytree/base";
import { FileToolExecutor, FILE_WRITE_TOOLS } from "@storytree/agent";
import type { PhaseAuthor } from "@storytree/agent";
import {
  OwnedLoopAuthor,
  PathWriteScope,
  scriptedWriterModel,
} from "@storytree/orchestrator";
import type { NodeSpec } from "@storytree/orchestrator";

import { storyBuild } from "./story-build.js";

/**
 * ADR-0057 §3 expansion D — `story build --real` (the whole-story REAL chain). All OFFLINE: a
 * fixture git repo, a fixture stories/ dir whose capabilities carry spec-borne `proof:` blocks
 * pointing at NET-NEW files, and scripted {@link PhaseAuthor}s (no SDK leaf, no API cost). The
 * spine's own commit + git-state seams run for real against the fixture worktree. The live
 * multi-node SDK chain is operator-attested, like every other live leg.
 */

const execFileP = promisify(execFile);
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileP("git", args, { cwd });
  return stdout;
}

/** A throwaway git repo with one commit; optionally a bare origin so push paths are local. */
async function fixtureRepo(
  withOrigin: boolean,
): Promise<{ root: string; origin: string | null; initialSha: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "storytree-real-chain-"));
  await git(["init", "-b", "main"], root);
  await git(["config", "user.email", "fixture@storytree.invalid"], root);
  await git(["config", "user.name", "fixture"], root);
  await writeFile(path.join(root, "README.md"), "fixture\n");
  // "type": "module" so node treats the authored .ts (run via the absolute tsx loader) as ESM
  // unambiguously — no node_modules needed (the leaves import only node: builtins + relative files).
  await writeFile(path.join(root, "package.json"), '{\n  "type": "module"\n}\n');
  await git(["add", "-A"], root);
  await git(["commit", "-m", "fixture: initial"], root);
  const initialSha = (await git(["rev-parse", "HEAD"], root)).trim();
  let origin: string | null = null;
  if (withOrigin) {
    origin = await mkdtemp(path.join(os.tmpdir(), "storytree-real-chain-origin-"));
    await git(["init", "--bare", "-b", "main"], origin);
    await git(["remote", "add", "origin", origin], root);
  }
  return { root, origin, initialSha };
}

/** Frontmatter for a fixture capability with a spec-borne (no-install) real proof config. */
function capSpec(id: string, dependsOn: string[]): string {
  const test = `${id}.test.ts`;
  const src = `${id}.ts`;
  return [
    "---",
    `id: "${id}"`,
    "tier: capability",
    'story: "fix-story"',
    `title: "${id}"`,
    `outcome: "outcome of ${id}"`,
    "status: proposed",
    "proof_mode: integration-test",
    `depends_on: [${dependsOn.join(", ")}]`,
    "proof:",
    "  command:",
    "    file: node",
    '    args: ["--version"]',
    "  scope:",
    `    testGlobs: ["${test}"]`,
    `    sourceGlobs: ["${src}"]`,
    "  real:",
    `    testFile: "${test}"`,
    `    sourceFile: "${src}"`,
    "    scope:",
    `      testGlobs: ["${test}"]`,
    `      sourceGlobs: ["${src}"]`,
    "---",
    `# ${id}`,
    "",
  ].join("\n");
}

/** A fixture stories/ dir: a human-witnessed story (UAT node withheld) over the given capabilities. */
async function fixtureStories(
  caps: { id: string; dependsOn: string[] }[],
  opts: { uatWitness?: "machine" | "human" } = {},
): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "storytree-real-chain-stories-"));
  const storyDir = path.join(dir, "fix-story");
  await mkdir(storyDir, { recursive: true });
  const witnessLine = opts.uatWitness !== undefined ? `uat_witness: ${opts.uatWitness}\n` : "";
  await writeFile(
    path.join(storyDir, "story.md"),
    [
      "---",
      'id: "fix-story"',
      "tier: story",
      'title: "fix story"',
      'outcome: "the fixture story"',
      "status: proposed",
      "proof_mode: UAT",
      witnessLine + `capabilities: [${caps.map((c) => c.id).join(", ")}]`,
      "depends_on: []",
      "---",
      "# fix story",
      "",
    ].join("\n"),
  );
  for (const c of caps) {
    await writeFile(path.join(storyDir, `${c.id}.md`), capSpec(c.id, c.dependsOn));
  }
  return dir;
}

/** The scripted red→green pair each fixture node authors (cap-b imports cap-a's source). */
const NODE_SOURCES: Record<string, { test: string; impl: string }> = {
  "cap-a": {
    test:
      'import test from "node:test";\nimport assert from "node:assert/strict";\n' +
      'import { a } from "./cap-a.js";\ntest("a", () => assert.equal(a(), 1));\n',
    impl: "export function a(): number {\n  return 1;\n}\n",
  },
  "cap-b": {
    // cap-b's TEST imports cap-a's spine-committed source — proving the shared/stacked worktree.
    test:
      'import test from "node:test";\nimport assert from "node:assert/strict";\n' +
      'import { a } from "./cap-a.js";\nimport { b } from "./cap-b.js";\n' +
      'test("b builds on a", () => assert.equal(b(), a() + 1));\n',
    impl: 'import { a } from "./cap-a.js";\nexport function b(): number {\n  return a() + 1;\n}\n',
  },
  // A node that fails closed: its impl does NOT satisfy its test (green is never observed).
  "cap-bad": {
    test:
      'import test from "node:test";\nimport assert from "node:assert/strict";\n' +
      'import { bad } from "./cap-bad.js";\ntest("bad", () => assert.equal(bad(), 42));\n',
    impl: "export function bad(): number {\n  return 0;\n}\n",
  },
};

/** A per-node scripted leaf: writes the node's test (AUTHOR_TEST) then impl (IMPLEMENT) in the worktree. */
function scriptedAuthors(
  scopes: Record<string, { testGlobs: string[]; sourceGlobs: string[] }>,
): (spec: NodeSpec, worktreeRoot: string) => PhaseAuthor | undefined {
  return (spec, worktreeRoot) => {
    const src = NODE_SOURCES[spec.id];
    const scope = scopes[spec.id];
    if (src === undefined || scope === undefined) return undefined;
    return new OwnedLoopAuthor({
      model: scriptedWriterModel([
        { path: `${spec.id}.test.ts`, content: src.test },
        { path: `${spec.id}.ts`, content: src.impl },
      ]),
      tools: new FileToolExecutor({ rootDir: worktreeRoot }),
      scope: new PathWriteScope(scope),
      writeTools: FILE_WRITE_TOOLS,
    });
  };
}

function scopeFor(id: string): { testGlobs: string[]; sourceGlobs: string[] } {
  return { testGlobs: [`${id}.test.ts`], sourceGlobs: [`${id}.ts`] };
}

// ── the load-bearing chain walk ────────────────────────────────────────────────────────────────

test("--real chains capabilities topo-ordered over ONE worktree; cap-b builds on cap-a's committed source", async () => {
  const stories = await fixtureStories([
    { id: "cap-a", dependsOn: [] },
    { id: "cap-b", dependsOn: ["cap-a"] },
  ]);
  const repo = await fixtureRepo(false);
  const store = new InMemoryStore();
  try {
    const env = await storyBuild("fix-story", {
      dryRun: false,
      real: true,
      actor: "tester@example.com",
      storiesDir: stories,
      repoRoot: repo.root,
      verdictStore: "memory", // offline scripted-leaf chain (ADR-0060): no DB, opt out of the pg default
      promote: false, // exercise the chain without touching a remote
      authorOverride: scriptedAuthors({ "cap-a": scopeFor("cap-a"), "cap-b": scopeFor("cap-b") }),
    });
    assert.equal(env.ok, true, env.body);
    assert.match(env.body, /story build fix-story — REAL/);
    // A --real story's UAT node is human-witnessed (the default) → withheld; the realistic --real
    // success is "capabilities PASSED, story UAT withheld" — every CAPABILITY real-built + signed.
    assert.match(env.body, /capabilities PASSED \(2\/2 signed\)/);
    assert.match(env.body, /nodes: {7}2\/2 signed passes/);
    assert.match(env.body, /cap-a {6}PASS {3}rollup: healthy/);
    assert.match(env.body, /cap-b {6}PASS {3}rollup: healthy/);
    // The honest real framing (one shared worktree, dependency order, halt-is-never-a-pass).
    assert.match(env.body, /REAL story build/);
    assert.match(env.body, /ONE shared worktree/);
    void store;
  } finally {
    await rm(stories, { recursive: true, force: true });
    await rm(repo.root, { recursive: true, force: true });
  }
});

test("--real HALTS the chain when a node fails closed; the later node never runs", async () => {
  const stories = await fixtureStories([
    { id: "cap-a", dependsOn: [] },
    { id: "cap-bad", dependsOn: ["cap-a"] },
    { id: "cap-b", dependsOn: ["cap-bad"] },
  ]);
  const repo = await fixtureRepo(false);
  try {
    const env = await storyBuild("fix-story", {
      dryRun: false,
      real: true,
      actor: "tester@example.com",
      storiesDir: stories,
      repoRoot: repo.root,
      verdictStore: "memory", // offline scripted-leaf chain (ADR-0060): no DB, opt out of the pg default
      promote: false,
      authorOverride: scriptedAuthors({
        "cap-a": scopeFor("cap-a"),
        "cap-bad": scopeFor("cap-bad"),
        "cap-b": scopeFor("cap-b"),
      }),
    });
    assert.equal(env.ok, false, env.body);
    assert.match(env.body, /HALTED at node 2\/3/);
    assert.match(env.body, /cap-b .*never ran/);
    // Halt is never a pass, and a halted chain offers NO landing candidate.
    assert.doesNotMatch(env.body, /gh pr create/);
  } finally {
    await rm(stories, { recursive: true, force: true });
    await rm(repo.root, { recursive: true, force: true });
  }
});

// ── promotion + the halt-parks-prefix honesty wall (against a fixture origin) ─────────────────────

test("--real promotes ONCE at the stacked HEAD; cap-a's verdict commit is an ancestor of the branch tip", async () => {
  const stories = await fixtureStories([
    { id: "cap-a", dependsOn: [] },
    { id: "cap-b", dependsOn: ["cap-a"] },
  ]);
  const repo = await fixtureRepo(true);
  try {
    const env = await storyBuild("fix-story", {
      dryRun: false,
      real: true,
      actor: "tester@example.com",
      storiesDir: stories,
      repoRoot: repo.root,
      verdictStore: "memory", // offline scripted-leaf chain (ADR-0060): no DB, opt out of the pg default
      // promote defaults to true; the fixture origin keeps the push local.
      authorOverride: scriptedAuthors({ "cap-a": scopeFor("cap-a"), "cap-b": scopeFor("cap-b") }),
    });
    assert.equal(env.ok, true, env.body);
    // Exactly ONE promotion branch for the whole story (not one per node).
    const branches = (await git(["branch", "--list", "claude/real/*"], repo.root))
      .split("\n")
      .map((l) => l.replace("*", "").trim())
      .filter(Boolean);
    assert.equal(branches.length, 1, `one story branch, got: ${branches.join(", ")}`);
    assert.match(branches[0] ?? "", /^claude\/real\/fix-story-/);
    // The branch reached the (bare) origin, and a green chain offers a NON-SQUASH PR.
    assert.ok(repo.origin !== null);
    const originTip = (await git(["rev-parse", `refs/heads/${branches[0]}`], repo.origin)).trim();
    const localTip = (await git(["rev-parse", branches[0] ?? ""], repo.root)).trim();
    assert.equal(originTip, localTip, "the proven chain reached origin");
    // The branch tip is the STACKED HEAD (cap-a's + cap-b's commits on top of the initial), NOT the
    // stale worktree cut — proving the promotion uses currentHead, not worktree.headSha (the bug-trap).
    assert.notEqual(localTip, repo.initialSha, "the branch tip is a new stacked commit, not the cut");
    const stackedCount = Number((await git(["rev-list", "--count", localTip], repo.root)).trim());
    assert.ok(stackedCount >= 3, `expected initial + 2 node commits stacked, got ${stackedCount}`);
    // The landing candidate (a NON-SQUASH PR) is offered in `next`.
    assert.ok(
      (env.next ?? []).some((n) => n.includes("gh pr create") && n.includes("NON-SQUASH")),
      `expected a NON-SQUASH gh pr create in next, got: ${JSON.stringify(env.next)}`,
    );
  } finally {
    await rm(stories, { recursive: true, force: true });
    await rm(repo.root, { recursive: true, force: true });
    if (repo.origin !== null) await rm(repo.origin, { recursive: true, force: true });
  }
});

test("--real HALT parks the proven prefix LOCAL-ONLY — never pushed, never a landing candidate", async () => {
  const stories = await fixtureStories([
    { id: "cap-a", dependsOn: [] },
    { id: "cap-bad", dependsOn: ["cap-a"] },
  ]);
  const repo = await fixtureRepo(true);
  try {
    const env = await storyBuild("fix-story", {
      dryRun: false,
      real: true,
      actor: "tester@example.com",
      storiesDir: stories,
      repoRoot: repo.root,
      verdictStore: "memory", // offline scripted-leaf chain (ADR-0060): no DB, opt out of the pg default
      authorOverride: scriptedAuthors({
        "cap-a": scopeFor("cap-a"),
        "cap-bad": scopeFor("cap-bad"),
      }),
    });
    assert.equal(env.ok, false, env.body);
    assert.match(env.body, /HALTED/);
    // The proven prefix (cap-a) is parked LOCAL-ONLY: a branch exists locally...
    const branches = (await git(["branch", "--list", "claude/real/*"], repo.root))
      .split("\n")
      .map((l) => l.replace("*", "").trim())
      .filter(Boolean);
    assert.equal(branches.length, 1, "the proven prefix is parked on a local branch");
    // ...but it NEVER reached origin, and the envelope offers NO landing candidate.
    assert.ok(repo.origin !== null);
    await assert.rejects(
      git(["rev-parse", `refs/heads/${branches[0]}`], repo.origin),
      "the prefix branch must NOT be on origin (a partial story is not a landing candidate)",
    );
    assert.ok(
      !(env.next ?? []).some((n) => n.includes("gh pr create")),
      "a halted chain offers NO landing candidate",
    );
    assert.match(env.body, /LOCAL-ONLY/);
  } finally {
    await rm(stories, { recursive: true, force: true });
    await rm(repo.root, { recursive: true, force: true });
    if (repo.origin !== null) await rm(repo.origin, { recursive: true, force: true });
  }
});

// ── refusals (no worktree cut) ───────────────────────────────────────────────────────────────────

test("--real refuses a story with a non-real-buildable driven node BEFORE any worktree", async () => {
  // cap-a is real-buildable; cap-noreal has a command+scope but NO real arm.
  const stories = await mkdtemp(path.join(os.tmpdir(), "storytree-real-chain-noreal-"));
  const storyDir = path.join(stories, "fix-story");
  await mkdir(storyDir, { recursive: true });
  await writeFile(
    path.join(storyDir, "story.md"),
    [
      "---",
      'id: "fix-story"',
      "tier: story",
      'title: "x"',
      'outcome: "x"',
      "status: proposed",
      "proof_mode: UAT",
      "capabilities: [cap-a, cap-noreal]",
      "depends_on: []",
      "---",
      "# x",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(storyDir, "cap-a.md"), capSpec("cap-a", []));
  await writeFile(
    path.join(storyDir, "cap-noreal.md"),
    [
      "---",
      'id: "cap-noreal"',
      "tier: capability",
      'story: "fix-story"',
      'title: "no real"',
      'outcome: "no real"',
      "status: proposed",
      "proof_mode: integration-test",
      "depends_on: []",
      "proof:",
      "  command:",
      "    file: node",
      '    args: ["--version"]',
      "  scope:",
      '    testGlobs: ["x.test.ts"]',
      '    sourceGlobs: ["x.ts"]',
      "---",
      "# no real",
      "",
    ].join("\n"),
  );
  try {
    const env = await storyBuild("fix-story", {
      dryRun: false,
      real: true,
      actor: "tester@example.com",
      storiesDir: stories,
    });
    assert.equal(env.ok, false, env.body);
    assert.match(env.body, /not REAL-buildable/);
    assert.match(env.body, /cap-noreal/);
    // refused before any node ran — no phase trail in the body.
    assert.doesNotMatch(env.body, /PASSED/);
  } finally {
    await rm(stories, { recursive: true, force: true });
  }
});

test("--real is refused alongside --dry-run; the menu names all three modes", async () => {
  const env = await storyBuild("fix-story", { dryRun: true, real: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
  assert.match(env.body, /--real/);
});

test("--real refuses a machine-witnessed story whose UAT node is not real-buildable (before any worktree)", async () => {
  // uat_witness: machine puts the story's OWN UAT node in driveOrder — but a story UAT is not a
  // test-file red→green (no real: arm), so the run is refused before any worktree (gate-as-proof for
  // a story UAT is expansion E, not D). D refuses rather than pretends.
  const stories = await fixtureStories([{ id: "cap-a", dependsOn: [] }], { uatWitness: "machine" });
  try {
    const env = await storyBuild("fix-story", {
      dryRun: false,
      real: true,
      actor: "tester@example.com",
      storiesDir: stories,
    });
    assert.equal(env.ok, false, env.body);
    assert.match(env.body, /no proof config|not REAL-buildable/);
    assert.match(env.body, /fix-story/); // the story UAT node itself is named
    assert.doesNotMatch(env.body, /PASSED/);
  } finally {
    await rm(stories, { recursive: true, force: true });
  }
});

// (--store pg semantics for --real are covered by resolveVerdictStore's own tests + node-build's
// forged-healthy refusal; driving --real --store pg here would risk the live store/leaf in a
// DB-up session, so it is operator-attested, not an offline test.)
