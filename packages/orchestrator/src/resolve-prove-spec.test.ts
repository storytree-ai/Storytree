import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore, rollupStatus, workEvent } from "@storytree/core";
import { FileToolExecutor, FILE_WRITE_TOOLS } from "@storytree/agent";

import { loadNodeSpec, findNodeSpecFile, mapProofMode } from "./node-spec.js";
import {
  lookupNodeBuildConfig,
  realBuildableNodeIds,
  registeredNodeIds,
} from "./test-command-registry.js";
import {
  resolveProveSpec,
  assemblePrompts,
  feedbackCommandsFor,
  realPrompts,
  scriptedWriterModel,
} from "./resolve-prove-spec.js";
import { proveUnit, gitTreeState } from "./prove-it-gate.js";
import { PathWriteScope } from "./phase-machine.js";
import { OwnedLoopAuthor } from "./owned-loop-author.js";
import { createBuildWorktree } from "./build-worktree.js";

/**
 * Phase B (drive-machinery): the resolver glue. Loads the REAL stories/library node specs from the
 * repo, proves the frontmatter loader + proof-mode mapping + registry + prompt assembly, then
 * drives ONE real spec end-to-end through proveUnit with the dry-run seams — asserting the full
 * glue chain (spec → ProveSpec → gate → signed verdict → rollup) offline, at zero API cost.
 */

/** repo root: packages/orchestrator/src → four dirs up. */
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const STORIES_DIR = path.join(REPO_ROOT, "stories");

// ── node-spec loading (the light frontmatter loader, against REAL seed files) ────────────────────

test("findNodeSpecFile locates a capability and a story's own spec", () => {
  assert.equal(
    findNodeSpecFile(STORIES_DIR, "library-cli"),
    path.join(STORIES_DIR, "library", "library-cli.md"),
  );
  assert.equal(
    findNodeSpecFile(STORIES_DIR, "library"),
    path.join(STORIES_DIR, "library", "story.md"),
  );
  assert.equal(findNodeSpecFile(STORIES_DIR, "no-such-node"), null);
});

test("loadNodeSpec parses the real library-cli frontmatter (id/tier/outcome/proof_mode) + guidance", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  assert.equal(spec.id, "library-cli");
  assert.equal(spec.tier, "capability");
  assert.equal(spec.story, "library");
  assert.equal(spec.proofMode, "integration-test");
  assert.equal(spec.status, "mapped");
  assert.match(spec.outcome, /curates library artifacts/);
  assert.ok(spec.dependsOn.includes("event-sourced-store-seam"));
  // The ## Guidance prose is carried for prompt assembly.
  assert.ok(spec.guidance !== undefined && spec.guidance.includes("Envelope"));
});

test("loadNodeSpec parses the real library story spec (UAT proof mode, no guidance section)", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "story.md"));
  assert.equal(spec.id, "library");
  assert.equal(spec.tier, "story");
  assert.equal(spec.proofMode, "UAT");
  assert.equal(spec.guidance, undefined);
});

test("loadNodeSpec is loud on a file without frontmatter", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-nodespec-"));
  try {
    const bad = path.join(dir, "bad.md");
    await fs.writeFile(bad, "# no frontmatter here\n");
    assert.throws(() => loadNodeSpec(bad), /no frontmatter block/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

// ── proof-mode mapping (frontmatter test-kind word → core tier-ladder enum) ──────────────────────

test("mapProofMode maps the frontmatter vocabulary onto core ProofMode", () => {
  assert.equal(mapProofMode("integration-test"), "capability");
  assert.equal(mapProofMode("UAT"), "story");
  assert.equal(mapProofMode("contract-test"), "contract");
  assert.equal(mapProofMode("operator-attested"), "operator-attested");
});

// ── the registry (explicit, fail-closed) ─────────────────────────────────────────────────────────

test("the registry covers the library story + its seven capabilities; a miss is null", () => {
  const ids = registeredNodeIds();
  for (const id of [
    "library",
    "library-cli",
    "library-schema-and-write-validation",
    "migrate-on-write-upcaster",
    "event-sourced-store-seam",
    "eager-batch-migrate",
    "seed-corpus-scripts",
    "library-health-gate",
  ]) {
    assert.ok(ids.includes(id), `${id} is registered`);
    const config = lookupNodeBuildConfig(id);
    assert.ok(config !== null && config.command.args.length > 0);
    assert.ok(config.scope.testGlobs.length > 0 && config.scope.sourceGlobs.length > 0);
  }
  assert.equal(lookupNodeBuildConfig("unregistered-node"), null);
});

test("the verdict-line entry carries a REAL proof config whose write walls really wall", () => {
  assert.deepEqual(realBuildableNodeIds(), [
    "declare-presence",
    "noticeboard-cli",
    "presence-store",
    "tree-view",
    "verdict-line",
  ]);
  const real = lookupNodeBuildConfig("verdict-line")?.real;
  assert.ok(real !== undefined);
  // Repo-relative REAL paths, not temp-workspace synthetics.
  assert.equal(real.testFile, "packages/core/src/verdict-line.test.ts");
  assert.equal(real.sourceFile, "packages/core/src/verdict-line.ts");
  // The per-phase walls: test writable ONLY in AUTHOR_TEST, source ONLY in IMPLEMENT.
  const scope = new PathWriteScope(real.scope);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.testFile), true);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.sourceFile), false);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.sourceFile), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.testFile), false);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "packages/core/src/proof.ts"), false);
  assert.equal(scope.isWriteAllowed("GATE", real.sourceFile), false);
});

