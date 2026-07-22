---
status: accepted
---
# ADR-0171: Island placement is dependency-aware: stress-majorization layout with a soft hierarchy anchor

## Status

accepted (2026-07-07) — owner DIRECTED the goal in conversation on 2026-07-06: *"some
pathways travel a long way to reach their island (e.g. the `agent` island having a
pathway to the very top of the forest feels wrong) … what system determines island
placement today? … if there is no principled procedural placement that reflects the
dependency hierarchy, research an appropriate procedural layout system … still show
HIERARCHY, but the hierarchy IS the dependency chain — so a dependency-adjacent pair
should be spatially near and trails should be short."* The owner ratified the DIRECTION
(dependency-aware placement that shortens trails while keeping hierarchy). This ADR
records the specific ALGORITHM answering it. It shipped `proposed` behind a default-OFF
`?layout=stress` flag (PR #641) for the ADR-0070 two-stage proof — geometry red-green
machine-side, appearance owner-attested. On **2026-07-07 the owner attested the LOOK**
in the studio and directed that stress become the DEFAULT, so this ADR flips `accepted`
and the studio default moves from `dag` to `stress` (an absent `?layout` param now
renders the dependency-aware world; `?layout=dag` opts back to the old strict-layered
rows, kept as the fallback). Follow-up: item 4 of the same owner round — pushing trail
merging harder in the ADR-0169 router — re-tunes against this tighter placement.

*(Currency note — amended by [ADR-0229](0229-the-default-map-layout-is-dag-rows-again-the-dependency-awar.md)
(2026-07-23): the studio DEFAULT layout is **`dag` rows again**, not `stress` — against the ADR-0228
pathways-only map the owner judged the layered rows to read more cleanly and flipped the default back. The
`stress` (dependency-aware) placement decided HERE, its algorithm, and its picker option all **stand**;
only which layout a clean URL renders changed (`stress` is now one click / `?layout=stress` away). Corrected
in place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).)*

## Context

The map places story islands, then the ADR-0169 trail router routes `depends_on` edges
between their centroids. Today placement (`apps/studio/src/components/TreeView.tsx`
`buildWorld`) is a strict **Sugiyama layered layout**: each story gets a longest-path
dependency **rank** (`rankStories`, 0 = foundation), ranks become horizontal ROWS
stacked bottom-up, and within a row stories order by the barycenter of their placed
dependencies. Seeds then snap to the hex lattice and territories grow.

The failure the owner named is structural, not a bug: strict layering pins a node's y
**hard** to its rank, so a dependency edge from a low foundation (`agent`, rank 0, near
the bottom) to a high-rank consumer MUST span every rank between them — a trail across
the whole forest. This is inherent to "y = rank" as a hard constraint; restyling the
trail (ADR-0169) cannot fix a placement problem.

Two session research passes (2026-07-06) ground the fix. The consistent literature
answer: stop treating rank as a hard coordinate and treat it as a **soft downward
bias**, then let a **stress/energy** term pull dependency-adjacent nodes together.
This is the DiG-CoLa insight (Dwyer & Koren, *Directed Graph Layout through Constrained
Energy Minimization*, IEEE InfoVis 2005): a directed graph's hierarchy lives on one
axis as an energy term, standard stress (SMACOF; Gansner/Koren/North, *Graph Drawing by
Stress Majorization*, GD 2004) on the rest. The browser-cheap form is a per-node
anchor spring to the ideal level rather than a hard quadratic-program constraint.

## Decision

**1. A new studio placement mode `stress`, shipped default-OFF then promoted to
DEFAULT on attestation.** It joins the existing `dag` and `solar` modes as a third
`LayoutMode`, a gear-panel option ("Dependency-aware"). It shipped behind `?layout=stress`
with `dag` as the default (PR #641); on the owner's 2026-07-07 look-attestation stress
became the DEFAULT (an absent `?layout` param), with `?layout=dag` kept as the explicit
opt-back. *(The default was flipped back to `dag` by [ADR-0229](0229-the-default-map-layout-is-dag-rows-again-the-dependency-awar.md)
(2026-07-23) — `stress` stays a picker option; see the Status currency note.)* Only WHERE islands are seeded changes; seeds flow into the SAME hex-snap /
growth-floor / territory-growth / trail-routing pipeline, so the world reads as the same
forest — and `?layout=dag` still reproduces the byte-identical old layered world.

**2. The algorithm: localized stress majorization with a soft y-hierarchy anchor**
(`apps/studio/src/lib/stressLayout.ts`, `stressSeeds`), a pure function of
`(nodes, edges, seed)`:

- **Target distances.** All-pairs shortest-path HOP distances on the undirected
  dependency graph (BFS per node); `δ_ij = L · hops`, `L` a unit edge length scaled by
  mean island radius. Disconnected pairs get a finite far distance so components repel
  gently instead of flying apart. Weights `w_ij = 1/δ_ij²` (down-weight far pairs so
  local structure — short edges — dominates).
- **Soft hierarchy anchor.** Each node has an ideal level `yTarget = −rank · levelGap`
  (negative = up). The y-update blends an anchor spring `α·yTarget` alongside the stress
  pull; `α` is scaled to a node's mean stress weight (`alphaFrac`, the one
  hierarchy↔locality knob: 0 ⇒ pure stress / shortest edges; large ⇒ y pinned to rank ≈
  the layered `dag`).
