/**
 * THE MANIFEST FRAGMENT CONTRACT, and the one composer every reader of it is to use (ADR-0556,
 * `repo-manifest-fragmentation-arc` increment 1).
 *
 * `repo-manifest.json` is one Git path carrying five independent registries — the repo-surface
 * allow-list, package ownership, source ownership, hierarchy camps and the hosted-story register. In
 * the thirty days to 2026-09-08 it was touched by 162 of 1,283 non-merge commits, 156 of them in
 * `sourceOwnership`, so otherwise independent work queues behind one file. The arc replaces the file
 * with FRAGMENTS cut at the grain claims are taken at, composed by one fail-closed local seam.
 *
 * THIS MODULE IS THAT SEAM, AND ONLY THE SEAM. ADR-0556 D5 landed "a pure composer and fault-seeded
 * tests" before authority moved. Since `repo-manifest-source-ownership-fragments`, `sourceOwnership` is
 * authored as fragments under `repo-manifest/`, and every reader of it composes them with the aggregate
 * through {@link composeRepoManifest}; the other domains are still read from the aggregate until they
 * move. What is settled here is what a fragment is, where it lives, and how a set of them composes into
 * the manifest's one semantic view. It needs no database and no CI — claim declaration and every gate
 * call it on a laptop, before a pull request exists.
 *
 * ## The layout
 *
 * A fragment tree is a directory of `<domain>/<shard>.json` files ({@link MANIFEST_DOMAINS}):
 *
 *     repo-surface/_domain.json          root, docs, and the manifest's own top-level note
 *     package-ownership/_domain.json     packageOwnership
 *     source-ownership/_domain.json      sourceOwnership's notes and baseline — never a declaration
 *     source-ownership/<owner>.json      the subtrees <owner> is declared to own, and nothing else
 *     hierarchy-camps/_domain.json       hierarchyCamps
 *     hosted-stories/_domain.json        hostedStories
 *
 * A fragment is a PARTIAL MANIFEST in the aggregate's own shape, restricted to its domain's sections,
 * so a declaration reads the same in a fragment as it did in the monolith.
 *
 * ## The shard key is the claim grain (ADR-0556 D2)
 *
 * `sourceOwnership` is sharded by OWNER, and a shard may declare only what its owner owns. Claims are
 * taken at the capability (ADR-0270 D1), and a declaration's owner IS a capability — or a story, where
 * no capability is the honest answer — so two sessions the notice board lets run at once edit two
 * different files by construction rather than by convention. The quieter domains keep one `_domain`
 * shard each. Any of them may take more named shards later; composition does not care how a domain is
 * split.
 *
 * ## Composition refuses; it never picks
 *
 * {@link composeManifest} hands back a manifest only when the whole set is well-formed and says one
 * thing. Everything else is a {@link ManifestCompositionFault}, reported all together and worded as its
 * own repair: a misnamed or unreadable fragment, a section no domain owns or the contract does not
 * define, a value of the wrong shape, a key declared twice (identically or not, in one file or two), a
 * declaration in the wrong shard, an owner shard declaring nothing, a required section nobody supplies,
 * and one declaration covering another (`subtreeCovers`). A consumer that cannot compose must stand
 * down, as it does today when the aggregate is unreadable — never fall back to a partial view.
 *
 * Owners are NOT resolved here. Whether a declared owner names a real capability stays the existing
 * checks' question (`storytree ownership`, the claim universe), answered exactly as before; asking it
 * here would make composition need the work tree.
 *
 * ## "The same manifest", precisely
 *
 * Composition is ORDER-FREE: the result is a function of the declarations and notes alone — never of
 * how they were split, or of the order a filesystem listed them in — and every object comes out with
 * its keys sorted by code unit. So the composed view equals the aggregate as data but not as bytes: the
 * aggregate's authored key order, which sets each `$section_*` note above the declarations it
 * introduces, is presentation and does not survive. The one place order ever decided an answer is a
 * file two declarations both match, and a COVERED declaration is refused rather than ordered.
 */

import type { SubtreeOwnershipEntry } from "./source-ownership-map.js";
import { literalPrefix, subtreeCovers } from "./subtree-match.js";

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

