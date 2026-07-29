import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import {
  arcClose,
  arcCommand,
  arcEdit,
  arcIncrementAdd,
  arcScopeOf,
  storyArcStamps,
  type ArcViewDeps,
  type ArcWriteDeps,
} from "./arc.js";

// The derived arc view (ADR-0183 D3): every containment edge lives on the CHILD — a plan's
// `arcRef`, an ADR's frontmatter `arc:` stamp, a story's frontmatter `arc:` stamp — and the arc
// reveals them by query. These tests seed each child surface independently and assert the view
// derives all three, plus the honest empty/offline states.

async function seededStore(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "map-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "map-arc",
      title: "Map pathways",
      description: "d",
      intent: "Pathways on the map.",
      endState: "Owner sees pathways.",
      increments: [
        { date: "2026-07-01", pr: "#640", outcome: "items 1-3 landed" },
        { date: "2026-07-05", outcome: "halted at the look wall" },
      ],
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
    },
  });
  await store.upsertDoc({
    id: "map-arc-plan-1",
    kind: "plan",
    doc: {
      kind: "plan",
      id: "map-arc-plan-1",
      title: "Increment 4 choreography",
      description: "d",
      objective: "o",
      decomposition: "one unit",
      arcRef: "asset:map-arc",
      anchor: { sha: "abcdef1234567", date: "2026-07-10" },
      status: "ready",
      references: [],
      createdAt: "2026-07-10",
      updatedAt: "2026-07-10",
    },
  });
  // A plan on a DIFFERENT arc — must not leak into map-arc's view.
  await store.upsertDoc({
    id: "other-plan",
    kind: "plan",
    doc: {
      kind: "plan",
      id: "other-plan",
      title: "other",
      description: "d",
      objective: "o",
      decomposition: "u",
      arcRef: "asset:other-arc",
      anchor: { sha: "1234567", date: "2026-07-10" },
      status: "draft",
      references: [],
      createdAt: "2026-07-10",
      updatedAt: "2026-07-10",
    },
  });
  return store;
}

/** A disk fixture: decisions dir with one stamped + one unstamped ADR, stories dir with stamps. */
function diskFixture(): { root: string; decisionsDir: string; storiesDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), "arc-view-"));
  const decisionsDir = path.join(root, "decisions");
  const storiesDir = path.join(root, "stories");
  mkdirSync(decisionsDir);
  mkdirSync(storiesDir);
  writeFileSync(
    path.join(decisionsDir, "0201-stamped.md"),
    "---\nstatus: accepted\narc: map-arc\n---\n\n# ADR-0201: A stamped decision\n",
  );
  writeFileSync(
    path.join(decisionsDir, "0202-unstamped.md"),
    "---\nstatus: accepted\n---\n\n# ADR-0202: An arc-less decision\n",
  );
  mkdirSync(path.join(storiesDir, "map-story"));
  writeFileSync(
    path.join(storiesDir, "map-story", "story.md"),
    '---\nid: "map-story"\ntier: story\narc: map-arc\n---\n\n# Map story\n',
  );
  mkdirSync(path.join(storiesDir, "plain-story"));
  writeFileSync(
    path.join(storiesDir, "plain-story", "story.md"),
    '---\nid: "plain-story"\ntier: story\n---\n\n# Plain story\n',
  );
  return { root, decisionsDir, storiesDir };
}

function depsFor(store: InMemoryStore, fx: { decisionsDir: string; storiesDir: string }, pg = true): ArcViewDeps {
  return { store, decisionsDir: fx.decisionsDir, storiesDir: fx.storiesDir, pg };
}

