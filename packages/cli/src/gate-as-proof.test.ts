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

import { scaffold } from "./adr.js";

/**
 * ADR-0059 (gate-as-proof): authoring earns a signed verdict through the UNCHANGED prove-it-gate by
 * REDUCING to edit-existing (ADR-0057 C) — the ARTIFACT is the source, a per-artifact structural
 * COMPLETENESS check is the test. This OFFLINE walk proves the composition end-to-end: a real
 * `storytree adr new` scaffold (status:proposed, `<…>` placeholders, no `decided:`) is the existing
 * source; a scripted leaf authors a completeness test (AUTHOR_TEST, test-globs-only) that the spine
 * observes RED against the unedited scaffold; the leaf EDITs the ADR to completeness (IMPLEMENT,
 * source-globs-only); the spine observes GREEN; the GATE signs. NO new engine machinery — pure A/B/C.
 *
 * The completeness assertion is INLINED here (read the .md, no placeholders + a decided date) so the
 * fixture stays builtins-only (no node_modules); the production checker `adrCompleteness` is proven
 * separately in adr-completeness.test.ts. The point of THIS test is the FLOW: a doc artifact + a
 * structural proof red→green through the real gate, with the AUTHOR_TEST wall holding over a doc.
 */

const execFileP = promisify(execFile);

/** A throwaway git repo with a real scaffold ADR committed at HEAD (the "existing source"). */
async function fixtureWithScaffoldAdr(): Promise<{ root: string; adrFile: string; testFile: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-gate-as-proof-"));
  await execFileP("git", ["init", "-b", "main"], { cwd: root });
  await execFileP("git", ["config", "user.email", "fixture@storytree.invalid"], { cwd: root });
  await execFileP("git", ["config", "user.name", "fixture"], { cwd: root });
  await fs.writeFile(path.join(root, "package.json"), '{\n  "type": "module"\n}\n');
  const adrFile = "docs/decisions/0059-fixture.md";
  await fs.mkdir(path.join(root, "docs", "decisions"), { recursive: true });
  // The REAL scaffold: status:proposed, `<…>` placeholders, NO decided — a genuine on-disk red.
  await fs.writeFile(path.join(root, adrFile), scaffold(59, "Fixture gate-as-proof", { supersedes: [], amends: [] }));
  await execFileP("git", ["add", "-A"], { cwd: root });
  await execFileP("git", ["-c", "commit.gpgsign=false", "commit", "-m", "fixture: scaffolded ADR"], {
    cwd: root,
  });
  return { root, adrFile, testFile: "adr-0059-complete.test.ts" };
}

/** A completeness test (builtins-only): RED against the scaffold (placeholders / no decided), GREEN once authored. */
function completenessTest(adrFile: string): string {
  return (
    'import test from "node:test";\n' +
    'import assert from "node:assert/strict";\n' +
    'import { readFileSync } from "node:fs";\n' +
    `test("adr is structurally complete", () => {\n` +
    `  const c = readFileSync(${JSON.stringify(adrFile)}, "utf8");\n` +
    '  assert.ok(!/<[^<>\\n]*\\s[^<>\\n]*>/.test(c), "no unfilled scaffold placeholders");\n' +
    '  assert.match(c, /^decided:/m, "a decided date is present");\n' +
    "});\n"
  );
}

/** The completed PROPOSED ADR the leaf authors in IMPLEMENT — no placeholders, a decided date, status proposed. */
const COMPLETED_ADR = [
  "---",
  "status: proposed",
  "decided: 2026-06-15",
  "---",
  "# ADR-0059: Fixture gate-as-proof",
  "",
  "## Status",
  "",
  "proposed — decided 2026-06-15 by the fixture owner.",
  "",
  "## Context",
  "",
  "The fixture exercises gate-as-proof: authoring reduces to edit-existing over a doc.",
  "",
  "## Decision",
  "",
  "Author the scaffold into a complete proposed record; the gate witnesses completeness.",
  "",
  "## Consequences",
  "",
  "Good: authoring is buildable. Bad: a completeness test rides along.",
  "",
  "## References",
  "",
  "- ADR-0057.",
  "",
].join("\n");