/** Any JSON value — what a fragment holds, and what the composed manifest is made of. */
export type ManifestJson =
  | string
  | number
  | boolean
  | null
  | readonly ManifestJson[]
  | { readonly [key: string]: ManifestJson };

/** A JSON object: the manifest, every fragment, and every section of either. */
export interface ManifestObject {
  readonly [key: string]: ManifestJson;
}

/** One fragment as the composer receives it. */
export interface ManifestFragmentSource {
  /** Where it sits under the fragment root, `/`-separated: `<domain>/<shard>.json`. */
  readonly path: string;
  readonly text: string;
}

/** A directory of fragments, and the manifest sections its fragments — and only its — may supply. */
export interface ManifestDomain {
  readonly dir: string;
  readonly sections: readonly string[];
}

export const MANIFEST_DOMAINS: readonly ManifestDomain[] = [
  { dir: "repo-surface", sections: ["root", "docs"] },
  { dir: "package-ownership", sections: ["packageOwnership"] },
  { dir: "source-ownership", sections: ["sourceOwnership"] },
  { dir: "hierarchy-camps", sections: ["hierarchyCamps"] },
  { dir: "hosted-stories", sections: ["hostedStories"] },
];

/** The shard every domain has: its notes, and whatever part of it is not split any finer. */
export const DOMAIN_SHARD = "_domain";

/** The one domain sharded by owner. */
const OWNER_SHARDED = "source-ownership";
/** The manifest's own top-level note describes the repo-surface allow-list the manifest began as. */
const TOP_LEVEL_NOTES = "repo-surface";

const DOMAIN_DIRS = new Set(MANIFEST_DOMAINS.map((domain) => domain.dir));
const DOMAIN_OF = new Map(
  MANIFEST_DOMAINS.flatMap((domain) => domain.sections.map((section): [string, string] => [section, domain.dir])),
);

/**
 * What the manifest holds at one path. `optional` marks the one kind of section a manifest may lack —
 * only the ownership baseline, today.
 */
type SectionSpec =
  /** An object whose keys the contract names. */
  | { readonly shape: "section"; readonly children: Readonly<Record<string, SectionSpec>>; readonly optional?: true }
  /** An object whose keys are data — a path, a package, a story — each mapped to a value. */
  | { readonly shape: "map"; readonly entries: "text" | "object"; readonly optional?: true }
  /** One value, supplied whole. */
  | { readonly shape: "value"; readonly holds: "text-list" | "object"; readonly optional?: true };

type SectionOf = Extract<SectionSpec, { readonly shape: "section" }>;

const TEXT_MAP = { shape: "map", entries: "text" } as const satisfies SectionSpec;

/**
 * The manifest, section by section. Every section is REQUIRED except the ownership baseline: each is
 * read by a check that treats its absence as a blind read, so a composed manifest silently lacking one
 * would be worse than none. Extend this — and {@link MANIFEST_DOMAINS} — before adding a section to the
 * manifest; composition refuses a section it does not know.
 */
const MANIFEST = {
  shape: "section",
  children: {
    root: { shape: "section", children: { files: TEXT_MAP, dirs: TEXT_MAP } },
    docs: { shape: "section", children: { allowedDirs: TEXT_MAP, files: TEXT_MAP } },
    packageOwnership: {
      shape: "section",
      children: { organisms: TEXT_MAP, foundational: { shape: "value", holds: "text-list" }, surfaces: TEXT_MAP },
    },
    sourceOwnership: {
      shape: "section",
      children: { baseline: { shape: "value", holds: "object", optional: true }, subtrees: TEXT_MAP },
    },
    hierarchyCamps: { shape: "section", children: { readers: { shape: "map", entries: "object" } } },
    hostedStories: { shape: "section", children: { register: TEXT_MAP } },
  },
} as const satisfies SectionSpec;

const HOLDS = { "text-list": "a list of strings", object: "an object" } as const;

export type ManifestFaultKind =
  | "unreadable-fragment-set"
  | "malformed-fragment"
  | "duplicate-fragment"
  | "duplicate-key"
  | "contested-key"
  | "misplaced-declaration"
  | "empty-fragment"
  | "missing-section"
  | "overlapping-declaration";

