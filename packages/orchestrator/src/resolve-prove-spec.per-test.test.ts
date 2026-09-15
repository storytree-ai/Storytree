import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { AuthorResult, AuthoringPhase, PhaseAuthor } from "@storytree/agent";
import { InMemoryStore } from "@storytree/storage-protocol";

import { loadNodeSpec } from "./node-spec.js";
import { assertOracleGuardUrl } from "./proof/oracle-accounting.js";
import { perTestReporterUrl } from "./proof/per-test-report.js";
import { classifyProofRoute, perTestChannelOf, withPerTestReport } from "./proof/proof-route.js";
import type { RealProofConfig } from "./proof-config.js";
import { proveUnit } from "./prove-it-gate.js";
import { realPrompts, realProofCommand, resolveProveSpec } from "./resolve-prove-spec.js";

// The arming half of ADR-0573: which real proof routes carry a per-test channel (D2/D3), how the channel
// rides the ONE resolved command, the review the resolver hands the gate, and the brief rule (D6).

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const TEST_FILE = "packages/unit/src/unit.test.ts";
const SOURCE_FILE = "packages/unit/src/unit.ts";

type DeclaredCommand = NonNullable<RealProofConfig["proofCommand"]>;

function realConfig(proofCommand?: DeclaredCommand): RealProofConfig {
  const real: RealProofConfig = {
    testFile: TEST_FILE,
    sourceFile: SOURCE_FILE,
    scope: { testGlobs: [TEST_FILE], sourceGlobs: [SOURCE_FILE] },
  };
  if (proofCommand !== undefined) real.proofCommand = proofCommand;
  return real;
}

const channelFor = (proofCommand?: DeclaredCommand): string | undefined => {
  const real = realConfig(proofCommand);
  return perTestChannelOf(real, classifyProofRoute(real));
};

test("real-routes-arm-per-test-observation: only a route running this node's OWN test file through a measured runner carries a channel", () => {
  assert.equal(channelFor(), "node-test", "the default node:test route");
  assert.equal(channelFor({ file: "node", args: ["--import", "tsx", "--test", TEST_FILE] }), "node-test");
  assert.equal(
    channelFor({ file: "pnpm", args: ["--filter", "studio", "exec", "vitest", "run", TEST_FILE] }),
    "vitest-json",
  );
  assert.equal(
    channelFor({ file: "bun", args: ["test", "--preload", "./scripts/tsx-cache-off.mjs", "--timeout", "300000", `./${TEST_FILE}`] }),
    "bun-junit",
  );

  // Everything else keeps the exit code alone.
  assert.equal(channelFor({ file: "node", args: ["--import", "tsx", TEST_FILE] }), undefined, "no --test: no test-runner reporters");
  assert.equal(channelFor({ file: "pnpm", args: ["--filter", "studio", "exec", "vitest", "run"] }), undefined, "a vitest suite");
  assert.equal(channelFor({ file: "bun", args: ["test", "packages/unit/src/"] }), undefined, "a bun suite");
  assert.equal(channelFor({ file: "pnpm", args: ["--filter", "@storytree/unit", "test"] }), undefined, "a package script");
  assert.equal(channelFor({ file: "node", args: ["--test", "packages/unit/src/*.test.ts"] }), undefined, "a node:test glob");
});

test("real-routes-arm-per-test-observation: a bun own-file route is single-file and carries the assert-oracle guard through --preload", () => {
  const real = realConfig({ file: "bun", args: ["test", "--timeout", "300000", `./${TEST_FILE}`] });
  assert.deepEqual(classifyProofRoute(real), { accounting: "oracle", basis: "bun-test-own-file", guardArgIndex: 1 });
  const { command, accounted } = realProofCommand(real, REPO_ROOT);
  assert.equal(accounted, true);
  assert.deepEqual(command.args, ["test", "--preload", fileURLToPath(assertOracleGuardUrl()), "--timeout", "300000", `./${TEST_FILE}`]);

  // A single bun test file that is NOT the one AUTHOR_TEST writes can never observe its red.
  const elsewhere = realConfig({ file: "bun", args: ["test", "./packages/unit/src/other.test.ts"] });
  assert.equal(classifyProofRoute(elsewhere).accounting, "refused");
});

