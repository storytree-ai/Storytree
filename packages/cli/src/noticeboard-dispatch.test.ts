import test from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/base";
import type { PresenceDeclarationDoc } from "@storytree/core";

import { run } from "./commands.js";
import type { PresenceStoreLike } from "./noticeboard.js";

/**
 * The noticeboard DISPATCH wiring (spine-side, ADR-0033): `run` routes the `noticeboard` area to
 * the leaf-proven `noticeboardCommand` with parsed flags, the injected presence store, and the
 * injectable identity. The command module's own truths live in noticeboard.test.ts (the node's
 * registered proof); this file only proves the glue.
 */

interface FakePresence extends PresenceStoreLike {
  docs: Map<string, PresenceDeclarationDoc>;
  events: Array<{ type: string; doc: unknown; actor: string; at: string }>;
}

function fakePresenceStore(): FakePresence {
  const docs = new Map<string, PresenceDeclarationDoc>();
  const events: FakePresence["events"] = [];
  return {
    docs,
    events,
    async declare(doc) {
      docs.set(doc.sessionId, doc);
      events.push({ type: "declared", doc, actor: doc.sessionId, at: doc.lastSeenAt });
      return doc;
    },
    async done(sessionId, lastSeenAt) {
      const existing = docs.get(sessionId);
      if (existing === undefined) return null;
      const merged: PresenceDeclarationDoc = { ...existing, status: "done", lastSeenAt };
      docs.set(sessionId, merged);
      events.push({ type: "done", doc: merged, actor: sessionId, at: lastSeenAt });
      return merged;
    },
    async listActive() {
      return [...docs.values()].filter((d) => d.status === "active");
    },
    async history(sessionId) {
      return events.filter((e) => e.actor === sessionId);
    },
  };
}

test("the noticeboard area routes to the board with the injected presence store", async () => {
  const presence = fakePresenceStore();
  await presence.declare({
    sessionId: "alpha-1",
    branch: "claude/alpha",
    workingOn: "building tree-view",
    nodes: ["tree-view"],
    status: "active",
    startedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  });
  const env = await run(["noticeboard"], {
    store: new InMemoryStore(),
    presence: { store: presence, identity: null },
  });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /alpha-1/);
  assert.match(env.body, /tree-view/);
});

test("declare through the dispatch parses --working-on/--node and uses the injected identity", async () => {
  const presence = fakePresenceStore();
  const env = await run(
    ["noticeboard", "declare", "--working-on", "wiring the dispatch", "--node", "noticeboard-cli", "--node", "tree-view"],
    {
      store: new InMemoryStore(),
      presence: { store: presence, identity: { sessionId: "alpha-2", branch: "claude/x" } },
    },
  );
  assert.equal(env.ok, true, env.body);
  const doc = presence.docs.get("alpha-2");
  assert.ok(doc !== undefined);
  assert.equal(doc.branch, "claude/x");
  assert.equal(doc.workingOn, "wiring the dispatch");
  assert.deepEqual(doc.nodes, ["noticeboard-cli", "tree-view"]);
});

test("done through the dispatch drops the session from the board", async () => {
  const presence = fakePresenceStore();
  const deps = {
    store: new InMemoryStore(),
    presence: { store: presence, identity: { sessionId: "alpha-3", branch: "b" } },
  };
  await run(["noticeboard", "declare", "--working-on", "x"], deps);
  const env = await run(["noticeboard", "done"], deps);
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(await presence.listActive(), []);
  assert.equal((await presence.history("alpha-3")).length, 2);
});

test("without a presence store the area degrades to the db guidance, never a crash", async () => {
  const env = await run(["noticeboard"], {
    store: new InMemoryStore(),
    presence: { store: null, identity: null },
  });
  assert.equal(env.ok, false);
  assert.ok(env.next?.includes("pnpm db:up"));
});

test("noticeboard --help is an ok envelope and the top help names the area", async () => {
  const helpEnv = await run(["noticeboard", "--help"], {
    store: new InMemoryStore(),
    presence: { store: null, identity: null },
  });
  assert.equal(helpEnv.ok, true);
  assert.match(helpEnv.body, /derived from the enclosing/);

  const top = await run([], { store: new InMemoryStore() });
  assert.match(top.body, /noticeboard/);
});
