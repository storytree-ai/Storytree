import { test } from "node:test";
import assert from "node:assert/strict";

// This import fails until subagent-colour.ts is implemented — that is the intended red.
import { subagentColourState } from "./subagent-colour.js";
import type { SubagentRole, ClaimIntent, ColourStateToken } from "./subagent-colour.js";

// ─────────────────────────────────────────────────────────────────────────────
// ADR-0138 §5 — subagentColourState: pure role/intent → colour-state mapping
//
// The wisp colour must express WHAT the orchestrator is doing on the claimed
// story: authoring (story-author), proving (red→green leaf), supplementing
// (glue work / non-leaf orchestration). The function is PURE (role or intent
// in, colour-state token out) and OFFLINE (no store, no clock, builtins-only).
//
// Honesty wall: "proving" is a CLAIM colour state, never the proven-green
// bloom. A real build's CONFIRM_GREEN + signed verdict owns the bloom
// (ADR-0045 / ADR-0099). The mapping must not emit "green" or "bloom".
// ─────────────────────────────────────────────────────────────────────────────

// ── Role → colour-state token ─────────────────────────────────────────────

test("subagentColourState('authoring') returns the 'authoring' colour-state token", () => {
  const token: ColourStateToken = subagentColourState("authoring");
  assert.equal(token, "authoring");
});

test("subagentColourState('proving') returns the 'proving' colour-state token", () => {
  const token: ColourStateToken = subagentColourState("proving");
  assert.equal(token, "proving");
});

test("subagentColourState('supplementing') returns the 'supplementing' colour-state token", () => {
  const token: ColourStateToken = subagentColourState("supplementing");
  assert.equal(token, "supplementing");
});

// ── Visual distinction: all three produce distinct tokens ─────────────────

test("subagent-role-maps-to-distinct-colour-state: subagentColourState produces a distinct token for each of the three roles", () => {
  const authoring = subagentColourState("authoring");
  const proving = subagentColourState("proving");
  const supplementing = subagentColourState("supplementing");

  assert.notEqual(
    authoring,
    proving,
    `'authoring' and 'proving' must have distinct colour tokens (both returned "${authoring}")`,
  );
  assert.notEqual(
    authoring,
    supplementing,
    `'authoring' and 'supplementing' must have distinct colour tokens (both returned "${authoring}")`,
  );
  assert.notEqual(
    proving,
    supplementing,
    `'proving' and 'supplementing' must have distinct colour tokens (both returned "${proving}")`,
  );
});

// ── Honesty wall (ADR-0045 / ADR-0099) ───────────────────────────────────

test("subagentColourState never emits 'green' or 'bloom' for any role — the honesty wall", () => {
  // "proving" is a CLAIM colour state. The proven-green bloom is owned by
  // CONFIRM_GREEN + a signed verdict. The mapping must not pre-empt it.
  const FORBIDDEN = new Set<string>(["green", "bloom"]);
  const roles: SubagentRole[] = ["authoring", "proving", "supplementing"];
  for (const role of roles) {
    const token = subagentColourState(role);
    assert.ok(
      !FORBIDDEN.has(token),
      `subagentColourState("${role}") returned "${token}" — ` +
        `forbidden tokens: ${[...FORBIDDEN].join(", ")} (ADR-0045 / ADR-0099)`,
    );
  }
});

// ── Claim intent → colour-state token ────────────────────────────────────
//
// The three claim intents the spine can carry: "edit" (story-author file
// edits), "real" (red→green leaf driving a real build), "orchestrate"
// (non-leaf glue / supplementing). Each maps to the same token as the
// equivalent explicit role.

test("subagentColourState maps claim intent 'edit' to the same token as 'authoring'", () => {
  const byIntent: ColourStateToken = subagentColourState("edit" as ClaimIntent);
  const byRole: ColourStateToken = subagentColourState("authoring");
  assert.equal(byIntent, byRole, `'edit' intent must map to the 'authoring' colour-state token`);
});

test("subagentColourState maps claim intent 'real' to the same token as 'proving'", () => {
  const byIntent: ColourStateToken = subagentColourState("real" as ClaimIntent);
  const byRole: ColourStateToken = subagentColourState("proving");
  assert.equal(byIntent, byRole, `'real' intent must map to the 'proving' colour-state token`);
});

test("subagentColourState maps claim intent 'orchestrate' to the same token as 'supplementing'", () => {
  const byIntent: ColourStateToken = subagentColourState("orchestrate" as ClaimIntent);
  const byRole: ColourStateToken = subagentColourState("supplementing");
  assert.equal(
    byIntent,
    byRole,
    `'orchestrate' intent must map to the 'supplementing' colour-state token`,
  );
});

// ── Purity: stable, same output for same input, no side effects ───────────

test("subagentColourState is a pure function — identical calls return identical tokens", () => {
  const inputs: Array<SubagentRole | ClaimIntent> = [
    "authoring",
    "proving",
    "supplementing",
    "edit",
    "real",
    "orchestrate",
  ];
  for (const input of inputs) {
    const first = subagentColourState(input);
    const second = subagentColourState(input);
    assert.equal(
      first,
      second,
      `subagentColourState("${input}") is not stable — first call "${first}", second call "${second}"`,
    );
  }
});