/** A gate-as-proof node spec: editsExisting over the ADR doc, a completeness test as the proof. */
function gateAsProofSpec(adrFile: string, testFile: string): NodeSpec {
  const scope = { testGlobs: [testFile], sourceGlobs: [adrFile] };
  return {
    id: "gate-as-proof-fixture",
    tier: "capability",
    title: "gate-as-proof fixture",
    outcome: "an ADR scaffold is authored to completeness through the gate",
    status: "proposed",
    proofMode: "integration-test",
    uatWitness: undefined,
    story: "drive-machinery",
    dependsOn: [],
    consumedBy: [],
    capabilities: [],
    decisions: [57, 59],
    buildConfig: {
      command: { file: "node", args: ["--version"] },
      scope,
      real: {
        testFile,
        sourceFile: adrFile,
        scope,
        editsExisting: true,
      },
    },
    guidance: undefined,
    uatTests: [],
    file: "stories/drive-machinery/gate-as-proof-fixture.md",
  };
}

test("E — gate-as-proof: a scaffold ADR + a completeness test drives red→green through the gate (signed)", async () => {
  const fix = await fixtureWithScaffoldAdr();
  const store = new InMemoryStore();
  try {
    const spec = gateAsProofSpec(fix.adrFile, fix.testFile);
    // The scripted leaf: AUTHOR_TEST writes the completeness test (RED against the scaffold);
    // IMPLEMENT EDITs the existing ADR doc into a complete record (GREEN). The artifact is the source.
    const author = new OwnedLoopAuthor({
      model: scriptedWriterModel([
        { path: fix.testFile, content: completenessTest(fix.adrFile) },
        { path: fix.adrFile, content: COMPLETED_ADR },
      ]),
      tools: new FileToolExecutor({ rootDir: fix.root }),
      scope: new PathWriteScope({ testGlobs: [fix.testFile], sourceGlobs: [fix.adrFile] }),
      writeTools: FILE_WRITE_TOOLS,
    });
    const resolved = resolveProveSpec(spec, {
      mode: "real",
      workspace: fix.root,
      store,
      runId: "gate-as-proof-1",
      signerInputs: { flag: "tester@example.com" },
      authorOverride: author,
    });
    assert.equal(resolved.ok, true);
    if (!resolved.ok) return;
    const result = await proveUnit(resolved.spec);
    assert.equal(result.ok, true, result.ok ? "" : `${result.failedAt}: ${result.reason}`);
    if (!result.ok) return;
    // The red was a structural-completeness failure against the UNCHANGED scaffold; the green was the
    // authored ADR. A signed verdict for authoring — through the unchanged ladder.
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
    assert.equal(result.verdict.unitId, "gate-as-proof-fixture");
  } finally {
    await fs.rm(fix.root, { recursive: true, force: true });
  }
});

test("E — gate-as-proof: a forged already-green completeness test fails closed at CONFIRM_RED", async () => {
  // The honesty wall over a DOC: a leaf authoring a trivially-green "completeness" test (one that does
  // not actually assert completeness against the scaffold) is observed GREEN at CONFIRM_RED → the gate
  // fails closed (a real red must come first). Self-contained for E, mirroring C's forge proof.
  const fix = await fixtureWithScaffoldAdr();
  const store = new InMemoryStore();
  try {
    const spec = gateAsProofSpec(fix.adrFile, fix.testFile);
    const FORGED_GREEN =
      'import test from "node:test";\nimport assert from "node:assert/strict";\n' +
      'test("noop", () => assert.ok(true));\n';
    const author = new OwnedLoopAuthor({
      model: scriptedWriterModel([{ path: fix.testFile, content: FORGED_GREEN }]),
      tools: new FileToolExecutor({ rootDir: fix.root }),
      scope: new PathWriteScope({ testGlobs: [fix.testFile], sourceGlobs: [fix.adrFile] }),
      writeTools: FILE_WRITE_TOOLS,
    });
    const resolved = resolveProveSpec(spec, {
      mode: "real",
      workspace: fix.root,
      store,
      runId: "gate-as-proof-forge-1",
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

test("E — the AUTHOR_TEST wall holds over a doc artifact: the leaf cannot edit the ADR while authoring the test", () => {
  // gate-as-proof's honesty rests on C's wall applied to a doc: AUTHOR_TEST is test-globs-only, so a
  // leaf cannot pre-complete the ADR while "authoring the proof" — only the completeness test.
  const scope = new PathWriteScope({
    testGlobs: ["adr-0059-complete.test.ts"],
    sourceGlobs: ["docs/decisions/0059-fixture.md"],
  });
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", "docs/decisions/0059-fixture.md"), false);
  assert.equal(scope.isWriteAllowed("AUTHOR_TEST", "adr-0059-complete.test.ts"), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "docs/decisions/0059-fixture.md"), true);
  assert.equal(scope.isWriteAllowed("IMPLEMENT", "adr-0059-complete.test.ts"), false);
});
