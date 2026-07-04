---
id: "act2-guided-forest"
tier: capability
story: website-experience
title: "Act 2 (increment H) — the ONE continuous walk grows UPSTREAM: the same walk keeps going into a proposed backend + database the website depends on, the dependency layers shown on the real map ARE the advantage, inspectable and walked green on demand"
outcome: "The visitor who just grew the mock website green in increment G (act2-guided-walkthrough) KEEPS WALKING — the SAME continuous walk, not a separate CTA-gated phase — as the SESSION ORCHESTRATOR guides them into the DEPENDENCY STACK the website rests on: because the mock website's Cart / Payments / Receipts cannot truly work without a backend, the walk reveals a backend and a database as PROPOSED trees on real dependsOn edges pointing FROM the dependent TO its prerequisite — website.dependsOn=[backend], backend.dependsOn=[database], database.dependsOn=[] (the website NEEDS the backend to serve a working checkout; the backend needs the database; ADR-0058 / cross-story-dependency; the refused first build encoded this BACKWARDS — ADR-0153 corrects it), stories at EVERY LEVEL of the DAG (not just leaves). Rendered with the FRONTEND HIGH and the dependency foundation BELOW (owner spatial preference, a free render choice — ADR-0153). The DEPENDENCY LAYERS thus made visible on the real 2.5D map ARE the advantage storytree teaches — you SEE the layers, you build them in the right order, nothing is hidden (this POSITIVE teach replaces increment G's beat-4 wrong-way-flag antipattern). The walk uses the REAL app's UI components (not bespoke chrome) with progressive disclosure (hide what the visitor has not been walked through), offers NO escape to any deprecated page (a11y fallback only), and deepens into the drive-machinery diagrams (CI/CD, devops, gates, wiring) as temporary overlays. The visitor can INSPECT each proposed upstream story to understand WHAT it is and WHY it is proposed, and WALK them green PROGRESSIVELY on demand — complexity is SCAFFOLDED (revealed in the order a human can hold it, as the walk continues), never hidden and never dumped up front. On the real 2.5D map (ADR-0145), narrated by the same anchored callouts + scripted-orchestrator voice increment G established, over fictional data — a teaching diorama, never the operable studio."
status: proposed
proof_mode: operator-attested
depends_on: [act2-guided-walkthrough]
decisions: [134, 145, 148, 150, 153]
# OPERATOR-ATTESTED (ADR-0070) — web-repo work, the extend-next half of the Act 2 re-scope (ADR-0148),
# RE-SHAPED by ADR-0150 (owner-directed at the G attestation gate 2026-07-04): H is ONE
# CONTINUOUS WALK growing UPSTREAM (not a CTA-gated separate phase), and the dependency-layer-as-
# advantage teach REPLACES beat 4's wrong-way flag. Then REFUSED at H's OWN attestation gate
# (2026-07-04) and RE-SPECCED by ADR-0153: the dependency DIRECTION is corrected (the WEBSITE
# dependsOn the backend which dependsOn the database — dependent → prerequisite, ADR-0058; the refused
# build had it backwards); the walk uses the REAL app's UI components with progressive disclosure (hide
# what the visitor has not been walked through); NO escape hatches to deprecated pages (a11y fallback
# only); the deeper drive-machinery diagrams (CI/CD, devops, gates, wiring) live here as H is the depth;
# spatial preference is frontend HIGH / foundation BELOW (a free render choice — "upstream" the
# dependency direction renders as the foundation below).
# This capability EXTENDS increment G: it reuses G's proven substrate — the real 2.5D map render
# (ADR-0145), the anchored-callout narration, the visitor-paced Next affordance, the beat/director
# engine (act2-beat-director, re-specced to a multi-story-with-dependsOn upstream vocabulary), and the
# scripted-orchestrator seam G introduced — so it depends only on act2-guided-walkthrough (the director
# + sync + inflection are transitive through G). What THIS capability owns is the experienced surface
# no machine can judge: does the walk CONTINUE seamlessly upstream (one arc, not a new page); does the
# reveal of a backend + database on real dependsOn edges READ as the dependency LAYERS being the
# advantage (the honest structure shown to you, not a mistake flagged); can a non-expert INSPECT a
# proposed upstream story and understand what/why; does walking them green feel PROGRESSIVE and on-
# demand; is complexity SCAFFOLDED (revealed as the walk continues) rather than hidden or dumped. The
# teaching claim that IS machine-checkable (green only on signed proof) remains act2-beat-director's
# parent-side data contract — the site cannot walk a script that contradicts the verification-gap
# thesis. (The wrong-way-road flag is RETIRED as the teach — see ADR-0150 §4.)
# NO `proof:` block — witnessed, not `--real`-built. The frontend-builder is the inner-loop role; the
# owner witnesses on the live/preview site; appearance and feel are never self-signed. A HALT point
# for the driving session — this is the extend-next increment the owner sequenced AFTER G ships.
---

