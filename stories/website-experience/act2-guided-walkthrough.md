---
id: "act2-guided-walkthrough"
tier: capability
story: website-experience
title: "Act 2 (increment G) — the website-first walk: the reused prompt, the orchestrator's mock-website proposal, and the 2.5D walk that grows one website story to the 'what's next' hand-off"
outcome: "Act 2 replays Act 1's request — the SAME prompt (rewritten to 'build me a shopping website', reused across both acts) — done the storytree way (ADR-0148), shown through the REAL app's UI (ADR-0153). The walk OPENS from that reused prompt; the SESSION ORCHESTRATOR proposes a MOCK LOCAL WEBSITE first — no backend — in a short SCRIPTED exchange (honest, explicitly a mock; does not lead with the backend; meets the vibe coder where they are). Then the auto-guided, VISITOR-PACED walk (one Next-tap per beat, plain language — the tonal inverse of Act 1) grows THAT ONE website story green ON THE REAL 2.5D MAP — the synced buildScene scene graph rendered as the site's SVG (ADR-0145), narrated by callout boxes anchored to the map element each beat teaches. RESHAPED by ADR-0153 (owner-directed at the H gate, where the first walk was refined): the walk and orchestrator use the REAL desktop/web app UI components (not bespoke chrome) with progressive disclosure (hide UI the visitor has not been walked through); there is NO escape to any static/deprecated page (a11y fallback only); STEP 1 presents a story as an OUTCOME BRIEF WITH AN EXAMPLE via the session-orchestrator CHAT AT THE BOTTOM (as the real app — dropping the 'young tree on a label' framing); STEP 2 shows the orchestrator ROUTING the story to the DRIVE MACHINERY via a temporary top-left flow-diagram overlay of the agent loop; STEPS 3–4 expand the drive-machinery diagrams (CI/CD, devops, gates, wiring — a second overlay top-right OK) without overloading; the branch beat (limbs green ONLY on signed proof) is PRESERVED, and the wrong-way UI→DB road is RETIRED as the teach (ADR-0150 §4). The retained shopping fiction (Cart / Payments / Receipts) is exactly the features that cannot truly work without a backend, so the walk ends on a CTA that is a CONTINUATION SEAM into 'what's next' (the upstream forest of increment H — act2-guided-forest), not a hand-off to a separate page. A stylized teaching diorama over fictional data, never the operable studio."
status: proposed
proof_mode: operator-attested
depends_on: [storm-to-forest-inflection, act2-beat-director, web-experience-sync]
decisions: [134, 145, 148, 150, 153, 157]
# OPERATOR-ATTESTED (ADR-0070) — web-repo work. The choreography ENGINE is already machine-proven
# upstream (act2-beat-director: visitor-paced advance, proof-gated green, the flagged wrong-way
# road, the approved default script — all parent-side contracts), and the artifact freshness is the
# extended check:web-engine's job. What THIS capability owns is the experienced surface, now RE-SCOPED
# by ADR-0148 to the website-first framing: the reused-prompt open, the SCRIPTED ORCHESTRATOR
# mock-website proposal exchange (the meatiest new build piece — a felt planning/pushback moment,
# site-side fictional content), the narration copy (plain language, keyed by beat id against the
# director's exported zod contract), the anchored-callout + map-motion feel, the Next affordance, the
# 'what's next' CTA hand-off to increment H, and whether each beat TEACHES its concept to a non-expert
# — irreducibly human judgements on the real site. NO `proof:` block — witnessed, not `--real`-built.
---

# Act 2 (increment G) — the website-first walk: the reused prompt, the orchestrator's mock-website proposal, and the 2.5D walk to the "what's next" hand-off

**Outcome —** Act 2 replays **Act 1's request, done right** — the SAME prompt (Act 1's terminal now
leads with **"build me a shopping website"**, reused across both acts; one prompt, two ways — the
gripe, then the answer), handled the storytree way
([ADR-0148](../../docs/decisions/0148-act-2-is-a-website-first-walk-that-grows-into-an-orchestrato.md)).
Three framing moves wrap the walk that was already built and witnessed:

1. **It opens from the reused prompt.** The calm land arrives from Act 1 carrying the same
   shopping-website request the storm mangled — the visitor sees Act 2 answer the very thing Act 1
   drowned.
