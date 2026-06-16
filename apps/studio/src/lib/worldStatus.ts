// World-status presentation: how an authored Status and a signed verdict reach
// the story world. Display-level only — the schema and the authored frontmatter
// keep the full six-state vocabulary:
//
// - `retired` units don't render at all (ADR-0038). A retired story loses its
//   island, its roads and its rank influence; a retired capability leaves the
//   garden. (Search/resurrection is later work — the data still holds them.)
// - `building` wears `proposed` in the world (ADR-0038). Live work is already
//   signalled by session wisps (ADR-0033), and the proposed state keeps its
//   freedom to iterate — a separate hue bought nothing.
// - GREEN derives from the signed verdict, never from authored paint (ADR-0040,
//   completing ADR-0031's health-is-a-projection): a signed pass renders the
//   unit healthy; authored `healthy` with no signed pass under-claims to
//   `mapped` (brownfield — real, but unproven here and now). A story's verdict
//   is its OWN UAT node's, never a child roll-up (ADR-0033 d.4). Wither stays
//   unchanged: last signed run failed OR authored unhealthy — and authored
//   unhealthy wins even over a signed pass (the disagreement shows in the
//   panel's verdict line, not as a green crown).
// - Offline (DB down, verdicts absent) everything falls back to the authored
//   ladder, so a proven world UNDER-claims — the StoreBanner is the global
//   "proof layer absent" signal.

import type { DriftState, TreeCapability, TreeStory, TreeVerdict, WorkStatus } from '../types';

/** The drift states that wear a DISTINCT marker in the world (everything but `fresh`). */
export type DriftBadge = Exclude<DriftState, 'fresh'>;

/** The authored-ladder fold alone (ADR-0038): building reads as proposed. */
export function worldStatus(status: WorkStatus | null): WorkStatus | null {
  return status === 'building' ? 'proposed' : status;
}

/**
 * The status a unit WEARS once proof is folded in (ADR-0040) — hue is the
 * verdict's, the authored ladder keeps only its unproven rungs:
 * authored unhealthy / signed fail → unhealthy; signed pass → healthy (the
 * ONLY green source); authored healthy without a signed pass → mapped;
 * building → proposed; everything else as authored.
 */
export function provenStatus(
  status: WorkStatus | null,
  verdict: TreeVerdict | undefined,
): WorkStatus | null {
  if (status === 'unhealthy' || verdict?.outcome === 'fail') return 'unhealthy';
  if (verdict?.outcome === 'pass') return 'healthy';
  if (status === 'healthy') return 'mapped';
  return worldStatus(status);
}

/**
 * The DISTINCT drift marker a unit wears in the world (ADR-0016 §3 + ADR-0040 §7) — a SEPARATE
 * dimension from the proven hue ({@link provenStatus}), never a replacement for it. A once-green unit
 * that drifts keeps its green status AND gains this badge, so the "proven once, at commit X" record
 * is preserved and drift is NEVER a silent green→brown reversion (the whole point of ADR-0040 §7):
 *   - `fresh` / no signal → no badge (the proved span is unchanged — render as the plain proven hue).
 *   - `stale` → a described change moved the proved code; re-prove THIS unit — the prominent marker.
 *   - `drifted-undescribed` → changed but unexplained; DEMOTED (audit-only, never a re-UAT trigger) —
 *     a subtler marker, but still DISTINCT and never silently green.
 * Returning the badge (vs folding it into status) is what keeps the fold one-directional: status is
 * the proof's, drift rides alongside.
 */
export function driftBadge(drift: DriftState | undefined): DriftBadge | undefined {
  return drift === undefined || drift === 'fresh' ? undefined : drift;
}

/**
 * The stories the world renders: retired pruned (both tiers), building folded
 * into proposed, proof folded into the hue ({@link provenStatus}), and the
 * binding-staleness drift surfaced as a DISTINCT badge ({@link driftBadge}) that
 * rides ALONGSIDE the proven hue — never downgrading it (ADR-0040 §7). Everything
 * downstream of the fetch — layout, roads, focus, legend, panel — sees only this
 * presented world. `fresh`/absent drift is normalised away, so a unit carries a
 * `drift` field ONLY when it wears a marker.
 */
export function presentStories(stories: TreeStory[]): TreeStory[] {
  return stories
    .filter((s) => s.status !== 'retired')
    .map((s): TreeStory => {
      const { drift: _drift, ...rest } = s;
      const badge = driftBadge(s.drift);
      return {
        ...rest,
        status: provenStatus(s.status, s.verdict),
        ...(badge !== undefined ? { drift: badge } : {}),
        capabilities: s.capabilities
          .filter((c) => c.status !== 'retired')
          .map((c): TreeCapability => {
            const { drift: _cDrift, ...cRest } = c;
            const cBadge = driftBadge(c.drift);
            return {
              ...cRest,
              status: provenStatus(c.status, c.verdict),
              ...(cBadge !== undefined ? { drift: cBadge } : {}),
            };
          }),
      };
    });
}