# Act 2 (increment H) — the ONE continuous walk grows UPSTREAM: the dependency layers are the advantage

**Outcome —** The visitor who just grew the mock website green in increment G
([`act2-guided-walkthrough`](act2-guided-walkthrough.md)) **keeps walking** — the **SAME continuous
walk**, not a separate CTA-gated phase — as the **session orchestrator** guides them into the
**dependency STACK the website rests on**: because the mock website's **Cart / Payments / Receipts
cannot truly work without a backend**, the walk reveals a **backend** and a **database** as **PROPOSED
trees** on real `dependsOn` edges that point **FROM the dependent TO its prerequisite** — the
**website `dependsOn` the backend**, the **backend `dependsOn` the database**
(`website.dependsOn=[backend]`, `backend.dependsOn=[database]`, `database.dependsOn=[]`; ADR-0058 /
`cross-story-dependency`), with **stories at every level of the DAG** (not just leaves; it is correct
that a backend and a database are what the website DEPENDS ON). *(The refused first build encoded this
edge BACKWARDS — `backend dependsOn website`; [ADR-0153](../../docs/decisions/0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md)
corrects it to the library rule: A depends_on B iff A needs B's delivered outcome to pass A's own UAT.)*
**Rendered with the FRONTEND HIGH and the dependency foundation BELOW** (owner spatial preference, a
free render choice — ADR-0153): "upstream" (the dependency direction, toward what the website needs)
renders as the foundation the website rests ON — the two axes agree, not contradict.

**The dependency LAYERS thus made visible on the real 2.5D map ARE the advantage storytree teaches** —
you **SEE the layers**, you build them in the **right order**, **nothing is hidden**. This POSITIVE
teach is ADR-0150's replacement for increment G's beat-4 **wrong-way-flag antipattern**
(owner direction at the G gate, 2026-07-04): the honest dependency structure, revealed to you, IS the
advantage — not a flagged mistake. Where Act 1's swarm buried the backend and let the visitor discover
the missing layer by failure, storytree shows the layer up front, as the thing you build next.

The visitor can:

- **Inspect each proposed upstream story** to understand **what it is** and **why it is proposed** (the
  orchestrator's dependency rationale — "your checkout needs somewhere to keep carts; that is a
  database; your payments need server logic; that is a backend"), and
- **Walk them green PROGRESSIVELY**, on demand, one at a time — the same visitor-paced Next gesture
  increment G established, the walk simply continuing upward.

**Complexity is SCAFFOLDED** — revealed in the order a human can hold it, as the walk continues
([ADR-0148](../../docs/decisions/0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md)'s
stated design obligation, sharpened by ADR-0150) — **never hidden, never dumped up front.**
All on the real 2.5D map
([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)),
narrated by the same anchored callouts + scripted-orchestrator voice G established, over fictional
data — a stylized teaching diorama, never the operable studio.

**Depends on —** [`act2-guided-walkthrough`](act2-guided-walkthrough.md) (increment G) — H continues
from G's finished website walk (the CTA is a **continuation seam**, not a hand-off to a new page) and
extends G's scripted-orchestrator seam and its proven substrate (the 2.5D map render, the
anchored-callout narration, the visitor-paced Next affordance, the
[`act2-beat-director`](act2-beat-director.md) engine, the [`web-experience-sync`](web-experience-sync.md)
artifact rail — all transitive through G). There is no upstream forest to reveal until the website
walk it grows from exists.

