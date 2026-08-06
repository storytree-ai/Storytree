import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createClaimUniverseLoader,
  guardClaimNamespace,
  kindSuffix,
  loadClaimUniverse,
  parseNodeFrontmatter,
  readLibraryTargets,
  readTreeTargets,
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

function node(id: string, tier: string): string {
  return `---\nid: "${id}"\ntier: ${tier}\ntitle: "t"\n---\n\n# ${id}\n`;
}

const TREE = {
  "studio/story.md": node("studio", "story"),
  "studio/studio-panel.md": node("studio-panel", "capability"),
  "cli/story.md": node("cli", "story"),
  "cli/packages-forward-refusal.md": node("packages-forward-refusal", "contract"),
  // Prose docs with no frontmatter live under stories/ too — they are not nodes and must not
  // register as unread sources, or the fence would never fire in the real repo.
  "cli/interface-notes.md": "# just prose, no frontmatter\n",
};

function fakeLibrary(docs: readonly unknown[]): LibraryDocsReadLike {
  return { queryDocs: async () => docs.map((doc) => ({ doc })) };
}

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

test("both sources read ⇒ one COMPLETE universe", async (t) => {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const u = await loadClaimUniverse({
    storiesDir: root,
    library: fakeLibrary([
      { kind: "arc", id: "first-class-edges-arc" },
      { kind: "agent", id: "session-orchestrator" },
    ]),
  });
  assert.equal(u.complete, true);
  assert.deepEqual(u.unreadSources, []);
  assert.equal(u.targets.length, 5);
  assert.equal(u.nonClaimable.length, 1);
});

test("EITHER source failing withdraws `complete` — the universe is never partly authoritative", async (t) => {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const liveDown = await loadClaimUniverse({ storiesDir: root, library: null });
  assert.equal(liveDown.complete, false);
  assert.ok(liveDown.targets.length > 0, "it still carries what it could read");

  const treeGone = await loadClaimUniverse({
    storiesDir: path.join(tmpdir(), "nope-8812"),
    library: fakeLibrary([{ kind: "arc", id: "a" }]),
  });
  assert.equal(treeGone.complete, false);
});

test("the loader is memoised — a three-node declare reads the corpus once", async (t) => {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let reads = 0;
  const load = createClaimUniverseLoader({
    storiesDir: root,
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
    library: fakeLibrary([{ kind: "arc", id: "first-class-edges-arc" }]),
  });
}

test("guard: a resolvable id passes and carries its kind", async (t) => {
  const universe = completeLoader(t);
  assert.deepEqual(await guardClaimNamespace({ id: "studio", universe, verb: "v" }), {
    ok: true,
    kind: "story",
  });
  assert.deepEqual(
    await guardClaimNamespace({ id: "first-class-edges-arc", universe, verb: "v" }),
    { ok: true, kind: "arc" },
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
    });
  }
});

test("guard: a THROWING loader is unchecked — the namespace check never fails a claim", async () => {
  const boom = () => Promise.reject(new Error("pool exhausted"));
  assert.deepEqual(await guardClaimNamespace({ id: "whoami", universe: boom, verb: "v" }), {
    ok: true,
    kind: null,
  });
});

test("guard: an INCOMPLETE universe is unchecked", async (t) => {
  const root = makeTree(TREE);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const partial = createClaimUniverseLoader({ storiesDir: root, library: null });
  assert.deepEqual(await guardClaimNamespace({ id: "whoami", universe: partial, verb: "v" }), {
    ok: true,
    kind: null,
  });
});

test("kindSuffix renders the kind only when it is actually known", () => {
  assert.equal(kindSuffix("capability"), " [capability]");
  assert.equal(kindSuffix(null), "");
});