interface FaultBody {
  /** The fragments at fault, sorted — empty when the fault is the set's rather than any one file's. */
  readonly fragments: readonly string[];
  /** The manifest path concerned, e.g. `sourceOwnership.subtrees["packages/cli/src"]` — empty when none. */
  readonly at: string;
  /** Worded as its own repair. */
  readonly message: string;
}

type PlainFaultKind = Exclude<ManifestFaultKind, "overlapping-declaration">;

export type ManifestCompositionFault =
  | (FaultBody & { readonly kind: PlainFaultKind })
  | (FaultBody & {
      readonly kind: "overlapping-declaration";
      /** The declaration claiming every file `specific` names. */
      readonly broad: SubtreeOwnershipEntry;
      readonly specific: SubtreeOwnershipEntry;
    });

export type ManifestComposition =
  | { readonly ok: true; readonly manifest: ManifestObject }
  | { readonly ok: false; readonly faults: readonly ManifestCompositionFault[] };

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** A value one fragment puts at one path: a note, one entry of a map, or a whole value. */
interface Contribution {
  readonly fragment: string;
  /** The section or map the value sits in. */
  readonly within: readonly string[];
  readonly key: string;
  readonly value: ManifestJson;
}

/** What one fragment says, before it is held against the rest of the set. */
interface FragmentReading {
  readonly contributions: readonly Contribution[];
  /**
   * The sections, maps and whole values it supplies — what makes a required one present. Supplied
   * EMPTY is still supplied: a statement, not an absence.
   */
  readonly supplies: readonly (readonly string[])[];
  readonly faults: readonly ManifestCompositionFault[];
}

/**
 * Compose a fragment set into the manifest — or refuse it, naming every reason at once.
 *
 * Pure: the sources are the whole input, so a caller composes the working tree, a merge base, or a
 * fixture through exactly the same judgement.
 */
export function composeManifest(sources: readonly ManifestFragmentSource[]): ManifestComposition {
  const readings = sources.map(readFragment);
  const supplies = readings.flatMap((reading) => reading.supplies);
  const contributions = readings.flatMap((reading) => reading.contributions);
  const faults = [
    ...repeatedFragments(sources),
    ...readings.flatMap((reading) => reading.faults),
    ...collisions(contributions),
    ...missingSections(new Set(supplies.map(pathKey))),
    ...overlaps(contributions),
  ];
  if (faults.length > 0) return { ok: false, faults: inOrder(faults) };
  return { ok: true, manifest: assemble(supplies, contributions) };
}

// ---------------------------------------------------------------------------
// The repository's manifest — the aggregate and the fragment tree beside it
// ---------------------------------------------------------------------------

/** The committed aggregate, as fault messages name it. */
export const REPO_MANIFEST = "repo-manifest.json";

/** The fragment tree beside it: named for it, and the directory every fragment path is relative to. */
export const REPO_MANIFEST_TREE = "repo-manifest";

/**
 * What a reader of the repository's manifest found, before any judgement: the committed aggregate and
 * the fragment tree beside it.
 *
 * THE MIGRATION'S SHAPE. ADR-0556 D5 moves authority one domain at a time, so for a while the manifest
 * is part aggregate and part fragments — `sourceOwnership` in the tree, every other section still in
 * `repo-manifest.json`. The aggregate is split exactly as {@link splitManifest} splits it and set beside
 * the tree's files, and the one composer judges the whole set, so no reader can tell, or needs to, which
 * half a section came from.
 */
export interface RepoManifestSources {
  /** The aggregate's text — or why it could not be read. */
  readonly aggregate: { readonly text: string } | { readonly unread: string };
  /** The fragment tree beside the aggregate, as it was read — `null` where there is none. */
  readonly tree: { readonly fragments: readonly ManifestFragmentSource[]; readonly unread: readonly string[] } | null;
}