> **Proof status (honest) — `proposed`, operator-attested (ADR-0070); the re-spec BUILT + machine-green
> + OWNER-ATTESTED AS A STEP FORWARD + LIVE (2026-07-05, web main `8f4e166c`) — landed as an
> INCREMENTAL step WITH forward feedback that drives the next arc link (see "As built / attested" below);
> the LOOK is NOT terminally closed.** History: this is the **extend-next** half of the Act 2
> re-scope
> ([ADR-0148](../../docs/decisions/0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md),
> owner-directed 2026-07-03), **RE-SHAPED by ADR-0150** (owner-directed at the G attestation
> gate 2026-07-04): increment G ships the website-first walk first, then H continues it as ONE walk
> growing upstream, teaching the dependency layers as the advantage. A first build of H against ADR-0150
> was taken to the owner's ADR-0070 stage-2 attestation gate on 2026-07-04 and **REFUSED** — the WHAT
> changed substantially, so H is **RE-SPECCED by
> [ADR-0153](../../docs/decisions/0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md)**
> (born accepted, owner-directed at that gate): the dependency DIRECTION is corrected (the refused build
> encoded it BACKWARDS — see "The re-spec" below), the walk uses the REAL app's UI components with
> progressive disclosure, there are NO escape hatches to deprecated pages, and the deeper drive-machinery
> diagrams (CI/CD, devops, gates, wiring) live here. Per `defects-amend-the-owning-story` the refused
> build re-opens this LOOK toward `building` for the reshaped surface; nothing here is proven yet;
> `healthy` is earned through the gate, never authored (ADR-0020). The machine-checkable teaching claim
> (green only on signed proof) stays [`act2-beat-director`](act2-beat-director.md)'s parent-side data
> contract — H reuses that proven engine (re-specced to a multi-story-with-`dependsOn` upstream
> vocabulary in the CORRECTED direction), so the site cannot walk a forest that contradicts the
> verification-gap thesis. The wrong-way-road flag is RETIRED as the teach (ADR-0150 §4; the
> dependency-layer-as-advantage teach replaces it). What a human must witness is what remains and is
> genuinely new to H: does the walk CONTINUE seamlessly upstream (one arc, not a new page); does the
> reveal of a backend + database on real `dependsOn` edges (`website → backend → database`, dependent →
> prerequisite) READ as the dependency LAYERS being the advantage, rendered with the frontend HIGH and
> the foundation BELOW; do the walk and orchestrator surface use the REAL app's UI (not bespoke chrome),
> revealing UI progressively as the walk earns it; is there NO escape to a deprecated page (only the
> a11y fallback); do the drive-machinery overlays (steps 3–4, CI/CD/gates/wiring) teach without
> overloading; can a non-expert inspect a proposed upstream story and grasp what/why; does the
> progressive walk-green feel on-demand; and is complexity SCAFFOLDED rather than hidden or dumped. Built
> by the `frontend-builder` in `storytree-web` (branch off ITS `origin/main`, its own CD) and witnessed
> by the owner on the live/preview site — appearance and feel are never self-signed (ADR-0070). A HALT
> point for the driving session.
>
> **As built / attested (2026-07-05, web main `8f4e166c`, live at https://crisp-globe-bf6v.here.now/).**
> The re-spec was built in `storytree-web` by the `frontend-builder` and cleared its machine floor —
> `astro build` (zero-WebGL in Act 2), the three web gates (`check:web-experience` /
> `check:web-grounding` / `check:web-engine`, all OK), and Playwright 41/41 — then the owner WALKED it
> at the ADR-0070 stage-2 gate and **attested it as a STEP FORWARD → directed it to LAND LIVE**
> (storytree-web PR #25 squash-merged → web main `8f4e166c`, CD green; the parent `web/` submodule pin
> bumped `ff70222b` → `8f4e166c`). Per ADR-0044 §4 the attestation is agent-relayed and RECORDED here
> (a look/feel verdict only the owner can sign), verbatim:
> > *"Land this as its a step forward, then continue the self perpetuating chips based on this feedback"*
> — followed by five forward directions (below).
>
> **As-built cites (web `8f4e166c`, files under `web/`):**
> - **Corrected dependency direction, 3-tier, no direct frontend→DB edge** —
>   `web/src/scripts/act2-script.ts`: `add-upstream-story` beat 4 carries `dependentId: STORY_WEBSITE`
>   (line 141) and beat 5 `dependentId: STORY_BACKEND` (line 161), so `website.dependsOn=[backend]`,
>   `backend.dependsOn=[database]`, `database.dependsOn=[]` (the header spells this out, lines 16–25);
>   only the website resolves `proven` at pull-back (`proven: [STORY_WEBSITE]`, line 175). The site-owned
>   ids are `story-checkout` / `story-backend` / `story-database` (lines 48–50).
> - **Frontend HIGH / foundation BELOW (spatial), the DAG shown honestly** —
>   `web/src/scripts/act2-walkthrough.ts`: the fold computes each story's dependency `depth` from
>   `dependsOn` (`depthOf`, lines 371–383), anchors on the deepest dependent (the website), stacks
>   `y = -depth * LAYER_RISE` so the website is highest and the database at the base (lines 395–403),
>   and draws each `dependsOn` edge with the arrowhead landing ON the prerequisite below (lines 439–454).
> - **Real-app UI, orchestrator chat AT THE BOTTOM carrying the outcome brief** —
>   `web/src/scripts/act2-orchestrator.ts`: `mountOrchestrator` builds a bottom-anchored re-creation of
>   the studio chat dock (lines 125–262), streaming the reused prompt + an outcome-brief reply
>   (`USER_PROMPT` line 35, `REPLY_LINES` lines 53–76) with the studio's chat tokens (header, lines
>   14–23); the only affordance is the primary that begins the walk — `PROPOSAL_CTA`, NO skip (lines
>   79–80). Wired in `web/src/scripts/inflection.ts` (`mountWalkthrough` / `mountOrchestrator`, lines
>   35–36, 72–78).
> - **Drive-machinery overlays (top-left agent loop; top-right CI/CD → ship), site-side keyed by beat id**
>   — `web/src/scripts/act2-overlays.ts`: `DRIVE_OVERLAYS` keys `beat-2-attach-wisp` (top-left, "The
>   agent loop") / `beat-3-branch-caps` (top-right, "Proof, not a promise") / `beat-4-add-upstream-backend`
>   (top-right, "Wired to the code") (lines 76–190); `mountDriveOverlay` reveals rows scaffolded and
>   clears on the next beat (lines 234–368). No director field — presentational chrome (header §, lines
>   11–17).
> - **Plain-language teach incl. the loop/TDD framing, upstream = the advantage** —
>   `web/src/scripts/act2-narration.ts`: `NARRATION` beats 4–5 name the layers as the foundation the
>   website RESTS ON (lines 72–87); beat 3 states green is earned by "a signed, passing test run", not
>   "done" (lines 63–69). The `INTRO` still opens "The storm settles into soil" (lines 111–116).
> - **No escape hatch (a11y fallback only)** — `web/src/pages/index.astro`: the no-JS / reduced-motion
>   `data-experience-fallback` calm view survives (lines 207–212, media queries 650–711); no
>   capable-visitor skip is offered inside the Act 2 walk (orchestrator/overlays carry none).
>
> **Forward feedback → the FOLLOW-ON re-spec (the next arc link — NOT decided here, NOT encoded as this
> cap's contract).** The owner attested this as an incremental step *with* five directions for the next
> link, which the story-author turns into a re-spec (recorded, not enacted here): (1) the pre-walk should
> read as talking to OUR system — the story node would land as `proposed`; (2) REMOVE the storm analogy
> from ALL surfaces (it survives in `act2-narration.ts` `INTRO` / `done` and Act 1); (3) drop weird-
> analogy/jargon usage — keep language simple for newcomer devs; (4) the agent-loop explanation should be
> a LOOP DIAGRAM (not the current list-style overlay) that also speaks to the TDD orchestration flow
> ("one agent writes tests", "the other builds code to pass the tests"); (5) the WISP should actually
> MOVE — it currently renders as a static dot (the scene emits a `wisps` presence marker on the
> `.tw-wisps` layer, `act2-walkthrough.ts` lines 510–511, not yet animated); and (6) the taught shape
> should let the frontend read the DATABASE DIRECTLY (a BaaS re-visit of ADR-0153's 3-tier authoring
> call — corpus-legal, owner's call at the next gate). Because this feedback is live, the LOOK cap is NOT
> terminally closed; the attested "step forward" record above stands as true history (copy-on-write).
>
> **The re-shape (owner direction at the G gate, 2026-07-04 — SETTLED, design-time-ratified).**
> Attesting increment G, the owner sharpened H's shape (verbatim: *"get rid of this bit [beat 4's
> 'wrong way — skips the payment service' flag] … integrate the grow the backend into the one tutorial,
> it shouldnt be separate"*). Two changes, unified into one narrative and recorded in ADR-0150
> (born accepted, ADR-0110 — this is NOT an open question):
>
> 1. **Integrate into ONE continuous walk ("it shouldnt be separate").** H is NOT a separate page or a
>    fresh start behind G's "grow the backend next →" CTA/destination. The visitor keeps walking the
>    same arc at the same one-tap pace; the orchestrator guides upstream in the same voice. G's "what's
>    next" CTA is reframed from a hand-off DESTINATION into a **continuation seam** — the walk flows on.
> 2. **The dependency layer is the ADVANTAGE, on the actual map — replacing beat 4's wrong-way flag.**
>    Beat 4's negative antipattern teach (a wrong-way UI→DB road flagged as a mistake) is RETIRED as the
>    teach; in its place, the upstream dependency LAYERS shown on the real 2.5D map ARE storytree's
>    advantage — the honest structure (website needs a backend needs a database, in the right order,
>    nothing hidden), revealed to the visitor. H's upstream forest IS that teach: the proposed upstream
>    stories, on real `dependsOn` edges, carry the dependency-layer-advantage teaching that beat 4 used
>    to gesture at negatively.
>
> The two points are the SAME move — integrate the upstream forest into the one walk, and let it carry
> the dependency-layer teach as an advantage. This RE-SHAPE is settled; the build is the
> `frontend-builder`'s job on storytree-web (with the `act2-beat-director` engine re-specced first).
>
> **The re-spec (owner direction at H's OWN gate, 2026-07-04 — SETTLED, design-time-ratified, ADR-0153).**
> The first build of H (against ADR-0150) was REFUSED at stage 2. The owner gave the redirections that
> touch H (recorded in ADR-0153, born accepted, ADR-0110 — NOT open questions):
>
> 1. **The dependency DIRECTION was backwards — corrected.** The refused build (and the earlier cap
>    text) encoded the upstream edges as pointing back DOWN to the website (`backend dependsOn website`).
>    That contradicts the library. The rule (`cross-story-dependency` / ADR-0058 §1): a story depends on
>    another iff it needs that story's delivered outcome to pass its OWN UAT. The WEBSITE needs the
>    backend (to serve a working checkout) and the BACKEND needs the database, so the edges point FROM
>    the dependent TO its prerequisite — `website.dependsOn=[backend]`, `backend.dependsOn=[database]`,
>    `database.dependsOn=[]` (the `boundary` def's "a frontend depends on a database" archetype). H's
>    reveal encodes THIS direction.
> 2. **Real app UI, progressive disclosure.** The walk and the orchestrator surface use the REAL
>    desktop/web app's UI components (`apps/desktop`, `apps/studio`), not bespoke website chrome — visual
>    parity with the real product (subject to the web-repo sync boundary; a build-time mechanism call).
>    UI the visitor has not been walked through is HIDDEN and revealed as the walk reaches it.
> 3. **No escape hatches.** No "skip the intro", no path to any static / deprecated page — the ONLY
>    surviving non-experience path is the gate-required no-JS / reduced-motion a11y fallback.
> 4. **The deeper drive-machinery diagrams live here.** H is the DEPTH (it grows the backend/database),
>    so the expanded drive-machinery diagrams (CI/CD, devops, gates, how the system is wired to the code
>    to keep it honest — the step 3–4 buildout) belong to H, as temporary overlays (a second overlay,
>    top-right, is fine) that MUST NOT overload the viewer — complexity stays scaffolded.
> 5. **Spatial: frontend HIGH, foundation BELOW (owner preference; a free render choice).** The frontend
>    renders on top (the consumer), the backend then the database as the foundation BELOW, the backend
>    delivering UP to the frontend. This is a free render choice (no corpus convention for screen
>    position; the DATA direction is the convention) — the TARGET, builder/owner-tunable at the gate.
>
> The DATA direction is the settled non-negotiable; the SHAPE (3-tier vs BaaS — see ADR-0153's authoring
> call, which chose 3-tier) and the spatial layout are owner-tunable at the gate.

## Guidance

THE SURFACE (ADR-0150 + ADR-0153 — the extend-next increment; the spec of the feel):

- **Real app UI, progressive disclosure (ADR-0153).** The walk and the orchestrator surface reuse the
  REAL desktop/web app's UI components (`apps/desktop`, `apps/studio`), NOT bespoke website chrome — the
  visitor sees the actual product's interface, if fictionalised. UI elements the visitor has NOT yet
  been walked through are HIDDEN, revealed as the walk reaches them (progressive disclosure) — the
  interface itself is part of the lesson, never dumped. Whether "reuse the real components" is literal
  (more synced across the boundary) or faithful re-creation against the same design system is an open
  build-time mechanism call (the site only HAS the synced `buildScene` artifact — ADR-0056/0066/0093);
  the WHAT is visual parity + no bespoke chrome, the HOW is the frontend-builder's + owner's call.
- **No escape hatches (ADR-0153).** There is NO "skip the intro" and NO path to any static / deprecated
  page — a capable visitor is offered no escape to them (all deprecated). The ONLY surviving
  non-experience path is the gate-required no-JS / `prefers-reduced-motion` a11y fallback. The
  continuous walk is the front door.
- **The walk CONTINUES — one arc, not a new phase.** H is not a separate page, a fresh start, or a
  second experience behind a destination button. The visitor who has just watched the mock website grow
  green **keeps walking the same arc**: the next beats reveal the upstream forest, at the same
  one-tap-per-beat pace, narrated by the same orchestrator voice (ADR-0030's human-facing planning
  agent; the org analogy's manager scoping the next slice of work). G's "what's next" CTA is a
  **continuation seam** — the walk flows on; it does not branch to a new page. This is the owner's "it
  shouldnt be separate": the seam is invisible-as-a-boundary; the visitor experiences one continuous
  guided walk.
- **Upstream, PROPOSED, on real `dependsOn` edges — the dependency STACK the website rests on.** The
  **backend** and **database** appear as **proposed** trees (the `'proposed'` status the map already
  renders — sapling/ghosted, not green), and the **website owns the `dependsOn` edges** pointing FROM
  the dependent TO its prerequisite: `website.dependsOn=[backend]`, `backend.dependsOn=[database]`,
  `database.dependsOn=[]` (ADR-0058 / `cross-story-dependency` — the website NEEDS the backend to serve
  a working checkout; the backend needs the database; a database is provable headless). This is the
  correction ADR-0148 named and ADR-0153 sets right: the walk must SHOW that a backend and a database
  are what the website DEPENDS ON — not pretend the website is a leaf, and not encode the edge backwards
  (the refused build had `backend dependsOn website` — corrected here). **Spatially** (owner preference,
  a free render choice — ADR-0153): the FRONTEND renders HIGH (the consumer on top) and the dependencies
  render as the FOUNDATION BELOW — the database at the base, the backend above it, the website on top,
  the foundation delivering UP to the consumer. Note the two axes agree: "upstream" (the dependency
  direction — toward what the website needs) renders as the foundation BELOW; they are the same layering
  seen from the dependency axis and the screen axis, not a contradiction. These are NOT sibling/neighbor
  islands beside the website (the shape the unlanded ADR-0147 had — overtaken, never merged to main, so
  referenced by name only); they are the dependency layers the website rests on.
- **The dependency layer IS the advantage — the teach (replaces the wrong-way flag).** This is where
  beat 4's reframe LANDS. The old beat 4 drew a wrong-way UI→DB road flagged as an antipattern — a
  NEGATIVE teach (here is a mistake storytree catches). H's upstream reveal is the POSITIVE inverse:
  the dependency LAYERS, shown on the actual 2.5D map, ARE storytree's advantage. The visitor SEES that
  the website needs a backend which needs a database, in the honest order, with nothing hidden — and
  that this visible, ordered structure is exactly what the chaotic swarm (Act 1) did not give them
  (there, the backend was buried and discovered by failure). The teach is "here is the honest
  dependency structure, revealed to you as the thing you build next," not "here is a flagged mistake."
  The narration carries the advantage framing (the copy is site-side, keyed by beat id): as each
  upstream layer rises, the callout names WHY it is there and that SEEING it — in order, up front — is
  the point.
- **The drive-machinery diagrams deepen here (ADR-0153, steps 3–4).** H is the DEPTH of the walk — it
  grows the backend and the database — so the expanded drive-machinery picture lives here: what the
  orchestrator's routing actually SETS IN MOTION (CI/CD, devops, the gates, how the system is wired to
  the code to keep it honest). These are TEMPORARY flow-diagram OVERLAYS (a second overlay, top-right,
  is fine), not drawn on the map — because the background machinery is not map signal unless something
  breaks or needs attention; the map stays the honest picture, the process detail floats above it and
  clears. They MUST NOT overload the viewer — reveal them scaffolded, in the order a human can hold, as
  the walk deepens. The overlays are site-side content keyed by beat id (the `act2-beat-director` engine
  needs no change — ADR-0153's authoring call); the words and diagrams live with the surface.
- **Stories at EVERY level of the DAG, not just leaves.** The reveal is not a flat list of tasks; it is
  the DAG itself — a story (the backend), which has its own capabilities/contracts, which depends on
  another story (the database). The visitor sees that storytree grows work at any level, which is the
  product's actual shape (story › capability › contract). Do not flatten it to "here are two more
  things to build."
- **Inspectable — what it is and why.** The visitor can open any proposed upstream story to read, in
  plain language, WHAT it is (its outcome on a label — the same anchored-callout treatment G uses) and
  WHY it is proposed (the orchestrator's dependency rationale, grounded in the website's needs: carts
  need storage → a database; checkout needs server logic → a backend). Inspection is a first-class
  affordance, not a tooltip afterthought — the whole point is comprehension on demand.
- **Walk them green PROGRESSIVELY, on demand.** The visitor grows the proposed upstream stories green
  ONE AT A TIME, at their own pace, using the same visitor-paced Next gesture G established (the
  deliberate inverse of Act 1's all-at-once). Nothing auto-grows the whole forest; the visitor chooses
  to advance each step. Green still appears ONLY on the signed-proof marker — the beat-director's data
  contract H reuses, so a proposed story cannot colour green without its proof even in fiction.
- **Scaffolded, never dumped, never hidden.** Complexity is revealed in the order a human can hold it,
  as the walk continues upstream — the upstream forest is NOT dumped on screen the instant the website
  walk ends (that would overwhelm, the very Act 1 failure), and it is NOT hidden (the complexity is
  real and honestly shown when reached). This is ADR-0148's stated design obligation; a build that
  reveals the whole upstream DAG at once, or that hides the backend behind a "magic" green, has broken
  the thesis.
- **Same substrate, same boundary.** The real 2.5D map (ADR-0145), the synced `buildScene` scene
  graph, the anchored callouts, the scripted-orchestrator voice — all carried forward from G, not
  re-invented. All data fictional (site-side, the Cohoot precedent); no live store, no real corpus, no
  operable affordances beyond the guided walk — the boundary (ADR-0056/0066/0093) holds by
  construction because the site only HAS the synced artifacts.

BUILD SHAPE: `storytree-web` repo work on its own rail, `frontend-builder` driving. H extends G's
Act 2 surface as the CONTINUATION of the same walk: the upstream proposed stories are additional
`DirectorState.world` deltas — specifically the re-specced [`act2-beat-director`](act2-beat-director.md)'s
new **`add-upstream-story`** delta, whose edges point FROM the dependent TO its prerequisite — the
WEBSITE carries `dependsOn=[backend]`, the BACKEND carries `dependsOn=[database]` (ADR-0058 / ADR-0153,
the corrected direction; the upstream stories do NOT carry an edge back to the website) — folded into
fresh `SceneInput`s → the synced `buildScene` → the site's 2.5D SVG (as G, per ADR-0145). Rendered with
the frontend HIGH and the dependency foundation BELOW (owner spatial preference, a free render choice —
builder/owner-tunable at the gate). **Real app UI (ADR-0153):** the walk and the orchestrator surface
reuse the real desktop/web app's UI components (not bespoke chrome), with progressive disclosure (hide
what the visitor has not been walked through) — whether that is literal component reuse across the sync
boundary or faithful re-creation against the same design system is an open build-time mechanism call
(the site only HAS the synced `buildScene` artifact, ADR-0056/0066/0093; flag it for the
frontend-builder + owner, do not over-constrain). **Drive-machinery overlays (ADR-0153, steps 3–4):**
the expanded CI/CD / devops / gates / wiring diagrams are TEMPORARY overlays (a second overlay,
top-right, is fine) — site-side content keyed by beat id (NOT engine structure — the director carries no
overlay field, ADR-0153's authoring call), validated against the director's exported contract by
`act2-validate`. The inspect affordance (open a proposed upstream story → its outcome + the
orchestrator's why) and the progressive upstream advance are the site's job, keyed by story id against
the director's exported contract; STATE stays the proven engine's. Because H is ONE continuous walk, the
upstream beats EXTEND the director's exported default script (the website walk's beats then the upstream
arc, one script) — not a second director segment; the director is data-driven, so the single grown
`defaultScript` is the natural shape. The wrong-way road is no longer a beat in that script (ADR-0150
§4). The WHAT here is the experienced continuous-upstream reveal with the dependency-layer-as-advantage
teach, the real-app UI, and no escape hatches — not the wiring.

## UAT (operator-attested)

Human-witnessed legs on the live/preview site (an agent may stage; a human renders the verdict —
appearance and feel are never self-signed, ADR-0070). The list is minimal-first
(`uat-proves-the-goal-not-the-surface`): it proves H's goal end-to-end; a case is added only when a
real defect earns a permanent one.

1. **The walk continues upstream — one arc, not a new page.** _(witness: human)_ From increment G's
   finished website walk, advance past the mock website's completion. **Success —** the SAME walk
   continues: the session orchestrator (same voice G established) guides upstream at the same one-tap
   pace; there is NO jump to a new page, no separate "grow the backend" destination, no fresh start —
   the visitor experiences one continuous guided walk. The G→H seam is invisible as a boundary.
2. **The forest is the dependency STACK, PROPOSED, layered on real dependency edges in the right
   direction.** _(witness: human)_ A backend and a database appear as proposed (sapling/ghosted, not
   green) trees forming the dependency stack the website rests on, connected by dependency edges pointing
   the correct way — `website.dependsOn=[backend]`, `backend.dependsOn=[database]` (`website → backend →
   database`, dependent → prerequisite). Rendered with the frontend HIGH and the foundation BELOW (owner
   spatial preference). **Success —** a non-expert reads the layout as "my website DEPENDS ON these; they
   are the foundation it rests on," not as siblings or downstream extras, and NOT as the website being
   something the backend depends on (the direction is right way round) — the backend/database-are-what-
   the-website-needs point lands, drawn as the map's actual dependency layering.
3. **The dependency layer reads as the ADVANTAGE (not a wrong-way flag).** _(witness: human)_ Watch the
   upstream layers reveal and read the narration. **Success —** the teach lands POSITIVE: the visitor
   understands that SEEING the dependency layers — the website needs a backend needs a database, in the
   right order, nothing hidden — IS storytree's advantage over the chaotic swarm (Act 1 buried the
   backend; storytree shows it up front as the thing you build next). There is NO wrong-way-road
   antipattern flag presented as the teach; the honest structure, revealed, is the point.
4. **Stories exist at every DAG level, not just leaves.** _(witness: human)_ Inspect the revealed
   structure. **Success —** the visitor can see it is the DAG itself — a backend story with its own
   sub-work, depending on a database story — not a flat checklist; storytree visibly grows work at any
   level (story › capability › contract), which is the product's real shape.
5. **Each proposed upstream story is inspectable — what it is and why.** _(witness: human)_ Open a
   proposed upstream story (e.g. the database). **Success —** in plain language, the visitor learns
   WHAT it is (its outcome, on the anchored-callout treatment) and WHY it is proposed (the
   orchestrator's dependency rationale grounded in the website's needs) — comprehension is available on
   demand, not buried.
6. **The upstream forest is walked green progressively, on demand.** _(witness: human)_ Advance the
   proposed upstream stories one at a time with the visitor-paced Next gesture. **Success —** the
   visitor grows them green one step at a time at their own pace; a limb greens ONLY with the
   signed-proof narration (never before — the beat-director contract still holds); nothing auto-grows
   the whole forest ahead of the visitor.
7. **Complexity is scaffolded, never dumped and never hidden.** _(witness: human)_ Watch the reveal
   pacing across the whole upstream arc. **Success —** the upstream forest is revealed in the order the
   walk reaches it (never dumped on screen at once — no Act-1-style overwhelm), and the real complexity
   is honestly shown when reached (never hidden behind a "magic" green) — the visitor feels guided
   through the depth, not buried by it or lied to about it.
8. **The surface is the real app's UI, revealed progressively (ADR-0153).** _(witness: human)_ Look at
   the walk and the orchestrator surface. **Success —** they read as the REAL storytree product's
   interface (the same UI components the desktop/web app uses), not bespoke website chrome; a visitor who
   later opens the real app recognises it. UI elements the walk has not yet reached are HIDDEN and appear
   as the walk earns them (progressive disclosure) — the visitor is never dumped in front of the full
   interface at once.
9. **There is no escape to a deprecated page (ADR-0153).** _(witness: human)_ Look for any "skip the
   intro" or "prefer the classic page" affordance, and try to reach a static/deprecated page from the
   experience. **Success —** none is offered to a capable visitor; the continuous walk is the only front
   door. The no-JS / `prefers-reduced-motion` accessibility fallback still exists for those who need it
   (a clean minimal static page), but it is not an escape a capable visitor is handed.
10. **The drive-machinery diagrams teach the deeper picture without overloading (ADR-0153).** _(witness:
    human)_ Advance through the steps where the walk deepens into what the orchestrator's routing sets in
    motion (CI/CD, devops, gates, wiring). **Success —** temporary overlay diagrams (a second overlay,
    top-right, is fine) appear ABOVE the map — not drawn on it — depicting the drive machinery, then
    clear; they reveal the depth scaffolded, in an order a first-time viewer can hold, and never dump the
    whole system at once. The map stays the honest picture of the work; the machinery is transient chrome
    that surfaces when taught and recedes.
