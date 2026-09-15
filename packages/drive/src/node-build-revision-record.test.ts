import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fsp from "node:fs/promises";
import { existsSync } from "node:fs";
import * as os from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";
import { ShellTestExecutor, proveUnit } from "@storytree/orchestrator";
import type { ProveResult, ProveSpec, TestRevision, TreeState } from "@storytree/orchestrator";
import { parseAuthoringEscalation } from "@storytree/agent";
import type { AuthoringEscalation, AuthoringPhase, AuthorResult, PhaseAuthor } from "@storytree/agent";

// The module is imported as a NAMESPACE (`import * as`), never by name: the six revision-record
// functions this node adds do not exist on `node-build.ts` yet, and a NAMED import of an export the
// module lacks would fail to LINK — a structural red, the wrong kind for this `editsExisting`
// contract (ADR-0057 C declares `assertion`). Every test below runs a real `assert.equal` FIRST
// (via a `mustGet*` accessor), so a missing export reds as a genuine assertion failure, never a
// module-resolution error.
import * as NodeBuildModule from "./node-build.js";

/**
 * `a-returned-escalation-round-trips-through-its-revision-record` (ADR-0571): a failed build's
 * RETURNED escalation (never an `overruledEscalation`, never a plain failure carrying neither key)
 * is written to a per-user record keyed by unit and run, and reading that record back yields its
 * test revision — or a refusal that says why.
 *
 * Every `ProveResult` fed to the record functions below is PRODUCTION output: a real `proveUnit`
 * walk over a real `ShellTestExecutor` whose spawned child decides red/green by its own exit code —
 * never a hand-built `ProveResult` literal.
 */

const UNIT_ID = "node-build-revision-record-unit-fixture";

const AUTHOR_TEST_STATEMENT =
  "no automated oracle can observe whether the revision record round-trips correctly";
const IMPLEMENT_STATEMENT =
  "no correct implementation of the revision record can satisfy the authored test as written";
const IMPLEMENT_ASSERTION = "assert.deepEqual(readBack, expectedRevision)";

const DEFAULT_TREE: TreeState = {
  commitSha: "node-build-revision-record-fixture-tree",
  clean: true,
};
const DIRTY_TREE: TreeState = {
  commitSha: "node-build-revision-record-dirty-fixture-tree",
  clean: false,
};

/** Escapes regex metacharacters so a fixture's own prose can be embedded in a `RegExp` verbatim. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A leaf double: returns a scripted {@link AuthorResult} per phase (default `{ ok: true }`). */
function scriptedAuthor(results: Partial<Record<AuthoringPhase, AuthorResult>>): PhaseAuthor {
  return {
    async author(phase: AuthoringPhase): Promise<AuthorResult> {
      return results[phase] ?? { ok: true };
    },
  };
}

interface ScenarioConfig {
  runId: string;
  testId: string;
  stdoutMarker: string;
  stderrMarker: string;
  /** One exit code per `testExecutor.run` call the walk is expected to make, in order. */
  exitCodes: number[];
  author: PhaseAuthor;
  tree?: TreeState;
}

interface ScenarioResult {
  result: ProveResult;
  dir: string;
}

/**
 * Drive ONE real `proveUnit` walk over a real `ShellTestExecutor`: the spawned child decides its own
 * exit code per invocation (tracked via a counter file, since each call is a separate OS process)
 * and writes distinct stdout/stderr markers so a captured observation can be attributed correctly.
 */
async function driveScenario(config: ScenarioConfig): Promise<ScenarioResult> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "node-build-revision-record-"));
  const counterFile = path.join(dir, "counter.txt");
  await fsp.writeFile(counterFile, "0", "utf8");
  const script = [
    "const fs = require('fs');",
    `const counterFile = ${JSON.stringify(counterFile)};`,
    "let n = 0;",
    "try { n = parseInt(fs.readFileSync(counterFile, 'utf8'), 10) || 0; } catch (e) {}",
    "fs.writeFileSync(counterFile, String(n + 1));",
    `console.log(${JSON.stringify(config.stdoutMarker)} + ':' + n);`,
    `process.stderr.write(${JSON.stringify(config.stderrMarker)} + ':' + n);`,
    `const codes = ${JSON.stringify(config.exitCodes)};`,
    "process.exit(codes[n] === undefined ? 1 : codes[n]);",
  ].join(" ");
  const executor = new ShellTestExecutor({
    command: () => ({ file: process.execPath, args: ["-e", script] }),
  });
  const spec: ProveSpec = {
    unitId: UNIT_ID,
    proofMode: "contract",
    testId: config.testId,
    author: config.author,
    testExecutor: executor,
    store: new InMemoryStore(),
    signerInputs: { flag: "tester@example.com" },
    treeState: async () => config.tree ?? DEFAULT_TREE,
    now: () => "2024-01-01T00:00:00.000Z",
    prompts: {
      authorTest: "author the failing test",
      implement: "implement against the authored test",
    },
    runId: config.runId,
  };
  const result = await proveUnit(spec);
  return { result, dir };
}

// ── The bound-but-not-yet-published functions (mirrors `node-build-escalation-envelope.test.ts`) ───

type DefaultEscalationsDirFn = () => string;
type ResolveEscalationsDirFn = (dir: string | undefined) => string;
type RevisionRecordPathFn = (dir: string, unitId: string, runId: string) => string;
type RevisionWrite =
  | { written: true; path: string }
  | { written: false; path: string; reason: string };
type WriteRevisionRecordFn = (
  dir: string | undefined,
  unitId: string,
  runId: string,
  result: ProveResult,
) => Promise<RevisionWrite | null>;
type ParseTestRevisionOutcome = { ok: true; revision: TestRevision } | { ok: false; reason: string };
type ParseTestRevisionFn = (input: unknown, unitId: string) => ParseTestRevisionOutcome;
type ReadTestRevisionOutcome =
  | { ok: true; revision: TestRevision | undefined }
  | { ok: false; reason: string };
type ReadTestRevisionFn = (dir: string, unitId: string, runId: string | undefined) => ReadTestRevisionOutcome;

const defaultEscalationsDirRaw = (NodeBuildModule as Record<string, unknown>).defaultEscalationsDir as
  | DefaultEscalationsDirFn
  | undefined;
const resolveEscalationsDirRaw = (NodeBuildModule as Record<string, unknown>).resolveEscalationsDir as
  | ResolveEscalationsDirFn
  | undefined;
const revisionRecordPathRaw = (NodeBuildModule as Record<string, unknown>).revisionRecordPath as
  | RevisionRecordPathFn
  | undefined;
const writeRevisionRecordRaw = (NodeBuildModule as Record<string, unknown>).writeRevisionRecord as
  | WriteRevisionRecordFn
  | undefined;
const parseTestRevisionRaw = (NodeBuildModule as Record<string, unknown>).parseTestRevision as
  | ParseTestRevisionFn
  | undefined;
const readTestRevisionRaw = (NodeBuildModule as Record<string, unknown>).readTestRevision as
  | ReadTestRevisionFn
  | undefined;