/**
 * Compose the repository's manifest from the aggregate and the fragment tree beside it — or refuse it,
 * with every reason, exactly as {@link composeManifest} refuses a fragment set.
 *
 * ONE HOME PER SECTION. A section whose domain has fragments in the tree may not also sit in the
 * aggregate: two homes compose into duplicate declarations at best and a silently shadowed one at worst,
 * and the aggregate is the half that is leaving (ADR-0556 D1). So it is refused, naming the move — which
 * is also what turns a declaration written to the aggregate AFTER its section moved into a refusal
 * rather than a quiet second source.
 */
export function composeRepoManifest(sources: RepoManifestSources): ManifestComposition {
  if ("unread" in sources.aggregate) {
    return refused([fault("unreadable-fragment-set", [], [], `${REPO_MANIFEST}: ${sources.aggregate.unread}`)]);
  }
  const aggregate = parseObject(sources.aggregate.text);
  if (typeof aggregate === "string") {
    return refused([fault("malformed-fragment", [REPO_MANIFEST], [], `${REPO_MANIFEST}: ${aggregate}`)]);
  }
  const tree = sources.tree ?? { fragments: [], unread: [] };
  if (tree.unread.length > 0) {
    return refused(tree.unread.map((message) => fault("unreadable-fragment-set", [], [], message)));
  }
  const inTree = new Set(tree.fragments.map((f) => f.path.split("/")[0]));
  const twoHomes = Object.keys(aggregate)
    .filter((key) => inTree.has(domainOf(key)))
    .map((key) =>
      fault(
        "misplaced-declaration",
        [REPO_MANIFEST],
        [key],
        `${REPO_MANIFEST}: ${label([key])} belongs to the ${domainOf(key)} domain, whose fragments live in ` +
          `${REPO_MANIFEST_TREE}/${domainOf(key)}/ — a section has one home, so move what it declares into ` +
          `those fragments and delete it here`,
      ),
    );
  if (twoHomes.length > 0) return refused(twoHomes);
  return composeManifest([...splitManifest(aggregate), ...tree.fragments]);
}

function refused(faults: readonly ManifestCompositionFault[]): ManifestComposition {
  return { ok: false, faults: inOrder(faults) };
}

/** The domain directory a top-level key is filed under — its own name where no domain claims it. */
function domainOf(key: string): string {
  return key.startsWith("$") ? TOP_LEVEL_NOTES : (DOMAIN_OF.get(key) ?? key);
}

