---
status: accepted
decided: 2026-07-04
amends: [134, 145, 148, 150]
---
# ADR-0153: Act 2 uses the real app UI, hides the unwalked, and grows a corrected-direction dependency stack the visitor drives

## Status

accepted (2026-07-04) — decided/directed by the owner at the `act2-guided-forest` (increment H)
attestation gate on 2026-07-04, where increment H was REFUSED at ADR-0070 stage 2 and the WHAT was
re-directed. Design-time alignment IS the ratification
([ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)); no second end-of-flow ask.

This is a NEW ADR, not an in-place edit of the ADRs it amends (copy-on-write, ADR-0086/0139): the
bodies of 134/145/148/150 stay as history, with a dated forward pointer added at each amended point by
the librarian pass. It carries **no `supersedes` edge** — it REFINES the Act 2 experience, it does not
un-decide any prior decision. In particular ADR-0150's core decision (Act 2 is one continuous walk
that grows UPSTREAM; the dependency layer is the advantage) STANDS — this ADR fixes an ERROR in how
that sound decision was expressed downstream (the dependency DIRECTION was encoded backwards in the
cap specs) and adds five further owner redirections from the same gate.

## Context

[ADR-0150](0150-act-2-is-one-continuous-walk-that-grows-upstream-the-depende.md) (2026-07-04) decided
Act 2 is one continuous visitor-paced walk that, after growing a mock website green, keeps walking
UPSTREAM into a backend and a database the website depends on — and that the dependency LAYERS shown on
the real map ARE storytree's advantage (replacing beat 4's wrong-way-flag antipattern). That decision
is SOUND and stands. Increment H (`act2-guided-forest`) was then built against it and taken to the
owner's ADR-0070 stage-2 attestation gate on 2026-07-04, where it was **REFUSED**. At that gate the
owner gave six redirections. One is a correction of a real ERROR in the H build (and in the cap specs
it was built from); the other five sharpen the experience toward the real product. Because the WHAT
changes substantially, the re-spec is a new born-accepted ADR plus cap re-specs (copy-on-write /
learning-17), not a patch of the refused build.

**The error: the dependency DIRECTION was encoded backwards.** ADR-0150's prose says the right thing
("`website → backend → database`", "the website depends on the backend"), but the cap specs it drove
encoded the OPPOSITE edge. `act2-beat-director` stated the `add-upstream-story` delta's `dependsOn`
"points DOWN to the story it is upstream of (the backend `dependsOn` the website; the database
`dependsOn` the backend)" — i.e. `backend.dependsOn=[website]`. That contradicts the authoritative
library. The `cross-story-dependency` principle and
[ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) §1 are unambiguous:
**"Story A depends on story B if and only if A needs B's delivered outcome — consumed through B's
declared boundary — as a precondition to pass A's OWN UAT."** Run that test on {website, backend,
database}: the website needs the backend's delivered outcome to pass its own UAT (a frontend cannot
serve a working cart/checkout without the service it calls), so `website.dependsOn = [backend]`; the
backend needs the database's delivered outcome, so `backend.dependsOn = [database]`; a database is
provable and deliverable headless, so `database.dependsOn = []`. The `boundary` definition and
[ADR-0010](0010-organism-model-story-bounded-context.md) §Context use "a frontend depends on a
database" as THE archetype for exactly this. The edge points FROM the dependent TO its prerequisite.
The refused build had it backwards; the data direction is settled and non-negotiable.

**The five sharpenings** all pull Act 2 toward the real product rather than a bespoke demo:

1. **Real UI components.** Both the session-orchestrator surface AND the walk must use the SAME UI
   components as the real desktop/web app (`apps/desktop`, `apps/studio`), not bespoke chrome. The
   general rule the owner stated: keep HIDING UI elements the user has not yet been walked through
   (progressive disclosure), so the interface reveals itself as the walk earns it.
2. **No escape hatches.** Remove "skip the intro" and EVERY path to the static / deprecated websites
   (all deprecated — a capable visitor is offered NO escape to them). Only the gate-required no-JS /
   reduced-motion accessibility fallback stays.
3. **Step 1 is an OUTCOME BRIEF with an example.** A story is presented as an outcome brief carrying an
   example — ideally with the session-orchestrator CHAT shown AT THE BOTTOM (as the real app), carrying
   that example. The earlier "young tree / lives on the map / not buried in a chat log" framing is
   dropped.
