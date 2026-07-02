---
status: accepted
decided: 2026-06-27
amends: [93]
---
# ADR-0123: WebGL forest-world renderer via react-three-fiber, website-first

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. Scoped deliberately to the
**renderer/framework** for a spatial forest-world view; the public website's "vibe-coding game"
experience concept that motivated it is still in design (a separate session) and is **not** decided here.
*(Since decided: [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md),
accepted 2026-07-02 — its Act 1 storm is now the live front door. Noted in place per ADR-0139.)*

## Context

A design-research pass on Abeto's WebGL game *Messenger* (messenger.abeto.co) prompted the owner to
rethink the public website as an immersive, *felt* experience rather than explanatory copy — and to ask
whether a spatial/3D "map" view of the forest world should be built in WebGL using an established
framework, "so we don't have to do everything from scratch."

The forces:

- **Today the forest world is 2D SVG only.** [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)
  established one shared `forest-world` core with thin per-surface mappers — the studio renders the
  scene-graph as **React SVG**, the public website as **SVG strings**. Both are flat: solid fills, 1px
  strokes, faked extrusion via a flank polygon; the only effect is a sub-pixel blur. There is no depth,
  lighting, GPU particle capacity, or shader-authored look, and SVG's node-count / CPU ceiling bounds
  how large or animated a world can get.
- **"Modern" here means GPU-native, not merely newer.** WebGL (three.js) draws on the GPU in immediate
  mode — real 3D, lighting, instancing, custom shaders at 60fps — where SVG is declarative 2D managed by
  the DOM. The two are different tools, not old-vs-new: SVG is *correct* for an operable, accessible,
  deterministic product surface; WebGL is *correct* for an immersive experience. (WebGPU is the genuinely
  newer successor but is not required here and narrows browser support.)
- **The expensive part of Messenger's stack was "custom-everything."** Per the creators (Communication
  Arts), three.js was the only off-the-shelf piece; the shaders, controls, camera, networking and backend
  were bespoke — months of specialised work. The owner's instinct is right: adopt an established
  higher-level framework so the plumbing (camera, controls, loaders, instancing, LOD) is not rebuilt.
- **The map view is an app surface, not content.** It needs neither SSR nor SEO — search engines don't
  index a canvas, and WebGL can't be server-rendered. It can be a client-only island. What it still owes
  (even without SEO) is a non-WebGL / reduced-motion / assistive fallback.
- **The studio is a different case.** The studio is an *operable* product (read, comment, build, manage
  members); its visual surface earns a two-stage proof ([ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md))
  and relies on DOM affordances (keyboard, screen-reader, focus) and byte-stable determinism that a
  canvas forfeits. WebGL is therefore a website-first bet, not a studio change.
- **The boundary still holds** ([ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md)
  / [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) /
  [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) Decision 3/4): the
  public site consumes a parent-built *artifact* of the shared look, never private source or live data,
  and keeps its own fictional demo data.

## Decision

When storytree renders the forest world **spatially / in 3D** — beginning with the public website's
immersive "map" view — build it with an **established WebGL framework: three.js via react-three-fiber
(R3F) + drei** — **not** raw three.js custom-everything, and **not** a bespoke renderer.

1. **R3F is a third forest-world mapper**, a peer of the studio React-SVG mapper and the website
   SVG-string mapper under the [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)
   shared core. It consumes the shared **semantic layer** — the `forest-world` `World` geometry plus the
   scene-graph's `kind` / position / variant / folded-status — and **supplies its own 3D geometry**,
   branching where the 2D SVG primitive geometry would otherwise be consumed (a flat hex polygon becomes
   an extruded / instanced mesh; a tree drawable becomes a 3D model; a wisp becomes a GPU sprite / point).
   The deterministic world-computation is **reused, not re-derived** — we draw the *existing* world in 3D.
2. **Use the framework for the plumbing; reserve bespoke work for the art.** R3F + drei supply the camera,
   `MapControls` / `OrbitControls`, GLTF / KTX2 loaders, `<Instances>`, environment and postprocessing —
   the "don't build from scratch" surface. The signature painterly look (procedural, noise-driven, à la
   Messenger) remains **custom shader work**; the framework removes plumbing, not art direction. Expect
   *quick* to a navigable stylised 3D map, *iterative* to a distinctive look.
3. **It renders as a client-only, non-SSR island.** The hosting page may still SSR its copy for SEO; the
   map is lazy-loaded (`ssr:false`), ideally behind interaction. A **fallback is a prerequisite, not
   polish**: a static image / reduced view for no-WebGL, `prefers-reduced-motion`, and assistive tech.
4. **The public/private boundary is preserved.** The WebGL mapper rides the same artifacts-not-source flow
   as the SVG-string mapper ([ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)
   Decision 3): the shared render logic flows parent → site as built output; the site keeps its fictional
   data. No live or private data crosses into the canvas.
5. **The studio stays SVG.** This ADR adopts WebGL **website-first only**. A studio WebGL "spatial mode"
   is explicitly **not** decided here; if ever pursued it is a separate, larger ADR weighed against the
   studio's operability, accessibility, and determinism guarantees.

