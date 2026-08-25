import test from "node:test";
import assert from "node:assert/strict";

import {
  countWorkHierarchy,
  diffWorkHierarchy,
  formatHierarchyDifference,
  ProjectedCapability,
  ProjectedStory,
  WORK_HIERARCHY_SCHEMA_VERSION,
  WorkHierarchySnapshot,
  type HierarchyDifference,
} from "./work-hierarchy-projection.js";

/**
 * The PURE half of `work-hierarchy-store-projection` and `work-hierarchy-drift-gate`: the projected
 * shape keeps the authored facts, and the diff addresses every drift shape without firing on the
 * stamp. No store, no filesystem, no credential — the live rungs are `hierarchy:load` and
 * `check:hierarchy-drift`.
 */

const C1 = "uatc_000000000000000000000001";
const C2 = "uatc_000000000000000000000002";
const R1 = "uatr1:0000000000000001";
const R2 = "uatr1:00000000000000ff";

function criterion(over: Record<string, unknown> = {}) {
  return { criterionId: C1, revisionId: R1, title: "walk the map", witness: "machine", ...over };
}

function gate(over: Record<string, unknown> = {}) {
  return { id: "demo#gate-1", title: "the suite is green", kind: "observe", ...over };
}

function story(over: Record<string, unknown> = {}): ProjectedStory {
  return ProjectedStory.parse({
    id: "demo",
    title: "Demo",
    outcome: "a demo",
    status: "building",
    proofMode: "UAT",
    uatWitness: "machine",
    building: false,
    capabilities: ["demo-cap"],
    uatTestCriteria: [criterion()],
    reliabilityGates: [gate()],
    ...over,
  });
}

function capability(over: Record<string, unknown> = {}): ProjectedCapability {
  return ProjectedCapability.parse({
    id: "demo-cap",
    storyId: "demo",
    title: "Demo cap",
    outcome: "a cap",
    status: "healthy",
    proofMode: "integration-test",
    contractCount: 3,
    ...over,
  });
}

function snapshot(over: Record<string, unknown> = {}): WorkHierarchySnapshot {
  return WorkHierarchySnapshot.parse({
    schemaVersion: WORK_HIERARCHY_SCHEMA_VERSION,
    commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    storiesTreeSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    generatedAt: "2026-08-26T00:00:00.000Z",
    generator: "test",
    stories: [story()],
    capabilities: [capability()],
    ...over,
  });
}

/** Rebuild every object with its keys in REVERSE insertion order — a stand-in for the store side. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>).reverse();
  return Object.fromEntries(entries.map(([k, v]) => [k, reverseKeys(v)]));
}

/** Every difference of one entity/kind, so an assertion can name what it expected to see. */
function of(
  diffs: readonly HierarchyDifference[],
  entity: HierarchyDifference["entity"],
  kind?: HierarchyDifference["kind"],
): HierarchyDifference[] {
  return diffs.filter((d) => d.entity === entity && (kind === undefined || d.kind === kind));
}

// ── the shape carries the authored facts ─────────────────────────────────────

test("work-hierarchy-projection-carries-raw-authored-facts: would-be criteria, retired gates and an undeclared witness all survive", () => {
  const parsed = story({
    uatWitness: null,
    uatTestCriteria: [criterion({ wouldBe: true }), criterion({ criterionId: C2, revisionId: R2 })],
    reliabilityGates: [gate({ retired: true }), gate({ id: "demo#gate-2", covers: ["demo-cap"] })],
  });

  // The FOLDS the readers apply — the would-be filter, `activeReliabilityGates`, and
  // `effectiveUatWitness`'s human default — are deliberately NOT applied here. A projection that
  // pre-folded would put the LOADER's rule version into the store, which is a second staleness axis
  // the reader could not see (ADR-0445's rule half stays open by design).
  assert.equal(parsed.uatTestCriteria.length, 2, "a would-be criterion is projected, not dropped");
  assert.equal(parsed.uatTestCriteria[0]?.wouldBe, true);
  assert.equal(parsed.reliabilityGates.length, 2, "a retired gate is projected, not dropped");
  assert.equal(parsed.reliabilityGates[0]?.retired, true);
  assert.deepEqual(parsed.reliabilityGates[1]?.covers, ["demo-cap"], "`covers:` rides along");
  assert.equal(parsed.uatWitness, null, "an undeclared witness stays undeclared, never defaulted");
});

test("work-hierarchy-projection-carries-raw-authored-facts: the capability id list keeps its authored ORDER", () => {
  const parsed = story({ capabilities: ["b-cap", "a-cap"] });
  assert.deepEqual(parsed.capabilities, ["b-cap", "a-cap"], "declaration order, not sorted");

  const reordered = story({ capabilities: ["a-cap", "b-cap"] });
  const diffs = diffWorkHierarchy(
    snapshot({ stories: [parsed] }),
    snapshot({ stories: [reordered] }),
  );
  assert.equal(of(diffs, "story", "changed").length, 1, "a re-ordering is a real difference");
  assert.equal(of(diffs, "story", "changed")[0]?.field, "capabilities");
});

test("work-hierarchy-projection-is-total-over-an-unreadable-spec: an error node projects rather than throwing", () => {
  // `readTree` turns a missing/malformed spec into an `error` node so one bad file cannot blank the
  // forest. The projection carries the same node, or the store and the disk read would disagree
  // about a story that is merely broken.
  const broken = story({ status: null, error: "spec file missing" });
  assert.equal(broken.status, null);
  assert.equal(broken.error, "spec file missing");
  const brokenCap = capability({ status: null, error: "spec file missing" });
  assert.equal(brokenCap.error, "spec file missing");

  // And an error node that APPEARS is a reported difference, never silence.
  const diffs = diffWorkHierarchy(snapshot({ stories: [broken] }), snapshot());
  assert.ok(
    of(diffs, "story", "changed").some((d) => d.field === "error"),
    "a story that became unreadable is reported",
  );
});

