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
// - GREEN derives from signed proof, never from authored paint (ADR-0040,
//   completing ADR-0031's health-is-a-projection). A capability needs its current
//   pass. A story verdict is the shared health resolver's combined answer over
//   undertaken capabilities plus its own UAT/reliability obligations; once that
//   scope is proven, its durable baseline survives merely incomplete later scope
//   (ADR-0443/0560).
// - BROWN exclusively means genuine inherited brownfield provenance (ADR-0395):
//   only authored `mapped` can fall through to mapped without a current pass.
//   On capabilities, defensive authored `healthy`/`unhealthy` and greenfield
//   `proposed`/`building` fall through to proposed amber when proof is missing
//   or failing (ADR-0296). Story crowns fail closed instead (ADR-0560): a signed
//   failure or an explicitly authored unresolved `unhealthy` state withers the
//   story, while proposed remains the genuine pre-baseline greenfield state.
// - Offline (DB down, verdicts absent) everything falls back to the authored
//   ladder, so a proven world UNDER-claims — the StoreBanner is the global
//   "proof layer absent" signal, and the map's database-connection light
//   (`lib/storeConnection.ts`) is the at-a-glance version of the same fact.
//   Note what neither covers: an app at an OLDER COMMIT under-claims exactly
//   like this with the database perfectly reachable, because verdicts bind to
//   criteria by revision id. The banner's "a newer version has landed … the
//   forest may be under-claiming" message is the only disclosure of that.

import type { DriftState, TreeCapability, TreeStory, TreeVerdict, WorkStatus } from '../types';

/** The drift states that wear a DISTINCT marker in the world (everything but `fresh`). */
export type DriftBadge = Exclude<DriftState, 'fresh'>;

/**
 * The authored provenance fold alone (ADR-0395): `mapped` is the sole brown
 * source; greenfield and defensive proof-derived authored states read as
 * proposed until signed proof establishes green.
 */
export function worldStatus(status: WorkStatus | null): WorkStatus | null {
  if (status === 'building' || status === 'healthy' || status === 'unhealthy') {
    return 'proposed';
  }
  return status;
}

/**
 * The status a unit WEARS once proof is folded in (ADR-0040 + ADR-0395):
 * signed pass → healthy (the ONLY green source); otherwise the authored
 * provenance fold supplies mapped brownfield or proposed greenfield.
 *
 * A signed FAIL no longer withers (ADR-0296) — it falls through to the authored
 * ladder, which under-claims it to an unproven rung. ADR-0040's invariant is
 * intact and strictly conservative: a fail can never paint green, and the
 * signed failure is still legible on the node panel's verdict line.
 */
export function provenStatus(
  status: WorkStatus | null,
  verdict: TreeVerdict | undefined,
): WorkStatus | null {
  if (verdict?.outcome === 'pass') return 'healthy';
  return worldStatus(status);
}

/**
 * The status a STORY crown wears once the shared story-health verdict is folded in.
 *
 * Story health is deliberately stricter than capability presentation
 * (ADR-0560 D1/D5): the server's verdict summarizes undertaken-capability health,
 * the story's own UAT/reliability obligations, and its durable baseline. A current
 * failure in that combined proof or an explicitly authored unresolved health issue
 * renders unhealthy. A pass greens the crown; otherwise the provenance fold
 * preserves mapped brownfield and genuine pre-baseline proposed greenfield.
 * Capability presentation continues to use {@link provenStatus}, retaining
 * ADR-0296's withdrawn failure hue there.
 */
export function storyStatus(
  status: WorkStatus | null,
  verdict: TreeVerdict | undefined,
): WorkStatus | null {
  if (verdict?.outcome === 'pass') return 'healthy';
  if (verdict?.outcome === 'fail' || status === 'unhealthy') return 'unhealthy';
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
 * into proposed, tier-aware proof folded into the hue ({@link storyStatus} and
 * {@link provenStatus}), and the
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
      const story: TreeStory = {
        ...rest,
        status: storyStatus(s.status, s.verdict),
        capabilities: s.capabilities
          .filter((c) => c.status !== 'retired')
          .map((c): TreeCapability => {
            const { drift: _cDrift, ...cRest } = c;
            const cBadge = driftBadge(c.drift);
            const cap: TreeCapability = {
              ...cRest,
              status: provenStatus(c.status, c.verdict),
            };
            if (cBadge !== undefined) cap.drift = cBadge;
            return cap;
          }),
      };
      if (badge !== undefined) story.drift = badge;
      return story;
    });
}
