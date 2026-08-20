---
status: accepted
decided: 2026-08-03
amends: [38, 40, 226, 227]
load_bearing: true
---
# ADR-0296: The world renders no unhealthy state — withdrawn from the picture, kept in the vocabulary

## Status

accepted (2026-08-03) — decided/directed by the owner in conversation on 2026-08-03. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

During the ADR-0070 stage-2 LOOK for `act2-tree-and-plant-growth-arc` increment 1, the owner asked
for `unhealthy` to be removed: *"feels like its a state we will only get when we have lots of users,
to be honest we should remove unhealthy for now since its more of a distraction"*.

The state had just cost the increment real design attention for no delivered signal:

1. **It forced an art question that could not be answered.** ADR-0292 D3 shipped status-as-HUE only.
   A per-status FORM channel (stopping an island's tree at an early exp-16 frame) was built and
   measured out, because exp-16's early frames read as a *sapling*, not a withered tree — so a frame
   ceiling made `unhealthy` look like a seedling, the opposite of the signal. That left a named,
   unpaid cost: the active Storybook sheet carries an AUTHORED withered tree
   (`apps/studio/public/art-sheets/storybook/tree-unhealthy.png`), and a desaturated exp-16 is not it.
2. **The cost could not even be judged on screen.** The live corpus carries 33 proposed / 3 mapped /
   4 healthy and **zero** unhealthy islands, so the LOOK had nothing to look at.

Measured on the live store while deciding this (2026-08-03):

- **Zero authored rows.** No unit in `stories/**` authors `status: unhealthy`.
- **Zero derived rows.** Of 409 signed verdicts, exactly 2 are fails, both on `app-surface#uat-4`,
  whose LATEST verdict (seq 398) is a **pass**. Under `rollupStatus` a fail only demotes a *prior
  healthy* and the last event wins, so nothing rolls up to `unhealthy` either.

So the state is entirely unexercised today, in both the authored and the derived direction. But it is
**not** merely a hue: `unhealthy` is the system's word for "this failed its last signed run", and it
is load-bearing in the proof layer — `rollupStatus` / `rollupCapStatus` / `rollupStoryGreen` return
it, `applyUatCrowns` turns it into a fail crown, the UAT criterion state maps it to `failing`, and it
is a value in the `Status` enum in BOTH `packages/library/src/schema.ts` and the duplicated published
shape in `packages/proof-protocol/src/enums.ts`.

That splits the owner's ask cleanly in two, and only one half was actually requested.

## Decision

**Withdraw `unhealthy` from the world's RENDERED vocabulary. Keep it in the proof vocabulary,
untouched.**

1. **The fold is the one place it is expressed.** `worldStatus()` in
   `apps/studio/src/lib/worldStatus.ts` folds an authored `unhealthy → proposed`, alongside
   `building → proposed` (ADR-0038/ADR-0395). `provenStatus()` has no wither branch, so a signed
   **fail** falls through to the unit's authored ladder instead of painting a withered form: genuine
   `mapped` provenance remains brown; greenfield `proposed` remains amber. Every world surface sits
   behind this fold, so the withdrawal is complete at one seam without manufacturing provenance.
2. **ADR-0040's invariant is preserved, in the conservative direction.** A signed fail still can
   never paint green — it now **under-claims to unproven** rather than painting a distinct failure
   state. The system's stated rule is "never over-claim `healthy`"; this stays inside it.
3. **The failure stays legible.** It moves from the map to the node panel's verdict line, which
   already carried it — ADR-0040 §6 named that line as where an authored/signed disagreement shows.
4. **The legend drops the state entirely.** `unhealthy` leaves `STATUS_ORDER` and both "withered"
   tiles go, along with the `anyDeadFlora` fact that gated them. A tile left `absent` still RENDERS
   (greyed, "not in world yet") — leaving them would have kept the exact distraction on screen.
5. **The schema enum, the proof-protocol shape, and the rollups are NOT changed.** `Status` keeps all
   six values in both packages; `rollupStatus`'s fail→unhealthy demotion stands. No migration is
   implicated — and with zero rows holding the value, none is needed.
6. **The withered art is RETAINED, not deleted.** `tree-unhealthy.png` and the sheet's
   `tree:unhealthy` / `flora:unhealthy` entries stay, as do `scene.ts`'s withered-tree, dead-flora and
   wilt paths — unreachable rather than removed. This is the "for now" the owner asked for: restoring
   the state is the fold line plus the legend entry, not a rebuild of ADR-0226/0227's art.

**Not decided here:** removing `unhealthy` from the `Status` enum. That is a proof-vocabulary change
touching proof-protocol, the orchestrator rollups, the CLI and the desktop backend — a bigger call
than "remove it for now", and one the owner has not made. It is deliberately left open.

## Consequences

**Good.**

- The distraction is gone from the picture: no withered form to art-match, no legend tile advertising
  a state the corpus has never held, and no unanswerable per-status form question blocking a LOOK.
- The unpaid art cost ADR-0292 recorded (a desaturated exp-16 is not the authored withered tree) is
  **discharged rather than deferred** — there is no longer a withered form to match.
- Genuinely reversible, which is what "for now" demands. Two edits restore it, and the art it would
  need is still in the repo.
- No schema change, no proof-protocol change, no migration, no data risk.

**Bad / accepted.**

- **The map can no longer distinguish "failed its last signed run" from "never proven" at the same
  authored provenance rung.** Both read as that rung. This is a real loss of signal, accepted because the state has never occurred and
  the verdict line still carries it. It is the first thing to revisit if fails start landing.
- The authored-`unhealthy`-beats-a-signed-pass override goes with it: an authored `unhealthy` unit
  with a signed pass now renders green. Vacuous today (nothing authors it), but a genuine change to
  the fold's precedence.
- ~80 files still mention `unhealthy`, and most now describe unreachable paths. This is deliberate
  (point 6) but it does mean a grep for the term over-reports how much of it is live.
- The `Status` enum now carries a value the world cannot render — a deliberate asymmetry between the
  proof vocabulary and the picture, which is exactly what "withdrawn from the picture, kept in the
  vocabulary" means.

## References

- Directed by the owner in conversation, 2026-08-03, during the ADR-0070 stage-2 LOOK for
  `act2-tree-and-plant-growth-arc` increment 1.
- Amends [ADR-0038](0038-story-world-vocabulary-recalibration.md) (the world's status fold — this
  adds authored `unhealthy → proposed` beside `building → proposed`; ADR-0395 prevents absence or
  failure of proof from inventing brownfield provenance).
- Amends [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) (the wither half of
  the `provenStatus` fold is withdrawn; the green half and the never-over-claim invariant stand).
- Amends [ADR-0226](0226-unified-world-art-vegetation-vocabulary-grass-proves-capabil.md) /
  [ADR-0227](0227-baked-hero-trees-carry-status-via-per-status-colourways-rest.md) (the dead-grass and
  per-status withered colourway are retained but unreachable).
- Follows [ADR-0292](0292-every-island-grows-the-owner-s-exp-16-tree-from-one-shared-t.md), which
  measured the form channel out and recorded the art cost this decision discharges.
- Ratification basis: [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md).
- Code: `apps/studio/src/lib/worldStatus.ts` (the fold),
  `apps/studio/src/components/WorldLegend.tsx` (the legend).
