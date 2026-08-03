// Reading the COMMITTED SEED at a git revision — the shared git half of both corpus checks'
// attribution (ADR-0290 for `check:corpus-content`, and the absence classifier for
// `check:corpus-sync`).
//
// WHY IT IS SHARED RATHER THAN COPIED. Both checks join a PER-BRANCH surface (this working tree's
// `knowledge.json`) to a MACHINE-SHARED one (the live store), and both therefore have to answer the
// same two git questions before they can charge anything: what did THIS BRANCH do to the seed since
// the merge base, and what does `origin/main` carry today. `check:corpus-content` answered them first;
// `check:corpus-sync` was blind to both (measured 2026-08-03: `grep -c "origin/main\|merge-base"`
// returned ZERO in `check-corpus-sync.ts` and `sync-drain.ts`) and its remedy therefore RESURRECTED an
// owner-retired artifact. A second implementation of "what does main's seed say" would be a drift seam
// for no gain, and the two checks disagreeing about what "behind main" means is exactly the failure
// that makes a gate's own printed output untrustworthy.
//
// Every read DEGRADES rather than throws: `null` means "git could not say", and each caller decides
// what an unmeasurable signal costs it. Both callers charge rather than excuse (ADR-0290 D7).
//
// NOT pure — this is the `node:`/git side. The classifiers it feeds (`corpus-content-attribution.ts`)
// stay pure and injectable.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { REPO_ROOT_ENV, resolveRepoRoot } from "@storytree/library";
import type { SeedEntry } from "@storytree/library/store";
import { canonicalJson } from "@storytree/library/store";

/** The one committed seed, relative to the repo root — the path `git show <rev>:<path>` also takes. */
export const SEED_REL = "apps/studio/data/knowledge.json";

/**
 * The repo the seed belongs to — a PARAMETER (ADR-0246), so a scratch-root control run still works.
 *
 * `fromModuleUrl` is the caller's `import.meta.url`; the derived root is four levels up from it
 * (`packages/cli/src/<file>` → the repo root).
 */
export function repoRoot(fromModuleDir: string): string {
  return resolveRepoRoot({
    env: process.env[REPO_ROOT_ENV],
    derived: path.resolve(fromModuleDir, "..", "..", ".."),
  }).root;
}

/** Run git in the seed's repo, or `null` on any failure. Never throws — every caller degrades. */
export function git(root: string, args: readonly string[]): string | null {
  try {
    return execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

/** The seed entries at a git revision, keyed by id, or `null` if that revision has no readable seed. */
export function seedEntriesAt(root: string, rev: string): Map<string, SeedEntry> | null {
  const raw = git(root, ["show", `${rev}:${SEED_REL}`]);
  if (raw === null) return null;
  try {
    const entries = JSON.parse(raw) as SeedEntry[];
    return new Map(entries.map((e) => [e.id, e]));
  } catch {
    return null;
  }
}

/** The seed entries in the WORKING TREE (uncommitted edits included), or `null` if unreadable. */
export function workingSeedEntries(root: string): Map<string, SeedEntry> | null {
  try {
    const entries = JSON.parse(readFileSync(path.join(root, SEED_REL), "utf8")) as SeedEntry[];
    return new Map(entries.map((e) => [e.id, e]));
  } catch {
    return null;
  }
}

/** Ids whose seed entry differs between two revisions of the file — added, removed, or edited. */
export function changedSeedIds(a: Map<string, SeedEntry>, b: Map<string, SeedEntry>): Set<string> {
  const changed = new Set<string>();
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const l = a.get(id);
    const r = b.get(id);
    if (l === undefined || r === undefined || canonicalJson(l) !== canonicalJson(r)) changed.add(id);
  }
  return changed;
}

/**
 * Ids present in `now` but ABSENT from `base` — what this branch ADDED to the seed.
 *
 * Distinct from {@link changedSeedIds}, and the distinction is load-bearing for the absence
 * classifier: an id merely EDITED by this branch is not a graduation, while an id this branch added is
 * exactly the never-migrated population `check:corpus-sync` exists to catch. Asking the symmetric
 * question there would charge a branch for an edit it made to a row that has been in the seed for
 * months.
 */
export function seedIdsAddedBetween(base: Map<string, SeedEntry>, now: Map<string, SeedEntry>): Set<string> {
  return new Set([...now.keys()].filter((id) => !base.has(id)));
}
