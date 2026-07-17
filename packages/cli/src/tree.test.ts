/**
 * Proof for the "tree-view" capability node (stories/notice-board/tree-view.md).
 *
 * Covers:
 *   1. bare and focused views render ok:true (the presence block is RETIRED, ADR-0200 D7 —
 *      the body never carries "sessions here:")
 *   2. focused marks cap-a REAL-buildable, cap-b registered, cap-c unregistered
 *   5. focused next has a noticeboard declare pointer (--node demo-story) + node build pointer;
 *      bare next has storytree tree demo-story
 *
 * Offline only — no real stories/ tree, no DB, no API keys.
 */

import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";

import { treeCommand, type TreeDeps } from "./tree.js";

/** A signed-verdict event for a per-test UAT id, shaped for the verdict reader seam. */
function verdictEvent(seq: number, unitId: string, outcome: "pass" | "fail") {
  return {
    seq,
    kind: SIGNING_EVENT_KIND,
    doc: {
      unitId,
      proofMode: "operator-attested",
      outcome,
      commitSha: "cafebabe",
      signer: "owner@example.com",
      runId: `run-${seq}`,
      at: "2026-06-20T00:00:00.000Z",
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let storiesDir: string;

before(() => {
  storiesDir = mkdtempSync(join(tmpdir(), "tree-view-test-"));
  const storyDir = join(storiesDir, "demo-story");
  mkdirSync(storyDir);

  writeFileSync(
    join(storyDir, "story.md"),
    [
      "---",
      "id: demo-story",
      "tier: story",
      "title: Demo Story",
      "outcome: The demo story delivers value",
      "status: proposed",
      "proof_mode: UAT",
      "capabilities:",
      "  - cap-a",
      "  - cap-b",
      "  - cap-c",
      "---",
      "",
      "Demo story body.",
      "",
      // A plain (non-would-be) Story UAT: these legs ARE hard crown obligations (ADR-0097 — a
      // `(would-be)` heading would relax them, which the dedicated would-be test below exercises).
      "## Story UAT",
      "",
      "1. **First check** _(witness: machine)_: it parses.",
      "2. **Human look** _(witness: human)_: it looks right.",
    ].join("\n"),
  );

  writeFileSync(
    join(storyDir, "cap-a.md"),
    [
      "---",
      "id: cap-a",
      "tier: capability",
      "title: Capability A",
      "outcome: cap-a is done",
      "status: proposed",
      "proof_mode: integration-test",
      "---",
      "",
      "cap-a body.",
    ].join("\n"),
  );

  // cap-b depends on cap-a
  writeFileSync(
    join(storyDir, "cap-b.md"),
    [
      "---",
      "id: cap-b",
      "tier: capability",
      "title: Capability B",
      "outcome: cap-b is done",
      "status: proposed",
      "proof_mode: integration-test",
      "depends_on:",
      "  - cap-a",
      "---",
      "",
      "cap-b body.",
    ].join("\n"),
  );

  writeFileSync(
    join(storyDir, "cap-c.md"),
    [
      "---",
      "id: cap-c",
      "tier: capability",
      "title: Capability C",
      "outcome: cap-c is done",
      "status: proposed",
      "proof_mode: integration-test",
      "---",
      "",
      "cap-c body.",
    ].join("\n"),
  );

  // ── a BROWNFIELD story (ADR-0097): would-be UAT + reliability gates that (covers:) its caps ──
  // Mirrors the library's shape: a `(would-be)` UAT section (aspirational, NOT crown-blocking), and
  // observe gates whose adopted verdicts green the caps they cover — except `pocket-cap`, which no
  // gate covers, so it holds the crown at proposed even after the gates are adopted.
  const brownDir = join(storiesDir, "brown-story");
  mkdirSync(brownDir);
  writeFileSync(
    join(brownDir, "story.md"),
    [
      "---",
      "id: brown-story",
      "tier: story",
      "title: Brown Story",
      "outcome: a brownfield organism is adopted into the fold",
      "status: mapped",
      "proof_mode: UAT",
      "uat_witness: machine",
      "capabilities:",
      "  - covered-cap",
      "  - pocket-cap",
      "---",
      "",
      "Brown story body.",
      "",
      "## Story UAT (would-be)",
      "",
      "1. **Aspirational walkthrough** _(witness: machine)_: no scripted test today.",
      "",
      "## Reliability Gates",
      "",
      "1. **The suite is green** _(gate: observe)_ _(covers: covered-cap)_ `pnpm --filter brown test`.",
    ].join("\n"),
  );
  for (const capId of ["covered-cap", "pocket-cap"]) {
    writeFileSync(
      join(brownDir, `${capId}.md`),
      [
        "---",
        `id: ${capId}`,
        "tier: capability",
        `title: ${capId}`,
        `outcome: ${capId} is observed`,
        "status: mapped",
        "proof_mode: integration-test",
        "---",
        "",
        `${capId} body.`,
      ].join("\n"),
    );
  }
});

after(() => {
  rmSync(storiesDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Fake helpers
// ---------------------------------------------------------------------------

function lookupConfig(id: string): { real?: unknown } | null {
  if (id === "cap-a") return { real: {} };
  if (id === "cap-b") return {};
  return null;
}

const NOW = new Date("2026-06-11T10:00:00.000Z");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// (1a) bare view — ok, no sessions block (presence retired, ADR-0200 D7)
test("bare view is ok and has no sessions here: block", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    now: () => NOW,
  };
  const env = await treeCommand(undefined, deps);
  assert.equal(env.ok, true);
  assert.ok(!env.body.includes("sessions here:"), "the bare body never carries the retired presence block");
  assert.ok(!env.body.includes("Active sessions"), "the bare-view session summary is retired too");
});

// (1b) bare view — next has storytree tree <id>
test("bare view next contains storytree tree demo-story", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    now: () => NOW,
  };
  const env = await treeCommand(undefined, deps);
  assert.equal(env.ok, true);
  assert.ok(
    Array.isArray(env.next) && env.next.some((n) => n.includes("storytree tree demo-story")),
    "bare next must contain 'storytree tree demo-story'",
  );
});

// (1c) focused view — ok, no sessions block (presence retired, ADR-0200 D7)
test("focused view is ok and has no sessions here: block", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    now: () => NOW,
  };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.ok(!env.body.includes("sessions here:"), "the focused body never carries the retired presence block");
});

