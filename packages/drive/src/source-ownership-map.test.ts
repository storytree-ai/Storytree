import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalisePastedPath, resolveClaimId, type ClaimUniverse } from "./claim-namespace.js";
import { readSubtreeTargets } from "./claim-universe.js";
import { splitManifest, type ManifestJson } from "./manifest-fragments.js";
import type { GitTreeReader } from "./manifest-fragments-read.js";
import { readSourceOwnershipMap, readSourceOwnershipMapAt } from "./source-ownership-map.js";

/**
 * The declared subtree map (ADR-0317 D2) as a CLAIM SOURCE (D3).
 *
 * Three halves, and the last one is deliberately NOT hermetic:
 *
 *  1. The reader's contract over throwaway manifests laid out as the real one is — `repo-manifest.json`
 *     beside a fragment tree, composed (ADR-0556). Every way it can fail to read must be reported as
 *     unread, because `claim-universe.ts` turns a non-empty `unread` into "stand down" and anything it
 *     swallowed instead would become a refusal on a real id.
 *  2. The map at a COMMIT, read through git: composed from the commit's tree where it has one, and read
 *     the legacy way — explicitly, and only there — where it has none.
 *  3. THE LIVE MANIFEST. Every one of the map's real keys must resolve as a claim id, and none may
 *     be mangled by the pasted-path normalisation or shadow a node id. `claim-namespace.test.ts` is
 *     frozen and hermetic on purpose; that is exactly why it cannot answer this — its fixture is
 *     two hand-written keys, and the property that matters is over every key the repo actually
 *     declares. This file is in `drive` beside its sibling live-manifest suites
 *     (`write-authority-rules.test.ts`, `repo-root-drivable.test.ts`) and needs no DB and no
 *     network: the manifest and its fragments are committed files.
 */

/** This file sits at `<repo>/packages/drive/src/`. */
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const LIVE_MANIFEST = path.join(REPO_ROOT, "repo-manifest.json");

/** Every section a composed manifest needs besides the source-ownership map — each empty, which is a legal statement. */
const REST = {
  root: { files: {}, dirs: {} },
  docs: { allowedDirs: {}, files: {} },
  packageOwnership: { organisms: {}, foundational: [], surfaces: {} },
  hierarchyCamps: { readers: {} },
  hostedStories: { register: {} },
};

/**
 * A throwaway manifest: `aggregate` as `repo-manifest.json` (text, or a value to serialise), and — when
 * given — `sourceOwnership` split into the fragment tree beside it, exactly as the real map is.
 */
function write(aggregate: unknown, sourceOwnership?: ManifestJson): string {
  const dir = mkdtempSync(path.join(tmpdir(), "source-ownership-map-"));
  const file = path.join(dir, "repo-manifest.json");
  writeFileSync(file, typeof aggregate === "string" ? aggregate : JSON.stringify(aggregate), "utf8");
  if (sourceOwnership !== undefined) {
    for (const fragment of splitManifest({ sourceOwnership })) {
      const out = path.join(dir, "repo-manifest", ...fragment.path.split("/"));
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, fragment.text, "utf8");
    }
  }
  return file;
}

/** A manifest whose fragment tree cannot be listed, because the path it would sit at is a file. */
function blockedTree(): string {
  const file = write(REST);
  writeFileSync(path.join(path.dirname(file), "repo-manifest"), "not a directory", "utf8");
  return file;
}

const COVERED = { subtrees: { "packages/cli/src": "cli", "packages/cli/src/a.ts": "a" } };

// ---------------------------------------------------------------------------
// The reader's contract
// ---------------------------------------------------------------------------

test("declarations are read as {subtree, owner} out of the fragment tree, and `$`-prefixed prose keys are not declarations", () => {
  const file = write(REST, {
    $comment: "the authoring rules",
    $section_cli: "—",
    subtrees: {
      $comment: "prose",
      $section_cli: "—",
      "packages/library/src/store": "library-cli",
      "packages/cli/src/gate*.ts": "gate-ci-parity",
    },
  });
  const map = readSourceOwnershipMap(file);
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
  const cases: Array<[string, string | null]> = [
    ["uncomposed", null],
    ["absent", path.join(tmpdir(), "no-such-manifest-4471.json")],
    ["unparseable aggregate", write("{ not json")],
    ["no sourceOwnership anywhere", write(REST)],
    ["a tree that cannot be listed", blockedTree()],
    ["sourceOwnership is not an object", write(REST, "nope")],
    ["no subtrees map", write(REST, { baseline: { date: "2026-08-06", files: 1, unowned: 0 } })],
    ["subtrees is not an object", write(REST, { subtrees: "nope" })],
    ["a non-string owner — refused, never skipped", write(REST, { subtrees: { "packages/bad/src": 42 } })],
    ["one declaration covering another", write(REST, COVERED)],
    ["a section with two homes", write({ ...REST, sourceOwnership: { subtrees: {} } }, { subtrees: { "packages/a/src": "a" } })],
  ];
  for (const [why, file] of cases) {
    const map = readSourceOwnershipMap(file);
    assert.equal(map.subtrees.length, 0, why);
    assert.equal(map.unread.length, 1, `${why} must report itself unread`);
  }
});

