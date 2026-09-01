/**
 * `library repoint` — the plan, the two substrates, and the confirmation that binds to a read plan.
 *
 * The command is exercised through {@link libraryRepoint} with INJECTED seams rather than through
 * `run()`, so the story half is a fixture rather than this checkout's real `stories/` tree: a test
 * that read the live corpus would change its answer every time somebody edited a story, and the
 * golden renders below could not exist at all.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { Store, StoredDoc } from "@storytree/storage-protocol";

import { readStoryDecisionFiles } from "./adr-health.js";
import { run } from "./commands.js";
import {
  adrNumberOf,
  applyStoreEdit,
  libraryRepoint,
  planRepoint,
  repointDecisions,
  type RepointDeps,
  type StoryDecisionsFile,
} from "./repoint.js";

/**
 * SCHEMA-VALID fixtures, not stubs — a confirmed repoint writes through `upcastAndValidate`, so a
 * doc that would not validate could never prove the write half. Cheap stubs did exactly that here:
 * the plan looked right and every confirmed-run assertion failed at the write.
 */
const STAMP = {
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  schemaVersion: 9,
} as const;

function stored(id: string, kind: string, body: Record<string, unknown>): StoredDoc {
  return { id, kind, doc: { id, kind, title: `T ${id}`, description: `D ${id}`, ...STAMP, ...body }, updatedAt: STAMP.updatedAt } as StoredDoc;
}

function adrDoc(id: string, number: number, extra: Record<string, unknown> = {}): StoredDoc {
  return stored(id, "adr", {
    body: "b",
    number,
    status: "accepted",
    decided: "2026-01-01",
    supersedes: [],
    dependsOn: [],
    ...extra,
  });
}

function incDoc(id: string, extra: Record<string, unknown> = {}): StoredDoc {
  return stored(id, "increment", {
    body: "b",
    status: "proposal",
    parked: "2026-01-01T00:00:00.000Z",
    objective: "o",
    arcRef: "asset:some-arc",
    ...extra,
  });
}

function principleDoc(id: string, extra: Record<string, unknown> = {}): StoredDoc {
  return stored(id, "principle", { statement: "s", provenance: "p", why: "w", howToApply: "h", ...extra });
}

function frictionDoc(id: string, extra: Record<string, unknown> = {}): StoredDoc {
  return stored(id, "friction", { statement: "s", evidence: "e", impact: "i", ...extra });
}

/**
 * A store that answers the PLAN normally and then reports one id as gone — the concurrency shape the
 * apply loop's existence check is for, and the only way a single-threaded test can reach it.
 *
 * Written out method by method rather than spread, `Object.create`d or proxied. Each of those is
 * wrong in its own way here: a spread copies own properties while a class keeps its methods on the
 * prototype; `Object.create` keeps the methods but rebinds `this`, so the class's private fields are
 * unreachable from them (it surfaces as `Cannot access invalid private field`, which looks nothing
 * like a fixture problem); and a proxy needs the untyped dynamic property reads this repo's lint
 * rules refuse. Nine delegating lines are typed, obvious, and stop compiling if the seam grows.
 */
function storeThatLosesOneDocAfterPlanning(inner: InMemoryStore, lostId: string): Store {
  let planned = false;
  return {
    upsertDoc: (input) => inner.upsertDoc(input),
    patchDoc: (input) => inner.patchDoc(input),
    getDoc: (id) => (planned && id === lostId ? Promise.resolve(null) : inner.getDoc(id)),
    queryDocs: (filter) => {
      planned = true;
      return inner.queryDocs(filter);
    },
    deleteDoc: (id, opts) => inner.deleteDoc(id, opts),
    appendEvent: (e) => inner.appendEvent(e),
    readEvents: (filter) => inner.readEvents(filter),
  };
}

const lines = (...l: readonly string[]): string => l.join("\n");

function storyFile(name: string, decisions: readonly number[]): StoryDecisionsFile {
  return {
    file: `stories/${name}/story.md`,
    storyId: name,
    decisions,
    raw: lines(
      "---",
      `id: "${name}"`,
      "tier: story",
      "status: proposed",
      `decisions: [${decisions.join(", ")}]`,
      "---",
      "",
      "# body text that must survive byte for byte",
      "",
    ),
  };
}

// --- the pure frontmatter rewrite ----------------------------------------------------------------

test("repointDecisions moves the number and byte-preserves everything else", () => {
  const raw = storyFile("agent", [4, 28, 75]).raw;
  const out = repointDecisions(raw, 28, 500);
  assert.equal(out.ok, true);
  assert.ok(out.ok && out.changed);
  assert.ok(out.ok && out.content.includes("decisions: [4, 500, 75]"));
  // Everything either side of the one line is untouched.
  assert.equal(out.ok && out.content.replace("[4, 500, 75]", "[4, 28, 75]"), raw);
});

test("repointDecisions never matches a number that merely CONTAINS the one being moved", () => {
  // The trap a substring replace walks into: repointing 28 must not touch 280, 128 or 2800.
  const raw = storyFile("agent", [128, 280, 2800]).raw;
  const out = repointDecisions(raw, 28, 500);
  assert.equal(out.ok, true);
  assert.equal(out.ok && out.changed, false, "28 is not in this list at all");
  assert.equal(out.ok && out.content, raw);
});

test("repointDecisions collapses rather than duplicating when the target is already listed", () => {
  const out = repointDecisions(storyFile("agent", [4, 28, 500]).raw, 28, 500);
  assert.ok(out.ok && out.content.includes("decisions: [4, 500]"), "not [4, 500, 500]");
});

test("repointDecisions is fail-closed on a file it cannot read confidently", () => {
  assert.deepEqual(repointDecisions("no frontmatter here", 1, 2), {
    ok: false,
    reason: "no frontmatter block (missing leading '---')",
  });
  assert.deepEqual(repointDecisions("---\nid: x\n", 1, 2), {
    ok: false,
    reason: "unterminated frontmatter block (no closing '---')",
  });
  assert.deepEqual(repointDecisions("---\nid: x\n---\n", 1, 2), {
    ok: false,
    reason: "no inline `decisions:` list in the frontmatter",
  });
});

test("adrNumberOf reads the number out of a decision id, and only a decision id", () => {
  assert.equal(adrNumberOf("adr-0028"), 28);
  assert.equal(adrNumberOf("adr-0500"), 500);
  assert.equal(adrNumberOf("merge-ceremony"), null);
  assert.equal(adrNumberOf("adr-28"), null, "the id shape is four digits");
  // ANCHORED at both ends. Unanchored, an id that merely CONTAINS a decision id would be read as
  // one — and this number is what gets written into stories, so a false positive edits a file.
  assert.equal(adrNumberOf("not-adr-0028"), null, "anchored at the start");
  assert.equal(adrNumberOf("adr-0028-draft"), null, "and at the end");
  assert.equal(adrNumberOf("adr-00281"), null, "which is what stops a five-digit id reading as four");
});

