import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";
import { ShellTestExecutor, proveUnit } from "@storytree/orchestrator";
import type { ProveResult, ProveSpec, TreeState } from "@storytree/orchestrator";
import type {
  AuthoringEscalation,
  AuthoringPhase,
  AuthorResult,
  PhaseAuthor,
} from "@storytree/agent";

// The module is imported as a NAMESPACE (`import * as`), never by name: `renderEscalation` does not
// exist on `node-build.ts` yet, and a named import of a symbol the module does not (yet) provide
// would fail to LINK at all — a structural red, the wrong kind for this `editsExisting` contract
// (ADR-0057 C declares `assertion`). Every assertion below is a genuine runtime assertion failure:
// first that the function is published at all, then — once it is — that it renders exactly what
// `node-build-escalation-envelope`'s Contract 1 requires.
import * as NodeBuildModule from "./node-build.js";

/**
 * `node-build-renders-the-returned-escalation-with-its-test-id` (ADR-0569 D5): the same-file
 * production renderer `renderEscalation(unitId, runId, result)` must render, for a returned
 * `escalation`/`overruledEscalation` record, a labelled block naming the raising phase, the unit,
 * run and test id, the statement (and IMPLEMENT's assertion) verbatim, an AUTHOR_TEST record's own
 * single spine observation (never mislabelled as a CONFIRM run), the orchestrator's two options
 * line, and — for an overrule — exactly one labelled line — and `[]` for a result carrying neither
 * key. Rendering must never spawn a command.
 *
 * Every `ProveResult` fed to the renderer below is PRODUCTION output: a real `proveUnit` walk over a
 * real `ShellTestExecutor` whose spawned child commands each append one marker byte to a temp file
 * (so a spawn is independently observable) — never a hand-built `ProveResult` literal and never a
 * recording/offline double.
 */

const UNIT_ID = "node-build-escalation-envelope-unit-fixture";

const AUTHOR_TEST_STATEMENT =
  "no automated oracle can observe whether the escalation envelope renders correctly";
const IMPLEMENT_STATEMENT =
  "no correct implementation of the escalation envelope can satisfy the authored test as written";
const IMPLEMENT_ASSERTION = "assert.deepEqual(rendered, expectedEscalationLines)";

const DEFAULT_TREE: TreeState = {
  commitSha: "node-build-escalation-envelope-fixture-tree",
  clean: true,
};
const DIRTY_TREE: TreeState = {
  commitSha: "node-build-escalation-envelope-dirty-fixture-tree",
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

/**
 * A REAL `ShellTestExecutor` whose one testId always spawns the SAME child command — `node -e
 * <script>` — and the script itself decides, per INVOCATION (tracked via a counter file, since each
 * call is a separate OS process), which of `exitCodes` to exit with. Every invocation appends one
 * byte to `markerFile` (so the walk's spawn count is independently observable) and writes distinct
 * stdout/stderr markers so a rendered block can be attributed to the RIGHT observation.
 */
async function buildScenarioExecutor(opts: {
  stdoutMarker: string;
  stderrMarker: string;
  exitCodes: number[];
}): Promise<{ executor: ShellTestExecutor; readMarkerCount: () => Promise<number>; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "node-build-escalation-envelope-"));
  const markerFile = path.join(dir, "markers.txt");
  const counterFile = path.join(dir, "counter.txt");
  await fs.writeFile(markerFile, "", "utf8");
  await fs.writeFile(counterFile, "0", "utf8");
  const script = [
    "const fs = require('fs');",
    `const markerFile = ${JSON.stringify(markerFile)};`,
    `const counterFile = ${JSON.stringify(counterFile)};`,
    "let n = 0;",
    "try { n = parseInt(fs.readFileSync(counterFile, 'utf8'), 10) || 0; } catch (e) {}",
    "fs.appendFileSync(markerFile, 'x');",
    "fs.writeFileSync(counterFile, String(n + 1));",
    `console.log(${JSON.stringify(opts.stdoutMarker)} + ':' + n);`,
    `process.stderr.write(${JSON.stringify(opts.stderrMarker)} + ':' + n);`,
    `const codes = ${JSON.stringify(opts.exitCodes)};`,
    "process.exit(codes[n] === undefined ? 1 : codes[n]);",
  ].join(" ");
  const executor = new ShellTestExecutor({
    command: () => ({ file: process.execPath, args: ["-e", script] }),
  });
  return {
    executor,
    readMarkerCount: async () => (await fs.readFile(markerFile, "utf8")).length,
    dir,
  };
}

