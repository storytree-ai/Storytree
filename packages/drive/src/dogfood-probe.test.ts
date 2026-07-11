import test from "node:test";
import assert from "node:assert/strict";

import {
  auditUncoached,
  INNER_LOOP_TERMS,
  PROBE_NODE_PREFIX,
  probeNodeId,
  probeTaskPrompt,
} from "./dogfood-probe.js";

// ADR-0184 d.4: the uncoached-context integrity is a ONE-TIME authoring audit. These teeth make it a
// STANDING check — a hint slipped into the probe prompt reds the drive suite instead of silently
// coaching the probe.

test("auditUncoached: the REAL probe prompt names no inner-loop mechanic (leg 7's core integrity)", () => {
  const audit = auditUncoached(probeTaskPrompt(probeNodeId("abc123")));
  assert.equal(audit.ok, true, `probe prompt leaked inner-loop terms: ${audit.found.join(", ")}`);
  assert.deepEqual(audit.found, []);
});

test("auditUncoached: a prompt that spoon-feeds the inner loop FAILS the audit (the teeth)", () => {
  const coached =
    "Onboard from CLAUDE.md, then run `storytree node build my-node --real --store pg` to sign it.";
  const audit = auditUncoached(coached);
  assert.equal(audit.ok, false);
  assert.ok(audit.found.length > 0);
  // It caught the actual mechanics, not something incidental.
  assert.ok(audit.found.includes("node build"));
  assert.ok(audit.found.includes("--real"));
});

test("auditUncoached: each individual inner-loop term is caught (no gap in the guard)", () => {
  for (const term of INNER_LOOP_TERMS) {
    const audit = auditUncoached(`please use ${term} to do the thing`);
    assert.equal(audit.ok, false, `term "${term}" was not caught by the audit`);
    assert.ok(audit.found.includes(term));
  }
});

test("auditUncoached: matching is case-insensitive (a capitalized hint still fails)", () => {
  const audit = auditUncoached("Run NODE BUILD in --REAL mode.");
  assert.equal(audit.ok, false);
  assert.ok(audit.found.includes("node build"));
  assert.ok(audit.found.includes("--real"));
});

test("probeTaskPrompt: DOES point at the onboarding surface and name the outcome (not a blank task)", () => {
  const prompt = probeTaskPrompt(probeNodeId("xyz"));
  assert.match(prompt, /CLAUDE\.md/);
  assert.match(prompt, /signed/i); // it names the OUTCOME (a signed verdict) — allowed, that is the success condition
  assert.match(prompt, /dogfood-probe-xyz/); // the target node id is threaded in
});

test("probeNodeId: carries the recognizable dogfood-probe prefix gate-7 keys on", () => {
  assert.equal(probeNodeId("seed42"), "dogfood-probe-seed42");
  assert.ok(probeNodeId("seed42").startsWith(PROBE_NODE_PREFIX));
});