// --- the plan ------------------------------------------------------------------------------------

/**
 * The three field shapes ADR-0498's increment names, plus the two things that must NOT move: a
 * prose mention, and a site in a field the schema no longer has.
 */
const DOCS: StoredDoc[] = [
  adrDoc("adr-0028", 28),
  adrDoc("adr-0500", 500),
  adrDoc("a-decision", 1, { dependsOn: ["asset:adr-0028"] }),
  incDoc("an-increment", { arcRef: "asset:adr-0028" }),
  // schemaVersion 8, NOT 9, and that is the whole point: `upcast` is a no-op at the current
  // version, so a row stamped current could not be carrying residue in the first place. A row still
  // holding `references` is by definition one migration 9 never reached. Stamping it 9 made the
  // fixture a state the store cannot contain, and five tests failed on it.
  adrDoc("residue", 2, { references: ["asset:adr-0028"], schemaVersion: 8 }),
  frictionDoc("just-talks", { routeReason: "parked because asset:adr-0028 says so" }),
];

const STORIES: StoryDecisionsFile[] = [
  storyFile("agent", [4, 28, 75]),
  storyFile("cli", [11, 30]),
  storyFile("studio", [28]),
];

test("the plan names every movable site across every field shape, in both substrates", () => {
  const plan = planRepoint({ from: "adr-0028", to: "adr-0500", docs: DOCS, stories: STORIES });
  assert.deepEqual(
    plan.storeEdits.map((e) => `${e.id} ${e.path}`),
    ["a-decision dependsOn[0]", "an-increment arcRef"],
  );
  assert.deepEqual(
    plan.fileEdits.map((e) => `${e.file} ${e.after}`),
    ["stories/agent/story.md decisions: [4, 500, 75]", "stories/studio/story.md decisions: [500]"],
  );
});

test("a PROSE mention is in neither substrate's plan (ADR-0477)", () => {
  const plan = planRepoint({ from: "adr-0028", to: "adr-0500", docs: DOCS, stories: STORIES });
  assert.ok(
    !plan.storeEdits.some((e) => e.id === "just-talks") && !plan.blocked.some((b) => b.id === "just-talks"),
    "a name in a paragraph is not an edge, so it is not an edit and not a blocker either",
  );
});

test("a RETIRED field's residue is reported as unmovable, never as an edit", () => {
  // Measured 2026-09-01: the edge blocking adr-0028's retire sits in a `references` array, and any
  // validated write DROPS that field. Reporting it as "would repoint" would be a lie about the write.
  const plan = planRepoint({ from: "adr-0028", to: "adr-0500", docs: DOCS, stories: STORIES });
  assert.deepEqual(
    plan.blocked.map((b) => `${b.id} ${b.path}`),
    ["residue references[0]"],
  );
  assert.ok(!plan.storeEdits.some((e) => e.id === "residue"), "and it is NOT queued as an edit");
  assert.match(plan.blocked[0]?.reason ?? "", /evaporates/);
});

test("the story arm needs BOTH ends to be decisions — each half alone is not enough", () => {
  // A story's `decisions:` holds NUMBERS, so a move is only expressible there when both ends have
  // one. Either half alone leaves the arm inert, and only a fixture per half can tell the two
  // conjuncts apart.
  const docs = [adrDoc("adr-0028", 28), adrDoc("adr-0500", 500), principleDoc("a-rule")];
  const adrToRule = planRepoint({ from: "adr-0028", to: "a-rule", docs, stories: STORIES });
  assert.deepEqual(adrToRule.fileEdits, [], "a decision moved onto a principle touches no story");
  const ruleToAdr = planRepoint({ from: "a-rule", to: "adr-0500", docs, stories: STORIES });
  assert.deepEqual(ruleToAdr.fileEdits, [], "and neither does the mirror");
  const adrToAdr = planRepoint({ from: "adr-0028", to: "adr-0500", docs, stories: STORIES });
  assert.equal(adrToAdr.fileEdits.length, 2, "only decision-to-decision reaches the story tier");
});

test("both listings are ordered by id FIRST and by field path only within one id", () => {
  // `id || path` has two arms. Ordering by path alone would put `a-later` first; ordering by id
  // alone would leave the two sites on `z-twice` in whatever order the walk emitted them.
  const docs = [
    adrDoc("adr-0028", 28),
    adrDoc("adr-0500", 500),
    adrDoc("z-twice", 1, { dependsOn: ["asset:adr-0028", "asset:adr-0028"] }),
    incDoc("a-later", { arcRef: "asset:adr-0028" }),
    adrDoc("z-residue", 2, { references: ["asset:adr-0028", "asset:adr-0028"], schemaVersion: 8 }),
    adrDoc("a-residue", 3, { references: ["asset:adr-0028"], schemaVersion: 8 }),
  ];
  const plan = planRepoint({ from: "adr-0028", to: "adr-0500", docs, stories: [] });
  assert.deepEqual(
    plan.storeEdits.map((e) => `${e.id} ${e.path}`),
    ["a-later arcRef", "z-twice dependsOn[0]", "z-twice dependsOn[1]"],
  );
  assert.deepEqual(
    plan.blocked.map((b) => `${b.id} ${b.path}`),
    ["a-residue references[0]", "z-residue references[0]", "z-residue references[1]"],
  );
});

test("the story arm is inert unless BOTH ends are decisions — stories hold numbers, not refs", () => {
  const docs = [principleDoc("a-principle"), principleDoc("another"), adrDoc("cites", 3, { dependsOn: ["asset:a-principle"] })];
  const plan = planRepoint({ from: "a-principle", to: "another", docs, stories: STORIES });
  assert.equal(plan.storeEdits.length, 1);
  assert.deepEqual(plan.fileEdits, []);
});

test("the digest changes when the edit set changes, and not when only a blocker does", () => {
  const base = planRepoint({ from: "adr-0028", to: "adr-0500", docs: DOCS, stories: STORIES });
  // A NEW movable edge -> a different plan -> a different token.
  const more = planRepoint({
    from: "adr-0028",
    to: "adr-0500",
    docs: [...DOCS, adrDoc("late", 4, { dependsOn: ["asset:adr-0028"] })],
    stories: STORIES,
  });
  assert.notEqual(base.digest, more.digest);
  // A new BLOCKED site changes what will NOT happen, so a confirmation for identical edits stands.
  const blockedToo = planRepoint({
    from: "adr-0028",
    to: "adr-0500",
    docs: [...DOCS, adrDoc("more-residue", 5, { references: ["asset:adr-0028"], schemaVersion: 8 })],
    stories: STORIES,
  });
  assert.equal(base.digest, blockedToo.digest);
  assert.equal(blockedToo.blocked.length, 2);
});

// --- the verb ------------------------------------------------------------------------------------

