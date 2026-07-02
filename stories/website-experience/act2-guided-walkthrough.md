---
id: "act2-guided-walkthrough"
tier: capability
story: website-experience
title: "Act 2 — the visitor-paced five-beat walkthrough grows the REAL 2.5D map to the CTA"
outcome: "On the calm land, an auto-guided, VISITOR-PACED walkthrough (one Next-tap per beat, plain language — the tonal inverse of Act 1) grows the fictional forest through the five approved beats ON THE REAL 2.5D MAP — the synced buildScene scene graph rendered as the site's SVG (ADR-0145), representative of the actual product — narrated by game-tutorial CALLOUT BOXES anchored to the exact map element each beat teaches: plant a story (outcome on a label) → watch a wisp (presence without obligation) → it branches (limbs green ONLY on signed proof) → stories connect (roads, the wrong-way UI→DB road visibly flagged) → pull back (one legible forest: green = proven, sapling = in-progress, withered = broken) → the CTA to the real product — a stylized teaching diorama over fictional data, never the operable studio."
status: proposed
proof_mode: operator-attested
depends_on: [storm-to-forest-inflection, act2-beat-director, web-experience-sync]
decisions: [134, 145]
# OPERATOR-ATTESTED (ADR-0070) — web-repo work. The choreography ENGINE is already machine-proven
# upstream (act2-beat-director: visitor-paced advance, proof-gated green, the flagged wrong-way
# road, the approved default script — all parent-side contracts), and the artifact freshness is the
# extended check:web-engine's job. What THIS capability owns is the experienced surface: the
# narration copy (site-side, plain language, keyed by beat id against the director's exported zod
# contract), the anchored-callout + map-motion feel, the Next affordance, and whether each beat
# TEACHES its concept to a non-expert — irreducibly human judgements on the real site. NO `proof:`
# block — witnessed, not `--real`-built.
---

# Act 2 — the visitor-paced five-beat walkthrough grows the REAL 2.5D map to the CTA

**Outcome —** On the calm land, an auto-guided, **VISITOR-PACED** walkthrough (one Next-tap per
beat, **plain language** — the tonal inverse of Act 1's jargon) grows the fictional forest through
the five approved beats **on the real 2.5D map** — the synced `buildScene` scene graph rendered as
the site's SVG
([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)),
so the visitor watches something representative of the actual product — narrated by **callout boxes
anchored to the exact map element each beat teaches**, ending on the **CTA** to the real product — a
stylized teaching diorama over fictional data, never the operable studio.

**Depends on —** [`storm-to-forest-inflection`](storm-to-forest-inflection.md) — the land it grows
on; [`act2-beat-director`](act2-beat-director.md) — the script it walks;
[`web-experience-sync`](web-experience-sync.md) — the artifact rail both ride to the site.

> **Proof status (honest) — `proposed`, operator-attested (ADR-0070).** The teaching claims are
> deliberately NOT left to this attestation: "green only on signed proof" and "the wrong-way road
> is flagged" are DATA CONTRACTS the parent spine already holds in `act2-beat-director` — the site
> cannot walk a script that contradicts the thesis. What a human must witness is what remains:
> does each beat land its concept, in plain words, at one tap of effort — the felt calm ADR-0134
> stakes the pitch on.
>
> **Attestation history:** a first build (the five beats over the R3F 3D island, per ADR-0134 §3's
> original tech note) reached its owner gate 2026-07-03 with the machine floor green (61-check
> Playwright witness; storytree-web draft PR #20, closed superseded) and was **refused at stage 2**
> — the owner re-decided the substrate onto the real 2.5D map with anchored-callout narration
> ([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)).
> The closed PR's renderer-agnostic pieces (narration copy, the `act2-validate` build-time wall, the
> pacing/beat UI logic) are salvage for the rebuild.

## Guidance

THE SURFACE (owner decisions 2026-07-02 + the 2026-07-03 re-decision, ADR-0145 — the spec of the feel):

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
- **The five beats teach by watching, one concept each** (the research-table rows, verbatim in
  spirit): the seed→tree with the OUTCOME ON A LABEL answers orphaned intent; the drifting wisp
  answers babysitting (presence without obligation — the visitor does nothing and that is the
  point); the branch beat answers the verification gap (a limb greens only as a SIGNED PROOF lands
  — narrate exactly that); the roads beat answers illegible architecture (the wrong-way UI→DB road
  skipping the service layer appears visibly flagged the moment it is drawn); the pull-back answers
  terminal sprawl (one calm screen: green = proven, sapling = in-progress, withered = broken —
  the anti-storm, framed as the answer to Act 1's HUD).
- **The CTA ends it.** The final state offers the real product (get-involved / the repo / the
  studio pitch — per `info-pages-triage`'s outcome), honestly labelled: this was a diorama; the
  real thing is watched-live.
- **Diorama, not studio.** All data fictional (site-side, the Cohoot precedent); no live store, no
  real corpus, no operable affordances beyond the walkthrough — the boundary
  (ADR-0056/0066/0093) holds by construction because the site only HAS the synced artifacts.
- **Increment coherence.** Beats may land incrementally (the director is data-driven): each merge
  ships a complete-so-far arc that still ends on the CTA — never a dead-end Next.

BUILD SHAPE: `storytree-web` repo work on its own rail, `frontend-builder` driving; the map layer
folds each `DirectorState.world` into a fresh `SceneInput` → the synced `buildScene` → the site's
2.5D SVG (client-side per beat, or per-beat scenes pre-rendered at build time — `worldSvg` is pure
string building, so either is viable; the builder's call, per ADR-0145). Map motion (viewBox
tweens, growth transitions, callout placement from per-element `data-id` geometry) is the site's
job; STATE is the proven engine's.

## UAT (operator-attested)

1. **The pacing inverts the storm.** _(witness: human)_ From the empty land, the walkthrough
   advances ONLY on Next — five taps, five beats, no auto-play; effort never exceeds one tap.
2. **Each beat lands its concept.** _(witness: human)_ Guided by a callout anchored to the element
   being taught, a non-expert reader can say back, per beat: intent lives on the map; I can see it
   working without watching it; green means proven, not claimed; that road is wrong and I can see
   why; the whole thing fits on one calm screen.
3. **The thesis moments read.** _(witness: human)_ The walk happens on the real 2.5D map (the
   product's own look); the limb visibly greens WITH the signed-proof narration (never before); the
   wrong-way UI→DB road is instantly distinguishable from the good roads; the pull-back forest is
   legible at a glance (green / sapling / withered).
4. **The CTA closes honestly.** _(witness: human)_ The arc ends offering the real product, plainly
   labelled as the step out of the diorama; no beat dead-ends.
