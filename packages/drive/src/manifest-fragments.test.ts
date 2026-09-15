import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  composedManifestText,
  composeManifest,
  composeRepoManifest,
  coveringCandidates,
  DOMAIN_SHARD,
  duplicateKeyPaths,
  MANIFEST_DOMAINS,
  refusalReasons,
  REPO_MANIFEST,
  REPO_MANIFEST_TREE,
  splitManifest,
  type ManifestComposition,
  type ManifestCompositionFault,
  type ManifestFragmentSource,
  type ManifestJson,
  type ManifestObject,
} from "./manifest-fragments.js";
import {
  composeManifestTree,
  manifestFragmentRoot,
  readManifestFragmentTree,
  readManifestFragmentTreeAt,
  readRepoManifest,
  type GitTreeReader,
} from "./manifest-fragments-read.js";

/**
 * The manifest fragment contract and its composer (`repo-manifest-fragmentation-arc`).
 *
 * Four parts:
 *  1. The contract over a small aggregate built here: split, compose, and every fault the composer
 *     refuses — each against the unbroken set, which composes, so no refusal can pass because the
 *     whole set was broken. Each refusal's wording is pinned once, because the wording is the repair.
 *  2. The pieces it rests on: the covering search's candidate bound, the duplicate-key scan, the
 *     canonical form, and the disk reader.
 *  3. THE REPOSITORY'S MANIFEST as its readers get it: the aggregate composed with the fragment tree
 *     beside it, off the disk and at a commit, with one home per section — and the concurrency witness:
 *     two owners' changes landing in two files while the set is still judged whole.
 *  4. THE LIVE MANIFEST. `repo-manifest.json` and `repo-manifest/` compose, and the composition splits at
 *     the claim grain and comes back as itself — every declaration and every note, with nothing set
 *     aside. No DB and no network: the manifest and its fragments are committed files.
 */

/** This file sits at `<repo>/packages/drive/src/`. */
const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const LIVE_MANIFEST = path.join(REPO_ROOT, "repo-manifest.json");

const OBT = "source-ownership/organism-boundary-tooling.json";

const OBT_DECLARATIONS = {
  "packages/drive/src/subtree-match.ts": "organism-boundary-tooling",
  "packages/drive/src/source-ownership-map.ts": "organism-boundary-tooling",
  "packages/cli/src/*boundaries*.ts": "organism-boundary-tooling",
};

/**
 * A small aggregate in the manifest's own shape. Its keys are out of code-unit order at every level —
 * insertion order, its reverse and sorted order all differ — so no ordering assertion over what
 * composes from it can pass by accident; and its prose carries non-ASCII, as the real notes do.
 */
function aggregate(): ManifestObject {
  return {
    $comment: "the repo-surface allow-list — as it began",
    root: {
      files: { "package.json": "workspace root", "README.md": "front door" },
      dirs: { packages: "workspace packages" },
    },
    docs: { allowedDirs: { research: "decision provenance" }, files: { "open-questions.md": "the backlog" } },
    packageOwnership: {
      $comment: "the package map",
      organisms: { "@storytree/drive": "drive-machinery", "@storytree/cli": "cli" },
      foundational: ["@storytree/proof-protocol"],
      $comment_surfaces: "consuming surfaces",
      surfaces: { studio: "studio" },
    },
    sourceOwnership: {
      $comment: "the authoring rules → disjoint declarations",
      baseline: { $comment: "the trend", date: "2026-08-18", files: 643, unowned: 45 },
      subtrees: {
        $section_drive: "packages/drive — the drivers",
        "packages/drive/src/subtree-match.ts": "organism-boundary-tooling",
        "packages/cli/src/gate*.ts": "gate-ci-parity",
        "packages/drive/src/source-ownership-map.ts": "organism-boundary-tooling",
        $section_cli: "packages/cli — the verb surface",
        // It and `gate*.ts` INTERSECT — both match a `gate-boundaries.ts` — and neither covers the other.
        "packages/cli/src/*boundaries*.ts": "organism-boundary-tooling",
      },
    },
    hierarchyCamps: {
      $comment: "the reader camps",
      readers: {
        "packages/cli/src/tree.ts": { reads: ["live", "checkout"], camp: "render", fallback: "offline", because: "b" },
      },
    },
    hostedStories: { $comment: "the grandfather register", register: { desktop: "hosted in studio" } },
  };
}

function fragment(filePath: string, body: ManifestJson): ManifestFragmentSource {
  return { path: filePath, text: JSON.stringify(body) };
}

/** The fixture's fragments with `extra` added — or put in place of the fragment at the same path. */
function fragments(...extra: readonly ManifestFragmentSource[]): ManifestFragmentSource[] {
  const replaced = new Set(extra.map((f) => f.path));
  return [...splitManifest(aggregate()).filter((f) => !replaced.has(f.path)), ...extra];
}

function isObj(value: ManifestJson | undefined): value is ManifestObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The object at `keys` under `value` — failing the test, rather than answering undefined, when there is none. */
function objectAt(value: ManifestJson, ...keys: readonly string[]): ManifestObject {
  const found = keys.reduce<ManifestJson | undefined>((node, key) => (isObj(node) ? node[key] : undefined), value);
  if (!isObj(found)) assert.fail(`no object at ${keys.join(".")}`);
  return found;
}

/** `value` with the node at `keys` set to `next` — or removed, when `next` is undefined. */
function edited(value: ManifestObject, keys: readonly string[], next: ManifestJson | undefined): ManifestObject {
  const [head, ...rest] = keys;
  if (head === undefined) return value;
  const current = value[head];
  const replacement = rest.length === 0 ? next : edited(isObj(current) ? current : {}, rest, next);
  const out: Record<string, ManifestJson> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== head) out[key] = child;
  }
  if (replacement !== undefined) out[head] = replacement;
  return out;
}

function manifestOf(result: ManifestComposition): ManifestObject {
  if (!result.ok) assert.fail(`the set was refused:\n${result.faults.map((f) => f.message).join("\n")}`);
  return result.manifest;
}

function faultsOf(result: ManifestComposition): readonly ManifestCompositionFault[] {
  if (result.ok) assert.fail("the set composed, and it should have been refused");
  return result.faults;
}

/** What each refusal is ABOUT — kind, manifest path, fragments. Its wording is pinned on its own. */
function about(faults: readonly ManifestCompositionFault[]) {
  return faults.map((f) => [f.kind, f.at, f.fragments]);
}

