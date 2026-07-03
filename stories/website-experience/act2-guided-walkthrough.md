---
id: "act2-guided-walkthrough"
tier: capability
story: website-experience
title: "Act 2 (increment G) — the website-first walk: the reused prompt, the orchestrator's mock-website proposal, and the 2.5D walk that grows one website story to the 'what's next' hand-off"
outcome: "Act 2 replays Act 1's request — the SAME prompt (rewritten to 'build me a shopping website', reused across both acts) — done the storytree way (ADR-0148). Three framing moves wrap the existing walk: (1) it OPENS from that reused prompt; (2) the SESSION ORCHESTRATOR proposes a MOCK LOCAL WEBSITE first — no backend — in a short SCRIPTED exchange that is honest (explicitly a mock, meeting the vibe coder where they are: they want to SEE a website to validate) and does not lead with the backend; (3) the existing auto-guided, VISITOR-PACED five-beat walk (one Next-tap per beat, plain language — the tonal inverse of Act 1) then grows THAT ONE website story green ON THE REAL 2.5D MAP — the synced buildScene scene graph rendered as the site's SVG (ADR-0145), narrated by game-tutorial CALLOUT BOXES anchored to the exact map element each beat teaches: plant a story (outcome on a label) → watch a wisp (presence without obligation) → it branches (limbs green ONLY on signed proof) → stories connect (roads, the wrong-way UI→DB road visibly flagged) → pull back (one legible forest: green = proven, sapling = in-progress, withered = broken); the retained shopping fiction (Cart / Payments / Receipts) is exactly the features that cannot truly work without a backend, so the walk ends on a CTA that HANDS OFF to 'what's next' (the upstream forest of increment H — act2-guided-forest). A stylized teaching diorama over fictional data, never the operable studio."
status: proposed
proof_mode: operator-attested
depends_on: [storm-to-forest-inflection, act2-beat-director, web-experience-sync]
decisions: [134, 145, 148]
# OPERATOR-ATTESTED (ADR-0070) — web-repo work. The choreography ENGINE is already machine-proven
# upstream (act2-beat-director: visitor-paced advance, proof-gated green, the flagged wrong-way
# road, the approved default script — all parent-side contracts), and the artifact freshness is the
# extended check:web-engine's job. What THIS capability owns is the experienced surface, now RE-SCOPED
# by ADR-0148 to the website-first framing: the reused-prompt open, the SCRIPTED ORCHESTRATOR
# mock-website proposal exchange (the meatiest new build piece — a felt planning/pushback moment,
# site-side fictional content), the narration copy (plain language, keyed by beat id against the
# director's exported zod contract), the anchored-callout + map-motion feel, the Next affordance, the
# 'what's next' CTA hand-off to increment H, and whether each beat TEACHES its concept to a non-expert
# — irreducibly human judgements on the real site. NO `proof:` block — witnessed, not `--real`-built.
---

# Act 2 (increment G) — the website-first walk: the reused prompt, the orchestrator's mock-website proposal, and the 2.5D walk to the "what's next" hand-off

**Outcome —** Act 2 replays **Act 1's request, done right** — the SAME prompt (Act 1's terminal now
leads with **"build me a shopping website"**, reused across both acts; one prompt, two ways — the
gripe, then the answer), handled the storytree way
([ADR-0148](../../docs/decisions/0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md)).
Three framing moves wrap the walk that was already built and witnessed:

1. **It opens from the reused prompt.** The calm land arrives from Act 1 carrying the same
   shopping-website request the storm mangled — the visitor sees Act 2 answer the very thing Act 1
   drowned.