// (2) build-surface marks
test("focused view marks cap-a REAL-buildable, cap-b registered, cap-c unregistered", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    now: () => NOW,
  };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.ok(env.body.includes("REAL-buildable"), "body must include 'REAL-buildable' for cap-a");
  assert.ok(env.body.includes("registered"), "body must include 'registered' for cap-b");
  assert.ok(env.body.includes("unregistered"), "body must include 'unregistered' for cap-c");
});

// (6) UAT-tests block — offline (no attestations reader): the test list renders from the spec,
// with witness kinds, but NO mark column (silently absent, like the verdict glyphs).
test("focused view renders the UAT tests block from the spec; marks absent offline", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    now: () => NOW,
  };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.ok(env.body.includes("UAT tests:"), "body has a UAT tests block");
  assert.ok(env.body.includes("demo-story#uat-1"), "lists the first test id");
  assert.ok(env.body.includes("demo-story#uat-2"), "lists the second test id");
  assert.ok(env.body.includes("witness=machine"), "shows the declared witness kind");
  assert.ok(env.body.includes("First check") && env.body.includes("Human look"), "shows titles");
  assert.ok(!env.body.includes("◉") && !env.body.includes("▣"), "no attestation marks offline");
});

// (7) UAT-tests block — with an attestation reader: a human seal on the voucht test, – on the other.
test("focused view shows attestation marks when the reader answers (human seal vs – never voucht)", async () => {
  const reader = {
    async readEvents() {
      return [
        {
          seq: 1,
          doc: {
            testId: "demo-story#uat-2",
            outcome: "pass",
            witness: "human",
            signer: "owner@example.com",
            at: "2026-06-11T09:59:00.000Z",
            relayedBy: "session-alpha",
          },
        },
      ];
    },
  };
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    attestations: reader,
    now: () => NOW,
  };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.ok(env.body.includes("◉ human:pass"), "the voucht test renders the human seal + outcome");
  // uat-1 has no attestation → the never-voucht dash; and the marks are never the gate ✓/✗.
  assert.ok(/demo-story#uat-1\s+witness=machine\s+First check\s+–/.test(env.body), "unvoucht test → –");
  assert.ok(!env.body.includes("✓") && !env.body.includes("✗"), "attestation marks are not the verdict glyphs");
});

