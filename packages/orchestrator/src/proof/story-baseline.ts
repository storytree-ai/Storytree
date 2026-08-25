import {
  SIGNING_EVENT_KIND,
  Verdict,
  storyBaselineFingerprint,
  type StoryBaselineScope,
} from "@storytree/proof-protocol";

import type { OwnProofObligation, StoryCapabilityRef } from "./uat-proof.js";
import { type RollupEvent } from "./rollup.js";

/**
 * The story-BASELINE fold (ADR-0416 D6) — the READ-TIME half of the durable-green model.
 *
 * ADR-0416 D1 makes a story's green durable and D2 makes later scope ADDITIVE: a capability or
 * acceptance obligation declared after the proven baseline "appears in its own honest state — normally
 * amber until signed — and the story separately signals that it is expanding. The crown stays green."
 *
 * Two facts therefore need separate channels: the DELIVERED BASELINE (this story reached a signed,
 * working whole-story outcome) and the EXPANSION (work has been declared beyond it and is not proven
 * yet). The current crown compresses both into one colour; that is the modelling error ADR-0416
 * names. {@link storyBaselineOf} recovers the first from the event log and
 * {@link expansionBeyondBaseline} computes the second, so a surface can show BOTH — which D2 requires
 * of it: *"Silence is not acceptable: the new obligation must remain visible even though it does not
 * erase the baseline."*
 *
 * The SHAPES (`StoryBaselineScope`, the `sbl1:` fingerprint constructor) are proof-protocol's; this is
 * the COMPUTE half, the farmer organism's ruler (ADR-0068).
 */

/** What a story declares NOW, as the expansion diff reads it. */
export interface StoryDeclaration {
  readonly capabilities: readonly StoryCapabilityRef[];
  readonly obligations: readonly OwnProofObligation[];
}

/** The work declared beyond a proven baseline — ADR-0416 D2's second fact. */
export interface StoryExpansion {
  /** Capability ids declared since the baseline was signed. */
  readonly capabilityIds: readonly string[];
  /** Own-proof obligation ids declared since the baseline was signed. */
  readonly obligationIds: readonly string[];
  /** True iff anything at all lies outside the baseline — the one-look "is this story expanding?". */
  readonly expanded: boolean;
}

/**
 * READ-TIME: the scope of the LATEST story-baseline verdict for `storyId`, or `null` when the story
 * has never established one.
 *
 * Only a signed verdict whose `unitId` is the story AND which carries a {@link StoryBaselineScope}
 * counts — a capability verdict, a criterion verdict, and a story verdict signed before ADR-0416
 * existed all establish nothing here. Latest-wins by `seq`, so a re-proof at wider scope advances the
 * baseline (ADR-0416 D7: *"If it passes, the baseline advances"*).
 *
 * A `fail` verdict never establishes or advances a baseline — it is evidence the outcome is broken
 * (D3), not a record of what was proven. The previously established baseline stands.
 */
export function storyBaselineOf(
  storyId: string,
  events: readonly RollupEvent[],
): StoryBaselineScope | null {
  let baseline: StoryBaselineScope | null = null;
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.kind !== SIGNING_EVENT_KIND) continue;
    const parsed = Verdict.safeParse(event.doc);
    if (!parsed.success || parsed.data.unitId !== storyId) continue;
    if (parsed.data.outcome !== "pass") continue;
    const scope = parsed.data.storyBaseline;
    if (scope !== undefined) baseline = scope;
  }
  return baseline;
}

/**
 * PURE (ADR-0416 D2/D6): what this story declares that its proven baseline did NOT cover.
 *
 * `null` baseline ⇒ nothing is expansion. A story that has never been proven is not "expanding"; it
 * is simply unproven, and every declaration it carries is part of its FIRST attempt. Calling
 * everything expansion there would paint the expansion signal on every grey story in the world and
 * make it mean nothing.
 *
 * A declaration that has since been RETIRED is not expansion either — it is scope withdrawn, not
 * scope added — so a `retired` capability drops out of the diff.
 *
 * The comparison is by id, not by fingerprint: the fingerprint answers *"has the set moved?"* in one
 * cheap comparison, and this answers the question a reader actually asks — *"which ones are new?"*
 */
export function expansionBeyondBaseline(
  baseline: StoryBaselineScope | null,
  declaration: StoryDeclaration,
): StoryExpansion {
  if (baseline === null) {
    return { capabilityIds: [], obligationIds: [], expanded: false };
  }
  const knownCapabilities = new Set(baseline.capabilityIds);
  const knownObligations = new Set(baseline.obligationIds);

  const capabilityIds = declaration.capabilities
    .filter((c) => c.status !== "retired" && !knownCapabilities.has(c.id))
    .map((c) => c.id);
  const obligationIds = declaration.obligations
    .map(obligationId)
    .filter((id) => !knownObligations.has(id));

  return {
    capabilityIds,
    obligationIds,
    expanded: capabilityIds.length > 0 || obligationIds.length > 0,
  };
}

/**
 * PURE: does this declaration still match the baseline's fingerprint? A cheap one-comparison answer
 * to *"has the covered set moved at all?"*, in either direction — it also catches WITHDRAWN scope,
 * which {@link expansionBeyondBaseline} deliberately does not report.
 */
export function matchesStoryBaseline(
  baseline: StoryBaselineScope,
  declaration: StoryDeclaration,
): boolean {
  const fingerprint = storyBaselineFingerprint(
    declaration.capabilities.filter((c) => c.status !== "retired").map((c) => c.id),
    declaration.obligations.map(obligationId),
  );
  return fingerprint === baseline.fingerprint;
}

/** The id an own-proof obligation is recorded under in a baseline scope. */
export function obligationId(obligation: OwnProofObligation): string {
  return "criterionId" in obligation ? obligation.criterionId : obligation.id;
}