function readFragment(source: ManifestFragmentSource): FragmentReading {
  const contributions: Contribution[] = [];
  const supplies: (readonly string[])[] = [];
  const faults: ManifestCompositionFault[] = [];
  const reading: FragmentReading = { contributions, supplies, faults };
  const refuse = (kind: PlainFaultKind, path: readonly string[], why: string): void => {
    faults.push(fault(kind, [source.path], path, `${source.path}: ${why}`));
  };
  const contribute = (within: readonly string[], key: string, value: ManifestJson): void => {
    contributions.push({ fragment: source.path, within, key, value });
  };

  const address = fragmentAddress(source.path);
  if (address === undefined) {
    refuse(
      "malformed-fragment",
      [],
      `not a fragment path — a fragment is <domain>/<shard>.json, where <domain> is one of ` +
        `${[...DOMAIN_DIRS].join(", ")} and <shard> is ${DOMAIN_SHARD} or a kebab-case id`,
    );
    return reading;
  }
  const parsed = parseObject(source.text);
  if (typeof parsed === "string") {
    refuse("malformed-fragment", [], parsed);
    return reading;
  }
  for (const path of duplicateKeyPaths(source.text)) {
    refuse(
      "duplicate-key",
      path,
      `${label(path)} appears more than once in this one file — JSON keeps only the last, so the others ` +
        `would vanish without a word; keep exactly one`,
    );
  }

  const note = (within: readonly string[], key: string, value: ManifestJson): void => {
    if (typeof value === "string") contribute(within, key, value);
    else refuse("malformed-fragment", [...within, key], `${label([...within, key])} is a note (its key begins with $), so it must be a string`);
  };
  const entry = (entries: "text" | "object", within: readonly string[], key: string, value: ManifestJson): void => {
    const valid = entries === "text" ? typeof value === "string" && value !== "" : isObject(value);
    if (key !== "" && valid) contribute(within, key, value);
    else {
      refuse(
        "malformed-fragment",
        [...within, key],
        `${label([...within, key])} must map a non-empty key to ${entries === "text" ? "a non-empty string" : "an object"}`,
      );
    }
  };
  const section = (spec: SectionOf, within: readonly string[], key: string, value: ManifestJson): void => {
    const child = spec.children[key];
    if (child === undefined) {
      refuse(
        "malformed-fragment",
        [...within, key],
        `${label([...within, key])} is not a section the manifest defines — a new section needs the fragment ` +
          `contract extended first (MANIFEST in packages/drive/src/manifest-fragments.ts)`,
      );
    } else walk(child, within, key, value);
  };
  const walk = (spec: SectionSpec, within: readonly string[], key: string, value: ManifestJson): void => {
    const path = [...within, key];
    if (spec.shape === "value") {
      if (holds(spec.holds, value)) {
        supplies.push(path);
        contribute(within, key, value);
      } else refuse("malformed-fragment", path, `${label(path)} must be ${HOLDS[spec.holds]}`);
      return;
    }
    if (!isObject(value)) {
      refuse("malformed-fragment", path, `${label(path)} must be an object`);
      return;
    }
    supplies.push(path);
    for (const [childKey, child] of Object.entries(value)) {
      if (childKey.startsWith("$")) note(path, childKey, child);
      else if (spec.shape === "map") entry(spec.entries, path, childKey, child);
      else section(spec, path, childKey, child);
    }
  };

  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith("$")) {
      if (address.dir === TOP_LEVEL_NOTES) note([], key, value);
      else refuse("misplaced-declaration", [key], `the manifest's own top-level notes live in ${TOP_LEVEL_NOTES} fragments — move ${label([key])} there`);
      continue;
    }
    const home = DOMAIN_OF.get(key) ?? address.dir;
    if (home === address.dir) section(MANIFEST, [], key, value);
    else refuse("misplaced-declaration", [key], `${key} belongs to the ${home} domain — move it to a fragment under ${home}/`);
  }

  if (address.dir === OWNER_SHARDED) holdToOwnerShard(address.shard, contributions, refuse);
  return reading;
}

/**
 * The owner-shard rules. `_domain` carries the section's notes and baseline and never a declaration;
 * a named shard declares subtrees for its own owner, and nothing else, and at least one.
 */
function holdToOwnerShard(
  shard: string,
  contributions: readonly Contribution[],
  refuse: (kind: PlainFaultKind, path: readonly string[], why: string) => void,
): void {
  const declarations = contributions.filter(isDeclaration);
  if (shard === DOMAIN_SHARD) {
    for (const d of declarations) {
      refuse(
        "misplaced-declaration",
        pathOf(d),
        `${DOMAIN_SHARD}.json holds the section's notes and baseline, never a declaration — move ` +
          `${label(pathOf(d))} to ${OWNER_SHARDED}/${String(d.value)}.json`,
      );
    }
    return;
  }
  for (const c of contributions.filter((c) => pathKey(c.within) !== SUBTREES)) {
    refuse(
      "misplaced-declaration",
      pathOf(c),
      `an owner fragment declares subtrees and nothing else — move ${label(pathOf(c))} to ` +
        `${OWNER_SHARDED}/${DOMAIN_SHARD}.json`,
    );
  }
  for (const d of declarations.filter((d) => d.value !== shard)) {
    refuse(
      "misplaced-declaration",
      pathOf(d),
      `this is ${shard}'s fragment, but ${label(pathOf(d))} is declared for ${String(d.value)} — move it to ` +
        `${OWNER_SHARDED}/${String(d.value)}.json`,
    );
  }
  if (declarations.length === 0) {
    refuse("empty-fragment", [], `declares nothing for ${shard} — add the declarations it exists for, or delete it`);
  }
}

const SUBTREES = pathKey(["sourceOwnership", "subtrees"]);

/** A declaration is an entry of the subtree map; a `$` key beside one is that map's prose. */
function isDeclaration(c: Contribution): boolean {
  return pathKey(c.within) === SUBTREES && !c.key.startsWith("$");
}

