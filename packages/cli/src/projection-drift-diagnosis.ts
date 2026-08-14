// WHICH SIDE MOVED — the diagnosis half of `check:agents` and `check:guidance`
// (diagnosis-honesty-arc: a command names its real blocker, not the substrate).
//
// Both rungs compare a COMMITTED generated projection against the LIVE store (ADR-0302 D1 /
// ADR-0307 D2), which makes their zero ceiling a score against a shared, concurrently-written
// source. When one reds, both sides of the comparison are already in hand — the committed file and
// the freshly rendered content — but the message named only the reader: "regenerate and commit".
// That is correct for exactly one of the three ways this rung goes red, and the other two are the
// common ones:
//
//   BRANCH-BEHIND       origin/main's copy ALREADY matches the live store. Another session
//                       regenerated and landed it; this branch's merge-base simply predates that
//                       commit. `git merge origin/main` is the entire fix and regenerating is a
//                       no-op you paid a conflict for.
//   MAIN-EQUALLY-STALE  origin/main's copy is identical to yours and equally stale — the LIVE STORE
//                       moved ahead of the whole repository, so `main` is red for every branch right
//                       now and there is nothing newer to merge. Somebody must regenerate, and it
//                       may as well be the branch already holding the red.
//   BRANCH-DIVERGED     this tree's copy differs from BOTH origin/main and the live store. The
//                       change is this branch's. The old message was right here.
//
// THE ORDER IS THE LOAD-BEARING HALF, not the label. Regenerating FIRST is what sweeps another
// session's in-flight live-store edit into this branch's commit — and because any branch's
// regeneration discharges the staleness for every branch, that sweep is often work nobody needed.
// So a BRANCH-BEHIND diagnosis prints merge-then-recheck BEFORE it mentions regenerating at all.
//
// FAILS WIDE, like the gate's affected-scope classifier: no `origin/main`, an unreadable ref, a
// detached or shallow checkout, or any surprise reading git falls back to the original
// regenerate-and-commit message with the reason named. A diagnosis this cannot make is never
// guessed — that would be the arc's own defect wearing a new coat.

import { spawnSync } from "node:child_process";

/** Which side of the comparison moved, for one drifted projection file. */
export type DriftSide =
  /** origin/main already matches the live store — this branch is behind it. Merge, don't regenerate. */
  | "branch-behind"
  /** origin/main is byte-identical to this tree and equally stale — merging cannot help. */
  | "main-equally-stale"
  /** This tree's copy differs from origin/main AND from the live store — the change is this branch's. */
  | "branch-diverged"
  /** origin/main carries no copy at all (a newly delegatable agent, or a rename). */
  | "absent-on-main";

/**
 * One drifted projection, reduced to the only two questions git can answer honestly.
 *
 * Both booleans are computed by the CALLER, because the "is it in sync" comparison differs per
 * projection: the agent views and AGENTS.md compare whole-file modulo EOL, while CLAUDE.md compares
 * only its generated region. Keeping that here would have forced this module to know all three.
 */
export interface DriftedProjection {
  /** The line the check already prints, e.g. `stale:   .claude/agents/explorer.md`. */
  label: string;
  /** Does origin/main's copy match the freshly rendered live-store content? `null` = no copy there. */
  mainInSync: boolean | null;
  /**
   * Did THIS BRANCH change the file, measured against `merge-base(origin/main, HEAD)`?
   *
   * Deliberately NOT "does it differ from origin/main". Those two questions come apart on the case
   * that matters most: a HAND-EDITED projection also differs from main, and telling that session to
   * merge would be a fresh wrong cause — git would not overwrite its edit, so the remedy silently
   * fails. Measuring against the merge-base separates "main moved ahead of me" from "I moved", which
   * is the actual fork in the remedy.
   */
  branchTouched: boolean;
}

/** A drifted projection with its verdict attached. */
export interface DiagnosedProjection {
  label: string;
  side: DriftSide;
}

/** The whole diagnosis, or the named reason it could not be made. */
export type DriftDiagnosis =
  | { ok: true; mainRef: string; files: DiagnosedProjection[] }
  | { ok: false; reason: string };

/** The command pair whose message this is — `check:agents` reports, `build:agents` repairs. */
export interface ProjectionCommand {
  check: string;
  build: string;
}

export const AGENTS_COMMAND: ProjectionCommand = { check: "check:agents", build: "build:agents" };
export const GUIDANCE_COMMAND: ProjectionCommand = {
  check: "check:guidance",
  build: "build:guidance",
};
/**
 * The third entry point, and the reason this module is shared rather than inlined twice: it reads a
 * DIFFERENT live source (the work-event store, not the agent tier) and is NOT a gate rung, but it
 * has the identical shape — a committed projection scored against a concurrently-written live store
 * — and it carried the identical instance-shaped remedy. Closing only the two rungs is the move this
 * arc was chartered to prevent.
 */
export const STATUS_COMMAND: ProjectionCommand = {
  check: "build:status --check",
  build: "build:status",
};