async function deps(over: Partial<RepointDeps> = {}): Promise<RepointDeps & { written: Map<string, string> }> {
  const store = new InMemoryStore();
  for (const d of DOCS) await store.upsertDoc({ id: d.id, kind: d.kind, doc: d.doc });
  const written = new Map<string, string>();
  return {
    store,
    writable: true,
    actor: "tester@example.com",
    readStories: () => STORIES,
    writeStory: (file, content) => void written.set(file, content),
    written,
    ...over,
  };
}

test("the DRY RUN writes nothing — not one store row, not one file", async () => {
  const d = await deps();
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  assert.equal(env.ok, true);
  assert.equal(d.written.size, 0, "no file touched");
  const after = await d.store.getDoc("a-decision");
  assert.deepEqual((after?.doc as { dependsOn?: string[] }).dependsOn, ["asset:adr-0028"], "row unchanged");
  assert.match(env.body, /NOTHING HAS BEEN WRITTEN/);
});

test("GOLDEN: the dry run's whole plan, both substrates named and the blocker explained", async () => {
  const d = await deps();
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(env.body)?.[1];
  assert.ok(digest, "the dry run prints a confirmation token");
  assert.equal(
    env.body,
    lines(
      "repoint  adr-0028  →  adr-0500",
      "",
      "LIVE STORE — 2 edit(s), applied the moment you confirm",
      "------------------------------------------------------",
      "  a-decision  [adr]",
      "      dependsOn[0]:  asset:adr-0028  →  asset:adr-0500",
      "  an-increment  [increment]",
      "      arcRef:  asset:adr-0028  →  asset:adr-0500",
      "",
      "WORKING TREE — 2 file(s), still have to pass the gate and a PR",
      "--------------------------------------------------------------",
      "  stories/agent/story.md",
      "      before:  decisions: [4, 28, 75]",
      "      after:   decisions: [4, 500, 75]",
      "  stories/studio/story.md",
      "      before:  decisions: [28]",
      "      after:   decisions: [500]",
      "",
      "CANNOT BE REPOINTED — 1 site(s), reported and left alone",
      "--------------------------------------------------------",
      "  residue  references[0]",
      "      `references` is not in the current schema, so the migrate-on-write upcast DROPS it at the next validated write. The site does not move, it evaporates — and every other entry in that field goes with it. Nothing here can repoint it.",
      "",
      "NOTHING HAS BEEN WRITTEN — this is a dry run. To apply exactly the plan above:",
      "",
      `  storytree library repoint adr-0028 --to adr-0500 --confirm ${digest} --pg`,
      "",
      "The token names THIS edit set. If the corpus moves before you confirm — a sibling session's",
      "write, an edited story — it changes, and the confirmation is refused rather than applying a",
      "plan nobody read.",
    ),
  );
});

test("a CONFIRMED run moves exactly the planned sites and nothing else", async () => {
  const d = await deps();
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  assert.equal(env.ok, true, env.body);

  // moved
  assert.deepEqual(
    ((await d.store.getDoc("a-decision"))?.doc as { dependsOn?: string[] }).dependsOn,
    ["asset:adr-0500"],
  );
  assert.equal(((await d.store.getDoc("an-increment"))?.doc as { arcRef?: string }).arcRef, "asset:adr-0500");
  assert.deepEqual([...d.written.keys()], ["stories/agent/story.md", "stories/studio/story.md"]);
  assert.ok(d.written.get("stories/agent/story.md")?.includes("decisions: [4, 500, 75]"));

  // NOT moved: the prose mention is byte-identical, and the story nothing named is untouched.
  assert.match(
    ((await d.store.getDoc("just-talks"))?.doc as { routeReason?: string }).routeReason ?? "",
    /asset:adr-0028 says so/,
    "a sentence is not an edge — rewriting it would silently edit somebody's argument",
  );
  assert.ok(!d.written.has("stories/cli/story.md"));
});

test("a STALE token is refused, and nothing is written", async () => {
  // The guarantee the token exists for: a confirmation can only land the plan it was printed for.
  const d = await deps();
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1] ?? "";
  // A sibling adds an edge between the dry run and the confirm.
  await d.store.upsertDoc({ id: "late", kind: "adr", doc: { id: "late", kind: "adr", title: "T late", schemaVersion: 9, dependsOn: ["asset:adr-0028"] } });
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  assert.equal(env.ok, false);
  assert.match(env.body, /REFUSED — the plan moved/);
  assert.equal(d.written.size, 0);
  assert.deepEqual(((await d.store.getDoc("a-decision"))?.doc as { dependsOn?: string[] }).dependsOn, ["asset:adr-0028"]);
});

test("a confirmation without --pg is refused before anything is written", async () => {
  const d = await deps({ writable: false });
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  assert.equal(env.ok, false);
  assert.match(env.body, /run with --pg/);
  assert.equal(d.written.size, 0);
});

test("repointing onto an id nothing resolves is REFUSED, not planned", async () => {
  // The one damage a reader of the plan would not catch: the rendering is identical either way,
  // and confirming would replace every live edge with a dangling one in a single operation.
  const d = await deps();
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-9999" });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "adr-9999" to repoint onto/);
  assert.doesNotMatch(env.body, /LIVE STORE/, "it never even renders a plan");
});

test("a missing source, and a no-op onto itself, are guidance rather than a throw", async () => {
  const d = await deps();
  const ghost = await libraryRepoint(d, "ghost", { to: "adr-0500" });
  assert.equal(ghost.ok, false);
  assert.match(ghost.body, /no artifact "ghost" in the corpus/);
  const same = await libraryRepoint(d, "adr-0028", { to: "adr-0028" });
  assert.equal(same.ok, false);
  assert.match(same.body, /the same artifact — nothing to move/);
});

test("an artifact nothing movable points at says so, and still lists what blocks it", async () => {
  const d = await deps();
  const env = await libraryRepoint(d, "adr-0500", { to: "adr-0028" });
  assert.equal(env.ok, true);
  assert.match(env.body, /nothing references adr-0500 that this verb can move/);
});

test("with no id, or no --to, the verb prints its help rather than guessing", async () => {
  const d = await deps();
  assert.match((await libraryRepoint(d, undefined, {})).body, /storytree library repoint <from> --to <to>/);
  assert.match((await libraryRepoint(d, "adr-0028", {})).body, /storytree library repoint <from> --to <to>/);
});

// --- the disk reader's WIDTH ---------------------------------------------------------------------

