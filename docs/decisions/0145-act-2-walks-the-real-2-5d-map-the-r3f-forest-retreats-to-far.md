---
status: accepted
decided: 2026-07-03
amends: [123, 134]
---
# ADR-0145: Act 2 walks the real 2.5D map — the R3F forest retreats to far-future

## Status

accepted (2026-07-03) — decided/directed by the owner at the `act2-guided-walkthrough` attestation
gate on 2026-07-03. Design-time alignment IS the ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)); no second end-of-flow ask.

## Context

The Act 2 guided walkthrough
([`stories/website-experience/act2-guided-walkthrough.md`](../../stories/website-experience/act2-guided-walkthrough.md))
was built exactly as [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md)
§3's tech note specified: the five beats grew a **3D forest** on the
[ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) R3F WebGL island.
The machine floor was green (parent gates, build, a 61-check Playwright witness) and the build was
staged as storytree-web draft PR #20 for the [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)
stage-2 owner gate.

At that gate (2026-07-03) the owner **refused the appearance verdict and re-decided the substrate**,
verbatim:

> "I dislike how we have turned storytree into a 3D interface, i think that was always on the cards
> in the far future, but atm it looks ugly and doesnt represent story tree. Since story tree is built
> 2.5D and is possible to comply host the map on the web, i want a real map as the act 2 walkthrough,
> walking through the user through each concept slowly, so they actually see something representative
> of the real product but also are walked through slowly how it works."

And on the narration surface (asked at the same gate):

> "in a game tutorial there are callout boxes next the the actual UI element you are talking about
> its way more dynamic so you dont have to read the bottom, the callout boxes point to exactly where
> your eyes should go and talk to the item"

And on Act 1 / the landing:

> "keep the landing act 1 looks amazing, its terminals so its not 3d but if its built ontop of a 3d
> engine then keep it"

The forces that make the pivot cheap and coherent:

- **The 2.5D rail already exists on the site.** `web/src/lib/worldSvg.ts` is the website twin of the
  studio's `SceneView` — it folds a `World` into the synced core's `SceneInput`, calls `buildScene`
  (the REAL product's scene graph, [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)
  strategy C), and emits SVG strings. The home map (`TreeWorld.astro`) and how-it-works page render
  it today. A 2.5D walkthrough shows the actual product's look, which is the owner's point.
- **The choreography engine is renderer-agnostic.** `act2-beat-director` (parent-proven, zod-contracted)
  speaks semantic deltas (plant-story / attach-wisp / branch-caps / add-roads / pull-back) and never
  imported a renderer. The five beats, proof-gated greening, and the flagged wrong-way road survive
  the pivot untouched — only the site's render layer swaps.
- **Anchored callouts want 2.5D.** Game-tutorial callouts must point at the element being taught;
  the SVG map exposes per-element `data-id` geometry to anchor to — on the 3D canvas that anchoring
  was the hard part (the R3F build fell back to a narration panel).

## Decision

1. **Act 2's walkthrough grows the REAL 2.5D map.** The beat states
   (`DirectorState.world`) fold into the synced `buildScene` scene graph and render as the website's
   2.5D SVG — the `worldSvg`/`TreeWorld` rail — so the visitor watches something representative of
   the actual product. Fictional diorama data stays (the
   [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md)/[ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)/[ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)
   boundary holds by construction).
2. **The R3F 3D forest retreats to far-future.** "Always on the cards in the far future" — but it is
   not the Act 2 surface now. [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)'s
   renderer choice stands for whenever the forest is next rendered spatially; what this ADR
   overtakes is its trajectory of the walkthrough as that mount.
3. **Act 1 and the inflection stay as built.** The storm and the storm→land transform "look amazing"
   and are owner-attested, live surfaces — keep them, including the R3F-mounted landing moment if
   that is what the transition rides ("if its built ontop of a 3d engine then keep it"). How the
   landing hands off to the 2.5D walk is the rebuild's design seam; the owner gate judges the result.
4. **Narration is anchored callout boxes.** Each beat's copy appears in a callout pointing at the
   exact map element it teaches — "where your eyes should go" — not a fixed panel the visitor reads
   at the bottom. Plain language and the build-time narration/script validation wall carry over.
5. **Everything else in the walkthrough spec is unchanged:** five beats, Next-only visitor pacing,
   Back/skip/Escape affordances, the honest diorama-closing CTA.
6. **The replay/deep-link question is closed: replay-only is final.** At the same gate the owner
   closed [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) §5's last
   open UX half: the experience replays every visit and Act 2 gets **no** standalone deep-link.

## Consequences

- **storytree-web draft PR #20 closes unmerged, superseded by this re-decision** (disposition
  comment carries the owner verdict). Its renderer-agnostic pieces are salvage for the rebuild: the
  narration copy, the `act2-validate` build-time wall, the pacing/beat UI logic, and the PR #15
  FAQ-drawers rider (whose fate stays parked with web PR #15).
- **The `act2-guided-walkthrough` cap is re-specified** (2.5D substrate + callout narration, citing
  this ADR) and stays `proposed` until rebuilt and owner-attested. `act2-beat-director`,
  `web-experience-sync`, and the guardrails are untouched — their proofs hold.
- **`packages/forest-world-r3f` and the site-side r3f sync stay** — the live inflection landing uses
  them today, and the far-future spatial forest is still ADR-0123's domain. The ADR-0123 asset/perf/
  mobile-budget obligation no longer grows with the walkthrough; it scopes to the landing moment
  (~331 kB gzip lazy chunk at the transform click). The owner expressed no budget preference at this
  gate — it stays an open owner call, with its urgency reduced.
- **The rebuild must run the 2.5D fold per beat client-side or pre-render per-beat scenes at build
  time.** `worldSvg.ts` is pure string building (deterministic, no wall-clock/`Math.random`), so
  either is viable; the choice is the builder's, not fixed here.
- The [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) §3 tech note
  and [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)'s
  public-mount trajectory are corrected in place (per ADR-0139) to cite this ADR.

## References

- [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) — the R3F
  renderer decision this ADR **amends**: still the answer for a spatial forest, no longer the Act 2
  walkthrough's surface.
- [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) — the two-act
  experience this ADR **amends**: Act 2's tech note (§3) re-decided to the 2.5D map; §5's
  replay/deep-link half closed (replay-only).
- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — the shared
  scene-graph core; the website SVG-string mapper is the rail the walkthrough now rides.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage
  visual proof; this pivot IS a stage-2 owner verdict doing its job.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — why this is born accepted.
- [`stories/website-experience/act2-guided-walkthrough.md`](../../stories/website-experience/act2-guided-walkthrough.md)
  — the re-specified cap.
- storytree-web draft PR #20 (closed superseded) — the R3F walkthrough as built, machine floor green;
  web PR #15 — the still-parked FAQ-drawers home.
