---
status: accepted
decided: 2026-07-05
amends: [134, 150, 153]
---
# ADR-0157: Act 2 reads the database directly (BaaS), retires the storm metaphor, teaches the agent loop as an honest TDD-loop diagram, and moves the wisp

## Status

accepted (2026-07-05) — decided/directed by the owner at the `act2-guided-forest` (increment H)
BUILD #2 attestation gate on 2026-07-05, where H's re-build against
[ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md) was attested **as a
step forward** and directed to LAND LIVE (storytree-web PR #25 → web main `8f4e166c`, live at
https://crisp-globe-bf6v.here.now/), AND the owner gave forward feedback for the NEXT increment.
Design-time alignment IS the ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)); the owner directed these six
redirections at the gate, so they are born accepted — no second end-of-flow ask.

This is a NEW ADR, not an in-place edit of the ADRs it amends (copy-on-write, ADR-0086/0139): the
bodies of 134/150/153 stay as history, with a dated forward pointer added at each amended point by the
librarian pass (the checklist is in References). It carries **no `supersedes` edge** — it REFINES the
Act 2 experience, it does not un-decide any prior decision. The two-act experience (ADR-0134), the one
continuous upstream walk (ADR-0150), the real-app-UI / progressive-disclosure / no-escape shape and the
CORRECTED dependency direction (ADR-0153) all STAND. This ADR (a) confirms the BaaS architecture
authoring call ADR-0153 explicitly left open, (b) retires the "storm" metaphor as a naming/framing
choice, (c) sharpens the pre-walk, the language, the agent-loop diagram, and the wisp — all within the
standing experience.

## Context

Increment H's second build was attested "as a step forward" and landed live on 2026-07-05
(`8f4e166c`). The re-spec protocol for this arc treats a substrate re-spec as its own link (the
story-author authors the WHAT — a born-accepted ADR + cap re-specs — then a librarian correction-in-place
pass, then its own docs PR, then a build chip). At the gate the owner gave six redirections for the next
link. Recorded verbatim (ADR-0044 §4 — a look/feel verdict only the owner can sign, agent-relayed):

> Land this as its a step forward, then continue the self perpetuating chips based on this feedback
> * Before the walk doesnt feel like its talking to our system, the story node would land as proposed right? Also i dislike the storm analogy please remove it from all surfaces.
> * Some of the descriptions have weird analogy useage and jargon, the audience are devs who are not familiar with the system, please keep language simple and understandable to a new comer.
> * The explination of the agent loop looks like a list? it should be a diagram, it also doesnt talk to the TDD orchestration flow, our audience is for vibe coders so they should understand agent and orchestration basics, if you keep the language basic, "one agent writes tests" "the other builds code to pass the tests" then it should still be fine, the main thing is the diagram should show a loop
> * can you make the wisp actually move, atm it just shows up as a dot
> * the frontend doesnt link directly to the database, this is not representative in a real shopping app the frontend would read directly from the database.

Two of the six touch DECIDED content in prior ADRs and so need this new ADR (copy-on-write): the
architecture (ADR-0153's "3-tier chosen" authoring call) and the storm metaphor (ADR-0134's framing,
which is literally titled "…terminal storm to a calm guided forest"). The other four sharpen the
already-standing experience and are captured here so the follow-on build chip has one settled brief.

**The architecture: the owner confirmed BaaS (the frontend reads the database directly).** ADR-0153
made an explicit authoring call — "3-tier, not BaaS" — but flagged the choice as the owner's to confirm
at the gate: it stated a BaaS shape (`website → backend` AND a direct `website → database`) is "ALSO
corpus-legal and the layers-teach would still work," and that "the 3-tier-vs-BaaS SHAPE is the owner's
to confirm at the gate" (ADR-0153 §"Two authoring calls", the "Architecture: 3-tier, not BaaS" bullet).
The owner has now confirmed BaaS: *"the frontend would read directly from the database … in a real
shopping app the frontend would read directly from the database."* This does NOT re-break the dependency
DIRECTION ADR-0153 corrected — it ADDS a direct edge in the SAME (dependent → prerequisite) direction.

**The storm metaphor.** "Storm" is the design NAME for Act 1's terminal-chaos experience (ADR-0134 is
titled "…terminal storm to a calm guided forest"; §1 frames Act 1 as "the storm"). It was previously
loved and attested by the owner. This is an owner RE-DECISION: retire the metaphor/word from every
surface. Act 1's built EXPERIENCE (terminal chaos → finale concession → transform to soil) STAYS as
built and live — only the "storm" NAMING/analogy retires.