test("the declare-presence entry is REAL-buildable with install (zod import) and real walls", () => {
  const real = lookupNodeBuildConfig("declare-presence")?.real;
  assert.ok(real !== undefined);
  assert.equal(real.testFile, "packages/core/src/presence.test.ts");
  assert.equal(real.sourceFile, "packages/core/src/presence.ts");
  assert.equal(real.install, true);
  // install:true implies the typecheck wall (tsx strips types — the proof run cannot see type
  // errors; the 2026-06-11 exactOptionalPropertyTypes escape is the lesson).
  assert.deepEqual(real.typecheck, {
    file: "pnpm",
    args: ["--filter", "@storytree/core", "typecheck"],
  });
  const scope = new PathWriteScope(real.scope);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.testFile), true);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.sourceFile), false);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.sourceFile), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.testFile), false);
  // The leaf can never reach the dependency manifests (deny-by-default, ADR-0031 §2).
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "package.json"), false);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "pnpm-lock.yaml"), false);
});

test("the presence-store entry is REAL-buildable with install (core import) and real walls", () => {
  const real = lookupNodeBuildConfig("presence-store")?.real;
  assert.ok(real !== undefined);
  assert.equal(real.testFile, "packages/store/src/presence-store.test.ts");
  assert.equal(real.sourceFile, "packages/store/src/presence-store.ts");
  assert.equal(real.install, true);
  assert.deepEqual(real.typecheck, {
    file: "pnpm",
    args: ["--filter", "@storytree/store", "typecheck"],
  });
  const scope = new PathWriteScope(real.scope);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.testFile), true);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.sourceFile), false);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.sourceFile), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.testFile), false);
  // Neither the DDL (spine work, already at HEAD) nor sibling stores are reachable.
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "packages/store/src/schema.sql"), false);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "packages/store/src/pg-comment-store.ts"), false);
});

test("the noticeboard-cli entry is REAL-buildable with install and walls excluding the dispatch", () => {
  const real = lookupNodeBuildConfig("noticeboard-cli")?.real;
  assert.ok(real !== undefined);
  assert.equal(real.testFile, "packages/cli/src/noticeboard.test.ts");
  assert.equal(real.sourceFile, "packages/cli/src/noticeboard.ts");
  assert.equal(real.install, true);
  assert.deepEqual(real.typecheck, {
    file: "pnpm",
    args: ["--filter", "@storytree/cli", "typecheck"],
  });
  const scope = new PathWriteScope(real.scope);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.testFile), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.sourceFile), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.testFile), false);
  // The dispatch wiring is spine work AFTER promotion — the leaf can never reach it.
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "packages/cli/src/commands.ts"), false);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "packages/cli/src/main.ts"), false);
});

