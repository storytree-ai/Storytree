import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectWorkHierarchy } from "@storytree/drive";
import {
  REPO_ROOT_ENV,
  resolveRepoRoot,
  type WorkHierarchySnapshot,
} from "@storytree/library";
import { closePool, createPool } from "@storytree/library/store";

import { commitShaOf, git, storiesTreeSha } from "./hierarchy-git.js";
import {
  judgeUatRevisionContinuity,
  readUatRevisionVerdictEvents,
} from "./uat-revision-continuity.js";

/**
 * `pnpm check:uat-revision-continuity` — the I/O shell for ADR-0560 D3/D4's merge wall.
 *
 * The BASE is exactly `merge-base(origin/main, HEAD)`, never the live hierarchy mirror and never a
 * hand-waved `origin/main`: the question is what THIS candidate changed. The candidate remains the
 * working tree, so a local pre-commit gate observes the edit it is about to permit. The live store
 * supplies only signed verdict history. Every rule over those readings lives in the pure judge next
 * door; this file only gathers, reports and chooses exit status.
 */

const EXIT_FAIL = 1;
const TAG = "[check:uat-revision-continuity]";

const repoRoot = (): string =>
  resolveRepoRoot({
    env: process.env[REPO_ROOT_ENV],
    derived: fileURLToPath(new URL("../../../", import.meta.url)),
  }).root;

function storyFilesAt(root: string, ref: string): string[] | null {
  const listing = git(root, ["ls-tree", "-r", "--name-only", ref, "--", "stories"]);
  if (listing === null || listing.length === 0) return null;
  const files = listing
    .split(/\r?\n/)
    .map((entry) => entry.trim().replace(/\\/g, "/"))
    .filter((entry) => /^stories\/[^/]+\/story\.md$/.test(entry))
    .sort();
  return files.length > 0 ? files : null;
}

/** Materialize only story specs from a git tree; capability bodies are irrelevant to this judge. */
function projectHierarchyAtRef(root: string, ref: string): WorkHierarchySnapshot | null {
  const commitSha = commitShaOf(root, ref);
  const treeSha = storiesTreeSha(root, ref);
  const files = storyFilesAt(root, ref);
  if (commitSha === null || treeSha === null || files === null) return null;

  const scratch = mkdtempSync(path.join(tmpdir(), "storytree-uat-revision-base-"));
  try {
    for (const file of files) {
      const text = git(root, ["show", `${ref}:${file}`]);
      if (text === null) return null;
      const destination = path.join(scratch, ...file.split("/"));
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, `${text}\n`, "utf8");
    }
    return projectWorkHierarchy(path.join(scratch, "stories"), {
      commitSha,
      storiesTreeSha: treeSha,
      generatedAt: new Date().toISOString(),
      generator: TAG,
    });
  } catch {
    return null;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function projectCandidate(root: string): WorkHierarchySnapshot | null {
  const commitSha = commitShaOf(root, "HEAD");
  const treeSha = storiesTreeSha(root, "HEAD");
  if (commitSha === null || treeSha === null) return null;
  try {
    return projectWorkHierarchy(path.join(root, "stories"), {
      commitSha,
      // Provenance only here. The candidate may contain uncommitted story edits; the pure judge
      // compares rows, not this stamp, so the HEAD tree id cannot conceal or excuse those edits.
      storiesTreeSha: treeSha,
      generatedAt: new Date().toISOString(),
      generator: TAG,
    });
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const root = repoRoot();
  const mergeBase = git(root, ["merge-base", "origin/main", "HEAD"]);
  const base =
    mergeBase === null || mergeBase.length === 0
      ? null
      : projectHierarchyAtRef(root, mergeBase);
  const candidate = projectCandidate(root);

  let events: readonly unknown[] | null = null;
  let storeError: unknown;
  let handle: Awaited<ReturnType<typeof createPool>> | undefined;
  try {
    handle = await createPool();
    events = await readUatRevisionVerdictEvents(handle.pool);
  } catch (error) {
    storeError = error;
  } finally {
    if (handle !== undefined) await closePool(handle.pool, handle.connector);
  }

  const baseRef =
    mergeBase === null || mergeBase.length === 0
      ? "unreadable merge-base(origin/main, HEAD)"
      : `merge-base(origin/main, HEAD) ${mergeBase.slice(0, 9)}`;
  process.stdout.write(`${TAG} comparing against ${baseRef}\n`);
  const verdict = judgeUatRevisionContinuity({ base, candidate, events, baseRef });
  for (const line of verdict.lines) process.stdout.write(`${line}\n`);
  if (storeError !== undefined) {
    process.stdout.write(
      `\n  store read: ${storeError instanceof Error ? storeError.message : String(storeError)}\n`,
    );
  }
  return verdict.ok ? 0 : EXIT_FAIL;
}

process.exitCode = await main();