2. **The session orchestrator proposes a mock local website first — no backend.** A short **scripted
   orchestrator exchange** (felt, not merely narrated — the planning/pushback moment, the org
   analogy's manager scoping the work) answers the prompt by proposing the honest minimum a vibe
   coder wants: a **mock local website** to validate the idea. It is explicitly a mock (it does not
   misdirect), and it does not lead with the backend (it does not overwhelm) — it **meets the vibe
   coder where they are**: they want to *see* a website.
3. **The existing 2.5D walk grows THAT ONE website story green.** The auto-guided, **VISITOR-PACED**
   walkthrough (one Next-tap per beat, **plain language** — the tonal inverse of Act 1's jargon)
   grows the fictional forest through the five approved beats **on the real 2.5D map** — the synced
   `buildScene` scene graph rendered as the site's SVG
   ([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)),
   representative of the actual product — narrated by **callout boxes anchored to the exact map
   element each beat teaches**.

The retained shopping fiction (**Cart / Payments / Receipts**) is precisely the set of features that
**cannot truly work without a backend** — so the walk ends not on a generic "sign up" but on a
**CTA that CONTINUES into "what's next"** (a continuation seam, not a hand-off to a separate page —
ADR-0150): the upstream forest of a database and a proper backend that increment H
([`act2-guided-forest`](act2-guided-forest.md)) reveals. A stylized teaching diorama over fictional
data, never the operable studio.

**RESHAPED by [ADR-0153](../../docs/decisions/0153-act-2-uses-the-real-app-ui-hides-the-unwalked-and-grows-a-co.md)
(owner-directed at the H attestation gate, 2026-07-04).** The first walk above was built + attested +
LIVE; refining H, the owner reshaped G's surface (this RE-OPENS the capability toward `building`; the
"As built" record is kept as true history). Five changes: the walk and orchestrator use the **REAL
app's UI components** (not bespoke chrome) with **progressive disclosure** (hide UI the visitor has not
been walked through); **no escape hatches** to any static / deprecated page (a11y fallback only); **step
1** presents a story as an **outcome brief WITH an example** carried by the session-orchestrator **CHAT
AT THE BOTTOM** (as the real app), dropping the "young tree on a label" framing; **step 2** shows the
orchestrator **routing to the DRIVE MACHINERY** via a temporary top-left flow-diagram overlay; **steps
3–4** expand the drive-machinery diagrams (CI/CD, devops, gates, wiring — a second overlay top-right OK)
without overloading. The branch beat (limbs green ONLY on signed proof) is PRESERVED; the wrong-way road
is RETIRED as the teach (ADR-0150 §4). See "Re-spec" in the proof status below and the ADR-0153
redirections in Guidance.

**Depends on —** [`storm-to-forest-inflection`](storm-to-forest-inflection.md) — the land it grows
on; [`act2-beat-director`](act2-beat-director.md) — the script it walks;
[`web-experience-sync`](web-experience-sync.md) — the artifact rail both ride to the site.

