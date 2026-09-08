import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadFixtureCorpus } from "@storytree/library/fixture";
import {
  ClaudeAgentAuthor,
  CodexPhaseAuthor,
  FileToolExecutor,
  FILE_WRITE_TOOLS,
  buildCodexExecArgs,
} from "@storytree/agent";
import type { CodexCommand, CodexCommandResult, CodexRunner, CodexPromotionManifest } from "@storytree/agent";
import { renderLeafPhasePrompts } from "@storytree/drive";

import {
  loadNodeSpec,
  findNodeSpecFile,
  mapProofMode,
  lookupNodeBuildConfig,
  registeredNodeIds,
  realBuildableNodeIds,
  PathWriteScope,
  proveUnit,
  gitTreeState,
  createBuildWorktree,
  OwnedLoopAuthor,
  scriptedWriterModel,
  resolveProveSpec,
  assemblePrompts,
  liveSmokePrompts,
  realPrompts,
  realProofCommand,
  workEvent,
  rollupStatus,
} from "@storytree/orchestrator";
import type {
  NodeSpec,
  RealProofConfig,
  NodeBuildConfig,
  PathWriteScopeConfig,
  PhasePrompts,
  LeafPhasePrompts,
  ResolveResult,
} from "@storytree/orchestrator";

/**
 * `prove-spec-resolution`'s runtime amendment (contracts 9 and 10): the phase briefs `resolveReal`
 * assembles are NOT runtime-aware — `realPrompts(spec, real, proofDisplay)` and `liveSmokePrompts`
 * are the SAME text regardless of whether Codex or Claude was selected, and that text is written for
 * Claude ("You cannot run shell commands.", "the `run_proof` feedback tool"). Codex genuinely CAN
 * author with native shell/`apply_patch` and genuinely has NO `run_proof`/`run_typecheck` feedback
 * tool (`CodexPhaseAuthor.feedbackToolNames` is always `[]`), so a Codex-selected build is briefed
 * with two false claims. The tests below pin this alongside the unchanged (contracts 1-8, 11)
 * resolver behaviour this file is also the coverage home for.
 */

// ── shared fixtures ────────────────────────────────────────────────────────────────────────────

/** repo root: packages/cli/src → three dirs up. */
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const STORIES_DIR = path.join(REPO_ROOT, "stories");

const TESTER = { flag: "tester@example.com" };

function baseSpec(overrides: Partial<NodeSpec> = {}): NodeSpec {
  return {
    id: "widget",
    tier: "capability",
    title: "Widget",
    outcome: "The widget behaves.",
    status: "proposed",
    proofMode: "integration-test",
    uatWitness: undefined,
    story: "widget-story",
    dependsOn: [],
    consumedBy: [],
    artifactEdges: [],
    capabilities: [],
    decisions: [],
    buildConfig: undefined,
    guidance: undefined,
    uatTestCriteria: [],
    reliabilityGates: [],
    contracts: [],
    file: "stories/widget-story/widget.md",
    ...overrides,
  };
}

function specWithReal(real: RealProofConfig, overrides: Partial<NodeSpec> = {}): NodeSpec {
  const config: NodeBuildConfig = {
    command: { file: "node", args: ["--test", real.testFile] },
    scope: real.scope,
    real,
  };
  return baseSpec({ buildConfig: config, ...overrides });
}

function specWithConfigNoReal(scope: PathWriteScopeConfig, overrides: Partial<NodeSpec> = {}): NodeSpec {
  const config: NodeBuildConfig = { command: { file: "node", args: ["--test"] }, scope };
  return baseSpec({ buildConfig: config, ...overrides });
}

/** A dependency-free net-new REAL fixture (no install). */
const NET_NEW_REAL: RealProofConfig = {
  testFile: "packages/widget/src/widget.test.ts",
  sourceFile: "packages/widget/src/widget.ts",
  scope: {
    testGlobs: ["packages/widget/src/widget.test.ts"],
    sourceGlobs: ["packages/widget/src/widget.ts"],
  },
};

