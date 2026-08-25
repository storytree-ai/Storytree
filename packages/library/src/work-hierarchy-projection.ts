import { z } from "zod";

import { Status, UatWitness } from "./schema.js";
import { UatTestCriterion } from "./uat-test-criteria.js";
import { ReliabilityGate } from "./reliability-gates.js";

/**
 * THE WORK-HIERARCHY PROJECTION (ADR-0445 D1, `map-freshness-arc` inc-02) — the SHAPE of the
 * disk-canonical work hierarchy as it is mirrored into the live store, and the pure comparison that
 * says when the mirror has drifted from the tree it mirrors.
 *
 * ## What this is for
 *
 * The forest map JOINS two sources on different clocks: signed verdicts read LIVE from Postgres, and
 * the story shape read by `readTree(storiesDir)` from `stories/**` on the APP'S OWN DISK, frozen at
 * the commit the app was built from. Verdicts bind to criteria by `criterionId` + `revisionId`
 * (ADR-0253), so a stale app reads the database perfectly, matches no verdict for a criterion
 * re-worded since, and correctly paints yellow. ADR-0445 D1 closes that by moving the RENDERING
 * readers onto one clock; this module is the first half of it — the hierarchy in the store.
 *
 * ## Three properties that are load-bearing, not incidental
 *
 * **ONE-DIRECTIONAL.** Disk stays canonical for AUTHORING and for PROVING. `story-author` writes
 * markdown under `stories/**` and nothing else (ADR-0309 D3); the gate's corpus guard,
 * `check:coverage`, `check:boundaries`, the build drivers and CI keep reading the checkout, because a
 * story pulled live while CI tests a branch would validate the wrong thing. Nothing here is ever
 * written back to disk, and no surface authors into these rows. This is the ADR-0302 D5 line —
 * *role decides which source a reader uses, not taste* — applied to the render/prove axis.
 *
 * **RAW FACTS, NOT FOLDS.** The projection carries what the spec AUTHORED: every UAT criterion
 * including `wouldBe` ones, every reliability gate including retired ones, the DECLARED `uatWitness`
 * rather than `effectiveUatWitness`'s resolution of it. The folds — `activeReliabilityGates`,
 * the would-be filter, `crownObligations`, `rollupStoryGreen` — are RULES compiled into each reader,
 * and ADR-0445's Consequences say plainly that the rule half of the skew is NOT closed by that
 * decision. Baking a fold in here would put the LOADER's rule version into the store and hand every
 * reader a second, invisible staleness axis. The store answers *what does the tree say*; each reader
 * still answers *what does that mean* with its own compiled rules.
 *
 * **THE STAMP IS NOT COMPARED.** {@link WorkHierarchySnapshot} carries where it came from
 * (`commitSha`, `storiesTreeSha`, `generatedAt`) so a reader can say how current it is. Those fields
 * are deliberately OUTSIDE {@link diffWorkHierarchy}: two snapshots of the same tree taken at
 * different commits are in agreement about the hierarchy, and a diff that reported the stamps would
 * fire on every branch. Freshness is a separate judgement over the stamp (`check:hierarchy-drift`),
 * and keeping the two apart is what lets each one name its own remedy.
 *
 * ## Why there is no append-only history stream beside it
 *
 * Every other `events.*` table in this store pairs a current-state projection with an append-only
 * `*_event` log, because those rows are AUTHORED there and the store is the only place their history
 * could live. These rows are authored in git. `git log -p -- stories/` is the history, complete and
 * signed, and a second copy of it in Postgres could only ever drift from the first. Stated here so
 * the absence reads as a decision rather than an omission.
 */

/** The projection's own schema version — bumped when a field is added, removed or re-meant. */
export const WORK_HIERARCHY_SCHEMA_VERSION = 1;