**The remaining four.** (a) The pre-walk should read as talking to OUR system's actual orchestrator, not
a generic coding agent; and a newly-authored story node should honestly land `proposed` (the owner asked
"the story node would land as proposed right?" — the answer is yes). (b) Site copy should be plain and
jargon-free for newcomer devs / vibe coders (aligning to the `plain-language-first` library principle).
(c) The agent-loop explanation should be a LOOP DIAGRAM (not a list), at vibe-coder altitude, that also
speaks to the honest TDD orchestration flow. (d) The wisp should actually MOVE, not render as a static
dot.

This decision is design-time-ratified (the owner directed it at the gate, ADR-0110) — it is NOT a fork
to re-escalate. It fixes the HIERARCHY the redirections imply: the LEAF (`act2-beat-director`) re-specced
to let the `add-upstream-story` delta express a prerequisite depended on by MORE THAN ONE story (so the
database can be depended on by both the website and the backend); the two LOOK caps
(`act2-guided-walkthrough` increment G, `act2-guided-forest` increment H) re-specced to the BaaS render,
the storm-metaphor-free plain-language copy, the honest TDD loop diagram, the moving wisp, and the
system-native pre-walk; and Act 1's cap re-specced to retire the storm analogy from its visitor-facing
copy — each honest at its tier.

## Decision

**Act 2 shows a real shopping app's honest architecture — the frontend reads the catalog directly from
the database (BaaS), while writes and checkout still go through the backend — and teaches it plainly:
no "storm" metaphor anywhere, the agent loop drawn as an honest TDD loop diagram (the system is the
referee, not the AI grading its own homework), a wisp that moves, a pre-walk that is our actual
orchestrator, and a first story node that honestly lands `proposed`.** Six points:

### 1. Architecture: BaaS — the frontend reads the database directly (confirms ADR-0153's open authoring call)

The revealed stack gains a DIRECT `website → database` edge, on top of the (already-corrected) backend
chain: **`website.dependsOn = [backend, database]`, `backend.dependsOn = [database]`,
`database.dependsOn = []`.**

This is derived from the authoritative rule, not asserted. Run the `cross-story-dependency` /
[ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) §1 both-ways test on
the new candidate edge {website, database}:

- **Does the website need the database's delivered outcome to pass the website's own UAT?** In a real
  shopping app built on a BaaS (Supabase/Firebase-style), the frontend reads the product catalog
  DIRECTLY from the database — no server hop for reads. So YES: the website needs the database's
  delivered outcome (a readable catalog). → the edge exists, pointing FROM the dependent (website) TO its
  prerequisite (database): `website.dependsOn` includes `database`.
- **Does the database need the website's delivered outcome to pass the database's own UAT?** NO — a
  database is provable and deliverable headless. → no reverse edge.

So the edge is `website → database` (dependent → prerequisite). It does NOT introduce a cycle: the
resulting graph `website → {backend, database}`, `backend → database`, `database → ∅` is acyclic (a
diamond with `database` as the shared sink). This is exactly the BaaS shape ADR-0153 named as "ALSO
corpus-legal" — now confirmed.

**The backend edge STAYS.** The retained shopping fiction is Cart / Payments / Receipts. Reads (browse
the catalog) go direct to the database; WRITES and checkout/payments still need server logic. Run the
test on {website, backend}: does the website need the backend's delivered outcome to pass its UAT? YES —
a working checkout/payment cannot be a direct client-to-database write in the honest shape; it needs the
backend. So `website.dependsOn` keeps `backend`. This is why the shape is `website → [backend,
database]` and NOT a pure `website → database` walk: a real BaaS shopping app reads directly from the DB
AND calls server functions for privileged writes. Teaching both edges is the honest, representative
picture the owner asked for.

**The corrected DIRECTION (ADR-0153) is preserved, not re-broken.** ADR-0153 fixed the edges to point
FROM the dependent TO its prerequisite. This ADR ADDS an edge in that same direction; it does not revert
toward the backwards encoding. The database remains a prerequisite (a sink with `dependsOn: []`); it is
now depended on by TWO stories (website and backend) rather than one.

