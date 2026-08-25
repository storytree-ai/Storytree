import test from "node:test";
import assert from "node:assert/strict";

import {
  WORK_HIERARCHY_SCHEMA_VERSION,
  WorkHierarchySnapshot,
} from "@storytree/library";

import { judgeHierarchyDrift, type HierarchyDriftInputs } from "./hierarchy-drift.js";

/**
 * The PURE judge behind `check:hierarchy-drift`. Literals only — no store, no filesystem, no git, no
 * credential. The rung next door is the thin gatherer this proves the rules of.
 */

const C1 = "uatc_000000000000000000000001";
const R1 = "uatr1:0000000000000001";
const R2 = "uatr1:00000000000000ff";

const BASE_TREE = "1111111111111111111111111111111111111111";
const OTHER_TREE = "2222222222222222222222222222222222222222";

function snapshot(over: Record<string, unknown> = {}): WorkHierarchySnapshot {
  return WorkHierarchySnapshot.parse({
    schemaVersion: WORK_HIERARCHY_SCHEMA_VERSION,
    commitSha: "aaaaaaa",
    storiesTreeSha: BASE_TREE,
    generatedAt: "2026-08-20T00:00:00.000Z",
    generator: "hierarchy:load",
    stories: [
      {
        id: "demo",
        title: "Demo",
        outcome: "a demo",
        status: "building",
        proofMode: "UAT",
        uatWitness: "machine",
        building: false,
        capabilities: ["demo-cap"],
        uatTestCriteria: [{ criterionId: C1, revisionId: R1, title: "walk", witness: "machine" }],
        reliabilityGates: [{ id: "demo#gate-1", title: "green", kind: "observe" }],
      },
    ],
    capabilities: [
      {
        id: "demo-cap",
        storyId: "demo",
        title: "Cap",
        outcome: "a cap",
        status: "healthy",
        proofMode: "integration-test",
        contractCount: 1,
      },
    ],
    ...over,
  });
}

/** The happy shape: the store mirrors the base, and this checkout is standing on that same tree. */
function inputs(over: Partial<HierarchyDriftInputs> = {}): HierarchyDriftInputs {
  return {
    stored: snapshot(),
    checkout: snapshot({ generatedAt: "2026-08-26T00:00:00.000Z", generator: "check" }),
    baseRef: "origin/main",
    baseStoriesTreeSha: BASE_TREE,
    baseCommittedAt: "2026-08-19T00:00:00.000Z",
    headStoriesTreeSha: BASE_TREE,
    storiesDirty: false,
    ...over,
  };
}

const report = (v: { lines: readonly string[] }): string => v.lines.join("\n");

// ── the green ────────────────────────────────────────────────────────────────

test("hierarchy-drift-reports-its-denominators: a current, agreeing mirror passes and says how much it judged", () => {
  const verdict = judgeHierarchyDrift(inputs());
  assert.equal(verdict.ok, true);
  assert.equal(verdict.freshness, "current");
  assert.equal(verdict.agreement, "agrees");
  assert.deepEqual(verdict.counts, { stories: 1, capabilities: 1, criteria: 1, gates: 1 });
  // "no differences" and "read nothing" must not print the same way.
  assert.match(report(verdict), /1 stories, 1 capabilities, 1 criteria, 1 gates/);
});

// ── freshness: the failure this whole increment exists to make loud ──────────

test("hierarchy-drift-reds-when-the-mirror-lags-the-base-tree: a store stamped with an older stories tree FAILS", () => {
  // The regeneration on merge did not take. Every reader of the mirror is being served an older
  // tree, and the map's yellow would be an honest answer to an outdated question.
  const verdict = judgeHierarchyDrift(
    inputs({ baseStoriesTreeSha: OTHER_TREE, baseCommittedAt: "2026-08-25T00:00:00.000Z" }),
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.freshness, "behind");
  assert.match(report(verdict), /does NOT mirror origin\/main/);
  assert.match(report(verdict), /pnpm hierarchy:load/, "the failure names its own remedy");
  assert.match(report(verdict), /NEVER silently answered/);
  // The one race is named as the FIRST thing to check, so the commonest benign cause of this red
  // does not send a reader looking for a broken loader.
  assert.match(report(verdict), /CHECK THE RACE FIRST/);
});

test("hierarchy-drift-warns-rather-than-reds-when-this-checkout-is-the-stale-one", () => {
  // The mirror is NEWER than this checkout's origin/main: a sibling landed a stories change after
  // the last fetch. Redding would punish this session for someone else's landing — and its obvious
  // remedy would overwrite a CURRENT mirror with this checkout's older tree.
  const verdict = judgeHierarchyDrift(
    inputs({
      baseStoriesTreeSha: OTHER_TREE,
      baseCommittedAt: "2026-08-01T00:00:00.000Z",
      headStoriesTreeSha: OTHER_TREE,
    }),
  );
  assert.equal(verdict.ok, true, "the store's health is not in question here — this view is");
  assert.equal(verdict.freshness, "ahead-of-base");
  assert.match(report(verdict), /git fetch origin/);
  assert.match(report(verdict), /would OVERWRITE a current mirror/);
  assert.equal(verdict.agreement, "not-compared", "and agreement is declined, never assumed");
});

test("hierarchy-drift-reds-when-the-mirror-lags-the-base-tree: an unparseable timestamp falls to BEHIND, not to the warning", () => {
  // Fail-closed: a mirror that cannot PROVE it is current is treated as one that is not.
  const verdict = judgeHierarchyDrift(
    inputs({ baseStoriesTreeSha: OTHER_TREE, baseCommittedAt: "not a date" }),
  );
  assert.equal(verdict.ok, false);
  assert.equal(verdict.freshness, "behind");
});

