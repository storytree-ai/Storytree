import test from "node:test";
import assert from "node:assert/strict";

import {
  NoPathDisposition,
  SCOPE_EVENT_KIND,
  ScopeEventDoc,
  ScopeRefusal,
  ScopeSource,
} from "./index.js";

/**
 * The write-scope wall wire shapes (ADR-0446). Round-trip + reject, the shapes.test.ts discipline —
 * a reader `.safeParse()`s scope-DATA across the boundary, so drift must fail loudly here rather
 * than silently downstream, where capture is fail-silent and a dropped field just stops the count.
 */

const SILENT: ScopeEventDoc = {
  unitId: "cap-x",
  runId: "run-1",
  phase: "AUTHOR_TEST",
  source: "sdk-leaf",
  armed: true,
  refusals: [],
  noPathCalls: 0,
  noPathDisposition: "refused",
};

const FIRED: ScopeEventDoc = {
  ...SILENT,
  phase: "IMPLEMENT",
  refusals: [
    { kind: "scope", tool: "Write", path: "src/x.test.ts", reason: "may not write in IMPLEMENT" },
    { kind: "outside-workspace", tool: "Write", path: "../elsewhere.ts" },
  ],
  noPathCalls: 2,
};

test("scope-event-kind: the stream is its own store kind, not a verdict field", () => {
  assert.equal(SCOPE_EVENT_KIND, "scope");
});

test("scope-event-round-trip: an armed-and-silent slice parses with an EMPTY refusal list", () => {
  const parsed = ScopeEventDoc.parse(SILENT);
  assert.deepEqual(parsed, SILENT);
  // The whole point of the stream: a zero is a MEASUREMENT that survives the boundary.
  assert.deepEqual(parsed.refusals, []);
  assert.equal(parsed.armed, true);
});

test("scope-event-round-trip: a fired slice keeps every refusal, in order, with its kind", () => {
  const parsed = ScopeEventDoc.parse(FIRED);
  assert.deepEqual(parsed, FIRED);
  assert.equal(parsed.refusals.length, 2);
  assert.equal(parsed.refusals[0]?.kind, "scope");
  assert.equal(parsed.refusals[1]?.kind, "outside-workspace");
});

test("scope-event-armed: `armed: false` is not a shape this stream admits", () => {
  // A row claiming to describe a wall that was not there is not a measurement anyone took.
  const refused = ScopeEventDoc.safeParse({ ...SILENT, armed: false });
  assert.equal(refused.success, false);
});

test("scope-event-armed: the marker is REQUIRED — an unmarked row cannot pass as a zero", () => {
  const { armed: _dropped, ...unmarked } = SILENT;
  assert.equal(ScopeEventDoc.safeParse(unmarked).success, false);
});

test("scope-event-no-path: the count and its disposition are both required", () => {
  const { noPathCalls: _c, ...noCount } = SILENT;
  assert.equal(ScopeEventDoc.safeParse(noCount).success, false);
  const { noPathDisposition: _d, ...noDisposition } = SILENT;
  assert.equal(ScopeEventDoc.safeParse(noDisposition).success, false);
});

test("scope-event-no-path: EVERY disposition is admitted — the disagreement is the subject", () => {
  for (const disposition of NoPathDisposition.options) {
    const parsed = ScopeEventDoc.parse({ ...SILENT, noPathDisposition: disposition });
    assert.equal(parsed.noPathDisposition, disposition);
  }
  // `not-applicable` is the mechanism that never inspects a tool input; collapsing it into
  // `refused` would report an agreement nobody measured.
  assert.deepEqual(
    [...NoPathDisposition.options].sort(),
    ["not-applicable", "passed-through", "refused"],
  );
});

test("scope-event-no-path: an unextractable-path call is NOT expressible as a refusal", () => {
  // Structural, not conventional: `refusals` has no `no-path` kind, so a reader summing the list
  // cannot fold the disputed case in by accident.
  const folded = ScopeRefusal.safeParse({ kind: "no-path", tool: "Write", path: "(no path)" });
  assert.equal(folded.success, false);
});

test("scope-event-source: the runtime vocabulary is the usage stream's, so the two join", () => {
  assert.deepEqual([...ScopeSource.options].sort(), ["codex-leaf", "owned-loop", "sdk-leaf"]);
});

test("scope-event-strict: an unadmitted field is REFUSED, never silently dropped", () => {
  // The ModelTokenUsage scar: a field added on the emitting side but not here stops the whole
  // stream persisting, with nothing going red. Strictness is what turns that into a loud failure.
  assert.equal(ScopeEventDoc.safeParse({ ...SILENT, refusalCount: 3 }).success, false);
});

test("scope-event-counts: a negative or fractional no-path count is refused", () => {
  assert.equal(ScopeEventDoc.safeParse({ ...SILENT, noPathCalls: -1 }).success, false);
  assert.equal(ScopeEventDoc.safeParse({ ...SILENT, noPathCalls: 1.5 }).success, false);
});
