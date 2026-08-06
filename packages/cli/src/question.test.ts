import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import { arcCommand, type ArcViewDeps } from "./arc.js";
import {
  questionCommand,
  questionDescriptionFrom,
  questionIdFromTitle,
  questionNew,
  type QuestionWriteDeps,
} from "./question.js";

// `question new` is the authoring half of ADR-0314 D5. What these assert, in order of what they
// protect: the two fences the SCHEMA deliberately does not hold (an `arcRef` is required here and it
// must RESOLVE), the one-refusal-names-everything ergonomics that make the discipline followable at
// all, and — the end-to-end one — that a question authored through this verb is the thing `arc show`
// then reports as WAITING. That last test is the whole point: the measured failure was one question
// authored with no arcRef, surfacing on no arc.

const ARC_ID = "orientation-arc";

async function storeWithArc(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: ARC_ID,
    kind: "arc",
    doc: {
      kind: "arc",
      id: ARC_ID,
      title: "Orientation surface",
      description: "d",
      intent: "Arcs are the map's primary orientation surface.",
      endState: "The owner arrives cold and knows where every arc is up to.",
      references: [],
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    },
  });
  return store;
}

function writeDeps(store: InMemoryStore, writable = true): QuestionWriteDeps {
  return { store, writable, now: "2026-08-06T00:00:00.000Z", pg: true };
}

/** The four required briefing fields, so a test can vary one thing at a time. */
const BRIEFING = {
  title: "Does escalation bind every ask?",
  stakes: "The briefing panel renders empty while agents escalate in chat, so the surface stays decorative.",
  statement: "Must every escalation author a briefing, or only one that halts a unit?",
  context: "ADR-0314 D5 says 'escalates to the owner' without narrowing it. An `open-question` is the Library kind that carries a decision waiting on the owner.",
  options: "A: bind every escalation — nothing slips, but an inline approval pays a full briefing. B: bind only a halting one — cheaper, but a mid-session question the owner could have answered sooner never reaches them.",
} as const;

function docOf(stored: { doc: unknown }): Record<string, unknown> {
  return stored.doc as Record<string, unknown>;
}

test("questionIdFromTitle applies the oq- prefix without ever doubling it", () => {
  assert.equal(questionIdFromTitle("Does escalation bind every ask?"), "oq-does-escalation-bind-every-ask");
  assert.equal(questionIdFromTitle("oq-already-prefixed"), "oq-already-prefixed");
  // All punctuation yields no slug at all — the caller refuses rather than writing an id-less doc.
  assert.equal(questionIdFromTitle("???"), "");
});

test("questionDescriptionFrom takes the statement's first sentence, capped at a word boundary", () => {
  assert.equal(questionDescriptionFrom("Bind every escalation? The rest is detail."), "Bind every escalation?");
  const long = `${"word ".repeat(60)}end.`;
  const derived = questionDescriptionFrom(long);
  assert.ok(derived.length <= 161, `derived ${derived.length} chars`);
  assert.match(derived, /…$/);
  // Multi-line prose (a value read via @path) collapses to one line — the card is a one-liner.
  assert.equal(questionDescriptionFrom("Line one\nline two."), "Line one line two.");
});

test("question new refuses offline — questions are live-canonical", async () => {
  const res = await questionNew(writeDeps(await storeWithArc(), false), undefined, { arc: ARC_ID, ...BRIEFING });
  assert.equal(res.ok, false);
  assert.match(res.body, /--pg/);
  assert.deepEqual(res.next?.[0], "pnpm db:up");
});

test("question new names EVERY missing field in one refusal, not one per round-trip", async () => {
  const res = await questionNew(writeDeps(await storeWithArc()), undefined, {});
  assert.equal(res.ok, false);
  assert.match(res.body, /question new needs 6 more fields/);
  for (const flag of ["--arc", "--title", "--stakes", "--statement", "--context", "--options"]) {
    assert.match(res.body, new RegExp(flag.replace(/-/g, "\\-")), `refusal should name ${flag}`);
  }
  // The BAR is stated where it is owed, not left to an agent's memory of the ADR.
  assert.match(res.body, /answer COLD/);
});

test("question new refuses a dangling arc — a question no arc surfaces is the measured failure", async () => {
  const res = await questionNew(writeDeps(await storeWithArc()), undefined, { arc: "no-such-arc", ...BRIEFING });
  assert.equal(res.ok, false);
  assert.match(res.body, /no arc "no-such-arc"/);
  assert.match(res.body, /surfaces on no arc at all/);
  // Nothing was written — the refusal is BEFORE the write, not a cleanup after one.
  const store = await storeWithArc();
  await questionNew(writeDeps(store), undefined, { arc: "no-such-arc", ...BRIEFING });
  assert.equal(await store.getDoc("oq-does-escalation-bind-every-ask"), null);
});

test("question new refuses an --arc that names a doc of some other kind", async () => {
  const store = await storeWithArc();
  await store.upsertDoc({
    id: "some-increment",
    kind: "increment",
    doc: {
      kind: "increment",
      id: "some-increment",
      title: "t",
      description: "d",
      objective: "o",
      body: "b",
      arcRef: `asset:${ARC_ID}`,
      status: "proposal",
      references: [],
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    },
  });
  const res = await questionNew(writeDeps(store), undefined, { arc: "some-increment", ...BRIEFING });
  assert.equal(res.ok, false);
  assert.match(res.body, /is a increment, not an arc/);
});

