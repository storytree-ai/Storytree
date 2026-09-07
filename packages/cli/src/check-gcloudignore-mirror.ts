/**
 * `pnpm check:gcloudignore-mirror` — the thin I/O SHELL. It reads two files and hands them to the
 * pure judge next door ({@link file://./gcloudignore-mirror.ts}), which owns the rule and the
 * report; this module only gathers and exits.
 *
 * Same gatherer/judge split as `check-hierarchy-camps.ts` / `hierarchy-camps.ts` and its
 * neighbours, for the same reason: the rule stays exhaustively unit-testable offline while the
 * glue stays dumb and total.
 *
 * OFFLINE, READ-ONLY, MILLISECONDS. Two files, no git, no network, no Docker, no cloud — which is
 * what lets it sit with the branch-local checks at the cheap end of the plan and fire on the branch
 * that introduces the drift rather than at deploy time, when the image is already published.
 *
 * ⚠ IT FAILS RATHER THAN SKIPS WHEN A FILE IS ABSENT. Both files are committed at the repo root and
 * neither is optional; a missing one means the aperture moved, and this rung's whole value is that
 * it cannot quietly compare nothing (see the judge's header).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatMirrorVerdict, judgeGcloudignoreMirror } from "./gcloudignore-mirror.js";

const TAG = "check:gcloudignore-mirror";

/** Repo root: packages/cli/src/check-gcloudignore-mirror.ts → four dirs up. */
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

function read(name: string): string {
  const file = path.join(repoRoot, name);
  if (!existsSync(file)) {
    console.error(`${TAG} FAIL — ${name} is missing at the repo root; this rung compares it and cannot report on a file that is not there.`);
    process.exit(1);
  }
  return readFileSync(file, "utf8");
}

const verdict = judgeGcloudignoreMirror(read(".gitignore"), read(".gcloudignore"));
const body = formatMirrorVerdict(verdict);
if (verdict.missing.length > 0) {
  console.error(body);
  process.exit(1);
}
console.log(body);