function mustGetDefaultEscalationsDir(): DefaultEscalationsDirFn {
  assert.equal(
    typeof defaultEscalationsDirRaw,
    "function",
    "node-build.ts must export defaultEscalationsDir(): string",
  );
  return defaultEscalationsDirRaw as DefaultEscalationsDirFn;
}
function mustGetResolveEscalationsDir(): ResolveEscalationsDirFn {
  assert.equal(
    typeof resolveEscalationsDirRaw,
    "function",
    "node-build.ts must export resolveEscalationsDir(dir): string",
  );
  return resolveEscalationsDirRaw as ResolveEscalationsDirFn;
}
function mustGetRevisionRecordPath(): RevisionRecordPathFn {
  assert.equal(
    typeof revisionRecordPathRaw,
    "function",
    "node-build.ts must export revisionRecordPath(dir, unitId, runId): string",
  );
  return revisionRecordPathRaw as RevisionRecordPathFn;
}
function mustGetWriteRevisionRecord(): WriteRevisionRecordFn {
  assert.equal(
    typeof writeRevisionRecordRaw,
    "function",
    "node-build.ts must export writeRevisionRecord(dir, unitId, runId, result)",
  );
  return writeRevisionRecordRaw as WriteRevisionRecordFn;
}
function mustGetParseTestRevision(): ParseTestRevisionFn {
  assert.equal(
    typeof parseTestRevisionRaw,
    "function",
    "node-build.ts must export parseTestRevision(input, unitId)",
  );
  return parseTestRevisionRaw as ParseTestRevisionFn;
}
function mustGetReadTestRevision(): ReadTestRevisionFn {
  assert.equal(
    typeof readTestRevisionRaw,
    "function",
    "node-build.ts must export readTestRevision(dir, unitId, runId)",
  );
  return readTestRevisionRaw as ReadTestRevisionFn;
}

// ── Fixtures: six real `proveUnit` walks, built once ────────────────────────────────────────────

interface Fixtures {
  authorEscalation: ScenarioResult;
  implementEscalationRed: ScenarioResult;
  plainPass: ScenarioResult;
  overruledPass: ScenarioResult;
  overruledGateRefusal: ScenarioResult;
  plainFailure: ScenarioResult;
}

let fixtures!: Fixtures;
let tmpRoot!: string;

before(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "node-build-revision-record-root-"));

  const implementEscalation: AuthoringEscalation = {
    phase: "IMPLEMENT",
    kind: "unsatisfiable-test",
    statement: IMPLEMENT_STATEMENT,
    assertion: IMPLEMENT_ASSERTION,
  };

  // 1. AUTHOR_TEST escalation — ends the walk after exactly ONE spine observation. No failedObservation.
  const authorEscalation = await driveScenario({
    runId: "run-author-escalation",
    testId: "test-author-escalation",
    stdoutMarker: "AUTHOR_ESCALATION_STDOUT_MARKER",
    stderrMarker: "AUTHOR_ESCALATION_STDERR_MARKER",
    exitCodes: [0],
    author: scriptedAuthor({
      AUTHOR_TEST: {
        ok: false,
        error: "leaf declares the contract untestable",
        escalation: {
          phase: "AUTHOR_TEST",
          kind: "untestable-contract",
          statement: AUTHOR_TEST_STATEMENT,
        },
      },
    }),
  });

  // 2. IMPLEMENT escalation that STAYS RED — carries both `escalation` and `failedObservation`.
  const implementEscalationRed = await driveScenario({
    runId: "run-implement-escalation-red",
    testId: "test-implement-escalation-red",
    stdoutMarker: "IMPLEMENT_RED_STDOUT_MARKER",
    stderrMarker: "IMPLEMENT_RED_STDERR_MARKER",
    exitCodes: [1, 1],
    author: scriptedAuthor({
      AUTHOR_TEST: { ok: true },
      IMPLEMENT: {
        ok: false,
        error: "leaf declares the test unsatisfiable",
        escalation: implementEscalation,
      },
    }),
  });

  // 3. A plain PASS carrying neither key.
  const plainPass = await driveScenario({
    runId: "run-plain-pass",
    testId: "test-plain-pass",
    stdoutMarker: "PLAIN_PASS_STDOUT_MARKER",
    stderrMarker: "PLAIN_PASS_STDERR_MARKER",
    exitCodes: [1, 0],
    author: scriptedAuthor({}),
  });

  // 4a. The SAME IMPLEMENT escalation, OVERRULED by a green CONFIRM_GREEN — the PASS carries only
  //     `overruledEscalation`, never `escalation`.
  const overruledPass = await driveScenario({
    runId: "run-overruled-pass",
    testId: "test-overruled-pass",
    stdoutMarker: "OVERRULE_PASS_STDOUT_MARKER",
    stderrMarker: "OVERRULE_PASS_STDERR_MARKER",
    exitCodes: [1, 0],
    author: scriptedAuthor({
      AUTHOR_TEST: { ok: true },
      IMPLEMENT: {
        ok: false,
        error: "leaf declares the test unsatisfiable",
        escalation: implementEscalation,
      },
    }),
  });

  // 4b. The overrule surviving past CONFIRM_GREEN into a LATER GATE refusal (a dirty tree) — the
  //     FAILURE carries only `overruledEscalation`, never `escalation`.
  const overruledGateRefusal = await driveScenario({
    runId: "run-overruled-gate-refusal",
    testId: "test-overruled-gate-refusal",
    stdoutMarker: "OVERRULE_GATE_STDOUT_MARKER",
    stderrMarker: "OVERRULE_GATE_STDERR_MARKER",
    exitCodes: [1, 0],
    author: scriptedAuthor({
      AUTHOR_TEST: { ok: true },
      IMPLEMENT: {
        ok: false,
        error: "leaf declares the test unsatisfiable",
        escalation: implementEscalation,
      },
    }),
    tree: DIRTY_TREE,
  });

  // 5. A plain FAILURE (an ordinary "not red" CONFIRM_RED refusal) carrying neither key.
  const plainFailure = await driveScenario({
    runId: "run-plain-failure",
    testId: "test-plain-failure",
    stdoutMarker: "PLAIN_FAILURE_STDOUT_MARKER",
    stderrMarker: "PLAIN_FAILURE_STDERR_MARKER",
    exitCodes: [0],
    author: scriptedAuthor({}),
  });

  fixtures = {
    authorEscalation,
    implementEscalationRed,
    plainPass,
    overruledPass,
    overruledGateRefusal,
    plainFailure,
  };
});

after(async () => {
  const dirs = [tmpRoot, ...(fixtures === undefined ? [] : Object.values(fixtures).map((s) => s.dir))];
  await Promise.all(dirs.map((d) => fsp.rm(d, { recursive: true, force: true })));
});

/** JSON round-trips a value, matching what a fresh `fs.readFile` + `JSON.parse` would hand back. */
function toPlainJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

/** A valid serialized AUTHOR_TEST-kind record (no `failedObservation`), built from real fixture 1. */
function validAuthorTestRecord(): Record<string, unknown> {
  const result = fixtures.authorEscalation.result;
  assert.equal(result.ok, false, "ground truth: the authorEscalation fixture must be a failure");
  if (result.ok) throw new Error("unreachable");
  const escalation = result.escalation;
  assert.notEqual(escalation, undefined, "ground truth: the authorEscalation fixture must carry an escalation");
  return toPlainJson({ unitId: UNIT_ID, runId: "run-author-escalation", escalation });
}

