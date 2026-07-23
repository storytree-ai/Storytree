---
status: accepted
decided: 2026-07-23
arc: grounded-art-machinery-arc
---
# ADR-0233: The forest-map ground tiling is always the Townscaper mesh; retire the substrate gear control

## Status

accepted (2026-07-23) — decided/directed by the owner in conversation on 2026-07-23. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Part of the studio-chrome cleanup
alongside [ADR-0231](0231-the-vegetation-vocabulary-is-permanent-studio-world-art-not.md) (the parallel
`veg` toggle retirement). No `amends` edge: the ground-tiling modes were a look-decision under the
world render ([ADR-0036](0036-story-world-studio-visualisation.md)), never a standalone ADR that
declared the substrate a tunable, so there is nothing to amend — this is the first ADR to fix the tiling.

## Context

The forest map's island ground has been drawn by one of four interior-tiling GENERATORS, selected by a
`substrate` gear select: the Townscaper irregular-quad `mesh` (the default since the owner's 2026-06-16
look-decision), plus three earlier spike alternates — the extruded classic `hex`, `relaxed-quad`, and
`relaxed-hex`. Mesh won that look-off and has been the lived default ever since; the three alternates
are spike residue that nothing depends on and no workflow selects. Carrying a four-way gear dial (and
its parallel generators in the web-mirrored forest-world core) for a settled, single-answer look is
chrome the owner asked to retire (studio-chrome cleanup, 2026-07-23) — the same call as the parallel
vegetation-vocabulary retirement (ADR-0231).

The `layout` gear control (DAG / dependency-aware / solar) is explicitly KEPT — the owner finds it
genuinely useful — so this is a targeted retirement of the ground-tiling dial only.

## Decision

The Townscaper irregular MESH is the one and only ground tiling — always rendered, never a dial.

Phased, so the trivial studio-side change lands first and the web-mirrored core change carries the
web-engine sync separately:

- **Studio (this unit):** remove the `substrate` `SelectControl` and its `normalizeSubstrate` alias from
  `worldSettings.ts` (the now-empty "Ground" gear section retires with it — the panel groups
  generically). `TreeView.tsx`'s ground reader becomes a fixed `'mesh'`, so the studio always builds the
  relaxed mesh cells; the `?substrate=` URL param goes inert. The binding contract in
  `worldSettings.test.ts` drops the substrate suite and pins `substrate` as a RETIRED key.
- **forest-world core (follow-on unit):** delete the now-dead non-mesh generators
  (`buildRelaxedHexCells` / `buildRelaxedQuadCells` and the `'relaxed-hex'` / `'relaxed-quad'` `SubstrateMode`
  members) from `packages/forest-world/src/substrate.ts`, narrowing `SubstrateMode` to `'mesh'`. Because
  forest-world is web-mirrored, that removal trips `check:web-engine` and MUST ride the
  `sync:web-engine` + submodule-pin + owner-gated web deploy dance — so it is a separate, escalated unit,
  not folded into the studio change.

The public website fold is unchanged: it renders the same mesh ground it already did.

## Consequences

- One fewer gear dial; the gear panel loses its "Ground" section. The default studio world is
  byte-identical to today's mesh render — this removes three unused alternates and a dial, not the look.
- The classic-hex / relaxed-quad / relaxed-hex ground renders are no longer reachable in the studio.
  They were spike residue superseded by mesh and depended on by nothing.
- Until the follow-on forest-world unit lands, `buildRelaxedCells` still carries the non-mesh branches as
  dead code (the studio just never calls them with a non-mesh mode). That cleanup is deferred behind the
  web-engine sync deliberately.
- Consistent with ADR-0231: attested, single-answer looks stop carrying gear toggles. The `layout`
  control is untouched (owner-valued).

## References

- [ADR-0036](0036-story-world-studio-visualisation.md) — the story-world render the tiling sits under.
- [ADR-0231](0231-the-vegetation-vocabulary-is-permanent-studio-world-art-not.md) — the parallel
  vegetation-vocabulary toggle retirement in the same studio-chrome cleanup.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — born accepted.
- `apps/studio/src/lib/worldSettings.ts`, `apps/studio/src/components/TreeView.tsx`,
  `packages/forest-world/src/substrate.ts` (the follow-on dead-code removal).