test("a refused set is unread WITH the composer's own reasons, so the repair travels with the refusal", () => {
  const [why] = readSourceOwnershipMap(write(REST, COVERED)).unread;
  assert.match(
    why ?? "",
    /^the repo manifest did not compose — sourceOwnership\.subtrees\["packages\/cli\/src\/a\.ts"\] \(a\) is covered by "packages\/cli\/src" \(cli, in source-ownership\/cli\.json\)/,
  );
  assert.deepEqual(readSourceOwnershipMap(null).unread, ["no repo manifest was supplied, so declared subtrees are unknown"]);
});

test("EVERY reason the composer gave travels with the refusal, each its own `; `-separated clause", () => {
  // Two covered declarations, so two reasons — one repair each, and neither may run into the other.
  const twice = { subtrees: { ...COVERED.subtrees, "packages/drive/src": "drive", "packages/drive/src/b.ts": "b" } };
  const [why = ""] = readSourceOwnershipMap(write(REST, twice)).unread;
  const prefix = "the repo manifest did not compose — ";
  assert.ok(why.startsWith(prefix), why);
  const covered = why
    .slice(prefix.length)
    .split("; ")
    .map((reason) => /^sourceOwnership\.subtrees\["([^"]+)"\] \(\w+\) is covered by /.exec(reason)?.[1]);
  assert.deepEqual(covered.sort(), ["packages/cli/src/a.ts", "packages/drive/src/b.ts"], why);
});

test("a deliberately EMPTY subtrees map reads CLEAN — declaring nothing is not failing to read", () => {
  const map = readSourceOwnershipMap(write(REST, { subtrees: {} }));
  assert.deepEqual(map.subtrees, []);
  assert.deepEqual(map.unread, []);
});

test("a malformed baseline is dropped, not escalated — the trend is cosmetic, the map is not", () => {
  const file = write(REST, { baseline: { date: "2026-08-06", files: "lots" }, subtrees: { "packages/a/src": "a" } });
  const map = readSourceOwnershipMap(file);
  assert.equal(map.baseline, undefined);
  assert.deepEqual(map.unread, [], "one bad number must not stand every claim in the factory down");
});

test("a well-formed baseline is read", () => {
  const file = write(REST, { baseline: { date: "2026-08-06", files: 521, unowned: 483 }, subtrees: {} });
  assert.deepEqual(readSourceOwnershipMap(file).baseline, {
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

/** The files a commit holds once its map lives in fragments: the aggregate without it, and the tree. */
function committed(sourceOwnership: ManifestJson) {
  return {
    "repo-manifest.json": JSON.stringify(REST),
    ...Object.fromEntries(splitManifest({ sourceOwnership }).map((f) => [`repo-manifest/${f.path}`, f.text])),
  };
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

test("a commit from before the map moved has no tree, and its aggregate is read the LEGACY way — explicitly, and only there", () => {
  // History is not migrated. A base from before `repo-manifest-covered-declarations-resolved` still
  // carries a covered pair the composer would refuse, so reading it through the composer would blind the
  // check on every branch cut before that landing.
  const legacy = JSON.stringify({
    ...REST,
    sourceOwnership: {
      baseline: { date: "2026-08-18", files: 643, unowned: 45 },
      subtrees: { $comment: "prose", ...COVERED.subtrees, "packages/bad/src": 42 },
    },
  });
  assert.deepEqual(readSourceOwnershipMapAt(gitOf({ before: { "repo-manifest.json": legacy } }), "before", SOURCE), {
    subtrees: [
      { subtree: "packages/cli/src", owner: "cli" },
      { subtree: "packages/cli/src/a.ts", owner: "a" },
    ],
    baseline: { date: "2026-08-18", files: 643, unowned: 45 },
    unread: [],
  });
});

test("EVERY way a commit's map fails to read is unread, and says which read broke", () => {
  const tree = committed({ subtrees: { "packages/a/src": "a" } });
  const withoutAggregate = Object.fromEntries(Object.entries(tree).filter(([file]) => file !== "repo-manifest.json"));
  const cases: Array<[string, GitTreeReader, string, RegExp]> = [
    ["no aggregate and no tree", gitOf({}), "gone", /^the merge-base repo manifest could not be read at gone$/],
    ["an unparseable legacy aggregate", gitOf({ old: { "repo-manifest.json": "{ nope" } }), "old", /^the merge-base repo manifest is unreadable \(/],
    ["a legacy aggregate that is null", gitOf({ old: { "repo-manifest.json": "null" } }), "old", /declares no `sourceOwnership` block$/],
    ["a legacy aggregate with no map", gitOf({ old: { "repo-manifest.json": JSON.stringify(REST) } }), "old", /declares no `sourceOwnership` block$/],
    [
      "a legacy map with no subtrees",
      gitOf({ old: { "repo-manifest.json": JSON.stringify({ sourceOwnership: { subtrees: "nope" } }) } }),
      "old",
      /declares no `sourceOwnership\.subtrees` map$/,
    ],
    ["a tree git could not list", gitOf({ after: tree }, ["after"]), "after", /did not compose — the manifest fragment tree repo-manifest\/ could not be listed at after$/],
    ["a tree whose aggregate git will not show", gitOf({ half: withoutAggregate }), "half", /did not compose — repo-manifest\.json: could not be read at half$/],
    ["a tree that does not compose", gitOf({ after: committed(COVERED) }), "after", /did not compose — .* is covered by "packages\/cli\/src"/],
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
  const source = readSubtreeTargets(LIVE_MANIFEST);
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
