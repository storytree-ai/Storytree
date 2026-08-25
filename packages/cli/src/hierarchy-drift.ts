import {
  countWorkHierarchy,
  diffWorkHierarchy,
  formatHierarchyDifference,
  WORK_HIERARCHY_SCHEMA_VERSION,
  type HierarchyCounts,
  type HierarchyDifference,
  type WorkHierarchySnapshot,
} from "@storytree/library";

/**
 * THE PURE JUDGE behind `check:hierarchy-drift` (ADR-0445 D1, `map-freshness-arc` inc-02) — does the
 * live store's mirror of `stories/**` still describe the tree it claims to mirror?
 *
 * The gatherer/judge split `check-boundaries.ts` / `boundaries.ts` and `check-ownership-totality.ts`
 * / `ownership-totality.ts` already use: every rule lives here and is exhaustively unit-testable
 * against literals, while the rung next door only reads the store, reads git, prints, and sets an
 * exit code.
 *
 * ## TWO INDEPENDENT QUESTIONS, ASKED SEPARATELY ON PURPOSE
 *
 * **FRESHNESS — is the store's copy of the same tree `main` has?** Judged on `storiesTreeSha`, the
 * git TREE object id of `stories/`. A tree id is a CONTENT hash, so this is exact: two commits whose
 * `stories/` are byte-identical share it, and a projection generated from a PR's merge ref is
 * recognised as current for the `main` commit that merge produces. `commitSha` is deliberately NOT
 * used — a squash merge discards the commit the projection names, so a later checkout cannot resolve
 * it and a rule resting on it would be unanswerable half the time.
 *
 * **AGREEMENT — do the store's ROWS match what the projector reads off this checkout?** Only
 * askable when THIS checkout is at the very tree the store mirrors. On a branch that is itself
 * editing `stories/**` the two legitimately differ, and the answer is `not-compared` — reported in
 * those words, never folded into a pass. This is the aperture, named rather than implied
 * (`an-observable-is-evidence-only-for-what-it-observes`): agreement is confirmed live on `main`
 * after every regeneration and on every branch that touches no story, and it is proven hermetically
 * by the projector's and the store's own suites. It is NOT confirmed on a story-authoring branch,
 * and this check says so out loud instead of printing a green that examined nothing.
 *
 * ## WHY "THE STORE IS AHEAD OF MY BASE" IS NOT A FAILURE
 *
 * The store mirrors whatever `main` was when the regeneration last ran; a checkout compares against
 * whatever `origin/main` it happens to hold. Those go out of step in BOTH directions, and only one of
 * them is a defect:
 *
 *  - the store's tree differs from the base AND the store was generated no later than that base
 *    commit ⇒ the regeneration did not run, the mirror is BEHIND, and that is the failure this whole
 *    increment exists to make loud;
 *  - the store's tree differs from the base AND the store is NEWER than that base commit ⇒ this
 *    checkout's view of `main` is the stale one. Redding here would punish a session for a sibling's
 *    landing, and — far worse — its obvious remedy (`hierarchy:load`) would overwrite a CURRENT
 *    mirror with this checkout's older tree. So it warns, names `git fetch origin` as the repair, and
 *    declines to judge agreement.
 *
 * What that heuristic does NOT defend against, stated so nobody reads more into it: a projection
 * loaded from some foreign tree with a fresh timestamp reads here as a stale local ref. There is one
 * automatic writer (the post-merge regeneration) and one manual one (a hand re-run after that
 * failed); this judge assumes the loader was pointed at a real checkout, and asserts nothing about a
 * deliberately misused one.
 *
 * ## THE ONE RACE, NAMED RATHER THAN DENIED
 *
 * The regeneration runs in the automerge job, moments AFTER the merge it follows. A CI run that
 * fetches `main` inside that window sees the new tree while the mirror still holds the old one, and
 * reads BEHIND. It is the same class as `check:guidance` / `check:agents` racing a sibling's live
 * write — a known, accepted shape here whose remedy is a re-run — and the window is roughly a
 * minute, entered only by a `stories/**` merge. The BEHIND message names it as the first thing to
 * check. A grace period keyed on the base commit's age would close it; it is deliberately NOT built,
 * because it trades a real, rare re-run for a window in which a genuinely failed regeneration reads
 * as fine, and nothing has yet measured the first cost as worth the second.
 */

