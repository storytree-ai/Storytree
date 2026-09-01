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
//     below the public depth floor.
//   - `drift`, `testCount`, `proofMode`, `uatWitness`, `outcome`, `consumedBy`, `error` — proof-tier
//     and authoring-tier detail below the same floor.
// `building` IS carried: it is a static render hint (ADR-0076 — this story draws as a building, not
// an island), not a signal that anything is building right now, and dropping it would make the
// public map's SHAPE differ from the studio's.
//
// ⚠ THE FLOOR MOVED ON 2026-09-01 (ADR-0494 D1/D2), AND `uatCriteria` / `decisions` LEFT THE LIST
// ABOVE BECAUSE OF IT — they are not an oversight and they are not drift. The owner walked the built
// site and ruled the depth too strict: *"it should show the capability tree and our uat tests, give
// them the lot, they can see adrs and other things is not line they can read them."* So the floor is
// no longer the capability tree. It is the story's UAT PROOF, with decision records reachable at
// TITLE-AND-IDENTITY depth — {@link ForestSnapshotUatCriterion} and {@link ForestSnapshotAdr} are
// exactly those two tiers and no deeper. What stays past the floor is unchanged (D3): the CODE, and
// the full library — an ADR's body, a criterion's detail artifact, a capability's contracts.
//
// ⚠ AND THE MECHANISM IS UNCHANGED: this widened THROUGH the allow-list, never around it. Every
// field below is still named one at a time and `forestSnapshot.test.ts` still fails on a key nobody
// classified. ADR-0494 D4 says that in as many words — widening the list is the mechanism, and
// bypassing it (or reaching for a runtime fetch to get depth the snapshot lacks) is refused.
//
// ⚠ THE ARC LAYER IS THE SAME EXPORT, NOT A SECOND JOIN (ADR-0453 D12 read with D7). ROAM's fifth
// target — the arc drawer, the initiative layer above the code — needs an arc in the published file,
// and D12's closing line puts the arc surface behind the SAME export fence as the forest. So the arc
// tier arrives from `deriveArcRollup` in @storytree/arc — the one join `storytree arc show` and the
// studio's `/api/arcs` already read — narrowed here by an allow-list, never recomputed. See
// {@link ForestSnapshotArc} for what D12 ships and, more importantly, what it does not.
//
// ⚠ THE UAT TIER JOINS A BORROWED READING TO AUTHORED TEXT, AND THE SPLIT IS THE WHOLE POINT. A UAT
// leg's STATE — proven / pending / failing — arrives on `TreeStory.uatCriteria`, folded by
// `applyUatCriteria` from the SAME signed-verdict source the crown and the attestations route read.
// Nothing here recomputes it, so this cannot become a third proof reader (see the fence two
// paragraphs up). What the tree read does NOT carry is the leg's authored TITLE, so that arrives as
// data from the shell, parsed out of the story spec by the corpus's own `parseUatTestCriteria`. A
// title is prose somebody wrote; it can make a panel read badly, and it cannot make an island green.

import type { ArcRollup } from '@storytree/arc';
import { isForwardLooking } from '@storytree/arc';

import type { TreePayload, TreeStory, UatCriterionSummary, WorkStatus } from '../src/types';

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
 * 3 — the depth floor moves to the UAT proof, and decision records become reachable (ADR-0494
 *     D1/D2). Decisions are NORMALISED into {@link ForestSnapshot.decisions} in the same bump, so
 *     `ForestSnapshotArc.adrs` changed from inline records to numbers — a reader pinned to 2 would
 *     have rendered `undefined` down the arc drawer's decision list, which is exactly the half-read
 *     map the pin exists to refuse.
 */
export const FOREST_SNAPSHOT_SCHEMA_VERSION = 3;

/** Names the fold this snapshot is an export of — so a reader of the file can find its authority. */
export const FOREST_SNAPSHOT_SOURCE = 'studio /api/tree + presentStories (ADR-0453 D7)';

