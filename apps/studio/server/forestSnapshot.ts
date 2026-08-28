// forestSnapshot.ts — the PUBLIC website's forest, as of a stated moment (ADR-0453 D5/D7).
//
// The public site is a static Astro build with no database access BY DESIGN, so the only honest way
// for it to show the real corpus is a snapshot published by a job. This module is the pure fold that
// turns the studio's own map read into that snapshot; the shell that runs it and writes the file is
// `forestSnapshotCli.ts`.
//
// ⚠ THIS IS NOT A RETURN OF THE COMMITTED CORPUS MIRROR ADR-0302 D1 DELETED. That file mirrored a
// canonical database FOR READERS WHO COULD REACH THE DATABASE, and was policed by check rungs that
// compared the two. The public website cannot reach the database, which is the whole distinction —
// and it follows that NO `check:*` rung may ever compare the live corpus to a published snapshot.
// A stale snapshot is not a defect here; it is the thing itself, which is why it carries a stamp.
//
// ⚠ AN EXPORT OF AN EXISTING READER'S OUTPUT, NEVER A NEW COMPUTATION OVER THE STORE (ADR-0453 D7).
// Two folds, both borrowed, neither re-implemented:
//   1. `buildTreePayload` (apiRouter.ts) — the same read `/api/tree` serves, verdict enrichment and
//      UAT crowns included. Authored `status` is uniform in this corpus (measured 2026-08-26: every
//      live story reads `proposed`), so exporting it alone would render identical grey islands. The
//      green is COMPUTED there from signed verdicts.
//   2. `presentStories` (../src/lib/worldStatus) — the same presentation fold the studio's own map
//      applies before layout: retired pruned, `building` folded into `proposed`, proof folded into
//      the hue. The site therefore wears the SAME status the studio does, by construction.
// A website that folded the store itself would be a THIRD reader, drifting invisibly from the studio
// and the CLI — which has already happened once between the two readers that exist.
//
// ⚠ THE FIELD LIST IS AN ALLOW-LIST, NEVER A DENY-LIST. A deny-list is correct exactly once — the
// day it is written — and then silently leaks the next field somebody adds to `TreeStory`. Every
// field below is named. What is deliberately absent, and why:
//   - `payload.builds` — the IN-FLIGHT WISP layer. Wisps are OUT (ADR-0453 D5): a wisp renders a
//     session working RIGHT NOW, and in an async snapshot that shows last night's sessions as live —
//     a description of the system rather than a reading from it, on the page that asserts signals
//     are real.
//   - `payload.sessions` / `payload.claims` — the same objection, and both are already retired.
//   - `verdict` — its outcome is already folded into `status`; the timestamp is a proof-tier detail
//     below the public depth floor (ADR-0453 D6).
//   - `drift`, `uatCriteria`, `testCount`, `proofMode`, `uatWitness`, `outcome`, `consumedBy`,
//     `decisions`, `error` — proof-tier and authoring-tier detail below the same floor.
// `building` IS carried: it is a static render hint (ADR-0076 — this story draws as a building, not
// an island), not a signal that anything is building right now, and dropping it would make the
// public map's SHAPE differ from the studio's.

import type { TreePayload, TreeStory, WorkStatus } from '../src/types';

import { presentStories } from '../src/lib/worldStatus';

/** Bumped when the shape below changes in a way a published snapshot's reader must notice. */
export const FOREST_SNAPSHOT_SCHEMA_VERSION = 1;

/** Names the fold this snapshot is an export of — so a reader of the file can find its authority. */
export const FOREST_SNAPSHOT_SOURCE = 'studio /api/tree + presentStories (ADR-0453 D7)';

/** One capability limb, at the public depth floor (ADR-0453 D6: the capability tree, and it stops). */
export interface ForestSnapshotCapability {
  readonly id: string;
  readonly title: string;
  /** The PRESENTED status — proof already folded in. `null` when the spec failed to load. */
  readonly status: WorkStatus | null;
  /** Sibling capability ids this one depends on. */
  readonly dependsOn: readonly string[];
}

/** One island. */
export interface ForestSnapshotStory {
  readonly id: string;
  readonly title: string;
  /** The PRESENTED status — proof already folded in (ADR-0040: green comes from signed verdicts). */
  readonly status: WorkStatus | null;
  /** Story ids this story depends on — the forest's roads. */
  readonly dependsOn: readonly string[];
  /** Static render hint (ADR-0076): draw as a building rather than an island. Absent = an island. */
  readonly building?: boolean;
  readonly capabilities: readonly ForestSnapshotCapability[];
}

