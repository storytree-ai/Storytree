---
id: "website-experience"
tier: story
title: "The two-act vibe-coding experience — the public site's front door enacts chaos → calm"
outcome: "A visitor on the public site FEELS the thesis instead of reading it: one prompt into a retro terminal breeds an illegible agent storm, one calm tap collapses the noise into soil, and the same single gesture then grows a legible, proof-bearing forest beat by beat to the CTA — with the skip and reduced-motion/no-WebGL exits first-class from the first live increment."
status: proposed
proof_mode: UAT
# MIXED WITNESS, no blanket `uat_witness:` override (the ADR-0040 fail-closed default is human).
# RE-ADJUDICATED 2026-07-25 (ADR-0209 §8 corpus-wide migration): the FELT surfaces — the storm's
# overwhelm, the inflection's exhale, Act 2 reading as Act 1's request answered, a non-expert's
# reading of the dependency layout — were ADR-0070 operator-attested human legs; an agent cannot
# judge a feel and can NEVER self-attest one. NARROWED 2026-08-11 (ADR-0348 D6): all FIVE felt legs are
# DELETED as user EXPERIENCE rather than user ACCEPTANCE claims, leaving EIGHT machine legs and ZERO
# human ones. The claims are NOT discarded — they are carried in "The felt thesis" section as design
# intent the owner answers by walking the live site. Everything MECHANICAL underneath them is `machine`,
# including the site BEHAVIOUR the two parent-side guards (the extended web-engine drift gate — still
# a live rung; the rollout guard, whose `check:web-experience` rung ADR-0311 D2 retired — ADR-0336
# then re-wired only its static-closure third as the new `check:web-experience-closure` rung, leaving
# the marker-presence half still unwired) cannot see:
# cross-repo and not-yet-harnessed are COSTS, not
# judgment gaps (`human-witness-is-a-judgment-gap-not-cost`). Eight machine legs, zero human legs;
# each Story-UAT leg below marks its own witness (the split table is in "UAT Test Criteria").
# ADR-0294 D2/D4 pass 2026-08-20: none of the eight is deleted — no lower-tier node proves any of them
# — and all eight are declared UNBOUND and fail closed. See the dated block in "UAT Test Criteria".
capabilities: [r3f-world-spike, experience-rollout-guardrails, web-experience-sync, act2-beat-director, act1-terminal-storm, storm-to-forest-inflection, act2-guided-walkthrough, act2-guided-forest, info-pages-triage]
# Consumer-side outbound edges (the ADR-0058 delivered-outcome test, run both ways):
#  - forest-world: the R3F mapper (`packages/forest-world-r3f`, this story's parent-side package —
#    see "Structural calls" below) IMPORTS `@storytree/forest-world` and consumes its semantic layer
#    (the `World` geometry + the scene-graph's kind / position / variant / folded-status,
#    ADR-0123 §1). A real code edge the boundary gate will scan once the package lands; the whole
#    story rolls it up. forest-world needs nothing from this story — acyclic.
#  - website: Act 2 reaches the live site ONLY through the `website` story's delivered mechanism —
#    the sync-into-submodule + drift-gate artifact flow (`sync:web-engine` / `check:web-engine`,
#    ADR-0093 §3) that `web-experience-sync` extends, and the grounded-claims wire
#    (`check:web-grounding`) the surviving pages keep riding. Passing this story's UAT on the live
#    site is impossible without that outcome, so the edge is real. It is a STORY-graph edge, not a
#    package edge (neither story ships a workspace package the other imports) — the website surface
#    stays a package-level sink (ADR-0100: no code imports a surface); this story is the new
#    story-level sink above it (nothing consumes the front door's front door). website needs nothing
#    from this story — acyclic: website-experience → website → forest-world.
# cli (ADR-0192 landlord rule): the experience-rollout-guardrails cap's proof sources live in the
# cli hub's territory (packages/cli/src/web-experience-check.ts — the check:web-engine drift guard
# rides the cli's test surface) — a hosted-seam edge, declared consumer-side so it can be annotated
# below (an unbacked provider-side `consumed_by: [cli]` would sit as permanent cli-story drift-WARN
# wallpaper; consumed_by suits only code-backed hub consumption).
depends_on: [forest-world, website, cli]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [website, cli]
consumed_by: []
# Deciding ADRs (ADR-0037 §2): the shared render core + sync-into-submodule artifact flow (93);
# the renderer — R3F + drei as the THIRD forest-world mapper, client-only island, mandatory
# fallback, package home delegated to this story (123); website-story frame consolidates as
# ADR-0215 (supersedes 134/167/172 — two-act pitch, experience-is-the-site, diorama/boundary,
# a11y-only escapes, replay-only); Act 2 experience authority consolidates as ADR-0213
# (supersedes 145/148/150/153/157/165); Act 1 experience authority consolidates as ADR-0216
# (frozen overwhelm → finale → transform).
decisions: [93, 123, 213, 215, 216]
---

# The two-act vibe-coding experience — the public site's front door enacts chaos → calm

**Outcome —** A visitor on the public site FEELS the thesis instead of reading it: one prompt into a
retro terminal breeds an illegible agent storm, one calm tap collapses the noise into soil, and the
same single gesture then grows a legible, proof-bearing forest beat by beat to the CTA — with the
skip and reduced-motion/no-WebGL exits first-class from the first live increment.

This is ADR-0215's
website-story frame made buildable, on the guiding idea the frame fixes: **one calm gesture per act —
same input, opposite outcome.** In Act 1 the visitor's single tap (send a prompt) breeds chaos; in
Act 2 the visitor's single tap (advance) grows order. Act 2 detail lives on
ADR-0213. The
evidence base for what Act 1 dramatizes and what the forest answers is
[docs/research/vibe-coding-gripes-2026.md](../../docs/research/vibe-coding-gripes-2026.md) — its
five-row beat table is the ORIGIN of the Act 2 spine, carried into `act2-beat-director` and
`act2-guided-walkthrough` (increment G, live).

- **Act 1 — the storm.** One retro CRT terminal, already logged into a coding agent. The visitor
  sends ONE prompt (suggested chip or typed — the gesture also unlocks audio). The agent "thinks,"
  then spawns sub-agents that BECOME new terminals (diegetic multiplication), tiling toward overload
  (~10–12 windows cap), each parking on an unanswerable demand (`awaiting instructions`,
  `Postgres or SQLite? (y/n)`), under an arcade HUD `AGENTS: n ▲`. Plain DOM/CSS + a canvas grain
  pass + Web Audio. **No WebGL in Act 1.**
