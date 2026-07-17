// Unit test for tree-verdicts.ts — the desktop's re-composition of the studio's GET /api/tree
// verdict fold (the overlay that paints island/plant proof-health, ADR-0119 deferred overlay).
//
// WHAT IT PINS:
//  - readTreeWithCaps reads FULL capabilities + collects the per-story UAT obligations off a REAL FS
//    walk (the bare desktop tree returned `capabilities: []`, so NO verdict could attach — the gap);
//  - foldVerdicts derives GREEN exactly as the studio frontend's `provenStatus` reads it: a cap plant
//    greens from its OWN signed verdict (latestVerdicts), a story island greens from the per-test crown
//    roll-up (rollupStoryGreen over the raw verdict events), and an open gating question WITHHOLDS a
//    would-be green — never over-claiming (a null source leaves the authored hue);
//  - applyCapCoverage synthesizes a covered brownfield cap's verdict from its covering gate;
//  - the BOUNDARY holds: this module imports no pg / no @storytree/*/store / no studio server.
//
// DELETION TEST: drop the latestVerdicts attach and the plant never greens; drop applyUatCrowns and the
// island never greens; make the fold ignore openQuestions and the gated story over-claims. Each
// assertion below fails if its fold step is removed — the green is DERIVED, never hand-painted (ADR-0040).
//
// INTEGRATION TIER: readTreeWithCaps drives a REAL recursive FS walk + the REAL orchestrator
// loadNodeSpec over a seeded temp dir (the filesystem IS the collaborator). The verdict fold runs the
// REAL @storytree/orchestrator rollup compute over a signed-Verdict fixture — no DB, no studio import.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Verdict } from "@storytree/proof-protocol";

import {
  readTreeWithCaps,
  foldVerdicts,
  applyCapCoverage,
  type DTStory,
  type DTVerdictEvent,
} from "./tree-verdicts.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TS = "2026-06-27T10:00:00.000Z";

/** A full signed PASS verdict event for `unitId` (rollupStatus requires the doc to parse as a Verdict). */
function passEvent(seq: number, unitId: string, proofMode: "capability" | "story" | "contract"): DTVerdictEvent {
  return {
    kind: "signing",
    seq,
    doc: Verdict.parse({
      unitId,
      proofMode,
      outcome: "pass",
      commitSha: "ca".repeat(20),
      signer: "ci@example.com",
      runId: `run-${unitId}`,
      at: TS,
    }),
  };
}

/**
 * Seed a temp stories dir with ONE story `alpha` (status: proposed) declaring one capability `cap-a`
 * and one `## Story UAT` leg (→ the obligation id `alpha#uat-1`). The authored statuses are all
 * proposed/`mapped`-free, so any green MUST come from the verdict fold, never authored paint.
 */
