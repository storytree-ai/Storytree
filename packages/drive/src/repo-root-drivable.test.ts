// ADR-0246 / `foreign-project-forest-arc` inc 2 — the repo root is DRIVABLE, not just declared.
//
// Increment 1 made the root a parameter (`resolveRepoRoot`) and pointed the build driver's default
// at it, but the only thing that could SET it was `STORYTREE_REPO_ROOT`. A process-global env var is
// the wrong granularity for a caller that is not a shell — the desktop backend, the studio worker, a
// test — so this increment added the per-call `explicit` injection. These tests pin that the
// injection actually reaches the tree.
//
// The red these were written against (both genuinely failed before the change):
//
//   1. `NodeBuildOpts.repoRoot` DID NOT EXIST. `node-build.ts`'s own doc comment claimed it did
//      ("the per-call NodeBuildOpts.repoRoot / StoryBuildOpts.repoRoot injections already override
//      this"), which is the ADR-0246 measured-inventory failure mode re-firing on inc 1's own prose:
//      only `StoryBuildOpts` had the field.
//   2. `storyBuild` honoured `opts.repoRoot` for the `--real` worktree cut and the promotion
//      (`rootDir`, story-build.ts) while resolving story/capability SPECS from the module-derived
//      `repoRoot()` — so a caller pointing it at a foreign project got storytree's own stories built
//      inside the foreign repo's worktree. That is a D5 (proof-leg) break: the build proves the
//      wrong tree.
//
// The fixture is a directory tree, not a git repo: every assertion here is about SPEC RESOLUTION,
// which is pure fs. The `--real` legs (worktree cut, promotion) need a real git repo and are proven
// separately; what matters for this increment is that one root feeds all of them, which is now
// structural — `rootDir` is computed once per build and passed to each leg.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { REPO_ROOT_ENV } from "@storytree/library";

import { nodeResolve, buildableNodeIds } from "./node-build.js";
import { storyBuild } from "./story-build.js";

/**
 * A foreign project's story spec — its OWN proof command (`npm test`, not `pnpm --filter
 * @storytree/…`), nothing of storytree's. ADR-0246's measurement already established that proof
 * commands are per-node frontmatter data rather than global config, which is what makes a foreign
 * project's proof leg tractable; this fixture exercises exactly that.
 *
 * MEASURED CONSTRAINT, deliberately worked WITH rather than removed (ADR-0246 D6 fork (c) is open):
 * the scope globs below are rooted under `packages/` because ADR-0087's write-scope validator
 * refuses any glob not rooted at `packages/`, `apps/`, `stories/`, or `docs/` — storytree's OWN
 * monorepo layout, hard-coded. A foreign project laid out as `src/` therefore cannot author a legal
 * proof scope today: staging this same fixture with `src/**` globs fails spec load with
 * "over-broad scope glob".
 *
 * That is a genuine finding for this arc and it is NOT this increment's to fix — fork (c) ("whether
 * `repo-manifest.json` and the boundary checks become per-project or optional") is one of the three
 * ADR-0246 D6 forks left open on purpose, and relaxing the validator here would settle it by
 * accident. What this file proves is ROOT RESOLUTION; the layout assumption is recorded, not
 * touched.
 */
const FOREIGN_SPEC = `---
id: "acme-widget"
tier: story
title: "The Acme widget"
outcome: "A capability belonging to a project that is not storytree."
status: mapped
proof_mode: integration-test
uat_witness: machine
capabilities: []
depends_on: []
proof:
  command:
    file: npm
    args: ["test", "--", "widget"]
  scope:
    testGlobs: ["packages/widget/**/*.test.js"]
    sourceGlobs: ["packages/widget/**/*.js"]
---

# The Acme widget

A story in a repo that has never heard of storytree.
`;

/**
 * Stage a throwaway repo that has its own `stories/` and NOTHING else of storytree's. Returns the
 * root; the caller removes it.
 */
function stageForeignRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "storytree-foreign-"));
  const storyDir = path.join(root, "stories", "acme-widget");
  mkdirSync(storyDir, { recursive: true });
  writeFileSync(path.join(storyDir, "story.md"), FOREIGN_SPEC, "utf8");
  return root;
}

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

test("an injected repoRoot points node resolve at a FOREIGN project's tree", () => {
  const foreign = stageForeignRepo();
  try {
    const env = nodeResolve("acme-widget", { repoRoot: foreign });
    assert.equal(env.ok, true, `expected the foreign node to resolve; got: ${env.body}`);
    // Its OWN proof command, read out of its OWN stories/ — this is "get its tree back".
    assert.match(env.body, /npm test -- widget/, `expected the FOREIGN proof command; got: ${env.body}`);
  } finally {
    rmSync(foreign, { recursive: true, force: true });
  }
});

