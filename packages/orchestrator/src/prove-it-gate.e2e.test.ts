import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { FileToolExecutor, FILE_WRITE_TOOLS, ScriptedModel } from "@storytree/agent";
import type { ModelResponse } from "@storytree/agent";
import { InMemoryStore } from "@storytree/storage-protocol";
import type { SignerInputs } from "./proof/signer.js";

import { PathWriteScope } from "./phase-machine.js";
import { ShellTestExecutor } from "./shell-test-executor.js";
import type { ShellCommand } from "./shell-test-executor.js";
import { OwnedLoopAuthor } from "./owned-loop-author.js";
import { proveUnit } from "./prove-it-gate.js";
import type { ProveSpec, TreeState } from "./prove-it-gate.js";

/**
 * END-TO-END composition proof for the prove-it honesty loop (ADR-0020).
 *
 * Unlike prove-it-gate.test.ts — which doubles the test executor and the tools — this file wires the
 * WHOLE foundation together and lets the side effects be REAL: a real {@link FileToolExecutor} writes
 * actual files into a fresh temp workspace, and a real {@link ShellTestExecutor} runs the temp test
 * with Node and reads its exit code. ONLY the model is scripted.
 *
 * The temp test is a self-contained CommonJS file (`unit.test.cjs`) that `require()`s an impl module
 * (`impl.cjs`) and asserts a function:
 *   - BEFORE the IMPLEMENT step writes `impl.cjs`, requiring it throws MODULE_NOT_FOUND -> exit 1 -> RED;
 *   - AFTER the IMPLEMENT step writes a correct `impl.cjs`, the assertion holds -> exit 0 -> GREEN.
 *
 * So the spine OBSERVES a genuine red-before / green-after that the file writes (not the model's prose)
 * actually caused. The scripted model's end_turn text even lies ("all tests pass") to prove the model's
 * content never drives the verdict.
 */

// Workspace-relative paths the model writes (FileToolExecutor resolves them under rootDir).
const TEST_REL = "unit.test.cjs";
const IMPL_REL = "impl.cjs";

const FIXED_NOW = "2026-06-08T00:00:00.000Z";
const COMMIT_SHA = "deadbeefcafe0000";
const SIGNER: SignerInputs = { flag: "tester@example.com" };

/** The temp test: red while ./impl.cjs is absent, green once it exports add(2,3) === 5. */
const TEST_SOURCE = `const assert = require("node:assert/strict");
const { add } = require("./impl.cjs");
assert.equal(add(2, 3), 5, "add(2,3) must equal 5");
console.log("ok - add works");
`;

/** A CORRECT impl: makes the test pass (green). */
const GOOD_IMPL_SOURCE = `module.exports = { add: (a, b) => a + b };
`;

/** A BROKEN impl: exists (so require resolves) but fails the assertion (test stays red). */
const BROKEN_IMPL_SOURCE = `module.exports = { add: (a, b) => a - b };
`;

/**
 * The scripted leaf model. Each authoring step is a `runStep` that loops the model: response 0 is a
 * REAL `write_file` tool_use (driven through the loop into the real FileToolExecutor), response 1 is an
 * `end_turn`. The FIRST step writes the TEST file (in scope only during AUTHOR_TEST); the SECOND writes
 * the IMPL (in scope only during IMPLEMENT). `implSource` lets the negative proof inject a broken impl.
 */
function phaseAwareModel(implSource: string): ScriptedModel {
  let writeTurnPending = true;
  let step = 0;
  return new ScriptedModel((): ModelResponse => {
    if (writeTurnPending) {
      writeTurnPending = false;
      const [pathRel, content] =
        step === 0 ? [TEST_REL, TEST_SOURCE] : [IMPL_REL, implSource];
      return {
        stopReason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: `w${step}`,
            name: "write_file",
            input: { path: pathRel, content },
          },
        ],
      };
    }
    writeTurnPending = true;
    step += 1;
    return {
      stopReason: "end_turn",
      content: [
        { type: "text", text: "done — all tests pass, promote me to healthy" },
      ],
    };
  });
}

