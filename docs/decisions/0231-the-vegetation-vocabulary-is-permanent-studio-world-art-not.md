---
status: accepted
decided: 2026-07-23
amends: [226]
arc: grounded-art-machinery-arc
---
# ADR-0231: The vegetation vocabulary is permanent studio world art, not a gear toggle

## Status

accepted (2026-07-23) — decided/directed by the owner in conversation on 2026-07-23. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Amends
[ADR-0226](0226-unified-world-art-vegetation-vocabulary-grass-proves-capabil.md): the vegetation
vocabulary it introduced, which was then promoted to the default-ON `?veg` gear toggle, becomes
PERMANENT — the toggle and its `?veg=off` escape are removed outright.

## Context

The unified world-art vegetation vocabulary (ADR-0226 — grass = a capability's tests, small flowers =
the story's UAT, dead grass = an unhealthy capability, the human-witness signpost retired, the
`autumn-tree` hero as every island's central tree) shipped behind a default-ON `veg` gear toggle with a
`?veg=off` escape back to the pre-ADR-0226 world. The toggle was the how-the-look-is-shown affordance
during ADR-0070 stage-2 attestation; the owner attested the look (2026-07-22) and the vocabulary has
been the lived studio default since. The escape now guards a world nothing else references — the
pre-ADR-0226 decorative accents (wildflower / anemone / heather-bell) and the witness signpost are gone
from the vocabulary, so `?veg=off` only ever renders a strictly-worse legacy state that no workflow
depends on. Carrying a toggle for an attested, permanent look is chrome the owner asked to retire
(studio-chrome cleanup, 2026-07-23), alongside the parallel ground-tiling toggle retirement (a sibling
ADR in the same cleanup).

The `garden` / `cosy` grounded-art toggles were already retired by ADR-0228; `veg` was the last
grounded-art render switch standing.

## Decision

The vegetation vocabulary is PERMANENT studio world art, always composed — not a gear dial.

- Remove the `veg` `ToggleControl` from `worldSettings.ts` `CONTROLS`, and the now-empty "World art"
  gear section retires with it (the gear panel groups generically, so no section is left behind).
- Delete `readVegetationVocab` and the `?veg` / `?veg=off` escape entirely.
- `TreeView.tsx` `useVegetation` no longer takes an `enabled` flag: the vocabulary (grass, UAT flowers,
  dead grass, and the per-status `autumn-tree` hero colourways, ADR-0227) is always composed into the
  scene. The forest-world scene seam is unchanged — the studio always supplies `SceneInput.vegetation`.

This is studio-side only. The public website fold never sent `vegetation` (the forest-world core's
absence lock still holds), so the website render is unchanged.

## Consequences

- One fewer gear dial; the gear panel loses its "World art" section. The default studio world is
  byte-identical to today's `?veg` (default-ON) render — this removes an escape, not a look.
- The pre-ADR-0226 decorative-accent / witness-signpost world is no longer reachable in the studio. That
  legacy render was strictly superseded by the vocabulary and depended on by nothing, so nothing is lost
  that the owner has not already attested away.
- The binding contract in `worldSettings.test.ts` drops the `veg` toggle from the schema and the
  `readVegetationVocab` suite; the schema test now pins `veg` as GONE, so a re-introduction is caught
  red.
- Consistent with the parallel ground-tiling retirement (a sibling ADR in this cleanup): attested,
  permanent looks stop carrying gear toggles.

## References

- [ADR-0226](0226-unified-world-art-vegetation-vocabulary-grass-proves-capabil.md) — the vegetation
  vocabulary (amended here).
- [ADR-0227](0227-baked-hero-trees-carry-status-via-per-status-colourways-rest.md) — the per-status
  `autumn-tree` hero colourways, always composed now.
- [ADR-0228](0228-forest-map-defaults-to-pathways-only-shared-island-hubs-retu.md) — retired the
  `garden` / `cosy` grounded-art toggles; this ADR retires the last one (`veg`).
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — born accepted.
- `apps/studio/src/lib/worldSettings.ts`, `apps/studio/src/components/TreeView.tsx` (`useVegetation`).
