import { SCOPE_EVENT_KIND, ScopeEventDoc } from "@storytree/proof-protocol";

export interface ScopeEventResult {
  id: string;
  kind: string;
  type: "created";
  doc: ScopeEventDoc;
  actor: string;
}

/**
 * The scope-event COMPUTE (sibling of {@link usageEvent}, ADR-0446): build the appendEvent payload
 * for ONE authoring slice's write-scope record. The DATA shape it validates against
 * ({@link ScopeEventDoc}) is proof-protocol's.
 *
 * The id keys the slice — `scope:${runId}:${unitId}:${phase}` — so one gate run's two authoring
 * slices land as two distinct events. The `scope:` prefix is deliberate: `usageEvent` keys the same
 * slice as `${runId}:${unitId}:${phase}`, and two streams sharing an id is the kind of coincidence
 * that reads as a bug the first time somebody filters by it.
 *
 * OBSERVABILITY, never proof: the signed Verdict deliberately carries no fence record, and
 * `rollupStatus` ignores this kind entirely (conservative by construction — an unknown kind grants
 * nothing), so a scope row can never move a unit's derived status. Recording that the wall fired is
 * not the same act as judging what that means.
 */
export function scopeEvent(doc: ScopeEventDoc, actor: string): ScopeEventResult {
  const valid = ScopeEventDoc.parse(doc);
  return {
    id: `scope:${valid.runId}:${valid.unitId}:${valid.phase}`,
    kind: SCOPE_EVENT_KIND,
    type: "created",
    doc: valid,
    actor,
  };
}
