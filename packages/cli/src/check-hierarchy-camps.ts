/**
 * `pnpm check:hierarchy-camps` — the thin I/O SHELL that holds every work-hierarchy reader to a
 * declared camp (ADR-0445 D1, `map-freshness-arc` inc-04). The rule lives in the pure judge next
 * door ({@link file://./hierarchy-camps.ts}); this module only gathers.
 *
 * The same gatherer/judge split `check-boundaries.ts` / `boundaries.ts`,
 * `check-ownership-totality.ts` / `ownership-totality.ts` and `check-hierarchy-drift.ts` /
 * `hierarchy-drift.ts` use, and for the same reason: the rule stays exhaustively unit-testable
 * offline while the I/O glue stays dumb and total.
 *
 * ## THE SWEEP FAILS WIDE, AND ITS APERTURE IS THE REPO ROOT
 *
 * It walks from the repo root rather than reusing `gatherSourceFiles`, whose aperture is
 * `packages/*` and `apps/*`. That aperture is right for the ownership map and wrong here: three of
 * today's readers live under `docs/research/`, and a new top-level directory would be invisible to a
 * fence the day it appeared. Every exclusion below is therefore a STATED aperture rather than a
 * convenience, and each one is a place this rung does not look:
 *
 *  - test files — a test's camp is its subject's, and a test builds fixture trees whose `stories`
 *    paths name no real source. Including them would fill the registry with entries that cannot
 *    answer the camp question.
 *  - `legacy/` — the vendored, read-only V1 Rust submodule. Not ours to declare and not ours to edit.
 *  - `web/` — a separate repository behind a gitlink, with its own manifest. This manifest does not
 *    describe it.
 *  - `node_modules`, `dist`, build output, `.git`, `.claude` — not source. `.claude` in particular
 *    holds every sibling worktree in the primary checkout, so walking it would sweep other branches'
 *    files into this branch's verdict.
 *
 * ## OFFLINE and READ-ONLY
 *
 * Disk only — no DB, no `--pg`, no network, no spend. So it runs in CI exactly as it runs on a
 * laptop, and it sits in the gate's cheap-first block with its `check:boundaries` and
 * `check:ownership-totality` neighbours. Its store-reading sibling `check:hierarchy-drift` asks a
 * different question (is the mirror STALE) and stays where it is.
 *
 * ## A BLINDED SWEEP IS A FAILURE, NEVER A SKIP
 *
 * An unreadable manifest, an empty declaration map, and a walk that found no files each mean the
 * answer is unknown — and this is a fence, so unknown is refused rather than waved through. They
 * surface as BLIND CHECK, distinct from a breach, because a reader must not go looking for a
 * wrong-camp module when what actually broke is an enumeration.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_ROOT_ENV, resolveRepoRoot } from "@storytree/library";

import {
  formatHierarchyCamps,
  judgeHierarchyCamps,
  parseHierarchyCampMap,
  readHierarchyAccess,
  VacuousCampSweep,
  type HierarchyAccess,
} from "./hierarchy-camps.js";

const TAG = "[check:hierarchy-camps]";
const MANIFEST = "repo-manifest.json";

/** Directories the walk never enters. Each one is an aperture stated in the module header. */
const SKIP_DIRS: ReadonlySet<string> = new Set(["build", "coverage", "dist", "legacy", "node_modules", "web"]);

const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|mjs|cjs)$/;
const TEST_FILE = /\.(?:test|spec)\.(?:ts|tsx|mts|cts|mjs|cjs)$/;

// The repo root is a PARAMETER (ADR-0246), exactly as `check:boundaries` treats it.
const repoRoot = resolveRepoRoot({
  env: process.env[REPO_ROOT_ENV],
  derived: fileURLToPath(new URL("../../../", import.meta.url)),
}).root;

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    // Dot-directories carry tooling state, never declared source — and `.claude` in the primary
    // checkout holds every sibling worktree, which would sweep other branches into this verdict.
    if (entry.isDirectory() && (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name))) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!SOURCE_FILE.test(entry.name) || TEST_FILE.test(entry.name)) continue;
    out.push(relative(repoRoot, full).split(sep).join("/"));
  }
}

function main(): void {
  const manifestPath = join(repoRoot, MANIFEST);
  if (!existsSync(manifestPath)) {
    console.error(`${TAG} BLIND CHECK — the repo manifest at ${manifestPath} is absent`);
    process.exit(1);
  }
  const map = parseHierarchyCampMap(readFileSync(manifestPath, "utf8"), "the repo manifest");
  if (map.unread.length > 0) {
    // Loud, and NOT a verdict: an unreadable map would otherwise present as "every reader is
    // undeclared", sending the author to write declarations that are already there.
    console.error(`${TAG} BLIND CHECK — ${map.unread.join("; ")}`);
    process.exit(1);
  }

  const files: string[] = [];
  walk(repoRoot, files);
  files.sort();

  const accesses: HierarchyAccess[] = [];
  for (const path of files) {
    const access = readHierarchyAccess({ path, text: readFileSync(join(repoRoot, path), "utf8") });
    if (access !== null) accesses.push(access);
  }

  const verdict = judgeHierarchyCamps({
    accesses,
    declarations: map.readers,
    walked: files.length,
    seen: new Set(files),
  });

  const body = formatHierarchyCamps(verdict);
  if (verdict.verdict === "fail") {
    console.error(body);
    process.exit(1);
  }
  console.log(body);
}

try {
  main();
} catch (err) {
  if (err instanceof VacuousCampSweep) {
    // A blind check is its own outcome, distinct from a breach — a reader must not go hunting for a
    // wrong-camp module when what actually broke is an enumeration.
    console.error(`${TAG} BLIND CHECK — ${err.message}`);
    process.exit(1);
  }
  throw err;
}
