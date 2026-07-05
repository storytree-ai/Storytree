import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { InMemoryStore } from "@storytree/storage-protocol";
import { FileToolExecutor, FILE_WRITE_TOOLS } from "@storytree/agent";
import {
  OwnedLoopAuthor,
  PathWriteScope,
  proveUnit,
  resolveProveSpec,
  scriptedWriterModel,
} from "@storytree/orchestrator";
import type { NodeSpec } from "@storytree/orchestrator";

/**
 * ADR-0092 (gate-as-proof for a machine-witnessed story's OWN UAT node): a `uat_witness: machine`
 * story is DRIVEN (not withheld) under `story build --real`, so its story node needs a `real:` arm.
 * The arm is gate-as-proof (ADR-0059, expansion E) over the story SPEC: the `## Story UAT`
 * walkthrough is the "source", a per-story structural-completeness check is the "test", and editing
 * an incomplete spec to a complete, fully-witnessed machine-UAT record turns it red→green.
 *
 * This OFFLINE walk proves the WIRING end-to-end: a TIER:STORY gate-as-proof node drives through the
 * UNCHANGED prove-it-gate (resolve-prove-spec → proveUnit) to a signed verdict — NO engine change
 * beyond the ADR-0092 scope-bound amendment (the gate paths are already tier-agnostic). The
 * completeness assertion is INLINED here (builtins-only, no node_modules in the worktree) exactly as
 * gate-as-proof.test.ts does for ADRs; the production checker `storyUatCompleteness` is proven in
 * story-completeness.test.ts. The honesty walls are unchanged: AUTHOR_TEST is test-globs-only (the
 * leaf cannot pre-complete the spec while "authoring the proof"); CONFIRM_RED observes the
 * completeness test failing against the UNCHANGED incomplete spec; a forged already-green test fails
 * closed at CONFIRM_RED.
 */

const execFileP = promisify(execFile);

/** An INCOMPLETE machine-UAT story (leg 2 names NO witness → a genuine on-disk completeness red). */
const INCOMPLETE_STORY = [
  "---",
  'id: "demo"',
  "tier: story",
  'title: "A demo story"',
  'outcome: "An agent does one provable thing end to end through a real surface."',
  "status: mapped",
  "proof_mode: UAT",
  "uat_witness: machine",
  "capabilities: [cap-one, cap-two]",
  "---",
  "",
  "# A demo story",
  "",
  "## Story UAT",
  "",
  "1. **First leg:** _(witness: machine)_ run the thing. **Success —** it works.",
  "2. **Second leg:** run the other thing. **Success —** it also works.",
  "",
  "## Proof",
  "",
  "The story is proven when the UAT passes against the real organism.",
  "",
].join("\n");

/** The COMPLETE record the leaf authors in IMPLEMENT — leg 2 now names its witness. */
const COMPLETE_STORY = INCOMPLETE_STORY.replace(
  "2. **Second leg:** run the other thing.",
  "2. **Second leg:** _(witness: machine)_ run the other thing.",
);

/**
 * A completeness test (builtins-only): RED against the incomplete spec (an untagged UAT leg), GREEN
 * once every leg names `(witness: …)`. Mirrors storyUatCompleteness's untagged-leg check without the
 * package import, so the worktree stays node_modules-free.
 */
function completenessTest(storyFile: string): string {
  return (
    'import test from "node:test";\n' +
    'import assert from "node:assert/strict";\n' +
    'import { readFileSync } from "node:fs";\n' +
    `test("every Story UAT leg names its witness", () => {\n` +
    `  const c = readFileSync(${JSON.stringify(storyFile)}, "utf8");\n` +
    '  const uat = c.slice(c.indexOf("## Story UAT"));\n' +
    '  const legs = uat.split("\\n").filter((l) => /^\\d+\\.\\s/.test(l));\n' +
    '  assert.ok(legs.length > 0, "the story has UAT legs");\n' +
    '  for (const leg of legs) assert.match(leg, /\\(witness:/, `leg names a witness: ${leg}`);\n' +
    "});\n"
  );
}

/** A throwaway git repo with an INCOMPLETE story spec committed at HEAD (the "existing source"). */
async function fixtureWithIncompleteStory(): Promise<{ root: string; storyFile: string; testFile: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-gate-as-proof-story-"));
  await execFileP("git", ["init", "-b", "main"], { cwd: root });
  await execFileP("git", ["config", "user.email", "fixture@storytree.invalid"], { cwd: root });
  await execFileP("git", ["config", "user.name", "fixture"], { cwd: root });
  await fs.writeFile(path.join(root, "package.json"), '{\n  "type": "module"\n}\n');
  const storyFile = "stories/demo/story.md";
  await fs.mkdir(path.join(root, "stories", "demo"), { recursive: true });
  await fs.writeFile(path.join(root, storyFile), INCOMPLETE_STORY);
  await execFileP("git", ["add", "-A"], { cwd: root });
  await execFileP("git", ["-c", "commit.gpgsign=false", "commit", "-m", "fixture: incomplete story"], { cwd: root });
  return { root, storyFile, testFile: "demo-story-complete.test.ts" };
}

