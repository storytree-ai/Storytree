import type { LegacyUatDispositionLedger } from "./legacy-uat-disposition.js";
import { legacyUatTestId, parseUatTestCriterionSources, uatItemOrdinal } from "./uat-test-criteria.js";

/**
 * A live UAT leg sitting on an ordinal the frozen cutover ledger has already BURNED.
 *
 * The house rule this enforces: when ADR-0294 D2 deletes a criterion, its `<story>#uat-N` key is
 * recorded `superseded` in `stories/uat-legacy-dispositions.json` and the ordinal `N` is spent
 * FOREVER — it denotes that one dead criterion in the append-only record, and nothing else may ever
 * denote it again. A deletion pass therefore leaves a GAP in the story's list (`studio-cloud` reads
 * 1, 2, 3, 7, 8), and must not close it.
 *
 * Nothing enforced that until now, and the reason is worth stating because it is the whole point of
 * this module: renumbering is FREE at the criterion tier. {@link uatItemOrdinal}'s doc records the
 * mechanism — the list number is stripped before the revision is hashed — so a pass that deletes
 * legs 4/5/6 and renumbers the survivors down onto 4/5 changes no criterion id, no revision id and
 * no proof-gate binding, and every rung that reads IDENTITY stays green while two different
 * criteria now answer to `studio-cloud#uat-4`.
 *
 * The damage is silent mis-attribution rather than a red: the NEXT author to delete that leg writes
 * their deletion rationale onto a key already superseded for someone else, either overwriting a
 * landed rationale or leaving the real criterion unaccounted for — while the frozen-282 check that
 * exists to protect exactly that record stays green throughout. It stood undetected on
 * `studio-cloud` for two weeks and was found by READING a stale prose cross-reference, not by any
 * instrument.
 *
 * Only `superseded` burns an ordinal, and the other two dispositions are excluded deliberately
 * rather than overlooked:
 * - `unresolved` — the criterion at that position was never adjudicated and is still live there.
 *   That is the NORMAL state of a surviving leg; treating it as burned would red the whole corpus.
 * - `mapped` — the key is bound to a named live criterion, so that criterion is precisely who
 *   belongs at the ordinal. (No entry currently holds this disposition.)
 *
 * An ordinal above every key the story carried at cutover is a leg authored since, and is free.
 *
 * **What this does NOT catch, stated so it is not read as broader than it is.** It compares against
 * the `superseded` keys only, so it sees a survivor moved onto a DELETED criterion's ordinal — the
 * measured incident — and not a survivor swapped onto another SURVIVOR's `unresolved` ordinal. That
 * second shape is also a mis-attribution, and it is unreachable from this data rather than
 * overlooked: an `unresolved` entry records no `criterionId` (that is what unresolved means), so
 * nothing here can say which live criterion an unresolved key was meant to denote. Closing it needs
 * those keys adjudicated to `mapped` first, which is ADR-0253's own migration path, not a check.
 */
export interface BurnedOrdinalCollision {
  readonly storyId: string;
  /** Repository-relative source path, retained so a failure names the file to open. */
  readonly sourcePath: string;
  /** The burned ordinal that a live leg has reused. */
  readonly ordinal: number;
  /** The frozen ledger key that ordinal denotes — already spent on a deleted criterion. */
  readonly legacyTestId: string;
  /** The live criterion now sitting on it. */
  readonly criterionId: string;
  readonly title: string;
  /** The rationale already written against the burned key, which names what it really denotes. */
  readonly burnedRationale: string;
}

/** One disk-canonical story document supplied by a read-only corpus reader. */
export interface BurnedOrdinalCollisionStory {
  readonly storyId: string;
  readonly sourcePath: string;
  /** The literal frontmatter-markdown document. This audit never writes it. */
  readonly body: string;
}

/**
 * Compare the two surfaces nothing compared before: live criterion POSITIONS against the frozen
 * ledger's burned KEYS. Read-only — it reports, and never repairs a story or the ledger.
 *
 * Both inputs come from their existing readers ({@link parseUatTestCriterionSources} and the
 * `LegacyUatDispositionLedger` schema), so this can never fork from the parse that decides identity.
 */
export function findBurnedOrdinalCollisions(
  stories: readonly BurnedOrdinalCollisionStory[],
  ledger: LegacyUatDispositionLedger,
): BurnedOrdinalCollision[] {
  const burned = new Map<string, string>();
  for (const entry of ledger.dispositions) {
    if (entry.disposition !== "superseded") continue;
    burned.set(entry.legacyTestId, entry.rationale);
  }

  const collisions: BurnedOrdinalCollision[] = [];
  for (const story of [...stories].sort((a, b) => (a.storyId < b.storyId ? -1 : a.storyId > b.storyId ? 1 : 0))) {
    for (const source of parseUatTestCriterionSources(story.storyId, story.body)) {
      const ordinal = uatItemOrdinal(source.source);
      // Only ever CONSTRUCT the positional key, with the constructor the ledger's own keys were
      // built by — so this lookup cannot drift from the ledger's key format.
      const legacyTestId = legacyUatTestId(story.storyId, ordinal);
      const burnedRationale = burned.get(legacyTestId);
      if (burnedRationale === undefined) continue;
      collisions.push({
        storyId: story.storyId,
        sourcePath: story.sourcePath,
        ordinal,
        legacyTestId,
        criterionId: source.criterion.criterionId,
        title: source.criterion.title,
        burnedRationale,
      });
    }
  }
  return collisions;
}

/**
 * Render collisions as the failure text. It names the repair rather than only the fault, because
 * the repair is not obvious: the live leg moves BACK to the ordinal it held at cutover (leaving the
 * gap), and the ledger — frozen and append-only — is never edited to accommodate it.
 */
export function describeBurnedOrdinalCollisions(collisions: readonly BurnedOrdinalCollision[]): string {
  return [
    `${collisions.length} live UAT leg(s) sit on an ordinal the frozen disposition ledger has burned:`,
    ...collisions.map(
      (collision) =>
        `  ${collision.sourcePath}: leg ${collision.ordinal} (${collision.criterionId} "${collision.title}") ` +
        `reuses ${collision.legacyTestId}, already superseded for a deleted criterion — ` +
        `${collision.burnedRationale.slice(0, 160)}`,
    ),
    "A deleted criterion's ordinal is spent forever: renumber the live leg back to the ordinal it",
    "held at cutover and leave the gap. Never edit the ledger to free the key.",
  ].join("\n");
}
