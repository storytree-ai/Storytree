import { USAGE_EVENT_KIND, UsageEventDoc } from "@storytree/proof-protocol";

/**
 * The usage-event COMPUTE (sibling of {@link workEvent} in rollup.ts): build the appendEvent
 * payload for one per-slice token-usage row. The DATA shape it validates against
 * ({@link UsageEventDoc}) is proof-protocol's; the id keys the slice — `runId:unitId:phase` —
 * so one gate run's two authoring slices land as two distinct events.
 *
 * Usage is ACCOUNTING, never proof: the signed Verdict deliberately carries no runtime cost, and
 * `rollupStatus` ignores this kind entirely (conservative by construction — an unknown kind grants
 * nothing), so a usage row can never move a unit's derived status.
 */
export function usageEvent(
  doc: UsageEventDoc,
  actor: string,
): { id: string; kind: string; type: "created"; doc: UsageEventDoc; actor: string } {
  const valid = UsageEventDoc.parse(doc);
  return {
    id: `${valid.runId}:${valid.unitId}:${valid.phase}`,
    kind: USAGE_EVENT_KIND,
    type: "created",
    doc: valid,
    actor,
  };
}
