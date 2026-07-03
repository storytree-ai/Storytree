---
id: "act2-guided-forest"
tier: capability
story: website-experience
title: "Act 2 (increment H) — the guided forest: the orchestrator guides the user upstream to a proposed database + backend, stories at every DAG level, inspectable and walked green on demand"
outcome: "Picking up from increment G's 'what's next' CTA (act2-guided-walkthrough), the SESSION ORCHESTRATOR guides the visitor UPSTREAM: because the mock website's Cart / Payments / Receipts cannot truly work without a backend, it reveals a forest of PROPOSED trees — a database and a proper backend — growing UPSTREAM of the website the user first asked for, with stories at EVERY LEVEL of the DAG (not just leaves; it is correct that backend/database sit above the website). The visitor can INSPECT each proposed story to understand WHAT it is and WHY it is proposed, and WALK them green PROGRESSIVELY on demand — complexity is SCAFFOLDED (revealed in the order a human can hold it, as the user asks for the next step), never hidden and never dumped up front. On the real 2.5D map (ADR-0145), narrated by the same anchored callouts + scripted-orchestrator voice increment G established, over fictional data — a teaching diorama, never the operable studio."
status: proposed
proof_mode: operator-attested
depends_on: [act2-guided-walkthrough]
decisions: [134, 145, 148]
# OPERATOR-ATTESTED (ADR-0070) — web-repo work, the extend-next half of the Act 2 re-scope (ADR-0148).
# This capability EXTENDS increment G: it reuses G's proven substrate — the real 2.5D map render
# (ADR-0145), the anchored-callout narration, the visitor-paced Next affordance, the beat/director
# engine (act2-beat-director, already machine-proven parent-side), and the scripted-orchestrator seam
# G introduced — so it depends only on act2-guided-walkthrough (the director + sync + inflection are
# transitive through G). What THIS capability owns is the experienced surface no machine can judge:
# does the upstream guidance READ as the orchestrator scoping the next real step; does the forest of
# PROPOSED trees show stories at every DAG level (not just leaves); can a non-expert INSPECT a
# proposed story and understand what/why; does walking them green feel PROGRESSIVE and on-demand; is
# complexity SCAFFOLDED (revealed as asked-for) rather than hidden or dumped. The teaching claims that
# ARE machine-checkable (green only on signed proof, the flagged wrong-way road) remain act2-beat-
# director's parent-side data contracts — the site cannot walk a script that contradicts the thesis.
# NO `proof:` block — witnessed, not `--real`-built. The frontend-builder is the inner-loop role; the
# owner witnesses on the live/preview site; appearance and feel are never self-signed. A HALT point
# for the driving session — this is the extend-next increment the owner sequenced AFTER G ships.
---

# Act 2 (increment H) — the guided forest: the orchestrator guides the user upstream to a proposed database + backend

**Outcome —** Picking up from increment G's **"what's next" CTA**
([`act2-guided-walkthrough`](act2-guided-walkthrough.md)), the **session orchestrator** guides the
visitor **UPSTREAM**: because the mock website's **Cart / Payments / Receipts cannot truly work
without a backend**, it reveals a forest of **PROPOSED trees** — a **database** and a **proper
backend** — growing **upstream** of the website the user first asked for, with **stories at every
level of the DAG** (not just leaves; it is correct — the ADR-0148 point — that a backend and a
database sit ABOVE the website). The visitor can:

