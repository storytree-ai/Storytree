// green-gate-audit.test.ts — pins the `green-gate` capability's four declared contracts.
//
// ADR-0486: the proof is deliberately SPLIT, not stretched. Contracts 2, 3 and 4 are pure static-YAML
// audits over the real `.github/workflows/ci.yml`, fully assertable offline. Contract 1 is MIXED — its
// repo-owned half (the `verify` checkout step declares no `ref:` override, so it inherits
// actions/checkout's `pull_request` merge-ref default) is assertable and is exactly what this test
// pins; its platform half (that GitHub actually produces a correct merge commit) is PLATFORM TRUST and
// is deliberately EXCLUDED from this unit's verdict rather than folded into a signed green that could
// never honestly cover it.
//
// Every function under test is a PURE reader: text in, data out. Nothing here touches disk except this
// test file's own read of the real workflow — the audit module itself never opens a file.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  checkoutOverridesRef,
  jobDeclaresNeeds,
  jobRunsCheck,
  softStepLines,
} from "./green-gate-audit.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** The real CI workflow this capability audits — never a mirror, never re-derived. */
function readCiYaml(): string {
  return readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
}

// ── fixtures ───────────────────────────────────────────────────────────────────
//
// Small literal workflows, each isolating ONE mechanism from the real (larger, and liable to change)
// ci.yml, so a failure here names the mechanism rather than drift in the real file. The real-file
// assertions below prove the property that actually matters; these prove the reader isn't vacuous.

const FIXTURE_CLEAN_CHECKOUT = `
jobs:
  verify:
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          fetch-depth: 2
      - name: Lint
        run: pnpm lint
`;

const FIXTURE_PINNED_CHECKOUT = `
jobs:
  verify:
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - name: Lint
        run: pnpm lint
`;

const FIXTURE_SOFT_STEP = `
jobs:
  verify:
    steps:
      - name: Lint
        run: pnpm lint
  automerge:
    steps:
      - name: Merge
        continue-on-error: true
        run: pnpm merge
`;

const FIXTURE_CHECKS = `
jobs:
  verify:
    steps:
      - name: Guidance
        run: pnpm check:guidance
      - name: Agents
        run: pnpm check:agents
`;

const FIXTURE_MISSING_CHECK = `
jobs:
  verify:
    steps:
      - name: Guidance
        run: pnpm check:guidance
`;

const FIXTURE_NEEDS_VERIFY = `
jobs:
  verify:
    steps:
      - name: Lint
        run: pnpm lint
  automerge:
    needs: verify
    steps:
      - name: Merge
        run: pnpm merge
`;

const FIXTURE_NO_NEEDS = `
jobs:
  verify:
    steps:
      - name: Lint
        run: pnpm lint
  automerge:
    steps:
      - name: Merge
        run: pnpm merge
`;

// ── contract 1 ───────────────────────────────────────────────────────────────────

describe("proves-against-merge-ref: verify's checkout does not override the pull_request merge-ref default", () => {
  it("the real verify job's checkout step declares no ref: override", () => {
    // The ABSENCE is what carries the behaviour: actions/checkout on a pull_request event checks out
    // the merge commit of branch+main by default, and a `ref:` input pinning the head sha is the one
    // edit that would silently convert the job back to branch-alone.
    assert.equal(
      checkoutOverridesRef(readCiYaml(), "verify"),
      false,
      "a ref: input on the checkout step would pin the branch's own head sha, reintroducing the " +
        "whole 'local green, CI red' class this capability exists to close",
    );
  });

  it("the mechanism actually detects an override when one is present — not vacuously false", () => {
    assert.equal(checkoutOverridesRef(FIXTURE_CLEAN_CHECKOUT, "verify"), false);
    assert.equal(checkoutOverridesRef(FIXTURE_PINNED_CHECKOUT, "verify"), true);
  });

  it("scopes to the named job — a checkout override in a sibling job is not this job's problem", () => {
    assert.equal(checkoutOverridesRef(FIXTURE_PINNED_CHECKOUT, "automerge"), false);
  });
});

// ── contract 2 ───────────────────────────────────────────────────────────────────

describe("every-step-is-required: no step in the verify job is soft", () => {
  it("the real verify job declares no continue-on-error step", () => {
    assert.deepEqual(
      softStepLines(readCiYaml(), "verify"),
      [],
      "no step in verify may be continue-on-error — a green verify must mean every step passed",
    );
  });

  it("the real automerge job DOES carry soft steps — proving the reader isn't vacuously empty everywhere", () => {
    // Measured 2026-08-31: automerge's post-merge steps are deliberately fail-soft (they run after
    // the merge and cannot undo it) — every continue-on-error in the file lives there, never in verify.
    assert.ok(
      softStepLines(readCiYaml(), "automerge").length > 0,
      "automerge's fail-soft post-merge steps are real; a zero here would mean the reader sees nothing at all",
    );
  });

  it("the mechanism scopes strictly to the named job", () => {
    assert.deepEqual(softStepLines(FIXTURE_SOFT_STEP, "verify"), []);
    assert.equal(softStepLines(FIXTURE_SOFT_STEP, "automerge").length, 1);
  });
});

// ── contract 3 ───────────────────────────────────────────────────────────────────

describe("generated-views-in-sync: verify runs both generated-view checks", () => {
  it("the real verify job runs check:guidance and check:agents", () => {
    assert.equal(jobRunsCheck(readCiYaml(), "verify", "check:guidance"), true);
    assert.equal(jobRunsCheck(readCiYaml(), "verify", "check:agents"), true);
  });

  it("the mechanism reports false for a check the job does not actually run", () => {
    assert.equal(
      jobRunsCheck(readCiYaml(), "verify", "check:this-check-does-not-exist"),
      false,
      "a check nobody declared must never read as present",
    );
    assert.equal(jobRunsCheck(FIXTURE_MISSING_CHECK, "verify", "check:guidance"), true);
    assert.equal(jobRunsCheck(FIXTURE_MISSING_CHECK, "verify", "check:agents"), false);
  });

  it("both generated-view checks are also covered by contract 2 — neither is soft", () => {
    // check:guidance and check:agents are ordinary steps of the verify job; contract 2's assertion
    // that verify carries no continue-on-error step already covers them, so a regression that made
    // either one soft would red THAT test, not silently pass here.
    assert.deepEqual(softStepLines(readCiYaml(), "verify"), []);
  });
});

// ── contract 4 ───────────────────────────────────────────────────────────────────

describe("red-blocks-the-merge: automerge cannot run without a green verify", () => {
  it("the real automerge job declares needs: verify", () => {
    assert.equal(
      jobDeclaresNeeds(readCiYaml(), "automerge", "verify"),
      true,
      "automerge must declare needs: verify — there is no path to main that skips a green verify",
    );
  });

  it("the mechanism reports false when the needs edge is absent, and doesn't invent an edge", () => {
    assert.equal(jobDeclaresNeeds(FIXTURE_NEEDS_VERIFY, "automerge", "verify"), true);
    assert.equal(jobDeclaresNeeds(FIXTURE_NO_NEEDS, "automerge", "verify"), false);
    assert.equal(
      jobDeclaresNeeds(readCiYaml(), "automerge", "check:this-job-does-not-exist"),
      false,
    );
  });
});
