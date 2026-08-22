import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { type AdrMeta } from "@storytree/drive";

import {
  adrHealth,
  adrGateFailures,
  extractPathTokens,
  loadStoryDecisions,
  ADR_GATE_CHECKS,
  type GuardrailView,
  RETIRED_ADR_CHECKS,
  type AdrHealthInputs,
  type StoryDecisionsView,
} from "./adr-health.js";

/**
 * THE REAL-CORPUS CASE LIVES IN `check-adr-health.ts` NOW, not here (ADR-0403 dec 1).
 *
 * This file used to end with a REPO gate: it loaded every `docs/decisions/**` file and asserted the
 * GATE-class checks were clean on the actual corpus, which is what made `pnpm -r test` the ADR-0022
 * enforcement surface for decisions. The decision log is a database now, and `pnpm -r test` is
 * deliberately credential-free (ADR-0302 D3) — so that case could not stay: a suite dialling the
 * store stops being hermetic, and a DB outage would read as a unit-test failure. It moved to a
 * `check:*` rung, which ADR-0307 D4 permits to hold a connection.
 *
 * What stayed is everything that was ever really being proven here: each rung's LOGIC, against
 * literals, with no store and no filesystem.
 */

function adr(number: number, status: AdrMeta["status"], edges?: Partial<AdrMeta>): AdrMeta {
  return {
    number,
    file: `${String(number).padStart(4, "0")}-x.md`,
    status,
    supersedes: [],
    amends: [],
    loadBearing: false,
    ...edges,
  };
}

function inputs(partial: Partial<AdrHealthInputs>): AdrHealthInputs {
  return {
    adrs: [],
    parseErrors: [],
    numberMismatches: [],
    stories: [],
    guardrails: [],
    // A single decision with a clean body: the default must be a corpus the blind-read floor
    // considers READ, so a rung-8 FAIL in any test below is the link it was handed, never the
    // absence of a view.
    decisionBodies: [{ number: 1, body: "no links here" }],
    pathExists: () => true,
    ...partial,
  };
}

function levelOf(results: ReturnType<typeof adrHealth>, name: string): string | undefined {
  return results.find((r) => r.name === name)?.level;
}

// --- (a) pure-check tests ------------------------------------------------------------------------

test("adr-frontmatter: parse errors FAIL, a clean load PASSes", () => {
  assert.equal(levelOf(adrHealth(inputs({})), "adr-frontmatter"), "PASS");
  assert.equal(
    levelOf(adrHealth(inputs({ parseErrors: ["0099-x.md: no frontmatter block"] })), "adr-frontmatter"),
    "FAIL",
  );
});

test("adr-edge-integrity: a dangling edge target FAILs", () => {
  const ok = adrHealth(inputs({ adrs: [adr(1, "accepted"), adr(2, "accepted", { amends: [1] })] }));
  assert.equal(levelOf(ok, "adr-edge-integrity"), "PASS");
  const bad = adrHealth(inputs({ adrs: [adr(2, "accepted", { amends: [99] })] }));
  assert.equal(levelOf(bad, "adr-edge-integrity"), "FAIL");
});

test("supersede-consistency: both directions enforced", () => {
  // X supersedes Y but Y not flipped -> FAIL
  const halfDone = adrHealth(
    inputs({ adrs: [adr(14, "proposed"), adr(27, "accepted", { supersedes: [14] })] }),
  );
  assert.equal(levelOf(halfDone, "supersede-consistency"), "FAIL");
  // Y superseded with no incoming edge -> FAIL
  const orphan = adrHealth(inputs({ adrs: [adr(14, "superseded")] }));
  assert.equal(levelOf(orphan, "supersede-consistency"), "FAIL");
  // the pair recorded properly -> PASS
  const clean = adrHealth(
    inputs({ adrs: [adr(14, "superseded"), adr(27, "accepted", { supersedes: [14] })] }),
  );
  assert.equal(levelOf(clean, "supersede-consistency"), "PASS");
});

