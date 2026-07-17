import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { coverageCommand, type CoverageDeps, type CoverageUnit } from "./coverage.js";
import { run } from "./commands.js";

/**
 * `storytree coverage <capability-id>` (ADR-0020 coverage-honesty follow-on). Pure-by-injection (the
 * unit loader is a seam), so the command is tested with a fixture loader — no DB, no spec on disk. The
 * headline red→green: an UNCOVERED contract fails the check; a fully-covered unit passes. The final
 * test grounds the whole pipeline (parser + extractor + classifier + the disk loader) on the real
 * `deploy-health-signal` capability ↔ `deploy-health.test.ts` (the former grounding,
 * `declare-presence` ↔ `presence.test.ts`, was retired with the presence layer, ADR-0200).
 */

function deps(over: Partial<CoverageDeps> = {}): CoverageDeps {
  return { loadUnit: () => null, ...over };
}

const FOREST_UNIT: CoverageUnit = {
  tier: "capability",
  contractIds: [
    "fr-ready-when-broker-accepts-builder",
    "fr-fails-closed-with-guidance-when-unbrokered",
    "fr-bounded-never-hangs",
    "fr-write-brokers-not-direct",
  ],
  // The leaf authored a test for only ONE contract — the documented drop.
  testNames: ["fr-ready-when-broker-accepts-builder: a reachable broker reports ready"],
  testFiles: ["apps/desktop/src/backend/forest-readiness.test.ts"],
};

test("coverage needs a capability id", async () => {
  const env = await coverageCommand(undefined, deps());
  assert.equal(env.ok, false);
  assert.match(env.body, /needs a capability id/);
});

test("coverage on a missing/odd unit refuses with guidance", async () => {
  const env = await coverageCommand("nope", deps({ loadUnit: () => null }));
  assert.equal(env.ok, false);
  assert.match(env.body, /no unit "nope"/);
});

test("RED: a unit with an uncovered contract FAILS the check and names the uncovered", async () => {
  const env = await coverageCommand("shared-forest-connection", deps({ loadUnit: () => FOREST_UNIT }));
  assert.equal(env.ok, false); // a green here would over-claim — the check fails
  assert.match(env.body, /contracts: 4\s+\(1 covered, 3 uncovered\)/);
  assert.match(env.body, /3 UNCOVERED contract\(s\)/);
  // The dropped robustness contract is flagged by name.
  assert.match(env.body, /fr-bounded-never-hangs\s+UNCOVERED/);
  assert.match(env.body, /fr-ready-when-broker-accepts-builder\s+COVERED/);
});

test("GREEN: a unit whose every contract is named by a test PASSES the check", async () => {
  const env = await coverageCommand(
    "deploy-health-signal",
    deps({
      loadUnit: () => ({
        tier: "capability",
        contractIds: [
          "deploy-health-red-run-classifies-loud",
          "deploy-health-green-run-classifies-quiet",
          "deploy-health-no-signal-classifies-unknown",
        ],
        testNames: [
          "deploy-health-red-run-classifies-loud: a failing newest run formats a loud WARN",
          "deploy-health-green-run-classifies-quiet: a green newest run formats one quiet line",
          "deploy-health-no-signal-classifies-unknown: no completed run reads UNVERIFIED",
        ],
        testFiles: ["packages/cli/src/deploy-health.test.ts"],
      }),
    }),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /contracts: 3\s+\(3 covered, 0 uncovered\)/);
  assert.doesNotMatch(env.body, /UNCOVERED contract/);
});

test("a unit declaring no `## Contracts` is vacuously covered (ok, nothing to check)", async () => {
  const env = await coverageCommand(
    "some-story",
    deps({
      loadUnit: () => ({ tier: "story", contractIds: [], testNames: [], testFiles: [] }),
    }),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /declares no `## Contracts` — nothing to check/);
});

test("no test surface found: every contract reads uncovered and the report says why", async () => {
  const env = await coverageCommand(
    "orphan",
    deps({
      loadUnit: () => ({ tier: "capability", contractIds: ["c-a"], testNames: [], testFiles: [] }),
    }),
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /scanned NO test files/);
  assert.match(env.body, /c-a\s+UNCOVERED/);
});

test("end-to-end over the REAL corpus: deploy-health-signal's three contracts are all covered by deploy-health.test.ts", async () => {
  // No fixture loader — the real disk loader reads stories/studio-cloud/deploy-health-signal.md's
  // `## Contracts` and scans its registered real-build test file (deploy-health.test.ts). This grounds
  // the whole pipeline: parseContracts + extractTestNames + classifyContractCoverage + loadCoverageUnit.
  // (Re-grounded here when the former exemplar, declare-presence, was retired by ADR-0200.)
  const env = await run(["coverage", "deploy-health-signal"], { store: new InMemoryStore() });
  assert.equal(env.ok, true);
  assert.match(env.body, /contracts: 3\s+\(3 covered, 0 uncovered\)/);
  assert.match(env.body, /deploy-health-red-run-classifies-loud\s+COVERED/);
  assert.match(env.body, /scanned 1 test file\(s\).*deploy-health\.test\.ts/);
});
