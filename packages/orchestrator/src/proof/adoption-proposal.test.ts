import test from "node:test";
import assert from "node:assert/strict";

import { parseReliabilityGates } from "@storytree/library";

import {
  classifyAdoption,
  assembleProposal,
  renderProposedGate,
  parsePocketReadings,
  type ClassifierGate,
  type ProposedGate,
} from "./adoption-proposal.js";

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

/**
 * The Layer-2 JUDGMENT half (ADR-0098 d.1): {@link assembleProposal} stamps each uncovered pocket with the
 * agent's injected observe/R1/R2 reading, emits a recommend-only {@link ProposedGate} per classified
 * pocket, and sweeps the surfaced forks — while an un-read pocket stays `unclassified` (fail-closed) and a
 * covered cap is untouched. All offline; the agent supplies judgement (injected data), the spine assembles.
 */

test("assembleProposal stamps each uncovered pocket with its injected class; covered caps unchanged", () => {
  const proposal = assembleProposal({
    storyId: "library",
    capabilityIds: LIBRARY_CAPS,
    gates: LIBRARY_GATES,
    readings: {
      "seed-corpus-scripts": {
        class: "R2",
        title: "Extract a seam for the seed orchestration",
        proofCommand: "pnpm --filter @storytree/library test",
        buildNode: "seed-corpus-scripts",
      },
    },
  });
  // The one uncovered pocket now carries the agent's R2 call (was `unclassified`).
  const seed = proposal.capabilities.find((c) => c.capId === "seed-corpus-scripts");
  assert.equal(seed?.pocket, "R2");
  // A covered cap is untouched — still covered, still no pocket slot.
  const cli = proposal.capabilities.find((c) => c.capId === "library-cli");
  assert.equal(cli?.covered, true);
  assert.equal(cli?.pocket, undefined);
  // The structural projections from classifyAdoption are preserved.
  assert.deepEqual(proposal.uncovered, ["seed-corpus-scripts"]);
  assert.equal(proposal.danglingCovers.length, 0);
});

test("assembleProposal emits one proposed gate per classified pocket (observe vs build-tests shape)", () => {
  const proposal = assembleProposal({
    storyId: "s",
    capabilityIds: ["cap-correct", "cap-untestable"],
    gates: [],
    readings: {
      "cap-correct": {
        class: "observe",
        title: "The cap suite already passes",
        proofCommand: "pnpm --filter @storytree/x test",
      },
      "cap-untestable": {
        class: "R2",
        title: "Seam out the entry guard",
        proofCommand: "pnpm --filter @storytree/x test",
        buildNode: "cap-untestable",
      },
    },
  });
  assert.equal(proposal.proposedGates.length, 2);
  // observe → no red taxonomy, no build node, covers itself.
  const obs = proposal.proposedGates.find((g) => g.capId === "cap-correct");
  assert.equal(obs?.kind, "observe");
  assert.equal(obs?.redKind, undefined);
  assert.equal(obs?.buildNode, undefined);
  assert.deepEqual(obs?.covers, ["cap-correct"]);
  // R2 → build-tests, carries the red taxonomy + the (build:) node it borrows.
  const bt = proposal.proposedGates.find((g) => g.capId === "cap-untestable");
  assert.equal(bt?.kind, "build-tests");
  assert.equal(bt?.redKind, "R2");
  assert.equal(bt?.buildNode, "cap-untestable");
  assert.deepEqual(bt?.covers, ["cap-untestable"]);
});

test("an uncovered cap with no agent reading stays unclassified and gets no proposed gate (fail-closed)", () => {
  const proposal = assembleProposal({
    storyId: "s",
    capabilityIds: ["cap-read", "cap-unread"],
    gates: [],
    readings: {
      "cap-read": {
        class: "R1",
        title: "Fix the latent contract gap",
        proofCommand: "pnpm --filter @storytree/x test",
        buildNode: "cap-read",
      },
    },
  });
  // The un-read pocket is NEVER guessed — it holds the classifyAdoption default.
  const unread = proposal.capabilities.find((c) => c.capId === "cap-unread");
  assert.equal(unread?.pocket, "unclassified");
  // ...and no gate is recommended for it; only the read pocket yields one.
  assert.deepEqual(
    proposal.proposedGates.map((g) => g.capId),
    ["cap-read"],
  );
});