test("story-decisions: dangling or superseded deciding ADRs FAIL", () => {
  const story = (decisions: number[]): StoryDecisionsView => ({ id: "s", status: "proposed", decisions });
  const adrs = [adr(14, "superseded"), adr(27, "accepted", { supersedes: [14] })];
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [story([27])] })), "story-decisions"), "PASS");
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [story([99])] })), "story-decisions"), "FAIL");
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [story([14])] })), "story-decisions"), "FAIL");
});

test("green-flip: a healthy story on a proposed ADR FAILs; non-healthy stories never fire", () => {
  const adrs = [adr(33, "proposed")];
  const healthy: StoryDecisionsView = { id: "s", status: "healthy", decisions: [33] };
  const building: StoryDecisionsView = { id: "s", status: "building", decisions: [33] };
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [healthy] })), "green-flip"), "FAIL");
  assert.equal(levelOf(adrHealth(inputs({ adrs, stories: [building] })), "green-flip"), "PASS");
});

test("load-bearing-live: a load_bearing ADR must be accepted (proposed/superseded FAIL)", () => {
  // accepted + load_bearing -> PASS
  const ok = adrHealth(inputs({ adrs: [adr(19, "accepted", { loadBearing: true })] }));
  assert.equal(levelOf(ok, "load-bearing-live"), "PASS");
  // proposed + load_bearing -> FAIL (and it gates)
  const tooEarly = adrHealth(inputs({ adrs: [adr(86, "proposed", { loadBearing: true })] }));
  assert.equal(levelOf(tooEarly, "load-bearing-live"), "FAIL");
  assert.ok(adrGateFailures(tooEarly).some((r) => r.name === "load-bearing-live"));
  // superseded + load_bearing -> FAIL (a dead ADR can't be current-state)
  const dead = adrHealth(
    inputs({ adrs: [adr(14, "superseded", { loadBearing: true }), adr(27, "accepted", { supersedes: [14] })] }),
  );
  assert.equal(levelOf(dead, "load-bearing-live"), "FAIL");
});

test("enforced-by-anchors: a dangling path token WARNs (never FAILs)", () => {
  const guardrail: GuardrailView = {
    id: "g",
    enforcedBy: "A rule: `packages/agent` may import, see `packages/gone/file.ts:1-9`.",
  };
  const results = adrHealth(
    inputs({ guardrails: [guardrail], pathExists: (p) => p === "packages/agent" }),
  );
  assert.equal(levelOf(results, "enforced-by-anchors"), "WARN");
  assert.deepEqual(adrGateFailures(results), [], "a WARN never gates");
});

test("extractPathTokens: backticked repo paths only, line suffixes dropped", () => {
  const tokens = extractPathTokens(
    "see `packages/cli/src/health.ts:84-102` and `apps/studio` but not prose/paths or `claim-conflict-refused`",
  );
  assert.deepEqual(tokens, ["packages/cli/src/health.ts", "apps/studio"]);
});

// --- (b) the REAL-repo gate (this is the ADR-0022 enforcement surface) --------------------------

// --- (c) loadRetiredInPartEdges (the raw frontmatter scan behind the gate) ----------------------

test("adr-number-identity: a row whose stored number disagrees with its id FAILs and GATES", () => {
  // `adr-number-unique`'s successor. Two FILES could share a number; two ROWS cannot, because the id
  // is the primary key — so the old question is unanswerable and asking it would be a permanent
  // vacuous green. What IS reachable is drift between the two places a decision's number is written.
  assert.equal(levelOf(adrHealth(inputs({})), "adr-number-identity"), "PASS");

  const drifted = adrHealth(
    inputs({ numberMismatches: ["adr-0403 stores number 402, which disagrees with its id"] }),
  );
  assert.equal(levelOf(drifted, "adr-number-identity"), "FAIL");
  assert.ok(
    adrGateFailures(drifted).some((r) => r.name === "adr-number-identity"),
    "it GATES — a decision addressed as one number and rendering as another is not a warning",
  );
});

