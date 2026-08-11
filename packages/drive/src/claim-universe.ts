/**
 * Gathering the claim namespace — the I/O half of `claim-namespace.ts` (ADR-0310 D2).
 *
 * The universe a claim is judged against has THREE sources, because the addressable work graph does:
 * the DISK tree (`stories/**` — story / capability / contract, ADR-0192's landlord rule keeps it
 * file-canonical), the LIVE Library (arcs and increments, which are store-canonical under
 * ADR-0302 D1), and the REPO MANIFEST (`sourceOwnership.subtrees` — the declared subtree map,
 * ADR-0317 D2, claimable since D3). None can answer for the others, so a claim check needs all three.
 *
 * ## Every read failure withdraws the licence to refuse
 *
 * This module's real job is not gathering — it is knowing when it FAILED to gather. A false
 * refusal blocks a session from claiming work it genuinely owns; the leak it replaces merely fails
 * to catch a typo. So the asymmetry is deliberate and total: any source that does not read in full
 * sets {@link ClaimUniverse.complete} to false, `resolveClaimId` then answers `unverified`, and the
 * claim proceeds exactly as it did before this check existed. There is no partial-refusal mode.
 *
 * Concretely: no `stories/` directory, an unreadable directory, a node file whose frontmatter
 * declares a tier but no id, a null library store, a library read that throws, an absent or
 * unparseable `repo-manifest.json`, or a manifest carrying no `sourceOwnership.subtrees` map — each
 * one alone is enough to stand every claim down. The manifest joining the sources therefore cannot
 * START refusing anything: the worst an unreadable map can do is switch the check off (ADR-0317 D3).
 *
 * ## Why the library read is not filtered by kind
 *
 * One `queryDocs()` returns the whole corpus and is partitioned here, because the refusal needs the
 * NON-claimable artifacts too: `session-orchestrator` took two phantom claim events and is a live
 * `agent` artifact, and "that is a real artifact of a kind you cannot claim" is a different message
 * from "that names nothing". Two filtered reads would cost a second round-trip to say less.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  CLAIMABLE_KINDS,
  claimNamespaceRefusalBody,
  claimNamespaceRefusalNext,
  resolveClaimId,
  type AddressableNonClaimable,
  type ClaimKind,
  type ClaimResolution,
  type ClaimSuggestion,
  type ClaimTarget,
  type ClaimUniverse,
} from "./claim-namespace.js";
import type { Envelope } from "./envelope.js";
import { readSourceOwnershipMap } from "./source-ownership-map.js";

/**
 * The Library read slice, duck-typed — never a `/store` import, so this module and everything above
 * it stays offline-testable (the `ClaimLedgerStoreLike` pattern). Satisfied by `PgLibraryStore`.
 */
export interface LibraryDocsReadLike {
  queryDocs(filter?: { kind?: string }): Promise<readonly { readonly doc: unknown }[]>;
}

/** The tiers the disk tree declares, and the {@link ClaimKind} each becomes. Identity, but named. */
const TREE_TIERS = new Set<string>(["story", "capability", "contract"]);

/** The kinds the REPO MANIFEST is authoritative for — never sourced from the Library. */
const MANIFEST_KINDS = new Set<string>(["subtree"]);

/**
 * Library kinds that ARE claimable — the store-canonical slice of {@link CLAIMABLE_KINDS}, i.e. what
 * is left once the disk tree's and the manifest's kinds are removed. Subtracted rather than listed
 * so a kind can only ever have ONE authoritative source: a Library artifact that called itself a
 * `subtree` would be a `nonClaimable` artifact here, not a second way to mint a claimable id.
 */
const LIVE_CLAIMABLE = new Set<string>(
  CLAIMABLE_KINDS.filter((k) => !TREE_TIERS.has(k) && !MANIFEST_KINDS.has(k)),
);

