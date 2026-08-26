import { crownObligations } from "./crown-obligations.js";
import { activeReliabilityGates } from "./reliability-gates.js";
import { effectiveUatWitness, type UatWitness } from "./schema.js";
import type { ReliabilityGate } from "./reliability-gates.js";
import type { UatTestCriterion } from "./uat-test-criteria.js";
import type {
  ProjectedCapability,
  ProjectedStory,
  WorkHierarchySnapshot,
} from "./work-hierarchy-projection.js";

/**
 * THE RENDERING READER (ADR-0445 D1, `map-freshness-arc` inc-03) — folds a stored
 * {@link WorkHierarchySnapshot} into the shape the forest map consumes, so the map's QUESTION comes
 * from the same clock as its PROOF.
 *
 * ## The fault this closes
 *
 * The map JOINS two sources. The proof — signed verdicts — is read LIVE from Postgres and is always
 * current. The question — which stories and capabilities exist, and each criterion's exact
 * `revisionId` — was read by `readTree(storiesDir)` from `stories/**` on the APP'S OWN DISK, frozen
 * at the commit the app was built from. Verdicts bind to criteria by `criterionId` + `revisionId`
 * (ADR-0253), so an app at an older commit reads the database PERFECTLY, finds verdicts stamped with
 * a revision it has never heard of, and correctly paints yellow. It asked an outdated question and
 * got an honest answer. Criteria on `main` went 261 (2026-08-05) to 113 (2026-08-24): the staler the
 * client, the yellower the map.
 *
 * ## Why the folds live HERE and not in the store
 *
 * The projection carries the RAW authored facts — every criterion including `wouldBe` ones, every
 * gate including retired ones, the DECLARED `uatWitness` rather than its resolution. The folds
 * (`effectiveUatWitness`, the would-be filter, `activeReliabilityGates`, `crownObligations`) are
 * RULES, and rules are compiled into each reader. Baking them into the loader would put the LOADER's
 * rule version into the store and hand every reader a second, invisible staleness axis. So the store
 * answers *what does the tree say*, and this module answers *what does that mean* — which is exactly
 * the split `readTree` already makes on the disk side, applied to the same facts from the other
 * source.
 *
 * **This is why ADR-0445's Consequences say the RULE half of the skew stays open.** A stale app now
 * reads current facts, but still compiles them with its own build's rules. That is a smaller fault
 * than the revision mismatch — it does not mismatch every re-worded criterion at once — but it is
 * real, and nobody should read this module as closing it.
 *
 * ## The parity obligation
 *
 * `readTree` (apps/studio/server/apiRouter.ts) and this function are two readers of one hierarchy,
 * and they must agree field for field or islands change colour on which source happened to answer.
 * `apps/studio/server/hierarchyProjectionParity.test.ts` holds the disk reader against the
 * projection; `work-hierarchy-tree.test.ts` holds THIS fold against `readTree`'s own output over the
 * same tree. Neither is decoration: a mirror nothing compares to its original is a mirror that
 * drifts.
 */

/** One capability as the map draws it — `readTree`'s `TreeCapability` minus the live-proof fields. */
export interface FoldedCapability {
  readonly id: string;
  readonly title: string;
  readonly outcome: string;
  readonly status: ProjectedCapability["status"];
  readonly proofMode: string;
  readonly dependsOn: string[];
  /** The DECLARED leaf-contract count — `readTree` calls this `testCount`. */
  readonly testCount: number;
  readonly error?: string;
}

/** One story as the map draws it — `readTree`'s `TreeStory` minus the live-proof fields. */
export interface FoldedStory {
  readonly id: string;
  readonly title: string;
  readonly outcome: string;
  readonly status: ProjectedStory["status"];
  readonly proofMode: string;
  /** RESOLVED through {@link effectiveUatWitness} — fail-closed to `human` when undeclared. */
  readonly uatWitness: UatWitness;
  readonly dependsOn: string[];
  readonly consumedBy: string[];
  readonly decisions: number[];
  readonly building: boolean;
  readonly capabilities: FoldedCapability[];
  readonly error?: string;
}

/**
 * The four-part read the `/api/tree` handler and the desktop backend consume — deliberately the same
 * shape `readTree` returns, so selecting a source is a repoint rather than a rewrite.
 */
export interface FoldedWorkHierarchy {
  readonly stories: FoldedStory[];
  /** The CROWN's obligation union (ADR-0443 D2): witnessable criteria + still-active gates. */
  readonly uatTestCriteriaByStory: Map<
    string,
    (UatTestCriterion | ReliabilityGate)[]
  >;
  /** The marker-walk summary: witnessable UAT criteria ALONE, never the gates (ADR-0085). */
  readonly uatCriteriaByStory: Map<
    string,
    { criterionId: string; revisionId: string }[]
  >;
  /** Per-capability coverage (ADR-0097): the active gates and what each `(covers:)`. */
  readonly coverageByStory: Map<
    string,
    { id: string; covers?: readonly string[] }[]
  >;
}

