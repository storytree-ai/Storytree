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
//
// ⚠ THE ARC LAYER IS THE SAME EXPORT, NOT A SECOND JOIN (ADR-0453 D12 read with D7). ROAM's fifth
// target — the arc drawer, the initiative layer above the code — needs an arc in the published file,
// and D12's closing line puts the arc surface behind the SAME export fence as the forest. So the arc
// tier arrives from `deriveArcRollup` in @storytree/arc — the one join `storytree arc show` and the
// studio's `/api/arcs` already read — narrowed here by an allow-list, never recomputed. See
// {@link ForestSnapshotArc} for what D12 ships and, more importantly, what it does not.

import type { ArcRollup } from '@storytree/arc';
import { isForwardLooking } from '@storytree/arc';

import type { TreePayload, TreeStory, WorkStatus } from '../src/types';

import { presentStories } from '../src/lib/worldStatus';

/**
 * Bumped when the shape below changes in a way a published snapshot's reader must notice.
 *
 * ⚠ THE WEBSITE PINS THIS EXACTLY (`SUPPORTED_SCHEMA_VERSION` in `web/src/scripts/
 * forest-snapshot-map.ts`) and refuses a mismatch at BUILD time. That is the seam, and it is
 * deliberate: the two repos cannot silently disagree about what a published file means. It also
 * means a version bump here and the website's half must land in the SAME shift — a publish taken
 * between the two reds the web build rather than deploying a half-read map, which is the correct
 * failure but still a failure somebody has to notice.
 *
 * 2 — the arc layer (ADR-0453 D12).
 */
export const FOREST_SNAPSHOT_SCHEMA_VERSION = 2;

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

/**
 * HOW ONE STORY REACHES ONE ARC — the edge, carried WITH its provenance.
 *
 * ⚠ `via` IS THE DECISION, NOT A DETAIL. There are two edges between an arc and a story and
 * ADR-0306 D4 says outright that **no surface may silently merge them**: the frontmatter stamp
 * (`stories/<id>/story.md` → `arc:`) says *this arc PRODUCED this story* and is a disk scan of
 * whichever checkout ran the export, while an increment's `story:` citation says *an increment of
 * this arc TOUCHED this story* and is store-resident and identical everywhere. The drawer wants one
 * list, so the union is taken ONCE, here, and the provenance is published beside it rather than
 * thrown away — which is what makes this a stated merge rather than a silent one.
 */
export interface ForestSnapshotStoryArc {
  /** The arc's id — a key into {@link ForestSnapshot.arcs}, never a duplicated arc record. */
  readonly id: string;
  /** Which edge(s) produced this link. See the type doc — this is ADR-0306 D4, not bookkeeping. */
  readonly via: 'stamped' | 'cited' | 'both';
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
  /**
   * The arcs that reach this story, id-sorted.
   *
   * ⚠ ALWAYS PRESENT, EMPTY WHEN NONE — deliberately unlike `building`, which is omitted when false.
   * An empty array says *we looked and nothing reaches this story*; an absent key would be
   * indistinguishable from a snapshot written before the arc layer existed. Measured 2026-08-28,
   * 32 of the 35 live stories are reachable and three (`ci-cd`, `feedback-graduation`,
   * `terminal-repo-picker`) are not — so the empty case is a real, designed state the drawer has to
   * render, not an edge case.
   */
  readonly arcs: readonly ForestSnapshotStoryArc[];
}

/** A decision attached to an arc — number, status and title, which is the whole of what D12 ships. */
export interface ForestSnapshotArcAdr {
  readonly number: number;
  readonly status: string;
  readonly title: string;
}