test("readStoryDecisionFiles reads EVERY unit that names decisions, not only story.md", () => {
  // The defect this fences, caught by measuring rather than by reading the code: `decisions:` is
  // authored on CAPABILITY and CONTRACT units too. Against this checkout, 20 units name ADR-0004 —
  // 13 `story.md` and 7 others — which is the "20 stories" ADR-0497 cites as a repoint's scale. A
  // reader limited to story.md would move 13 of them and report a complete job.
  const dir = mkdtempSync(path.join(os.tmpdir(), "repoint-stories-"));
  try {
    const write = (rel: string, front: readonly string[]): void => {
      mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), lines("---", ...front, "---", "", "# body", ""));
    };
    const story = (id: string, decisions: readonly number[]): readonly string[] => [
      `id: "${id}"`,
      "tier: story",
      `title: "T ${id}"`,
      `outcome: "O ${id}"`,
      "status: proposed",
      "proof_mode: UAT",
      "capabilities: []",
      `decisions: [${decisions.join(", ")}]`,
    ];
    write("a-story/story.md", story("a-story", [4, 11]));
    write("a-story/a-capability.md", [
      'id: "a-capability"',
      "tier: capability",
      "story: a-story",
      'title: "T a-capability"',
      'outcome: "O a-capability"',
      "status: proposed",
      "proof_mode: integration-test",
      "depends_on: []",
      "decisions: [4]",
    ]);
    write("b-story/story.md", story("b-story", [99]));
    // A unit that names NO decisions is not a candidate at all — it is skipped rather than carried
    // as an entry with an empty list, which every later step would have to special-case.
    write("z-story/story.md", story("z-story", []));
    writeFileSync(path.join(dir, "README.md"), "not a unit spec at all\n");
    // A NON-markdown file that WOULD parse as a unit if the filter let it through. A `.txt` full of
    // junk proves nothing — it would be skipped by the parse anyway, so the filter could be deleted
    // and the test would stay green.
    writeFileSync(path.join(dir, "a-story", "story.txt"), lines("---", ...story("a-txt-unit", [4]), "---", "", "# b", ""));

    const read = readStoryDecisionFiles(dir);
    assert.deepEqual(
      read.map((r) => r.file),
      ["stories/a-story/a-capability.md", "stories/a-story/story.md", "stories/b-story/story.md"],
      "sorted by path; the capability is read; the README, the .txt and the decision-free unit are not",
    );
    assert.equal(typeof read[0]?.raw, "string", "the bytes come back as TEXT, not a Buffer");
    assert.ok(read[0]?.raw.includes("decisions: [4]"), "and it carries the raw bytes the rewrite needs");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the dispatch arm ----------------------------------------------------------------------------

test("the dispatch routes `library repoint` and carries --to / --confirm through", async () => {
  // Through `run()`, so the flag wiring is proved rather than assumed. Both ends are NON-decisions,
  // so the story arm is inert and this touches no `stories/` file on disk.
  const store = new InMemoryStore();
  for (const d of [principleDoc("old-rule"), principleDoc("new-rule"), adrDoc("stands-on-it", 6, { dependsOn: ["asset:old-rule"] })]) {
    await store.upsertDoc({ id: d.id, kind: d.kind, doc: d.doc });
  }
  const dry = await run(["library", "repoint", "old-rule", "--to", "new-rule"], { store });
  assert.equal(dry.ok, true);
  assert.match(dry.body, /stands-on-it/);
  assert.match(dry.body, /dependsOn\[0\]:  asset:old-rule  →  asset:new-rule/);

  const stale = await run(["library", "repoint", "old-rule", "--to", "new-rule", "--confirm", "deadbeef"], { store, writable: true });
  assert.equal(stale.ok, false);
  assert.match(stale.body, /REFUSED — the plan moved/);
});

test("the dispatch prints the help for a bare `library repoint`", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "p1", kind: "principle", doc: { id: "p1", kind: "principle" } });
  const env = await run(["library", "repoint"], { store });
  assert.match(env.body, /IT IS A DRY RUN BY DEFAULT/);
});

test("the dispatch reads and WRITES real story files, under whichever repo root it is pointed at", async () => {
  // The only test that exercises the two fs seams the dispatch supplies. `STORYTREE_REPO_ROOT` is
  // the supported way to point the CLI at another checkout (ADR-0246), so the whole path — find the
  // units under <root>/stories, rewrite one, write it back at <root>/<repo-relative> — runs for
  // real against a temp tree rather than this repo's own.
  const root = mkdtempSync(path.join(os.tmpdir(), "repoint-root-"));
  const prev = process.env["STORYTREE_REPO_ROOT"];
  try {
    mkdirSync(path.join(root, "stories", "a-story"), { recursive: true });
    const storyPath = path.join(root, "stories", "a-story", "story.md");
    writeFileSync(
      storyPath,
      lines(
        "---",
        'id: "a-story"',
        "tier: story",
        'title: "T a-story"',
        'outcome: "O a-story"',
        "status: proposed",
        "proof_mode: UAT",
        "capabilities: []",
        "decisions: [28, 75]",
        "---",
        "",
        "# body",
        "",
      ),
    );
    process.env["STORYTREE_REPO_ROOT"] = root;

    const store = new InMemoryStore();
    for (const x of [adrDoc("adr-0028", 28), adrDoc("adr-0500", 500)]) {
      await store.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
    }

    const dry = await run(["library", "repoint", "adr-0028", "--to", "adr-0500"], { store });
    assert.match(dry.body, /stories\/a-story\/story\.md/, "the units under THIS root were read");
    assert.match(dry.body, /after: {3}decisions: \[500, 75\]/);
    assert.equal(readFileSync(storyPath, "utf8").includes("decisions: [28, 75]"), true, "and nothing written yet");

    const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
    const done = await run(["library", "repoint", "adr-0028", "--to", "adr-0500", "--confirm", digest ?? ""], {
      store,
      writable: true,
    });
    assert.equal(done.ok, true, done.body);
    assert.match(readFileSync(storyPath, "utf8"), /decisions: \[500, 75\]/, "the file on disk moved");
    assert.match(readFileSync(storyPath, "utf8"), /# body/, "and the rest of it survived");

    // `--help` WITH arguments is still help, never a plan.
    const helped = await run(["library", "repoint", "adr-0028", "--to", "adr-0500", "--help"], { store });
    assert.match(helped.body, /IT IS A DRY RUN BY DEFAULT/);
    // NOT `/LIVE STORE/` — the help names both substrates, so that probe passes on the help and
    // proves nothing. The same vacuous shape bit this branch once already. Match a line only a PLAN
    // can carry.
    assert.doesNotMatch(helped.body, /edit\(s\), applied the moment you confirm/);

    // And the arm is `repoint` ALONE. `inbound` is dispatched BEFORE it, so it proves nothing about
    // this arm's condition — `tree`, which is dispatched AFTER, is the one that does.
    const inbound = await run(["library", "inbound", "adr-0500"], { store });
    assert.match(inbound.body, /nothing references adr-0500/);
    // `tree` would prove nothing either — it is dispatched EARLIER, so it returns before this arm
    // is reached. Only a verb dispatched AFTER it can show that the condition still narrows.
    const artifact = await run(["library", "artifact", "adr-0500"], { store });
    assert.match(artifact.body, /id: adr-0500/, "a LATER library verb is not swallowed by this arm");
  } finally {
    if (prev === undefined) delete process.env["STORYTREE_REPO_ROOT"];
    else process.env["STORYTREE_REPO_ROOT"] = prev;
    rmSync(root, { recursive: true, force: true });
  }
});

test("the library dashboard advertises repoint", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({ id: "p1", kind: "principle", doc: { id: "p1", kind: "principle" } });
  const env = await run(["library", "--help"], { store });
  assert.match(
    env.body,
    /storytree library repoint <from> --to <to> move every inbound reference to a successor \(dry run by default\)/,
  );
});