/** What the caller managed to gather. Every field may be absent, and absence is judged, not ignored. */
export interface HierarchyDriftInputs {
  /** The store's projection, or `null` when the store has never been loaded. */
  readonly stored: WorkHierarchySnapshot | null;
  /** This checkout's projection, or `null` when the tree could not be read. */
  readonly checkout: WorkHierarchySnapshot | null;
  /** The ref the mirror is judged against, e.g. `origin/main`. */
  readonly baseRef: string;
  /** `git rev-parse <baseRef>:stories`, or `null` when the ref does not resolve here. */
  readonly baseStoriesTreeSha: string | null;
  /** The base commit's committer date (ISO-8601), or `null` when it does not resolve. */
  readonly baseCommittedAt: string | null;
  /** `git rev-parse HEAD:stories`, or `null` when it does not resolve. */
  readonly headStoriesTreeSha: string | null;
  /** Whether `stories/` carries uncommitted changes — an unstaged edit is not in any tree id. */
  readonly storiesDirty: boolean;
}

/** How current the store's mirror is. */
export type HierarchyFreshness =
  /** The store mirrors the base's `stories/` tree exactly. */
  | "current"
  /** The store mirrors an OLDER tree — the regeneration did not run. A failure. */
  | "behind"
  /** The store is newer than this checkout's view of the base. A warning about the VIEW. */
  | "ahead-of-base"
  /** The store holds no projection at all. */
  | "unloaded"
  /** The base ref could not be read here, so freshness was never judged. */
  | "unreadable-base";

/** Whether the store's rows were compared against the checkout, and what came of it. */
export type HierarchyAgreement = "agrees" | "differs" | "not-compared";

/** The judged result: a verdict, its reasons, and the denominators behind it. */
export interface HierarchyDriftVerdict {
  readonly ok: boolean;
  readonly freshness: HierarchyFreshness;
  readonly agreement: HierarchyAgreement;
  /** Why agreement was `not-compared`; absent otherwise. */
  readonly notComparedBecause?: string;
  readonly differences: readonly HierarchyDifference[];
  /** What the store holds — `null` when it holds nothing. */
  readonly counts: HierarchyCounts | null;
  /** The report, one line each, remedy included. */
  readonly lines: readonly string[];
}

/** How many differences a failing report prints before it stops listing them. */
export const MAX_REPORTED_DIFFERENCES = 20;

const RELOAD = "pnpm hierarchy:load        # re-project this checkout into the store";

/** ISO-8601 comparison that treats an unparseable date as "cannot tell", never as "earlier". */
function isStrictlyAfter(later: string, earlier: string): boolean | null {
  const a = Date.parse(later);
  const b = Date.parse(earlier);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return a > b;
}

function judgeFreshness(input: HierarchyDriftInputs, stored: WorkHierarchySnapshot): HierarchyFreshness {
  if (input.baseStoriesTreeSha === null) return "unreadable-base";
  if (stored.storiesTreeSha === input.baseStoriesTreeSha) return "current";
  if (input.baseCommittedAt === null) return "behind";
  const newer = isStrictlyAfter(stored.generatedAt, input.baseCommittedAt);
  // `null` — an unparseable timestamp — falls to BEHIND. Fail-closed: a mirror that cannot prove it
  // is current is treated as one that is not.
  return newer === true ? "ahead-of-base" : "behind";
}

/**
 * Judge one gathered reading. Pure and total: every absent input produces a NAMED verdict rather
 * than an exception or a quiet pass.
 */
