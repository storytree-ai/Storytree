// THE DESKTOP MAP'S QUESTION, READ LIVE (ADR-0445 D1, `map-freshness-arc` inc-03).
//
// The installed desktop app is the surface where the freshness skew actually bit, and it is worth
// being exact about why, because the app was not broken and neither was the database.
//
// The map JOINS two sources. The PROOF — signed verdicts — is read live from Postgres and is always
// current. The QUESTION — which stories and capabilities exist, and each criterion's exact
// `revisionId` — shipped INSIDE the app, frozen at the commit it was built from. A verdict binds to a
// criterion by `criterionId` + `revisionId` (ADR-0253). So an app built before a criterion was
// re-worded read the database perfectly, found verdicts stamped with a revision it had never heard
// of, and correctly painted yellow. It asked an outdated question and got an honest answer.
//
// Worked example, the one that produced the incident: `agent`'s criterion was authored 2026-08-03 at
// `uatr1:b7b5052c7e21a3a2`, re-worded 2026-08-12 to `uatr1:380a683e4995990d`, and signed on 08-22/23
// against the NEW revision. An app built between those dates paints it yellow forever until rebuilt.
// Criteria on `main` went 261 (08-05) to 113 (08-24), so a month-old app enforces ~148 obligations
// that no longer exist. The staler the client, the yellower the map.

// TYPE-only: erased at compile time, so this drags no library VALUE into the Electron main bundle —
// the runtime fold is injected by the caller, which loads `@storytree/library` lazily.
import type { FoldedWorkHierarchy, WorkHierarchySnapshot } from "@storytree/library";

import type { DTCapability, DTStory } from "./tree-verdicts.js";

/** The four-part read `readTreeWithCaps` produces — reproduced from the live projection. */
export interface DesktopTreeRead {
  stories: DTStory[];
  uatTestCriteriaByStory: Map<
    string,
    ({ criterionId: string; revisionId: string } | { id: string })[]
  >;
  uatCriteriaByStory: Map<string, { criterionId: string; revisionId: string }[]>;
  coverageByStory: Map<string, { id: string; covers?: readonly string[] }[]>;
}

/** Where the desktop's hierarchy actually came from on this request. Reported, never inferred. */
export type DesktopHierarchyOrigin = "live" | "cache" | "disk";

export interface DesktopHierarchySelection {
  readonly origin: DesktopHierarchyOrigin;
  readonly read: DesktopTreeRead;
  /** The projection stamp behind a `live` or `cache` read. Absent on `disk`. */
  readonly stamp?: {
    readonly commitSha: string;
    readonly storiesTreeSha: string;
    readonly generatedAt: string;
  };
  /** Why the live store was not used. Absent on `live`. */
  readonly degradedBecause?: string;
}

/** The library's fold, injected — a pure function this module never imports as a value. */
export type FoldFn = (snapshot: WorkHierarchySnapshot) => FoldedWorkHierarchy;

/**
 * Adapt the library's fold into the desktop's mutable tree nodes.
 *
 * MUTABLE by necessity, not by preference: `foldVerdicts` enriches each story and capability in
 * place. Rebuilding the nodes rather than casting the readonly ones is what keeps that safe.
 */
export function toDesktopTree(folded: FoldedWorkHierarchy): DesktopTreeRead {
  const stories: DTStory[] = folded.stories.map((s) => {
    const story: DTStory = {
      id: s.id,
      title: s.title,
      outcome: s.outcome,
      status: s.status,
      proofMode: s.proofMode,
      uatWitness: s.uatWitness,
      dependsOn: [...s.dependsOn],
      consumedBy: [...s.consumedBy],
      decisions: [...s.decisions],
      building: s.building,
      capabilities: s.capabilities.map((c) => {
        const cap: DTCapability = {
          id: c.id,
          title: c.title,
          outcome: c.outcome,
          status: c.status,
          proofMode: c.proofMode,
          dependsOn: [...c.dependsOn],
          testCount: c.testCount,
        };
        if (c.error !== undefined) cap.error = c.error;
        return cap;
      }),
    };
    if (s.error !== undefined) story.error = s.error;
    return story;
  });
  return {
    stories,
    uatTestCriteriaByStory: new Map(
      [...folded.uatTestCriteriaByStory].map(([id, o]) => [id, [...o]]),
    ),
    uatCriteriaByStory: new Map([...folded.uatCriteriaByStory].map(([id, c]) => [id, [...c]])),
    coverageByStory: new Map([...folded.coverageByStory].map(([id, g]) => [id, [...g]])),
  };
}

/**
 * The RUNTIME cache ADR-0445 D2 legitimises — and the distinction it turns on.
 *
 * D2 draws a line that reads as a reversal of ADR-0302 D1 unless it is stated: the committed corpus
 * mirror ADR-0302 deleted drifted from the live store and was then read INSTEAD of it by generators
 * that reported "in sync" while reverting live edits. A RUNTIME cache cannot enter that path. It is
 * never committed, never authoritative, never written back, always stamped, and it dies with the
 * process. This one holds exactly one entry: the last hierarchy the live store actually served.
 *
 * It exists because the alternative degradations are both worse. A blank forest when the store blinks
 * is the "amber discloses and never blocks" rule (ADR-0445 D5) broken outright; and falling straight
 * back to the app's own frozen `stories/**` copy is precisely the fault this increment closes,
 * re-entered through the back door.
 */
