// Who a seed↔live drift belongs to — the PURE, IO-free core of `check:corpus-content`'s attribution
// pass (ADR-0290).
//
// THE DEFECT THIS EXISTS TO CLOSE, as inputs → wrong outcome. `check:corpus-content` compares the
// committed seed against the LIVE store, and live is not in git. The seed is one branch's working
// tree; the live store is shared by every concurrent session on the machine and by the studio. So the
// check's population is a JOIN of a per-branch surface and a machine-shared one, while its ceiling
// (V=0 / D=0, ADR-0252 D3 / ADR-0263) is charged to whoever runs the gate next. Those two are not the
// same party, and routinely are not even the same session.
//
// Measured on this branch, 2026-08-02, before any of this landed — the cleanest possible control:
// HEAD == origin/main (`git rev-list --left-right --count origin/main...HEAD` → `0 0`), working tree
// clean, no commits, no live writes. `pnpm check:corpus-content` exited 1:
//
//   RED — corpus-content drain ceiling breached: 3 value-drift, 0 degraded-live.
//   3 artifact(s) ... past the ceiling (V=0): friction-adjudication, merge-ceremony,
//   the-same-file-in-another-tree-is-a-different-file
//
// A session that had done nothing at all, on a branch identical to main, was blocked from landing. It
// is not staleness (the branch cannot be behind main when it IS main) and it is not that session's
// edit (there is no diff). All three are siblings' undrained live edits. That is the whole defect in
// one run, and six separate sessions filed it independently rather than as reinforcements — see
// `a-drain-ceiling-a-sibling-breached-reds-a-session-that-touched-nothing-it-guards` (×5),
// `corpus-content-gate-red-on-sibling-mid-stream-live-edit` (×2),
// `a-siblings-live-corpus-edit-reds-every-other-sessions-gate`,
// `zero-ceiling-corpus-gate-races-concurrent-live-authoring`,
// `export-corpus-is-all-or-nothing-so-one-artifact-carries-a-siblings-drift`, and
// `all-or-nothing-export-carries-a-foreign-citation-to-an-unlanded-adr-into-the-seed`.
//
// THE FIX IS NOT A RAISE, AND CANNOT BE. ADR-0269 is accepted and load-bearing: "a drain ceiling rises
// only when the measured population enlarges, never to absorb growth." The population has not
// enlarged — it was WRONG. The check was measuring a shared store's total unreconciled state and
// charging it to a single branch. This narrows the measurement APERTURE to the artifacts the branch is
// answerable for, and the ceilings stay at ZERO on that aperture. ADR-0269 4(f) requires an aperture
// change to record its decomposition; that is ADR-0290 and the constants' own doc.
//
// THREE OUTCOMES, from two exact signals and one diagnostic one.
//
//   - AUTHORED — this branch changed the artifact's SEED entry (git, relative to the merge base), or
//     this branch was the LAST writer of its LIVE body (`events.library_event.actor`). Either way the
//     reconciliation is unfinished work of this branch's own. Ceiling ZERO; it reds.
//   - STALE — neither of those, but the seed at `origin/main` ALREADY matches live. The drift is not a
//     reconciliation at all: someone landed the export and this branch has not merged it. The remedy
//     is `git merge origin/main`, and printing an export remedy here is actively harmful — the
//     measured cost of following it was a duplicate of a hunk already on main (the reinforcement that
//     corrected `a-drain-ceiling-a-sibling-breached-...`, branch 12 commits behind).
//   - FOREIGN — neither, and main does not agree with live either: another writer's undrained edit.
//     Nothing this branch can honestly discharge. Reported with its writer, never charged.
//
// WHY BOTH SIGNALS ARE NEEDED, since either alone looks sufficient and is not. A pure git differential
// (working-tree seed vs merge-base seed) catches a branch that edited the SEED and cannot see a branch
// that edited LIVE — which is the ceremony's normal direction (ADR-0023: live is the edit surface) and
// therefore the exact case the check exists to catch. A pure event-log signal catches the live edit
// and cannot see a branch that edited or reverted the seed by hand. Drop either and the check stops
// doing its job in one whole direction, which would be a real softening rather than a re-aperture.
//
// FAIL-CLOSED ON UNMEASURABLE ATTRIBUTION, which is the opposite of the substrate posture around it.
// The shell still SKIPs (exit 0) when the DB is unreachable or the creds are absent — that fail-open
// predates this and is untouched. But once the check IS running, an attribution it could not measure
// must not become a pass: `unattributable` degrades EVERY drifted id to `authored`, i.e. exactly the
// pre-ADR-0290 behaviour, and says why. The reason is asymmetry of harm — a wrongly-charged red costs
// a session a merge or a routed report, while a wrongly-excused red lands a one-sided edit that no
// later gate will catch, because the next session's check will excuse it as foreign too.
//
// The `reconciledOnMain` signal is DIAGNOSTIC only and never gates: without it a stale drift simply
// reports as `foreign`. Both are WARN, so an unfetched `origin/main` costs a worse message and never a
// wrong verdict.
//
// PURE by construction: no `node:` import, no filesystem, no `git`, no `pg`. The git reads and the
// event read live in the shell `check-corpus-content.ts`.

