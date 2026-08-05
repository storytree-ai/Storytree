import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import {
  arcIsClosed,
  arcRefOf,
  deriveArcRollup,
  loadArcRollup,
  loadArcRollups,
  storyArcStamps,
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
      increments: [
        { date: "2026-07-01", pr: "#640", outcome: "items 1-3 landed" },
        { date: "2026-07-05", outcome: "halted at the look wall" },
      ],
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
  await store.upsertDoc({
    id: "map-arc-plan-1",
    kind: "plan",
    doc: {
      kind: "plan",
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
    kind: "plan",
    doc: {
      kind: "plan",
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
  const doc = (arcRef: unknown) => ({ id: "x", kind: "plan", doc: { arcRef }, createdAt: "", updatedAt: "" });
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

    // The increment log rides the rollup in authored order — it is the durable residue the studio
    // needs to answer "where is this up to" (ADR-0183 D1), not something the CLI formats privately.
    assert.equal(rollup.increments.length, 2);
    assert.equal(rollup.increments[0]?.pr, "#640");
    assert.equal(rollup.increments[1]?.outcome, "halted at the look wall");

    // Plans by arcRef — `other-plan` cites another arc and must be absent.
    assert.deepEqual(
      rollup.plans.map((p) => p.id),
      ["map-arc-plan-1"],
    );
    assert.equal(rollup.plans[0]?.status, "ready");
    assert.equal(rollup.plans[0]?.anchorSha, "abcdef123", "the anchor is short-sha'd for display");

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
    assert.deepEqual(all[1]?.plans.map((p) => p.id), ["map-arc-plan-1"]);
    assert.equal(all[0]?.plans.length, 0);
    assert.equal(all[0]?.lifecycle, "closed");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("deriveArcRollup is PURE — the same inputs join identically with no store or fs in reach", () => {
  const arc = {
    id: "a1",
    kind: "arc",
    doc: { kind: "arc", id: "a1", title: "A", description: "d", increments: [] },
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
    planDocs: [],
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
