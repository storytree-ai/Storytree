import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";

import { coverageCommand, coverageTotalsCommand, type CoverageDeps, type CoverageUnit } from "./coverage.js";
import { evaluateCoverageDrain } from "./coverage-drain.js";
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

/** One more uncovered contract than the shipped ceiling allows — the breach case, built not guessed. */
function contractsOver(): string[] {
  return Array.from({ length: 104 }, (_, i) => `cap-${i}/contract-${i}`);
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

test("an UNCOVERED report says whether the titles were UNREADABLE or the tests absent", async () => {
  // The two facts a `0/N` can mean. Same uncovered list, different claim — the report must say which.
  const absent = await coverageCommand("u", deps({ loadUnit: () => ({ ...FOREST_UNIT, unreadTitles: 0 }) }));
  assert.match(absent.body, /3 UNCOVERED contract\(s\)/);
  assert.ok(
    !/could NOT be read/.test(absent.body),
    "with every title readable, the uncovered list is a claim about the TESTS — no reader caveat",
  );

  const unread = await coverageCommand("u", deps({ loadUnit: () => ({ ...FOREST_UNIT, unreadTitles: 2 }) }));
  assert.match(unread.body, /2 test title\(s\) could NOT be read in full/);
  assert.match(unread.body, /limit of the\s+READER rather than a missing test/);
});

test("a loader that does not measure unread titles adds no caveat (absent ≠ zero-claim)", async () => {
  const env = await coverageCommand("u", deps({ loadUnit: () => FOREST_UNIT }));
  assert.ok(!/could NOT be read/.test(env.body));
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

test("end-to-end: coverage unions real.testFile with the extra real scope test globs", async () => {
  const env = await run(["coverage", "act2-regrow-camera-zoom-out"], { store: new InMemoryStore() });
  assert.equal(env.ok, true);
  assert.match(env.body, /contracts: 4\s+\(4 covered, 0 uncovered\)/);
  assert.match(env.body, /act2-regrow-camera-projects-the-existing-cursor\s+COVERED/);
  assert.match(env.body, /act2-regrow-camera-owns-input-only-until-settle\s+COVERED/);
  assert.match(env.body, /scanned 2 test file\(s\)/);
  assert.match(env.body, /worldCamera\.act2Bottom\.node\.ts/);
  assert.match(env.body, /TreeView\.act2Camera\.test\.tsx/);
});

// ---------------------------------------------------------------------------
// `storytree coverage --totals` — asking where the backlog stands, on a green run
// ---------------------------------------------------------------------------

const CTX = { specFilesWalked: 281, scanned: 112 } as const;

/** A sweep stub — the disk walk is the composition root's, so the report is testable without it. */
function totalsDeps(
  uncovered: string[],
  unbound: string[],
  context: { specFilesWalked: number; scanned: number } = CTX,
) {
  return {
    sweep: () => ({ verdict: evaluateCoverageDrain({ uncovered, unbound }, context), context }),
  };
}

test("coverage --totals prints both axes against both ceilings, with the aperture", () => {
  const env = coverageTotalsCommand(totalsDeps(["a/b", "c/d"], []));
  assert.equal(env.ok, true);
  assert.match(env.body, /uncovered=2\/103/);
  assert.match(env.body, /unbound=0\/1/);
  assert.match(env.body, /measured over 281 spec file\(s\) walked, 112 capability\(ies\) scanned/);
  assert.match(env.body, /NEVER SUM THESE/);
});

test("coverage --totals REPORTS and never gates — a breach still exits ok", () => {
  // The ceiling is enforced by `coverage-drain.test.ts` inside `pnpm -r test`. A reporting verb that
  // could fail would be a second, unlegislated gate on the same numbers — and, worse, one no ADR
  // legislated, which is exactly what ADR-0311 D5 exists to prevent.
  const env = coverageTotalsCommand(totalsDeps(contractsOver(), []));
  assert.equal(env.ok, true, "a breached ceiling must still exit 0 — this reports, it does not gate");
  assert.match(env.body, /level: red/);
  assert.match(env.body, /uncovered=104\/103/);
});

test("coverage --totals says so when NOTHING was scanned, rather than printing a false clean", () => {
  // The trap that motivated the verb: the throwaway sweep script reports `specFilesWalked=0 scanned=0
  // uncovered=0` when cwd is the package rather than the repo root, which reads exactly like a
  // drained backlog. Zeros here measure the CHECKOUT, and the report has to say which claim it is.
  const env = coverageTotalsCommand(totalsDeps([], [], { specFilesWalked: 0, scanned: 0 }));
  assert.equal(env.ok, true);
  assert.match(env.body, /NOTHING WAS SCANNED/);
  assert.match(env.body, /measure the CHECKOUT, not the backlog/);
});

test("coverage --totals publishes no summed figure", () => {
  // uncovered counts CONTRACTS, unbound counts CAPABILITIES; a ceiling read off the sum is
  // satisfiable by work that drained nothing (measured: the sum held at 121 across a real drain).
  const env = coverageTotalsCommand(totalsDeps(["a/b", "c/d"], ["e"]));
  assert.doesNotMatch(env.body, /\b3 (gaps|total|items)\b/i);
  assert.match(env.body, /uncovered=2\/103 · unbound=1\/1/);
});

test("end-to-end: `coverage --totals` walks the REAL corpus and reports a live population", async () => {
  // Grounds the whole pipeline through the CLI boundary — argv → CLI_OPTIONS → the composed sweep.
  // Deliberately asserts the SHAPE and a non-empty population rather than today's exact counts: the
  // baseline is a fact on disk that legitimately moves as contracts land, and the ceiling assertion in
  // `coverage-drain.test.ts` is what pins the numbers.
  const env = await run(["coverage", "--totals"], { store: new InMemoryStore() });
  assert.equal(env.ok, true);
  const walked = /measured over (\d+) spec file\(s\) walked, (\d+) capability\(ies\) scanned/.exec(env.body);
  assert.ok(walked !== null, `no aperture line in:\n${env.body}`);
  assert.ok(Number(walked[1]) > 0, "the real corpus must walk >0 spec files — 0 would be a false clean");
  assert.ok(Number(walked[2]) > 0, "the real corpus must scan >0 capabilities");
  assert.match(env.body, /uncovered=\d+\/103 · unbound=\d+\/1/);
});