/** Which party a single drifted artifact is answerable to — see the module doc. */
export type DriftOwner = "authored" | "stale" | "foreign";

/**
 * The measured evidence attribution is computed from. Every field is a fact about THIS branch versus
 * the shared store; the classifier itself decides nothing about direction (which side is canonical
 * stays ADR-0120's per-artifact judgement, exactly as before).
 */
export interface DriftAttributionEvidence {
  /** The branch the gate is running on — for the printed messages. `null` when git could not say. */
  readonly branch: string | null;
  /**
   * Ids whose SEED entry differs between the merge base (`git merge-base origin/main HEAD`) and the
   * working tree — including uncommitted edits. This is "what this branch did to the seed", and it is
   * exact: git is the enforcing source for a committed file.
   */
  readonly seedChangedByBranch: ReadonlySet<string>;
  /**
   * Ids whose LATEST live write names this branch (`events.library_event.actor`). "What this branch
   * did to live", and latest-writer rather than ever-wrote: a live body is whatever the last upsert
   * left, so if a sibling wrote after this branch, the body under discussion is theirs.
   */
  readonly liveWrittenByBranch: ReadonlySet<string>;
  /**
   * Ids where the seed at `origin/main` ALREADY equals the live body — the branch is merely behind.
   * Diagnostic: it separates a `foreign` report from a `git merge origin/main`, and never gates.
   */
  readonly reconciledOnMain: ReadonlySet<string>;
  /**
   * Why attribution could not be measured, if it could not. Set ⇒ every drifted id is charged as
   * `authored` (the pre-ADR-0290 behaviour) rather than excused — see the module doc's asymmetry
   * argument. Absent ⇒ both exact signals were read.
   */
  readonly unattributable?: string | undefined;
}

/** One drift, with the party it is charged to and the evidence line that placed it there. */
export interface AttributedDrift {
  readonly id: string;
  readonly owner: DriftOwner;
  /** Short human-readable reason — printed next to the id so a verdict is never bare. */
  readonly because: string;
}

/** The classified population — the three lists the ceiling and the report are built from. */
export interface DriftAttribution {
  readonly authored: readonly AttributedDrift[];
  readonly stale: readonly AttributedDrift[];
  readonly foreign: readonly AttributedDrift[];
  /** Echoed from the evidence so a caller can print the fallback reason it is acting under. */
  readonly unattributable?: string | undefined;
}

const only = (all: readonly AttributedDrift[], owner: DriftOwner): AttributedDrift[] =>
  all.filter((d) => d.owner === owner);

/**
 * Charge each drifted id to a party. Pure — inject the evidence.
 *
 * Precedence is AUTHORED > STALE > FOREIGN, and the first step matters: a branch that changed the seed
 * entry of an artifact whose live body main already matches has REVERTED main's export, which is its
 * own work and not staleness. Checking staleness first would excuse it.
 */
export function attributeDrift(
  driftedIds: readonly string[],
  evidence: DriftAttributionEvidence,
): DriftAttribution {
  const branch = evidence.branch ?? "this branch";
  const all: AttributedDrift[] = driftedIds.map((id) => {
    if (evidence.unattributable !== undefined) {
      return { id, owner: "authored" as const, because: "attribution unmeasured — charged, not excused" };
    }
    if (evidence.seedChangedByBranch.has(id)) {
      return { id, owner: "authored" as const, because: `${branch} changed its seed entry` };
    }
    if (evidence.liveWrittenByBranch.has(id)) {
      return { id, owner: "authored" as const, because: `${branch} wrote its live body last` };
    }
    if (evidence.reconciledOnMain.has(id)) {
      return { id, owner: "stale" as const, because: "origin/main's seed already matches live" };
    }
    return { id, owner: "foreign" as const, because: "another writer's unexported live edit" };
  });

  return {
    authored: only(all, "authored"),
    stale: only(all, "stale"),
    foreign: only(all, "foreign"),
    ...(evidence.unattributable === undefined ? {} : { unattributable: evidence.unattributable }),
  };
}