/** A gate-as-proof STORY node spec: editsExisting over the story.md doc, a completeness test as the proof. */
function gateAsProofStorySpec(storyFile: string, testFile: string): NodeSpec {
  const scope = { testGlobs: [testFile], sourceGlobs: [storyFile] };
  return {
    id: "demo",
    tier: "story",
    title: "A demo story",
    outcome: "An agent does one provable thing end to end through a real surface.",
    status: "mapped",
    proofMode: "UAT",
    uatWitness: "machine",
    story: undefined,
    dependsOn: [],
    consumedBy: [],
    artifactEdges: [],
    capabilities: ["cap-one", "cap-two"],
    decisions: [57, 59, 92],
    buildConfig: {
      command: { file: "node", args: ["--version"] },
      scope,
      real: { testFile, sourceFile: storyFile, scope, editsExisting: true },
    },
    guidance: undefined,
    uatTests: [],
    reliabilityGates: [],
    contracts: [],
    file: "stories/demo/story.md",
  };
}

test("E (story) — a tier:story gate-as-proof node drives red→green through the gate to a signed verdict", async () => {
  const fix = await fixtureWithIncompleteStory();
  const store = new InMemoryStore();
  try {
    const spec = gateAsProofStorySpec(fix.storyFile, fix.testFile);
    // The scripted leaf: AUTHOR_TEST writes the completeness test (RED against the incomplete spec);
    // IMPLEMENT EDITs the story.md into a complete, fully-witnessed record (GREEN). The spec is the source.
    const author = new OwnedLoopAuthor({
      model: scriptedWriterModel([
        { path: fix.testFile, content: completenessTest(fix.storyFile) },
        { path: fix.storyFile, content: COMPLETE_STORY },
      ]),
      tools: new FileToolExecutor({ rootDir: fix.root }),
      scope: new PathWriteScope({ testGlobs: [fix.testFile], sourceGlobs: [fix.storyFile] }),
      writeTools: FILE_WRITE_TOOLS,
    });
    const resolved = resolveProveSpec(spec, {
      mode: "real",
      workspace: fix.root,
      store,
      runId: "gate-as-proof-story-1",
      signerInputs: { flag: "tester@example.com" },
      authorOverride: author,
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
    assert.deepEqual(
      result.verdict.evidence.map((e) => e.kind),
      ["observation:red", "observation:green"],
    );
    assert.equal(result.verdict.unitId, "demo");
    // The story node's proof mode is the STORY rung (UAT → story) — the verdict is a story-tier sign.
    assert.equal(result.verdict.proofMode, "story");
  } finally {
    await fs.rm(fix.root, { recursive: true, force: true });
  }
});

test("E (story) — a forged already-green completeness test fails closed at CONFIRM_RED", async () => {
  const fix = await fixtureWithIncompleteStory();
  const store = new InMemoryStore();
  try {
    const spec = gateAsProofStorySpec(fix.storyFile, fix.testFile);
    const FORGED_GREEN =
      'import test from "node:test";\nimport assert from "node:assert/strict";\n' +
      'test("noop", () => assert.ok(true));\n';
    const author = new OwnedLoopAuthor({
      model: scriptedWriterModel([{ path: fix.testFile, content: FORGED_GREEN }]),
      tools: new FileToolExecutor({ rootDir: fix.root }),
      scope: new PathWriteScope({ testGlobs: [fix.testFile], sourceGlobs: [fix.storyFile] }),
      writeTools: FILE_WRITE_TOOLS,
    });
    const resolved = resolveProveSpec(spec, {
      mode: "real",
      workspace: fix.root,
      store,
      runId: "gate-as-proof-story-forge-1",
      signerInputs: { flag: "tester@example.com" },
      authorOverride: author,
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    const result = await proveUnit(resolved.spec);
    assert.equal(result.ok, false, "a forged already-green completeness test must NOT yield a pass");
    if (result.ok) return;
    assert.equal(result.failedAt, "CONFIRM_RED");
  } finally {
    await fs.rm(fix.root, { recursive: true, force: true });
  }
});

test("E (story) — the AUTHOR_TEST wall holds over the story.md doc (the leaf cannot edit the spec while authoring the test)", () => {
  const scope = new PathWriteScope({
    testGlobs: ["demo-story-complete.test.ts"],
    sourceGlobs: ["stories/demo/story.md"],
  });
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", "stories/demo/story.md"), false);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", "demo-story-complete.test.ts"), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "stories/demo/story.md"), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "demo-story-complete.test.ts"), false);
});
