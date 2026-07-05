---
status: accepted
decided: 2026-07-05
amends: [153, 157]
---
# ADR-0165: Act 2 redesign: one growing system diagram advanced through the orchestrator chat, a persistent mini-map replacing the corner overlays, an orbiting wisp, and a zoom-out to the real studio

## Status

accepted (2026-07-05) — decided/directed by the owner in conversation on 2026-07-05, where the owner
walked an interactive design proposal for the Act-2 opening redesign (the follow-on redesign
[ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md)'s As-built recorded
as directed-but-not-yet-decided) and approved it **AS PRESENTED**. Recorded verbatim (a design verdict
only the owner can sign, agent-relayed — ADR-0044 §4):

> *"This looks many steps forward, please chip a fresh session to land this."*

No per-question overrides were given, so the proposal's nine recommendations stand as the ACCEPTED
defaults (§8). Design-time alignment IS the ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)); this ADR is born accepted —
no second end-of-flow ask.

This is a NEW ADR, not an in-place edit of the ADRs it amends (copy-on-write, ADR-0086/0139): the
bodies of 153/157 stay as history, with a dated forward pointer added at each amended point by the
librarian pass (the checklist is below). It carries **no `supersedes` edge** — it re-decides SPECIFIC
EXPRESSIONS of ADR-0153/0157 (the corner-overlay PLACEMENT of the drive-machinery teach, the separate
Next button as the advance affordance, the as-built wisp drift) while their cores STAND: the BaaS
diamond and the corrected dependency direction, the honest-TDD-loop content and its system-as-referee
obligations, the real-app-UI / progressive-disclosure / no-escape shape, plain newcomer language with
no storm metaphor.

## Context

Increment H's ADR-0157 build LANDED LIVE and was attested "a step forward" on 2026-07-05 (storytree-web
PR #26 → web main `d761eadc`, live at https://crisp-globe-bf6v.here.now) — and at that same gate the
owner directed a substantial follow-on redesign, which ADR-0157's As-built and
[ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md)'s forward pointer both
record as "a future arc link, tracked separately." This ADR is that link's decision. On 2026-07-05 the
owner walked an interactive design proposal built around nine open questions and a beat-by-beat script
(published as a review artifact:
https://claude.ai/code/artifact/cc9367af-45e9-4210-b504-80a33cd18c8e — an EXTERNAL review surface; the
durable record is THIS ADR plus the re-specced caps) and approved it as presented. The proposal's
industry framing and copy rules are grounded in the researched brief
[`docs/research/industry-framing-2026.md`](../research/industry-framing-2026.md) (2026-07-05), which
this ADR binds on the site copy (§9).

**The problem the redesign answers.** As landed at `d761eadc`, Act 2 teaches the system's machinery
through two CORNER OVERLAYS (the top-left honest-TDD loop diagram; the top-right "Proof, not a promise"
/ "Wired to the code" CI/CD row-lists) floating over the island walk, advanced by a separate Next
button. That splits the visitor's attention three ways (map, overlay, button); the row-lists read as
slides rather than one coherent picture of the system; the system explanation arrives DURING the island
walk rather than before it, so the visitor watches work they don't yet have the model for; and the walk
never pays off with the real surface the whole pitch is about — the studio map. The approved design
consolidates: the orchestrator explains the WHOLE system on ONE left-to-right diagram that grows above
the chat BEFORE any island is shown; the chat the visitor already trusts becomes the single advance
surface; the diagram's story node then becomes the real island (the landed walk, kept); and the finale
ZOOMS OUT into the real studio view — the diagram's promise made literal.