test("storytree's OWN nodes are invisible under a foreign root (the root really moved)", () => {
  const foreign = stageForeignRepo();
  try {
    // `forest-world` is one of storytree's own stories. Under a foreign root the spec is absent, so
    // resolution must REFUSE — a pass here would mean the root was ignored and this checkout's
    // stories/ was read anyway, which is exactly the story-build bug this increment fixed.
    const env = nodeResolve("forest-world", { repoRoot: foreign });
    assert.equal(env.ok, false);
    assert.match(env.body, /no node spec "forest-world"/);
    assert.ok(
      env.body.includes(foreign),
      `the refusal should name the foreign stories dir it searched; got: ${env.body}`,
    );
  } finally {
    rmSync(foreign, { recursive: true, force: true });
  }
});

test("an injected repoRoot BEATS STORYTREE_REPO_ROOT (explicit > env, ADR-0246 inc 1 precedence)", () => {
  const foreign = stageForeignRepo();
  const decoy = mkdtempSync(path.join(tmpdir(), "storytree-decoy-"));
  try {
    // The env names an empty decoy root; the explicit injection names the real fixture. If
    // precedence were inverted the spec would not be found at all.
    withEnv(decoy, () => {
      const env = nodeResolve("acme-widget", { repoRoot: foreign });
      assert.equal(env.ok, true, `explicit should beat env; got: ${env.body}`);
      assert.match(env.body, /npm test -- widget/, `expected the FOREIGN proof command; got: ${env.body}`);
    });
  } finally {
    rmSync(foreign, { recursive: true, force: true });
    rmSync(decoy, { recursive: true, force: true });
  }
});

test("storyBuild resolves SPECS from the injected root, not this checkout (the inc-2 red)", async () => {
  const foreign = stageForeignRepo();
  try {
    // `library` is one of storytree's own stories and IS present in this checkout. Pointed at a
    // foreign root that has no such story, storyBuild must REFUSE.
    //
    // This is the exact red the fix was written against: `rootDir` (opts.repoRoot ?? repoRoot()) fed
    // the --real worktree cut and the promotion, while `storiesDir` defaulted under the module
    // `repoRoot()`. So this call USED to find storytree's own stories/library/story.md and walk a
    // whole build — the wrong tree's nodes, proven inside the right tree's worktree (an ADR-0246 D5
    // break). Reverting story-build.ts's `path.join(rootDir, "stories")` back to `repoRoot()` turns
    // this assertion red again.
    const env = await storyBuild("library", {
      dryRun: true,
      actor: "inc2-test@storytree.local",
      repoRoot: foreign,
    });
    assert.equal(env.ok, false, `expected a refusal under the foreign root; got ok with: ${env.body}`);
    assert.match(env.body, /no story spec "library"/);
    assert.ok(
      env.body.includes(foreign),
      `the refusal should name the FOREIGN stories dir it searched; got: ${env.body}`,
    );
  } finally {
    rmSync(foreign, { recursive: true, force: true });
  }
});

test("MEASURED (ADR-0246 D6 fork c, OPEN): a foreign `src/` layout cannot author a legal proof scope", () => {
  // Not a wish — a pin on today's honest limit, so the next increment starts from a fact instead of
  // re-measuring. ADR-0087's write-scope validator admits only globs rooted at packages/ | apps/ |
  // stories/ | docs/, which is storytree's own monorepo shape. A foreign project laid out as `src/`
  // resolves its ROOT fine (this increment's subject, proven above) and then fails spec load.
  //
  // When fork (c) is settled — per-project layout, or the check made optional outside storytree —
  // this test SHOULD go red. That is the signal, not a regression: update it to match the decision.
  const foreign = mkdtempSync(path.join(tmpdir(), "storytree-foreign-src-"));
  try {
    const storyDir = path.join(foreign, "stories", "acme-widget");
    mkdirSync(storyDir, { recursive: true });
    writeFileSync(
      path.join(storyDir, "story.md"),
      FOREIGN_SPEC.replace(/packages\/widget/g, "src"),
      "utf8",
    );
    const env = nodeResolve("acme-widget", { repoRoot: foreign });
    assert.equal(env.ok, false);
    assert.match(env.body, /over-broad scope glob/);
  } finally {
    rmSync(foreign, { recursive: true, force: true });
  }
});

test("discovery under a foreign root lists ITS buildable nodes, not storytree's registry-only ids", () => {
  const foreign = stageForeignRepo();
  try {
    const { buildable } = buildableNodeIds(path.join(foreign, "stories"));
    assert.ok(
      buildable.includes("acme-widget"),
      `the foreign spec-borne node should be discoverable; got: ${buildable.join(", ")}`,
    );
  } finally {
    rmSync(foreign, { recursive: true, force: true });
  }
});
