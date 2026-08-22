import test from "node:test";
import assert from "node:assert/strict";

import { analyzeObservedTests } from "@storytree/orchestrator";

import {
  contractlessCommand,
  foldCorpusTotals,
  foldUnitTotals,
  looksLikeTestPath,
  type BehaviourClaimUnit,
} from "./coverage-claims.js";

/**
 * `storytree coverage --contractless` — the INVERSE report (test ⇒ contract).
 *
 * The headline red→green: asked about a capability whose surface asserts a behaviour none of its
 * declared contracts names, the report says CONTRACTLESS and names the behaviour — so an ADR-0294 D2
 * author can see, before writing a rationale, that no lower-tier node is available to cite.
 *
 * Pure-by-injection: every unit here is a fixture, so no test touches disk, the store, or the corpus.
 */

/** Build a fixture unit whose surface is one file of real, parsed test source. */
function unit(
  unitId: string,
  contractIds: string[],
  files: { file: string; src: string }[],
): BehaviourClaimUnit {
  return {
    unitId,
    tier: "capability",
    contractIds,
    files: files.map((f) => ({ file: f.file, observed: analyzeObservedTests(f.src) })),
  };
}

const CONTENTION_SRC = `
  test("claim (REFUSED): a live claim from another session names the holder", () => {
    assert.equal(res.acquired, false);
  });
  test("upgrade (held by a LIVE other session): the session QUEUES behind the holder", () => {
    assert.equal(res.queued, true);
  });
`;

const BOUND_SRC = `
  test("release-claims-by-branch-clears-the-branch: every claim on the branch goes", () => {
    assert.equal(rows.length, 0);
  });
`;

const CLAIM_STORE = unit(
  "claim-store-work-time",
  ["release-claims-by-branch-clears-the-branch"],
  [
    { file: "packages/notice-board/src/claim.test.ts", src: BOUND_SRC },
    { file: "packages/notice-board/src/store/claim-store.test.ts", src: CONTENTION_SRC },
  ],
);

test("coverage --contractless <cap>: names the asserted behaviours NO declared contract claims", () => {
  const env = contractlessCommand("claim-store-work-time", { loadUnits: () => [CLAIM_STORE] });
  assert.equal(env.ok, true);
  assert.match(env.body, /2 CONTRACTLESS/);
  assert.match(env.body, /claim \(REFUSED\)[\s\S]*CONTRACTLESS/);
  assert.match(env.body, /upgrade \(held by a LIVE other session\)[\s\S]*CONTRACTLESS/);
  // The one behaviour a contract DOES claim is reported as claimed, by id — the citation is available.
  assert.match(env.body, /claimed by `release-claims-by-branch-clears-the-branch`/);
});

test("coverage --contractless <cap>: authoring the contract flips those same behaviours to claimed", () => {
  // The green half of the pair above: the report is what tells the author the citation now exists.
  const bound = unit(
    "claim-store-work-time",
    ["release-claims-by-branch-clears-the-branch", "claim-contention-refuses-or-queues"],
    [
      { file: "packages/notice-board/src/claim.test.ts", src: BOUND_SRC },
      {
        file: "packages/notice-board/src/store/claim-store.test.ts",
        src: `
          describe("claim-contention-refuses-or-queues: the two contention arms", () => {
            test("claim (REFUSED): a live claim from another session names the holder", () => {
              assert.equal(res.acquired, false);
            });
            test("upgrade (held by a LIVE other session): the session QUEUES behind the holder", () => {
              assert.equal(res.queued, true);
            });
          });
        `,
      },
    ],
  );
  const env = contractlessCommand("claim-store-work-time", { loadUnits: () => [bound] });
  assert.match(env.body, /0 CONTRACTLESS/);
  assert.equal((env.body.match(/claimed by `claim-contention-refuses-or-queues`/g) ?? []).length, 2);
});