export class HierarchyRuntimeCache {
  #entry: { read: DesktopTreeRead; stamp: DesktopHierarchySelection["stamp"] } | null = null;

  /** Store a LIVE read. Only ever called with something the store itself just answered. */
  put(read: DesktopTreeRead, stamp: DesktopHierarchySelection["stamp"]): void {
    this.#entry = { read, stamp };
  }

  /**
   * The cached read, deep-copied.
   *
   * The copy is load-bearing rather than tidy: `foldVerdicts` mutates the stories it is handed, so
   * serving the stored object directly would let one request's verdict overlay persist into the next
   * and accumulate — a cache that answers with yesterday's proof state while claiming to be a copy of
   * the hierarchy alone.
   */
  get(): { read: DesktopTreeRead; stamp: DesktopHierarchySelection["stamp"] } | null {
    if (this.#entry === null) return null;
    const { read, stamp } = this.#entry;
    return {
      read: {
        stories: structuredClone(read.stories),
        uatTestCriteriaByStory: new Map(
          [...read.uatTestCriteriaByStory].map(([id, o]) => [id, structuredClone([...o])]),
        ),
        uatCriteriaByStory: new Map(
          [...read.uatCriteriaByStory].map(([id, c]) => [id, structuredClone([...c])]),
        ),
        coverageByStory: new Map(
          [...read.coverageByStory].map(([id, g]) => [id, structuredClone([...g])]),
        ),
      },
      stamp,
    };
  }

  /** Test seam. */
  clear(): void {
    this.#entry = null;
  }
}

/**
 * Pick the desktop's hierarchy source: live, then the runtime cache, then disk.
 *
 * **Disk is LAST and it is announced.** For the studio, whose disk sits beside the store it talks to,
 * a disk read is a mild degradation. For the installed desktop app it is the incident itself — the
 * frozen copy is exactly what painted `agent` yellow for eleven days. So it is reachable, because a
 * cold boot against a down store must still draw a forest rather than nothing (ADR-0445 D5), and it
 * can only be reached through a branch that states why.
 */
export async function selectDesktopHierarchy(source: {
  readonly live?: (() => Promise<WorkHierarchySnapshot | null>) | undefined;
  readonly fold: FoldFn;
  readonly cache: HierarchyRuntimeCache;
  readonly disk: () => Promise<DesktopTreeRead>;
}): Promise<DesktopHierarchySelection> {
  const degrade = async (because: string): Promise<DesktopHierarchySelection> => {
    const cached = source.cache.get();
    if (cached !== null) {
      return cached.stamp === undefined
        ? { origin: "cache", read: cached.read, degradedBecause: because }
        : {
            origin: "cache",
            read: cached.read,
            stamp: cached.stamp,
            degradedBecause: because,
          };
    }
    return { origin: "disk", read: await source.disk(), degradedBecause: because };
  };

  if (source.live === undefined) {
    return degrade("this backend serves no work-hierarchy projection");
  }

  let raw: WorkHierarchySnapshot | null;
  try {
    raw = await source.live();
  } catch (err) {
    return degrade(
      `the live projection threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (raw === null) {
    return degrade("the live store holds no work-hierarchy projection yet");
  }

  const snapshot = raw;
  let read: DesktopTreeRead;
  try {
    read = toDesktopTree(source.fold(snapshot));
  } catch (err) {
    // A snapshot the fold cannot read is a SHAPE disagreement — a store written by a newer schema
    // than this app understands. Degrading is right; pretending it parsed is not.
    return degrade(
      `the live projection did not fold: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const stamp = {
    commitSha: snapshot.commitSha,
    storiesTreeSha: snapshot.storiesTreeSha,
    generatedAt: snapshot.generatedAt,
  };
  source.cache.put(read, stamp);
  // Re-read through the cache so the caller's copy is its own — `foldVerdicts` mutates what it gets.
  const stored = source.cache.get();
  return { origin: "live", read: stored === null ? read : stored.read, stamp };
}

/**
 * The one line a degraded read prints, at most once per distinct reason.
 *
 * Rate-limited by reason rather than by time, because `/api/tree` is polled: a line on every poll is
 * a line the operator filters, which is how a loud signal becomes a silent one. A NEW reason always
 * prints, because that is the part worth seeing.
 */
const announced = new Set<string>();

export function announceDesktopHierarchyOrigin(
  selection: DesktopHierarchySelection,
  log: (message: string) => void = console.warn,
): void {
  if (selection.origin === "live") return;
  const reason = selection.degradedBecause ?? "unknown";
  const key = `${selection.origin}:${reason}`;
  if (announced.has(key)) return;
  announced.add(key);
  const consequence =
    selection.origin === "cache"
      ? "serving the last hierarchy the store gave us; newly authored work will be missing"
      : "serving this build's own frozen copy, so criteria re-worded since it was built will show as unproven (ADR-0445 D1)";
  log(`[tree] work hierarchy is not live — ${reason}. ${consequence}.`);
}

/** Test seam: forget what has been announced, so each case starts from silence. */
export function resetDesktopHierarchyAnnouncements(): void {
  announced.clear();
}
