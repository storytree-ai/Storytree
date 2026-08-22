/**
 * The UAT witness census — the corpus's witness distribution, read through the corpus's OWN parser.
 *
 * The `witness:` annotation is written two ways: standalone as `_(witness: human)_`, and FUSED with
 * a detail pointer as `_(witness: human)(detail: <story>#uat-<n>)_`. A scan for either literal form
 * therefore returns a partial census that is indistinguishable from a complete one — measured on
 * origin/main @ 984fd554, a grep for the standalone form saw 27 legs across 10 stories while
 * {@link parseUatTestCriteria} saw 42 across 17. The undercount reached two accepted ADRs (0348 and,
 * through a correct-in-place edit, 0295) and needed correction commits; worse, 11 legs were never
 * classified at all by a decision that claimed to adjudicate the whole population.
 *
 * So this counts through {@link parseUatTestCriteria} — the same reader the gate, the tree, the
 * build and the studio all use — and never through a pattern of its own. A census with a private
 * reader is a second instrument that can disagree with the corpus, which is the defect, not the fix.
 *
 * It is a pure projection over supplied story documents: it reads nothing and writes nothing.
 */

import {
  UAT_TEST_CRITERION_WITNESSES,
  parseUatTestCriteria,
  type UatTestCriterionWitness,
} from "./uat-test-criteria.js";

/** One disk-canonical story document supplied by a read-only corpus reader. */
export interface UatWitnessCensusStory {
  readonly storyId: string;
  /** Repository-relative source path, retained so every counted leg stays attributable. */
  readonly sourcePath: string;
  /** The literal frontmatter-markdown document. The census never writes it. */
  readonly body: string;
}

/** Exactly one counted UAT criterion. */
export interface UatWitnessCensusRow {
  readonly storyId: string;
  readonly sourcePath: string;
  readonly criterionId: string;
  readonly witness: UatTestCriterionWitness;
  readonly wouldBe: boolean;
  /** The leg's authored ADR-0357 D2 basis, when it states one. */
  readonly witnessBasis?: string;
}

export type UatWitnessTally = Readonly<Record<UatTestCriterionWitness, number>>;

export interface UatWitnessCensus {
  /** Every counted leg, ordered by source path then declaration order. */
  readonly rows: readonly UatWitnessCensusRow[];
  readonly total: number;
  /** Legs declared under a `(would-be)` UAT heading — visible so a reader can exclude them knowingly. */
  readonly wouldBe: number;
  /** Legs per witness. */
  readonly byWitness: UatWitnessTally;
  /** DISTINCT stories holding at least one leg of each witness (the count that was also wrong: 10 vs 17). */
  readonly storiesByWitness: UatWitnessTally;
  readonly storiesWithCriteria: number;
  /**
   * The ADR-0357 D4 gap: `human` legs stating no basis, in census order.
   *
   * D4 binds EVERY human leg, and its stated reason is auditability — "if only some human legs carry
   * a basis, hovering an unjustified one is indistinguishable from a bug, and the population stops
   * being auditable". That is a claim about a POPULATION, which no per-criterion schema can make: a
   * validator sees one leg and cannot say whether the set is complete. This is where the set is
   * visible, so this is where the gap is named — every offender at once, each still attributable to
   * its source path.
   *
   * Empty is the D4-satisfied state.
   */
  readonly humanWithoutBasis: readonly UatWitnessCensusRow[];
}

function emptyTally() {
  return { human: 0, machine: 0, either: 0 } satisfies Record<UatTestCriterionWitness, number>;
}

/**
 * Census the witness distribution of a corpus.
 *
 * Fail-closed: a story whose UAT section cannot be parsed is REFUSED with its source path, never
 * skipped. Skipping it would under-report in exactly the way the grep did, and silently.
 */
export function censusUatWitnesses(
  stories: readonly UatWitnessCensusStory[],
): UatWitnessCensus {
  const rows: UatWitnessCensusRow[] = [];
  const byWitness = emptyTally();
  const storyIdsByWitness = {
    human: new Set(),
    machine: new Set(),
    either: new Set(),
  } satisfies Record<UatTestCriterionWitness, Set<string>>;
  const storiesWithCriteria = new Set<string>();
  let wouldBe = 0;

  for (const story of [...stories].sort(compareStories)) {
    const criteria = parseCriteriaOrRefuse(story);
    if (criteria.length > 0) storiesWithCriteria.add(story.sourcePath);
    for (const criterion of criteria) {
      const row: Omit<UatWitnessCensusRow, "witnessBasis"> = {
        storyId: story.storyId,
        sourcePath: story.sourcePath,
        criterionId: criterion.criterionId,
        witness: criterion.witness,
        wouldBe: criterion.wouldBe,
      };
      rows.push(
        criterion.witnessBasis === undefined
          ? row
          : { ...row, witnessBasis: criterion.witnessBasis },
      );
      byWitness[criterion.witness] += 1;
      storyIdsByWitness[criterion.witness].add(story.sourcePath);
      if (criterion.wouldBe) wouldBe += 1;
    }
  }

  const storiesByWitness = emptyTally();
  for (const witness of UAT_TEST_CRITERION_WITNESSES) {
    storiesByWitness[witness] = storyIdsByWitness[witness].size;
  }

  return {
    rows,
    total: rows.length,
    wouldBe,
    byWitness,
    storiesByWitness,
    storiesWithCriteria: storiesWithCriteria.size,
    humanWithoutBasis: rows.filter(
      (row) => row.witness === "human" && row.witnessBasis === undefined,
    ),
  };
}

function parseCriteriaOrRefuse(story: UatWitnessCensusStory) {
  try {
    return parseUatTestCriteria(story.storyId, story.body);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${story.sourcePath}: the census cannot read this story's UAT criteria — ${reason}. ` +
        "A skipped story would under-report the population silently, so the census refuses instead " +
        "(recompute the story's revisions: storytree uat rerevision <story-id> --write).",
    );
  }
}

/** Stable lexical ordering keeps a census reproducible across corpus-reader traversal order. */
function compareStories(a: UatWitnessCensusStory, b: UatWitnessCensusStory): number {
  if (a.sourcePath < b.sourcePath) return -1;
  if (a.sourcePath > b.sourcePath) return 1;
  if (a.storyId < b.storyId) return -1;
  if (a.storyId > b.storyId) return 1;
  return 0;
}
