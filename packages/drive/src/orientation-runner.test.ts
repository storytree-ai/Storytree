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

import { InMemoryStore } from "@storytree/storage-protocol";
import type { Store } from "@storytree/storage-protocol";
import { KIND_SPECS } from "@storytree/library";

import { createOrientationRunner } from "./orientation-runner.js";
import type { ClaimLedgerReadLike } from "./noticeboard.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/**
 * A REAL `InMemoryStore` holding one artifact — the dashboard reads it through the same class
 * production does, rather than through a two-method fake asserted into the seam (anti-slop
 * `no-chained-type-assertions`, inc-09). `agentIds` queries `{kind:"agent"}`, which this store
 * holds none of, so the agents view still lists empty.
 */
async function fakeKnowledgeStore(): Promise<Store> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "live-shaped-artifact",
    kind: "principle",
    doc: {
      id: "live-shaped-artifact",
      title: "A live-shaped principle",
      body: "THE PRINCIPLE BODY TEXT",
      references: ["asset:another-artifact"],
    },
  });
  return store;
}

function fakeLedger(): ClaimLedgerReadLike {
  const nowIso = new Date().toISOString();
  return {
    async listAllClaims() {
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

async function makeRunner(overrides: Partial<Parameters<typeof createOrientationRunner>[0]> = {}) {
  return createOrientationRunner({
    // The dashboard only reads queryDocs/getDoc — the fake satisfies that slice structurally.
    store: await fakeKnowledgeStore(),
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
  const runner = await makeRunner();
  const env = await runner(["tree"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /^Stories:/, "the tree view opens with the Stories: header");
  assert.doesNotMatch(env.body, /Active sessions/, "the presence summary is retired (ADR-0200 D7)");
});

// ---------------------------------------------------------------------------
// 2. library
// ---------------------------------------------------------------------------

test("orientation runner: [library] renders the dashboard over the injected store", async () => {
  const runner = await makeRunner();
  const env = await runner(["library"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /^Library: /, "the dashboard opens with the health banner");
  assert.match(env.body, /live-shaped-artifact/, "the injected store's artifacts are mapped");
});

// ---------------------------------------------------------------------------
// 3. noticeboard
// ---------------------------------------------------------------------------

test("orientation runner: [noticeboard] renders the claim-ledger board over the injected ledger", async () => {
  const runner = await makeRunner();
  const env = await runner(["noticeboard"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /Claim ledger \(ADR-0200\)/, "the board IS the claim ledger");
  assert.match(env.body, /zen-session/, "the claiming session renders on the board");
  assert.match(env.body, /headless-orchestrator/, "claims name their units");
});

test("orientation runner: [noticeboard] with no ledger degrades to the UNREAD offline render", async () => {
  const runner = await makeRunner({ ledger: null });
  const env = await runner(["noticeboard"], { store: null, writable: false });
  assert.equal(env.ok, true, "no ledger → the offline render, never a throw");
  // Unknown, not empty: an offline board that reports "no claims" asserts something about a store
  // this process never read (ADR-0346 D1 companion work).
  assert.match(env.body, /UNREAD — offline/);
});

// ---------------------------------------------------------------------------
// 4. read-only refusal
// ---------------------------------------------------------------------------

test("orientation runner: any non-read argv is refused with an ok:false envelope", async () => {
  const runner = await makeRunner();
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
  const runner = await makeRunner({ storiesDir: makeStoriesDir() });
  const env = await runner(["tree", "spec", "demo-cap"], { store: null, writable: false });
  assert.equal(env.ok, true);
  assert.match(env.body, /THE DEMO CAP SPEC BODY/, "the capability's spec markdown is the body");
  assert.ok(
    (env.next ?? []).some((n) => n.includes("tree demo-story")),
    "next: points at the owning story's tree",
  );
});

test("orientation runner: [tree spec <unknown>] misses with guidance, never a throw", async () => {
  const runner = await makeRunner({ storiesDir: makeStoriesDir() });
  const env = await runner(["tree", "spec", "no-such-node"], { store: null, writable: false });
  assert.equal(env.ok, false);
  assert.match(env.body, /no spec found/);
  assert.ok((env.next ?? []).length > 0, "a miss still ships next: guidance");
});

test("orientation runner: [library artifact <id>] renders the artifact body with references", async () => {
  const runner = await makeRunner();
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
  const runner = await makeRunner();
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

// ---- the listable set comes from the SCHEMA, not from the rows that happen to exist -----------
//
// The same defect PR #1111 fixed CLI-side (`listCategory` in packages/cli/src/commands.ts) had a
// second, population-derived copy here — this is the orientation-runner surface, a different code
// path the CLI dispatch never enters. The population is STAGED in each test, never inherited from
// whichever tier happens to be empty today: an inherited precondition inverts the moment someone
// writes a row.

/** A store holding exactly one `definition` — every other schema kind is genuinely at zero. */
async function storeWithOneDefinition(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "the-only-row",
    kind: "definition",
    doc: { kind: "definition", id: "the-only-row", title: "The only row" },
  });
  return store;
}

// The kind under test is DERIVED from the schema, never a literal. Naming one costs a rot the
// staged population does not: `proposal` was the obvious empty tier when these tests were written
// and the schema RETIRED that kind the same day, so the literal named a category the error branch
// was then right to reject — a red that says nothing about the behaviour under test.
const SOME_EMPTY_SCHEMA_KIND = Object.keys(KIND_SPECS).find((k) => k !== "definition");

test("orientation runner: [library artifact list <schema kind with ZERO rows>] reports the tier EMPTY at ok:true", async () => {
  // A new kind starts empty by definition, and a lifecycle tier draining to zero is the SUCCESS
  // state — both must read as a fact about the population, never as "the kind does not exist".
  assert.ok(SOME_EMPTY_SCHEMA_KIND, "the schema defines a kind other than the one staged below");
  const runner = await makeRunner({ store: await storeWithOneDefinition() });
  const env = await runner(["library", "artifact", "list", SOME_EMPTY_SCHEMA_KIND], {
    store: null,
    writable: false,
  });
  assert.equal(env.ok, true, `an empty schema kind lists empty, not unknown: ${env.body}`);
  assert.equal(env.body, `${SOME_EMPTY_SCHEMA_KIND} (0):`, "the same shape a populated tier uses");
});

test("orientation runner: [library artifact list] advertises every SCHEMA kind, including the ones at zero", async () => {
  const runner = await makeRunner({ store: await storeWithOneDefinition() });
  const env = await runner(["library", "artifact", "list", "not-a-real-kind"], {
    store: null,
    writable: false,
  });
  assert.equal(env.ok, false, "a kind the schema does not define is still a genuine user error");
  assert.match(env.body, /unknown category "not-a-real-kind"/);
  // The available list can never again advertise a narrower world than the schema defines — asserted
  // over the WHOLE schema, so a kind added tomorrow is covered without editing this test.
  for (const kind of Object.keys(KIND_SPECS)) {
    assert.ok(env.body.includes(kind), `available categories names ${kind}`);
  }
});

test("orientation runner: [library artifact list] still lists a kind the store holds but the knowledge schema does not name", async () => {
  // `template` artifacts (ADR-0210) carry a kind outside the knowledge union and list today —
  // the schema-derived set is a WIDENING, so nothing that works loses.
  const store = await storeWithOneDefinition();
  await store.upsertDoc({
    id: "template-thing",
    kind: "template",
    doc: { kind: "template", id: "template-thing", title: "Template — thing" },
  });
  const runner = await makeRunner({ store });
  const env = await runner(["library", "artifact", "list", "template"], {
    store: null,
    writable: false,
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /template \(1\):/);
  assert.match(env.body, /template-thing/);
});

test("orientation runner: [agents] lists available agents (self-onboarding entry), fail-soft when none", async () => {
  const runner = await makeRunner();
  const env = await runner(["agents"], { store: null, writable: false });
  assert.equal(env.ok, false, "no name given → the needs-a-name guidance, never a throw");
  assert.match(env.body, /agents needs a name|no agent/i);
});