/**
 * ONE ARC AT TITLE-AND-SHAPE DEPTH (ADR-0453 D12) — the initiative layer above the code.
 *
 * ⚠⚠ THE ABSENT BODIES ARE THE ONLY PROTECTION HERE, AND THAT IS THIS TYPE'S WHOLE POINT. The forest
 * is safe to publish because it is ILLEGIBLE BY CONSTRUCTION (ADR-0453 D3) — a story id tells a
 * stranger nothing, and the visitor projects their own project onto the shape. **Arc prose is
 * readable English about strategy**, so D3's argument does not carry one tier up. What keeps this
 * surface publishable is that the prose is not in it.
 *
 * SHIPS: id, title, lifecycle, the increment counts, and that decisions are attached.
 * DOES NOT SHIP: the arc's `description` (a one-liner derived from `intent`), `intent`, `endState`,
 * every increment `objective` and `outcome.note`, and every question `stakes` — the whole of
 * `ArcRollup`'s prose. It is all sitting right there in the rollup looking like an oversight; a
 * session that "completes" this type by adding it has removed the sole protection.
 *
 * `waiting` is also absent, for a different reason: it reports whether the arc has an open question
 * RIGHT NOW, and this file is a picture of a stated moment. Publishing live-sounding state is the
 * error the wisp layer is kept out for (D5), one tier up.
 */
