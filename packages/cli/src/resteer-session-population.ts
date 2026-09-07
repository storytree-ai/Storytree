/**
 * The re-steer tier's DENOMINATOR: how many agent sessions ran, so the log can report an intervention
 * RATE and not merely a count of interventions (`follow-the-research-arc`, increment
 * `resteer-session-denominator`; owner-directed 2026-09-08).
 *
 * WHY GIT AND NOT THE CLAIM LEDGER. `events.claim_event.session_id` holds the worktree SLOT, which is
 * pooled and reused across sessions — ADR-0541 D3 already refused that join on accuracy for a
 * different question, and it fails here for the same reason plus a second one: `resteerReport` keys
 * its sessions on `provenance.branch`, so a denominator counted in slots would make the two halves of
 * the ratio different objects.
 *
 * WHY MERGE COMMITS AND NOT `gh pr list`. Landings are merge commits on `origin/main` (ADR-0022 /
 * ADR-0031), so the population is already in the local checkout: no network, no `gh`, no credential,
 * and it works in the same places the rest of the offline gate does. This mirrors `branch.ts`, which
 * detects a single branch's landing the same way.
 *
 * Plumbing sits behind an injected `runGit` (the `deriveIdentity` seam pattern), so every branch of
 * the parse is testable without a repository.
 */
import { execFileSync } from "node:child_process";

import { RESTEER_CAPTURE_START, type SessionPopulation } from "@storytree/library";

/** Injected git runner (throws on non-zero exit). Defaults to spawning real git. */
export interface SessionPopulationDeps {
  readonly runGit?: (args: readonly string[]) => string;
}

// NO COVERAGE BY DESIGN, and the two disables below are one decision. This is the seam's real-git
// default; every test injects `runGit` instead, precisely so the suite never spawns git or reads the
// machine's history. Covering it would mean asserting against a log that changes daily and per
// machine — the non-determinism this seam exists to keep out. (BlockStatement is anchored on the
// declaration, MethodExpression on the return, so each needs its own `next-line`.)
// Stryker disable next-line BlockStatement
function builtinRunGit(args: readonly string[]): string {
  // Stryker disable next-line MethodExpression
  return (execFileSync("git", [...args], { encoding: "utf8" }) as string).trim();
}

/**
 * Branch families that ARE an agent session — the runtimes that run the retro and could therefore
 * file a re-steer. Keyed on the `<runtime>/<name>` convention.
 */
const SESSION_BRANCH_PREFIXES = ["claude/", "codex/"] as const;

/**
 * `claude/real/*` is a PROMOTION branch — the build artifact of a session, not a session. Counting it
 * would inflate the denominator with rows that were never a sitting anyone could re-steer.
 */
const EXCLUDED_BRANCH_PREFIXES = ["claude/real/", "codex/real/"] as const;

/**
 * `Merge pull request #1870 from storytree-ai/claude/sleepy-neumann-7eba33` — the head ref is the
 * last field. Anchored, so an ordinary merge subject (`Merge origin/main into …`, which is a session
 * syncing rather than landing) cannot match.
 */
const MERGE_SUBJECT = /^Merge pull request #\d+ from (\S+)/;

/**
 * Strip the owner namespace. TWO appear in this repo's history — `storytree-ai/` and `HuaMick/`, from
 * the move to an org — and a re-steer row is stamped with neither, so both must go or the same
 * session counts as two different branches either side of the ratio.
 */
function stripOwner(headRef: string): string {
  const slash = headRef.indexOf("/");
  // Stryker disable next-line ConditionalExpression: EQUIVALENT — with the guard removed the false
  // arm computes `slice(-1 + 1)` = `slice(0)`, which returns the whole string, i.e. exactly what the
  // true arm returns. No input can distinguish them. The guard is kept because it states the intent
  // ("no owner to strip") that the arithmetic only happens to express.
  return slash === -1 ? headRef : headRef.slice(slash + 1);
}

/** True for a branch that represents one agent session. */
export function isSessionBranch(branch: string): boolean {
  if (EXCLUDED_BRANCH_PREFIXES.some((p) => branch.startsWith(p))) return false;
  return SESSION_BRANCH_PREFIXES.some((p) => branch.startsWith(p));
}

/** Parse `git log --merges --format=%s` output into the distinct session branches it names. */
export function parseSessionBranches(gitLog: string): readonly string[] {
  const branches = new Set<string>();
  for (const line of gitLog.split("\n")) {
    const match = MERGE_SUBJECT.exec(line.trim());
    if (match === null) continue;
    // `noUncheckedIndexedAccess`: a matched group 1 is present, but the type does not know it.
    const headRef = match[1];
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — group 1 is mandatory in
    // MERGE_SUBJECT, so a successful match always carries it and this branch is unreachable at
    // runtime. It exists to satisfy `noUncheckedIndexedAccess`, not to handle a case that occurs.
    if (headRef === undefined) continue;
    const branch = stripOwner(headRef);
    if (isSessionBranch(branch)) branches.add(branch);
  }
  return [...branches].sort();
}

/**
 * The session population that landed on `origin/main` since `since` (default: the capture's own start
 * — see {@link RESTEER_CAPTURE_START} for why widening it is never the right move).
 *
 * THE SELECTION BIAS IS REAL AND IS REPORTED RATHER THAN FIXED: only sessions that LANDED leave a
 * merge commit, so a session that ran and never opened a PR is invisible here. The direction is
 * knowable — an abandoned session is if anything MORE likely to have been re-steered — so the true
 * rate is at least what this reports, never less. `source` carries that sentence to the reader.
 *
 * Returns `null` when git cannot answer (no checkout, no `origin/main`). The caller must then report
 * the rate as not computable: an absent denominator is honest, and a guessed one is not.
 */
export function sessionPopulationSince(
  since: string = RESTEER_CAPTURE_START,
  deps: SessionPopulationDeps = {},
): SessionPopulation | null {
  const runGit = deps.runGit ?? builtinRunGit;
  let gitLog: string;
  try {
    gitLog = runGit(["log", "--merges", "--format=%s", `--since=${since}`, "origin/main"]);
  } catch {
    return null;
  }
  return {
    branches: parseSessionBranches(gitLog),
    since,
    source:
      "session branches merged into origin/main — LANDED sessions only, so a session that ran and " +
      "never opened a PR is not counted; the true rate is at least this, never less",
  };
}
