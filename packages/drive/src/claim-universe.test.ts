import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveClaimId } from "./claim-namespace.js";
import {
  createClaimUniverseLoader,
  guardClaimNamespace,
  kindSuffix,
  loadClaimUniverse,
  parseNodeFrontmatter,
  readLibraryTargets,
  readTreeTargets,
  subtreeClaimNote,
  type LibraryDocsReadLike,
} from "./claim-universe.js";

/**
 * Gathering the claim namespace (ADR-0310 D2). The suite is dominated by the FAILURE cases on
 * purpose: this module's contract is not "reads two sources" — it is "knows when it did not", and
 * every way it can fail must withdraw the licence to refuse rather than quietly narrow the
 * universe. A partial universe that reported itself complete would refuse legitimate claims, which
 * is worse than the leak the check exists to close.
 *
 * The tree half runs against a throwaway fixture directory, never `stories/`, so this stays
 * hermetic and does not red on a story rename.
 */

// ---------------------------------------------------------------------------
// A throwaway stories/ tree
// ---------------------------------------------------------------------------

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "claim-universe-"));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  return root;
}

function node(id: string, tier: string, extra = ""): string {
  return `---\nid: "${id}"\ntier: ${tier}\ntitle: "t"\n${extra}---\n\n# ${id}\n`;
}

const TREE = {
  "studio/story.md": node("studio", "story"),
  "studio/studio-panel.md": node("studio-panel", "capability"),
  "cli/story.md": node("cli", "story"),
  "cli/packages-forward-refusal.md": node("packages-forward-refusal", "contract"),
  // A story whose UAT node the gate DRIVES (ADR-0040) — the one shape whose story id still names
  // real work, so the D2 fence has both branches in the fixture rather than only the refusing one.
  "driven/story.md": node("driven", "story", "uat_witness: machine\n"),
  // Prose docs with no frontmatter live under stories/ too — they are not nodes and must not
  // register as unread sources, or the fence would never fire in the real repo.
  "cli/interface-notes.md": "# just prose, no frontmatter\n",
};

function fakeLibrary(docs: readonly unknown[]): LibraryDocsReadLike {
  return { queryDocs: async () => docs.map((doc) => ({ doc })) };
}

/**
 * A throwaway `repo-manifest.json` carrying a two-entry `sourceOwnership.subtrees` map — the third
 * source (ADR-0317 D3). Hermetic like the tree fixture: never the real manifest, so this suite does
 * not red when the live map gains a declaration. That the LIVE map's keys all resolve is a separate,
 * deliberate assertion in `source-ownership-map.test.ts`.
 */
function manifest(subtrees: Record<string, string> = FIXTURE_SUBTREES): string {
  const root = mkdtempSync(path.join(tmpdir(), "claim-universe-manifest-"));
  const file = path.join(root, "repo-manifest.json");
  writeFileSync(file, JSON.stringify({ sourceOwnership: { subtrees } }), "utf8");
  return file;
}

const FIXTURE_SUBTREES = {
  $comment: "prose keys are never declarations",
  "packages/cli/src/gate*.ts": "gate-ci-parity",
  "packages/studio/src/panel": "studio-panel",
};

// ---------------------------------------------------------------------------
// Frontmatter
// ---------------------------------------------------------------------------

test("parseNodeFrontmatter reads id + tier, and ignores everything that is not a node", () => {
  assert.deepEqual(parseNodeFrontmatter(node("studio", "story")), { id: "studio", kind: "story" });
  assert.deepEqual(parseNodeFrontmatter(node("x", "capability")), { id: "x", kind: "capability" });
  assert.deepEqual(parseNodeFrontmatter(node("y", "contract")), { id: "y", kind: "contract" });
  assert.equal(parseNodeFrontmatter("# no frontmatter\n"), null);
  assert.equal(parseNodeFrontmatter("---\ntitle: t\n---\n"), null, "no tier ⇒ not a node");
  assert.equal(parseNodeFrontmatter("---\ntier: arc\nid: a\n---\n"), null, "arcs are not on disk");
});

