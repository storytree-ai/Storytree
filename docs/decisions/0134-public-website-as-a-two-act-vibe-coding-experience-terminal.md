---
status: proposed
---
# ADR-0134: Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest

## Status

proposed (2026-06-28) — explored with the owner in conversation on 2026-06-28.
[ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) decided the *renderer*
(react-three-fiber, website-first) and explicitly deferred "the website's two-act 'vibe-coding game'
experience concept" to the website-rebuild session. **This ADR is that concept.** It stays **proposed**
while the owner and the `story-author` unpack Act 2 in detail (the level ladder, the dev-goal→map
mapping, the surrounding-pages scope); design-time alignment ratifies it
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)) once those settle — no second
end-of-flow ask.

## Context

The public site (`storytree-web` — an Astro static + Keystatic brochure, a consuming surface per
[ADR-0100](0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md)) today *explains*
storytree in copy. The owner wants visitors to *feel* the value proposition instead — the difference
between today's chaotic agentic coding and storytree's calm, legible, watched-live forest. Show, don't
tell.

The forces:

- **The product's thesis is an emotional contrast, and copy can't carry it.** storytree's pitch is "the
  swarm of screaming agents becomes one calm forest you can read." A page of bullet points *asserts*
  that; it doesn't *land* it. A design-research pass on Abeto's WebGL game *Messenger*
  (messenger.abeto.co) surfaced the transferable move: **site-as-world** — the marketing site *is* the
  experience, not a description of it.
- **The renderer question is already settled.**
  [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) chose three.js via
  **react-three-fiber + drei** for the spatial forest, website-first, as a third forest-world mapper
  over the [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) shared core
  — client-only, non-SSR, with a mandatory fallback. What it left open was *what experience that
  renderer serves*. This ADR answers that.
- **The pain is real and well-evidenced.** Developers' top 2025–26 frustration with AI coding is not
  spectacular failure but the **verification gap**: code that's "almost right, but not quite" (Stack
  Overflow 2025 Developer Survey — the #1 frustration, ~66%), agents that "grade their own homework"
  (green test suites that certify nothing), and a **review bottleneck** where output volume outran
  anyone's capacity to verify it. Act 1 dramatizes exactly this gap; Act 2 answers it with a legible,
  proof-bearing map.
- **The site is boundary-bound.**
  [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) /
  [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) /
  [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md): the public site
  consumes a parent-built *artifact* of the look, never private source or live data, and keeps its own
  fictional demo data. The experience must hold that line.

## Decision

Rebuild the public website, front-door-first, as **one immersive two-act "vibe-coding game,"** built on a
single guiding idea:

**One calm gesture per act — same input, opposite outcome.** In Act 1 the visitor's single tap (send a
prompt) *breeds chaos*; in Act 2 the visitor's single tap (advance) *grows order*. The visitor never
works harder in either act — the difference isn't effort, it's whether the result is legible. That
contrast IS the argument: *the swarm and the forest cost you the same attention; only one of them you
can read.*

1. **Act 1 — the storm (the problem, felt).** Boot into a single retro-arcade CRT terminal, already
   logged into a coding agent. The visitor sends one prompt (a suggested chip or typed) — the gesture
   that also unlocks audio. The agent "thinks," then spawns its own sub-agents, which *become* new
   terminals: the multiplication is **diegetic** (agents spawning agents, not the visitor opening
   windows). Terminals tile and overlap, each streaming plausible-but-opaque activity and ending on
   unanswerable demands (`awaiting instructions`, `Postgres or SQLite? (y/n)`, `force-push to main?
   [y/N]`). An arcade HUD (`AGENTS: n ▲`) gamifies the descent — your rising "score" *is* the drowning.
   Peak ≈ 10–12 windows: overwhelm, not browser-melt.
   - **Tech:** plain **DOM/CSS** + a canvas grain pass (scanlines/bloom) + **Web Audio** for the
     cacophony (gesture-unlocked by the first prompt). **No WebGL** — Act 1 is cheap and accessible.

2. **Inflection — the way out.** At peak overload everything dims and one calm storytree affordance
   appears amid the noise. A single click **transforms** rather than navigates: the terminals fall
   silent, collapse, and their fragments drop into the ground — the noise becomes the *soil/seed* of the
   calm world that fades up. This is also the natural point to **lazy-load the R3F bundle** (the exhale
   buys the load).

