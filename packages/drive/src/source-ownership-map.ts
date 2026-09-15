/**
 * THE ONE READER of the declared source-ownership map, `sourceOwnership` (ADR-0317 D2).
 *
 * Two surfaces consume the declared subtree map and neither may read it its own way:
 *
 *  - `storytree ownership` (`packages/cli/src/ownership.ts`) holds it to the disk — the totality
 *    check that keeps the map from decaying.
 *  - the CLAIM NAMESPACE (`claim-universe.ts`) turns each declaration into a claimable object, so a
 *    session writing `packages/cli/src/gate*.ts` has an id to bind to (ADR-0317 D3).
 *
 * It lives in `drive` because `cli` may import `drive` and `drive` may never import `cli`. The
 * gatherer in `cli` keeps its name and signature and delegates here, so there is still exactly one
 * place that knows the map's shape.
 *
 * ## It reads the COMPOSED manifest
 *
 * The map is no longer a block of `repo-manifest.json`: it is one fragment per owner under
 * `repo-manifest/source-ownership/`, composed with the aggregate beside it through the one fail-closed
 * seam every reader uses (ADR-0556 D3, `manifest-fragments.ts`). A set the composer refuses — a malformed
 * fragment, a key declared twice, one declaration covering another, a section with two homes — is
 * UNREAD here, never a partial map: a declaration silently skipped would present as an unowned file, or
 * as a claim id that names nothing.
 *
 * ## Reading FAILURE is the interesting return value
 *
 * {@link SourceOwnershipMapRead.unread} carries the reasons the map could not be read in full, and
 * the claim universe treats a non-empty `unread` the way it treats an unreadable story tree: the
 * whole namespace check STANDS DOWN rather than refusing anything (`claim-universe.ts`). That
 * asymmetry is the design's centre — a false refusal blocks a session from claiming work it
 * genuinely owns, while the leak it replaces merely fails to catch a typo. So an absent manifest, an
 * unparseable one, or one with no `sourceOwnership.subtrees` object must never START refusing
 * claims; each one withdraws the licence to refuse instead.
 *
 * An `subtrees: {}` that IS present and IS an object is a different statement — a deliberately empty
 * map — and reads clean with zero entries.
 */

import { composeRepoManifest, refusalReasons, REPO_MANIFEST, REPO_MANIFEST_TREE, type ManifestComposition } from "./manifest-fragments.js";
import { readManifestFragmentTreeAt, readRepoManifest, type GitTreeReader } from "./manifest-fragments-read.js";

/** One entry of the declared map: a subtree (path or glob), and the addressable object owning it. */
export interface SubtreeOwnershipEntry {
  /** Repo-relative, POSIX-separated. Globs permitted — this map binds no verdict (ADR-0317 D2). */
  readonly subtree: string;
  /** An id in the work graph: a capability by preference, a story where none is the honest answer. */
  readonly owner: string;
}

/** The recorded measurement the report's trend line is computed against. */
export interface SourceOwnershipBaseline {
  readonly date: string;
  readonly files: number;
  readonly unowned: number;
}

export interface SourceOwnershipMapRead {
  readonly subtrees: readonly SubtreeOwnershipEntry[];
  /** Absent when the manifest records none — no trend is stated rather than a zero invented. */
  readonly baseline: SourceOwnershipBaseline | undefined;
  /** Non-empty ⇒ the map did not read in full ⇒ the claim namespace stands down. */
  readonly unread: readonly string[];
}

function fail(why: string): SourceOwnershipMapRead {
  return { subtrees: [], baseline: undefined, unread: [why] };
}

/**
 * Read the declared subtree map for the manifest at `manifestPath` — the aggregate composed with the
 * fragment tree beside it.
 *
 * `null` means no caller composed one, which is NOT the same as "there are no subtrees": it is a
 * source that could not be read, and it is reported as such so the caller stands down rather than
 * concluding every subtree id names nothing.
 */
