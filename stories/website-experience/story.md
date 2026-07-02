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
capabilities: [r3f-world-spike, experience-rollout-guardrails, web-experience-sync, act2-beat-director, act1-terminal-storm, storm-to-forest-inflection, act2-guided-walkthrough, info-pages-triage]
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
depends_on: [forest-world, website]
consumed_by: []
# Deciding ADRs (ADR-0037 §2): the experience concept + the per-act tech split and the owner
# decisions of 2026-07-02 that unpacked it (134); the renderer — R3F + drei as the THIRD
# forest-world mapper, client-only island, mandatory fallback, package home delegated to this
# story (123); the shared render core + the sync-into-submodule artifact flow the mapper joins (93).
decisions: [93, 123, 134]
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
five-row beat table IS the approved Act 2 spine, carried verbatim into `act2-beat-director` and
`act2-guided-walkthrough`.

- **Act 1 — the storm.** One retro CRT terminal, already logged into a coding agent. The visitor
  sends ONE prompt (suggested chip or typed — the gesture also unlocks audio). The agent "thinks,"
  then spawns sub-agents that BECOME new terminals (diegetic multiplication), tiling toward overload
  (~10–12 windows cap), each parking on an unanswerable demand (`awaiting instructions`,
  `Postgres or SQLite? (y/n)`), under an arcade HUD `AGENTS: n ▲`. Plain DOM/CSS + a canvas grain
  pass + Web Audio. **No WebGL in Act 1.**
- **The inflection.** At peak, everything dims and one calm storytree affordance appears. A single
  click TRANSFORMS rather than navigates — terminals fall silent, collapse, fragments drop into the
  ground as soil — and the exhale buys the lazy-load of the R3F bundle.
- **Act 2 — the calm forest.** Silence resolves into an empty land. An AUTO-GUIDED, VISITOR-PACED
  walkthrough (one Next-tap per beat, plain language — the tonal inverse of Act 1) grows the forest
  through the five approved beats: plant a story → watch a wisp → it branches (green only on signed
  proof) → stories connect (roads; the wrong-way UI→DB road as the visible antipattern) → pull back
  (the whole legible forest) → CTA. A **stylized teaching diorama over FICTIONAL data**
  (ADR-0056/0066/0093 boundary), never the operable studio.
- **Rollout — replace home incrementally.** The storm becomes the live homepage as soon as it is
  presentable; Act 2 grows in place on the real here.now CD rail (every merge to `storytree-web`
  main publishes). CONSEQUENCE (owner decision 6, 2026-07-02): the skip affordance and the
  no-WebGL / `prefers-reduced-motion` fallback are FIRST-CLASS from the FIRST increment, and every
  increment must leave the live site coherent.

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

## Capabilities (8)

Listed roots-first. **Class** — LEAF (parent-side isolatable red→green, armed `--real` so the
orchestrator drives it through `node build <id> --real --store pg`), LOOK (web-repo build whose
appearance + feel are operator-attested per ADR-0070; the `frontend-builder` role drives it, the
owner witnesses it), or CONTENT (owner-attested editorial judgement).

| # | capability | class | outcome (short) | `--real` | depends on |
|---|---|---|---|---|---|
| 1 | [`r3f-world-spike`](r3f-world-spike.md) | LEAF | `packages/forest-world-r3f` is born: a real forest-world `World` + scene-graph maps to typed 3D instance descriptors, rendered in an R3F canvas with drei `MapControls` in a dev harness. | yes | — |
| 2 | [`experience-rollout-guardrails`](experience-rollout-guardrails.md) | LEAF | `check:web-experience` (parent-side, check:web-grounding pattern) fails the gate when the experience entry lacks the skip affordance or the reduced-motion/no-WebGL fallback, or when Act 1 statically reaches R3F. | yes | — |
| 3 | [`web-experience-sync`](web-experience-sync.md) | LEAF | The sync + drift-gate mechanism generalises to carry the R3F mapper package (`.tsx`-aware, `@storytree/forest-world` imports rewritten to the synced sibling core) into the site under the same `@generated` discipline. | yes | `r3f-world-spike` |
| 4 | [`act2-beat-director`](act2-beat-director.md) | LEAF | A pure, deterministic, visitor-paced beat director in `forest-world-r3f`: the five approved beats as typed data, advancing one tap at a time; green appears only with a signed-proof marker; the wrong-way road is flagged from data. | yes | `r3f-world-spike` |
| 5 | [`act1-terminal-storm`](act1-terminal-storm.md) | LOOK | One visitor prompt breeds the diegetic terminal storm to the ~10–12 peak — CRT look, canvas grain, gesture-unlocked audio, HUD, unanswerable demands; no WebGL. | (look) | `experience-rollout-guardrails` |
| 6 | [`storm-to-forest-inflection`](storm-to-forest-inflection.md) | LOOK | At peak, one calm affordance; a single click transforms — silence, collapse into soil — and lazy-loads the R3F island into the empty calm land. | (look) | `act1-terminal-storm`, `web-experience-sync` |
| 7 | [`act2-guided-walkthrough`](act2-guided-walkthrough.md) | LOOK | The five-beat, visitor-paced, plain-language walkthrough grows the fictional forest over the synced director + mapper, to the pull-back and the CTA. | (look) | `storm-to-forest-inflection`, `act2-beat-director`, `web-experience-sync` |
| 8 | [`info-pages-triage`](info-pages-triage.md) | CONTENT | Every legacy info page has an explicit executed disposition — folded into Act 2, discarded, or kept static — with no orphan links and the grounding wire still green; the outcome decides Keystatic's survival. | (content) | `act2-guided-walkthrough` |

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
  calm land carries the CTA/links until the walkthrough lands.
