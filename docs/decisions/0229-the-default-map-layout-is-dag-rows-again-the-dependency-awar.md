---
status: accepted
decided: 2026-07-23
amends: [171]
arc: grounded-art-machinery-arc
---
# ADR-0229: The default map layout is DAG rows again; the dependency-aware and solar layouts stay in the picker

## Status

accepted (2026-07-23) — decided/directed by the owner in conversation on 2026-07-23, on the live map.
Design-time alignment IS the ratification (ADR-0110); the LOOK was attested in the same turn ("dag rows
… even works and looks better"). Amends [ADR-0171](0171-island-placement-is-dependency-aware-stress-majorization-lay.md):
it flips the studio's DEFAULT layout from `stress` back to `dag`, keeping ADR-0171's picker intact.

## Context

[ADR-0171](0171-island-placement-is-dependency-aware-stress-majorization-lay.md) made the
dependency-aware **stress-majorization** placement the studio default (owner-attested 2026-07-07),
because it shortened trails and read better than the old strict-layered `dag` rows *at that time* — when
the map still carried the off-map shared-island panel + per-island dependency stamps.

[ADR-0228](0228-forest-map-defaults-to-pathways-only-shared-island-hubs-retu.md) has since changed what
the map shows: the shared-island hubs are back on the map and every dependency is a pathway. Against that
pathways-only map, the owner looked at the layouts side by side and judged the **DAG rows** to read more
cleanly — the layered rows give the pathways a legible top-to-bottom flow. The layout choice was always a
switchable picker (ADR-0171 built the `?layout=` select precisely so the world can be changed), so this is
the owner exercising that choice as the new default, not a new mechanism.

## Decision

**Flip the studio's default layout from `stress` to `dag`.** A clean URL now renders the DAG rows; the
`stress` (dependency-aware) and `solar` (radial hub) layouts stay in the picker and are one click / one
`?layout=stress` | `?layout=solar` away. Concretely: `worldSettings`'s `normalizeLayout` fallback and the
`layout` control's `default` are `dag`; the select's options are unchanged (only reordered so the default
is first). `readLayoutMode` already falls through to `dag`, so it is untouched.

Nothing else about ADR-0171 changes: the stress placement, its dependency-aware majorization, and the
`buildWorld` internal default all stand — only which layout a clean URL renders is flipped.

## Consequences

- **Good:** the default map reads the way the owner judged best against the ADR-0228 pathways-only world —
  layered rows that give the trails a clear flow. Fully reversible: `?layout=stress` restores the
  dependency-aware world, and flipping the default back is a one-line change.
- **Bounded:** this is a default preference, not a capability change. The stress and solar layouts are not
  retired — they remain first-class picker options, so no work is lost.
- **Honest trade:** DAG rows do not shorten trails the way stress-majorization does; the owner accepted
  that, judging the row legibility the better default now.

Landing: studio-only (`apps/studio/src/lib/worldSettings.ts`). No `forest-world/src` change ⇒ no
web-engine sync. The public website sets its own layout and is unaffected.

## References

- Amends [ADR-0171](0171-island-placement-is-dependency-aware-stress-majorization-lay.md) (stress became
  the default there — now `dag`; the picker and the stress/solar layouts stand).
- Context: [ADR-0228](0228-forest-map-defaults-to-pathways-only-shared-island-hubs-retu.md) (the
  pathways-only default map this layout default is judged against),
  [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §6 (the solar layout),
  [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) (the LOOK is
  operator-attested), [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)
  (owner design-time direction is ratification).
- Arc: grounded-art-machinery-arc.
- Code: `apps/studio/src/lib/worldSettings.ts` (`normalizeLayout`, the `layout` control default);
  `apps/studio/src/lib/worldSettings.test.ts`.