// --- the arms nothing above reaches --------------------------------------------------------------
//
// A plan render has an empty branch per section and an apply loop has a failure branch, and the
// happy-path fixtures above exercise none of them. Left alone they are code that could be deleted
// with every test still green — so each gets the one fixture that discriminates it.

test("applyStoreEdit rewrites the listed paths and NOTHING else, at any depth", () => {
  const body = {
    dependsOn: ["asset:a", "asset:a"],
    stepRefs: [{ step: "s", refs: ["asset:a"] }],
    prose: "a sentence naming asset:a in passing",
    count: 7,
    nothing: null,
  };
  // An ALLOWED path whose value is not the ref must still be left alone: the two conditions ask
  // different questions, and a fixture where the allowed set only ever holds matching values cannot
  // tell whether the value was checked at all.
  assert.equal(
    applyStoreEdit(body, "asset:a", "asset:b", new Set(["prose"])).prose,
    "a sentence naming asset:a in passing",
  );
  const out = applyStoreEdit(body, "asset:a", "asset:b", new Set(["dependsOn[0]", "stepRefs[0].refs[0]"]));
  assert.deepEqual(out.dependsOn, ["asset:b", "asset:a"], "the LISTED index moves; its sibling does not");
  assert.deepEqual((out.stepRefs as { refs: string[] }[])[0]?.refs, ["asset:b"], "and a nested one moves");
  assert.equal(out.prose, "a sentence naming asset:a in passing", "prose is never rewritten");
  assert.equal(out.count, 7, "and non-string leaves come through unchanged");
  assert.equal(out.nothing, null);
  assert.notEqual(out, body, "the input is not mutated");
  // A path nothing listed is left alone even when the value matches — that is how a site the plan
  // reported as UNMOVABLE stays unmoved.
  assert.deepEqual(applyStoreEdit(body, "asset:a", "asset:b", new Set()).dependsOn, ["asset:a", "asset:a"]);
});

test("each of the four ways an argument can be missing yields the HELP, byte for byte", async () => {
  // Four separate conditions, and a probe on a shared substring cannot tell them apart: drop any one
  // arm and that case falls through to a `no artifact ""` refusal, which still mentions the verb.
  const d = await deps();
  const helpEnv = await libraryRepoint(d, undefined, {});
  assert.equal(helpEnv.ok, true, "asking for usage is not a failure");
  const help = helpEnv.body;
  assert.match(help, /IT IS A DRY RUN BY DEFAULT/);
  assert.equal((await libraryRepoint(d, "", { to: "adr-0500" })).body, help, "an empty FROM");
  assert.equal((await libraryRepoint(d, "adr-0028", { to: "" })).body, help, "an empty TO");
  assert.equal((await libraryRepoint(d, "adr-0028", {})).body, help, "a missing TO");
  assert.equal((await libraryRepoint(d, undefined, { to: "adr-0500" })).body, help, "a missing FROM");
});

/** A deps over an ad-hoc doc set — the odd-shaped plans below each need their own corpus. */
async function depsOver(docs: readonly StoredDoc[], stories: readonly StoryDecisionsFile[]): Promise<RepointDeps> {
  const store = new InMemoryStore();
  for (const x of docs) await store.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
  return { store, writable: true, readStories: () => stories, writeStory: () => undefined };
}

const BASE: readonly StoredDoc[] = [adrDoc("adr-0028", 28), adrDoc("adr-0500", 500)];

const DRY_TAIL = [
  "",
  "NOTHING HAS BEEN WRITTEN — this is a dry run. To apply exactly the plan above:",
  "",
] as const;

const TOKEN_NOTE = [
  "",
  "The token names THIS edit set. If the corpus moves before you confirm — a sibling session's",
  "write, an edited story — it changes, and the confirmation is refused rather than applying a",
  "plan nobody read.",
] as const;

test("GOLDEN: a plan with an EMPTY store half still renders that half as (none)", async () => {
  // Repointing between two decisions nothing in the store references: the file half carries the
  // whole plan, and the store section must say so rather than vanishing.
  const env = await libraryRepoint(await depsOver(BASE, [storyFile("studio", [28])]), "adr-0028", { to: "adr-0500" });
  assert.equal(
    env.body,
    lines(
      "repoint  adr-0028  →  adr-0500",
      "",
      "LIVE STORE — 0 edit(s), applied the moment you confirm",
      "------------------------------------------------------",
      "  (none)",
      "",
      "WORKING TREE — 1 file(s), still have to pass the gate and a PR",
      "--------------------------------------------------------------",
      "  stories/studio/story.md",
      "      before:  decisions: [28]",
      "      after:   decisions: [500]",
      ...DRY_TAIL,
      "  storytree library repoint adr-0028 --to adr-0500 --confirm 25f92bf2 --pg",
      ...TOKEN_NOTE,
    ),
  );
});

test("GOLDEN: a plan with an EMPTY file half still renders that half as (none)", async () => {
  const env = await libraryRepoint(
    await depsOver([...BASE, adrDoc("d", 1, { dependsOn: ["asset:adr-0028"] })], []),
    "adr-0028",
    { to: "adr-0500" },
  );
  assert.equal(
    env.body,
    lines(
      "repoint  adr-0028  →  adr-0500",
      "",
      "LIVE STORE — 1 edit(s), applied the moment you confirm",
      "------------------------------------------------------",
      "  d  [adr]",
      "      dependsOn[0]:  asset:adr-0028  →  asset:adr-0500",
      "",
      "WORKING TREE — 0 file(s), still have to pass the gate and a PR",
      "--------------------------------------------------------------",
      "  (none)",
      ...DRY_TAIL,
      "  storytree library repoint adr-0028 --to adr-0500 --confirm c77dc9a6 --pg",
      ...TOKEN_NOTE,
    ),
  );
});

test("GOLDEN: when an end is not a decision the file half is INAPPLICABLE, not empty", async () => {
  // An empty section and an inapplicable one read the same and mean very different things: one says
  // no story names this, the other says no story COULD.
  const env = await libraryRepoint(
    await depsOver(
      [principleDoc("old-rule"), principleDoc("new-rule"), adrDoc("s", 9, { dependsOn: ["asset:old-rule"] })],
      [storyFile("studio", [28])],
    ),
    "old-rule",
    { to: "new-rule" },
  );
  assert.equal(
    env.body,
    lines(
      "repoint  old-rule  →  new-rule",
      "",
      "LIVE STORE — 1 edit(s), applied the moment you confirm",
      "------------------------------------------------------",
      "  s  [adr]",
      "      dependsOn[0]:  asset:old-rule  →  asset:new-rule",
      "",
      "WORKING TREE — not applicable to this move",
      "------------------------------------------",
      "  A story names its deciding decisions by NUMBER, and old-rule is not a decision,",
      "  so there is no number to write into a `decisions:` list. No file is involved.",
      ...DRY_TAIL,
      "  storytree library repoint old-rule --to new-rule --confirm 2990f582 --pg",
      ...TOKEN_NOTE,
    ),
  );
});

