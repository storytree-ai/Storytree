/**
 * Proof for the "tree-view" capability node (stories/notice-board/tree-view.md).
 *
 * Covers:
 *   1. bare and focused views render ok:true with presence:null, body free of "sessions here:"
 *   2. focused marks cap-a REAL-buildable, cap-b registered, cap-c unregistered
 *   3. with a fake presence store the focused body shows "sessions here:" with the
 *      matching sessionId and NOT the unrelated one
 *   4. a presence store whose methods throw → focused still ok:true, no block
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

import type { PresenceDeclarationDoc } from "@storytree/core";

import type { PresenceStoreLike } from "./noticeboard.js";
import { treeCommand, type TreeDeps } from "./tree.js";

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

const matchingDoc: PresenceDeclarationDoc = {
  sessionId: "session-alpha",
  branch: "claude/real/tree-view",
  workingOn: "building tree view",
  nodes: ["demo-story"],
  status: "active",
  startedAt: "2026-06-11T09:55:00.000Z",
  lastSeenAt: "2026-06-11T09:58:00.000Z",
};

const unrelatedDoc: PresenceDeclarationDoc = {
  sessionId: "session-beta",
  branch: "claude/real/other-work",
  workingOn: "something else entirely",
  nodes: ["other-story"],
  status: "active",
  startedAt: "2026-06-11T09:50:00.000Z",
  lastSeenAt: "2026-06-11T09:57:00.000Z",
};

const fakePresence: PresenceStoreLike = {
  async listActive() {
    return [matchingDoc, unrelatedDoc];
  },
  async declare(doc: PresenceDeclarationDoc) {
    return doc;
  },
  async done(_sessionId: string, _lastSeenAt: string) {
    return null;
  },
  async history(_sessionId: string) {
    return [];
  },
};

const throwingPresence: PresenceStoreLike = {
  async listActive(): Promise<PresenceDeclarationDoc[]> {
    throw new Error("presence store exploded");
  },
  async declare(_doc: PresenceDeclarationDoc): Promise<PresenceDeclarationDoc> {
    throw new Error("presence store exploded");
  },
  async done(_sessionId: string, _lastSeenAt: string): Promise<PresenceDeclarationDoc | null> {
    throw new Error("presence store exploded");
  },
  async history(_sessionId: string): Promise<Array<{ type: string; doc: unknown; actor: string; at: string }>> {
    throw new Error("presence store exploded");
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// (1a) bare view — presence: null — ok, no sessions block
test("bare view with presence:null is ok and has no sessions here: block", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    presence: null,
    now: () => NOW,
  };
  const env = await treeCommand(undefined, deps);
  assert.equal(env.ok, true);
  assert.ok(!env.body.includes("sessions here:"), "bare null-presence body must not contain 'sessions here:'");
});

// (1b) bare view — next has storytree tree <id>
test("bare view next contains storytree tree demo-story", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    presence: null,
    now: () => NOW,
  };
  const env = await treeCommand(undefined, deps);
  assert.equal(env.ok, true);
  assert.ok(
    Array.isArray(env.next) && env.next.some((n) => n.includes("storytree tree demo-story")),
    "bare next must contain 'storytree tree demo-story'",
  );
});

// (1c) focused view — presence: null — ok, no sessions block
test("focused view with presence:null is ok and has no sessions here: block", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    presence: null,
    now: () => NOW,
  };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.ok(!env.body.includes("sessions here:"), "focused null-presence body must not contain 'sessions here:'");
});

// (2) build-surface marks
test("focused view marks cap-a REAL-buildable, cap-b registered, cap-c unregistered", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    presence: null,
    now: () => NOW,
  };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.ok(env.body.includes("REAL-buildable"), "body must include 'REAL-buildable' for cap-a");
  assert.ok(env.body.includes("registered"), "body must include 'registered' for cap-b");
  assert.ok(env.body.includes("unregistered"), "body must include 'unregistered' for cap-c");
});

// (3) presence store — matching session shown, unrelated not shown
test("focused view with presence store shows matching sessionId not unrelated", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    presence: fakePresence,
    now: () => NOW,
  };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.ok(env.body.includes("sessions here:"), "body must include 'sessions here:' block");
  assert.ok(env.body.includes("session-alpha"), "body must include matching sessionId 'session-alpha'");
  assert.ok(!env.body.includes("session-beta"), "body must NOT include unrelated sessionId 'session-beta'");
});

// (4) throwing presence store — still ok, no sessions block
test("focused view with throwing presence store is still ok and omits sessions block", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    presence: throwingPresence,
    now: () => NOW,
  };
  const env = await treeCommand("demo-story", deps);
  assert.equal(env.ok, true);
  assert.ok(!env.body.includes("sessions here:"), "body must not contain 'sessions here:' when store throws");
});

// (5) focused next pointers
test("focused next has noticeboard declare with --node demo-story, node build --real, and storytree tree", async () => {
  const deps: TreeDeps = {
    storiesDir,
    lookupConfig,
    presence: null,
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
