import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import {
  arcIsClosed,
  arcRefOf,
  deriveArcLifecycle,
  deriveArcRollup,
  loadArcRollup,
  loadArcRollups,
  reconcileArcLifecycles,
  storyArcStamps,
  type ArcRollup,
  type ArcRollupDeps,
} from "./arc-rollup.js";

/**
 * The shared arc → children JOIN (ADR-0183 D3 / ADR-0267 D4).
 *
 * The point of this module is that ONE join serves two surfaces — `storytree arc show` and the
 * studio's arc endpoint — so these tests hold the join itself, not either renderer. Every
 * containment edge lives on the CHILD, so each leg is seeded independently and the view is asserted
 * to derive it: a plan's `arcRef`, an open question's `arcRef`, an ADR's frontmatter `arc:` stamp,
 * a story's frontmatter `arc:` stamp.
 */

async function seededStore(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "map-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "map-arc",
      title: "Map pathways",
      description: "the map arc",
      intent: "Pathways on the map.",
      endState: "Owner sees pathways.",
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
    },
  });
  // A CLOSED sibling arc — proves lifecycle rides the rollup (ADR-0239 D1) and that the list
  // returns it (filtering to active-only is the caller's, not the join's).
  await store.upsertDoc({
    id: "done-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "done-arc",
      title: "A finished initiative",
      description: "closed",
      lifecycle: "closed",
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
    },
  });
  // The two landings that used to be `arc.increments[]` entries — now closed increment ROWS
  // (ADR-0305 D1/D3/D5). Seeded out of chronological order so the rollup's own sort is what puts
  // them right, rather than the fixture flattering it.
  await store.upsertDoc({
    id: "map-arc-inc-02",
    kind: "increment",
    doc: {
      kind: "increment",
      id: "map-arc-inc-02",
      title: "The look wall",
      description: "d",
      objective: "halted at the look wall",
      body: "halted at the look wall",
      arcRef: "asset:map-arc",
      status: "closed",
      outcome: { date: "2026-07-05", note: "halted at the look wall" },
      references: [],
      createdAt: "2026-07-05",
      updatedAt: "2026-07-05",
    },
  });
  await store.upsertDoc({
    id: "map-arc-inc-01",
    kind: "increment",
    doc: {
      kind: "increment",
      id: "map-arc-inc-01",
      title: "Items 1-3",
      description: "d",
      objective: "items 1-3 landed",
      body: "items 1-3 landed",
      arcRef: "asset:map-arc",
      status: "closed",
      outcome: { date: "2026-07-01", pr: "#640" },
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
    },
  });
  // A PARKED increment — forward-looking, and therefore expected to sort ahead of both landings.
  await store.upsertDoc({
    id: "map-arc-parked",
    kind: "increment",
    doc: {
      kind: "increment",
      id: "map-arc-parked",
      title: "Density LOD",
      description: "d",
      objective: "cull nodes past a density threshold",
      body: "touches `packages/forest-world/src`",
      arcRef: "asset:map-arc",
      status: "proposal",
      parked: "2026-07-20T00:00:00.000Z",
      frictionRefs: ["map-is-unreadable-zoomed-out"],
      references: [],
      createdAt: "2026-07-20",
      updatedAt: "2026-07-20",
    },
  });
  await store.upsertDoc({
    id: "map-arc-plan-1",
    kind: "increment",
    doc: {
      kind: "increment",
      id: "map-arc-plan-1",
      title: "Increment 4 choreography",
      description: "d",
      objective: "o",
      body: "one unit",
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
    kind: "increment",
    doc: {
      kind: "increment",
      id: "other-plan",
      title: "other",
      description: "d",
      objective: "o",
      body: "u",
      arcRef: "asset:other-arc",
      anchor: { sha: "1234567", date: "2026-07-10" },
      status: "proposal",
      references: [],
      createdAt: "2026-07-10",
      updatedAt: "2026-07-10",
    },
  });
  // Two questions on map-arc (ADR-0267 D4) + one unstamped, which belongs to no arc at all.
  await store.upsertDoc({
    id: "oq-density",
    kind: "open-question",
    doc: {
      kind: "open-question",
      id: "oq-density",
      title: "How dense should the map get?",
      description: "the density fork",
      stakes: "The zoomed-out map stays unreadable until this lands.",
      statement: "s",
      context: "c",
      arcRef: "asset:map-arc",
      references: [],
      createdAt: "2026-07-20",
      updatedAt: "2026-07-20",
    },
  });
  await seedQuestion(store, "oq-blocked-meaning", "What counts as blocked?", "asset:map-arc");
  await seedQuestion(store, "oq-orphan", "A question no arc owns", undefined);
  return store;
}

