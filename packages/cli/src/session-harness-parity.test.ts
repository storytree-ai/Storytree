// The TWO harness detectors must give ONE answer (`session-harness-and-host-arc`).
//
// A trace line and a claim both record which agent harness wrote them and which machine they were
// written on, and both DETECT it from the writing process. The detection exists twice on purpose:
// `@storytree/context-traversal-capture` (the trace) and `@storytree/notice-board` (the claim
// ledger) are separate organisms that may not import one another (ADR-0074), and neither is the
// other's natural home. The CLI depends on both, so this is the one place the copies can be held
// together — the `spawn-record.mjs` / `deriveIdentity` precedent: a copy kept honest mechanically,
// not by whoever edits one of them remembering the other.
//
// What would go wrong without it is quiet and exactly the failure the arc exists to end: one process
// writing a claim that says `codex` and a trace line that says `claude-code` (or nothing), so two
// records of the same session disagree about who ran it.

import assert from "node:assert/strict";
import test from "node:test";

import { SESSION_HARNESSES, normalizeHost, resolveSessionHarness } from "@storytree/context-traversal-capture";
import { ClaimHarness, normalizeClaimHost, resolveClaimHarness } from "@storytree/notice-board";

type Env = Readonly<Record<string, string | undefined>>;

// Every shape the precedence distinguishes, including the ones a reader is most likely to get
// wrong: both harness variables at once (Claude wins), blanks (absent), and the `CLAUDECODE` marker
// that names a harness without naming a window.
const ENVS: ReadonlyArray<readonly [string, Env]> = [
  ["nothing at all", {}],
  ["Claude window id", { CLAUDE_CODE_SESSION_ID: "3f2a" }],
  ["Codex thread id", { CODEX_THREAD_ID: "01a0a7d6" }],
  ["both ids — Claude's rung is first", { CLAUDE_CODE_SESSION_ID: "3f2a", CODEX_THREAD_ID: "01a0a7d6" }],
  ["a blank Claude id falls through to Codex", { CLAUDE_CODE_SESSION_ID: "   ", CODEX_THREAD_ID: "01a0a7d6" }],
  ["a blank Codex id is absent", { CODEX_THREAD_ID: "" }],
  ["the Claude marker alone", { CLAUDECODE: "1" }],
  ["the Claude marker padded", { CLAUDECODE: " 1 " }],
  ["the Claude marker with another value", { CLAUDECODE: "true" }],
  ["the marker loses to a Codex thread id", { CLAUDECODE: "1", CODEX_THREAD_ID: "01a0a7d6" }],
  ["an unrelated override names no harness", { STORYTREE_SESSION_ID: "declared-x" }],
];

for (const [name, env] of ENVS) {
  test(`harness parity — ${name}: the trace and the claim detect the same harness`, () => {
    assert.equal(resolveClaimHarness(env), resolveSessionHarness(env));
  });
}

test("harness parity — the table reaches every answer, so agreement is not agreement on null", () => {
  const answers = new Set(ENVS.map(([, env]) => resolveSessionHarness(env)));
  assert.deepEqual([...answers].sort(), ["claude-code", "codex", null].sort());
});

test("harness parity — both organisms know exactly the same harness vocabulary", () => {
  assert.deepEqual([...ClaimHarness.options], [...SESSION_HARNESSES]);
});

for (const raw of ["MicksMSpro", "  mint \n", "", "   ", null, undefined] as const) {
  test(`host parity — ${JSON.stringify(raw ?? String(raw))}: both normalise a hostname identically`, () => {
    assert.equal(normalizeClaimHost(raw), normalizeHost(raw));
  });
}
