import assert from "node:assert/strict";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/core";
import type { Comment } from "@storytree/store";

import {
  CURATOR_ACTOR,
  ScriptedCuratorRunner,
  enactCuration,
  type CommentSink,
  type CurationAction,
  type CurationContext,
} from "./curate.js";

const ISO = "2026-01-01T00:00:00.000Z";

function oqDoc(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    kind: "open-question",
    title: `OQ ${id}`,
    description: "one-line",
    stakes: "what breaks if unsettled",
    statement: "the question?",
    context: "why it is open now",
    options: "A vs B",
    references: [],
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

function proposalDoc(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    kind: "proposal",
    title: `P ${id}`,
    description: "one-line",
    summary: "the change",
    motivation: "why",
    change: "before to after",
    scope: "blast radius",
    migration: "ordered steps",
    readiness: "preconditions",
    references: [],
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  };
}

class FakeComments implements CommentSink {
  readonly created: { comment: Comment; actor?: string }[] = [];
  async create(comment: Comment, actor?: string): Promise<Comment> {
    this.created.push(actor !== undefined ? { comment, actor } : { comment });
    return comment;
  }
}

// --- retire (the auto-retire-with-rationale path) ------------------------------------------------

test("retire-open-question deletes with a recorded rationale", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "oq-x", kind: "open-question", doc: oqDoc("oq-x") });
  const out = await enactCuration({ store }, [
    { type: "retire-open-question", id: "oq-x", reason: "overtaken by ADR-9999", supersededBy: "doc:decisions/9999-x.md" },
  ]);
  assert.equal(out.enacted.length, 1);
  assert.equal(out.refused.length, 0);
  assert.equal(await store.getDoc("oq-x"), null, "row dropped from the projection");
  const deleted = (await store.readEvents({ id: "oq-x" })).find((e) => e.type === "deleted");
  assert.equal(deleted?.actor, CURATOR_ACTOR);
  assert.equal((deleted?.doc as { retiredReason?: string }).retiredReason, "overtaken by ADR-9999");
});

test("retire refuses anything that is not an open-question (kind fence)", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "g1", kind: "guardrail", doc: { id: "g1", kind: "guardrail" } });
  const out = await enactCuration({ store }, [
    { type: "retire-open-question", id: "g1", reason: "tried to retire a guardrail" },
  ]);
  assert.equal(out.enacted.length, 0);
  assert.equal(out.refused.length, 1);
  assert.ok(await store.getDoc("g1"), "the guardrail is untouched — never deleted");
});

test("retire of an absent id is refused, not a throw", async () => {
  const store = new InMemoryStore();
  const out = await enactCuration({ store }, [
    { type: "retire-open-question", id: "ghost", reason: "x" },
  ]);
  assert.equal(out.refused.length, 1);
});

// --- raise / reframe open-question ---------------------------------------------------------------

test("raise-open-question creates a valid OQ and refuses an existing id (edit-first)", async () => {
  const store = new InMemoryStore();
  const out = await enactCuration({ store }, [
    { type: "raise-open-question", doc: oqDoc("oq-new") },
  ]);
  assert.equal(out.enacted.length, 1);
  const created = await store.getDoc("oq-new");
  assert.equal(created?.kind, "open-question");

  const again = await enactCuration({ store }, [
    { type: "raise-open-question", doc: oqDoc("oq-new") },
  ]);
  assert.equal(again.refused.length, 1, "re-raising an existing id is refused");
});

test("raise-open-question refuses an invalid doc, never persisting it", async () => {
  const store = new InMemoryStore();
  const out = await enactCuration({ store }, [
    { type: "raise-open-question", doc: { id: "oq-bad", kind: "open-question", title: "no required body" } },
  ]);
  assert.equal(out.refused.length, 1);
  assert.equal(await store.getDoc("oq-bad"), null);
});

