/**
 * `pnpm check:manifest-fragments` — the thin I/O shell over {@link judgeManifestTree} (ADR-0556 D4,
 * `repo-manifest-aggregate-leaves-git`), wired into `pnpm gate` and the CI `verify` job. The rule and its wording
 * live in the pure judge next door (`manifest-fragments-verdict.ts`); this module only gathers, and repairs on
 * request.
 *
 * `--write` rewrites a tree that composes but has drifted into its one form: a missing fragment is created, a
 * drifted one rewritten, an extra one deleted. What the tree declares is unchanged by construction — every write
 * is `splitManifest` of the tree's own composition. It writes nothing for a tree that does not compose, and it
 * never touches a `repo-manifest.json`: that is the author's to move and delete.
 *
 * OFFLINE and disk-only: no git, no store, no network — so it runs in CI exactly as it runs on a laptop.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_ROOT_ENV, resolveRepoRoot } from "@storytree/library";
import { readManifestFragmentTree, REPO_MANIFEST_TREE } from "@storytree/drive";

import { MONOLITH } from "./manifest-boundaries.js";
import { formatManifestTreeVerdict, judgeManifestTree, type ManifestTreeVerdict } from "./manifest-fragments-verdict.js";

// The repo root is a PARAMETER (ADR-0246), exactly as `check:boundaries` treats it.
const repoRoot = resolveRepoRoot({
  env: process.env[REPO_ROOT_ENV],
  derived: fileURLToPath(new URL("../../../", import.meta.url)),
}).root;
const treeRoot = join(repoRoot, REPO_MANIFEST_TREE);

function judge(): ManifestTreeVerdict {
  return judgeManifestTree({
    tree: existsSync(treeRoot) ? readManifestFragmentTree(treeRoot) : null,
    aggregatePresent: existsSync(join(repoRoot, MONOLITH)),
  });
}

function main(): void {
  let verdict = judge();
  if (process.argv.includes("--write") && verdict.drift.length > 0) {
    for (const drift of verdict.drift) {
      const file = join(treeRoot, ...drift.path.split("/"));
      if (drift.repair === "delete") {
        rmSync(file);
      } else {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, drift.text, "utf8");
      }
    }
    console.log(`rewrote ${verdict.drift.length} fragment(s) under ${REPO_MANIFEST_TREE}/ in the form the composer writes`);
    verdict = judge();
  }
  const report = formatManifestTreeVerdict(verdict);
  if (verdict.refusals.length > 0) {
    console.error(report);
    process.exit(1);
  }
  console.log(report);
}

main();