/**
 * ONE UAT LEG — the story's own acceptance journey, one step of it (ADR-0494 D1).
 *
 * This is the tier that makes the page's claim CHECKABLE instead of asserted. Everything above it
 * says "21 of 35 are proven"; this says what the proving actually consisted of, in the words the
 * story's author wrote, with the verdict the spine signed against each step.
 *
 * ⚠ THE TITLE IS THE ONE-LINE LEAD, NEVER THE LEG'S BODY. A story's `## UAT Test Criteria` section
 * is long-form prose — witness re-adjudications, burned ordinals, the reasoning behind each split —
 * and `parseUatTestCriteria` already separates the authored one-line title from all of it. That
 * separation is what makes this affordable: ADR-0494's payload clause says the remedy for bulk is a
 * NARROWER allow-listed projection of the UAT, not a runtime fetch, and this is that projection.
 * Measured 2026-09-01 across the 35 published stories: 104 witnessable legs, 73 characters of title
 * and identity each.
 *
 * ⚠⚠ `signable` IS WHAT STOPS THIS PANEL CONTRADICTING THE ISLAND ABOVE IT, and it was found by
 * measurement rather than reasoned about. ADR-0443 D2 drops UNSIGNABLE legs from a story's crown
 * obligations — a `machine` leg deliberately authored with no gate to prove it, which no adopt pass
 * can ever sign — so a story is legitimately GREEN while such a leg carries no verdict. Measured
 * 2026-09-01 on the published corpus: 26 legs across 9 stories, and FIVE of those stories are green
 * with NOT ONE of their listed legs signed (`website-experience` has eight). Publishing state alone
 * would have put "8 acceptance tests, 0 proven" under a green island, on the page whose whole pitch
 * is that its signals are real — a page appearing to contradict itself is worse than either fact.
 *
 * ⚠ AND SAYING SO IS THE CORPUS'S OWN RULE, not a decision taken here. `unsignableUatCriteria`
 * exists in `@storytree/library` precisely "so a surface can SAY SO rather than silently shrinking
 * the checklist" (ADR-0416 D2, *"silence is not acceptable"*), and ADR-0443's honesty rests on the
 * gap staying "visible in each step's own text". Dropping the leg, or reporting it as merely
 * not-yet-proven, is the silence both forbid.
 *
 * ⚠ `state` IS BORROWED, `title`, `witness` AND `signable` ARE READ. See the module header — the
 * split is what keeps this from becoming a second reader of proof.
 *
 * ⚠ THE CRITERION ID IS NOT PUBLISHED, and it was dropped on measurement rather than on taste. It
 * is a 24-character random hash (`uatc_027e3e8ad2253d327fc15c07`); it renders on no panel line, a
 * stranger can do nothing with it, and being random it is the one field here gzip cannot compress —
 * 1.9 KB of the tier's 4.5 KB. Dropping it IS the "narrower allow-listed projection" ADR-0494's
 * payload clause names as the remedy for bulk. It still does its one job at fold time: an
 * unresolved leg falls back to it AS THE TITLE, so the degradation stays visible.
 */
export interface ForestSnapshotUatCriterion {
  /** The authored one-line title of this leg — what the journey step IS. */
  readonly title: string;
  /** The reading of this leg's own signed verdict, folded by `applyUatCriteria`. */
  readonly state: UatCriterionSummary['state'];
  /** Who witnesses it — a harness the spine owns (`machine`), a person (`human`), or either. */
  readonly witness: 'human' | 'machine' | 'either';
  /**
   * Whether anything CAN sign this step as authored (`isSignableUatCriterion`, ADR-0443 D2).
   *
   * `false` is a real, authored state and not a defect: the journey step is genuine and nothing
   * the proof spine owns reaches it yet, so it is recorded, rendered, and deliberately does not
   * hold the story's green. A surface must distinguish it from "nobody has got round to proving
   * this" — see the type doc for the five green islands that depend on it.
   */
  readonly signable: boolean;
}

/**
 * ONE DECISION AT TITLE-AND-IDENTITY DEPTH (ADR-0494 D2) — number, status, title, and nothing else.
 *
 * ⚠ THE BODY IS PAST THE FLOOR AND STAYS THERE (D3). The owner priced this exposure explicitly —
 * *"they can see adrs and other things is not line they can read them, even if they read one or two
 * its not a big issue"* — and what he priced was a stranger reading a decision's NAME. The bodies
 * are architectural reasoning about a private system; they are what the app opens, and a field
 * added here would be a different decision than the one that was made.
 *
 * Used by BOTH tiers: a story's `decisions` and an arc's `adrs` are number arrays into
 * {@link ForestSnapshot.decisions}, so one decision has one record in the published file however
 * many things reach it.
 */
export interface ForestSnapshotAdr {
  readonly number: number;
  readonly status: string;
  readonly title: string;
}