test("surfaced per-pocket forks are swept escalated-vs-routine by the REAL owner-fork bar", () => {
  const proposal = assembleProposal({
    storyId: "s",
    capabilityIds: ["cap-a"],
    gates: [],
    readings: {
      "cap-a": {
        class: "R2",
        title: "Seam it out",
        proofCommand: "pnpm --filter @storytree/x test",
        buildNode: "cap-a",
        forks: [
          {
            id: "seam-shape",
            question: "Should the seam take a Pool or the built Store?",
            changesPublicSeam: true,
            materiallyDifferentStrategies: false,
            crossCuttingOrIrreversible: false,
          },
          {
            id: "test-name",
            question: "What to name the test file?",
            changesPublicSeam: false,
            materiallyDifferentStrategies: false,
            crossCuttingOrIrreversible: false,
          },
        ],
      },
    },
  });
  // The public-seam fork is the owner's call; the naming choice is the leaf's.
  assert.deepEqual(
    proposal.sweep.escalated.map((d) => d.id),
    ["seam-shape"],
  );
  assert.deepEqual(
    proposal.sweep.routine.map((d) => d.id),
    ["test-name"],
  );
  // An unresolved escalated fork blocks the drive (fail-closed).
  assert.equal(proposal.sweep.clear, false);
});

/**
 * U3 — the recommend-only hand-off is HONEST: a rendered {@link ProposedGate} must parse back through the
 * REAL `parseReliabilityGates` to an equivalent gate (a valid `## Reliability Gates` floor entry, never
 * free text). The round-trip against the real parser is the isolatable oracle.
 */

test("a rendered build-tests gate round-trips through the REAL parseReliabilityGates", () => {
  const gate: ProposedGate = {
    capId: "cap-a",
    kind: "build-tests",
    covers: ["cap-a"],
    title: "Seam out the entry guard",
    proofCommand: "pnpm --filter @storytree/library test",
    redKind: "R2",
    buildNode: "seed-runner",
  };
  const body = `## Reliability Gates\n\n1. ${renderProposedGate(gate)}\n`;
  const parsed = parseReliabilityGates("s", body);
  assert.equal(parsed.length, 1);
  const g = parsed[0]!;
  assert.equal(g.kind, "build-tests");
  assert.deepEqual(g.covers, ["cap-a"]);
  assert.equal(g.buildNode, "seed-runner");
  assert.equal(g.proofCommand, "pnpm --filter @storytree/library test");
  assert.equal(g.title, "Seam out the entry guard");
});

test("a rendered observe gate round-trips (kind + covers + command, no build node)", () => {
  const gate: ProposedGate = {
    capId: "cap-b",
    kind: "observe",
    covers: ["cap-b"],
    title: "The existing suite passes",
    proofCommand: "pnpm --filter @storytree/x test",
  };
  const body = `## Reliability Gates\n\n1. ${renderProposedGate(gate)}\n`;
  const parsed = parseReliabilityGates("s", body);
  assert.equal(parsed.length, 1);
  const g = parsed[0]!;
  assert.equal(g.kind, "observe");
  assert.deepEqual(g.covers, ["cap-b"]);
  assert.equal(g.buildNode, undefined);
  assert.equal(g.proofCommand, "pnpm --filter @storytree/x test");
  assert.equal(g.title, "The existing suite passes");
});

/**
 * The readings boundary (`adopt plan --readings <file>`): {@link parsePocketReadings} validates + normalises
 * the agent's JSON blob into the injected map, fail-closed on a malformed shape (never silently dropped).
 */

test("parsePocketReadings validates the readings boundary and normalises the map", () => {
  const readings = parsePocketReadings({
    "cap-a": { class: "R2", title: "Seam it out", proofCommand: "pnpm test", buildNode: "cap-a" },
    "cap-b": { class: "observe", title: "Suite already passes", proofCommand: "pnpm test" },
  });
  assert.equal(readings["cap-a"]?.class, "R2");
  assert.equal(readings["cap-a"]?.buildNode, "cap-a");
  assert.equal(readings["cap-b"]?.class, "observe");
  assert.equal(readings["cap-b"]?.buildNode, undefined);
});

test("parsePocketReadings rejects a bad class (fail-closed at the JSON boundary)", () => {
  assert.throws(() =>
    parsePocketReadings({ "cap-a": { class: "nonsense", title: "x", proofCommand: "y" } }),
  );
});

test("parsePocketReadings rejects an unknown field (strict — a typo'd reading is refused, not ignored)", () => {
  assert.throws(() =>
    parsePocketReadings({
      "cap-a": { class: "observe", title: "x", proofCommand: "y", typo: true },
    }),
  );
});