test("the three rungs that retired with the files are DECLARED, not silently dropped", () => {
  // A retired check leaving no record reads later as a check nobody thought to write. Each entry
  // names WHY, and the two sets must not overlap: a rung cannot be both live and retired.
  for (const name of ["adr-number-unique", "supersedes-in-part-retired", "adr-link-integrity"]) {
    assert.ok(RETIRED_ADR_CHECKS.has(name), `${name} must be declared as retired`);
    assert.equal(ADR_GATE_CHECKS.has(name), false, `${name} must not still gate`);
    assert.ok(
      (RETIRED_ADR_CHECKS.get(name) ?? "").length > 30,
      `${name}'s retirement must say why, not just that it happened`,
    );
  }
  // And the successor IS live — the pair is what makes `adr-number-unique`'s removal a replacement
  // rather than a deletion.
  assert.ok(ADR_GATE_CHECKS.has("adr-number-identity"));
});

test("every GATE-class rung the checks emit is declared in ADR_GATE_CHECKS, and vice versa", () => {
  // The anti-vacuity pairing: a rung emitted but undeclared never gates (a silent downgrade), and a
  // rung declared but never emitted is a carve-out for something that no longer runs.
  const emitted = new Set(adrHealth(inputs({})).map((r) => r.name));
  for (const declared of ADR_GATE_CHECKS) {
    assert.ok(emitted.has(declared), `${declared} is declared as gating but is never emitted`);
  }
  const warnOnly = new Set(["enforced-by-anchors"]);
  for (const name of emitted) {
    if (warnOnly.has(name)) continue;
    assert.ok(ADR_GATE_CHECKS.has(name), `${name} is emitted but gates nothing — declare or retire it`);
  }
});

// --- 8 adr-body-links ----------------------------------------------------------------------------

test("adr-body-links: a clean body PASSes, a body linking a decision FILE FAILs", () => {
  assert.equal(
    levelOf(
      adrHealth(inputs({ decisionBodies: [{ number: 12, body: "ADR-0139 decides this." }] })),
      "adr-body-links",
    ),
    "PASS",
  );
  // The mutation: the SAME body with the number wrapped as a link to the deleted file must go RED.
  // Without this pair the rung could report PASS over any input and nothing would say so.
  const results = adrHealth(
    inputs({
      decisionBodies: [{ number: 12, body: "[ADR-0139](0139-the-accepted-adr-set.md) decides this." }],
    }),
  );
  assert.equal(levelOf(results, "adr-body-links"), "FAIL");
  const line = results.find((r) => r.name === "adr-body-links")?.lines[0] ?? "";
  assert.match(line, /ADR-0012 body links to ADR-0139/);
  assert.match(line, /storytree library artifact adr-0139/);
});

test("adr-body-links: it GATES — a dead link is a gate failure, not a warning", () => {
  const results = adrHealth(
    inputs({
      adrs: [adr(12, "accepted")],
      decisionBodies: [{ number: 12, body: "see [ADR-0139](0139-x.md)" }],
    }),
  );
  assert.ok(adrGateFailures(results).some((r) => r.name === "adr-body-links"));
});

test("adr-body-links: an UNWIRED bodies view FAILs rather than passing vacuously", () => {
  // Zero bodies alongside loaded decisions means the caller wired no view — the shape that reports
  // PASS having examined nothing.
  const results = adrHealth(inputs({ adrs: [adr(12, "accepted")], decisionBodies: [] }));
  assert.equal(levelOf(results, "adr-body-links"), "FAIL");
  assert.match(results.find((r) => r.name === "adr-body-links")?.lines[0] ?? "", /verified NOTHING/);
  // But an empty corpus with no decisions at all is not this rung's complaint to make.
  assert.equal(levelOf(adrHealth(inputs({ adrs: [], decisionBodies: [] })), "adr-body-links"), "PASS");
});

test("adr-body-links: every dead link is reported, not just the first", () => {
  const results = adrHealth(
    inputs({
      decisionBodies: [
        { number: 12, body: "[ADR-0139](0139-a.md) and [0145](0145-b.md)" },
        { number: 13, body: "[the bar](0097-c.md)" },
      ],
    }),
  );
  assert.equal(results.find((r) => r.name === "adr-body-links")?.lines.length, 3);
});