/**
 * Which side moved, for one file. Pure.
 *
 * `mainInSync` is the discriminator that matters: when origin/main already agrees with the store,
 * the repository's answer is newer than this branch's regardless of what else differs, so merging is
 * the first move. Only once main is known stale does "did THIS tree touch the file" separate a
 * branch's own edit from a live-store edit nobody has projected yet.
 */
export function classifyDrift(projection: DriftedProjection): DriftSide {
  if (projection.mainInSync === null) return "absent-on-main";
  // A branch that touched the file owns the drift whatever main says — merging cannot undo a local
  // edit, so offering the merge here would be a remedy that quietly does nothing.
  if (projection.branchTouched) return "branch-diverged";
  return projection.mainInSync ? "branch-behind" : "main-equally-stale";
}

/** LF-space equality — a CRLF checkout is not drift, the comparison every projection already uses. */
export const sameModuloEol = (a: string, b: string): boolean =>
  a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");

/** True when this tree's copy differs from the merge-base's — i.e. this branch moved the file. */
function touched(onDisk: string | null, atBase: string | null): boolean {
  if (onDisk === null || atBase === null) return onDisk !== atBase;
  return !sameModuloEol(onDisk, atBase);
}

/**
 * The two questions, for a projection that SHOULD hold `expected` but is missing or stale.
 *
 * `atBase` is the copy at `merge-base(origin/main, HEAD)` — the branch's own starting point, and the
 * only honest baseline for "did I move this".
 */
export function diagnoseExpected(
  label: string,
  expected: string,
  onDisk: string | null,
  onMain: string | null,
  atBase: string | null,
): DriftedProjection {
  return {
    label,
    mainInSync: onMain === null ? null : sameModuloEol(onMain, expected),
    branchTouched: touched(onDisk, atBase),
  };
}

/**
 * The two questions, for an ORPHAN — a file the store no longer renders, which should not exist.
 *
 * `mainInSync` INVERTS here, which is why orphans get their own helper: main having already PRUNED
 * the file IS main agreeing with the store, so absence there is sync rather than a missing copy.
 */
export function diagnoseOrphan(
  label: string,
  onMain: string | null,
  atBase: string | null,
): DriftedProjection {
  // Present here (it is an orphan, so it exists on disk) and absent at the base means this branch
  // added it — the one orphan case whose remedy is the branch's own.
  return { label, mainInSync: onMain === null, branchTouched: atBase === null };
}

/** Read-only access to `origin/main` and this branch's merge-base, or the named reason there is none. */
export type MainRefReader =
  | {
      ok: true;
      ref: string;
      /** The file's content at `origin/main`, or `null` when it does not exist there. */
      show: (repoRelativePath: string) => string | null;
      /** The file's content at `merge-base(origin/main, HEAD)` — this branch's starting point. */
      showBase: (repoRelativePath: string) => string | null;
    }
  | { ok: false; reason: string };

/**
 * Resolve `origin/main` and the merge-base for comparison. Read-only and OFFLINE: it never fetches,
 * so the ref it compares against is whatever this checkout last fetched — which is why the output
 * names it. A stale `origin/main` can turn a real BRANCH-BEHIND into a MAIN-EQUALLY-STALE, and the
 * remedies differ, so the reader is told what was actually compared rather than left to assume.
 */
export function openMainRef(repoRoot: string): MainRefReader {
  const git = (args: string[]): { ok: boolean; stdout: string; detail: string } => {
    const res = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
    if (res.error !== undefined || res.status !== 0) {
      const detail = res.error?.message ?? res.stderr?.trim() ?? `exit ${res.status ?? "unknown"}`;
      return { ok: false, stdout: "", detail };
    }
    return { ok: true, stdout: res.stdout, detail: "" };
  };

  const rev = git(["rev-parse", "--short", "origin/main"]);
  if (!rev.ok) return { ok: false, reason: `no readable origin/main ref (${rev.detail})` };
  const ref = rev.stdout.trim();
  if (ref === "") return { ok: false, reason: "origin/main resolved to nothing" };

  const base = git(["merge-base", "origin/main", "HEAD"]);
  if (!base.ok) {
    return {
      ok: false,
      reason: `no merge-base with origin/main — unfetched, shallow or detached (${base.detail})`,
    };
  }
  const mergeBase = base.stdout.trim();
  if (mergeBase === "") return { ok: false, reason: "merge-base with origin/main resolved to nothing" };

  // `git show` takes forward slashes in the ref path on every platform, Windows included.
  const at = (rev2: string) => (repoRelativePath: string): string | null => {
    const res = git(["show", `${rev2}:${repoRelativePath.replace(/\\/g, "/")}`]);
    return res.ok ? res.stdout : null;
  };
  return { ok: true, ref, show: at("origin/main"), showBase: at(mergeBase) };
}

/** Group the diagnosed files by side, preserving the order the check reported them in. */
function bySide(files: DiagnosedProjection[], side: DriftSide): string[] {
  return files.filter((file) => file.side === side).map((file) => file.label);
}