export function readSourceOwnershipMap(manifestPath: string | null): SourceOwnershipMapRead {
  if (manifestPath === null) {
    return fail("no repo manifest was supplied, so declared subtrees are unknown");
  }
  return sourceOwnershipOf(readRepoManifest(manifestPath), "the repo manifest");
}

/**
 * The map as it stood at a commit — what `check:ownership-totality` charges a branch against.
 *
 * It asks git for exactly what the working-tree read gets from the disk and composes it through the same
 * seam, so the two reads cannot disagree about what is declared: in a check whose entire verdict is a
 * comparison between them, a disagreement would present as an ownership change nobody made. `source`
 * names the read, so a failure says which one broke.
 *
 * THE ONE COMPATIBILITY PATH, and it is explicit. A commit from before the map moved into fragments has
 * no tree, and history is not migrated: its aggregate is read by {@link parseLegacySourceOwnershipMap},
 * the parser it was always read by — which also tolerates the covered declarations that map carried
 * until `repo-manifest-covered-declarations-resolved`, so a branch whose merge base predates that
 * landing is charged against its base rather than blinded by it. Delete this path, and that parser,
 * when the aggregate leaves Git (`repo-manifest-aggregate-leaves-git`).
 */
export function readSourceOwnershipMapAt(git: GitTreeReader, ref: string, source: string): SourceOwnershipMapRead {
  const tree = readManifestFragmentTreeAt(git, ref, REPO_MANIFEST_TREE);
  const text = git.show(ref, REPO_MANIFEST);
  if (tree === null) {
    return text === null ? fail(`${source} could not be read at ${ref}`) : parseLegacySourceOwnershipMap(text, source);
  }
  const aggregate = text === null ? { unread: `could not be read at ${ref}` } : { text };
  return sourceOwnershipOf(composeRepoManifest({ aggregate, tree }), source);
}

/** The map out of a composition — UNREAD, carrying every reason the composer gave, when there is none. */
export function sourceOwnershipOf(composition: ManifestComposition, source: string): SourceOwnershipMapRead {
  if (!composition.ok) {
    return fail(`${source} did not compose — ${refusalReasons(composition.faults)}`);
  }
  return sourceOwnershipIn(composition.manifest, source);
}

/**
 * The map out of an aggregate's TEXT, read the way it was before the map moved into fragments — kept
 * ONLY for commits from before that move ({@link readSourceOwnershipMapAt}). It skips an entry the
 * composer would refuse, which is right for history and wrong for anything a session can still edit.
 */
export function parseLegacySourceOwnershipMap(text: string, source: string): SourceOwnershipMapRead {
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return fail(`${source} is unreadable (${why})`);
  }
  return sourceOwnershipIn(manifest, source);
}

function sourceOwnershipIn(manifest: unknown, source: string): SourceOwnershipMapRead {
  const block = isRecord(manifest) ? manifest["sourceOwnership"] : undefined;
  if (!isRecord(block)) {
    return fail(`${source} declares no \`sourceOwnership\` block`);
  }
  const raw = block["subtrees"];
  if (!isRecord(raw)) {
    return fail(`${source} declares no \`sourceOwnership.subtrees\` map`);
  }

  const subtrees: SubtreeOwnershipEntry[] = [];
  for (const [subtree, owner] of Object.entries(raw)) {
    // `$`-prefixed keys are the map's own prose ($comment, $section_*) — never declarations.
    if (subtree.startsWith("$") || typeof owner !== "string") continue;
    subtrees.push({ subtree, owner });
  }

  return { subtrees, baseline: readBaseline(block), unread: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

/** A malformed baseline is DROPPED, not an unread source: the trend is cosmetic, the map is not. */
function readBaseline(block: Record<string, unknown>): SourceOwnershipBaseline | undefined {
  const raw = block["baseline"];
  if (!isRecord(raw)) return undefined;
  const { date, files, unowned } = raw;
  if (typeof date !== "string" || typeof files !== "number" || typeof unowned !== "number") {
    return undefined;
  }
  return { date, files, unowned };
}