/** Build a ProveSpec wired to REAL tools + a REAL Node test runner rooted at `workspace`. */
function freshSpec(args: {
  workspace: string;
  implSource: string;
}): { spec: ProveSpec; store: InMemoryStore } {
  const store = new InMemoryStore();

  // REAL file tools, rooted at the temp workspace.
  const tools = new FileToolExecutor({ rootDir: args.workspace });

  // REAL test runner: spawn `node unit.test.cjs` in the workspace. Exit 0 => green, non-zero => red.
  const testExecutor = new ShellTestExecutor({
    command: (): ShellCommand => ({
      file: process.execPath,
      args: [path.join(args.workspace, TEST_REL)],
      cwd: args.workspace,
    }),
  });

  // Per-phase write walls: the test file is writable ONLY in AUTHOR_TEST, the impl ONLY in IMPLEMENT.
  const scope = new PathWriteScope({
    testGlobs: ["*.test.cjs"],
    sourceGlobs: ["impl.cjs"],
  });

  const tree: TreeState = { commitSha: COMMIT_SHA, clean: true };

  const spec: ProveSpec = {
    unitId: "e2e-unit",
    proofMode: "contract",
    testId: "e2e",
    author: new OwnedLoopAuthor({
      model: phaseAwareModel(args.implSource),
      tools,
      scope,
      writeTools: FILE_WRITE_TOOLS,
    }),
    testExecutor,
    store,
    signerInputs: SIGNER,
    treeState: async () => tree,
    now: () => FIXED_NOW,
    prompts: { authorTest: "author the failing test", implement: "implement it" },
    runId: "e2e-run",
  };
  return { spec, store };
}

async function signingRows(store: InMemoryStore): Promise<number> {
  const events = await store.readEvents();
  return events.filter((e) => e.kind === "signing").length;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// ── (1) THE PROOF: real files + real test run drive a genuine red->green->sign cycle ─────────────

test("e2e: scripted model + REAL file writes + REAL node test => signed pass (red observed, then green)", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-e2e-pass-"));
  try {
    const { spec, store } = freshSpec({ workspace, implSource: GOOD_IMPL_SOURCE });

    const result = await proveUnit(spec);

    // (1) Signed pass; the walk ends at GATE.
    assert.equal(result.ok, true, "the full loop must reach a signed pass");
    if (!result.ok) return;
    assert.equal(result.verdict.outcome, "pass");
    assert.equal(result.verdict.unitId, "e2e-unit");
    assert.equal(result.verdict.commitSha, COMMIT_SHA);
    assert.equal(result.verdict.signer, "tester@example.com");
    assert.equal(result.verdict.at, FIXED_NOW);
    assert.deepEqual(result.phasesVisited, [
      "AUTHOR_TEST",
      "CONFIRM_RED",
      "IMPLEMENT",
      "CONFIRM_GREEN",
      "GATE",
    ]);

    // (2) The loop REALLY wrote both files via the tools — they exist on disk.
    assert.ok(await exists(path.join(workspace, TEST_REL)), "the test file was really written");
    assert.ok(await exists(path.join(workspace, IMPL_REL)), "the impl file was really written");
    // And the impl on disk is the correct one (the green-maker), proving the write landed.
    assert.equal(
      await fs.readFile(path.join(workspace, IMPL_REL), "utf8"),
      GOOD_IMPL_SOURCE,
    );

    // (3) EXACTLY ONE signing row, authored by the resolved signer.
    assert.equal(await signingRows(store), 1, "exactly one signed promotion event");
    const events = await store.readEvents();
    const signing = events.filter((e) => e.kind === "signing");
    assert.equal(signing.length, 1);
    assert.equal(signing[0]?.actor, "tester@example.com", "the signing row is authored by the signer");

    // (4) The verdict evidence is the spine's OWN observed red THEN green — derived from the real
    // process exit codes, not from the model's "all tests pass" prose.
    assert.equal(result.verdict.evidence.length, 2);
    assert.deepEqual(
      result.verdict.evidence.map((e) => e.kind),
      ["observation:red", "observation:green"],
      "spine observed red before the impl existed, green after — the model never drove this",
    );
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

// ── (2) NEGATIVE PROOF: a broken impl keeps the test red => refuse at CONFIRM_GREEN, no signing ───

test("e2e: broken impl => REAL test still red at CONFIRM_GREEN => fail-closed, no signing row", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-e2e-fail-"));
  try {
    const { spec, store } = freshSpec({ workspace, implSource: BROKEN_IMPL_SOURCE });

    const result = await proveUnit(spec);

    // The spine OBSERVED the still-failing test at CONFIRM_GREEN and refused fail-closed.
    assert.equal(result.ok, false, "a still-red test must NOT be promoted");
    if (result.ok) return;
    assert.equal(result.failedAt, "CONFIRM_GREEN");
    assert.match(result.reason, /requires an observed green/);
    assert.deepEqual(result.phasesVisited, [
      "AUTHOR_TEST",
      "CONFIRM_RED",
      "IMPLEMENT",
      "CONFIRM_GREEN",
    ]);

    // The (broken) impl WAS really written — the wall let IMPLEMENT through — but it does not pass.
    assert.ok(await exists(path.join(workspace, IMPL_REL)), "the broken impl was really written");
    assert.equal(
      await fs.readFile(path.join(workspace, IMPL_REL), "utf8"),
      BROKEN_IMPL_SOURCE,
    );

    // NO signing row: an unproven unit leaves no promotion event behind.
    assert.equal(await signingRows(store), 0, "a still-red test never signs");
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