/** A shard's file name: `_domain`, or a kebab-case id, then `.json`. The directory is held to the domains. */
const SHARD_FILE = /^(?:_domain|[a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;

function fragmentAddress(path: string): { readonly dir: string; readonly shard: string } | undefined {
  const slash = path.indexOf("/");
  const dir = path.slice(0, slash);
  const file = path.slice(slash + 1);
  return DOMAIN_DIRS.has(dir) && SHARD_FILE.test(file) ? { dir, shard: file.slice(0, -".json".length) } : undefined;
}

function parseObject(text: string): ManifestObject | string {
  try {
    const parsed: ManifestJson = JSON.parse(text);
    return isObject(parsed) ? parsed : "does not hold a JSON object";
  } catch (error) {
    return `is not valid JSON (${String(error)})`;
  }
}

function repeatedFragments(sources: readonly ManifestFragmentSource[]): ManifestCompositionFault[] {
  const counts = new Map<string, number>();
  for (const { path } of sources) counts.set(path, (counts.get(path) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([path, count]) =>
      fault("duplicate-fragment", [path], [], `${path} was supplied ${count} times — one path names one file, so there is no telling which is meant`),
    );
}

function collisions(contributions: readonly Contribution[]): ManifestCompositionFault[] {
  const byPath = new Map<string, { readonly path: readonly string[]; readonly group: Contribution[] }>();
  for (const c of contributions) {
    const path = pathOf(c);
    const seen = byPath.get(pathKey(path));
    if (seen === undefined) byPath.set(pathKey(path), { path, group: [c] });
    else seen.group.push(c);
  }
  return [...byPath.values()]
    .filter(({ group }) => group.length > 1)
    .map(({ path, group }) => {
      const fragments = group.map((c) => c.fragment);
      const said = [...new Set(group.map((c) => `${c.fragment} says ${JSON.stringify(canonicalJson(c.value))}`))].sort();
      return new Set(group.map((c) => JSON.stringify(canonicalJson(c.value)))).size === 1
        ? fault("duplicate-key", fragments, path, `${label(path)} is declared ${group.length} times, identically (${said.join("; ")}) — keep exactly one`)
        : fault(
            "contested-key",
            fragments,
            path,
            `${label(path)} is declared ${group.length} times with different values (${said.join("; ")}) — decide which is true and keep only that one`,
          );
    });
}

function missingSections(supplied: ReadonlySet<string>): ManifestCompositionFault[] {
  const absent = (spec: SectionOf, within: readonly string[]): ManifestCompositionFault[] =>
    Object.entries(spec.children).flatMap(([key, child]) => {
      const path = [...within, key];
      if (supplied.has(pathKey(path))) return child.shape === "section" ? absent(child, path) : [];
      if (child.optional === true) return [];
      return [
        fault(
          "missing-section",
          [],
          path,
          `no fragment supplies ${label(path)} — every check that reads the manifest reads it, and a missing ` +
            `section is a blind read rather than an empty one; supply it (an explicitly empty value is a legal statement)`,
        ),
      ];
    });
  return absent(MANIFEST, []);
}

function overlaps(contributions: readonly Contribution[]): ManifestCompositionFault[] {
  const declared = new Map(
    contributions
      .filter(isDeclaration)
      .map((c) => [c.key, { subtree: c.key, owner: String(c.value), fragment: c.fragment }] as const),
  );
  return coveringCandidates([...declared.values()])
    .filter(({ broad, specific }) => subtreeCovers(broad.subtree, specific.subtree))
    .map(({ broad, specific }): ManifestCompositionFault => {
      const at = label(["sourceOwnership", "subtrees", specific.subtree]);
      return {
        kind: "overlapping-declaration",
        fragments: [...new Set([broad.fragment, specific.fragment])].sort(),
        at,
        broad: { subtree: broad.subtree, owner: broad.owner },
        specific: { subtree: specific.subtree, owner: specific.owner },
        message:
          `${at} (${specific.owner}) is covered by ${JSON.stringify(broad.subtree)} (${broad.owner}, in ${broad.fragment}): ` +
          `every file it names is claimed by the broader declaration too, so which owner a file is credited to would ` +
          `be decided by declaration order — and fragments have no order. Narrow the broader subtree until it stops ` +
          `covering this one, or drop this one (the manifest's authoring rule (2): declarations are disjoint).`,
      };
    });
}

/**
 * Every ordered pair of declarations in which the first COULD cover the second — the only pairs
 * `subtreeCovers` is asked about. `broad` can cover `specific` only when `specific`'s literal prefix
 * begins with `broad`'s, which rules out almost every pair in a map of hundreds before the expensive
 * question is put. Returned as a value, so the bound is tested as one rather than trusted.
 */
export function coveringCandidates<T extends { readonly subtree: string }>(
  declarations: readonly T[],
): { readonly broad: T; readonly specific: T }[] {
  const prefixed = declarations.map((declaration) => ({ declaration, prefix: literalPrefix(declaration.subtree) }));
  return prefixed.flatMap((specific, i) =>
    prefixed
      .filter((broad, j) => j !== i && specific.prefix.startsWith(broad.prefix))
      .map((broad) => ({ broad: broad.declaration, specific: specific.declaration })),
  );
}

/** One stable order — by message, which leads with the fragment or path it concerns. */
function inOrder(faults: readonly ManifestCompositionFault[]): ManifestCompositionFault[] {
  return [...new Set(faults.map((f) => f.message))].sort().flatMap((message) => faults.filter((f) => f.message === message));
}

function fault(kind: PlainFaultKind, fragments: readonly string[], path: readonly string[], message: string): ManifestCompositionFault {
  return { kind, fragments: [...new Set(fragments)].sort(), at: label(path), message };
}

// ---------------------------------------------------------------------------
// Building JSON — the composed manifest and the fragments of an aggregate
// ---------------------------------------------------------------------------

type Tree = Map<string, Tree | ManifestJson>;

function assemble(supplies: readonly (readonly string[])[], contributions: readonly Contribution[]): ManifestObject {
  const tree: Tree = new Map();
  for (const path of supplies) branch(tree, path);
  for (const c of contributions) branch(tree, c.within).set(c.key, c.value);
  return treeObject(tree);
}

/** The node at `path`, created — as an empty object — wherever it does not exist yet. */
function branch(tree: Tree, path: readonly string[]): Tree {
  return path.reduce<Tree>((node, key) => {
    const existing = node.get(key);
    if (existing instanceof Map) return existing;
    const created: Tree = new Map();
    node.set(key, created);
    return created;
  }, tree);
}

function treeObject(tree: Tree): ManifestObject {
  return canonicalObject(Object.fromEntries([...tree].map(([key, node]) => [key, node instanceof Map ? treeObject(node) : node])));
}

/**
 * `value` with every object's keys in code-unit order, at every depth. A list keeps its own order —
 * that is data, not presentation. (A key that reads as an array index would still enumerate first,
 * because JavaScript orders those itself; the manifest has none, and the result is deterministic either way.)
 */
export function canonicalJson(value: ManifestJson): ManifestJson {
  if (Array.isArray(value)) return value.map(canonicalJson);
  return isObject(value) ? canonicalObject(value) : value;
}

function canonicalObject(value: ManifestObject): ManifestObject {
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key] ?? null)]));
}