test("parseNodeFrontmatter carries uat_witness for a STORY only, and never invents one", () => {
  // The ADR-0346 D2 fence reads this off the tree. Absent is legal and extremely common (it IS the
  // fail-closed `human` default, ADR-0040), so an absent witness must never make a node unreadable
  // — that would refuse every claim under a story rather than only its work-grade claim.
  assert.deepEqual(parseNodeFrontmatter(node("s", "story", "uat_witness: machine\n")), {
    id: "s",
    kind: "story",
    uatWitness: "machine",
  });
  assert.deepEqual(parseNodeFrontmatter(node("s", "story", 'uat_witness: "human"\n')), {
    id: "s",
    kind: "story",
    uatWitness: "human",
  });
  assert.deepEqual(
    parseNodeFrontmatter(node("s", "story")),
    { id: "s", kind: "story" },
    "no witness declared ⇒ no field, not a defaulted one",
  );
  assert.deepEqual(
    parseNodeFrontmatter(node("c", "capability", "uat_witness: machine\n")),
    { id: "c", kind: "capability" },
    "only a STORY declares a UAT witness — a capability carrying the key is not a driven unit",
  );
});

test("a file declaring a node tier with NO id is UNREADABLE, not merely skipped", () => {
  // The distinction is load-bearing: skipping it would silently drop a real node from the universe
  // and refuse a legitimate claim on it. Being unreadable stands the whole check down instead.
  assert.deepEqual(parseNodeFrontmatter("---\ntier: capability\ntitle: t\n---\n"), {
    unreadable: true,
  });
});

test("unquoted ids and single quotes both parse", () => {
  assert.deepEqual(parseNodeFrontmatter("---\nid: studio\ntier: story\n---\n"), {
    id: "studio",
    kind: "story",
  });
  assert.deepEqual(parseNodeFrontmatter("---\nid: 'studio'\ntier: 'story'\n---\n"), {
    id: "studio",
    kind: "story",
  });
});

// ---------------------------------------------------------------------------
// The tree source
// ---------------------------------------------------------------------------

test("readTreeTargets finds every node and reads no source as unread", (t) => {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const res = readTreeTargets(root);
  assert.deepEqual(res.unread, []);
  assert.deepEqual(
    [...res.targets].sort((a, b) => a.id.localeCompare(b.id)),
    [
      { id: "cli", kind: "story" },
      // `uat_witness` rides along for a story that declares one, and ONLY then — an absent witness
      // stays absent rather than being defaulted here, so the ADR-0040 defaulting seam stays the
      // one place that rule is written.
      { id: "driven", kind: "story", uatWitness: "machine" },
      { id: "packages-forward-refusal", kind: "contract" },
      { id: "studio", kind: "story" },
      { id: "studio-panel", kind: "capability" },
    ],
  );
});

test("an ABSENT stories/ dir is an unread source, never an empty universe", () => {
  const res = readTreeTargets(path.join(tmpdir(), "definitely-not-a-tree-9f2a"));
  assert.deepEqual(res.targets, []);
  assert.equal(res.unread.length, 1);
  assert.match(res.unread[0] ?? "", /absent/);
});

test("a node file with a tier but no id makes the tree an unread source", (t) => {
  const root = makeTree({ ...TREE, "cli/broken.md": "---\ntier: capability\ntitle: t\n---\n" });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const res = readTreeTargets(root);
  assert.equal(res.unread.length, 1);
  assert.match(res.unread[0] ?? "", /declares a node tier but no id/);
  assert.ok(res.targets.length > 0, "the nodes it COULD read are still returned");
});

// ---------------------------------------------------------------------------
// The live source
// ---------------------------------------------------------------------------

