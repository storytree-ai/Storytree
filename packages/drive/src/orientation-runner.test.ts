/**
 * Contract tests for the composed read-only orientation runner
 * (`packages/drive/src/orientation-runner.ts`) — the drive-resident seam the desktop sidecar
 * hands to the chat session so its orientation tools read the REAL three surfaces (ADR-0108),
 * without importing `@storytree/cli` (ADR-0112).
 *
 * Behaviours pinned (all OFFLINE — injected fakes, no DB, no SDK):
 *   1. ["tree"]        → the bare story-tree view over the injected storiesDir.
 *   2. ["library"]     → the library dashboard over the injected knowledge store.
 *   3. ["noticeboard"] → the claim-ledger board over the injected ledger read (ADR-0200 D7).
 *   4. Anything else   → an ok:false refusal envelope (read-only by construction, never a throw).
 *   5. The drill-downs (the in-app orchestrator's "answer these sorts of questions" gap):
 *      ["tree","spec",<id>] → the full spec markdown; ["library","artifact",<id>] → one
 *      artifact's body; ["library","artifact","list",<cat>] → a category listing;
 *      ["agents"(,<name>)] → the agent-guidance renderer (self-onboarding).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { Store } from "@storytree/storage-protocol";

import { createOrientationRunner } from "./orientation-runner.js";
import type { ClaimLedgerReadLike } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** A minimal knowledge store: queryDocs feeds the dashboard; getDoc feeds the artifact view. */
function fakeKnowledgeStore(): {
  queryDocs(filter?: { kind?: string }): Promise<unknown[]>;
  getDoc(id: string): Promise<unknown>;
} {
  const doc = {
    id: "live-shaped-artifact",
    kind: "principle",
    doc: {
      id: "live-shaped-artifact",
      title: "A live-shaped principle",
      body: "THE PRINCIPLE BODY TEXT",
      references: ["asset:another-artifact"],
    },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
  return {
    async queryDocs(filter?: { kind?: string }) {
      // agentIds queries {kind:"agent"} — this store holds none, so the agents view lists empty.
      return filter?.kind !== undefined && filter.kind !== doc.kind ? [] : [doc];
    },
    async getDoc(id: string) {
      return id === doc.id ? doc : null;
    },
  };
}

function fakeLedger(): ClaimLedgerReadLike {
  const nowIso = new Date().toISOString();
  return {
    async listLiveClaims() {
      return [
        {
          unitId: "headless-orchestrator",
          sessionId: "zen-session",
          branch: "claude/zen",
          intent: "orienting the chat agent",
          grade: "exploring" as const,
          claimedAt: nowIso,
          heartbeatAt: nowIso,
        },
      ];
    },
  };
}

function makeRunner(overrides: Partial<Parameters<typeof createOrientationRunner>[0]> = {}) {
  return createOrientationRunner({
    // The dashboard only reads queryDocs/getDoc — the fake satisfies that slice structurally.
    store: fakeKnowledgeStore() as unknown as Store,
    storiesDir: mkdtempSync(path.join(tmpdir(), "orientation-runner-")),
    lookupConfig: () => null,
    ledger: fakeLedger(),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 1. tree
// ---------------------------------------------------------------------------

test("orientation runner: [tree] renders the story-tree view", async () => {
  const runner = makeRunner();
  const env = await runner(["tree"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /^Stories:/, "the tree view opens with the Stories: header");
  assert.doesNotMatch(env.body, /Active sessions/, "the presence summary is retired (ADR-0200 D7)");
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

test("orientation runner: [noticeboard] renders the claim-ledger board over the injected ledger", async () => {
  const runner = makeRunner();
  const env = await runner(["noticeboard"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /Claim ledger \(ADR-0200\)/, "the board IS the claim ledger");
  assert.match(env.body, /zen-session/, "the claiming session renders on the board");
  assert.match(env.body, /headless-orchestrator/, "claims name their units");
});

test("orientation runner: [noticeboard] with no ledger degrades to the empty offline render", async () => {
  const runner = makeRunner({ ledger: null });
  const env = await runner(["noticeboard"], { store: null, writable: false });
  assert.equal(env.ok, true, "no ledger → the empty no-live-claims render, never a throw");
  assert.match(env.body, /No live claims on the ledger\./);
});

// ---------------------------------------------------------------------------
// 4. read-only refusal
// ---------------------------------------------------------------------------

test("orientation runner: any non-read argv is refused with an ok:false envelope", async () => {
  const runner = makeRunner();
  for (const argv of [
    ["noticeboard", "declare"],
    ["library", "edit"],
    ["build", "story"],
    ["adr", "new"],
    [],
  ] as const) {
    const env = await runner(argv, { store: null, writable: false });
    assert.equal(env.ok, false, `[${argv.join(" ")}] must be refused (read-only by construction)`);
    assert.match(env.body, /unsupported command|orientation/i);
  }
});

// ---------------------------------------------------------------------------
// 5. Drill-downs — tree spec / library artifact / artifact list / agents
// ---------------------------------------------------------------------------

/** A stories/ dir with one story + one capability spec, for the spec view. */
function makeStoriesDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "orientation-spec-"));
  const storyDir = path.join(dir, "demo-story");
  mkdirSync(storyDir);
  writeFileSync(
    path.join(storyDir, "story.md"),
    "---\nid: demo-story\ntier: story\n---\n# Demo story\n",
    "utf8",
  );
  writeFileSync(
    path.join(storyDir, "demo-cap.md"),
    "---\nid: demo-cap\ntier: capability\n---\n# THE DEMO CAP SPEC BODY\n",
    "utf8",
  );
  return dir;
}

test("orientation runner: [tree spec <id>] returns the node's full spec markdown", async () => {
  const runner = makeRunner({ storiesDir: makeStoriesDir() });
  const env = await runner(["tree", "spec", "demo-cap"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /THE DEMO CAP SPEC BODY/, "the capability's spec markdown is the body");
  assert.ok(
    (env.next ?? []).some((n) => n.includes("tree demo-story")),
    "next: points at the owning story's tree",
  );
});

test("orientation runner: [tree spec <unknown>] misses with guidance, never a throw", async () => {
  const runner = makeRunner({ storiesDir: makeStoriesDir() });
  const env = await runner(["tree", "spec", "no-such-node"], { store: null, writable: false });
  assert.equal(env.ok, false);
  assert.match(env.body, /no spec found/);
  assert.ok((env.next ?? []).length > 0, "a miss still ships next: guidance");
});

test("orientation runner: [library artifact <id>] renders the artifact body with references", async () => {
  const runner = makeRunner();
  const env = await runner(["library", "artifact", "live-shaped-artifact"], {
    store: null,
    writable: false,
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /THE PRINCIPLE BODY TEXT/, "the artifact's body renders");
  assert.ok(
    (env.next ?? []).some((n) => n.includes("another-artifact")),
    "asset: references become next: pulls",
  );
});

test("orientation runner: [library artifact list <category>] lists ids; unknown category lists categories", async () => {
  const runner = makeRunner();
  const hit = await runner(["library", "artifact", "list", "principle"], {
    store: null,
    writable: false,
  });
  assert.equal(hit.ok, true);
  assert.match(hit.body, /live-shaped-artifact/);

  const miss = await runner(["library", "artifact", "list", "nope"], {
    store: null,
    writable: false,
  });
  assert.equal(miss.ok, false);
  assert.match(miss.body, /available categories/);
});

test("orientation runner: [agents] lists available agents (self-onboarding entry), fail-soft when none", async () => {
  const runner = makeRunner();
  const env = await runner(["agents"], { store: null, writable: false });
  assert.equal(env.ok, false, "no name given → the needs-a-name guidance, never a throw");
  assert.match(env.body, /agents needs a name|no agent/i);
});
