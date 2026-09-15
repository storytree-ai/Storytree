import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalisePastedPath, resolveClaimId, type ClaimUniverse } from "./claim-namespace.js";
import { readSubtreeTargets } from "./claim-universe.js";
import { REPO_MANIFEST_TREE, splitManifest, type ManifestJson, type ManifestObject } from "./manifest-fragments.js";
import type { GitTreeReader } from "./manifest-fragments-read.js";
import { readSourceOwnershipMap, readSourceOwnershipMapAt } from "./source-ownership-map.js";

/**
 * The declared subtree map (ADR-0317 D2) as a CLAIM SOURCE (D3).
 *
 * Three halves, and the last one is deliberately NOT hermetic:
 *
 *  1. The reader's contract over throwaway fragment trees laid out as the real one is (ADR-0556). Every
 *     way it can fail to read must be reported as unread, because `claim-universe.ts` turns a non-empty
 *     `unread` into "stand down" and anything it swallowed instead would become a refusal on a real id.
 *  2. The map at a COMMIT, read through git: composed from the commit's tree — and UNREAD, never read
 *     some other way, where the commit has none.
 *  3. THE LIVE MANIFEST. Every one of the map's real keys must resolve as a claim id, and none may
 *     be mangled by the pasted-path normalisation or shadow a node id. `claim-namespace.test.ts` is
 *     frozen and hermetic on purpose; that is exactly why it cannot answer this — its fixture is
 *     two hand-written keys, and the property that matters is over every key the repo actually
 *     declares. This file is in `drive` beside its sibling live-manifest suites
 *     (`write-authority-rules.test.ts`, `repo-root-drivable.test.ts`) and needs no DB and no
 *     network: the fragments are committed files.
 */

/** This file sits at `<repo>/packages/drive/src/`. */
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const LIVE_TREE = path.join(REPO_ROOT, REPO_MANIFEST_TREE);

/** Every section a composed manifest needs besides the source-ownership map — each empty, which is a legal statement. */
const REST = {
  root: { files: {}, dirs: {} },
  docs: { allowedDirs: {}, files: {} },
  packageOwnership: { organisms: {}, foundational: [], surfaces: {} },
  hierarchyCamps: { readers: {} },
  hostedStories: { register: {} },
};

/** `manifest`'s fragments, keyed by their path under the tree — exactly as the real map is split. */
function fragmentsOf(manifest: ManifestObject): Record<string, string> {
  return Object.fromEntries(splitManifest(manifest).map((f) => [f.path, f.text]));
}

/** A throwaway fragment tree holding `files`, each at its path under the tree. Returns the tree's root. */
function tree(files: Readonly<Record<string, string>>): string {
  const root = path.join(mkdtempSync(path.join(tmpdir(), "source-ownership-map-")), REPO_MANIFEST_TREE);
  mkdirSync(root);
  for (const [file, text] of Object.entries(files)) {
    const out = path.join(root, ...file.split("/"));
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, text, "utf8");
  }
  return root;
}

/** The tree root for the whole manifest with `sourceOwnership` in it. */
function written(sourceOwnership?: ManifestJson): string {
  return tree(fragmentsOf(sourceOwnership === undefined ? REST : { ...REST, sourceOwnership }));
}

/** A tree root that cannot be listed, because the path it would sit at is a file. */
function blockedTree(): string {
  const root = path.join(mkdtempSync(path.join(tmpdir(), "source-ownership-map-")), REPO_MANIFEST_TREE);
  writeFileSync(root, "not a directory", "utf8");
  return root;
}

const COVERED = { subtrees: { "packages/cli/src": "cli", "packages/cli/src/a.ts": "a" } };

// ---------------------------------------------------------------------------
// The reader's contract
// ---------------------------------------------------------------------------