test("the tree-view entry is REAL-buildable with install and walls excluding the dispatch", () => {
  const real = lookupNodeBuildConfig("tree-view")?.real;
  assert.ok(real !== undefined);
  assert.equal(real.testFile, "packages/cli/src/tree.test.ts");
  assert.equal(real.sourceFile, "packages/cli/src/tree.ts");
  assert.equal(real.install, true);
  assert.deepEqual(real.typecheck, {
    file: "pnpm",
    args: ["--filter", "@storytree/cli", "typecheck"],
  });
  const scope = new PathWriteScope(real.scope);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", real.testFile), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.sourceFile), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", real.testFile), false);
  // The sibling proven module and the dispatch stay out of reach.
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "packages/cli/src/noticeboard.ts"), false);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "packages/cli/src/commands.ts"), false);
});

test("every install-bearing REAL entry registers a typecheck command (the registry-wide invariant)", () => {
  // tsx strips types in both the proof run and the regression suite; without a registered
  // `tsc --noEmit` an install:true node's promotion would push type-illegal code to PR CI.
  for (const id of realBuildableNodeIds()) {
    const real = lookupNodeBuildConfig(id)?.real;
    assert.ok(real !== undefined, `${id} carries a real config`);
    if (real.install === true) {
      assert.ok(real.typecheck !== undefined, `${id}: install:true requires real.typecheck`);
      assert.ok(real.typecheck.args.includes("typecheck"), `${id}: typecheck targets the script`);
    }
  }
});

// ── prompt assembly (real briefs off the real spec) ──────────────────────────────────────────────

test("assemblePrompts builds authorTest/implement briefs from the node's outcome + guidance", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const prompts = assemblePrompts(spec);
  assert.match(prompts.authorTest, /AUTHOR_TEST/);
  assert.match(prompts.authorTest, /curates library artifacts/);
  assert.match(prompts.authorTest, /Guidance from the node spec/);
  assert.match(prompts.implement, /IMPLEMENT/);
  assert.match(prompts.implement, /never the test/);
});

// ── the resolver: all 14 fields, fail-closed on an unregistered node ─────────────────────────────

test("resolveProveSpec refuses an unregistered node with the buildable ids", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const result = resolveProveSpec(
    { ...spec, id: "not-registered" },
    {
      mode: "dry-run",
      workspace: os.tmpdir(),
      store: new InMemoryStore(),
      runId: "r1",
      signerInputs: { flag: "tester@example.com" },
    },
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /no test-command registry entry/);
  assert.ok(result.registered.includes("library-cli"));
});

test("resolveProveSpec fills the real fields off the spec (unitId, mapped proofMode, testId, runId)", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const result = resolveProveSpec(spec, {
    mode: "dry-run",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "run-42",
    signerInputs: { flag: "tester@example.com" },
    now: () => "2026-06-10T00:00:00.000Z",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.spec.unitId, "library-cli");
  assert.equal(result.spec.proofMode, "capability"); // integration-test → capability
  assert.equal(result.spec.testId, "library-cli");
  assert.equal(result.spec.runId, "run-42");
  assert.match(result.spec.prompts.authorTest, /library-cli/);
  assert.equal(result.spec.now(), "2026-06-10T00:00:00.000Z");
});

// ── THE GLUE PROOF: a REAL node spec through the gate to a signed verdict + rollup ───────────────