- **Increment F — `act2-beat-director`** (parent-only) then **G — `act2-guided-walkthrough`** — the
  beats grow in place; the walkthrough may land beats incrementally (the director is data-driven),
  each merge leaving a complete-so-far guided arc ending at the CTA.
- **Increment H — `info-pages-triage`** — the surrounding pages fold in, retire, or stay; the
  Keystatic call falls out of the disposition set.

Within-story edges, with the reason each exists: `web-experience-sync → r3f-world-spike` (you cannot
sync a package that does not exist); `act2-beat-director → r3f-world-spike` (the director lives in
and drives the mapper's package); `act1-terminal-storm → experience-rollout-guardrails` (the storm
may only face visitors with the exits machine-guarded); `storm-to-forest-inflection →
act1-terminal-storm` (there is no peak to transform without the storm), `→ web-experience-sync` (the
R3F island it lazy-loads must be on the site); `act2-guided-walkthrough →` all three of the
inflection (the land it grows on), the director (the script it walks), the sync (the artifact rail);
`info-pages-triage → act2-guided-walkthrough` (you cannot fold a page into an Act 2 that is not
there).

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
   terminal, already logged into a coding agent, offers suggested chips and a prompt line. Send ONE
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
5. **The same gesture grows order.** _(witness: human)_ Advance the walkthrough one Next-tap per
   beat, in plain language throughout: plant a story (a seed grows into a tree with its outcome on
   a label) → watch a wisp (presence without obligation) → it branches (limbs turn green ONLY on a
   signed passing proof) → stories connect (roads — the wrong-way UI→DB road skipping the service
   layer is visibly flagged as the antipattern) → pull back (one legible forest: green = proven,
   sapling = in-progress, withered = broken). **Success —** the arc ends on the CTA to the real
   product; at no beat does the visitor work harder than one tap — the Act 1 contrast lands.
6. **The artifact edge is live.** _(witness: machine)_ `pnpm check:web-engine` (extended) at a clean
   HEAD. **Success —** green: the site's synced copies of the render core AND the R3F mapper are
   byte-fresh from their parent packages (`@generated`, no drift, no stale leftovers) — the 3D look
   flows from the parent, never hand-ported.
7. **The surrounding pages are dispositioned.** _(witness: human)_ Walk the legacy pages
   (how-it-works, roadmap, landscape, constitution, contact, get-involved). **Success —** each is
   explicitly folded into Act 2, discarded, or kept as a reachable plain static page; no orphan
   links; `check:web-grounding` still green over every surviving claim.

## Proof

**Honest status — `proposed` (authored, not built).** Nothing here is proven yet; `healthy` is
earned through the gate, never authored (ADR-0020). The four LEAF caps are armed with `--real`
proof config so the orchestrator drives each through `node build <id> --real --store pg` in
dependency order — with the one documented pre-step that `r3f-world-spike`'s package scaffold
(package.json + deps + tsconfig + `repo-manifest.json` ownership) is orchestrator-supplemented GLUE
before its leaf runs (a leaf can never touch package.json, ADR-0031 §2). The four web-side caps are
built in the `storytree-web` repo (branching off ITS `origin/main`, its own CD) by the
`frontend-builder` role and witnessed by the owner (ADR-0070 two-stage; appearance and feel are
never self-signed) — each an explicit HALT point for the driving session. The story goes green only
when the machine legs' gates run green at a clean HEAD AND the human legs are attested — attestation
is recorded, never presumed (ADR-0044).

## Open modeling calls (for the owner)

Surfaced rather than guessed — none blocks the first increments:

1. **The returning-visitor story** (ADR-0134 names it required) — **CLOSED (owner, 2026-07-02, at
   the increment-D attestation gate): a return visit REPLAYS the storm, as built.** The seeded plan
   makes every replay identical (`STORM_SEED`, `web/src/scripts/storm-script.ts:16`), and the skip
   is deliberately NOT remembered (no localStorage) — the persistent skip control stays the floor
   on every visit. Zero code change.
2. **Act 2 replay / deep-link UX** (deferred by ADR-0134 §5): does the calm forest have a stable URL
   a visitor (or the CTA funnel) can enter without the storm? Interacts with call 1; the skip
   affordance implies at least an anchor.
3. **The asset / perf / mobile budget and LOD strategy** (ADR-0123 flags it as required before real
   visitors; rollout makes visitors real EARLY). The fallback path is the authored floor for weak
   devices; a formal budget (bundle size, texture compression, frame floor) is an owner call —
   candidate future reliability gate on this story once numbers exist.
4. **Keystatic / CMS survival** is deliberately NOT pre-decided: it falls out of `info-pages-triage`
   (if no surviving page needs CMS editing, Keystatic retires). Record the outcome as its own ADR
   when the triage lands (ADR-0134 flags it as load-bearing for the build shape).
5. **The home-flip moment** ("as soon as presentable", increment D) is an owner attestation by
   definition — the driving session HALTs and asks rather than deciding presentability itself.
   **DONE (owner-attested 2026-07-02):** the storm was attested presentable (UAT legs 1–4, audio
   included) and flipped live — storytree-web PR #18 → web main `3e53f14`, the live front door
   since; see [`act1-terminal-storm`](act1-terminal-storm.md)'s proof status for the record.
