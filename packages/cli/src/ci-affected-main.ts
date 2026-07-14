// The CI shell for the affected-only PR test scope (ADR-0195, amends ADR-0022) — `pnpm ci:affected`.
//
// Runs inside the `verify` job AFTER `pnpm install`, on the pull_request MERGE commit that
// actions/checkout provides (fetch-depth: 2, so HEAD^1 — the base tip the merge was cut against —
// is present). It diffs HEAD^1..HEAD (exactly what the PR changes vs its base, race-free — no
// reliance on a separately-fetched origin/main), classifies via ci-affected.ts, and appends
//   pnpm_args=<-r | --filter ...name …>
//   mode=<full | affected>
// to $GITHUB_OUTPUT (written directly — immune to pnpm's stdout banners), plus a one-line scope
// summary to $GITHUB_STEP_SUMMARY for the run page. The verify job then runs
// `pnpm ${pnpm_args} typecheck` / `… test`; push-to-main runs skip this step entirely and stay `-r`.
//
// FAIL-OPEN TO FULL: any surprise (not a PR event, HEAD not a merge commit, git failure, thrown
// error) emits the full `-r` scope and exits 0 — narrowing is an optimisation, never a gate to fail.
// Only a crash so early that $GITHUB_OUTPUT was never written fails the step, which fails CI red —
// visibly, never silently green.

import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  classifyChangedFiles,
  discoverWorkspaceProjects,
  pnpmArgsFor,
  type AffectedScope,
} from "./ci-affected.js";

const TAG = "[ci:affected]";

// This file sits at packages/cli/src/ — three levels up is the repo root.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function git(args: string[]): { ok: boolean; stdout: string; detail: string } {
  const res = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (res.error !== undefined || res.status !== 0) {
    const detail = res.error?.message ?? res.stderr.trim() ?? `exit ${res.status}`;
    return { ok: false, stdout: "", detail: `git ${args.join(" ")} failed: ${detail}` };
  }
  return { ok: true, stdout: res.stdout, detail: "" };
}

function computeScope(): AffectedScope {
  if (process.env["GITHUB_EVENT_NAME"] !== "pull_request") {
    return { mode: "full", reason: "not a pull_request event — the full suite is the backstop" };
  }
  // The PR checkout is the merge commit refs/pull/N/merge: parent 1 = base tip, parent 2 = PR head.
  const mergeParent = git(["rev-parse", "--verify", "--quiet", "HEAD^2"]);
  if (!mergeParent.ok) {
    return { mode: "full", reason: "HEAD is not a PR merge commit (no HEAD^2)" };
  }
  // --no-renames: a rename must list BOTH paths, so the old file's project is selected too.
  const diff = git(["diff", "--name-only", "--no-renames", "HEAD^1", "HEAD"]);
  if (!diff.ok) {
    return { mode: "full", reason: diff.detail };
  }
  const changed = diff.stdout.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  return classifyChangedFiles(changed, discoverWorkspaceProjects(repoRoot));
}

function main(): void {
  let scope: AffectedScope;
  try {
    scope = computeScope();
  } catch (err) {
    scope = { mode: "full", reason: `unexpected error: ${(err as Error).message}` };
  }
  const pnpmArgs = pnpmArgsFor(scope);
  console.log(`${TAG} mode=${scope.mode} — ${scope.reason}`);
  if (scope.mode === "affected") {
    console.log(`${TAG} changed projects (dependents added by pnpm): ${scope.projects.join(", ")}`);
  }
  console.log(`${TAG} pnpm args: ${pnpmArgs}`);
  const outFile = process.env["GITHUB_OUTPUT"];
  if (outFile !== undefined && outFile !== "") {
    appendFileSync(outFile, `pnpm_args=${pnpmArgs}\nmode=${scope.mode}\n`);
  }
  // The scope decision on the run page itself ($GITHUB_STEP_SUMMARY), so the ADR-0195 sanity-watch
  // ("did this PR narrow, and to what?") reads off the job summary without opening step logs.
  const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryFile !== undefined && summaryFile !== "") {
    const projects = scope.mode === "affected" ? ` · projects: ${scope.projects.join(", ")}` : "";
    appendFileSync(
      summaryFile,
      `**Affected scope (ADR-0195):** \`${scope.mode}\`${projects} — ${scope.reason} (\`pnpm ${pnpmArgs}\`)\n`,
    );
  }
}

main();
