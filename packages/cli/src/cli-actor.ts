// The CLI's write STAMP — who a live library write is recorded as (`events.library_event.actor`).
//
// WHY THIS EXISTS. `events.library_artifact` is a projection: it records a body and nothing about who
// put it there. So a session holding a seed↔live drift list cannot tell its OWN unexported edit from a
// sibling's, and `check:corpus-content` charged both to whoever ran the gate next (ADR-0290, and the
// six friction items behind it). The event log already carries an `actor` column and already records
// every write; it just carried the constant `"cli"`, which identifies the tool rather than the writer.
//
// THE BRANCH IS THE IDENTITY, on the same reasoning ADR-0050's allocator already uses — it records the
// reserving BRANCH against every ADR number for exactly this audit purpose. A branch is the unit a
// session works and lands in (ADR-0142: a branch dies on merge), it is stable across a session's whole
// life, and the gate can read it back with one `git rev-parse`. A session id would be finer but is not
// available to the store, and a machine/user id is coarser than the population that contends.
//
// `STORYTREE_ACTOR` still wins wherever it is set — the studio and desktop identify their own writers
// and must keep doing so. A write from those surfaces is therefore never branch-attributed, which is
// correct: a studio edit is nobody's gate to answer for.
//
// PURE except for {@link defaultCliActor}, which shells out once and caches. The parse/format pair is
// pure so the write side and the read side cannot drift apart — they are the same two functions.

import { execFileSync } from "node:child_process";

/** Separates the tool from the branch in a stamped actor: `cli@claude/some-branch`. */
export const CLI_ACTOR_PREFIX = "cli@";

/** The actor string a CLI write on `branch` is recorded as. */
export function cliActorFor(branch: string): string {
  return `${CLI_ACTOR_PREFIX}${branch}`;
}

/**
 * The branch a stamped actor names, or `null` for anything else — the unstamped legacy `"cli"`, the
 * store's own `"system"` / `"corpus-migration"`, and every `STORYTREE_ACTOR` identity.
 *
 * `null` means UNATTRIBUTED, never "not yours": a caller must decide what to do with an unattributed
 * write, and `check:corpus-content` deliberately treats it as not-this-branch's rather than as a pass.
 */
export function branchOfActor(actor: string): string | null {
  if (!actor.startsWith(CLI_ACTOR_PREFIX)) return null;
  const branch = actor.slice(CLI_ACTOR_PREFIX.length);
  return branch.length > 0 ? branch : null;
}

/** The current git branch, or `null` when git cannot say (detached HEAD, no repo). Never throws. */
export function currentGitBranch(cwd?: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      ...(cwd === undefined ? {} : { cwd }),
    }).trim();
    return out.length > 0 && out !== "HEAD" ? out : null;
  } catch {
    return null;
  }
}

let cached: string | undefined;

/**
 * The actor a CLI write defaults to: `cli@<branch>`, or the bare `"cli"` when git cannot name a branch
 * (a detached HEAD, a non-repo checkout). Cached — a write burst must not spawn one `git` per artifact.
 *
 * The unbranched fallback is deliberately the OLD constant rather than an invented placeholder: it
 * reads as "unattributed" to {@link branchOfActor}, which is exactly what it is, and it keeps the
 * pre-existing rows and the fallback rows in one class instead of two.
 */
export function defaultCliActor(): string {
  if (cached === undefined) {
    const branch = currentGitBranch();
    cached = branch === null ? "cli" : cliActorFor(branch);
  }
  return cached;
}
