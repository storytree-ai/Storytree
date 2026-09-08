import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";
import { ClaudeAgentAuthor, CodexPhaseAuthor, FileToolExecutor, FILE_WRITE_TOOLS } from "@storytree/agent";

import {
  loadNodeSpec,
  findNodeSpecFile,
  mapProofMode,
  lookupNodeBuildConfig,
  registeredNodeIds,
  realBuildableNodeIds,
  resolveProveSpec,
  PathWriteScope,
  OwnedLoopAuthor,
  scriptedWriterModel,
  proveUnit,
  gitTreeState,
  createBuildWorktree,
  rollupStatus,
  workEvent,
} from "@storytree/orchestrator";
import { renderLeafPhasePrompts, RED_BUILDER_AGENT, GREEN_BUILDER_AGENT } from "@storytree/drive";

/**
 * The CLI spotlight for `prove-spec-resolution` (ADR-0122's coverage reader reads THIS file, not the
 * orchestrator's own `resolve-prove-spec.test.ts`, which stays a read-only regression floor). This
 * file names every one of the unit's 11 declared contracts and exercises each through the PRODUCTION
 * resolution boundary — `resolveProveSpec` — never a hand-rolled reimplementation.
 *
 * The headline regression (contracts 9 and 10) — `prompts-brief-the-real-constraints` and
 * `feedback-tools-spawn-the-same-oracle` — is that the CURRENT `realPrompts`/`liveSmokePrompts`
 * produce Claude-flavoured briefs REGARDLESS of the selected runtime: they always promise a
 * `run_proof` feedback tool and always claim "You cannot run shell commands", which is FALSE for the
 * Codex runtime (Codex authors with native shell/`apply_patch` in a disposable replica; it holds no
 * MCP feedback tools and its write boundary is the spine's complete-diff observation + exact-target
 * promotion, not a hook). The runtime-aware assertions below fail against today's code for exactly
 * that reason — a truthfulness assertion, not a missing symbol.
 */

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const STORIES_DIR = path.join(REPO_ROOT, "stories");

const SIGNER = { flag: "tester@example.com" };

// ── contract: spec-files-locate-and-load ──────────────────────────────────────────────────────────

test("spec-files-locate-and-load: findNodeSpecFile resolves a capability spec, and loadNodeSpec parses its typed fields + guidance prose", () => {
  const file = findNodeSpecFile(STORIES_DIR, "library-cli");
  assert.equal(file, path.join(STORIES_DIR, "library", "library-cli.md"));
  assert.ok(file !== null);
  const spec = loadNodeSpec(file);
  assert.equal(spec.id, "library-cli");
  assert.equal(spec.tier, "capability");
  assert.equal(spec.proofMode, "integration-test");
  assert.match(spec.outcome, /curates library artifacts/);
  assert.ok(spec.guidance !== undefined && spec.guidance.length > 0, "guidance prose is carried");
  assert.equal(findNodeSpecFile(STORIES_DIR, "definitely-not-a-real-node-xyz"), null);
});

test("spec-files-locate-and-load: findNodeSpecFile also resolves a STORY's own spec (story.md), and it parses with no guidance required", () => {
  const file = findNodeSpecFile(STORIES_DIR, "library");
  assert.equal(file, path.join(STORIES_DIR, "library", "story.md"));
  assert.ok(file !== null);
  const spec = loadNodeSpec(file);
  assert.equal(spec.id, "library");
  assert.equal(spec.tier, "story");
  assert.equal(spec.proofMode, "UAT");
});

// ── contract: proof-mode-vocabulary-maps ──────────────────────────────────────────────────────────

test("proof-mode-vocabulary-maps: mapProofMode maps the seed's test-kind words onto core's tier ladder", () => {
  assert.equal(mapProofMode("integration-test"), "capability");
  assert.equal(mapProofMode("UAT"), "story");
  assert.equal(mapProofMode("contract-test"), "contract");
  assert.equal(mapProofMode("operator-attested"), "operator-attested");
});

// ── contract: registry-is-explicit ────────────────────────────────────────────────────────────────

test("registry-is-explicit: registered nodes resolve to commands+scopes; a miss is null", () => {
  const ids = registeredNodeIds();
  assert.ok(ids.includes("verdict-line"), "verdict-line is registered");
  const config = lookupNodeBuildConfig("verdict-line");
  assert.ok(config !== null);
  assert.ok(config.command.args.length > 0, "the registered command carries args");
  assert.ok(config.scope.testGlobs.length > 0 && config.scope.sourceGlobs.length > 0, "both scope globs are declared");
  assert.equal(lookupNodeBuildConfig("definitely-not-registered-xyz"), null);
});

