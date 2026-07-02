/**
 * Contract tests for the composed read-only orientation runner
 * (`packages/drive/src/orientation-runner.ts`) — the drive-resident seam the desktop sidecar
 * hands to the chat session so its orientation tools read the REAL three surfaces (ADR-0108),
 * without importing `@storytree/cli` (ADR-0112).
 *
 * Behaviours pinned (all OFFLINE — injected fakes, no DB, no SDK):
 *   1. ["tree"]        → the bare story-tree view over the injected storiesDir + presence store.
 *   2. ["library"]     → the library dashboard over the injected knowledge store.
 *   3. ["noticeboard"] → the notice board over the injected presence store.
 *   4. Anything else   → an ok:false refusal envelope (read-only by construction, never a throw).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Store } from "@storytree/storage-protocol";

import { createOrientationRunner } from "./orientation-runner.js";
import type { PresenceStoreLike } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** A minimal knowledge store: queryDocs feeds the dashboard; getDoc feeds the doctrine pointer. */
function fakeKnowledgeStore(): {
  queryDocs(): Promise<unknown[]>;
  getDoc(id: string): Promise<unknown>;
} {
  const doc = {
    id: "live-shaped-artifact",
    kind: "principle",
    doc: { id: "live-shaped-artifact", title: "A live-shaped principle" },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
  return {
    async queryDocs() {
      return [doc];
    },
    async getDoc() {
      return null; // doctrine pointer falls back to the bare id line (fail-soft)
    },
  };
}

function fakePresenceStore(): PresenceStoreLike {
  return {
    async declare(d) {
      return d;
    },
    async done() {
      return null;
    },
    async listActive() {
      return [
        {
          sessionId: "zen-session",
          branch: "claude/zen",
          workingOn: "orienting the chat agent",
          nodes: ["headless-orchestrator"],
          status: "active",
          startedAt: "2026-07-02T00:00:00.000Z",
          lastSeenAt: new Date().toISOString(),
        },
      ];
    },
    async history() {
      return [];
    },
  };
}

function makeRunner(overrides: Partial<Parameters<typeof createOrientationRunner>[0]> = {}) {
  return createOrientationRunner({
    // The dashboard only reads queryDocs/getDoc — the fake satisfies that slice structurally.
    store: fakeKnowledgeStore() as unknown as Store,
    storiesDir: mkdtempSync(path.join(tmpdir(), "orientation-runner-")),
    lookupConfig: () => null,
    presence: fakePresenceStore(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 1. tree
// ---------------------------------------------------------------------------

test("orientation runner: [tree] renders the story-tree view with the live session summary", async () => {
  const runner = makeRunner();
  const env = await runner(["tree"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /^Stories:/, "the tree view opens with the Stories: header");
  assert.match(env.body, /Active sessions: 1/, "the injected presence store feeds the live summary");
});

// ---------------------------------------------------------------------------
// 2. library
// ---------------------------------------------------------------------------

test("orientation runner: [library] renders the dashboard over the injected store", async () => {
  const runner = makeRunner();
  const env = await runner(["library"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /^Library: /, "the dashboard opens with the health banner");
  assert.match(env.body, /live-shaped-artifact/, "the injected store's artifacts are mapped");
});

// ---------------------------------------------------------------------------
// 3. noticeboard
// ---------------------------------------------------------------------------

test("orientation runner: [noticeboard] renders the board over the injected presence store", async () => {
  const runner = makeRunner();
  const env = await runner(["noticeboard"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /zen-session/, "the active session renders on the board");
  assert.match(env.body, /headless-orchestrator/, "sessions group under their declared nodes");
});

test("orientation runner: [noticeboard] with no presence store refuses honestly (offline board)", async () => {
  const runner = makeRunner({ presence: null });
  const env = await runner(["noticeboard"], { store: null, writable: false });
  assert.equal(env.ok, false, "no store → the board's honest live-store refusal, never a throw");
});

// ---------------------------------------------------------------------------
// 4. read-only refusal
// ---------------------------------------------------------------------------

test("orientation runner: any non-read argv is refused with an ok:false envelope", async () => {
  const runner = makeRunner();
  for (const argv of [
    ["noticeboard", "declare"],
    ["library", "artifact"],
    ["build", "story"],
    ["adr", "new"],
    [],
  ] as const) {
    const env = await runner(argv, { store: null, writable: false });
    assert.equal(env.ok, false, `[${argv.join(" ")}] must be refused (read-only by construction)`);
    assert.match(env.body, /unsupported command|orientation/i);
  }
});