**Out of scope / not decided here** (deferred to the website-rebuild session and follow-on work): the
website's two-act "vibe-coding game" experience concept; the exact package home of the R3F mapper (a
`story-author` call, not fixed here); the asset / performance budget and LOD strategy; how the painterly
shaders are authored; and any realtime multiplayer / presence networking. The signature look and the
netcode are the real cost centres and remain open.

> **Correction (2026-07-02) — two of the deferrals have since resolved.** The experience concept is
> [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) (accepted
> 2026-07-02), unpacked
> in [`stories/website-experience/`](../../stories/website-experience/story.md). The `story-author`
> call on the package home was made there: the R3F mapper lives **parent-side as
> `packages/forest-world-r3f`**, owned by that story — and the package is now BUILT: the pure
> `world-to-3d.ts` descriptor mapping is leaf-proven (red→green, a signed PASS), with the
> `<ForestWorldCanvas>` + drei `MapControls` dev harness landed as witnessed glue. Later the same day
> (the inflection cap, owner-attested, web main `6546486`) the island reached the **public site** for
> the first time — mounted client-only, lazy-loaded at the click of ADR-0134's inflection exactly per
> Decision 3 (behind interaction: first fetch at the click, no prefetch), resolving into Act 2's empty
> land. The asset / perf /
> mobile budget, LOD strategy, painterly shaders, and any presence netcode genuinely remain open,
> carried as that story's open modeling calls.
>
> **Correction (2026-07-03)** — at the Act 2 walkthrough's attestation gate the owner re-decided
> that surface onto the **real 2.5D map**
> ([ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)): the R3F
> island's public surface is now the inflection's landing moment only, and the spatial 3D forest
> retreats to far-future ("always on the cards in the far future" — the owner's words). This ADR's
> renderer choice stands for whenever the forest is next rendered spatially; it is no longer the
> Act 2 walkthrough's mount.

## Consequences

**Good.**
- The website can become an immersive, felt experience (the owner's intent) on a proven, well-documented
  stack, **reusing the existing `forest-world` world-computation** rather than standing up a parallel engine.
- Adopting R3F + drei avoids the custom-everything trap the research flagged: the plumbing is
  off-the-shelf; effort concentrates on the look.
- Staying within [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)'s "one
  core, many mappers" shape makes this **additive** — a third mapper — not a rewrite, and the
  public/private boundary is untouched.
- The studio is unaffected and keeps its accessibility / determinism guarantees.

**Bad / costs.**
- **A second rendering paradigm enters the codebase.** R3F / three.js is a real skill and maintenance
  surface (shaders, GPU memory, asset pipeline) distinct from our SVG / React norm.
- **The distinctive look is still bespoke.** "Use a framework" buys the scaffold, not the art; the
  painterly shader work and any presence netcode are unestimated here.
- **Accessibility / SEO are forfeited inside the canvas** and must be bought back with a real fallback — a
  standing obligation, not a one-off.
- **A new asset / perf budget and mobile story** are required (GPU-compressed textures, instancing, LOD,
  no-WebGL path) before this ships to real visitors. *(Since 2026-07-02 the island **has** shipped to
  real visitors, in a deliberately minimal form — the inflection's empty land, one lazy chunk, no heavy
  assets — with the no-WebGL / reduced-motion / import-failure exits built and owner-attested. Since
  2026-07-03 the Act 2 walkthrough no longer rides the island
  ([ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md) — it walks the
  real 2.5D map), so the budget obligation scopes to the landing moment (~331 kB gzip, lazy, fetched
  only at the transform click) and no longer grows with the walkthrough. It remains an open owner
  call — no preference expressed at the 2026-07-03 gate — with its urgency reduced. Corrected in
  place per ADR-0139.)*
- The branch point (R3F consumes the semantic layer, not the 2D primitives) adds a small amount of
  conceptual surface to the shared-core contract that the implementing story must hold precisely.

## References

- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — the shared
  forest-world render core (one core, thin per-surface mappers) this ADR **amends** by adding a third,
  WebGL mapper.
- [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md) — the studio forest
  world; the canonical 2D look the 3D mapper renders spatially.
- [ADR-0069](0069-parameterise-the-forest-world-geometry-as-a-procedural-pipel.md) — the procedural
  geometry pipeline whose `World` output the R3F mapper consumes.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage visual
  proof; why the operable studio stays SVG and a painterly/visual verdict is operator-attested.
- [ADR-0100](0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md) — consuming surfaces
  incl. the public website subrepo, where the website-first WebGL view lands.
- [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) /
  [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) — the public/private
  boundary (artifacts-not-source, fictional data stays site-side) the WebGL mapper preserves.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment as
  ratification (why this is born accepted).
- [ADR-0050](0050-adr-number-allocation.md) — how this ADR's number was allocated (offline max+1;
  reconcile with `--pg` next time the DB is up).
- External: Abeto *Messenger* (messenger.abeto.co) + the Communication Arts creator Q&A — the research
  that motivated this; **react-three-fiber** / **drei** (the adopted framework); Bruno Simon's portfolio
  (three.js + Rapier + Howler) as a site-as-world reference.