**The engine implication (the WHAT for the LEAF; the HOW is the next build link).** The
`act2-beat-director` `add-upstream-story` delta as built carries a single `dependentId` — the id of the
ONE existing story whose `dependsOn` gains the new upstream story's id
(`web/src/scripts/act2-script.ts` uses `dependentId: STORY_WEBSITE` for the backend and
`dependentId: STORY_BACKEND` for the database; the parent engine's `applyDelta` sets
`dependent.dependsOn = [...dependsOn, delta.id]`). For BaaS the DATABASE must be a prerequisite of BOTH
the website and the backend, so the delta must support the database being depended on by more than one
story. The corpus-legal SHAPE the cap specifies: the `add-upstream-story` delta accepts its dependent as
`string | string[]` (or an equivalent direct-edge mechanism) so a single upstream story can be attached
as a prerequisite of several existing stories in one delta (raise `database` once with
`dependentId: [STORY_WEBSITE, STORY_BACKEND]`), keeping the edge direction dependent → prerequisite for
each. The `abd-green-only-on-signed-proof` data contract is PRESERVED verbatim (untouched by this
change). The actual engine code change (widening `dependentId`, its zod contract, and the
`applyDelta` fan-out) is the NEXT (build) link's red→green under the existing contract
(`defects-amend-the-owning-story`) — NOT decided-as-implemented here; this ADR fixes the SHAPE.

**Spatial layout stays a free render choice.** ADR-0153's frontend-high / foundation-below preference
carries forward: the website renders high, the database at the base, the backend between — and the new
direct `website → database` edge is drawn alongside the `website → backend → database` chain (a diamond,
not a single spine). There is no corpus convention for screen position; the DATA direction is the
convention. Builder/owner-tunable at the gate.

### 2. Retire the "storm" metaphor from ALL surfaces (re-decides ADR-0134's framing)

The "storm" analogy/word retires from every surface: the corpus framing (this ADR records the decision;
the librarian corrects ADR-0134's title/§1/§2 in place — see References), the caps' descriptive prose,
and any VISITOR-FACING site copy. Act 1's built EXPERIENCE stays exactly as built and live — the
terminal chaos, the swarm of agents multiplying, the finale terminal's concession, the transform to
soil. What changes is only the NAMING/analogy: nowhere does a surface call it "the storm."

Act 1 is described WITHOUT the storm metaphor, in plain language: the overwhelming swarm of coding
agents; the chaotic pile of terminals; agents spawning agents until you cannot read any of them. The
plain description of the FELT experience (too many agents, too much noise, nothing you can verify) IS the
teach — the metaphor was never load-bearing for it.

**The cap IDs are internal handles, not surfaces — they stay stable.** The cap `act1-terminal-storm`
carries "storm" in its ID. Renaming it would cascade: it is referenced in `story.md`'s
`capabilities:`/`depends_on:` and the within-story edge prose, and `act2-beat-director` is a `--real`
cap pinned by an exact node-id regex in the CLI's node-build snapshot test (renaming real cap ids is a
known merge-conflict trap — MEMORY: node-build REAL-buildable snapshot trap). A cap ID is an internal
identifier the visitor never sees; the owner's "remove it from all SURFACES" targets visitor-facing copy
and human-readable descriptions, not the machine handle. So the cap IDs (`act1-terminal-storm` and the
rest) stay; the storm ANALOGY is retired from the visitor-facing COPY and the descriptive prose WITHIN
the caps and the story. (Renaming the cap file ids is a separate, larger refactor no redirection here
requires; if the owner later wants the id renamed, that is its own chip.)

### 3. The pre-walk reads as OUR system, and the first story node honestly lands `proposed`

Two sub-points:

- **The pre-walk is our actual orchestrator, not a generic coding agent.** Before the guided walk (the
  finale concession and the orchestrator intro that opens Act 2), the surface must read as storytree's
  ACTUAL session orchestrator (ADR-0030's human-facing planning agent — the one that turns intent into
  routed work), not a generic AI coding assistant. This sharpens ADR-0153's real-app-UI /
  orchestrator-chat redirections (the chat is already the real app's dock at the bottom); the sharpening
  is that its VOICE and framing name storytree's own loop, so a first-time visitor understands they are
  watching storytree work, not a generic agent.

- **The first story node honestly lands `proposed`** (a factual confirmation the owner asked for). A
  newly-authored story node is born `proposed` (the story lifecycle: `proposed` → `building` →
  `healthy`/proven, earned only on signed proof through the gate — ADR-0020; ADR-0094 "proposed builds").
  The walk must DEPICT the first (mock website) story node entering as `proposed` — NOT instantly green or
  silently `building` without proof. This is a HONESTY point that reinforces the verification-gap thesis:
  intent is proposed, then proven; nothing is green until a signed proof lands. The caps teach this
  honestly (a planted story starts `proposed`/proposed-styled, and greening still requires the
  signed-proof marker the `abd-green-only-on-signed-proof` contract enforces).

### 4. Plain language — strip weird analogies and jargon (aligns to `plain-language-first`)

The audience is newcomer devs / vibe coders unfamiliar with storytree. All site copy — the narration,
the story briefs, the overlays, the orchestrator's lines — uses plain, jargon-free language, aligning to
the `plain-language-first` library principle. No insider vocabulary without immediately showing what it
means; no strained analogies. This is a STANDING obligation on the LOOK caps (it governs every beat's
copy), not a one-off edit. The owner's own example of the right altitude: for the agent loop, "one agent
writes tests" / "the other builds code to pass the tests" is understandable to a newcomer and still
honest — that register is the target throughout.

### 5. The agent-loop explanation is an HONEST TDD LOOP DIAGRAM (not a list)

The current drive-machinery overlay (the top-left "agent loop", `web/src/scripts/act2-overlays.ts`
`DRIVE_OVERLAYS`) reveals rows list-style. The owner wants a DIAGRAM that shows a LOOP, at vibe-coder
altitude. It MUST be framed HONESTLY against the real system — it must not misrepresent how storytree
proves work.

**The ground truth (the real prove-it flow, cited).** storytree's proof machinery is the ADR-0020
red-green phase machine: `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`
(`packages/orchestrator/src/phase-machine.ts:20-25`). Its honesty property is that "red/green is
OBSERVED by the spine (never claimed by the model)" (`phase-machine.ts:7-8`). Write scope is enforced
per phase: in `AUTHOR_TEST` writes are allowed ONLY to test paths (`phase-machine.ts:172-174`); in
`IMPLEMENT` writes are allowed ONLY to source paths and NEVER a test path — "the test author is not the
code author" (`phase-machine.ts:176-178`); `CONFIRM_RED` / `CONFIRM_GREEN` / `GATE` are observe-only, no
writes (`phase-machine.ts:180-181`). So the honest core is:

> **write a failing test → a REFEREE (the system, not the AI) checks it really fails (RED) → write code
> → the referee checks it really passes (GREEN) → loop.**

It is ONE leaf author driven through write-scoped phases, refereed by the deterministic spine.

**What the diagram must show (the WHAT; the exact visuals are the builder's + owner's at the gate):**

- **A LOOP** (not a linear list): write test → check it fails → write code → check it passes → next
  slice (back to write test). The looping shape is the point (the owner: "the main thing is the diagram
  should show a loop").
- **Two write-scoped phases at vibe-coder altitude**, mapping cleanly onto the owner's own words: "one
  agent writes the tests" (the `AUTHOR_TEST` phase — write a failing test first) and "the other builds
  code to pass the tests" (the `IMPLEMENT` phase — write code to make it pass). It is acceptable to
  personify these as two roles for approachability, PROVIDED the referee point below is not muddied.
- **The referee/gate is the SYSTEM, not the AI** — this is the crucial honest element and MUST be in the
  diagram. The thing that OBSERVES red then green (the `CONFIRM_RED` / `CONFIRM_GREEN` gates) is
  storytree's deterministic spine, not an AI. This is storytree's whole thesis: the verification gap is
  the problem (agents "grade their own homework"), and the answer is a referee that is the system, not
  the AI checking itself. The diagram must NOT claim two independent AIs check each other if that
  misleads — if the two-agent framing is used for approachability, the CHECK (red/green observed) is
  still clearly the SYSTEM's, so the diagram reads as "the system referees the loop," never "an AI grades
  its own work." This ties to the `abd-green-only-on-signed-proof` data contract (`act2-beat-director`):
  green appears only on a signed proof, in data, so the site cannot even in fiction depict a green that
  the system did not referee.
- **Plain language** (point 4): "writes a failing test", "the system checks it really fails", "writes
  code", "the system checks it really passes", "repeat" — newcomer-legible, no jargon.

**Where it lives (authoring call — site-side-keyed, NOT a director engine field).** *(PLACEMENT
overtaken by [ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md) §2,
2026-07-05: the loop diagram RELOCATES into Phase D's D5 — it blooms inside the ONE growing system
diagram, its content reused verbatim, with a persistent docked mini-map carrying the stage through the
island walk and the studio finale. This section's CONTENT and system-as-referee honesty obligations
stand unchanged, and the site-side-keyed authoring call stands — still no director field. Noted in
place per ADR-0139.)* The loop diagram is
overlay CONTENT keyed by beat id, exactly like the narration copy and the existing drive-machinery
overlays — the site-side-keyed authoring call ADR-0153 already made for the overlays (ADR-0153
§"Drive-machinery engine-support authoring call"). Rationale (unchanged from ADR-0153): an overlay is
transient, non-map, presentational chrome; there is no isolatable red→green oracle for "is the right
diagram shown" — that IS the operator-attested LOOK; and the `act2-beat-director` engine's standing fence
is "renderer-agnostic — deltas speak scene-semantics, never pixels." So the diagram is NOT a new `Beat`
field and NOT a new delta kind; it is site-side content validated (like all site-side beat content)
against the director's exported zod contract by the `act2-validate` build-time key wall. The director
carries no diagram marker and adds no contract for this. (If a specific overlay ever needs to be GATED as
engine structure — its presence proven deterministically — that is a later, separate re-spec.)

### 6. The wisp MOVES (animated, not a static dot)

*(MOTION sharpened by [ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md)
§5, 2026-07-05: the approved motion is now a true ORBIT around the island — a rotating group whose
transform-origin is the island centre, nested in a flattened plane (scaleY ≈ 0.55) so the circle reads
as an ellipse on the 2.5D map; one lap ≈ 9 s; the glow pulse kept; `prefers-reduced-motion`: stationary
with pulse only — replacing the as-built `act2-wisp-drift`. This section's requirement ("the wisp
moves") STANDS; it now has the approved specific motion. Noted in place per ADR-0139.)*

Currently the scene emits a `wisps` presence marker rendered on the `.tw-wisps` layer as a static dot
(`web/src/scripts/act2-walkthrough.ts` ~lines 510-511, per ADR-0153's As-built note). The owner wants it
ANIMATED (moving). This is a build-spec detail captured on the appropriate LOOK cap (the beat that shows
the wisp): the wisp MOVES — it drifts / travels (e.g. along the limb or over the tree) rather than
appearing as a static dot. The exact motion (path, speed, easing) is intentionally NOT over-specified;
the requirement is "the wisp moves," and the builder + owner tune the feel at the gate. This is a
presentational animation change entirely site-side — no engine change (the wisp presence marker is scene
semantics the director already emits; the ANIMATION of its render is the site's job, the same
site-owns-motion boundary ADR-0145 established for viewBox tweens and growth transitions).

**Unchanged / preserved (explicit).** The two-act experience and the "one calm gesture per act — same
input, opposite outcome" thesis (ADR-0134). Act 1's built experience (terminal chaos → finale → transform
to soil) — only its "storm" naming retires. The one continuous upstream walk and the
dependency-layer-as-advantage teach (ADR-0150). The real-app-UI / progressive-disclosure / no-escape-hatch
shape and the CORRECTED dependency DIRECTION (ADR-0153) — the BaaS edge is added in that same direction,
not against it. The `abd-green-only-on-signed-proof` DATA CONTRACT in `act2-beat-director` (the
verification-gap thesis — NOT retired, NOT weakened; the honest TDD loop diagram is its plain-language
depiction). The 2.5D substrate (ADR-0145); visitor-paced / Next-only pacing *(the visitor-paced
PRINCIPLE stands; the separate Next-button affordance was later moved into the orchestrator chat as
bounded reply chips — [ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md)
§3, 2026-07-05. Noted in place per ADR-0139.)*; anchored-callout narration;
the fictional site-owned data and the boundary (ADR-0056/0066/0093); the ADR-0070 two-stage proof for the
LOOK caps (appearance and feel never self-signed).

## Consequences

**Good.**

- The taught architecture is TRUE to a real shopping app AND to the library: the frontend reads the
  catalog directly from the database (BaaS, as Supabase/Firebase apps actually work), while checkout goes
  through the backend — a viewer who later builds a real app sees the honest shape, not a contrived
  three-hop spine. The dependency edges still point the right way (dependent → prerequisite), so the
  diorama does not mis-teach the model.
- Retiring the "storm" metaphor keeps the copy plain and literal for newcomers, and removes an analogy
  the owner no longer wants — without touching the built, attested Act 1 experience (only its naming).
- The honest TDD loop diagram makes storytree's thesis legible at vibe-coder altitude: the system is the
  referee, not the AI grading its own homework. It answers the "how do I know the green is real" question
  the verification gap poses, in one loop a first-time viewer can hold, and it is backed by the real
  phase machine (not a marketing fiction).
- Plain language throughout lowers the barrier for the actual audience (vibe coders new to the system).
- The pre-walk reading as our real orchestrator, and the first node honestly landing `proposed`, make the
  walk an honest view of the product (intent proposed → proven), reinforcing the same thesis.
- A moving wisp reads as living presence (the point of the wisp — presence without obligation) rather
  than an inert dot.
- The proof model is unchanged: the LEAF (`act2-beat-director`) re-builds red→green through the real
  prove-it-gate at the widened `dependentId` vocabulary; the two LOOK caps stay ADR-0070
  operator-attested.

**Costs / risks (named).**

- **The `add-upstream-story` delta shape changes (widen `dependentId` to accept multiple dependents).**
  This is a breaking change to the synced artifact's contract the site consumes: the site's fold
  (`web/src/scripts/act2-walkthrough.ts` `depthOf`) and script (`web/src/scripts/act2-script.ts`) grow in
  lockstep to draw the diamond (`website → database` alongside `website → backend → database`). The
  `check:web-engine` drift gate and the `act2-validate` narration wall enforce the lockstep. The actual
  engine change is the follow-on build link (red→green under the existing contract,
  `defects-amend-the-owning-story`), NOT done here.
- **The BaaS diamond is a slightly busier map than the 3-tier spine.** The website now has TWO outbound
  edges (to backend and to database). Mitigation: it is still a small, legible DAG (three stories, four
  edges); the frontend-high / foundation-below layout keeps the database at the base as the shared
  foundation both the website and the backend rest on; the beat pacing (reveal scaffolded) is unchanged.
  Whether to reveal the direct `website → database` read edge as its own beat or alongside the backend
  reveal is a build-time pacing call, builder/owner-tunable at the gate.
- **"Real orchestrator voice", the honest TDD loop diagram, the moving wisp, and the plain-language sweep
  are LOOK changes with no isolatable red→green oracle** — they are operator-attested (ADR-0070), a HALT
  point for the driving session; the owner witnesses the feel on the live/preview site. This is the
  correct proof mode for a felt surface, not a gap.
- **The honest TDD loop diagram must not over-claim.** If the two-agent framing ("one writes tests, the
  other writes code") is used for approachability, the diagram MUST keep the CHECK (red/green) as the
  SYSTEM's, or it would recreate the very "AI grades its own homework" failure it exists to refute. The
  cap spec pins this as the load-bearing honest element; the owner attests it reads honestly at the gate.
- **The storm metaphor was previously loved and attested.** Retiring it is an owner re-decision, not a
  correction of an error; the prior attestation of the "storm"-named experience stands as true history
  (copy-on-write). Increment G and H#2 are LIVE + owner-attested — their caps' "As built" live-attested
  records are KEPT; the reshaped surfaces revert toward `building`/`proposed` COPY while preserving the
  attested history.
- **Increment H#2 is LIVE (web main `8f4e166c`).** This ADR reframes the NEXT increment; the actual site
  edits (the BaaS direct-read reveal, the storm-metaphor scrub, the TDD loop diagram, the moving wisp,
  the orchestrator voice, the plain-language sweep) are the follow-on build on storytree-web,
  operator-attested. H#2's live-attested "As built" record is corrected in place / kept as history
  (copy-on-write), not rewritten; the LOOK caps revert toward `building` for the reshaped surface.

## Librarian correction-in-place checklist (copy-on-write; the librarian pass does these, NOT this ADR)

This ADR amends the DECIDED content of the ADRs below but does not edit their bodies. The librarian pass
corrects their stale prose in place and adds a dated forward pointer at each amended point:

- **ADR-0134** — the storm metaphor + the architecture framing:
  - **Title** ("…terminal storm to a calm guided forest") — the word "storm" is now retired from
    surfaces; add a forward pointer to ADR-0157 noting the metaphor is retired (title text is history;
    do not rewrite the filename).
  - **§Status / §1 / §2** — the "storm" framing of Act 1 ("Act 1 — the storm (the problem, felt)"; "the
    storm must never become a toll booth"; the inflection's "storm" references): add a dated forward
    pointer to ADR-0157 that the METAPHOR is retired from surfaces while Act 1's built experience stands;
    correct visitor-facing framing language toward the plain description (the overwhelming swarm / chaotic
    terminals). Keep the historical record intact (copy-on-write) — do not delete the storm prose, point
    forward from it.
  - **§3 (Act 2) / §Consequences** — the architecture is now BaaS (frontend reads the database directly);
    add a forward pointer to ADR-0157 §1 where §3 describes the dependency layers, noting the direct
    `website → database` read edge (the `website.dependsOn=[backend, database]` diamond).
- **ADR-0153** — the "3-tier chosen" authoring call (the "Two authoring calls made here" section, the
  "Architecture: 3-tier, not BaaS" bullet, ≈ lines 149-160): add a dated forward pointer to ADR-0157 §1
  that the owner CONFIRMED BaaS at the H#2 gate (2026-07-05) — the direct `website → database` edge is
  added in the corrected (dependent → prerequisite) direction; the "3-tier, not BaaS" call is overtaken
  by ADR-0157 while ADR-0153's corrected DIRECTION stands. (ADR-0153's "As built / landed (2026-07-05)"
  already forward-points the forward feedback to "a follow-on re-spec"; the librarian names ADR-0157 as
  that re-spec.)
- **ADR-0150** — architecture prose: ADR-0150 describes the upstream stack as `website → backend →
  database` (the 3-tier spine). Where it enumerates the revealed stories/edges (§Decision point 2), add a
  forward pointer to ADR-0157 §1 that the confirmed shape is the BaaS diamond
  (`website.dependsOn=[backend, database]`), the direct read edge added in the same direction. ADR-0150's
  core (one continuous upstream walk; dependency layer is the advantage) stands.

## As built (2026-07-05)

The BUILD link of this re-spec LANDED and is LIVE. All six redirections were delivered.

- **The site (LOOK) — LIVE at web main `d761eadc`** (storytree-web PR #26, both CD runs green, live at
  https://crisp-globe-bf6v.here.now). The BaaS diamond render (the direct `website → database` read edge
  drawn alongside the `website → backend → database` chain), the honest TDD **loop** diagram
  (system-as-referee — `web/src/scripts/act2-overlays.ts` `buildLoopDiagram`: four nodes / four arcs, two
  SYSTEM-check nodes, centred "the system checks — not the AI"), the **moving** wisp
  (`web/src/pages/index.astro`: `animation: act2-wisp-drift` — the wisp travels a soft closed loop, no
  longer a static dot), the plain-language sweep (`act2-narration.ts` de-stormed), the our-orchestrator
  pre-walk (`act2-orchestrator.ts`), and the first story node honestly born `proposed` are all live.
  *(2026-07-05: [ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md)
  relocates the loop diagram into Phase D's growing system diagram (its §2) and replaces the
  `act2-wisp-drift` drift with a true island-centred orbit (its §5); these cites stay true history of
  web main `d761eadc`. Noted in place per ADR-0139.)*
- **The parent director (§1) — BUILT + leaf-proven.** Verdict **`f9ae9b8`** (run `real-mr6ycu73`,
  coverage 4/4). `packages/forest-world-r3f/src/act2-director.ts`: `add-upstream-story`'s `dependentId`
  widened to `z.union([z.string().min(1), z.array(z.string().min(1)).min(1)])` (line 145); `applyDelta`
  normalises to `string[]` and fans the new upstream id into each named dependent's `dependsOn`
  (lines 323, 328); beat 5 raises the database once with `dependentId: ['story-backend', 'story-website']`
  (lines 495–498) → the diamond `website.dependsOn=[backend, database]`, `backend.dependsOn=[database]`,
  `database.dependsOn=[]`. Contract 3 asserts the diamond + direct `website → database` + acyclic sink +
  mixed status; `abd-green-only-on-signed-proof` (contract 2) preserved verbatim.

**Owner attestation — a STEP FORWARD, not a final sign-off.** The owner (hua.mick@gmail.com, 2026-07-05)
attested this as a step forward and directed it to land — verbatim: *"This is also a step forward, so
land it"* — while simultaneously directing a substantial follow-on redesign (an orchestrator-led,
diagram-first walkthrough; the wisp on an orbit; a zoom-to-studio reveal; an ADR → library-artifact flow;
industry framing). So this ADR records a LANDED INCREMENT, not a fully-realized end state: the confirmed
BaaS architecture, the retired storm metaphor, the honest TDD loop diagram, the moving wisp, the plain
language, and the proposed-node / our-orchestrator pre-walk are all live and attested-as-a-step-forward;
the directed redesign is a future arc link, tracked separately (it does not reopen this decision).
*(That directed redesign is now decided as
[ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md), 2026-07-05. Noted in
place per ADR-0139.)*

## References

- [ADR-0153](0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md) — AMENDED: confirms
  its explicitly-open "3-tier vs BaaS" authoring call in favour of BaaS (the frontend reads the database
  directly; a direct `website → database` edge added in the corrected dependent → prerequisite
  direction). ADR-0153's corrected DIRECTION, real-app-UI, progressive-disclosure, and no-escape-hatch
  shape all STAND. No `supersedes` edge — this refines. (Librarian: forward-point the "Architecture:
  3-tier, not BaaS" bullet, ≈ lines 149-160.)
- [ADR-0150](0150-act-2-is-one-continuous-walk-that-grows-upstream-the-depende.md) — AMENDED: its
  `website → backend → database` spine becomes the BaaS diamond (`website.dependsOn=[backend, database]`).
  Its core decision (one continuous upstream walk; the dependency layer is the advantage) STANDS. No
  `supersedes` edge — this refines.
- [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) — AMENDED: the "storm"
  metaphor is retired from all surfaces (Act 1's built experience stands; only the naming/analogy
  retires), and the Act 2 architecture becomes BaaS. Plain language is the standing copy obligation. No
  `supersedes` edge — this refines. (Librarian: forward-point the title, §Status/§1/§2 storm framing, and
  §3/§Consequences architecture prose.)
- [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) — the settled
  dependency-DIRECTION + no-cycle rule (A depends_on B iff A needs B's delivered outcome to pass A's own
  UAT); the authority the new direct `website → database` edge and the no-cycle check rest on.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the red-green phase machine
  (`AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`; red/green OBSERVED by the spine, never
  claimed by the model; write scope per phase) — the ground truth the honest TDD loop diagram depicts.
  Cited files: `packages/orchestrator/src/phase-machine.ts:7-8` (spine observes, not the model),
  `:20-25` (the phases), `:172-174` (`AUTHOR_TEST` writes tests only), `:176-178` (`IMPLEMENT` writes
  source only, never a test — "the test author is not the code author"), `:180-181` (`CONFIRM_*`/`GATE`
  observe-only).
- [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) — a newly-authored story node is born `proposed` (the honesty point
  in §3: the first node lands `proposed`, not instantly green).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the
  outer loop; the orchestrator is the human-facing planning agent (the pre-walk reads as our actual
  orchestrator, §3).
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage proof
  for visual surfaces; the reshaped LOOK stays operator-attested, never self-signed (H#2 was attested "as
  a step forward"; the next increment's LOOK is attested at its own gate).
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment IS
  ratification (this ADR born accepted, owner-directed 2026-07-05 at the H#2 gate).
- [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) /
  [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — copy-on-write: a
  re-decision is a new ADR (this one), not an in-place body edit of 134/150/153; the librarian corrects
  those bodies' stale prose in place (checklist above).
- `cross-story-dependency` (library principle) — the dependency-direction + no-cycle rule; consumed by
  story-author, cited here for the both-ways test on the new direct edge.
- `boundary` (library definition) — the legal cross-story seam; "a frontend depends on a database" is the
  archetype the BaaS direct read realises.
- `plain-language-first` (library principle) — the standing copy obligation (§4).
- [`stories/website-experience/story.md`](../../stories/website-experience/story.md) — the story this arc
  lives in (decisions list + H/framing updated for this decision: BaaS architecture, storm-metaphor
  retired, plain language, honest TDD loop, moving wisp).
- [`stories/website-experience/act2-beat-director.md`](../../stories/website-experience/act2-beat-director.md)
  — the LEAF cap re-specced: the `add-upstream-story` delta widened so a prerequisite (the database) can
  be depended on by more than one story (the BaaS diamond); the honest status mix; the first node born
  `proposed`. Re-specced in place (no id change — it is a `--real` cap in the node-build snapshot).
- [`stories/website-experience/act2-guided-forest.md`](../../stories/website-experience/act2-guided-forest.md)
  — the LOOK cap (increment H) re-specced: the BaaS architecture render (direct `website → database`
  read), the honest TDD loop diagram (system-as-referee), plain language, no storm metaphor. Its "As
  built / attested (H#2)" live record kept intact (copy-on-write).
- [`stories/website-experience/act2-guided-walkthrough.md`](../../stories/website-experience/act2-guided-walkthrough.md)
  — the LOOK cap (increment G) re-specced: plain language, storm metaphor retired, the moving wisp, the
  pre-walk-as-our-orchestrator, the honest TDD loop diagram where it belongs. Its "As built"
  live-attested history kept intact.
- [`stories/website-experience/act1-terminal-storm.md`](../../stories/website-experience/act1-terminal-storm.md)
  — the storm ANALOGY retired from its visitor-facing copy / descriptive prose (cap ID kept; Act 1's
  built experience kept). Its "As built" history kept intact.
