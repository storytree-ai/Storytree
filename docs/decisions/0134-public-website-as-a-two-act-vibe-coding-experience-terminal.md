---
status: superseded
decided: 2026-07-02
---
# ADR-0134: Public website as a two-act vibe-coding experience: terminal storm to a calm guided forest

*(The word "storm" in this title is retired from all SURFACES by [ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md), 2026-07-05 — the metaphor no longer appears in any visitor-facing copy; Act 1's built experience (terminal chaos → finale concession → transform to soil) STANDS unchanged, described plainly. The title text and filename are history — not rewritten. Noted in place per ADR-0139.)*

## Status

superseded (2026-07-19) by
[ADR-0215](0215-public-website-story-frame-two-act-experience-is-the-entire.md) — website-story
frame authority consolidates there (with 0167/0172). Historical decision text below is unchanged.
Act 1 choreography consolidates as
[ADR-0216](0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md); Act 2 stays on
[ADR-0213](0213-act-2-experience-one-continuous-orchestrator-led-walk.md).

~~accepted (2026-07-02) — the owner declared the two-act design settled at the act1-terminal-storm
attestation gate: witnessed the built Act 1 storm end-to-end (boot → send/audio unlock → 12-window
peak → dim → calm home, skip/Escape, reduced-motion calm-only), attested the cap's UAT legs 1–4, and
directed the home flip (storytree-web PR #18, merged 2026-07-02 — the storm is now the live front
door). Design-time alignment IS the ratification ([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md));
no second end-of-flow ask. Of §5's deferred items, the returning-visitor half of the replay /
deep-link UX was decided at the same gate — **replay every visit** (skip is not remembered); whether
Act 2 deep-links standalone and the asset/perf/mobile budget ride with the remaining Act 2 build.~~
*(Since decided: [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md),
2026-07-03 — Act 2's walkthrough re-decided onto the real 2.5D map at its attestation gate, and the
deep-link half closed: replay-only is final; and
[ADR-0148](0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md), 2026-07-03 — Act 2
became the **website-first walk that grows into an orchestrator-guided forest**, and the classic front
page retired as a capable-visitor destination (the no-JS / reduced-motion fallback stays,
gate-enforced). And [ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md),
2026-07-05 — the "storm" NAMING is retired from all surfaces (this §Status's "the built Act 1 storm",
"the storm is now the live front door" are the metaphor's historical use; the built experience they
describe STANDS, now named plainly — the overwhelming swarm of agents / the chaotic terminals), AND
Act 2's architecture is confirmed BaaS (the frontend reads the database directly). Noted in place per
ADR-0139.)*

proposed (2026-06-28) — explored with the owner in conversation on 2026-06-28.
[ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) decided the *renderer*
(react-three-fiber, website-first) and explicitly deferred "the website's two-act 'vibe-coding game'
experience concept" to the website-rebuild session. **This ADR is that concept.** It stays **proposed**
while the owner and the `story-author` unpack Act 2 in detail (the level ladder, the dev-goal→map
mapping, the surrounding-pages scope); design-time alignment ratifies it
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)) once those settle — no second
end-of-flow ask.

**Update (2026-07-02):** the unpacking has landed — the Act 2 level ladder / dev-goal→map mapping
(the five approved beats), the surrounding informational-pages scope (a per-page fold / discard /
keep-static triage), and the R3F mapper's package home (parent-side, a new
`packages/forest-world-r3f`) are now authored in
[`stories/website-experience/`](../../stories/website-experience/story.md), per owner direction of
2026-07-02. Of §5's deferred items, the asset/perf/mobile budget and the replay / deep-link UX
remain open, carried as that story's open modeling calls. Stays **proposed** — owner-directed —
while the design settles. *(Overtaken later the same day at the attestation gate — see the accepted
entry above: replay decided, the ADR accepted.)*

## Context

The public site (`storytree-web` — an Astro static + Keystatic brochure, a consuming surface per
[ADR-0100](0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md)) today *explains*
storytree in copy *(the world as authored, 2026-06-28; since 2026-07-02 the built Act 1 storm is the
live front door, the old home surviving as its in-page calm fallback/skip target)*. The owner wants
visitors to *feel* the value proposition instead — the difference
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