// ── the content skew this arc is about ───────────────────────────────────────

test("hierarchy-drift-reds-on-a-changed-criterion-revision: the mirror and the tree at ONE tree id must agree", () => {
  // Seed from a known tree, agree — then move one criterion's revision id and watch it go red. This
  // IS the red-green: (criterionId, revisionId) is the binding the map's join turns on (ADR-0253).
  const green = judgeHierarchyDrift(inputs());
  assert.equal(green.ok, true);

  const moved = snapshot({
    generatedAt: "2026-08-26T00:00:00.000Z",
    generator: "check",
    stories: [
      {
        ...snapshot().stories[0]!,
        uatTestCriteria: [{ criterionId: C1, revisionId: R2, title: "walk", witness: "machine" }],
      },
    ],
  });
  const red = judgeHierarchyDrift(inputs({ checkout: moved }));

  assert.equal(red.ok, false);
  assert.equal(red.agreement, "differs");
  assert.deepEqual(
    red.differences.map((d) => ({ entity: d.entity, id: d.id, field: d.field })),
    [{ entity: "criterion", id: C1, field: "revisionId" }],
  );
  assert.match(report(red), /revisionId/, "the report names the field, not just a count");
  assert.match(report(red), new RegExp(C1));
});

// ── absence is never a pass ──────────────────────────────────────────────────

test("hierarchy-drift-never-reports-an-unread-mirror-as-clean: an unloaded store FAILS", () => {
  const verdict = judgeHierarchyDrift(inputs({ stored: null }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.freshness, "unloaded");
  assert.equal(verdict.counts, null);
  assert.match(report(verdict), /FAILURE, not a skip/);
});

test("hierarchy-drift-never-reports-an-unread-mirror-as-clean: an EMPTY projection FAILS", () => {
  // Zero is never this repo's tree; judging nothing and reporting green is the vacuous pass.
  const verdict = judgeHierarchyDrift(
    inputs({ stored: snapshot({ stories: [], capabilities: [] }) }),
  );
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.counts, { stories: 0, capabilities: 0, criteria: 0, gates: 0 });
  assert.match(report(verdict), /ZERO stories/);
  assert.match(report(verdict), /wrong database/);
});

test("hierarchy-drift-never-reports-an-unread-mirror-as-clean: an unresolvable base ref FAILS rather than answering", () => {
  const verdict = judgeHierarchyDrift(inputs({ baseStoriesTreeSha: null }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.freshness, "unreadable-base");
  assert.match(report(verdict), /never judged/);
  assert.match(report(verdict), /git fetch/);
});

test("hierarchy-drift-never-reports-an-unread-mirror-as-clean: a schema-version gap FAILS instead of diffing across it", () => {
  const verdict = judgeHierarchyDrift(
    inputs({ stored: snapshot({ schemaVersion: WORK_HIERARCHY_SCHEMA_VERSION + 1 }) }),
  );
  assert.equal(verdict.ok, false);
  assert.match(report(verdict), /schema version/);
  assert.equal(
    verdict.differences.length,
    0,
    "differences across a version gap describe the gap, not the tree, so none are reported",
  );
});

// ── the aperture, stated rather than implied ─────────────────────────────────

test("hierarchy-drift-names-a-narrowed-comparison-rather-than-passing-it: a branch editing stories/ is NOT COMPARED, in those words", () => {
  const verdict = judgeHierarchyDrift(inputs({ headStoriesTreeSha: OTHER_TREE }));
  assert.equal(verdict.ok, true, "freshness still holds — the mirror is not the thing that moved");
  assert.equal(verdict.agreement, "not-compared");
  assert.match(report(verdict), /AGREEMENT NOT COMPARED/);
  assert.match(report(verdict), /not a pass over the rows/);
  assert.match(verdict.notComparedBecause ?? "", /differs from the tree the store mirrors/);
});

test("hierarchy-drift-names-a-narrowed-comparison-rather-than-passing-it: a DIRTY stories/ is not compared either", () => {
  // An unstaged edit is in no tree id, so the tree ids can match while the files do not — comparing
  // would report a store that had 'drifted' from a change nobody committed.
  const verdict = judgeHierarchyDrift(inputs({ storiesDirty: true }));
  assert.equal(verdict.agreement, "not-compared");
  assert.match(verdict.notComparedBecause ?? "", /uncommitted/);
});

test("hierarchy-drift-names-a-narrowed-comparison-rather-than-passing-it: an unprojectable checkout is not compared either", () => {
  const verdict = judgeHierarchyDrift(inputs({ checkout: null }));
  assert.equal(verdict.agreement, "not-compared");
  assert.match(verdict.notComparedBecause ?? "", /could not be projected/);
});

test("hierarchy-drift-reports-its-denominators: every non-pass verdict carries a remedy line", () => {
  const failures = [
    inputs({ stored: null }),
    inputs({ stored: snapshot({ stories: [], capabilities: [] }) }),
    inputs({ baseStoriesTreeSha: null }),
    inputs({ baseStoriesTreeSha: OTHER_TREE, baseCommittedAt: "2026-08-25T00:00:00.000Z" }),
    inputs({ stored: snapshot({ schemaVersion: 99 }) }),
  ];
  for (const input of failures) {
    const verdict = judgeHierarchyDrift(input);
    assert.equal(verdict.ok, false);
    assert.match(
      report(verdict),
      /pnpm hierarchy:load|git fetch/,
      "a red that names no repair is a red the next session re-derives from scratch",
    );
  }
});