/** One verdict group: the finding in prose, then the files it covers, then the remedy. */
function block(finding: string[], labels: string[], remedy: string[]): string[] {
  return [
    ...finding.map((line) => `  ${line}`),
    ...labels.map((label) => `      ${label}`),
    ...remedy.map((line) => `  ${line}`),
    "",
  ];
}

/**
 * The failure message: what the check found, WHICH SIDE MOVED, and the remedy in the order that does
 * not sweep someone else's edit into this commit.
 *
 * Mixed diagnoses print every group they hit, and BRANCH-BEHIND is rendered FIRST when present —
 * merging is the step that can make the other groups moot, and a message that buried it under
 * "regenerate" would reproduce the defect this exists to fix.
 */
export function renderDriftDiagnosis(
  command: ProjectionCommand,
  drift: readonly string[],
  diagnosis: DriftDiagnosis,
): string {
  const preamble =
    "the committed projections are STALE against the live store:\n  " + drift.join("\n  ");

  if (!diagnosis.ok) {
    return (
      `${preamble}\n\n` +
      `  WHICH SIDE MOVED: could not be determined — ${diagnosis.reason}.\n` +
      `  Falling back to the unconditional remedy: run \`pnpm ${command.build}\` and commit.\n` +
      `  If this branch made no agent or Library edit, try \`git fetch origin && git merge origin/main\`\n` +
      `  and re-run \`pnpm ${command.check}\` first — another session may already have regenerated it.`
    );
  }

  const behind = bySide(diagnosis.files, "branch-behind");
  const equally = bySide(diagnosis.files, "main-equally-stale");
  const diverged = bySide(diagnosis.files, "branch-diverged");
  const absent = bySide(diagnosis.files, "absent-on-main");

  // The files are listed under the group that OWNS them rather than twice — each group's remedy is
  // different, so which file is in which group is the answer, not a footnote to a flat list.
  const count = diagnosis.files.length;
  const lines: string[] = [
    `${count} committed projection${count === 1 ? " is" : "s are"} STALE against the live store ` +
      `(compared against origin/main @ ${diagnosis.mainRef}):`,
    "",
  ];

  if (behind.length > 0) {
    lines.push(
      ...block(
        [
          "WHICH SIDE MOVED: NOT YOURS — origin/main ALREADY matches the live store, and this branch",
          "has not touched these since its merge-base. It is simply behind: another session",
          "regenerated and landed them, and your merge-base predates that commit.",
        ],
        behind,
        [
          "DO THIS IN ORDER:",
          "  1. git fetch origin && git merge origin/main",
          `  2. re-run \`pnpm ${command.check}\`  — this is usually the whole fix`,
          `  3. only if it STILL reds: pnpm ${command.build}, then commit`,
          `Do NOT run \`pnpm ${command.build}\` first: regenerating sweeps another session's in-flight`,
          "live-store edit into YOUR commit, and any branch's regeneration discharges it for everyone.",
        ],
      ),
    );
  }

  if (equally.length > 0) {
    lines.push(
      ...block(
        [
          "WHICH SIDE MOVED: THE LIVE STORE — origin/main's copy is as stale as yours and this branch",
          "has not touched it, so `main` is red for EVERY branch right now and there is nothing newer",
          "to merge. Merging cannot fix these. Somebody must regenerate, and it may as well be the",
          "branch already holding the red.",
        ],
        equally,
        [
          "DO THIS:",
          `  1. pnpm ${command.build}`,
          "  2. read the whole regen diff before committing — it carries someone's live edit",
          "  3. commit it SEPARATELY, naming the artifacts that moved, so `git blame` stays honest",
          "     and your own work remains independently revertible",
          "This cannot tell whether that live edit was a sibling session's or this session's own `--pg`",
          "write — the committed file is identical to main either way, and the remedy is the same.",
        ],
      ),
    );
  }

  if (diverged.length > 0) {
    lines.push(
      ...block(
        [
          "WHICH SIDE MOVED: YOURS — this branch changed these generated files itself, measured",
          "against its merge-base with origin/main. Merging is not offered and would not help: git",
          "will not overwrite your own edit, so it would look like a remedy and do nothing.",
        ],
        diverged,
        [
          `DO THIS: pnpm ${command.build}, then commit.`,
          "If you did not expect to have touched these, this is the hand-edited-projection signature.",
          "Edit the artifact — `storytree library artifact edit <id> --pg` — never the generated file.",
        ],
      ),
    );
  }

  if (absent.length > 0) {
    lines.push(
      ...block(
        [
          "WHICH SIDE MOVED: origin/main carries no copy of these at all — a newly delegatable agent,",
          "a rename, or a projection this branch adds. There is nothing on main to compare against.",
        ],
        absent,
        [`DO THIS: pnpm ${command.build}, then commit.`],
      ),
    );
  }

  return lines.join("\n").trimEnd();
}