// (8) per-test PROVEN + story-green crown roll-up (ADR-0083 Fork A, refining ADR-0082): with a verdict
// reader, each test gets a signed proven glyph and the story crown greens from the AND of (all
// capabilities proven healthy) AND (the per-test UAT roll-up green).
test("focused view: a story crown greens when all capabilities AND per-test UAT verdicts pass (ADR-0083 Fork A)", async () => {
  const verdicts = {
    async readEvents() {
      return [
        verdictEvent(1, "cap-a", "pass"),
        verdictEvent(2, "cap-b", "pass"),
        verdictEvent(3, "cap-c", "pass"),
        verdictEvent(4, "demo-story#uat-1", "pass"),
        verdictEvent(5, "demo-story#uat-2", "pass"),
      ];
    },
  };
  const deps: TreeDeps = { storiesDir, lookupConfig, verdicts, now: () => NOW };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.match(env.body, /Story: demo-story ✓/, "the crown wears the proven glyph");
  assert.match(env.body, /UAT proof: GREEN/, "the story UAT rolled up green");
  assert.match(env.body, /story green: GREEN/, "the crown greens (all caps healthy AND UAT proven)");
  assert.match(env.body, /demo-story#uat-1\s+witness=machine\s+proven=✓/, "uat-1 proven ✓");
  assert.match(env.body, /demo-story#uat-2\s+witness=human\s+proven=✓/, "uat-2 proven ✓");
});

// (8b) ADR-0083 Fork A: capabilities-green is a NECESSARY condition — UAT all green but a capability
// still unproven leaves the crown under-claiming, even though the UAT clause itself is green.
test("focused view: a green UAT does NOT green the crown while a capability is unproven (ADR-0083 Fork A)", async () => {
  const verdicts = {
    async readEvents() {
      return [
        verdictEvent(1, "cap-a", "pass"),
        verdictEvent(2, "cap-b", "pass"),
        // cap-c never earned a signed pass — the crown cannot be green while it stands unproven.
        verdictEvent(3, "demo-story#uat-1", "pass"),
        verdictEvent(4, "demo-story#uat-2", "pass"),
      ];
    },
  };
  const deps: TreeDeps = { storiesDir, lookupConfig, verdicts, now: () => NOW };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.match(env.body, /Story: demo-story –/, "the crown under-claims while cap-c is unproven");
  assert.match(env.body, /UAT proof: GREEN/, "the UAT clause itself is green");
  assert.match(env.body, /story green: unproven/, "but the crown stays unproven (a capability is not yet healthy)");
});

test("focused view: a story with one unproven test under-claims (crown –, the test proven=–)", async () => {
  const verdicts = {
    async readEvents() {
      return [verdictEvent(1, "demo-story#uat-1", "pass")];
    },
  };
  const deps: TreeDeps = { storiesDir, lookupConfig, verdicts, now: () => NOW };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.match(env.body, /Story: demo-story –/, "the crown under-claims (not every test proven)");
  assert.match(env.body, /UAT proof: unproven/, "the story UAT under-claims");
  assert.match(env.body, /demo-story#uat-1\s+witness=machine\s+proven=✓/, "the proven test → ✓");
  assert.match(env.body, /demo-story#uat-2\s+witness=human\s+proven=–/, "the unproven test → –");
});

// ── ADR-0097: brownfield adoption — would-be UAT relaxation + (covers:) crown coverage ──

test("brownfield: an adopted gate greens the cap it covers, but an UNcovered cap holds the crown (ADR-0097)", async () => {
  const verdicts = {
    async readEvents() {
      // Only the observe gate is adopted (signed). It (covers: covered-cap). pocket-cap is covered by
      // no gate and has no own verdict → it stays unproven and holds the crown at proposed.
      return [verdictEvent(1, "brown-story#gate-1", "pass")];
    },
  };
  const deps: TreeDeps = { storiesDir, lookupConfig, verdicts, now: () => NOW };
  const env = await treeCommand("brown-story", deps);
  assert.equal(env.ok, true);
  assert.match(env.body, /Story: brown-story –/, "the crown under-claims while pocket-cap is uncovered");
  assert.match(env.body, /story green: unproven/, "an uncovered cap keeps the crown unproven");
  // The would-be UAT leg has NO signed verdict, yet it does NOT wedge the crown (ADR-0097): it is
  // surfaced as aspirational, not as a blocking "unproven" obligation.
  assert.match(env.body, /UAT proof: would-be/, "the would-be section is aspirational, not crown-blocking");
  // ADR-0097 §5 / owner Option A: the covered cap wears the SAME ✓ as an own-driven cap (the plant
  // agrees with the crown's coverage), while the uncovered pocket stays – until it earns its own verdict.
  assert.match(env.body, /covered-cap ✓ {2}/, "the gate-covered cap renders ✓ (coverage greens the plant)");
  assert.match(env.body, /pocket-cap – {2}/, "the uncovered cap stays – (no own verdict, no coverage)");
});

test("brownfield: the crown greens when every cap is covered/proven and only a would-be UAT leg remains (ADR-0097)", async () => {
  const verdicts = {
    async readEvents() {
      return [
        // covered-cap greens via the adopted gate's coverage; pocket-cap earns its own signed pass.
        verdictEvent(1, "brown-story#gate-1", "pass"),
        verdictEvent(2, "pocket-cap", "pass"),
      ];
    },
  };
  const deps: TreeDeps = { storiesDir, lookupConfig, verdicts, now: () => NOW };
  const env = await treeCommand("brown-story", deps);
  assert.equal(env.ok, true);
  // Both caps satisfied + the only hard own-proof obligation (the gate) signed; the would-be UAT leg
  // is NOT required → the crown greens.
  assert.match(env.body, /Story: brown-story ✓/, "the crown greens (caps covered/proven, gate signed, would-be UAT not required)");
  assert.match(env.body, /story green: GREEN/, "the brownfield crown greens via coverage");
  // Both plants are now ✓ — the gate-covered cap and the own-proven cap render identically (Option A).
  assert.match(env.body, /covered-cap ✓ {2}/, "the gate-covered cap renders ✓");
  assert.match(env.body, /pocket-cap ✓ {2}/, "the own-proven cap renders ✓");
});

// (5) focused next pointers
test("focused next has noticeboard declare with --node demo-story, node build --real, and storytree tree", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    now: () => NOW,
  };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.ok(Array.isArray(env.next), "next must be an array");
  const next = env.next as readonly string[];
  assert.ok(
    next.some((n) => n.includes("noticeboard declare") && n.includes("--node demo-story")),
    "next must contain a noticeboard declare pointer with --node demo-story",
  );
  assert.ok(
    next.some((n) => n.includes("node build") && n.includes("--real")),
    "next must contain a node build --real pointer for a REAL-buildable capability",
  );
  assert.ok(
    next.some((n) => n === "storytree tree"),
    "next must contain 'storytree tree' (back out)",
  );
});