// ── contract: real-walls-really-wall ──────────────────────────────────────────────────────────────

test("real-walls-really-wall: every REAL entry's write scope allows exactly its test file in AUTHOR_TEST and its source file in IMPLEMENT", () => {
  const ids = realBuildableNodeIds();
  assert.ok(ids.length > 0, "at least one node is REAL-buildable");
  for (const id of ids) {
    const real = lookupNodeBuildConfig(id)?.real;
    assert.ok(real !== undefined, `${id} carries a real config`);
    const scope = new PathWriteScope(real.scope);
    assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.testFile), true, `${id}: test writable in AUTHOR_TEST`);
    assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.sourceFile), false, `${id}: source refused in AUTHOR_TEST`);
    assert.equal(scope.isWriteAllowed("IMPLEMENT", real.sourceFile), true, `${id}: source writable in IMPLEMENT`);
    assert.equal(scope.isWriteAllowed("IMPLEMENT", real.testFile), false, `${id}: test refused in IMPLEMENT`);
    assert.equal(scope.isWriteAllowed("GATE", real.sourceFile), false, `${id}: no writes at GATE`);
  }
});

// ── contract: unregistered-is-not-buildable ───────────────────────────────────────────────────────

test("unregistered-is-not-buildable: resolution fails closed and names the buildable ids", () => {
  const file = findNodeSpecFile(STORIES_DIR, "browse-library");
  assert.ok(file !== null, "browse-library spec file exists");
  const spec = loadNodeSpec(file);
  assert.equal(spec.buildConfig, undefined, "browse-library carries no spec-borne proof: block");
  const result = resolveProveSpec(
    { ...spec, id: "cli-unregistered-fixture" },
    { mode: "dry-run", workspace: os.tmpdir(), store: new InMemoryStore(), runId: "cli-u1", signerInputs: SIGNER },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /no proof config/);
  assert.ok(result.registered.includes("library-cli"), "the refusal names a real buildable id");
});

