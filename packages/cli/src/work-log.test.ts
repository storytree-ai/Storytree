import test from "node:test";
import assert from "node:assert/strict";

import type { StoreEvent } from "@storytree/storage-protocol";

import { foldWorkLog, renderCausedBy, renderWorkLog } from "./work-log.js";

/**
 * The READER half of ADR-0350's causal edge (D3/D4).
 *
 * D4 refuses a dormant field: the column lands only alongside a producer AND a reader, "proven by a
 * test that fails when the stamp is dropped". These are that test. The one that matters most is
 * `a DROPPED stamp changes what the reader prints` — delete the `causedBy` spread in `driveNode`
 * (packages/drive/src/node-build.ts) or in `PgWorkStore.appendEvent` and the rendered line silently
 * becomes "not recorded"; this asserts the two renderings are different text, so that silence has
 * somewhere to go red.
 */

const AT = "2026-08-14T04:12:55.123Z";

function workEventRow(over: Partial<StoreEvent> & { doc: unknown }): StoreEvent {
  return {
    seq: 1,
    id: "run-1:u1",
    kind: "work",
    type: "created",
    actor: "tester@example.com",
    at: AT,
    ...over,
  } as StoreEvent;
}

const BUILDING = { unitId: "u1", event: "building", runId: "run-1", tier: "capability" };

test("D3: a stamped edge renders as <stream>#<seq>, an unstamped one as the WORDS 'not recorded'", () => {
  assert.equal(renderCausedBy({ stream: "claim_event", seq: 4412 }), "caused by: claim_event#4412");
  assert.equal(renderCausedBy(undefined), "caused by: not recorded");
});

test("D3: the unstamped rendering is never blank — a blank would read as 'nothing caused this'", () => {
  const rendered = renderCausedBy(undefined);
  assert.notEqual(rendered.trim(), "", "an empty string is the one thing D3 forbids");
  assert.match(rendered, /not recorded/);
});

test("a DROPPED stamp changes what the reader prints — the producer cannot go dark in silence", () => {
  const stamped = renderWorkLog({
    unitId: "u1",
    entries: foldWorkLog([
      workEventRow({ doc: BUILDING, causedBy: { stream: "claim_event", seq: 4412 } }),
    ]),
  });
  const dropped = renderWorkLog({
    unitId: "u1",
    entries: foldWorkLog([workEventRow({ doc: BUILDING })]),
  });

  assert.match(stamped, /caused by: claim_event#4412/);
  assert.doesNotMatch(stamped, /caused by: not recorded/);
  assert.match(dropped, /caused by: not recorded/);
  assert.doesNotMatch(dropped, /claim_event#/);
  assert.notEqual(stamped, dropped, "dropping the stamp must be VISIBLE in the render");
});

test("EVERY row carries a `caused by:` line — there is no branch that omits it", () => {
  const entries = foldWorkLog([
    workEventRow({ seq: 1, doc: BUILDING, causedBy: { stream: "claim_event", seq: 7 } }),
    workEventRow({ seq: 2, doc: { unitId: "u1", event: "retired" } }),
    workEventRow({ seq: 3, doc: { unitId: "u1", event: "proposed" } }),
  ]);
  const body = renderWorkLog({ unitId: "u1", entries });
  const causedLines = body.split("\n").filter((l) => l.trim().startsWith("caused by:"));
  assert.equal(causedLines.length, 3, "one per row, always");
  assert.equal(causedLines.filter((l) => l.includes("not recorded")).length, 2);
});

test("the fold carries an absent cause through as ABSENT — never widened to a null", () => {
  const [stamped, bare] = foldWorkLog([
    workEventRow({ seq: 1, doc: BUILDING, causedBy: { stream: "claim_event", seq: 9 } }),
    workEventRow({ seq: 2, doc: BUILDING }),
  ]);
  assert.deepEqual(stamped?.causedBy, { stream: "claim_event", seq: 9 });
  assert.equal(bare?.causedBy, undefined);
  assert.ok(!("causedBy" in (bare as object)), "absent means the key is not there at all");
});

test("the fold keeps only THIS unit's rows, oldest first", () => {
  const entries = foldWorkLog(
    [
      workEventRow({ seq: 3, doc: { unitId: "u1", event: "retired" } }),
      workEventRow({ seq: 1, doc: { unitId: "u2", event: "building" } }),
      workEventRow({ seq: 2, doc: BUILDING }),
    ],
    "u1",
  );
  assert.deepEqual(entries.map((e) => e.seq), [2, 3]);
  assert.ok(entries.every((e) => e.unitId === "u1"));
});

test("SCOPE FENCE: verdict/usage rows are dropped — their causal columns are never SELECTed", () => {
  // PgWorkStore lifts caused_by_* for work_event ONLY. Rendering "not recorded" beside a verdict row
  // would report an unmeasured field as measured — the same lie as the blank, one level up.
  const entries = foldWorkLog([
    workEventRow({ seq: 1, doc: BUILDING }),
    workEventRow({ seq: 2, kind: "signing", doc: { unitId: "u1", outcome: "pass" } }),
    workEventRow({ seq: 3, kind: "usage", doc: { unitId: "u1", runId: "run-1" } }),
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.event, "building");
});

test("a malformed work doc is SKIPPED, not rendered as a causeless build", () => {
  const entries = foldWorkLog([
    workEventRow({ seq: 1, doc: { unitId: "u1", event: "not-a-lifecycle-word" } }),
    workEventRow({ seq: 2, doc: BUILDING }),
  ]);
  assert.deepEqual(entries.map((e) => e.seq), [2]);
});

test("an empty log says so WITHOUT implying the unit was never built", () => {
  const body = renderWorkLog({ unitId: "ghost", entries: [] });
  assert.match(body, /no work events for "ghost"/);
  assert.match(body, /not the same as a unit that was never built/);
});

test("the footer counts what is recorded and states that absence is UNDER-REPORTING, not zero cause", () => {
  const body = renderWorkLog({
    unitId: "u1",
    entries: foldWorkLog([
      workEventRow({ seq: 1, doc: BUILDING, causedBy: { stream: "claim_event", seq: 1 } }),
      workEventRow({ seq: 2, doc: { unitId: "u1", event: "retired" } }),
    ]),
  });
  assert.match(body, /1 of 2 event\(s\) above name the event that caused them/);
  assert.match(body, /does not mean nothing caused the event/);
});