interface ScenarioConfig {
  runId: string;
  testId: string;
  stdoutMarker: string;
  stderrMarker: string;
  exitCodes: number[];
  author: PhaseAuthor;
  tree?: TreeState;
}

interface ScenarioResult {
  result: ProveResult;
  runId: string;
  testId: string;
  readMarkerCount: () => Promise<number>;
  expectedMarkerCount: number;
  dir: string;
}

/** Drive ONE real `proveUnit` walk and return its result alongside the spawn-counting fixtures. */
async function driveScenario(config: ScenarioConfig): Promise<ScenarioResult> {
  const { executor, readMarkerCount, dir } = await buildScenarioExecutor({
    stdoutMarker: config.stdoutMarker,
    stderrMarker: config.stderrMarker,
    exitCodes: config.exitCodes,
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
  return {
    result,
    runId: config.runId,
    testId: config.testId,
    readMarkerCount,
    expectedMarkerCount: config.exitCodes.length,
    dir,
  };
}

// ── The bound-but-not-yet-published renderer (mirrors `phase-author.test.ts`'s `mustParse`) ────────

type RenderEscalation = (unitId: string, runId: string, result: ProveResult) => string[];

const renderEscalationRaw = (NodeBuildModule as Record<string, unknown>).renderEscalation as
  | RenderEscalation
  | undefined;

/** Fails with one clear assertion (never a crash) when the renderer isn't published yet. */
function mustGetRenderEscalation(): RenderEscalation {
  assert.equal(
    typeof renderEscalationRaw,
    "function",
    "node-build.ts must export renderEscalation(unitId, runId, result): string[]",
  );
  return renderEscalationRaw as RenderEscalation;
}

// ── Fixtures: six real `proveUnit` walks, built once ────────────────────────────────────────────

interface Fixtures {
  authorEscalation: ScenarioResult;
  implementEscalationStaysRed: ScenarioResult;
  overruledPass: ScenarioResult;
  overruledGateRefusal: ScenarioResult;
  plainPass: ScenarioResult;
  plainFailure: ScenarioResult;
}

let fixtures!: Fixtures;

before(async () => {
  const implementEscalation: AuthoringEscalation = {
    phase: "IMPLEMENT",
    kind: "unsatisfiable-test",
    statement: IMPLEMENT_STATEMENT,
    assertion: IMPLEMENT_ASSERTION,
  };

  // 1. AUTHOR_TEST escalation — ends the walk after exactly ONE spine observation (a deliberately
  //    GREEN one, mirroring `prove-it-gate.escalation.test.ts`: proving the walk ends on the
  //    escalation's own terms, never through the ordinary CONFIRM_RED gate).
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

  // 2. IMPLEMENT escalation that STAYS RED — CONFIRM_GREEN observes red, so the ordinary refusal
  //    runs unchanged and the escalation record rides beside it (never overruled).
  const implementEscalationStaysRed = await driveScenario({
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

  // 3a. The SAME IMPLEMENT escalation, OVERRULED by a green CONFIRM_GREEN observation — the walk
  //     signs exactly as it would have, and `overruledEscalation` rides the PASS.
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

  // 3b. The overrule surviving past CONFIRM_GREEN into a LATER GATE refusal (a dirty tree) —
  //     `overruledEscalation` rides the FAILURE variant instead.
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

  // 4a. A plain PASS carrying neither key.
  const plainPass = await driveScenario({
    runId: "run-plain-pass",
    testId: "test-plain-pass",
    stdoutMarker: "PLAIN_PASS_STDOUT_MARKER",
    stderrMarker: "PLAIN_PASS_STDERR_MARKER",
    exitCodes: [1, 0],
    author: scriptedAuthor({}),
  });

  // 4b. A plain FAILURE (an ordinary "not red" CONFIRM_RED refusal) carrying neither key.
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
    implementEscalationStaysRed,
    overruledPass,
    overruledGateRefusal,
    plainPass,
    plainFailure,
  };
});

after(async () => {
  if (fixtures === undefined) return;
  await Promise.all(
    Object.values(fixtures).map((scenario) => fs.rm(scenario.dir, { recursive: true, force: true })),
  );
});

// ── The contract ─────────────────────────────────────────────────────────────────────────────────

describe("node-build-renders-the-returned-escalation-with-its-test-id: renders the returned escalation with its unit, run and test id, and names an overruled one, without executing a command", () => {
  test("is published as a function from node-build.ts", () => {
    assert.equal(typeof renderEscalationRaw, "function");
  });

  test("renders an AUTHOR_TEST escalation with its claim, unit/run/test id, statement verbatim, the spine's single observation (never a CONFIRM label), and the options line", () => {
    const s = fixtures.authorEscalation;
    // Ground truth first: the fixture itself must be the AUTHOR_TEST escalation this test needs.
    assert.equal(s.result.ok, false);
    if (s.result.ok) return;
    assert.equal(s.result.failedAt, "AUTHOR_TEST");

    const renderEscalation = mustGetRenderEscalation();
    const rendered = renderEscalation(UNIT_ID, s.runId, s.result);
    const joined = rendered.join("\n");

    assert.match(joined, /AUTHOR_TEST/, "the header must name the raising phase");
    assert.match(
      joined,
      /this contract cannot be tested as specified/i,
      "the header must name AUTHOR_TEST's claim",
    );
    assert.match(joined, new RegExp(escapeRegExp(UNIT_ID)), "must attribute the unit id");
    assert.match(joined, new RegExp(escapeRegExp(s.runId)), "must attribute the run id");
    assert.match(joined, new RegExp(escapeRegExp(s.testId)), "must attribute the test id");
    assert.match(
      joined,
      new RegExp(escapeRegExp(AUTHOR_TEST_STATEMENT)),
      "the statement must render verbatim",
    );
    assert.match(
      joined,
      /AUTHOR_ESCALATION_STDOUT_MARKER/,
      "the spine's single observation's stdout must render",
    );
    assert.match(
      joined,
      /AUTHOR_ESCALATION_STDERR_MARKER/,
      "the spine's single observation's stderr must render",
    );
    assert.match(joined, /exit code[^\n]{0,12}0/i, "the observation's exit code must render");
    assert.doesNotMatch(
      joined,
      /CONFIRM_RED|CONFIRM_GREEN/,
      "the escalation's own observation must never be mislabelled as a CONFIRM run",
    );
    assert.match(joined, /observation/i, "the observation must be labelled as one");
    assert.match(
      joined,
      /revised-test/,
      "the options line must name re-delegating a test revision as a `revised-test` difference",
    );
    assert.match(joined, /escalate/i, "the options line must name escalating to the owner");
    assert.match(joined, /owner/i, "the options line must name escalating to the owner");
  });

  test("renders an IMPLEMENT escalation with its claim, statement and assertion verbatim, and the options line — carrying no observation of its own", () => {
    const s = fixtures.implementEscalationStaysRed;
    assert.equal(s.result.ok, false);
    if (s.result.ok) return;
    assert.equal(s.result.failedAt, "CONFIRM_GREEN");

    const renderEscalation = mustGetRenderEscalation();
    const rendered = renderEscalation(UNIT_ID, s.runId, s.result);
    const joined = rendered.join("\n");

    assert.match(joined, /IMPLEMENT/, "the header must name the raising phase");
    assert.match(
      joined,
      /this test cannot be satisfied as written/i,
      "the header must name IMPLEMENT's claim",
    );
    assert.match(joined, new RegExp(escapeRegExp(UNIT_ID)), "must attribute the unit id");
    assert.match(joined, new RegExp(escapeRegExp(s.runId)), "must attribute the run id");
    assert.match(joined, new RegExp(escapeRegExp(s.testId)), "must attribute the test id");
    assert.match(
      joined,
      new RegExp(escapeRegExp(IMPLEMENT_STATEMENT)),
      "the statement must render verbatim",
    );
    assert.match(
      joined,
      new RegExp(escapeRegExp(IMPLEMENT_ASSERTION)),
      "the assertion must render verbatim",
    );
    assert.match(
      joined,
      /revised-test/,
      "the options line must name re-delegating a test revision as a `revised-test` difference",
    );
    assert.match(joined, /escalate/i, "the options line must name escalating to the owner");
    assert.doesNotMatch(
      joined,
      /IMPLEMENT_RED_STDOUT_MARKER|IMPLEMENT_RED_STDERR_MARKER/,
      "an IMPLEMENT escalation carries no observation of its own — the failedObservation section is separate and is not repeated here",
    );
  });

  test("renders an overruled escalation as exactly one labelled line — implementer escalated, spine observed green, overruled, with the statement — on a PASS", () => {
    const s = fixtures.overruledPass;
    assert.equal(s.result.ok, true, "the overrule must let the walk sign exactly as it would have");
    if (!s.result.ok) return;

    const renderEscalation = mustGetRenderEscalation();
    const rendered = renderEscalation(UNIT_ID, s.runId, s.result);

    assert.equal(rendered.length, 1, "an overruled escalation renders exactly one line");
    const line = rendered[0] ?? "";
    assert.match(line, /implement/i, "names the phase that escalated");
    assert.match(line, /escalat/i, "says the implementer escalated");
    assert.match(line, /green/i, "says the spine observed green");
    assert.match(line, /overrul/i, "says the escalation was overruled");
    assert.match(
      line,
      new RegExp(escapeRegExp(IMPLEMENT_STATEMENT)),
      "carries the statement verbatim",
    );
  });

  test("renders the same overruled escalation as exactly one labelled line on the GATE refusal that follows the overrule", () => {
    const s = fixtures.overruledGateRefusal;
    assert.equal(s.result.ok, false);
    if (s.result.ok) return;
    assert.equal(s.result.failedAt, "GATE");
    assert.match(s.result.reason, /not clean/);

    const renderEscalation = mustGetRenderEscalation();
    const rendered = renderEscalation(UNIT_ID, s.runId, s.result);

    assert.equal(rendered.length, 1, "an overruled escalation renders exactly one line");
    const line = rendered[0] ?? "";
    assert.match(line, /implement/i, "names the phase that escalated");
    assert.match(line, /escalat/i, "says the implementer escalated");
    assert.match(line, /green/i, "says the spine observed green");
    assert.match(line, /overrul/i, "says the escalation was overruled");
    assert.match(
      line,
      new RegExp(escapeRegExp(IMPLEMENT_STATEMENT)),
      "carries the statement verbatim",
    );
  });

  test("renders nothing for a PASS carrying neither escalation nor overruledEscalation", () => {
    const s = fixtures.plainPass;
    assert.equal(s.result.ok, true);

    const renderEscalation = mustGetRenderEscalation();
    assert.deepEqual(renderEscalation(UNIT_ID, s.runId, s.result), []);
  });

  test("renders nothing for a FAILURE carrying neither escalation nor overruledEscalation", () => {
    const s = fixtures.plainFailure;
    assert.equal(s.result.ok, false);

    const renderEscalation = mustGetRenderEscalation();
    assert.deepEqual(renderEscalation(UNIT_ID, s.runId, s.result), []);
  });

  test("spawns no command while rendering — every fixture's marker count is unchanged after rendering it twice", async () => {
    const scenarios: ScenarioResult[] = [
      fixtures.authorEscalation,
      fixtures.implementEscalationStaysRed,
      fixtures.overruledPass,
      fixtures.overruledGateRefusal,
      fixtures.plainPass,
      fixtures.plainFailure,
    ];

    // Ground truth: each walk's own spawns already produced exactly the expected marker count
    // (one for the AUTHOR_TEST escalation and for the walk that never reached CONFIRM_GREEN, two
    // for every walk that reached CONFIRM_GREEN) — established BEFORE any rendering happens.
    const before = await Promise.all(scenarios.map((s) => s.readMarkerCount()));
    assert.deepEqual(
      before,
      scenarios.map((s) => s.expectedMarkerCount),
      "each walk's marker count must already equal its own spawn count",
    );

    const renderEscalation = mustGetRenderEscalation();
    for (const s of scenarios) {
      renderEscalation(UNIT_ID, s.runId, s.result);
      renderEscalation(UNIT_ID, s.runId, s.result);
    }

    const after = await Promise.all(scenarios.map((s) => s.readMarkerCount()));
    assert.deepEqual(after, before, "rendering must never spawn a command");
  });
});