test("readLibraryTargets partitions claimable kinds from addressable-but-not-claimable ones", async () => {
  const res = await readLibraryTargets(
    fakeLibrary([
      { kind: "arc", id: "first-class-edges-arc" },
      { kind: "increment", id: "typed-resolvable-claim-namespace" },
      { kind: "agent", id: "session-orchestrator" },
      { kind: "friction", id: "some-friction" },
      { kind: "arc" }, // malformed rows are skipped, not fatal
      null,
    ]),
  );
  assert.deepEqual(res.unread, []);
  assert.deepEqual(res.targets, [
    { id: "first-class-edges-arc", kind: "arc" },
    { id: "typed-resolvable-claim-namespace", kind: "increment" },
  ]);
  assert.deepEqual(res.nonClaimable, [
    { id: "session-orchestrator", kind: "agent" },
    { id: "some-friction", kind: "friction" },
  ]);
});

test("a NULL library is an unread source — offline, arcs and increments are simply unknown", async () => {
  const res = await readLibraryTargets(null);
  assert.equal(res.unread.length, 1);
  assert.match(res.unread[0] ?? "", /not open/);
});

test("a THROWING library read is an unread source carrying the cause", async () => {
  const res = await readLibraryTargets({
    queryDocs: () => Promise.reject(new Error("connection refused")),
  });
  assert.deepEqual(res.targets, []);
  assert.match(res.unread[0] ?? "", /connection refused/);
});

// ---------------------------------------------------------------------------
// The fold
// ---------------------------------------------------------------------------

test("all THREE sources read ⇒ one COMPLETE universe", async (t) => {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const u = await loadClaimUniverse({
    storiesDir: root,
    manifestPath: manifest(),
    library: fakeLibrary([
      { kind: "arc", id: "first-class-edges-arc" },
      { kind: "agent", id: "session-orchestrator" },
    ]),
  });
  assert.equal(u.complete, true);
  assert.deepEqual(u.unreadSources, []);
  // 5 tree nodes + 1 arc + 2 declared subtrees. The `$comment` key is prose, not a declaration.
  assert.equal(u.targets.length, 8);
  assert.equal(u.nonClaimable.length, 1);
  assert.deepEqual(
    u.targets.filter((t) => t.kind === "subtree"),
    [
      { id: "packages/cli/src/gate*.ts", kind: "subtree", owner: "gate-ci-parity" },
      { id: "packages/studio/src/panel", kind: "subtree", owner: "studio-panel" },
    ],
    "a subtree target carries its declared owner, so a claim can name who else writes this code",
  );
});

test("ANY source failing withdraws `complete` — the universe is never partly authoritative", async (t) => {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const liveDown = await loadClaimUniverse({ storiesDir: root, library: null, manifestPath: manifest() });
  assert.equal(liveDown.complete, false);
  assert.ok(liveDown.targets.length > 0, "it still carries what it could read");

  const treeGone = await loadClaimUniverse({
    storiesDir: path.join(tmpdir(), "nope-8812"),
    manifestPath: manifest(),
    library: fakeLibrary([{ kind: "arc", id: "a" }]),
  });
  assert.equal(treeGone.complete, false);
});

test("an ABSENT or uncomposed manifest stands the check down — it never starts REFUSING", async (t) => {
  // The direction is the whole point (ADR-0317 D3). Joining a third source could only make the
  // check stricter if a missing map narrowed the universe silently; instead it withdraws the
  // licence to refuse, so the worst an unreadable manifest can do is switch the fence off.
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const live = fakeLibrary([{ kind: "arc", id: "a" }]);

  for (const manifestPath of [null, path.join(tmpdir(), "no-such-manifest-8812.json")]) {
    const u = await loadClaimUniverse({ storiesDir: root, library: live, manifestPath });
    assert.equal(u.complete, false);
    assert.equal(u.targets.filter((x) => x.kind === "subtree").length, 0);
    assert.equal(
      resolveClaimId("packages/cli/src/gate*.ts", u).verdict,
      "unverified",
      "an unreadable map must not turn a real subtree id into a refusal",
    );
  }
});

