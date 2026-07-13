---
id: "website-experience"
tier: story
title: "The two-act vibe-coding experience — the public site's front door enacts chaos → calm"
outcome: "A visitor on the public site FEELS the thesis instead of reading it: one prompt into a retro terminal breeds an illegible agent storm, one calm tap collapses the noise into soil, and the same single gesture then grows a legible, proof-bearing forest beat by beat to the CTA — with the skip and reduced-motion/no-WebGL exits first-class from the first live increment."
status: proposed
proof_mode: UAT
# MIXED WITNESS, no blanket `uat_witness:` override (the ADR-0040 fail-closed default is human):
# the felt surfaces (the storm's overwhelm, the inflection's transform, Act 2's plain-language calm,
# the info-page dispositions) are ADR-0070 operator-attested human-witness legs — an agent cannot
# judge a feel and can NEVER self-attest one. The machine legs are the parent-side gates: the
# extended web-engine drift gate (the synced R3F artifact is byte-fresh) and the new
# `check:web-experience` rollout guard (skip + fallback markers present, no R3F reachable from
# Act 1) — each an honest spine-observable check. Each Story-UAT leg below marks its own witness.
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
# Deciding ADRs (ADR-0037 §2): the experience concept + the per-act tech split and the owner
# decisions of 2026-07-02 that unpacked it (134); the renderer — R3F + drei as the THIRD
# forest-world mapper, client-only island, mandatory fallback, package home delegated to this
# story (123); the shared render core + the sync-into-submodule artifact flow the mapper joins (93);
# the 2026-07-03 re-decision at the walkthrough's attestation gate — Act 2 walks the real 2.5D map,
# the R3F island scoped to the inflection's landing moment, replay-only final (145); the SECOND
# 2026-07-03 re-decision at that same gate — Act 2 is the vibe coder's request handled the storytree
# way: a website-first walk (increment G) that grows into an orchestrator-guided upstream forest
# (increment H), ship-G-now/extend-H-next (148); the 2026-07-04 re-decision at the G gate — Act 2 is
# ONE continuous walk that grows UPSTREAM, the dependency layer is the advantage (150); the 2026-07-04
# re-decision at the H gate, where H was REFUSED — Act 2 uses the REAL app's UI with progressive
# disclosure, no escape hatches, step 1 an outcome brief with an example via the orchestrator chat at
# the bottom, step 2 routing to the drive machinery (temporary overlays), and the dependency DIRECTION
# corrected to the library rule (website→backend→database, dependent→prerequisite) (153); the 2026-07-05
# re-decision at the H BUILD #2 gate, where H#2 was attested "as a step forward" + landed live — BaaS
# (the frontend reads the database DIRECTLY: website.dependsOn=[backend, database], a diamond; confirms
# 153's open 3-tier-vs-BaaS call), the "storm" metaphor retired from all surfaces, plain newcomer-dev
# language, the agent-loop teach as an HONEST TDD LOOP DIAGRAM (system-as-referee), the pre-walk reads as
# OUR orchestrator + the first story node lands proposed, and the wisp MOVES (157); the 2026-07-05
# owner-approved Act-2 opening redesign, approved AS PRESENTED — one growing system diagram (Phase D)
# advanced through the orchestrator chat (the separate Next button retires), a persistent docked
# mini-map replacing the corner drive-machinery overlays, an orbiting wisp, TWO upstream beats, and a
# Phase-Z zoom-out to the real studio; web-repo-only, the director untouched (165); the signed
# info-page disposition set + the Keystatic retirement — the triage's own sign-off record (167).
decisions: [93, 123, 134, 145, 148, 150, 153, 157, 165, 167]
---

# The two-act vibe-coding experience — the public site's front door enacts chaos → calm

**Outcome —** A visitor on the public site FEELS the thesis instead of reading it: one prompt into a
retro terminal breeds an illegible agent storm, one calm tap collapses the noise into soil, and the
same single gesture then grows a legible, proof-bearing forest beat by beat to the CTA — with the
skip and reduced-motion/no-WebGL exits first-class from the first live increment.

