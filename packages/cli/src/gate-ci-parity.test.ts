import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { GATE_PLAN } from "./gate-order.js";
import {
  ciContentChecks,
  computeGateCiParity,
  diagnoseStaleBranch,
  extractPnpmInvocations,
  localGatePlanTokens,
  normalizeContentStep,
  REF_DELTA,
} from "./gate-ci-parity.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** The real CI workflow this capability holds the local gate to. */
function readCiYaml(): string {
  return readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
}

// ── a small literal workflow fixture — pins the extraction/normalisation mechanism ──
// in isolation from the real (larger, and liable to change) ci.yml, so a failure here
// names the MECHANISM rather than a drift in either real file.
const FIXTURE_WORKFLOW = `
jobs:
  verify:
    steps:
      - name: Lint
        run: pnpm lint
      - name: Boundaries
        run: pnpm check:boundaries
      - name: Multi-line
        run: |
          git fetch origin
          pnpm check:hierarchy-drift
      # a comment mentioning pnpm ci:affected must never be read as a step
      - name: Install
        run: pnpm install --frozen-lockfile
  automerge:
    steps:
      - name: Ingest
        run: pnpm --filter @storytree/notice-board exec tsx src/store/ingest-merge.ts
`;

// ── mechanism: extractPnpmInvocations ───────────────────────────────────────────

it("extractPnpmInvocations reads only the named job's pnpm lines, in order, skipping comments", () => {
  const verify = extractPnpmInvocations(FIXTURE_WORKFLOW, "verify");
  assert.deepEqual(verify, [
    "lint",
    "check:boundaries",
    "check:hierarchy-drift",
    "install --frozen-lockfile",
  ]);
});

it("extractPnpmInvocations never leaks a sibling job's steps into the named job", () => {
  const verify = extractPnpmInvocations(FIXTURE_WORKFLOW, "verify");
  assert.ok(
    !verify.some((line) => line.includes("notice-board")),
    "the automerge job's ingest step must not appear when reading the verify job",
  );
  const automerge = extractPnpmInvocations(FIXTURE_WORKFLOW, "automerge");
  assert.deepEqual(automerge, [
    "--filter @storytree/notice-board exec tsx src/store/ingest-merge.ts",
  ]);
});

// ── mechanism: normalizeContentStep ─────────────────────────────────────────────

it("normalizeContentStep maps each known content-check shape to its canonical token", () => {
  assert.equal(normalizeContentStep("lint"), "pnpm lint");
  assert.equal(normalizeContentStep("check:boundaries"), "check:boundaries");
  assert.equal(normalizeContentStep("check:web-experience-markers"), "check:web-experience-markers");
  assert.equal(normalizeContentStep("-r typecheck"), "pnpm -r typecheck");
  assert.equal(normalizeContentStep("-r --no-bail typecheck"), "pnpm -r typecheck");
  assert.equal(
    normalizeContentStep("${{ steps.affected.outputs.pnpm_args || '-r' }} typecheck"),
    "pnpm -r typecheck",
  );
  assert.equal(normalizeContentStep("-r test"), "pnpm -r test");
  assert.equal(
    normalizeContentStep("${{ steps.affected.outputs.pnpm_args || '-r' }} test"),
    "pnpm -r test",
  );
  assert.equal(normalizeContentStep("-r build"), "pnpm -r build");
  assert.equal(normalizeContentStep("ci:affected"), "pnpm ci:affected");
});

it("normalizeContentStep declares undefined for install/exec plumbing — never a content check", () => {
  assert.equal(normalizeContentStep("install --frozen-lockfile"), undefined);
  assert.equal(
    normalizeContentStep("--filter @storytree/notice-board exec tsx src/store/ingest-merge.ts"),
    undefined,
  );
  assert.equal(
    normalizeContentStep("-C packages/forest-world-r3f exec playwright install --with-deps chromium"),
    undefined,
  );
});

it("ciContentChecks composes extraction + normalisation into the tracked content-check set", () => {
  const checks = ciContentChecks(FIXTURE_WORKFLOW, "verify");
  assert.deepEqual(
    [...checks].sort(),
    ["check:boundaries", "check:hierarchy-drift", "pnpm lint"].sort(),
  );
});

// ── mechanism: localGatePlanTokens ──────────────────────────────────────────────

it("localGatePlanTokens derives the same canonical tokens from a GATE_PLAN-shaped list", () => {
  const tokens = localGatePlanTokens([
    { command: "pnpm lint", check: undefined },
    { command: "pnpm check:boundaries", check: "check:boundaries" },
    { command: "pnpm -r --no-bail typecheck", check: undefined },
    { command: "pnpm -r --no-bail test", check: undefined },
    { command: "pnpm check:mutation-diff", check: "check:mutation-diff" },
  ]);
  assert.deepEqual(
    [...tokens].sort(),
    ["check:boundaries", "check:mutation-diff", "pnpm -r test", "pnpm -r typecheck", "pnpm lint"].sort(),
  );
});

// ── mechanism: computeGateCiParity ──────────────────────────────────────────────

it("computeGateCiParity splits two token sets into shared / ci-only / local-only", () => {
  const parity = computeGateCiParity(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]));
  assert.deepEqual([...parity.sharedFloor].sort(), ["b", "c"]);
  assert.deepEqual([...parity.ciOnly].sort(), ["d"]);
  assert.deepEqual([...parity.localOnly].sort(), ["a"]);
});

// ── contract 1 ───────────────────────────────────────────────────────────────────