/** One capability limb (ADR-0453 D6's tier — no longer the floor itself, see the module header). */
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
   * The story's own acceptance journey, IN AUTHORED ORDER (ADR-0494 D1).
   *
   * ⚠ NOT SORTED, unlike every other list in this file, and that is deliberate. A UAT is a JOURNEY
   * — launch, then sign in, then the loop runs, then it blooms — and its ordinals are that order.
   * Sorting by id would also scramble it outright, since `story#uat-10` sorts before `story#uat-2`.
   * The re-run stability the other sorts buy is already free here: the authored order is stable.
   *
   * ⚠ ALWAYS PRESENT, EMPTY WHEN NONE — the same rule as {@link arcs}. Measured 2026-09-01, 11 of
   * the 35 published stories carry no witnessable leg, so the empty case is a real designed state a
   * surface must SAY rather than a gap it may leave silent.
   */
  readonly uat: readonly ForestSnapshotUatCriterion[];
  /**
   * The deciding ADR numbers this story declares (`decisions:` frontmatter) — keys into
   * {@link ForestSnapshot.decisions}, never duplicated records. Number-sorted and de-duplicated.
   *
   * A number naming no decision row is DROPPED rather than published as a titleless line. The
   * corpus has its own rung for a dangling citation (`check:adr-health`); a public export inventing
   * `ADR-0999 — (unknown)` would be publishing a defect, and inventing a title for it would be
   * worse.
   */
  readonly decisions: readonly number[];
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
  /**
   * Decisions stamped to this arc — NUMBERS into {@link ForestSnapshot.decisions}, number-sorted.
   *
   * ⚠ THESE WERE INLINE RECORDS UNTIL SCHEMA 3. They were normalised when stories acquired decision
   * lists of their own (ADR-0494 D2): the two tiers reach overlapping sets, and a decision that has
   * one record in the file cannot be described two different ways in it.
   */
  readonly adrs: readonly number[];
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
  /**
   * Every decision reached by a story or an arc above, number-sorted — NORMALISED, exactly as
   * {@link arcs} is, and for a sharper version of the same reason.
   *
   * Measured 2026-09-01 on the published corpus: the 35 stories declare 211 decision citations over
   * 117 distinct decisions, so inlining would repeat the busiest records dozens of times in a file
   * that is read into the page at build. The arc tier's 91 stamps are one-to-one and would not have
   * forced this on their own; the story tier does.
   *
   * A decision NOTHING reaches is not published. There is no way into it from the map, and shipping
   * the whole decision log would be a different decision than ADR-0494 D2's — which is reachability
   * from a thing on the page, not a public archive.
   */
  readonly decisions: readonly ForestSnapshotAdr[];
}

/** A UAT leg's AUTHORED half, as the shell parses it out of the story spec. See the module header
 *  for why the authored half and the proof half arrive by different routes. Signability belongs
 *  here rather than beside the state: it is a property of how the leg was WRITTEN — whether it
 *  names a gate — and never of whether anyone has proved it. */
export interface AuthoredUatCriterion {
  readonly title: string;
  readonly witness: 'human' | 'machine' | 'either';
  readonly signable: boolean;
}

/**
 * What the fold needs BESIDES the tree read — every field loaded by the shell and joined here.
 *
 * ⚠ ALL THREE ARE REQUIRED, and none of them is optional-with-a-default. An optional argument would
 * let a caller that forgot one publish a forest whose every island reports "no initiative reaches
 * this" / "no acceptance test recorded" / "no decision behind this" — an absence manufactured out of
 * a missing wire rather than read from the corpus. Pass an empty one to MEAN it, and the fold will
 * say so; that is the same rule `arcRollups` carried when it was the only one.
 */