- **Inspect each proposed story** to understand **what it is** and **why it is proposed** (the
  orchestrator's rationale — "your checkout needs somewhere to keep carts; that is a database"), and
- **Walk them green PROGRESSIVELY**, on demand, one at a time — the same visitor-paced Next gesture
  increment G established.

**Complexity is SCAFFOLDED** — revealed in the order a human can hold it, as the user asks for the
next step ([ADR-0148](../../docs/decisions/0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md)'s
stated design obligation) — **never hidden, never dumped up front.** All on the real 2.5D map
([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)),
narrated by the same anchored callouts + scripted-orchestrator voice G established, over fictional
data — a stylized teaching diorama, never the operable studio.

**Depends on —** [`act2-guided-walkthrough`](act2-guided-walkthrough.md) (increment G) — H opens
from G's "what's next" CTA and extends G's scripted-orchestrator seam and its proven substrate (the
2.5D map render, the anchored-callout narration, the visitor-paced Next affordance, the
[`act2-beat-director`](act2-beat-director.md) engine, the [`web-experience-sync`](web-experience-sync.md)
artifact rail — all transitive through G). There is no upstream forest to reveal until the website
walk it grows from exists.

> **Proof status (honest) — `proposed`, operator-attested (ADR-0070); AUTHORED, not built.** This is
> the **extend-next** half of the Act 2 re-scope ([ADR-0148](../../docs/decisions/0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md),
> owner-directed 2026-07-03): increment G ships the website-first walk first, then H extends it with
> the upstream guided forest. Nothing here is proven yet; `healthy` is earned through the gate, never
> authored (ADR-0020). The machine-checkable teaching claims (green only on signed proof, the flagged
> wrong-way road) stay [`act2-beat-director`](act2-beat-director.md)'s parent-side data contracts — H
> reuses that proven engine, so the site cannot walk a forest that contradicts the thesis. What a
> human must witness is what remains and is genuinely new to H: does the upstream guidance read as the
> orchestrator scoping the next real step; does the forest show stories at EVERY DAG level (not just
> leaves); can a non-expert inspect a proposed story and grasp what/why; does the progressive
> walk-green feel on-demand; and is complexity SCAFFOLDED rather than hidden or dumped. Built by the
> `frontend-builder` in `storytree-web` (branch off ITS `origin/main`, its own CD) and witnessed by
> the owner on the live/preview site — appearance and feel are never self-signed (ADR-0070). A HALT
> point for the driving session.

## Guidance

THE SURFACE (ADR-0148 — the extend-next increment; the spec of the feel):