/** Net-new, dependency-bearing (install:true + the required typecheck). */
const INSTALL_REAL: RealProofConfig = {
  ...NET_NEW_REAL,
  install: true,
  typecheck: { file: "pnpm", args: ["--filter", "@storytree/widget", "typecheck"] },
};

/** C (ADR-0057 §3): the edit-existing brief axis. */
const EDITS_EXISTING_REAL: RealProofConfig = { ...INSTALL_REAL, editsExisting: true };

/** R2 (ADR-0098): refactor-for-testability — a suite proofCommand, structural red. */
const REFACTOR_FOR_TESTS_REAL: RealProofConfig = {
  ...INSTALL_REAL,
  refactorForTests: true,
  proofCommand: { file: "pnpm", args: ["--filter", "@storytree/widget", "test"] },
};

/** A REAL fixture whose AUTHOR_TEST scope names MORE than one literal test file. */
const MULTI_TEST_REAL: RealProofConfig = {
  ...INSTALL_REAL,
  scope: {
    testGlobs: [
      "packages/widget/src/widget.test.ts",
      "packages/widget/src/widget-helpers.test.ts",
    ],
    sourceGlobs: ["packages/widget/src/widget.ts"],
  },
};

/** Every arm the runtime amendment must brief truthfully: net-new (±install), edit-existing, R2. */
const CODEX_TRUTHFULNESS_FIXTURES: readonly RealProofConfig[] = [
  NET_NEW_REAL,
  INSTALL_REAL,
  EDITS_EXISTING_REAL,
  REFACTOR_FOR_TESTS_REAL,
];

function resolveRealFor(
  real: RealProofConfig,
  opts: { runtime?: "codex" | "claude"; phasePrompts?: LeafPhasePrompts } = {},
): ResolveResult {
  const spec = specWithReal(real);
  return resolveProveSpec(spec, {
    mode: "real",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: `r-codex-leaf-prompt-${Math.random().toString(36).slice(2)}`,
    signerInputs: TESTER,
    ...(opts.runtime !== undefined ? { runtime: opts.runtime } : {}),
    ...(opts.phasePrompts !== undefined ? { phasePrompts: opts.phasePrompts } : {}),
  });
}

// ── Codex final-stdin capture: a CodexPhaseAuthor built from the SAME inputs `resolveReal`'s codex
// arm builds (write globs, promotion manifest, isWriteAllowed, phasePrompts), with an INJECTED
// runner so the exact final `CodexCommand.stdin` (after the adapter appends the phase manifest) is
// observable offline. This never replaces the real spine-driven author — it is the same wiring
// pattern `resolveReal` itself uses, applied here as a TEST seam (an injected runner is legal on
// CodexPhaseAuthor; production supplies none).

const CODEX_TEST_CWD =
  process.platform === "win32"
    ? "C:\\storytree-codex-leaf-prompt-fixture"
    : "/storytree-codex-leaf-prompt-fixture";

function codexAuthOk(): CodexCommandResult {
  return { code: 0, stdout: "Logged in using ChatGPT\n", stderr: "" };
}

