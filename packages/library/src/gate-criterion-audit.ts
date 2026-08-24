/**
 * ADR-0436: the REVERSE-direction binding audit — gates → criteria.
 *
 * The corpus already checks legs → gates: every `(proof-gate:)` binding must resolve to a DECLARED
 * gate, and `auditMachineLegBindings` reports `bound-but-gate-missing: 0`. That reading is TRUE BUT
 * HOLLOW, because nothing asked the other question: does a gate's declared command still name a
 * criterion that EXISTS? Measured 2026-08-24 over all 46 story directories, **three gates did not** —
 * `desktop#gate-6`, `terminal-tabs#gate-1` and `terminal-tabs#gate-3` each named a `uatc_…` id its
 * story had deleted. Every driver works FORWARD from criteria, so an orphan gate is reachable only
 * BACKWARD from the obligation set and no walk could ever find it; two crowns sat capped at
 * `unproven` forever as a result.
 *
 * ONE audit over the whole corpus, never a check minted per story or per leg (ADR-0097 §2). Pure:
 * it parses the story text a reader supplies and returns rows. It never reads a store, never runs a
 * declared command, and never repairs source text.
 *
 * Two findings, which are the two halves of the same rule — a gate and the criterion it names must
 * live or retire TOGETHER:
 *  - `orphan-gate`   — a LIVE gate names a criterion the story no longer declares. Unsatisfiable:
 *                      it holds the crown at `unproven` forever. Retire it in place, `(retired)`.
 *  - `retired-binding` — a LIVE criterion's `(proof-gate:)` points AT a retired gate. Its proof route
 *                      is withdrawn, so the leg silently has no way to green. Bind it to a live gate
 *                      (appending one if needed) or leave it honestly unbound.
 */

import { activeReliabilityGates, parseReliabilityGates } from "./reliability-gates.js";
import { parseUatTestCriteria } from "./uat-test-criteria.js";

/**
 * A criterion id as it appears inside a gate's declared command. Matches the `uatc_<hex>` shape the
 * UAT parser mints; a gate command naming nothing of that shape (an ordinary `pnpm … test` gate) is
 * simply not about a criterion and is never audited.
 */
const CRITERION_ID_IN_COMMAND = /\buatc_[0-9a-f]+\b/g;

/** One disk-canonical story document supplied by a read-only corpus reader. */
export interface GateCriterionAuditStory {
  readonly storyId: string;
  /** Repository-relative source path, retained so a reader can locate the declaration. */
  readonly sourcePath: string;
  /** The literal frontmatter-markdown document. This audit never writes it. */
  readonly body: string;
}

export type GateCriterionFinding = "orphan-gate" | "retired-binding";

/** One read-only audit row: a gate/criterion pair that cannot both be true. */
export interface GateCriterionAuditRow {
  readonly finding: GateCriterionFinding;
  readonly storyId: string;
  readonly sourcePath: string;
  /** The gate at the centre of the finding. */
  readonly gateId: string;
  /** The criterion id the finding is about — named by the command, or holding the stale binding. */
  readonly criterionId: string;
  /** A reader-facing sentence naming what is wrong and what to do. */
  readonly detail: string;
}

/**
 * PURE: audit a disk-canonical corpus for gate↔criterion pairs that cannot both be true.
 *
 * Returns rows in a stable order (by source path, then gate id), so a report never depends on the
 * corpus reader's traversal order. An empty result is the healthy state.
 *
 * NON-VACUITY: a story whose text fails to parse THROWS rather than being skipped. A parse this
 * audit swallowed would read as "nothing wrong here" for the one story most likely to be wrong.
 */
export function auditGateCriterionBindings(
  stories: readonly GateCriterionAuditStory[],
): GateCriterionAuditRow[] {
  const rows: GateCriterionAuditRow[] = [];

  for (const story of [...stories].sort(compareStories)) {
    const criteria = parseUatTestCriteria(story.storyId, story.body);
    const gates = parseReliabilityGates(story.storyId, story.body);
    const declared = new Set(criteria.map((c) => c.criterionId));
    const retiredGateIds = new Set(gates.filter((g) => g.retired).map((g) => g.id));

    // (a) a LIVE gate naming a criterion that no longer exists.
    for (const gate of activeReliabilityGates(gates)) {
      const named = [...String(gate.proofCommand ?? "").matchAll(CRITERION_ID_IN_COMMAND)].map((m) => m[0]);
      for (const criterionId of named) {
        if (declared.has(criterionId)) continue;
        rows.push({
          finding: "orphan-gate",
          storyId: story.storyId,
          sourcePath: story.sourcePath,
          gateId: gate.id,
          criterionId,
          detail:
            `${gate.id} declares a command naming criterion ${criterionId}, which "${story.storyId}" ` +
            `no longer declares. The gate can never pass, so it holds the story crown at \`unproven\` ` +
            `forever (ADR-0085 own-proof union). Retire it in place with a \`(retired)\` tag — deleting ` +
            `it would renumber every later gate (ADR-0436).`,
        });
      }
    }

    // (b) a LIVE criterion bound to a gate that has been retired.
    for (const criterion of criteria) {
      const bound = criterion.proofGateId;
      if (bound === undefined || !retiredGateIds.has(bound)) continue;
      rows.push({
        finding: "retired-binding",
        storyId: story.storyId,
        sourcePath: story.sourcePath,
        gateId: bound,
        criterionId: criterion.criterionId,
        detail:
          `criterion ${criterion.criterionId} binds \`(proof-gate: ${bound})\`, but that gate is ` +
          `RETIRED — its proof route is withdrawn, so the leg has no way to green and no reader can ` +
          `tell. Bind it to a live gate (APPEND one; never reuse a burned ordinal) or leave it ` +
          `honestly unbound (ADR-0436).`,
      });
    }
  }

  return rows.sort(compareRows);
}

function compareStories(a: GateCriterionAuditStory, b: GateCriterionAuditStory): number {
  if (a.sourcePath !== b.sourcePath) return a.sourcePath < b.sourcePath ? -1 : 1;
  if (a.storyId !== b.storyId) return a.storyId < b.storyId ? -1 : 1;
  return 0;
}

function compareRows(a: GateCriterionAuditRow, b: GateCriterionAuditRow): number {
  if (a.sourcePath !== b.sourcePath) return a.sourcePath < b.sourcePath ? -1 : 1;
  if (a.gateId !== b.gateId) return a.gateId < b.gateId ? -1 : 1;
  return a.criterionId < b.criterionId ? -1 : a.criterionId > b.criterionId ? 1 : 0;
}
