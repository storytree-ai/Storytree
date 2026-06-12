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

import type { TreeCapability, TreeStory, TreeVerdict, WorkStatus } from '../types';

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
 * The stories the world renders: retired pruned (both tiers), building folded
 * into proposed, and proof folded into the hue ({@link provenStatus}).
 * Everything downstream of the fetch — layout, roads, focus, legend, panel —
 * sees only this presented world.
 */
export function presentStories(stories: TreeStory[]): TreeStory[] {
  return stories
    .filter((s) => s.status !== 'retired')
    .map((s) => ({
      ...s,
      status: provenStatus(s.status, s.verdict),
      capabilities: s.capabilities
        .filter((c) => c.status !== 'retired')
        .map((c): TreeCapability => ({ ...c, status: provenStatus(c.status, c.verdict) })),
    }));
}
