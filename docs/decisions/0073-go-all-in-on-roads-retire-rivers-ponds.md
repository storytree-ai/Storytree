---
status: accepted
decided: 2026-06-18
supersedes_in_part: [72]
amends: [62]
---
# ADR-0073: Go all-in on roads; retire rivers & ponds

## Status

accepted (flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) —
owner steer 2026-06-18, after [ADR-0072](0072-forest-world-edges-roads-reusing-the-routing-substrate.md)
shipped roads as a default-off flag with the river/pond machinery shelved. The owner's exact
direction: *"go all in on roads — remove the rivers and ponds entirely, make roads the one world, fit
the cozy Dorfromantik theme, and simplify the gear."* The **direction** (roads is the world; rivers +
ponds are removed) is the owner's firm call; the **appearance** is owner-attested under
[ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — this ADR records
the decision and the cut; the Dorfromantik look is judged by the owner's screenshot nod on the hosted
`#/tree` — the owner gave that nod on 2026-06-21, moving the status to `accepted`.

This **supersedes in part [ADR-0072](0072-forest-world-edges-roads-reusing-the-routing-substrate.md)**
— it keeps that ADR's decisions 1–2 (pivot the edge art element from water to roads; the
routing/geometry layer is the durable, restyleable substrate) and **reverses its decisions 3–4**
(*shelf the pond machinery, keep it* → **remove it**; *ship behind a flag, default OFF* → **roads is
THE world, no selector**). It carries forward the **amends** of
[ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) (the dependency-edge
signal keeps its meaning; its one art element is now roads, with no water alternative).

## Context

The forest map (`apps/studio`, route `#/tree`) renders the story dependency DAG as a stylised world.
After six rounds of river/pond iteration ([ADR-0072](0072-forest-world-edges-roads-reusing-the-routing-substrate.md))
the world carried two coexisting edge skins (water + road) behind a `?world=` selector, plus an
inland pond network, island moats, and ~15 tuning knobs — most of them river/pond-specific
(`weld`, `pondMouth`, `coast=crescent`, meander/repel/open-bias dials). The owner judged this
**over-complicated** and decided to go all-in on roads.

[ADR-0072](0072-forest-world-edges-roads-reusing-the-routing-substrate.md) chose to *shelf* the pond
machinery (keep it defined and tested, merely uninvoked) so the pivot was cheap and reversible. That
carrying cost — two skins, dead-but-tested pond helpers, a thicket of water-only flags — is exactly
the complexity the owner now wants gone. Git history preserves the water/pond work, so removal is not
loss; the owner may re-add a water world later from history if wanted, but not as shelved dead code in
the live tree.

A restyle-and-cut is cheap rather than a rewrite for the same two reasons 0072 named: the per-edge
**routing/geometry substrate is signal-bearing and look-agnostic** (where an edge goes carries the
dependency topology, independent of how it is painted), and the render scaffolding was *trail*
infrastructure (`roadClass` / `world-trail-*`) before it was ever water. So roads keeps the substrate
and the render passes; what is removed is the water/pond styling, the pond geometry, and the water-era
selectors.

## Decision

