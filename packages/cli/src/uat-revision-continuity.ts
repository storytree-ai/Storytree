import {
  WORK_HIERARCHY_SCHEMA_VERSION,
  WorkHierarchySnapshot,
  type ProjectedStory,
} from "@storytree/library";
import {
  CriterionId,
  CriterionRevisionId,
  CriterionVerdict,
  SIGNING_EVENT_KIND,
} from "@storytree/proof-protocol";
import {
  rollupCriterionStatus,
  type RollupEvent,
} from "@storytree/orchestrator";

/**
 * The pure decision behind `check:uat-revision-continuity` (ADR-0560 D3/D4).
 *
 * The shell supplies three readings: the disk hierarchy at this branch's merge base, the candidate
 * hierarchy in the working tree, and the authenticated signed-verdict stream. This module reaches
 * none of them itself. Keeping that boundary explicit makes the PR #1892 production escape a small
 * literal test instead of a database fixture.
 *
 * This is deliberately a REPLACEMENT-proof wall, not a general story-expansion wall. A criterion id
 * present on both sides whose exact revision changed needs a current signed pass for the candidate
 * revision. A newly added id remains additive expansion under ADR-0416 and is reported by the story
 * health fold rather than blocked here merely for existing.
 */

export interface UatRevisionContinuityInputs {
  /** The merge-base hierarchy, or null when the shell could not read/project it. */
  readonly base: unknown | null;
  /** The candidate working-tree hierarchy, or null when it could not be projected. */
  readonly candidate: unknown | null;
  /** The signed event stream, or null when the authenticated store could not be read. */
  readonly events: readonly unknown[] | null;
  /** Human-readable provenance for the base used in the report. */
  readonly baseRef: string;
}

export interface ChangedCriterionRevision {
  readonly storyId: string;
  readonly criterionId: string;
  readonly oldRevisionId: string;
  readonly newRevisionId: string;
  /** True only while the exact candidate revision's current fold is healthy. */
  readonly witnessed: boolean;
}

export interface UatRevisionContinuityVerdict {
  readonly ok: boolean;
  readonly changes: readonly ChangedCriterionRevision[];
  readonly lines: readonly string[];
}

interface CriterionOwner {
  readonly storyId: string;
  readonly revisionId: string;
}

interface IndexedHierarchy {
  readonly snapshot: WorkHierarchySnapshot;
  readonly criteria: ReadonlyMap<string, CriterionOwner>;
}

type HierarchyRead =
  | { readonly ok: true; readonly value: IndexedHierarchy }
  | { readonly ok: false; readonly lines: readonly string[] };

function issueText(error: { readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[] }): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

/** Parse and index one side, refusing every shape that makes stable criterion identity ambiguous. */
function readHierarchy(raw: unknown | null, side: "base" | "candidate"): HierarchyRead {
  if (raw === null) {
    return {
      ok: false,
      lines: [`✗ ${side} hierarchy is unreadable — no ${side} projection was supplied.`],
    };
  }

  const parsed = WorkHierarchySnapshot.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      lines: [
        `✗ ${side} hierarchy is unreadable — it does not satisfy the work-hierarchy schema.`,
        `  ${issueText(parsed.error)}`,
      ],
    };
  }

  if (parsed.data.stories.length === 0) {
    return {
      ok: false,
      lines: [`✗ ${side} hierarchy is unreadable — it contains zero stories.`],
    };
  }
  if (parsed.data.schemaVersion !== WORK_HIERARCHY_SCHEMA_VERSION) {
    return {
      ok: false,
      lines: [
        `✗ ${side} hierarchy is unreadable — schema version ${String(parsed.data.schemaVersion)} ` +
          `does not match ${String(WORK_HIERARCHY_SCHEMA_VERSION)}.`,
      ],
    };
  }

  const criteria = new Map<string, CriterionOwner>();
  const storyIds = new Set<string>();
  const lines: string[] = [];
  for (const story of parsed.data.stories) {
    if (storyIds.has(story.id)) {
      lines.push(`✗ ${side} hierarchy has duplicate story identity ${story.id}.`);
    }
    storyIds.add(story.id);
    if (story.error !== undefined) {
      lines.push(`✗ ${side} story ${story.id} is unreadable — ${story.error}`);
      continue;
    }
    indexStoryCriteria(side, story, criteria, lines);
  }

  return lines.length > 0
    ? { ok: false, lines }
    : { ok: true, value: { snapshot: parsed.data, criteria } };
}

