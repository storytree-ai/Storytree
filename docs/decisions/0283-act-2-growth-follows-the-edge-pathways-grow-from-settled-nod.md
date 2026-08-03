---
status: accepted
decided: 2026-08-02
arc: act2-intro-forest-regrow-arc
amends: [282]
---
# ADR-0283: Act 2 growth follows the edge: pathways grow from settled nodes, and one layout

## Status

accepted (2026-08-02) — decided/directed by the owner in conversation on 2026-08-02. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

The owner looked at the first Act 2 regrow increment (PR #1075, ADR-0282) in the real app on
2026-08-02 and **attested it** — "this looks good". That is the ADR-0070 stage-2 verdict on
increment 1, and it stands: the intro composes, the order is derived from the real DAG, and nothing
here reverses it.

The same sitting named what is wrong with how the growth READS, and it is a decision rather than a
tuning note.

**Increment 1 schedules by WAVE, and it shows.** ADR-0282 D3 fixed the ORDER (dependency order,
outward from the base nodes) and that part is right. The mechanism underneath it, though, was a wave
barrier: every island in depth-`w` starts accreting once depth-`w-1` has settled, and each island's
incident trails draw on *as it lands*. Dependency order is honoured — no island ever precedes the
ground it stands on — but the causality is invisible. What the viewer sees is a whole rank of islands
appearing at once, each from nothing, with roads catching up afterwards. The owner's words: "it looks
like lots of things are growing out of nothing." Only the roots have earned that.

The forest is a DAG whose edges are real dependencies. If the growth is supposed to say *the project
was built this way*, then the edge is the thing that carries the story: something already standing
reaches out, and only where it reaches does new ground appear.

**Growth also has to be legible against ONE arrangement.** Rows are already the default (ADR-0229
flipped it from `stress` on 2026-07-23, amending ADR-0171), so the attested regrow was already
running on DAG rows — this is not a switch. What remains is that `?layout=stress` and `?layout=solar`
are still offered, and any growth choreography has to be defensible on all three. In a row layout,
dependency depth IS the row, so an edge-driven growth reads down the map as a front. Under
stress-majorization placement the same schedule reads as motion scattered across the plane, because
the optimiser places for short trails, not for depth. The owner's call was to stop paying that tax:
"go all in on dag rows as the format ... so we don't have to cater to different layouts."

## Decision

### D1 — A node forms only when a pathway reaches it; only roots form from nothing

Growth is scheduled along EDGES, not in ranks:

1. **Base nodes** — the stories with no `depends_on` — form from nothing, at the start. They are the
   only islands that ever do.
2. When an island has settled, each of its **outgoing pathways grows outward from it**, along the
   real routed trail geometry, in the direction of the dependent.
3. A downstream island begins to form only when a pathway has **arrived** at it — that is, only once
   at least one incoming edge has finished drawing. ~~It still may not form before EVERY island it
   stands on has settled (ADR-0282's ordering invariant is unchanged and stays tested).~~
   **AMENDED by [ADR-0285](0285-an-island-forms-the-moment-a-pathway-reaches-it-not-when-all.md)
   (2026-08-02):** that second clamp is removed — the arrival IS the start time, with nothing else
   gating it. Measured on the real corpus, the clamp rather than the arrival set the start time for
   26 of 36 reached islands, which re-imposed DAG depth as the schedule: the wave barrier this
   decision set out to remove, in an edge-shaped costume. The causal invariant that remains — a
   pathway leaves only a SETTLED island, so nothing appears before the island that reached it —
   still holds and is still tested. Everything else in D1 stands.

The visible claim becomes causal rather than merely ordered: nothing appears unconnected, and every
island is visibly reached before it exists. This REPLACES the wave-barrier schedule and the
"trails draw on as the island lands" beat from ADR-0282's first increment. ADR-0282 D3 is otherwise
untouched — the sequence is still derived from the real story graph, never scripted (D8 still holds).

The wave concept survives only where it is honest: as a derived READOUT (depth in the DAG), not as
the scheduling primitive.

### D2 — One map layout: DAG rows

`dag` rows become the only layout. `stress` (ADR-0171) and `solar` (ADR-0074 §6) are retired as
selectable arrangements: the world-settings picker loses the control, and `?layout=stress` /
`?layout=solar` stop being honoured and fall through to rows like any other unknown value.

This is a **product** decision about what the map IS, not only an Act 2 convenience. The reason it is
worth its cost is that every growth, arrival and pathway choreography from here on has exactly one
arrangement to be correct against.

Whether the retired placement CODE is deleted or left dormant behind no caller is an implementation
call for the increment, not a decision here — but the picker entry, the query values and the
documented alternatives go.

### D3 — Not decided here

- The hero-tree candidate. ADR-0282 D2 fixes the count at one authored track and D8 forbids reading
  it as a selection; that question stays open on `chapter2-pixellab-organic-growth-arc`. Every tree
  in the regrow remains procedural until it resolves.
  **RESOLVED by [ADR-0292](0292-every-island-grows-the-owner-s-exp-16-tree-from-one-shared-t.md)
  (2026-08-03)** for the Act 2 regrow: the owner selected **exp-16**, mounted from one shared track
  on every island and frame-indexed off the island's own accretion cursor. ADR-0282 D2's count and
  D8's fence are amended there. The regrow's trees are no longer procedural; the sibling arc's
  whole-composition question is untouched and still open.
- The frame-cost floor. PR #1075 measured a forest-map regrow frame at ~383 ms p50 once the whole
  forest is on screen (against 17 ms at the start), and established by measurement — not by
  inheritance — that the cost is rasterisation proportional to node count, exactly as ADR-0272 found
  for pan. Edge-driven growth does not change that: it reschedules WHEN things appear, not how many
  nodes are painted. Lowering the floor needs paint isolation or the LOD work ADR-0272 de-sequenced,
  and that is its own decision.

## Consequences

**Good.**

- The intro stops asserting something false. Islands no longer appear unconnected, so what the map
  shows and what the dependency graph says finally agree.
- The edge becomes the protagonist, which is what makes the regrow readable as *how the project was
  built* rather than as a pretty fill-in.
- Edge-driven scheduling is simpler than the wave barrier it replaces: a node's start time is a
  function of its incoming edges' arrivals, so the plan needs no global rank barrier at all.
- One layout means one thing to be correct against — for this arc and for every later one.

**Costs and risks.**

- Retiring `stress` and `solar` removes work that was built and, in `stress`'s case, previously
  owner-attested (ADR-0171). It is a deliberate narrowing, not a defect being cleaned up.
- Total regrow duration becomes a function of the graph's longest dependency CHAIN plus per-edge
  draw time, so a deep corpus takes longer than the current wave schedule. The increment will need to
  keep the whole run watchable without flattening the causality that is the point.
- A story whose `depends_on` names an island the router could not route has no arriving pathway. The
  increment must give it an honest fallback rather than stranding it off the map — the ADR-0282
  precedent for cyclic stories (they land, visibly, rather than being dropped) applies.
- The frame-cost floor is untouched and still unacceptable in the last third.

## References

- [ADR-0282](0282-the-act-2-intro-regrows-the-whole-forest-app-native-one-focu.md) — the Act 2 intro
  regrows the whole forest app-native; amended here in mechanism, not in order or scope.
- [ADR-0229](0229-the-default-map-layout-is-dag-rows-again-the-dependency-awar.md) — made DAG rows
  the default; this ADR removes the alternatives it kept in the picker.
- [ADR-0171](0171-island-placement-is-dependency-aware-stress-majorization-lay.md) — the stress
  placement being retired as a selectable layout.
- [ADR-0272](0272-a-forest-map-pan-frame-is-rasterisation-not-density-pan-move.md) — a forest-map
  frame's cost is rasterisation; re-confirmed by measurement for the regrow in PR #1075.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the owner holds
  the LOOK verdict; increment 1 was attested under it on 2026-08-02.
- PR #1075 — the attested first increment, and the measurements cited above.
- Arc `act2-intro-forest-regrow-arc` — this initiative.