test("unregistered-is-not-buildable: REAL mode additionally requires a real-proof config (a command+scope alone is not enough)", () => {
  const base = loadNodeSpec(findNodeSpecFile(STORIES_DIR, "browse-library")!);
  const spec = {
    ...base,
    id: "cli-no-real-arm-fixture",
    buildConfig: {
      command: { file: "node", args: ["--test"] },
      scope: { testGlobs: ["packages/cli/src/x.test.ts"], sourceGlobs: ["packages/cli/src/x.ts"] },
    },
  };
  const result = resolveProveSpec(spec, {
    mode: "real",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "cli-u2",
    signerInputs: SIGNER,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /no REAL proof config/);
  assert.ok(result.registered.includes("verdict-line"), "the refusal names a real-buildable id");
});

// ── contract: prove-spec-fields-come-off-the-real-spec ────────────────────────────────────────────

test("prove-spec-fields-come-off-the-real-spec: unitId, mapped proofMode, testId, runId, signer fill from the loaded spec", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const result = resolveProveSpec(spec, {
    mode: "dry-run",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "cli-run-77",
    signerInputs: SIGNER,
    now: () => "2026-06-10T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec.unitId, "library-cli");
  assert.equal(result.spec.proofMode, "capability"); // integration-test → capability
  assert.equal(result.spec.testId, "library-cli");
  assert.equal(result.spec.runId, "cli-run-77");
  assert.deepEqual(result.spec.signerInputs, SIGNER);
  assert.equal(result.spec.now(), "2026-06-10T00:00:00.000Z");
});

// ── contract: dry-run-glue-end-to-end ─────────────────────────────────────────────────────────────

test("dry-run-glue-end-to-end: real spec → ProveSpec → proveUnit → signed pass → rollup healthy, offline", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-cli-dryrun-"));
  const store = new InMemoryStore();
  try {
    const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
    await store.appendEvent(
      workEvent({ unitId: spec.id, event: "building", runId: "cli-dry-1" }, SIGNER.flag),
    );
    const resolved = resolveProveSpec(spec, {
      mode: "dry-run",
      workspace,
      store,
      runId: "cli-dry-1",
      signerInputs: SIGNER,
      now: () => "2026-06-10T00:00:00.000Z",
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
    assert.equal(result.verdict.unitId, "library-cli");
    assert.equal(result.verdict.proofMode, "capability");
    assert.equal(result.verdict.signer, SIGNER.flag);
    assert.equal(rollupStatus("library-cli", await store.readEvents()), "healthy");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

// ── contract: real-mode-walk-earns-its-tree ───────────────────────────────────────────────────────

const CLI_SCRIPTED_REAL_TEST = `import test from "node:test";
import assert from "node:assert/strict";
import { verdictLine } from "./verdict-line.js";

test("verdictLine renders the single specified line", () => {
  const line = verdictLine({
    unitId: "verdict-line",
    proofMode: "contract",
    outcome: "pass",
    commitSha: "abc1234def5678",
    signer: "tester@example.com",
    runId: "r1",
    evidence: [],
    at: "2026-06-10T00:00:00.000Z",
  });
  assert.equal(
    line,
    "PASS verdict-line (contract) — signed by tester@example.com @ abc1234, 2026-06-10T00:00:00.000Z",
  );
});
`;

const CLI_SCRIPTED_REAL_IMPL = `export interface VerdictLike {
  unitId: string;
  proofMode: string;
  outcome: string;
  commitSha: string;
  signer: string;
  at: string;
}

export function verdictLine(v: VerdictLike): string {
  return \`\${v.outcome.toUpperCase()} \${v.unitId} (\${v.proofMode}) — signed by \${v.signer} @ \${v.commitSha.slice(0, 7)}, \${v.at}\`;
}
`;

test("real-mode-walk-earns-its-tree: fresh worktree + real proof command + spine commit → signed pass on a genuinely clean tree", async () => {
  const worktree = await createBuildWorktree(REPO_ROOT);
  const store = new InMemoryStore();
  try {
    const spec = loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
    const real = lookupNodeBuildConfig("verdict-line")?.real;
    assert.ok(real !== undefined);

    // verdict-line's proven commit has since been PROMOTED into HEAD, so a fresh worktree already
    // holds the files — delete them to restore the net-new precondition this walk pins.
    await fs.rm(path.join(worktree.root, real.testFile));
    await fs.rm(path.join(worktree.root, real.sourceFile));

    const author = new OwnedLoopAuthor({
      model: scriptedWriterModel([
        { path: real.testFile, content: CLI_SCRIPTED_REAL_TEST },
        { path: real.sourceFile, content: CLI_SCRIPTED_REAL_IMPL },
      ]),
      tools: new FileToolExecutor({ rootDir: worktree.root }),
      scope: new PathWriteScope(real.scope),
      writeTools: FILE_WRITE_TOOLS,
    });

    const resolved = resolveProveSpec(spec, {
      mode: "real",
      workspace: worktree.root,
      store,
      runId: "cli-real-offline-1",
      signerInputs: SIGNER,
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
    // Cleanliness was EARNED: the verdict pins a NEW commit and the worktree's REAL git state agrees.
    assert.notEqual(result.verdict.commitSha, worktree.headSha);
    const tree = await gitTreeState(worktree.root)();
    assert.equal(tree.clean, true);
    assert.equal(tree.commitSha, result.verdict.commitSha);
  } finally {
    await worktree.remove();
  }
});

// ── contract: briefs-name-the-declared-contract-ids ───────────────────────────────────────────────

const TREE_VIEW_CONTRACT_IDS = [
  "tree-renders-offline",
  "focus-shows-build-surface",
  "presence-woven-when-live",
  "next-pointers-guide",
];

test("briefs-name-the-declared-contract-ids: the phase briefs carry the unit's declared contract ids, independent of what `## Guidance` restates and independent of the selected runtime", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "notice-board", "tree-view.md"));
  assert.deepEqual(spec.contracts.map((c) => c.id), TREE_VIEW_CONTRACT_IDS);
  for (const runtime of ["codex", "claude"] as const) {
    const result = resolveProveSpec(spec, {
      mode: "real",
      runtime,
      workspace: os.tmpdir(),
      store: new InMemoryStore(),
      runId: `cli-contract-ids-${runtime}`,
      signerInputs: SIGNER,
    });
    assert.equal(result.ok, true, runtime);
    if (!result.ok) return;
    for (const id of TREE_VIEW_CONTRACT_IDS) {
      assert.ok(result.spec.prompts.authorTest.includes(id), `${runtime}: authorTest names ${id}`);
      assert.ok(result.spec.prompts.implement.includes(id), `${runtime}: implement names ${id}`);
    }
    assert.match(result.spec.prompts.authorTest, /NAME EACH TEST FOR THE CONTRACT IT PROVES/, runtime);
  }
});

// ── contract: feedback-tools-spawn-the-same-oracle ────────────────────────────────────────────────

test("feedback-tools-spawn-the-same-oracle: advertised feedback matches the selected runtime's armed tools without adding Codex proof authority", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "notice-board", "tree-view.md"));
  const base = {
    mode: "real" as const,
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    signerInputs: SIGNER,
  };

  // Codex holds NO run_proof/run_typecheck MCP tool — it authors with native shell in a disposable
  // replica, and the spine's own out-of-band CONFIRM observation is the only oracle for it.
  const codex = resolveProveSpec(spec, { ...base, runId: "cli-fb-codex", runtime: "codex" });
  assert.equal(codex.ok, true);
  if (!codex.ok) return;
  assert.ok(codex.liveAuthor instanceof CodexPhaseAuthor);
  assert.deepEqual(codex.liveAuthor.feedbackToolNames, []);

  // Claude (install-bearing node) is armed with BOTH bounded feedback tools.
  const claude = resolveProveSpec(spec, { ...base, runId: "cli-fb-claude", runtime: "claude" });
  assert.equal(claude.ok, true);
  if (!claude.ok) return;
  assert.ok(claude.liveAuthor instanceof ClaudeAgentAuthor);
  assert.deepEqual(claude.liveAuthor.feedbackToolNames, [
    "mcp__spine__run_proof",
    "mcp__spine__run_typecheck",
  ]);

  // Omitted runtime defaults to Codex (ADR-0555) — still no invented proof authority.
  const omitted = resolveProveSpec(spec, { ...base, runId: "cli-fb-default" });
  assert.equal(omitted.ok, true);
  if (!omitted.ok) return;
  assert.ok(omitted.liveAuthor instanceof CodexPhaseAuthor);
  assert.deepEqual(omitted.liveAuthor.feedbackToolNames, []);
});

// ── contract: prompts-brief-the-real-constraints (THE HEADLINE REGRESSION) ───────────────────────
//
// Today `realPrompts`/`liveSmokePrompts` are runtime-agnostic: they ALWAYS promise a `run_proof`
// feedback tool and ALWAYS claim "You cannot run shell commands." — a legacy-Claude framing that is
// simply FALSE for the Codex runtime, which authors with native shell/`apply_patch` in a disposable
// replica and holds no MCP feedback tools at all (`feedbackToolNames` is always `[]`, proven above).
// These assertions pin the TRUTHFUL brief production resolution must hand to each runtime, while the
// unit/phase obligations (which file to write, which phase, when to stop) must survive unchanged.

test("prompts-brief-the-real-constraints: the REAL-mode brief truthfully matches Codex's actual capabilities (no MCP promise, no false shell-unavailable claim)", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
  const real = lookupNodeBuildConfig("verdict-line")?.real;
  assert.ok(real !== undefined);
  const base = {
    mode: "real" as const,
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    signerInputs: SIGNER,
  };

  for (const opts of [
    { runId: "cli-brief-codex-default" },
    { runId: "cli-brief-codex-explicit", runtime: "codex" as const },
  ]) {
    const result = resolveProveSpec(spec, { ...base, ...opts });
    assert.equal(result.ok, true, opts.runId);
    if (!result.ok) return;
    const { authorTest, implement } = result.spec.prompts;

    // Codex has no run_proof/run_typecheck MCP tool — the brief must never promise one.
    assert.doesNotMatch(authorTest, /run_proof/, `${opts.runId}: authorTest`);
    assert.doesNotMatch(implement, /run_proof/, `${opts.runId}: implement`);
    // Codex DOES author with native shell/apply_patch — the legacy claim is false for it.
    assert.doesNotMatch(authorTest, /you cannot run shell commands/i, `${opts.runId}: authorTest`);
    // No obsolete containment mechanism is promised either.
    assert.doesNotMatch(authorTest, /PreToolUse/i, `${opts.runId}: authorTest`);

    // The unit and phase obligations survive regardless of runtime: which file, which phase, stop.
    assert.ok(authorTest.includes(real.testFile), `${opts.runId}: names the real test file`);
    assert.ok(implement.includes(real.sourceFile), `${opts.runId}: names the real source file`);
    assert.match(authorTest, /AUTHOR_TEST/, opts.runId);
    assert.match(implement, /IMPLEMENT/, opts.runId);
  }

  // Claude keeps its ACTUAL boundary (a real file-tool write-hook + the bounded feedback tools) — the
  // legacy prose is truthful for Claude and must be preserved there, not stripped for everyone.
  const claude = resolveProveSpec(spec, { ...base, runId: "cli-brief-claude", runtime: "claude" });
  assert.equal(claude.ok, true);
  if (!claude.ok) return;
  assert.match(claude.spec.prompts.authorTest, /run_proof/);
  assert.match(claude.spec.prompts.authorTest, /You cannot run shell commands/);
});

test("prompts-brief-the-real-constraints: the LIVE-SMOKE brief is runtime-accurate too (Codex never promised run_proof there either)", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const base = {
    mode: "live-smoke" as const,
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    signerInputs: SIGNER,
  };

  const codex = resolveProveSpec(spec, { ...base, runId: "cli-smoke-codex", runtime: "codex" });
  assert.equal(codex.ok, true);
  if (!codex.ok) return;
  assert.doesNotMatch(codex.spec.prompts.authorTest, /run_proof/);
  assert.doesNotMatch(codex.spec.prompts.authorTest, /you cannot run shell commands/i);
  assert.match(codex.spec.prompts.authorTest, /AUTHOR_TEST/);

  const claude = resolveProveSpec(spec, { ...base, runId: "cli-smoke-claude", runtime: "claude" });
  assert.equal(claude.ok, true);
  if (!claude.ok) return;
  assert.match(claude.spec.prompts.authorTest, /run_proof/);
});