/**
 * One capability as the rendering readers consume it.
 *
 * `contractCount` rather than the contracts themselves: the map renders the DECLARED leaf-contract
 * count (`spec.contracts.length`) and nothing else about them, and the increment's fence is explicit
 * — do not model more than the rendering readers consume. The PROVING readers that need contract
 * bodies read the checkout, which is unchanged.
 *
 * `error` is how a missing or malformed spec file survives the projection. `readTree` turns such a
 * file into an `error` node rather than throwing, because one bad spec must not blank the forest;
 * the projection carries the same node so the store and the disk read agree about it.
 */
export const ProjectedCapability = z
  .object({
    id: z.string().min(1),
    /** The `stories/<dir>` this capability lives under — its owning story's id. */
    storyId: z.string().min(1),
    title: z.string(),
    outcome: z.string(),
    /** `null` only when `error` is set — an unreadable spec has no declared status. */
    status: Status.nullable(),
    proofMode: z.string(),
    dependsOn: z.array(z.string()).default([]),
    /** `spec.contracts.length` — the declared `## Contracts` count the map renders. */
    contractCount: z.number().int().nonnegative(),
    /** Set when the spec file is missing or failed to parse; absent on a healthy node. */
    error: z.string().min(1).optional(),
  })
  .strict();
export type ProjectedCapability = z.infer<typeof ProjectedCapability>;

/**
 * One story as the rendering readers consume it, with its authored obligations attached.
 *
 * `capabilities` is the ORDERED id list from the story's own frontmatter, not a set: the map draws
 * them in declaration order, so a re-ordering is a real difference and {@link diffWorkHierarchy}
 * reports it. The capability BODIES live in their own rows ({@link ProjectedCapability}) keyed by an
 * id that is unique across the whole tree.
 */
export const ProjectedStory = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    outcome: z.string(),
    /** `null` only when `error` is set. */
    status: Status.nullable(),
    proofMode: z.string(),
    /**
     * The DECLARED witness — `null` when the spec omits it. Deliberately not resolved through
     * `effectiveUatWitness`: that default is a rule, and rules stay with the reader (see the header).
     */
    uatWitness: UatWitness.nullable(),
    dependsOn: z.array(z.string()).default([]),
    consumedBy: z.array(z.string()).default([]),
    /** The deciding ADR numbers (ADR-0037 §2) the story panel links. */
    decisions: z.array(z.number().int()).default([]),
    /** ADR-0076 render hint: drawn as a de-connected building rather than an island. */
    building: z.boolean(),
    /** The story frontmatter's capability id list, IN ORDER. */
    capabilities: z.array(z.string().min(1)).default([]),
    /** EVERY authored criterion, `wouldBe` ones included — the filter belongs to the reader. */
    uatTestCriteria: z.array(UatTestCriterion).default([]),
    /** EVERY authored gate, retired ones included — `activeReliabilityGates` belongs to the reader. */
    reliabilityGates: z.array(ReliabilityGate).default([]),
    /** Set when `story.md` is missing or failed to parse; absent on a healthy node. */
    error: z.string().min(1).optional(),
  })
  .strict();
export type ProjectedStory = z.infer<typeof ProjectedStory>;

/**
 * A whole projection of one checkout's `stories/**`, stamped with where it came from.
 *
 * `storiesTreeSha` is the git TREE object id of `stories/` (`git rev-parse <ref>:stories`), and it is
 * the field freshness is judged on rather than `commitSha`. A tree id is a CONTENT hash: two commits
 * whose `stories/` are byte-identical share it, so a projection generated from a PR's merge ref
 * carries the same tree id as the `main` commit that merge produces, and a branch that touched no
 * story is trivially in agreement. `commitSha` is PROVENANCE only — it may name a commit no later
 * checkout can resolve (a squash merge discards it), which is exactly why nothing is judged on it.
 */
export const WorkHierarchySnapshot = z
  .object({
    schemaVersion: z.number().int().positive(),
    /** Provenance: the commit the projection was generated from. Never judged — see above. */
    commitSha: z.string().min(1),
    /** The git tree object id of `stories/` at that commit. The freshness key. */
    storiesTreeSha: z.string().min(1),
    /** ISO-8601 wall clock of the generation run. */
    generatedAt: z.string().min(1),
    /** What generated it — `hierarchy:load`, a CI job, a test. Audit only. */
    generator: z.string().min(1),
    stories: z.array(ProjectedStory).default([]),
    capabilities: z.array(ProjectedCapability).default([]),
  })
  .strict();
