// The desktop launch-precondition gate (ADR-0176 §1).
//
// A pure composition over injected effects: probes a git checkout FIRST (refusing immediately,
// never waking the DB, if absent), then — only if the checkout is present — delegates to the
// injected `ensureDb` (production: @storytree/drive's `ensureLiveDb`) and carries its
// `EnsureDbResult` forward verbatim. No `pg`, no `git`, no `electron`/`dom` import.

import type { EnsureDbResult } from "@storytree/drive";

export type LaunchPreconditionResult =
  | { ok: true; startedDb: boolean }
  | { ok: false; unmet: "git-repo" | "db"; reason: string };

export interface LaunchPreconditionDeps {
  probeGitRepo(): Promise<boolean>;
  ensureDb(): Promise<EnsureDbResult>;
  log(message: string): void;
}

const GIT_REPO_REASON = "run storytree from a git checkout";

export async function ensureLaunchPreconditions(
  deps: LaunchPreconditionDeps,
): Promise<LaunchPreconditionResult> {
  const hasGitRepo = await deps.probeGitRepo();
  if (!hasGitRepo) {
    deps.log(`launch precondition unmet: git-repo (${GIT_REPO_REASON})`);
    return { ok: false, unmet: "git-repo", reason: GIT_REPO_REASON };
  }

  const dbResult = await deps.ensureDb();
  if (!dbResult.ok) {
    deps.log(`launch precondition unmet: db (${dbResult.reason})`);
    return { ok: false, unmet: "db", reason: dbResult.reason };
  }

  return { ok: true, startedDb: dbResult.started };
}

export function describeLaunchRefusal(
  result: { ok: false; unmet: "git-repo" | "db"; reason: string },
): string {
  if (result.unmet === "git-repo") {
    return `storytree could not find a git checkout to run from — ${result.reason}.`;
  }
  return `storytree could not reach the database: ${result.reason}`;
}
