---
id: "act2-guided-forest"
tier: capability
story: website-experience
title: "Act 2 (increment H) — the ONE continuous walk grows UPSTREAM: the same walk keeps going into a proposed backend + database the website depends on, the dependency layers shown on the real map ARE the advantage, inspectable and walked green on demand"
outcome: "The visitor who just grew the mock website green in increment G (act2-guided-walkthrough) KEEPS WALKING — the SAME continuous walk, not a separate CTA-gated phase — as the SESSION ORCHESTRATOR guides them UPSTREAM: because the mock website's Cart / Payments / Receipts cannot truly work without a backend, the walk reveals a backend and a database as PROPOSED trees positioned ABOVE the website on real dependsOn edges (website → backend → database), stories at EVERY LEVEL of the DAG (not just leaves; it is correct that backend/database sit above the website). The DEPENDENCY LAYERS thus made visible on the real 2.5D map ARE the advantage storytree teaches — you SEE the layers, you build them in the right order, nothing is hidden (this POSITIVE teach replaces increment G's beat-4 wrong-way-flag antipattern; the honest structure is the advantage, not a flagged mistake). The visitor can INSPECT each proposed upstream story to understand WHAT it is and WHY it is proposed, and WALK them green PROGRESSIVELY on demand — complexity is SCAFFOLDED (revealed in the order a human can hold it, as the walk continues), never hidden and never dumped up front. On the real 2.5D map (ADR-0145), narrated by the same anchored callouts + scripted-orchestrator voice increment G established, over fictional data — a teaching diorama, never the operable studio."
status: proposed
proof_mode: operator-attested
depends_on: [act2-guided-walkthrough]
decisions: [134, 145, 148, 150]
# OPERATOR-ATTESTED (ADR-0070) — web-repo work, the extend-next half of the Act 2 re-scope (ADR-0148),
# RE-SHAPED by ADR-0150 (owner-directed at the G attestation gate 2026-07-04): H is now ONE
# CONTINUOUS WALK growing UPSTREAM (not a CTA-gated separate phase), and the dependency-layer-as-
# advantage teach REPLACES beat 4's wrong-way flag.
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
walk**, not a separate CTA-gated phase — as the **session orchestrator** guides them **UPSTREAM**:
because the mock website's **Cart / Payments / Receipts cannot truly work without a backend**, the
walk reveals a **backend** and a **database** as **PROPOSED trees** positioned **ABOVE the website**
on real `dependsOn` edges (`website → backend → database`), with **stories at every level of the DAG**
(not just leaves; it is correct — the ADR-0148 point — that a backend and a database sit above the
website).

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

> **Proof status (honest) — `proposed`, operator-attested (ADR-0070); AUTHORED, not built.** This is
> the **extend-next** half of the Act 2 re-scope
> ([ADR-0148](../../docs/decisions/0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md),
> owner-directed 2026-07-03), **RE-SHAPED by ADR-0150** (owner-directed at the G attestation
> gate 2026-07-04 — see "The re-shape" below): increment G ships the website-first walk first, then H
> continues it as ONE walk growing upstream, teaching the dependency layers as the advantage. Nothing
> here is proven yet; `healthy` is earned through the gate, never authored (ADR-0020). The
> machine-checkable teaching claim (green only on signed proof) stays
> [`act2-beat-director`](act2-beat-director.md)'s parent-side data contract — H reuses that proven
> engine (re-specced to a multi-story-with-`dependsOn` upstream vocabulary), so the site cannot walk a
> forest that contradicts the verification-gap thesis. The wrong-way-road flag is RETIRED as the teach
> (ADR-0150 §4; the dependency-layer-as-advantage teach replaces it). What a human must witness
> is what remains and is genuinely new to H: does the walk CONTINUE seamlessly upstream (one arc, not a
> new page); does the reveal of a backend + database on real `dependsOn` edges READ as the dependency
> LAYERS being the advantage; can a non-expert inspect a proposed upstream story and grasp what/why;
> does the progressive walk-green feel on-demand; and is complexity SCAFFOLDED rather than hidden or
> dumped. Built by the `frontend-builder` in `storytree-web` (branch off ITS `origin/main`, its own CD)
> and witnessed by the owner on the live/preview site — appearance and feel are never self-signed
> (ADR-0070). A HALT point for the driving session.
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

## Guidance

THE SURFACE (ADR-0150 — the extend-next increment; the spec of the feel):

- **The walk CONTINUES — one arc, not a new phase.** H is not a separate page, a fresh start, or a
  second experience behind a destination button. The visitor who has just watched the mock website grow
  green **keeps walking the same arc**: the next beats reveal the upstream forest, at the same
  one-tap-per-beat pace, narrated by the same orchestrator voice (ADR-0030's human-facing planning
  agent; the org analogy's manager scoping the next slice of work). G's "what's next" CTA is a
  **continuation seam** — the walk flows on; it does not branch to a new page. This is the owner's "it
  shouldnt be separate": the seam is invisible-as-a-boundary; the visitor experiences one continuous
  guided walk.
- **Upstream, PROPOSED, on real `dependsOn` edges — the forest grows ABOVE the website.** The
  **backend** and **database** appear as **proposed** trees (the `'proposed'` status the map already
  renders — sapling/ghosted, not green), positioned **UPSTREAM** of the website story and connected by
  **dependency edges the website owns** (`website → backend → database`). The layering is drawn on the
  map: the website depends on the backend, which depends on the database, so they stack ABOVE it. This
  is the correction ADR-0148 named — the walk must SHOW that a backend and a database are upstream of
  the website, not pretend the website is a leaf — realised as the map's actual dependency layers.
  These are NOT sibling/neighbor islands beside the website (the shape the unlanded ADR-0147 had —
  overtaken, never merged to main, so referenced by name only); they are upstream layers.
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
new **`add-upstream-story`** delta, whose stories carry `dependsOn` edges pointing down to the website
— folded into fresh `SceneInput`s → the synced `buildScene` → the site's 2.5D SVG (as G, per ADR-0145).
The inspect affordance (open a proposed upstream story → its outcome + the orchestrator's why) and the
progressive upstream advance are the site's job, keyed by story id against the director's exported
contract; STATE stays the proven engine's. Because H is ONE continuous walk, the upstream beats EXTEND
the director's exported default script (the website walk's beats then the upstream arc, one script) —
not a second director segment; the director is data-driven, so the single grown `defaultScript` is the
natural shape. The wrong-way road is no longer a beat in that script (ADR-0150 §4). The WHAT
here is the experienced continuous-upstream reveal with the dependency-layer-as-advantage teach, not
the wiring.

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
2. **The forest is upstream, PROPOSED, and layered on real dependency edges.** _(witness: human)_ A
   backend and a database appear as proposed (sapling/ghosted, not green) trees positioned UPSTREAM of
   the mock website, connected by dependency edges (`website → backend → database`). **Success —** a
   non-expert reads the layout as "these sit ABOVE my website; my website depends on them," not as
   siblings or downstream extras — the backend/database-are-upstream point lands, drawn as the map's
   actual dependency layering.
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