export type WorkHierarchySnapshot = z.infer<typeof WorkHierarchySnapshot>;

// ---------------------------------------------------------------------------
// The pure comparison
// ---------------------------------------------------------------------------

/** Which population a {@link HierarchyDifference} was found in. */
export type HierarchyEntity = "story" | "capability" | "criterion" | "gate";

/** How the two sides disagreed about one entity. */
export type HierarchyDifferenceKind =
  /** Present in the checkout, absent from the store — the store is behind. */
  | "missing"
  /** Present in the store, absent from the checkout — the store kept something deleted. */
  | "unexpected"
  /** Present on both sides, but a field differs. */
  | "changed";

/** One disagreement between the checkout's projection and the store's copy. */
export interface HierarchyDifference {
  readonly entity: HierarchyEntity;
  readonly kind: HierarchyDifferenceKind;
  /** The addressable thing: a story id, `<story>/<capability>`, a criterion id, a gate id. */
  readonly id: string;
  /** The owning story, for a criterion/gate/capability. Equal to `id` for a story. */
  readonly story: string;
  /** The field that differs — absent for a missing/unexpected whole entity. */
  readonly field?: string;
  /** Canonical rendering of the checkout's value, when there is one. */
  readonly expected?: string;
  /** Canonical rendering of the store's value, when there is one. */
  readonly actual?: string;
}

/**
 * A key-sorted JSON rendering, so two structurally equal values always render identically.
 *
 * Plain `JSON.stringify` preserves INSERTION order, and the two sides of this comparison are built by
 * different code paths — one by the projector walking a spec, one by `JSON.parse` of a stored doc —
 * so an unsorted rendering would report a difference whenever a key order happened to differ. That
 * would be a false red in the direction that matters most: it would train a reader to ignore this
 * check.
 */
function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
}

/** Read one own property without asserting the object into an open dictionary. */
function fieldOf<T extends object>(value: T, field: string): unknown {
  return Object.getOwnPropertyDescriptor(value, field)?.value;
}

/**
 * Field-by-field diff of two records known to name the same entity.
 *
 * `skip` names the fields the caller diffs separately (a story's criteria and gates), so one
 * re-worded criterion is reported ONCE, as a criterion, rather than twice — once as itself and once
 * as a wholesale change to the story's `uatTestCriteria` array, which would bury the useful line
 * under an unreadable one.
 */
