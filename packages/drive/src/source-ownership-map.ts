/**
 * THE ONE READER of `repo-manifest.json` → `sourceOwnership` (ADR-0317 D2).
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
 * place that knows the manifest's shape.
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

import { existsSync, readFileSync } from "node:fs";

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
 * Read the declared subtree map from a manifest path.
 *
 * `null` means no caller composed one, which is NOT the same as "there are no subtrees": it is a
 * source that could not be read, and it is reported as such so the caller stands down rather than
 * concluding every subtree id names nothing.
 */
export function readSourceOwnershipMap(manifestPath: string | null): SourceOwnershipMapRead {
  if (manifestPath === null) {
    return fail("no repo manifest was supplied, so declared subtrees are unknown");
  }
  if (!existsSync(manifestPath)) return fail(`the repo manifest at ${manifestPath} is absent`);
  return parseSourceOwnershipMap(readFileSync(manifestPath, "utf8"), `the repo manifest`);
}

/**
 * The PURE half of {@link readSourceOwnershipMap} — the map read out of manifest TEXT.
 *
 * EXTRACTED RATHER THAN CLONED, which is the whole reason it is exported. `check:ownership-totality`
 * has to ask the same question of the manifest as it stood at `git merge-base origin/main HEAD` — was
 * this file owned BEFORE this branch? — and that text arrives from `git show`, never from a path. A
 * second parser at the call site would be a second place that knows the manifest's shape, in a check
 * whose entire verdict is a comparison between two reads of it: the two could disagree about what is
 * declared, and the disagreement would present as a phantom ownership change nobody made. Sharing the
 * parse makes the two reads structurally identical.
 *
 * `source` names where the text came from, so a failure says which read broke — "the repo manifest"
 * and "the merge-base repo manifest" are very different repairs.
 */
export function parseSourceOwnershipMap(text: string, source: string): SourceOwnershipMapRead {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    return fail(`${source} is unreadable (${why})`);
  }

  const block = manifest["sourceOwnership"];
  if (block === null || typeof block !== "object") {
    return fail(`${source} declares no \`sourceOwnership\` block`);
  }
  const raw = (block as Record<string, unknown>)["subtrees"];
  if (raw === null || typeof raw !== "object") {
    return fail(`${source} declares no \`sourceOwnership.subtrees\` map`);
  }

  const subtrees: SubtreeOwnershipEntry[] = [];
  for (const [subtree, owner] of Object.entries(raw as Record<string, unknown>)) {
    // `$`-prefixed keys are the map's own prose ($comment, $section_*) — never declarations.
    if (subtree.startsWith("$") || typeof owner !== "string") continue;
    subtrees.push({ subtree, owner });
  }

  return { subtrees, baseline: readBaseline(block as Record<string, unknown>), unread: [] };
}

/** A malformed baseline is DROPPED, not an unread source: the trend is cosmetic, the map is not. */
function readBaseline(block: Record<string, unknown>): SourceOwnershipBaseline | undefined {
  const raw = block["baseline"];
  if (raw === null || typeof raw !== "object") return undefined;
  const b = raw as Record<string, unknown>;
  const { date, files, unowned } = b;
  if (typeof date !== "string" || typeof files !== "number" || typeof unowned !== "number") {
    return undefined;
  }
  return { date, files, unowned };
}
