import { test } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { InMemoryStore } from "@storytree/storage-protocol";

import { loadNodeSpec } from "./node-spec.js";
import { realPrompts, realProofCommand, resolveProveSpec } from "./resolve-prove-spec.js";
import type { TestRevision } from "./resolve-prove-spec.js";
import type { EscalationRecord } from "./prove-it-gate.js";
import type { RealProofConfig } from "./proof-config.js";

/**
 * Contract `test-revision-reaches-only-the-author-test-brief` (ADR-0571 D4): a REAL build handed a
 * test revision briefs its AUTHOR_TEST leaf with the prior run's escalation and the spine's
 * observation behind it, and leaves the IMPLEMENT brief and every unrevised brief unchanged.
 *
 * `editsExisting-red-kind`: at HEAD `realPrompts` takes only four arguments and silently ignores a
 * fifth, so every assertion below fails on the BRIEF'S CONTENT, never on a missing symbol — the
 * three types imported above are `import type` only, erased entirely by the tsx loader, so their
 * absence from the runtime module today causes no import-time failure.
 */

/** repo root: packages/orchestrator/src → four dirs up. */
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const STORIES_DIR = path.join(REPO_ROOT, "stories");

/** A REAL node spec this file reuses for every case — contract-tier, so it declares no contracts. */
function verdictLineSpec() {
  return loadNodeSpec(path.join(STORIES_DIR, "drive-machinery", "verdict-line.md"));
}

/** A minimal net-new REAL arm, widened per-arm below (mirrors the existing three-arm test fixture). */
const ARMS_BASE: RealProofConfig = {
  testFile: "packages/cli/src/tree.test.ts",
  sourceFile: "packages/cli/src/tree.ts",
  scope: {
    testGlobs: ["packages/cli/src/tree.test.ts"],
    sourceGlobs: ["packages/cli/src/tree.ts"],
  },
};
const ARMS_SUITE = { file: "pnpm", args: ["--filter", "@storytree/cli", "test"] };
const ARMS: ReadonlyArray<{ arm: string; real: RealProofConfig }> = [
  { arm: "net-new", real: ARMS_BASE },
  { arm: "editsExisting", real: { ...ARMS_BASE, editsExisting: true, proofCommand: ARMS_SUITE } },
  { arm: "refactorForTests", real: { ...ARMS_BASE, refactorForTests: true, proofCommand: ARMS_SUITE } },
];
const RUNTIMES = ["claude", "codex"] as const;

test("test-revision-reaches-only-the-author-test-brief — the plain brief stays the exact prefix, and IMPLEMENT is untouched, in every REAL arm and runtime", () => {
  for (const { arm, real } of ARMS) {
    for (const runtime of RUNTIMES) {
      const display = realProofCommand(real, "/ws").display;
      const spec = verdictLineSpec();
      const baseline = realPrompts(spec, real, display, runtime);
      // Parity: a call carrying no revision must stay untouched — today's brief, unmodified.
      assert.doesNotMatch(
        baseline.authorTest,
        /ADR-0563/,
        `${arm}/${runtime}: no revision supplied, no revision section`,
      );

      const escalation: EscalationRecord = {
        raised: {
          phase: "AUTHOR_TEST",
          kind: "untestable-contract",
          statement: "statement-marker-XYZ",
        },
        testId: "distinctive-test-id-123",
      };
      const revision: TestRevision = {
        unitId: spec.id,
        runId: "prior-run-abcdef",
        escalation,
      };
      const revised = realPrompts(spec, real, display, runtime, revision);

      assert.ok(
        revised.authorTest.startsWith(baseline.authorTest),
        `${arm}/${runtime}: today's whole brief must be the exact prefix of the revised one`,
      );
      assert.equal(
        revised.implement,
        baseline.implement,
        `${arm}/${runtime}: IMPLEMENT is byte-identical — the revision reaches AUTHOR_TEST only`,
      );

      const remainder = revised.authorTest.slice(baseline.authorTest.length);
      assert.ok(remainder.length > 0, `${arm}/${runtime}: a revision appends a section`);
      assert.match(remainder, /ADR-0563/, `${arm}/${runtime}: names the decision behind the revision`);
      assert.match(remainder, /revised-test/, `${arm}/${runtime}: names the D4 attempt kind`);
      assert.ok(remainder.includes("prior-run-abcdef"), `${arm}/${runtime}: the prior run id`);
      assert.ok(remainder.includes("distinctive-test-id-123"), `${arm}/${runtime}: the test id`);
      assert.ok(
        remainder.includes("statement-marker-XYZ"),
        `${arm}/${runtime}: the statement, verbatim`,
      );
    }
  }
});