function diffFields<T extends object>(
  entity: HierarchyEntity,
  id: string,
  story: string,
  expected: T,
  actual: T,
  skip: readonly string[] = [],
): HierarchyDifference[] {
  const out: HierarchyDifference[] = [];
  const fields = [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
    .filter((field) => !skip.includes(field))
    .sort();
  for (const field of fields) {
    const e = canonical(fieldOf(expected, field));
    const a = canonical(fieldOf(actual, field));
    if (e === a) continue;
    out.push({ entity, kind: "changed", id, story, field, expected: e, actual: a });
  }
  return out;
}

/** Index a list by a key, keeping the FIRST of any duplicate (the corpus guard forbids duplicates). */
function byKey<T>(items: readonly T[], key: (item: T) => string): Map<string, T> {
  const out = new Map<string, T>();
  for (const item of items) if (!out.has(key(item))) out.set(key(item), item);
  return out;
}

/** Diff two populations that share a key space, reporting missing / unexpected / changed. */
function diffPopulation<T extends object>(
  entity: HierarchyEntity,
  expected: ReadonlyMap<string, T>,
  actual: ReadonlyMap<string, T>,
  storyOf: (item: T, id: string) => string,
  nested: readonly string[] = [],
): HierarchyDifference[] {
  const out: HierarchyDifference[] = [];
  for (const [id, want] of expected) {
    const have = actual.get(id);
    if (have === undefined) {
      out.push({ entity, kind: "missing", id, story: storyOf(want, id) });
      continue;
    }
    out.push(...diffFields(entity, id, storyOf(want, id), want, have, nested));
  }
  for (const [id, have] of actual) {
    if (expected.has(id)) continue;
    out.push({ entity, kind: "unexpected", id, story: storyOf(have, id) });
  }
  return out;
}

/**
 * Compare the checkout's projection against the store's copy of it. Pure, total, order-independent.
 *
 * `expected` is what the checkout says; `actual` is what the store holds. An empty result means the
 * two agree about EVERY story, capability, criterion and gate — not that the comparison found
 * nothing to look at, which is why the caller reports its denominators alongside this verdict.
 *
 * The STAMP (`commitSha` / `storiesTreeSha` / `generatedAt` / `generator` / `schemaVersion`) is not
 * compared here: see the module header. Judging currency is the caller's separate job.
 */
export function diffWorkHierarchy(
  expected: WorkHierarchySnapshot,
  actual: WorkHierarchySnapshot,
): HierarchyDifference[] {
  const out: HierarchyDifference[] = [];

  const expectedStories = byKey(expected.stories, (s) => s.id);
  const actualStories = byKey(actual.stories, (s) => s.id);
  out.push(
    ...diffPopulation<ProjectedStory>("story", expectedStories, actualStories, (s) => s.id, [
      "uatTestCriteria",
      "reliabilityGates",
    ]),
  );

  // Criteria and gates are diffed WITHIN the stories both sides carry. A story the store never heard
  // of is already reported as a missing story; walking its criteria too would print a second, longer
  // report of the same one fact.
  for (const [storyId, want] of expectedStories) {
    const have = actualStories.get(storyId);
    if (have === undefined) continue;
    out.push(
      ...diffPopulation<UatTestCriterion>(
        "criterion",
        byKey(want.uatTestCriteria, (c) => c.criterionId),
        byKey(have.uatTestCriteria, (c) => c.criterionId),
        () => storyId,
      ),
    );
    out.push(
      ...diffPopulation<ReliabilityGate>(
        "gate",
        byKey(want.reliabilityGates, (g) => g.id),
        byKey(have.reliabilityGates, (g) => g.id),
        () => storyId,
      ),
    );
  }

  out.push(
    ...diffPopulation<ProjectedCapability>(
      "capability",
      byKey(expected.capabilities, (c) => c.id),
      byKey(actual.capabilities, (c) => c.id),
      (c) => c.storyId,
    ),
  );

  return out;
}

/** How many addressable things a snapshot carries — a verdict's denominators. */
export interface HierarchyCounts {
  readonly stories: number;
  readonly capabilities: number;
  readonly criteria: number;
  readonly gates: number;
}

/**
 * Count what a snapshot holds, so "no differences" and "read nothing" can never print the same way.
 * The `library-dag-corpus-reports-its-denominators` shape, applied to a second projection.
 */
export function countWorkHierarchy(snapshot: WorkHierarchySnapshot): HierarchyCounts {
  let criteria = 0;
  let gates = 0;
  for (const story of snapshot.stories) {
    criteria += story.uatTestCriteria.length;
    gates += story.reliabilityGates.length;
  }
  return {
    stories: snapshot.stories.length,
    capabilities: snapshot.capabilities.length,
    criteria,
    gates,
  };
}

/** One difference as a single operator-readable line. */
export function formatHierarchyDifference(diff: HierarchyDifference): string {
  const where = diff.entity === "story" ? diff.id : `${diff.story} › ${diff.id}`;
  if (diff.kind === "missing") return `${diff.entity} ${where}: in the checkout, ABSENT from the store`;
  if (diff.kind === "unexpected") return `${diff.entity} ${where}: in the store, ABSENT from the checkout`;
  return `${diff.entity} ${where}.${diff.field ?? "?"}: checkout ${diff.expected ?? "—"} / store ${diff.actual ?? "—"}`;
}