/**
 * PURE: pull `id` and `tier` out of a node file's YAML frontmatter.
 *
 * Deliberately a tolerant scan rather than a schema parse. The alternative — `loadNodeSpec`, which
 * zod-validates the whole spec — throws on anything malformed, and a throw here DROPS the node from
 * the universe, which is precisely how a legitimate claim would come to be refused. This reads the
 * two fields it needs and ignores everything else, so a node with an unrelated frontmatter problem
 * still defends its own id.
 *
 * Returns null for a file that is not a node at all (no frontmatter, or no tier) — `stories/` holds
 * a couple of `interface-*.md` prose docs, and they are not claim targets. The one shape that is
 * NOT null and NOT a target is a file declaring a node tier with no readable id: that is a node
 * this failed to read, and the caller escalates it to an unread source.
 *
 * `uat_witness` rides along for a STORY (ADR-0346 D2, via {@link ClaimTarget.uatWitness}) and is
 * NEVER escalated when missing: absent is a legal, extremely common frontmatter — it is the
 * fail-closed `human` default (ADR-0040) — so an unreadable value would be a story that cannot be
 * claimed at all rather than one that cannot be claimed at work grade.
 */
export function parseNodeFrontmatter(
  text: string,
):
  | { readonly id: string; readonly kind: ClaimKind; readonly uatWitness?: string }
  | { readonly unreadable: true }
  | null {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (fm === undefined) return null;
  const tier = /^tier:\s*["']?([^"'\n\r]+?)["']?\s*$/m.exec(fm)?.[1];
  if (tier === undefined || !TREE_TIERS.has(tier)) return null;
  const id = /^id:\s*["']?([^"'\n\r]+?)["']?\s*$/m.exec(fm)?.[1];
  if (id === undefined || id.trim().length === 0) return { unreadable: true };
  const witness = /^uat_witness:\s*["']?([^"'\n\r]+?)["']?\s*$/m.exec(fm)?.[1]?.trim();
  return {
    id: id.trim(),
    kind: tier as ClaimKind,
    ...(tier === "story" && witness !== undefined && witness.length > 0
      ? { uatWitness: witness }
      : {}),
  };
}

/** What one source contributed, and what it failed to contribute. */
interface SourceResult {
  readonly targets: readonly ClaimTarget[];
  readonly nonClaimable: readonly AddressableNonClaimable[];
  /** Non-empty ⇒ this source did not read in full ⇒ nothing may be refused. */
  readonly unread: readonly string[];
}

/**
 * Walk `stories/**` for every addressable node. One level of directories, `.md` files inside —
 * the shape `discoverStories` in `tree.ts` already assumes and `validate-corpus.ts` enforces.
 */
export function readTreeTargets(storiesDir: string): SourceResult {
  if (!existsSync(storiesDir)) {
    return { targets: [], nonClaimable: [], unread: [`the story tree at ${storiesDir} is absent`] };
  }
  const targets: ClaimTarget[] = [];
  const unread: string[] = [];
  let entries: readonly { name: string; isDirectory(): boolean }[];
  try {
    entries = readdirSync(storiesDir, { withFileTypes: true });
  } catch (err) {
    return { targets: [], nonClaimable: [], unread: [`the story tree is unreadable (${msg(err)})`] };
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(storiesDir, entry.name);
    let files: readonly string[];
    try {
      files = readdirSync(dir);
    } catch (err) {
      unread.push(`stories/${entry.name} is unreadable (${msg(err)})`);
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      let parsed: ReturnType<typeof parseNodeFrontmatter>;
      try {
        parsed = parseNodeFrontmatter(readFileSync(path.join(dir, file), "utf8"));
      } catch (err) {
        unread.push(`stories/${entry.name}/${file} is unreadable (${msg(err)})`);
        continue;
      }
      if (parsed === null) continue;
      if ("unreadable" in parsed) {
        unread.push(`stories/${entry.name}/${file} declares a node tier but no id`);
        continue;
      }
      targets.push(parsed);
    }
  }
  return { targets, nonClaimable: [], unread };
}

/**
 * Partition the live corpus: claimable kinds become targets, everything else becomes the
 * addressable-but-not-claimable set the refusal explains with.
 */