/**
 * The published artifact. `generatedAt` is LOAD-BEARING, not metadata: the rendered map must say what
 * moment it is a picture of, and a snapshot that presents itself as live is the single way this
 * backfires.
 */
export interface ForestSnapshot {
  readonly schemaVersion: number;
  /** ISO-8601 UTC. THE STAMP — the page renders this. */
  readonly generatedAt: string;
  readonly source: string;
  readonly storyCount: number;
  /** How many of `storyCount` wear the proven hue — the "20 of 35" the pitch can honestly claim. */
  readonly provenStoryCount: number;
  readonly capabilityCount: number;
  readonly stories: readonly ForestSnapshotStory[];
}

/** The presented status that means "proven" — the one green source (ADR-0040). */
const PROVEN: WorkStatus = 'healthy';

function toCapability(cap: {
  id: string;
  title: string;
  status: WorkStatus | null;
  dependsOn: string[];
}): ForestSnapshotCapability {
  return {
    id: cap.id,
    title: cap.title,
    status: cap.status,
    dependsOn: [...cap.dependsOn].sort(),
  };
}

function toStory(story: TreeStory): ForestSnapshotStory {
  const out: ForestSnapshotStory = {
    id: story.id,
    title: story.title,
    status: story.status,
    dependsOn: [...story.dependsOn].sort(),
    capabilities: story.capabilities
      .map(toCapability)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
  // `exactOptionalPropertyTypes`: only present when true, so the published JSON stays minimal and a
  // story that is not a building carries no key at all.
  return story.building === true ? { ...out, building: true } : out;
}

/**
 * Fold one `/api/tree` payload into the published snapshot.
 *
 * `generatedAt` is INJECTED rather than read from the clock here so the fold is pure and the tests
 * can pin it — the shell stamps the real moment.
 *
 * Stories and capabilities are sorted by id so a nightly re-run whose corpus did not move produces a
 * byte-identical file, and the diff a refresh does produce is the change itself.
 */
export function toForestSnapshot(payload: TreePayload, generatedAt: string): ForestSnapshot {
  const presented = presentStories(payload.stories);
  const stories = presented
    .map(toStory)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schemaVersion: FOREST_SNAPSHOT_SCHEMA_VERSION,
    generatedAt,
    source: FOREST_SNAPSHOT_SOURCE,
    storyCount: stories.length,
    provenStoryCount: stories.filter((s) => s.status === PROVEN).length,
    capabilityCount: stories.reduce((n, s) => n + s.capabilities.length, 0),
    stories,
  };
}

/** Serialise for publication — trailing newline, stable key order (the interface's own order). */
export function serialiseForestSnapshot(snapshot: ForestSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

/**
 * The refusal, or `null` when the snapshot is publishable — the fail-closed guard the shell exits on.
 *
 * ⚠ READ THIS BEFORE RELAXING IT. When the live store cannot answer, the studio's presentation fold
 * does not error — it falls back to the AUTHORED status ladder and the world UNDER-CLAIMS (see
 * `../src/lib/worldStatus`, "Offline (DB down, verdicts absent)…"). Authored status is uniform in
 * this corpus — measured 2026-08-26, every live story reads `proposed` — so the under-claiming
 * snapshot is not a partial reading: it is 35 identical grey islands, a forest with no information
 * at all, published to the one page that asserts its signals are real. There is no override flag. A
 * corpus with genuinely zero proven stories is a state this repo has never been in, and if it ever
 * is, the right response is a decision, not a `--force`.
 */
export function unpublishableReason(snapshot: ForestSnapshot): string | null {
  if (snapshot.storyCount === 0) {
    return 'the fold returned NO stories — the store answered nothing, or the corpus is empty.';
  }
  if (snapshot.provenStoryCount === 0) {
    return (
      `the fold returned ${snapshot.storyCount} stories and NOT ONE of them is proven.\n` +
      '  That is what an absent proof layer looks like, not what this corpus looks like: the studio\n' +
      '  falls back to the authored status ladder when the live store cannot answer, and every live\n' +
      "  story in this corpus is authored `proposed`. Publishing it would put a forest with no\n" +
      '  information on the public site.\n' +
      '  → bring the store up (`pnpm db:up`) and re-run, or check STORYTREE_DB_USER.'
    );
  }
  return null;
}