1. **Roads is THE forest-world edge styling — the only world.** The `?world=` selector and the water
   render path are removed; dependency edges always render as roads. The look targets the cozy,
   painterly **Dorfromantik** theme (soft, warm, hand-drawn), replacing the literal dirt-path styling
   of [#220](https://github.com/HuaMick/storytree/pull/220)/[#223](https://github.com/HuaMick/storytree/pull/223),
   which did not fit.

2. **Keep the routing/geometry substrate** (per
   [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) one-element-per-signal,
   and [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md)'s parameterised
   geometry): edge bundling / source-delta / island routing / coast geometry / the substrate tiling /
   `straightenPath` (`DIRT_PATH_STRAIGHTEN`) and the routing helpers they stand on
   (`edgePathBundle`, `distributaryChains`, `bearingClusters`, `routeAround`, `routeAroundBiased`,
   `confluenceTree`, `euclideanMST`, `treeDrainage`, `offsetCurve`, `smoothOpenPath`, `meanderPath`,
   `repelChannels`, `coastDock`). The dependency-edge signal keeps its meaning; only its art element
   is fixed to roads.

3. **Remove the river/pond machinery entirely** (not shelved): the inland **pond network** and every
   pond-only helper (`placePond` / `placePondAt` / `placeWeldPond` / `seatCrescentPond` / `pondRing` /
   `fusedPondShape` / `weldPondShape` / `pondRadiusForDegree` / `embayCoast` / `crescentApplies` /
   `nearestRimDock` / `fusedMouthPath` / `carvePondInlets` / `loopGapArcs` / `crownDisk` /
   `mergeInletBearings` / `extendEndpoint`), the **island moats**, the river **glint/flow animation**,
   the water-only CSS (`.inland-pond-*`, `.moat-*`, `.hex-water-border`, water `world-trail-*` paint,
   the glint keyframes), and the now-dead selectors + readers (`world` / `water` / `moat` /
   `coast=crescent` / `weld` / `pondMouth`) — together with the unit tests that covered the removed
   pure helpers. Removal is verified by green per-package gate, not by leaving the code dark.

4. **Simplify the gear** ([`WorldSettingsPanel`](../../apps/studio/src/components/WorldSettingsPanel.tsx)
   over the [`worldSettings`](../../apps/studio/src/lib/worldSettings.ts) `CONTROLS` schema): keep only
   the controls that genuinely shape the road world, rename them to intuitive road-world names, and
   render each control's plain-English description as a **visible sub-label** under the control (today
   the `hint` shows only as a hover `title=`). The water/pond controls (`world`, `pondMouth`, `weld`,
   `crescentMinDegree`) are removed; the river-meander/spread dials are trimmed to the few that
   meaningfully shape roads and renamed (e.g. a "Road straightness" dial bound to `DIRT_PATH_STRAIGHTEN`).

5. **Two-stage proof** ([ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)):
   the gear binding contract (`worldSettings.test.ts`) and the routing/road geometry
   (`riverGeometry.test.ts`) are proven **red→green** ([ADR-0020](0020-red-green-on-the-owned-loop.md));
   the **appearance** is **owner-attested** — built behind the work, surfaced as a hosted deep-link,
   never self-signed. Roads ships as the bare `#/tree` default on landing (the owner directed the
   all-in); the owner's nod confirms the look and flips this ADR to `accepted`.

## Consequences

- **Good.** One world, one edge skin, far fewer knobs — the over-complication the owner flagged is
  gone. The signal-bearing routing substrate and the render-pass scaffolding are reused unchanged, so
  this is a styling swap plus a large, mechanical deletion of pond/water code and tests. The gear
  becomes self-describing (visible hints) and road-named.
- **Cost.** The water/pond work leaves the live tree (preserved only in git history). Re-introducing a
  water world later means recovering it from history rather than flipping a flag — a deliberate trade
  of optionality for simplicity, made on the owner's call.
- **Reversible (via history).** The cut is recorded here and recoverable from git; it is not a flag
  toggle. The `proposed`→`accepted` flip waits on the owner's appearance nod, but the *direction* is
  firm and lands as the default now.

## References

- [ADR-0072](0072-forest-world-edges-roads-reusing-the-routing-substrate.md) — roads as a default-off
  flag with shelved ponds; this supersedes its decisions 3–4 (shelf→remove, flag→default) and keeps
  1–2 (water→road art element; routing substrate is durable/restyleable).
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — one element per
  signal; this amends it (the edge signal's art element is now roads, no water alternative).
- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — the geometry is a
  parameterised substrate; the styling on top is swappable.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — two-stage proof:
  red-green geometry + owner-attested appearance.
- [`apps/studio/src/components/TreeView.tsx`](../../apps/studio/src/components/TreeView.tsx) —
  `buildWorld` / `buildBundle`, the edge render passes, the scene className, the readers.
- [`apps/studio/src/lib/riverGeometry.ts`](../../apps/studio/src/lib/riverGeometry.ts) — the kept
  routing helpers and the removed pond helpers.
- [`apps/studio/src/lib/worldSettings.ts`](../../apps/studio/src/lib/worldSettings.ts) /
  [`WorldSettingsPanel.tsx`](../../apps/studio/src/components/WorldSettingsPanel.tsx) — the trimmed,
  self-describing road gear.