export async function readLibraryTargets(
  library: LibraryDocsReadLike | null,
): Promise<SourceResult> {
  if (library === null) {
    return {
      targets: [],
      nonClaimable: [],
      unread: ["the live Library is not open (no --pg), so arcs and increments are unknown"],
    };
  }
  let docs: readonly { readonly doc: unknown }[];
  try {
    docs = await library.queryDocs();
  } catch (err) {
    return { targets: [], nonClaimable: [], unread: [`the live Library read failed (${msg(err)})`] };
  }
  const targets: ClaimTarget[] = [];
  const nonClaimable: AddressableNonClaimable[] = [];
  for (const row of docs) {
    const doc = row.doc as { kind?: unknown; id?: unknown } | null;
    if (doc === null || typeof doc !== "object") continue;
    const { kind, id } = doc;
    if (typeof kind !== "string" || typeof id !== "string" || id.length === 0) continue;
    if (LIVE_CLAIMABLE.has(kind)) targets.push({ id, kind: kind as ClaimKind });
    else nonClaimable.push({ id, kind });
  }
  return { targets, nonClaimable, unread: [] };
}

/**
 * The declared subtree map as claim targets (ADR-0317 D3) — each entry's KEY is its id, verbatim,
 * and the unit the map holds responsible rides along as {@link ClaimTarget.owner} so a claim can
 * name it.
 *
 * The key is used as-is deliberately: it is where the object is declared, so it is the object's
 * address. See `claim-namespace.ts`'s header for why resolution stays exact-key-only rather than
 * accepting any contained file path — a claim row is keyed by the raw string, so a per-file id would
 * be a claim two sessions could hold over the same code without ever contending.
 */
export function readSubtreeTargets(manifestPath: string | null): SourceResult {
  const map = readSourceOwnershipMap(manifestPath);
  return {
    targets: map.subtrees.map((d) => ({ id: d.subtree, kind: "subtree", owner: d.owner })),
    nonClaimable: [],
    unread: map.unread,
  };
}

/** Read all three sources and fold them into one universe. */
export async function loadClaimUniverse(sources: {
  readonly storiesDir: string;
  readonly library: LibraryDocsReadLike | null;
  /**
   * Path to `repo-manifest.json`. REQUIRED rather than optional, and `null` is a legal value meaning
   * "no caller composed one" — so a new composition site has to decide in the open instead of
   * silently switching the whole check off, which is what an omittable field would allow.
   */
  readonly manifestPath: string | null;
}): Promise<ClaimUniverse> {
  const [tree, live, subtrees] = await Promise.all([
    Promise.resolve(readTreeTargets(sources.storiesDir)),
    readLibraryTargets(sources.library),
    Promise.resolve(readSubtreeTargets(sources.manifestPath)),
  ]);
  const unreadSources = [...tree.unread, ...live.unread, ...subtrees.unread];
  return {
    targets: [...tree.targets, ...live.targets, ...subtrees.targets],
    nonClaimable: [...tree.nonClaimable, ...live.nonClaimable, ...subtrees.nonClaimable],
    complete: unreadSources.length === 0,
    unreadSources,
  };
}

/**
 * The seam every claim-taking verb takes: read the universe AT MOST ONCE per command.
 *
 * Memoised because `declare --node a --node b --node c` resolves three ids and must not pay three
 * corpus reads for them, and because the check must be a rounding error on a claim — a namespace
 * fence that made claiming slow would be routed around. Lazily invoked, so a command that never
 * takes a claim never opens the corpus at all.
 */
export type ClaimUniverseLoader = () => Promise<ClaimUniverse>;

export function createClaimUniverseLoader(sources: {
  readonly storiesDir: string;
  readonly library: LibraryDocsReadLike | null;
  readonly manifestPath: string | null;
}): ClaimUniverseLoader {
  let pending: Promise<ClaimUniverse> | undefined;
  return () => (pending ??= loadClaimUniverse(sources));
}

// ---------------------------------------------------------------------------
// The guard every claim-taking verb calls
// ---------------------------------------------------------------------------

/**
 * The answer a claim verb acts on: proceed (carrying the resolved kind, or null when the check did
 * not run) or refuse (carrying the ready-made envelope).
 */