test("declarations are read as {subtree, owner} out of the fragment tree, and `$`-prefixed prose keys are not declarations", () => {
  const root = written({
    $comment: "the authoring rules",
    $section_cli: "—",
    subtrees: {
      $comment: "prose",
      $section_cli: "—",
      "packages/library/src/store": "library-cli",
      "packages/cli/src/gate*.ts": "gate-ci-parity",
    },
  });
  const map = readSourceOwnershipMap(root);
  assert.deepEqual(map.unread, []);
  // In the composed order — declaration order decides nothing.
  assert.deepEqual(map.subtrees, [
    { subtree: "packages/cli/src/gate*.ts", owner: "gate-ci-parity" },
    { subtree: "packages/library/src/store", owner: "library-cli" },
  ]);
});

test("EVERY way of failing to read is reported as unread, never as an empty map — a set the composer refuses included", () => {
  // The asymmetry is the design's centre: a non-empty `unread` stands the claim check down, while a
  // silently-empty map would refuse every real subtree id. So each of these must land in `unread`.
  const sound = fragmentsOf({ ...REST, sourceOwnership: { subtrees: { "packages/a/src": "a" } } });
  const cases: Array<[string, string | null]> = [
    ["uncomposed", null],
    ["absent", path.join(tmpdir(), "no-such-manifest-tree-4471")],
    ["an unparseable fragment", tree({ ...sound, "source-ownership/b.json": "{ not json" })],
    ["no sourceOwnership anywhere", written()],
    ["a tree that cannot be listed", blockedTree()],
    ["sourceOwnership is not an object", written("nope")],
    ["no subtrees map", written({ baseline: { date: "2026-08-06", files: 1, unowned: 0 } })],
    ["subtrees is not an object", written({ subtrees: "nope" })],
    ["a non-string owner — refused, never skipped", written({ subtrees: { "packages/bad/src": 42 } })],
    ["one declaration covering another", written(COVERED)],
    ["a stray file in the tree", tree({ ...sound, "stray.txt": "junk" })],
  ];
  for (const [why, root] of cases) {
    const map = readSourceOwnershipMap(root);
    assert.equal(map.subtrees.length, 0, why);
    assert.equal(map.unread.length, 1, `${why} must report itself unread`);
  }
});

test("a refused set is unread WITH the composer's own reasons, so the repair travels with the refusal", () => {
  const [why] = readSourceOwnershipMap(written(COVERED)).unread;
  assert.match(
    why ?? "",
    /^the repo manifest did not compose — sourceOwnership\.subtrees\["packages\/cli\/src\/a\.ts"\] \(a\) is covered by "packages\/cli\/src" \(cli, in source-ownership\/cli\.json\)/,
  );
  assert.deepEqual(readSourceOwnershipMap(null).unread, ["no repo manifest was supplied, so declared subtrees are unknown"]);
  const absent = path.join(tmpdir(), "no-such-manifest-tree-4471");
  assert.deepEqual(readSourceOwnershipMap(absent).unread, [
    `the repo manifest did not compose — the manifest fragment tree is absent at ${absent}`,
  ]);
});

test("EVERY reason the composer gave travels with the refusal, each its own `; `-separated clause", () => {
  // Two covered declarations, so two reasons — one repair each, and neither may run into the other.
  const twice = { subtrees: { ...COVERED.subtrees, "packages/drive/src": "drive", "packages/drive/src/b.ts": "b" } };
  const [why = ""] = readSourceOwnershipMap(written(twice)).unread;
  const prefix = "the repo manifest did not compose — ";
  assert.ok(why.startsWith(prefix), why);
  const covered = why
    .slice(prefix.length)
    .split("; ")
    .map((reason) => /^sourceOwnership\.subtrees\["([^"]+)"\] \(\w+\) is covered by /.exec(reason)?.[1]);
  assert.deepEqual(covered.sort(), ["packages/cli/src/a.ts", "packages/drive/src/b.ts"], why);
});

test("a deliberately EMPTY subtrees map reads CLEAN — declaring nothing is not failing to read", () => {
  const map = readSourceOwnershipMap(written({ subtrees: {} }));
  assert.deepEqual(map.subtrees, []);
  assert.deepEqual(map.unread, []);
});

