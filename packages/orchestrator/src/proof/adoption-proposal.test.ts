import test from "node:test";
import assert from "node:assert/strict";

import { classifyAdoption, type ClassifierGate } from "./adoption-proposal.js";

/**
 * The Layer-2 adoption-proposal classifier (ADR-0097 Layer 2, Fork 1): a PURE covers-diff of a story's
 * `(covers:)` declarations against its capability set. All offline — no store, no git, no clock.
 *
 * The yardstick fixture is the canonical brownfield story (`stories/library/story.md`): seven
 * capabilities, three `observe` gates whose `(covers:)` green six of them, and `seed-corpus-scripts`
 * covered by NO honest gate — exactly the boundary Layer 2 must detect from the declarations alone.
 */

/** The library story's seven declared capabilities (its `capabilities:` frontmatter, in order). */
const LIBRARY_CAPS = [
  "library-schema-and-write-validation",
  "migrate-on-write-upcaster",
  "event-sourced-store-seam",
  "eager-batch-migrate",
  "seed-corpus-scripts",
  "library-health-gate",
  "library-cli",
] as const;

/** The library story's three `observe` reliability gates with their authored `(covers:)` declarations. */
const LIBRARY_GATES: ClassifierGate[] = [
  {
    id: "library#gate-1",
    kind: "observe",
    covers: [
      "library-schema-and-write-validation",
      "migrate-on-write-upcaster",
      "event-sourced-store-seam",
      "eager-batch-migrate",
      "library-health-gate",
    ],
  },
  { id: "library#gate-2", kind: "observe", covers: ["library-cli"] },
  { id: "library#gate-3", kind: "observe", covers: ["event-sourced-store-seam"] },
];

test("the yardstick: the library story greens six caps and leaves seed-corpus-scripts uncovered", () => {
  const proposal = classifyAdoption({
    storyId: "library",
    capabilityIds: LIBRARY_CAPS,
    gates: LIBRARY_GATES,
  });

  assert.equal(proposal.storyId, "library");
  // Six covered, exactly the one untested pocket uncovered — the boundary the prose flags by hand.
  assert.deepEqual(proposal.uncovered, ["seed-corpus-scripts"]);
  assert.deepEqual(proposal.covered, [
    "library-schema-and-write-validation",
    "migrate-on-write-upcaster",
    "event-sourced-store-seam",
    "eager-batch-migrate",
    "library-health-gate",
    "library-cli",
  ]);
  assert.deepEqual(proposal.danglingCovers, []);
});

test("capabilities preserve declared order and carry their covering gates", () => {
  const proposal = classifyAdoption({
    storyId: "library",
    capabilityIds: LIBRARY_CAPS,
    gates: LIBRARY_GATES,
  });
  assert.deepEqual(
    proposal.capabilities.map((c) => c.capId),
    [...LIBRARY_CAPS],
  );
  // event-sourced-store-seam is covered by BOTH gate-1 and gate-3 — every covering gate is surfaced.
  const store = proposal.capabilities.find((c) => c.capId === "event-sourced-store-seam");
  assert.ok(store);
  assert.equal(store.covered, true);
  assert.deepEqual(store.coveredBy, [
    { gateId: "library#gate-1", kind: "observe" },
    { gateId: "library#gate-3", kind: "observe" },
  ]);
  // A covered cap owes nothing — no pocket slot.
  assert.equal(store.pocket, undefined);
});

test("an uncovered cap carries the extensible `unclassified` pocket slot (the Layer-2↔Layer-3 contract)", () => {
  const proposal = classifyAdoption({
    storyId: "library",
    capabilityIds: LIBRARY_CAPS,
    gates: LIBRARY_GATES,
  });
  const seed = proposal.capabilities.find((c) => c.capId === "seed-corpus-scripts");
  assert.ok(seed);
  assert.equal(seed.covered, false);
  assert.deepEqual(seed.coveredBy, []);
  // The structural layer can only mark it `unclassified` — ADR-0098's agent analysis fills the finer call.
  assert.equal(seed.pocket, "unclassified");
});

test("the build-tests / integrate gate kind is carried, not collapsed to observe", () => {
  const proposal = classifyAdoption({
    storyId: "s",
    capabilityIds: ["cap-a", "cap-b"],
    gates: [
      { id: "s#gate-1", kind: "build-tests", covers: ["cap-a"] },
      { id: "s#gate-2", kind: "integrate", covers: ["cap-b"] },
    ],
  });
  // Covered structurally even by a non-observe gate (ADR-0097 d.5: a cap greens via the gate that covers
  // it); the KIND is surfaced so a consumer can tell "adoptable now" from "covered-but-owes-real-work".
  assert.deepEqual(proposal.covered, ["cap-a", "cap-b"]);
  assert.equal(proposal.capabilities[0]?.coveredBy[0]?.kind, "build-tests");
  assert.equal(proposal.capabilities[1]?.coveredBy[0]?.kind, "integrate");
});

test("a (covers:) entry naming an undeclared cap is reported as a dangling mis-declaration", () => {
  const proposal = classifyAdoption({
    storyId: "s",
    capabilityIds: ["cap-a"],
    gates: [{ id: "s#gate-1", kind: "observe", covers: ["cap-a", "typo-cap", "stale-cap"] }],
  });
  assert.deepEqual(proposal.covered, ["cap-a"]);
  assert.deepEqual(proposal.uncovered, []);
  // The two names that are not declared capabilities surface honestly, sorted — never silently dropped.
  assert.deepEqual(proposal.danglingCovers, ["stale-cap", "typo-cap"]);
});

test("a story with no gates leaves every cap uncovered and unclassified", () => {
  const proposal = classifyAdoption({
    storyId: "s",
    capabilityIds: ["cap-a", "cap-b"],
    gates: [],
  });
  assert.deepEqual(proposal.covered, []);
  assert.deepEqual(proposal.uncovered, ["cap-a", "cap-b"]);
  assert.ok(proposal.capabilities.every((c) => c.pocket === "unclassified"));
});

test("a story with no capabilities (a pure port) classifies vacuously", () => {
  const proposal = classifyAdoption({
    storyId: "proof-protocol",
    capabilityIds: [],
    gates: [{ id: "proof-protocol#gate-1", kind: "observe", covers: [] }],
  });
  assert.deepEqual(proposal.capabilities, []);
  assert.deepEqual(proposal.covered, []);
  assert.deepEqual(proposal.uncovered, []);
  assert.deepEqual(proposal.danglingCovers, []);
});

test("a duplicate cap id collapses to one entry (first occurrence wins)", () => {
  const proposal = classifyAdoption({
    storyId: "s",
    capabilityIds: ["cap-a", "cap-a", "cap-b"],
    gates: [{ id: "s#gate-1", kind: "observe", covers: ["cap-a"] }],
  });
  assert.deepEqual(
    proposal.capabilities.map((c) => c.capId),
    ["cap-a", "cap-b"],
  );
  assert.deepEqual(proposal.covered, ["cap-a"]);
  assert.deepEqual(proposal.uncovered, ["cap-b"]);
});