function tree(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(path.join(tmpdir(), "manifest-fragments-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text, "utf8");
  }
  return root;
}

// ---------------------------------------------------------------------------
// Split and compose
// ---------------------------------------------------------------------------

test("the domains partition the manifest: every section has exactly one fragment directory", () => {
  assert.deepEqual(MANIFEST_DOMAINS.flatMap((d) => d.sections).sort(), [
    "docs",
    "hierarchyCamps",
    "hostedStories",
    "packageOwnership",
    "root",
    "sourceOwnership",
  ]);
  assert.equal(new Set(MANIFEST_DOMAINS.map((d) => d.dir)).size, MANIFEST_DOMAINS.length);
  assert.equal(DOMAIN_SHARD, "_domain");
});

test("an aggregate splits into one fragment per domain, and one more per source OWNER — the claim grain", () => {
  const split = splitManifest(aggregate());
  assert.deepEqual(
    split.map((f) => f.path),
    [
      "hierarchy-camps/_domain.json",
      "hosted-stories/_domain.json",
      "package-ownership/_domain.json",
      "repo-surface/_domain.json",
      "source-ownership/_domain.json",
      "source-ownership/gate-ci-parity.json",
      OBT,
    ],
  );
  const body = (filePath: string): ManifestJson => JSON.parse(split.find((f) => f.path === filePath)?.text ?? "null");
  assert.deepEqual(body(OBT), { sourceOwnership: { subtrees: OBT_DECLARATIONS } });
  assert.deepEqual(body("source-ownership/gate-ci-parity.json"), {
    sourceOwnership: { subtrees: { "packages/cli/src/gate*.ts": "gate-ci-parity" } },
  });
  const whole = aggregate();
  assert.deepEqual(body("repo-surface/_domain.json"), {
    $comment: whole["$comment"] ?? null,
    root: whole["root"] ?? null,
    docs: whole["docs"] ?? null,
  });
  assert.deepEqual(body("package-ownership/_domain.json"), { packageOwnership: whole["packageOwnership"] ?? null });
});

test("only source ownership is split by owner — any other section stays whole in its domain shard, whatever its parts are called", () => {
  const parsed = (manifest: ManifestObject) => splitManifest(manifest).map((f) => [f.path, JSON.parse(f.text)]);
  assert.deepEqual(parsed({ hostedStories: { subtrees: { "packages/x": "someone" } } }), [
    ["hosted-stories/_domain.json", { hostedStories: { subtrees: { "packages/x": "someone" } } }],
  ]);
  assert.deepEqual(parsed({ sourceOwnership: "not a section" }), [["source-ownership/_domain.json", { sourceOwnership: "not a section" }]]);
});

test("a fragment is written as the house writes JSON: keys sorted, two-space indent, newline-terminated, prose unescaped", () => {
  const text = splitManifest(aggregate()).find((f) => f.path === "source-ownership/_domain.json")?.text;
  assert.equal(
    text,
    [
      "{",
      '  "sourceOwnership": {',
      '    "$comment": "the authoring rules → disjoint declarations",',
      '    "baseline": {',
      '      "$comment": "the trend",',
      '      "date": "2026-08-18",',
      '      "files": 643,',
      '      "unowned": 45',
      "    },",
      '    "subtrees": {',
      '      "$section_cli": "packages/cli — the verb surface",',
      '      "$section_drive": "packages/drive — the drivers"',
      "    }",
      "  }",
      "}",
      "",
    ].join("\n"),
  );
});

test("the fragments of an aggregate compose back into it — every declaration, every note, every value", () => {
  assert.deepEqual(manifestOf(composeManifest(splitManifest(aggregate()))), aggregate());
});

test("declarations that merely INTERSECT compose — refusing them would refuse the real map", () => {
  const subtrees = objectAt(manifestOf(composeManifest(fragments())), "sourceOwnership", "subtrees");
  assert.equal(subtrees["packages/cli/src/gate*.ts"], "gate-ci-parity");
  assert.equal(subtrees["packages/cli/src/*boundaries*.ts"], "organism-boundary-tooling");
});

test("composition is order-free: every order of the same fragments composes to the same bytes, keys sorted at every depth", () => {
  const split = splitManifest(aggregate());
  const orders = [split, [...split].reverse(), [...split.slice(3), ...split.slice(0, 3)]];
  const composed = orders.map((order) => manifestOf(composeManifest(order)));
  assert.equal(new Set(composed.map((m) => JSON.stringify(m))).size, 1);
  const [manifest] = composed;
  if (manifest === undefined) assert.fail("nothing composed");
  assert.deepEqual(Object.keys(manifest), [
    "$comment",
    "docs",
    "hierarchyCamps",
    "hostedStories",
    "packageOwnership",
    "root",
    "sourceOwnership",
  ]);
  assert.deepEqual(Object.keys(objectAt(manifest, "sourceOwnership", "subtrees")), [
    "$section_cli",
    "$section_drive",
    "packages/cli/src/*boundaries*.ts",
    "packages/cli/src/gate*.ts",
    "packages/drive/src/source-ownership-map.ts",
    "packages/drive/src/subtree-match.ts",
  ]);
  const reader = objectAt(manifest, "hierarchyCamps", "readers", "packages/cli/src/tree.ts");
  assert.deepEqual(Object.keys(reader), ["because", "camp", "fallback", "reads"]);
  assert.deepEqual(reader["reads"], ["live", "checkout"], "a list keeps its own order — that is data");
});

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

test("an empty fragment set is refused as the six sections nobody supplied — never composed into an empty manifest", () => {
  assert.deepEqual(about(faultsOf(composeManifest([]))), [
    ["missing-section", "docs", []],
    ["missing-section", "hierarchyCamps", []],
    ["missing-section", "hostedStories", []],
    ["missing-section", "packageOwnership", []],
    ["missing-section", "root", []],
    ["missing-section", "sourceOwnership", []],
  ]);
});

test("every section but the baseline is required: removing any one is refused naming it — and nothing else", () => {
  const required = [
    ["root"],
    ["root", "files"],
    ["root", "dirs"],
    ["docs"],
    ["docs", "allowedDirs"],
    ["docs", "files"],
    ["packageOwnership"],
    ["packageOwnership", "organisms"],
    ["packageOwnership", "foundational"],
    ["packageOwnership", "surfaces"],
    ["sourceOwnership"],
    ["sourceOwnership", "subtrees"],
    ["hierarchyCamps"],
    ["hierarchyCamps", "readers"],
    ["hostedStories"],
    ["hostedStories", "register"],
  ];
  for (const keys of required) {
    const refused = faultsOf(composeManifest(splitManifest(edited(aggregate(), keys, undefined))));
    assert.deepEqual(about(refused), [["missing-section", keys.join("."), []]], keys.join("."));
  }
  const withoutBaseline = edited(aggregate(), ["sourceOwnership", "baseline"], undefined);
  assert.deepEqual(manifestOf(composeManifest(splitManifest(withoutBaseline))), withoutBaseline);
});

test("a section supplied EMPTY is a statement and composes — only an ABSENT one is refused", () => {
  const empties: [readonly string[], ManifestJson][] = [
    [["hostedStories", "register"], {}],
    [["sourceOwnership", "subtrees"], {}],
    [["packageOwnership", "foundational"], []],
  ];
  for (const [keys, empty] of empties) {
    const manifest = edited(aggregate(), keys, empty);
    assert.deepEqual(manifestOf(composeManifest(splitManifest(manifest))), manifest, keys.join("."));
  }
});

test("a file that is not <domain>/<shard>.json is refused by name — never skipped, which would drop what it declares", () => {
  const strays = [
    "source-ownership/Organism.json",
    "source-ownership/owner_x.json",
    "source-ownership/-cli.json",
    "source-ownership/cli-.json",
    "source-ownership/.json",
    "sourceownership/cli.json",
    "hidden-stories/_domain.json",
    "source-ownership/nested/cli.json",
    "cli.json",
    "source-ownership/cli.jsonc",
  ];
  for (const stray of strays) {
    const refused = faultsOf(composeManifest([...fragments(), { path: stray, text: "{}" }]));
    assert.deepEqual(about(refused), [["malformed-fragment", "", [stray]]], stray);
    assert.match(refused[0]?.message ?? "", /not a fragment path/, stray);
  }
});

test("a fragment that is not a JSON object is refused, and nothing in it is composed", () => {
  const cases: [string, RegExp][] = [
    ['{ "sourceOwnership": ', /is not valid JSON/],
    ["[]", /does not hold a JSON object/],
    ["null", /does not hold a JSON object/],
    ['"text"', /does not hold a JSON object/],
  ];
  for (const [text, why] of cases) {
    const refused = faultsOf(composeManifest([...fragments(), { path: "source-ownership/tree-view.json", text }]));
    assert.deepEqual(about(refused), [["malformed-fragment", "", ["source-ownership/tree-view.json"]]], text);
    assert.match(refused[0]?.message ?? "", why, text);
  }
});

test("a value of the wrong shape is refused where it sits", () => {
  const cases: [ManifestFragmentSource, string][] = [
    [fragment("repo-surface/more.json", { root: { files: { "x.md": "" } } }), 'root.files["x.md"]'],
    [fragment("repo-surface/more.json", { root: { files: { "": "why" } } }), 'root.files[""]'],
    [fragment("repo-surface/more.json", { root: { dirs: [] } }), "root.dirs"],
    [fragment("repo-surface/more.json", { root: { files: null } }), "root.files"],
    [fragment("repo-surface/more.json", { root: "files" }), "root"],
    [fragment("repo-surface/more.json", { $comment_more: 5 }), "$comment_more"],
    [fragment("package-ownership/more.json", { packageOwnership: { foundational: "@storytree/x" } }), "packageOwnership.foundational"],
    [fragment("package-ownership/more.json", { packageOwnership: { foundational: ["@storytree/x", 3] } }), "packageOwnership.foundational"],
    [fragment("hierarchy-camps/more.json", { hierarchyCamps: { readers: { "a.ts": "prove" } } }), 'hierarchyCamps.readers["a.ts"]'],
    [fragment("hierarchy-camps/more.json", { hierarchyCamps: { readers: { "a.ts": ["prove"] } } }), 'hierarchyCamps.readers["a.ts"]'],
    [fragment("hierarchy-camps/more.json", { hierarchyCamps: { readers: { $note: {} } } }), "hierarchyCamps.readers.$note"],
  ];
  for (const [extra, at] of cases) {
    assert.deepEqual(about(faultsOf(composeManifest(fragments(extra)))), [["malformed-fragment", at, [extra.path]]], extra.text);
  }
  // …and where the aggregate itself carries one, the split hands it to the composer to refuse by name.
  const aggregateCases: [readonly string[], ManifestJson, string][] = [
    [["sourceOwnership", "baseline"], "yesterday", "sourceOwnership.baseline"],
    [["sourceOwnership", "subtrees", "packages/x.ts"], 7, 'sourceOwnership.subtrees["packages/x.ts"]'],
  ];
  for (const [keys, bad, at] of aggregateCases) {
    const refused = faultsOf(composeManifest(splitManifest(edited(aggregate(), keys, bad))));
    assert.deepEqual(about(refused), [["malformed-fragment", at, ["source-ownership/_domain.json"]]], at);
  }
});

test("a section the contract does not define is refused — at the top, and inside a section it does define", () => {
  const inner = faultsOf(composeManifest(fragments(fragment("package-ownership/more.json", { packageOwnership: { orgnisms: {} } }))));
  assert.deepEqual(about(inner), [["malformed-fragment", "packageOwnership.orgnisms", ["package-ownership/more.json"]]]);
  const top = faultsOf(composeManifest(fragments(fragment("repo-surface/more.json", { surfaceOwnership: {} }))));
  assert.deepEqual(about(top), [["malformed-fragment", "surfaceOwnership", ["repo-surface/more.json"]]]);
});

test("a section supplied from another domain's directory is refused, naming the directory it belongs in", () => {
  const section = faultsOf(composeManifest(fragments(fragment("repo-surface/more.json", { hostedStories: { register: { x: "y" } } }))));
  assert.deepEqual(about(section), [["misplaced-declaration", "hostedStories", ["repo-surface/more.json"]]]);
  const note = faultsOf(composeManifest(fragments(fragment("hosted-stories/more.json", { $note: "x" }))));
  assert.deepEqual(about(note), [["misplaced-declaration", "$note", ["hosted-stories/more.json"]]]);
});

test("a key repeated inside ONE fragment is refused — JSON.parse would keep the last and silently drop the rest", () => {
  const text =
    '{"sourceOwnership": {"subtrees": {"packages/cli/src/tree.ts": "tree-view", "packages/cli/src/tree.ts": "tree-view"}}}';
  const refused = faultsOf(composeManifest(fragments({ path: "source-ownership/tree-view.json", text })));
  assert.deepEqual(about(refused), [
    ["duplicate-key", 'sourceOwnership.subtrees["packages/cli/src/tree.ts"]', ["source-ownership/tree-view.json"]],
  ]);
});

test("one key from two fragments is refused: a DUPLICATE when they agree, CONTESTED when they do not", () => {
  const agree = faultsOf(composeManifest(fragments(fragment("repo-surface/more.json", { root: { files: { "README.md": "front door" } } }))));
  assert.deepEqual(about(agree), [["duplicate-key", 'root.files["README.md"]', ["repo-surface/_domain.json", "repo-surface/more.json"]]]);

  const disagree = faultsOf(
    composeManifest(fragments(fragment("repo-surface/more.json", { root: { files: { "README.md": "the front door" } } }))),
  );
  assert.deepEqual(about(disagree), [["contested-key", 'root.files["README.md"]', ["repo-surface/_domain.json", "repo-surface/more.json"]]]);

  // The contest fragments exist to surface: two owners, one subtree.
  const owners = faultsOf(
    composeManifest(
      fragments(
        fragment("source-ownership/gate-ci-parity.json", {
          sourceOwnership: {
            subtrees: { "packages/cli/src/gate*.ts": "gate-ci-parity", "packages/drive/src/subtree-match.ts": "gate-ci-parity" },
          },
        }),
      ),
    ),
  );
  assert.deepEqual(about(owners), [
    ["contested-key", 'sourceOwnership.subtrees["packages/drive/src/subtree-match.ts"]', ["source-ownership/gate-ci-parity.json", OBT]],
  ]);

  // Sameness is judged on the value, not on its key order — and a list's order IS part of the value.
  const reader = (reads: readonly string[]): ManifestFragmentSource =>
    fragment("hierarchy-camps/more.json", {
      hierarchyCamps: { readers: { "packages/cli/src/tree.ts": { because: "b", fallback: "offline", camp: "render", reads } } },
    });
  assert.deepEqual(faultsOf(composeManifest(fragments(reader(["live", "checkout"])))).map((f) => f.kind), ["duplicate-key"]);
  assert.deepEqual(faultsOf(composeManifest(fragments(reader(["checkout", "live"])))).map((f) => f.kind), ["contested-key"]);
});

test("source ownership is sharded by owner: a declaration in the wrong shard is refused, naming the right one", () => {
  const foreign = faultsOf(
    composeManifest(fragments(fragment(OBT, { sourceOwnership: { subtrees: { ...OBT_DECLARATIONS, "packages/cli/src/tree.ts": "tree-view" } } }))),
  );
  assert.deepEqual(about(foreign), [["misplaced-declaration", 'sourceOwnership.subtrees["packages/cli/src/tree.ts"]', [OBT]]]);

  const domain: ManifestObject = JSON.parse(splitManifest(aggregate()).find((f) => f.path === "source-ownership/_domain.json")?.text ?? "{}");
  const declaring = edited(domain, ["sourceOwnership", "subtrees", "packages/cli/src/tree.ts"], "tree-view");
  const inDomain = faultsOf(composeManifest(fragments(fragment("source-ownership/_domain.json", declaring))));
  assert.deepEqual(about(inDomain), [["misplaced-declaration", 'sourceOwnership.subtrees["packages/cli/src/tree.ts"]', ["source-ownership/_domain.json"]]]);
  assert.equal(
    inDomain[0]?.message,
    'source-ownership/_domain.json: _domain.json holds the section\'s notes and baseline, never a declaration — move sourceOwnership.subtrees["packages/cli/src/tree.ts"] to source-ownership/tree-view.json',
  );

  const stray = faultsOf(composeManifest(fragments(fragment(OBT, { sourceOwnership: { $note: "mine", subtrees: OBT_DECLARATIONS } }))));
  assert.deepEqual(about(stray), [["misplaced-declaration", "sourceOwnership.$note", [OBT]]]);

  // A note BESIDE an owner's own declarations is that owner's to keep.
  const annotated = fragments(fragment(OBT, { sourceOwnership: { subtrees: { ...OBT_DECLARATIONS, $why: "the analyser and its readers" } } }));
  assert.equal(objectAt(manifestOf(composeManifest(annotated)), "sourceOwnership", "subtrees")["$why"], "the analyser and its readers");
});

test("an owner fragment that declares nothing is refused — a file named for an owner must say something for it", () => {
  const bodies: ManifestJson[] = [{}, { sourceOwnership: { subtrees: {} } }, { sourceOwnership: { subtrees: { $note: "only prose" } } }];
  for (const body of bodies) {
    const refused = faultsOf(composeManifest(fragments(fragment("source-ownership/tree-view.json", body))));
    assert.deepEqual(about(refused), [["empty-fragment", "", ["source-ownership/tree-view.json"]]], JSON.stringify(body));
  }
});

test("a declaration COVERED by another is refused with both named — whichever owners, whichever shards", () => {
  const overlapping = (subtree: string, owner: string) =>
    faultsOf(composeManifest(splitManifest(edited(aggregate(), ["sourceOwnership", "subtrees", subtree], owner)))).map((f) =>
      f.kind === "overlapping-declaration"
        ? [f.at, f.broad.subtree, f.broad.owner, f.specific.subtree, f.specific.owner, f.fragments]
        : [f.kind],
    );

  // The broad owner's fragment sorts AFTER the covered one's, so the pair is named in sorted order, not the order found.
  assert.deepEqual(overlapping("packages/drive/src", "workspace-drivers"), [
    [
      'sourceOwnership.subtrees["packages/drive/src/source-ownership-map.ts"]',
      "packages/drive/src",
      "workspace-drivers",
      "packages/drive/src/source-ownership-map.ts",
      "organism-boundary-tooling",
      [OBT, "source-ownership/workspace-drivers.json"],
    ],
    [
      'sourceOwnership.subtrees["packages/drive/src/subtree-match.ts"]',
      "packages/drive/src",
      "workspace-drivers",
      "packages/drive/src/subtree-match.ts",
      "organism-boundary-tooling",
      [OBT, "source-ownership/workspace-drivers.json"],
    ],
  ]);
  assert.deepEqual(overlapping("packages/cli/src/*.ts", "cli"), [
    [
      'sourceOwnership.subtrees["packages/cli/src/*boundaries*.ts"]',
      "packages/cli/src/*.ts",
      "cli",
      "packages/cli/src/*boundaries*.ts",
      "organism-boundary-tooling",
      ["source-ownership/cli.json", OBT],
    ],
    [
      'sourceOwnership.subtrees["packages/cli/src/gate*.ts"]',
      "packages/cli/src/*.ts",
      "cli",
      "packages/cli/src/gate*.ts",
      "gate-ci-parity",
      ["source-ownership/cli.json", "source-ownership/gate-ci-parity.json"],
    ],
  ]);
  // Authoring rule (2) does not ask whose declarations they are: an owner covering itself is refused too.
  assert.deepEqual(overlapping("packages/drive/src/*.ts", "organism-boundary-tooling"), [
    [
      'sourceOwnership.subtrees["packages/drive/src/source-ownership-map.ts"]',
      "packages/drive/src/*.ts",
      "organism-boundary-tooling",
      "packages/drive/src/source-ownership-map.ts",
      "organism-boundary-tooling",
      [OBT],
    ],
    [
      'sourceOwnership.subtrees["packages/drive/src/subtree-match.ts"]',
      "packages/drive/src/*.ts",
      "organism-boundary-tooling",
      "packages/drive/src/subtree-match.ts",
      "organism-boundary-tooling",
      [OBT],
    ],
  ]);
});

test("the same fragment path supplied twice is refused as such", () => {
  const split = splitManifest(aggregate());
  const hosted = split.find((f) => f.path === "hosted-stories/_domain.json");
  if (hosted === undefined) assert.fail("the fixture has a hosted-stories fragment");
  const repeated = faultsOf(composeManifest([...split, hosted])).filter((f) => f.kind === "duplicate-fragment");
  assert.deepEqual(about(repeated), [["duplicate-fragment", "", ["hosted-stories/_domain.json"]]]);
});

test("faults come back in one stable order, whatever order the set arrived in", () => {
  const broken = [
    ...splitManifest(aggregate()),
    fragment("source-ownership/tree-view.json", {}),
    fragment("repo-surface/more.json", { root: { files: { "README.md": "the front door" } } }),
    { path: "stray.json", text: "{}" },
  ];
  for (const order of [broken, [...broken].reverse()]) {
    assert.deepEqual(faultsOf(composeManifest(order)).map((f) => f.kind), ["contested-key", "empty-fragment", "malformed-fragment"]);
  }
});

test("every refusal is worded as its own repair — the wording is what a reader acts on, so it is pinned", () => {
  const first = (sources: readonly ManifestFragmentSource[]): string => faultsOf(composeManifest(sources))[0]?.message ?? "";
  const domains = "repo-surface, package-ownership, source-ownership, hierarchy-camps, hosted-stories";

  assert.equal(
    first([...fragments(), { path: "cli.json", text: "{}" }]),
    `cli.json: not a fragment path — a fragment is <domain>/<shard>.json, where <domain> is one of ${domains} and <shard> is _domain or a kebab-case id`,
  );
  assert.equal(
    first(fragments({ path: "source-ownership/tree-view.json", text: '{"sourceOwnership": {"subtrees": {"a/b.ts": "tree-view", "a/b.ts": "tree-view"}}}' })),
    'source-ownership/tree-view.json: sourceOwnership.subtrees["a/b.ts"] appears more than once in this one file — JSON keeps only the last, so the others would vanish without a word; keep exactly one',
  );
  assert.equal(
    first(fragments(fragment("repo-surface/more.json", { $comment_more: 5 }))),
    "repo-surface/more.json: $comment_more is a note (its key begins with $), so it must be a string",
  );
  assert.equal(
    first(fragments(fragment("repo-surface/more.json", { root: { files: { "x.md": "" } } }))),
    'repo-surface/more.json: root.files["x.md"] must map a non-empty key to a non-empty string',
  );
  assert.equal(
    first(fragments(fragment("hierarchy-camps/more.json", { hierarchyCamps: { readers: { "a.ts": "prove" } } }))),
    'hierarchy-camps/more.json: hierarchyCamps.readers["a.ts"] must map a non-empty key to an object',
  );
  assert.equal(
    first(fragments(fragment("package-ownership/more.json", { packageOwnership: { orgnisms: {} } }))),
    "package-ownership/more.json: packageOwnership.orgnisms is not a section the manifest defines — a new section needs the fragment contract extended first (MANIFEST in packages/drive/src/manifest-fragments.ts)",
  );
  assert.equal(
    first(fragments(fragment("package-ownership/more.json", { packageOwnership: { foundational: "@storytree/x" } }))),
    "package-ownership/more.json: packageOwnership.foundational must be a list of strings",
  );
  assert.equal(
    first(splitManifest(edited(aggregate(), ["sourceOwnership", "baseline"], "yesterday"))),
    "source-ownership/_domain.json: sourceOwnership.baseline must be an object",
  );
  assert.equal(first(fragments(fragment("repo-surface/more.json", { root: { dirs: [] } }))), "repo-surface/more.json: root.dirs must be an object");
  assert.equal(
    first(fragments(fragment("hosted-stories/more.json", { $note: "x" }))),
    "hosted-stories/more.json: the manifest's own top-level notes live in repo-surface fragments — move $note there",
  );
  assert.equal(
    first(fragments(fragment("repo-surface/more.json", { hostedStories: { register: { x: "y" } } }))),
    "repo-surface/more.json: hostedStories belongs to the hosted-stories domain — move it to a fragment under hosted-stories/",
  );
  assert.equal(
    first(fragments(fragment(OBT, { sourceOwnership: { $note: "mine", subtrees: OBT_DECLARATIONS } }))),
    `${OBT}: an owner fragment declares subtrees and nothing else — move sourceOwnership.$note to source-ownership/_domain.json`,
  );
  assert.equal(
    first(fragments(fragment(OBT, { sourceOwnership: { subtrees: { ...OBT_DECLARATIONS, "a/b.ts": "tree-view" } } }))),
    `${OBT}: this is organism-boundary-tooling's fragment, but sourceOwnership.subtrees["a/b.ts"] is declared for tree-view — move it to source-ownership/tree-view.json`,
  );
  assert.equal(
    first(fragments(fragment("source-ownership/tree-view.json", {}))),
    "source-ownership/tree-view.json: declares nothing for tree-view — add the declarations it exists for, or delete it",
  );
  assert.equal(
    first(fragments(fragment("repo-surface/more.json", { root: { files: { "README.md": "front door" } } }))),
    'root.files["README.md"] is declared 2 times, identically (repo-surface/_domain.json says "front door"; repo-surface/more.json says "front door") — keep exactly one',
  );
  // The disagreeing fragment ARRIVES first; the two are still named in sorted order.
  assert.equal(
    first([fragment("repo-surface/more.json", { root: { files: { "README.md": "the front door" } } }), ...fragments()]),
    'root.files["README.md"] is declared 2 times with different values (repo-surface/_domain.json says "front door"; repo-surface/more.json says "the front door") — decide which is true and keep only that one',
  );
  assert.equal(
    first(splitManifest(edited(aggregate(), ["hostedStories"], undefined))),
    "no fragment supplies hostedStories — every check that reads the manifest reads it, and a missing section is a blind read rather than an empty one; supply it (an explicitly empty value is a legal statement)",
  );
  const hosted = splitManifest(aggregate()).find((f) => f.path === "hosted-stories/_domain.json");
  if (hosted === undefined) assert.fail("the fixture has a hosted-stories fragment");
  assert.equal(
    faultsOf(composeManifest([...splitManifest(aggregate()), hosted])).find((f) => f.kind === "duplicate-fragment")?.message,
    "hosted-stories/_domain.json was supplied 2 times — one path names one file, so there is no telling which is meant",
  );
  assert.equal(
    first(splitManifest(edited(aggregate(), ["sourceOwnership", "subtrees", "packages/drive/src"], "workspace-drivers"))),
    'sourceOwnership.subtrees["packages/drive/src/source-ownership-map.ts"] (organism-boundary-tooling) is covered by "packages/drive/src" (workspace-drivers, in source-ownership/workspace-drivers.json): ' +
      "every file it names is claimed by the broader declaration too, so which owner a file is credited to would be decided by declaration order — and fragments have no order. " +
      "Narrow the broader subtree until it stops covering this one, or drop this one (the manifest's authoring rule (2): declarations are disjoint).",
  );
});

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

test("the covering search is asked only about the pairs a literal prefix leaves possible", () => {
  const d = (subtree: string) => ({ subtree, owner: "someone" });
  const gate = d("packages/cli/src/gate*.ts");
  const cli = d("packages/cli");
  const clj = d("packages/clj/x.ts");
  const file = d("packages/cli/src/a.ts");
  assert.deepEqual(coveringCandidates([gate, cli, clj, file]), [
    { broad: cli, specific: gate },
    { broad: cli, specific: file },
  ]);
  const glob = d("a/b*");
  const literal = d("a/b");
  assert.deepEqual(coveringCandidates([glob, literal]), [
    { broad: literal, specific: glob },
    { broad: glob, specific: literal },
  ]);
});

test("duplicateKeyPaths finds a key repeated at any depth, and is not fooled by what a string holds", () => {
  // `g\/h` is `g/h` once unescaped, so the scan must compare keys as JSON reads them, not as written.
  const text = String.raw`{"a": {"b": 1, "b": 2}, "list": [{"d": 1}, {"d": 1, "d": 2}], "e\"f": 1, "e\"f": 2, "g/h": 1, "g\/h": 2, "s": "{\"x\": 1, \"x\": 2}", "n": null}`;
  assert.deepEqual(duplicateKeyPaths(text), [["a", "b"], ["list", "1", "d"], ['e"f'], ["g/h"]]);
  assert.deepEqual(duplicateKeyPaths('[{"a": 1, "a": 2}]'), [["0", "a"]]);
  // An element that is a string still takes a place in the list: only a `,` moves to the next one.
  assert.deepEqual(duplicateKeyPaths('[1, "x", {"a": 1, "a": 2}]'), [["2", "a"]]);
  assert.deepEqual(duplicateKeyPaths('{"a": "a", "b": [1, 2, {"a": 3}], "c": {"a": 4}}'), []);
  assert.deepEqual(duplicateKeyPaths("42"), []);
  assert.deepEqual(duplicateKeyPaths('"just a string"'), []);
});

test("canonicalJson sorts an object's keys at every depth — inside a list too — and keeps each list's own order", () => {
  assert.equal(JSON.stringify(canonicalJson({ z: [{ b: 1, a: [3, 1] }], a: null, m: "x" })), '{"a":null,"m":"x","z":[{"a":[3,1],"b":1}]}');
});

test("the tree reader lists every file under the root at its /-separated path — nested and stray ones included", () => {
  const root = tree({ "source-ownership/cli.json": "{}", "source-ownership/nested/x.json": "[]", "stray.txt": "junk" });
  const read = readManifestFragmentTree(root);
  assert.deepEqual(read.unread, []);
  assert.deepEqual(
    [...read.fragments].sort((a, b) => (a.path < b.path ? -1 : 1)),
    [
      { path: "source-ownership/cli.json", text: "{}" },
      { path: "source-ownership/nested/x.json", text: "[]" },
      { path: "stray.txt", text: "junk" },
    ],
  );
});

test("a tree that cannot be read is UNREAD, and composing it is refused as such — never as an empty manifest", () => {
  const file = path.join(tree({ "a.json": "{}" }), "a.json");
  for (const root of [path.join(tmpdir(), "no-such-manifest-fragment-tree-5521"), file]) {
    const read = readManifestFragmentTree(root);
    assert.deepEqual(read.fragments, [], root);
    assert.equal(read.unread.length, 1, root);
    assert.match(read.unread[0] ?? "", /could not be read in full/, root);
    assert.deepEqual(about(faultsOf(composeManifestTree(root))), [["unreadable-fragment-set", "", []]], root);
  }
});

test("a tree written from an aggregate's fragments composes back into the aggregate", () => {
  const root = tree(Object.fromEntries(splitManifest(aggregate()).map((f) => [f.path, f.text])));
  assert.deepEqual(manifestOf(composeManifestTree(root)), aggregate());
});

test("refusalReasons is every fault's own repair, in the composer's order, one `; `-separated clause each", () => {
  const fault = (message: string): ManifestCompositionFault => ({ kind: "missing-section", fragments: [], at: "", message });
  assert.equal(refusalReasons([fault("first repair"), fault("second repair")]), "first repair; second repair");
  assert.equal(refusalReasons([fault("the only repair")]), "the only repair");
});

test("composedManifestText is the composed manifest as JSON text — and null, never an empty text, for a refused set", () => {
  const composed = composeManifest(splitManifest(aggregate()));
  assert.equal(composedManifestText(composed), JSON.stringify(manifestOf(composed)));
  assert.equal(composedManifestText(composeRepoManifest({ aggregate: { unread: "gone" }, tree: null })), null);
});

// ---------------------------------------------------------------------------
// The repository's manifest — the aggregate and the tree beside it
// ---------------------------------------------------------------------------

/** The fixture in two halves: `sections` moved into a tree of their own fragments, the rest left in the aggregate. */
function moved(...sections: readonly string[]) {
  const whole = aggregate();
  return {
    aggregate: JSON.stringify(sections.reduce((m, section) => edited(m, [section], undefined), whole)),
    tree: splitManifest(Object.fromEntries(sections.map((section) => [section, whole[section] ?? null]))),
  };
}

const READ_IN_FULL = { unread: [] } as const;

test("an aggregate with no tree beside it composes as the fragment set split from it does — nothing has moved yet", () => {
  assert.deepEqual(manifestOf(composeRepoManifest({ aggregate: { text: JSON.stringify(aggregate()) }, tree: null })), aggregate());
});

test("sections moved into the tree compose back into the same manifest — no reader can tell which half a section came from", () => {
  for (const sections of [["sourceOwnership"], ["sourceOwnership", "hostedStories"], ["$comment", "root", "docs"]]) {
    const { aggregate: text, tree: fragments } = moved(...sections);
    assert.deepEqual(
      manifestOf(composeRepoManifest({ aggregate: { text }, tree: { fragments, ...READ_IN_FULL } })),
      aggregate(),
      sections.join(" + "),
    );
  }
});

test("a section left in the aggregate once its domain has fragments has two homes, and is refused naming the move", () => {
  const withTree = (kept: ManifestObject, fragments: readonly ManifestFragmentSource[]) =>
    composeRepoManifest({ aggregate: { text: JSON.stringify(kept) }, tree: { fragments, ...READ_IN_FULL } });

  const refused = faultsOf(withTree(aggregate(), moved("sourceOwnership").tree));
  assert.deepEqual(about(refused), [["misplaced-declaration", "sourceOwnership", [REPO_MANIFEST]]]);
  assert.equal(
    refused[0]?.message,
    "repo-manifest.json: sourceOwnership belongs to the source-ownership domain, whose fragments live in " +
      "repo-manifest/source-ownership/ — a section has one home, so move what it declares into those fragments and delete it here",
  );

  // The manifest's own top-level note belongs to the repo-surface domain, beside `root` and `docs`.
  assert.deepEqual(about(faultsOf(withTree(aggregate(), moved("root").tree))), [
    ["misplaced-declaration", "$comment", [REPO_MANIFEST]],
    ["misplaced-declaration", "docs", [REPO_MANIFEST]],
    ["misplaced-declaration", "root", [REPO_MANIFEST]],
  ]);
  // A section no domain owns is filed under a domain of its own name, and gets no second home either.
  assert.deepEqual(
    about(faultsOf(withTree(edited(aggregate(), ["mystery"], {}), [fragment("mystery/_domain.json", { mystery: {} })]))),
    [["misplaced-declaration", "mystery", [REPO_MANIFEST]]],
  );
});

test("an aggregate that cannot be read, or holds no object, is refused — the tree is never composed alone", () => {
  const whole = { fragments: splitManifest(aggregate()), ...READ_IN_FULL };
  const absent = faultsOf(composeRepoManifest({ aggregate: { unread: "absent at /x/repo-manifest.json" }, tree: whole }));
  assert.deepEqual(about(absent), [["unreadable-fragment-set", "", []]]);
  assert.equal(absent[0]?.message, "repo-manifest.json: absent at /x/repo-manifest.json");

  for (const text of ["[1]", "{ not json"]) {
    assert.deepEqual(about(faultsOf(composeRepoManifest({ aggregate: { text }, tree: null }))), [["malformed-fragment", "", [REPO_MANIFEST]]], text);
  }
  assert.equal(faultsOf(composeRepoManifest({ aggregate: { text: "[1]" }, tree: null }))[0]?.message, "repo-manifest.json: does not hold a JSON object");
});

test("a tree that did not read in full is refused with its own reasons, however whole the aggregate", () => {
  const refused = faultsOf(composeRepoManifest({ aggregate: { text: JSON.stringify(aggregate()) }, tree: { fragments: [], unread: ["b", "a"] } }));
  assert.deepEqual(refused.map((f) => [f.kind, f.message]), [
    ["unreadable-fragment-set", "a"],
    ["unreadable-fragment-set", "b"],
  ]);
});

test("readRepoManifest composes the aggregate on disk with the fragment tree named for it — and refuses what it cannot read", () => {
  const { aggregate: text, tree: fragments } = moved("sourceOwnership");
  const files = Object.fromEntries(fragments.map((f) => [`${REPO_MANIFEST_TREE}/${f.path}`, f.text]));
  const whole = tree({ [REPO_MANIFEST]: text, ...files });
  assert.deepEqual(manifestOf(readRepoManifest(path.join(whole, REPO_MANIFEST))), aggregate());

  // With no tree beside it, a section that moved is simply missing — a blind read, never an empty one.
  const bare = tree({ [REPO_MANIFEST]: text });
  assert.deepEqual(about(faultsOf(readRepoManifest(path.join(bare, REPO_MANIFEST)))), [["missing-section", "sourceOwnership", []]]);

  const absent = path.join(tmpdir(), "no-such-repo-manifest-6620.json");
  assert.deepEqual(faultsOf(readRepoManifest(absent)).map((f) => f.message), [`repo-manifest.json: absent at ${absent}`]);

  // A tree that cannot be listed — here a file where the directory belongs — is unread, never skipped.
  const blocked = tree({ [REPO_MANIFEST]: text, [REPO_MANIFEST_TREE]: "not a directory" });
  assert.deepEqual(about(faultsOf(readRepoManifest(path.join(blocked, REPO_MANIFEST)))), [["unreadable-fragment-set", "", []]]);
});

test("manifestFragmentRoot is the directory beside a manifest file, named for it", () => {
  assert.equal(manifestFragmentRoot(path.join("a", "b", "repo-manifest.json")), path.join("a", "b", "repo-manifest"));
  assert.equal(manifestFragmentRoot(path.join("a", "v1.manifest.json")), path.join("a", "v1.manifest"));
});

test("readManifestFragmentTreeAt reads a commit's tree in full or not at all — and a commit with none has none", () => {
  const files = new Map([
    ["repo-manifest/source-ownership/a.json", "{a}"],
    ["repo-manifest/hosted-stories/_domain.json", "{h}"],
    ["elsewhere/source-ownership/a.json", "{x}"],
  ]);
  const git = (listing: readonly string[] | null): GitTreeReader => ({ show: (_ref, file) => files.get(file) ?? null, list: () => listing });

  assert.deepEqual(
    readManifestFragmentTreeAt(git(["repo-manifest/source-ownership/a.json", "repo-manifest/hosted-stories/_domain.json"]), "base", "repo-manifest"),
    {
      fragments: [
        { path: "source-ownership/a.json", text: "{a}" },
        { path: "hosted-stories/_domain.json", text: "{h}" },
      ],
      unread: [],
    },
  );
  assert.equal(readManifestFragmentTreeAt(git([]), "base", "repo-manifest"), null);
  assert.deepEqual(readManifestFragmentTreeAt(git(null), "base", "repo-manifest"), {
    fragments: [],
    unread: ["the manifest fragment tree repo-manifest/ could not be listed at base"],
  });
  // A listed file git will not show, and a listing that strays outside the tree, both leave it UNREAD.
  for (const stray of ["repo-manifest/source-ownership/gone.json", "elsewhere/source-ownership/a.json"]) {
    assert.deepEqual(
      readManifestFragmentTreeAt(git(["repo-manifest/source-ownership/a.json", stray]), "base", "repo-manifest"),
      { fragments: [], unread: [`the manifest fragment tree repo-manifest/ could not be read in full at base (${stray})`] },
      stray,
    );
  }
});

test("two ownership changes in two owners' fragments share no file, and composing both still judges the whole set", () => {
  // ADR-0556 D6's witness in miniature: the change that used to queue behind one registry file lands in a
  // file of its own, while a covering pair or a contested key made ACROSS two branches is still caught —
  // the composer judges the set, not the file.
  const base = splitManifest(aggregate());
  const declaring = (subtree: string, owner: string): ManifestFragmentSource[] => {
    const at = `source-ownership/${owner}.json`;
    const current = base.find((f) => f.path === at);
    const parsed: ManifestJson = current === undefined ? { sourceOwnership: { subtrees: {} } } : JSON.parse(current.text);
    const subtrees = objectAt(parsed, "sourceOwnership", "subtrees");
    return [...base.filter((f) => f.path !== at), fragment(at, { sourceOwnership: { subtrees: { ...subtrees, [subtree]: owner } } })];
  };
  const touched = (branch: readonly ManifestFragmentSource[]): string[] =>
    branch.filter((f) => base.find((b) => b.path === f.path)?.text !== f.text).map((f) => f.path);
  const merged = (...branches: readonly (readonly ManifestFragmentSource[])[]): ManifestFragmentSource[] => {
    const byPath = new Map(base.map((f) => [f.path, f]));
    for (const branch of branches) {
      const changed = touched(branch);
      for (const f of branch) if (changed.includes(f.path)) byPath.set(f.path, f);
    }
    return [...byPath.values()];
  };

  const mine = declaring("packages/drive/src/manifest-fragments.ts", "organism-boundary-tooling");
  const theirs = declaring("packages/cli/src/claims.ts", "claim-at-declare");
  assert.deepEqual(touched(mine), ["source-ownership/organism-boundary-tooling.json"]);
  assert.deepEqual(touched(theirs), ["source-ownership/claim-at-declare.json"]);
  const both = objectAt(manifestOf(composeManifest(merged(mine, theirs))), "sourceOwnership", "subtrees");
  assert.equal(both["packages/drive/src/manifest-fragments.ts"], "organism-boundary-tooling");
  assert.equal(both["packages/cli/src/claims.ts"], "claim-at-declare");

  const broad = declaring("packages/drive/src/manifest*.ts", "drive-machinery");
  const narrow = declaring("packages/drive/src/manifest-fragments-read.ts", "organism-boundary-tooling");
  assert.deepEqual([...touched(broad), ...touched(narrow)], ["source-ownership/drive-machinery.json", "source-ownership/organism-boundary-tooling.json"]);
  assert.deepEqual(about(faultsOf(composeManifest(merged(broad, narrow)))), [
    [
      "overlapping-declaration",
      'sourceOwnership.subtrees["packages/drive/src/manifest-fragments-read.ts"]',
      ["source-ownership/drive-machinery.json", "source-ownership/organism-boundary-tooling.json"],
    ],
  ]);

  const one = declaring("packages/cli/src/claims.ts", "claim-at-declare");
  const other = declaring("packages/cli/src/claims.ts", "notice-board");
  assert.deepEqual(about(faultsOf(composeManifest(merged(one, other)))), [
    [
      "contested-key",
      'sourceOwnership.subtrees["packages/cli/src/claims.ts"]',
      ["source-ownership/claim-at-declare.json", "source-ownership/notice-board.json"],
    ],
  ]);
});

// ---------------------------------------------------------------------------
// The live manifest
// ---------------------------------------------------------------------------

function lazy<T>(make: () => T): () => T {
  let made: { readonly value: T } | undefined;
  return () => (made ??= { value: make() }).value;
}

const liveText = lazy(() => readFileSync(LIVE_MANIFEST, "utf8"));
const liveTree = lazy(() => readManifestFragmentTree(manifestFragmentRoot(LIVE_MANIFEST)));

/**
 * The live manifest as every reader sees it — `repo-manifest.json` composed with the fragment tree beside
 * it — and what that composition refused, which must be nothing. Nothing is set aside: the three covered
 * declarations were narrowed away (`repo-manifest-covered-declarations-resolved`), and `sourceOwnership`
 * has been authored as fragments since `repo-manifest-source-ownership-fragments`.
 */
const live = lazy(() => {
  const composed = readRepoManifest(LIVE_MANIFEST);
  return { composed, refused: composed.ok ? [] : composed.faults };
});

test("LIVE: no committed manifest file repeats a key — the aggregate and every fragment, which no parsed read could see", () => {
  assert.deepEqual(duplicateKeyPaths(liveText()), []);
  assert.deepEqual(liveTree().unread, []);
  for (const f of liveTree().fragments) assert.deepEqual(duplicateKeyPaths(f.text), [], f.path);
});

test("LIVE: the repository's manifest is never refused for its shape", () => {
  assert.deepEqual(
    live().refused.filter((f) => f.kind !== "overlapping-declaration").map((f) => f.message),
    [],
    "the fragment contract no longer describes the manifest — extend MANIFEST in manifest-fragments.ts",
  );
});

test("LIVE: the repository's manifest carries no declaration COVERED by another — nothing is set aside", () => {
  assert.deepEqual(
    live().refused.filter((f) => f.kind === "overlapping-declaration").map((f) => f.message),
    [],
    "a covered declaration's files would be credited by declaration order, which fragments do not have — each message names its repair",
  );
});

test("LIVE: source ownership is authored in the fragments — the aggregate no longer carries it, and no other domain has moved yet", () => {
  assert.equal(Object.keys(JSON.parse(liveText())).includes("sourceOwnership"), false, "a sourceOwnership block in repo-manifest.json is a second home");
  assert.deepEqual([...new Set(liveTree().fragments.map((f) => f.path.split("/")[0]))], ["source-ownership"]);
});

test("LIVE: the committed fragments are exactly the claim-grain split of the map — one file per owner, and one for the notes", () => {
  const whole = manifestOf(live().composed);
  const expected = splitManifest(whole)
    .filter((f) => f.path.startsWith("source-ownership/"))
    .map((f) => f.path);
  assert.deepEqual(liveTree().fragments.map((f) => f.path).sort(), expected);
});

test("LIVE: the composed manifest round-trips through its claim-grain fragments — every declaration and every note", () => {
  const whole = manifestOf(live().composed);
  const split = splitManifest(whole);
  assert.deepEqual(manifestOf(composeManifest(split)), whole);

  // Not vacuous: hundreds of declarations, the notes that carry the authoring rules, one fragment per owner.
  const subtrees = objectAt(whole, "sourceOwnership", "subtrees");
  const declared = Object.keys(subtrees).filter((key) => !key.startsWith("$"));
  assert.ok(declared.length > 500, `only ${declared.length} declarations read`);
  assert.ok(Object.keys(subtrees).filter((key) => key.startsWith("$")).length >= 10, "the section notes are missing");
  const owners = new Set(declared.map((key) => subtrees[key]));
  const ownerShards = split.filter((f) => f.path.startsWith("source-ownership/") && f.path !== "source-ownership/_domain.json");
  assert.equal(ownerShards.length, owners.size);
});

test("LIVE: the same fragments, written to disk and read back, compose to the same manifest in the same bytes", () => {
  const whole = manifestOf(live().composed);
  const split = splitManifest(whole);
  const fromDisk = manifestOf(composeManifestTree(tree(Object.fromEntries(split.map((f) => [f.path, f.text])))));
  assert.deepEqual(fromDisk, whole);
  assert.equal(JSON.stringify(fromDisk), JSON.stringify(manifestOf(composeManifest([...split].reverse()))));
});
