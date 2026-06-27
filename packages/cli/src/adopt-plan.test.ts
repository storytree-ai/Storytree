import test from "node:test";
import assert from "node:assert/strict";

import { adoptPlanCommand, type AdoptPlanDeps, type AdoptPlanStory } from "./adopt-plan.js";

/**
 * `storytree adopt plan <id>` (ADR-0097 Layer 2): the offline adoption-plan report. Pure-by-
 * injection (the story loader is a seam), so the whole command is tested with a fixture loader — no DB,
 * no spec on disk. The fixture is the library story (six covered caps, one uncovered pocket).
 */

const LIBRARY_STORY: AdoptPlanStory = {
  status: "mapped",
  capabilities: [
    "library-schema-and-write-validation",
    "migrate-on-write-upcaster",
    "event-sourced-store-seam",
    "eager-batch-migrate",
    "seed-corpus-scripts",
    "library-health-gate",
    "library-cli",
  ],
  gates: [
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
  ],
};

function deps(over: Partial<AdoptPlanDeps> = {}): AdoptPlanDeps {
  return {
    loadStory: () => LIBRARY_STORY,
    ...over,
  };
}

test("adopt-plan classifies the library story: 6 covered, seed-corpus-scripts uncovered", async () => {
  const env = await adoptPlanCommand("library", deps());
  assert.equal(env.ok, true);
  assert.match(env.body, /Adoption plan for "library" \(status: mapped\)/);
  assert.match(env.body, /capabilities: 7\s+\(6 covered, 1 uncovered\)/);
  // The covered caps show their covering gate(s); event-sourced-store-seam shows both gate-1 and gate-3.
  assert.match(env.body, /event-sourced-store-seam.*COVERED.*library#gate-1 \(observe\), library#gate-3 \(observe\)/);
  // The one untested pocket is UNCOVERED with the extensible `unclassified` slot.
  assert.match(env.body, /seed-corpus-scripts\s+UNCOVERED.*pocket: unclassified/);
});

test("adopt-plan needs a story id", async () => {
  const env = await adoptPlanCommand(undefined, deps());
  assert.equal(env.ok, false);
  assert.match(env.body, /needs a story id/);
});

test("adopt-plan on a missing/odd story refuses with guidance", async () => {
  const env = await adoptPlanCommand("nope", deps({ loadStory: () => null }));
  assert.equal(env.ok, false);
  assert.match(env.body, /no story "nope"/);
});

test("adopt-plan surfaces a dangling (covers:) mis-declaration", async () => {
  const env = await adoptPlanCommand(
    "s",
    deps({
      loadStory: () => ({
        status: "mapped",
        capabilities: ["cap-a"],
        gates: [{ id: "s#gate-1", kind: "observe", covers: ["cap-a", "ghost-cap"] }],
      }),
    }),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /dangling \(covers:\)/);
  assert.match(env.body, /ghost-cap/);
});

test("adopt-plan on a story with no caps and no gates says nothing to classify", async () => {
  const env = await adoptPlanCommand(
    "empty",
    deps({ loadStory: () => ({ status: "mapped", capabilities: [], gates: [] }) }),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /nothing to classify/);
});

test("adopt-plan stays ok:true even when caps are uncovered (a report, not a gate)", async () => {
  const env = await adoptPlanCommand(
    "s",
    deps({
      loadStory: () => ({ status: "mapped", capabilities: ["cap-a", "cap-b"], gates: [] }),
    }),
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /\(0 covered, 2 uncovered\)/);
});

test("adopt-plan --readings renders the enriched proposal: stamped class + recommended gate + decisions", async () => {
  const env = await adoptPlanCommand("library", deps(), {
    readings: {
      "seed-corpus-scripts": {
        class: "R2",
        title: "Seam out the seed orchestration",
        proofCommand: "pnpm --filter @storytree/library test",
        buildNode: "seed-corpus-scripts",
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
  assert.equal(env.ok, true);
  assert.match(env.body, /agent readings applied/);
  // The uncovered pocket now shows its agent R2 class (no longer `unclassified`).
  assert.match(env.body, /seed-corpus-scripts\s+UNCOVERED.*pocket: R2/);
  // A recommend-only build-tests gate stanza is rendered in round-trippable form.
  assert.match(env.body, /Recommended reliability gates \(1\)/);
  assert.match(
    env.body,
    /_\(gate: build-tests\)_.*_\(covers: seed-corpus-scripts\)_.*_\(build: seed-corpus-scripts\)_/,
  );
  // The public-seam fork is escalated (the owner's call); the naming fork is routine (the leaf's).
  assert.match(env.body, /ESCALATED — your call \(1\)/);
  assert.match(env.body, /seam-shape/);
  assert.match(env.body, /ROUTINE — the leaf decides \(1\)/);
  assert.match(env.body, /test-name/);
  // An unresolved escalated fork surfaces the fail-closed halt note.
  assert.match(env.body, /escalated fork\(s\) unresolved/);
});
