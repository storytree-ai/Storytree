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
 * `declare-presence` capability ↔ `presence.test.ts`.
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
    "declare-presence",
    deps({
      loadUnit: () => ({
        tier: "capability",
        contractIds: ["presence-doc-fail-closed", "staleness-is-derived", "declaration-upsert-merge"],
        testNames: [
          "presence-doc-fail-closed: schema validation",
          "staleness-is-derived: freshness is a pure function of lastSeenAt vs now",
          "declaration-upsert-merge: mergeDeclaration is pure and stable",
        ],
        testFiles: ["packages/notice-board/src/presence.test.ts"],
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

test("end-to-end over the REAL corpus: declare-presence's three contracts are all covered by presence.test.ts", async () => {
  // No fixture loader — the real disk loader reads stories/notice-board/declare-presence.md's
  // `## Contracts` and scans its registered real-build test file (presence.test.ts). This grounds the
  // whole pipeline: parseContracts + extractTestNames + classifyContractCoverage + loadCoverageUnit.
  const env = await run(["coverage", "declare-presence"], { store: new InMemoryStore() });
  assert.equal(env.ok, true);
  assert.match(env.body, /contracts: 3\s+\(3 covered, 0 uncovered\)/);
  assert.match(env.body, /presence-doc-fail-closed\s+COVERED/);
  assert.match(env.body, /scanned 1 test file\(s\).*presence\.test\.ts/);
});
