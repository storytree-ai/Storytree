import {
  proofBindingOutcome,
  type ProofBindingEvidence,
  type ProofBindingRefusal,
} from "./proof-binding-outcome.js";
import { parseReliabilityGates } from "./reliability-gates.js";
import { parseUatTestCriteria } from "./uat-test-criteria.js";
import { resolveWitness } from "./witness-resolution.js";

/** One disk-canonical story document supplied by a read-only corpus reader. */
export interface MachineLegBindingAuditStory {
  /** The story id used by the existing UAT and reliability-gate parsers. */
  readonly storyId: string;
  /** Repository-relative source path retained so a reader can locate the declaration. */
  readonly sourcePath: string;
  /** The literal frontmatter-markdown document. This audit never writes it. */
  readonly body: string;
}

/** The disk provenance of one audited machine criterion. */
export interface MachineLegBindingAuditProvenance {
  readonly storyId: string;
  readonly sourcePath: string;
}

/** Exactly one read-only audit row for one explicitly machine-witnessed UAT criterion. */
export interface MachineLegBindingAuditRow {
  readonly provenance: MachineLegBindingAuditProvenance;
  readonly outcome: ProofBindingEvidence | ProofBindingRefusal;
}

/**
 * Audit every and only explicit machine UAT legs in a disk-canonical corpus.
 *
 * This is diagnostic projection only: it parses the existing story text, delegates the strict
 * binding decision to {@link resolveWitness}, then preserves that decision through the landed
 * evidence-or-refusal adapter. It neither repairs source text nor invokes the declared command.
 */
export function auditMachineLegBindings(
  stories: readonly MachineLegBindingAuditStory[],
): MachineLegBindingAuditRow[] {
  const rows: MachineLegBindingAuditRow[] = [];
  const orderedStories = [...stories].sort(compareStories);

  for (const story of orderedStories) {
    const criteria = parseUatTestCriteria(story.storyId, story.body);
    const gates = parseReliabilityGates(story.storyId, story.body);

    for (const criterion of criteria) {
      // Human and undecided (`either`) criteria belong to their own witness paths, never this audit.
      if (criterion.witness !== "machine") continue;
      const resolution = resolveWitness(criterion, gates);
      if (resolution.witness !== "machine") {
        throw new Error(`${criterion.criterionId}: an explicit machine criterion resolved outside the machine branch`);
      }
      rows.push({
        provenance: { storyId: story.storyId, sourcePath: story.sourcePath },
        outcome: proofBindingOutcome(criterion, resolution),
      });
    }
  }

  return rows;
}

/** Stable lexical ordering avoids making an audit report depend on corpus-reader traversal order. */
function compareStories(a: MachineLegBindingAuditStory, b: MachineLegBindingAuditStory): number {
  if (a.sourcePath < b.sourcePath) return -1;
  if (a.sourcePath > b.sourcePath) return 1;
  if (a.storyId < b.storyId) return -1;
  if (a.storyId > b.storyId) return 1;
  return 0;
}