- **It opens from G's "what's next", not cold.** H is not a separate page or a fresh start — it is the
  answer to the question increment G's CTA poses. The visitor who has just watched the mock website
  grow asks "what's next?" and the orchestrator responds by guiding upstream. The seam is G's scripted
  orchestrator returning — same voice, same planning/pushback register (ADR-0030's human-facing
  planning agent; the org analogy's manager scoping the next slice of work).
- **Upstream, and PROPOSED — the forest grows above the website.** The database and backend appear as
  **proposed** trees (the `'proposed'` status the map already renders — sapling/ghosted, not green),
  positioned **UPSTREAM** of the website story: the website depends on them, so they sit above it in
  the DAG. This is the correction ADR-0148 names — the walk must SHOW that a backend and a database
  are upstream of the website, not pretend the website is a leaf.
- **Stories at EVERY level of the DAG, not just leaves.** The reveal is not a flat list of tasks; it
  is the DAG itself — a story (the backend), which has its own capabilities/contracts, which depends
  on another story (the database). The visitor sees that storytree grows work at any level, which is
  the product's actual shape (story › capability › contract). Do not flatten it to "here are three
  more things to build."
- **Inspectable — what it is and why.** The visitor can open any proposed story to read, in plain
  language, WHAT it is (its outcome on a label — the same anchored-callout treatment G uses) and WHY
  it is proposed (the orchestrator's dependency rationale, grounded in the website's needs: carts need
  storage → a database; checkout needs server logic → a backend). Inspection is a first-class
  affordance, not a tooltip afterthought — the whole point is comprehension on demand.
- **Walk them green PROGRESSIVELY, on demand.** The visitor grows the proposed stories green ONE AT A
  TIME, at their own pace, using the same visitor-paced Next gesture G established (the deliberate
  inverse of Act 1's all-at-once). Nothing auto-grows the whole forest; the visitor chooses to advance
  each step. Green still appears ONLY on the signed-proof marker — the beat-director's data contract H
  reuses, so a proposed story cannot colour green without its proof even in fiction.
- **Scaffolded, never dumped, never hidden.** Complexity is revealed in the order a human can hold it,
  as the user asks for the next step — the upstream forest is NOT dumped on screen the instant Act 2
  begins (that would overwhelm, the very Act 1 failure), and it is NOT hidden (the complexity is real
  and honestly shown when reached). This is ADR-0148's stated design obligation; a build that reveals
  the whole DAG up front, or that hides the backend behind a "magic" green, has broken the thesis.
- **Same substrate, same boundary.** The real 2.5D map (ADR-0145), the synced `buildScene` scene
  graph, the anchored callouts, the scripted-orchestrator voice — all carried forward from G, not
  re-invented. All data fictional (site-side, the Cohoot precedent); no live store, no real corpus, no
  operable affordances beyond the guided walk — the boundary (ADR-0056/0066/0093) holds by
  construction because the site only HAS the synced artifacts.

BUILD SHAPE: `storytree-web` repo work on its own rail, `frontend-builder` driving. H extends G's
Act 2 surface: the upstream proposed stories are additional `DirectorState.world` deltas folded into
fresh `SceneInput`s → the synced `buildScene` → the site's 2.5D SVG (as G, per ADR-0145). The
inspect affordance (open a proposed story → its outcome + the orchestrator's why) and the progressive
upstream advance are the site's job, keyed by story id against the director's exported contract; STATE
stays the proven engine's. Whether the upstream stories extend the exported default script or ride a
second director segment is a build-time call for the `frontend-builder` (the director is data-driven,
per `act2-beat-director`) — the WHAT here is the experienced upstream-forest reveal, not that wiring.

## UAT (operator-attested)

Human-witnessed legs on the live/preview site (an agent may stage; a human renders the verdict —
appearance and feel are never self-signed, ADR-0070):

1. **The hand-off opens the forest.** _(witness: human)_ From increment G's finished walk, ask
   "what's next?" at the CTA. **Success —** the session orchestrator responds in the same voice G
   established and begins guiding upstream — a continuation of the same session, not a jump to a new
   page or a fresh topic.
2. **The forest is upstream and PROPOSED.** _(witness: human)_ A database and a proper backend appear
   as proposed (sapling/ghosted, not green) trees positioned UPSTREAM of the mock website the user
   built. **Success —** a non-expert reads the layout as "these sit ABOVE my website; my website needs
   them," not as siblings or downstream extras — the backend/database-are-upstream point lands.
3. **Stories exist at every DAG level, not just leaves.** _(witness: human)_ Inspect the revealed
   structure. **Success —** the visitor can see it is the DAG itself — a backend story with its own
   sub-work, depending on a database story — not a flat checklist; storytree visibly grows work at any
   level (story › capability › contract), which is the product's real shape.
4. **Each proposed story is inspectable — what it is and why.** _(witness: human)_ Open a proposed
   story (e.g. the database). **Success —** in plain language, the visitor learns WHAT it is (its
   outcome, on the anchored-callout treatment) and WHY it is proposed (the orchestrator's dependency
   rationale grounded in the website's needs) — comprehension is available on demand, not buried.
5. **The forest is walked green progressively, on demand.** _(witness: human)_ Advance the proposed
   stories one at a time with the visitor-paced Next gesture. **Success —** the visitor grows them
   green one step at a time at their own pace; a limb greens ONLY with the signed-proof narration
   (never before — the beat-director contract still holds); nothing auto-grows the whole forest ahead
   of the visitor.
6. **Complexity is scaffolded, never dumped and never hidden.** _(witness: human)_ Watch the reveal
   pacing across the whole upstream arc. **Success —** the upstream forest is revealed in the order the
   visitor asks for it (never dumped on screen at once — no Act-1-style overwhelm), and the real
   complexity is honestly shown when reached (never hidden behind a "magic" green) — the visitor feels
   guided through the depth, not buried by it or lied to about it.
