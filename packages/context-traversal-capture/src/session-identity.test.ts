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
  resolveTraceIdentity,
  DECLARED_SESSION_ID_ENV,
  HOST_WINDOW_ID_ENV,
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
