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
  DEFAULT_CODEX_MODEL,
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
  DRY_RUN_TEST_REL,
  DRY_RUN_IMPL_REL,
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
// `codexPromotionManifest` is deliberately NOT re-exported from `@storytree/orchestrator`'s public
// barrel (this node's guidance: "not a test-local reimplementation or a new public export") — this
// is the same relative cross-package import `packages/orchestrator/src/resolve-prove-spec.test.ts`
// already uses for its own copy of the same function, sanctioned test scaffolding under
// `check:boundaries`'s `isTestScaffolding` (a `*.test.ts` file may reuse another organism's
// internals across the package boundary, ADR-0010 §5).
import { codexPromotionManifest } from "../../orchestrator/src/resolve-prove-spec.js";

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

/**
 * ADR-0057 §3 regression fixture (`prompts-brief-the-real-constraints`): an edit-existing REAL scope
 * carrying a required test/source pair, ONE additional literal test/source pair, and a WILDCARD entry
 * in BOTH the test and the source scope — plus a concrete sibling file matched ONLY by each wildcard
 * (never itself a literal scope entry). This is the shape that distinguishes the glob SCOPE
 * `PathWriteScope` matches by pattern from the finite Codex promotion manifest, which never expands a
 * pattern into a new allowed target.
 */
const EDIT_TEST_FILE = "packages/widget/src/widget.test.ts";
const EDIT_TEST_EXTRA = "packages/widget/src/widget-helpers.test.ts";
const EDIT_TEST_WILDCARD = "packages/widget/src/generated/*.test.ts";
const EDIT_TEST_WILDCARD_SIBLING = "packages/widget/src/generated/other.test.ts";

const EDIT_SOURCE_FILE = "packages/widget/src/widget.ts";
const EDIT_SOURCE_EXTRA = "packages/widget/src/widget-helpers.ts";
const EDIT_SOURCE_WILDCARD = "packages/widget/src/generated/*.ts";
const EDIT_SOURCE_WILDCARD_SIBLING = "packages/widget/src/generated/other.ts";

const EDIT_EXISTING_WILDCARD_REAL: RealProofConfig = {
  testFile: EDIT_TEST_FILE,
  sourceFile: EDIT_SOURCE_FILE,
  editsExisting: true,
  install: true,
  typecheck: { file: "pnpm", args: ["--filter", "@storytree/widget", "typecheck"] },
  scope: {
    testGlobs: [EDIT_TEST_FILE, EDIT_TEST_EXTRA, EDIT_TEST_WILDCARD],
    sourceGlobs: [EDIT_SOURCE_FILE, EDIT_SOURCE_EXTRA, EDIT_SOURCE_WILDCARD],
  },
};

/**
 * Discrepancy #1 regression fixture (`prompts-brief-the-real-constraints`): the REQUIRED target in
 * EACH phase is matched ONLY by a wildcard scope entry — it is NEVER itself a literal member of
 * `scope.testGlobs`/`scope.sourceGlobs` — alongside ONE additional literal entry.
 * `codexPromotionManifest` always includes the required target plus every literal scope entry
 * regardless of whether the spotlight itself is literal, so the MANIFEST stays correct; the source
 * defect is in the PROSE the phase briefs compose, which filters each scope down to its literal
 * entries and reads a length `<= 1` as "nothing extra to name" — but when the spotlight itself is
 * NOT one of the surviving literals, that ONE surviving literal IS the extra file, and it goes
 * unmentioned. A broader-than-single-literal edit-existing source scope requires an explicit suite
 * `proofCommand` (the schema's own refine), so this fixture declares one to stay schema-valid.
 */
const WSPOT_TEST_FILE = "packages/widget/src/generated/widget.test.ts";
const WSPOT_TEST_WILDCARD = "packages/widget/src/generated/*.test.ts";
const WSPOT_TEST_EXTRA = "packages/widget/src/widget-optional.test.ts";
const WSPOT_TEST_UNNAMED_SIBLING = "packages/widget/src/generated/other-thing.test.ts";

const WSPOT_SOURCE_FILE = "packages/widget/src/generated/widget.ts";
const WSPOT_SOURCE_WILDCARD = "packages/widget/src/generated/*.ts";
const WSPOT_SOURCE_EXTRA = "packages/widget/src/widget-optional.ts";
const WSPOT_SOURCE_UNNAMED_SIBLING = "packages/widget/src/generated/other-thing.ts";

