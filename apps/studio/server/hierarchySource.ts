// WHICH CLOCK THE MAP'S QUESTION COMES FROM (ADR-0445 D1, `map-freshness-arc` inc-03).
//
// The forest map JOINS two sources. The PROOF — signed verdicts — has always been read live from
// Postgres. The QUESTION — which stories and capabilities exist, and each criterion's exact
// `revisionId` — was read off the app's own disk, frozen at the commit it was built from. Verdicts
// bind by `criterionId` + `revisionId` (ADR-0253), so an app at an older commit read the database
// PERFECTLY, matched no verdict for any criterion re-worded since, and correctly painted yellow.
//
// This module is the seam that picks the source. It is deliberately tiny and deliberately LOUD.

import type { FoldedWorkHierarchy, WorkHierarchySnapshot } from '@storytree/library';

/** Where a rendered hierarchy actually came from. Reported, never inferred. */
export type HierarchyOrigin = 'live' | 'disk';

export interface HierarchySelection<T> {
  readonly origin: HierarchyOrigin;
  readonly read: T;
  /** The projection's stamp — present only on a `live` read. Provenance for the log line. */
  readonly stamp?: {
    readonly commitSha: string;
    readonly storiesTreeSha: string;
    readonly generatedAt: string;
  };
  /** Why the live source was not used. Present only on a `disk` read. */
  readonly fellBackBecause?: string;
}

/**
 * Pick the hierarchy source, preferring live.
 *
 * ## The fallback is allowed, and it is never silent
 *
 * ADR-0302's lesson is that a second copy of a canonical thing drifts and is then read INSTEAD of the
 * source by something that reports "in sync" while serving the stale copy. The committed corpus
 * mirror it deleted did exactly that. So the disk read stays reachable here — a studio that cannot
 * see the store must still draw a forest — but it can only be reached by a branch that says WHY, in
 * a value the caller can log and assert on. A fallback nobody can observe is the same object
 * ADR-0302 deleted, wearing a different hat.
 *
 * ## Three ways to miss, and they must never be reported as one
 *
 * A backend that serves no projection (the json store) is a CONFIGURATION choice. A store that
 * answers with none means the LOADER has not run. A read that FAILS means the STORE is unwell. Each
 * needs a different remedy, so each carries its own `fellBackBecause`.
 *
 * This is not hypothetical tidiness. While the backend still collapsed a failed read into `null`, the
 * studio announced *"the live store holds no work-hierarchy projection yet"* against a store holding a
 * perfectly good 46-story snapshot — the read had merely lost a race with its own pool build
 * (measured 2026-08-26). A confident wrong reason is worse than no reason: it sends the reader to fix
 * something that was never broken.
 *
 * ## What this does NOT decide
 *
 * Whether the RULES that fold the facts are current. A stale app now reads current facts and still
 * compiles them with its own build's `rollupStoryGreen`. ADR-0445's Consequences say so plainly; this
 * seam closes the data half only, and calling it "staleness solved" reads it too widely.
 */
export async function selectHierarchy<T>(
  source: {
    /**
     * The live projection. `null` means the store holds none; a FAILED read throws, and the two are
     * reported differently below because they need opposite remedies.
     */
    readonly live?: (() => Promise<WorkHierarchySnapshot | null>) | undefined;
    /** Fold a snapshot into the reader's shape. */
    readonly fold: (snapshot: WorkHierarchySnapshot) => T;
    /** The disk walk, used only when the live source cannot answer. */
    readonly disk: () => Promise<T>;
  },
): Promise<HierarchySelection<T>> {
  if (source.live === undefined) {
    return {
      origin: 'disk',
      read: await source.disk(),
      fellBackBecause: 'this backend serves no work-hierarchy projection',
    };
  }

  let snapshot: WorkHierarchySnapshot | null;
  try {
    snapshot = await source.live();
  } catch (err) {
    // A FAILED read — pool down, timeout, permissions. Distinct from the `null` below, which means
    // the store answered and had no projection: one says look at the store, the other says run the
    // loader, and reporting either as the other sends an operator to the wrong fix.
    return {
      origin: 'disk',
      read: await source.disk(),
      fellBackBecause: `the live projection threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (snapshot === null) {
    return {
      origin: 'disk',
      read: await source.disk(),
      fellBackBecause: 'the live store holds no work-hierarchy projection yet',
    };
  }

  return {
    origin: 'live',
    read: source.fold(snapshot),
    stamp: {
      commitSha: snapshot.commitSha,
      storiesTreeSha: snapshot.storiesTreeSha,
      generatedAt: snapshot.generatedAt,
    },
  };
}

/**
 * The one line a fallback prints, at most once per distinct reason.
 *
 * Rate-limited by reason rather than by time: `/api/tree` is polled, so an un-limited line would emit
 * on every poll and the operator would filter it out — which is how a loud signal becomes a silent
 * one. A NEW reason always prints, because that is the part worth seeing.
 */
const announced = new Set<string>();

export function announceHierarchyOrigin(
  selection: HierarchySelection<unknown>,
  log: (message: string) => void = console.warn,
): void {
  if (selection.origin === 'live') return;
  const reason = selection.fellBackBecause ?? 'unknown';
  if (announced.has(reason)) return;
  announced.add(reason);
  log(
    `[tree] serving the work hierarchy from DISK — ${reason}. ` +
      `The map's question is this build's commit while its proof is live, so criteria re-worded ` +
      `since this build will show as unproven (ADR-0445 D1).`,
  );
}

/** Test seam: forget what has been announced, so each case starts from silence. */
export function resetHierarchyAnnouncements(): void {
  announced.clear();
}

export type { FoldedWorkHierarchy };
