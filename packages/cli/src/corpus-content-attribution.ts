// Who a seed↔live difference belongs to — the PURE, IO-free attribution core BOTH corpus checks
// share: `check:corpus-content`'s drift pass (ADR-0290) and `check:corpus-sync`'s absence pass.
//
// IT SERVES TWO CHECKS, and that is deliberate rather than incidental. `check:corpus-sync` was blind
// to both of ADR-0290's signals (measured 2026-08-03: `grep -c "origin/main\|merge-base\|library_event"`
// returned ZERO in `check-corpus-sync.ts` and `sync-drain.ts`), and the cost of that blindness is
// WORSE than corpus-content's: a wrong content remedy publishes a stranger's prose, while a wrong sync
// remedy REVERSES AN OWNER DECISION. This module was WIDENED to carry the second classifier rather
// than forked, because two checks that disagree about what "behind main" means make a gate's own
// printed output untrustworthy — see {@link classifyAbsence} below for that half.
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
// PURE by construction: no `node:` import, no filesystem, no `git`, no `pg`. The git reads live in
// `seed-revisions.ts`; the event reads live in the shells `check-corpus-content.ts` /
// `check-corpus-sync.ts`.

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

// ---------------------------------------------------------------------------
// check:corpus-sync — WHY an artifact is absent from live, before a remedy is prescribed
// ---------------------------------------------------------------------------
//
// THE DEFECT THIS EXISTS TO CLOSE. `check:corpus-sync` reports every seed-only id with ONE
// unconditional instruction — "DRAIN it — `pnpm storytree library sync-corpus --pg`. Never raise the
// ceiling." — and it has no idea WHY the id is absent. On a branch cut before an owner-directed live
// RETIREMENT, obeying that instruction resurrects the retired artifact. Measured on
// `oq-diff-view-altitude` (retired live under ADR-0267 D5): `events.library_event` records
// created(1472) → deleted(2694) → created(2695) → deleted(2696) → created(2698) → deleted(2702) →
// created(2742) → deleted(2756). FOUR resurrections, each one a session correctly obeying a
// correct-looking instruction from the gate itself — which is the one place prose cannot reach, since
// no guidance outranks a gate's own printed output at the moment of failure.
//
// It is not a hypothetical population either. Of the five ids `sync-drain.ts`'s differential control
// names as "still absent from live today … they left the SEED instead" — `oq-fix-drive-build-shape`,
// `rename-tests-to-uat-test-criteria`, `rename-tree-to-forest`, `retire-generated-assets-json`,
// `solar-system-world` — ALL FIVE have `deleted` as their latest live event. Every one of them would
// be resurrected by the printed remedy if a stale branch still carried its seed row.
//
// THREE CAUSES, from three signals, on ADR-0290 D3's one-label-per-cause precedent:
//
//   - NEVER MIGRATED — the ordinary migration gap this check was built for: an ADR-0095 graduation
//     wrote the artifact into the seed and nothing ever synced it live. Remedy unchanged
//     (`sync-corpus --pg`), and this is the ONLY cause charged against the ceiling.
//   - RETIRED LIVE — the event log shows the id was created and then DELETED. Re-creating it reverses
//     an owner decision, so it is reported with its retiring event and never drained, never charged.
//   - BEHIND MAIN — `origin/main`'s seed no longer carries the row, and this branch simply has not
//     merged that. Remedy is `git merge origin/main` and explicitly NOT `sync-corpus`, which on a
//     stale base re-authors a row main has already dropped. Never charged.
//
// PRECEDENCE IS AUTHORED > RETIRED LIVE > BEHIND MAIN, and each step is load-bearing.
//
// AUTHORED FIRST, mirroring {@link attributeDrift}: a branch that ADDED this id to the seed since the
// merge base has just graduated it, which is precisely the population the check exists to catch. That
// step is why "origin/main does not carry the row" cannot be tested on its own — main does not carry a
// brand-new graduation either, so a bare main-differential would excuse every genuine migration gap as
// staleness and silently stop the check doing its job.
//
// RETIRED LIVE BEFORE BEHIND MAIN because it is the label that answers "why must I not drain this?"
// with an audit fact rather than a git state, and because the two are routinely BOTH true (a
// retirement drops the seed row on main, so a stale branch sees both at once). Nothing is lost by the
// ordering: when main has also dropped the row, the retirement's `because` carries the merge remedy
// too, so a stale session is told the fact AND the action rather than one or the other.
//
// FAIL-CLOSED ON UNMEASURABLE ATTRIBUTION (ADR-0290 D7, and the same asymmetry argument as the drift
// half above): if git or the event log cannot be read, EVERY absence degrades to `never-migrated` —
// exactly today's behaviour — and the reason is printed. A wrongly-charged red costs a merge; a
// wrongly-excused one lands a one-sided edit no later gate catches.
//
// IT RAISES NO CEILING AND ADDS NO TUNABLE. M=0 stands (ADR-0252 D3). What changes is the APERTURE —
// which absences are the branch's to answer for — on the same ADR-0269 4(f) reasoning ADR-0290
// recorded: the population was not enlarged, it was WRONG.