2. **The session orchestrator proposes a mock local website first — no backend.** A short **scripted
   orchestrator exchange** (felt, not merely narrated — the planning/pushback moment, the org
   analogy's manager scoping the work) answers the prompt by proposing the honest minimum a vibe
   coder wants: a **mock local website** to validate the idea. It is explicitly a mock (it does not
   misdirect), and it does not lead with the backend (it does not overwhelm) — it **meets the vibe
   coder where they are**: they want to *see* a website.
3. **The existing 2.5D walk grows THAT ONE website story green.** The auto-guided, **VISITOR-PACED**
   walkthrough (one Next-tap per beat, **plain language** — the tonal inverse of Act 1's jargon)
   grows the fictional forest through the five approved beats **on the real 2.5D map** — the synced
   `buildScene` scene graph rendered as the site's SVG
   ([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)),
   representative of the actual product — narrated by **callout boxes anchored to the exact map
   element each beat teaches**.

The retained shopping fiction (**Cart / Payments / Receipts**) is precisely the set of features that
**cannot truly work without a backend** — so the walk ends not on a generic "sign up" but on a
**CTA that hands off to "what's next"**: the upstream forest of a database and a proper backend that
increment H ([`act2-guided-forest`](act2-guided-forest.md)) reveals. A stylized teaching diorama
over fictional data, never the operable studio.

**Depends on —** [`storm-to-forest-inflection`](storm-to-forest-inflection.md) — the land it grows
on; [`act2-beat-director`](act2-beat-director.md) — the script it walks;
[`web-experience-sync`](web-experience-sync.md) — the artifact rail both ride to the site.

> **Proof status (honest) — `proposed`, operator-attested (ADR-0070).** The teaching claims are
> deliberately NOT left to this attestation: "green only on signed proof" and "the wrong-way road
> is flagged" are DATA CONTRACTS the parent spine already holds in `act2-beat-director` — the site
> cannot walk a script that contradicts the thesis. What a human must witness is what remains: the
> reused-prompt open reads as Act 1's request answered; the scripted orchestrator proposal lands as
> an honest, non-overwhelming planning moment; each beat lands its concept, in plain words, at one
> tap of effort; and the CTA hands off to "what's next" without dead-ending — the felt calm
> ADR-0134 stakes the pitch on, now framed website-first by ADR-0148.
>
> **Re-scope note (ADR-0148, 2026-07-03).** At this capability's attestation gate, the owner judged
> the first 2.5D build *"good progress"* but **re-directed the NARRATIVE**: Act 2 must teach how
> storytree actually works — the vibe coder's request handled the storytree way. This capability is
> re-specified to **increment G — the website-first walk** (the reused prompt + the scripted
> orchestrator mock-website proposal + the "what's next" CTA, on top of the already-built 2.5D walk);
> a NEW capability, [`act2-guided-forest`](act2-guided-forest.md) (increment H), captures the
> upstream forest the CTA hands off to. The 2.5D map render, pacing, callout, and beat engine
> ([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md))
> all carry FORWARD — they are the foundation, not discarded.
>
> **Attestation history (kept — honest record).** A first build (the five beats over the R3F 3D
> island, per ADR-0134 §3's original tech note) reached its owner gate 2026-07-03 with the machine
> floor green (61-check Playwright witness; storytree-web draft PR #20, closed superseded) and was
> **refused at stage 2** — the owner re-decided the substrate onto the real 2.5D map with
> anchored-callout narration
> ([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)).
> That 2.5D build in turn reached its gate 2026-07-03, was judged good progress, and was
> **re-directed to the website-first framing above** (ADR-0148) — the walk stands, the narrative
> grew. The closed PR's renderer-agnostic pieces (narration copy, the `act2-validate` build-time
> wall, the pacing/beat UI logic) are salvage carried into every rebuild.

## Guidance

THE SURFACE (owner decisions 2026-07-02 + the 2026-07-03 re-decisions, ADR-0145 for the substrate and
ADR-0148 for the website-first narrative — the spec of the feel):

THE THREE FRAMING MOVES (ADR-0148 — what this re-scope ADDS on top of the already-built 2.5D walk):

- **The reused prompt opens it.** Act 1's storm terminal now leads with **"build me a shopping
  website"** (the copy change lands in `act1-terminal-storm`'s storm script; recorded here because
  Act 2 depends on it). Act 2 is that SAME request answered — one prompt, two ways: Act 1 is it done
  chaotically, Act 2 the same request done right. The calm land arrives already carrying the request,
  so the visitor reads Act 2 as the answer to what the storm mangled, not a fresh topic.
- **The session orchestrator proposes a mock local website first — the meatiest new build piece.** A
  short **scripted orchestrator exchange** (felt, not merely narrated — the planning/pushback moment,
  ADR-0030's human-facing planning agent dramatised; the org analogy's manager scoping the work)
  answers the prompt by proposing the honest minimum: a **mock local website — no backend** — to
  validate the idea. It is HONEST (explicitly a mock; it does not misdirect toward a fake-working
  product) and it MEETS THE USER WHERE THEY ARE (a vibe coder wants to *see* a website; it does not
  lead with "you need a backend first" and does not overwhelm). This exchange is site-side fictional
  content (the Cohoot precedent) and is the seam increment H extends — the same orchestrator returns
  to guide "what's next." Keep it SHORT: a few felt lines, not a wall of chat.
- **The CTA hands off to "what's next", never a dead-end.** The retained shopping fiction (Cart /
  Payments / Receipts) is exactly the set of features that cannot truly work as a mock — so the walk
  ends by naming the next step: the upstream database + backend the orchestrator will guide the user
  to (increment H, [`act2-guided-forest`](act2-guided-forest.md)). Until H lands, the CTA resolves to
  the real product / get-involved (as today) while still POSING the "what's next" question — coherent,
  just not yet walkable upstream.

COHESION — ALL IN ON THE TUTORIAL (ADR-0148 §5 — the end-to-end flow the owner demanded at the gate):

- **"Show me the better way" routes STRAIGHT into the tutorial.** The finale terminal's primary button
  transforms the storm and lands the visitor DIRECTLY in the Act 2 2.5D tutorial — no intermediate
  "begin the guided walk" second click, no detour to a static/classic homepage. One click from the
  finale into the guided experience.
- **Drop the R3F 3D landing island — go all in on 2.5D.** The old inflection mounted a 3D R3F island
  that then flipped to the 2.5D map; that flip read as awkward. The transform now resolves straight
  into the 2.5D tutorial ground (the storm→soil choreography stays; the destination is the 2.5D map,
  not an R3F island). Act 2 carries zero WebGL — the ~1.2 MB island chunk leaves the path entirely.
- **Retire the classic front page as a destination.** No "prefer the classic front page?" opt-out for
  capable visitors — the tutorial is the front door. The no-JS / reduced-motion accessibility fallback
  and skip affordance STAY (ADR-0134, gate-enforced) as graceful degradation — a clean minimal static
  page, NOT the old marketing homepage, and NOT an escape a capable visitor is offered.
- **The finale copy addresses the visitor.** The root agent's finale turns on the user — it is waiting
  on them, it names their likely overwhelm, and it offers a better way that "feels like playing a game"
  (the exact new lines are build content in the builder's brief; the old cryptic "the bottleneck is not
  the agents" monologue is replaced).

THE WALK ITSELF (carried FORWARD from the 2.5D build, unchanged by this re-scope):

- **The real 2.5D map (ADR-0145).** The forest renders on the synced `buildScene` scene graph as
  the site's 2.5D SVG — the `worldSvg`/`TreeWorld` rail the home map already rides — NOT the R3F 3D
  island ("it looks ugly and doesnt represent story tree"; the product IS 2.5D; 3D stays
  far-future). Act 1 and the storm→land inflection stay exactly as built and attested — including
  the R3F-mounted landing moment if that is what the transition rides — and how the landing hands
  off to the 2.5D walk is this capability's design seam to resolve gracefully; the owner gate
  judges the result.
- **Visitor-paced, auto-guided.** The walkthrough proposes; the visitor disposes — one Next-tap
  advances one beat (the director's structural guarantee), nothing auto-plays past the visitor. The
  deliberate inverse of Act 1's all-at-once: same single gesture, opposite outcome. A Back
  affordance is welcome; auto-advance is a design violation, not a tweak.
- **Anchored callouts, plain language.** The narration appears in game-tutorial **callout boxes
  anchored next to the actual map element** each beat teaches — "the callout boxes point to exactly
  where your eyes should go and talk to the item" — never a fixed panel the visitor must read at
  the bottom. The copy never uses insider vocabulary without showing it: say "a promise of what
  this piece will do" while the label appears, then name it a story. Site-side copy keyed by beat
  id, validated against the director's exported zod contract at build time — copy can be rewritten
  freely without touching the proven engine.
- **The five beats grow the ONE website story, teaching by watching, one concept each** (the
  research-table rows, verbatim in spirit): the story the walk plants IS the mock shopping website
  the orchestrator just proposed (Cart / Payments / Receipts the retained fiction). The seed→tree
  with the OUTCOME ON A LABEL answers orphaned intent; the drifting wisp answers babysitting
  (presence without obligation — the visitor does nothing and that is the point); the branch beat
  answers the verification gap (a limb greens only as a SIGNED PROOF lands — narrate exactly that);
  the roads beat answers illegible architecture (the wrong-way UI→DB road skipping the service layer
  appears visibly flagged the moment it is drawn); the pull-back answers terminal sprawl (one calm
  screen: green = proven, sapling = in-progress, withered = broken — the anti-storm, framed as the
  answer to Act 1's HUD).
- **The CTA hands off to "what's next".** The final state names the next step honestly: the mock
  website's Cart / Payments / Receipts cannot truly work without a backend, so the CTA poses the
  question increment H answers — the upstream database + backend the orchestrator will guide the user
  to ([`act2-guided-forest`](act2-guided-forest.md)). Until H lands, that hand-off resolves to the
  real product (get-involved / the repo / the studio pitch — per `info-pages-triage`'s outcome),
  honestly labelled: this was a diorama; the real thing is watched-live. Never a dead-end Next.
- **Diorama, not studio.** All data fictional (site-side, the Cohoot precedent) — including the
  orchestrator's scripted proposal exchange; no live store, no real corpus, no operable affordances
  beyond the walkthrough — the boundary (ADR-0056/0066/0093) holds by construction because the site
  only HAS the synced artifacts.
- **Increment coherence.** Beats may land incrementally (the director is data-driven): each merge
  ships a complete-so-far arc that still opens from the reused prompt + proposal and still ends on
  the "what's next" CTA — never a dead-end Next.

BUILD SHAPE: `storytree-web` repo work on its own rail, `frontend-builder` driving; the map layer
folds each `DirectorState.world` into a fresh `SceneInput` → the synced `buildScene` → the site's
2.5D SVG (client-side per beat, or per-beat scenes pre-rendered at build time — `worldSvg` is pure
string building, so either is viable; the builder's call, per ADR-0145). Map motion (viewBox
tweens, growth transitions, callout placement from per-element `data-id` geometry) is the site's
job; STATE is the proven engine's.

## UAT (operator-attested)

1. **The reused prompt makes Act 2 the answer to Act 1.** _(witness: human)_ Act 1's storm terminal
   leads with **"build me a shopping website"**; arriving on the calm land, the walk reads as that
   SAME request answered — one prompt, two ways. **Success —** a first-time visitor recognises Act 2
   as the fix for the storm they just saw drown that exact request, not an unrelated new topic.
2. **The orchestrator's proposal is honest and meets the user where they are.** _(witness: human)_
   Before the beats, a short scripted orchestrator exchange proposes a **mock local website — no
   backend** — to validate the idea. **Success —** it reads as a felt planning/pushback moment (an
   agent scoping the work, not a passive caption); it is explicitly a MOCK (never pretends to be a
   working product), it does NOT lead with the backend, and it does NOT overwhelm — a vibe coder
   feels met, not lectured. The exchange is short (a few lines, not a wall of chat).
3. **The pacing inverts the storm.** _(witness: human)_ From the proposal, the walk advances ONLY on
   Next — five taps, five beats, no auto-play; effort never exceeds one tap.
4. **Each beat lands its concept, growing the one website story.** _(witness: human)_ Guided by a
   callout anchored to the element being taught, a non-expert reader can say back, per beat: intent
   lives on the map; I can see it working without watching it; green means proven, not claimed; that
   road is wrong and I can see why; the whole thing fits on one calm screen — and the tree they
   watch grow is the mock shopping website (Cart / Payments / Receipts), the proposal made real.
5. **The thesis moments read.** _(witness: human)_ The walk happens on the real 2.5D map (the
   product's own look); the limb visibly greens WITH the signed-proof narration (never before); the
   wrong-way UI→DB road is instantly distinguishable from the good roads; the pull-back forest is
   legible at a glance (green / sapling / withered).
6. **The CTA hands off to "what's next".** _(witness: human)_ The arc ends by naming the next step:
   the mock website's Cart / Payments / Receipts cannot truly work without a backend, so the CTA
   poses "what's next" — the upstream database + backend (increment H). **Success —** the hand-off
   is legible and honest (this was a diorama; the real thing is watched-live); until H lands it
   resolves to the real product / get-involved; no beat dead-ends.
7. **The path into the tutorial is cohesive — all in.** _(witness: human)_ From the finale, "show me
   the better way" leads STRAIGHT into the 2.5D tutorial — one click, no jarring 3D-island-that-flips
   to 2.5D, no detour to a classic homepage. **Success —** the finale's copy reads as the agent
   addressing YOU (waiting on you, sensing your overwhelm, offering a better way that feels like
   playing a game); the transition into the 2.5D walk is smooth and single-path; a capable visitor is
   never offered an escape to a classic front page (the no-JS / reduced-motion fallback still exists
   for those who need it).