export type NamespaceGuard =
  | {
      readonly ok: true;
      readonly kind: ClaimKind | null;
      /** {@link ClaimTarget.owner} — a subtree's declared owner, else null. */
      readonly owner: string | null;
      /**
       * {@link ClaimTarget.uatWitness} — a story's declared `uat_witness`, else null (which covers
       * both "declares none" and "the check did not run"). {@link fenceStoryWorkClaim} is the ONE
       * reader; it treats every non-`machine` value the same way, so the two cases need not be
       * told apart here.
       */
      readonly uatWitness: string | null;
    }
  | {
      readonly ok: false;
      /** Ready-made, for a single-id verb. */
      readonly refusal: Envelope;
      /** The raw near-misses, for a multi-node verb rendering one line per node. */
      readonly suggestions: readonly ClaimSuggestion[];
    };

/** Proceed unchecked — the shape returned wherever the namespace could not have its say. */
const UNCHECKED: NamespaceGuard = { ok: true, kind: null, owner: null, uatWitness: null };

/**
 * Judge one id before a claim is written. The ONE place the four claim-taking paths — `noticeboard
 * claim`, `noticeboard upgrade`, `noticeboard declare --node` and `worktree create --node` — get
 * their answer, so a widened rule cannot teach three of them and miss the fourth.
 *
 * FAIL-OPEN, THREE TIMES OVER, and each is deliberate: an absent loader (nothing composed it),
 * an incomplete universe (`resolveClaimId` answers `unverified`), and a loader that THROWS all
 * proceed unchecked. The check is a fence against a typo, and no fence against a typo is worth
 * refusing a session's real work over an unreadable corpus.
 */
export async function guardClaimNamespace(input: {
  readonly id: string;
  readonly universe: ClaimUniverseLoader | null | undefined;
  /** The command to re-run, printed in the refusal so the remedy is copy-pasteable. */
  readonly verb: string;
}): Promise<NamespaceGuard> {
  const { id, universe, verb } = input;
  if (universe === null || universe === undefined) return UNCHECKED;

  let resolution: ClaimResolution;
  try {
    resolution = resolveClaimId(id, await universe());
  } catch {
    // The namespace check is never the reason a claim fails to be taken.
    return UNCHECKED;
  }
  if (resolution.verdict === "resolved") {
    return {
      ok: true,
      kind: resolution.target.kind,
      owner: resolution.target.owner ?? null,
      uatWitness: resolution.target.uatWitness ?? null,
    };
  }
  if (resolution.verdict === "unverified") return UNCHECKED;
  return {
    ok: false,
    suggestions: resolution.suggestions,
    refusal: {
      ok: false,
      body: claimNamespaceRefusalBody({ id, suggestions: resolution.suggestions, verb }),
      next: claimNamespaceRefusalNext(resolution.suggestions),
    },
  };
}

/**
 * `" [capability]"` when the kind is known, `""` when the check did not run — and
 * `" [subtree, owned by gate-ci-parity]"` for a declared subtree, because the kind alone would leave
 * the session guessing which unit the code it just claimed belongs to.
 */
export function kindSuffix(kind: ClaimKind | null, owner: string | null = null): string {
  if (kind === null) return "";
  return owner === null ? ` [${kind}]` : ` [${kind}, owned by ${owner}]`;
}

/**
 * The lines a SUBTREE claim adds to an exclusive-slot verb (`claim --grade work`, `upgrade`,
 * `declare --node`). Empty for every other kind.
 *
 * WHY THIS EXISTS AT ALL. A subtree and its owning unit are two ids over the SAME code, and the
 * ledger keys claims by id — so a session holding `gate-ci-parity` and a session holding
 * `packages/cli/src/gate*.ts` both get their wisp and neither is told about the other. That overlap
 * is real and is deliberately NOT enforced: containment across globs is a mechanism with no measured
 * demand (all 56 refusals in the 40-day history were on nodes, none cross-grain) and ADR-0311
 * retired sixteen rungs for want of exactly that evidence. Announcing it at the moment the claim is
 * taken, with the board command to check, is what keeps the gap VISIBLE rather than undiscovered.
 */
export function subtreeClaimNote(kind: ClaimKind | null, owner: string | null): string[] {
  if (kind !== "subtree" || owner === null) return [];
  return [
    `  This is the SUBTREE, not ${owner}. The ledger keys claims by id and knows no containment,`,
    `  so a session holding ${owner} does NOT contend with you over the same files — check both.`,
  ];
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
