/**
 * The manifest fragment tree, off the disk — the one impure half of the seam `manifest-fragments.ts`
 * defines (ADR-0556 D3).
 *
 * It only LISTS: every file under the root, at its `/`-separated path, with its text. Whether a path
 * names a fragment is the pure composer's judgement, so the rule lives in one place — and a stray file
 * (a mistyped extension, a nested directory) is refused by name instead of skipped, which would drop
 * whatever declarations were inside it.
 *
 * It reads the WORKING TREE, not the index. Ownership is branch-local, and an edit a session has not
 * committed yet is exactly what its own checks must see — the property the committed aggregate has
 * today, kept.
 *
 * A COMMIT is read the same way through git ({@link readManifestFragmentTreeAt}): listed, then read in
 * full or not at all, so a check comparing the working tree with its merge base asks both halves of the
 * one question through the one composer.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  composeManifest,
  composeRepoManifest,
  type ManifestComposition,
  type ManifestFragmentSource,
} from "./manifest-fragments.js";

export interface ManifestFragmentTreeRead {
  readonly fragments: readonly ManifestFragmentSource[];
  /** Non-empty ⇒ the tree did not read in full ⇒ nothing composed from it may be trusted. */
  readonly unread: readonly string[];
}

/** Every file under `root`. A tree that cannot be listed or read in full is UNREAD, never partial. */
export function readManifestFragmentTree(root: string): ManifestFragmentTreeRead {
  try {
    return { fragments: listFiles(root, []), unread: [] };
  } catch (error) {
    return { fragments: [], unread: [`the manifest fragment tree at ${root} could not be read in full (${String(error)})`] };
  }
}

function listFiles(root: string, within: readonly string[]): ManifestFragmentSource[] {
  return readdirSync(path.join(root, ...within), { withFileTypes: true }).flatMap((entry) => {
    const at = [...within, entry.name];
    return entry.isDirectory()
      ? listFiles(root, at)
      : [{ path: at.join("/"), text: readFileSync(path.join(root, ...at), "utf8") }];
  });
}

/** Read the tree at `root` and compose it — refused outright when the tree did not read in full. */
export function composeManifestTree(root: string): ManifestComposition {
  const read = readManifestFragmentTree(root);
  if (read.unread.length > 0) {
    return {
      ok: false,
      faults: read.unread.map((message) => ({ kind: "unreadable-fragment-set", fragments: [], at: "", message })),
    };
  }
  return composeManifest(read.fragments);
}

/**
 * The fragment tree that belongs to a manifest file: the directory beside it, named for it —
 * `repo-manifest.json` → `repo-manifest/`. Deriving it from the file rather than from a repo root keeps
 * every reader's existing argument, and gives a fixture manifest in a temporary directory its own tree
 * or none.
 */
export function manifestFragmentRoot(manifestPath: string): string {
  return path.join(path.dirname(manifestPath), path.basename(manifestPath, path.extname(manifestPath)));
}

/**
 * The repository's manifest as the WORKING TREE holds it: the aggregate at `manifestPath` composed with
 * the fragment tree beside it. No tree is a legal statement — every section still in the aggregate —
 * while a tree that cannot be read is refused, never quietly replaced by the aggregate alone.
 */
export function readRepoManifest(manifestPath: string): ManifestComposition {
  const root = manifestFragmentRoot(manifestPath);
  return composeRepoManifest({
    aggregate: existsSync(manifestPath)
      ? { text: readFileSync(manifestPath, "utf8") }
      : { unread: `absent at ${manifestPath}` },
    tree: existsSync(root) ? readManifestFragmentTree(root) : null,
  });
}

/** What a reader needs from git to see a manifest as it stood at a commit. */
export interface GitTreeReader {
  /** The text of the repo-relative `file` at `ref` — `null` when git will not give it. */
  readonly show: (ref: string, file: string) => string | null;
  /** Every file under the repo-relative `dir` at `ref`: `[]` when there is none, `null` when git could not list. */
  readonly list: (ref: string, dir: string) => readonly string[] | null;
}

/**
 * The fragment tree `dir` as it stood at `ref` — `null` where that commit has none.
 *
 * Read in full or reported UNREAD, never partial, exactly like the disk reader: a merge-base map missing
 * one owner's file would charge every file that owner declares to the branch under test.
 */
export function readManifestFragmentTreeAt(git: GitTreeReader, ref: string, dir: string): ManifestFragmentTreeRead | null {
  const listed = git.list(ref, dir);
  if (listed === null) {
    return { fragments: [], unread: [`the manifest fragment tree ${dir}/ could not be listed at ${ref}`] };
  }
  if (listed.length === 0) return null;
  const fragments: ManifestFragmentSource[] = [];
  for (const file of listed) {
    const text = file.startsWith(`${dir}/`) ? git.show(ref, file) : null;
    if (text === null) {
      return { fragments: [], unread: [`the manifest fragment tree ${dir}/ could not be read in full at ${ref} (${file})`] };
    }
    fragments.push({ path: file.slice(dir.length + 1), text });
  }
  return { fragments, unread: [] };
}