This decision is design-time-ratified (the owner approved it in conversation, ADR-0110) — it is NOT a
fork to re-escalate. It fixes the HIERARCHY the approval implies: the two LOOK caps are re-specced —
[`act2-guided-walkthrough`](../../stories/website-experience/act2-guided-walkthrough.md) (increment G)
owns the OPENING (Phase D, the island beats through the single-story walk I1–I3, the chat-advance
mechanism, the mini-map, the orbit), and
[`act2-guided-forest`](../../stories/website-experience/act2-guided-forest.md) (increment H) owns the
DEPTH + FINALE (the two upstream beats, Phase Z) — while the LEAF
([`act2-beat-director`](../../stories/website-experience/act2-beat-director.md)) is **untouched**: the
island beats reuse the director's landed default script verbatim, so there is no engine re-spec and no
parent re-proof in this link (§10).

## Decision

**After Act 1's transform, the visitor STAYS with the session orchestrator while it explains the whole
system on ONE left-to-right diagram that GROWS above the chat-at-bottom — BEFORE any island is shown.
Every advance is a bounded reply chip IN the chat (the separate Next button retires). Then the
diagram's story node becomes the real island (the landed walk kept; the wisp now ORBITS), and the
finale ZOOMS OUT to the real studio view with a slow reveal.** The copy spine: **"everything in this
UI is a signal of what the agents are building."** Three phases — D (the system, on one growing
diagram), I (watch it for real), Z (the real studio) — ~15 taps. Ten points:

### 1. Phase D — the system, on one growing diagram (NEW decided surface, steps D0–D6)

One canvas, **additive only** — nothing is ever replaced or swapped; every step ADDS to the same
picture. The left-to-right spine (it reads as a sentence — accepted default 1; the loop-as-ring below
it is the one visual echo of repetition):

- **the visitor's intent** — their OWN prompt ("build me a shopping website") as a quote chip
  (accepted default 3: the worked example is the visitor's own request; the island phase later pays it
  off with zero re-setup) →
