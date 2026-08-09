import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";

import {
  arcClose,
  arcCommand,
  arcDescriptionFrom,
  arcEdit,
  arcIdFromTitle,
  arcIncrementAdd,
  arcNew,
  arcIncrementClose,
  arcIncrementNew,
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
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
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
    // The arc's own state: intent and end state. Its WORK is derived children now (ADR-0305 D1).
    assert.match(res.body, /Pathways on the map\./);
    // Derived children — and ONLY this arc's. A `ready` increment sits in the forward-looking half.
    assert.match(res.body, /map-arc-plan-1 {2}\[ready, anchor abcdef123\]/);
    assert.doesNotMatch(res.body, /other-plan/);
    assert.match(res.body, /ADR-0201 {2}accepted {3}A stamped decision/);
    assert.doesNotMatch(res.body, /ADR-0202/);
    assert.match(res.body, /- map-story/);
    assert.doesNotMatch(res.body, /plain-story/);
    // The freshness check is the suggested next door for a consumable increment.
    assert.ok((res.next ?? []).some((n) => n.includes("increment check map-arc-plan-1")));
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc show surfaces the open questions the arc is waiting on (ADR-0267 D4)", async () => {
  const fx = diskFixture();
  try {
    const store = await seededStore();
    await store.upsertDoc({
      id: "oq-blocked-meaning",
      kind: "open-question",
      doc: {
        kind: "open-question",
        id: "oq-blocked-meaning",
        title: "What exactly qualifies as blocked?",
        description: "d",
        stakes: "The surface cannot render a blocked state until this is settled.",
        statement: "s",
        context: "c",
        arcRef: "asset:map-arc",
        references: [],
        createdAt: "2026-07-30",
        updatedAt: "2026-07-30",
      },
    });
    // A question owned by NO arc — the derived view must not sweep it in.
    await store.upsertDoc({
      id: "oq-orphan",
      kind: "open-question",
      doc: {
        kind: "open-question",
        id: "oq-orphan",
        title: "An unowned question",
        description: "d",
        stakes: "",
        statement: "s",
        context: "c",
        references: [],
        createdAt: "2026-07-30",
        updatedAt: "2026-07-30",
      },
    });

    const res = await arcCommand("show", "map-arc", depsFor(store, fx));
    assert.equal(res.ok, true);
    assert.match(res.body, /## Open questions {2}\(derived: open-question\.arcRef → map-arc\)/);
    assert.match(res.body, /- oq-blocked-meaning {2}— What exactly qualifies as blocked\?/);
    // The stakes line rides along: ADR-0267 treats questions as part of the PAYLOAD, so the reader
    // can act without a re-onboarding round-trip rather than merely learning a question exists.
    assert.match(res.body, /why it matters: The surface cannot render a blocked state/);
    assert.doesNotMatch(res.body, /oq-orphan/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc show says so honestly when an arc is waiting on nothing", async () => {
  const fx = diskFixture();
  try {
    const res = await arcCommand("show", "map-arc", depsFor(await seededStore(), fx));
    assert.equal(res.ok, true);
    assert.match(res.body, /\(none — this arc is not waiting on the owner\)/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc list summarises every arc by landed count AND open count", async () => {
  const fx = diskFixture();
  try {
    const store = await seededStore();
    await arcIncrementAdd(writeDeps(store), "map-arc", { outcome: "items 1-3 landed", pr: "#640", date: "2026-07-01" });
    const res = await arcCommand("list", undefined, depsFor(store, fx));
    assert.equal(res.ok, true);
    // The OPEN count is new since the fold: before it, forward-looking work lived in an array this
    // list never read, so an arc with parked remedies and no landings was indistinguishable from
    // one nobody had started.
    assert.match(res.body, /map-arc {2}1 landed, 1 open, last 2026-07-01 #640/);
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
    assert.match(done.body, /## Increment log/);

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
    assert.match(wrongKind.body, /is a increment, not an arc/);
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

// ---------------------------------------------------------------------------
// `arc new` — the SCAFFOLDER (friction `no-arc-new-scaffolder-verb`, routed `tool`). The missing
// FIRST step of a lifecycle whose other three steps were already first-class: creating an arc used to
// mean reading KIND_SPECS for the field set, hand-writing the doc JSON with createdAt/updatedAt
// hand-stamped, and filing it via `library artifact new --file`. These tests pin the contract that
// removes that: the author supplies title + intent + end state, and NOTHING mechanical.
// ---------------------------------------------------------------------------

// The bundled first increment (ADR-0335) — the same two flags `arc increment new` reads.
const FIRST_INC = {
  objective: "Land the first slice.",
  body: "What the first increment of this arc actually does, in full.",
};

test("arc new scaffolds a valid arc from five fields — the CLI stamps everything mechanical", async () => {
  const store = new InMemoryStore();
  const res = await arcNew(writeDeps(store), undefined, {
    title: "End at merge",
    intent: "Sessions end where their PR merges. The closing leg runs in order.",
    endState: "No landed session is left parked-open.",
    ...FIRST_INC,
  });
  assert.equal(res.ok, true);
  assert.match(res.body, /created arc end-at-merge-arc {2}\[active, 1 increment\]/);

  const got = (await store.getDoc("end-at-merge-arc"))?.doc as Record<string, unknown>;
  // The three authored narrative fields, verbatim.
  assert.equal(got["title"], "End at merge");
  assert.equal(got["intent"], "Sessions end where their PR merges. The closing leg runs in order.");
  assert.equal(got["endState"], "No landed session is left parked-open.");
  // Everything else is the CLI's — the whole point of the verb. `id` carries the `-arc` convention,
  // `description` is derived from the intent's first sentence, and BOTH timestamps + the per-row
  // schema pin are stamped, so no author hand-writes them (and none can go stale by hand).
  assert.equal(got["kind"], "arc");
  assert.equal(got["id"], "end-at-merge-arc");
  assert.equal(got["description"], "Sessions end where their PR merges.");
  assert.equal(got["lifecycle"], "active", "a born arc is explicitly in flight");
  assert.deepEqual(got["references"], []);
  assert.equal(got["createdAt"], NOW);
  assert.equal(got["updatedAt"], NOW);
  assert.equal(typeof got["schemaVersion"], "number", "the upcaster pins the row version");
  // The arc doc itself still carries no `increments` array (ADR-0305 D1 fold) — the bundled first
  // increment is its OWN row, minted through the same path `arc increment new` uses.
  assert.equal(got["increments"], undefined);
  const inc = (await store.getDoc("end-at-merge-arc-inc-01"))?.doc as Record<string, unknown>;
  assert.equal(inc["status"], "proposal");
  assert.equal(inc["arcRef"], "asset:end-at-merge-arc");
  assert.equal(inc["objective"], FIRST_INC.objective);
  assert.equal(inc["body"], FIRST_INC.body);
  assert.equal(inc["title"], "Land the first slice.");
});

test("a scaffolded arc is immediately readable by the arc VIEW path (writer + reader agree)", async () => {
  // Composed OUTWARD on purpose: a green writer whose output the existing reader can't consume is the
  // trap a per-function suite misses. `arc new` → `arc show`/`arc list`, over the real view code.
  const fx = diskFixture();
  try {
    const store = new InMemoryStore();
    await arcNew(writeDeps(store), undefined, {
      title: "Arc orientation surface",
      intent: "Arcs take the map's top drawer.",
      endState: "The owner reads initiative state without spelunking.",
      ...FIRST_INC,
    });
    const show = await arcCommand("show", "arc-orientation-surface-arc", depsFor(store, fx));
    assert.equal(show.ok, true);
    assert.match(show.body, /# Arc orientation surface {4}\[arc\]/);
    assert.match(show.body, /lifecycle: active \(in flight\)/);
    assert.match(show.body, /\*\*The intent\.\*\* Arcs take the map's top drawer\./);
    // The bundled first increment is PARKED, not landed — nothing has landed yet.
    assert.match(show.body, /\(no landings yet\)/);

    const list = await arcCommand("list", undefined, depsFor(store, fx));
    assert.equal(list.ok, true);
    assert.match(list.body, /arc-orientation-surface-arc {2}0 landed, 1 open, no landings yet/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc new takes an explicit positional id, normalising it — the convention has an escape hatch", async () => {
  const store = new InMemoryStore();
  // A copy-pasted `asset:` ref with stray capitals: normalised rather than minting an id the ref
  // regexes would later reject. No `-arc` suffix is forced on an authored id.
  const res = await arcNew(writeDeps(store), "asset:Session Isolation", {
    title: "Something else entirely",
    intent: "i",
    endState: "e",
    ...FIRST_INC,
  });
  assert.equal(res.ok, true);
  assert.match(res.body, /created arc session-isolation\b/);
  assert.ok(await store.getDoc("session-isolation"));
  assert.ok(await store.getDoc("session-isolation-inc-01"));
  // The derived-id note is suppressed when the author supplied one.
  assert.doesNotMatch(res.body, /id derived from the title/);
});

test("arc new names EVERY missing required field in one refusal", async () => {
  const store = new InMemoryStore();
  const bare = await arcNew(writeDeps(store), undefined, {});
  assert.equal(bare.ok, false);
  assert.match(bare.body, /arc new needs 5 more fields/);
  assert.match(bare.body, /--title/);
  assert.match(bare.body, /--intent/);
  assert.match(bare.body, /--end-state/);
  assert.match(bare.body, /--objective/);
  assert.match(bare.body, /--body/);
  // Nothing was written on the way to the refusal.
  assert.equal((await store.queryDocs({ kind: "arc" })).length, 0);

  // One field short → singular, and only the missing one is named.
  const partial = await arcNew(writeDeps(store), undefined, { title: "T", intent: "i", endState: "e", ...FIRST_INC, body: undefined });
  assert.equal(partial.ok, false);
  assert.match(partial.body, /arc new needs one more field/);
  assert.match(partial.body, /--body/);
  assert.doesNotMatch(partial.body, /--title/);

  // Whitespace-only is EMPTY: `Markdown` is `.min(1)`, which a lone newline would satisfy while
  // meaning nothing — so the trim happens before the required check, not after.
  const blank = await arcNew(writeDeps(store), undefined, { title: "T", intent: "  ", endState: "\n", ...FIRST_INC });
  assert.equal(blank.ok, false);
  assert.match(blank.body, /--intent/);
  assert.match(blank.body, /--end-state/);
});

test("arc new refuses offline — arcs are live-canonical", async () => {
  const store = new InMemoryStore();
  const offline = await arcNew(writeDeps(store, false, false), undefined, {
    title: "T",
    intent: "i",
    endState: "e",
  });
  assert.equal(offline.ok, false);
  assert.match(offline.body, /arc new writes to the shared store — run with --pg/);
  assert.deepEqual(offline.next, ["pnpm db:up", "storytree arc new <id> --pg"]);
});

test("arc new refuses an id that already exists — a scaffold never overwrites a live initiative", async () => {
  const store = await seededStore();
  const existing = await arcNew(writeDeps(store), "map-arc", { title: "T", intent: "i", endState: "e", ...FIRST_INC });
  assert.equal(existing.ok, false);
  assert.match(existing.body, /arc map-arc already exists — edit it, don't recreate it/);
  assert.match((existing.next ?? []).join("\n"), /storytree arc edit map-arc/);
  // The seeded arc is untouched — its original intent survives, and so do its child increments,
  // which a scaffolder could not have reached anyway since the fold moved them off the arc doc.
  const untouched = (await store.getDoc("map-arc"))?.doc as Record<string, unknown>;
  assert.equal(untouched["intent"], "Pathways on the map.");
  assert.equal((await store.queryDocs({ kind: "increment" })).length, 2);

  // Ids are shared across kinds, so a plan/definition holding the id is a distinct, honest refusal.
  const wrongKind = await arcNew(writeDeps(store), "map-arc-plan-1", { title: "T", intent: "i", endState: "e", ...FIRST_INC });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /already a increment, not an arc/);

  // A COLLIDING derived id says where the id came from, so the fix (pass one) is obvious.
  const derivedClash = await arcNew(writeDeps(store), undefined, {
    title: "Map arc",
    intent: "i",
    endState: "e",
    ...FIRST_INC,
  });
  assert.equal(derivedClash.ok, false);
  assert.match(derivedClash.body, /that id was DERIVED from the title "Map arc"/);
});

test("arc new: --description overrides the derived one-liner; long prose keeps its newlines", async () => {
  const store = new InMemoryStore();
  const res = await arcNew(writeDeps(store), undefined, {
    title: "Directional DAG",
    intent: "line one\nline two",
    endState: "end line one\nend line two",
    // A @path-read description arrives with newlines; the card line is a ONE-liner, so it collapses.
    description: "  A hand-written\n  card line.\n",
    ...FIRST_INC,
  });
  assert.equal(res.ok, true);
  const got = (await store.getDoc("directional-dag-arc"))?.doc as Record<string, unknown>;
  assert.equal(got["description"], "A hand-written card line.");
  // The narrative fields are NOT collapsed — multi-line prose is the reason @path exists.
  assert.equal(got["intent"], "line one\nline two");
  assert.equal(got["endState"], "end line one\nend line two");
  assert.doesNotMatch(res.body, /description derived from the intent/);
});

test("arc new refuses a title that yields no slug, rather than writing an id-less doc", async () => {
  const store = new InMemoryStore();
  const res = await arcNew(writeDeps(store), undefined, { title: "!!! ???", intent: "i", endState: "e", ...FIRST_INC });
  assert.equal(res.ok, false);
  assert.match(res.body, /could not derive an arc id from the title "!!! \?\?\?"/);
  assert.equal((await store.queryDocs({ kind: "arc" })).length, 0);
});

test("arcIdFromTitle: kebab-case plus the `-arc` suffix convention every live arc carries", () => {
  assert.equal(arcIdFromTitle("End at merge"), "end-at-merge-arc");
  assert.equal(arcIdFromTitle("Session isolation"), "session-isolation-arc");
  // Already suffixed → not doubled.
  assert.equal(arcIdFromTitle("Directional DAG arc"), "directional-dag-arc");
  assert.equal(arcIdFromTitle("Arc"), "arc");
  assert.equal(arcIdFromTitle("!!!"), "");
});

test("arcDescriptionFrom: the intent's first sentence, collapsed to one line and capped", () => {
  assert.equal(
    arcDescriptionFrom("Sessions end at merge.  A second sentence is dropped."),
    "Sessions end at merge.",
  );
  // No terminator → the whole (collapsed) intent.
  assert.equal(arcDescriptionFrom("no terminator here\nsecond line"), "no terminator here second line");
  // Past the cap → cut at a word boundary, with a trailing separator stripped before the ellipsis.
  const long = arcDescriptionFrom(`${"alpha ".repeat(40)}omega.`);
  assert.ok(long.length <= 161, `capped, got ${long.length}`);
  assert.match(long, /…$/);
  assert.doesNotMatch(long, /\s…$/, "cut at a word boundary, no dangling space");
});

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
  // The increment rows are untouched by a narrative edit — they are separate documents now, so a
  // narrative write cannot reach them even by accident (ADR-0305 D1).
  assert.equal((await store.queryDocs({ kind: "increment" })).length, 2);
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
  assert.match(wrongKind.body, /is a increment, not an arc/);

  const nothing = await arcEdit(writeDeps(store), "map-arc", {});
  assert.equal(nothing.ok, false);
  assert.match(nothing.body, /nothing to change/);
});

// ---------------------------------------------------------------------------
// THE INCREMENT VERBS (ADR-0305 D1). An entry is its own ROW now, so the three verbs write
// documents rather than mutating an array on the arc — and the fourth operation the array shape
// could not offer at all, CORRECTING an entry, is `library artifact edit` with no verb here.
// ---------------------------------------------------------------------------

test("arc increment add RECORDS a landing as its own closed increment row (ADR-0305 D1/D5)", async () => {
  const store = await seededStore();
  const res = await arcIncrementAdd(writeDeps(store), "map-arc", {
    date: "2026-07-20",
    pr: "#900",
    outcome: "Increment 5 landed. It reshaped the render and migrated the live rows.",
  });
  assert.equal(res.ok, true);
  assert.match(res.body, /recorded increment map-arc-inc-\d+ on arc map-arc — 2026-07-20 {2}#900/);

  // The arc doc is UNTOUCHED — the landing is a child row, and the containment edge lives on it.
  const arc = (await store.getDoc("map-arc"))?.doc as Record<string, unknown>;
  assert.equal("increments" in arc, false, "the arc's array is gone; a landing never writes to it");

  const written = (await store.queryDocs({ kind: "increment" })).find((d) => d.id.startsWith("map-arc-inc-"));
  assert.ok(written, "the landing is its own row");
  const doc = written.doc as Record<string, unknown>;
  assert.equal(doc["status"], "closed");
  assert.equal(doc["arcRef"], "asset:map-arc");
  assert.deepEqual(doc["outcome"], { date: "2026-07-20", pr: "#900" });
  // objective/title are DERIVED from the outcome's first sentence, so the ceremony stays one command.
  assert.equal(doc["objective"], "Increment 5 landed.");
  assert.equal(doc["body"], "Increment 5 landed. It reshaped the render and migrated the live rows.");

  // It round-trips through the show view — the whole write re-validated (proof of the shared join).
  const fx = diskFixture();
  try {
    const shown = await arcCommand("show", "map-arc", depsFor(store, fx));
    assert.match(shown.body, /## Increment log/);
    assert.match(shown.body, /2026-07-20 {2}#900 {2}map-arc-inc-\d+ {2}— Increment 5 landed\./);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc increment add defaults the date to today, and writes a PR-less landing's prose ONCE (ADR-0322)", async () => {
  const store = await seededStore();
  const res = await arcIncrementAdd(writeDeps(store), "map-arc", { outcome: "an owner-attested halt" });
  assert.equal(res.ok, true);
  const written = (await store.queryDocs({ kind: "increment" })).find((d) => d.id.startsWith("map-arc-inc-"));
  const doc = written?.doc as Record<string, unknown>;
  const outcome = doc["outcome"] as Record<string, unknown>;
  assert.equal(outcome["date"], "2026-07-20"); // NOW's date part
  assert.equal(outcome["pr"], undefined, "no pr key when --pr is omitted");

  // THE FIX. This used to copy the outcome prose into `outcome.note` as well, to satisfy an
  // invariant that demanded a ref-or-reason from every closure. Two copies of one paragraph, and
  // `library artifact edit --set` reaches only the `body` half (`--set outcome=@file` is refused by
  // the object schema), so an ADR-0139 correction half-applied and the row disagreed with itself.
  assert.equal(outcome["note"], undefined, "the prose is NOT duplicated into the outcome");
  assert.equal(doc["body"], "an owner-attested halt", "`body` is the one home for it");
  assert.deepEqual(outcome, { date: "2026-07-20" }, "the outcome carries only what body cannot");

  // And it is still a LEGAL closed increment: the row is born closed with no `parked`, which is the
  // discriminator `assertIncrementInvariants` now reads — its `body` is the terminal prose by
  // construction, because `--outcome` is required. (A row that was parked FIRST still owes a note.)
  assert.equal(doc["parked"], undefined, "a landing recorded at the merge ceremony was never parked");
});

test("arc increment add's landing no longer floods `arc show` with the whole body (ADR-0305 D7)", async () => {
  // The other half of the dual-write's cost: the increment-log renderer prints `outcome.note` when
  // it differs from the objective, so a PR-less landing pushed its ENTIRE body into a section whose
  // own rule is "each row is ONE line plus its objective and a PULL COMMAND — never its body".
  const store = await seededStore();
  await arcIncrementAdd(writeDeps(store), "map-arc", {
    outcome: "The halt. A second sentence that must not reach the arc's log.",
  });
  const fx = diskFixture();
  try {
    const shown = await arcCommand("show", "map-arc", depsFor(store, fx));
    assert.match(shown.body, /— The halt\./, "the derived title still renders");
    assert.equal(
      /A second sentence that must not reach the arc's log\./.test(shown.body),
      false,
      "the body stays behind the pull command",
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc increment add mints a FRESH id per landing — a re-run never overwrites one", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await arcIncrementAdd(deps, "map-arc", { outcome: "first landing" });
  await arcIncrementAdd(deps, "map-arc", { outcome: "second landing" });
  const ids = (await store.queryDocs({ kind: "increment" }))
    .filter((d) => d.id.startsWith("map-arc-inc-"))
    .map((d) => d.id)
    .sort();
  // The seeded `map-arc-plan-1` already cites this arc, so the ordinal starts at 02.
  assert.deepEqual(ids, ["map-arc-inc-02", "map-arc-inc-03"]);
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
  assert.match(wrongKind.body, /is a increment, not an arc/);
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
  // ADR-0335: lifecycle is recomputed after this write, and map-arc's other seeded increment
  // (map-arc-plan-1, status `ready`) is still open, so the arc does not auto-close — the offer is
  // now for the FORCED override (close despite other open work), not "if this landing met the end
  // state" (the old, purely-advisory framing).
  assert.match(closeNext, /\(to force-close despite other open work\)/);
});

test("arc increment add on an ALREADY-closed arc offers no close hint", async () => {
  const store = await withClosedArc(await seededStore());
  const res = await arcIncrementAdd(writeDeps(store), "done-arc", { outcome: "a late footnote" });
  assert.equal(res.ok, true, "appending to a closed arc still works — closure is not a write lock");
  assert.doesNotMatch(res.body, /this arc's end state/);
  assert.ok(!(res.next ?? []).some((n) => n.startsWith("storytree arc close")), "no close hint on a closed arc");
});

// ---------------------------------------------------------------------------
// ADR-0335 — lifecycle recomputed from the increment log itself: closed when nothing is
// forward-looking, active otherwise. Auto-close and auto-reopen are the SAME rule, not two.
// ---------------------------------------------------------------------------

test("ADR-0335: closing an arc's LAST open increment auto-closes the arc", async () => {
  const store = new InMemoryStore();
  const deps = writeDeps(store);
  await arcNew(deps, "solo-arc", { title: "Solo", intent: "i", endState: "e", ...FIRST_INC });
  // The bundled first increment is the ONLY one on this arc — closing it leaves nothing open.
  const close = await arcIncrementClose(deps, "solo-arc-inc-01", { pr: "#1" });
  assert.equal(close.ok, true);
  assert.match(close.body, /arc solo-arc auto-closed — no open increments remain/);

  const arc = (await store.getDoc("solo-arc"))?.doc as Record<string, unknown>;
  assert.equal(arc["lifecycle"], "closed");
});

test("ADR-0335: closing an increment with a SIBLING still open does NOT auto-close", async () => {
  const store = new InMemoryStore();
  const deps = writeDeps(store);
  await arcNew(deps, "two-lane-arc", { title: "Two lane", intent: "i", endState: "e", ...FIRST_INC });
  await arcIncrementNew(deps, "two-lane-arc", { id: "two-lane-arc-inc-02", title: "t2", ...FIRST_INC });
  const close = await arcIncrementClose(deps, "two-lane-arc-inc-01", { pr: "#1" });
  assert.equal(close.ok, true);
  assert.doesNotMatch(close.body, /auto-closed/);

  const arc = (await store.getDoc("two-lane-arc"))?.doc as Record<string, unknown>;
  assert.equal(arc["lifecycle"], "active");
});

test("ADR-0335: parking new forward-looking work AUTO-REOPENS a closed arc", async () => {
  const store = new InMemoryStore();
  const deps = writeDeps(store);
  await arcNew(deps, "reopen-arc", { title: "Reopen me", intent: "i", endState: "e", ...FIRST_INC });
  await arcIncrementClose(deps, "reopen-arc-inc-01", { pr: "#1" });
  assert.equal(((await store.getDoc("reopen-arc"))?.doc as Record<string, unknown>)["lifecycle"], "closed");

  const park = await arcIncrementNew(deps, "reopen-arc", { id: "reopen-arc-inc-02", title: "more work", ...FIRST_INC });
  assert.equal(park.ok, true);
  assert.match(park.body, /arc reopen-arc reopened — open work is back on it/);

  const arc = (await store.getDoc("reopen-arc"))?.doc as Record<string, unknown>;
  assert.equal(arc["lifecycle"], "active");
});

test("ADR-0335: recording a LANDING on a closed arc does NOT reopen it — the row is born closed", async () => {
  // `arc increment add` always mints a CLOSED increment (a past landing), so it is never itself the
  // forward-looking row that would flip an arc back open — the recompute correctly leaves it closed.
  const store = await withClosedArc(await seededStore());
  await arcIncrementAdd(writeDeps(store), "done-arc", { outcome: "a late footnote" });
  const arc = (await store.getDoc("done-arc"))?.doc as Record<string, unknown>;
  assert.equal(arc["lifecycle"], "closed");
});

test("ADR-0335: arc close still FORCES closure even with open increments remaining", async () => {
  // The explicit override stays stronger than the mechanical rule (ADR-0335 decision point 3).
  const store = new InMemoryStore();
  const deps = writeDeps(store);
  await arcNew(deps, "forced-arc", { title: "Forced", intent: "i", endState: "e", ...FIRST_INC });
  const close = await arcClose(deps, "forced-arc", { outcome: "abandoned early, on purpose" });
  assert.equal(close.ok, true);
  const arc = (await store.getDoc("forced-arc"))?.doc as Record<string, unknown>;
  assert.equal(arc["lifecycle"], "closed");
});

// ---------------------------------------------------------------------------
// ADR-0239 D2 — `arc close`: the terminal increment AND the lifecycle flip. Since ADR-0305 D1 that
// is TWO rows rather than one atomic upsert, written increment-FIRST so an interrupted close leaves
// an open arc with a spare increment, never a closed arc with no prose behind it.
// ---------------------------------------------------------------------------

test("arc close records the terminal increment AND flips lifecycle, increment first", async () => {
  const store = await seededStore();
  const res = await arcClose(writeDeps(store), "map-arc", {
    pr: "#1012",
    outcome: "the owner sees pathways on the map — the end state is met",
  });
  assert.equal(res.ok, true);
  assert.match(res.body, /closed arc map-arc — 2026-07-20 {2}#1012 {2}the owner sees pathways/);
  assert.match(res.body, /lifecycle: closed/);

  const doc = (await store.getDoc("map-arc"))?.doc as { lifecycle?: string };
  assert.equal(doc.lifecycle, "closed");

  // The prose that JUSTIFIES the flip landed with it — the invariant ADR-0239 D2 wrote atomicity
  // for, preserved by ORDER now that one transaction cannot span two documents.
  const terminal = (await store.queryDocs({ kind: "increment" })).find((d) => d.id.startsWith("map-arc-inc-"));
  assert.ok(terminal, "the terminal increment is its own row");
  const bag = terminal.doc as Record<string, unknown>;
  assert.equal(bag["status"], "closed");
  assert.deepEqual(bag["outcome"], { date: "2026-07-20", pr: "#1012" });
  assert.equal(bag["body"], "the owner sees pathways on the map — the end state is met");
});

test("arc close defaults the date to today and works without a PR", async () => {
  const store = await seededStore();
  const res = await arcClose(writeDeps(store), "map-arc", { outcome: "delivered, attested by the owner" });
  assert.equal(res.ok, true);
  assert.equal(((await store.getDoc("map-arc"))?.doc as { lifecycle?: string }).lifecycle, "closed");
  const terminal = (await store.queryDocs({ kind: "increment" })).find((d) => d.id.startsWith("map-arc-inc-"));
  const bag = terminal?.doc as Record<string, unknown>;
  const outcome = bag["outcome"] as Record<string, unknown>;
  assert.equal(outcome["date"], "2026-07-20");
  // `arc close` mints its terminal increment THROUGH `arc increment add`, so it inherits ADR-0322:
  // the closing prose is written once, into `body`, never also copied into `outcome.note`.
  assert.equal(outcome["note"], undefined);
  assert.equal(bag["body"], "delivered, attested by the owner");
});

test("arc close REFUSES without --outcome — no closure without the prose that justifies it", async () => {
  const store = await seededStore();
  const res = await arcClose(writeDeps(store), "map-arc", { pr: "#1012" });
  assert.equal(res.ok, false);
  assert.match(res.body, /needs --outcome/);
  assert.match(res.body, /a projection of the prose that supports it/);
  // Nothing was written on either side — the refusal is total.
  assert.equal(((await store.getDoc("map-arc"))?.doc as { lifecycle?: string }).lifecycle, undefined);
  assert.equal((await store.queryDocs({ kind: "increment" })).filter((d) => d.id.startsWith("map-arc-inc-")).length, 0);
});

test("arc close refuses offline, on a missing id, on a wrong kind, and on an already-closed arc", async () => {
  const store = await withClosedArc(await seededStore());
  const offline = await arcClose(writeDeps(store, false, false), "map-arc", { outcome: "x" });
  assert.equal(offline.ok, false);
  assert.match(offline.body, /writes to the shared store/);

  const missing = await arcClose(writeDeps(store), "nope", { outcome: "x" });
  assert.equal(missing.ok, false);
  assert.match(missing.body, /no arc "nope"/);

  const wrongKind = await arcClose(writeDeps(store), "map-arc-plan-1", { outcome: "x" });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a increment, not an arc/);

  const again = await arcClose(writeDeps(store), "done-arc", { outcome: "x" });
  assert.equal(again.ok, false);
  assert.match(again.body, /already closed/);
  // ADR-0335: there is no bare reopen verb — reopening is mechanical, via parking new work.
  assert.match(again.body, /park new forward-looking work/);
});

test("a closed arc leaves the default worklist end-to-end (D2 write → D3 filter)", async () => {
  const store = await seededStore();
  const fx = diskFixture();
  try {
    const before = await arcCommand("list", undefined, depsFor(store, fx));
    assert.match(before.body, /map-arc/);

    await arcClose(writeDeps(store), "map-arc", { outcome: "the end state is met" });

    const after = await arcCommand("list", undefined, depsFor(store, fx));
    assert.doesNotMatch(after.body, /map-arc {2}/, "the closed arc leaves the default list");
    assert.match(after.body, /all 1 arc\(s\) here are closed/);

    const all = await arcCommand("list", undefined, depsFor(store, fx), "all");
    assert.match(all.body, /\[closed\] Map pathways/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc help advertises the three increment verbs and refuses the retired proposal spelling", async () => {
  const help = await arcCommand(undefined, undefined, depsFor(new InMemoryStore(), diskFixture()));
  assert.equal(help.ok, true);
  assert.match(help.body, /arc increment add/);
  assert.match(help.body, /arc increment new/);
  assert.match(help.body, /arc increment close/);
  // The correction path is advertised where a reader looks for a verb that does not exist.
  assert.match(help.body, /storytree library artifact edit <increment-id> --pg/);
});

test("an EMPTY arc list offers the scaffolder, not the hand-authoring path it replaced", async () => {
  const fx = diskFixture();
  try {
    const empty = await arcCommand("list", undefined, depsFor(new InMemoryStore(), fx));
    assert.equal(empty.ok, true);
    assert.match(empty.body, /no arcs in the live store yet/);
    assert.ok(
      (empty.next ?? []).some((n) => n.startsWith("storytree arc new")),
      "the scaffolder is the honest first move, not the hand-authoring path it replaced",
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// PARKING and CLOSING one increment — the successors to `arc proposal add` / `realize`.
// ---------------------------------------------------------------------------

const BODY = { objective: "Fold the arrays into rows.", body: "Touches `packages/library/src/knowledge.ts`." };

test("arc increment new PARKS one validated row, stamping the ceiling's own date (ADR-0298 D3)", async () => {
  const store = await seededStore();
  const res = await arcIncrementNew(writeDeps(store), "map-arc", {
    id: "density-lod",
    title: "Density LOD",
    ...BODY,
    friction: ["map-is-unreadable-zoomed-out"],
  });
  assert.equal(res.ok, true);
  assert.match(res.body, /parked increment density-lod on arc map-arc — Density LOD/);

  const doc = (await store.getDoc("density-lod"))?.doc as Record<string, unknown>;
  assert.equal(doc["kind"], "increment");
  assert.equal(doc["status"], "proposal");
  assert.equal(doc["arcRef"], "asset:map-arc");
  assert.deepEqual(doc["frictionRefs"], ["map-is-unreadable-zoomed-out"]);
  // `parked` is stamped from the composition-root clock and is NEVER caller-supplied: a caller able
  // to backdate it could silence the very recurrences that select the entry (ADR-0298 D3).
  assert.equal(doc["parked"], NOW);
  // The arc itself is untouched — the containment edge lives on the child (ADR-0183 D3).
  assert.equal("proposals" in ((await store.getDoc("map-arc"))?.doc as object), false);

  // THE POINT OF THE FOLD: the entry is addressable and CORRECTABLE with no arc verb at all.
  const correct = (res.next ?? []).find((n) => n.includes("library artifact edit"));
  assert.ok(correct, "the correction path is offered where the old shape had none");
});

test("arc increment new NAMES the gap when no --friction is given (ADR-0095: no silent caps)", async () => {
  const store = await seededStore();
  const res = await arcIncrementNew(writeDeps(store), "map-arc", { id: "quiet", title: "t", ...BODY });
  assert.equal(res.ok, true);
  assert.match(res.body, /the delivery ceiling can never red this entry/);
});

test("arc increment new refuses an id already taken ANYWHERE — an increment id is global", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  const first = await arcIncrementNew(deps, "map-arc", { id: "dup", title: "t", ...BODY });
  assert.equal(first.ok, true);
  const second = await arcIncrementNew(deps, "map-arc", { id: "dup", title: "other", ...BODY });
  assert.equal(second.ok, false);
  assert.match(second.body, /already exists as a increment/);
  // The id is unique across the STORE, not merely within one arc — a collision with any other kind
  // is refused too, since `library artifact <id>` has to resolve to one thing.
  const clash = await arcIncrementNew(deps, "map-arc", { id: "map-arc", title: "t", ...BODY });
  assert.equal(clash.ok, false);
  assert.match(clash.body, /already exists as a arc/);
});

test("arc increment new refuses offline, without its required fields, and on a missing arc", async () => {
  const store = await seededStore();
  const offline = await arcIncrementNew(writeDeps(store, false, false), "map-arc", { id: "x", title: "t", ...BODY });
  assert.equal(offline.ok, false);
  assert.match(offline.body, /writes to the shared store/);

  const thin = await arcIncrementNew(writeDeps(store), "map-arc", { id: "x", title: "t" });
  assert.equal(thin.ok, false);
  assert.match(thin.body, /--objective <text\|@file>, --body <text\|@file>/);
  assert.match(thin.body, /the thin filing this tier exists to prevent/);

  const noId = await arcIncrementNew(writeDeps(store), "map-arc", { title: "t", ...BODY });
  assert.equal(noId.ok, false);
  assert.match(noId.body, /--id <slug>/);

  const noArc = await arcIncrementNew(writeDeps(store), "nope", { id: "x", title: "t", ...BODY });
  assert.equal(noArc.ok, false);
  assert.match(noArc.body, /no arc "nope"/);
});

test("arc increment close marks one TERMINAL — it is closed, never deleted (ADR-0305 D5)", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await arcIncrementNew(deps, "map-arc", { id: "density-lod", title: "Density LOD", ...BODY });

  const res = await arcIncrementClose(deps, "density-lod", { pr: "#1123" });
  assert.equal(res.ok, true);
  assert.match(res.body, /closed increment density-lod on arc map-arc — 2026-07-20 {2}#1123/);

  const doc = (await store.getDoc("density-lod"))?.doc as Record<string, unknown>;
  assert.equal(doc["status"], "closed");
  assert.deepEqual(doc["outcome"], { date: "2026-07-20", pr: "#1123" });
  // The row SURVIVES, so a deferred intention stays traceable to the landing that discharged it.
  assert.equal(doc["parked"], NOW, "the parking stamp is not erased by closure");
  assert.equal(doc["body"], BODY.body, "the body it was parked with is still readable");
});

test("arc increment close REQUIRES a reason when there is no --pr (ADR-0305 D2's collapsed states)", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await arcIncrementNew(deps, "map-arc", { id: "wrong-entry", title: "A duplicate", ...BODY });

  // This is the case `arc proposal realize` could not express: an entry that is not LANDING.
  const bare = await arcIncrementClose(deps, "wrong-entry", {});
  assert.equal(bare.ok, false);
  assert.match(bare.body, /needs --pr <ref> or --note <text\|@file>/);
  assert.match(bare.body, /was a REASON, not a state/);
  assert.equal(((await store.getDoc("wrong-entry"))?.doc as Record<string, unknown>)["status"], "proposal");

  // With a note it closes HONESTLY — not marked as a landing that never happened.
  const withNote = await arcIncrementClose(deps, "wrong-entry", {
    note: "discharged by deletion: the verb it names was removed by ADR-0302 D4.",
  });
  assert.equal(withNote.ok, true);
  const doc = (await store.getDoc("wrong-entry"))?.doc as Record<string, unknown>;
  assert.equal(doc["status"], "closed");
  assert.equal(
    (doc["outcome"] as Record<string, unknown>)["note"],
    "discharged by deletion: the verb it names was removed by ADR-0302 D4.",
  );
  assert.equal((doc["outcome"] as Record<string, unknown>)["pr"], undefined);
});

// ---------------------------------------------------------------------------
// The `tool`-route lifecycle's REVERSE GEAR (parked entry
// `realizing-an-entry-drops-the-friction-edge-cli-write-fidelity`): `friction route --arc` appends
// the `asset:<arc>` citation and nothing ever removed it, so the only way to drop a discharged one
// was hand-editing another adjudicator's row. Closing the entry now does it in the same verb.
// ---------------------------------------------------------------------------

/** A minimal valid friction item carrying an `asset:<arc>` citation on its `references[]`. */
async function seedFriction(
  store: InMemoryStore,
  id: string,
  references: string[],
): Promise<void> {
  await store.upsertDoc({
    id,
    kind: "friction",
    doc: {
      kind: "friction",
      id,
      title: `T ${id}`,
      description: "d",
      statement: "The verb reported success while storing something else.",
      evidence: "Measured 2026-08-03 — the row read back as a path.",
      impact: "A session trusts an exit code it should not.",
      route: "tool",
      routeReason: "Parked on asset:map-arc because the remedy is deferred capability work.",
      references,
      createdAt: "2026-08-03",
      updatedAt: "2026-08-03",
    },
  });
}

/** The `asset:` refs on a stored friction, for asserting what the close did to them. */
async function refsOf(store: InMemoryStore, id: string): Promise<unknown> {
  return ((await store.getDoc(id))?.doc as Record<string, unknown>)["references"];
}

test("arc increment close DROPS the discharged friction's asset:<arc> citation, in the same verb", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await seedFriction(store, "the-friction", ["asset:map-arc", "asset:some-principle"]);
  await arcIncrementNew(deps, "map-arc", {
    id: "the-remedy",
    title: "The remedy",
    ...BODY,
    friction: ["the-friction"],
  });

  const res = await arcIncrementClose(deps, "the-remedy", { pr: "#1200" });
  assert.equal(res.ok, true);
  assert.match(res.body, /dropped the asset:map-arc citation from the-friction/);
  // ONLY the discharged arc's citation goes — an unrelated ref is not collateral.
  assert.deepEqual(await refsOf(store, "the-friction"), ["asset:some-principle"]);
  // The trace survives in the direction that carries the delivery signal: the CLOSED entry keeps its
  // own frictionRefs, and a closed increment is never deleted (ADR-0305 D3).
  const closed = (await store.getDoc("the-remedy"))?.doc as Record<string, unknown>;
  assert.deepEqual(closed["frictionRefs"], ["the-friction"]);
  assert.equal(closed["status"], "closed");
});

test("a citation held up by ANOTHER open entry on the same arc is KEPT, and the holder is named", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await seedFriction(store, "the-friction", ["asset:map-arc"]);
  const both = { ...BODY, friction: ["the-friction"] };
  await arcIncrementNew(deps, "map-arc", { id: "first-half", title: "First half", ...both });
  await arcIncrementNew(deps, "map-arc", { id: "second-half", title: "Second half", ...both });

  const res = await arcIncrementClose(deps, "first-half", { pr: "#1200" });
  assert.equal(res.ok, true);
  assert.match(res.body, /kept the-friction's asset:map-arc citation — entry second-half is still open/);
  assert.deepEqual(await refsOf(store, "the-friction"), ["asset:map-arc"], "the live pointer stands");

  // Closing the LAST holder drops it.
  const last = await arcIncrementClose(deps, "second-half", { pr: "#1201" });
  assert.equal(last.ok, true);
  assert.match(last.body, /dropped the asset:map-arc citation from the-friction/);
  assert.deepEqual(await refsOf(store, "the-friction"), []);
});

test("an open entry on a DIFFERENT arc does not hold the citation up", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await store.upsertDoc({
    id: "other-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "other-arc",
      title: "Other",
      description: "d",
      intent: "i",
      endState: "e",
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
    },
  });
  await seedFriction(store, "the-friction", ["asset:map-arc", "asset:other-arc"]);
  await arcIncrementNew(deps, "other-arc", {
    id: "elsewhere",
    title: "Elsewhere",
    ...BODY,
    friction: ["the-friction"],
  });
  await arcIncrementNew(deps, "map-arc", {
    id: "here",
    title: "Here",
    ...BODY,
    friction: ["the-friction"],
  });

  const res = await arcIncrementClose(deps, "here", { pr: "#1200" });
  assert.equal(res.ok, true);
  // `other-arc`'s open entry holds up ITS OWN citation, not map-arc's.
  assert.deepEqual(await refsOf(store, "the-friction"), ["asset:other-arc"]);
});

test("closing an entry that cites no friction, or whose friction has no citation, says nothing extra", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await arcIncrementNew(deps, "map-arc", { id: "quiet", title: "t", ...BODY });
  const quiet = await arcIncrementClose(deps, "quiet", { pr: "#1" });
  assert.equal(quiet.ok, true);
  assert.doesNotMatch(quiet.body, /citation/);

  await seedFriction(store, "uncited", ["asset:some-principle"]);
  await arcIncrementNew(deps, "map-arc", {
    id: "uncited-remedy",
    title: "t",
    ...BODY,
    friction: ["uncited"],
  });
  const none = await arcIncrementClose(deps, "uncited-remedy", { pr: "#2" });
  assert.equal(none.ok, true);
  assert.doesNotMatch(none.body, /citation/);
  assert.deepEqual(await refsOf(store, "uncited"), ["asset:some-principle"]);
});

test("a REFUSED close strips no citation — the reverse gear runs only after the entry actually closes", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await seedFriction(store, "the-friction", ["asset:map-arc"]);
  await arcIncrementNew(deps, "map-arc", {
    id: "still-parked",
    title: "t",
    ...BODY,
    friction: ["the-friction"],
  });

  // No --pr and no --note: ADR-0305 D2's refusal.
  const refused = await arcIncrementClose(deps, "still-parked", {});
  assert.equal(refused.ok, false);
  assert.deepEqual(await refsOf(store, "the-friction"), ["asset:map-arc"]);
  assert.equal(
    ((await store.getDoc("still-parked"))?.doc as Record<string, unknown>)["status"],
    "proposal",
  );
});

test("arc increment close refuses a missing id, a SECOND closure, a wrong kind, and offline", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await arcIncrementNew(deps, "map-arc", { id: "once", title: "t", ...BODY });
  assert.equal((await arcIncrementClose(deps, "once", { pr: "#1" })).ok, true);

  const again = await arcIncrementClose(deps, "once", { pr: "#2" });
  assert.equal(again.ok, false);
  assert.match(again.body, /already closed/);

  const missing = await arcIncrementClose(deps, "nope", { pr: "#1" });
  assert.equal(missing.ok, false);
  assert.match(missing.body, /no increment "nope"/);

  const wrongKind = await arcIncrementClose(deps, "map-arc", { pr: "#1" });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a arc, not an increment/);

  const offline = await arcIncrementClose(writeDeps(store, false, false), "once", { pr: "#1" });
  assert.equal(offline.ok, false);
  assert.match(offline.body, /writes to the shared store/);
});

test("arc show puts FORWARD-LOOKING work first, in its own section, never inside the increment log", async () => {
  const store = await seededStore();
  const deps = writeDeps(store);
  await arcIncrementAdd(deps, "map-arc", { outcome: "a landing", pr: "#900", date: "2026-07-19" });
  await arcIncrementNew(deps, "map-arc", {
    id: "density-lod",
    title: "Density LOD",
    ...BODY,
    friction: ["map-is-unreadable-zoomed-out"],
  });

  const fx = diskFixture();
  try {
    const shown = await arcCommand("show", "map-arc", depsFor(store, fx));
    const work = shown.body.indexOf("## Work");
    const log = shown.body.indexOf("## Increment log");
    assert.ok(work > 0 && log > 0, "both sections render");
    // THE ORDERING REQUIREMENT: forward-looking work is reachable FIRST. The old render emitted the
    // log before the parked block, which on a busy arc pushed unbuilt intentions past a truncation
    // boundary and made a session report that entries it was sent to read did not exist.
    assert.ok(work < log, "forward-looking work precedes the landing log");
    // ...and STAYS SEPARATE (ADR-0305 D7 / ADR-0298 D4): never interleaved, or a reader takes an
    // unbuilt intention for something that happened.
    assert.match(shown.body, /## Work {2}\(1 proposal · 1 ready · 0 active\)/);
    assert.match(shown.body, /## Increment log {2}\(1 closed\)/);
    assert.ok(shown.body.indexOf("density-lod") < log, "the parked row sits in Work, not in the log");
    assert.match(shown.body, /from friction: map-is-unreadable-zoomed-out/);
    // Each row offers the NARROW view — the discharge for "arc show is the only view there is".
    assert.match(shown.body, /read\/edit it: {2}storytree library artifact density-lod/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("arc show says so plainly when an arc has nothing at all", async () => {
  const store = await withClosedArc(await seededStore());
  const fx = diskFixture();
  try {
    //  carries no increments of any kind — both halves must say so rather than render
    // an empty heading a reader could mistake for a truncation.
    const shown = await arcCommand("show", "done-arc", depsFor(store, fx));
    assert.match(shown.body, /## Work {2}\(0 proposal · 0 ready · 0 active\)/);
    assert.match(shown.body, /nothing open — every increment on this arc is closed/);
    assert.match(shown.body, /## Increment log {2}\(0 closed\)/);
    assert.match(shown.body, /\(no landings yet\)/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ADR-0306 D1/D2/D4 — `--cites` on the write verbs, and the arc show render.
// ---------------------------------------------------------------------------

test("arc increment new stores --cites, splitting on commas and collapsing duplicates", async () => {
  const store = await seededStore();
  const res = await arcIncrementNew(writeDeps(store), "map-arc", {
    id: "typed-refs",
    title: "Typed refs",
    ...BODY,
    cites: ["story:map-story,capability:a-cap", " asset:merge-ceremony ", "story:map-story"],
  });
  assert.equal(res.ok, true);
  const doc = (await store.getDoc("typed-refs"))?.doc as Record<string, unknown>;
  assert.deepEqual(doc["cites"], ["story:map-story", "capability:a-cap", "asset:merge-ceremony"]);
});

test("arc increment new OMITS cites entirely when none is given (optional, legitimately empty)", async () => {
  // ADR-0308 D2: greenfield / planning / ADR work names no capability. An absent field says "none
  // named"; an empty array would invite a reader to wonder whether something was removed.
  const store = await seededStore();
  await arcIncrementNew(writeDeps(store), "map-arc", { id: "no-cites", title: "t", ...BODY });
  const doc = (await store.getDoc("no-cites"))?.doc as Record<string, unknown>;
  assert.equal("cites" in doc, false);
});

test("A CITE THAT RESOLVES TO NOTHING IS ACCEPTED — the write boundary never refuses one", async () => {
  // The clause ADR-0306 D1 turns on. The work hierarchy is disk-canonical and branch-dependent, so
  // refusing here would make an increment unwritable on precisely the branch that creates the story
  // it plans. `story:not-a-real-story` exists in no checkout, and the write still lands.
  const store = await seededStore();
  const res = await arcIncrementNew(writeDeps(store), "map-arc", {
    id: "cites-the-future",
    title: "t",
    ...BODY,
    cites: ["story:not-a-real-story"],
  });
  assert.equal(res.ok, true, res.body);
  const doc = (await store.getDoc("cites-the-future"))?.doc as Record<string, unknown>;
  assert.deepEqual(doc["cites"], ["story:not-a-real-story"]);
});

test("a malformed SCHEME is refused by name, and the refusal says resolution is not the reason", async () => {
  // The one thing checked at the boundary is the token SHAPE — a scheme this corpus has no resolver
  // for on ANY branch, which is a different fault from a ref that merely does not resolve here.
  const store = await seededStore();
  const res = await arcIncrementNew(writeDeps(store), "map-arc", {
    id: "bad-scheme",
    title: "t",
    ...BODY,
    cites: ["map-story", "doc:decisions/0306-x.md"],
  });
  assert.equal(res.ok, false);
  assert.match(res.body, /not a citation pointer: map-story, doc:decisions\/0306-x\.md/);
  assert.match(res.body, /does not RESOLVE is fine/);
  assert.equal(await store.getDoc("bad-scheme"), null, "nothing is written on a refusal");
});

test("arc increment add carries --cites onto a LANDING too", async () => {
  // A closed increment is permanent (ADR-0305 D3), so its citations are what make "which increments
  // touched this capability" answerable over an arc's history and not only over its open work.
  const store = await seededStore();
  const res = await arcIncrementAdd(writeDeps(store), "map-arc", {
    outcome: "the edge landed",
    pr: "#1224",
    id: "a-landing",
    cites: ["capability:library-cli"],
  });
  assert.equal(res.ok, true, res.body);
  const doc = (await store.getDoc("a-landing"))?.doc as Record<string, unknown>;
  assert.equal(doc["status"], "closed");
  assert.deepEqual(doc["cites"], ["capability:library-cli"]);
});

test("arc show prints an increment's cites and FLAGS the ones this checkout lacks", async () => {
  const fx = diskFixture();
  try {
    const store = await seededStore();
    await arcIncrementNew(writeDeps(store), "map-arc", {
      id: "cited-work",
      title: "Cited work",
      ...BODY,
      cites: ["story:map-story", "story:elsewhere"],
    });
    const res = await arcCommand("show", "map-arc", depsFor(store, fx));
    assert.equal(res.ok, true);
    assert.match(res.body, /cites: story:map-story, story:elsewhere/);
    assert.match(res.body, /⚠ not in this checkout: story:elsewhere \(no such story in this checkout\)/);
    assert.match(
      res.body,
      /branch-dependent/,
      "the flag must say the miss is LEGAL, or a reader reads a report as a defect",
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});

test("D4: arc show renders the stamped and cited story paths as two LABELLED lists", async () => {
  // A reader who cannot tell a store-resident edge from a scan of the local working tree cannot tell
  // whether a story's absence means anything (ADR-0306 D4). `map-story` is BOTH stamped and cited
  // here, so a merged render would show it once and lose which path it arrived by.
  const fx = diskFixture();
  try {
    const store = await seededStore();
    await arcIncrementNew(writeDeps(store), "map-arc", {
      id: "cited-work",
      title: "Cited work",
      ...BODY,
      cites: ["story:map-story", "story:elsewhere"],
    });
    const res = await arcCommand("show", "map-arc", depsFor(store, fx));
    const stories = res.body.slice(res.body.indexOf("## Stories"));
    assert.match(stories, /TWO paths, ADR-0306 D4 — not merged/);
    assert.match(stories, /stamped by this arc.*DISK SCAN of this checkout/s);
    assert.match(stories, /cited by an increment.*STORE-resident/s);
    assert.match(stories, /- elsewhere {2}⚠ not in this checkout {3}\(cited by: cited-work\)/);
    assert.match(stories, /- map-story {3}\(cited by: cited-work\)/);
    // The stamped list is untouched by citations: `elsewhere` is cited and NOT stamped, so it must
    // appear only under the cited heading.
    const stamped = stories.slice(0, stories.indexOf("cited by an increment"));
    assert.doesNotMatch(stamped, /elsewhere/);
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
});