/**
 * The fragments an aggregate manifest breaks into at the claim grain — the inverse of
 * {@link composeManifest}, the migration `repo-manifest-source-ownership-fragments` ran for
 * `sourceOwnership`, and how {@link composeRepoManifest} reads the sections still in the aggregate.
 *
 * TOTAL, and deliberately dumb: every key lands somewhere, and anything the contract would not accept
 * lands where composition will refuse it by name — a section no domain owns goes under a directory
 * named for it, a non-string owner stays in `_domain` — rather than being judged, or dropped, here.
 */
export function splitManifest(manifest: ManifestObject): ManifestFragmentSource[] {
  const fragments = new Map<string, Tree>();
  const into = (fragment: string, within: readonly string[]): Tree => {
    const tree = fragments.get(fragment) ?? new Map();
    fragments.set(fragment, tree);
    return branch(tree, within);
  };
  const domainShard = (dir: string): string => `${dir}/${DOMAIN_SHARD}.json`;
  for (const [key, value] of Object.entries(manifest)) {
    const dir = domainOf(key);
    if (dir !== OWNER_SHARDED || !isObject(value)) {
      into(domainShard(dir), []).set(key, value);
      continue;
    }
    for (const [part, content] of Object.entries(value)) {
      if (part !== "subtrees" || !isObject(content)) {
        into(domainShard(dir), [key]).set(part, content);
        continue;
      }
      // The map is supplied from `_domain` even when every declaration in it moves out to an owner.
      into(domainShard(dir), [key, part]);
      for (const [subtree, owner] of Object.entries(content)) {
        const shard = subtree.startsWith("$") || typeof owner !== "string" ? DOMAIN_SHARD : owner;
        into(`${dir}/${shard}.json`, [key, part]).set(subtree, owner);
      }
    }
  }
  return [...fragments.keys()]
    .sort()
    .map((path) => ({ path, text: `${JSON.stringify(treeObject(fragments.get(path) ?? new Map()), null, 2)}\n` }));
}