export interface ForestSnapshotArc {
  readonly id: string;
  readonly title: string;
  /** `active` | `parked` | `closed` — the arc's own stored lifecycle, not a derivation. */
  readonly lifecycle: ArcRollup['lifecycle'];
  /**
   * Increments whose status is `closed`.
   *
   * ⚠ NAMED `closed`, NOT `landed`, AND THE DIFFERENCE IS REAL. ADR-0453 D12 words this "increments
   * landed vs open", but an increment also closes with a `--note` and no PR when it drifted, was
   * re-planned, or turned out wrong — a closure that is not a landing. This field counts what the
   * corpus actually records; a field called `landed` would over-claim on every such row, on the page
   * whose entire pitch is `signals-must-be-real`.
   */
  readonly incrementsClosed: number;
  /** Increments still forward-looking — `proposal` | `ready` | `active` (`isForwardLooking`). */
  readonly incrementsOpen: number;
  /** Decisions stamped to this arc, number-sorted. */
  readonly adrs: readonly ForestSnapshotArcAdr[];
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
  /**
   * Every arc reachable from at least one story above, id-sorted — NORMALISED, so a story names an
   * arc by id and the record appears once.
   *
   * Normalised rather than inlined per story because the shape of this corpus makes that the
   * difference between a small file and a silly one: measured 2026-08-28, most of the 32 reachable
   * stories arrive through two large hub arcs, so inlining would repeat those records ~28 times in a
   * file that is inlined into the page at build time.
   *
   * An arc that reaches NO story in this snapshot is not published. The drawer is opened from an
   * island, so an unreachable arc has no way in — and shipping it would put initiative titles about
   * non-forest work on the public page for no reader at all.
   */
  readonly arcs: readonly ForestSnapshotArc[];
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

function toStory(story: TreeStory, arcs: readonly ForestSnapshotStoryArc[]): ForestSnapshotStory {
  const out: ForestSnapshotStory = {
    id: story.id,
    title: story.title,
    status: story.status,
    dependsOn: [...story.dependsOn].sort(),
    capabilities: story.capabilities
      .map(toCapability)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    arcs,
  };
  // `exactOptionalPropertyTypes`: only present when true, so the published JSON stays minimal and a
  // story that is not a building carries no key at all.
  return story.building === true ? { ...out, building: true } : out;
}

/** The arc tier, narrowed to {@link ForestSnapshotArc}'s allow-list. NAMED FIELD BY FIELD, never spread. */
function toArc(rollup: ArcRollup): ForestSnapshotArc {
  return {
    id: rollup.id,
    title: rollup.title,
    lifecycle: rollup.lifecycle,
    incrementsClosed: rollup.increments.filter((i) => !isForwardLooking(i.status)).length,
    incrementsOpen: rollup.increments.filter((i) => isForwardLooking(i.status)).length,
    adrs: rollup.adrs
      .map((a) => ({ number: a.number, status: String(a.status), title: a.title }))
      .sort((a, b) => a.number - b.number),
  };
}

/** Both halves of {@link joinArcs}: the per-story edges, and the arcs those edges actually reach. */
export interface ForestSnapshotArcJoin {
  /** Keyed by story id; absent from the map is the same fact as an empty list. */
  readonly byStory: ReadonlyMap<string, ForestSnapshotStoryArc[]>;
  /** Id-sorted, and narrowed to what {@link ForestSnapshotArc} allows. */
  readonly arcs: readonly ForestSnapshotArc[];
}

/**
 * PURE: join the arc tier onto a set of story ids, and report both halves.
 *
 * The `storyIds` set is the snapshot's OWN story list, so an arc edge naming a story the
 * presentation fold pruned (a retired one) simply does not join — which is the honest answer, not a
 * dropped edge.
 */
export function joinArcs(
  rollups: readonly ArcRollup[],
  storyIds: ReadonlySet<string>,
): ForestSnapshotArcJoin {
  const byStory = new Map<string, ForestSnapshotStoryArc[]>();
  const reached = new Set<string>();
  const note = (storyId: string, arcId: string, edge: 'stamped' | 'cited'): void => {
    if (!storyIds.has(storyId)) return;
    reached.add(arcId);
    const list = byStory.get(storyId) ?? [];
    const existing = list.find((e) => e.id === arcId);
    if (existing === undefined) list.push({ id: arcId, via: edge });
    else if (existing.via !== edge) list[list.indexOf(existing)] = { id: arcId, via: 'both' };
    byStory.set(storyId, list);
  };
  for (const rollup of rollups) {
    for (const storyId of rollup.stories) note(storyId, rollup.id, 'stamped');
    // `present` is the CITING checkout's report about its own tree; the join above already answers
    // the same question against this snapshot's story list, so the flag adds nothing here.
    for (const cited of rollup.citedStories) note(cited.id, rollup.id, 'cited');
  }
  for (const list of byStory.values()) list.sort((a, b) => a.id.localeCompare(b.id));
  return {
    byStory,
    arcs: rollups
      .filter((r) => reached.has(r.id))
      .map(toArc)
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * Fold one `/api/tree` payload into the published snapshot.
 *
 * `generatedAt` is INJECTED rather than read from the clock here so the fold is pure and the tests
 * can pin it — the shell stamps the real moment.
 *
 * Stories and capabilities are sorted by id so a nightly re-run whose corpus did not move produces a
 * byte-identical file, and the diff a refresh does produce is the change itself.
 *
 * `arcRollups` is REQUIRED, not optional, and that is deliberate. An optional argument would let a
 * caller that forgot it publish a forest whose every island reports "no initiative reaches this" —
 * an absence manufactured out of a missing wire rather than read from the corpus, which is the exact
 * falsified-absence error `ArcRollupInput.workUnits` documents one package over. Pass `[]` to mean
 * it, and the fold will say so.
 */
export function toForestSnapshot(
  payload: TreePayload,
  generatedAt: string,
  arcRollups: readonly ArcRollup[],
): ForestSnapshot {
  const presented = presentStories(payload.stories);
  const joined = joinArcs(arcRollups, new Set(presented.map((s) => s.id)));
  const stories = presented
    .map((s) => toStory(s, joined.byStory.get(s.id) ?? []))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schemaVersion: FOREST_SNAPSHOT_SCHEMA_VERSION,
    generatedAt,
    source: FOREST_SNAPSHOT_SOURCE,
    storyCount: stories.length,
    provenStoryCount: stories.filter((s) => s.status === PROVEN).length,
    capabilityCount: stories.reduce((n, s) => n + s.capabilities.length, 0),
    stories,
    arcs: joined.arcs,
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