> **Proof status (honest) — a first walk was BUILT + OWNER-ATTESTED + LIVE (2026-07-04, web main
> `ff70222b`); RE-SPECCED by ADR-0153 (owner-directed at the H gate 2026-07-04), which RE-OPENS this
> LOOK toward `building` for the reshaped surface. The authored `status` stays `proposed`; `healthy`
> is earned through the whole-story gate, never authored (ADR-0020).** The prior attested walk is REAL
> HISTORY (kept intact below — the "As built" and "Attested + landed" records are a true live-attested
> account, copy-on-write); the gate simply re-opened this capability because the WHAT changed. Per
> `defects-amend-the-owning-story`, the re-spec reverts the capability to `building` and re-earns
> `healthy` through the gate on the new surface. The teaching claims are deliberately NOT left to
> attestation: "green only on signed proof" is a DATA CONTRACT the parent spine holds in
> `act2-beat-director` — the site cannot walk a script that contradicts the thesis (the "wrong-way road
> is flagged" contract is RETIRED as the teach per ADR-0150 §4). What a human must witness on the
> RESHAPED walk (ADR-0153): the surface uses the REAL app's UI components (not bespoke chrome) with
> progressive disclosure (UI the visitor has not been walked through stays hidden); there is NO escape
> to any static / deprecated page (a11y fallback only); step 1 presents a story as an OUTCOME BRIEF WITH
> AN EXAMPLE, ideally via the session-orchestrator CHAT AT THE BOTTOM (as the real app); step 2 shows
> the orchestrator ROUTING to the drive machinery via a temporary top-left flow-diagram overlay; steps
> 3–4 expand the drive-machinery diagrams (CI/CD, devops, gates, wiring) without overloading; and the
> walk still ends on a CTA that CONTINUES upstream into H without dead-ending — the felt calm ADR-0134
> stakes the pitch on, now framed website-first (ADR-0148) and shown through the real product's own UI
> (ADR-0153).
>
> **Re-scope note (ADR-0148, 2026-07-03).** At this capability's attestation gate, the owner judged
> the first 2.5D build *"good progress"* but **re-directed the NARRATIVE**: Act 2 must teach how
> storytree actually works — the vibe coder's request handled the storytree way. This capability is
> re-specified to **increment G — the website-first walk** (the reused prompt + the scripted
> orchestrator mock-website proposal + the "what's next" CTA, on top of the already-built 2.5D walk);
> a NEW capability, [`act2-guided-forest`](act2-guided-forest.md) (increment H), captures the
> upstream forest the CTA hands off to. The 2.5D map render, pacing, callout, and beat engine
> ([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md))
> all carry FORWARD — they are the foundation, not discarded.
>
> **Attestation history (kept — honest record).** A first build (the five beats over the R3F 3D
> island, per ADR-0134 §3's original tech note) reached its owner gate 2026-07-03 with the machine
> floor green (61-check Playwright witness; storytree-web draft PR #20, closed superseded) and was
> **refused at stage 2** — the owner re-decided the substrate onto the real 2.5D map with
> anchored-callout narration
> ([ADR-0145](../../docs/decisions/0145-act-2-walks-the-real-2-5d-map-the-r3f-forest-retreats-to-far.md)).
> That 2.5D build in turn reached its gate 2026-07-03, was judged good progress, and was
> **re-directed to the website-first framing above** (ADR-0148) — the walk stands, the narrative
> grew. The closed PR's renderer-agnostic pieces (narration copy, the `act2-validate` build-time
> wall, the pacing/beat UI logic) are salvage carried into every rebuild.
>
> **Attested + landed (2026-07-04, web main `ff70222b`).** The website-first walk (ADR-0148 increment
> G) reached its owner gate on the reshaped substrate; the owner walked it live and attested it — the
> reused shopping prompt, the new finale copy, "show me the better way" (AND the top-left skip) routing
> straight into the 2.5D tutorial, the orchestrator's mock-website proposal, the five-beat walk, and
> the "what's next" CTA. Merged storytree-web PR #22 → web main `ff70222b`, CD green, LIVE (all three
> `data-experience-*` markers on `https://crisp-globe-bf6v.here.now/`); attestation recorded as an
> owner-relayed comment on PR #22 (ADR-0044 §4 / ADR-0082). Two follow-ups the owner named at the gate
> are deferred to increment H ([`act2-guided-forest`](act2-guided-forest.md)): replace beat 4's
> wrong-way-flag framing with the dependency-layer-as-advantage reframe on the real map, and integrate
> "grow the backend" into the ONE continuous tutorial rather than a separate CTA/destination.
>
> **Correction — SETTLED by ADR-0150 (owner-directed at this gate, 2026-07-04; noted in place
> per ADR-0139).** The two deferred follow-ups above are now DECIDED and belong to increment H
> ([`act2-guided-forest`](act2-guided-forest.md)):
> - **Beat 4's teach is reframed.** The shipped beat 4 (LIVE at web main `ff70222b`) draws a wrong-way
>   UI→DB road flagged as an antipattern — a NEGATIVE teach. That framing is RETIRED as the teach and
>   replaced by H's **dependency-layer-as-advantage**: the honest upstream dependency layers, shown on
>   the real 2.5D map, ARE storytree's advantage. The wrong-way road is retired from the teach (ADR-0150 §4;
>   the `act2-beat-director` engine demotes it from the default script). The site edit that lands this
>   is H's build on storytree-web (operator-attested); G's live record here is CORRECTED (this note),
>   not rewritten — the "As built" and "Attested + landed" history below stays a true live-attested
>   record (copy-on-write).
> - **The CTA is a continuation seam, not a separate destination.** G's "what's next" CTA is reframed:
>   it is where the ONE continuous walk continues upstream into H — not a hand-off to a new page or a
>   gated second experience ("it shouldnt be separate"). Until H lands, the seam still resolves to the
>   real product / get-involved so the live site stays coherent; the change is the experienced
>   continuity, not a requirement that H exist before G is honest.
>
> **Re-spec — SETTLED by ADR-0153 (owner-directed at the H attestation gate, 2026-07-04, where H was
> REFUSED; noted in place per ADR-0139).** Attesting/refusing H, the owner directed five sharpenings
> that reshape G's experienced surface (born accepted, ADR-0110 — NOT open questions). This RE-OPENS
> this capability toward `building` for the reshaped surface; the "As built" and "Attested + landed"
> records below stay a true live-attested account of the FIRST walk (copy-on-write), not rewritten:
> - **Real app UI, progressive disclosure.** The walk AND the orchestrator surface use the REAL
>   desktop/web app's UI components (`apps/desktop`, `apps/studio`), not bespoke website chrome. UI the
>   visitor has not been walked through is HIDDEN, revealed as the walk earns it. (Whether that is
>   literal component reuse across the sync boundary or faithful re-creation is an open build-time
>   mechanism call — the site only HAS the synced `buildScene` artifact, ADR-0056/0066/0093.)
> - **No escape hatches.** "Skip the intro" and every path to a static / deprecated page are removed —
>   a capable visitor is offered NO escape. Only the gate-required no-JS / reduced-motion a11y fallback
>   stays. (This retires the shipped top-left-skip-into-tutorial AND the interim static-page fallback as
>   a capable-visitor destination.)
> - **Step 1 is an OUTCOME BRIEF with an example, via the orchestrator chat at the bottom.** A story is
>   presented as an outcome brief carrying an example — ideally shown through the session-orchestrator
>   CHAT AT THE BOTTOM (as the real app), carrying that example. The earlier "young tree / lives on the
>   map / not buried in a chat log" framing is dropped.
> - **Step 2 shows the orchestrator ROUTING to the drive machinery** via a TEMPORARY top-left
>   flow-diagram overlay of the agent loop (an overlay, not on the map — the background machinery is not
>   map signal unless something breaks). Steps 3–4 expand the drive-machinery diagrams (CI/CD, devops,
>   gates, wiring) — a second overlay top-right is fine — without overloading; the deepest of these
>   extend into H.
> - The reframed CTA (continuation seam), the corrected dependency direction, and the deeper upstream
>   reveal remain H's ([`act2-guided-forest`](act2-guided-forest.md)) — G carries the reused-prompt
>   open, the outcome-brief-with-chat step 1, the drive-machinery overlays (steps 2–4), and the walk
>   over the real product UI, all leading into the seam.
>
> **Re-spec — SETTLED by ADR-0157 (owner-directed at the H BUILD #2 gate, 2026-07-05; born accepted,
> ADR-0110; noted in place per ADR-0139).** After H#2 landed live (web main `8f4e166c`), the owner gave
> forward directions, several of which touch G's surface. This RE-OPENS this capability toward `building`
> for the reshaped surface; the "As built" and "Attested + landed" records below stay a true live-attested
> account of the FIRST walk (copy-on-write), not rewritten. G's share of ADR-0157:
> - **Plain language, no storm metaphor.** All of G's copy (the orchestrator's proposal lines, the beat
>   narration, the overlays) is plain and jargon-free for newcomer devs / vibe coders
>   (`plain-language-first`); the word/analogy "storm" is retired from every visitor-facing surface (it
>   currently survives in `act2-narration.ts` `INTRO`/`done` — the "The storm settles into soil" opener —
>   and Act 1). Act 1's built experience stands; only its naming retires.
> - **The step-2 agent-loop overlay becomes an HONEST TDD LOOP DIAGRAM** (a loop, not a list;
>   system-as-referee, NOT the AI grading its own homework) — see "The honest TDD loop diagram" in
>   Guidance. Site-side content keyed by beat id (NOT engine structure — ADR-0153/0157 authoring call),
>   validated by `act2-validate`.
> - **The pre-walk reads as OUR orchestrator; the planted website node lands `proposed`.** The scripted
>   orchestrator voice reads as storytree's ACTUAL session orchestrator (ADR-0030), not a generic coding
>   agent; and G's plant-story beat depicts the first (mock website) node entering `proposed` — proven only
>   on a signed proof (ADR-0094 / ADR-0020), never instantly green or silently building.
> - **The wisp MOVES.** G's watch-a-wisp beat renders the wisp MOVING (drifts/travels) rather than as a
>   static dot (the scene emits a `wisps` presence marker on the `.tw-wisps` layer, `act2-walkthrough.ts`
>   ~lines 510–511, not yet animated) — a site-side animation change, no engine change.
> - The BaaS direct-read architecture (`website.dependsOn=[backend, database]`) is primarily H's upstream
>   reveal; G plants the single website story, so it does not itself render the diamond — but the LEAF
>   (`act2-beat-director`) delta widening lands before H's build, and G's default-script beats are
>   unchanged by the diamond (the website node is planted the same way). Per `defects-amend-the-owning-story`
>   the re-spec reverts this cap to `building` and re-earns `healthy` on the reshaped surface through the
>   gate; `healthy` is earned through the gate, never authored (ADR-0020).
>
> **As built (2026-07-05, web main `d761eadc`, live at https://crisp-globe-bf6v.here.now/) — G's share of
> ADR-0157 LANDED + OWNER-ATTESTED AS A STEP FORWARD.** The de-storm/plain-language sweep, the honest TDD
> loop diagram, the our-orchestrator pre-walk, the first-node-`proposed` honesty, and the moving wisp are
> all live in the cumulative Act 2 build (storytree-web PR #26, both CD runs green; parent `web/` pin
> bumped `8f4e166c` → `d761eadc`; independently witnessed 34/34). Cites (files under `web/` at `d761eadc`):
> `act2-narration.ts` de-stormed (the `INTRO` no longer opens "The storm settles into soil"; no storm
> analogy in visitor copy); `act2-overlays.ts` `buildLoopDiagram` (the honest TDD **loop** — four nodes /
> four arcs, two SYSTEM-check nodes, "the system checks — not the AI"); `act2-orchestrator.ts`
> (our-orchestrator voice; the story named a proposal, node born `proposed`); `index.astro`
> `animation: act2-wisp-drift` (the wisp travels a soft closed loop, no longer a static dot). The owner
> attested this as a STEP FORWARD (verbatim: *"This is also a step forward, so land it"*) and directed a
> further follow-on redesign — so this LOOK is STILL NOT terminally closed; the `d761eadc` "step forward"
> record here stands as true history (copy-on-write). The authored `status:` stays `proposed`.

## As built (web main `ff70222b`) — the FIRST attested walk (historical record, kept intact)

The verified anchors in the pinned tree (cite these, not the older sketches):

- **The reused prompt + the two entries into the tutorial** — `web/src/pages/index.astro`: the storm
  entry carries `data-experience-entry`; the finale fork's primary button binds `[data-storm-transform]`
  (index.astro:173), and the persistent top-left skip `[data-experience-skip]` (index.astro:96) now
  routes a capable visitor STRAIGHT into the tutorial via the inline handler
  (`window.__stormSkipToTutorial`, index.astro:73–75) — falling back to `#calm-view` only with no JS.
  The `data-experience-fallback` calm view (index.astro:212) stays as the no-JS / reduced-motion
  degradation (ADR-0148 §5; `check:web-experience` green).
- **One shared mount, two ways in** — `web/src/scripts/act1-storm.ts`: `beginTransform` (the finale
  transform, :567) and `jumpToTutorial` (the skip-straight-in, :674) both mount through the shared
  `resolveToLand` (:526); `window.__stormSkipToTutorial` is registered at :683. Zero WebGL on the path.
- **The tutorial mount** — `web/src/scripts/inflection.ts`: `mountForestLand` (:63) mounts the 2.5D
  walk (`mountWalkthrough`) then the orchestrator's proposal (`mountOrchestrator`) — pure SVG/DOM.
- **The orchestrator's mock-website proposal** — `web/src/scripts/act2-orchestrator.ts`: the scripted
  `PROPOSAL_LINES` (:39) and `mountOrchestrator` (:114) — the felt planning/pushback moment.
- **The five-beat walk over the shopping fiction** — `web/src/scripts/act2-walkthrough.ts` (the 2.5D
  fold + pacing UI), `web/src/scripts/act2-script.ts` (`walkthroughScript` / `story-checkout`, :33/:42),
  `web/src/scripts/act2-narration.ts` + `act2-validate.ts` (plain-language copy + build-time key wall).
- **The black-blob map-render fix** — `web/src/styles/tree-world-map.css`: the shared 2.5D map paint
  CSS index.astro now pulls in, so the `buildScene` SVG renders as the real green tiled island (not a
  black blob) even though the page never mounts `<TreeWorld/>`.

## Guidance

THE ADR-0153 REDIRECTIONS (owner-directed at the H gate 2026-07-04 — the reshape of G's surface; these
GOVERN where they touch the older framing-moves below):

- **Real app UI, progressive disclosure.** The walk AND the orchestrator surface use the REAL
  desktop/web app's UI components (`apps/desktop`, `apps/studio`), NOT bespoke website chrome — the
  visitor sees the actual product's interface. UI elements the visitor has NOT yet been walked through
  are HIDDEN, revealed as the walk earns them. Whether "reuse the real components" is literal (more
  synced across the boundary) or faithful re-creation against the same design system is an open
  build-time mechanism call (the site only HAS the synced `buildScene` artifact — ADR-0056/0066/0093);
  the WHAT is visual parity + no bespoke chrome, flagged for the frontend-builder + owner — do not
  over-constrain the HOW.
- **No escape hatches.** Remove "skip the intro" and EVERY path to a static / deprecated page — a
  capable visitor is offered no escape. This RETIRES the shipped top-left-skip-straight-into-tutorial as
  a capable-visitor affordance AND the interim static-page fallback as a destination. The ONLY surviving
  non-experience path is the gate-required no-JS / `prefers-reduced-motion` a11y fallback (a clean
  minimal static page, `check:web-experience` green).
- **Step 1 is an OUTCOME BRIEF with an example, via the orchestrator chat at the bottom.** A story is
  presented as an OUTCOME BRIEF carrying an EXAMPLE — ideally shown through the session-orchestrator
  CHAT AT THE BOTTOM (as the real app), carrying that example. Drop the "young tree / lives on the map /
  not buried in a chat log" framing. (The org analogy: the manager states the outcome and an example, in
  the chat surface a real user would use.)
