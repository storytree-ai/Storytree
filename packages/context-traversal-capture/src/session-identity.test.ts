/**
 * What ONE trace session is — story `context-traversal-capture`, capability
 * `terminal-capture-activation` (`linked-session-context-arc-inc-30`).
 *
 * Pure by construction, so every case here injects the environment and the caller's slot rather
 * than touching `process.env`: the whole precedence is decided by values, and the suite is
 * HOME-independent and order-independent for the same reason `observe-cli.test.ts` is.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyTraceIdentity,
  describeTraceIdentity,
  normalizeHost,
  resolveSessionHarness,
  resolveTraceIdentity,
  CODEX_WINDOW_ID_ENV,
  DECLARED_SESSION_ID_ENV,
  HOST_WINDOW_ID_ENV,
  SESSION_HARNESSES,
} from "./session-identity.js";

test("the host window id keys the trace, and the worktree slot rides along as a grouping attribute", () => {
  const identity = resolveTraceIdentity({
    env: { [HOST_WINDOW_ID_ENV]: "7d61a5bb-c2cb-466d-ab19-8165d9a1f936" },
    slot: "confident-brahmagupta-b5b8f2",
  });

  assert.deepEqual(identity, {
    sessionId: "7d61a5bb-c2cb-466d-ab19-8165d9a1f936",
    grade: "window",
    slot: "confident-brahmagupta-b5b8f2",
    // Claude Code's window id is also what DETECTS the harness, and a caller that supplies no host
    // gets a null one rather than a guessed one.
    harness: "claude-code",
    host: null,
  });
  // The distinction the whole increment turns on: the slot is RECORDED and is not the identity.
  assert.notEqual(identity?.sessionId, identity?.slot);
});

test("a POOLED SLOT is never an identity — with no window id and no declared id, a resolvable slot still captures nothing", () => {
  assert.equal(
    resolveTraceIdentity({ env: {}, slot: "confident-brahmagupta-b5b8f2" }),
    null,
    "falling back to the slot is the defect, not the fallback: one slot is shared by a parent " +
      "session, its subagents, and every later session the pool hands it — median 2 windows, p90 8",
  );
  assert.equal(resolveTraceIdentity({ env: {}, slot: null }), null);
});

test("an explicitly declared session id wins over the harness window id, and carries the weaker grade that admits it", () => {
  const identity = resolveTraceIdentity({
    env: { [DECLARED_SESSION_ID_ENV]: "session-declared", [HOST_WINDOW_ID_ENV]: "window-uuid" },
    slot: "slot-x",
  });

  assert.equal(identity?.sessionId, "session-declared");
  assert.equal(
    identity?.grade,
    "declared",
    "a declared id is as precise as its declarer — it is not evidence of one window",
  );
  assert.equal(identity?.slot, "slot-x");
});

test("a blank or whitespace-only env value is ABSENT, not an identity", () => {
  assert.equal(resolveTraceIdentity({ env: { [HOST_WINDOW_ID_ENV]: "" }, slot: "slot-x" }), null);
  assert.equal(resolveTraceIdentity({ env: { [HOST_WINDOW_ID_ENV]: "   " }, slot: "slot-x" }), null);
  // A blank OVERRIDE falls through to the window id rather than resolving to an empty session id —
  // an empty string would name a `.jsonl` file with no stem at all.
  const fallenThrough = resolveTraceIdentity({
    env: { [DECLARED_SESSION_ID_ENV]: "  ", [HOST_WINDOW_ID_ENV]: "window-uuid" },
    slot: null,
  });
  assert.equal(fallenThrough?.sessionId, "window-uuid");
  assert.equal(fallenThrough?.grade, "window");
});

test("surrounding whitespace is trimmed off a resolved id, so one window cannot key two trace files", () => {
  const identity = resolveTraceIdentity({ env: { [HOST_WINDOW_ID_ENV]: " window-uuid\n" }, slot: null });
  assert.equal(identity?.sessionId, "window-uuid");
});

test("an UNGRADED trace is the legacy slot era, and is never guessed into a window", () => {
  assert.equal(classifyTraceIdentity([undefined, undefined]), "slot");
  assert.equal(classifyTraceIdentity([]), "slot");
  assert.equal(classifyTraceIdentity(["window", "window"]), "window");
  assert.equal(classifyTraceIdentity(["declared"]), "declared");
});

test("a trace whose lines disagree classifies as MIXED — the silent mixing this labelling exists to prevent", () => {
  assert.equal(classifyTraceIdentity(["window", undefined]), "mixed");
  assert.equal(classifyTraceIdentity([undefined, "declared"]), "mixed");
  assert.equal(classifyTraceIdentity(["window", "declared"]), "mixed");
});

test("the slot and mixed descriptions both state that the slot-keyed lines are NOT retrofittable", () => {
  for (const kind of ["slot", "mixed"] as const) {
    const described = describeTraceIdentity(kind);
    assert.match(
      described,
      /not\s+retrofittable/i,
      `${kind} must say outright that it cannot be repaired into window identity`,
    );
  }
  assert.match(describeTraceIdentity("slot"), /pools/i, "and it must say WHY: a slot pools windows");
  // The two honest grades say what they are without borrowing the legacy warning.
  for (const kind of ["window", "declared"] as const) {
    assert.doesNotMatch(describeTraceIdentity(kind), /not\s+retrofittable/i);
  }
});

// ---------------------------------------------------------------------------
// A SECOND HARNESS, AND WHO WROTE THE LINE
//
// Every case below spells each environment variable as a LITERAL rather than through the exported
// constant. That is deliberate: a test keyed by the constant moves with it, so a constant emptied or
// misspelled would still pass here while every real Codex process went on resolving nothing.
// ---------------------------------------------------------------------------

test("the env var names are the ones the harnesses actually export, and the harness vocabulary is closed", () => {
  assert.equal(CODEX_WINDOW_ID_ENV, "CODEX_THREAD_ID");
  assert.equal(HOST_WINDOW_ID_ENV, "CLAUDE_CODE_SESSION_ID");
  assert.deepEqual([...SESSION_HARNESSES], ["claude-code", "codex"]);
});

test("a CODEX thread id keys the trace at window grade and names its harness — the run that used to capture nothing", () => {
  const identity = resolveTraceIdentity({
    env: { CODEX_THREAD_ID: "0198de4f-codex-thread" },
    slot: "slot-x",
    host: "owner-laptop",
  });

  assert.deepEqual(identity, {
    sessionId: "0198de4f-codex-thread",
    grade: "window",
    slot: "slot-x",
    harness: "codex",
    host: "owner-laptop",
  });
});

test("Claude's window beats Codex's thread when both are set, and the harness agrees with the window that won", () => {
  // The nested shape: a Codex leaf launched from a Claude session inherits the parent's window id.
  // It keys to the Claude PARENT — the stated limit — and says so consistently rather than naming one
  // harness's window beside the other harness's name.
  const identity = resolveTraceIdentity({
    env: { CLAUDE_CODE_SESSION_ID: "claude-window", CODEX_THREAD_ID: "codex-thread" },
    slot: null,
  });
  assert.equal(identity?.sessionId, "claude-window");
  assert.equal(identity?.grade, "window");
  assert.equal(identity?.harness, "claude-code");
});

test("a declared id beats both windows, and the harness beside it is still DETECTED from the process", () => {
  const underClaude = resolveTraceIdentity({
    env: { STORYTREE_SESSION_ID: "declared-id", CLAUDE_CODE_SESSION_ID: "w", CODEX_THREAD_ID: "t" },
    slot: null,
  });
  assert.equal(underClaude?.sessionId, "declared-id");
  assert.equal(underClaude?.grade, "declared");
  assert.equal(underClaude?.harness, "claude-code");

  const underCodex = resolveTraceIdentity({
    env: { STORYTREE_SESSION_ID: "declared-id", CODEX_THREAD_ID: "t" },
    slot: null,
  });
  assert.equal(underCodex?.sessionId, "declared-id");
  assert.equal(underCodex?.grade, "declared");
  assert.equal(underCodex?.harness, "codex", "declaring the id does not declare the harness");
});

test("a blank value is ABSENT for all three identity variables, and a blank Claude id falls through to Codex's", () => {
  assert.equal(
    resolveTraceIdentity({
      env: { STORYTREE_SESSION_ID: "  ", CLAUDE_CODE_SESSION_ID: "", CODEX_THREAD_ID: " \n " },
      slot: "slot-x",
    }),
    null,
  );
  assert.equal(resolveTraceIdentity({ env: { CODEX_THREAD_ID: "" }, slot: null }), null);

  // Falling through to Codex's thread brings Codex's harness with it: the blank Claude id named no
  // window, so it detects no harness either.
  const fallenThrough = resolveTraceIdentity({
    env: { CLAUDE_CODE_SESSION_ID: "   ", CODEX_THREAD_ID: " codex-thread\n" },
    slot: null,
  });
  assert.equal(fallenThrough?.sessionId, "codex-thread", "trimmed, so one thread cannot key two trace files");
  assert.equal(fallenThrough?.grade, "window");
  assert.equal(fallenThrough?.harness, "codex");
});

test("resolveSessionHarness: the precedence table — and no recognised harness is null, never a guess", () => {
  const cases: readonly [Readonly<Record<string, string | undefined>>, string | null][] = [
    [{}, null],
    [{ CLAUDE_CODE_SESSION_ID: "w" }, "claude-code"],
    [{ CODEX_THREAD_ID: "t" }, "codex"],
    [{ CLAUDE_CODE_SESSION_ID: "w", CODEX_THREAD_ID: "t" }, "claude-code"],
    // The marker covers Claude Code versions that export no session id...
    [{ CLAUDECODE: "1" }, "claude-code"],
    [{ CLAUDECODE: " 1 " }, "claude-code"],
    // ...but only as `1` exactly, and it never outvotes a harness whose window id IS present.
    [{ CLAUDECODE: "0" }, null],
    [{ CLAUDECODE: "true" }, null],
    [{ CLAUDECODE: "" }, null],
    [{ CLAUDECODE: "1", CODEX_THREAD_ID: "t" }, "codex"],
    // A blank window id is absent, so the rung below it answers.
    [{ CLAUDE_CODE_SESSION_ID: "  ", CLAUDECODE: "1" }, "claude-code"],
    [{ CLAUDE_CODE_SESSION_ID: "", CODEX_THREAD_ID: "t" }, "codex"],
    [{ CODEX_THREAD_ID: "  " }, null],
    // A declared id says which SESSION this is, and nothing about the harness.
    [{ STORYTREE_SESSION_ID: "declared-id" }, null],
  ];
  for (const [env, expected] of cases) {
    assert.equal(resolveSessionHarness(env), expected, `for ${JSON.stringify(env)}`);
  }
});

test("normalizeHost: a hostname is trimmed, and a blank or missing one names no machine", () => {
  assert.equal(normalizeHost("DESKTOP-OWNER"), "DESKTOP-OWNER");
  assert.equal(normalizeHost(" owner-laptop \n"), "owner-laptop");
  assert.equal(normalizeHost(""), null);
  assert.equal(normalizeHost("   "), null);
  assert.equal(normalizeHost(undefined), null);
  assert.equal(normalizeHost(null), null);
});

test("the host rides beside the identity on every rung, normalised, and is null when the caller supplied none", () => {
  assert.equal(
    resolveTraceIdentity({ env: { STORYTREE_SESSION_ID: "d" }, slot: null, host: " owner-laptop " })?.host,
    "owner-laptop",
  );
  assert.equal(
    resolveTraceIdentity({ env: { CLAUDE_CODE_SESSION_ID: "w" }, slot: null, host: "mint-box" })?.host,
    "mint-box",
  );
  assert.equal(resolveTraceIdentity({ env: { CODEX_THREAD_ID: "t" }, slot: null, host: "   " })?.host, null);
  assert.equal(resolveTraceIdentity({ env: { CODEX_THREAD_ID: "t" }, slot: null })?.host, null);
  // A host never makes an identity on its own, any more than a slot does.
  assert.equal(resolveTraceIdentity({ env: {}, slot: "slot-x", host: "owner-laptop" }), null);
});
