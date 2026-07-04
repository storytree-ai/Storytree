// Tests for the desktop chat orchestrator-session turn-budget resolver (orchestrator-turns.ts).
//
// WHAT IT PINS: the desktop chat orchestrator session is UNBOUNDED by default (ADR-0151) — an unset
// env yields `undefined` (no maxTurns → no SDK ceiling), NOT a number. STORYTREE_ORCHESTRATOR_MAX_TURNS,
// when set to a usable positive number, RE-imposes a cap. Every unusable value (blank, non-numeric,
// non-finite, zero, negative) degrades to `undefined` (unbounded) — never a broken cap. This is the
// CI-provable core; the backend-entry glue that reads process.env and threads the result into
// createChatSseMount is operator-attested (a node:test over it would spawn a subscription-billed SDK
// session).

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveOrchestratorMaxTurns } from "./orchestrator-turns.js";

test("resolveOrchestratorMaxTurns: an unset env value yields undefined — UNBOUNDED by default (ADR-0151)", () => {
  assert.equal(resolveOrchestratorMaxTurns(undefined), undefined);
});

test("resolveOrchestratorMaxTurns: a usable positive env value RE-imposes a cap", () => {
  assert.equal(resolveOrchestratorMaxTurns("16"), 16);
  assert.equal(resolveOrchestratorMaxTurns("100"), 100);
});

test("resolveOrchestratorMaxTurns: a fractional value floors to a whole turn count", () => {
  assert.equal(resolveOrchestratorMaxTurns("16.9"), 16);
});

test("resolveOrchestratorMaxTurns: unusable values degrade to undefined (unbounded), never a broken cap", () => {
  for (const bad of ["", "   ", "abc", "0", "-4", "NaN", "Infinity"]) {
    assert.equal(
      resolveOrchestratorMaxTurns(bad),
      undefined,
      `"${bad}" should fall back to undefined (unbounded), not a 0/NaN cap`,
    );
  }
});