test("dry-run glue: real library-cli spec → ProveSpec → proveUnit → signed pass → rollup healthy", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-dryrun-"));
  const store = new InMemoryStore();
  try {
    const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
    // The lifecycle mark a real build starts with — gives the rollup something real to project.
    await store.appendEvent(
      workEvent({ unitId: spec.id, event: "building", runId: "dry-1" }, "tester@example.com"),
    );
    const resolved = resolveProveSpec(spec, {
      mode: "dry-run",
      workspace,
      store,
      runId: "dry-1",
      signerInputs: { flag: "tester@example.com" },
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
    // The verdict carries the REAL node identity, the spine's OWN observed red→green evidence.
    assert.equal(result.verdict.unitId, "library-cli");
    assert.equal(result.verdict.proofMode, "capability");
    assert.equal(result.verdict.signer, "tester@example.com");
    assert.deepEqual(
      result.verdict.evidence.map((e) => e.kind),
      ["observation:red", "observation:green"],
    );

    // The rollup derives healthy off the event log — building, then the gate's signed pass.
    assert.equal(rollupStatus("library-cli", await store.readEvents()), "healthy");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

// ── REAL mode (Phase F): fail-closed config gate, briefs, and the offline wiring walk ───────────

test("real mode fails closed on a registered node WITHOUT a real-proof config", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const result = resolveProveSpec(spec, {
    mode: "real",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "r1",
    signerInputs: { flag: "tester@example.com" },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /no REAL proof config/);
  assert.deepEqual(result.registered, [
    "declare-presence",
    "noticeboard-cli",
    "presence-store",
    "tree-view",
    "verdict-line",
  ]);
});

test("realPrompts names the REAL files, the REAL proof command, and the no-node_modules constraint", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
  const real = lookupNodeBuildConfig("verdict-line")?.real;
  assert.ok(real !== undefined);
  const prompts = realPrompts(spec, real);
  assert.match(prompts.authorTest, /packages\/core\/src\/verdict-line\.test\.ts/);
  assert.match(prompts.authorTest, /node --import tsx --test/);
  assert.match(prompts.authorTest, /must NOT exist yet/);
  assert.match(prompts.authorTest, /NO node_modules/);
  assert.match(prompts.authorTest, /Guidance from the node spec/);
  assert.match(prompts.implement, /packages\/core\/src\/verdict-line\.ts/);
  assert.match(prompts.implement, /Writes to the test file are refused/);
});

test("realPrompts for an install-bearing node names the typecheck wall (type-legal from the start)", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "notice-board", "declare-presence.md"));
  const real = lookupNodeBuildConfig("declare-presence")?.real;
  assert.ok(real !== undefined);
  const prompts = realPrompts(spec, real);
  // The install-mode brief: dependencies are present, but the leaf is told promotion also runs
  // tsc --noEmit — runtime-green is not enough (the tsx type-strip hole, closed).
  assert.match(prompts.authorTest, /dependencies installed/);
  assert.match(prompts.authorTest, /tsc --noEmit/);
  assert.match(prompts.authorTest, /exactOptionalPropertyTypes/);
  assert.match(prompts.implement, /tsc --noEmit/);
});

// ── Feedback tools (option A): the briefs, the commands, and the resolver wiring ────────────────

test("realPrompts brief the feedback loop: run_proof in both phases, feedback ≠ verdict, stop-if-test-wrong", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
  const real = lookupNodeBuildConfig("verdict-line")?.real;
  assert.ok(real !== undefined);
  const prompts = realPrompts(spec, real);
  // AUTHOR_TEST: confirm the red is the RIGHT-KIND red before stopping (ADR-0020 §3).
  assert.match(prompts.authorTest, /run_proof/);
  assert.match(prompts.authorTest, /fails for the RIGHT\s+reason/);
  // IMPLEMENT: iterate against the real oracle; the verdict stays the spine's.
  assert.match(prompts.implement, /Iterate: write, `run_proof`, fix/);
  assert.match(prompts.implement, /spine observes the official green itself/);
  assert.match(prompts.implement, /stop and say so plainly/);
  // No-install node: no run_typecheck in the brief.
  assert.doesNotMatch(prompts.implement, /run_typecheck/);
});

test("realPrompts for an install-bearing node also brief run_typecheck", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "notice-board", "declare-presence.md"));
  const real = lookupNodeBuildConfig("declare-presence")?.real;
  assert.ok(real !== undefined);
  const prompts = realPrompts(spec, real);
  assert.match(prompts.authorTest, /run_typecheck/);
  assert.match(prompts.implement, /`run_typecheck` is green/);
});

test("feedbackCommandsFor: run_proof always (the SAME command, really spawnable); run_typecheck only when registered", async () => {
  const greenCmd = { file: process.execPath, args: ["-e", "console.log('ok'); process.exit(0)"] };
  const redCmd = { file: process.execPath, args: ["-e", "console.error('boom'); process.exit(1)"] };

  const proofOnly = feedbackCommandsFor(greenCmd, "node test");
  assert.deepEqual(proofOnly.map((c) => c.name), ["run_proof"]);
  assert.match(proofOnly[0]!.description, /FEEDBACK ONLY/);
  // The runner really spawns the fixed command and surfaces exit-code-as-data.
  const green = await proofOnly[0]!.run();
  assert.equal(green.code, 0);
  assert.match(green.stdout, /ok/);

  const both = feedbackCommandsFor(greenCmd, "node test", redCmd);
  assert.deepEqual(both.map((c) => c.name), ["run_proof", "run_typecheck"]);
  const red = await both[1]!.run();
  assert.equal(red.code, 1);
  assert.match(red.stderr, /boom/);
});