const WILDCARD_ONLY_SPOTLIGHT_REAL: RealProofConfig = {
  testFile: WSPOT_TEST_FILE,
  sourceFile: WSPOT_SOURCE_FILE,
  editsExisting: true,
  install: true,
  typecheck: { file: "pnpm", args: ["--filter", "@storytree/widget", "typecheck"] },
  proofCommand: { file: "pnpm", args: ["--filter", "@storytree/widget", "test"] },
  scope: {
    testGlobs: [WSPOT_TEST_WILDCARD, WSPOT_TEST_EXTRA],
    sourceGlobs: [WSPOT_SOURCE_WILDCARD, WSPOT_SOURCE_EXTRA],
  },
};

/**
 * Discrepancy #2 regression fixture: a plain NET-NEW node (no `editsExisting`, no wildcard at all)
 * whose source scope carries the spotlight PLUS one additional literal file. The manifest and
 * `sourcesNamed` both compute the additional literal correctly here (nothing wildcard-shaped is
 * involved) — the defect is that the net-new IMPLEMENT brief hardcodes
 * `write ONLY \`${real.sourceFile}\`` instead of naming the full permitted set, so the optional
 * literal the leaf may also write goes unmentioned and unpermitted in the prose.
 */
const NET_NEW_OPTIONAL_SOURCE_TEST = "packages/widget/src/widget-optional.test.ts";
const NET_NEW_OPTIONAL_SOURCE_FILE = "packages/widget/src/widget-optional.ts";
const NET_NEW_OPTIONAL_SOURCE_EXTRA = "packages/widget/src/widget-optional-helper.ts";

const NET_NEW_OPTIONAL_SOURCE_REAL: RealProofConfig = {
  testFile: NET_NEW_OPTIONAL_SOURCE_TEST,
  sourceFile: NET_NEW_OPTIONAL_SOURCE_FILE,
  scope: {
    testGlobs: [NET_NEW_OPTIONAL_SOURCE_TEST],
    sourceGlobs: [NET_NEW_OPTIONAL_SOURCE_FILE, NET_NEW_OPTIONAL_SOURCE_EXTRA],
  },
};

/**
 * Parse the ADAPTER's OWN rendered "allowed target set" / "Required outputs" sections out of a
 * captured final Codex stdin (see `captureCodexFinalStdin`'s composed `fullPrompt` in
 * `packages/agent/src/codex-author.ts`) — the section the adapter builds itself from the
 * `CodexPromotionManifest`, independent of whatever the (possibly buggy) phase-brief prose above it
 * claims.
 */
function extractCodexTargetLists(stdin: string): { allowed: string[]; required: string[] } {
  const match =
    /allowed target set for this phase is:\n([\s\S]*?)\n\nRequired outputs:\n([\s\S]*?)\n\nAfter you stop/.exec(
      stdin,
    );
  assert.ok(match, "the adapter's own allowed/required target sections are present in the final stdin");
  const parseTargets = (block: string): string[] =>
    block.split("\n").map((line) => line.replace(/^- `/, "").replace(/`$/, ""));
  return { allowed: parseTargets(match![1]!), required: parseTargets(match![2]!) };
}

/** Every arm the runtime amendment must brief truthfully: net-new (±install), edit-existing, R2. */
const CODEX_TRUTHFULNESS_FIXTURES: readonly RealProofConfig[] = [
  NET_NEW_REAL,
  INSTALL_REAL,
  EDITS_EXISTING_REAL,
  REFACTOR_FOR_TESTS_REAL,
];

