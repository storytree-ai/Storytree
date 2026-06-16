import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { InMemoryStore } from "@storytree/core";
import type { RealProofConfig } from "@storytree/orchestrator";

import { run } from "./commands.js";
import {
  buildableNodeIds,
  DEFAULT_TEST_DB_NAME,
  nodeHelp,
  renderLeafPhasePrompts,
  resolveAddDepsGroup,
  resolveDbProofEnv,
  workspacePackageForSource,
} from "./node-build.js";

/**
 * `storytree node build <id> --dry-run` (drive-machinery Phase C), driven through `run` exactly as
 * `main` does. All offline: scripted model, temp workspace, InMemoryStore — zero API cost, no DB.
 * `--actor` pins the signer so the tests are deterministic on any machine (no git-email reliance).
 */

/** The node area never touches the library store; an empty InMemoryStore keeps the tests fast. */
const deps = { store: new InMemoryStore() };

test("node build <id> --dry-run walks the gate and reports trail + verdict + rollup", async () => {
  const env = await run(
    ["node", "build", "library-cli", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  // The full phase trail, in order.
  assert.match(env.body, /AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE/);
  // The signed verdict, attributed to the --actor signer, rendered by core's verdictLine (the
  // promoted verdict-line node is the live consumer here), with the spine's red→green evidence.
  assert.match(env.body, /verdict: {5}PASS library-cli \(capability\) — signed by tester@example\.com @ /);
  assert.match(env.body, /observation:red, observation:green/);
  // The real spec drove it: real file, real proof-mode mapping.
  assert.match(env.body, /stories\/library\/library-cli\.md/);
  assert.match(env.body, /integration-test → capability/);
  // The rollup DERIVES healthy off the event log (building → signed pass).
  assert.match(env.body, /rollup: {6}healthy/);
  // The honest framing is part of the output, not just a code comment.
  assert.match(env.body, /proves the GLUE/);
  assert.match(env.body, /NOT the\nnode's actual proofs/);
});

test("node build with no mode is refused (must pick --dry-run or --live)", async () => {
  const env = await run(["node", "build", "library-cli"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
  assert.match(env.body, /--live/);
  assert.ok(env.next?.some((n) => n.includes("--dry-run")));
  assert.ok(env.next?.some((n) => n.includes("--live")));
});

test("node build with BOTH modes is refused (dry-run xor live)", async () => {
  const env = await run(["node", "build", "library-cli", "--dry-run", "--live"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
});

test("node build with --dry-run AND --real is refused; the mode menu names --real", async () => {
  const env = await run(["node", "build", "verdict-line", "--dry-run", "--real"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /pick exactly one mode/);
  assert.match(env.body, /--real/);
  assert.match(env.body, /REAL proof command|REAL test\/impl/);
  assert.ok(env.next?.some((n) => n.includes("--real")));
});

test("node build --real on a node WITHOUT a real-proof config fails closed before any worktree", async () => {
  const env = await run(
    ["node", "build", "library-cli", "--real", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /not REAL-buildable/);
  assert.match(env.body, /verdict-line/);
  assert.ok(env.next?.some((n) => n === "storytree node build verdict-line --real"));
});

test("the verdict-line node spec loads and dry-runs (the real target is also glue-driveable)", async () => {
  const env = await run(
    ["node", "build", "verdict-line", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /stories\/drive-machinery\/verdict-line\.md/);
  assert.match(env.body, /contract-test → contract/);
  assert.match(env.body, /rollup: {6}healthy/);
});

test("node build with an unknown id is guidance listing the buildable nodes", async () => {
  const env = await run(["node", "build", "no-such-node", "--dry-run", "--actor", "t@e.c"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /no node spec "no-such-node"/);
  assert.ok(env.next?.some((n) => n.includes("library-cli")));
});

test("node build on a spec that exists but has NO proof config fails closed", async () => {
  // studio/browse-library.md is a real spec with neither a spec-borne `proof:` block nor a
  // registry entry (ADR-0057) — so it fails closed, naming both routes out.
  const env = await run(
    ["node", "build", "browse-library", "--dry-run", "--actor", "t@e.c"],
    deps,
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /no proof config/);
  assert.match(env.body, /proof:/);
});

test("node build without an id, and bare `node`, are help/guidance", async () => {
  const bare = await run(["node"], deps);
  assert.equal(bare.ok, true);
  assert.match(bare.body, /node build <id> --dry-run/);
  assert.match(bare.body, /library-cli/);
  assert.match(bare.body, /--real/);
  // Spec-borne REAL nodes (ADR-0057 A) join the registry reals in this list: node-resolve-report
  // and cloud-sql-admin-rest, plus the binding-staleness slices (ADR-0016; their proof: blocks
  // live in stories/binding-staleness/*.md): boundhash-on-verdict, change-event-store,
  // change-store-pg (the ADR-0064 §1 DB-backed PgChangeStore proof), drift-reads-store,
  // gate-emits-change, source-drift.
  assert.match(
    bare.body,
    /REAL-buildable nodes: +ambient-integration, boundhash-on-verdict, change-event-store, change-store-pg, cloud-sql-admin-rest, declare-presence, drift-reads-store, gate-emits-change, node-resolve-report, noticeboard-cli, presence-store, source-drift, tree-view, verdict-glyphs, verdict-line/,
  );

  const noId = await run(["node", "build", "--dry-run"], deps);
  assert.equal(noId.ok, false);
  assert.match(noId.body, /needs an id/);
});

test("renderLeafPhasePrompts assembles the live leaf's per-phase prompts from the Library (ADR-0051 §4)", async () => {
  // The live/real SDK leaf's system prompt IS the rendered red-builder (AUTHOR_TEST) /
  // green-builder (IMPLEMENT) agent — assembled offline from the seed corpus, fail-loud on a
  // missing agent or a dangling ref. This pins that the wiring resolves the renamed agents and
  // injects their bodies (the anti-blindside guarantee: never a generic fallback).
  const res = await renderLeafPhasePrompts();
  assert.equal(res.ok, true, res.ok ? "" : res.refusal.body);
  if (!res.ok) return;
  // The AUTHOR_TEST prompt is the red-builder agent, the IMPLEMENT prompt is the green-builder.
  assert.match(res.prompts.AUTHOR_TEST, /red-builder/);
  assert.match(res.prompts.AUTHOR_TEST, /AUTHOR_TEST/);
  assert.match(res.prompts.IMPLEMENT, /green-builder/);
  assert.match(res.prompts.IMPLEMENT, /IMPLEMENT/);
  // The renderer INJECTS the ref bodies (reference-don't-restate) — the prove-it-gate context is
  // present, not just a list of asset ids.
  assert.match(res.prompts.AUTHOR_TEST, /## Context/);
  // The OLD ids are gone from the assembled prompt — the rename actually took.
  assert.doesNotMatch(res.prompts.AUTHOR_TEST, /leaf-test-author/);
  assert.doesNotMatch(res.prompts.IMPLEMENT, /leaf-implementer/);
});

test("the story node (library) dry-runs too, with the UAT → story proof-mode mapping", async () => {
  const env = await run(
    ["node", "build", "library", "--dry-run", "--actor", "tester@example.com"],
    deps,
  );
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /stories\/library\/story\.md/);
  assert.match(env.body, /UAT → story/);
  assert.match(env.body, /rollup: {6}healthy/);
});

// ── spec-borne node DISCOVERY (ADR-0057 A; the gap the blind dogfood test surfaced) ─────────────

/** A fixture stories dir with ONE spec-borne-only node (a `proof:` block, NO registry entry). */
async function fixtureSpecBorneStories(opts: { withMalformed?: boolean } = {}): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-discovery-"));
  const storyDir = path.join(dir, "feat-story");
  await fs.mkdir(storyDir, { recursive: true });
  await fs.writeFile(
    path.join(storyDir, "cap-spec-borne.md"),
    [
      "---",
      'id: "cap-spec-borne"',
      "tier: capability",
      'title: "x"',
      'outcome: "y"',
      "status: proposed",
      "proof_mode: integration-test",
      "proof:",
      "  command:",
      "    file: node",
      '    args: ["--version"]',
      "  scope:",
      '    testGlobs: ["x.test.ts"]',
      '    sourceGlobs: ["x.ts"]',
      "  real:",
      '    testFile: "x.test.ts"',
      '    sourceFile: "x.ts"',
      "    scope:",
      '      testGlobs: ["x.test.ts"]',
      '      sourceGlobs: ["x.ts"]',
      "---",
      "# x",
      "",
    ].join("\n"),
  );
  if (opts.withMalformed === true) {
    // A malformed proof block (scope missing sourceGlobs) — must be SKIPPED in the listing, not throw.
    await fs.writeFile(
      path.join(storyDir, "cap-bad.md"),
      [
        "---",
        'id: "cap-bad"',
        "tier: capability",
        'title: "x"',
        'outcome: "y"',
        "status: proposed",
        "proof_mode: integration-test",
        "proof:",
        "  command:",
        "    file: node",
        '    args: ["--version"]',
        "  scope:",
        '    testGlobs: ["x.test.ts"]',
        "---",
        "# x",
        "",
      ].join("\n"),
    );
  }
  return dir;
}

test("buildableNodeIds merges SPEC-BORNE nodes with the registry (a self-registered node is discoverable)", async () => {
  const dir = await fixtureSpecBorneStories();
  try {
    const { buildable, realBuildable } = buildableNodeIds(dir);
    // The spec-borne-only node (no registry entry) appears in BOTH lists.
    assert.ok(buildable.includes("cap-spec-borne"), `buildable has cap-spec-borne: ${buildable}`);
    assert.ok(realBuildable.includes("cap-spec-borne"), `realBuildable has cap-spec-borne`);
    // The registry nodes are still there (union, not replacement).
    assert.ok(buildable.includes("library-cli"), "registry node library-cli still listed");
    assert.ok(realBuildable.includes("verdict-line"), "registry real node verdict-line still listed");
    // Sorted + de-duped.
    assert.deepEqual(buildable, [...buildable].sort());
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("nodeHelp lists spec-borne nodes; a malformed spec is SKIPPED, never blanks the list", async () => {
  const dir = await fixtureSpecBorneStories({ withMalformed: true });
  try {
    const env = nodeHelp(dir);
    assert.equal(env.ok, true);
    // The self-registered node shows in the help discovery surface.
    assert.match(env.body, /cap-spec-borne/);
    // The malformed sibling is skipped (no throw) and the registry nodes still render.
    assert.doesNotMatch(env.body, /cap-bad/);
    assert.match(env.body, /library-cli/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ── `node resolve` (FREE, read-only — the gap the blind dogfood test surfaced) ───────────────────

test("node resolve on a spec-borne REAL node shows source=spec, REAL-buildable + the real proof display", async () => {
  const env = await run(["node", "resolve", "verdict-line"], deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /node resolve verdict-line/);
  assert.match(env.body, /stories\/drive-machinery\/verdict-line\.md/);
  assert.match(env.body, /contract-test → contract/);
  assert.match(env.body, /buildable: +yes — source: spec/);
  assert.match(env.body, /REAL-buildable: yes/);
  // The real proof display is the orchestrator's one-true display, not hand-formatted.
  assert.match(env.body, /real proof: +node --import tsx --test packages\/core\/src\/verdict-line\.test\.ts/);
  // Read-only: zero-cost next steps, no spend implied by the resolve itself.
  assert.ok(env.next?.some((n) => n.includes("--dry-run")));
  assert.ok(env.next?.some((n) => n.includes("--real")));
});

test("node resolve on the dogfood node (node-resolve-report) resolves spec-borne + REAL-buildable", async () => {
  const env = await run(["node", "resolve", "node-resolve-report"], deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /buildable: +yes — source: spec/);
  assert.match(env.body, /REAL-buildable: yes/);
  assert.match(env.body, /packages\/cli\/src\/resolve-report\.test\.ts/);
});

test("node resolve on a registry-only node shows source=registry and REAL-buildable=no", async () => {
  const env = await run(["node", "resolve", "library-cli"], deps);
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /buildable: +yes — source: registry/);
  assert.match(env.body, /REAL-buildable: no/);
});

test("node resolve on a non-buildable node fails closed, naming BOTH routes out", async () => {
  // browse-library: a real spec with neither a spec-borne proof: block nor a registry entry.
  const env = await run(["node", "resolve", "browse-library"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /NOT BUILDABLE/);
  assert.match(env.body, /has no proof config/);
  assert.match(env.body, /'proof:' block/);
  assert.match(env.body, /test-command registry/);
});

test("node resolve on an unknown id is guidance listing buildable nodes", async () => {
  const env = await run(["node", "resolve", "no-such-node"], deps);
  assert.equal(env.ok, false);
  assert.match(env.body, /no node spec "no-such-node"/);
  assert.ok(env.next?.some((n) => n.includes("storytree node resolve")));
});

// ── ADR-0064: resolveDbProofEnv — the CLI's first honesty wall for a db-backed proof ─────────────

test("resolveDbProofEnv defaults to the canonical disposable test DB when STORYTREE_DB_NAME is unset", () => {
  const savedName = process.env["STORYTREE_DB_NAME"];
  const savedUser = process.env["STORYTREE_DB_USER"];
  try {
    delete process.env["STORYTREE_DB_NAME"];
    process.env["STORYTREE_DB_USER"] = "iam@example.com";
    const res = resolveDbProofEnv();
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.dbName, DEFAULT_TEST_DB_NAME);
    assert.equal(res.env["STORYTREE_DB_NAME"], DEFAULT_TEST_DB_NAME);
    // The IAM user (keyless auth) is carried through for the worktree proof to authenticate.
    assert.equal(res.env["STORYTREE_DB_USER"], "iam@example.com");
  } finally {
    if (savedName === undefined) delete process.env["STORYTREE_DB_NAME"];
    else process.env["STORYTREE_DB_NAME"] = savedName;
    if (savedUser === undefined) delete process.env["STORYTREE_DB_USER"];
    else process.env["STORYTREE_DB_USER"] = savedUser;
  }
});

test("resolveDbProofEnv honors an explicit disposable STORYTREE_DB_NAME override", () => {
  const saved = process.env["STORYTREE_DB_NAME"];
  try {
    process.env["STORYTREE_DB_NAME"] = "storytree_test_alt";
    const res = resolveDbProofEnv();
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.dbName, "storytree_test_alt");
  } finally {
    if (saved === undefined) delete process.env["STORYTREE_DB_NAME"];
    else process.env["STORYTREE_DB_NAME"] = saved;
  }
});

test("resolveDbProofEnv REFUSES production (STORYTREE_DB_NAME=storytree) — fail-closed, the first wall", () => {
  const saved = process.env["STORYTREE_DB_NAME"];
  try {
    process.env["STORYTREE_DB_NAME"] = "storytree"; // PRODUCTION
    const res = resolveDbProofEnv();
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.match(res.refusal.body, /ISOLATED test database, never production|PRODUCTION/i);
  } finally {
    if (saved === undefined) delete process.env["STORYTREE_DB_NAME"];
    else process.env["STORYTREE_DB_NAME"] = saved;
  }
});

// ── ADR-0064 §2: guarded dependency adds — the CLI derivation + group resolution ─────────────────

test("workspacePackageForSource derives the workspace package name from a packages/<dir> source file", () => {
  // Reads the real packages/<dir>/package.json name (the honest source, not a path-convention guess).
  assert.equal(workspacePackageForSource("packages/core/src/anchor.ts"), "@storytree/core");
  assert.equal(workspacePackageForSource("packages/store/src/change-store.ts"), "@storytree/store");
  // Not under a workspace package → null (the caller refuses).
  assert.equal(workspacePackageForSource("docs/decisions/x.md"), null);
  assert.equal(workspacePackageForSource("apps/studio/src/x.ts"), null);
});

test("resolveAddDepsGroup: none declared → null; declared → a group targeting the derived package", () => {
  const noDeps: RealProofConfig = {
    testFile: "packages/core/src/x.test.ts",
    sourceFile: "packages/core/src/x.ts",
    scope: { testGlobs: ["packages/core/src/x.test.ts"], sourceGlobs: ["packages/core/src/x.ts"] },
  };
  const none = resolveAddDepsGroup(noDeps);
  assert.equal(none.ok, true);
  if (none.ok) assert.equal(none.group, null);

  const withDeps: RealProofConfig = {
    testFile: "packages/core/src/anchor.test.ts",
    sourceFile: "packages/core/src/anchor.ts",
    scope: { testGlobs: ["packages/core/src/anchor.test.ts"], sourceGlobs: ["packages/core/src/anchor.ts"] },
    install: true,
    typecheck: { file: "pnpm", args: ["--filter", "@storytree/core", "typecheck"] },
    addDeps: ["tree-sitter", "tree-sitter-typescript@0.21.0"],
  };
  const grouped = resolveAddDepsGroup(withDeps);
  assert.equal(grouped.ok, true);
  if (grouped.ok) {
    assert.deepEqual(grouped.group, {
      packageName: "@storytree/core",
      deps: ["tree-sitter", "tree-sitter-typescript@0.21.0"],
    });
  }
});

test("resolveAddDepsGroup REFUSES when the target package can't be derived (source not under packages/)", () => {
  const badSource: RealProofConfig = {
    testFile: "scripts/x.test.ts",
    sourceFile: "scripts/x.ts",
    scope: { testGlobs: ["scripts/x.test.ts"], sourceGlobs: ["scripts/x.ts"] },
    install: true,
    typecheck: { file: "pnpm", args: ["-r", "typecheck"] },
    addDeps: ["tree-sitter"],
  };
  const res = resolveAddDepsGroup(badSource);
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.refusal.body, /target workspace package could not be derived/);
});