test("a manifest with no sourceOwnership.subtrees is UNREAD, not an empty map", async (t) => {
  // "There are no declarations" and "I could not find the declarations" are opposite claims, and
  // only the second is safe to act on by standing down. An explicitly empty `{}` is the first.
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const live = fakeLibrary([]);

  const dir = mkdtempSync(path.join(tmpdir(), "claim-universe-bare-"));
  const bare = path.join(dir, "repo-manifest.json");
  writeFileSync(bare, JSON.stringify({ packageOwnership: {} }), "utf8");
  const missing = await loadClaimUniverse({ storiesDir: root, library: live, manifestPath: bare });
  assert.equal(missing.complete, false);
  assert.match(missing.unreadSources.join(" "), /sourceOwnership/);

  const empty = await loadClaimUniverse({
    storiesDir: root,
    library: live,
    manifestPath: manifest({}),
  });
  assert.equal(empty.complete, true, "a deliberately empty map read fine — it just declares nothing");
});

test("a LIBRARY artifact calling itself a `subtree` is not claimable — one source per kind", async (t) => {
  // The manifest is authoritative for subtrees. If the Library could mint them too, a doc of that
  // kind would be a second, unchecked way to make any string resolve.
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const u = await loadClaimUniverse({
    storiesDir: root,
    manifestPath: manifest(),
    library: fakeLibrary([{ kind: "subtree", id: "packages/pretend/src" }]),
  });
  assert.equal(u.targets.some((x) => x.id === "packages/pretend/src"), false);
  assert.deepEqual(u.nonClaimable, [{ id: "packages/pretend/src", kind: "subtree" }]);
});

test("the loader is memoised — a three-node declare reads the corpus once", async (t) => {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let reads = 0;
  const load = createClaimUniverseLoader({
    storiesDir: root,
    manifestPath: manifest(),
    library: {
      queryDocs: async () => {
        reads += 1;
        return [];
      },
    },
  });
  await Promise.all([load(), load(), load()]);
  await load();
  assert.equal(reads, 1);
});

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

/** A complete loader over a throwaway tree, torn down with the test that made it. */
function completeLoader(t: { after(fn: () => void): void }) {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return createClaimUniverseLoader({
    storiesDir: root,
    manifestPath: manifest(),
    library: fakeLibrary([{ kind: "arc", id: "first-class-edges-arc" }]),
  });
}

test("guard: a resolvable id passes and carries its kind", async (t) => {
  const universe = completeLoader(t);
  assert.deepEqual(await guardClaimNamespace({ id: "studio", universe, verb: "v" }), {
    ok: true,
    kind: "story",
    owner: null,
    uatWitness: null,
  });
  assert.deepEqual(
    await guardClaimNamespace({ id: "first-class-edges-arc", universe, verb: "v" }),
    { ok: true, kind: "arc", owner: null, uatWitness: null },
  );
});

test("guard: a story's uat_witness rides through to the D2 fence (ADR-0346)", async (t) => {
  const universe = completeLoader(t);
  // The ONE fact that tells a story id naming a driven UAT node from a story id naming a fence.
  // It reaches the fence off the TREE, never from the shape of the string.
  assert.deepEqual(await guardClaimNamespace({ id: "driven", universe, verb: "v" }), {
    ok: true,
    kind: "story",
    owner: null,
    uatWitness: "machine",
  });
  const undeclared = await guardClaimNamespace({ id: "studio", universe, verb: "v" });
  assert.equal(undeclared.ok && undeclared.uatWitness, null, "absent stays absent — never `human`");
  const capability = await guardClaimNamespace({ id: "studio-panel", universe, verb: "v" });
  assert.equal(capability.ok && capability.uatWitness, null, "a capability declares no witness");
});

test("guard: a DECLARED SUBTREE resolves by its manifest key, carrying the owner (ADR-0317 D3)", async (t) => {
  const universe = completeLoader(t);
  assert.deepEqual(
    await guardClaimNamespace({ id: "packages/cli/src/gate*.ts", universe, verb: "v" }),
    { ok: true, kind: "subtree", owner: "gate-ci-parity", uatWitness: null },
    "the declaration KEY is the id, verbatim — globs and all",
  );
});