function resolveRealFor(
  real: RealProofConfig,
  opts: {
    runtime?: "codex" | "claude";
    phasePrompts?: LeafPhasePrompts;
    specOverrides?: Partial<NodeSpec>;
  } = {},
): ResolveResult {
  const spec = specWithReal(real, opts.specOverrides);
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

/** One phase's captured final Codex input: the composed `stdin` AND the launch `args` vector. */
interface CodexFinalCapture {
  stdin: string;
  args: string[];
}

interface CodexFinalCaptures {
  AUTHOR_TEST: CodexFinalCapture;
  IMPLEMENT: CodexFinalCapture;
}

/**
 * Build a CodexPhaseAuthor over an EXPLICIT write-scope/promotion-manifest pair, inject a runner,
 * and read the ACTUAL final `stdin` AND launch `args` the adapter composes for each phase — after
 * it appends the "## Phase brief" section and its own exact-target/spine-observes-and-signs
 * language, and after `buildCodexExecArgs` builds the real launch vector `CodexPhaseAuthor.author`
 * hands its runner. This never replaces the real spine-driven author — it is the same wiring
 * pattern `resolveReal`/`resolveProveSpec` themselves use, applied here as a TEST seam (an
 * injected runner is legal on CodexPhaseAuthor; production supplies none).
 */
async function captureCodexFinalInput(
  seam: {
    writeGlobs: { AUTHOR_TEST: string[]; IMPLEMENT: string[] };
    promotionManifests: { AUTHOR_TEST: CodexPromotionManifest; IMPLEMENT: CodexPromotionManifest };
    isWriteAllowed: (phase: "AUTHOR_TEST" | "IMPLEMENT", relPath: string) => boolean;
  },
  briefs: PhasePrompts,
  role: LeafPhasePrompts,
): Promise<CodexFinalCaptures> {
  const captureFor = async (
    phase: "AUTHOR_TEST" | "IMPLEMENT",
    brief: string,
  ): Promise<CodexFinalCapture> => {
    const cap = captureCodexRunner();
    const author = new CodexPhaseAuthor({
      cwd: CODEX_TEST_CWD,
      writeGlobs: seam.writeGlobs,
      promotionManifests: seam.promotionManifests,
      isWriteAllowed: seam.isWriteAllowed,
      phasePrompts: role,
      runner: cap.runner,
    });
    await author.author(phase, brief);
    const exec = cap.commands[1];
    assert.ok(exec, `codex exec command was captured for ${phase}`);
    return { stdin: exec.stdin ?? "", args: exec.args };
  };
  return {
    AUTHOR_TEST: await captureFor("AUTHOR_TEST", briefs.authorTest),
    IMPLEMENT: await captureFor("IMPLEMENT", briefs.implement),
  };
}

/**
 * REAL-mode capture: mirrors `resolveReal`'s codex construction (write globs + exact promotion
 * manifest built by the PRODUCTION `codexPromotionManifest` + the write wall).
 */
async function captureCodexFinalStdin(
  real: RealProofConfig,
  briefs: PhasePrompts,
  role: LeafPhasePrompts,
): Promise<CodexFinalCaptures> {
  const scope = new PathWriteScope(real.scope);
  // The PRODUCTION finite manifest builder (never a manually reconstructed stand-in): this is what
  // `resolveReal` itself hands `CodexPhaseAuthor` — it filters any wildcard/glob-magic scope entry
  // out of `allowedTargets`, which a naive `[...new Set(scope.testGlobs)]` reconstruction would not.
  const manifests: { AUTHOR_TEST: CodexPromotionManifest; IMPLEMENT: CodexPromotionManifest } = {
    AUTHOR_TEST: codexPromotionManifest(real.testFile, real.scope.testGlobs),
    IMPLEMENT: codexPromotionManifest(real.sourceFile, real.scope.sourceGlobs),
  };
  return captureCodexFinalInput(
    {
      writeGlobs: { AUTHOR_TEST: real.scope.testGlobs, IMPLEMENT: real.scope.sourceGlobs },
      promotionManifests: manifests,
      isWriteAllowed: (p, rel) => scope.isWriteAllowed(p, rel),
    },
    briefs,
    role,
  );
}

/**
 * LIVE-SMOKE capture: mirrors `resolveProveSpec`'s SHARED synthetic write-scope + finite manifest
 * for the add(2,3) pair (`DRY_RUN_TEST_REL`/`DRY_RUN_IMPL_REL`) — the same construction the smoke
 * branch of `resolveProveSpec` itself uses for its Codex arm.
 */
const SMOKE_WRITE_GLOBS = { AUTHOR_TEST: ["*.test.cjs"], IMPLEMENT: [DRY_RUN_IMPL_REL] };

async function captureCodexSmokeFinalStdin(
  briefs: PhasePrompts,
  role: LeafPhasePrompts,
): Promise<CodexFinalCaptures> {
  const scope = new PathWriteScope({
    testGlobs: SMOKE_WRITE_GLOBS.AUTHOR_TEST,
    sourceGlobs: SMOKE_WRITE_GLOBS.IMPLEMENT,
  });
  const manifests: { AUTHOR_TEST: CodexPromotionManifest; IMPLEMENT: CodexPromotionManifest } = {
    AUTHOR_TEST: codexPromotionManifest(DRY_RUN_TEST_REL, [DRY_RUN_TEST_REL]),
    IMPLEMENT: codexPromotionManifest(DRY_RUN_IMPL_REL, [DRY_RUN_IMPL_REL]),
  };
  return captureCodexFinalInput(
    {
      writeGlobs: SMOKE_WRITE_GLOBS,
      promotionManifests: manifests,
      isWriteAllowed: (p, rel) => scope.isWriteAllowed(p, rel),
    },
    briefs,
    role,
  );
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
        assert.match(text, /native shell\/apply_patch/, "the brief names Codex's actual native authoring");
      }
      // Dependency restrictions: an install-bearing arm forbids ADDING a dependency; an install-free
      // arm forbids a package-VALUE import (builtins/relative only).
      if (real.install === true) {
        assert.match(result.spec.prompts.authorTest, /can NEVER add one/);
        assert.match(result.spec.prompts.implement, /can NEVER add one/);
      } else {
        assert.match(result.spec.prompts.authorTest, /has NO node_modules/);
        assert.match(result.spec.prompts.implement, /has NO node_modules/);
      }
      // Stop-if-test-wrong duty: IMPLEMENT never instructs working around a test the leaf believes
      // is wrong.
      assert.match(
        result.spec.prompts.implement,
        /stop and say so plainly instead of working around it/,
      );
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

test("prompts-brief-the-real-constraints: for a multi-file REAL fixture, AUTHOR_TEST names the COMPLETE permitted test set, not just the spotlight testFile", async () => {
  const real = EDIT_EXISTING_WILDCARD_REAL;

  // 1. The production finite-manifest builder resolves each scope to the required target plus the
  //    additional literal target ONLY; its required outputs stay singular; and neither the wildcard
  //    glob itself nor the concrete sibling file it would match (via PathWriteScope's own pattern
  //    matching) is ever an allowed target — codexPromotionManifest never expands a pattern.
  const testManifest = codexPromotionManifest(real.testFile, real.scope.testGlobs);
  const sourceManifest = codexPromotionManifest(real.sourceFile, real.scope.sourceGlobs);
  assert.deepEqual(new Set(testManifest.allowedTargets), new Set([EDIT_TEST_FILE, EDIT_TEST_EXTRA]));
  assert.deepEqual(testManifest.requiredTargets, [EDIT_TEST_FILE]);
  assert.ok(!testManifest.allowedTargets.includes(EDIT_TEST_WILDCARD), "the wildcard itself is never an allowed target");
  assert.ok(
    !testManifest.allowedTargets.includes(EDIT_TEST_WILDCARD_SIBLING),
    "a file matched only by the wildcard is never an allowed target",
  );

  assert.deepEqual(new Set(sourceManifest.allowedTargets), new Set([EDIT_SOURCE_FILE, EDIT_SOURCE_EXTRA]));
  assert.deepEqual(sourceManifest.requiredTargets, [EDIT_SOURCE_FILE]);
  assert.ok(!sourceManifest.allowedTargets.includes(EDIT_SOURCE_WILDCARD), "the source wildcard itself is never an allowed target");
  assert.ok(
    !sourceManifest.allowedTargets.includes(EDIT_SOURCE_WILDCARD_SIBLING),
    "a source file matched only by the wildcard is never an allowed target",
  );

  const role: LeafPhasePrompts = {
    AUTHOR_TEST: "You are the red-builder. Write the single failing test, then stop.",
    IMPLEMENT: "You are the green-builder. Write the minimum source to pass, then stop.",
  };

  for (const runtimeOpt of [{}, { runtime: "codex" as const }]) {
    const result = resolveRealFor(real, { ...runtimeOpt, phasePrompts: role });
    assert.equal(result.ok, true, result.ok ? "" : result.reason);
    if (!result.ok) continue;
    assert.ok(
      result.liveAuthor instanceof CodexPhaseAuthor,
      "omitted runtime defaults to Codex, and explicit codex selects it too",
    );

    // 2. The final adapter-composed allowed/required target lists equal those production manifests
    //    EXACTLY: the literal optional target stays allowed-but-not-required, and each phase keeps
    //    its own test/source duty (AUTHOR_TEST's manifest never leaks into IMPLEMENT's, or vice versa).
    const finalStdin = await captureCodexFinalStdin(real, result.spec.prompts, role);
    const authorTargets = extractCodexTargetLists(finalStdin.AUTHOR_TEST.stdin);
    assert.deepEqual(new Set(authorTargets.allowed), new Set(testManifest.allowedTargets));
    assert.deepEqual(authorTargets.required, testManifest.requiredTargets);
    const implementTargets = extractCodexTargetLists(finalStdin.IMPLEMENT.stdin);
    assert.deepEqual(new Set(implementTargets.allowed), new Set(sourceManifest.allowedTargets));
    assert.deepEqual(implementTargets.required, sourceManifest.requiredTargets);

    // 3. The PHASE INSTRUCTIONS themselves — the brief prose the adapter wraps, BEFORE its own
    //    correct finite-list section above — must grant no write authority to a wildcard match or to
    //    "every path under source scope". Mentioning a wildcard as non-authorizing context would be
    //    fine (its mere presence is not the defect); naming it as part of what may be WRITTEN is the
    //    regression this test pins, and it is currently true of the unmodified source.
    assert.ok(
      !result.spec.prompts.authorTest.includes(`\`${EDIT_TEST_WILDCARD}\``),
      "AUTHOR_TEST's permitted-scope listing must not name the wildcard test-scope entry as writable",
    );
    assert.ok(
      !result.spec.prompts.implement.includes(`\`${EDIT_SOURCE_WILDCARD}\``),
      "IMPLEMENT's scope listing must not name the wildcard source-scope entry as writable",
    );
    assert.ok(
      !result.spec.prompts.implement.includes("every path under your source scope is writable"),
      "IMPLEMENT must not claim every path under the source scope (wildcard matches included) is writable",
    );
  }

  // 4. Discrepancy #1 (`WILDCARD_ONLY_SPOTLIGHT_REAL`): the REQUIRED target itself is matched ONLY
  //    by a wildcard scope entry in EACH phase, alongside one additional literal. The manifest is
  //    correct regardless (codexPromotionManifest never depends on whether the spotlight is
  //    literal); the brief prose must still name BOTH the spotlight and the additional literal.
  const wspotTestManifest = codexPromotionManifest(
    WILDCARD_ONLY_SPOTLIGHT_REAL.testFile,
    WILDCARD_ONLY_SPOTLIGHT_REAL.scope.testGlobs,
  );
  const wspotSourceManifest = codexPromotionManifest(
    WILDCARD_ONLY_SPOTLIGHT_REAL.sourceFile,
    WILDCARD_ONLY_SPOTLIGHT_REAL.scope.sourceGlobs,
  );
  assert.deepEqual(new Set(wspotTestManifest.allowedTargets), new Set([WSPOT_TEST_FILE, WSPOT_TEST_EXTRA]));
  assert.deepEqual(wspotTestManifest.requiredTargets, [WSPOT_TEST_FILE]);
  assert.ok(!wspotTestManifest.allowedTargets.includes(WSPOT_TEST_WILDCARD));
  assert.ok(!wspotTestManifest.allowedTargets.includes(WSPOT_TEST_UNNAMED_SIBLING));
  assert.deepEqual(new Set(wspotSourceManifest.allowedTargets), new Set([WSPOT_SOURCE_FILE, WSPOT_SOURCE_EXTRA]));
  assert.deepEqual(wspotSourceManifest.requiredTargets, [WSPOT_SOURCE_FILE]);
  assert.ok(!wspotSourceManifest.allowedTargets.includes(WSPOT_SOURCE_WILDCARD));
  assert.ok(!wspotSourceManifest.allowedTargets.includes(WSPOT_SOURCE_UNNAMED_SIBLING));

  for (const runtimeOpt of [{}, { runtime: "codex" as const }]) {
    const result = resolveRealFor(WILDCARD_ONLY_SPOTLIGHT_REAL, { ...runtimeOpt, phasePrompts: role });
    assert.equal(result.ok, true, result.ok ? "" : result.reason);
    if (!result.ok) continue;
    assert.ok(
      result.spec.prompts.authorTest.includes(`\`${WSPOT_TEST_FILE}\``),
      "AUTHOR_TEST names the spotlight test file even when it is matched only by a wildcard entry",
    );
    assert.ok(
      result.spec.prompts.authorTest.includes(`\`${WSPOT_TEST_EXTRA}\``),
      "AUTHOR_TEST must still name the additional literal test file — filtering the scope to its " +
        "literal entries and reading a length <= 1 as \"nothing extra\" silently drops it when the " +
        "spotlight itself is not one of the surviving literals",
    );
    assert.ok(
      result.spec.prompts.implement.includes(`\`${WSPOT_SOURCE_FILE}\``),
      "IMPLEMENT names the spotlight source file even when it is matched only by a wildcard entry",
    );
    assert.ok(
      result.spec.prompts.implement.includes(`\`${WSPOT_SOURCE_EXTRA}\``),
      "IMPLEMENT must still name the additional literal source file it may also edit",
    );
  }

  // 5. Discrepancy #2 (`NET_NEW_OPTIONAL_SOURCE_REAL`): a plain net-new node (no wildcard, no
  //    editsExisting) whose source scope permits an additional literal file beyond the spotlight.
  //    The manifest already permits it; the net-new IMPLEMENT brief must not instruct
  //    spotlight-only writing ("write ONLY `<spotlight>`") when a second file is genuinely allowed.
  const nnManifest = codexPromotionManifest(
    NET_NEW_OPTIONAL_SOURCE_REAL.sourceFile,
    NET_NEW_OPTIONAL_SOURCE_REAL.scope.sourceGlobs,
  );
  assert.deepEqual(
    new Set(nnManifest.allowedTargets),
    new Set([NET_NEW_OPTIONAL_SOURCE_FILE, NET_NEW_OPTIONAL_SOURCE_EXTRA]),
  );
  assert.deepEqual(nnManifest.requiredTargets, [NET_NEW_OPTIONAL_SOURCE_FILE]);

  for (const runtimeOpt of [{}, { runtime: "codex" as const }]) {
    const result = resolveRealFor(NET_NEW_OPTIONAL_SOURCE_REAL, runtimeOpt);
    assert.equal(result.ok, true, result.ok ? "" : result.reason);
    if (!result.ok) continue;
    // The precise defect: the "write ONLY `<spotlight>`" sentence itself is the instruction the
    // leaf follows, and it must not spell out spotlight-only writing when the manifest permits a
    // second file — independent of whatever a DIFFERENT sentence (the shared "conventions" file
    // listing) happens to also say elsewhere in the same brief.
    assert.ok(
      !result.spec.prompts.implement.includes(
        `write ONLY \`${NET_NEW_OPTIONAL_SOURCE_FILE}\` so that test passes`,
      ),
      "a net-new node's IMPLEMENT brief must not instruct spotlight-only writing " +
        "(\"write ONLY `<spotlight>` so that test passes\") when the manifest permits an additional " +
        "literal source file",
    );
    assert.ok(
      result.spec.prompts.implement.includes(`\`${NET_NEW_OPTIONAL_SOURCE_EXTRA}\``),
      "a net-new node's IMPLEMENT brief must permit the optional additional literal source file the " +
        "manifest allows",
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
    const { stdin: text, args } = finalStdin[phase];
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

    // The ACTUAL captured launch (not a standalone buildCodexExecArgs call with a hand-picked
    // model): MCP stays disabled and the DEFAULT model is selected — observed from the real
    // invocation `CodexPhaseAuthor.author` made, not merely asserted about the helper in isolation.
    assert.ok(args.includes("mcp_servers={}"), `${phase}: the captured launch disables MCP`);
    const modelIndex = args.indexOf("--model");
    assert.ok(modelIndex >= 0, `${phase}: the captured launch names a model`);
    assert.equal(
      args[modelIndex + 1],
      DEFAULT_CODEX_MODEL,
      `${phase}: the captured launch selects the default model (no override was supplied)`,
    );
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
    assert.match(
      finalStdin[phase].stdin,
      /red-builder|green-builder/,
      `${phase}: the fixture role survives composition`,
    );
    assert.doesNotMatch(finalStdin[phase].stdin, /run_proof/, `${phase}: Codex must not be told about run_proof`);
    assert.doesNotMatch(
      finalStdin[phase].stdin,
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
      assert.doesNotMatch(finalStdin[phase].stdin, /run_proof/);
      assert.doesNotMatch(finalStdin[phase].stdin, /cannot run shell commands/i);
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

  // Discrepancy #3: Claude's ACTUAL write wall is glob-based (`PathWriteScope`), unlike Codex's
  // finite promotion manifest — so for a wildcard scope, Claude's brief must not be narrowed to the
  // literal entries only. It should retain / name the wildcard-based permission it genuinely has.
  const wildcardResult = resolveRealFor(EDIT_EXISTING_WILDCARD_REAL, { runtime: "claude" });
  assert.equal(wildcardResult.ok, true);
  if (wildcardResult.ok) {
    assert.ok(wildcardResult.liveAuthor instanceof ClaudeAgentAuthor);
    const claudeScope = new PathWriteScope(EDIT_EXISTING_WILDCARD_REAL.scope);
    assert.equal(
      claudeScope.isWriteAllowed("AUTHOR_TEST", EDIT_TEST_WILDCARD_SIBLING),
      true,
      "Claude's actual write wall genuinely permits a file matched only by the wildcard test-scope entry",
    );
    assert.equal(
      claudeScope.isWriteAllowed("IMPLEMENT", EDIT_SOURCE_WILDCARD_SIBLING),
      true,
      "Claude's actual write wall genuinely permits a file matched only by the wildcard source-scope entry",
    );
    assert.ok(
      wildcardResult.spec.prompts.authorTest.includes(`\`${EDIT_TEST_WILDCARD}\``),
      "Claude's AUTHOR_TEST brief must name its actual glob-based test scope — unlike Codex's finite " +
        "promotion manifest, PathWriteScope really does grant write authority over the wildcard match, " +
        "and unconditionally filtering it out of the prose (the same filter Codex needs) silently " +
        "narrows what Claude is told it may write",
    );
    assert.ok(
      wildcardResult.spec.prompts.implement.includes(`\`${EDIT_SOURCE_WILDCARD}\``),
      "Claude's IMPLEMENT brief must name its actual glob-based source scope for the same reason",
    );
    for (const text of [wildcardResult.spec.prompts.authorTest, wildcardResult.spec.prompts.implement]) {
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

  // The legacy 3-arg call's default (runtime omitted → Claude) must retain Claude's ACTUAL
  // glob-based write wall for a wildcard scope too — the Codex-only literal-filtering must not
  // silently narrow what this legacy call tells Claude it may write.
  const wildcardSpec = specWithReal(EDIT_EXISTING_WILDCARD_REAL);
  const wildcardPrompts = realPrompts(
    wildcardSpec,
    EDIT_EXISTING_WILDCARD_REAL,
    realProofCommand(EDIT_EXISTING_WILDCARD_REAL, REPO_ROOT).display,
  );
  const claudeScope = new PathWriteScope(EDIT_EXISTING_WILDCARD_REAL.scope);
  assert.equal(claudeScope.isWriteAllowed("AUTHOR_TEST", EDIT_TEST_WILDCARD_SIBLING), true);
  assert.ok(
    wildcardPrompts.authorTest.includes(`\`${EDIT_TEST_WILDCARD}\``),
    "the legacy 3-arg helper's default (Claude) must still name its real glob-based test scope",
  );
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

test("feedback-tools-spawn-the-same-oracle: Codex's actual feedbackToolNames stays empty and MCP stays disabled in both REAL and live-smoke", async () => {
  const role: LeafPhasePrompts = {
    AUTHOR_TEST: "You are the red-builder. Write the single failing test, then stop.",
    IMPLEMENT: "You are the green-builder. Write the minimum source to pass, then stop.",
  };
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

  // The ACTUAL captured launch for BOTH smoke phases (the same capture/assertion path the REAL-mode
  // final-stdin test uses, applied to the smoke's own synthetic write scope): MCP stays disabled and
  // the DEFAULT model is selected — observed from a real `CodexPhaseAuthor.author` invocation, never
  // a standalone `buildCodexExecArgs` call with a hand-picked model (not evidence of a real launch).
  const smokeBriefs = liveSmokePrompts(loadNodeSpec(path.join(STORIES_DIR, "notice-board", "tree-view.md")));
  const smokeCapture = await captureCodexSmokeFinalStdin(smokeBriefs, role);
  for (const phase of ["AUTHOR_TEST", "IMPLEMENT"] as const) {
    const { args } = smokeCapture[phase];
    assert.ok(args.includes("mcp_servers={}"), `${phase}: the smoke's captured launch disables MCP`);
    const modelIndex = args.indexOf("--model");
    assert.ok(modelIndex >= 0, `${phase}: the smoke's captured launch names a model`);
    assert.equal(
      args[modelIndex + 1],
      DEFAULT_CODEX_MODEL,
      `${phase}: the smoke's captured launch selects the default model`,
    );
  }
});