4. **Step 2 shows what the orchestrator DOES: it routes to the DRIVE MACHINERY.** A TEMPORARY
   flow-diagram OVERLAY (top-left) shows the agent loop that runs in the background. It is an overlay,
   not drawn on the map, precisely because the background machinery is NOT map signal unless something
   breaks or needs attention — the map stays the honest picture of the work; transient process detail
   floats above it.
5. **Steps 3–4 expand the drive-machinery diagram(s).** There is a lot to teach (CI/CD, devops, the
   gates, how the system is wired to the code to keep it honest); the walk MAY use multiple diagrams
   (a second overlay, top-right) but must not overload the viewer — complexity stays scaffolded.

The orchestrator-as-a-human-facing-planning-agent framing that steps 1/2 lean on is
[ADR-0030](0030-all-in-on-claude-agent-sdk.md)'s (the human owns the
outer loop; the orchestrator is the planning agent that turns intent into routed work) — dramatised
site-side as fictional content, never the operable studio. This is the same citation `act2-guided-walkthrough`
already leans on for its scripted-orchestrator proposal.

This decision is design-time-ratified (the owner directed it at the gate, ADR-0110) — it is NOT a fork
to re-escalate. It fixes the HIERARCHY the direction implies: the LEAF (`act2-beat-director`) re-specced
to encode the corrected `dependsOn` direction; the two LOOK caps (`act2-guided-walkthrough` increment G,
`act2-guided-forest` increment H) re-specced to the real-UI / progressive-disclosure / no-escape /
outcome-brief-with-chat / drive-machinery-overlay experience; and the story-level framing — each honest
at its tier.

## Decision

**Act 2 is the storytree product shown honestly to a first-time visitor: it uses the REAL app's UI
components, hides UI the visitor has not been walked through yet, offers no escape to any deprecated
page, and grows a dependency stack whose edges point the CORRECT way (`website → backend → database`,
the dependent to its prerequisite) as ONE continuous walk the visitor drives.** Six points:

1. **The dependency DIRECTION is corrected to the library's rule (fixes an error in expressing
   ADR-0150; amends ADR-0150's cap encoding).** The `dependsOn` edges are `website.dependsOn=[backend]`,
   `backend.dependsOn=[database]`, `database.dependsOn=[]` — the edge points FROM the dependent TO its
   prerequisite (a story depends on another iff it needs that story's delivered outcome to pass its own
   UAT; `cross-story-dependency`, ADR-0058 §1). The `act2-beat-director` `add-upstream-story` delta and
   its contract encode THIS direction; the self-contradicting "backend `dependsOn` the website"
   parenthetical is removed. ADR-0150's decision to grow UPSTREAM stands; only the mis-encoded direction
   is fixed. The librarian corrects ADR-0150's stale prose in place; this ADR asserts the corrected
   direction as the settled data.

2. **Real UI components, with progressive disclosure (amends ADR-0134's bespoke-surface implication).**
   The session-orchestrator surface and the walk reuse the real app's UI components (the same
   components `apps/desktop` / `apps/studio` render), not bespoke website chrome — visual parity with
   the real product, subject to the web-repo sync boundary (see Consequences). UI elements the visitor
   has not yet been walked through are HIDDEN and revealed as the walk reaches them (progressive
   disclosure). The website teaches by BEING a faithful, if fictional, view of the real interface.

3. **No escape hatches to deprecated pages (amends ADR-0148 §5 / ADR-0134).** "Skip the intro" and
   every path to the static / deprecated websites are removed — a capable visitor is offered no escape
   to them (all deprecated). The ONLY surviving non-experience path is the gate-required no-JS /
   `prefers-reduced-motion` accessibility fallback (a clean minimal static page, gate-enforced by
   `check:web-experience`). The tutorial is the front door; there is no "prefer the classic page" door.