test("real-routes-arm-per-test-observation: each channel's flags ride the one command where its runner reads them", () => {
  const node = withPerTestReport(
    { file: "node", args: ["--import", "tsx", "--test", "/w/unit.test.ts"], cwd: "/w" },
    "node-test",
    "/tmp/report.jsonl",
  );
  assert.deepEqual(node.args, [
    "--import",
    "tsx",
    "--test",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    `--test-reporter=${perTestReporterUrl()}`,
    "--test-reporter-destination=/tmp/report.jsonl",
    "/w/unit.test.ts",
  ]);
  assert.equal(node.cwd, "/w");

  const bun = withPerTestReport({ file: "bun", args: ["test", "--preload", "guard", "./unit.test.ts"] }, "bun-junit", "/tmp/report.xml");
  assert.deepEqual(bun.args, ["test", "--reporter=junit", "--reporter-outfile=/tmp/report.xml", "--preload", "guard", "./unit.test.ts"]);

  const vitest = withPerTestReport(
    { file: "cmd.exe", args: ["/d", "/s", "/c", "pnpm", "exec", "vitest", "run", "unit.test.ts"], env: { A: "1" } },
    "vitest-json",
    "/tmp/report.json",
  );
  assert.deepEqual(vitest.args.slice(-3), ["--reporter=default", "--reporter=json", "--outputFile=/tmp/report.json"]);
  assert.deepEqual(vitest.env, { A: "1" });
});

// ── The resolver arms a real build end to end ───────────────────────────────

const SKELETON = `export function add(a: number, b: number): number {
  void a;
  void b;
  return undefined as unknown as number;
}
`;

const IMPLEMENTED = `export function add(a: number, b: number): number {
  return a + b;
}
`;

const CLEAN_TEST = `import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { add } from "./unit.js";

describe("add-sums: add returns the sum of its operands", () => {
  test("two and three make five", () => {
    assert.equal(add(2, 3), 5);
  });
});
`;

/** The clean test beside one hollow test that only the red observation can see (it vouches statically). */
const HOLLOW_TEST = `${CLEAN_TEST}
test("add-is-a-function: asserts what the existing source already satisfies", () => {
  assert.equal(typeof add, "function");
});
`;

const SPEC = `---
id: "per-test-armed-unit"
tier: contract
story: drive-machinery
capability: prove-spec-resolution
title: "A unit whose existing source is edited"
outcome: "add returns the sum of its operands."
status: proposed
proof_mode: contract-test
depends_on: []
proof:
  command:
    file: node
    args: ["--test", "${TEST_FILE}"]
  scope:
    testGlobs: ["${TEST_FILE}"]
    sourceGlobs: ["${SOURCE_FILE}"]
  real:
    testFile: "${TEST_FILE}"
    sourceFile: "${SOURCE_FILE}"
    scope:
      testGlobs: ["${TEST_FILE}"]
      sourceGlobs: ["${SOURCE_FILE}"]
    editsExisting: true
---

# A unit whose existing source is edited

## Contracts (1)

1. **\`add-sums\`** — add returns the sum of its operands
   - **asserts —** \`add(2, 3)\` is 5.
   - **covers —** \`${SOURCE_FILE}\`
`;

/** The leaf, doubled: it writes its phase's file and stops. */
class WritingAuthor implements PhaseAuthor {
  readonly #workspace: string;
  readonly #writes: Readonly<Record<AuthoringPhase, readonly [string, string]>>;

  constructor(workspace: string, writes: Readonly<Record<AuthoringPhase, readonly [string, string]>>) {
    this.#workspace = workspace;
    this.#writes = writes;
  }