test("reframe-open-question patches an OQ; refuses a non-OQ target", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "oq-r", kind: "open-question", doc: oqDoc("oq-r") });
  const out = await enactCuration({ store }, [
    { type: "reframe-open-question", id: "oq-r", set: { statement: "a sharper question?" } },
  ]);
  assert.equal(out.enacted.length, 1);
  const reframed = await store.getDoc("oq-r");
  assert.equal((reframed?.doc as { statement: string }).statement, "a sharper question?");

  await store.upsertDoc({ id: "def1", kind: "definition", doc: { id: "def1", kind: "definition" } });
  const refused = await enactCuration({ store }, [
    { type: "reframe-open-question", id: "def1", set: { statement: "x" } },
  ]);
  assert.equal(refused.refused.length, 1, "reframing a definition is refused — comment+escalate instead");
});

// --- proposals -----------------------------------------------------------------------------------

test("create-proposal + edit-proposal work; editing a non-proposal is refused", async () => {
  const store = new InMemoryStore();
  const created = await enactCuration({ store }, [
    { type: "create-proposal", doc: proposalDoc("p1") },
  ]);
  assert.equal(created.enacted.length, 1);

  const edited = await enactCuration({ store }, [
    { type: "edit-proposal", id: "p1", set: { summary: "a revised change" } },
  ]);
  assert.equal(edited.enacted.length, 1);
  assert.equal((await store.getDoc("p1"))?.doc && ((await store.getDoc("p1"))!.doc as { summary: string }).summary, "a revised change");

  await store.upsertDoc({ id: "oq-z", kind: "open-question", doc: oqDoc("oq-z") });
  const refused = await enactCuration({ store }, [
    { type: "edit-proposal", id: "oq-z", set: { summary: "x" } },
  ]);
  assert.equal(refused.refused.length, 1, "edit-proposal on an open-question is refused (kind fence)");
});

// --- comment / escalate (any kind) ---------------------------------------------------------------

test("comment goes to the live comment store when present, else records as unsent", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "g1", kind: "guardrail", doc: { id: "g1", kind: "guardrail" } });

  const comments = new FakeComments();
  const withSink = await enactCuration({ store, comments }, [
    { type: "comment", artifactId: "g1", body: "this looks stale" },
  ]);
  assert.equal(withSink.enacted.length, 1);
  assert.equal(comments.created.length, 1);
  assert.equal(comments.created[0]?.comment.topicId, "g1");
  assert.equal(comments.created[0]?.comment.author, CURATOR_ACTOR);

  const noSink = await enactCuration({ store }, [
    { type: "comment", artifactId: "g1", body: "this looks stale" },
  ]);
  assert.equal(noSink.unsent.length, 1);
  assert.equal(noSink.enacted.length, 0);
});

test("escalate always surfaces for the owner, and comments when a sink is present", async () => {
  const store = new InMemoryStore();
  const comments = new FakeComments();
  const out = await enactCuration({ store, comments }, [
    { type: "escalate", artifactId: "principle-x", body: "contradicts ADR-0064" },
  ]);
  assert.equal(out.escalations.length, 1);
  assert.equal(comments.created.length, 1);
  assert.ok(comments.created[0]?.comment.body.includes("ESCALATION"), "escalation comment is marked");

  const offline = await enactCuration({ store }, [
    { type: "escalate", artifactId: "principle-x", body: "contradicts ADR-0064" },
  ]);
  assert.equal(offline.escalations.length, 1, "escalation surfaces even with no comment store");
});

// --- report + runner -----------------------------------------------------------------------------

test("a no-op pass reports clean", async () => {
  const store = new InMemoryStore();
  const out = await enactCuration({ store }, []);
  assert.ok(out.lines.some((l) => l.includes("clean")));
});

test("ScriptedCuratorRunner returns its fixed actions and the function form sees the context", async () => {
  const ctx: CurationContext = {
    storyId: "s",
    nodeIds: ["s", "cap-a"],
    decisions: [16, 65],
    openQuestions: [],
    proposals: [],
    adrs: [],
  };
  const fixed: CurationAction[] = [{ type: "comment", artifactId: "a", body: "b" }];
  assert.deepEqual(await new ScriptedCuratorRunner(fixed).run(ctx), fixed);

  const dynamic = new ScriptedCuratorRunner((c) =>
    c.decisions.includes(65) ? [{ type: "escalate", artifactId: "x", body: "saw 65" }] : [],
  );
  const actions = await dynamic.run(ctx);
  assert.equal(actions[0]?.type, "escalate");
});