- **the decision record** (what · why · what we chose — "decisions never evaporate into a chat log") →
- **the library**, fanning into definitions · principles · capabilities · contracts ("the shared
  language every agent reads") →
- **the story**, styled as a NAMEPLATE — a deliberate pre-echo of the island the visitor will meet in
  Phase I ("one story, one outcome you can check"; "a story isn't done when an agent says so") →
- **the build loop** — the story BLOOMS into the landed 4-node honest-TDD ring, **reused verbatim**
  (write a test that must pass [one agent] → check it really fails [THE SYSTEM] → write code to pass it
  [another agent] → check it really passes [THE SYSTEM]; centre: "the system checks — not the AI") —
  with every system-as-referee honesty obligation from ADR-0157 §5 intact →
- **the map signal** — the loop's exit arrow lands on a tile-and-tree glyph turning green ("green = a
  signed proof").

**D0 folds the landed outcome-brief into the chat open**: the orchestrator self-introduces honestly
("I don't write the code myself… only call something done when the system proves it") and carries the
brief — no separate brief step. **The thesis lands at D6**: *"Everything you'll see in this UI is a
signal of what the agents are actually building. You don't read the diffs — you read the map, until a
signal says look closer."*

Phase D is the pre-walk GROWN: ADR-0157 §3's pre-walk-reads-as-OUR-orchestrator obligation carries
into D0–D6 in full (the voice is storytree's actual session orchestrator, ADR-0030), and the
first-node-`proposed` honesty (ADR-0157 §3 / ADR-0094) carries into I1, where the diagram's story node
becomes an island that lands PALE, not green.

### 2. The corner drive-machinery overlays RETIRE — absorbed into the growing diagram and a persistent mini-map (re-decides ADR-0153 §Decision 5–6 and ADR-0157 §5's overlay PLACEMENT)

ADR-0153 decided step 2 = a temporary top-left agent-loop overlay and steps 3–4 = expanded
drive-machinery diagrams (a second overlay, top-right); ADR-0157 §5 rebuilt the top-left one as the
honest TDD loop diagram. This ADR re-decides the PLACEMENT, not the content:

- **The beat-2 loop overlay is ABSORBED into Phase D's D5.** The ring blooms INSIDE the one growing
  diagram — the landed 4-node loop diagram itself is KEPT and reused verbatim (the `buildLoopDiagram`
  content: four nodes / four arcs, two SYSTEM-check nodes, centred "the system checks — not the AI"),
  with ADR-0157 §5's honesty obligations (a LOOP, two write-scoped phases at vibe-coder altitude, the
  referee is the SYSTEM — never an AI grading its own homework) binding on it unchanged. Only its HOME
  moves: from transient corner chrome into the one persistent, growing picture.
- **The beat-3/4 CI/CD row-list overlays ("Proof, not a promise" / "Wired to the code") RETIRE
  FULLY** (accepted default 5). Their content moves into D5/D6 CHAT COPY — gates and CI/CD get one
  line each, and the copy keeps **"gate"** and **"signed"** as the load-bearing words. No row-list
  overlay returns anywhere in the experience.
- **The persistent mini-map replaces the corner-overlay pattern** (accepted default 2). At the island
  handoff the diagram COMPACTS to a docked mini-map top-left — a 6-dot row: intent · decision ·
  library · story · loop · signal — that PERSISTS through the whole island walk and the studio finale,
  lighting the stage the visitor is watching (story lit when the island plants; loop lit while the
  wisp orbits; signal lit when the cart greens). It IS the "one diagram" promise carried through.

**What carries forward from the amended decisions.** ADR-0153's RATIONALE stands: "background
machinery is not map signal; transient process detail floats above the map" — the mini-map is exactly
that discipline, minus the clutter (one small persistent stage-light instead of two transient
diagram dumps). And the overlays' site-side-keyed authoring call (ADR-0153 §"Drive-machinery
engine-support authoring call" / ADR-0157 §5 "Where it lives") carries forward unchanged: the growing
diagram, the mini-map, and all their copy are SITE-SIDE content keyed off the walk's steps — NOT a
director field, NOT a new delta kind, no engine structure (there is still no isolatable red→green
oracle for "is the right diagram shown"; that IS the operator-attested LOOK).

### 3. Advance moves INTO the orchestrator chat (re-decides the separate-Next-button affordance preserved by ADR-0153/0157's "visitor-paced / Next-only pacing")

**The separate Next button retires.** Each step, the orchestrator streams one or two short lines and
then offers **ONE bounded reply chip in the chat's input row** — exactly where the landed build
already puts "plant the first story →". Occasionally one quiet **"why does that matter?" aside** is
offered alongside, which streams one extra line WITHOUT advancing. The chips are voiced as the
questions a SKEPTICAL developer would ask ("who reads them?", "and then I just… trust that?") —
tapping through IS the persuasion arc (§7).

**The visitor-paced principle is PRESERVED, not re-decided**: one tap per step, nothing auto-plays
past the visitor, effort never exceeds one tap. Only the affordance's HOME changes — from a floating
Next button to the chat surface the real product actually uses. Map callouts STAY as anchored
pointers but lose their button. **Back stays** (accepted default 9): pure replay, byte-identical
scenes — the machinery exists; forward-only would feel like a slideshow.

### 4. Phase I — watch it for real: the landed island walk KEPT, three changes, two upstream beats

The island walk is the director's landed default script **REUSED UNTOUCHED** — no engine change, no
new beats, the same `advance()` choreography. Three site-side changes wrap it:

- **(a) The mini-map compaction at the island handoff** (I1): the growing diagram compacts to the
  docked top-left mini-map (§2) and the island fades in — proposed tree + nameplate ("It lands as a
  proposal: pale, not green. Green is earned here"); the mini-map lights `story`.
- **(b) Advance moves into the chat** (§3); callouts stay as pointers without buttons.
- **(c) The wisp ORBITS** (§5), narrated as the diagram made live: "That light circling the island is
  a live session — the loop from our diagram, running right now"; the mini-map lights `loop`, then
  `signal` when the cart greens with its proof seal.

**The upstream reveal keeps TWO beats in the build** (accepted default 6): the backend first, then
the database/BaaS-diamond with its own breath — ADR-0157's "reads directly from the database" teach
deserves its own beat ("which your site reads directly, the way a real shop loads its catalog fast…
Nothing hidden, nothing invoiced later as a surprise"). The proposal's mock merged them into one step
for review speed ONLY; the build keeps two. The BaaS diamond, the corrected dependent → prerequisite
direction, and the needs-edges drawn as taught (ADR-0157 §1) all stand verbatim.

### 5. The wisp ORBITS (re-decides ADR-0157 §6's as-built motion)

ADR-0157 §6 required "the wisp moves" and deliberately under-specified the motion; the landed build
did `act2-wisp-drift` (a soft closed-loop drift). This ADR sharpens it to a true **ORBIT around the
island**: a rotating group whose transform-origin is the island centre, nested in a flattened plane
(scaleY ≈ 0.55) so the circle reads as an ELLIPSE lying on the 2.5D map; one lap ≈ 9 s; the glow
pulse kept; `prefers-reduced-motion`: stationary with pulse only. **Pure CSS**, replacing the landed
`act2-wisp-drift` — the same site-owns-motion boundary (ADR-0145; the wisp presence marker stays
scene semantics the director already emits). ADR-0157 §6's requirement ("the wisp moves") STANDS —
it now has the approved specific motion; exact easing/feel remains owner-tunable at the gate.

### 6. Phase Z — the real studio (NEW decided surface, steps Z1–Z4 + done)

After the island walk's finale, the view **crossfades INTO the studio frame** (top bar: storytree ·
map/library/decisions tabs · "2 sessions live") with a SLOW reveal, one chip per stage:

- **Z1** — the frame appears DIMMED with the visitor's island centred: "This is the actual studio —
  the tool storytree is built with, building itself."
- **Z2** — the LEGEND brightens: green: proven — a signed test passed · pale: being built · withered:
  broken · wisp: a live agent session.
- **Z3** — the FOREST lights up: many islands, wisps orbiting where agents are live, roads between —
  "You can only hold so much of a system in your head. The map holds the rest."
- **Z4** — the DETAILS PANEL slides in: a story's promises with ✓ proof-signed marks, the decisions
  behind it as ADR chips, its needs — "Ask why anything is the way it is, and the answer is already
  there."
- **done** — "That was staged, on made-up data — but this is exactly how the real thing grows" + the
  landed CTA affordances.

**Substrate (accepted default 4):** the site's REAL map renderer (`worldSvg`/`TreeWorld` — already on
the site via the sync rail) over a hand-authored multi-island scene, plus studio chrome RE-CREATED
from studio tokens (the landed chat-dock precedent, extending ADR-0153's real-UI re-creation call) —
**NOT screenshots** (they would drift, and cannot be dimmed/progressively revealed; a full studio
embed is not possible across the repo boundary). All data stays fictional (the diorama boundary,
ADR-0056/0066/0093, holds by construction).

### 7. The approved beat-by-beat script (16 steps, 15 taps) — the baseline STRUCTURE

The owner approved this table as presented. What is decided here is the STRUCTURE — step → stage /
diagram delta → the bounded reply chip — as the approved baseline; the EXACT COPY stays site-side and
owner-tunable at the gate (the same words-stay-site-side discipline as the narration). The chips are
the skeptical developer's questions; the arc answers each by SHOWING.

| Step | Stage delta | Reply chip |
|---|---|---|
| D0 | Empty ground; chat opens (landed seam); orchestrator self-introduces ("I don't write the code myself… only call something done when the system proves it"); folds the outcome brief in | "ok — show me" |
| D1 | The intent chip appears — the visitor's own words | "what do you do with it?" |
| D2 | Arrow → the decision record node ("decisions never evaporate into a chat log") | "who reads them?" |
| D3 | The decision fans into the library (definitions · principles · capabilities · contracts; "how a hundred sessions stay one coherent system") | "so where's the actual work?" |
| D4 | Arrow → the story node ("one story, one outcome you can check"; "a story isn't done when an agent says so") | "how do you prove it?" |
| D5 | The story blooms into the honest-TDD ring ("Two agents and a referee… the checking is never the AI's word — the system runs the test and signs the result") | "and then I just… trust that?" |
| D6 | The loop's exit lands on the map-signal glyph ("No — you trust the signal… Nothing else can make it green" + the thesis line) | "show me for real →" |
| I1 | Diagram compacts to the docked mini-map; island fades in: proposed tree + nameplate ("It lands as a proposal: pale, not green. Green is earned here"); mini: story lit | "start the work" |
| I2 | The wisp appears and ORBITS ("That light circling the island is a live session — the loop from our diagram, running right now"); mini: loop lit | "keep going" |
| I3 | Capability plants branch; the cart greens with a proof seal ("a test ran, the system signed it… 'done' and 'not yet' are never dressed the same"); mini: signal lit | "what about the parts a mock can't do?" |
| I4 | The foundation grows beneath: backend + database, needs-edges drawn (the BaaS diamond; "which your site reads directly, the way a real shop loads its catalog fast… Nothing hidden, nothing invoiced later as a surprise") — TWO beats in the real build | "show me the whole picture" |
| Z1 | Crossfade: the studio frame appears around the map, chrome dimmed, your island centred | "what am I looking at?" |
| Z2 | The legend brightens | "and all these islands?" |
| Z3 | The forest lights up: many islands, orbiting wisps, roads | "can I look inside one?" |
| Z4 | The details panel slides in: promises, proofs, decisions | "got it — what now?" |
| done | CTA state (the landed done affordances) | — |

### 8. The nine accepted defaults (no overrides were given — recorded as decided)

1. **Diagram geometry** = a left-to-right SPINE, the loop blooming below ("reads as a sentence"; the
   loop-as-ring is the one visual echo of repetition).
2. **The compacted mini-diagram PERSISTS** docked top-left through the whole island + studio walk,
   lighting the current stage — it IS the "one diagram" promise carried through, and it REPLACES the
   retired corner overlays.
3. **The worked example = the visitor's OWN request** ("build me a shopping website"); D0 folds the
   landed outcome-brief in; the island phase pays it off with zero re-setup.
4. **Zoom-out substrate** = the real map renderer + re-created studio chrome from studio tokens (the
   chat-dock precedent); NOT screenshots (drift; can't dim/reveal cleanly; a full studio embed isn't
   possible across the repo boundary).
5. **The beat-3/4 CI/CD row-list overlays RETIRE FULLY** — gates/CI/CD get one line each in D5/D6
   chat copy; the copy keeps "gate" and "signed" as the load-bearing words.
6. **The island phase keeps TWO upstream beats** in the build (backend, then database — the BaaS
   "reads directly" teach deserves its own breath); the mock merged them for review speed only.
7. **Ship at ~15 taps** WITH the quiet persistent leave affordance; if it tests long, D0+D1 and Z1+Z2
   are the natural merges (13). The chips make taps feel like conversation, not slides.
8. **Industry terms are EMBODIED in the walk in plain words**; they are NAMED and cited once on the
   how-it-works page only (per the research brief's honesty flags).
9. **KEEP the Back affordance** (pure replay, byte-identical scenes — the machinery exists;
   forward-only feels like a slideshow).

### 9. Copy honesty rules (from `docs/research/industry-framing-2026.md` — binding on the LOOK caps' copy)

The research brief's honesty flags BIND on every visitor-facing line this redesign ships:

- Never "the Karpathy loop" — it is not his term; say "the generation–verification loop Karpathy
  described," attributed as a description.
- Never "we eliminate verification." The grounded claim is RELOCATION: machine-checkable proof moves
  to the system (spine-observed, signed); the human's share — taste, UAT, decisions — becomes legible
  on a map.
- Sonar is "don't FULLY trust" (96% do not fully trust; only 48% always verify) — never drop "fully."
- No unsourced viral stats (the "90% of engineers orchestrate" / "1,445% surge" class is banned).
- Green = proven against DECLARED obligations only — not semantic rightness, not security (both
  owner-acknowledged gaps); the site must never imply "proven" includes "secure."
- Talk quotes are re-verified against the YC video before any display pull-quote (the available
  transcripts are third-party).

### 10. Build scope — web-repo-only; the director engine untouched (why this lands cheap)

The whole redesign is **storytree-web repo work**: Phase D is pre-beat chrome (the same class as the
landed orchestrator exchange), Phase Z is post-beat chrome, the island beats reuse the landed director
default script UNTOUCHED, the orbit is CSS, and chat-advance is site wiring around the same
`advance()` calls the Next button made. **NO director change, NO `sync:web-engine`, NO parent
re-proof.** Untouched: Act 1, the finale terminal, the transform, the three `data-experience-*` gate
markers physically in `index.astro`, the a11y/no-JS fallback, the Escape/leave affordances. Live
baseline: web main `d761eadc`. Increment split: G owns Phase D + I1–I3 + the chat-advance mechanism +
the mini-map + the orbit; H owns the two upstream beats (I4) + Phase Z.

**Unchanged / preserved (explicit).** ADR-0157's BaaS diamond and the corrected dependent →
prerequisite dependency direction (ADR-0153/0157/ADR-0058); the honest-TDD loop's CONTENT and its
system-as-referee honesty obligations, and the `abd-green-only-on-signed-proof` data contract (the
diorama still cannot show a green the system did not referee); plain language / no storm metaphor
(ADR-0157 §2/§4); the 2.5D substrate (ADR-0145) and the site-owns-motion boundary; the real-app-UI +
progressive-disclosure + no-escape-hatch shape (ADR-0153) — Phase D/Z chrome EXTENDS the real-UI
re-creation precedent rather than re-deciding it; Act 1 + the finale terminal + the transform, exactly
as built; the three `data-experience-*` gate markers and the a11y fallback (`check:web-experience`
stays green); the `act2-beat-director` engine and its default script (untouched — no engine change);
visitor-paced pacing (one tap per step — only the affordance's home moves, §3); the fictional
site-owned data and the boundary (ADR-0056/0066/0093); the ADR-0070 two-stage proof for the LOOK caps
(appearance and feel never self-signed).

## Consequences

**Good.**

- The visitor gets the MODEL before the demo: one picture that assembles left-to-right as a sentence —
  intent → decision → library → story → loop → signal — so by the time the island grows, every element
  on the map already means something. The thesis ("everything in this UI is a signal of what the
  agents are building") is shown assembling, not asserted.
- One advance surface, and it is the real product's: the chat. The skeptic-question chips turn pacing
  into a persuasion arc — the visitor asks the hard questions and the walk answers each by showing —
  and ~15 taps read as a conversation, not a slideshow.
- The corner-overlay clutter goes away without losing its teach: the loop diagram (the strongest
  landed asset) is promoted INTO the main picture; the CI/CD row-lists compress to the two words that
  matter ("gate", "signed"); the mini-map keeps the whole system legible in one glance for the rest of
  the experience.
- The finale finally pays off the pitch: the zoom-out lands the visitor in the actual studio view —
  legend, forest, details panel — on the real map renderer, so "you read the map" is experienced, not
  promised. The honest closing line keeps the diorama boundary explicit.
- It lands cheap and safe: web-repo-only, the proven director untouched, no parent re-proof, the
  landed island choreography reused verbatim (§10).
- The proof model is unchanged: both LOOK caps stay ADR-0070 operator-attested; the machine-checkable
  teaching claim stays the parent-side data contract.

**Costs / risks (named).**

- **The growing diagram is the largest new site-side surface Act 2 has taken on** (six additive stages
  + a compaction animation + a persistent mini-map with stage lighting). It is chrome with no
  isolatable red→green oracle — operator-attested (ADR-0070), a HALT point; mitigations are the
  additive-only rule (nothing swaps, so each stage is a small delta) and the reuse of the landed loop
  diagram verbatim.
- **~15 taps is longer than the landed walk.** The owner accepted the length WITH the quiet persistent
  leave affordance; the named fallback (default 7) is merging D0+D1 and Z1+Z2 (13 taps) if it tests
  long at the gate — a copy/pacing tune, not a re-decision.
- **The mini-map must not become the new clutter.** It is one small docked row with a single lit
  stage; if a build grows it toward a second diagram, that violates default 2's intent (the
  corner-overlay pattern is retired, not relocated).
- **Phase Z re-creates studio chrome from tokens** — a maintenance surface that can drift from the
  real studio's look. Accepted deliberately over screenshots (which drift worse and cannot be
  progressively revealed); the re-creation follows the landed chat-dock precedent, and the owner
  attests "reads as the actual studio" at the gate.
- **The retired Next button was part of the attested G/H walks.** Retiring an attested affordance is
  an owner re-decision recorded here (like the storm metaphor in ADR-0157 §2), not a correction of an
  error; the prior attested records stand as true history (copy-on-write). Both LOOK caps revert
  toward `building` for the reshaped surface (`defects-amend-the-owning-story`); the live site stays
  on `d761eadc` until the re-build lands through its own gate.
- **The chat-advance wiring must keep the walk resumable and replayable** (Back = byte-identical
  replay, default 9); if chip-in-chat state and scene state ever disagree, the walk breaks in a way
  the old dumb button could not — the build keeps advance a thin wrapper around the same `advance()`
  calls (§10).

## Librarian correction-in-place checklist (copy-on-write; the librarian pass does these, NOT this ADR)

This ADR amends the DECIDED content of the ADRs below but does not edit their bodies. The librarian
pass corrects their stale prose in place and adds a dated forward pointer at each amended point:

- **ADR-0153** — the overlay decisions and their engine-support note:
  - **§Decision points 5–6** (step 2's temporary top-left agent-loop overlay; steps 3–4's expanded
    drive-machinery diagrams / second overlay top-right): add a dated forward pointer to ADR-0165 §2 —
    the corner overlays RETIRE (the loop teach is absorbed into the growing diagram's D5; the CI/CD
    row-lists retire fully into D5/D6 chat copy; the persistent mini-map replaces the corner-overlay
    pattern). Note the rationale ("background machinery is not map signal; transient chrome above the
    map") CARRIES FORWARD into the mini-map.
  - **§"As built / landed" → "Drive-machinery engine-support authoring call"**: add a dated note that
    the site-side-keyed authoring call carries forward to ADR-0165's growing diagram + mini-map (still
    no director field), while the overlays it specified retire per ADR-0165 §2.
- **ADR-0157** — the loop diagram's home, the wisp's motion, and their As-built cites:
  - **§5, the "Where it lives" paragraph**: add a dated forward pointer to ADR-0165 §2 — the loop
    diagram RELOCATES into Phase D's D5 (inside the one growing diagram) with the mini-map carrying
    the stage through the walk; the diagram's CONTENT and honesty obligations stand unchanged, and the
    site-side-keyed call stands.
  - **§6 (the wisp MOVES)**: add a dated forward pointer to ADR-0165 §5 — the approved motion is now a
    true ORBIT (island-centred rotating group in a flattened plane, ≈9 s lap, reduced-motion
    stationary+pulse), replacing the as-built `act2-wisp-drift`; §6's "the requirement is that it
    moves" stands.
  - **§"As built (2026-07-05)"** — the site cites for the loop overlay (`act2-overlays.ts`
    `buildLoopDiagram`) and the wisp (`index.astro` `animation: act2-wisp-drift`): add a dated note
    that ADR-0165 relocates the loop diagram into the growing diagram and replaces the drift with the
    orbit; the cites stay true history of `d761eadc`.

## References

- [ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md) — AMENDED:
  §Decision 5–6's corner drive-machinery overlays (top-left agent loop; top-right expanded diagrams)
  retire per §2 — the teach is absorbed into the growing diagram + persistent mini-map; the overlay
  rationale and the site-side-keyed authoring call carry forward; the real-app-UI /
  progressive-disclosure / no-escape shape and the corrected dependency direction STAND. No
  `supersedes` edge — this refines. (Librarian: forward-point §Decision 5–6 and the "Drive-machinery
  engine-support authoring call" As-built note.)
- [ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md) — AMENDED: §5's
  overlay PLACEMENT ("Where it lives") relocates into Phase D's D5 + the mini-map (the loop diagram's
  content and system-as-referee obligations stand verbatim); §6's as-built motion sharpens to the
  ORBIT (§5 here); §3's our-orchestrator pre-walk GROWS into Phase D (D0–D6) with the
  first-node-`proposed` honesty carried into I1. The BaaS diamond, plain language, and the retired
  storm metaphor all STAND. No `supersedes` edge — this refines. (Librarian: forward-point §5 "Where
  it lives", §6, and the As-built overlay/wisp cites.)
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment IS
  ratification (this ADR born accepted; the owner approved the proposal as presented, 2026-07-05).
- [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) /
  [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — copy-on-write: a
  re-decision is a new ADR (this one), not an in-place body edit of 153/157; the librarian corrects
  those bodies' stale prose in place (checklist above).
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage
  proof for visual surfaces; the reshaped LOOK stays operator-attested, never self-signed; the
  approval of the DESIGN is not an attestation of the BUILD (each re-build is attested at its own
  gate).
- [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md) — the 2.5D
  substrate and the site-owns-motion boundary the orbit and the compaction animation ride; unchanged.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the red-green phase machine the D5
  ring depicts; the ground truth (spine observes, never the model) is unchanged and still binds the
  diagram's honesty.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the orchestrator as the human-facing planning
  agent; Phase D's voice is OUR orchestrator (carried from ADR-0157 §3).
- [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) — a newly-authored
  story node is born `proposed`; I1's "pale, not green — green is earned here" honesty.
- [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) — the settled
  dependency direction the I4 needs-edges keep teaching (via ADR-0153/0157; unchanged here).
- [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) /
  [ADR-0148](0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md) /
  [ADR-0150](0150-act-2-is-one-continuous-walk-that-grows-upstream-the-depende.md) — the standing arc
  this refines (two acts; website-first; one continuous walk) — cited for context, not amended by
  this ADR.
- [`docs/research/industry-framing-2026.md`](../research/industry-framing-2026.md) — the researched
  industry-framing brief (2026-07-05) grounding §9's copy honesty rules and default 8's
  named-once-on-how-it-works placement.
- The approved interactive design proposal —
  https://claude.ai/code/artifact/cc9367af-45e9-4210-b504-80a33cd18c8e (an external review surface the
  owner walked and approved as presented; the DURABLE record is this ADR + the re-specced caps, not
  the artifact).
- [`stories/website-experience/story.md`](../../stories/website-experience/story.md) — the story this
  arc lives in (decisions list + increment framing updated for this decision).
- [`stories/website-experience/act2-guided-walkthrough.md`](../../stories/website-experience/act2-guided-walkthrough.md)
  — the LOOK cap (increment G) re-specced: Phase D (D0–D6, the growing diagram, skeptic-chip
  chat-advance), the island beats I1–I3 (mini-map compaction + stage lighting, the orbit,
  callouts-as-pointers), Back kept. Its "As built" live-attested history kept intact (copy-on-write).
- [`stories/website-experience/act2-guided-forest.md`](../../stories/website-experience/act2-guided-forest.md)
  — the LOOK cap (increment H) re-specced: the TWO upstream beats (I4 split: backend, then
  database/diamond) and Phase Z (the studio zoom-out: crossfade, legend → forest → details panel,
  honest done state; the real-renderer + re-created-chrome substrate). Its "As built / attested"
  records kept intact (copy-on-write).
- [`stories/website-experience/act2-beat-director.md`](../../stories/website-experience/act2-beat-director.md)
  — NOT re-specced: the island beats reuse the landed default script verbatim; no engine change, no
  `sync:web-engine`, no parent re-proof (§10).
