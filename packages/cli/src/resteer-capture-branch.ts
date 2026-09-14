/**
 * What a re-steer capture stamps as `provenance.branch` (ADR-0568; `follow-the-research-arc`,
 * increment `resteer-detached-head-stamp`).
 *
 * THE RULE. A branch is recorded only where the checkout the command runs in IDENTIFIES A SESSION — a
 * registered linked worktree on a named branch. Everywhere else the stamp is an explicit
 * {@link UNATTRIBUTABLE_CAPTURE_STAMP} marker naming why, and never a guess.
 *
 * WHY THE CLAIM LEDGER'S OWN RULE. `deriveIdentity` already answers "does this checkout belong to one
 * session?", and it refuses the PRIMARY CHECKOUT, which is shared by construction. The stamp asks the
 * same question, so it takes the same answer rather than keeping a second copy of it: a checkout that
 * cannot hold a claim cannot attribute a re-steer either.
 *
 * WHY THE PRIMARY CHECKOUT IS REFUSED EVEN WHEN IT NAMES A BRANCH. Every `HEAD` row the store held when
 * this landed was captured there, while it was detached, by one session that worked across several
 * branches. Whatever the lobby happens to be on — `main`, or a session branch an aborted worktree
 * create left behind (ADR-0033) — says nothing about which session's shell ran the command.
 *
 * WHY NOT THE BRANCH THAT POINTS AT HEAD, the fix the increment recommended. Branch refs are shared by
 * every worktree, so every branch cut from the same base points at the same commit: measured at
 * `origin/main`'s tip, `git branch --points-at HEAD` named five branches, three of them checked out in
 * other worktrees. In the lobby no filter can tell which one is right, and a wrong answer there is
 * exactly the invisible misattribution ADR-0541 D3 refuses.
 *
 * Git sits behind an injected `runGit` (the `deriveIdentity` seam pattern), so every branch of the
 * rule is testable without a repository.
 */
import { execFileSync } from "node:child_process";

import { deriveIdentity } from "@storytree/drive";
import { UNATTRIBUTABLE_CAPTURE_STAMP } from "@storytree/library";

/** A git runner: the trimmed stdout of `git <args>`, throwing on a non-zero exit. */
export type CaptureRunGit = (args: string[]) => string;

// UNASSERTABLE BY DESIGN, and the two disables below are one decision. This is the seam's real-git
// default. Every rule test injects `runGit`, and the one dispatcher test that reaches this default
// (`resteer-area-runs-without-an-injected-clock-or-branch`) can only assert that the capture landed:
// the checkout it runs in is a linked worktree on a laptop and a detached primary checkout in CI, so
// any stronger assertion would mean something different in each. (BlockStatement is anchored on the
// declaration and the rest on the return, so each needs its own `next-line`.)
// Stryker disable next-line BlockStatement
function builtinRunGit(args: string[]): string {
  // Stryker disable next-line MethodExpression,ObjectLiteral,StringLiteral,ArrayDeclaration
  return (execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) as string).trim();
}

/**
 * The `provenance.branch` a capture run in this checkout should record: the session's branch, or the
 * marker that says why there is none.
 */
export function resteerCaptureBranch(runGit: CaptureRunGit = builtinRunGit): string {
  const identity = deriveIdentity(runGit);
  if (identity !== null) {
    return identity.branch === "HEAD" ? UNATTRIBUTABLE_CAPTURE_STAMP.detachedHead : identity.branch;
  }
  // `deriveIdentity` answers null for two different reasons, and the marker names which. Git answering
  // at all means the identity rule refused this checkout — the primary checkout, in practice; git
  // answering nothing means there was no checkout to judge.
  try {
    runGit(["rev-parse", "--git-dir"]);
  } catch {
    return UNATTRIBUTABLE_CAPTURE_STAMP.gitCouldNotAnswer;
  }
  return UNATTRIBUTABLE_CAPTURE_STAMP.primaryCheckout;
}