- **Step 2 shows the orchestrator ROUTING to the drive machinery.** After the brief, show what the
  orchestrator DOES with the story: it routes it to the drive machinery. A TEMPORARY flow-diagram
  OVERLAY, top-left, depicts the agent loop running in the background. It is an overlay, not drawn on
  the map, because the background machinery is not map signal unless something breaks or needs attention
  — the map stays the honest picture; the process detail floats above it and clears.
- **Steps 3–4 expand the drive-machinery diagram(s).** Build out what the drive machinery is — CI/CD,
  devops, the gates, how the system is wired to the code to keep it honest. MAY use multiple diagrams (a
  second overlay, top-right) but MUST NOT overload — reveal scaffolded. The deepest of these (the
  backend/database depth) extend into increment H. The overlays are site-side content keyed by beat id
  (the `act2-beat-director` engine needs no change — ADR-0153's authoring call).

THE ADR-0157 REDIRECTIONS (owner-directed at the H BUILD #2 gate 2026-07-05 — they GOVERN G's copy, its
step-2 overlay, its plant-story beat, and its wisp beat):

- **The honest TDD loop diagram (step 2's agent-loop overlay).** The step-2 overlay that shows the agent
  loop must be a DIAGRAM that shows a LOOP (not the current list-style rows), at vibe-coder altitude, and
  HONEST about how storytree proves work. Ground truth: the ADR-0020 red-green phase machine
  (`packages/orchestrator/src/phase-machine.ts`) drives a leaf author through write-scoped phases
  `AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`, and **red/green is OBSERVED by the
  deterministic spine — never claimed by the model** (`:7-8`; `AUTHOR_TEST` writes test-paths-only `:172-174`;
  `IMPLEMENT` source-only, never a test — "the test author is not the code author" `:176-178`). So the loop
  is: **write a failing test → a REFEREE (the SYSTEM, not the AI) checks it really fails (RED) → write code
  → the referee checks it really passes (GREEN) → loop.** The diagram must: (a) be a LOOP (the looping
  shape is the point — the owner's "the main thing is the diagram should show a loop"); (b) show the two
  write-scoped phases at the owner's altitude ("one agent writes the tests" = `AUTHOR_TEST`; "the other
  builds code to pass the tests" = `IMPLEMENT`); and (c) — CRUCIAL — make the REFEREE the SYSTEM, not the
  AI (the system checks red then green; that is the verification-gap thesis — not an AI grading its own
  homework). If the two-agent framing is used for approachability, the CHECK stays clearly the system's.
  This is the plain-language depiction of `abd-green-only-on-signed-proof` (green only on a signed proof,
  in data). Site-side content keyed by beat id (NOT a director field — ADR-0157), validated by
  `act2-validate`. Exact visuals are the builder's + owner's at the gate.
- **Plain language, no storm metaphor.** ALL of G's copy is plain and jargon-free for newcomer devs / vibe
  coders (`plain-language-first`): no insider vocabulary without immediately showing what it means, no
  strained analogies. The word/analogy **"storm" is retired from every visitor-facing surface** (it
  currently survives in `act2-narration.ts` `INTRO`/`done` and Act 1); describe Act 1 plainly (the
  overwhelming swarm of agents / the chaotic terminals) where G's copy references it. Act 1's built
  experience is untouched — only its naming.
- **The pre-walk/orchestrator reads as OUR system; the planted node lands `proposed`.** The scripted
  orchestrator voice reads as storytree's ACTUAL session orchestrator (ADR-0030's human-facing planning
  agent), not a generic coding agent — the visitor understands they are watching storytree work. And G's
  plant-story beat depicts the first (mock website) node entering `proposed` — proven only on a signed
  proof (ADR-0094 / ADR-0020), never instantly green or silently `building` without proof. This reinforces
  the verification-gap thesis: intent is proposed, then proven.
- **The wisp MOVES.** G's watch-a-wisp beat renders the wisp MOVING — it drifts/travels (e.g. over the
  tree) rather than rendering as a static dot. A site-side animation of the `wisps` presence marker the
  director already emits (the same site-owns-motion boundary ADR-0145 set for viewBox tweens and growth
  transitions); no engine change. The exact motion is builder/owner-tunable at the gate; the requirement
  is that it moves.

THE SURFACE (owner decisions 2026-07-02 + the 2026-07-03 re-decisions, ADR-0145 for the substrate and
ADR-0148 for the website-first narrative, RESHAPED by ADR-0153 + ADR-0157 above — the spec of the feel):

THE THREE FRAMING MOVES (ADR-0148 — what the website-first re-scope ADDED on top of the already-built
2.5D walk; note the ADR-0153 redirections above now govern the SURFACE these render on):

- **The reused prompt opens it.** Act 1's storm terminal now leads with **"build me a shopping
  website"** (the copy change lands in `act1-terminal-storm`'s storm script; recorded here because
  Act 2 depends on it). Act 2 is that SAME request answered — one prompt, two ways: Act 1 is it done
  chaotically, Act 2 the same request done right. The calm land arrives already carrying the request,
  so the visitor reads Act 2 as the answer to what the storm mangled, not a fresh topic.
