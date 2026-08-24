import test from "node:test";
import assert from "node:assert/strict";

import { auditGateCriterionBindings } from "./gate-criterion-audit.js";
import { canonicalUatCriterionContent, criterionRevisionId } from "./uat-test-criteria.js";

// A criterion id must match the `uatc_<hex>` shape the UAT parser mints, or the gate command's
// scanner would never see it and every test below would pass vacuously.
const LIVE = "uatc_1111111111111111111111aa";
const DELETED = "uatc_2222222222222222222222bb";

/**
 * Stamp a criterion item with its id AND the revision id its own content binds — the parser refuses a
 * revision that does not hash the item, so a hand-written one would make every fixture throw.
 */
function leg(text: string, id: string, proofGateId?: string): string {
  const item = proofGateId === undefined ? text : `${text} _(proof-gate: ${proofGateId})_`;
  return `${item} _(criterion-id: ${id})_ _(revision-id: ${criterionRevisionId(canonicalUatCriterionContent(item))})_`;
}

function story(criteria: string, gates: string): string {
  return [
    "---",
    "id: s",
    "---",
    "",
    "## UAT Test Criteria",
    "",
    criteria,
    "",
    "## Reliability Gates",
    "",
    gates,
    "",
  ].join("\n");
}

const witnessCmd = (id: string): string =>
  `pnpm --filter @storytree/drive exec node --import tsx src/uat-drive-witness.check.ts s ${id}`;

// ---------------------------------------------------------------------------
// (a) orphan-gate — a LIVE gate naming a criterion the story no longer declares
// ---------------------------------------------------------------------------

test("a live gate naming a DELETED criterion is reported as orphan-gate", () => {
  const body = story(
    leg("1. **A live leg** _(witness: machine)_", LIVE),
    `1. **The dead witness** _(gate: observe)_ \`${witnessCmd(DELETED)}\`.`,
  );
  const rows = auditGateCriterionBindings([{ storyId: "s", sourcePath: "stories/s/story.md", body }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.finding, "orphan-gate");
  assert.equal(rows[0]!.gateId, "s#gate-1");
  assert.equal(rows[0]!.criterionId, DELETED);
  assert.match(rows[0]!.detail, /never pass/);
});

test("the SAME gate marked `(retired)` is no longer reported — the marker is what clears it", () => {
  const body = story(
    leg("1. **A live leg** _(witness: machine)_", LIVE),
    `1. **The dead witness** _(gate: observe)_ _(retired)_ \`${witnessCmd(DELETED)}\`.`,
  );
  assert.deepEqual(auditGateCriterionBindings([{ storyId: "s", sourcePath: "p", body }]), []);
});

test("a gate naming a criterion the story DOES declare is clean", () => {
  const body = story(
    leg("1. **A live leg** _(witness: machine)_", LIVE),
    `1. **The live witness** _(gate: observe)_ \`${witnessCmd(LIVE)}\`.`,
  );
  assert.deepEqual(auditGateCriterionBindings([{ storyId: "s", sourcePath: "p", body }]), []);
});

test("an ordinary suite gate naming no criterion id is not audited at all", () => {
  const body = story(
    leg("1. **A live leg** _(witness: machine)_", LIVE),
    "1. **The suite is green** _(gate: observe)_ `pnpm --filter demo test`.",
  );
  assert.deepEqual(auditGateCriterionBindings([{ storyId: "s", sourcePath: "p", body }]), []);
});

// ---------------------------------------------------------------------------
// (b) retired-binding — a LIVE criterion pointing AT a retired gate
// ---------------------------------------------------------------------------

test("a live criterion bound to a RETIRED gate is reported as retired-binding", () => {
  const body = story(
    leg("1. **A live leg** _(witness: machine)_", LIVE, "s#gate-1"),
    `1. **Withdrawn** _(gate: observe)_ _(retired)_ \`${witnessCmd(LIVE)}\`.`,
  );
  const rows = auditGateCriterionBindings([{ storyId: "s", sourcePath: "p", body }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.finding, "retired-binding");
  assert.equal(rows[0]!.gateId, "s#gate-1");
  assert.equal(rows[0]!.criterionId, LIVE);
});

test("the same binding onto a LIVE gate is clean — the retirement is what makes it a finding", () => {
  const body = story(
    leg("1. **A live leg** _(witness: machine)_", LIVE, "s#gate-1"),
    `1. **Live** _(gate: observe)_ \`${witnessCmd(LIVE)}\`.`,
  );
  assert.deepEqual(auditGateCriterionBindings([{ storyId: "s", sourcePath: "p", body }]), []);
});

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

test("rows are ordered by source path then gate id, never by reader traversal order", () => {
  const mk = (id: string): string =>
    story(
      leg("1. **A live leg** _(witness: machine)_", LIVE),
      `1. **Dead** _(gate: observe)_ \`${witnessCmd(id)}\`.`,
    );
  const rows = auditGateCriterionBindings([
    { storyId: "s", sourcePath: "stories/z/story.md", body: mk(DELETED) },
    { storyId: "s", sourcePath: "stories/a/story.md", body: mk(DELETED) },
  ]);
  assert.deepEqual(
    rows.map((r) => r.sourcePath),
    ["stories/a/story.md", "stories/z/story.md"],
  );
});

test("an unparseable story THROWS rather than being skipped as clean", () => {
  const body = story(
    leg("1. **A live leg** _(witness: machine)_", LIVE),
    "1. **Bad kind** _(gate: rubberstamp)_ `pnpm test`.",
  );
  assert.throws(() => auditGateCriterionBindings([{ storyId: "s", sourcePath: "p", body }]));
});

test("an empty corpus returns no rows (and the audit is not confused by it)", () => {
  assert.deepEqual(auditGateCriterionBindings([]), []);
});