- **Solver.** Seeded deterministic init (x scattered by id-hash, y on the hierarchy),
  then a fixed number of Gauss–Seidel majorization sweeps in a fixed id-sorted order,
  applying the per-node Guttman optimum. O(n²) per sweep — sub-100 ms at tens of
  islands. Centre the cloud on the origin.
- **Determinism (ADR-0169 §5 honesty).** All randomness hashes from ids; fixed
  iteration count (no float-threshold early-exit) and fixed sweep order; no `Math.random`,
  no clock. Same input → byte-identical output, pinned by test. A messy graph lays out
  messy — placement never curates to look clean.

**3. It shortens the long trail without hiding it.** A lone high consumer of a deep
foundation relaxes DOWN toward its dependency (the stress pull) instead of floating at
the top of its rank band (the strict-layering slack), so the `agent`→distant-consumer
trail is shorter. The edge still exists and is still drawn — a genuine bottom-to-top
dependency routes as a genuine (now shorter) trail; the honesty invariant is untouched.

**4. Two-stage proof.** Geometry is red-green (`stressLayout.test.ts`): hierarchy
monotonicity (a linear chain lays out monotone in y), the long foundation→consumer edge
SHRINKS vs a near-pinned (strict-layering) baseline, byte-determinism, order-
independence, finite coords on disconnected graphs. The APPEARANCE is owner-attested in
the studio before this flips `accepted` / becomes default.

## Consequences

- **Good.** The long-trail complaint is answered at its structural root (placement),
  upstream of trail routing — better placement directly shortens trails and reduces the
  side-by-side parallelism ADR-0169 tuning chases. Hierarchy is preserved (the y-anchor)
  while dependency-adjacent islands sit near (stress). Pure, deterministic, red-green
  testable. Flag-gated + default-OFF, so it cannot regress the current world; reversible
  by dropping the flag.
- **Cost / risk.** ~180 lines of new studio-side machinery + tests. Placement is
  studio-side (`buildWorld`), so this does NOT touch `forest-world/src` and trips no
  web-engine drift gate. The look could read too clustered or lose the top-down read if
  `alphaFrac` is miscalibrated — the invariant tests guard the geometry, the owner
  attests the look, and `alphaFrac`/`unit`/`levelGap`/`iters` are named constants tunable
  without re-deciding this ADR.
- **Reversibility.** One module + one seed-block branch + one gear option; the `dag`
  layered layout is untouched and remains default and fallback.

## References

- Owner direction 2026-07-06 (this session) — the long-trail complaint and the
  dependency-aware-placement goal.
- [ADR-0169](0169-pathways-are-procedural-reveal-on-focus-trails-cost-field-ro.md) —
  the trail router that consumes these centroids (item 5 of the same owner feedback
  round is upstream of ADR-0169's item-4 merge tuning); [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) —
  two-stage visual proof. The `solar` layout mode this sits beside is
  `apps/studio/src/lib/solarLayout.ts` (the `solar-system-world` proposal).
- Research (2026-07-06, session research agent): DiG-CoLa (Dwyer & Koren, InfoVis 2005);
  Stress Majorization / SMACOF (Gansner, Koren & North, GD 2004); IPSep-CoLa (Dwyer,
  Koren & Marriott, TVCG 2006, the hard-constraint variant in WebCola); Kobourov,
  *Spring Embedders and Force-Directed Graph Drawing*, 2012.
- Code: `apps/studio/src/lib/stressLayout.ts` (new) + `.test.ts`;
  `apps/studio/src/components/TreeView.tsx` (`buildWorld` seed block, `LayoutMode`);
  `apps/studio/src/lib/worldSettings.ts` (the gear option).