// ── the diff addresses every drift shape ─────────────────────────────────────

test("work-hierarchy-diff-addresses-every-drift-shape: a store missing a story, a capability, a criterion and a gate names each one", () => {
  const checkout = snapshot({
    stories: [story({ uatTestCriteria: [criterion(), criterion({ criterionId: C2, revisionId: R2 })] })],
    capabilities: [capability(), capability({ id: "second-cap" })],
  });
  const store = snapshot({
    stories: [story({ uatTestCriteria: [criterion()], reliabilityGates: [] }), story({ id: "ghost" })],
    capabilities: [capability()],
  });

  const diffs = diffWorkHierarchy(checkout, store);

  assert.deepEqual(
    of(diffs, "criterion", "missing").map((d) => d.id),
    [C2],
    "a criterion the store never learned is named by its criterion id",
  );
  assert.deepEqual(of(diffs, "gate", "missing").map((d) => d.id), ["demo#gate-1"]);
  assert.deepEqual(of(diffs, "capability", "missing").map((d) => d.id), ["second-cap"]);
  assert.deepEqual(
    of(diffs, "story", "unexpected").map((d) => d.id),
    ["ghost"],
    "a story deleted from the checkout but left in the store is reported the other way",
  );
  for (const diff of diffs) {
    assert.ok(diff.story.length > 0, "every difference names the owning story");
    assert.match(formatHierarchyDifference(diff), /\S/, "and renders as one readable line");
  }
});

test("work-hierarchy-diff-addresses-every-drift-shape: a re-worded criterion is reported ONCE, on its revision id", () => {
  // The exact skew this arc exists to close (ADR-0253): the content moved, so the revision id moved,
  // so a verdict signed against the new revision matches nothing an older reader holds.
  const checkout = snapshot({ stories: [story({ uatTestCriteria: [criterion({ revisionId: R2 })] })] });
  const store = snapshot();

  const diffs = diffWorkHierarchy(checkout, store);

  assert.deepEqual(
    diffs.map((d) => ({ entity: d.entity, id: d.id, field: d.field })),
    [{ entity: "criterion", id: C1, field: "revisionId" }],
    "ONE line, on the criterion, naming the field — not a wholesale story diff burying it",
  );
  assert.match(formatHierarchyDifference(diffs[0]!), /revisionId/);
});

test("work-hierarchy-diff-addresses-every-drift-shape: a story the store never heard of is not re-reported per criterion", () => {
  const checkout = snapshot({
    stories: [story(), story({ id: "fresh", uatTestCriteria: [criterion(), criterion({ criterionId: C2, revisionId: R2 })] })],
  });
  const diffs = diffWorkHierarchy(checkout, snapshot());
  assert.deepEqual(
    diffs.map((d) => `${d.entity}:${d.id}`),
    ["story:fresh"],
    "one missing story is one line, never one line per obligation inside it",
  );
});

// ── the diff is blind to what legitimately differs ───────────────────────────

test("work-hierarchy-diff-is-blind-to-the-stamp-and-to-key-order: same tree, different commit, no differences", () => {
  const a = snapshot();
  const b = snapshot({
    commitSha: "cccccccccccccccccccccccccccccccccccccccc",
    generatedAt: "2026-01-01T00:00:00.000Z",
    generator: "ci",
  });
  assert.deepEqual(diffWorkHierarchy(a, b), [], "the stamp is provenance, never a difference");
});

test("work-hierarchy-diff-is-blind-to-the-stamp-and-to-key-order: a round-trip through JSON agrees with itself", () => {
  // The two sides of this comparison are built by different code paths — one by the projector
  // walking a spec, one by JSON.parse of a stored doc — so a rendering that preserved insertion
  // order would report differences that are not there and train a reader to ignore this check.
  const projected = snapshot({
    stories: [story({ uatTestCriteria: [criterion({ lineage: { kind: "replaces", criterionIds: [C2] } })] })],
  });
  const stored = WorkHierarchySnapshot.parse(reverseKeys(JSON.parse(JSON.stringify(projected))));
  assert.deepEqual(diffWorkHierarchy(projected, stored), []);

  // Story ORDER within the snapshot is likewise not a difference — the store returns rows in
  // whatever order it likes, and both sides are keyed by id.
  const reversed = snapshot({ stories: [story({ id: "z" }), story()] });
  const forward = snapshot({ stories: [story(), story({ id: "z" })] });
  assert.deepEqual(diffWorkHierarchy(forward, reversed), []);
});

// ── denominators ─────────────────────────────────────────────────────────────

test("work-hierarchy-diff-addresses-every-drift-shape: the counts say how much was compared, so agreement and emptiness differ", () => {
  assert.deepEqual(countWorkHierarchy(snapshot()), {
    stories: 1,
    capabilities: 1,
    criteria: 1,
    gates: 1,
  });
  assert.deepEqual(countWorkHierarchy(snapshot({ stories: [], capabilities: [] })), {
    stories: 0,
    capabilities: 0,
    criteria: 0,
    gates: 0,
  });
  // Two EMPTY snapshots agree, which is why a caller must read the counts before calling that green.
  assert.deepEqual(
    diffWorkHierarchy(snapshot({ stories: [], capabilities: [] }), snapshot({ stories: [], capabilities: [] })),
    [],
  );
});
