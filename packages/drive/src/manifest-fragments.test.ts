import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJson,
  composeManifest,
  coveringCandidates,
  DOMAIN_SHARD,
  duplicateKeyPaths,
  MANIFEST_DOMAINS,
  splitManifest,
  type ManifestComposition,
  type ManifestCompositionFault,
  type ManifestFragmentSource,
  type ManifestJson,
  type ManifestObject,
} from "./manifest-fragments.js";
import { composeManifestTree, readManifestFragmentTree } from "./manifest-fragments-read.js";

/**
 * The manifest fragment contract and its composer (`repo-manifest-fragmentation-arc` increment 1).
 *
 * Three halves:
 *  1. The contract over a small aggregate built here: split, compose, and every fault the composer
 *     refuses — each against the unbroken set, which composes, so no refusal can pass because the
 *     whole set was broken.
 *  2. The pieces it rests on: the covering search's candidate bound, the duplicate-key scan, the
 *     canonical form, and the disk reader.
 *  3. THE LIVE MANIFEST. `repo-manifest.json` is split at the claim grain and composed back, and must
 *     come back as itself — every declaration and every note — once the declarations it already
 *     carries COVERED are set aside. Those the composer refuses by design, and `storytree ownership`
 *     has long reported the same files contested. No DB and no network: the manifest is a committed file.
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

/** What each refusal is ABOUT — kind, manifest path, fragments — leaving the prose to the tests that pin it. */
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
  assert.match(inner[0]?.message ?? "", /not a section the manifest defines/);
  const top = faultsOf(composeManifest(fragments(fragment("repo-surface/more.json", { surfaceOwnership: {} }))));
  assert.deepEqual(about(top), [["malformed-fragment", "surfaceOwnership", ["repo-surface/more.json"]]]);
});

test("a section supplied from another domain's directory is refused, naming the directory it belongs in", () => {
  const section = faultsOf(composeManifest(fragments(fragment("repo-surface/more.json", { hostedStories: { register: { x: "y" } } }))));
  assert.deepEqual(about(section), [["misplaced-declaration", "hostedStories", ["repo-surface/more.json"]]]);
  assert.match(section[0]?.message ?? "", /under hosted-stories\//);
  const note = faultsOf(composeManifest(fragments(fragment("hosted-stories/more.json", { $note: "x" }))));
  assert.deepEqual(about(note), [["misplaced-declaration", "$note", ["hosted-stories/more.json"]]]);
  assert.match(note[0]?.message ?? "", /live in repo-surface fragments/);
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
  assert.match(disagree[0]?.message ?? "", /repo-surface\/_domain\.json says "front door"; repo-surface\/more\.json says "the front door"/);

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
  assert.match(foreign[0]?.message ?? "", /move it to source-ownership\/tree-view\.json/);

  const domain: ManifestObject = JSON.parse(splitManifest(aggregate()).find((f) => f.path === "source-ownership/_domain.json")?.text ?? "{}");
  const declaring = edited(domain, ["sourceOwnership", "subtrees", "packages/cli/src/tree.ts"], "tree-view");
  const inDomain = faultsOf(composeManifest(fragments(fragment("source-ownership/_domain.json", declaring))));
  assert.deepEqual(about(inDomain), [["misplaced-declaration", 'sourceOwnership.subtrees["packages/cli/src/tree.ts"]', ["source-ownership/_domain.json"]]]);
  assert.match(inDomain[0]?.message ?? "", /never a declaration — move sourceOwnership\.subtrees\["packages\/cli\/src\/tree\.ts"\] to source-ownership\/tree-view\.json/);

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
      f.kind === "overlapping-declaration" ? [f.broad.subtree, f.broad.owner, f.specific.subtree, f.specific.owner, f.fragments] : [f.kind],
    );

  assert.deepEqual(overlapping("packages/drive/src", "drive-machinery"), [
    ["packages/drive/src", "drive-machinery", "packages/drive/src/source-ownership-map.ts", "organism-boundary-tooling", ["source-ownership/drive-machinery.json", OBT]],
    ["packages/drive/src", "drive-machinery", "packages/drive/src/subtree-match.ts", "organism-boundary-tooling", ["source-ownership/drive-machinery.json", OBT]],
  ]);
  assert.deepEqual(overlapping("packages/cli/src/*.ts", "cli"), [
    ["packages/cli/src/*.ts", "cli", "packages/cli/src/*boundaries*.ts", "organism-boundary-tooling", ["source-ownership/cli.json", OBT]],
    ["packages/cli/src/*.ts", "cli", "packages/cli/src/gate*.ts", "gate-ci-parity", ["source-ownership/cli.json", "source-ownership/gate-ci-parity.json"]],
  ]);
  // Authoring rule (2) does not ask whose declarations they are: an owner covering itself is refused too.
  assert.deepEqual(overlapping("packages/drive/src/*.ts", "organism-boundary-tooling"), [
    ["packages/drive/src/*.ts", "organism-boundary-tooling", "packages/drive/src/source-ownership-map.ts", "organism-boundary-tooling", [OBT]],
    ["packages/drive/src/*.ts", "organism-boundary-tooling", "packages/drive/src/subtree-match.ts", "organism-boundary-tooling", [OBT]],
  ]);

  const [first] = faultsOf(composeManifest(splitManifest(edited(aggregate(), ["sourceOwnership", "subtrees", "packages/drive/src"], "drive-machinery"))));
  assert.match(first?.message ?? "", /covered by "packages\/drive\/src" \(drive-machinery, in source-ownership\/drive-machinery\.json\)/);
  assert.match(first?.message ?? "", /authoring rule \(2\)/);
});