test("test-revision-reaches-only-the-author-test-brief — an AUTHOR_TEST-kind revision carries the spine's one observation and never names a CONFIRM phase", () => {
  const spec = verdictLineSpec();
  const real = ARMS_BASE;
  const display = realProofCommand(real, "/ws").display;
  const baseline = realPrompts(spec, real, display, "claude");

  const escalation: EscalationRecord = {
    raised: {
      phase: "AUTHOR_TEST",
      kind: "untestable-contract",
      statement: "statement-marker-OBSERVED",
    },
    testId: "test-id-observed",
    observation: { stdout: "STDOUT-MARKER-OBSERVED", stderr: "STDERR-MARKER-OBSERVED", exitCode: 137 },
  };
  const revision: TestRevision = { unitId: spec.id, runId: "prior-run-observed-7", escalation };
  const revised = realPrompts(spec, real, display, "claude", revision);

  assert.ok(revised.authorTest.startsWith(baseline.authorTest));
  assert.equal(revised.implement, baseline.implement);

  const remainder = revised.authorTest.slice(baseline.authorTest.length);
  assert.ok(remainder.includes("prior-run-observed-7"));
  assert.ok(remainder.includes("test-id-observed"));
  assert.ok(remainder.includes("statement-marker-OBSERVED"));
  assert.ok(remainder.includes("STDOUT-MARKER-OBSERVED"), "carries the observation's stdout");
  assert.ok(remainder.includes("STDERR-MARKER-OBSERVED"), "carries the observation's stderr");
  assert.ok(remainder.includes("137"), "carries the observation's exit code");
  assert.doesNotMatch(
    remainder,
    /CONFIRM_RED/,
    "an AUTHOR_TEST escalation's section names no CONFIRM phase",
  );
  assert.doesNotMatch(
    remainder,
    /CONFIRM_GREEN/,
    "an AUTHOR_TEST escalation's section names no CONFIRM phase",
  );
});

test("test-revision-reaches-only-the-author-test-brief — an AUTHOR_TEST-kind revision with no observation says so instead of fabricating one", () => {
  const spec = verdictLineSpec();
  const real = ARMS_BASE;
  const display = realProofCommand(real, "/ws").display;
  const baseline = realPrompts(spec, real, display, "claude");

  const escalation: EscalationRecord = {
    raised: {
      phase: "AUTHOR_TEST",
      kind: "untestable-contract",
      statement: "statement-marker-UNOBSERVED",
    },
    testId: "test-id-unobserved",
  };
  const revision: TestRevision = { unitId: spec.id, runId: "prior-run-unobserved-3", escalation };
  const revised = realPrompts(spec, real, display, "claude", revision);
  const remainder = revised.authorTest.slice(baseline.authorTest.length);

  assert.ok(revised.authorTest.startsWith(baseline.authorTest));
  assert.equal(revised.implement, baseline.implement);
  assert.ok(remainder.length > 0, "still appends a section even carrying no observation");
  assert.ok(remainder.includes("prior-run-unobserved-3"));
  assert.ok(remainder.includes("test-id-unobserved"));
  assert.ok(remainder.includes("statement-marker-UNOBSERVED"));
  assert.doesNotMatch(remainder, /CONFIRM_RED/);
  assert.doesNotMatch(remainder, /CONFIRM_GREEN/);
  // Distinguishing fact: no fabricated observation body — none of the OTHER test's marker/exit-code
  // bytes leak in when this revision carries no observation at all.
  assert.ok(!remainder.includes("STDOUT-MARKER-OBSERVED"));
  assert.ok(!/\b137\b/.test(remainder));
});

test("test-revision-reaches-only-the-author-test-brief — an IMPLEMENT-kind revision carries the assertion verbatim and names the disowned CONFIRM_GREEN run", () => {
  const spec = verdictLineSpec();
  const real = ARMS_BASE;
  const display = realProofCommand(real, "/ws").display;
  const baseline = realPrompts(spec, real, display, "claude");

  const escalation: EscalationRecord = {
    raised: {
      phase: "IMPLEMENT",
      kind: "unsatisfiable-test",
      statement: "statement-marker-IMPLEMENT",
      assertion: "assertion-marker-IMPLEMENT",
    },
    testId: "test-id-implement",
  };
  const revision: TestRevision = {
    unitId: spec.id,
    runId: "prior-run-implement-4",
    escalation,
    failedObservation: {
      stdout: "STDOUT-MARKER-IMPLEMENT",
      stderr: "STDERR-MARKER-IMPLEMENT",
      exitCode: 1,
    },
  };
  const revised = realPrompts(spec, real, display, "claude", revision);

  assert.ok(revised.authorTest.startsWith(baseline.authorTest));
  assert.equal(revised.implement, baseline.implement);

  const remainder = revised.authorTest.slice(baseline.authorTest.length);
  assert.ok(remainder.includes("prior-run-implement-4"));
  assert.ok(remainder.includes("test-id-implement"));
  assert.ok(remainder.includes("statement-marker-IMPLEMENT"));
  assert.ok(remainder.includes("assertion-marker-IMPLEMENT"), "carries the assertion, verbatim");
  assert.ok(remainder.includes("STDOUT-MARKER-IMPLEMENT"));
  assert.ok(remainder.includes("STDERR-MARKER-IMPLEMENT"));
  assert.match(
    remainder,
    /CONFIRM_GREEN/,
    "labels the disowned run as the CONFIRM_GREEN observation the implementer disowned",
  );
});