/**
 * A capability id declared by a story but carrying no projected row.
 *
 * The projector emits an error row for a capability whose spec file is missing, so this should be
 * unreachable against a snapshot the loader wrote. It is synthesised rather than dropped because the
 * alternative is a story silently rendering fewer capabilities than it declares — the same class of
 * quiet under-claim this whole arc exists to close, and one that would be invisible on the map.
 */
function missingCapability(id: string): FoldedCapability {
  return {
    id,
    title: id,
    outcome: "",
    status: null,
    proofMode: "",
    dependsOn: [],
    testCount: 0,
    error: "capability row missing from the projection",
  };
}

function foldCapability(projected: ProjectedCapability): FoldedCapability {
  const base = {
    id: projected.id,
    title: projected.title,
    outcome: projected.outcome,
    status: projected.status,
    proofMode: projected.proofMode,
    dependsOn: [...projected.dependsOn],
    testCount: projected.contractCount,
  };
  // `exactOptionalPropertyTypes`: `error` is absent on a healthy node, never present-and-undefined.
  return projected.error === undefined ? base : { ...base, error: projected.error };
}

function foldStory(
  projected: ProjectedStory,
  capabilitiesById: ReadonlyMap<string, ProjectedCapability>,
): FoldedStory {
  const base = {
    id: projected.id,
    title: projected.title,
    outcome: projected.outcome,
    status: projected.status,
    proofMode: projected.proofMode,
    // THE FOLD: the projection stores the DECLARED witness (`null` when the spec omits it); the
    // fail-closed `human` default is a RULE and belongs to the reader (ADR-0040).
    uatWitness: effectiveUatWitness(projected.uatWitness ?? undefined),
    dependsOn: [...projected.dependsOn],
    consumedBy: [...projected.consumedBy],
    decisions: [...projected.decisions],
    building: projected.building,
    // The frontmatter's ORDERED id list drives this, not the capability table's own order: the map
    // draws capabilities in declaration order, so a re-ordering is a real difference.
    capabilities: projected.capabilities.map((id) => {
      const cap = capabilitiesById.get(id);
      return cap === undefined ? missingCapability(id) : foldCapability(cap);
    }),
  };
  return projected.error === undefined ? base : { ...base, error: projected.error };
}

/**
 * Fold a stored snapshot into the map's read.
 *
 * **Story order is by id, and that is a decision rather than an accident.** `readTree` walks the
 * directory, so its order is whatever `fs.readdir` returns; the store's rows come back from a
 * `SELECT` with no `ORDER BY`, which Postgres gives no guarantee about at all. Sorting here is what
 * makes the live read reproducible across two requests to the same unchanged store — without it an
 * island's position in the payload could change between polls for no authored reason.
 *
 * **A story whose spec failed to parse contributes NO obligations**, matching `readTree`, which
 * collects its three maps inside the `try` and therefore skips them when a spec throws. Recording
 * obligations for an unreadable spec would let a story's crown roll up over criteria nobody could
 * confirm were still authored.
 */
export function foldWorkHierarchy(
  snapshot: WorkHierarchySnapshot,
): FoldedWorkHierarchy {
  const capabilitiesById = new Map<string, ProjectedCapability>();
  for (const cap of snapshot.capabilities) capabilitiesById.set(cap.id, cap);

  const ordered = [...snapshot.stories].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const uatTestCriteriaByStory = new Map<
    string,
    (UatTestCriterion | ReliabilityGate)[]
  >();
  const uatCriteriaByStory = new Map<
    string,
    { criterionId: string; revisionId: string }[]
  >();
  const coverageByStory = new Map<
    string,
    { id: string; covers?: readonly string[] }[]
  >();

  const stories: FoldedStory[] = [];
  for (const projected of ordered) {
    stories.push(foldStory(projected, capabilitiesById));
    // An unreadable spec carries no trustworthy obligations — see the header.
    if (projected.error !== undefined) continue;

    // ADR-0443 D2/D3: ALWAYS recorded, even when empty. Gating on a non-empty set would skip the
    // crown for exactly the stories D2 unblocks — the ones whose every obligation is unsignable —
    // and leave them grey forever, which is the defect rather than the fix.
    uatTestCriteriaByStory.set(
      projected.id,
      crownObligations(projected.uatTestCriteria, projected.reliabilityGates),
    );

    // The marker-walk summary keeps the would-be filter ALONE and never unions the gates: an ADR-0085
    // gate is a brownfield adoption mechanism, not a UAT criterion.
    const witnessable = projected.uatTestCriteria.filter((c) => c.wouldBe !== true);
    if (witnessable.length > 0) {
      uatCriteriaByStory.set(
        projected.id,
        witnessable.map((c) => ({
          criterionId: c.criterionId,
          revisionId: c.revisionId,
        })),
      );
    }

    // ADR-0436: a gate RETIRED IN PLACE leaves the obligation union and the coverage set with it, or
    // a withdrawn gate would still green a capability.
    const live = activeReliabilityGates(projected.reliabilityGates);
    if (live.length > 0) {
      coverageByStory.set(
        projected.id,
        live.map((g) =>
          g.covers === undefined ? { id: g.id } : { id: g.id, covers: g.covers },
        ),
      );
    }
  }

  return { stories, uatTestCriteriaByStory, uatCriteriaByStory, coverageByStory };
}