async function seedStories(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tree-verdicts-"));
  const storyDir = path.join(dir, "alpha");
  await fs.mkdir(storyDir);
  await fs.writeFile(
    path.join(storyDir, "story.md"),
    [
      "---",
      'id: "alpha"',
      "tier: story",
      'title: "Alpha story"',
      'outcome: "the alpha outcome"',
      "status: proposed",
      "proof_mode: UAT",
      "capabilities: [cap-a]",
      "---",
      "",
      "# Alpha",
      "",
      "## Story UAT",
      "",
      "1. **The one leg** (witness: machine) — it works end to end.",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(storyDir, "cap-a.md"),
    [
      "---",
      'id: "cap-a"',
      "tier: capability",
      'title: "Capability A"',
      'outcome: "the cap-a outcome"',
      "status: proposed",
      "proof_mode: contract-test",
      "---",
      "",
      "# Capability A",
    ].join("\n"),
    "utf8",
  );
  return {
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// readTreeWithCaps
// ---------------------------------------------------------------------------

// Pins the gap this module closes: the desktop tree now carries FULL capabilities (the bare
// readLocalTree returned `capabilities: []`, so no verdict could ever attach) AND the per-story UAT
// obligation collection the crown roll-up needs.
test("tree-verdicts: readTreeWithCaps reads full capabilities + the per-story UAT obligations", async () => {
  const { dir, cleanup } = await seedStories();
  try {
    const { stories, uatTestCriteriaByStory } = await readTreeWithCaps(dir);
    assert.equal(stories.length, 1, "the one seeded story is read");
    const alpha = stories[0];
    assert.ok(alpha, "the story is present");
    assert.equal(alpha.id, "alpha");
    assert.equal(alpha.status, "proposed", "authored status carried through (the brown fallback)");
    assert.equal(alpha.capabilities.length, 1, "the capability is READ — not an empty array");
    assert.equal(alpha.capabilities[0]?.id, "cap-a", "the cap id is the spec id");
    assert.equal(alpha.capabilities[0]?.title, "Capability A", "the cap title comes from its spec");
    assert.deepEqual(
      uatTestCriteriaByStory.get("alpha")?.map((t) => t.id),
      ["alpha#uat-1"],
      "the per-test UAT obligation is collected (its id rolls into the crown)",
    );
  } finally {
    await cleanup();
  }
});

// A missing stories dir returns an empty tree gracefully (never throws) — the offline/empty path.
test("tree-verdicts: readTreeWithCaps over a missing dir returns an empty tree", async () => {
  const { stories, uatTestCriteriaByStory } = await readTreeWithCaps("/tmp/tree-verdicts-no-such-dir-xyzzy");
  assert.deepEqual(stories, [], "no stories");
  assert.equal(uatTestCriteriaByStory.size, 0, "no obligations");
});

// ---------------------------------------------------------------------------
// testCount — the declared-contract count (forest-parcels increment 1, mirrors the studio's readTree)
// ---------------------------------------------------------------------------

/** Seed a temp stories dir with ONE story `parcels` declaring two capabilities: one with a
 *  `## Contracts` section listing 3 items, one with none. */
async function seedContractStories(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tree-verdicts-contracts-"));
  const storyDir = path.join(dir, "parcels");
  await fs.mkdir(storyDir);
  await fs.writeFile(
    path.join(storyDir, "story.md"),
    [
      "---",
      'id: "parcels"',
      "tier: story",
      'title: "Parcels story"',
      'outcome: "the parcels outcome"',
      "status: proposed",
      "proof_mode: UAT",
      "capabilities: [three-contracts, no-contracts]",
      "---",
      "",
      "# Parcels",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(storyDir, "three-contracts.md"),
    [
      "---",
      'id: "three-contracts"',
      "tier: capability",
      'title: "Three Contracts"',
      'outcome: "o"',
      "status: proposed",
      "proof_mode: contract-test",
      "---",
      "",
      "# Three Contracts",
      "",
      "## Contracts (3)",
      "",
      "1. **`three-contracts-1`** — leaf behaviour 1",
      "2. **`three-contracts-2`** — leaf behaviour 2",
      "3. **`three-contracts-3`** — leaf behaviour 3",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(storyDir, "no-contracts.md"),
    [
      "---",
      'id: "no-contracts"',
      "tier: capability",
      'title: "No Contracts"',
      'outcome: "o"',
      "status: proposed",
      "proof_mode: contract-test",
      "---",
      "",
      "# No Contracts",
    ].join("\n"),
    "utf8",
  );
  return {
    dir,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

test("tree-verdicts: readTreeWithCaps counts declared `## Contracts` items into testCount (mirrors the studio's readTree)", async () => {
  const { dir, cleanup } = await seedContractStories();
  try {
    const { stories } = await readTreeWithCaps(dir);
    const parcels = stories.find((s) => s.id === "parcels");
    assert.ok(parcels, "the story is present");
    const three = parcels.capabilities.find((c) => c.id === "three-contracts");
    const none = parcels.capabilities.find((c) => c.id === "no-contracts");
    assert.equal(three?.testCount, 3, "three declared contracts are counted");
    assert.equal(none?.testCount, 0, "a spec with no `## Contracts` section yields 0");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// foldVerdicts — the green derivation
// ---------------------------------------------------------------------------

// THE CORE: a signed-verdict fixture greens BOTH the capability plant (its own verdict) AND the story
// island (the per-test crown roll-up). This is the brown→green the desktop forest was missing.
test("tree-verdicts: foldVerdicts greens the plant (own verdict) AND the island (crown roll-up) from signed verdicts", async () => {
  const { dir, cleanup } = await seedStories();
  try {
    const { stories, uatTestCriteriaByStory, coverageByStory } = await readTreeWithCaps(dir);
    await foldVerdicts(stories, uatTestCriteriaByStory, coverageByStory, {
      latestVerdicts: { "cap-a": { outcome: "pass", at: TS } },
      verdictEvents: [passEvent(1, "cap-a", "capability"), passEvent(2, "alpha#uat-1", "story")],
      openQuestions: [],
    });
    const alpha = stories[0];
    assert.ok(alpha);
    assert.equal(
      alpha.capabilities[0]?.verdict?.outcome,
      "pass",
      "the cap plant greens from its OWN signed verdict (latestVerdicts direct attach)",
    );
    assert.equal(
      alpha.verdict?.outcome,
      "pass",
      "the story island greens from the per-test crown roll-up (rollupStoryGreen: caps healthy AND UAT green)",
    );
  } finally {
    await cleanup();
  }
});

// NEVER over-claim: with no verdict source (the json backend / a down DB) the tree carries NO verdict —
// the authored brown stands. The presence-block discipline (ADR-0033): advisory-absent, never green.
test("tree-verdicts: foldVerdicts with null verdict sources attaches NO verdict (under-claims, never over-claims)", async () => {
  const { dir, cleanup } = await seedStories();
  try {
    const { stories, uatTestCriteriaByStory, coverageByStory } = await readTreeWithCaps(dir);
    await foldVerdicts(stories, uatTestCriteriaByStory, coverageByStory, {
      latestVerdicts: null,
      verdictEvents: null,
      openQuestions: [],
    });
    const alpha = stories[0];
    assert.ok(alpha);
    assert.equal(alpha.verdict, undefined, "no crown verdict — the island stays its authored hue");
    assert.equal(alpha.capabilities[0]?.verdict, undefined, "no plant verdict — the cap stays its authored hue");
  } finally {
    await cleanup();
  }
});

// The story crown is the per-test roll-up's, never a child verdict map entry: a cap-only verdict (no
// UAT verdict) leaves the island ungreened even though its plant is green (ADR-0040 §2: green plants do
// not make a green crown). Proves the crown derives from the UAT clause, not from latestVerdicts[story].
test("tree-verdicts: a green plant alone does NOT green the island (the crown awaits its own UAT roll-up)", async () => {
  const { dir, cleanup } = await seedStories();
  try {
    const { stories, uatTestCriteriaByStory, coverageByStory } = await readTreeWithCaps(dir);
    await foldVerdicts(stories, uatTestCriteriaByStory, coverageByStory, {
      latestVerdicts: { "cap-a": { outcome: "pass", at: TS } },
      verdictEvents: [passEvent(1, "cap-a", "capability")], // cap proven, but NO alpha#uat-1 verdict
      openQuestions: [],
    });
    const alpha = stories[0];
    assert.ok(alpha);
    assert.equal(alpha.capabilities[0]?.verdict?.outcome, "pass", "the plant is green");
    assert.equal(alpha.verdict, undefined, "the island is NOT green — the UAT clause is unproven");
  } finally {
    await cleanup();
  }
});

// The OQ green-gate (ADR-0107): an OPEN question attached to the story's proving process (`node:alpha`)
// WITHHOLDS the would-be green crown — the desktop must not paint green a story the hosted studio gates.
test("tree-verdicts: an open gating question WITHHOLDS the would-be green crown", async () => {
  const { dir, cleanup } = await seedStories();
  try {
    const { stories, uatTestCriteriaByStory, coverageByStory } = await readTreeWithCaps(dir);
    await foldVerdicts(stories, uatTestCriteriaByStory, coverageByStory, {
      latestVerdicts: { "cap-a": { outcome: "pass", at: TS } },
      verdictEvents: [passEvent(1, "cap-a", "capability"), passEvent(2, "alpha#uat-1", "story")],
      openQuestions: [{ id: "oq-1", references: ["node:alpha"] }],
    });
    const alpha = stories[0];
    assert.ok(alpha);
    assert.equal(
      alpha.verdict,
      undefined,
      "the crown that WOULD be green is withheld while a node:alpha open question is unresolved",
    );
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// applyCapCoverage (pure) — a brownfield cap greens via its covering gate
// ---------------------------------------------------------------------------

// ADR-0097: a cap with no OWN verdict greens when a healthy reliability gate `(covers:)` it — the
// synthetic verdict is a SIGNED green (the gate's), so plants and crown tell one story. `capRollup` is
// injected (the orchestrator's rollupCapStatus in production) so the wiring is pinned without a real gate.
test("tree-verdicts: applyCapCoverage synthesizes a covered brownfield cap's verdict from its gate", () => {
  const stories: DTStory[] = [
    {
      id: "beta",
      title: "Beta",
      outcome: "",
      status: "mapped",
      proofMode: "UAT",
      uatWitness: "human",
      dependsOn: [],
      consumedBy: [],
      capabilities: [
        { id: "cap-covered", title: "Covered", outcome: "", status: "mapped", proofMode: "", dependsOn: [], testCount: 0 },
        { id: "cap-bare", title: "Bare", outcome: "", status: "mapped", proofMode: "", dependsOn: [], testCount: 0 },
      ],
    },
  ];
  const coverageByStory = new Map([[
    "beta",
    [{ id: "beta#gate-1", covers: ["cap-covered"] }],
  ]]);
  const events: DTVerdictEvent[] = [passEvent(1, "beta#gate-1", "story")];
  // Inject a capRollup that greens ONLY the covered cap (mirrors rollupCapStatus reading the gate verdict).
  applyCapCoverage(stories, coverageByStory, events, (capId) =>
    capId === "cap-covered" ? "healthy" : null,
  );
  const beta = stories[0];
  assert.ok(beta);
  assert.equal(beta.capabilities[0]?.verdict?.outcome, "pass", "the covered cap greens via its gate");
  assert.equal(beta.capabilities[0]?.verdict?.at, TS, "the synthetic verdict's `at` is the covering gate's verdict time");
  assert.equal(beta.capabilities[1]?.verdict, undefined, "the uncovered cap stays unproven (no coverage to supply green)");
});

// ---------------------------------------------------------------------------
// Boundary guard (the desktop story's "Local-backend boundary call" / ADR-0100)
// ---------------------------------------------------------------------------

// Static guard: the verdict fold re-composes the SHARED organism compute (orchestrator/library), NEVER
// the studio server, and stays pg-FREE (the verdict SQL lives behind the injected seam in
// electron/backend-entry.ts). A regression that reached for pg or the studio source here would breach
// the surface boundary + the desktop's brokered-only write posture (ADR-0117).
test("tree-verdicts: imports no pg, no @storytree/*/store, and no studio server (the surface boundary)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(path.join(here, "tree-verdicts.ts"), "utf8");
  const importLines = src
    .split(/\r?\n/)
    .filter((l) => /^\s*import\b/.test(l) || /import\(/.test(l))
    .join("\n");

  assert.ok(!/cloud-sql-connector/.test(importLines), "must not import the Cloud SQL connector");
  assert.ok(!/\bfrom\s+["']pg["']/.test(importLines), "must not import pg");
  assert.ok(!/@storytree\/\w[\w-]*\/store/.test(importLines), "must not import any node-only /store subpath");
  assert.ok(!/studio\/server/.test(importLines), "must not import the studio server (surface boundary)");
});