test("test-revision-reaches-only-the-author-test-brief — a stream over 8,000 characters is tail-kept and the cut names the omitted count in plain digits", () => {
  const spec = verdictLineSpec();
  const real = ARMS_BASE;
  const display = realProofCommand(real, "/ws").display;
  const baseline = realPrompts(spec, real, display, "claude");

  const head = "H".repeat(12_000);
  const tail = "T".repeat(8_000);
  const escalation: EscalationRecord = {
    raised: {
      phase: "AUTHOR_TEST",
      kind: "untestable-contract",
      statement: "statement-marker-STREAM",
    },
    testId: "test-id-stream",
    observation: { stdout: head + tail, stderr: "", exitCode: 1 },
  };
  const revision: TestRevision = { unitId: spec.id, runId: "prior-run-stream", escalation };
  const revised = realPrompts(spec, real, display, "claude", revision);
  const remainder = revised.authorTest.slice(baseline.authorTest.length);

  assert.ok(remainder.includes(tail), "keeps the last 8,000 characters as one contiguous run");
  assert.ok(!remainder.includes("H"), "none of the omitted head survives");
  assert.ok(remainder.includes("12000"), "names the omitted count (20,000 - 8,000) in plain digits");
});

test("test-revision-reaches-only-the-author-test-brief — a stream at or under 8,000 characters appears whole and verbatim", () => {
  const spec = verdictLineSpec();
  const real = ARMS_BASE;
  const display = realProofCommand(real, "/ws").display;

  const whole = "line-one\nline-two\nline-three-marker";
  const escalation: EscalationRecord = {
    raised: {
      phase: "AUTHOR_TEST",
      kind: "untestable-contract",
      statement: "statement-marker-WHOLE",
    },
    testId: "test-id-whole",
    observation: { stdout: whole, stderr: "", exitCode: 0 },
  };
  const revision: TestRevision = { unitId: spec.id, runId: "prior-run-whole", escalation };
  const revised = realPrompts(spec, real, display, "claude", revision);

  assert.ok(
    revised.authorTest.includes(whole),
    "a short stream appears whole, as one contiguous run, verbatim (not re-indented line by line)",
  );
});

test("test-revision-reaches-only-the-author-test-brief — resolveProveSpec's real mode threads a supplied testRevision to the resolved AUTHOR_TEST prompt, and only that prompt", () => {
  const spec = verdictLineSpec();
  const base = {
    mode: "real" as const,
    runtime: "claude" as const,
    workspace: os.tmpdir(),
    store: new InMemoryStore(),
    runId: "r-revision-seam",
    signerInputs: { flag: "tester@example.com" },
  };
  const withoutRevision = resolveProveSpec(spec, base);
  assert.equal(withoutRevision.ok, true);
  if (!withoutRevision.ok) return;

  const escalation: EscalationRecord = {
    raised: {
      phase: "AUTHOR_TEST",
      kind: "untestable-contract",
      statement: "seam-statement-marker",
    },
    testId: "seam-test-id",
  };
  const revision: TestRevision = { unitId: spec.id, runId: "prior-run-seam-9", escalation };
  const withRevision = resolveProveSpec(spec, { ...base, testRevision: revision });
  assert.equal(withRevision.ok, true);
  if (!withRevision.ok) return;

  assert.ok(
    withRevision.spec.prompts.authorTest.startsWith(withoutRevision.spec.prompts.authorTest),
    "the seam keeps today's brief as the exact prefix",
  );
  assert.equal(
    withRevision.spec.prompts.implement,
    withoutRevision.spec.prompts.implement,
    "IMPLEMENT is untouched by the seam",
  );

  const remainder = withRevision.spec.prompts.authorTest.slice(
    withoutRevision.spec.prompts.authorTest.length,
  );
  assert.ok(remainder.includes("prior-run-seam-9"));
  assert.ok(remainder.includes("seam-test-id"));
  assert.ok(remainder.includes("seam-statement-marker"));
});