test("real-mode resolution arms the live leaf with run_proof + run_typecheck (install node)", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "notice-board", "declare-presence.md"));
  const result = resolveProveSpec(spec, {
    mode: "real",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "r-feedback",
    signerInputs: { flag: "tester@example.com" },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.ok(result.liveAuthor !== undefined);
  assert.deepEqual(result.liveAuthor.feedbackToolNames, [
    "mcp__spine__run_proof",
    "mcp__spine__run_typecheck",
  ]);
});

test("real-mode resolution for a no-install node arms run_proof only", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
  const result = resolveProveSpec(spec, {
    mode: "real",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "r-feedback2",
    signerInputs: { flag: "tester@example.com" },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.liveAuthor?.feedbackToolNames, ["mcp__spine__run_proof"]);
});

test("live-smoke resolution arms run_proof over the synthetic pair", () => {
  const spec = loadNodeSpec(path.join(STORIES_DIR, "library", "library-cli.md"));
  const result = resolveProveSpec(spec, {
    mode: "live-smoke",
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "r-smoke",
    signerInputs: { flag: "tester@example.com" },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.liveAuthor?.feedbackToolNames, ["mcp__spine__run_proof"]);
});

/**
 * Scripted stand-ins for what the LIVE leaf authors in a real run (the live run authors its own;
 * these only prove the WIRING offline): a genuinely-red test (its import target does not exist at
 * HEAD) and the dependency-free impl that turns it green.
 */
const SCRIPTED_REAL_TEST = `import test from "node:test";
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

const SCRIPTED_REAL_IMPL = `export interface VerdictLike {
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

test("REAL mode offline walk: fresh worktree + real proof command + spine commit → signed pass on a genuinely clean tree", async () => {
  const worktree = await createBuildWorktree(REPO_ROOT);
  const store = new InMemoryStore();
  try {
    const spec = loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
    const real = lookupNodeBuildConfig("verdict-line")?.real;
    assert.ok(real !== undefined);

    // Recreate the walk's NET-NEW precondition: verdict-line's proven commit has since been
    // PROMOTED and folded into HEAD (ADR-0031), so a fresh worktree already holds the files and
    // CONFIRM_RED would observe green. Deleting them in the worktree restores "nothing exists at
    // HEAD" for this walk; the leaf re-authors both and the spine commits the rewrite.
    await fs.rm(path.join(worktree.root, real.testFile));
    await fs.rm(path.join(worktree.root, real.sourceFile));

    // The injected leaf (executor seam as test seam): the owned loop scripted to write the REAL
    // repo paths, behind the SAME write walls the live leaf gets.
    const author = new OwnedLoopAuthor({
      model: scriptedWriterModel([
        { path: real.testFile, content: SCRIPTED_REAL_TEST },
        { path: real.sourceFile, content: SCRIPTED_REAL_IMPL },
      ]),
      tools: new FileToolExecutor({ rootDir: worktree.root }),
      scope: new PathWriteScope(real.scope),
      writeTools: FILE_WRITE_TOOLS,
    });

    const resolved = resolveProveSpec(spec, {
      mode: "real",
      workspace: worktree.root,
      store,
      runId: "real-offline-1",
      signerInputs: { flag: "tester@example.com" },
      authorOverride: author,
      // NO treeState injected: the DEFAULT real seam must commit spine-side and read real git.
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    assert.equal(resolved.liveAuthor, undefined, "an injected author means no SDK leaf");

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
    // contract-test → contract, and the spine's own red→green evidence.
    assert.equal(result.verdict.proofMode, "contract");
    assert.deepEqual(
      result.verdict.evidence.map((e) => e.kind),
      ["observation:red", "observation:green"],
    );

    // Cleanliness was EARNED: the verdict pins a NEW commit (the spine's), and the worktree's
    // REAL git state agrees — clean, at exactly that commit.
    assert.notEqual(result.verdict.commitSha, worktree.headSha);
    const tree = await gitTreeState(worktree.root)();
    assert.equal(tree.clean, true);
    assert.equal(tree.commitSha, result.verdict.commitSha);
  } finally {
    await worktree.remove();
  }
});