function codexTurnOk(): CodexCommandResult {
  const lines = [
    { type: "turn.started" },
    { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
  ];
  return { code: 0, stdout: `${lines.map((e) => JSON.stringify(e)).join("\n")}\n`, stderr: "" };
}

function captureCodexRunner(): { runner: CodexRunner; commands: CodexCommand[] } {
  const commands: CodexCommand[] = [];
  const queue: CodexCommandResult[] = [codexAuthOk(), codexTurnOk()];
  return {
    commands,
    runner: async (command) => {
      commands.push(command);
      return queue.shift() ?? codexTurnOk();
    },
  };
}

interface CodexFinalStdin {
  AUTHOR_TEST: string;
  IMPLEMENT: string;
}

/**
 * Build a CodexPhaseAuthor mirroring `resolveReal`'s codex construction (write globs + exact
 * promotion manifest + the write wall + the rendered role), inject a runner, and read the actual
 * final `stdin` the adapter sends for each phase — after it appends the "## Phase brief" section
 * and its own exact-target/spine-observes-and-signs language.
 */
async function captureCodexFinalStdin(
  real: RealProofConfig,
  briefs: PhasePrompts,
  role: LeafPhasePrompts,
): Promise<CodexFinalStdin> {
  const scope = new PathWriteScope(real.scope);
  const manifests: { AUTHOR_TEST: CodexPromotionManifest; IMPLEMENT: CodexPromotionManifest } = {
    AUTHOR_TEST: {
      allowedTargets: [...new Set(real.scope.testGlobs)],
      requiredTargets: [real.testFile],
    },
    IMPLEMENT: {
      allowedTargets: [...new Set(real.scope.sourceGlobs)],
      requiredTargets: [real.sourceFile],
    },
  };
  const captureFor = async (phase: "AUTHOR_TEST" | "IMPLEMENT", brief: string): Promise<string> => {
    const cap = captureCodexRunner();
    const author = new CodexPhaseAuthor({
      cwd: CODEX_TEST_CWD,
      writeGlobs: { AUTHOR_TEST: real.scope.testGlobs, IMPLEMENT: real.scope.sourceGlobs },
      promotionManifests: manifests,
      isWriteAllowed: (p, rel) => scope.isWriteAllowed(p, rel),
      phasePrompts: role,
      runner: cap.runner,
    });
    await author.author(phase, brief);
    const exec = cap.commands[1];
    assert.ok(exec, `codex exec command was captured for ${phase}`);
    return exec.stdin ?? "";
  };
  return {
    AUTHOR_TEST: await captureFor("AUTHOR_TEST", briefs.authorTest),
    IMPLEMENT: await captureFor("IMPLEMENT", briefs.implement),
  };
}

// ── spec-files-locate-and-load ────────────────────────────────────────────────────────────────────

test("spec-files-locate-and-load: findNodeSpecFile resolves both layouts; real specs load; missing frontmatter is LOUD", async () => {
  assert.equal(
    findNodeSpecFile(STORIES_DIR, "library-cli"),
    path.join(STORIES_DIR, "library", "library-cli.md"),
  );
  assert.equal(
    findNodeSpecFile(STORIES_DIR, "library"),
    path.join(STORIES_DIR, "library", "story.md"),
  );
  assert.equal(findNodeSpecFile(STORIES_DIR, "no-such-node-xyz"), null);

  const cap = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  assert.equal(cap.id, "library-cli");
  assert.equal(cap.tier, "capability");
  assert.equal(cap.proofMode, "integration-test");
  assert.ok(cap.guidance !== undefined && cap.guidance.length > 0);

  const story = loadNodeSpec(path.join(STORIES_DIR, "library", "story.md"));
  assert.equal(story.tier, "story");
  assert.equal(story.proofMode, "UAT");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-leaf-prompt-nospec-"));
  try {
    const bad = path.join(dir, "bad.md");
    await fs.writeFile(bad, "# no frontmatter here\n");
    assert.throws(() => loadNodeSpec(bad), /no frontmatter block/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ── proof-mode-vocabulary-maps ────────────────────────────────────────────────────────────────────

test("proof-mode-vocabulary-maps: the frontmatter test-kind vocabulary maps onto core's tier ladder", () => {
  assert.equal(mapProofMode("integration-test"), "capability");
  assert.equal(mapProofMode("UAT"), "story");
  assert.equal(mapProofMode("contract-test"), "contract");
  assert.equal(mapProofMode("operator-attested"), "operator-attested");
});

// ── registry-is-explicit ──────────────────────────────────────────────────────────────────────────

test("registry-is-explicit: the registry covers the library story + its capabilities; an unknown id is null", () => {
  const ids = registeredNodeIds();
  for (const id of ["library", "library-cli", "event-sourced-store-seam"]) {
    assert.ok(ids.includes(id), `${id} is registered`);
    const config = lookupNodeBuildConfig(id);
    assert.ok(config !== null && config.command.args.length > 0);
    assert.ok(config.scope.testGlobs.length > 0 && config.scope.sourceGlobs.length > 0);
  }
  assert.equal(lookupNodeBuildConfig("definitely-unregistered-node"), null);
});

// ── real-walls-really-wall ────────────────────────────────────────────────────────────────────────

test("real-walls-really-wall: the verdict-line and tree-view entries' write walls hold; every install-bearing entry registers a typecheck", () => {
  assert.deepEqual(realBuildableNodeIds(), [
    "ambient-integration",
    "noticeboard-cli",
    "tree-view",
    "verdict-glyphs",
    "verdict-line",
  ]);
  const verdictLine = lookupNodeBuildConfig("verdict-line")?.real;
  assert.ok(verdictLine !== undefined);
  const scopeVL = new PathWriteScope(verdictLine.scope);
  assert.equal(scopeVL.isWriteAllowed("AUTHOR_TEST", verdictLine.testFile), true);
  assert.equal(scopeVL.isWriteAllowed("AUTHOR_TEST", verdictLine.sourceFile), false);
  assert.equal(scopeVL.isWriteAllowed("IMPLEMENT", verdictLine.sourceFile), true);
  assert.equal(scopeVL.isWriteAllowed("IMPLEMENT", verdictLine.testFile), false);

  const treeView = lookupNodeBuildConfig("tree-view")?.real;
  assert.ok(treeView !== undefined);
  assert.equal(treeView.install, true);
  assert.ok(treeView.typecheck !== undefined);

  for (const id of realBuildableNodeIds()) {
    const real = lookupNodeBuildConfig(id)?.real;
    assert.ok(real !== undefined, `${id} carries a real config`);
    if (real.install === true) {
      assert.ok(real.typecheck !== undefined, `${id}: install:true requires real.typecheck`);
    }
  }
});

// ── unregistered-is-not-buildable ─────────────────────────────────────────────────────────────────

test("unregistered-is-not-buildable: both refusals carry guidance, never a guess", () => {
  const configless = loadNodeSpec(findNodeSpecFile(STORIES_DIR, "browse-library")!);
  assert.equal(configless.buildConfig, undefined, "browse-library has no spec block and no registry entry");
  const noConfig = resolveProveSpec(
    { ...configless, id: "definitely-not-registered" },
    {
      mode: "dry-run",
      workspace: os.tmpdir(),
      store: new InMemoryStore(),
      runId: "r-unreg-1",
      signerInputs: TESTER,
    },
  );
  assert.equal(noConfig.ok, false);
  if (noConfig.ok) return;
  assert.match(noConfig.reason, /no proof config/);
  assert.match(noConfig.reason, /proof:/);
  assert.match(noConfig.reason, /registry/);
  assert.ok(noConfig.registered.includes("library-cli"));

  const noRealSpec = specWithConfigNoReal(NET_NEW_REAL.scope, { id: "no-real-arm-fixture" });
  const noReal = resolveProveSpec(noRealSpec, {
    mode: "real",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "r-unreg-2",
    signerInputs: TESTER,
  });
  assert.equal(noReal.ok, false);
  if (noReal.ok) return;
  assert.match(noReal.reason, /no REAL proof config/);
  assert.ok(noReal.registered.includes("tree-view"));
});

// ── prove-spec-fields-come-off-the-real-spec ──────────────────────────────────────────────────────

test("prove-spec-fields-come-off-the-real-spec: the resolved ProveSpec mirrors the node's identity", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const result = resolveProveSpec(spec, {
    mode: "dry-run",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "run-codex-leaf-42",
    signerInputs: TESTER,
    now: () => "2026-06-10T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec.unitId, "library-cli");
  assert.equal(result.spec.proofMode, "capability"); // integration-test → capability
  assert.equal(result.spec.testId, "library-cli");
  assert.equal(result.spec.runId, "run-codex-leaf-42");
  assert.match(result.spec.prompts.authorTest, /library-cli/);
  assert.equal(result.spec.now(), "2026-06-10T00:00:00.000Z");
});

// ── dry-run-glue-end-to-end ───────────────────────────────────────────────────────────────────────

test("dry-run-glue-end-to-end: real spec → ProveSpec → proveUnit → signed pass → rollup healthy, offline", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "codex-leaf-prompt-dryrun-"));
  const store = new InMemoryStore();
  try {
    const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
    await store.appendEvent(
      workEvent({ unitId: spec.id, event: "building", runId: "dry-cl-1" }, "tester@example.com"),
    );
    const resolved = resolveProveSpec(spec, {
      mode: "dry-run",
      workspace,
      store,
      runId: "dry-cl-1",
      signerInputs: TESTER,
      now: () => "2026-06-10T00:00:00.000Z",
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    const result = await proveUnit(resolved.spec);
    assert.equal(result.ok, true, "the dry-run walk must reach a signed pass");
    if (!result.ok) return;
    assert.deepEqual(result.phasesVisited, [
      "AUTHOR_TEST",
      "CONFIRM_RED",
      "IMPLEMENT",
      "CONFIRM_GREEN",
      "GATE",
    ]);
    assert.equal(result.verdict.unitId, "library-cli");
    assert.equal(result.verdict.proofMode, "capability");
    assert.equal(rollupStatus("library-cli", await store.readEvents()), "healthy");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

// ── real-mode-walk-earns-its-tree ─────────────────────────────────────────────────────────────────

const WORKTREE_TEST_REL = "packages/orchestrator/src/proof/codex-leaf-prompt-glue.test.ts";
const WORKTREE_IMPL_REL = "packages/orchestrator/src/proof/codex-leaf-prompt-glue.ts";

const WORKTREE_GLUE_REAL: RealProofConfig = {
  testFile: WORKTREE_TEST_REL,
  sourceFile: WORKTREE_IMPL_REL,
  scope: { testGlobs: [WORKTREE_TEST_REL], sourceGlobs: [WORKTREE_IMPL_REL] },
};

const GLUE_TEST_SOURCE = `import test from "node:test";
import assert from "node:assert/strict";
import { double } from "./codex-leaf-prompt-glue.js";

test("double doubles its input", () => {
  assert.equal(double(21), 42);
});
`;

const GLUE_IMPL_SOURCE = `export function double(n: number): number {
  return n * 2;
}
`;

test("real-mode-walk-earns-its-tree: fresh worktree + real proof command + spine commit → signed pass on a genuinely clean tree", async () => {
  const worktree = await createBuildWorktree(REPO_ROOT);
  const store = new InMemoryStore();
  try {
    const spec = specWithReal(WORKTREE_GLUE_REAL, { id: "codex-leaf-prompt-glue" });
    const author = new OwnedLoopAuthor({
      model: scriptedWriterModel([
        { path: WORKTREE_TEST_REL, content: GLUE_TEST_SOURCE },
        { path: WORKTREE_IMPL_REL, content: GLUE_IMPL_SOURCE },
      ]),
      tools: new FileToolExecutor({ rootDir: worktree.root }),
      scope: new PathWriteScope(WORKTREE_GLUE_REAL.scope),
      writeTools: FILE_WRITE_TOOLS,
    });
    const resolved = resolveProveSpec(spec, {
      mode: "real",
      workspace: worktree.root,
      store,
      runId: "real-glue-1",
      signerInputs: TESTER,
      authorOverride: author,
      // NO treeState injected: the default real seam must commit spine-side and read real git.
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;

    const result = await proveUnit(resolved.spec);
    assert.equal(result.ok, true, result.ok ? "" : `${result.failedAt}: ${result.reason}`);
    if (!result.ok) return;
    assert.deepEqual(result.phasesVisited, [
      "AUTHOR_TEST",
      "CONFIRM_RED",
      "IMPLEMENT",
      "CONFIRM_GREEN",
      "GATE",
    ]);
    assert.notEqual(result.verdict.commitSha, worktree.headSha);
    const tree = await gitTreeState(worktree.root)();
    assert.equal(tree.clean, true);
    assert.equal(tree.commitSha, result.verdict.commitSha);
  } finally {
    await worktree.remove();
  }
});

// ── briefs-name-the-declared-contract-ids ─────────────────────────────────────────────────────────

test("briefs-name-the-declared-contract-ids: assemblePrompts and realPrompts enumerate every declared id in BOTH phases", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "notice-board", "tree-view.md"));
  const ids = spec.contracts.map((c) => c.id);
  assert.ok(ids.length > 0, "tree-view declares contract ids");

  const assembled = assemblePrompts(spec);
  for (const id of ids) {
    assert.ok(assembled.authorTest.includes(id), `assemblePrompts authorTest names ${id}`);
    assert.ok(assembled.implement.includes(id), `assemblePrompts implement names ${id}`);
  }
  assert.match(assembled.authorTest, /NAME EACH TEST FOR THE CONTRACT IT PROVES/);

  const real = lookupNodeBuildConfig("tree-view")?.real;
  assert.ok(real !== undefined);
  const prompts = realPrompts(spec, real, realProofCommand(real, REPO_ROOT).display);
  for (const id of ids) {
    assert.ok(prompts.authorTest.includes(id), `realPrompts authorTest names ${id}`);
    assert.ok(prompts.implement.includes(id), `realPrompts implement names ${id}`);
  }

  // A unit declaring none gets no block (brief parity holds).
  const noContracts = loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
  assert.deepEqual(noContracts.contracts, []);
  assert.doesNotMatch(assemblePrompts(noContracts).authorTest, /Declared contracts of this unit/);

  // The live-smoke brief deliberately carries none — a throwaway add(2,3) pair, not the real tests.
  const smoke = liveSmokePrompts(spec);
  for (const id of ids) {
    assert.ok(!smoke.authorTest.includes(id), `live-smoke omits ${id}`);
    assert.ok(!smoke.implement.includes(id), `live-smoke omits ${id}`);
  }
});

// ── prompts-brief-the-real-constraints / feedback-tools-spawn-the-same-oracle (the amendment) ──────

test("prompts-brief-the-real-constraints: default and explicit Codex REAL builds never claim run_proof or deny native shell authoring, across net-new/edit-existing/refactor-for-testability and with/without installed deps", () => {
  for (const real of CODEX_TRUTHFULNESS_FIXTURES) {
    for (const runtimeOpt of [{}, { runtime: "codex" as const }]) {
      const result = resolveRealFor(real, runtimeOpt);
      assert.equal(result.ok, true, result.ok ? "" : result.reason);
      if (!result.ok) continue;
      assert.ok(
        result.liveAuthor instanceof CodexPhaseAuthor,
        "omitted runtime defaults to Codex, and explicit codex selects it too",
      );
      for (const text of [result.spec.prompts.authorTest, result.spec.prompts.implement]) {
        assert.doesNotMatch(
          text,
          /run_proof/,
          "Codex has no run_proof feedback tool — the brief must not promise it",
        );
        assert.doesNotMatch(
          text,
          /cannot run shell commands/i,
          "Codex authors with native shell/apply_patch — the brief must not deny it",
        );
      }
    }
  }
});

test("prompts-brief-the-real-constraints: default Codex LIVE-SMOKE brief never claims run_proof or denies native shell authoring", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  for (const runtimeOpt of [{}, { runtime: "codex" as const }]) {
    const result = resolveProveSpec(spec, {
      mode: "live-smoke",
      workspace: os.tmpdir(),
      store: new InMemoryStore(),
      runId: `r-smoke-codex-${Math.random().toString(36).slice(2)}`,
      signerInputs: TESTER,
      ...runtimeOpt,
    });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.ok(result.liveAuthor instanceof CodexPhaseAuthor);
    for (const text of [result.spec.prompts.authorTest, result.spec.prompts.implement]) {
      assert.doesNotMatch(text, /run_proof/);
      assert.doesNotMatch(text, /cannot run shell commands/i);
    }
  }
});

test("prompts-brief-the-real-constraints: for a multi-file REAL fixture, AUTHOR_TEST names the COMPLETE permitted test set, not just the spotlight testFile", () => {
  const result = resolveRealFor(MULTI_TEST_REAL);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  for (const testTarget of MULTI_TEST_REAL.scope.testGlobs) {
    assert.ok(
      result.spec.prompts.authorTest.includes(testTarget),
      `AUTHOR_TEST names ${testTarget} — the complete permitted test set`,
    );
  }
});

test("prompts-brief-the-real-constraints: the actual final Codex stdin composed by CodexPhaseAuthor never instructs run_proof/run_typecheck or denies native authoring, while the rendered role and phase brief survive composition", async () => {
  const role: LeafPhasePrompts = {
    AUTHOR_TEST: "You are the red-builder. Write the single failing test, then stop.",
    IMPLEMENT: "You are the green-builder. Write the minimum source to pass, then stop.",
  };
  const result = resolveRealFor(INSTALL_REAL, { phasePrompts: role });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const finalStdin = await captureCodexFinalStdin(INSTALL_REAL, result.spec.prompts, role);
  for (const phase of ["AUTHOR_TEST", "IMPLEMENT"] as const) {
    const text = finalStdin[phase];
    assert.match(text, /red-builder|green-builder/, `${phase}: the rendered role survives composition`);
    assert.match(text, /Phase brief/, `${phase}: the phase-brief section header survives composition`);
    assert.doesNotMatch(text, /run_proof/, `${phase}: Codex's final stdin must not promise run_proof`);
    assert.doesNotMatch(text, /run_typecheck/, `${phase}: Codex's final stdin must not promise run_typecheck`);
    assert.doesNotMatch(
      text,
      /cannot run shell commands/i,
      `${phase}: Codex's final stdin must not deny shell authoring`,
    );
    // The adapter's own exact-target / spine-observes-and-signs language is already correct and
    // must stay intact regardless of the (buggy) task-brief prose above.
    assert.match(text, /spine will run all registered proof commands after you stop/);
    assert.match(text, /disposable replica/);
  }
});

test("prompts-brief-the-real-constraints: an offline rendered role (renderLeafPhasePrompts over the Library fixture) composes truthfully for Codex", async () => {
  const fixtureStore = new InMemoryStore();
  await loadFixtureCorpus(fixtureStore);
  const rendered = await renderLeafPhasePrompts(fixtureStore);
  assert.equal(rendered.ok, true, rendered.ok ? "" : rendered.refusal.body);
  if (!rendered.ok) return;
  assert.match(rendered.prompts.AUTHOR_TEST, /red-builder/);
  assert.match(rendered.prompts.IMPLEMENT, /green-builder/);

  const result = resolveRealFor(INSTALL_REAL, { phasePrompts: rendered.prompts });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const finalStdin = await captureCodexFinalStdin(INSTALL_REAL, result.spec.prompts, rendered.prompts);
  for (const phase of ["AUTHOR_TEST", "IMPLEMENT"] as const) {
    assert.match(finalStdin[phase], /red-builder|green-builder/, `${phase}: the fixture role survives composition`);
    assert.doesNotMatch(finalStdin[phase], /run_proof/, `${phase}: Codex must not be told about run_proof`);
    assert.doesNotMatch(
      finalStdin[phase],
      /cannot run shell commands/i,
      `${phase}: Codex must not be told it cannot use shell`,
    );
  }
});

test(
  "prompts-brief-the-real-constraints: the CURRENT LIVE roles (renderLeafPhasePrompts, no injected store) compose truthfully for Codex (opt-in, needs a reachable live store)",
  {
    skip:
      process.env.STORYTREE_LEAF_PROMPTS_LIVE !== "1"
        ? "opt-in only: set STORYTREE_LEAF_PROMPTS_LIVE=1 against a reachable live store to run this"
        : false,
  },
  async () => {
    const rendered = await renderLeafPhasePrompts();
    assert.equal(rendered.ok, true, rendered.ok ? "" : rendered.refusal.body);
    if (!rendered.ok) return;
    const result = resolveRealFor(INSTALL_REAL, { phasePrompts: rendered.prompts });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const finalStdin = await captureCodexFinalStdin(INSTALL_REAL, result.spec.prompts, rendered.prompts);
    for (const phase of ["AUTHOR_TEST", "IMPLEMENT"] as const) {
      assert.doesNotMatch(finalStdin[phase], /run_proof/);
      assert.doesNotMatch(finalStdin[phase], /cannot run shell commands/i);
    }
  },
);

test("prompts-brief-the-real-constraints: explicit Claude REAL/live-smoke briefs are UNCHANGED — still correctly claim run_proof and no shell authoring", () => {
  for (const real of [NET_NEW_REAL, INSTALL_REAL]) {
    const result = resolveRealFor(real, { runtime: "claude" });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.ok(result.liveAuthor instanceof ClaudeAgentAuthor);
    for (const text of [result.spec.prompts.authorTest, result.spec.prompts.implement]) {
      assert.match(text, /run_proof/);
      assert.match(text, /You cannot run shell commands/);
    }
  }
});

test("prompts-brief-the-real-constraints: the standalone 3-arg realPrompts helper keeps its legacy Claude-tool prose (compatibility contract)", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
  const real = lookupNodeBuildConfig("verdict-line")?.real;
  assert.ok(real !== undefined);
  const prompts = realPrompts(spec, real, realProofCommand(real, REPO_ROOT).display);
  assert.match(prompts.authorTest, /run_proof/);
  assert.match(prompts.authorTest, /You cannot run shell commands/);
});

test("feedback-tools-spawn-the-same-oracle: explicit Claude REAL install-node arms run_proof + run_typecheck spawning the exact CONFIRM oracle", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "notice-board", "tree-view.md"));
  const result = resolveProveSpec(spec, {
    mode: "real",
    runtime: "claude",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "r-oracle-1",
    signerInputs: TESTER,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.liveAuthor instanceof ClaudeAgentAuthor);
  assert.deepEqual(result.liveAuthor.feedbackToolNames, [
    "mcp__spine__run_proof",
    "mcp__spine__run_typecheck",
  ]);
});

test("feedback-tools-spawn-the-same-oracle: Codex's actual feedbackToolNames stays empty and MCP stays disabled in both REAL and live-smoke", () => {
  for (const mode of ["real", "live-smoke"] as const) {
    const spec = loadNodeSpec(path.join(STORIES_DIR, "notice-board", "tree-view.md"));
    const result = resolveProveSpec(spec, {
      mode,
      workspace: os.tmpdir(),
      store: new InMemoryStore(),
      runId: `r-oracle-codex-${mode}`,
      signerInputs: TESTER,
    });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.ok(result.liveAuthor instanceof CodexPhaseAuthor);
    assert.deepEqual(result.liveAuthor.feedbackToolNames, []);
    for (const text of [result.spec.prompts.authorTest, result.spec.prompts.implement]) {
      assert.doesNotMatch(text, /run_proof/);
      assert.doesNotMatch(text, /run_typecheck/);
    }
  }
  const args = buildCodexExecArgs({ model: "gpt-5.6-terra", cwd: "/tmp/codex-leaf-prompt" });
  assert.ok(args.includes("mcp_servers={}"), "Codex's launch config disables MCP");
});