4. **Step 1 is an outcome brief with an example, carried by the orchestrator chat at the bottom
   (amends ADR-0134's step-1 framing).** A story is presented as an OUTCOME BRIEF that carries an
   EXAMPLE. Ideally the session-orchestrator CHAT is shown AT THE BOTTOM (as the real app), carrying
   that example — the visitor sees the brief the way a real user would, in the real chat surface. The
   earlier "young tree / lives on the map / not buried in a chat log" prose is dropped as the framing.

5. **Step 2 shows the orchestrator routing to the DRIVE MACHINERY, via a temporary top-left overlay
   (amends ADR-0150's post-website arc).** *(OVERTAKEN by
   [ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md) §2, 2026-07-05: the
   corner overlays RETIRE — the agent-loop teach is ABSORBED into Phase D's one growing system diagram,
   whose D5 stage blooms the landed loop diagram reused verbatim, and a persistent docked mini-map
   replaces the corner-overlay pattern. This point's RATIONALE ("background machinery is not map
   signal; transient process detail floats above the map") CARRIES FORWARD into the mini-map, and the
   site-side-keyed authoring call stands. Noted in place per ADR-0139.)* After the brief, the walk
   shows what the orchestrator DOES with the story: it routes it to the drive machinery. A TEMPORARY
   flow-diagram OVERLAY, top-left, depicts the agent loop running in the background. It is an OVERLAY, not drawn on the map, because
   the background machinery is not map signal unless something breaks or needs attention — the map
   stays the honest picture of the work, transient process detail floats above it and clears.

6. **Steps 3–4 expand the drive-machinery diagram(s), scaffolded, MAY use a second overlay (amends
   ADR-0150).** *(OVERTAKEN by
   [ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md) §2, 2026-07-05: the
   expanded-diagram / second-overlay expression retires — the CI/CD row-list overlays RETIRE FULLY;
   their content moves into D5/D6 CHAT COPY (gates and CI/CD get one line each, keeping "gate" and
   "signed" as the load-bearing words), no row-list overlay returns anywhere in the experience, and the
   persistent mini-map replaces the corner-overlay pattern. The site-side-keyed authoring call stands.
   Noted in place per ADR-0139.)* The walk expands what the drive machinery is — CI/CD, devops, the
   gates, how the system is wired to the code to keep it honest — building it out across steps 3–4. It
   MAY use multiple
   diagrams (a second overlay, top-right) but MUST NOT overload the viewer; complexity stays SCAFFOLDED
   (revealed in the order a human can hold it), the same obligation ADR-0150 already states for the
   upstream reveal. These drive-machinery steps are where the deeper CI/CD/gates/wiring picture lives,
   and they extend into increment H's upstream reveal (H is the depth — the backend/database the walk
   grows).

**Unchanged / preserved (explicit).** ADR-0150's core decision (one continuous upstream walk; the
dependency layer is the advantage; the wrong-way road retired as the teach). The
`abd-green-only-on-signed-proof` DATA CONTRACT in `act2-beat-director` (the verification-gap thesis —
NOT retired, NOT weakened). The 2.5D substrate (ADR-0145) — the walk still renders on the synced
`buildScene` scene graph as the site's SVG; the drive-machinery overlays are chrome ABOVE that map, not
a substrate change. Visitor-paced / Next-only pacing *(the visitor-paced PRINCIPLE stands; the separate
Next-button affordance was later moved into the orchestrator chat as bounded reply chips —
[ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md) §3, 2026-07-05. Noted
in place per ADR-0139.)*; anchored-callout narration; plain-language voice;
the fictional site-owned data and the boundary (ADR-0056/0066/0093); the ADR-0070 two-stage proof for
the LOOK caps (appearance and feel never self-signed). Act 1 and the storm→land inflection.

**Two authoring calls made here (owner-tunable at the gate).**