This is [ADR-0134](../../docs/decisions/0134-public-website-as-a-two-act-vibe-coding-experience-terminal.md)'s
experience concept made buildable, on the guiding idea the ADR fixes: **one calm gesture per act —
same input, opposite outcome.** In Act 1 the visitor's single tap (send a prompt) breeds chaos; in
Act 2 the visitor's single tap (advance) grows order. The evidence base for what the storm screams
and what the forest answers is
[docs/research/vibe-coding-gripes-2026.md](../../docs/research/vibe-coding-gripes-2026.md) — its
five-row beat table is the ORIGIN of the Act 2 spine, carried into `act2-beat-director` and
`act2-guided-walkthrough` (increment G, live). ADR-0150 (2026-07-04) then reframes beat 4 — the
wrong-way road retired as the teach, replaced by the dependency-layer-as-advantage — and extends the
spine UPSTREAM (the backend + database beats of increment H), so the shipped arc grows past the
original five rows rather than reproducing them verbatim.

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
  `experience-rollout-guardrails`'s `check:web-experience` should keep asserting a distinct "skip
  affordance marker" or fold it into the a11y-fallback marker is a change to that LEAF cap's contract,
  outside this Act-2 re-spec's scope; the owner tunes it. Until then the guardrail still requires both
  markers, and the Act-2 build simply stops offering the skip as a capable-visitor escape — the marker
  can remain present on the a11y path.)*

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
| 2 | [`experience-rollout-guardrails`](experience-rollout-guardrails.md) | LEAF | `check:web-experience` (parent-side, check:web-grounding pattern) fails the gate when the experience entry lacks the skip affordance or the reduced-motion/no-WebGL fallback, or when Act 1 statically reaches R3F. | yes | — |
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
  SETTLED as **[ADR-0157](../../docs/decisions/0157-act-2-reads-the-database-directly-and-teaches-plainly-retire.md)**
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
  as **[ADR-0165](../../docs/decisions/0165-act-2-redesign-one-growing-system-diagram-advanced-through-t.md)**
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
  [ADR-0167](../../docs/decisions/0167-info-page-triage-the-signed-disposition-set-and-the-keystati.md)
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

## Story UAT

The integrated acceptance walkthrough proving the whole journey end-to-end on the REAL published
site (or its preview build). Minimal-first (`uat-proves-the-goal-not-the-surface`): one coherent
visitor arc plus the two machine gates; the list grows only when a real defect earns a permanent
case. Witnesses marked per leg (ADR-0040 / ADR-0070) — the felt legs are human, the gates machine.

1. **One prompt breeds the storm.** _(witness: human)_ Land on the live home: a single retro CRT
   terminal, already logged into a coding agent, offers suggested chips and a prompt line leading
   with **"build me a shopping website"** (the prompt reused across both acts, ADR-0148). Send ONE
   prompt. **Success —** audio unlocks on that gesture; the agent "thinks," then sub-agents spawn AS
   new terminals (diegetic — the visitor never opens a window), tiling/overlapping toward a peak of
   ~10–12; each terminal streams plausible-but-opaque activity and parks on an unanswerable demand;
   the HUD reads `AGENTS: n ▲` rising; the overwhelm is felt without any further visitor input.
2. **The calm exits are machine-guarded.** _(witness: machine)_ `pnpm check:web-experience` at a
   clean HEAD. **Success —** green: the skip affordance marker and the reduced-motion / no-WebGL
   fallback marker are present on the experience entry, and no module reachable from the Act 1
   entry statically imports the R3F island / `three` — Act 1 ships no WebGL bytes.
3. **The exits actually work.** _(witness: human)_ From any storm moment, use the persistent skip
   control; separately, revisit with `prefers-reduced-motion` (or WebGL disabled). **Success —**
   the skip lands directly in the calm world; the reduced-motion / no-WebGL visitor gets the static
   calm view and is NEVER made to sit through the storm — the storm is a choice, not a toll booth.