test("storyArcStamps reads frontmatter arc: stamps and skips unstamped/missing stories", () => {
  const fx = diskFixture();
  try {
    assert.deepEqual(storyArcStamps(fx.storiesDir), [{ story: "map-story", arc: "map-arc" }]);
    assert.deepEqual(storyArcStamps(path.join(fx.root, "nope")), []); // missing dir → empty, no throw
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc show derives plans (arcRef), ADRs (frontmatter stamp), and stories (frontmatter stamp)", async () => {
  const fx = diskFixture();
  try {
    const res = await arcCommand("show", "map-arc", depsFor(await seededStore(), fx));
    assert.equal(res.ok, true);
    // The arc's own state: intent, end state, and the append-at-landing increment log.
    assert.match(res.body, /Pathways on the map\./);
    assert.match(res.body, /2026-07-01 {2}#640 {2}items 1-3 landed/);
    assert.match(res.body, /halted at the look wall/);
    // Derived children — and ONLY this arc's.
    assert.match(res.body, /map-arc-plan-1 {2}\[ready\] {2}anchor abcdef123/);
    assert.doesNotMatch(res.body, /other-plan/);
    assert.match(res.body, /ADR-0201 {2}accepted {3}A stamped decision/);
    assert.doesNotMatch(res.body, /ADR-0202/);
    assert.match(res.body, /- map-story/);
    assert.doesNotMatch(res.body, /plain-story/);
    // The freshness check is the suggested next door for a consumable plan.
    assert.ok((res.next ?? []).some((n) => n.includes("plan check map-arc-plan-1")));
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc list summarises every arc with its increment count", async () => {
  const fx = diskFixture();
  try {
    const res = await arcCommand("list", undefined, depsFor(await seededStore(), fx));
    assert.equal(res.ok, true);
    assert.match(res.body, /map-arc {2}2 increment\(s\), last 2026-07-05/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ADR-0239 D3 — `arc list` is a WORKLIST: active by default, widened by --all / --closed.
// This is what makes the rot self-correcting: an arc nobody closed keeps showing up.
// ---------------------------------------------------------------------------

/** Add one already-closed arc to the seeded store (the shape the D5 backfill produces). */
async function withClosedArc(store: InMemoryStore): Promise<InMemoryStore> {
  await store.upsertDoc({
    id: "done-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "done-arc",
      title: "A delivered initiative",
      description: "d",
      intent: "Deliver the thing.",
      endState: "The thing is delivered.",
      lifecycle: "closed",
      increments: [{ date: "2026-07-25", pr: "#767", outcome: "THE ARC'S END STATE IS REACHED" }],
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-25",
    },
  });
  return store;
}

test("arcScopeOf resolves the widening flags — active by default, --all wins over --closed", () => {
  assert.equal(arcScopeOf({}), "active");
  assert.equal(arcScopeOf({ all: false, closed: false }), "active");
  assert.equal(arcScopeOf({ closed: true }), "closed");
  assert.equal(arcScopeOf({ all: true }), "all");
  assert.equal(arcScopeOf({ all: true, closed: true }), "all", "--all wins when both are passed");
});

test("arc list hides closed arcs by default and footers the count; --all / --closed widen it", async () => {
  const fx = diskFixture();
  try {
    const store = await withClosedArc(await seededStore());

    // DEFAULT: the live worklist only, with the muted footer pointing at the rest.
    const active = await arcCommand("list", undefined, depsFor(store, fx));
    assert.equal(active.ok, true);
    assert.match(active.body, /1 active arc\(s\)/);
    assert.match(active.body, /map-arc/);
    assert.doesNotMatch(active.body, /done-arc/, "a closed arc is out of the default worklist");
    assert.match(active.body, /\(1 closed — --all\)/);
    assert.ok((active.next ?? []).some((n) => n.includes("arc list --all")), "the footer's flag is an offered next");

    // --all: everything, with the closed one TAGGED (never the old blind list).
    const all = await arcCommand("list", undefined, depsFor(store, fx), "all");
    assert.match(all.body, /2 arc\(s\)/);
    assert.match(all.body, /done-arc.*\[closed\] A delivered initiative/);
    assert.match(all.body, /map-arc/);
    assert.doesNotMatch(all.body, /map-arc {2}.*\[closed\]/, "an active arc carries no tag");
    assert.doesNotMatch(all.body, /— --all\)/, "no footer once everything is shown");

    // --closed: the archive view.
    const closed = await arcCommand("list", undefined, depsFor(store, fx), "closed");
    assert.match(closed.body, /1 closed arc\(s\)/);
    assert.match(closed.body, /done-arc/);
    assert.doesNotMatch(closed.body, /map-arc/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc list is honest when a scope filters everything out", async () => {
  const fx = diskFixture();
  try {
    const onlyClosed = await withClosedArc(new InMemoryStore());
    const active = await arcCommand("list", undefined, depsFor(onlyClosed, fx));
    assert.equal(active.ok, true, "an empty worklist is a real answer, not a failure");
    assert.match(active.body, /none — all 1 arc\(s\) here are closed/);

    // The mirror case: nothing closed yet, asked for the archive.
    const noneClosed = await seededStore();
    const closed = await arcCommand("list", undefined, depsFor(noneClosed, fx), "closed");
    assert.equal(closed.ok, true);
    assert.match(closed.body, /none — no arc here has been closed yet/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc show renders a CLOSED arc and states its lifecycle (only the LIST filters)", async () => {
  const fx = diskFixture();
  try {
    const store = await withClosedArc(await seededStore());

    const done = await arcCommand("show", "done-arc", depsFor(store, fx));
    assert.equal(done.ok, true, "a closed arc is always readable");
    assert.match(done.body, /lifecycle: closed/);
    assert.match(done.body, /THE ARC'S END STATE IS REACHED/);

    const live = await arcCommand("show", "map-arc", depsFor(store, fx));
    assert.match(live.body, /lifecycle: active \(in flight\)/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc show on a missing/wrong-kind id fails honestly; offline hints at --pg", async () => {
  const fx = diskFixture();
  try {
    const store = await seededStore();
    const missing = await arcCommand("show", "nope", depsFor(store, fx, false));
    assert.equal(missing.ok, false);
    assert.match(missing.body, /OFFLINE seed — arcs are live-canonical/);
    const wrongKind = await arcCommand("show", "map-arc-plan-1", depsFor(store, fx));
    assert.equal(wrongKind.ok, false);
    assert.match(wrongKind.body, /is a plan, not an arc/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc help and unknown-sub are envelopes, not throws", async () => {
  const fx = diskFixture();
  try {
    const help = await arcCommand(undefined, undefined, depsFor(new InMemoryStore(), fx));
    assert.equal(help.ok, true);
    assert.match(help.body, /derived initiative view/);
    // The write verbs are advertised in help (discoverable, not a store one-shot).
    assert.match(help.body, /arc increment add/);
    const unknown = await arcCommand("frob", undefined, depsFor(new InMemoryStore(), fx));
    assert.equal(unknown.ok, false);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// arc WRITES (arc edit / arc increment add) — the first-class validated write path.
// ---------------------------------------------------------------------------

const NOW = "2026-07-20T10:30:00.000Z";
function writeDeps(store: InMemoryStore, pg = true, writable = true): ArcWriteDeps {
  return { store, writable, actor: "test", now: NOW, pg };
}

test("arc edit patches intent + endState through the validated path and re-persists", async () => {
  const store = await seededStore();
  const res = await arcEdit(writeDeps(store), "map-arc", {
    intent: "A sharper intent.",
    endState: "line one\nline two\nline three",
  });
  assert.equal(res.ok, true);
  assert.match(res.body, /updated arc map-arc \(intent, endState\)/);
  const got = (await store.getDoc("map-arc"))?.doc as Record<string, unknown>;
  assert.equal(got["intent"], "A sharper intent.");
  // Multi-line prose round-trips as REAL newlines (the value arrives already @path/quote-resolved).
  assert.equal(got["endState"], "line one\nline two\nline three");
  assert.equal(got["updatedAt"], NOW);
  // The increment log is untouched by a narrative edit.
  assert.equal((got["increments"] as unknown[]).length, 2);
});

test("arc edit refuses offline, on a missing id, on a wrong kind, and with nothing to change", async () => {
  const store = await seededStore();
  const offline = await arcEdit(writeDeps(store, false, false), "map-arc", { intent: "x" });
  assert.equal(offline.ok, false);
  assert.match(offline.body, /writes to the shared store — run with --pg/);

  const missing = await arcEdit(writeDeps(store), "nope", { intent: "x" });
  assert.equal(missing.ok, false);
  assert.match(missing.body, /no arc "nope"/);

  const wrongKind = await arcEdit(writeDeps(store), "map-arc-plan-1", { intent: "x" });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a plan, not an arc/);

  const nothing = await arcEdit(writeDeps(store), "map-arc", {});
  assert.equal(nothing.ok, false);
  assert.match(nothing.body, /nothing to change/);
});

test("arc increment add APPENDS one validated increment to the log (the op --set cannot do)", async () => {
  const store = await seededStore();
  const res = await arcIncrementAdd(writeDeps(store), "map-arc", {
    date: "2026-07-20",
    pr: "#900",
    outcome: "increment 5 landed",
  });
  assert.equal(res.ok, true);
  assert.match(res.body, /appended increment to arc map-arc — 2026-07-20 {2}#900 {2}increment 5 landed/);
  assert.match(res.body, /\(3 increment\(s\) now\)/);
  const increments = (await store.getDoc("map-arc"))?.doc as Record<string, unknown>;
  const log = increments["increments"] as Array<Record<string, unknown>>;
  assert.equal(log.length, 3);
  assert.deepEqual(log[2], { date: "2026-07-20", pr: "#900", outcome: "increment 5 landed" });
  // The append round-trips through the show view (proof the whole arc re-validated).
  const fx = diskFixture();
  try {
    const shown = await arcCommand("show", "map-arc", depsFor(store, fx));
    assert.match(shown.body, /2026-07-20 {2}#900 {2}increment 5 landed/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc increment add defaults the date to today and works without a PR", async () => {
  const store = await seededStore();
  const res = await arcIncrementAdd(writeDeps(store), "map-arc", { outcome: "an owner-attested halt" });
  assert.equal(res.ok, true);
  const log = (await store.getDoc("map-arc"))?.doc as { increments: Array<Record<string, unknown>> };
  const added = log.increments[log.increments.length - 1];
  assert.equal(added?.date, "2026-07-20"); // NOW's date part
  assert.equal(added?.outcome, "an owner-attested halt");
  assert.ok(!("pr" in (added ?? {})), "no pr key when --pr is omitted");
});

test("arc increment add refuses offline, without --outcome, and on a wrong kind", async () => {
  const store = await seededStore();
  const offline = await arcIncrementAdd(writeDeps(store, false, false), "map-arc", { outcome: "x" });
  assert.equal(offline.ok, false);
  assert.match(offline.body, /writes to the shared store/);

  const noOutcome = await arcIncrementAdd(writeDeps(store), "map-arc", {});
  assert.equal(noOutcome.ok, false);
  assert.match(noOutcome.body, /needs --outcome/);

  const wrongKind = await arcIncrementAdd(writeDeps(store), "map-arc-plan-1", { outcome: "x" });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a plan, not an arc/);
});

// ---------------------------------------------------------------------------
// ADR-0239 D4 — the closure reminder rides the tool OUTPUT, not any agent prompt. Zero context for
// every session that is not landing an arc increment; the question arrives at the one moment the
// session can answer it, next to the arc's own stored end state.
// ---------------------------------------------------------------------------

test("arc increment add echoes the arc's end state and offers `arc close` as a next (D4)", async () => {
  const store = await seededStore();
  const res = await arcIncrementAdd(writeDeps(store), "map-arc", { outcome: "increment 5 landed", pr: "#900" });
  assert.equal(res.ok, true);

  // The end state is echoed back from the STORED doc — the judgment is made from data, not memory.
  assert.match(res.body, /this arc's end state: Owner sees pathways\./);

  const closeNext = (res.next ?? []).find((n) => n.startsWith("storytree arc close"));
  assert.ok(closeNext, "the close verb is offered at the point of use");
  assert.match(closeNext, /storytree arc close map-arc --outcome "…" --pg/);
  // The conditional is load-bearing: nothing here asserts the end state WAS met.
  assert.match(closeNext, /\(if this landing met the end state\)/);
});

test("arc increment add on an ALREADY-closed arc offers no close hint", async () => {
  const store = await withClosedArc(await seededStore());
  const res = await arcIncrementAdd(writeDeps(store), "done-arc", { outcome: "a late footnote" });
  assert.equal(res.ok, true, "appending to a closed arc still works — closure is not a write lock");
  assert.doesNotMatch(res.body, /this arc's end state/);
  assert.ok(!(res.next ?? []).some((n) => n.startsWith("storytree arc close")), "no close hint on a closed arc");
});

// ---------------------------------------------------------------------------
// ADR-0239 D2 — `arc close`: ONE verb, atomically the terminal increment AND the lifecycle flip.
// ---------------------------------------------------------------------------

test("arc close appends the terminal increment AND flips lifecycle in one write", async () => {
  const store = await seededStore();
  const res = await arcClose(writeDeps(store), "map-arc", {
    pr: "#1012",
    outcome: "the owner sees pathways on the map — the end state is met",
  });
  assert.equal(res.ok, true);
  assert.match(res.body, /closed arc map-arc — 2026-07-20 {2}#1012 {2}the owner sees pathways/);
  assert.match(res.body, /lifecycle: closed/);

  const doc = (await store.getDoc("map-arc"))?.doc as { lifecycle?: string; increments: Array<Record<string, unknown>> };
  assert.equal(doc.lifecycle, "closed");
  // The prose that JUSTIFIES the flip landed with it — that is the whole point of one verb.
  assert.equal(doc.increments.length, 3, "the terminal increment was appended, not replaced");
  assert.deepEqual(doc.increments[2], {
    date: "2026-07-20",
    pr: "#1012",
    outcome: "the owner sees pathways on the map — the end state is met",
  });
});

test("arc close defaults the date to today and works without a PR", async () => {
  const store = await seededStore();
  const res = await arcClose(writeDeps(store), "map-arc", { outcome: "owner-attested; the end state is met" });
  assert.equal(res.ok, true);
  const doc = (await store.getDoc("map-arc"))?.doc as { lifecycle?: string; increments: Array<Record<string, unknown>> };
  const terminal = doc.increments[doc.increments.length - 1];
  assert.equal(terminal?.date, "2026-07-20"); // NOW's date part
  assert.ok(!("pr" in (terminal ?? {})), "an arc can close on an owner attestation, with no PR of its own");
  assert.equal(doc.lifecycle, "closed");
});

test("arc close REFUSES without --outcome — no closure without the prose that justifies it", async () => {
  const store = await seededStore();
  const noOutcome = await arcClose(writeDeps(store), "map-arc", {});
  assert.equal(noOutcome.ok, false);
  assert.match(noOutcome.body, /needs --outcome/);
  assert.match(noOutcome.body, /projection of the prose that supports it/);
  // NOTHING was written — not the increment, and above all not the state.
  const doc = (await store.getDoc("map-arc"))?.doc as { lifecycle?: string; increments: unknown[] };
  assert.notEqual(doc.lifecycle, "closed");
  assert.equal(doc.increments.length, 2);
});

test("arc close refuses offline, on a missing id, on a wrong kind, and on an already-closed arc", async () => {
  const store = await withClosedArc(await seededStore());

  const offline = await arcClose(writeDeps(store, false, false), "map-arc", { outcome: "x" });
  assert.equal(offline.ok, false);
  assert.match(offline.body, /writes to the shared store — run with --pg/);

  const missing = await arcClose(writeDeps(store), "nope", { outcome: "x" });
  assert.equal(missing.ok, false);
  assert.match(missing.body, /no arc "nope"/);

  const wrongKind = await arcClose(writeDeps(store), "map-arc-plan-1", { outcome: "x" });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a plan, not an arc/);

  // Re-closing is a no-op refusal, and the message names the owner-only re-open (ADR-0084 mirror).
  const again = await arcClose(writeDeps(store), "done-arc", { outcome: "again" });
  assert.equal(again.ok, false);
  assert.match(again.body, /already closed/);
  assert.match(again.body, /OWNER-only/);
  const doc = (await store.getDoc("done-arc"))?.doc as { increments: unknown[] };
  assert.equal(doc.increments.length, 1, "a refused re-close appends nothing");
});

test("a closed arc leaves the default worklist end-to-end (D2 write → D3 filter)", async () => {
  const fx = diskFixture();
  try {
    const store = await seededStore();
    // A second, still-live arc, so the post-close worklist is non-empty and the footer is exercised.
    await store.upsertDoc({
      id: "zz-live-arc",
      kind: "arc",
      doc: {
        kind: "arc",
        id: "zz-live-arc",
        title: "Still in flight",
        description: "d",
        intent: "Keep going.",
        endState: "Not yet.",
        references: [],
        createdAt: "2026-07-01",
        updatedAt: "2026-07-01",
      },
    });
    const before = await arcCommand("list", undefined, depsFor(store, fx));
    assert.match(before.body, /2 active arc\(s\)/);
    assert.match(before.body, /map-arc/);

    await arcClose(writeDeps(store), "map-arc", { outcome: "the end state is met" });

    const after = await arcCommand("list", undefined, depsFor(store, fx));
    assert.match(after.body, /1 active arc\(s\)/);
    assert.doesNotMatch(after.body, /map-arc {2}\d+ increment/, "the closed arc is out of the worklist");
    assert.match(after.body, /zz-live-arc/, "the arc still in flight stays in the worklist");
    assert.match(after.body, /\(1 closed — --all\)/);
    const all = await arcCommand("list", undefined, depsFor(store, fx), "all");
    assert.match(all.body, /map-arc.*\[closed\]/, "--all still shows it");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc help advertises the close verb and the list filters", async () => {
  const fx = diskFixture();
  try {
    const help = await arcCommand(undefined, undefined, depsFor(new InMemoryStore(), fx));
    assert.match(help.body, /storytree arc close <id> --outcome/);
    assert.match(help.body, /--all\|--closed/);
    assert.match(help.body, /Re-opening is OWNER-only/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