export interface ForestSnapshotSources {
  /** Every arc's rollup — `loadArcRollups`, the join `arc show` and `/api/arcs` already read. */
  readonly arcRollups: readonly ArcRollup[];
  /** The AUTHORED half of every UAT leg, keyed by criterion id. */
  readonly uatCriteria: ReadonlyMap<string, AuthoredUatCriterion>;
  /** The decision log, keyed by number — `loadTitledAdrMetasFromStore`, narrowed on the way in. */
  readonly decisions: ReadonlyMap<number, ForestSnapshotAdr>;
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

/**
 * One story's UAT legs, joining the borrowed STATE to the authored TITLE.
 *
 * The membership and the state are `story.uatCriteria`'s — the tree read is the authority on which
 * legs are witnessable and what each one's signed verdict says. A leg whose title the spec walk did
 * not produce falls back to its own ID rather than being dropped or blanked: the two readers walk
 * the same `stories/` tree, so a miss means they disagreed, and a leg that vanishes from the panel
 * is the one failure mode a reader cannot see. The id is a real fact about the leg, which is the
 * same reason `edgeName` one repo over falls back to an id rather than truncating a title.
 */
function toUat(
  story: TreeStory,
  authored: ReadonlyMap<string, AuthoredUatCriterion>,
): ForestSnapshotUatCriterion[] {
  return (story.uatCriteria ?? []).map((c): ForestSnapshotUatCriterion => {
    const text = authored.get(c.id);
    return {
      title: text?.title ?? c.id,
      state: c.state,
      // `either` is the parser's OWN default for an untagged leg, so an unresolved leg reads as the
      // weakest true claim rather than as a person or a harness we cannot show signed it.
      witness: text?.witness ?? 'either',
      // An unresolved leg defaults to SIGNABLE — the majority shape (78 of 104 measured), and the
      // one that claims nothing extra: it reads as "not yet proven", never as an authored gap the
      // spec may not actually declare.
      signable: text?.signable ?? true,
    };
  });
}

/** The story's declared decision numbers, de-duplicated, number-sorted, and narrowed to the ones
 *  that name a real row. See {@link ForestSnapshotStory.decisions} for why a dangling one is
 *  dropped rather than published. */
function toDecisionNumbers(
  story: TreeStory,
  log: ReadonlyMap<number, ForestSnapshotAdr>,
): number[] {
  return [...new Set(story.decisions ?? [])].filter((n) => log.has(n)).sort((a, b) => a - b);
}

function toStory(
  story: TreeStory,
  arcs: readonly ForestSnapshotStoryArc[],
  sources: ForestSnapshotSources,
): ForestSnapshotStory {
  const out: ForestSnapshotStory = {
    id: story.id,
    title: story.title,
    status: story.status,
    dependsOn: [...story.dependsOn].sort(),
    capabilities: story.capabilities
      .map(toCapability)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    uat: toUat(story, sources.uatCriteria),
    decisions: toDecisionNumbers(story, sources.decisions),
    arcs,
  };
  // `exactOptionalPropertyTypes`: only present when true, so the published JSON stays minimal and a
  // story that is not a building carries no key at all.
  return story.building === true ? { ...out, building: true } : out;
}

/** The arc tier, narrowed to {@link ForestSnapshotArc}'s allow-list. NAMED FIELD BY FIELD, never spread. */
function toArc(rollup: ArcRollup, log: ReadonlyMap<number, ForestSnapshotAdr>): ForestSnapshotArc {
  return {
    id: rollup.id,
    title: rollup.title,
    lifecycle: rollup.lifecycle,
    incrementsClosed: rollup.increments.filter((i) => !isForwardLooking(i.status)).length,
    incrementsOpen: rollup.increments.filter((i) => isForwardLooking(i.status)).length,
    // Narrowed to the log for the same reason a story's citations are: this file may not name a
    // decision it cannot also carry a record for, or the drawer prints a numbered blank.
    adrs: rollup.adrs
      .map((a) => a.number)
      .filter((n) => log.has(n))
      .sort((a, b) => a - b),
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
  log: ReadonlyMap<number, ForestSnapshotAdr>,
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
      .map((r) => toArc(r, log))
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
 * `sources` is REQUIRED in every field, and that is deliberate — see {@link ForestSnapshotSources}.
 * An optional argument would let a caller that forgot one publish a forest whose every island
 * reports "no initiative reaches this" / "no acceptance test recorded", an absence manufactured out
 * of a missing wire rather than read from the corpus, which is the exact falsified-absence error
 * `ArcRollupInput.workUnits` documents one package over. Pass an empty one to mean it.
 */
export function toForestSnapshot(
  payload: TreePayload,
  generatedAt: string,
  sources: ForestSnapshotSources,
): ForestSnapshot {
  const presented = presentStories(payload.stories);
  const joined = joinArcs(
    sources.arcRollups,
    new Set(presented.map((s) => s.id)),
    sources.decisions,
  );
  const stories = presented
    .map((s) => toStory(s, joined.byStory.get(s.id) ?? [], sources))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // The registry: every decision something on the map can reach, and no other. Both tiers are
  // already narrowed to the log, so every number here resolves.
  const reached = new Set<number>();
  for (const story of stories) for (const n of story.decisions) reached.add(n);
  for (const arc of joined.arcs) for (const n of arc.adrs) reached.add(n);
  const decisions = [...reached]
    .sort((a, b) => a - b)
    .map((n) => sources.decisions.get(n))
    .filter((d): d is ForestSnapshotAdr => d !== undefined);
  return {
    schemaVersion: FOREST_SNAPSHOT_SCHEMA_VERSION,
    generatedAt,
    source: FOREST_SNAPSHOT_SOURCE,
    storyCount: stories.length,
    provenStoryCount: stories.filter((s) => s.status === PROVEN).length,
    capabilityCount: stories.reduce((n, s) => n + s.capabilities.length, 0),
    stories,
    arcs: joined.arcs,
    decisions,
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