4. **One tap transforms.** _(witness: human)_ At peak overload, the dimming and the single calm
   storytree affordance appear amid the noise. Click once. **Success —** the terminals fall silent
   and collapse, their fragments drop into the ground as soil, the calm empty land fades up — a
   TRANSFORM in place, not a navigation; the R3F bundle loads only now, behind the exhale.
5. **The same request, done right — the website-first walk (increment G; reshaped by ADR-0153).**
   _(witness: human)_ On the calm land carrying the SAME "build me a shopping website" request, the
   session orchestrator — in the REAL app's chat surface AT THE BOTTOM — presents the story as an
   OUTCOME BRIEF WITH AN EXAMPLE and proposes a MOCK local website (no backend — honest, meeting the
   vibe coder where they are); then advance the walk one Next-tap per beat, in plain language, on the
   REAL app's UI (elements not yet walked through stay hidden — progressive disclosure): the orchestrator
   ROUTES the story to the drive machinery (a temporary top-left overlay of the agent loop) → the story
   branches (limbs turn green ONLY on a signed passing proof) → the drive machinery deepens (CI/CD,
   devops, gates, wiring — overlay diagrams, scaffolded, not overloading) → pull back (one legible
   forest: green = proven, sapling = in-progress, withered = broken). **Success —** Act 2 reads as Act 1's
   request answered, shown through the real product's own UI; the proposal is honest and does not
   overwhelm; there is NO "skip the intro" and no escape to a static/deprecated page (a11y fallback only);
   the arc ends on a CTA that CONTINUES into "what's next"; at no beat does the visitor work harder than
   one tap — the Act 1 contrast lands. (There is NO wrong-way-road "antipattern flagged" teach — retired
   per ADR-0150 §4; the dependency-layer-as-advantage is increment H's, leg 6.)
6. **The ONE continuous walk grows upstream — the BaaS dependency layers are the advantage (increment H,
   ADR-0150; re-specced by ADR-0153 then ADR-0157).** _(witness: human)_ From the mock website's
   completion, keep walking. **Success —** the SAME walk continues (no jump to a new page or separate
   phase — "it shouldnt be separate"), shown through the REAL app's UI: the orchestrator guides the
   visitor into the DEPENDENCY STACK the website rests on — a PROPOSED backend + database (because the
   mock's Cart / Payments / Receipts cannot truly work without them, and the catalog is read straight
   from the database), shown as proposed trees on real `dependsOn` edges pointing FROM the dependent TO
   its prerequisite in the BaaS DIAMOND — the website `dependsOn` the backend AND the database directly,
   the backend `dependsOn` the database (`website.dependsOn=[backend, database]`,
   `backend.dependsOn=[database]`; ADR-0058 / `cross-story-dependency`; the frontend reads the database
   directly as a real shopping app does — ADR-0157), rendered with the FRONTEND HIGH and the foundation
   BELOW (owner spatial preference), the database the shared foundation, stories at every DAG level (not
   just leaves). A non-expert reads the layout as "my website DEPENDS ON these; they are the foundation
   it rests on; it reads the catalog straight from the database and goes through the backend for
   checkout," with the direction right way round (NOT the website being what the backend depends on — the
   refused build had it backwards; ADR-0153 corrects it). The dependency LAYERS shown on the real map
   read as storytree's ADVANTAGE — you SEE them, in order, nothing hidden — the POSITIVE teach that
   replaces beat 4's wrong-way flag; there is NO antipattern flag presented as the teach. Each upstream
   story is inspectable (what it is + why proposed) and walked green progressively on demand; complexity
   is revealed as the walk continues, never dumped up front and never hidden.