  async author(phase: AuthoringPhase): Promise<AuthorResult> {
    const [rel, content] = this.#writes[phase];
    await fs.writeFile(path.join(this.#workspace, rel), content);
    return { ok: true };
  }
}

async function armedWalk(testSource: string, implementation: string) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "storytree-armed-walk-"));
  try {
    await fs.mkdir(path.join(workspace, path.dirname(TEST_FILE)), { recursive: true });
    await fs.writeFile(path.join(workspace, "package.json"), JSON.stringify({ name: "armed-walk", private: true, type: "module" }));
    await fs.writeFile(path.join(workspace, SOURCE_FILE), SKELETON);
    const specFile = path.join(workspace, "per-test-armed-unit.md");
    await fs.writeFile(specFile, SPEC);
    const spec = loadNodeSpec(specFile);

    const resolved = resolveProveSpec(spec, {
      mode: "real",
      workspace,
      store: new InMemoryStore(),
      runId: "armed-walk",
      signerInputs: { flag: "tester@example.com" },
      authorOverride: new WritingAuthor(workspace, {
        AUTHOR_TEST: [TEST_FILE, testSource],
        IMPLEMENT: [SOURCE_FILE, implementation],
      }),
      treeState: async () => ({ commitSha: "armed-walk", clean: true }),
    });
    if (!resolved.ok) throw new Error(resolved.reason);
    return { resolved: resolved.spec, result: await proveUnit(resolved.spec) };
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

test("real-routes-arm-per-test-observation: a real build on the default route refuses a hollow test per test, and signs a clean one", async () => {
  const hollow = await armedWalk(HOLLOW_TEST, IMPLEMENTED);
  assert.ok(hollow.resolved.perTest?.confirmRed !== undefined, "an editsExisting unit is reviewed per test at red");
  assert.equal(hollow.result.ok, false);
  if (hollow.result.ok) return;
  assert.equal(hollow.result.failedAt, "CONFIRM_RED", hollow.result.reason);
  assert.deepEqual(
    (hollow.result.perTestFindings ?? []).map((f) => `${f.check} ${f.test?.join(" > ") ?? ""}`),
    ["C4 add-is-a-function: asserts what the existing source already satisfies"],
  );

  const clean = await armedWalk(CLEAN_TEST, IMPLEMENTED);
  assert.equal(clean.result.ok, true, clean.result.ok ? "" : `${clean.result.failedAt}: ${clean.result.reason}`);
  if (!clean.result.ok) return;
  assert.deepEqual(clean.result.verdict.acceptedGuardRails, []);
  assert.match(clean.result.verdict.evidence[0]?.note ?? "", /per-test: 1 declared test\(s\) reviewed individually at CONFIRM_RED/);
  assert.match(clean.result.verdict.evidence[1]?.note ?? "", /per-test: 1 declared test\(s\) each reported green at CONFIRM_GREEN/);
});

test("real-routes-arm-per-test-observation: a net-new unit is reviewed per test at green only, and a suite route not at all", () => {
  const spec = loadNodeSpec(path.join(REPO_ROOT, "stories", "drive-machinery", "verdict-line.md"));
  const base = { mode: "real" as const, store: new InMemoryStore(), runId: "r", signerInputs: { flag: "t@example.com" } };
  const author: PhaseAuthor = { author: async () => ({ ok: true }) };
  const treeState = async () => ({ commitSha: "x", clean: true });

  const netNew = { ...spec, buildConfig: { command: { file: "node", args: [] }, scope: realConfig().scope, real: realConfig() } };
  const resolvedNetNew = resolveProveSpec(netNew, { ...base, workspace: REPO_ROOT, authorOverride: author, treeState });
  assert.equal(resolvedNetNew.ok, true);
  if (!resolvedNetNew.ok) return;
  assert.equal(resolvedNetNew.spec.perTest?.confirmRed, undefined, "a structural red loads no file, so it is not reviewed per test");
  assert.match(resolvedNetNew.spec.perTest?.redNotObserved ?? "", /exit code alone/);

  const suiteReal = realConfig({ file: "pnpm", args: ["--filter", "@storytree/unit", "test"] });
  const suite = { ...spec, buildConfig: { command: { file: "node", args: [] }, scope: suiteReal.scope, real: suiteReal } };
  const resolvedSuite = resolveProveSpec(suite, { ...base, workspace: REPO_ROOT, authorOverride: author, treeState });
  assert.equal(resolvedSuite.ok, true);
  if (!resolvedSuite.ok) return;
  assert.equal(resolvedSuite.spec.perTest, undefined);
});

test("real-author-test-brief-states-the-per-test-rules: an armed route briefs the rules, and an unarmed route's brief says nothing of them", () => {
  const spec = loadNodeSpec(path.join(REPO_ROOT, "stories", "drive-machinery", "verdict-line.md"));
  const editsExisting: RealProofConfig = { ...realConfig(), editsExisting: true };

  const assertionBrief = realPrompts(spec, editsExisting, "node --import tsx --test unit.test.ts").authorTest;
  assert.match(assertionBrief, /The spine observes this proof PER TEST/);
  assert.match(assertionBrief, /a `\.each` table or a title built at runtime is refused/);
  assert.match(assertionBrief, /Every NEW test you add must FAIL now, on its own, with an assertion/);
  assert.match(assertionBrief, /declares a guard-rail in its story \(ADR-0572\)/);

  const netNewBrief = realPrompts(spec, realConfig(), "node --import tsx --test unit.test.ts").authorTest;
  assert.match(netNewBrief, /The spine observes this proof PER TEST/);
  assert.equal(netNewBrief.includes("Every NEW test you add must FAIL now"), false, "a structural red is not reviewed per test");

  const suiteBrief = realPrompts(spec, realConfig({ file: "pnpm", args: ["--filter", "@storytree/unit", "test"] }), "pnpm test").authorTest;
  assert.equal(suiteBrief.includes("PER TEST"), false);
  assert.equal(suiteBrief.includes("guard-rail"), false);
});