test("a malformed baseline is dropped, not escalated — the trend is cosmetic, the map is not", () => {
  const map = readSourceOwnershipMap(written({ baseline: { date: "2026-08-06", files: "lots" }, subtrees: { "packages/a/src": "a" } }));
  assert.equal(map.baseline, undefined);
  assert.deepEqual(map.unread, [], "one bad number must not stand every claim in the factory down");
});

test("a well-formed baseline is read", () => {
  const root = written({ baseline: { date: "2026-08-06", files: 521, unowned: 483 }, subtrees: {} });
  assert.deepEqual(readSourceOwnershipMap(root).baseline, {
    date: "2026-08-06",
    files: 521,
    unowned: 483,
  });
});

// ---------------------------------------------------------------------------
// The map at a commit
// ---------------------------------------------------------------------------

/** A git that knows exactly `refs[ref]` at each ref, and lists a directory the way `ls-tree -r` does. */
function gitOf(refs: Readonly<Record<string, Readonly<Record<string, string>>>>, unlistable: readonly string[] = []): GitTreeReader {
  return {
    show: (ref, file) => refs[ref]?.[file] ?? null,
    list: (ref, dir) => (unlistable.includes(ref) ? null : Object.keys(refs[ref] ?? {}).filter((file) => file.startsWith(`${dir}/`))),
  };
}

/** The files a commit holds: its whole manifest, as the fragment tree. */
function committed(sourceOwnership: ManifestJson): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fragmentsOf({ ...REST, sourceOwnership })).map(([file, text]) => [`${REPO_MANIFEST_TREE}/${file}`, text]),
  );
}

const SOURCE = "the merge-base repo manifest";

test("the map at a commit is composed from that commit's tree — the seam the working tree reads through", () => {
  const git = gitOf({ after: committed({ subtrees: { "packages/cli/src/gate*.ts": "gate-ci-parity" } }) });
  assert.deepEqual(readSourceOwnershipMapAt(git, "after", SOURCE), {
    subtrees: [{ subtree: "packages/cli/src/gate*.ts", owner: "gate-ci-parity" }],
    baseline: undefined,
    unread: [],
  });
});

test("nothing at a commit is read but its tree — an aggregate beside it is never consulted", () => {
  // The compatibility read left Git with the aggregate. A commit between the fragment tree's arrival and the
  // aggregate's departure carries both, and what the aggregate says must reach no answer.
  const files = {
    ...committed({ subtrees: { "packages/cli/src/gate*.ts": "gate-ci-parity" } }),
    "repo-manifest.json": JSON.stringify({ sourceOwnership: { subtrees: { "packages/elsewhere/src": "elsewhere" } } }),
  };
  const asked: string[] = [];
  const git: GitTreeReader = {
    show: (_ref, file) => {
      asked.push(file);
      return files[file] ?? null;
    },
    list: (_ref, dir) => Object.keys(files).filter((file) => file.startsWith(`${dir}/`)),
  };
  assert.deepEqual(readSourceOwnershipMapAt(git, "both", SOURCE).subtrees, [
    { subtree: "packages/cli/src/gate*.ts", owner: "gate-ci-parity" },
  ]);
  assert.equal(asked.length, 6, "every one of the tree's six fragments was read, and nothing else");
  assert.deepEqual(asked.filter((file) => !file.startsWith(`${REPO_MANIFEST_TREE}/`)), []);
});

test("a commit with no fragment tree predates ADR-0556, and is UNREAD naming the repair — never read another way", () => {
  // History is not migrated, and the legacy reader left Git with the aggregate: a merge base from before
  // the fragments is a base to move past, not one to charge a branch against.
  const legacy = {
    "repo-manifest.json": JSON.stringify({ ...REST, sourceOwnership: { subtrees: { "packages/cli/src": "cli" } } }),
  };
  for (const [ref, git] of [
    ["gone", gitOf({})],
    ["before", gitOf({ before: legacy })],
  ] as const) {
    assert.deepEqual(readSourceOwnershipMapAt(git, ref, SOURCE), {
      subtrees: [],
      baseline: undefined,
      unread: [
        `the merge-base repo manifest has no repo-manifest/ fragment tree at ${ref}, so that commit predates ADR-0556 — ` +
          "merge a freshly fetched origin/main to move the merge base past it",
      ],
    });
  }
});

