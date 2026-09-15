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
 * committed yet is exactly what its own checks must see.
 *
 * A COMMIT is read the same way through git ({@link readManifestFragmentTreeAt}): listed, then read in
 * full or not at all, so a check comparing the working tree with its merge base asks both halves of the
 * one question through the one composer.
 *
 * THE TREE IS THE WHOLE MANIFEST. The committed aggregate that sat beside it left Git
 * (`repo-manifest-aggregate-leaves-git`, ADR-0556 D4), so nothing here reads a file outside the tree. A
 * `repo-manifest.json` left on a disk belongs to no manifest, and `pnpm check:manifest-fragments` refuses
 * one rather than let it pass for an edit surface.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { composeManifest, type ManifestComposition, type ManifestFragmentSource } from "./manifest-fragments.js";

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
      : [{ path: at.join("/"), text: readManifestText(path.join(root, ...at)) }];
  });
}

/**
 * One fragment's text. Every fragment is read by this one function, so no two halves of one manifest can
 * be decoded two different ways before the composer judges them as a set.
 */
function readManifestText(file: string): string {
  return readFileSync(file, "utf8");
}

/**
 * A tree as it was read, composed — or refused with every reason it did not read in full. The one step the
 * working tree and a commit share, so an unread tree is refused the same way wherever it was read from.
 */
export function composeFragmentTree(read: ManifestFragmentTreeRead): ManifestComposition {
  return read.unread.length > 0 ? unreadable(read.unread) : composeManifest(read.fragments);
}

/**
 * The repository's manifest as the WORKING TREE holds it: the fragment tree at `root`, composed. An absent
 * tree is refused naming where it looked — there is no other half to fall back on — and a tree that cannot
 * be read in full is refused, never composed from whatever did read.
 */
export function readRepoManifest(root: string): ManifestComposition {
  return existsSync(root)
    ? composeFragmentTree(readManifestFragmentTree(root))
    : unreadable([`the manifest fragment tree is absent at ${root}`]);
}

function unreadable(messages: readonly string[]): ManifestComposition {
  return {
    ok: false,
    faults: messages.map((message) => ({ kind: "unreadable-fragment-set", fragments: [], at: "", message })),
  };
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