export function judgeHierarchyDrift(input: HierarchyDriftInputs): HierarchyDriftVerdict {
  const lines: string[] = [];

  if (input.stored === null) {
    return {
      ok: false,
      freshness: "unloaded",
      agreement: "not-compared",
      notComparedBecause: "the store holds no projection",
      differences: [],
      counts: null,
      lines: [
        "✗ the live store holds NO work-hierarchy projection.",
        "",
        "  This is a FAILURE, not a skip: nothing was compared, so nothing about the mirror was",
        "  judged. The projection is written by the post-merge regeneration; if that has never run",
        "  against this database, load it once by hand:",
        "",
        `    ${RELOAD}`,
      ],
    };
  }

  const stored = input.stored;
  const counts = countWorkHierarchy(stored);
  const freshness = judgeFreshness(input, stored);

  // A store answering with an EMPTY hierarchy is not a clean tree, it is the wrong database or a
  // loader that read nothing — the vacuous pass this rung exists to make impossible.
  if (counts.stories === 0) {
    return {
      ok: false,
      freshness,
      agreement: "not-compared",
      notComparedBecause: "the stored projection is empty",
      differences: [],
      counts,
      lines: [
        "✗ the stored work-hierarchy projection holds ZERO stories.",
        "",
        "  Zero is never this repo's tree. Either the loader ran against a checkout with no",
        "  `stories/` directory, or this connection is pointed at the wrong database — check",
        "  STORYTREE_DB_NAME and the instance this checkout dials, then re-run.",
        "",
        `    ${RELOAD}`,
      ],
    };
  }

  if (stored.schemaVersion !== WORK_HIERARCHY_SCHEMA_VERSION) {
    return {
      ok: false,
      freshness,
      agreement: "not-compared",
      notComparedBecause: "the stored projection was written by a different schema version",
      differences: [],
      counts,
      lines: [
        `✗ the stored projection is schema version ${String(stored.schemaVersion)}; this checkout` +
          ` speaks ${String(WORK_HIERARCHY_SCHEMA_VERSION)}.`,
        "",
        "  The shape moved under the mirror, so a field-by-field comparison would report",
        "  differences that describe the version gap rather than the tree. Re-load it:",
        "",
        `    ${RELOAD}`,
      ],
    };
  }

  if (freshness === "unreadable-base") {
    return {
      ok: false,
      freshness,
      agreement: "not-compared",
      notComparedBecause: `${input.baseRef} does not resolve in this checkout`,
      differences: [],
      counts,
      lines: [
        `✗ ${input.baseRef} does not resolve here, so the mirror's currency was never judged.`,
        "",
        "  A check that cannot be consulted must not answer 'clean'. In a shallow CI checkout the",
        "  base may simply not be fetched; locally the ref may never have been created.",
        "",
        "    git fetch --depth=1 origin main",
      ],
    };
  }

  if (freshness === "behind") {
    return {
      ok: false,
      freshness,
      agreement: "not-compared",
      notComparedBecause: "the store mirrors a different tree",
      differences: [],
      counts,
      lines: [
        `✗ the stored projection does NOT mirror ${input.baseRef}'s \`stories/\` tree.`,
        "",
        `    stored  ${stored.storiesTreeSha}  (generated ${stored.generatedAt} by ${stored.generator})`,
        `    ${input.baseRef.padEnd(7)} ${input.baseStoriesTreeSha ?? "?"}`,
        "",
        "  CHECK THE RACE FIRST: the regeneration runs in the automerge job, moments AFTER the merge",
        "  it follows. If a `stories/**` PR landed in the last minute or two, this reading is simply",
        "  earlier than that job — re-run this step before doing anything else.",
        "",
        "  Otherwise the regeneration did not take, and every reader of this mirror is being served",
        "  an older tree. It is reported rather than repaired here, and it is NEVER silently answered",
        "  from disk instead: a fallback would report health while serving the stale thing, which is",
        "  the failure this projection exists to remove.",
        "",
        `    ${RELOAD}   # from a checkout at ${input.baseRef}`,
      ],
    };
  }

  if (freshness === "ahead-of-base") {
    lines.push(
      `⚠ the stored projection is NEWER than this checkout's ${input.baseRef}.`,
      "",
      `    stored     ${stored.storiesTreeSha}  (generated ${stored.generatedAt})`,
      `    ${input.baseRef.padEnd(10)} ${input.baseStoriesTreeSha ?? "?"}  (committed ${input.baseCommittedAt ?? "?"})`,
      "",
      "  A sibling landed a `stories/**` change after this checkout last fetched. The mirror is not",
      "  the stale copy here — this view of `main` is — so the repair is a fetch, and re-loading",
      "  would OVERWRITE a current mirror with this checkout's older tree.",
      "",
      "    git fetch origin",
      "",
    );
  }

  // AGREEMENT. Only askable when this checkout is standing on the exact tree the store mirrors.
  let agreement: HierarchyAgreement = "not-compared";
  let notComparedBecause: string | undefined;
  let differences: HierarchyDifference[] = [];

  if (input.checkout === null) {
    notComparedBecause = "this checkout's `stories/` tree could not be projected";
  } else if (input.storiesDirty) {
    notComparedBecause = "`stories/` has uncommitted changes, which are in no tree id";
  } else if (input.headStoriesTreeSha === null) {
    notComparedBecause = "HEAD's `stories/` tree id could not be read";
  } else if (input.headStoriesTreeSha !== stored.storiesTreeSha) {
    notComparedBecause = "this branch's `stories/` differs from the tree the store mirrors";
  } else {
    differences = diffWorkHierarchy(input.checkout, stored);
    agreement = differences.length === 0 ? "agrees" : "differs";
  }

  if (agreement === "differs") {
    lines.push(
      `✗ the stored rows DISAGREE with this checkout at the very tree they claim to mirror` +
        ` (${stored.storiesTreeSha}).`,
      "",
      `  ${String(differences.length)} difference(s); the tree is the truth and the store is the copy:`,
      "",
      ...differences
        .slice(0, MAX_REPORTED_DIFFERENCES)
        .map((d) => `    ${formatHierarchyDifference(d)}`),
    );
    if (differences.length > MAX_REPORTED_DIFFERENCES) {
      lines.push(
        `    … and ${String(differences.length - MAX_REPORTED_DIFFERENCES)} more not listed`,
      );
    }
    lines.push("", "  The loader and the tree have forked. Re-load, then read the report again:", "", `    ${RELOAD}`);
  } else if (agreement === "not-compared") {
    lines.push(
      `⚠ AGREEMENT NOT COMPARED — ${notComparedBecause ?? "unknown"}.`,
      "",
      "  This is not a pass over the rows: they were not read against anything. Freshness above IS",
      "  judged, and agreement is confirmed on `main` after each regeneration and on every branch",
      "  that touches no story.",
    );
  } else {
    lines.push(
      `✓ the stored projection mirrors ${input.baseRef}, and its rows agree with this checkout` +
        ` field for field.`,
    );
  }

  lines.push(
    "",
    `stored: ${String(counts.stories)} stories, ${String(counts.capabilities)} capabilities, ` +
      `${String(counts.criteria)} criteria, ${String(counts.gates)} gates — ` +
      `freshness ${freshness}, agreement ${agreement}.`,
  );

  const verdict: HierarchyDriftVerdict = {
    // Every FRESHNESS failure — unloaded, empty, version gap, unreadable base, behind — returned
    // above with its own remedy, so by here freshness is `current` or `ahead-of-base` and the only
    // thing left that can fail is a genuine content disagreement. Stated rather than re-tested: a
    // `freshness !== "behind"` guard here would read as a live condition while being unreachable.
    ok: agreement !== "differs",
    freshness,
    agreement,
    differences,
    counts,
    lines,
  };
  return notComparedBecause === undefined ? verdict : { ...verdict, notComparedBecause };
}