test("guard: a FILE under a declared subtree is refused, and told the subtree id", async (t) => {
  // Exact-key-only, deliberately: a claim row is keyed by the raw string, so resolving each
  // contained file would let two sessions hold two ids over the same code and never contend.
  const g = await guardClaimNamespace({
    id: "packages/cli/src/gate-run.ts",
    universe: completeLoader(t),
    verb: "the-verb",
  });
  assert.equal(g.ok, false);
  if (g.ok) return;
  assert.deepEqual(g.suggestions[0], {
    id: "packages/cli/src/gate*.ts",
    kind: "subtree",
    owner: "gate-ci-parity",
    reason: "owning-subtree",
  });
  assert.match(g.refusal.body, /owned by gate-ci-parity/);
  assert.ok(
    (g.refusal.next ?? []).some((n) => n.includes("'packages/cli/src/gate*.ts'")),
    "the remedy line QUOTES the glob, or the shell expands it into something else entirely",
  );
});

test("guard: an unresolvable id refuses, with the envelope AND the raw suggestions", async (t) => {
  const g = await guardClaimNamespace({
    id: "studioo",
    universe: completeLoader(t),
    verb: "the-verb",
  });
  assert.equal(g.ok, false);
  if (g.ok) return;
  assert.equal(g.refusal.ok, false);
  assert.match(g.refusal.body, /REFUSED/);
  assert.match(g.refusal.body, /the-verb/);
  assert.ok(g.suggestions.some((s) => s.id === "studio"));
  assert.ok((g.refusal.next ?? []).some((n) => n.includes("studio")));
});

test("guard: NO loader ⇒ unchecked — the pre-ADR-0310 behaviour, byte for byte", async () => {
  for (const universe of [null, undefined]) {
    assert.deepEqual(await guardClaimNamespace({ id: "whoami", universe, verb: "v" }), {
      ok: true,
      kind: null,
      owner: null,
      uatWitness: null,
    });
  }
});

test("guard: a THROWING loader is unchecked — the namespace check never fails a claim", async () => {
  const boom = () => Promise.reject(new Error("pool exhausted"));
  assert.deepEqual(await guardClaimNamespace({ id: "whoami", universe: boom, verb: "v" }), {
    ok: true,
    kind: null,
    owner: null,
    uatWitness: null,
  });
});

test("guard: an INCOMPLETE universe is unchecked", async (t) => {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const partial = createClaimUniverseLoader({ storiesDir: root, library: null, manifestPath: manifest() });
  assert.deepEqual(await guardClaimNamespace({ id: "whoami", universe: partial, verb: "v" }), {
    ok: true,
    kind: null,
    owner: null,
    uatWitness: null,
  });
});

test("kindSuffix renders the kind only when it is actually known, and names a subtree's owner", () => {
  assert.equal(kindSuffix("capability"), " [capability]");
  assert.equal(kindSuffix(null), "");
  assert.equal(kindSuffix(null, "gate-ci-parity"), "", "an unchecked claim asserts nothing");
  assert.equal(
    kindSuffix("subtree", "gate-ci-parity"),
    " [subtree, owned by gate-ci-parity]",
    "the kind alone leaves the session guessing which unit owns the code it just claimed",
  );
});

test("subtreeClaimNote ANNOUNCES the overlap it deliberately does not enforce", () => {
  // ADR-0317 D3 makes a subtree claimable; nothing makes it contend with its owner, because the
  // ledger keys claims by id and knows no containment. Cross-grain contention has no measured
  // demand behind it (56 refusals in 40 days, all on nodes) and ADR-0311 is the bar it would have
  // to clear. So the gap is stated at claim time — visible, not undiscovered.
  const note = subtreeClaimNote("subtree", "gate-ci-parity").join("\n");
  assert.match(note, /does NOT contend/);
  assert.match(note, /gate-ci-parity/);
  assert.deepEqual(subtreeClaimNote("capability", null), []);
  assert.deepEqual(subtreeClaimNote(null, "gate-ci-parity"), []);
  assert.deepEqual(subtreeClaimNote("subtree", null), [], "nothing to announce with no owner read");
});