function indexStoryCriteria(
  side: "base" | "candidate",
  story: ProjectedStory,
  criteria: Map<string, CriterionOwner>,
  lines: string[],
): void {
  for (const criterion of story.uatTestCriteria) {
    // WorkHierarchySnapshot already validates these. Keeping the explicit check here makes the
    // identity/revision fail-closed rule visible at the decision boundary rather than relying on a
    // future projection schema continuing to carry it.
    if (!CriterionId.safeParse(criterion.criterionId).success) {
      lines.push(
        `✗ ${side} story ${story.id} carries malformed criterion identity ${JSON.stringify(criterion.criterionId)}.`,
      );
      continue;
    }
    if (!CriterionRevisionId.safeParse(criterion.revisionId).success) {
      lines.push(
        `✗ ${side} story ${story.id} › ${criterion.criterionId} carries malformed revision ${JSON.stringify(criterion.revisionId)}.`,
      );
      continue;
    }
    const previous = criteria.get(criterion.criterionId);
    if (previous !== undefined) {
      lines.push(
        `✗ ${side} hierarchy has ambiguous criterion identity ${criterion.criterionId}: ` +
          `${previous.storyId} and ${story.id} both claim it.`,
      );
      continue;
    }
    criteria.set(criterion.criterionId, {
      storyId: story.id,
      revisionId: criterion.revisionId,
    });
  }
}

interface CandidateChanges {
  readonly changes: Omit<ChangedCriterionRevision, "witnessed">[];
  readonly errors: string[];
}