test("GOLDEN: an artifact whose ONLY inbound site is unmovable says so AND shows what blocks it", async () => {
  // `nothing references X that this verb can move` on its own would read as clear. It is not: there
  // IS an inbound reference, and the retire wall will still refuse over it.
  const env = await libraryRepoint(
    await depsOver([...BASE, adrDoc("residue", 2, { references: ["asset:adr-0028"], schemaVersion: 8 })], []),
    "adr-0028",
    { to: "adr-0500" },
  );
  assert.equal(
    env.body,
    lines(
      "nothing references adr-0028 that this verb can move.",
      "",
      "LIVE STORE — 0 edit(s), applied the moment you confirm",
      "------------------------------------------------------",
      "  (none)",
      "",
      "WORKING TREE — 0 file(s), still have to pass the gate and a PR",
      "--------------------------------------------------------------",
      "  (none)",
      "",
      "CANNOT BE REPOINTED — 1 site(s), reported and left alone",
      "--------------------------------------------------------",
      "  residue  references[0]",
      "      `references` is not in the current schema, so the migrate-on-write upcast DROPS it at the next validated write. The site does not move, it evaporates — and every other entry in that field goes with it. Nothing here can repoint it.",
    ),
  );
});

test("GOLDEN: a file-only confirmed run reports zero store writes and the uncommitted half", async () => {
  const d = await depsOver(BASE, [storyFile("studio", [28])]);
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: "25f92bf2" });
  assert.equal(
    env.body,
    lines(
      "repointed adr-0028 → adr-0500",
      "",
      "  live store:   0 artifact(s) written",
      "  working tree: 1 file(s) edited",
      "    - stories/studio/story.md",
      "",
      "The file edits are UNCOMMITTED — they still have to pass the gate and land through a PR.",
    ),
  );
});

test("a blocked site in a SCALAR retired field names the field, not a bracketed path", async () => {
  // `rootFieldOf` has two arms: a bracketed/dotted path is cut, a bare one is used whole. The
  // fixtures above only ever exercise the first.
  const store = new InMemoryStore();
  for (const x of [
    adrDoc("adr-0028", 28),
    adrDoc("adr-0500", 500),
    adrDoc("old-shape", 3, { amends: "asset:adr-0028", schemaVersion: 7 }),
  ]) {
    await store.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
  }
  const env = await libraryRepoint({ store, writable: true, readStories: () => [], writeStory: () => undefined }, "adr-0028", { to: "adr-0500" });
  assert.match(env.body, /old-shape {2}amends\n {6}`amends` is not in the current schema/);
});

test("two sites on ONE artifact are planned, ordered, and applied TOGETHER in one write", async () => {
  const store = new InMemoryStore();
  for (const x of [
    adrDoc("adr-0028", 28),
    adrDoc("adr-0500", 500),
    adrDoc("twice", 4, { dependsOn: ["asset:adr-0028", "asset:adr-0028"] }),
  ]) {
    await store.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
  }
  const d: RepointDeps = { store, writable: true, readStories: () => [], writeStory: () => undefined };
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  assert.deepEqual(
    [...dry.body.matchAll(/(dependsOn\[\d\]):/g)].map((m) => m[1]),
    ["dependsOn[0]", "dependsOn[1]"],
  );
  // Confirmed, so the per-doc grouping is exercised: two edits reach ONE row as one write, and the
  // report names both paths on one line.
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  assert.equal(env.ok, true, env.body);
  assert.match(env.body, /- twice \(dependsOn\[0\], dependsOn\[1\]\)/);
  assert.deepEqual(((await store.getDoc("twice"))?.doc as { dependsOn?: string[] }).dependsOn, [
    "asset:adr-0500",
    "asset:adr-0500",
  ]);
});

test("a write the SCHEMA refuses is reported with its reason, not thrown out of the verb", async () => {
  // The apply loop's catch. A row carrying a key the schema does not admit, stamped at the CURRENT
  // version so no migration will clean it, fails `upcastAndValidate` — and the verb must survive
  // that with a named failure rather than an unhandled throw halfway through a batch.
  const store = new InMemoryStore();
  for (const x of [adrDoc("adr-0028", 28), adrDoc("adr-0500", 500)]) {
    await store.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
  }
  await store.upsertDoc({
    id: "malformed",
    kind: "adr",
    doc: { ...(adrDoc("malformed", 7, { dependsOn: ["asset:adr-0028"] }).doc as object), notAField: "x" },
  });
  const d: RepointDeps = { store, writable: true, readStories: () => [], writeStory: () => undefined };
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  assert.equal(env.ok, false);
  assert.match(env.body, /1 FAILED:/);
  assert.match(env.body, /- malformed — /, "named, with the validator's own reason after it");
  assert.deepEqual(
    ((await store.getDoc("malformed"))?.doc as { dependsOn?: string[] }).dependsOn,
    ["asset:adr-0028"],
    "and the row is left exactly as it was",
  );
});

test("a file whose list no longer names the source is left alone, not rewritten", async () => {
  // `changed: false` — the view says this unit names 28, its BYTES no longer do. Writing anyway
  // would put the plan's assumption on disk over whatever actually replaced it.
  const store = new InMemoryStore();
  for (const x of [adrDoc("adr-0028", 28), adrDoc("adr-0500", 500)]) {
    await store.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
  }
  const drifted: StoryDecisionsFile = {
    file: "stories/drifted/story.md",
    storyId: "drifted",
    decisions: [28],
    raw: lines("---", 'id: "drifted"', "tier: story", "decisions: [999]", "---", "", "# b", ""),
  };
  const written = new Map<string, string>();
  const d: RepointDeps = { store, writable: true, readStories: () => [drifted], writeStory: (f, c) => void written.set(f, c) };
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  assert.equal(env.ok, true, "a no-op is not a failure");
  assert.equal(written.size, 0, "and nothing is written");
  assert.match(env.body, /working tree: 0 file\(s\) edited/);
});