/** Why a seed artifact is absent from the live store — see the section doc. */
export type AbsenceCause = "never-migrated" | "retired-live" | "behind-main";

/** The measured evidence the absence classifier is computed from. */
export interface AbsenceEvidence {
  /** The branch the gate is running on — for the printed messages. `null` when git could not say. */
  readonly branch: string | null;
  /**
   * Ids present in the WORKING seed but absent at `git merge-base origin/main HEAD` — what this
   * branch ADDED. Added, not merely changed: an edit to a long-standing row is not a graduation.
   */
  readonly seedAddedByBranch: ReadonlySet<string>;
  /**
   * Ids whose LATEST live event is `deleted`, with that retiring event — the artifact existed and was
   * deliberately retired. Latest-event rather than ever-deleted: a retired-then-refiled artifact is
   * live again and its absence would mean something else entirely.
   */
  readonly retiredLive: ReadonlyMap<string, { actor: string; at: string }>;
  /** Ids `origin/main`'s seed does not carry. Diagnostic of staleness once authorship is excluded. */
  readonly absentFromMainSeed: ReadonlySet<string>;
  /**
   * Why attribution could not be measured, if it could not. Set ⇒ every absence is charged as
   * `never-migrated` (the pre-change behaviour) rather than excused.
   */
  readonly unattributable?: string | undefined;
}

/** One absence, with the cause it was charged to and the evidence line that placed it there. */
export interface AttributedAbsence {
  readonly id: string;
  readonly cause: AbsenceCause;
  /** Short human-readable reason — printed next to the id so a verdict is never bare. */
  readonly because: string;
}

/** The classified population — the three lists the ceiling and the report are built from. */
export interface AbsenceAttribution {
  /** The ONLY charged list: a real migration gap this branch must drain. */
  readonly neverMigrated: readonly AttributedAbsence[];
  readonly retiredLive: readonly AttributedAbsence[];
  readonly behindMain: readonly AttributedAbsence[];
  /** Echoed from the evidence so a caller can print the fallback reason it is acting under. */
  readonly unattributable?: string | undefined;
}

const onlyAbsence = (all: readonly AttributedAbsence[], cause: AbsenceCause): AttributedAbsence[] =>
  all.filter((a) => a.cause === cause);

/**
 * Classify each seed-only id by WHY it is absent from live. Pure — inject the evidence.
 *
 * See the section doc above for the precedence argument and the fail-closed posture.
 */
export function classifyAbsence(
  absentIds: readonly string[],
  evidence: AbsenceEvidence,
): AbsenceAttribution {
  const branch = evidence.branch ?? "this branch";
  const all: AttributedAbsence[] = absentIds.map((id) => {
    if (evidence.unattributable !== undefined) {
      return { id, cause: "never-migrated" as const, because: "cause unmeasured — charged, not excused" };
    }
    if (evidence.seedAddedByBranch.has(id)) {
      return { id, cause: "never-migrated" as const, because: `${branch} added it to the seed — a graduation that never synced` };
    }
    const retired = evidence.retiredLive.get(id);
    if (retired !== undefined) {
      return {
        id,
        cause: "retired-live" as const,
        because:
          `retired live by ${retired.actor} at ${retired.at}` +
          (evidence.absentFromMainSeed.has(id)
            ? "; origin/main's seed has already dropped the row, so merging main clears this"
            : "; the seed row is still on main — finish the retirement by dropping it, never by syncing"),
      };
    }
    if (evidence.absentFromMainSeed.has(id)) {
      return { id, cause: "behind-main" as const, because: "origin/main's seed no longer carries the row" };
    }
    return { id, cause: "never-migrated" as const, because: "no live create event — never migrated" };
  });

  return {
    neverMigrated: onlyAbsence(all, "never-migrated"),
    retiredLive: onlyAbsence(all, "retired-live"),
    behindMain: onlyAbsence(all, "behind-main"),
    ...(evidence.unattributable === undefined ? {} : { unattributable: evidence.unattributable }),
  };
}