function candidateChanges(
  base: ReadonlyMap<string, CriterionOwner>,
  candidate: ReadonlyMap<string, CriterionOwner>,
): CandidateChanges {
  const changes: Omit<ChangedCriterionRevision, "witnessed">[] = [];
  const errors: string[] = [];
  for (const [criterionId, after] of candidate) {
    const before = base.get(criterionId);
    if (before === undefined) continue; // New id: additive expansion, intentionally not charged.
    if (before.storyId !== after.storyId) {
      errors.push(
        `✗ criterion ${criterionId} changed owner from ${before.storyId} to ${after.storyId}; ` +
          "stable identity is ambiguous, so continuity was not judged.",
      );
      continue;
    }
    if (before.revisionId === after.revisionId) continue;
    changes.push({
      storyId: after.storyId,
      criterionId,
      oldRevisionId: before.revisionId,
      newRevisionId: after.revisionId,
    });
  }
  changes.sort(
    (a, b) => a.storyId.localeCompare(b.storyId) || a.criterionId.localeCompare(b.criterionId),
  );
  return { changes, errors };
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Select valid signing events for changed criteria and name corrupt rows that claim one of those
 * identities. An unrelated old malformed row cannot block every PR forever; one that claims the
 * very identity being trusted cannot be silently ignored.
 */
interface RelevantEvents {
  readonly events: RollupEvent[];
  readonly errors: string[];
}

function relevantEvents(
  rawEvents: readonly unknown[],
  changedIds: ReadonlySet<string>,
): RelevantEvents {
  const events: RollupEvent[] = [];
  const errors: string[] = [];

  for (const rawEvent of rawEvents) {
    const event = objectRecord(rawEvent);
    if (event?.["kind"] !== SIGNING_EVENT_KIND) continue;
    const doc = objectRecord(event["doc"]);
    const claimedUnit = typeof doc?.["unitId"] === "string" ? doc["unitId"] : undefined;
    const claimedCriterion =
      typeof doc?.["criterionId"] === "string" ? doc["criterionId"] : undefined;
    if (
      (claimedUnit === undefined || !changedIds.has(claimedUnit)) &&
      (claimedCriterion === undefined || !changedIds.has(claimedCriterion))
    ) {
      continue;
    }

    const parsed = CriterionVerdict.safeParse(event["doc"]);
    const seq = event["seq"];
    if (!parsed.success || typeof seq !== "number" || !Number.isSafeInteger(seq)) {
      errors.push(
        `✗ malformed signed witness claims criterion ${claimedCriterion ?? claimedUnit ?? "?"}; ` +
          "its identity/revision cannot be trusted.",
      );
      continue;
    }
    events.push({ seq, kind: SIGNING_EVENT_KIND, doc: parsed.data });
  }

  return { events, errors };
}

/** Judge exact-revision continuity without filesystem, git, network or database access. */
export function judgeUatRevisionContinuity(
  inputs: UatRevisionContinuityInputs,
): UatRevisionContinuityVerdict {
  const base = readHierarchy(inputs.base, "base");
  const candidate = readHierarchy(inputs.candidate, "candidate");
  const unreadable = [
    ...(base.ok ? [] : base.lines),
    ...(candidate.ok ? [] : candidate.lines),
  ];
  if (unreadable.length > 0) return { ok: false, changes: [], lines: unreadable };

  if (inputs.events === null) {
    return {
      ok: false,
      changes: [],
      lines: [
        "✗ signed verdict store is unavailable — proof continuity was not judged.",
        "  This is a FAILURE, never a skip: a missing witness and an unread witness cannot both mean green.",
      ],
    };
  }

  // The guarded return above proves both reads succeeded; spelling the narrowing once keeps the
  // remainder about the rule rather than repeated assertions.
  if (!base.ok || !candidate.ok) throw new Error("unreachable hierarchy read state");
  const comparison = candidateChanges(base.value.criteria, candidate.value.criteria);
  if (comparison.errors.length > 0) {
    return { ok: false, changes: [], lines: comparison.errors };
  }

  const changedIds = new Set(comparison.changes.map((change) => change.criterionId));
  const selected = relevantEvents(inputs.events, changedIds);
  if (selected.errors.length > 0) {
    return { ok: false, changes: [], lines: selected.errors };
  }

  const changes: ChangedCriterionRevision[] = comparison.changes.map((change) => ({
    ...change,
    witnessed:
      rollupCriterionStatus(
        { criterionId: change.criterionId, revisionId: change.newRevisionId },
        selected.events,
      ) === "healthy",
  }));
  const missing = changes.filter((change) => !change.witnessed);

  if (missing.length > 0) {
    return {
      ok: false,
      changes,
      lines: [
        `✗ ${String(missing.length)} changed existing UAT criterion revision(s) lack a current signed pass:`,
        "",
        ...missing.map(
          (change) =>
            `  ${change.storyId} › ${change.criterionId}: ${change.oldRevisionId} → ${change.newRevisionId} — UNWITNESSED`,
        ),
        "",
        "  Drive and sign each candidate revision before landing; an old-revision verdict cannot prove new acceptance text.",
      ],
    };
  }

  const currentCount = candidate.value.snapshot.stories.reduce(
    (count, story) => count + story.uatTestCriteria.length,
    0,
  );
  return {
    ok: true,
    changes,
    lines:
      changes.length === 0
        ? [
            `✓ no existing UAT criterion revisions changed against ${inputs.baseRef} ` +
              `(${String(currentCount)} candidate criteria read).`,
          ]
        : [
            `✓ ${String(changes.length)} changed existing UAT criterion revision(s) each have a current signed pass.`,
            ...changes.map(
              (change) =>
                `  ${change.storyId} › ${change.criterionId}: ${change.oldRevisionId} → ${change.newRevisionId}`,
            ),
          ],
  };
}