test("a store write that fails is REPORTED, never swallowed into a clean-looking success", async () => {
  // The apply loop's failure arm. Reachable only through the store seam: a row that answers the
  // plan's read and then vanishes before the write is the concurrency case the guard exists for.
  const inner = new InMemoryStore();
  for (const x of DOCS) await inner.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
  const store = storeThatLosesOneDocAfterPlanning(inner, "a-decision");

  const d: RepointDeps = { store, writable: true, readStories: () => [], writeStory: () => undefined };
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  assert.equal(env.ok, false, "a partial apply is NOT a success");
  assert.equal(
    env.body,
    lines(
      // A PARTIAL apply: one row moved, one could not. Both are named, and `ok` is false — a
      // half-done repoint that reported success would be the worst outcome this verb can have.
      "repointed adr-0028 → adr-0500",
      "",
      "  live store:   1 artifact(s) written",
      "    - an-increment (arcRef)",
      "  working tree: 0 file(s) edited",
      "",
      "1 FAILED:",
      "    - a-decision — vanished between the plan and the write",
    ),
  );
});

test("a file whose bytes no longer carry a decisions list is REPORTED, not silently skipped", async () => {
  // `decisions` and `raw` are two fields of one view, so they can disagree — a story rewritten
  // between the plan and the write is exactly that. The write must say so rather than pass.
  const store = new InMemoryStore();
  for (const x of [adrDoc("adr-0028", 28), adrDoc("adr-0500", 500)]) await store.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
  const torn: StoryDecisionsFile = {
    file: "stories/torn/story.md",
    storyId: "torn",
    decisions: [28],
    raw: lines("---", 'id: "torn"', "tier: story", "---", "", "# the decisions line is gone", ""),
  };
  const d: RepointDeps = { store, writable: true, readStories: () => [torn], writeStory: () => undefined };
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    lines(
      "repointed adr-0028 → adr-0500",
      "",
      "  live store:   0 artifact(s) written",
      "  working tree: 0 file(s) edited",
      "",
      "1 FAILED:",
      "    - stories/torn/story.md — no inline `decisions:` list in the frontmatter",
    ),
  );
});

test("a confirmed repoint between NON-decisions touches no file at all", async () => {
  // The apply path's story arm is gated on both ends being decisions, exactly as the plan's is.
  const store = new InMemoryStore();
  for (const x of [principleDoc("old-rule"), principleDoc("new-rule"), adrDoc("stands", 9, { dependsOn: ["asset:old-rule"] })]) {
    await store.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
  }
  const written = new Map<string, string>();
  const d: RepointDeps = { store, writable: true, readStories: () => STORIES, writeStory: (f, c) => void written.set(f, c) };
  const dry = await libraryRepoint(d, "old-rule", { to: "new-rule" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  const env = await libraryRepoint(d, "old-rule", { to: "new-rule", confirm: digest });
  assert.equal(env.ok, true, env.body);
  assert.equal(written.size, 0);
  assert.match(env.body, /working tree: 0 file\(s\) edited/);
  assert.doesNotMatch(env.body, /UNCOMMITTED/, "and no PR reminder when nothing was written to disk");
});

test("repointDecisions tolerates the whitespace an author's YAML actually carries", () => {
  const withSpace = lines("---", 'id: "s"', "decisions:   [4,28,  75]   ", "---", "", "# b", "");
  const out = repointDecisions(withSpace, 28, 500);
  assert.ok(out.ok && out.changed, "a padded list is still a list");
  assert.ok(out.ok && out.content.includes("decisions: [4, 500, 75]"));
  // ANCHORED to a whole line, both ends. A `decisions:` that is not at the start of its line is
  // some other key's value; anything trailing the bracket is not a list this may rewrite.
  assert.equal(repointDecisions(lines("---", "x: decisions: [28]", "---", ""), 28, 500).ok, false);
  assert.equal(repointDecisions(lines("---", "decisions: [28] # a note", "---", ""), 28, 500).ok, false);
});

test("a confirmed write with no injected actor still carries branch attribution", async () => {
  // `deps.actor ?? defaultCliActor()`: the fallback is what keeps an unattributed write out of the
  // store, and every other test here injects an actor and so never exercises it.
  const store = new InMemoryStore();
  for (const x of [...BASE, adrDoc("a-decision", 1, { dependsOn: ["asset:adr-0028"] })]) {
    await store.upsertDoc({ id: x.id, kind: x.kind, doc: x.doc });
  }
  const d: RepointDeps = { store, writable: true, readStories: () => [], writeStory: () => undefined };
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  const events = await store.readEvents({ id: "a-decision" });
  const actor = events.at(-1)?.actor ?? "";
  assert.notEqual(actor, "", "a write with no actor is the shape `branchOfActor` reads as UNATTRIBUTED");
  assert.match(actor, /@/, "defaultCliActor stamps an identity, not a bare literal");
});

test("survivingSites survives a doc body that is not an object", () => {
  // `upcast` is only meaningful for a structured body; a scalar row must not throw the whole plan.
  const plan = planRepoint({
    from: "adr-0028",
    to: "adr-0500",
    docs: [...DOCS, { id: "odd", kind: "adr", doc: "not an object", createdAt: STAMP.createdAt, updatedAt: STAMP.updatedAt }],
    stories: [],
  });
  assert.ok(plan.storeEdits.length > 0, "the rest of the plan is unaffected");
});

// --- GOLDEN RENDERS ------------------------------------------------------------------------------
//
// Whole bodies, verbatim. A render is mostly string literals and `check:mutation-diff` reds on a
// single survivor, so an `assert.match` probe kills only the words it quotes and leaves every other
// literal standing. These are deliberately brittle: changing the wording is meant to fail HERE,
// where the diff shows exactly which words moved, rather than nowhere.

test("GOLDEN: the confirmed run reports both substrates and flags the uncommitted half", async () => {
  const d = await deps();
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1];
  const env = await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: digest });
  assert.equal(
    env.body,
    lines(
      "repointed adr-0028 → adr-0500",
      "",
      "  live store:   2 artifact(s) written",
      "    - a-decision (dependsOn[0])",
      "    - an-increment (arcRef)",
      "  working tree: 2 file(s) edited",
      "    - stories/agent/story.md",
      "    - stories/studio/story.md",
      "",
      "The file edits are UNCOMMITTED — they still have to pass the gate and land through a PR.",
    ),
  );
  assert.deepEqual(env.next, ["storytree library inbound adr-0500", "storytree library inbound adr-0028"]);
});

test("GOLDEN: a stale token's refusal names both digests and how to recover", async () => {
  const env = await libraryRepoint(await deps(), "adr-0028", { to: "adr-0500", confirm: "deadbeef" });
  assert.equal(
    env.body,
    lines(
      "REFUSED — the plan moved. You confirmed deadbeef; the plan is now 007de1b1.",
      "",
      "Something changed between the dry run and this confirmation, so the edit set you read is not",
      "the one that would land. Nothing has been written. Re-run the dry run, read the new plan,",
      "and confirm that one:",
      "",
      "  storytree library repoint adr-0028 --to adr-0500",
    ),
  );
});