- **Architecture: 3-tier, not BaaS.** *(OVERTAKEN by
  [ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md) §1, 2026-07-05: the
  owner CONFIRMED BaaS at the increment-H BUILD #2 gate — "in a real shopping app the frontend would
  read directly from the database." The confirmed shape is the BaaS diamond: a direct `website →
  database` read edge is ADDED in the corrected (dependent → prerequisite) direction, giving
  `website.dependsOn=[backend, database]` (the backend edge STAYS — writes/checkout still need server
  logic). This was exactly the owner's-call-at-the-gate this bullet flagged as "ALSO corpus-legal";
  ADR-0153's corrected DIRECTION and the rest of its decision STAND. Noted in place per ADR-0139.)*
  The revealed stack is `website → backend → database` with NO
  direct `website → database` edge — the website depends on the backend, which depends on the database.
  This is the layered-stack the owner's own narration teaches ("checkout needs server logic → a
  backend; carts need storage → a database"): each layer is the honest prerequisite of the one below
  it in the DAG, revealed in order. A BaaS shape (`website → backend` AND a direct `website → database`)
  is ALSO corpus-legal and the layers-teach would still work, but a direct frontend→database read
  muddies the "build them in the right order, each layer rests on the next" lesson for a first-time
  viewer and makes the database look like a sibling service rather than the foundation. The DATA
  direction (dependent → prerequisite) is the non-negotiable; the 3-tier-vs-BaaS SHAPE is the owner's
  to confirm at the gate.
- **Spatial layout: frontend HIGH, foundation BELOW (owner preference; a free render choice).** The
  owner directed a spatial preference: the FRONTEND high (the consumer on top), with the backend then
  the database as the foundation BELOW, the backend delivering UP to the frontend — a layered-stack
  look where the dependencies render as the ground the website rests on. There is NO corpus convention
  for spatial layout (the DATA direction is convention; screen position is not), so this is expressed
  as the TARGET but is builder/owner-tunable at the ADR-0070 stage-2 gate. Note the vocabulary
  reconciliation: "upstream" (ADR-0150's decision language, meaning the dependency direction — toward
  what the website needs) renders, under this preference, as the FOUNDATION BELOW. "Upstream" and
  "frontend high / foundation below" describe the same layering from two axes (dependency vs. screen)
  and must not read as contradictory.

## Consequences

**Good.**

- The website teaches the real product by SHOWING it: real UI components, the real chat surface at the
  bottom carrying a real-shaped outcome brief, the honest dependency stack in the right direction. A
  first-time visitor sees what storytree actually looks and works like, not a bespoke marketing diorama.
- Progressive disclosure makes the interface itself part of the lesson: the visitor is never dumped in
  front of the full app; UI reveals as the walk earns it — the same scaffolding discipline the upstream
  reveal already follows.
- Removing every escape hatch makes the experience the single front door (the owner's "all in on the
  tutorial", now complete): no capable-visitor detour to a deprecated page dilutes the pitch, while the
  a11y fallback keeps the door open for those who need it.
- The drive-machinery overlays answer the "what happens after I ask" question the map deliberately does
  NOT show (because background machinery is not map signal) — as temporary, clearable chrome, so the
  map stays the honest picture and the process detail is available without permanently cluttering it.
- The corrected dependency direction makes the taught structure TRUE to the library and the product: a
  viewer who later opens the real studio sees the same edge semantics (dependent → prerequisite), so
  the diorama does not mis-teach the model.
- The proof model is unchanged: the LEAF (`act2-beat-director`) re-builds red→green through the real
  prove-it-gate at the corrected-direction vocabulary; the two LOOK caps stay ADR-0070
  operator-attested (appearance and feel never self-signed).

**Costs / risks (named).**

- **"Real UI components" crosses the web-repo sync boundary — a build-time mechanism question, not
  settled here.** The public site is not a workspace member; it consumes parent-built ARTIFACTS via the
  sync + drift-gate rail (ADR-0056/0066/0093; the site only HAS the synced `buildScene` artifact, not
  the app's live component source). Whether "reuse the real app's components" is achievable literally
  (sync more components across the boundary), by faithful re-creation site-side against the same design
  system, or some mix, is a build-time call for the `frontend-builder` + owner. This ADR fixes the WHAT
  (visual parity with the real app; reuse real components where the boundary allows; no bespoke chrome)
  and flags the mechanism as an open build-time call — it does not over-constrain HOW.
- **The `act2-beat-director` exported contract encodes the corrected edge direction.** This is a
  correction, not a fresh shape change on top of ADR-0150 (which already grew the director to
  multi-story-with-`dependsOn`): the `add-upstream-story` delta and its contract now assert
  `website.dependsOn=[backend]` / `backend.dependsOn=[database]` (the previously-authored-but-unbuilt
  backwards encoding is removed before it was ever proven at the grown vocabulary). The site's fold
  grows in lockstep; the `check:web-engine` drift gate + the `act2-validate` narration wall enforce it.
- **The drive-machinery overlays are NEW site-side content with no new engine structure (authoring call
  below).** They are keyed by beat id like the narration copy, so they add site-side build surface (two
  overlay diagrams, top-left and top-right, temporary) and site-side coverage the owner attests — but
  no new director contract. If a future need arises to VALIDATE overlay-presence as engine structure,
  that is a later, separate re-spec.
- **Increment G is LIVE (web main `ff70222b`) and increment H's refused build exists on a branch.** This
  ADR reframes the experience; the actual site edits (the real-UI re-skin, the escape-hatch removal, the
  outcome-brief-with-chat step 1, the drive-machinery overlays, the corrected-direction upstream reveal)
  are H's re-build on storytree-web, operator-attested. G's live-attested "As built" record is corrected
  in place (copy-on-write), not rewritten; H's LOOK cap reverts toward `building` for the reshaped
  surface (`defects-amend-the-owning-story`).
- **Spatial layout is intentionally under-specified.** Screen position is a free render choice with no
  corpus convention; the owner's frontend-high preference is the target but the builder tunes it and the
  owner confirms at the gate. A build that renders the stack any coherent way is not wrong on the DATA;
  it is judged on the FEEL.

## As built / landed (2026-07-05)

Increment H's re-build against this ADR was built machine-green, taken to the owner's ADR-0070 stage-2
attestation gate, and **attested as a STEP FORWARD → LANDED LIVE** on 2026-07-05 (owner-directed to
land AND continue). This records the as-built; it re-decides nothing (status stays `accepted`).

- **Web:** the guided-upstream-forest re-build (real-app chat dock at the bottom carrying the outcome
  brief; the corrected `website → backend → database` dependency stack rendered frontend-high /
  foundation-below; the drive-machinery overlays top-left/top-right; no capable-visitor escape hatch —
  a11y fallback only) shipped storytree-web PR #25 → web main `8f4e166c`, CD green, live at
  https://crisp-globe-bf6v.here.now/. The corrected direction is in the site-owned script
  (`web/src/scripts/act2-script.ts` — `dependentId` FROM dependent TO prerequisite, 3-tier, no direct
  `website → database` edge) and the fold (`web/src/scripts/act2-walkthrough.ts` — `depthOf` stacks the
  website highest and the database at the base). The synced `act2-director` is untouched
  (`check:web-engine` green).
- **Parent:** the corrected-direction `act2-beat-director` grow landed `--real`-signed (run
  `real-mr6bktin`, `--store pg`, PASS; verdict commit `deb235e`, consolidation `4fa1a69`); the `web/`
  submodule pin bumped `ff70222b` → `8f4e166c` (`ff70222b`); all three web gates OK,
  `packages/forest-world-r3f` 16/16 tests green.

**Forward feedback drives a FOLLOW-ON re-spec (the next arc link — NOT decided here).** *(That
follow-on re-spec is now [ADR-0157](0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md),
2026-07-05 — it captures all six directions below as the NEXT increment's brief: BaaS (the frontend
reads the database directly), the storm metaphor retired from all surfaces, the pre-walk as our
orchestrator + a first node born `proposed`, plain newcomer language, the honest TDD LOOP diagram
(system-as-referee), and a moving wisp. Noted in place per ADR-0139.)* The owner
attested this as an incremental step *with* directions for further change, which the story-author will
turn into the next link's re-spec (this ADR does not encode them as decided): the storm analogy is to
be removed from all surfaces; the pre-walk should read as talking to our system (a proposed story
node); descriptions should drop weird-analogy/jargon usage and stay simple for newcomer devs; the
agent-loop explanation should be a LOOP DIAGRAM (not a list) that also speaks to the TDD orchestration
flow ("one agent writes tests", "the other builds code to pass the tests"); the wisp should actually
MOVE (it currently renders as a static dot — the scene emits a `wisps` presence marker rendered on the
`.tw-wisps` layer, not yet animated); and the taught shape should let the frontend read the database
directly (a BaaS-shape re-visit of this ADR's 3-tier authoring call — corpus-legal, owner's call at the
next gate). Because of this, neither the LOOK caps nor the arc are terminally closed.

**Drive-machinery engine-support authoring call (site-side-keyed, NOT a director field).**
*(2026-07-05: the OVERLAYS this call specified retire per
[ADR-0165](0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md) §2, but the
site-side-keyed authoring call itself CARRIES FORWARD unchanged to ADR-0165's growing diagram and
persistent mini-map — still site-side content keyed off the walk's steps, still NOT a director field,
no new delta kind. Noted in place per ADR-0139.)* The
drive-machinery overlays (redirections 4/5) are specified as SITE-SIDE content keyed by beat id — the
same precedent as the narration copy ("words stay site-side") — and the `act2-beat-director` engine
needs NO change for them. Rationale: an overlay is transient, non-map, presentational chrome (a
flow-diagram floating above the map, cleared when done) — it is a pixel/presentation concern, and the
director's standing fence is "renderer-agnostic — deltas speak scene-semantics, never pixels." The
overlays carry no scene semantics the mapper must draw and no state the engine must hold; they are keyed
off beat ids the director already exports. Making them engine structure would push presentation into the
substrate-blind engine for no proof benefit (there is no isolatable red→green oracle for "is the right
diagram shown" — that IS the operator-attested LOOK). So the engine stays substrate-blind; the overlays
live with the surface, validated (like all site-side beat content) against the director's exported zod
contract by the `act2-validate` build-time key wall. If a specific overlay ever needs to be gated as
structure, that is a later separate call.

## References

- [ADR-0150](0150-act-2-is-one-continuous-walk-that-grows-upstream-the-depende.md) — AMENDED: its core
  decision (one continuous upstream walk; dependency-layer-as-advantage) STANDS; this ADR corrects the
  dependency DIRECTION its cap specs mis-encoded (`website → backend → database`, dependent →
  prerequisite) and adds the real-UI / progressive-disclosure / no-escape / outcome-brief-with-chat /
  drive-machinery-overlay redirections. No `supersedes` edge — this refines.
- [ADR-0148](0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md) — AMENDED: the
  escape-hatch removal (§5 "prefer the classic page" opt-out fully retired) and the step-1/step-2
  reframing extend its website-first arc.
- [ADR-0145](0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md) — the 2.5D substrate;
  EXTENDED (the substrate stands; the drive-machinery overlays are chrome above the map, and the
  real-UI components render within it).
- [ADR-0134](0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md) — AMENDED: the
  bespoke-surface implication becomes real-app-UI reuse with progressive disclosure; step 1's framing
  becomes an outcome brief with an example in the orchestrator chat.
- [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) — the settled
  dependency-DIRECTION rule (A depends_on B iff A needs B's delivered outcome to pass A's own UAT); the
  authority the corrected direction rests on.
- [ADR-0010](0010-organism-model-story-bounded-context.md) — the organism/bounded-context model; its
  §Context uses "a frontend depends on a database" as the dependency archetype.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the
  outer loop; the orchestrator is the human-facing planning agent (the chat/orchestrator framing steps
  1/2 dramatise, site-side and fictional).
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the two-stage proof
  for visual surfaces; increment H was refused at stage 2, and the reshaped LOOK stays operator-attested,
  never self-signed.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment IS
  ratification (this ADR born accepted, owner-directed 2026-07-04 at the gate).
- [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) /
  [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md) — copy-on-write: a
  re-decision is a new ADR (this one), not an in-place body edit of 134/145/148/150; the librarian
  corrects those bodies' stale prose in place.
- `cross-story-dependency` (library principle) — the dependency-direction + no-cycle rule; consumed by
  story-author, cited here for the corrected direction.
- `boundary` (library definition) — the legal cross-story seam; "the way a frontend depends on a
  database" is the archetype this correction restores.
- [`stories/website-experience/story.md`](../../stories/website-experience/story.md) — the story this
  arc lives in (decisions list + H framing updated for this decision).
- [`stories/website-experience/act2-beat-director.md`](../../stories/website-experience/act2-beat-director.md)
  — the LEAF cap re-specced by this decision (corrected `dependsOn` direction; the self-contradicting
  parenthetical removed).
- [`stories/website-experience/act2-guided-walkthrough.md`](../../stories/website-experience/act2-guided-walkthrough.md)
  — the LOOK cap (increment G) re-specced: real-UI / progressive disclosure / no escape hatches /
  outcome-brief-with-chat / drive-machinery overlays; the "As built" live-attested history kept intact.
- [`stories/website-experience/act2-guided-forest.md`](../../stories/website-experience/act2-guided-forest.md)
  — the LOOK cap (increment H, the refused one) re-specced: corrected dependency direction, real-UI,
  the deeper drive-machinery diagrams, no escape hatches, spatial reconciliation of "upstream" with
  "frontend high / foundation below".
