import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import { arcCommand, type ArcViewDeps } from "./arc.js";
import {
  DEFAULT_QUESTION_LEASE_DAYS,
  questionCheck,
  questionCommand,
  questionDescriptionFrom,
  questionHelp,
  questionIdFromTitle,
  questionNew,
  questionSettle,
  questionStalenessLine,
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
  assert.ok(!("analogy" in doc), "no empty analogy");
  assert.ok(!("recommendation" in doc), "no empty recommendation");
  // ADR-0358 Option 2B — first authoring counts as first verification; leaseDays defaults to 7.
  assert.equal(doc.verifiedAt, "2026-08-06T00:00:00.000Z");
  assert.equal(doc.leaseDays, DEFAULT_QUESTION_LEASE_DAYS);
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

test("question new carries an ANALOGY beside the diagram (ADR-0359 D5)", async () => {
  // The picture path already worked end to end — `diagram` renders as SVG in the studio (ADR-0096).
  // What the template lacked was the other half of how the owner reads an unfamiliar decision.
  const store = await storeWithArc();
  const res = await questionNew(writeDeps(store), "oq-with-an-analogy", {
    arc: ARC_ID,
    ...BRIEFING,
    diagram: "```mermaid\nflowchart TD\n  A-->B\n```",
    analogy: "A manager reading a proposal before staffing it: the review is the dispatch decision.",
  });
  assert.equal(res.ok, true, res.body);
  const doc = docOf((await store.getDoc("oq-with-an-analogy"))!);
  assert.match(String(doc.analogy), /manager reading a proposal/);
  assert.match(String(doc.diagram), /mermaid/);
});

test("question help names the diagram and the analogy as expected, not exotic (ADR-0359 D5)", () => {
  // Discoverability IS the change: both fields existed-or-now-exist in the schema, and neither was
  // prompted anywhere a session actually looks. An optional field nobody is told about is a field
  // nobody fills in — measured: the three live questions on 2026-08-12 carried no diagram between
  // them, in a corpus whose renderer has supported them since ADR-0096.
  const help = questionHelp();
  assert.match(help.body, /--analogy/, "the flag is documented");
  assert.match(help.body, /--diagram/);
  // Named in the BAR paragraph, not only in the flag list — the bar is what an author reads.
  assert.match(
    help.body,
    /analog/i,
    "the cold-answerable bar mentions the analogy, so it reads as expected rather than exotic",
  );
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
  const storiesDir = path.join(root, "stories");
  mkdirSync(storiesDir);
  try {
    const store = await storeWithArc();
    const viewDeps: ArcViewDeps = { store, storiesDir, pg: true, now: "2026-08-06T00:00:00.000Z" };

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
    // ADR-0358 Option 2D — the question was just authored at writeDeps' `now`, so it renders as
    // freshly verified (0 days old), not UNVERIFIED.
    assert.match(after.body, /verified 0 days ago \(lease 7d, 7 days left\)/);
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

// ---------------------------------------------------------------------------
// ADR-0358 Option 2B/2D — the park-lease fields and the staleness render/check.
// ---------------------------------------------------------------------------

test("question new --lease-days overrides the default", async () => {
  const store = await storeWithArc();
  const res = await questionNew(writeDeps(store), undefined, { arc: ARC_ID, ...BRIEFING, leaseDays: "14" });
  assert.equal(res.ok, true, res.body);
  const doc = docOf((await store.getDoc("oq-does-escalation-bind-every-ask"))!);
  assert.equal(doc.leaseDays, 14);
});

test("question new refuses a non-positive or non-integer --lease-days rather than silently defaulting", async () => {
  const store = await storeWithArc();
  for (const bad of ["0", "-3", "abc", "3.5"]) {
    const res = await questionNew(writeDeps(store), undefined, { arc: ARC_ID, ...BRIEFING, leaseDays: bad });
    assert.equal(res.ok, false, `"${bad}" should refuse`);
    assert.match(res.body, /--lease-days must be a positive whole number of days/);
  }
});

test("questionStalenessLine: fresh, expired, and unverified", () => {
  const now = "2026-08-13T00:00:00.000Z";
  assert.match(
    questionStalenessLine({ verifiedAt: "2026-08-13T00:00:00.000Z", leaseDays: 7 }, now),
    /verified 0 days ago \(lease 7d, 7 days left\)/,
  );
  // Exactly at the lease boundary is still fresh (overdue is strictly > 0), the same "no negative
  // countdown" edge ADR-0202's leaseExpiresOn treats as still-parked.
  assert.match(
    questionStalenessLine({ verifiedAt: "2026-08-06T00:00:00.000Z", leaseDays: 7 }, now),
    /verified 7 days ago \(lease 7d, 0 days left\)/,
  );
  assert.match(
    questionStalenessLine({ verifiedAt: "2026-08-01T00:00:00.000Z", leaseDays: 7 }, now),
    /verified 12 days ago — LEASE EXPIRED 5 days ago \(lease 7d\)/,
  );
  assert.match(questionStalenessLine({}, now), /^UNVERIFIED/);
});

test("question check: fresh, lease-expired, unverified, and unknown reports", async () => {
  const store = await storeWithArc();
  await questionNew(writeDeps(store), "oq-fresh", { arc: ARC_ID, ...BRIEFING });
  await questionNew(writeDeps(store, true), "oq-stale", { arc: ARC_ID, ...BRIEFING, leaseDays: "1" });

  // "fresh" checked the same instant it was authored (writeDeps' fixed now) — 0 days old, lease intact.
  const fresh = await questionCheck(writeDeps(store), "oq-fresh");
  assert.equal(fresh.ok, true);
  assert.match(fresh.body, /verified 0 days ago/);
  assert.match(fresh.body, /No action needed/);

  // "stale" checked from 10 days later — its 1-day lease is long expired.
  const stale = await questionCheck({ ...writeDeps(store), now: "2026-08-16T00:00:00.000Z" }, "oq-stale");
  assert.equal(stale.ok, true);
  assert.match(stale.body, /LEASE EXPIRED/);
  assert.match(stale.body, /Re-verify, then re-lease, correct-in-place, or retire/);
  assert.ok(stale.next?.some((n) => /library artifact edit oq-stale --set verifiedAt=<iso-now> --pg/.test(n)));
  assert.ok(stale.next?.some((n) => /library artifact retire oq-stale --reason/.test(n)));

  // A question authored before ADR-0358 (no verifiedAt/leaseDays at all) reports UNVERIFIED, not a crash.
  await store.upsertDoc({
    id: "oq-pre-0358",
    kind: "open-question",
    doc: { kind: "open-question", id: "oq-pre-0358", ...BRIEFING, description: "d", arcRef: `asset:${ARC_ID}`, references: [], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  });
  const legacy = await questionCheck(writeDeps(store), "oq-pre-0358");
  assert.equal(legacy.ok, true);
  assert.match(legacy.body, /UNVERIFIED/);
  assert.match(legacy.body, /No action needed/);

  const missing = await questionCheck(writeDeps(store), "oq-does-not-exist");
  assert.equal(missing.ok, false);
  assert.match(missing.body, /no open-question "oq-does-not-exist"/);

  const wrongKind = await questionCheck(writeDeps(store), ARC_ID);
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a arc, not an open-question/);
});

test("questionCommand routes check", async () => {
  const store = await storeWithArc();
  await questionNew(writeDeps(store), "oq-routed-check", { arc: ARC_ID, ...BRIEFING });
  const res = await questionCommand("check", "oq-routed-check", writeDeps(store), {});
  assert.equal(res.ok, true, res.body);
  assert.match(res.body, /oq-routed-check — verified 0 days ago/);
});

// ── ADR-0434 — settling a question ────────────────────────────────────────────────────────────────
//
// The defect these pin, measured 2026-08-24: a question had exactly ONE ending, deletion, so an
// answered one either reported a false wait forever or had its answer destroyed to clear it.
// `oq-retire-the-amends-edge` sat in the first state for a day carrying "ANSWERED AND EXECUTED" as
// the first line of its own stakes, and could not be retired because a friction item held an
// `asset:` edge to it — both endings unavailable at once.
//
// What is asserted, in order: the refusals that stop the defect being rebuilt (a settlement with no
// answer, a second settlement, a decision that does not exist), then the end-to-end pair — a settled
// question stops the arc waiting AND stays visible on it under its answer. That pair is deliberately
// ONE test: either half alone is a defect, one being the false wait and the other being exactly the
// erasure that deleting an answered question already caused.

const ANSWER = "Option A. Every escalation the session ENDS on authors a briefing; an inline approval it acts on in the same turn does not, because that closes with the turn.";

/** Raise the standard briefing question and hand back its derived id. */
async function raiseQuestion(store: InMemoryStore): Promise<string> {
  const raised = await questionNew(writeDeps(store), undefined, { arc: ARC_ID, ...BRIEFING });
  assert.equal(raised.ok, true, raised.body);
  return "oq-does-escalation-bind-every-ask";
}

test("question settle refuses offline — a settlement is a write, and questions are live-canonical", async () => {
  const store = await storeWithArc();
  const id = await raiseQuestion(store);
  const env = await questionSettle(writeDeps(store, false), id, { answer: ANSWER });
  assert.equal(env.ok, false);
  assert.match(env.body, /--pg/);
  // The offered command is SETTLE's, not `new`'s. The refusal template used to interpolate the verb
  // into `question <verb> --arc … --title …`, which is `new`'s shape and only `new`'s — so the moment
  // a second write verb existed it pointed at a command that would itself refuse. A pointer a reader
  // cannot follow costs them the round-trip it takes to find that out.
  const offers = (env.next ?? []).join("\n");
  assert.match(offers, /question settle <id> --answer/);
  assert.doesNotMatch(offers, /--arc <arc-id> --title/);
});

test("question settle REFUSES without an answer — the answer is the point, not a formality", async () => {
  // The whole reason the verb exists rather than a bare `--set lifecycle=settled`: a state flip
  // carrying no answer stops the arc reporting a false wait and STILL loses why, which is the loss
  // that retiring an answered question already caused, arrived at more politely.
  const store = await storeWithArc();
  const id = await raiseQuestion(store);

  const env = await questionSettle(writeDeps(store), id, {});
  assert.equal(env.ok, false);
  assert.match(env.body, /--answer/);
  assert.match(env.body, /still lose WHY/i);

  // AND NOTHING WAS WRITTEN. A refusal that had already flipped the state would be the defect with
  // an error message attached.
  const stored = await store.getDoc(id);
  assert.equal(docOf(stored!)["lifecycle"], undefined);
});

test("question settle refuses an id that is not an open-question, and one that is nothing at all", async () => {
  const store = await storeWithArc();
  const missing = await questionSettle(writeDeps(store), "oq-nope", { answer: ANSWER });
  assert.equal(missing.ok, false);
  assert.match(missing.body, /no open-question "oq-nope"/);

  const wrongKind = await questionSettle(writeDeps(store), ARC_ID, { answer: ANSWER });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a arc, not an open-question/);
});

test("question settle is FORWARD-ONLY — a settled question refuses a second settlement", async () => {
  // Correcting a recorded answer is an ordinary field edit, which leaves the change in the
  // append-only history. Letting this verb overwrite would make a correction and a fresh settlement
  // indistinguishable in that log.
  const store = await storeWithArc();
  const id = await raiseQuestion(store);
  const first = await questionSettle(writeDeps(store), id, { answer: ANSWER });
  assert.equal(first.ok, true, first.body);

  const second = await questionSettle(writeDeps(store), id, { answer: "something else" });
  assert.equal(second.ok, false);
  assert.match(second.body, /already settled on 2026-08-06/);
  assert.ok(
    second.next?.some((n) => n.includes("--set answer=")),
    "the refusal points at the edit that DOES correct an answer, not just at the wall",
  );
  // The first answer stands — the refusal did not half-apply the second.
  assert.equal(docOf((await store.getDoc(id))!)["answer"], ANSWER);
});

test("question settle refuses an --adr that names no decision — a dangling pointer records nothing", async () => {
  // `question new`'s fence-2 discipline, applied to the settlement: an `asset:` ref that resolves to
  // nothing passes the regex and satisfies nobody.
  const store = await storeWithArc();
  const id = await raiseQuestion(store);

  const env = await questionSettle(writeDeps(store), id, { answer: ANSWER, adr: "9999" });
  assert.equal(env.ok, false);
  assert.match(env.body, /no decision adr-9999/);
  assert.equal(docOf((await store.getDoc(id))!)["lifecycle"], undefined, "refused before the write");

  const notANumber = await questionSettle(writeDeps(store), id, { answer: ANSWER, adr: "soon" });
  assert.equal(notANumber.ok, false);
  assert.match(notANumber.body, /decision NUMBER/);
});

test("question settle records the deciding ADR as a reference, without dropping the ones already there", async () => {
  const store = await storeWithArc();
  const id = await raiseQuestion(store);
  await store.upsertDoc({
    id: "adr-0434",
    kind: "adr",
    doc: {
      kind: "adr",
      id: "adr-0434",
      number: 434,
      title: "Questions end by recording their answer, not by deletion",
      description: "ADR-0434 — Questions end by recording their answer, not by deletion",
      status: "accepted",
      body: "# ADR-0434\n\n## Status\n\naccepted\n",
      references: [],
      createdAt: "2026-08-24",
      updatedAt: "2026-08-24",
    },
  });
  // A reference that landed BEFORE the settlement — the merge happens inside the write, so this
  // survives rather than being reverted by an array computed from an earlier read.
  await store.patchDoc({ id, fields: { references: ["asset:adr-0314"] } });

  const env = await questionSettle(writeDeps(store), id, { answer: ANSWER, adr: "434" });
  assert.equal(env.ok, true, env.body);
  assert.deepEqual(docOf((await store.getDoc(id))!)["references"], ["asset:adr-0314", "asset:adr-0434"]);
});

test("a settled question stops the arc WAITING and stays on it under its answer", async () => {
  // THE END-TO-END PROOF, and the one that would have caught the 2026-08-24 incident. Both halves
  // matter and they fail in opposite directions: without the first the arc reports a wait nobody
  // owes, and without the second clearing the wait would once again cost the record of what cleared
  // it — which is exactly what retiring an answered question did.
  const root = mkdtempSync(path.join(tmpdir(), "question-settle-"));
  const storiesDir = path.join(root, "stories");
  mkdirSync(storiesDir);
  try {
    const store = await storeWithArc();
    const viewDeps: ArcViewDeps = { store, storiesDir, pg: true, now: "2026-08-06T00:00:00.000Z" };
    const id = await raiseQuestion(store);

    const waiting = await arcCommand("show", ARC_ID, viewDeps);
    assert.doesNotMatch(waiting.body, /not waiting on the owner/);

    const settled = await questionSettle(writeDeps(store), id, { answer: ANSWER });
    assert.equal(settled.ok, true, settled.body);

    const after = await arcCommand("show", ARC_ID, viewDeps);
    // (a) the arc is no longer waiting — the false-wait half.
    assert.match(after.body, /\(none — this arc is not waiting on the owner\)/);
    // (b) and the question did NOT vanish with the wait — the erasure half.
    assert.match(after.body, /## Settled questions {2}\(1 — answered; no longer waiting\)/);
    assert.match(after.body, /\[settled 2026-08-06\]/);
    assert.match(after.body, /Option A\. Every escalation the session ENDS on authors a briefing/);
    // The park-lease line belongs to an unverified OPEN claim; a settled question makes none.
    assert.doesNotMatch(after.body, /verified 0 days ago/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("question settle stamps the lifecycle, the answer and the settlement time — and nothing else", async () => {
  const store = await storeWithArc();
  const id = await raiseQuestion(store);
  const before = docOf((await store.getDoc(id))!);

  const env = await questionSettle(writeDeps(store), id, { answer: ANSWER });
  assert.equal(env.ok, true, env.body);

  const after = docOf((await store.getDoc(id))!);
  assert.equal(after["lifecycle"], "settled");
  assert.equal(after["answer"], ANSWER);
  assert.equal(after["settledAt"], "2026-08-06T00:00:00.000Z");
  // The briefing the question was authored with is untouched — a settlement RECORDS, it never
  // rewrites what was asked. `patchDoc` is what makes that structural rather than careful.
  for (const field of ["stakes", "statement", "context", "options", "arcRef", "createdAt"]) {
    assert.equal(after[field], before[field], `settling must not touch ${field}`);
  }
});

test("question check offers SETTLE and RETIRE as different acts, not one 'moot / answered' door", async () => {
  // ADR-0434 D5. Collapsing the two is how an answered question ended up disposed of by a delete
  // that took its answer with it: the two verbs answer different questions about the same row.
  const store = await storeWithArc();
  const id = await raiseQuestion(store);
  // Expire the lease so `question check` renders its full offer set.
  const expired = await questionCheck({ store, writable: true, now: "2027-01-01T00:00:00.000Z", pg: true }, id);
  assert.equal(expired.ok, true, expired.body);
  const offers = (expired.next ?? []).join("\n");
  assert.match(offers, /question settle .+ANSWERED/);
  assert.match(offers, /artifact retire .+MOOT/);
});

test("question help names settle, and says which of the two endings applies", () => {
  const env = questionHelp();
  assert.match(env.body, /storytree question settle <id> --answer/);
  assert.match(env.body, /--answer is REQUIRED/);
  // The distinction a reader most needs, said where they are already looking.
  assert.match(env.body, /Retiring an ANSWERED question destroys the answer with it/);
});

test("an unknown question verb lists settle among the ways out", async () => {
  const store = await storeWithArc();
  const env = await questionCommand("frobnicate", undefined, writeDeps(store), {});
  assert.equal(env.ok, false);
  assert.match(env.body, /`settle <id>`/);
});