// ---------------------------------------------------------------------------
// Reading JSON text
// ---------------------------------------------------------------------------

/** A frame of the scan below: the object or array it is inside, and the path that container sits at. */
type ScanFrame =
  | { readonly kind: "object"; readonly path: readonly string[]; readonly keys: Set<string>; awaitingKey: boolean }
  | { readonly kind: "array"; readonly path: readonly string[]; index: number };

/**
 * A string, or a punctuation mark. Nothing else in JSON — a number, `true`, `false`, `null`, whitespace
 * — can open a container or name a key, so the scan skips it.
 */
const JSON_TOKEN = /"(?:[^"\\]|\\.)*"|[{}[\]:,]/g;

/**
 * Every path at which `text` declares one object key more than once. `JSON.parse` keeps the LAST of
 * them without a word, so in a hand-edited fragment a pasted-in repeat would silently delete the
 * declaration it repeats — which is why this reads the text rather than trusting the parse.
 *
 * Meaningful only for text `JSON.parse` accepts; the composer asks it about nothing else.
 */
export function duplicateKeyPaths(text: string): string[][] {
  // A JSON text holds one value, so this stack is empty only before its first container opens and after
  // its last one closes: an element seeded beneath it would be consulted only by a top-level scalar,
  // which has no key to repeat.
  // Stryker disable next-line ArrayDeclaration: EQUIVALENT — see the note above.
  const frames: ScanFrame[] = [];
  const repeated: string[][] = [];
  // The path of the value about to be read — where the next container to open will sit.
  let slot: readonly string[] = [];
  for (const [token] of text.matchAll(JSON_TOKEN)) {
    const top = frames.at(-1);
    if (token === "{") frames.push({ kind: "object", path: slot, keys: new Set(), awaitingKey: true });
    else if (token === "[") {
      frames.push({ kind: "array", path: slot, index: 0 });
      slot = [...slot, "0"];
    } else if (token === "}" || token === "]") frames.pop();
    else if (top?.kind === "array") {
      if (token === ",") {
        top.index += 1;
        slot = [...top.path, String(top.index)];
      }
    } else if (top?.kind === "object") {
      if (token === ",") top.awaitingKey = true;
      else if (top.awaitingKey) {
        // Awaiting a key, the only token valid JSON can hold is the key's own string.
        const key: string = JSON.parse(token);
        if (top.keys.has(key)) repeated.push([...top.path, key]);
        top.keys.add(key);
        slot = [...top.path, key];
        top.awaitingKey = false;
      }
    }
  }
  return repeated;
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

function isObject(value: ManifestJson): value is ManifestObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function holds(kind: "text-list" | "object", value: ManifestJson): boolean {
  return kind === "object" ? isObject(value) : Array.isArray(value) && value.every((item) => typeof item === "string");
}

function pathOf(c: Contribution): readonly string[] {
  return [...c.within, c.key];
}

function pathKey(path: readonly string[]): string {
  return JSON.stringify(path);
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** A manifest path as a reader writes one: `sourceOwnership.subtrees["packages/cli/src"]`. */
function label(path: readonly string[]): string {
  return path.map((key, index) => (IDENTIFIER.test(key) ? `${index === 0 ? "" : "."}${key}` : `[${JSON.stringify(key)}]`)).join("");
}