/** Seed one open question, optionally stamped to an arc. */
async function seedQuestion(
  store: InMemoryStore,
  id: string,
  title: string,
  arcRef: string | undefined,
): Promise<void> {
  await store.upsertDoc({
    id,
    kind: "open-question",
    doc: {
      kind: "open-question",
      id,
      title,
      description: "d",
      stakes: "",
      statement: "s",
      context: "c",
      ...(arcRef !== undefined ? { arcRef } : {}),
      references: [],
      createdAt: "2026-07-20",
      updatedAt: "2026-07-20",
    },
  });
}

/** A disk fixture: decisions dir with one stamped + one unstamped ADR, stories dir with stamps. */
function diskFixture(): { root: string; decisionsDir: string; storiesDir: string } {
  const root = mkdtempSync(path.join(tmpdir(), "arc-rollup-"));
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

function depsFor(store: InMemoryStore, fx: { decisionsDir: string; storiesDir: string }): ArcRollupDeps {
  return { store, decisionsDir: fx.decisionsDir, storiesDir: fx.storiesDir };
}

test("arcRefOf resolves the containment edge, and refuses anything that is not an asset: pointer", () => {
  const doc = (arcRef: unknown) => ({ id: "x", kind: "increment", doc: { arcRef }, createdAt: "", updatedAt: "" });
  assert.equal(arcRefOf(doc("asset:map-arc") as never), "map-arc");
  // The bare id and a doc: ref are NOT edges — the schema rejects them, and so must the reader, so a
  // malformed row is invisible to the arc view rather than silently attaching to the wrong parent.
  assert.equal(arcRefOf(doc("map-arc") as never), null);
  assert.equal(arcRefOf(doc("doc:decisions/0183.md") as never), null);
  assert.equal(arcRefOf(doc(undefined) as never), null);
  assert.equal(arcRefOf(doc(42) as never), null);
});

test("arcIsClosed: only the exact `closed` enum closes — anything unrecognised stays IN FLIGHT", () => {
  const arc = (lifecycle: unknown) => ({ id: "a", kind: "arc", doc: { lifecycle }, createdAt: "", updatedAt: "" });
  assert.equal(arcIsClosed(arc("closed") as never), true);
  assert.equal(arcIsClosed(arc("active") as never), false);
  // Fail-OPEN: an absent/typo'd/cased value keeps the arc in the worklist rather than vanishing it.
  for (const v of [undefined, "", "CLOSED", "done", 1]) {
    assert.equal(arcIsClosed(arc(v) as never), false, `lifecycle ${String(v)} must not read as closed`);
  }
});

test("storyArcStamps reads frontmatter arc: stamps and skips unstamped/missing stories", () => {
  const fx = diskFixture();
  try {
    assert.deepEqual(storyArcStamps(fx.storiesDir), [{ story: "map-story", arc: "map-arc" }]);
    assert.deepEqual(storyArcStamps(path.join(fx.root, "nope")), []); // missing dir → empty, no throw
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("loadArcRollup joins all four child legs and leaks no other arc's children", async () => {
  const fx = diskFixture();
  try {
    const rollup = await loadArcRollup(depsFor(await seededStore(), fx), "map-arc");
    assert.ok(rollup, "map-arc must resolve");

    assert.equal(rollup.id, "map-arc");
    assert.equal(rollup.title, "Map pathways");
    assert.equal(rollup.lifecycle, "active");
    assert.equal(rollup.intent, "Pathways on the map.");
    assert.equal(rollup.endState, "Owner sees pathways.");

    // ONE increment list, joined by `arcRef` (ADR-0305 D1) — `other-plan` cites another arc and
    // must be absent. FORWARD-LOOKING FIRST, then the landing log oldest-first: this is the ordering
    // the parked entry `increment-tier-is-addressable-at-entry-grain` demanded, and it is asserted
    // here rather than in the renderer because the ORDER is data, not presentation.
    assert.deepEqual(
      rollup.increments.map((i) => i.id),
      ["map-arc-parked", "map-arc-plan-1", "map-arc-inc-01", "map-arc-inc-02"],
    );
    assert.deepEqual(
      rollup.increments.map((i) => i.status),
      ["proposal", "ready", "closed", "closed"],
    );
    // The two landings were SEEDED newest-first; the sort is what puts them chronological.
    assert.deepEqual(
      rollup.increments.filter((i) => i.status === "closed").map((i) => i.outcome?.date),
      ["2026-07-01", "2026-07-05"],
    );
    assert.equal(rollup.increments[0]?.parked, "2026-07-20T00:00:00.000Z");
    assert.deepEqual(rollup.increments[0]?.frictionRefs, ["map-is-unreadable-zoomed-out"]);
    assert.equal(rollup.increments[2]?.outcome?.pr, "#640");
    assert.equal(rollup.increments[3]?.outcome?.note, "halted at the look wall");
    assert.equal(rollup.increments[1]?.anchorSha, "abcdef123", "the anchor is short-sha'd for display");
    assert.equal(rollup.increments[0]?.anchorSha, undefined, "a parked increment has no anchor yet");

    // Questions by arcRef (ADR-0267 D4) — id-sorted, and the unstamped orphan is absent.
    assert.deepEqual(
      rollup.questions.map((q) => q.id),
      ["oq-blocked-meaning", "oq-density"],
    );
    assert.equal(
      rollup.questions[1]?.stakes,
      "The zoomed-out map stays unreadable until this lands.",
      "the stakes line rides along — questions are part of the payload, not just a list of titles",
    );

    // ADRs by frontmatter stamp — the unstamped 0202 is absent.
    assert.deepEqual(
      rollup.adrs.map((a) => a.number),
      [201],
    );
    assert.equal(rollup.adrs[0]?.title, "A stamped decision");
    assert.equal(rollup.adrs[0]?.status, "accepted");

    // Stories by frontmatter stamp — the unstamped `plain-story` is absent.
    assert.deepEqual(rollup.stories, ["map-story"]);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("ADR-0267 D7: `waiting` is derived from open questions, and `blocked` is NOT invented", async () => {
  const fx = diskFixture();
  try {
    const store = await seededStore();
    const waiting = await loadArcRollup(depsFor(store, fx), "map-arc");
    assert.equal(waiting?.waiting, true, "an arc with open questions is waiting on the owner");

    // The closed sibling has none, so it is not waiting — `waiting` tracks the questions, nothing else.
    const done = await loadArcRollup(depsFor(store, fx), "done-arc");
    assert.equal(done?.waiting, false);
    assert.equal(done?.lifecycle, "closed");

    // D7 names `blocked` as a DISTINCT state and deliberately declines to define it: "a session that
    // quietly makes `blocked` a synonym for `waiting`, or that invents a `blocked` predicate to close
    // the gap, has exceeded this decision." So the rollup must not carry one. This assertion is the
    // fence — it goes red the moment someone adds the field without the owner defining it.
    assert.ok(
      !Object.hasOwn(waiting as object, "blocked"),
      "blocked must stay undefined until ADR-0267 D7's open definition is settled by the owner",
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("loadArcRollup returns null for a miss and for a wrong-kind id (the caller reports it)", async () => {
  const fx = diskFixture();
  try {
    const deps = depsFor(await seededStore(), fx);
    assert.equal(await loadArcRollup(deps, "no-such-arc"), null);
    // A real id of the WRONG kind is a miss too — a plan is not an arc.
    assert.equal(await loadArcRollup(deps, "map-arc-plan-1"), null);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("loadArcRollups returns every arc id-sorted, closed ones included (filtering is the caller's)", async () => {
  const fx = diskFixture();
  try {
    const all = await loadArcRollups(depsFor(await seededStore(), fx));
    assert.deepEqual(
      all.map((a) => a.id),
      ["done-arc", "map-arc"],
    );
    // Each carries its own derived children — the list read is not a degraded summary.
    assert.deepEqual(
      all[1]?.increments.map((i) => i.id),
      ["map-arc-parked", "map-arc-plan-1", "map-arc-inc-01", "map-arc-inc-02"],
    );
    assert.equal(all[0]?.increments.length, 0);
    assert.equal(all[0]?.lifecycle, "closed");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("deriveArcRollup is PURE — the same inputs join identically with no store or fs in reach", () => {
  const arc = {
    id: "a1",
    kind: "arc",
    doc: { kind: "arc", id: "a1", title: "A", description: "d" },
    createdAt: "",
    updatedAt: "",
  };
  const question = {
    id: "q1",
    kind: "open-question",
    doc: { kind: "open-question", id: "q1", title: "Q", description: "d", stakes: "s", arcRef: "asset:a1" },
    createdAt: "",
    updatedAt: "",
  };
  const rollup = deriveArcRollup({
    arc: arc as never,
    incrementDocs: [],
    questionDocs: [question as never],
    adrs: [
      { number: 1, file: "0001-x.md", status: "accepted", supersedes: [], amends: [], loadBearing: false, arc: "a1", title: "T" },
      { number: 2, file: "0002-y.md", status: "proposed", supersedes: [], amends: [], loadBearing: false, title: "U" },
    ],
    storyStamps: [{ story: "s1", arc: "a1" }, { story: "s2", arc: "elsewhere" }],
  });
  assert.deepEqual(rollup.questions.map((q) => q.id), ["q1"]);
  assert.deepEqual(rollup.adrs.map((a) => a.number), [1]);
  assert.deepEqual(rollup.stories, ["s1"]);
  assert.equal(rollup.waiting, true);
  assert.equal(rollup.lifecycle, "active", "an arc with no lifecycle field is in flight");
});

// ---------------------------------------------------------------------------
// ADR-0306 D2/D4 — the typed citation edge, and the TWO story paths it creates.
// ---------------------------------------------------------------------------

/** One increment doc citing `refs`, minimal but shaped like the real thing. */
function citingIncrement(id: string, refs: string[]): unknown {
  return {
    id,
    kind: "increment",
    doc: {
      kind: "increment",
      id,
      title: id,
      objective: `objective of ${id}`,
      arcRef: "asset:a1",
      status: "ready",
      cites: refs,
    },
    createdAt: "",
    updatedAt: "",
  };
}

const A1 = {
  id: "a1",
  kind: "arc",
  doc: { kind: "arc", id: "a1", title: "A", description: "d" },
  createdAt: "",
  updatedAt: "",
};

const WORK_UNITS = new Map([
  ["here", { id: "here", tier: "story" as const, story: "here" }],
  ["a-cap", { id: "a-cap", tier: "capability" as const, story: "here" }],
]);

test("cites ride the rollup verbatim, and the refs this checkout misses are reported beside them", () => {
  const rollup = deriveArcRollup({
    arc: A1 as never,
    incrementDocs: [citingIncrement("inc-1", ["story:here", "story:elsewhere", "asset:a-guide"]) as never],
    questionDocs: [],
    adrs: [],
    storyStamps: [],
    workUnits: WORK_UNITS,
  });
  const inc = rollup.increments[0];
  assert.deepEqual(inc?.cites, ["story:here", "story:elsewhere", "asset:a-guide"], "verbatim, in author order");
  assert.deepEqual(
    inc?.danglingCites,
    ["story:elsewhere (no such story in this checkout)"],
    "the asset: ref is the STORE's to resolve, not this scan's — never counted dangling here",
  );
});

test("NO workUnits index => NO dangling report, never a report that everything dangles", () => {
  // An omitted index means "the question was not asked". Reading a missing SCANNER as a missing
  // STORY is exactly the falsified-absence error ADR-0306 D1 is written to avoid, and it would fire
  // on every caller that has no stories tree to walk.
  const rollup = deriveArcRollup({
    arc: A1 as never,
    incrementDocs: [citingIncrement("inc-1", ["story:elsewhere"]) as never],
    questionDocs: [],
    adrs: [],
    storyStamps: [],
  });
  assert.deepEqual(rollup.increments[0]?.cites, ["story:elsewhere"]);
  assert.equal(rollup.increments[0]?.danglingCites, undefined);
  assert.deepEqual(
    rollup.citedStories.map((c) => [c.id, c.present]),
    [["elsewhere", true]],
    "an unasked question is answered as unobserved-absent, not as absent",
  );
});

test("D4: the STAMPED and CITED story paths are separate fields and never merged", () => {
  // The stamp says *this arc PRODUCED this story* and is a scan of one working tree; the citation
  // says *an increment TOUCHED this story* and is store-resident. Under one list, a story missing
  // because this branch has not created it yet would look exactly like a story nobody stamped.
  const rollup = deriveArcRollup({
    arc: A1 as never,
    incrementDocs: [
      citingIncrement("inc-1", ["story:here", "capability:a-cap"]) as never,
      citingIncrement("inc-2", ["story:here", "story:elsewhere"]) as never,
    ],
    questionDocs: [],
    adrs: [],
    storyStamps: [{ story: "stamped-only", arc: "a1" }],
    workUnits: WORK_UNITS,
  });
  assert.deepEqual(rollup.stories, ["stamped-only"], "the disk-scan path is untouched by citations");
  assert.deepEqual(rollup.citedStories, [
    { id: "elsewhere", by: ["inc-2"], present: false },
    { id: "here", by: ["inc-1", "inc-2"], present: true },
  ]);
  assert.ok(
    !rollup.stories.includes("here"),
    "a cited story must NOT leak into the stamped list — that merge is what D4 forbids",
  );
});

test("only `story:` citations build citedStories — a capability is not a story", () => {
  const rollup = deriveArcRollup({
    arc: A1 as never,
    incrementDocs: [citingIncrement("inc-1", ["capability:a-cap", "asset:a-guide"]) as never],
    questionDocs: [],
    adrs: [],
    storyStamps: [],
    workUnits: WORK_UNITS,
  });
  assert.deepEqual(rollup.citedStories, []);
});

test("a malformed cites field never throws the join — it reads as no citations", () => {
  const broken = {
    id: "inc-bad",
    kind: "increment",
    doc: { kind: "increment", id: "inc-bad", title: "t", objective: "o", arcRef: "asset:a1", status: "ready", cites: "story:here" },
    createdAt: "",
    updatedAt: "",
  };
  const rollup = deriveArcRollup({
    arc: A1 as never,
    incrementDocs: [broken as never],
    questionDocs: [],
    adrs: [],
    storyStamps: [],
    workUnits: WORK_UNITS,
  });
  assert.equal(rollup.increments[0]?.cites, undefined);
  assert.deepEqual(rollup.citedStories, []);
});

// ---------------------------------------------------------------------------
// ADR-0335's rule as a SWEEP — the reconciler half the trigger never had.
// ---------------------------------------------------------------------------

/** A rollup carrying only what the lifecycle rule reads: an id, a stored flag, and statuses. */
function lifecycleRollup(
  id: string,
  lifecycle: "active" | "closed",
  statuses: string[],
): ArcRollup {
  return {
    id,
    title: `title of ${id}`,
    description: "",
    lifecycle,
    intent: "",
    endState: "",
    increments: statuses.map((status, n) => ({
      id: `${id}-inc-${n}`,
      title: `${id} inc ${n}`,
      objective: "",
      status,
    })) as ArcRollup["increments"],
    adrs: [],
    stories: [],
    citedStories: [],
    questions: [],
    waiting: false,
  };
}

test("deriveArcLifecycle: closed once every increment has landed, active while any is forward-looking", () => {
  assert.equal(deriveArcLifecycle([{ status: "closed" }, { status: "closed" }]), "closed");
  assert.equal(deriveArcLifecycle([{ status: "closed" }, { status: "proposal" }]), "active");
  assert.equal(deriveArcLifecycle([{ status: "ready" }]), "active");
  assert.equal(deriveArcLifecycle([{ status: "active" }]), "active");
});

test("deriveArcLifecycle: an unrecognised status counts as forward-looking, so an unreadable row never closes an arc", () => {
  assert.equal(deriveArcLifecycle([{ status: "closed" }, { status: "who-knows" }]), "active");
});

test("deriveArcLifecycle: an EMPTY log derives nothing — never `closed` (ADR-0335 D1's birth window)", () => {
  // The case that would otherwise close an arc on the day it was chartered: `arc new` writes the
  // arc doc before its bundled first increment, so zero increments means "not started yet", not
  // "drained". A `closed` here would be the sweep inventing a landing history.
  assert.equal(deriveArcLifecycle([]), null);
});

test("reconcileArcLifecycles: reports a drained-but-active arc as `close`, with its counts", () => {
  const found = reconcileArcLifecycles([lifecycleRollup("drained", "active", ["closed", "closed"])]);
  assert.equal(found.agreed, 0);
  assert.deepEqual(found.noSignal, []);
  assert.equal(found.drift.length, 1);
  assert.deepEqual(
    { ...found.drift[0]! },
    {
      id: "drained",
      title: "title of drained",
      stored: "active",
      derived: "closed",
      action: "close",
      open: 0,
      landed: 2,
    },
  );
});

test("reconcileArcLifecycles: is SYMMETRIC — open work on a closed arc reports as `reopen`", () => {
  // ADR-0335 D2's auto-reopen read as a sweep. A reconciler that only ever closed would be a
  // different rule wearing the same name.
  const found = reconcileArcLifecycles([lifecycleRollup("revived", "closed", ["closed", "proposal"])]);
  assert.equal(found.drift.length, 1);
  assert.equal(found.drift[0]?.action, "reopen");
  assert.equal(found.drift[0]?.derived, "active");
  assert.equal(found.drift[0]?.open, 1);
  assert.equal(found.drift[0]?.landed, 1);
});

test("reconcileArcLifecycles: an arc already in agreement is COUNTED, never reported as drift", () => {
  // A clean sweep must be distinguishable from a sweep that enumerated nothing — the blind-loader
  // failure mode ADR-0256/#970 measured, where zero findings read as a healthy repo.
  const found = reconcileArcLifecycles([
    lifecycleRollup("fine-active", "active", ["proposal"]),
    lifecycleRollup("fine-closed", "closed", ["closed"]),
  ]);
  assert.deepEqual(found.drift, []);
  assert.equal(found.agreed, 2);
});

test("reconcileArcLifecycles: a zero-increment arc is held OUT of drift and named separately", () => {
  const found = reconcileArcLifecycles([lifecycleRollup("just-chartered", "active", [])]);
  assert.deepEqual(found.drift, []);
  assert.equal(found.agreed, 0);
  assert.deepEqual(found.noSignal, [
    { id: "just-chartered", title: "title of just-chartered", stored: "active" },
  ]);
});

test("reconcileArcLifecycles: sorts nothing and drops nothing — every arc lands in exactly one bucket", () => {
  const rollups = [
    lifecycleRollup("a", "active", ["closed"]),
    lifecycleRollup("b", "active", ["proposal"]),
    lifecycleRollup("c", "closed", ["ready"]),
    lifecycleRollup("d", "closed", ["closed"]),
    lifecycleRollup("e", "active", []),
  ];
  const found = reconcileArcLifecycles(rollups);
  assert.equal(found.drift.length + found.noSignal.length + found.agreed, rollups.length);
  assert.deepEqual(found.drift.map((d) => d.id), ["a", "c"]);
  assert.deepEqual(found.noSignal.map((n) => n.id), ["e"]);
});