- **The session orchestrator proposes a mock local website first — the meatiest new build piece.** A
  short **scripted orchestrator exchange** (felt, not merely narrated — the planning/pushback moment,
  ADR-0030's human-facing planning agent dramatised; the org analogy's manager scoping the work)
  answers the prompt by proposing the honest minimum: a **mock local website — no backend** — to
  validate the idea. It is HONEST (explicitly a mock; it does not misdirect toward a fake-working
  product) and it MEETS THE USER WHERE THEY ARE (a vibe coder wants to *see* a website; it does not
  lead with "you need a backend first" and does not overwhelm). This exchange is site-side fictional
  content (the Cohoot precedent) and is the seam increment H extends — the same orchestrator returns
  to guide "what's next." Keep it SHORT: a few felt lines, not a wall of chat.
- **The CTA hands off to "what's next", never a dead-end.** The retained shopping fiction (Cart /
  Payments / Receipts) is exactly the set of features that cannot truly work as a mock — so the walk
  ends by naming the next step: the upstream database + backend the orchestrator will guide the user
  to (increment H, [`act2-guided-forest`](act2-guided-forest.md)). Until H lands, the CTA resolves to
  the real product / get-involved (as today) while still POSING the "what's next" question — coherent,
  just not yet walkable upstream.

COHESION — ALL IN ON THE TUTORIAL (ADR-0148 §5 — the end-to-end flow the owner demanded at the gate):