test("question new writes a valid open-question with the arcRef pointer and derived id/description", async () => {
  const store = await storeWithArc();
  const res = await questionNew(writeDeps(store), undefined, { arc: ARC_ID, ...BRIEFING });
  assert.equal(res.ok, true, res.body);

  const stored = await store.getDoc("oq-does-escalation-bind-every-ask");
  assert.ok(stored, "the question row exists");
  assert.equal(stored.kind, "open-question");
  const doc = docOf(stored);
  assert.equal(doc.arcRef, `asset:${ARC_ID}`);
  assert.equal(doc.stakes, BRIEFING.stakes);
  assert.equal(doc.statement, BRIEFING.statement);
  assert.equal(doc.description, "Must every escalation author a briefing, or only one that halts a unit?");
  assert.equal(doc.createdAt, "2026-08-06T00:00:00.000Z");
  // The two OPTIONAL fields are ABSENT, not stored as empty strings — an empty heading in a briefing
  // reads as "considered and had nothing to say", which is not what "not supplied" means.
  assert.ok(!("diagram" in doc), "no empty diagram");
  assert.ok(!("recommendation" in doc), "no empty recommendation");
  // The envelope tells the session what it just earned and what it still owes (ADR-0303).
  assert.match(res.body, /now reads as WAITING/);
  assert.match(res.body, /Escalating is a LANDING, not a wait/);
});

test("question new carries an explicit id, description, diagram and recommendation when given", async () => {
  const store = await storeWithArc();
  const res = await questionNew(writeDeps(store), "oq-escalation-binding", {
    arc: `asset:${ARC_ID}`,
    ...BRIEFING,
    description: "Which escalations owe a briefing.",
    diagram: "```mermaid\nflowchart TD\n  A-->B\n```",
    recommendation: "A — bind the escalation that ENDS the session's run on the work.",
  });
  assert.equal(res.ok, true, res.body);
  const doc = docOf((await store.getDoc("oq-escalation-binding"))!);
  assert.equal(doc.description, "Which escalations owe a briefing.");
  assert.match(String(doc.diagram), /mermaid/);
  // An `asset:`-prefixed --arc is accepted and normalised rather than double-prefixed.
  assert.equal(doc.arcRef, `asset:${ARC_ID}`);
  assert.match(res.body, /non-binding until the owner decides/);
});

test("question new refuses an id that already exists rather than overwriting it", async () => {
  const store = await storeWithArc();
  await questionNew(writeDeps(store), undefined, { arc: ARC_ID, ...BRIEFING });
  const again = await questionNew(writeDeps(store), undefined, {
    arc: ARC_ID,
    ...BRIEFING,
    statement: "A different question entirely.",
  });
  assert.equal(again.ok, false);
  assert.match(again.body, /already exists — edit it, don't recreate it/);
  // The FIRST question is intact: a refused scaffold never half-writes.
  assert.equal(docOf((await store.getDoc("oq-does-escalation-bind-every-ask"))!).statement, BRIEFING.statement);
  // And the clash names the arc-derived id, so the author can see WHY it collided.
  assert.match(again.body, /DERIVED from the title/);
});

test("question new refuses an authored id past the cap instead of truncating it to a different one", async () => {
  const res = await questionNew(writeDeps(await storeWithArc()), `oq-${"x".repeat(70)}`, { arc: ARC_ID, ...BRIEFING });
  assert.equal(res.ok, false);
  assert.match(res.body, /past the 60-character id cap/);
  assert.match(res.body, /a DIFFERENT id than the one you typed/);
});

test("a question authored here is what arc show then reports as WAITING", async () => {
  // The end-to-end proof, and the reason the arc fence is not optional: the arc surface derives its
  // waiting set by querying `arcRef`, so authoring through this verb has to be sufficient on its own
  // to move an arc out of "not waiting on the owner".
  const root = mkdtempSync(path.join(tmpdir(), "question-arc-"));
  const decisionsDir = path.join(root, "decisions");
  const storiesDir = path.join(root, "stories");
  mkdirSync(decisionsDir);
  mkdirSync(storiesDir);
  try {
    const store = await storeWithArc();
    const viewDeps: ArcViewDeps = { store, decisionsDir, storiesDir, pg: true };

    const before = await arcCommand("show", ARC_ID, viewDeps);
    assert.match(before.body, /\(none — this arc is not waiting on the owner\)/);

    const raised = await questionNew(writeDeps(store), undefined, { arc: ARC_ID, ...BRIEFING });
    assert.equal(raised.ok, true, raised.body);

    const after = await arcCommand("show", ARC_ID, viewDeps);
    assert.doesNotMatch(after.body, /not waiting on the owner/);
    assert.match(after.body, /oq-does-escalation-bind-every-ask/);
    assert.match(after.body, /Does escalation bind every ask\?/);
    // The stakes ride along into the arc view — a question is part of the PAYLOAD (ADR-0267), so the
    // owner reads why it matters without opening the artifact.
    assert.match(after.body, /why it matters: The briefing panel renders empty/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("questionCommand routes new, defaults to help, and refuses an unknown verb", async () => {
  const store = await storeWithArc();
  const help = await questionCommand(undefined, undefined, writeDeps(store), {});
  assert.equal(help.ok, true);
  assert.match(help.body, /--arc is REQUIRED even though the schema leaves arcRef optional/);

  const created = await questionCommand("new", "oq-routed", writeDeps(store), { arc: ARC_ID, ...BRIEFING });
  assert.equal(created.ok, true, created.body);
  assert.ok(await store.getDoc("oq-routed"));

  const unknown = await questionCommand("close", undefined, writeDeps(store), {});
  assert.equal(unknown.ok, false);
  assert.match(unknown.body, /unknown question command "close"/);
  // Reading and answering are elsewhere BY DECISION — the refusal says where, so it does not read
  // as a gap someone should fill here.
  assert.match(unknown.body, /library artifact list open-question --pg/);
});