describe("declared-content-delta-is-two-way: the local gate plan and the CI verify job differ in both directions, by named steps", () => {
  it("the real GATE_PLAN and the real CI verify job share a floor, and each keeps steps the other lacks", () => {
    const local = localGatePlanTokens(GATE_PLAN);
    const ci = ciContentChecks(readCiYaml(), "verify");
    const parity = computeGateCiParity(local, ci);

    // Both directions of the delta are non-empty — this is the "two-way" the contract names.
    assert.ok(parity.localOnly.length > 0, "the local plan must keep at least one step CI does not run");
    assert.ok(parity.ciOnly.length > 0, "CI must keep at least one step the local plan does not run");

    // The local-only set, named: shared-environment checks CI deliberately never runs (the decay
    // ceiling is a session drain obligation, not a merge barrier — ADR-0252 D3), plus the two
    // seconds-cost checks CI has not yet been wired to run.
    assert.deepEqual(
      [...parity.localOnly].sort(),
      ["check:definition-adjudication", "check:desktop-route-coverage", "check:verification-decay"].sort(),
    );

    // The CI-only set, named: the one buildable target, and the affected-scope classifier itself.
    assert.deepEqual([...parity.ciOnly].sort(), ["pnpm -r build", "pnpm ci:affected"].sort());

    // The shared floor: every check both gates actually run, exactly.
    assert.deepEqual(
      [...parity.sharedFloor].sort(),
      [
        "check:adr-health",
        "check:agents",
        "check:boundaries",
        "check:contract-grammar",
        "check:ground-space",
        "check:guidance",
        "check:hierarchy-camps",
        "check:hierarchy-drift",
        "check:land-art",
        "check:library-dag-acyclic",
        "check:mirror-conformance",
        "check:mutation-diff",
        "check:ownership-totality",
        "check:palette-transcription",
        "check:web-engine",
        "check:web-experience-closure",
        "check:web-experience-markers",
        "check:web-grounding",
        "pnpm -r test",
        "pnpm -r typecheck",
        "pnpm lint",
      ].sort(),
    );
  });

  it("neither direction's named steps leak into the other — a step cannot be both shared and one-sided", () => {
    const local = localGatePlanTokens(GATE_PLAN);
    const ci = ciContentChecks(readCiYaml(), "verify");
    const parity = computeGateCiParity(local, ci);
    for (const name of parity.localOnly) {
      assert.ok(!parity.sharedFloor.includes(name), `${name} is declared local-only and must not also be shared`);
      assert.ok(!parity.ciOnly.includes(name), `${name} is declared local-only and must not also be ci-only`);
    }
    for (const name of parity.ciOnly) {
      assert.ok(!parity.sharedFloor.includes(name), `${name} is declared ci-only and must not also be shared`);
    }
  });
});

// ── contract 2 ───────────────────────────────────────────────────────────────────

describe("ref-delta-is-declared: HEAD-vs-merge-ref is a named, expected difference", () => {
  it("REF_DELTA names the local ref, the CI ref, and why they honestly differ", () => {
    assert.equal(typeof REF_DELTA.local, "string");
    assert.equal(typeof REF_DELTA.ci, "string");
    assert.equal(typeof REF_DELTA.reason, "string");

    assert.ok(/HEAD/.test(REF_DELTA.local), "the local ref must be named as HEAD");
    assert.ok(/merge/i.test(REF_DELTA.ci), "the CI ref must be named as a merge ref, not the branch's own HEAD");
    assert.notEqual(REF_DELTA.local, REF_DELTA.ci, "a declared delta must actually name two different refs");

    // The reason must be substantial enough to explain the delta, not a placeholder.
    assert.ok(
      REF_DELTA.reason.length > 20,
      "the reason must explain WHY the two refs are expected to differ, not just assert that they do",
    );
  });
});

// ── contract 3 ───────────────────────────────────────────────────────────────────

describe("stale-branch-surfaced: a branch behind main is diagnosed, not a silent CI surprise", () => {
  it("a branch with nothing behind main is not stale, and carries no remedy", () => {
    const upToDate = diagnoseStaleBranch({ ahead: 0, behind: 0 });
    assert.equal(upToDate.stale, false);
    assert.equal(upToDate.behind, 0);
    assert.equal(upToDate.remedy, undefined);

    const aheadOnly = diagnoseStaleBranch({ ahead: 4, behind: 0 });
    assert.equal(aheadOnly.stale, false);
    assert.equal(aheadOnly.remedy, undefined);
  });

  it("a branch behind main is diagnosed stale, naming the standard remedy and the count behind", () => {
    const stale = diagnoseStaleBranch({ ahead: 3, behind: 7 });
    assert.equal(stale.stale, true);
    assert.equal(stale.behind, 7);
    assert.ok(typeof stale.remedy === "string", "a stale branch must carry a remedy string");
    assert.ok(
      stale.remedy?.includes("git fetch origin && git merge origin/main"),
      "the remedy must be the standard one CLAUDE.md documents, not an invented one",
    );
    assert.ok(/re-gate|push/i.test(stale.remedy ?? ""), "the remedy must carry through to re-gating and pushing");
  });

  it("a single commit behind is still surfaced — staleness is not a magnitude threshold", () => {
    const barelyStale = diagnoseStaleBranch({ ahead: 0, behind: 1 });
    assert.equal(barelyStale.stale, true);
    assert.equal(barelyStale.behind, 1);
    assert.ok(typeof barelyStale.remedy === "string");
  });
});