/**
 * A runtime-neutral Library store, built fresh rather than drawn from the shared historical corpus
 * fixture (`@storytree/library/fixture`). That frozen fixture's red-builder/green-builder prose is a
 * SNAPSHOT and is not held to today's runtime-truthfulness standard — using it here would risk
 * failing this test over stale fixture wording rather than over the resolver's own behaviour, and
 * would tempt an adapter sanitizer or a shared-fixture edit that is out of THIS unit's scope. Neither
 * agent doc names a tool or a runtime; `renderAgentPrompt` duck-types the fields it reads and the
 * in-memory store performs no schema validation on write, so this minimal shape is legal.
 */
async function neutralRoleStore(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  const roleDoc = (title: string, oneLine: string, role: string, outcome: string) => ({
    kind: "agent" as const,
    title,
    description: `${title} — runtime-neutral test fixture, not the live corpus agent`,
    oneLine,
    role,
    outcome,
    tools: "the authoring tools the selected runtime's adapter and phase brief grant it.",
    workflow: "read the phase brief, author the one declared deliverable within scope, then stop.",
  });
  await store.upsertDoc({
    id: RED_BUILDER_AGENT,
    kind: "agent",
    doc: roleDoc(
      "red-builder (fixture)",
      "Writes the one failing test that pins the phase brief's new behaviour, then stops.",
      "Authors the AUTHOR_TEST phase's single test file.",
      "The declared test file is written within scope and fails for the right reason.",
    ),
  });
  await store.upsertDoc({
    id: GREEN_BUILDER_AGENT,
    kind: "agent",
    doc: roleDoc(
      "green-builder (fixture)",
      "Writes the minimum source to make the pinned test pass, then stops.",
      "Authors the IMPLEMENT phase's source file(s).",
      "The declared source file(s) are written within scope and the proof goes green.",
    ),
  });
  return store;
}

test("prompts-brief-the-real-constraints: a runtime-neutral rendered system prompt threads into BOTH selected runtimes without forcing a Claude-only sanitizer", async () => {
  const roleStore = await neutralRoleStore();
  const rendered = await renderLeafPhasePrompts(roleStore);
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  assert.match(rendered.prompts.AUTHOR_TEST, /red-builder/i);
  assert.match(rendered.prompts.IMPLEMENT, /green-builder/i);

  const spec = loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
  const base = {
    mode: "real" as const,
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    signerInputs: SIGNER,
    phasePrompts: rendered.prompts,
  };

  const codex = resolveProveSpec(spec, { ...base, runId: "cli-role-codex", runtime: "codex" });
  assert.equal(codex.ok, true);
  if (!codex.ok) return;
  assert.ok(codex.liveAuthor instanceof CodexPhaseAuthor);

  const claude = resolveProveSpec(spec, { ...base, runId: "cli-role-claude", runtime: "claude" });
  assert.equal(claude.ok, true);
  if (!claude.ok) return;
  assert.ok(claude.liveAuthor instanceof ClaudeAgentAuthor);
});