7. **The artifact edge is live.** _(witness: machine)_ `pnpm check:web-engine` (extended) at a clean
   HEAD. **Success —** green: the site's synced copies of the render core AND the R3F mapper are
   byte-fresh from their parent packages (`@generated`, no drift, no stale leftovers) — the 3D look
   flows from the parent, never hand-ported.
8. **The surrounding pages are dispositioned.** _(witness: human)_ Walk the legacy pages
   (how-it-works, roadmap, landscape, constitution, contact, get-involved). **Success —** each is
   explicitly folded into Act 2, discarded, or kept as a reachable plain static page; no orphan
   links; `check:web-grounding` still green over every surviving claim.

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
re-proof). The story stays `proposed` because increment I
(`info-pages-triage`) is unbuilt and the story's machine gates + human UAT legs are not all closed yet. The four LEAF caps are armed with `--real` proof config so the orchestrator
drives each through `node build <id> --real --store pg` in dependency order — with the one documented
pre-step that `r3f-world-spike`'s package scaffold (package.json + deps + tsconfig + `repo-manifest.json`
ownership) is orchestrator-supplemented GLUE before its leaf runs (a leaf can never touch package.json,
ADR-0031 §2). The five web-side caps (the storm, the inflection, the two Act 2 increments G + H, and the
page triage) are built in the `storytree-web` repo (branching off ITS `origin/main`, its own CD) by the
`frontend-builder` role and witnessed by the owner (ADR-0070 two-stage; appearance and feel are never
self-signed) — each an explicit HALT point for the driving session. The story goes green only when the
machine legs' gates run green at a clean HEAD AND the human legs are attested — attestation is recorded,
never presumed (ADR-0044).

## Open modeling calls (for the owner)

Surfaced rather than guessed — none blocks the first increments:

1. **The returning-visitor story** (ADR-0134 names it required) — **CLOSED (owner, 2026-07-02, at
   the increment-D attestation gate): a return visit REPLAYS the storm, as built.** The seeded plan
   makes every replay identical (`STORM_SEED`, `web/src/scripts/storm-script.ts:16`), and the skip
   is deliberately NOT remembered (no localStorage) — the persistent skip control stays the floor
   on every visit. Zero code change.
2. **Act 2 replay / deep-link UX** (deferred by ADR-0134 §5) — **CLOSED (owner, 2026-07-03, at the
   walkthrough's attestation gate,
   [ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)):
   replay-only is FINAL — the experience replays every visit and Act 2 gets NO standalone
   deep-link.** The persistent skip control (call 1) stays the floor; no anchor URL is owed.
3. **The asset / perf / mobile budget and LOD strategy** (ADR-0123 flags it as required before real
   visitors; rollout makes visitors real EARLY). The fallback path is the authored floor for weak
   devices; a formal budget (bundle size, texture compression, frame floor) is an owner call —
   candidate future reliability gate on this story once numbers exist.
4. **Keystatic / CMS survival** — **CLOSED (owner, 2026-07-06, at the info-pages-triage disposition
   gate, [ADR-0167](../../docs/decisions/0167-info-page-triage-the-signed-disposition-set-and-the-keystati.md)):
   Keystatic RETIRES.** Every surviving page is low-churn reference edited as plain files; the
   hosted editor (Cloud Run `storytree-web-editor`, ADR-0101 — superseded) was decommissioned with
   owner approval at the same gate. The signed per-page disposition set (discard `/roadmap/` +
   `/landscape/` with redirects, keep the rest) is recorded in the same ADR; see
   [`info-pages-triage`](info-pages-triage.md)'s proof status for the attestation record.
5. **The home-flip moment** ("as soon as presentable", increment D) is an owner attestation by
   definition — the driving session HALTs and asks rather than deciding presentability itself.
   **DONE (owner-attested 2026-07-02):** the storm was attested presentable (UAT legs 1–4, audio
   included) and flipped live — storytree-web PR #18 → web main `3e53f14`, the live front door
   since; see [`act1-terminal-storm`](act1-terminal-storm.md)'s proof status for the record.
