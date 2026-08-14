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

// ---- branch LIVENESS (ADR-0371) ---------------------------------------------------------------
//
// "Is the session that wrote this still in flight?" answered from LOCAL GIT REFS ALONE — no network,
// no database, no credential. This exists because the obvious reading of that question ("ask the
// notice board whether the branch is live") is what kept the machine-shared graduation queue parked:
// it would have traded an offline-by-contract check for a DB dependency. It never needed one. A
// branch that has not merged into `origin/main` belongs to a session still working; once it merges,
// its knowledge is everyone's and its residue becomes everyone's obligation.

/** One local branch ref: its short name and the ISO `yyyy-mm-dd` of its tip commit. */
export interface BranchRef {
  readonly name: string;
  readonly committedOn: string;
}

/**
 * How recently a branch's tip must have moved for its session to count as still in flight.
 *
 * BASELINED ON A SWEEP, not chosen — the `DEFAULT_GRADUATION_DRAIN_CONFIG` posture. Measured on the
 * authoring machine 2026-08-14: 810 local branches, 88 of them unmerged into `origin/main`, but only
 * **5** touched that day and the next-most-recent was FIVE DAYS older. So the unmerged set is
 * dominated by ABANDONED branches, and an unbounded "unmerged ⇒ in flight" rule would permanently
 * excuse memories written from branches abandoned two months ago — under-counting a backlog the
 * ceiling exists to BOUND. The window sits inside that measured five-day gap rather than on a knife
 * edge: 1 day and 2 days select the same 5 branches on that data, and 2 is taken for margin so a long
 * session that commits early and works late is not dropped mid-flight.
 */
export const IN_FLIGHT_WINDOW_DAYS = 2;

/**
 * PURE — the in-flight subset of `unmerged`, bounded to `windowDays` before `currentDate`.
 *
 * Split out from {@link inFlightBranches} so the age rule (the part with a judgement in it) is unit
 * testable without a git repo. Fail-closed: an unparseable or future date is EXCLUDED, so a ref this
 * cannot date is charged rather than excused.
 */
export function selectInFlightBranches(
  unmerged: readonly BranchRef[],
  currentDate: string,
  windowDays: number = IN_FLIGHT_WINDOW_DAYS,
): ReadonlySet<string> {
  const now = Date.parse(currentDate);
  if (Number.isNaN(now)) return new Set();
  const live = new Set<string>();
  for (const ref of unmerged) {
    const at = Date.parse(ref.committedOn);
    if (Number.isNaN(at)) continue;
    const ageDays = Math.floor((now - at) / 86_400_000);
    // A future-dated ref (clock skew) has a negative age; treat it as in flight rather than as an
    // error, since the alternative — charging a branch that is demonstrably newer than today — would
    // be the surprising direction.
    if (ageDays <= windowDays) live.add(ref.name);
  }
  return live;
}

/**
 * The set of branches whose sessions are still in flight — unmerged into `origin/main` and touched
 * within {@link IN_FLIGHT_WINDOW_DAYS}. Never throws.
 *
 * Returns an EMPTY set whenever git cannot answer (no repo, no `origin/main` ref, a git failure),
 * which disables the exclusion entirely and charges the whole queue — the pre-ADR-0371 behaviour and
 * the fail-closed one. A branch that no longer exists locally (deleted on merge, ADR-0142, or written
 * on another machine) is simply absent from the listing and is therefore charged.
 */
export function inFlightBranches(currentDate: string, cwd?: string): ReadonlySet<string> {
  try {
    const out = execFileSync(
      "git",
      [
        "for-each-ref",
        "--no-merged=origin/main",
        // Date first, single space, then the name: a git ref name can contain neither a space nor a
        // newline, so splitting on the FIRST space is unambiguous.
        "--format=%(committerdate:short) %(refname:short)",
        "refs/heads",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...(cwd === undefined ? {} : { cwd }) },
    );
    const refs: BranchRef[] = [];
    for (const line of out.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      const gap = trimmed.indexOf(" ");
      if (gap <= 0) continue;
      const committedOn = trimmed.slice(0, gap);
      const name = trimmed.slice(gap + 1).trim();
      if (name.length > 0) refs.push({ name, committedOn });
    }
    return selectInFlightBranches(refs, currentDate);
  } catch {
    return new Set();
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
