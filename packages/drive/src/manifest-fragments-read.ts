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
 */

import { readdirSync, readFileSync } from "node:fs";
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