test("every refusal and dry run points at the command that continues the work", async () => {
  // A `next:` is the CLI's onward edge, and each of these is a different next step. Left unasserted,
  // they are the part of an envelope a render golden does not reach.
  const d = await deps();
  assert.deepEqual((await libraryRepoint(d, undefined, {})).next, ["storytree library repoint <from> --to <to>"]);
  assert.deepEqual((await libraryRepoint(d, "adr-0028", { to: "adr-0028" })).next, [
    "storytree library repoint <from> --to <to>",
  ]);
  assert.deepEqual((await libraryRepoint(d, "ghost", { to: "adr-0500" })).next, ['storytree library search "ghost"']);
  assert.deepEqual((await libraryRepoint(d, "adr-0028", { to: "adr-9999" })).next, [
    'storytree library search "adr-9999"',
  ]);
  const dry = await libraryRepoint(d, "adr-0028", { to: "adr-0500" });
  const digest = /--confirm ([0-9a-f]{8})/.exec(dry.body)?.[1] ?? "";
  assert.deepEqual(dry.next, [`storytree library repoint adr-0028 --to adr-0500 --confirm ${digest} --pg`]);
  assert.deepEqual((await libraryRepoint(d, "adr-0028", { to: "adr-0500", confirm: "deadbeef" })).next, [
    "storytree library repoint adr-0028 --to adr-0500",
  ]);
  assert.deepEqual(
    (await libraryRepoint(await deps({ writable: false }), "adr-0028", { to: "adr-0500", confirm: digest })).next,
    [`storytree library repoint adr-0028 --to adr-0500 --confirm ${digest} --pg`],
  );
});

test("the END that is not a decision is the one named, whichever end it is", async () => {
  const docs = [adrDoc("adr-0028", 28), adrDoc("adr-0500", 500), principleDoc("a-rule")];
  assert.equal(planRepoint({ from: "a-rule", to: "adr-0500", docs, stories: STORIES }).notADecision, "a-rule");
  assert.equal(planRepoint({ from: "adr-0028", to: "a-rule", docs, stories: STORIES }).notADecision, "a-rule");
  assert.equal(planRepoint({ from: "adr-0028", to: "adr-0500", docs, stories: STORIES }).notADecision, null);
});

test("an artifact that references ITSELF is never planned as its own dependent", async () => {
  const docs = [adrDoc("adr-0028", 28, { dependsOn: ["asset:adr-0028"] }), adrDoc("adr-0500", 500)];
  const plan = planRepoint({ from: "adr-0028", to: "adr-0500", docs, stories: [] });
  assert.deepEqual(plan.storeEdits, [], "moving a self-reference would rewrite the row's own identity");
});

test("a unit naming BOTH ends keeps the survivor once, and the listing is sorted by path", () => {
  const plan = planRepoint({
    from: "adr-0028",
    to: "adr-0500",
    docs: [adrDoc("adr-0028", 28), adrDoc("adr-0500", 500)],
    // Deliberately out of order, so the sort has something to do.
    stories: [storyFile("z-last", [28]), storyFile("a-first", [4, 28, 500])],
  });
  assert.deepEqual(
    plan.fileEdits.map((e) => `${e.file} ${e.after}`),
    ["stories/a-first/story.md decisions: [4, 500]", "stories/z-last/story.md decisions: [500]"],
  );
});

test("applyStoreEdit compares the TRIMMED value, as the walk that found it did", () => {
  // `referencedAssetSites` trims before matching, so a padded ref IS a site. If the rewrite compared
  // untrimmed, the plan would list a site the write then silently declined to move.
  const out = applyStoreEdit({ dependsOn: ["  asset:a  "] }, "asset:a", "asset:b", new Set(["dependsOn[0]"]));
  assert.deepEqual(out.dependsOn, ["asset:b"]);
});

test("GOLDEN: the three refusals that never render a plan", async () => {
  const noPg = await libraryRepoint(await deps({ writable: false }), "adr-0028", { to: "adr-0500", confirm: "007de1b1" });
  assert.equal(
    noPg.body,
    "a confirmed repoint writes to the shared store — run with --pg (and bring the DB up first: pnpm db:up).",
  );

  const missing = await libraryRepoint(await deps(), "adr-0028", { to: "adr-9999" });
  assert.equal(
    missing.body,
    lines(
      'no artifact "adr-9999" to repoint onto — refusing.',
      "",
      "Every edge would be moved onto an id nothing resolves, and a dangling declared ref is a",
      "broken pull rather than a tidy one. Create the successor first, then repoint.",
    ),
  );

  const same = await libraryRepoint(await deps(), "adr-0028", { to: "adr-0028" });
  assert.equal(same.body, '"adr-0028" and --to are the same artifact — nothing to move.');

  const ghost = await libraryRepoint(await deps(), "ghost", { to: "adr-0500" });
  assert.equal(ghost.body, 'no artifact "ghost" in the corpus. ids are exact and case-sensitive.');
});

test("GOLDEN: an artifact with nothing movable pointing at it", async () => {
  const env = await libraryRepoint(await deps(), "adr-0500", { to: "adr-0028" });
  assert.equal(env.body, "nothing references adr-0500 that this verb can move.");
  assert.deepEqual(env.next, ["storytree library inbound adr-0500"]);
});

test("GOLDEN: the help", async () => {
  const env = await libraryRepoint(await deps(), undefined, {});
  assert.equal(
    env.body,
    lines(
      "storytree library repoint <from> --to <to> [--confirm <token>] --pg",
      "",
      "  Move every inbound reference from one artifact to a successor, as one operation.",
      "",
      "  IT IS A DRY RUN BY DEFAULT, and there is no second guard behind that. It prints every edit",
      "  it would make — artifact, field, old value, new value — and writes nothing. Applying takes",
      "  --confirm with the token the dry run printed, which names THAT edit set: if the corpus moves",
      "  first the token changes, and the confirmation is refused rather than landing a plan nobody",
      "  read.",
      "",
      "  IT SPANS TWO SUBSTRATES and says which it is touching, because they land differently:",
      "    LIVE STORE     an artifact's `asset:` ref sites — applied the moment you confirm.",
      "    WORKING TREE   a story's `decisions:` frontmatter, which holds ADR NUMBERS in a markdown",
      "                   file — edited on disk, and still has to pass the gate and a PR.",
      "",
      "  A site the walk finds is not always one the write can move. A field that is no longer in the",
      "  schema is DROPPED by the migrate-on-write upcast, so its refs evaporate rather than move —",
      "  those are reported under CANNOT BE REPOINTED and left alone.",
      "",
      "  A name that appears only inside PROSE is never rewritten (ADR-0477): that is a sentence, not",
      "  an edge.",
      "",
      "  For a DECISION, prefer a consolidating supersession (ADR-0497 D1) — it keeps the row, so no",
      "  edge needs moving at all. Repointing is for the narrower case of actually removing one.",
      "",
      "examples",
      "  storytree library repoint adr-0028 --to adr-0500",
      "  storytree library repoint adr-0028 --to adr-0500 --confirm a1b2c3d4 --pg",
    ),
  );
  assert.deepEqual(env.next, ["storytree library repoint <from> --to <to>"]);
});