test("the same fragment path supplied twice is refused as such", () => {
  const split = splitManifest(aggregate());
  const hosted = split.find((f) => f.path === "hosted-stories/_domain.json");
  if (hosted === undefined) assert.fail("the fixture has a hosted-stories fragment");
  const repeated = faultsOf(composeManifest([...split, hosted])).filter((f) => f.kind === "duplicate-fragment");
  assert.deepEqual(about(repeated), [["duplicate-fragment", "", ["hosted-stories/_domain.json"]]]);
  assert.match(repeated[0]?.message ?? "", /supplied 2 times/);
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
  assert.deepEqual(duplicateKeyPaths('{"a": "a", "b": [1, 2, {"a": 3}], "c": {"a": 4}}'), []);
  assert.deepEqual(duplicateKeyPaths("42"), []);
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

// ---------------------------------------------------------------------------
// The live manifest
// ---------------------------------------------------------------------------

function lazy<T>(make: () => T): () => T {
  let made: { readonly value: T } | undefined;
  return () => (made ??= { value: make() }).value;
}

const liveText = lazy(() => readFileSync(LIVE_MANIFEST, "utf8"));

/**
 * The live manifest, what composing its fragments refused, and the manifest with the declarations it
 * carries COVERED set aside. The composer names those; setting them aside is this test's doing, and
 * everything else must survive the trip.
 */
const live = lazy(() => {
  const whole: ManifestObject = JSON.parse(liveText());
  const first = composeManifest(splitManifest(whole));
  const refused = first.ok ? [] : first.faults;
  const covered = refused.flatMap((f) => (f.kind === "overlapping-declaration" ? [f.specific.subtree] : []));
  const setAside = covered.reduce((m, subtree) => edited(m, ["sourceOwnership", "subtrees", subtree], undefined), whole);
  return { refused, covered, setAside };
});

test("LIVE: the committed manifest repeats no key — the one fault a split of its parsed form could never see", () => {
  assert.deepEqual(duplicateKeyPaths(liveText()), []);
});

test("LIVE: repo-manifest.json is refused only for declarations it carries COVERED — never for its shape", () => {
  assert.deepEqual(
    live().refused.filter((f) => f.kind !== "overlapping-declaration").map((f) => f.message),
    [],
    "the fragment contract no longer describes the manifest — extend MANIFEST in manifest-fragments.ts",
  );
});

test("LIVE: repo-manifest.json round-trips through its claim-grain fragments — every declaration and every note", () => {
  const { setAside, covered } = live();
  const split = splitManifest(setAside);
  assert.deepEqual(manifestOf(composeManifest(split)), setAside);

  // Not vacuous: hundreds of declarations, the notes that carry the authoring rules, one fragment per owner.
  const subtrees = objectAt(setAside, "sourceOwnership", "subtrees");
  const declared = Object.keys(subtrees).filter((key) => !key.startsWith("$"));
  assert.ok(declared.length + covered.length > 500, `only ${declared.length} declarations read`);
  assert.ok(Object.keys(subtrees).filter((key) => key.startsWith("$")).length >= 10, "the section notes are missing");
  const owners = new Set(declared.map((key) => subtrees[key]));
  const ownerShards = split.filter((f) => f.path.startsWith("source-ownership/") && f.path !== "source-ownership/_domain.json");
  assert.equal(ownerShards.length, owners.size);
});

test("LIVE: the same fragments, written to disk and read back, compose to the same manifest in the same bytes", () => {
  const { setAside } = live();
  const split = splitManifest(setAside);
  const fromDisk = manifestOf(composeManifestTree(tree(Object.fromEntries(split.map((f) => [f.path, f.text])))));
  assert.deepEqual(fromDisk, setAside);
  assert.equal(JSON.stringify(fromDisk), JSON.stringify(manifestOf(composeManifest([...split].reverse()))));
});