test("coverage --contractless <test-path>: answers 'which node claims this test?' per capability", () => {
  // The shape an ADR-0294 D2 author actually holds: a running test, needing a node.
  const sibling = unit(
    "notice-board-contention",
    ["nb-contention-refuses-and-names-the-holder"],
    [{ file: "packages/notice-board/src/store/claim-store.test.ts", src: CONTENTION_SRC }],
  );
  const env = contractlessCommand("packages/notice-board/src/store/claim-store.test.ts", {
    loadUnits: () => [CLAIM_STORE, sibling],
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /in the proof surface of 2 capability\(ies\)/);
  assert.match(env.body, /claim-store-work-time/);
  assert.match(env.body, /notice-board-contention/);
  // The file's OTHER capability is not consulted for this one: each fold is per capability, because
  // "claimed" means claimed by a contract of the node you would cite.
  assert.match(env.body, /── claim-store-work-time \(1 declared contract\(s\)\) — 0 claimed, 2 contractless/);
});

test("coverage --contractless <test-path>: an unscanned file REFUSES rather than reporting a false gap", () => {
  // The refusal must not read as "nothing claims this". A capability with contracts but no `real:`
  // arm is outside the scanned population (the same filter `check:coverage` applies), so its file
  // reaches this branch while its contracts are perfectly real — `render-core` is the live case.
  const env = contractlessCommand("packages/nowhere/src/orphan.test.ts", {
    loadUnits: () => [CLAIM_STORE],
  });
  assert.equal(env.ok, false, "an unscanned file is a refusal, not a silent empty report");
  assert.match(env.body, /NOT a finding of 'claimed by nothing'/);
  assert.match(env.body, /carries no `real:` arm/, "the second reading must be named, or the first is a lie");
});

test("coverage --contractless: the corpus sweep totals and ranks by citation gap", () => {
  const small = unit("small-cap", ["sc-one"], [{ file: "packages/x/src/x.test.ts", src: BOUND_SRC }]);
  const env = contractlessCommand(undefined, { loadUnits: () => [CLAIM_STORE, small] });
  assert.equal(env.ok, true);
  assert.match(env.body, /scanned: 2 capability\(ies\)/);
  assert.match(env.body, /asserted behaviours: 4 {2}\(1 claimed by a declared contract, 3 CONTRACTLESS/);
  // Ranked worst-first, so the largest gap is the first row under the heading.
  const ranked = env.body.slice(env.body.indexOf("largest citation gap"));
  assert.ok(
    ranked.indexOf("claim-store-work-time") < ranked.indexOf("small-cap"),
    "the capability with the larger gap ranks first",
  );
});

test("coverage --contractless: every form carries the not-a-worklist caveat", () => {
  // Without it the report reads as a backlog, and draining it would mean one contract per test —
  // the model this instrument exists to avoid endorsing.
  for (const target of [undefined, "claim-store-work-time"]) {
    const env = contractlessCommand(target, { loadUnits: () => [CLAIM_STORE] });
    assert.match(env.body, /NOT a defect/, `missing on target=${String(target)}`);
    assert.match(env.body, /never as a row to drain/, `missing on target=${String(target)}`);
  }
});

test("coverage --contractless: an unknown capability refuses and names the scan filter", () => {
  const env = contractlessCommand("no-such-capability", { loadUnits: () => [CLAIM_STORE] });
  assert.equal(env.ok, false);
  assert.match(env.body, /no scanned capability "no-such-capability"/);
  assert.match(env.body, /a limit of the instrument and not a statement about that capability/);
});

test("coverage --contractless: an empty corpus reports nothing to classify rather than a false clean", () => {
  const env = contractlessCommand(undefined, { loadUnits: () => [] });
  assert.equal(env.ok, true);
  assert.match(env.body, /nothing to classify/);
});

test("looksLikeTestPath: a path routes to the file report, a bare id to the capability report", () => {
  assert.equal(looksLikeTestPath("packages/x/src/y.test.ts"), true);
  assert.equal(looksLikeTestPath("y.test.tsx"), true);
  assert.equal(looksLikeTestPath("claim-store-work-time"), false);
});

test("foldUnitTotals / foldCorpusTotals: the per-unit rows sum to the corpus totals", () => {
  const small = unit("small-cap", ["sc-one"], [{ file: "packages/x/src/x.test.ts", src: BOUND_SRC }]);
  const corpus = foldCorpusTotals([CLAIM_STORE, small]);
  const rows = [CLAIM_STORE, small].map(foldUnitTotals);
  assert.equal(corpus.contractless, rows.reduce((n, r) => n + r.contractless, 0));
  assert.equal(corpus.claimed, rows.reduce((n, r) => n + r.claimed, 0));
  assert.equal(corpus.files, 3, "distinct surface files across the corpus");
});