- **"Show me the better way" routes STRAIGHT into the tutorial.** The finale terminal's primary button
  transforms the storm and lands the visitor DIRECTLY in the Act 2 2.5D tutorial — no intermediate
  "begin the guided walk" second click, no detour to a static/classic homepage. One click from the
  finale into the guided experience.
- **Drop the R3F 3D landing island — go all in on 2.5D.** The old inflection mounted a 3D R3F island
  that then flipped to the 2.5D map; that flip read as awkward. The transform now resolves straight
  into the 2.5D tutorial ground (the storm→soil choreography stays; the destination is the 2.5D map,
  not an R3F island). Act 2 carries zero WebGL — the ~1.2 MB island chunk leaves the path entirely.
- **Retire the classic front page as a destination — and now retire the skip too (ADR-0153).** No
  "prefer the classic front page?" opt-out for capable visitors — the tutorial is the front door.
  ADR-0148 kept a persistent skip affordance (routing a capable visitor straight into the tutorial);
  ADR-0153 redirection 2 REMOVES "skip the intro" and every path to a static / deprecated page as a
  capable-visitor affordance. The ONLY surviving non-experience path is the gate-required no-JS /
  reduced-motion accessibility fallback (a clean minimal static page, `check:web-experience` green —
  NOT the old marketing homepage, and NOT an escape a capable visitor is offered). *(Note: the SHIPPED
  build wires `[data-experience-skip]` to jump into the tutorial — see "As built"; the reshape removes
  that capable-visitor skip, keeping only the a11y fallback marker the gate requires. Confirm with the
  owner at the gate whether any minimal replay/exit affordance is wanted, since call-1/call-2 in the
  story settled replay-only with the persistent skip as the floor — ADR-0153 narrows that floor to the
  a11y path; flag it for the owner rather than silently dropping a previously-attested affordance.)*