3. **Act 2 — the calm forest (the alternative, guided).** Silence resolves into a calm, *empty* land —
   no story nodes yet. An **auto-guided, visitor-paced** walkthrough (the deliberate inverse of Act 1's
   all-at-once) grows the forest one beat at a time, narrated in **plain language** (the tonal inverse of
   Act 1's jargon): plant a story → watch a wisp → it branches into capabilities/contracts → stories
   connect via roads (the DAG) → pull back to the whole legible forest → CTA. Each beat teaches one
   studio concept by watching it happen.
   - **Tech:** the [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)
     **R3F WebGL island**, lazy-loaded at the inflection, riding the artifacts-not-source flow over
     **fictional** demo data (boundary preserved). It is a *stylized teaching diorama*, not the real
     operable studio; the CTA points to the real product.

4. **Standing obligations (inherited from
   [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)).** A non-WebGL /
   `prefers-reduced-motion` / assistive-tech **fallback** and a persistent **skip-to-calm** control are
   prerequisites, not polish — the storm must never become a toll booth for returning or assistive-tech
   visitors.

5. **Altitude — what this ADR fixes vs. defers.** This ADR fixes the *experience concept and the per-act
   tech split*. It deliberately **does not** fix (handed to the concept doc + `story-author`): the Act 2
   **level ladder** and the dev-goal→map-example mapping; the **scope of the surrounding informational
   pages** (home / how-it-works / roadmap / landscape / constitution — fold into Act 2, keep as a calm
   linked reference, or retire; this decides whether **Keystatic/CMS survives**); the R3F mapper's
   **package home** (a `story-author` call per
   [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)); the **asset / perf
   / mobile budget**, LOD strategy, and shader art direction; and **replay/skip UX** and whether Act 2
   deep-links standalone.

## Consequences

**Good.**

- The site *enacts* the value proposition instead of asserting it — the felt chaos→calm arc *is* the
  pitch, on-thesis with the Abeto site-as-world research.
- It **reuses**
  [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)'s renderer and the
  shared `forest-world` world-computation rather than standing up a parallel engine; the experience is
  **additive** — a front-door over the existing consuming surface — not a rewrite of the render core.
- The per-act split keeps cost honest: Act 1 is cheap DOM/audio; the expensive WebGL surface is confined
  to Act 2 and lazy-loaded behind the inflection, so first paint and the SEO-bearing copy pages are
  unaffected.
- The public/private boundary is untouched (fictional data, artifacts-not-source).

**Bad / costs.**

- **A bespoke, content-heavy experience is real work beyond the renderer.** The storm's content corpus
  (authentic-but-opaque agent chatter), the Act 2 narration and level choreography, and the painterly art
  are all design+build effort
  [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) already flagged as the
  true cost centres.
- **The immersive front door changes the site's character** and may displace the CMS-edited brochure —
  the surrounding-pages scope (deferred above) decides whether Keystatic stays, and is load-bearing for
  the build shape.
- **Accessibility / SEO inside the experience must be bought back** with the mandatory fallback and skip
  — a standing obligation, not a one-off.
- A **returning-visitor story** is required so the storm isn't re-imposed every visit.
- This is the *parent* repo's decision; the build lands in the **separate `storytree-web` repo** (its own
  CD), so the work must branch off *its* `origin/main`, not the parent's submodule pin.

## References

- [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) — the WebGL renderer
  (R3F + drei, website-first) this experience is built on; it explicitly deferred this concept to the
  website-rebuild session.
- [ADR-0100](0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md) — the public website
  as a consuming surface (the node this experience expands).
- [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — the shared
  forest-world render core (one core, many mappers) the R3F island draws from.
- [ADR-0066](0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md) /
  [ADR-0056](0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md) — the public/private
  boundary (artifacts-not-source, fictional data stays site-side) the experience preserves.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage visual
  proof; Act 2's *appearance* is operator-attested, not machine-judged.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment as
  ratification (why this accepts without a second ask once Act 2 is settled).
- External: Abeto *Messenger* (messenger.abeto.co) — the site-as-world north-star that motivated the
  rebuild.