/** A valid serialized IMPLEMENT-kind record (carrying `failedObservation`), built from real fixture 2. */
function validImplementRecord(): Record<string, unknown> {
  const result = fixtures.implementEscalationRed.result;
  assert.equal(result.ok, false, "ground truth: the implementEscalationRed fixture must be a failure");
  if (result.ok) throw new Error("unreachable");
  const escalation = result.escalation;
  const failedObservation = result.failedObservation;
  assert.notEqual(escalation, undefined, "ground truth: fixture 2 must carry an escalation");
  assert.notEqual(failedObservation, undefined, "ground truth: fixture 2 must carry a failedObservation");
  return toPlainJson({
    unitId: UNIT_ID,
    runId: "run-implement-escalation-red",
    escalation,
    failedObservation,
  });
}

// ── The contract ─────────────────────────────────────────────────────────────────────────────────

describe("a-returned-escalation-round-trips-through-its-revision-record: writes a failed REAL build's returned escalation to a per-user revision record, and reads it back as the test revision (or a refusal that says why)", () => {
  test("all six revision-record functions are published from node-build.ts", () => {
    assert.equal(typeof defaultEscalationsDirRaw, "function");
    assert.equal(typeof resolveEscalationsDirRaw, "function");
    assert.equal(typeof revisionRecordPathRaw, "function");
    assert.equal(typeof writeRevisionRecordRaw, "function");
    assert.equal(typeof parseTestRevisionRaw, "function");
    assert.equal(typeof readTestRevisionRaw, "function");
  });

  // ── defaultEscalationsDir / resolveEscalationsDir / revisionRecordPath ──────────────────────────

  test("defaultEscalationsDir returns the house per-user escalations state directory", () => {
    const defaultEscalationsDir = mustGetDefaultEscalationsDir();
    assert.equal(defaultEscalationsDir(), path.join(os.homedir(), ".storytree", "escalations"));
  });

  test("resolveEscalationsDir returns the given dir untouched, or the default when undefined", () => {
    const resolveEscalationsDir = mustGetResolveEscalationsDir();
    const defaultEscalationsDir = mustGetDefaultEscalationsDir();
    const explicit = path.join(tmpRoot, "explicit-escalations-dir");
    assert.equal(resolveEscalationsDir(explicit), explicit);
    assert.equal(resolveEscalationsDir(undefined), defaultEscalationsDir());
  });

  test("revisionRecordPath joins dir/unitId/runId.json", () => {
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "some-escalations-dir");
    assert.equal(revisionRecordPath(dir, "unit-a", "run-1"), path.join(dir, "unit-a", "run-1.json"));
  });

  // ── writeRevisionRecord ──────────────────────────────────────────────────────────────────────

  test("writeRevisionRecord returns null when dir is undefined, even for a returned escalation", async () => {
    const writeRevisionRecord = mustGetWriteRevisionRecord();
    const written = await writeRevisionRecord(
      undefined,
      UNIT_ID,
      "run-author-escalation",
      fixtures.authorEscalation.result,
    );
    assert.equal(written, null);
  });

  test("writeRevisionRecord returns null and creates no directory for a PASS carrying neither key", async () => {
    const writeRevisionRecord = mustGetWriteRevisionRecord();
    const dir = path.join(tmpRoot, "write-null-plain-pass");
    assert.equal(fixtures.plainPass.result.ok, true, "ground truth");
    const written = await writeRevisionRecord(dir, UNIT_ID, "run-plain-pass", fixtures.plainPass.result);
    assert.equal(written, null);
    assert.equal(existsSync(dir), false, "returning null must create no directory");
  });

  test("writeRevisionRecord returns null and creates no directory for a PASS carrying only overruledEscalation", async () => {
    const writeRevisionRecord = mustGetWriteRevisionRecord();
    const dir = path.join(tmpRoot, "write-null-overruled-pass");
    assert.equal(fixtures.overruledPass.result.ok, true, "ground truth");
    const written = await writeRevisionRecord(dir, UNIT_ID, "run-overruled-pass", fixtures.overruledPass.result);
    assert.equal(written, null);
    assert.equal(existsSync(dir), false);
  });

  test("writeRevisionRecord returns null and creates no directory for a FAILURE carrying only overruledEscalation", async () => {
    const writeRevisionRecord = mustGetWriteRevisionRecord();
    const dir = path.join(tmpRoot, "write-null-overruled-gate-refusal");
    assert.equal(fixtures.overruledGateRefusal.result.ok, false, "ground truth");
    const written = await writeRevisionRecord(
      dir,
      UNIT_ID,
      "run-overruled-gate-refusal",
      fixtures.overruledGateRefusal.result,
    );
    assert.equal(written, null);
    assert.equal(existsSync(dir), false);
  });

  test("writeRevisionRecord returns null and creates no directory for a plain FAILURE carrying neither key", async () => {
    const writeRevisionRecord = mustGetWriteRevisionRecord();
    const dir = path.join(tmpRoot, "write-null-plain-failure");
    assert.equal(fixtures.plainFailure.result.ok, false, "ground truth");
    const written = await writeRevisionRecord(dir, UNIT_ID, "run-plain-failure", fixtures.plainFailure.result);
    assert.equal(written, null);
    assert.equal(existsSync(dir), false);
  });

  test("writeRevisionRecord writes {unitId, runId, escalation} — creating missing parent directories — for a returned AUTHOR_TEST escalation carrying no failedObservation", async () => {
    const writeRevisionRecord = mustGetWriteRevisionRecord();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "nested", "missing", "parents", "escalations");
    assert.equal(existsSync(dir), false, "ground truth: the parent chain must not already exist");
    const result = fixtures.authorEscalation.result;
    assert.equal(result.ok, false, "ground truth");
    if (result.ok) return;
    assert.notEqual(result.escalation, undefined, "ground truth: fixture 1 must carry a returned escalation");

    const written = await writeRevisionRecord(dir, UNIT_ID, "run-author-escalation", result);
    const expectedPath = revisionRecordPath(dir, UNIT_ID, "run-author-escalation");
    assert.deepEqual(written, { written: true, path: expectedPath });

    const raw = await fsp.readFile(expectedPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.deepEqual(parsed, { unitId: UNIT_ID, runId: "run-author-escalation", escalation: result.escalation });
    assert.equal(
      "failedObservation" in parsed,
      false,
      "an AUTHOR_TEST-only escalation carries no top-level failedObservation",
    );
  });

  test("writeRevisionRecord writes {unitId, runId, escalation, failedObservation} for a returned IMPLEMENT escalation that stayed red", async () => {
    const writeRevisionRecord = mustGetWriteRevisionRecord();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "write-implement-escalation");
    const result = fixtures.implementEscalationRed.result;
    assert.equal(result.ok, false, "ground truth");
    if (result.ok) return;
    assert.notEqual(result.escalation, undefined, "ground truth");
    assert.notEqual(result.failedObservation, undefined, "ground truth");

    const written = await writeRevisionRecord(dir, UNIT_ID, "run-implement-escalation-red", result);
    const expectedPath = revisionRecordPath(dir, UNIT_ID, "run-implement-escalation-red");
    assert.deepEqual(written, { written: true, path: expectedPath });

    const raw = await fsp.readFile(expectedPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    assert.deepEqual(parsed, {
      unitId: UNIT_ID,
      runId: "run-implement-escalation-red",
      escalation: result.escalation,
      failedObservation: result.failedObservation,
    });
  });

  test("writeRevisionRecord never throws — a filesystem failure resolves to { written: false, path, reason }", async () => {
    const writeRevisionRecord = mustGetWriteRevisionRecord();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const blockingFile = path.join(tmpRoot, "blocking-file-for-write-failure");
    await fsp.writeFile(blockingFile, "not a directory", "utf8");
    const dir = path.join(blockingFile, "escalations"); // a FILE occupies where a directory must go
    const result = fixtures.authorEscalation.result;
    assert.equal(result.ok, false, "ground truth");
    if (result.ok) return;

    const written = await writeRevisionRecord(dir, UNIT_ID, "run-author-escalation", result);
    assert.notEqual(written, null, "a write failure must still resolve, not return null");
    if (written === null) return;
    assert.equal(written.written, false);
    assert.equal(written.path, revisionRecordPath(dir, UNIT_ID, "run-author-escalation"));
    if (written.written) return;
    assert.equal(typeof written.reason, "string");
    assert.ok(written.reason.length > 0, "the reason must say why");
  });

  // ── parseTestRevision ────────────────────────────────────────────────────────────────────────

  test("parseTestRevision accepts a valid AUTHOR_TEST-kind record, rebuilding the escalation via parseAuthoringEscalation", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const result = fixtures.authorEscalation.result;
    assert.equal(result.ok, false, "ground truth");
    if (result.ok) return;
    const record = validAuthorTestRecord();

    const parsed = parseTestRevision(record, UNIT_ID);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.revision.unitId, UNIT_ID);
    assert.equal(parsed.revision.runId, "run-author-escalation");
    assert.equal(parsed.revision.escalation.testId, result.escalation?.testId);
    assert.deepEqual(parsed.revision.escalation.raised, result.escalation?.raised);
    assert.deepEqual(parsed.revision.escalation.observation, result.escalation?.observation);
    assert.equal(parsed.revision.failedObservation, undefined);
  });

  test("parseTestRevision accepts a valid IMPLEMENT-kind record, carrying failedObservation and no escalation.observation", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const result = fixtures.implementEscalationRed.result;
    assert.equal(result.ok, false, "ground truth");
    if (result.ok) return;
    const record = validImplementRecord();

    const parsed = parseTestRevision(record, UNIT_ID);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.revision.unitId, UNIT_ID);
    assert.equal(parsed.revision.runId, "run-implement-escalation-red");
    assert.deepEqual(parsed.revision.escalation.raised, result.escalation?.raised);
    assert.equal(parsed.revision.escalation.observation, undefined);
    assert.deepEqual(parsed.revision.failedObservation, result.failedObservation);
  });

  test("parseTestRevision rebuilds the raised escalation through parseAuthoringEscalation, dropping any extra field the stored object carries", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const record = validAuthorTestRecord();
    const escalation = record.escalation as Record<string, unknown>;
    const raised = escalation.raised as Record<string, unknown>;
    const withExtraField = {
      ...record,
      escalation: { ...escalation, raised: { ...raised, unexpectedField: "should be dropped" } },
    };

    const parsed = parseTestRevision(withExtraField, UNIT_ID);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(
      Object.prototype.hasOwnProperty.call(parsed.revision.escalation.raised, "unexpectedField"),
      false,
      "the rebuilt escalation must come from parseAuthoringEscalation, not a pass-through of the stored object",
    );
    const rebuilt = parseAuthoringEscalation("AUTHOR_TEST", raised);
    assert.equal(rebuilt.ok, true);
    if (!rebuilt.ok) return;
    assert.deepEqual(parsed.revision.escalation.raised, rebuilt.escalation);
  });

  test("parseTestRevision refuses a non-object input", () => {
    const parseTestRevision = mustGetParseTestRevision();
    for (const bad of [null, "a string", 42, undefined, true] as unknown[]) {
      const parsed = parseTestRevision(bad, UNIT_ID);
      assert.equal(parsed.ok, false, `expected a refusal for ${JSON.stringify(bad)}`);
      if (parsed.ok) continue;
      assert.equal(typeof parsed.reason, "string");
      assert.ok(parsed.reason.length > 0);
    }
  });

  test("parseTestRevision refuses a unitId other than the expected one, naming both ids", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const record = { ...validAuthorTestRecord(), unitId: "a-different-unit" };
    const parsed = parseTestRevision(record, UNIT_ID);
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.match(parsed.reason, new RegExp(escapeRegExp("a-different-unit")));
    assert.match(parsed.reason, new RegExp(escapeRegExp(UNIT_ID)));
  });

  test("parseTestRevision refuses a blank or non-string runId", () => {
    const parseTestRevision = mustGetParseTestRevision();
    for (const badRunId of ["", "   ", 123, null] as unknown[]) {
      const record = { ...validAuthorTestRecord(), runId: badRunId };
      const parsed = parseTestRevision(record, UNIT_ID);
      assert.equal(parsed.ok, false, `expected a refusal for runId ${JSON.stringify(badRunId)}`);
    }
  });

  test("parseTestRevision refuses a blank escalation.testId", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const record = validAuthorTestRecord();
    const escalation = record.escalation as Record<string, unknown>;
    const bad = { ...record, escalation: { ...escalation, testId: "" } };
    const parsed = parseTestRevision(bad, UNIT_ID);
    assert.equal(parsed.ok, false);
  });

  test("parseTestRevision refuses a declared phase other than AUTHOR_TEST or IMPLEMENT", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const record = validAuthorTestRecord();
    const escalation = record.escalation as Record<string, unknown>;
    const raised = escalation.raised as Record<string, unknown>;
    const bad = { ...record, escalation: { ...escalation, raised: { ...raised, phase: "GATE" } } };
    const parsed = parseTestRevision(bad, UNIT_ID);
    assert.equal(parsed.ok, false);
  });

  test("parseTestRevision refuses a raised escalation that parseAuthoringEscalation itself refuses (a blank statement)", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const record = validAuthorTestRecord();
    const escalation = record.escalation as Record<string, unknown>;
    const raised = escalation.raised as Record<string, unknown>;
    const bad = { ...record, escalation: { ...escalation, raised: { ...raised, statement: "   " } } };
    const parsed = parseTestRevision(bad, UNIT_ID);
    assert.equal(parsed.ok, false);
  });

  test("parseTestRevision refuses an IMPLEMENT record whose raised escalation carries no assertion", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const record = validImplementRecord();
    const escalation = record.escalation as Record<string, unknown>;
    const raised = escalation.raised as { phase: unknown; kind: unknown; statement: unknown };
    const raisedWithoutAssertion = { phase: raised.phase, kind: raised.kind, statement: raised.statement };
    const bad = { ...record, escalation: { ...escalation, raised: raisedWithoutAssertion } };
    const parsed = parseTestRevision(bad, UNIT_ID);
    assert.equal(parsed.ok, false);
  });

  test("parseTestRevision refuses a raised.kind other than the kind that phase produces", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const record = validAuthorTestRecord();
    const escalation = record.escalation as Record<string, unknown>;
    const raised = escalation.raised as Record<string, unknown>;
    const bad = {
      ...record,
      escalation: { ...escalation, raised: { ...raised, kind: "unsatisfiable-test" } },
    };
    const parsed = parseTestRevision(bad, UNIT_ID);
    assert.equal(parsed.ok, false);
  });

  test("parseTestRevision refuses an IMPLEMENT record carrying escalation.observation", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const record = validImplementRecord();
    const escalation = record.escalation as Record<string, unknown>;
    const bad = {
      ...record,
      escalation: { ...escalation, observation: { stdout: "x", stderr: "y", exitCode: 0 } },
    };
    const parsed = parseTestRevision(bad, UNIT_ID);
    assert.equal(parsed.ok, false);
  });

  test("parseTestRevision refuses an AUTHOR_TEST record carrying failedObservation", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const record = {
      ...validAuthorTestRecord(),
      failedObservation: { stdout: "x", stderr: "y", exitCode: 0 },
    };
    const parsed = parseTestRevision(record, UNIT_ID);
    assert.equal(parsed.ok, false);
  });

  test("parseTestRevision refuses an observation that is not { stdout: string; stderr: string; exitCode: number | null }", () => {
    const parseTestRevision = mustGetParseTestRevision();

    const authorRecord = validAuthorTestRecord();
    const authorEscalation = authorRecord.escalation as Record<string, unknown>;
    const badObservationRecord = {
      ...authorRecord,
      escalation: { ...authorEscalation, observation: { stdout: 123, stderr: "y", exitCode: 0 } },
    };
    assert.equal(parseTestRevision(badObservationRecord, UNIT_ID).ok, false);

    const implementRecord = validImplementRecord();
    const badFailedObservationRecord = {
      ...implementRecord,
      failedObservation: { stdout: "x", stderr: "y", exitCode: "0" },
    };
    assert.equal(parseTestRevision(badFailedObservationRecord, UNIT_ID).ok, false);
  });

  // ── readTestRevision ─────────────────────────────────────────────────────────────────────────

  test("readTestRevision returns { ok: true, revision: undefined } for an undefined runId, without refusing", () => {
    const readTestRevision = mustGetReadTestRevision();
    const dir = path.join(tmpRoot, "read-undefined-run-id");
    const result = readTestRevision(dir, UNIT_ID, undefined);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.revision, undefined);
  });

  test("readTestRevision refuses a runId that is not a single path segment, before touching the filesystem", () => {
    const readTestRevision = mustGetReadTestRevision();
    const dir = path.join(tmpRoot, "read-invalid-run-id-dir");
    assert.equal(existsSync(dir), false, "ground truth: the dir must not exist yet");
    for (const badRunId of ["", "foo/bar", "foo\\bar", ".", ".."]) {
      const result = readTestRevision(dir, UNIT_ID, badRunId);
      assert.equal(result.ok, false, `expected a refusal for runId ${JSON.stringify(badRunId)}`);
      if (result.ok) continue;
      assert.equal(typeof result.reason, "string");
      assert.ok(result.reason.length > 0, "the reason must say why");
      if (badRunId !== "") {
        assert.match(
          result.reason,
          new RegExp(escapeRegExp(badRunId)),
          "the reason should name the offending run id",
        );
      }
    }
    assert.equal(existsSync(dir), false, "refusing an invalid run id must never touch the filesystem");
  });

  test("readTestRevision refuses a missing record file, naming the path it looked at", () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "read-missing-file-dir");
    const result = readTestRevision(dir, UNIT_ID, "nonexistent-run");
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(
      result.reason,
      new RegExp(escapeRegExp(revisionRecordPath(dir, UNIT_ID, "nonexistent-run"))),
    );
  });

  test("readTestRevision refuses a record file that is not valid JSON", async () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "read-invalid-json-dir");
    const filePath = revisionRecordPath(dir, UNIT_ID, "bad-json-run");
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, "{ this is not json", "utf8");
    const result = readTestRevision(dir, UNIT_ID, "bad-json-run");
    assert.equal(result.ok, false);
  });

  test("readTestRevision passes a parse refusal through — a stored record naming a different unitId", async () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "read-parse-refusal-dir");
    const runId = "run-parse-refusal";
    const filePath = revisionRecordPath(dir, UNIT_ID, runId);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const record = { ...validAuthorTestRecord(), runId, unitId: "a-different-unit" };
    await fsp.writeFile(filePath, JSON.stringify(record), "utf8");

    const result = readTestRevision(dir, UNIT_ID, runId);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, new RegExp(escapeRegExp("a-different-unit")));
    assert.match(result.reason, new RegExp(escapeRegExp(UNIT_ID)));
  });

  test("readTestRevision refuses a record whose stored runId does not match the run id asked for, naming both", async () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "read-run-id-mismatch-dir");
    const askedForRunId = "run-asked-for";
    const filePath = revisionRecordPath(dir, UNIT_ID, askedForRunId);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const record = { ...validAuthorTestRecord(), runId: "run-originally-written-under" };
    await fsp.writeFile(filePath, JSON.stringify(record), "utf8");

    const result = readTestRevision(dir, UNIT_ID, askedForRunId);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, new RegExp(escapeRegExp(askedForRunId)));
    assert.match(result.reason, new RegExp(escapeRegExp("run-originally-written-under")));
  });

  test("readTestRevision reads a genuinely written record back as { ok: true, revision } matching the escalation exactly", async () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "read-success-dir");
    const runId = "run-implement-escalation-red";
    const filePath = revisionRecordPath(dir, UNIT_ID, runId);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const record = validImplementRecord();
    await fsp.writeFile(filePath, JSON.stringify(record), "utf8");

    const result = readTestRevision(dir, UNIT_ID, runId);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const revision = result.revision;
    assert.notEqual(revision, undefined);
    if (revision === undefined) return;
    assert.equal(revision.unitId, UNIT_ID);
    assert.equal(revision.runId, runId);
    const storedEscalation = record.escalation as Record<string, unknown>;
    assert.deepEqual(revision.escalation.raised, storedEscalation.raised);
    assert.deepEqual(revision.failedObservation, record.failedObservation);
  });

  // ── The full round trip ──────────────────────────────────────────────────────────────────────

  test("a-returned-escalation-round-trips-through-its-revision-record: writeRevisionRecord then readTestRevision round-trips a failed REAL build's returned escalation to the same test revision, or refuses and says why", async () => {
    const writeRevisionRecord = mustGetWriteRevisionRecord();
    const readTestRevision = mustGetReadTestRevision();
    const dir = path.join(tmpRoot, "round-trip-dir");
    const runId = "run-implement-escalation-red";
    const result = fixtures.implementEscalationRed.result;
    assert.equal(result.ok, false, "ground truth: this fixture must be a failure");
    if (result.ok) return;
    assert.notEqual(result.escalation, undefined, "ground truth: this fixture must be a returned escalation");

    const written = await writeRevisionRecord(dir, UNIT_ID, runId, result);
    assert.notEqual(written, null);
    if (written === null) return;
    assert.equal(written.written, true);

    const readBack = readTestRevision(dir, UNIT_ID, runId);
    assert.equal(readBack.ok, true);
    if (!readBack.ok) return;
    const revision = readBack.revision;
    assert.notEqual(revision, undefined, "reading back a genuinely written record must not be absent");
    if (revision === undefined) return;

    assert.equal(revision.unitId, UNIT_ID);
    assert.equal(revision.runId, runId);
    assert.deepEqual(revision.escalation.raised, result.escalation?.raised);
    assert.equal(revision.escalation.testId, result.escalation?.testId);
    assert.deepEqual(revision.failedObservation, result.failedObservation);

    // "or a refusal that says why" — reading for a DIFFERENT unit than the one this record was
    // written under must refuse rather than silently hand back someone else's revision.
    const wrongUnit = readTestRevision(dir, "a-completely-different-unit", runId);
    assert.equal(wrongUnit.ok, false);
    if (wrongUnit.ok) return;
    assert.equal(typeof wrongUnit.reason, "string");
    assert.ok(wrongUnit.reason.length > 0);
  });

  // ── Exact refusals and exact shapes: each case below is one the weakened reader answers differently ──

  /** Asserts `outcome` is a refusal and returns its reason, so a case can pin the reason exactly. */
  function mustRefuse(outcome: ParseTestRevisionOutcome | ReadTestRevisionOutcome, label: string): string {
    assert.equal(outcome.ok, false, `expected a refusal: ${label}`);
    if (outcome.ok) throw new Error(`unreachable: ${label}`);
    return outcome.reason;
  }

  /** Asserts `outcome` is an acceptance and returns its revision; a refusal fails naming its reason. */
  function mustAcceptParse(outcome: ParseTestRevisionOutcome, label: string): TestRevision {
    if (!outcome.ok) assert.fail(`expected an acceptance: ${label} — refused: ${outcome.reason}`);
    return outcome.revision;
  }

  /** A copy of `record` whose `escalation` carries `patch` over its own fields. */
  function withEscalationFields(record: Record<string, unknown>, patch: Record<string, unknown>) {
    const escalation = record.escalation as Record<string, unknown>;
    return { ...record, escalation: { ...escalation, ...patch } };
  }

  /** A copy of `record` whose `escalation.raised` carries `patch` over its own fields. */
  function withRaisedFields(record: Record<string, unknown>, patch: Record<string, unknown>) {
    const escalation = record.escalation as Record<string, unknown>;
    const raised = escalation.raised as Record<string, unknown>;
    return { ...record, escalation: { ...escalation, raised: { ...raised, ...patch } } };
  }

  test("parseTestRevision refuses every non-object input — null, a string, a number, undefined, a boolean, an array — with the exact object-shape reason", () => {
    const parseTestRevision = mustGetParseTestRevision();
    for (const bad of [null, "a string", 42, undefined, true, [], [validAuthorTestRecord()]]) {
      assert.equal(
        mustRefuse(parseTestRevision(bad, UNIT_ID), `input ${String(JSON.stringify(bad))}`),
        "a test revision record must be an object",
      );
    }
  });

  test("parseTestRevision's unitId refusal names the stored id and the expected id, exactly", () => {
    const parseTestRevision = mustGetParseTestRevision();
    assert.equal(
      mustRefuse(parseTestRevision({ ...validAuthorTestRecord(), unitId: "a-different-unit" }, UNIT_ID), "a different unitId"),
      `a test revision record's unitId "a-different-unit" does not match the expected unitId "${UNIT_ID}"`,
    );
  });

  test("parseTestRevision's runId refusal is exact for a blank, a whitespace-only, a non-string, a null and a missing runId", () => {
    const parseTestRevision = mustGetParseTestRevision();
    for (const badRunId of ["", "   ", 123, null, undefined]) {
      assert.equal(
        mustRefuse(parseTestRevision({ ...validAuthorTestRecord(), runId: badRunId }, UNIT_ID), `runId ${String(badRunId)}`),
        "a test revision record's runId must be a non-blank string",
      );
    }
  });

  test("parseTestRevision refuses an escalation that is not an object — null, missing, a string, a number, an array — with the exact escalation-shape reason", () => {
    const parseTestRevision = mustGetParseTestRevision();
    for (const badEscalation of [null, undefined, "an escalation", 7, []]) {
      assert.equal(
        mustRefuse(
          parseTestRevision({ ...validAuthorTestRecord(), escalation: badEscalation }, UNIT_ID),
          `escalation ${String(JSON.stringify(badEscalation))}`,
        ),
        "a test revision record's escalation must be an object",
      );
    }
  });

  test("parseTestRevision's escalation.testId refusal is exact for a blank, a whitespace-only, a non-string, a null and a missing testId", () => {
    const parseTestRevision = mustGetParseTestRevision();
    for (const badTestId of ["", "   ", 42, null, undefined]) {
      assert.equal(
        mustRefuse(
          parseTestRevision(withEscalationFields(validAuthorTestRecord(), { testId: badTestId }), UNIT_ID),
          `testId ${String(badTestId)}`,
        ),
        "a test revision record's escalation.testId must be a non-blank string",
      );
    }
  });

  test("parseTestRevision refuses an escalation.raised that is not an object — null, missing, a string, a number, an array — with the exact raised-shape reason", () => {
    const parseTestRevision = mustGetParseTestRevision();
    for (const badRaised of [null, undefined, "raised", 3, []]) {
      assert.equal(
        mustRefuse(
          parseTestRevision(withEscalationFields(validAuthorTestRecord(), { raised: badRaised }), UNIT_ID),
          `raised ${String(JSON.stringify(badRaised))}`,
        ),
        "a test revision record's escalation.raised must be an object",
      );
    }
  });

  test("parseTestRevision's declared-phase refusal names the phase exactly, and refuses a GATE phase even where the kind, statement and assertion would otherwise satisfy an IMPLEMENT escalation", () => {
    const parseTestRevision = mustGetParseTestRevision();
    // On the AUTHOR_TEST record a phase-blind reader would reach the KIND check and refuse there instead.
    assert.equal(
      mustRefuse(parseTestRevision(withRaisedFields(validAuthorTestRecord(), { phase: "GATE" }), UNIT_ID), "GATE on AUTHOR_TEST"),
      `a test revision record's declared phase "GATE" must be AUTHOR_TEST or IMPLEMENT`,
    );
    // On the IMPLEMENT record the kind is "unsatisfiable-test" and an assertion is present, so a phase-blind
    // reader would ACCEPT it outright.
    assert.equal(
      mustRefuse(parseTestRevision(withRaisedFields(validImplementRecord(), { phase: "GATE" }), UNIT_ID), "GATE on IMPLEMENT"),
      `a test revision record's declared phase "GATE" must be AUTHOR_TEST or IMPLEMENT`,
    );
    for (const badPhase of [undefined, 42, "implement", "author_test", ""]) {
      assert.equal(
        mustRefuse(
          parseTestRevision(withRaisedFields(validImplementRecord(), { phase: badPhase }), UNIT_ID),
          `phase ${String(badPhase)}`,
        ),
        `a test revision record's declared phase "${String(badPhase)}" must be AUTHOR_TEST or IMPLEMENT`,
      );
    }
  });

  test("parseTestRevision's kind refusal names the phase, the kind that phase produces and the stored kind, exactly — for both phases", () => {
    const parseTestRevision = mustGetParseTestRevision();
    assert.equal(
      mustRefuse(
        parseTestRevision(withRaisedFields(validAuthorTestRecord(), { kind: "unsatisfiable-test" }), UNIT_ID),
        "AUTHOR_TEST with the IMPLEMENT kind",
      ),
      `a AUTHOR_TEST escalation's kind must be "untestable-contract", not "unsatisfiable-test"`,
    );
    assert.equal(
      mustRefuse(
        parseTestRevision(withRaisedFields(validImplementRecord(), { kind: "untestable-contract" }), UNIT_ID),
        "IMPLEMENT with the AUTHOR_TEST kind",
      ),
      `a IMPLEMENT escalation's kind must be "unsatisfiable-test", not "untestable-contract"`,
    );
    assert.equal(
      mustRefuse(parseTestRevision(withRaisedFields(validImplementRecord(), { kind: undefined }), UNIT_ID), "IMPLEMENT with no kind"),
      `a IMPLEMENT escalation's kind must be "unsatisfiable-test", not "undefined"`,
    );
  });

  test("parseTestRevision hands parseAuthoringEscalation's own refusal reason through unchanged", () => {
    const parseTestRevision = mustGetParseTestRevision();

    const authorRecord = validAuthorTestRecord();
    const authorEscalation = authorRecord.escalation as Record<string, unknown>;
    const blankStatement = { ...(authorEscalation.raised as Record<string, unknown>), statement: "   " };
    const blankRefusal = parseAuthoringEscalation("AUTHOR_TEST", blankStatement);
    assert.equal(blankRefusal.ok, false, "ground truth: parseAuthoringEscalation refuses a blank statement");
    if (blankRefusal.ok) return;
    assert.equal(
      mustRefuse(
        parseTestRevision({ ...authorRecord, escalation: { ...authorEscalation, raised: blankStatement } }, UNIT_ID),
        "a blank statement",
      ),
      blankRefusal.reason,
    );

    const implementRecord = validImplementRecord();
    const implementEscalation = implementRecord.escalation as Record<string, unknown>;
    const implementRaised = implementEscalation.raised as Record<string, unknown>;
    const noAssertion = { phase: implementRaised.phase, kind: implementRaised.kind, statement: implementRaised.statement };
    const noAssertionRefusal = parseAuthoringEscalation("IMPLEMENT", noAssertion);
    assert.equal(noAssertionRefusal.ok, false, "ground truth: parseAuthoringEscalation refuses an IMPLEMENT escalation with no assertion");
    if (noAssertionRefusal.ok) return;
    assert.equal(
      mustRefuse(
        parseTestRevision({ ...implementRecord, escalation: { ...implementEscalation, raised: noAssertion } }, UNIT_ID),
        "an IMPLEMENT escalation with no assertion",
      ),
      noAssertionRefusal.reason,
    );
  });

  test("parseTestRevision's cross-phase refusals are exact — an IMPLEMENT record carrying escalation.observation, an AUTHOR_TEST record carrying failedObservation — whether the carried observation is well-formed, malformed or null", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const carried = [
      { stdout: "x", stderr: "y", exitCode: 0 },
      { stdout: 1, stderr: 2, exitCode: "3" },
      null,
    ];
    for (const observation of carried) {
      assert.equal(
        mustRefuse(
          parseTestRevision(withEscalationFields(validImplementRecord(), { observation }), UNIT_ID),
          `IMPLEMENT carrying observation ${JSON.stringify(observation)}`,
        ),
        "an IMPLEMENT-kind escalation must not carry escalation.observation",
      );
      assert.equal(
        mustRefuse(
          parseTestRevision({ ...validAuthorTestRecord(), failedObservation: observation }, UNIT_ID),
          `AUTHOR_TEST carrying failedObservation ${JSON.stringify(observation)}`,
        ),
        "an AUTHOR_TEST-kind record must not carry a top-level failedObservation",
      );
    }
  });

  test("parseTestRevision refuses a malformed observation with its exact reason — null, a string, a number, an array, a non-string stdout, a non-string stderr, a non-number exitCode, a missing exitCode — for both escalation.observation and failedObservation", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const malformed = [
      null,
      "an observation",
      0,
      [],
      { stdout: 123, stderr: "y", exitCode: 0 },
      { stdout: "x", stderr: 42, exitCode: 0 },
      { stdout: "x", stderr: "y", exitCode: "0" },
      { stdout: "x", stderr: "y" },
    ];
    for (const observation of malformed) {
      assert.equal(
        mustRefuse(
          parseTestRevision(withEscalationFields(validAuthorTestRecord(), { observation }), UNIT_ID),
          `escalation.observation ${JSON.stringify(observation)}`,
        ),
        "escalation.observation must be { stdout: string; stderr: string; exitCode: number | null }",
      );
      assert.equal(
        mustRefuse(
          parseTestRevision({ ...validImplementRecord(), failedObservation: observation }, UNIT_ID),
          `failedObservation ${JSON.stringify(observation)}`,
        ),
        "failedObservation must be { stdout: string; stderr: string; exitCode: number | null }",
      );
    }
  });

  test("parseTestRevision accepts an observation whose exitCode is null (a signalled child) and hands it back unchanged, for both escalation.observation and failedObservation", () => {
    const parseTestRevision = mustGetParseTestRevision();
    const signalled = { stdout: "partial stdout", stderr: "terminated by a signal", exitCode: null };

    const author = mustAcceptParse(
      parseTestRevision(withEscalationFields(validAuthorTestRecord(), { observation: signalled }), UNIT_ID),
      "an AUTHOR_TEST record whose observation has a null exitCode",
    );
    assert.deepEqual(author.escalation.observation, signalled);

    const implement = mustAcceptParse(
      parseTestRevision({ ...validImplementRecord(), failedObservation: signalled }, UNIT_ID),
      "an IMPLEMENT record whose failedObservation has a null exitCode",
    );
    assert.deepEqual(implement.failedObservation, signalled);
  });

  test("parseTestRevision hands back exactly the keys the record carries — the AUTHOR_TEST observation deep-equal, no failedObservation key without one, no escalation.observation key without one", () => {
    const parseTestRevision = mustGetParseTestRevision();

    const authorResult = fixtures.authorEscalation.result;
    assert.equal(authorResult.ok, false, "ground truth");
    if (authorResult.ok) return;
    const authorEscalation = authorResult.escalation;
    assert.notEqual(authorEscalation, undefined, "ground truth: fixture 1 carries a returned escalation");
    if (authorEscalation === undefined) return;
    assert.notEqual(authorEscalation.observation, undefined, "ground truth: fixture 1's escalation carries its one spine observation");

    const author = mustAcceptParse(parseTestRevision(validAuthorTestRecord(), UNIT_ID), "the AUTHOR_TEST record");
    assert.deepEqual(author, {
      unitId: UNIT_ID,
      runId: "run-author-escalation",
      escalation: {
        raised: authorEscalation.raised,
        testId: authorEscalation.testId,
        observation: authorEscalation.observation,
      },
    });
    assert.deepEqual(Object.keys(author).sort(), ["escalation", "runId", "unitId"]);
    assert.equal("failedObservation" in author, false, "an AUTHOR_TEST revision carries no failedObservation key at all");
    assert.deepEqual(Object.keys(author.escalation).sort(), ["observation", "raised", "testId"]);

    const implementResult = fixtures.implementEscalationRed.result;
    assert.equal(implementResult.ok, false, "ground truth");
    if (implementResult.ok) return;
    const implementEscalation = implementResult.escalation;
    assert.notEqual(implementEscalation, undefined, "ground truth: fixture 2 carries a returned escalation");
    if (implementEscalation === undefined) return;

    const implement = mustAcceptParse(parseTestRevision(validImplementRecord(), UNIT_ID), "the IMPLEMENT record");
    assert.deepEqual(implement, {
      unitId: UNIT_ID,
      runId: "run-implement-escalation-red",
      escalation: { raised: implementEscalation.raised, testId: implementEscalation.testId },
      failedObservation: implementResult.failedObservation,
    });
    assert.deepEqual(Object.keys(implement.escalation).sort(), ["raised", "testId"]);
    assert.equal("observation" in implement.escalation, false, "an IMPLEMENT escalation carries no observation key at all");

    const stored = validImplementRecord();
    const bare = mustAcceptParse(
      parseTestRevision({ unitId: stored.unitId, runId: stored.runId, escalation: stored.escalation }, UNIT_ID),
      "an IMPLEMENT record storing no failedObservation",
    );
    assert.deepEqual(Object.keys(bare).sort(), ["escalation", "runId", "unitId"]);
    assert.equal("failedObservation" in bare, false, "no failedObservation stored means no failedObservation key read back");
  });

  test("readTestRevision refuses a runId that is not a single path segment even when a record naming that very runId sits at the path it would resolve to, with the exact reason", async () => {
    const readTestRevision = mustGetReadTestRevision();
    const parseTestRevision = mustGetParseTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const backslash = String.fromCharCode(92);
    for (const [index, badRunId] of ["", ".", "..", "foo/bar", `foo${backslash}bar`].entries()) {
      // Planted through revisionRecordPath itself, so the record sits exactly where a guard-skipping read
      // would look on THIS platform (a backslash is a separator on Windows and a filename character on Linux).
      const dir = path.join(tmpRoot, `read-planted-invalid-run-id-${index}`);
      const plantedPath = revisionRecordPath(dir, UNIT_ID, badRunId);
      await fsp.mkdir(path.dirname(plantedPath), { recursive: true });
      await fsp.writeFile(plantedPath, JSON.stringify({ ...validImplementRecord(), runId: badRunId }), "utf8");
      assert.equal(existsSync(plantedPath), true, `ground truth: a record is planted where runId ${JSON.stringify(badRunId)} resolves`);
      // Non-vacuity: every planted record but the blank one would PARSE, so a read that skipped the guard
      // would hand it back rather than refuse.
      const planted = parseTestRevision(JSON.parse(await fsp.readFile(plantedPath, "utf8")), UNIT_ID);
      assert.equal(planted.ok, badRunId.length > 0, `ground truth: the record planted for ${JSON.stringify(badRunId)}`);

      assert.equal(
        mustRefuse(readTestRevision(dir, UNIT_ID, badRunId), `runId ${JSON.stringify(badRunId)}`),
        `runId "${badRunId}" is not a single path segment — it must name one run, not a path`,
      );
    }
  });

  test("readTestRevision accepts a single-segment runId that merely contains dots", async () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    for (const [index, runId] of ["run.1", "..run"].entries()) {
      const dir = path.join(tmpRoot, `read-dotted-run-id-${index}`);
      const filePath = revisionRecordPath(dir, UNIT_ID, runId);
      assert.equal(path.dirname(filePath), path.join(dir, UNIT_ID), "ground truth: a dotted single segment stays in the unit's directory");
      await fsp.mkdir(path.dirname(filePath), { recursive: true });
      await fsp.writeFile(filePath, JSON.stringify({ ...validImplementRecord(), runId }), "utf8");

      const result = readTestRevision(dir, UNIT_ID, runId);
      assert.equal(result.ok, true, `expected runId ${JSON.stringify(runId)} to be read back`);
      if (!result.ok) continue;
      assert.equal(result.revision?.runId, runId);
    }
  });

  test("readTestRevision's missing-record refusal is exactly `no revision record found at <path>`", () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "read-missing-file-exact-dir");
    assert.equal(
      mustRefuse(readTestRevision(dir, UNIT_ID, "nonexistent-run"), "a missing record"),
      `no revision record found at ${revisionRecordPath(dir, UNIT_ID, "nonexistent-run")}`,
    );
  });

  test("readTestRevision refuses a record path that exists but cannot be read (a directory stands where the file should be), naming the path before the filesystem's own message", async () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "read-unreadable-record-dir");
    const runId = "run-unreadable";
    const filePath = revisionRecordPath(dir, UNIT_ID, runId);
    await fsp.mkdir(filePath, { recursive: true });
    assert.equal(existsSync(filePath), true, "ground truth: something exists at the record path, so the read itself is what fails");

    const reason = mustRefuse(readTestRevision(dir, UNIT_ID, runId), "a directory at the record path");
    const prefix = `could not read the revision record at ${filePath}: `;
    assert.ok(reason.startsWith(prefix), `expected the reason to start ${JSON.stringify(prefix)}, got ${JSON.stringify(reason)}`);
    assert.ok(reason.length > prefix.length, "the reason must carry the filesystem's own message after the path");
  });

  test("readTestRevision's invalid-JSON refusal names the path and then carries the parser's own message", async () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "read-invalid-json-exact-dir");
    const runId = "bad-json-run";
    const filePath = revisionRecordPath(dir, UNIT_ID, runId);
    const content = "{ this is not json";
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, content, "utf8");

    const reason = mustRefuse(readTestRevision(dir, UNIT_ID, runId), "invalid JSON");
    const prefix = `the revision record at ${filePath} is not valid JSON: `;
    assert.ok(reason.startsWith(prefix), `expected the reason to start ${JSON.stringify(prefix)}, got ${JSON.stringify(reason)}`);
    let parserMessage = "";
    try {
      JSON.parse(content);
    } catch (e) {
      parserMessage = (e as Error).message;
    }
    assert.ok(parserMessage.length > 0, "ground truth: the content really is invalid JSON");
    assert.equal(reason, `${prefix}${parserMessage}`);
  });

  test("readTestRevision's run-id-mismatch refusal names the path, the stored runId and the requested runId, exactly", async () => {
    const readTestRevision = mustGetReadTestRevision();
    const revisionRecordPath = mustGetRevisionRecordPath();
    const dir = path.join(tmpRoot, "read-run-id-mismatch-exact-dir");
    const askedFor = "run-asked-for";
    const filePath = revisionRecordPath(dir, UNIT_ID, askedFor);
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, JSON.stringify({ ...validAuthorTestRecord(), runId: "run-originally-written-under" }), "utf8");

    assert.equal(
      mustRefuse(readTestRevision(dir, UNIT_ID, askedFor), "a run id mismatch"),
      `the revision record at ${filePath} was written under runId "run-originally-written-under", ` +
        `not the requested runId "run-asked-for"`,
    );
  });
});