- **The finale copy addresses the visitor.** The root agent's finale turns on the user — it is waiting
  on them, it names their likely overwhelm, and it offers a better way that "feels like playing a game"
  (the exact new lines are build content in the builder's brief; the old cryptic "the bottleneck is not
  the agents" monologue is replaced).

THE WALK ITSELF (carried FORWARD from the 2.5D build, unchanged by this re-scope):

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
- **The five beats grow the ONE website story, teaching by watching, one concept each** (the
  research-table rows, verbatim in spirit): the story the walk plants IS the mock shopping website
  the orchestrator just proposed (Cart / Payments / Receipts the retained fiction). The seed→tree
  with the OUTCOME ON A LABEL answers orphaned intent; the drifting wisp answers babysitting
  (presence without obligation — the visitor does nothing and that is the point); the branch beat
  answers the verification gap (a limb greens only as a SIGNED PROOF lands — narrate exactly that);
  the roads beat answers illegible architecture (the wrong-way UI→DB road skipping the service layer
  appears visibly flagged the moment it is drawn); the pull-back answers terminal sprawl (one calm
  screen: green = proven, sapling = in-progress, withered = broken — the anti-storm, framed as the
  answer to Act 1's HUD).
  *(Beat-4 teach reframed — ADR-0150, 2026-07-04, noted in place per ADR-0139: this bullet
  records G's shipped beat 4 as built and LIVE; its wrong-way-flag framing is RETIRED as the teach and
  replaced by increment H's dependency-layer-as-advantage — the honest upstream layers shown on the
  real map. The reframe lands in H's build, not a rewrite of this record. See
  [`act2-guided-forest`](act2-guided-forest.md).)*
  *(Steps 1–2 reshaped — ADR-0153, 2026-07-04: this bullet records the FIRST walk's beat framing.
  ADR-0153 reshapes what steps 1–2 SHOW — step 1 becomes an OUTCOME BRIEF with an example carried by
  the session-orchestrator CHAT AT THE BOTTOM (not "seed→tree with a label" as the sole framing), and
  step 2 shows the orchestrator ROUTING the story to the drive machinery via a temporary top-left
  overlay. Beats 3 (branch/signed-proof — PRESERVED) and 5 (pull-back) stand; beat 4's teach is H's
  dependency-layer reveal. The reshape lands in the re-build over the real app UI, not a rewrite of this
  historical record.)*
- **The CTA is a continuation seam into "what's next".** The final state names the next step honestly:
  the mock website's Cart / Payments / Receipts cannot truly work without a backend, so the CTA poses
  the question increment H answers — the upstream database + backend the orchestrator will guide the
  user to ([`act2-guided-forest`](act2-guided-forest.md)). *(Reframed — ADR-0150, 2026-07-04:
  the CTA is a CONTINUATION SEAM where the ONE continuous walk flows on upstream into H, not a hand-off
  to a separate page or gated phase — "it shouldnt be separate".)* Until H lands, that seam resolves to
  the real product (get-involved / the repo / the studio pitch — per `info-pages-triage`'s outcome),
  honestly labelled: this was a diorama; the real thing is watched-live. Never a dead-end Next.
- **Diorama, not studio.** All data fictional (site-side, the Cohoot precedent) — including the
  orchestrator's scripted proposal exchange; no live store, no real corpus, no operable affordances
  beyond the walkthrough — the boundary (ADR-0056/0066/0093) holds by construction because the site
  only HAS the synced artifacts.
- **Increment coherence.** Beats may land incrementally (the director is data-driven): each merge
  ships a complete-so-far arc that still opens from the reused prompt + proposal and still ends on
  the "what's next" CTA — never a dead-end Next.

BUILD SHAPE: `storytree-web` repo work on its own rail, `frontend-builder` driving; the map layer
folds each `DirectorState.world` into a fresh `SceneInput` → the synced `buildScene` → the site's
2.5D SVG (client-side per beat, or per-beat scenes pre-rendered at build time — `worldSvg` is pure
string building, so either is viable; the builder's call, per ADR-0145). Map motion (viewBox
tweens, growth transitions, callout placement from per-element `data-id` geometry) is the site's
job; STATE is the proven engine's. **ADR-0153 additions:** the walk and the orchestrator surface
render with the REAL app's UI components (not bespoke chrome — literal reuse across the sync boundary
or faithful re-creation is an open build-time mechanism call; the site only HAS the synced `buildScene`
artifact); UI hides progressively (reveal as the walk earns it); the orchestrator CHAT sits AT THE
BOTTOM (as the real app) carrying step 1's outcome brief; and the drive-machinery OVERLAYS (step 2
top-left agent loop; steps 3–4 top-right CI/CD/gates/wiring) are TEMPORARY chrome ABOVE the map,
site-side content keyed by beat id (NOT engine structure — ADR-0153's authoring call), validated
against the director's exported contract by `act2-validate`.

## UAT (operator-attested)

1. **The reused prompt makes Act 2 the answer to Act 1.** _(witness: human)_ Act 1's storm terminal
   leads with **"build me a shopping website"**; arriving on the calm land, the walk reads as that
   SAME request answered — one prompt, two ways. **Success —** a first-time visitor recognises Act 2
   as the fix for the storm they just saw drown that exact request, not an unrelated new topic.
2. **The orchestrator's proposal is honest and meets the user where they are.** _(witness: human)_
   Before the beats, a short scripted orchestrator exchange proposes a **mock local website — no
   backend** — to validate the idea. **Success —** it reads as a felt planning/pushback moment (an
   agent scoping the work, not a passive caption); it is explicitly a MOCK (never pretends to be a
   working product), it does NOT lead with the backend, and it does NOT overwhelm — a vibe coder
   feels met, not lectured. The exchange is short (a few lines, not a wall of chat).
3. **The pacing inverts the storm.** _(witness: human)_ From the proposal, the walk advances ONLY on
   Next — one tap per beat, no auto-play; effort never exceeds one tap. **Success —** the visitor-paced
   Next gesture is the only input; the beat count is the owner's to tune at the gate (the director is
   data-driven), but each merge leaves a complete-so-far arc.
4. **Each beat lands its concept, growing the one website story.** _(witness: human)_ Guided by a
   callout anchored to the element being taught (and the orchestrator chat at the bottom for the
   opening brief), a non-expert reader can say back, per beat: this is the outcome I asked for, with an
   example (step 1's brief); the orchestrator is routing it into machinery that does the work (step 2);
   green means proven, not claimed (the branch beat); the whole thing fits on one calm screen (the
   pull-back) — and the tree they watch grow is the mock shopping website (Cart / Payments / Receipts),
   the proposal made real. (There is NO wrong-way-road "that road is wrong" teach — retired per ADR-0150
   §4; the dependency-layer-as-advantage is H's.)
5. **The thesis moments read.** _(witness: human)_ The walk happens on the real 2.5D map (the
   product's own look) shown through the real app's UI; the limb visibly greens WITH the signed-proof
   narration (never before); the pull-back forest is legible at a glance (green / sapling / withered).
6. **The CTA continues into "what's next".** _(witness: human)_ The arc ends by naming the next step:
   the mock website's Cart / Payments / Receipts cannot truly work without a backend, so the CTA
   poses "what's next" — the upstream database + backend (increment H) — as a CONTINUATION SEAM, not a
   hand-off to a separate page. **Success —** the seam is legible and honest (this was a diorama; the
   real thing is watched-live); until H lands it resolves to the real product / get-involved; no beat
   dead-ends.
7. **The path into the tutorial is cohesive — all in, no escape.** _(witness: human)_ From the finale,
   "show me the better way" leads STRAIGHT into the 2.5D tutorial — one click, no jarring
   3D-island-that-flips to 2.5D, no detour to a classic homepage. **Success —** the finale's copy reads
   as the agent addressing YOU (waiting on you, sensing your overwhelm, offering a better way that feels
   like playing a game); the transition into the walk is smooth and single-path; a capable visitor is
   offered NO escape — no "skip the intro" and no path to a classic/static front page (ADR-0153; the
   no-JS / reduced-motion a11y fallback still exists for those who need it).
8. **The surface is the real app's UI, revealed progressively (ADR-0153).** _(witness: human)_ Look at
   the walk and the orchestrator surface. **Success —** they read as the REAL storytree product's
   interface (the same UI components the desktop/web app uses), not bespoke website chrome; UI elements
   the walk has not yet reached are HIDDEN and appear as the walk earns them — the visitor is never
   dumped in front of the full interface at once.
9. **Step 1 is an outcome brief with an example, in the orchestrator chat (ADR-0153).** _(witness:
   human)_ Watch the opening. **Success —** the story is presented as an OUTCOME BRIEF carrying an
   EXAMPLE, ideally through the session-orchestrator CHAT AT THE BOTTOM (as the real app) — the visitor
   reads what they asked for and a concrete example, in the real chat surface, not as abstract "here is
   a young tree" prose.
10. **Step 2 shows the orchestrator routing to the drive machinery, as an HONEST TDD LOOP DIAGRAM
    (ADR-0153 / ADR-0157).** _(witness: human)_ After the brief, advance. **Success —** the walk shows
    what the orchestrator DOES with the story: it routes it to the drive machinery, depicted by a
    TEMPORARY overlay top-left — an overlay ABOVE the map, not drawn on it, that clears. The overlay is a
    DIAGRAM that shows a LOOP (not a list): write a failing test → the SYSTEM checks it really fails →
    write code → the SYSTEM checks it really passes → repeat. A newcomer reads it plainly ("one agent
    writes the tests, the other builds code to pass them") AND — the load-bearing point — understands the
    CHECK is done by the SYSTEM (storytree's referee), not an AI grading its own homework. The map stays
    the honest picture of the work.
11. **Steps 3–4 expand the drive machinery without overloading (ADR-0153).** _(witness: human)_ Advance
    through the steps that build out the drive machinery (CI/CD, devops, gates, wiring). **Success —**
    the deeper picture is shown via overlay diagram(s) (a second overlay, top-right, is fine), revealed
    scaffolded in an order a first-time viewer can hold — never dumped all at once; the deepest
    (backend/database) depth continues into increment H.
12. **The copy is plain, with no storm metaphor (ADR-0157).** _(witness: human)_ Read G's copy — the
    orchestrator's proposal lines, the beat narration, the overlays. **Success —** the language is plain
    and understandable to a newcomer dev / vibe coder (no unexplained jargon, no strained analogies); the
    word/analogy "storm" appears nowhere on any visitor-facing surface (Act 1 is described plainly where
    referenced — the swarm of agents / the chaotic terminals).
13. **The planted node lands `proposed`, and the orchestrator reads as OUR system (ADR-0157).** _(witness:
    human)_ Watch the plant-story beat and read the orchestrator's voice. **Success —** the first (mock
    website) node honestly enters `proposed` (not instantly green, not silently building) and greens only
    when a signed proof lands (the branch beat); the scripted orchestrator reads as storytree's ACTUAL
    session orchestrator, not a generic coding agent — the visitor understands they are watching storytree
    work.
14. **The wisp moves (ADR-0157).** _(witness: human)_ Watch the watch-a-wisp beat. **Success —** the wisp
    MOVES — it drifts/travels rather than sitting as a static dot; it reads as living presence over the
    tree (presence without obligation — the visitor does nothing and that is the point).