- **The inflection.** At peak, everything dims and the peak affordance appears amid the noise — a
  **diegetic finale terminal** (as built, web main `281b1e6`, owner-directed 2026-07-03): the root
  agent concedes the swarm isn't working and offers a fork, `show me the better way →` (this
  transform) and an external ghost exit (see [`act1-terminal-storm`](act1-terminal-storm.md) "As
  built — the finale rework"). One click TRANSFORMS rather than navigates — terminals fall silent,
  collapse, fragments drop into the ground as soil. *(ADR-0148, 2026-07-03: the transform now
  resolves straight into Act 2's 2.5D tutorial — the R3F landing island retires, so the whole
  post-storm experience is 2.5D SVG/DOM with zero WebGL.)*
- **Act 2 — the calm forest, the request done right (ADR-0148).** Silence resolves into an empty
  land carrying Act 1's SAME request ("build me a shopping website" — one prompt, two ways). The
  session orchestrator answers it the storytree way in two increments the owner sequenced
  ship-now/extend-next:
  - **G — the website-first walk.** The orchestrator proposes a MOCK LOCAL WEBSITE (no backend, an
    honest minimum that meets the vibe coder where they are) in a short scripted exchange; the
    AUTO-GUIDED, VISITOR-PACED five-beat walk (one Next-tap per beat, plain language — the tonal
    inverse of Act 1) then grows THAT one website story green: plant a story → watch a wisp → it
    branches (green only on signed proof) → stories connect (roads) → pull back (the whole legible
    forest) → a CTA that hands off to "what's next."
  - **H — the ONE continuous walk grows upstream (ADR-0150, 2026-07-04; re-specced by ADR-0153 after
    H was REFUSED at its gate).** The visitor KEEPS WALKING the same arc (not a separate CTA-gated
    phase — "it shouldnt be separate"): the orchestrator guides them into the DEPENDENCY STACK the
    website rests on — a backend and a database as PROPOSED trees on real `dependsOn` edges pointing
    FROM the dependent TO its prerequisite (`website.dependsOn=[backend]`, `backend.dependsOn=[database]`;
    the website NEEDS the backend, the backend needs the database — ADR-0058 / `cross-story-dependency`;
    stories at every DAG level, not just leaves). *(The refused first build encoded this BACKWARDS;
    ADR-0153 corrects the direction.)* Rendered with the FRONTEND HIGH and the foundation BELOW (owner
    spatial preference, a free render choice). The DEPENDENCY LAYERS shown on the real map ARE the
    advantage storytree teaches — you SEE the layers, build them in order, nothing hidden (this POSITIVE
    teach replaces increment G's beat-4 wrong-way-flag antipattern). The experience uses the REAL app's
    UI with progressive disclosure and NO escape hatches (ADR-0153), and the deeper drive-machinery
    diagrams (CI/CD, devops, gates, wiring) live here. Each upstream story is inspectable (what it is +
    why) and walked green progressively; complexity SCAFFOLDED, revealed as the walk continues, never
    dumped.
  A **stylized teaching diorama over FICTIONAL data** (ADR-0056/0066/0093 boundary), never the
  operable studio.
- **Rollout — replace home incrementally.** The storm becomes the live homepage as soon as it is
  presentable; Act 2 grows in place on the real here.now CD rail (every merge to `storytree-web`
  main publishes). CONSEQUENCE (owner decision 6, 2026-07-02): the skip affordance and the
  no-WebGL / `prefers-reduced-motion` fallback are FIRST-CLASS from the FIRST increment, and every
  increment must leave the live site coherent.
  *(ADR-0153 narrowing, 2026-07-04: the owner's redirection 2 removes "skip the intro" and every path
  to a static/deprecated page as a CAPABLE-VISITOR escape — ONLY the gate-required no-JS /
  `prefers-reduced-motion` a11y fallback stays. This narrows the "skip is first-class" consequence to
  the a11y-fallback path. OPEN OWNER/BUILD-TIME CALL — flagged, not silently resolved here: whether
  `experience-rollout-guardrails`'s judge should keep asserting a distinct "skip
  affordance marker" or fold it into the a11y-fallback marker is a change to that LEAF cap's contract,
  outside this Act-2 re-spec's scope; the owner tunes it. Until then the guardrail still requires both
  markers, and the Act-2 build simply stops offering the skip as a capable-visitor escape — the marker
  can remain present on the a11y path. **Since 2026-08-05 that MARKER requirement is unenforced**:
  ADR-0311 D2 retired the `check:web-experience` rung, and ADR-0336 (2026-08-09) re-wired only its
  static-closure third as `check:web-experience-closure` — the marker contract still answers only on
  a direct invocation of the intact judge — open call 9, closed to that narrower scope.)*

## The felt thesis — design intent, deliberately NOT UAT legs (ADR-0348 D6)

This story's whole point is a FEELING, and until 2026-08-11 five story UAT legs carried it. **ADR-0348
D6 deleted all five**: a user EXPERIENCE property is not a user ACCEPTANCE criterion, and blocking this
story's crown on a verdict nobody was going to sit down and render priced a standing owner conversation
as a gate. **Deleting the criterion deletes the obligation to verify, never the claim** — so the five
intents are stated here, in the story's own prose, as what the experience is SUPPOSED to be. They are
answered by the owner walking the live site, not by a gate, and the honest cost is that nothing now
records whether anyone has looked. Each names the machine leg that pins its mechanics underneath, and
none of those legs may ever pretend to carry the felt claim.

1. **The overwhelm is FELT** *(was leg 3; mechanics at machine leg 1).* The storm must actually
   OVERWHELM without any further visitor input; the CRT surface must read RETRO rather than merely
   styled; and each terminal's chatter must read PLAUSIBLE-BUT-OPAQUE — activity a real vibe coder
   could not answer. This is Act 1's whole reason to exist.
2. **The exit's destination is ADEQUATE** *(was leg 5; the exits' behaviour at machine leg 4).* The calm
   fallback view must read as a REAL calm view — a coherent destination a reduced-motion visitor is glad
   to have landed on — rather than dumping the visitor on a degraded page. This is exactly the ADEQUACY
   claim [`experience-rollout-guardrails`](experience-rollout-guardrails.md) declines ("presence, not
   adequacy") and homes at story level, so this paragraph is now its only statement anywhere.
3. **The exhale is FELT** *(was leg 7; the in-place transform at machine leg 6).* The terminals falling
   silent and collapsing, their fragments dropping into the ground as soil, and the calm land fading up
   must be perceived as ONE continuous transformation IN PLACE rather than a cut — and the audio must
   RESOLVE to quiet rather than being chopped off. The load hides BEHIND the exhale; that the bytes
   waited for the click is leg 6's separate, machine claim.
4. **Act 2 READS as Act 1's request answered** *(was leg 9; the walk's mechanics at machine leg 8).*
   Act 2 must read as Act 1's request ANSWERED, shown through the real product's own UI; the
   mock-website proposal must read HONEST and not overwhelm; the language must be plain newcomer-dev
   language with no weird analogies or jargon (`plain-language-first`, ADR-0157); and the Act 1 CONTRAST
   must land. Leg 8 proves the one-tap pacing that makes the contrast POSSIBLE and can never say it
   landed.
5. **A NON-EXPERT reads the layout as the dependency it is** *(was leg 11; the edge data and spatial
   arrangement at machine leg 10).* The layout must read as *"my website DEPENDS ON these; they are the
   foundation it rests on; it reads the catalog straight from the database and goes through the backend
   for checkout"* — the direction right way round to a READER, not merely right in the data. The
   dependency LAYERS must read as storytree's ADVANTAGE (you SEE them, in order, nothing hidden — the
   POSITIVE teach that replaced beat 4's wrong-way flag), and the complexity must feel SCAFFOLDED,
   never dumped up front and never hidden.

**Scope — story tier only.** ADR-0348 D6 does not touch the five ADR-0070 stage-2 `operator-attested`
appearance nodes at the CAPABILITY tier (the storm, the inflection, the two Act 2 increments, the page
triage). Those are a different mechanism with a different purpose, and whether the owner's
"doesn't have to exist in a gate" extends to them is an open fork ADR-0348 deliberately left unanswered
— a session finding an appearance verdict blocking a capability's green should put it to the owner, not
extend D6 by analogy.

## Structural calls (recorded, not re-litigated)

**1 — A sibling story, not an expansion of `website`.** The existing
[`stories/website`](../website/story.md) node is a brownfield `mapped` wiring story whose consumer is
the SYSTEM: its journey is "the public front door can never silently drift from the render core,"
proven by observe-and-sign drift gates (ADR-0085). This story's consumer is a VISITOR and its
journey is the felt chaos→calm arc — a distinct real consumer population, a separate rebuild brief,
and a proof (greenfield UAT + operator attestation) that shares no precondition or observable with
the wiring node's gates. Both splitting-rule triggers fire, so one story would be two journeys
stapled together. The experience is *additive — a front-door over the existing consuming surface*
(ADR-0134 Consequences), so it CONSUMES the wiring node's delivered mechanism rather than absorbing
it: `depends_on: [website]`, a story-graph edge with the `studio-cloud → studio` precedent
(ADR-0100 v1). The `website` surface stays a package-level sink — nothing imports a surface — and
this story is the new story-level sink above it.

**2 — The R3F mapper's package home (the ADR-0123 delegated call): parent-side, a NEW workspace
package `packages/forest-world-r3f`, owned by this story.** The deciding constraint is provability:
the web repo is not a pnpm workspace member, so the parent prove-it-gate cannot run red→green inside
it — a web-repo-side mapper would make the whole 3D surface unprovable. A parent-side package is
spine-provable (`node build --real`), and the site consumes it as a SYNCED ARTIFACT riding the same
sync + drift-gate mechanism as the core (ADR-0093 §3, extended by `web-experience-sync`). It is NOT
homed *inside* `packages/forest-world`: the core is a foundational root whose design floor is
node-free, React-free, dependency-free (ADR-0075 minimality; the studio bundles it), and an R3F
mapper needs `three` / `@react-three/fiber` / `@react-three/drei` / `react` — a sibling package
keeps the core pure and the GPU dep surface isolated. It is owned HERE, not by `forest-world`,
because mappers live with their consumer (the studio React mapper lives in `apps/studio`; the
string-SVG mapper lives web-side) — the core stays "one core, many mappers." Naming: the mapper
layer is framework-bound by design (that is strategy C's whole point), so naming it for the
framework IS naming it for its role. On landing, `repo-manifest.json packageOwnership.organisms`
gains `forest-world-r3f → website-experience` and `check:boundaries` starts scanning its one edge.

**3 — The provability firewall decides every proof mode.** Parent-side = machine-provable, armed
`--real`; web-repo-side = operator-attested (ADR-0070), never force-fitted. Four capabilities are
parent-side LEAFs (the world→3D mapping, the sync extension, the beat director, the rollout check);
four are web-side (the storm, the inflection, the Act 2 walkthrough, the page triage) whose honest
proof is a human witnessing the live/preview site. The split follows the routing filter ("does this
piece have an isolatable red→green test?"), not package boundaries: everything with a deterministic
oracle was pulled parent-side so the spine can hold it, and what remains web-side is exactly the
felt surface a machine cannot judge. Structure/choreography is parent-side and provable; WORDS and
fictional demo data stay site-side (the Cohoot precedent — the boundary keeps the site's content in
the site's repo).

## Capabilities (9)

Listed roots-first. **Class** — LEAF (parent-side isolatable red→green, armed `--real` so the
orchestrator drives it through `node build <id> --real --store pg`), LOOK (web-repo build whose
appearance + feel are operator-attested per ADR-0070; the `frontend-builder` role drives it, the
owner witnesses it), or CONTENT (owner-attested editorial judgement).

| # | capability | class | outcome (short) | `--real` | depends on |
|---|---|---|---|---|---|
| 1 | [`r3f-world-spike`](r3f-world-spike.md) | LEAF | `packages/forest-world-r3f` is born: a real forest-world `World` + scene-graph maps to typed 3D instance descriptors, rendered in an R3F canvas with drei `MapControls` in a dev harness. | yes | — |
| 2 | [`experience-rollout-guardrails`](experience-rollout-guardrails.md) | LEAF | A parent-side judge (check:web-grounding pattern) reds when the experience entry lacks the skip affordance or the reduced-motion/no-WebGL fallback, or when Act 1 statically reaches R3F. **Its `check:web-experience` rung was retired by ADR-0311 D2; ADR-0336 re-wired only the static-closure third as the new `check:web-experience-closure` gate rung — the two marker-presence assertions stay unwired (open call 9, closed to that scope).** | yes | — |
| 3 | [`web-experience-sync`](web-experience-sync.md) | LEAF | The sync + drift-gate mechanism generalises to carry the R3F mapper package (`.tsx`-aware, `@storytree/forest-world` imports rewritten to the synced sibling core) into the site under the same `@generated` discipline. | yes | `r3f-world-spike` |
| 4 | [`act2-beat-director`](act2-beat-director.md) | LEAF | A pure, deterministic, visitor-paced beat director in `forest-world-r3f`: the ONE continuous arc as typed data (the website walk then the UPSTREAM dependency-layer reveal), advancing one tap at a time; a multi-story world where each story carries a `dependsOn` edge set + tri-state status; green appears only with a signed-proof marker (preserved verbatim); the wrong-way road is retired as the teach (ADR-0150). | yes | `r3f-world-spike` |
| 5 | [`act1-terminal-storm`](act1-terminal-storm.md) | LOOK | One visitor prompt (now **"build me a shopping website"**, reused across both acts) breeds the diegetic terminal storm to the ~10–12 peak — CRT look, canvas grain, gesture-unlocked audio, HUD, unanswerable demands; no WebGL. | (look) | `experience-rollout-guardrails` |
| 6 | [`storm-to-forest-inflection`](storm-to-forest-inflection.md) | LOOK | At peak, the diegetic finale terminal's transform option (web `281b1e6`); one click transforms — silence, collapse into soil — resolving into the 2.5D calm land (ADR-0148: the R3F landing island retires). | (look) | `act1-terminal-storm`, `web-experience-sync` |
| 7 | [`act2-guided-walkthrough`](act2-guided-walkthrough.md) | LOOK | **Increment G (ADR-0148; reshaped by ADR-0153) — the website-first walk:** the reused prompt opens it, the orchestrator proposes a MOCK website (no backend) in a scripted exchange, and the visitor-paced 2.5D walk (ADR-0145; anchored callouts) grows THAT one website story green to a CTA that CONTINUES into "what's next." ADR-0153: REAL app UI + progressive disclosure, NO escape hatches, step 1 an outcome brief with an example via the orchestrator CHAT AT THE BOTTOM, step 2 routing to the DRIVE MACHINERY (temporary overlays). | (look) | `storm-to-forest-inflection`, `act2-beat-director`, `web-experience-sync` |
| 8 | [`act2-guided-forest`](act2-guided-forest.md) | LOOK | **Increment H (ADR-0150; re-specced by ADR-0153 after H was REFUSED) — the ONE continuous walk grows UPSTREAM:** the visitor keeps walking the same arc (not a separate phase) as the orchestrator guides them into a PROPOSED backend + database the website `dependsOn` (`website→backend→database`, dependent→prerequisite — ADR-0058; the refused build had it BACKWARDS, corrected by ADR-0153; frontend HIGH / foundation BELOW) — the dependency LAYERS shown on the real map ARE the advantage (replacing beat 4's wrong-way flag); REAL app UI, no escape hatches, the deeper drive-machinery diagrams; each inspectable (what/why), walked green progressively, complexity scaffolded. | (look) | `act2-guided-walkthrough` |
| 9 | [`info-pages-triage`](info-pages-triage.md) | CONTENT | Every legacy info page has an explicit executed disposition — folded into Act 2, discarded, or kept static — with no orphan links and the grounding wire still green; the outcome decides Keystatic's survival. | (content) | `act2-guided-walkthrough`, `act2-guided-forest` |

## Dependency graph and the incremental rollout plan

The `depends_on` ordering IS the build order (topological), and it is deliberately also a
LIVE-COHERENCE plan — the site publishes on every merge, so each increment must leave a real visitor
whole (owner decision 6):

- **Increment A — `r3f-world-spike`** (parent-only; the live site is untouched). The natural first
  provable unit: real `World` data in 3D under `MapControls`, spine-proven.
- **Increment B — `experience-rollout-guardrails`** (parent gate + inert site markers; the check
  SKIPs until an experience entry exists, then fails closed). Lands BEFORE any visitor-facing
  experience so the storm can never ship as a toll booth.
- **Increment C — `web-experience-sync`** (the site gains the synced R3F artifact, inert until
  mounted; the web repo gains the public npm deps).
- **Increment D — `act1-terminal-storm`** — THE HOME FLIP: `index.astro` becomes the storm, with the
  skip control and the static-calm fallback live from the same merge. Until the inflection lands,
  the storm's calm affordance and the skip both resolve to the fallback's static calm view + the
  existing pages — coherent, just not yet transformative. *(The flip moment itself — "presentable" —
  was the owner-attestation HALT: **cleared 2026-07-02**, attested + live at web main `3e53f14`.)*
- **Increment E — `storm-to-forest-inflection`** — the transform replaces the interim landing; the
  calm land carries the CTA/links until the walkthrough lands. *(The transform-lands HALT:
  **cleared 2026-07-02**, attested + live at web main `6546486` — see the cap's proof status for
  the record.)*
- **Increment F — `act2-beat-director`** (parent-only) — the choreography engine; **BUILT +
  leaf-proven** (run `real-mr32b6ib`, signed PASS @ `2358bc4`). The beats become provable data before
  any site build walks them.
- **Increment G — `act2-guided-walkthrough`, the WEBSITE-FIRST WALK (ADR-0148).** The reused prompt
  ("build me a shopping website") opens Act 2; the orchestrator proposes a MOCK local website (no
  backend) in a short scripted exchange; the visitor-paced five-beat 2.5D walk (ADR-0145; anchored
  callouts) grows THAT one website story green to a CTA that hands off to "what's next." The
  walkthrough may land beats incrementally (the director is data-driven), each merge leaving a
  complete-so-far arc that opens from the prompt+proposal and ends on the "what's next" CTA. This is
  the **ship-now** increment. *(History: the first build — over the R3F island — was refused at its
  2026-07-03 attestation gate and re-decided onto the real 2.5D map, ADR-0145; the 2.5D build then
  reached its gate 2026-07-03, was judged good progress, and was re-directed to this website-first
  framing, ADR-0148. Web draft PR #20 closed superseded, its machine floor recorded there.)* **BUILT +
  OWNER-ATTESTED + LIVE (2026-07-04, web main `ff70222b`) — the walkthrough HALT is CLEARED.** The
  owner walked the cohesive tutorial live and directed it to land (storytree-web PR #22, merged, CD
  green); a late owner-priority addition made the top-left "show me a better way" skip jump straight
  into the tutorial too (not the static page). Two follow-ups the owner named were deferred to increment
  H: reframe beat 4's wrong-way flag as the dependency-layer-advantage, and integrate "grow the
  backend" into the ONE continuous tutorial (not a separate CTA). *(RE-OPENED by ADR-0153, 2026-07-04:
  refining H at its gate, the owner reshaped G's SURFACE — REAL app UI + progressive disclosure, NO
  escape hatches [including removing the top-left capable-visitor skip; a11y fallback only], step 1 an
  outcome brief with an example via the orchestrator CHAT AT THE BOTTOM, step 2 routing to the DRIVE
  MACHINERY via a temporary overlay. This reverts the cap toward `building` for the reshaped surface;
  the "As built"/attested record is kept as true history. See the cap's proof status.)*
- **Increment H — `act2-guided-forest`, the ONE CONTINUOUS WALK grows UPSTREAM (ADR-0150,
  owner-directed at the G gate 2026-07-04; RE-SPECCED by ADR-0153 after H was REFUSED at its own gate
  2026-07-04).** The visitor KEEPS WALKING the same arc (not a separate CTA-gated phase — "it shouldnt
  be separate") as the orchestrator guides them into the DEPENDENCY STACK the website rests on — a
  PROPOSED backend + database the website `dependsOn`, on real `dependsOn` edges pointing FROM the
  dependent TO its prerequisite (`website.dependsOn=[backend]`, `backend.dependsOn=[database]`;
  ADR-0058 / `cross-story-dependency`; stories at every DAG level, not just leaves). *(The refused first
  build encoded this BACKWARDS — `backend dependsOn website`; ADR-0153 corrects it to the library rule.)*
  Rendered with the FRONTEND HIGH and the foundation BELOW (owner spatial preference, a free render
  choice). The DEPENDENCY LAYERS shown on the real map ARE the advantage the walk teaches — you SEE the
  layers, build them in order, nothing hidden — the POSITIVE teach that replaces increment G's beat-4
  wrong-way-flag antipattern. The experience uses the REAL app's UI + progressive disclosure + NO escape
  hatches, and the deeper drive-machinery diagrams (CI/CD, devops, gates, wiring) live here (ADR-0153).
  Each upstream story is inspectable (what/why) and walked green progressively; complexity scaffolded,
  revealed as the walk continues, never dumped. This is the **extend-next** increment — it lands AFTER G
  ships, continuing the same Act 2 walk. G's "what's next" CTA is the CONTINUATION SEAM. (ADR-0150 AMENDS
  the earlier ADR-0148 framing of H as a CTA-gated separate phase; ADR-0153 corrects the dependency
  DIRECTION and adds the real-UI / no-escape / drive-machinery redirections. The `act2-beat-director`
  engine was re-specced to a multi-story-with-`dependsOn` upstream vocabulary in the CORRECTED direction
  first, then the site build.) **BUILT + machine-green + OWNER-ATTESTED AS A STEP FORWARD + LIVE
  (2026-07-05, web main `8f4e166c`, live at https://crisp-globe-bf6v.here.now/) — the increment-H HALT is
  CLEARED.** The owner walked the guided upstream forest at the ADR-0070 stage-2 gate and directed it to
  land as an incremental step (storytree-web PR #25 → web main `8f4e166c`, CD green; parent verdict
  `deb235e` for the corrected-direction director grow, `web/` pin bumped `ff70222b` → `8f4e166c`
  @ `ff70222b`). The attestation carried FORWARD FEEDBACK the owner wants in the NEXT arc link, now
  SETTLED as **ADR-0157**
  (born accepted, owner-directed at the H#2 gate 2026-07-05): **BaaS — the frontend reads the DATABASE
  DIRECTLY** (a direct `website → database` read edge added in the SAME corrected direction, giving the
  diamond `website.dependsOn=[backend, database]`; confirms ADR-0153's open 3-tier-vs-BaaS authoring
  call); **retire the "storm" metaphor from ALL surfaces** (Act 1's built experience stands; only its
  naming retires); **plainer newcomer-dev language, no weird analogies/jargon** (`plain-language-first`);
  the **agent-loop teach as an HONEST TDD LOOP DIAGRAM** (a loop, not a list — write a failing test → the
  SYSTEM checks it fails → write code → the SYSTEM checks it passes → repeat; the referee is storytree's
  spine, NOT the AI grading its own homework); the **pre-walk reads as OUR orchestrator + the first story
  node lands `proposed`**; and **make the wisp MOVE** (it renders as a static dot today). ADR-0157
  re-specs the LEAF (`act2-beat-director` — the `add-upstream-story` delta widened so the database is a
  prerequisite of both the website and the backend) and the two LOOK caps (G + H) toward `building` for
  the reshaped surface. So H's LOOK cap is NOT terminally closed; its attested "step forward" record
  stands as true history (copy-on-write). **The ADR-0157 BUILD LANDED + is LIVE + OWNER-ATTESTED AS A
  STEP FORWARD (2026-07-05, web main `d761eadc`, live at https://crisp-globe-bf6v.here.now/) — the
  increment-H (BaaS) HALT is CLEARED.** The BaaS diamond render, the honest TDD loop diagram
  (system-as-referee), the moving wisp, the plain-language / storm-metaphor-free copy, and the
  our-orchestrator / first-node-`proposed` pre-walk are all live (storytree-web PR #26, both CD runs
  green; parent `web/` pin bumped `8f4e166c` → `d761eadc`); the `act2-beat-director` LEAF widening is
  BUILT + leaf-proven (verdict `f9ae9b8`, run `real-mr6ycu73`, the diamond delta at
  `packages/forest-world-r3f/src/act2-director.ts:145`). The owner attested it as a STEP FORWARD
  (verbatim: *"This is also a step forward, so land it"*) and simultaneously directed a substantial
  FOLLOW-ON REDESIGN (an orchestrator-led, diagram-first walkthrough; the wisp on an orbit; a
  zoom-to-studio reveal; an ADR → library-artifact flow; industry framing) — so the LOOK caps stay
  `building`/`proposed` for that reshaped surface, NOT terminally closed. That redesign is now SETTLED
  as **ADR-0165**
  (born accepted — the owner walked the interactive design proposal on 2026-07-05 and approved it AS
  PRESENTED: *"This looks many steps forward, please chip a fresh session to land this."*): after Act
  1's transform the visitor STAYS with the orchestrator while it explains the whole system on ONE
  left-to-right diagram GROWING above the chat (Phase D, D0–D6), every advance a bounded reply chip IN
  the chat (the separate Next button retires); the diagram then compacts to a persistent docked
  mini-map as the landed island walk plays (the wisp now ORBITS; the corner drive-machinery overlays
  RETIRE — absorbed into the diagram + mini-map); the upstream reveal keeps TWO beats; and a NEW Phase
  Z zooms out to the real studio view (legend → forest → details panel → honest done). G is re-specced
  to own the opening + island-walk share, H the two-beat depth + the Phase-Z finale; web-repo-only, the
  `act2-beat-director` engine and its default script UNTOUCHED (no re-proof). The arc's LAST increment
  remains `info-pages-triage` (increment I), which lands after the Act 2 surface the redesign settles
  is fixed enough to fold pages into.
- **Increment I — `info-pages-triage`** — the surrounding pages fold in, retire, or stay; the
  Keystatic call falls out of the disposition set. It lands after H because the fold targets (e.g. the
  roadmap's "what's coming" behind the pull-back / "what's next") are only concrete once both Act 2
  increments exist. **EXECUTED + OWNER-ATTESTED + LIVE (2026-07-06, web main `be960873`) — the arc's
  LAST increment; the triage HALT is CLEARED.** The owner signed the per-page disposition set at the
  gate and attested the executed result the same session (storytree-web PR #28, CD green): KEEP static
  `how-it-works` (+ the ADR-0165 §8 terms section + the mock-data jargon scrub) / `get-involved` /
  `contact` / `constitution` / the 404; DISCARD `/roadmap/` + `/landscape/` with redirect stubs
  (substance salvaged to `docs/research/retired-web-*-2026-07.md`); Keystatic RETIRED (the hosted
  editor decommissioned; ADR-0101 superseded) — recorded as
  ADR-0167
  (open call 4 CLOSED); see [`info-pages-triage`](info-pages-triage.md)'s proof status + As-built for
  the record.

Within-story edges, with the reason each exists: `web-experience-sync → r3f-world-spike` (you cannot
sync a package that does not exist); `act2-beat-director → r3f-world-spike` (the director lives in
and drives the mapper's package); `act1-terminal-storm → experience-rollout-guardrails` (the storm
may only face visitors with the exits machine-guarded); `storm-to-forest-inflection →
act1-terminal-storm` (there is no peak to transform without the storm), `→ web-experience-sync` (the
R3F island it lazy-loads must be on the site); `act2-guided-walkthrough →` all three of the
inflection (the land it grows on), the director (the script it walks), the sync (the artifact rail);
`act2-guided-forest → act2-guided-walkthrough` (increment H opens from G's "what's next" CTA and
extends G's scripted-orchestrator seam + proven 2.5D substrate — no upstream forest to reveal until
the website walk it grows from exists); `info-pages-triage →` both `act2-guided-walkthrough` (you
cannot fold a page into an Act 2 that is not there) and `act2-guided-forest` (the roadmap-class fold
targets live in the "what's next" upstream reveal).

## The boundary, held

The experience preserves the ADR-0056 / ADR-0066 / ADR-0093 line end-to-end: the site consumes
parent-built ARTIFACTS (the synced core + the synced R3F mapper + the director), never private
source or live data. All on-site data is FICTIONAL (the Cohoot precedent): the storm's terminal
chatter, the Act 2 demo stories, the beat narration copy are site-side content — the chatter and
beats are *derived from* the evidence base
([vibe-coding-gripes-2026.md](../../docs/research/vibe-coding-gripes-2026.md)) but dramatize it
rather than cite it; any surviving page copy that ASSERTS a claim keeps its `data-grounds`
attribute under the existing `check:web-grounding` wire. Act 2 is a teaching diorama, not the
studio: nothing on the site reads the live store, and the CTA points at the real product.

## UAT Test Criteria

The integrated acceptance walkthrough proving the whole journey end-to-end on the REAL published
site (or its preview build). Minimal-first (`uat-proves-the-goal-not-the-surface`): one coherent
visitor arc plus the two machine gates; the list grows only when a real defect earns a permanent
case. Witnesses marked per leg (ADR-0040 / ADR-0070 / ADR-0209 §1).

> **Per-leg witness — RE-ADJUDICATED 2026-07-25** under the ADR-0209 §8 corpus-wide migration. The
> governing rule is `human-witness-is-a-judgment-gap-not-cost`: the human rung is for a success
> condition that has **no compiler**, and a success that is machine-observable but merely live,
> EXPENSIVE, CROSS-REPO, or NOT-YET-HARNESSED is `machine`. Re-adjudicating leg by leg resolved this
> story to eight `machine` legs and five `human` legs (thirteen, up from eight — see the splits below).
> Only `machine` and `human` exist as classified kinds here; there is no third rung to reach for.
>
> **NARROWED 2026-08-11 (ADR-0348 D6): all FIVE felt legs are DELETED, so the story now carries eight
> `machine` legs and ZERO `human` legs.** ADR-0348 names this story as the clearest case in the whole
> pass, because these five are where a design intent was stated NOWHERE ELSE ("the overwhelm is FELT",
> "the exhale is FELT"). The question that now comes FIRST is *is this an acceptance claim at all?* —
> and an experience property is not: it asks whether the surface is any GOOD, where acceptance asks
> whether the journey achieved the goal it was built for. The old single question ("does it have a
> compiler?") let these through precisely BECAUSE they correctly had none. **Deleting the criterion
> deletes the CLAIM, not just the obligation — so all five are carried in full in "The felt thesis"
> above**, as design intent answered by the owner walking the live site. The accepted cost, stated
> rather than hidden: that channel is undated and unowned, so a surface nobody has looked at is now
> indistinguishable from one that was looked at and approved — do not later misread the absence as
> approval. Ordinals are BURNED, not renumbered — positions 3, 5, 7, 9 and 11 are simply absent, so
> every surviving leg keeps the number it has always had and no signed verdict or `(proof-gate:)`
> binding is silently re-pointed.
>
> **This was the most FUSED criterion set in the corpus — every human leg welded a FELT verdict onto a
> pile of hard structural claims. Each was SPLIT rather than laundered**, which is the honest source of
> the drainage: the leg count GREW, and every felt verdict stood as its own human leg instead of being
> shaved into a footnote on a machine one. The felt column then left the story tier entirely:
>
> | old leg | machine half | felt half (deleted 2026-08-11, ADR-0348 D6) |
> | --- | --- | --- |
> | 1 (one prompt breeds the storm) | 1 — the choreography: audio unlocked on the gesture, diegetic spawn to the ~10–12 peak, every terminal parked on a demand, `AGENTS: n ▲` rising, zero further visitor input | ~~3 — the overwhelm is FELT; the CRT surface reads retro; the chatter reads plausible-but-OPAQUE~~ → felt thesis 1 |
> | 3 (the exits actually work) | 4 — the exit RESOLVES to the calm view and the reduced-motion / no-WebGL / no-JS visitor is never played the storm | ~~5 — the ADEQUACY of that destination: it reads as a real calm view, not a degraded page~~ → felt thesis 2 |
> | 4 (one tap transforms) | 6 — a TRANSFORM IN PLACE: no navigation, no document load, no URL change; the deferred Act 2 bundle first fetched AT the click | ~~7 — the exhale: silence, collapse, fragments into soil, the land fading up as ONE continuous transformation; audio resolving rather than cutting~~ → felt thesis 3 |
> | 5 (the same request done right, increment G) | 8 — the walk's mechanics: the chat surface AT THE BOTTOM, progressive disclosure, ONE tap per beat, the beat sequence, green only on a signed-proof marker, NO skip / NO escape to a static page, NO wrong-way-road teach, the arc ending on a continuing CTA | ~~9 — it READS as Act 1's request answered; the proposal is honest and does not overwhelm; the plain language lands; the Act 1 CONTRAST lands~~ → felt thesis 4 |
> | 6 (the walk grows upstream, increment H) | 10 — the same session continues with no page change; the BaaS diamond's `dependsOn` DIRECTION and shape; frontend HIGH / foundation BELOW; each upstream story inspectable and progressively green; NO antipattern flag | ~~11 — a NON-EXPERT reads the layout as "my website DEPENDS ON these"; the layers read as storytree's ADVANTAGE; the complexity feels SCAFFOLDED, never dumped~~ → felt thesis 5 |
>
> Legs **4** (old 3) and **13** (old 8) moved wholesale `human` → `machine`: nothing in "the exit
> resolves to the calm view", "the a11y visitor never sits through the storm", "no orphan links", or
> "every legacy page's live state matches the signed disposition set" turns on judgment — each is a
> crawl or a byte-level observable. They were tagged `human` only because the parent gate cannot reach
> the site's RUNTIME, which is precisely the mis-tag the rule above forbids. Old leg 3 also carried a
> hidden APPEARANCE claim that lived in no leg at all — `experience-rollout-guardrails` declines the
> adequacy of the exits ("presence, not adequacy") and homes it at story level; the 2026-07-25 pass gave
> it leg 5, explicitly human, rather than leaving it an unwitnessed aside in a capability's prose.
> ADR-0348 D6 has since deleted that leg, so the claim is stated as felt thesis 2 above — still written
> down, no longer a gate.
>
> **The harness expected to judge the machine legs lives in ANOTHER REPO.** Six of the eight machine
> legs (1, 4, 6, 8, 10, 13) are site-BEHAVIOUR claims whose harness is the `storytree-web` repo's OWN
> headless Playwright suite — which already exists and has already exercised most of these very
> observables (23/23 on the storm incl. the audio unlock, the 12-window peak under `AGENTS: 12 ▲`, the
> demands, the skip and the reduced-motion view; 10/10 on the inflection's lazy-load wall — zero island
> bytes pre-click, chunks first fetched at the click; 61 → 41 → 34 → 3/3 across the Act 2 walks incl.
> the 16-tap flow, the director-beat mapping, the absence of the Next button and the corner overlays,
> and no-JS / reduced-motion never fetching the walk; see each LOOK cap's proof record). Only legs 2
> and 12 are discharged parent-side — leg 12 by `check:web-engine`, a live gate rung, and leg 2 (its
> static-closure half only) by the new `check:web-experience-closure` gate rung ADR-0336 wired after
> ADR-0311 D2 retired `check:web-experience`; leg 2's MARKER-presence half stays undischarged by any
> machine (open call 9, closed to that narrower scope). The web repo is
> not a pnpm workspace member, so the parent prove-it-gate cannot run red→green inside it (Structural
> call 3's provability firewall) — **how a web-repo machine verdict reaches the parent proof spine is an
> OPEN modeling call (item 6), which this re-adjudication surfaces rather than settles.** The witness
> KIND is still `machine`: a cross-repo harness is a cost, not a judgment gap.
>
> **NO leg stays `human`.** Five did after 2026-07-25 — the overwhelm (3), the exit destination's
> adequacy (5), the exhale (7), Act 2 reading as Act 1's request answered (9), and a non-expert's
> reading of the dependency layout (11) — and every one was a FELT verdict, which is this story's entire
> point. ADR-0348 D6 deleted all five on 2026-08-11: having no compiler was never enough to make them
> ACCEPTANCE criteria. ADR-0209's rule is unweakened and still governs anything that DOES stay human —
> look, feel and lived experience are never machine-asserted nor model-judged, and an agent may STAGE
> such a thing but never renders the verdict (ADR-0070 stage 2). The story-level `uat_witness` stays
> absent → human (the ADR-0040 fail-closed signpost), so the machine-driven whole-story UAT node stays
> WITHHELD; the crown now derives from the per-leg roll-up alone.
>
> **Nothing here is green.** Per ADR-0209 §6 a re-adjudicated leg returns to UNSTAMPED and earns green
> only under its newly-declared witness. The machine legs below are **declared, not proven** — no spec
> discharges legs 1, 4, 6 or 13 today, and legs 8 and 10 are only PARTIALLY discharged (the ADR-0294
> D2/D4 block below names exactly which halves [`act2-beat-director`](act2-beat-director.md)'s suite
> reaches and which it never touches). *(This read "no spec discharges legs 1, 4, 6, 8, 10 or 13
> today", which overstated the gap for 8 and 10 — that suite was already leaf-proven when the sentence
> was written. Corrected in place 2026-08-20 per ADR-0139; the 2026-07-25 re-adjudication itself is
> unchanged.)* The prior owner attestations recorded against the OLD
> fused legs stand as true history (copy-on-write) but discharge nothing here; and the owner signs
> nothing as a result of this re-adjudication. Legs 1, 6, 8, 10 and 13 carry seed-canonical
> `uat-criterion` detail artifacts (ADR-0209 §5, under the owner's 2026-07-25 narrower bar: a detail
> ONLY where the one-line title is too thin to judge against, never one per leg) because their
> observables, thresholds and cross-repo boundaries cannot survive compression to a sentence.
>
> **ADR-0294 D2/D4 pass, 2026-08-20 — NOTHING is deleted, and all EIGHT machine legs are declared
> UNBOUND.** This is the third and final slice of the D4 pass over live stories (predecessors: PR
> #1444, the desktop terminal cluster; PR #1448, the studio/claim cluster). D2 deletes a criterion only
> when its proof already exists ONE RUNG DOWN — a capability or contract in THIS corpus whose real test
> asserts the same claim, checked against that test's ACTUAL assertions rather than its file existence
> — and no leg here meets that condition. The eight fall into three groups, for three different
> reasons:
>
> - **Legs 1, 4, 6 and 13 — no machine proof at any tier here.** Their owning capabilities
>   ([`act1-terminal-storm`](act1-terminal-storm.md),
>   [`storm-to-forest-inflection`](storm-to-forest-inflection.md) and
>   [`info-pages-triage`](info-pages-triage.md)) are `proof_mode: operator-attested` and register NO
>   `proof.real.testFile` at all, so there is no lower-tier test to name — D2's two-part test disposes
>   of them before a leg is read. Leg 4's own capability,
>   [`experience-rollout-guardrails`](experience-rollout-guardrails.md), DOES have a suite but
>   deliberately declines this claim in its own words ("presence, not adequacy"). The owner
>   attestations and the web repo's Playwright runs recorded on those caps are not a discharge either,
>   which `## Proof` below already states in so many words: *"PRECEDENT that these observables are
>   reachable — not a discharge of these legs."*
> - **Legs 8 and 10 — PARTIAL duplicates, therefore KEPT.**
>   [`act2-beat-director`](act2-beat-director.md)'s suite
>   (`packages/forest-world-r3f/src/act2-director.test.ts`) genuinely proves the pure-director half of
>   each, and each leg's clause below names which assertions reach it; what that suite never reaches is
>   the SITE half. A partial duplicate is not a duplicate (ADR-0294 D2) — five of
>   `wisp-as-story-claim`'s seven were kept for the same reason in PR #1448.
> - **Legs 2 and 12 — a BINDING gap, not a proof gap.** Both name a live gate rung
>   (`check:web-experience-closure`, `check:web-engine`) that runs in `pnpm gate` and in CI on every
>   merge over the real `web/` tree, so both claims ARE machine-enforced today. But a gate RUNG is not
>   a lower TIER: the capabilities behind those rungs prove the JUDGES over fixture trees, which is a
>   different proposition from THIS site or THIS tree being clean — so neither leg is a D2 duplicate
>   and neither is deleted. What they lack is a `(proof-gate:)`: this story declares no
>   `## Reliability Gates` section at all, so `resolveWitness` refuses both and they cannot go green
>   however often the rung runs.
>
> **What would bind legs 2 and 12 — recorded here rather than acted on.** Two `observe` reliability
> gates on this story whose proof commands are `pnpm check:web-experience-closure` and
> `pnpm check:web-engine`, with each leg carrying the matching
> `(proof-gate: website-experience#gate-n)`. This pass deliberately did NOT mint them, for three
> stated reasons. ADR-0294 end state point 4 mints only where a real PERSISTED artifact exists to
> witness, and a rung's pass is a CI exit code, not an artifact. Authoring a story's FIRST
> reliability-gate floor sets its own-proof obligations (ADR-0083 / ADR-0085 crown semantics), which is
> story-shape scope rather than leg dissolution. And operationally both commands declare a SKIP
> (`GATE_SKIP_EXIT_CODE`) on a checkout without the `web/` submodule, so the observation could only be
> taken on a submodule-carrying checkout — a real constraint a later author should not have to discover
> at the gate. The other six legs are NOT in this position: nothing they could run persists an artifact
> an `observe` gate could read, and answering them with a freshly minted check is the rubber stamp
> ADR-0097 §2 forbids and ADR-0294's end state point 4 names.
>
> **No ordinal moved, and the ledger is untouched.** The burned positions stay burned (3, 5, 7, 9 and
> 11, deleted 2026-08-11 by ADR-0348 D6); no surviving ordinal collides with a `superseded` key for
> this story in `stories/uat-legacy-dispositions.json` (checked — the collision PR #1174 made on
> `studio-cloud` and PR #1448 repaired); and because nothing was deleted, all eight of this story's
> live keys stay `unresolved`, which is the honest record for a leg that earns no proof credit.
> Verified on the live store before the pass: all eight read `proven=–`, so no signed verdict was at
> risk either way.

1. **One prompt breeds the storm — the choreography.** _(witness: machine)(detail: website-experience#uat-1)_ Load the live experience _(criterion-id: uatc_68cd01077dad6f1b0140fa41)_ _(revision-id: uatr1:2c1c0565a7159cf4)_ _(previous-revision-id: uatr1:486812d3699f08e1)_
   entry, assert the opening surface, send ONE prompt, then drive NOTHING further. **Success —** ONE
   terminal at rest, offering suggested chips and a prompt line leading with **"build me a shopping
   website"** (the prompt reused across both acts, ADR-0148); audio unlocks on that gesture (silent
   before it, an audio context running only after it); sub-agents then spawn AS new terminals (diegetic
   — the visitor never opens a window), tiling/overlapping to the ~10–12 peak (the seeded plan's hard
   cap); every terminal streams activity and parks on an unanswerable demand; the HUD reads
   `AGENTS: n ▲` rising to that peak; and NOT ONE further visitor input is required between the send and
   the peak.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`, and no lower-tier node
   proves it: [`act1-terminal-storm`](act1-terminal-storm.md) is `operator-attested` and registers no
   `proof.real.testFile`, so there is no test to name. Its four owner-attested capability legs
   (HuaMick, 2026-07-02, web main `3e53f14`) witnessed most of these observables — but a HUMAN
   attestation of a surface that has since been REWORKED (the finale, web main `281b1e6`) is not a
   machine discharge of a machine leg, and `## Proof` below already declines the web repo's 23/23
   Playwright run as precedent rather than a discharge. `resolveWitness` refuses it
   (`coverage: "refused"`); no gate is minted to host it (ADR-0097 §2). What binds it is a real
   instrument: a `storytree-web` behaviour spec PLUS a route by which its verdict reaches this spine
   (open call 6), or ADR-0295 D1's model-driven executor.
2. **Act 1 ships no WebGL bytes — the static-import-closure wall.** _(witness: machine)_ `pnpm _(criterion-id: uatc_e77db3011f6e5364be4fc12a)_ _(revision-id: uatr1:70df0d02a0e06069)_
   check:web-experience-closure` at a clean HEAD with the `web/` submodule checked out. _(previous-revision-id: uatr1:38bb65e56c09a92f)_
   **Success —** green: no module reachable from the Act 1 entry statically imports the R3F island /
   `three` / `@react-three/*` — Act 1 ships no WebGL bytes. *(NARROWED by ADR-0336, 2026-08-09. This
   leg named `pnpm check:web-experience` — which also asserted the `data-experience-skip` /
   `data-experience-fallback` marker contract — until ADR-0311 D2 retired that rung on 2026-08-05.
   ADR-0336 re-wires only this static-closure property as the new `check:web-experience-closure` gate
   rung, so THIS leg is machine-verified on every merge again. The marker-presence properties are
   DELIBERATELY left out of this leg's scope: they remain unguarded by any machine today — a known,
   accepted gap (ADR-0336 D2) — though `experience-rollout-guardrails`'s intact judge can still
   assert them on a direct invocation.)*
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20), and this one is a BINDING gap rather than a
   proof gap.** The named command is a live gate rung: `check:web-experience-closure` runs in
   `pnpm gate` and in CI on every merge (`.github/workflows/ci.yml`) over the real `web/` tree, so the
   claim IS machine-enforced today. But a gate RUNG is not a lower TIER — the capability
   [`experience-rollout-guardrails`](experience-rollout-guardrails.md)'s contract
   `erg-act1-static-closure-is-webgl-free` (`packages/cli/src/web-experience-check.test.ts:353`)
   proves the JUDGE over fixture trees: a static chain from the entry to `three` reds naming the leak,
   the same target behind a dynamic `import()` is green. That the judge is CORRECT is a different
   proposition from THIS SITE being clean, so the leg is not a D2 duplicate and is not deleted. It
   carries no `(proof-gate:)`, so `resolveWitness` refuses it (`coverage: "refused"`) and it cannot go
   green however often the rung runs. No gate is minted here — see the pass block above for what would
   bind it and why this pass declined to.
4. **The exits actually work.** _(witness: machine)_ From a mid-storm moment take whatever exit the _(criterion-id: uatc_1e7f30dc9fb4d5fe0f1ba144)_ _(revision-id: uatr1:f0fa8aafd2bf8785)_ _(previous-revision-id: uatr1:11f25eddad8521a2)_
   current decided surface offers; separately, load the entry with `prefers-reduced-motion`, again with
   WebGL unavailable, and again with JS off. **Success —** the exit RESOLVES to the calm view, and the
   reduced-motion / no-WebGL / no-JS visitor gets that calm view directly and is NEVER played the storm
   — the storm is a choice, not a toll booth. The observable is runtime BEHAVIOUR: a spec that asserts
   the `data-experience-skip` / `data-experience-fallback` markers are PRESENT merely re-runs leg 2 and
   is a FALSE pass here (`experience-rollout-guardrails` guards presence; this leg guards that the exit
   actually goes somewhere, and that the storm never starts for the a11y visitor). *(Scope note — open
   call 7: ADR-0153 removed the capable-visitor skip, leaving the a11y fallback as the floor, so the
   spec's first half cannot be written until the owner settles whether a skip CONTROL survives on the
   current surface.)*
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`, and nothing proves it one
   rung down: [`experience-rollout-guardrails`](experience-rollout-guardrails.md) is the only
   capability here with a suite that touches this territory and it declines this exact claim in its own
   words ("presence, not adequacy"), while the leg itself already rules the marker assertion out as a
   FALSE pass. Half the spec cannot even be WRITTEN until open call 7 settles whether a skip control
   survives. So `resolveWitness` refuses it (`coverage: "refused"`), and no gate is minted (ADR-0097
   §2) — a gate over the marker check would sign precisely the thing this leg says is not its claim.
6. **One tap transforms — IN PLACE.** _(witness: machine)(detail: website-experience#uat-6)_ At peak overload, click the single calm _(criterion-id: uatc_bcce19e9d65b441a1a74d61b)_ _(revision-id: uatr1:21cbf3a8f3b144be)_ _(previous-revision-id: uatr1:5cbb389789e07a35)_
   storytree affordance once, instrumented. **Success —** exactly ONE such affordance is present at
   peak and one click discharges it; the document is NEVER navigated — no URL change, no unload/load,
   the same DOM session carries through, so the change is a TRANSFORM and not a page swap — and the
   deferred Act 2 bundle is first fetched AT that click, with zero bytes of it requested during Act 1
   (the runtime companion to leg 2's static-import wall). *(Scope note — open call 8: the historical
   observable was the R3F island's chunks; ADR-0148 retired that island, so WHICH deferred module the
   inflection lazy-loads on the current 2.5D surface is a build-time call the spec must name.)*
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`.
   [`storm-to-forest-inflection`](storm-to-forest-inflection.md) is `operator-attested` and registers
   no `proof.real.testFile`, so there is no lower-tier test to name; the web repo's 10/10 lazy-load
   wall run is precedent, not a discharge; and open call 8 leaves the leg's central observable — WHICH
   deferred module the current 2.5D inflection loads — unnamed, so even the instrument is not yet
   specifiable. `resolveWitness` refuses it (`coverage: "refused"`); no gate is minted (ADR-0097 §2).
8. **The same request, done right — the website-first walk's MECHANICS (increment G).** _(criterion-id: uatc_bbcbc39b8e8010cd76bdd490)_ _(revision-id: uatr1:2a595f6cbdc94e1d)_ _(previous-revision-id: uatr1:c9e571594348cccb)_
   _(witness: machine)(detail: website-experience#uat-8)_ Reshaped by ADR-0153, then ADR-0165. From the calm land carrying the SAME
   "build me a shopping website" request, advance the whole walk to its end, one advance at a time.
   **Success —** the session orchestrator's chat surface is the REAL app's, AT THE BOTTOM, and it
   presents the story as an OUTCOME BRIEF WITH AN EXAMPLE and proposes a MOCK local website (no
   backend); the walk then
   advances ONE tap per beat and never more (no beat demands a second input) through the decided beat
   sequence — routed to the drive machinery → the story branches → the machinery deepens (CI/CD, devops,
   gates, wiring) → the pull-back to one legible forest (green = proven, sapling = in-progress, withered
   = broken) — with limbs turning green ONLY where a signed-passing-proof marker is present; elements
   not yet walked stay HIDDEN (progressive disclosure); there is NO "skip the intro" and NO reachable
   escape to a static/deprecated page (a11y fallback only); there is NO wrong-way-road "antipattern
   flagged" teach anywhere (retired per ADR-0150 §4 — the dependency-layer-as-advantage is increment
   H's, machine leg 10 and felt thesis 5); and the arc ENDS on a CTA that CONTINUES into "what's next" rather than
   terminating.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20), and it is a PARTIAL duplicate that is therefore
   KEPT.** The pure-director half IS proven one rung down by
   [`act2-beat-director`](act2-beat-director.md) at
   `packages/forest-world-r3f/src/act2-director.test.ts` —
   `abd-advance-is-visitor-paced-and-deterministic` ("beatIndex increments by exactly 1 (visitor tap =
   one beat)", two walks deep-equal, past-done parks), `abd-green-only-on-signed-proof` (every green
   limb carries a non-empty `signedProof`; a green-without-marker delta is refused by `advance()` at
   runtime AND by `BeatScript.safeParse`), and `abd-default-script-is-the-one-continuous-arc` (the six
   delta kinds in order, `add-roads` asserted absent so the wrong-way-road teach is retired, the walk
   ending `done: true` on the pull-back CTA). Checked against those tests' ACTUAL assertions, not their
   file existence. What that suite never reaches is everything this leg says about the SITE: the real
   app's chat surface AT THE BOTTOM, the outcome-brief-with-an-example proposal of a mock local
   website, progressive disclosure (un-walked elements stay HIDDEN), and the absence of a "skip the
   intro" or any reachable escape to a static page. A partial duplicate is not a duplicate (ADR-0294
   D2), so the leg stands; `resolveWitness` refuses it (`coverage: "refused"`), and no gate is minted
   (ADR-0097 §2) — binding it to the director suite would sign exactly the half the leg does not turn
   on.
10. **The ONE continuous walk grows upstream — the BaaS dependency layers, MECHANICALLY.** _(criterion-id: uatc_3a7e33e63e173c566f9dd1e5)_ _(revision-id: uatr1:a8da833f2f6de82a)_ _(previous-revision-id: uatr1:c10c803cfc5b4aa8)_
    _(witness: machine)(detail: website-experience#uat-10)_ Increment H (ADR-0150; re-specced by ADR-0153 then ADR-0157). From the mock
    website's completion, keep advancing, instrumented. **Success —** the SAME session continues — no
    navigation to a new page, no separate CTA-gated phase ("it shouldnt be separate") — still on the
    REAL app's UI;
    a PROPOSED backend and database appear on real `dependsOn` edges in the BaaS DIAMOND, pointing FROM
    the dependent TO its prerequisite: `website.dependsOn=[backend, database]` and
    `backend.dependsOn=[database]` (ADR-0058 / `cross-story-dependency`; the frontend reads the database
    directly as a real shopping app does — ADR-0157), the DIRECTION asserted against the rendered edge
    DATA and not inferred from a picture, because the first build encoded it BACKWARDS and was REFUSED
    for exactly that (ADR-0153 corrects it — a defect-driven regression case that must never recur); the
    render places the FRONTEND HIGH and the foundation BELOW with the database the shared foundation
    (owner spatial preference), stories at every DAG level and not just leaves; each upstream story is
    INSPECTABLE (its what AND its why-proposed both present) and is walked green progressively on demand,
    green again only on a signed-proof marker; not-yet-walked complexity stays HIDDEN and is revealed as
    the walk continues; and NO antipattern flag is presented as the teach.
    **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20), and it is a PARTIAL duplicate that is therefore
    KEPT.** The dependency-DATA half — the defect-driven regression case this leg says must never recur
    — IS proven one rung down by [`act2-beat-director`](act2-beat-director.md) at
    `packages/forest-world-r3f/src/act2-director.test.ts`,
    `abd-upstream-stories-carry-dependsOn-and-honest-status`: it walks the REAL default script through
    the REAL `advance()` and asserts the BaaS diamond against the rendered edge DATA —
    `website.dependsOn=[backend, database]`, `backend.dependsOn=[database]`, `database.dependsOn=[]` —
    plus the honest tri-state mix at the pull-back (the website resolves `proven`, both upstream layers
    stay `building`, so the legend is backed by real statuses). Checked against that test's ACTUAL
    assertions, not its file existence. What it never reaches is the rest of the leg: the SAME session
    continuing with no navigation, the REAL app's UI, the render placing the frontend HIGH and the
    foundation BELOW, each upstream story being INSPECTABLE (its what AND its why-proposed), and
    complexity staying HIDDEN until the walk reveals it. A partial duplicate is not a duplicate
    (ADR-0294 D2), so the leg stands; `resolveWitness` refuses it (`coverage: "refused"`), and no gate
    is minted (ADR-0097 §2).
12. **The artifact edge is live.** _(witness: machine)_ `pnpm check:web-engine` (extended) at a clean _(criterion-id: uatc_0b3f09d58d2eb85f3a7dabc8)_ _(revision-id: uatr1:e1c18145b6a3bf04)_ _(previous-revision-id: uatr1:bd510a05369840d6)_
    HEAD. **Success —** green: the site's synced copies of the render core AND the R3F mapper are
    byte-fresh from their parent packages (`@generated`, no drift, no stale leftovers) — the 3D look
    flows from the parent, never hand-ported.
    **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20), and this one is a BINDING gap rather than a
    proof gap.** `check:web-engine` has run continuously in `pnpm gate` and in CI
    (`.github/workflows/ci.yml`) over the real `web/` tree, so the claim IS machine-enforced on every
    merge. But a gate RUNG is not a lower TIER — [`web-experience-sync`](web-experience-sync.md)'s four
    contracts prove the drift JUDGE over fixtures at `packages/cli/src/web-engine-sync.test.ts`
    (`wes-drift-covers-both-dirs`, `wes-core-import-rewrites-to-sibling`,
    `wes-second-package-plans-beside-the-core`, `wes-tsx-is-engine-source`, all four verified present
    in that file by name). That the judge is CORRECT is a different proposition from THIS tree being
    byte-fresh, so the leg is not a D2 duplicate and is not deleted. It carries no `(proof-gate:)`, so
    `resolveWitness` refuses it (`coverage: "refused"`) and it cannot go green however often the rung
    runs. No gate is minted here — see the pass block above for what would bind it and why this pass
    declined to.
13. **The surrounding pages' disposition is EXECUTED.** _(witness: machine)(detail: website-experience#uat-13)_ Crawl the built site over _(criterion-id: uatc_2f671b7b270d364f3a2a3744)_ _(revision-id: uatr1:23c4ad98d5329b35)_ _(previous-revision-id: uatr1:695a0eb83aced0ed)_
    every legacy page (how-it-works, roadmap, landscape, constitution, contact, get-involved, the 404).
    **Success —** every page's live state matches the SIGNED ADR-0167 disposition set exactly — the KEEP
    set reachable as plain static pages that mount no experience engine, the DISCARD set (`/roadmap/`,
    `/landscape/`) resolving through their redirect stubs; NO orphan links anywhere in the crawl (every
    internal href resolves, and no surviving page is unreachable from the site graph); and
    `check:web-grounding` green over every surviving claim. The editorial JUDGMENT of which page gets
    which disposition was the owner's and is already SIGNED (ADR-0167 / open call 4); this leg verifies
    only that the EXECUTION matches it.
    **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`.
    [`info-pages-triage`](info-pages-triage.md) is `operator-attested` and registers no
    `proof.real.testFile`, so there is no lower-tier test to name. ONE clause — `check:web-grounding`
    green over the surviving claims — is carried by a standing gate rung, but the crawl this leg
    actually specifies is not: no machine here asserts that every page's live state matches the signed
    ADR-0167 disposition set, that both DISCARD stubs resolve through their redirects, or that zero
    orphan hrefs remain in the site graph. That partial coverage is what KEEPS the leg rather than
    deleting it (ADR-0294 D2). `resolveWitness` refuses it (`coverage: "refused"`); no gate is minted
    (ADR-0097 §2) — a gate over `check:web-grounding` alone would sign one clause of six.

## Proof

**Honest status — `proposed` (whole story not yet green).** The story `healthy` is earned through the
gate, never authored (ADR-0020). SOME legs have real history: `act2-beat-director` (LEAF) is
leaf-proven at the grown, DIRECTION-CORRECTED vocabulary (run `real-mr6bktin`, `--store pg`, PASS;
verdict `deb235e`; coverage 4/4; the `@storytree/forest-world-r3f` suite 16/16 green) — its earlier
single-story build (run `real-mr32b6ib`, @ `2358bc4`) stands as history; increment G
(`act2-guided-walkthrough`) was BUILT + owner-ATTESTED + LIVE (web main `ff70222b`) — RE-OPENED toward
`building` by ADR-0153's surface reshape (the attested history kept intact, copy-on-write); increment H
(`act2-guided-forest`) had a first build REFUSED, was re-specced by ADR-0153, and its re-build was BUILT
+ machine-green + OWNER-ATTESTED AS A STEP FORWARD + LIVE (2026-07-05, web main `8f4e166c`) — landed as
an incremental step whose forward feedback is now SETTLED as ADR-0157 (BaaS direct-read, storm-metaphor
retired, plain language, honest TDD loop diagram, moving wisp, proposed-node/our-orchestrator pre-walk),
which re-opens the LEAF (`act2-beat-director` — the `add-upstream-story` delta widened for the BaaS
diamond) and the two LOOK caps (G + H) toward `building` for the reshaped surface; the H#2 attested "step
forward" record stays true history (copy-on-write). The 2026-07-05 owner-approved redesign (ADR-0165)
then re-opens the two LOOK caps AGAIN for the redesigned opening/finale — this time the LEAF is
UNTOUCHED (the island beats reuse the landed default script verbatim; web-repo-only, no parent
re-proof).

**The 2026-07-25 witness re-adjudication (ADR-0209 §8) reset the leg ledger, not the history.** Per
ADR-0209 §6 every UAT leg returned to UNSTAMPED: the reclassified legs are not green, they are newly
eligible to BE proven, and the prior owner attestations recorded against the OLD fused legs stand as
true history (copy-on-write) while discharging none of the thirteen legs above. So the story stays
`proposed` because of that unstamped leg set plus the LOOK surfaces the ADR-0165 redesign re-opened —
NOT because an increment is unbuilt (increment I is EXECUTED and owner-attested; see its record above).
The four LEAF caps are armed with `--real` proof config so the orchestrator
drives each through `node build <id> --real --store pg` in dependency order — with the one documented
pre-step that `r3f-world-spike`'s package scaffold (package.json + deps + tsconfig + `repo-manifest.json`
ownership) is orchestrator-supplemented GLUE before its leaf runs (a leaf can never touch package.json,
ADR-0031 §2). The five web-side caps (the storm, the inflection, the two Act 2 increments G + H, and the
page triage) are built in the `storytree-web` repo (branching off ITS `origin/main`, its own CD) by the
`frontend-builder` role. Their FELT legs (3, 5, 7, 9, 11) were witnessed by the owner as explicit HALT
points for the driving session until ADR-0348 D6 DELETED all five on 2026-08-11 — the intents survive as
"The felt thesis" above, and the owner answers them by walking the live site rather than at a halt.
*(That removes five story-tier halts and nothing else: the five web-side caps keep their own ADR-0070
stage-2 `operator-attested` appearance nodes, which D6 explicitly does not touch, so a driving session
still stops for the CAPABILITY verdict — appearance and feel are never self-signed.)* The
site-BEHAVIOUR legs (1, 4, 6, 8, 10, 13) are `machine`, discharged by specs in that same web repo's own
Playwright suite.

**Those six specs are a WEB-REPO build obligation, not a claim of existing coverage.** The tag declares
the witness kind that is RIGHT for the leg (ADR-0209 §1); the specs that discharge them are NOT yet
written, and the web repo's prior Playwright runs recorded on the LOOK caps (23/23, 10/10, 61/41/34/3-of-3)
are PRECEDENT that these observables are reachable — not a discharge of these legs. Because the web repo
is not a workspace member, the parent prove-it-gate cannot sign those runs today; the route by which a
web-repo machine verdict reaches the proof spine is open call 6.

The story goes green only when the two parent-side legs (2, 12) are BOUND to a declared `observe`
reliability gate and observed green at a clean HEAD, AND the six
site-behaviour legs are green through a route the proof spine can honour. *(This read "run green at a
clean HEAD", which named a path that cannot execute: this story declares no `## Reliability Gates`
section at all, so neither leg carries a `(proof-gate:)` and `resolveWitness` refuses both — running
the rung green greens nothing. The ADR-0294 D2/D4 pass of 2026-08-20 established that, and deliberately
left the binding un-minted rather than authoring a story's first gate floor inside a leg-dissolution
pass; the pass block in `## UAT Test Criteria` records exactly what would bind them. Corrected in place
per ADR-0139.)* There is no longer a
story-tier attestation in that condition: ADR-0348 D6 deleted all five human legs, so the crown turns
entirely on machine verdicts. Where an attestation IS still owed — the capability tier's ADR-0070
stage-2 nodes — it is recorded, never presumed (ADR-0044).

**A note on leg 2's route, added 2026-08-07, updated 2026-08-09 (ADR-0336).** Both legs are gate rungs
again, but leg 2 is narrower than it was. `check:web-engine` (leg 12) has run continuously in
`pnpm gate` and in CI throughout. Leg 2's `check:web-experience` was retired by ADR-0311 D2 on
2026-08-05; its judge — intact, still leaf-proven, still directly runnable — answered only on demand
for a month. ADR-0336 (2026-08-09) re-wired ONLY its static-import-closure property as the new
`check:web-experience-closure` gate rung — leg 2's OBSERVABLE narrowed to just that property (the
criterion text above now says so), and it is machine-verified on every merge again. The
skip-affordance / reduced-motion-fallback MARKER properties the old rung also asserted were
deliberately left out of the re-wiring and remain "true when last checked" at best — the intact judge
still answers them on a direct invocation, but no gate rung runs it. Re-wiring the marker half would
need its own ADR-0311 D5 justification.

## Open modeling calls (for the owner)

Surfaced rather than guessed — none blocks the first increments:

1. **The returning-visitor story** (ADR-0134 names it required) — **CLOSED (owner, 2026-07-02, at
   the increment-D attestation gate): a return visit REPLAYS the storm, as built.** The seeded plan
   makes every replay identical (`STORM_SEED`, `web/src/scripts/storm-script.ts:16`), and the skip
   is deliberately NOT remembered (no localStorage) — the persistent skip control stays the floor
   on every visit. Zero code change.
2. **Act 2 replay / deep-link UX** (deferred by ADR-0134 §5) — **CLOSED (owner, 2026-07-03, at the
   walkthrough's attestation gate,
   ADR-0145):
   replay-only is FINAL — the experience replays every visit and Act 2 gets NO standalone
   deep-link.** The persistent skip control (call 1) stays the floor; no anchor URL is owed.
3. **The asset / perf / mobile budget and LOD strategy** (ADR-0123 flags it as required before real
   visitors; rollout makes visitors real EARLY). The fallback path is the authored floor for weak
   devices; a formal budget (bundle size, texture compression, frame floor) is an owner call —
   candidate future reliability gate on this story once numbers exist.
4. **Keystatic / CMS survival** — **CLOSED (owner, 2026-07-06, at the info-pages-triage disposition
   gate, ADR-0167):
   Keystatic RETIRES.** Every surviving page is low-churn reference edited as plain files; the
   hosted editor (Cloud Run `storytree-web-editor`, ADR-0101 — superseded) was decommissioned with
   owner approval at the same gate. The signed per-page disposition set (discard `/roadmap/` +
   `/landscape/` with redirects, keep the rest) is recorded in the same ADR; see
   [`info-pages-triage`](info-pages-triage.md)'s proof status for the attestation record.
5. **The home-flip moment** ("as soon as presentable", increment D) is an owner attestation by
   definition — the driving session HALTs and asks rather than deciding presentability itself.
   **DONE (owner-attested 2026-07-02):** the storm was attested presentable (the
   [`act1-terminal-storm`](act1-terminal-storm.md) cap's own UAT legs 1–4, audio included — not the
   story legs above, which the 2026-07-25 re-adjudication renumbered) and flipped live — storytree-web
   PR #18 → web main `3e53f14`, the live front door since; see that cap's proof status for the record.

6. **How a WEB-REPO machine verdict reaches the parent proof spine** — raised by the 2026-07-25
   re-adjudication (ADR-0209 §8), and the biggest thing it surfaced. Six of the eight machine legs
   (1, 4, 6, 8, 10, 13) are site-BEHAVIOUR claims whose only honest harness is the `storytree-web`
   repo's own headless Playwright suite. Classifying them `machine` is right — a cross-repo harness is
   a COST, not a judgment gap (`human-witness-is-a-judgment-gap-not-cost`) — but it collides with
   Structural call 3's provability firewall: the web repo is not a pnpm workspace member, so the parent
   prove-it-gate cannot run red→green inside it. **The spec work for those six legs is therefore a WEB
   REPO build obligation, and the CARRY is unresolved.** Candidate shapes, none chosen here: a
   published web-CD Playwright verdict SYNCED into the parent (the `check:web-engine` artifact-flow
   precedent); a parent-driven Playwright run against the PINNED preview build (which keeps the assertion
   parent-side and spine-signable, at the cost of standing up the site in the parent's gate); or a third
   parent-side check in the `check:web-experience` family — noting that ADR-0311 D2 has since retired
   that family's only member, which is call 9 and arguably the same decision. Owner/build-time call —
   until it is settled, these six legs are honestly `machine` and honestly unproven.
7. **Does a capable-visitor SKIP control still exist?** Leg 4 asserts an exit resolves to the calm view,
   but ADR-0153's redirection 2 removed the skip as a capable-visitor escape, leaving only the
   no-JS / `prefers-reduced-motion` a11y fallback — and the rollout narrowing above already
   flags, unresolved, whether the rollout judge keeps asserting a DISTINCT skip-affordance marker or
   folds it into the fallback marker. *(That narrowing said "gate-required"; ADR-0311 D2 has since
   retired the `check:web-experience` rung — see call 9, which changes who enforces the answer but
   not the question.)* Leg 4's first half cannot be specced until that is settled; its
   a11y half (the reduced-motion / no-WebGL / no-JS visitor is never played the storm) is unaffected and
   is the load-bearing floor either way. Owner/build-time call on that LEAF cap's contract.
8. **Which deferred module is the inflection's lazy-load observable, post-ADR-0148?** The old fused leg
   asserted "the R3F bundle loads only now," and the inflection's 2026-07-02 attestation witnessed exactly
   that (10/10 Playwright, zero R3F pre-click). ADR-0148 then retired the R3F landing island — the whole
   post-storm experience is 2.5D SVG/DOM with zero WebGL — so there may be no R3F bundle left to observe.
   Machine leg 6's claim is stated generically (the deferred Act 2 bundle is first fetched AT the click);
   its spec must NAME the current target on the live surface. A build-time call, not a re-spec of the
   claim; recorded rather than guessed.
9. **Should the `check:web-experience` rung be re-wired, and if not, what carries owner decision 6?**
   Raised 2026-08-07 by the stale-claim sweep that corrected this story's prose. **CLOSED, NARROWLY
   (owner, 2026-08-09, ADR-0336,
   Option D): re-wire ONLY the static-import-closure property as a NEW, narrower gate rung
   (`check:web-experience-closure`); the marker-presence properties stay retired.** Investigating
   option (b) below — the candidate that would have accepted the loss on the strength of the web
   repo's own Playwright coverage — found its premise FALSE: no merged, live `storytree-web` coverage
   of the `data-experience-skip` / `data-experience-fallback` markers exists; only unmerged local WIP
   on branch `codex/website-experience-uat-specs-rescue` covers them, and it says nothing about the
   closure property. That killed (b) as originally framed and left (a) too broad (re-wiring the whole
   retired rung, markers included, on a cross-repo dependency the owner did not want to lean on right
   now). The decided shape takes the narrow half of (a) the closure property alone needed no such
   dependency: it is pure, offline, and a direct machine expression of the ADR-0216 no-WebGL-in-Act-1
   constraint. See ADR-0336 for the full reasoning and the accepted gap it leaves (the two marker
   properties remain unguarded by any machine). (c) — folding this into open call 6's answer — was not
   taken; the two remain separate decisions.
   *(Original framing, kept as history.)* The consequence THIS closed: **owner decision 6 (2026-07-02)
   — "the skip affordance and the no-WebGL / `prefers-reduced-motion` fallback are FIRST-CLASS from
   the FIRST increment" — was a machine-guarded property and had become an unguarded one.** The
   no-WebGL half of that consequence is machine-guarded again; the skip/fallback-marker half is not,
   and stays call 9's un-re-opened remainder should a future session want it.
   (a) **Re-wire as it was** — cheapest, and the retirement's own premise (D5: the implementations
   stay so re-wiring is cheap) anticipates it; but ADR-0311 retired it on measured grounds, and
   re-adding it without a production catch re-litigates that decision rather than answering it.
   (b) **Accept the loss and say so** — the rung stays retired, and the markers are carried by this
   spec plus the web repo's own Playwright suite. **Investigated and found FALSE** — see above.
   (c) **Fold it into the open call 6 answer** — those six site-behaviour legs need a route by which
   a web-repo machine verdict reaches the parent spine; leg 2's judge is parent-side and needs the
   opposite, a trigger. One decision could settle both, and this is the option that treats them as
   one problem rather than two. Not taken here.