test("EVERY way a commit's tree fails to read is unread, and says which read broke", () => {
  const sound = committed({ subtrees: { "packages/a/src": "a" } });
  // A tree from between the source-ownership move and the rest: every other section still sat in the aggregate.
  const partial = Object.fromEntries(
    splitManifest({ sourceOwnership: { subtrees: { "packages/a/src": "a" } } }).map((f) => [`${REPO_MANIFEST_TREE}/${f.path}`, f.text]),
  );
  const unshown: GitTreeReader = { show: () => null, list: () => ["repo-manifest/source-ownership/a.json"] };
  const cases: Array<[string, GitTreeReader, string, RegExp]> = [
    ["a tree git could not list", gitOf({ after: sound }, ["after"]), "after", /did not compose — the manifest fragment tree repo-manifest\/ could not be listed at after$/],
    ["a listed fragment git will not show", unshown, "half", /could not be read in full at half \(repo-manifest\/source-ownership\/a\.json\)$/],
    ["a tree that does not compose", gitOf({ after: committed(COVERED) }), "after", /did not compose — .* is covered by "packages\/cli\/src"/],
    ["a tree still missing the sections that moved later", gitOf({ partial }), "partial", /did not compose — .*no fragment supplies root/],
  ];
  for (const [why, git, ref, message] of cases) {
    const map = readSourceOwnershipMapAt(git, ref, SOURCE);
    assert.deepEqual(map.subtrees, [], why);
    assert.equal(map.unread.length, 1, why);
    assert.match(map.unread[0] ?? "", message, why);
  }
});

// ---------------------------------------------------------------------------
// The LIVE map, held to the resolver
// ---------------------------------------------------------------------------

/** The real map as a complete universe — subtrees only, which is all these assertions are about. */
function liveUniverse(): ClaimUniverse {
  const source = readSubtreeTargets(LIVE_TREE);
  assert.deepEqual(source.unread, [], "the committed manifest must read in full");
  return { targets: source.targets, nonClaimable: [], complete: true, unreadSources: [] };
}

test("EVERY declaration in the live manifest resolves as a claim id", () => {
  const universe = liveUniverse();
  assert.ok(universe.targets.length > 300, "the map is authored in full (372 at ADR-0317 D2)");
  for (const target of universe.targets) {
    const r = resolveClaimId(target.id, universe);
    assert.equal(r.verdict, "resolved", `${target.id} must be claimable by its own key`);
    if (r.verdict !== "resolved") return;
    assert.equal(r.target.owner, target.owner);
  }
});

test("no live declaration key is mangled by the pasted-path normalisation", () => {
  // The measured hazard runs the other way — `stories/studio` pasted where an id belonged — and
  // this is the check that widening the namespace did not turn that remedy into a new defect. If a
  // future entry ever lands under `stories/` or ends `.md`, this reds rather than silently making
  // that subtree claimable only by a mangled name.
  for (const target of liveUniverse().targets) {
    assert.equal(normalisePastedPath(target.id), target.id, target.id);
  }
});

test("no live declaration key could shadow a node id — the two namespaces cannot collide", () => {
  // Exact resolution takes the FIRST matching target, so a subtree keyed like a node id would
  // silently decide which of the two a claim meant. Node ids are bare slugs and subtree keys are
  // paths, and this is the assertion that keeps it that way.
  for (const target of liveUniverse().targets) {
    assert.ok(
      target.id.includes("/"),
      `${target.id} has no path separator, so it could collide with a node id`,
    );
  }
});