1. **Act 1 — the storm (the problem, felt).** *(The "storm" NAMING is retired from all surfaces by
   [ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md), 2026-07-05 — no
   visitor-facing surface calls it "the storm." The FELT experience described in this §1 is built, live,
   and STANDS exactly as authored; only the metaphor/word retires. Described plainly it is: the
   overwhelming swarm of coding agents, the chaotic pile of terminals, agents spawning agents until you
   cannot read any of them. Noted in place per ADR-0139.)* Boot into a single retro-arcade CRT terminal, already
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
   buys the load). *(Built as designed and owner-attested 2026-07-02 — UAT legs 1–4 per
   [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md); live on the public
   site, storytree-web PR #19 → web main `6546486`. The click is the only route to the R3F bundle —
   first fetch at the click, no prefetch — and the transform resolves into Act 2's calm empty land; the
   guided walkthrough that grows it is the remaining Act 2 build. As-built map:
   [`stories/website-experience/storm-to-forest-inflection.md`](../../stories/website-experience/storm-to-forest-inflection.md).
   Noted in place per ADR-0139.)* *(Correction 2026-07-03, web main `281b1e6`, owner-directed at the
   Act 1 finale gate: the "one calm storytree affordance" is now a **diegetic finale terminal** — at
   peak the root agent itself powers on a larger terminal and concedes the swarm isn't working, then
   offers **two** options: `show me the better way →` (this transform, choreography unchanged) and an
   external ghost exit for anyone who genuinely prefers the terminal wall. The §2 core stands — peak →
   dim → an affordance → one click transforms, lazy-load at the click; only the affordance's FORM and
   the added second exit changed. As-built map:
   [`stories/website-experience/act1-terminal-storm.md`](../../stories/website-experience/act1-terminal-storm.md)
   "As built — the finale rework".)*

