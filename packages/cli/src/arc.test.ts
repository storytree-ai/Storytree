import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import { arcCommand, arcEdit, arcIncrementAdd, storyArcStamps, type ArcViewDeps, type ArcWriteDeps } from "./arc.js";

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