3. **Act 2 — the calm forest (the alternative, guided).** *(Act 2's revealed dependency architecture is
   confirmed BaaS by [ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md) §1,
   2026-07-05 — the frontend reads the database DIRECTLY, adding a direct `website → database` read edge
   on top of the backend chain, giving the diamond `website.dependsOn=[backend, database]`,
   `backend.dependsOn=[database]`, `database.dependsOn=[]` (in the corrected dependent → prerequisite
   direction). Noted in place per ADR-0139.)* Silence resolves into a calm, *empty* land —
   no story nodes yet. An **auto-guided, visitor-paced** walkthrough (the deliberate inverse of Act 1's
   all-at-once) grows the forest one beat at a time, narrated in **plain language** (the tonal inverse of
   Act 1's jargon): plant a story → watch a wisp → it branches into capabilities/contracts → stories
   connect via roads (the DAG) → pull back to the whole legible forest → CTA. Each beat teaches one
   studio concept by watching it happen. *(Amended by
   [ADR-0150](0150-act-2-is-one-continuous-walk-that-grows-upstream-the-depende.md), 2026-07-04: beat
   4's "stories connect via roads" — the wrong-way UI→DB road flagged as a NEGATIVE antipattern teach —
   is retired as the teach and replaced by the POSITIVE dependency-layer-as-advantage teach: the honest
   upstream layers (`website → backend → database`, dependent → prerequisite) shown on the real 2.5D map
   ARE storytree's advantage. Noted in place per ADR-0139.)* *(Further amended by
   [ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md), 2026-07-04: Act 2's
   surface is no longer bespoke website chrome — it reuses the REAL app's UI components with progressive
   disclosure (UI the visitor hasn't been walked through is hidden and revealed as the walk earns it),
   the escape hatch to deprecated pages is removed (only the a11y fallback stays), and step 1 becomes an
   outcome brief with an example carried by the orchestrator chat at the bottom. Noted in place per
   ADR-0139.)*
   - **Tech:** the [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)
     **R3F WebGL island**, lazy-loaded at the inflection, riding the artifacts-not-source flow over
     **fictional** demo data (boundary preserved). It is a *stylized teaching diorama*, not the real
     operable studio; the CTA points to the real product. *(Re-decided 2026-07-03 at the walkthrough's
     attestation gate —
     [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md): the
     walkthrough grows the **real 2.5D map** (the synced `buildScene` scene graph as the site's SVG,
     with game-tutorial callouts anchored to the element each beat teaches), because the 3D forest
     "doesnt represent story tree" — the product is 2.5D. Act 1 and the inflection stay as built; the
     R3F island's public surface is the landing moment, and the spatial forest retreats to
     far-future. Diorama framing, fictional data, and the honest CTA are unchanged. Noted in place
     per ADR-0139.)*

4. **Standing obligations (inherited from
   [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)).** A non-WebGL /
   `prefers-reduced-motion` / assistive-tech **fallback** and a persistent **skip-to-calm** control are
   prerequisites, not polish — the storm must never become a toll booth for returning or assistive-tech
   visitors. *("the storm" here names Act 1's experience; the NAMING is retired from surfaces by
   [ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md), 2026-07-05 — the
   a11y-fallback obligation itself STANDS. Noted in place per ADR-0139.)*

5. **Altitude — what this ADR fixes vs. defers.** This ADR fixes the *experience concept and the per-act
   tech split*. It deliberately **does not** fix (handed to the concept doc + `story-author`): the Act 2
   **level ladder** and the dev-goal→map-example mapping; the **scope of the surrounding informational
   pages** (home / how-it-works / roadmap / landscape / constitution — fold into Act 2, keep as a calm
   linked reference, or retire; this decides whether **Keystatic/CMS survives**) *(that deferred triage
   is now CLOSED — [ADR-0167](0167-info-page-triage-the-signed-disposition-set-and-the-keystati.md),
   2026-07-06, amending this §5: the owner signed + executed the per-page disposition set (KEEP
   how-it-works / get-involved / contact / constitution / the 404; DISCARD roadmap + landscape with
   redirect stubs) and Keystatic does NOT survive — it RETIRED, the hosted editor decommissioned,
   ADR-0101 superseded. Noted in place per ADR-0139.)* *(The scope is now FULLY closed —
   [ADR-0172](0172-retire-the-remaining-brochure-pages-the-experience-is-the-en.md), 2026-07-07,
   also amending this §5: the owner re-decided the next day to retire the four ADR-0167 KEEP pages too,
   so NO static brochure page survives. Every legacy page now has an executed disposition (folded /
   discarded / retired); the public site is exactly the Act 1 + Act 2 experience, the a11y /
   reduced-motion fallback, and the 404, with every retired URL redirecting to `/`. Noted in place per
   ADR-0139.)*; the R3F mapper's
   **package home** (a `story-author` call per
   [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md)); the **asset / perf
   / mobile budget**, LOD strategy, and shader art direction; and **replay/skip UX** and whether Act 2
   deep-links standalone. *(The replay half was decided 2026-07-02 at the Act 1 attestation gate —
   **replay every visit**, as built: a seeded deterministic storm, skip not remembered. The Act 2
   deep-link half was closed 2026-07-03 at the walkthrough's gate
   ([ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)): **replay-only
   is final — no standalone deep-link into the walk.** Corrected in place per ADR-0139.)*

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
  unaffected. *(Since [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md),
  2026-07-03: confined further — the WebGL surface is the inflection's landing moment only; the Act 2
  walk itself is 2.5D SVG. The cost-honesty claim holds a fortiori. Corrected in place per ADR-0139.)*
- The public/private boundary is untouched (fictional data, artifacts-not-source).

**Bad / costs.**

- **A bespoke, content-heavy experience is real work beyond the renderer.** The storm's content corpus
  (authentic-but-opaque agent chatter), the Act 2 narration and level choreography, and the painterly art
  are all design+build effort
  [ADR-0123](0123-webgl-forest-world-renderer-via-react-three-fiber-website-fi.md) already flagged as the
  true cost centres.
- **The immersive front door changes the site's character** and may displace the CMS-edited brochure —
  the surrounding-pages scope (deferred above) decides whether Keystatic stays, and is load-bearing for
  the build shape. *(Decided 2026-07-06 —
  [ADR-0167](0167-info-page-triage-the-signed-disposition-set-and-the-keystati.md): Keystatic does not
  stay; the kept pages are plain static files edited by ordinary PRs. Noted in place per ADR-0139.)*
- **Accessibility / SEO inside the experience must be bought back** with the mandatory fallback and skip
  — a standing obligation, not a one-off.
- A **returning-visitor story** is required so the storm isn't re-imposed every visit. *(Resolved
  2026-07-02, the other way: the owner decided **replay every visit** — the seeded storm replays by
  design, the persistent skip + reduced-motion/no-JS calm view are the floor, and the skip is
  deliberately not remembered. Corrected in place per ADR-0139.)*
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
