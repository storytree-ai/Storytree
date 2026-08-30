---
id: "act1-terminal-storm"
tier: capability
story: website-experience
title: "Act 1 — one prompt breeds the diegetic terminal storm"
outcome: "On the live home page, one visitor gesture breeds the storm: a single retro CRT terminal already logged into a coding agent takes ONE prompt (suggested chip or typed — the gesture unlocks audio); the agent thinks, then spawns sub-agents that BECOME new terminals (diegetic multiplication), tiling and overlapping toward a ~10–12 window peak, each streaming plausible-but-opaque activity and parking on an unanswerable demand, under an arcade HUD `AGENTS: n ▲` — plain DOM/CSS + canvas grain + Web Audio, no WebGL bytes."
status: proposed
proof_mode: operator-attested
depends_on: [experience-rollout-guardrails]
decisions: [216, 466]
# ⚠ CORRECTED 2026-08-31 (`prove-unproven-capabilities-arc-inc-25`) — THIS CAPABILITY IS SPLIT, AND ONLY
# ONE HALF WAS EVER A JUDGMENT GAP. Swept into ADR-0465 D1's second pile as "not capability-shaped"; that
# filing collapsed two unrelated reasons into one label, and the increment's own premise correction
# withdraws it. Read the two halves separately:
#   • THE FELT HALF stays PERMANENTLY HUMAN. Whether the storm actually OVERWHELMS, whether the CRT
#     surface reads retro, whether the chatter reads plausible-but-opaque, whether the pacing and the
#     audio mix land — these have no compiler at any tier, now or as models improve (ADR-0410 D5). They
#     are `human-witness-is-a-judgment-gap-not-cost`'s genuine case and nothing here changes them.
#   • THE CHECKABLE HALF is CROSS-REPO, and its route is now SETTLED. That the send unlocks audio, that
#     sub-agents spawn AS terminals, that the count tiles to the ~10-12 cap under `AGENTS: n ▲`, that no
#     further visitor input is required, that a reduced-motion visitor is never played the storm — every
#     one is a byte-level observable a headless browser can decide. The only reason our gate cannot sign
#     it is that the acts live in `storytree-web`, a separate repo that is not a pnpm workspace member,
#     which is a COST rather than a judgment gap. ADR-0466 (accepted 2026-08-27, owner-answered *"just
#     trust its result"*) settles it: the outside system publishes its own pass/fail where our build can
#     read it, and a FRESH GREEN published result earns a signed verdict (D1); D2 applies it to exactly
#     this cross-repo shape, D3 refuses standing a live site preview up inside every build run. The six
#     `website-experience` machine legs ADR-0466 names by number (1, 4, 6, 8, 10, 13) are what this half
#     of the capability feeds.
# ⚠ NOTHING IMPLEMENTS ADR-0466 YET AND NO ARC OWNS IT (searched 2026-08-31). The route is POLICY, not a
# mechanism — publishing format, transport and provenance are all explicitly undecided (D5). So NOTHING
# HERE CHANGES TIER, MODE OR STATUS: `proof_mode` stays `operator-attested`, there is still NO `proof:`
# block and NO `real:` arm, and none may be authored. THIS IS NOT A RETIREMENT: the built Act 1
# experience is live and owner-attested, and retiring it would discard an answer the owner has given.
# Only the recording is the work.
# OPERATOR-ATTESTED (ADR-0070) — web-repo work. The storm lands in storytree-web (a separate public
# repo, its own CD; branch off ITS origin/main), which is NOT a pnpm workspace member, so the parent
# spine cannot observe a red→green inside it — and the storm's real risk is FEEL (pacing, overwhelm,
# audio, the diegetic reading), which no machine can honestly judge. Its machine floor is owned
# upstream by `experience-rollout-guardrails` (its judge: the skip + fallback markers present, no
# static R3F reachability from Act 1; ARMED by `data-experience-entry` on the entry page — this cap
# ships all three markers together) — do NOT duplicate those assertions here. That floor is now LIVE
# across two gate rungs: `check:web-experience-closure` (ADR-0336) holds the no-static-R3F wall, and
# `check:web-experience-markers` (ADR-0454) holds the skip/fallback marker-presence contract — the
# combined `check:web-experience` rung itself stays retired (ADR-0311 D2) and unwired. NO
# `proof:` block — operator-attested capabilities are witnessed, not `--real`-built. The
# frontend-builder is the inner-loop role; the owner witnesses on the live/preview site; appearance
# is never self-signed.
---

# Act 1 — one prompt breeds the diegetic terminal storm

**Outcome —** On the live home page, one visitor gesture breeds the storm: a single retro CRT
terminal already logged into a coding agent takes ONE prompt (suggested chip or typed — the gesture
unlocks audio); the agent "thinks," then spawns sub-agents that BECOME new terminals, tiling and
overlapping toward a **~10–12 window peak**, each streaming plausible-but-opaque activity and
parking on an **unanswerable demand**, under an arcade HUD **`AGENTS: n ▲`** — plain DOM/CSS + a
canvas grain pass + Web Audio, **no WebGL bytes**.

**Depends on —** [`experience-rollout-guardrails`](experience-rollout-guardrails.md) — the storm may
only replace the live home once the calm exits are machine-guarded (owner decision 6: real visitors
hit every increment). This is also THE HOME FLIP increment: `index.astro` becomes the storm, an
owner call on "presentable" (a HALT point, story open call 5).

> **RE-SPEC SCOPE — the "storm" METAPHOR retires from visitor-facing copy (ADR-0157, owner-directed at
> the H BUILD #2 gate 2026-07-05; the LOOK re-opens toward `building` for the copy, the built experience
> STANDS).** The owner now dislikes the "storm" analogy and directed it removed from ALL surfaces
> (a re-decision — it was previously loved and attested). WHAT CHANGES: the storm ANALOGY/word retires
> from Act 1's **visitor-facing copy** (the diegetic terminal chatter, any label or narration a visitor
> reads) and from forward-looking descriptive prose; Act 1 is described plainly — the overwhelming swarm
> of coding agents, the chaotic pile of terminals, agents spawning agents until you cannot read any of
> them (the plain description of the FELT experience IS the teach; the metaphor was never load-bearing).
> WHAT DOES NOT CHANGE: Act 1's BUILT EXPERIENCE (terminal chaos → finale concession → transform to soil)
> stays exactly as built and live; the cap ID `act1-terminal-storm` stays (an internal handle the visitor
> never sees — the owner's "all surfaces" targets visitor-facing copy, not the machine id; renaming a
> `--real`-adjacent cap id cascades and is a known merge-conflict trap, so it is out of scope here);
> the "As built" records below stay TRUE HISTORY intact (copy-on-write) — their historical "storm" prose
> is preserved as the account of what was built, not scrubbed. Per `defects-amend-the-owning-story` the
> copy edit reverts this cap toward `building` and re-earns `healthy` on the storm-metaphor-free copy
> through the gate; `healthy` is earned through the gate, never authored (ADR-0020). The chatter fiction
> stays plain/opaque and jargon-light (`plain-language-first`) — it still DRAMATIZES the evidence base,
> never cites statistics.
>
> **As built (2026-07-05, web main `d761eadc`, live at https://crisp-globe-bf6v.here.now/) — the storm-
> analogy scrub LANDED + OWNER-ATTESTED AS A STEP FORWARD.** Act 1's visitor-facing copy no longer names
> the "storm" metaphor: the cumulative Act 2 build (storytree-web PR #26, both CD runs green; parent `web/`
> pin bumped `8f4e166c` → `d761eadc`) de-storms the shared surfaces — `web/src/pages/index.astro`'s two
> Act-1 aria-labels read "swarm", and `act2-narration.ts` no longer opens on "The storm settles into soil"
> (`INTRO` reworded). Act 1's BUILT EXPERIENCE (terminal chaos → finale concession → transform to soil) is
> UNCHANGED and live as before; only the naming retired. The owner attested this as a STEP FORWARD
> (verbatim: *"This is also a step forward, so land it"*). Scoping LEFT to the owner's call (flagged, not
> enacted): the cap id / `title:` / `outcome:` internal handles keep "storm" (machine handles the visitor
> never sees), and `/how-it-works` mock-data "reconnect storm" is a NETWORKING term (`info-pages-triage`
> territory), not the metaphor. *(The mock-data half of that flag is now CLOSED — scrubbed 2026-07-06
> via ADR-0167 rider (b), the executed triage, web main `be960873`: `mockSystem.json`'s networking
> jargon reads plainly ("Recovering dropped connections", "Keeping up under load", the rowan session →
> "fixing the Monday outage"); Cohoot fiction, statuses, and DAG shape intact. The internal-handles
> half stays as decided — the ids keep "storm" per ADR-0157 §2.)* This LOOK is NOT terminally closed (a further redesign is directed); the
> "As built" records below keep their historical "storm" prose as true history (copy-on-write). The
> authored `status:` stays `proposed`.

> **Proof status (honest) — BUILT + OWNER-ATTESTED, LIVE (2026-07-02); the authored status stays
> `proposed`.** Built by the `frontend-builder` in `storytree-web` (branch
> `claude/act1-terminal-storm`, witnessed @ `796d65a` on PR #18 with 23/23 parent-side Playwright
> behaviour checks), then **attested by the owner — HuaMick, 2026-07-02** (agent-relayed scribe per
> ADR-0044 §4; the declared-witness `operator-attested` verdict of ADR-0082): UAT legs 1–4 below
> witnessed on the local preview (:4321), including the first human ears on the audio mix — the
> boot, the send unlocking audio, the 12-window peak parked on demands under `AGENTS: 12 ▲`, the
> dim + calm card, the skip mid-storm, and the reduced-motion calm view — plus the home-flip
> "presentable" call (story open call 5: DONE). The attestation is recorded as an owner comment on
> storytree-web PR #18, squash-merged → web main `3e53f14`: **the storm IS the live front door**
> (CD green; all three markers verified on the live site). The parent pins `web/` @ `3e53f14`,
> arming `check:web-experience` in CI — witnessed ARMED + OK against the pinned tree. The feel was
> human-judged end to end; nothing here is self-signed (ADR-0070).

> **⚠ CORRECTION 2026-08-31 — THE CAPABILITY IS TWO HALVES, AND THE CHECKABLE HALF'S PROOF ROUTE IS NOW
> SETTLED AND UNBUILT (`prove-unproven-capabilities-arc-inc-25`; noted in place per ADR-0139).** The
> record above reads as though `operator-attested` were the whole and permanent answer for this
> capability. It is the right answer for only one of the two things this node claims, and the other's
> route has since been decided.
>
> - **FELT HALF — permanently human, unchanged.** The overwhelm, the retro CRT read, the
>   plausible-but-opaque chatter, the pacing, the audio mix. No compiler exists for any of them at any
>   tier and none is coming: ADR-0410 D5 keeps taste permanently human, licensing no machine to judge
>   whether something looks or feels right "now or as models improve". UAT legs 1–4 below are this half
>   and stay exactly as written, witnessed by a person on the live site. The story's own
>   [`## The felt thesis`](story.md) items 1 and 2 hold the same claims at story tier.
> - **CHECKABLE HALF — cross-repo, and ADR-0466 settles how it reaches our proof.** Audio silent before
>   the send and an audio context running after it; sub-agents spawning AS terminals rather than the
>   visitor opening them; the tile to the ~10–12 seeded cap with `AGENTS: n ▲` tracking it; every
>   terminal parked on a demand; zero further visitor input between the send and the peak; the
>   reduced-motion / no-JS visitor never being played the storm. Every one is a byte-level observable a
>   headless browser decides, and the web repo's OWN Playwright suite has already exercised most of them
>   (23/23 at `796d65a`). The only obstacle was ever the boundary: `storytree-web` is not a pnpm
>   workspace member, so the parent prove-it-gate cannot run red→green inside it — a COST, not a judgment
>   gap (`human-witness-is-a-judgment-gap-not-cost`). **ADR-0466 (accepted 2026-08-27) decides the
>   carry:** the outside system publishes its own pass/fail where our build can read it, and a FRESH
>   GREEN published result earns a signed verdict (D1); D2 applies it to this cross-repo shape; D3
>   refuses the alternative of standing a live preview up inside every build run. The owner's answer was
>   verbatim *"just trust its result."* This closes the story's open modeling call 6.
>
> **⚠ NOTHING IMPLEMENTS ADR-0466 AND NO ARC OWNS IT** (searched 2026-08-31). It is POLICY, not a
> mechanism: publishing format, transport, and which of the site's remaining legs are in scope beyond the
> six named are all left undecided (D5), and D4's three fences — the result must NAME THE COMMIT it
> observed, ABSENCE FAILS CLOSED, PROVENANCE RIDES THE VERDICT — must be built, not assumed. **So nothing
> here changes today:** `proof_mode` stays `operator-attested`, this capability still carries NO `proof:`
> block and NO `real:` arm, and none may be authored on the strength of a route that does not exist.
> Chartering that build lane is real work nobody has taken. **AND THIS IS NOT A RETIREMENT** — the built
> experience is live and owner-attested; the "not capability-shaped" filing this node briefly carried is
> withdrawn.

## As built (web main `3e53f14`)

Real `file:line` into the pinned `web/` tree (paths relative to the submodule root):

- **The entry page carries all THREE markers physically in its own source** (learning: the
  upstream judge greps the entry page's text, then walks imports — a refactor that moves one marker
  into a child component un-arms or reds it; that verdict no longer reaches a merge, since ADR-0311
  D2 retired the `check:web-experience` rung): `data-experience-entry` on the
  storm section (`src/pages/index.astro:74`), the persistent skip control `data-experience-skip`
  (`:78`, doubling as a `data-storm-disarm` target), the calm view `data-experience-fallback`
  (`:147`) — today's home content byte-for-byte (Keystatic `home.json` + TreeWorld untouched).
- **Arming is pre-paint and calm-by-default** (`src/pages/index.astro:31`, `is:inline`): the storm
  arms only for motion-OK, JS-on visitors (`:35`); `prefers-reduced-motion` and no-JS visitors get
  the calm view and are never played the storm. The disarm path (skip / calm affordance / `Escape`,
  `:41`–`:67`) lives in the same inline script, so the exit works even if the engine module never
  loads.
- **The plan is pure and SEEDED** (`src/scripts/storm-script.ts`): `STORM_SEED` fixed at `:16` —
  the same storm on every load, which is also the owner's returning-visitor call as built (replay
  every visit; the skip is not remembered) — `mulberry32` PRNG `:18` (no `Math.random`),
  `buildStormPlan` `:305` (deterministic, testable without a browser), 11 sub-agent `ROLES` + the
  boot terminal = the 12-window hard cap (`:68`), every terminal parking on an unanswerable demand
  with the boot parking LAST on `awaiting instructions` (`:60`).
- **The engine is one rAF loop, no WebGL bytes** (`src/scripts/act1-storm.ts`): `runStorm()`
  `:270`, the single full-viewport grain canvas `:215`, synthesized Web Audio created/resumed only
  inside the send gesture (`unlock()` `:39` — silence before), `window.__stormHalt` registered for
  the disarm seam (`:490`).
- **Choreography witnessed:** send → first sub-agent ≈ 4s → 12-window cap ≈ 27s → boot parks last
  ≈ 34s → dim + the one calm card ≈ 37s (`data-calm-affordance`, `src/pages/index.astro:134` — for
  this increment it resolves like the skip; the transform is `storm-to-forest-inflection`'s job).
- **Deferred by design to the inflection:** the transform/collapse/soil moment, the R3F island,
  and the site-side r3f sync — the storm ships zero WebGL, as the upstream wall demands.

## As built — the finale rework (web main `281b1e6`, 2026-07-03, owner-directed)

The owner re-directed Act 1's ending and escape hatch in-session (2026-07-03); built by the
`frontend-builder`, audited + independently re-witnessed (23/23 Playwright checks + mobile fit),
**attested by the owner** ("amazing, land this" — recorded as an owner comment on storytree-web
PR #21, agent-relayed per ADR-0044 §4 / ADR-0082), squash-merged → web main `281b1e6`, CD green,
live. Supersedes the calm-card details of the `3e53f14` section above:

- **The escape hatch dropped the storm analogy**: the persistent skip control now reads
  `show me a better way →` (`src/pages/index.astro:79`) — text only; href, both markers, and the
  engine-independent inline disarm path are unchanged.
- **The calm card became the finale terminal** (`#storm-finale`, `src/pages/index.astro:142`):
  at peak the scene still dims, but the affordance is now diegetic — a larger `swarm — root`
  terminal CRT-powers-on above the dimmer and streams a seeded 8-line concession
  (`FINALE_LINES` / `buildFinalePlan`, `src/scripts/storm-script.ts:441`/`:466` — pure,
  `mulberry32`, same fiction discipline: no real products named in the stream), ending on the
  offer pill `want me to show you?`. `data-calm-affordance` is gone (nothing machine-held it).
- **The ending is now a two-option fork**, revealed only after the stream lands
  (`src/pages/index.astro:153`): `show me the better way →` carries `data-storm-transform` (the
  inflection trigger — `storm-to-forest-inflection`'s transform is unchanged, just re-homed), and
  `i'm fine with this` — a ghost anchor to `https://claude.com/product/claude-code`, the
  owner-sanctioned joke exit (the one real-product reference, living only as the link's
  destination, never in the streamed fiction).
- **Choreography witnessed:** …boot parks last ≈ 34s → dim → finale terminal powers on → ~10s
  stream → the two options fade in (status flips to blinking `waiting on you`); the finale joins
  the transform's collapse with the same CRT power-off. Skip / `Escape` / reduced-motion / no-JS
  exits all re-witnessed intact; the finale streams on the engine's single rAF loop
  (`streamFinale`, `src/scripts/act1-storm.ts:475`).

## Guidance

THE DRAMATURGY (ADR-0216 D2 — the spec of the feel):

- **One gesture, then the machine takes over.** The visitor sends ONE prompt and never works again
  in Act 1 — every subsequent terminal is an agent's doing (diegetic multiplication: agents spawning
  agents, never the visitor opening windows). This is half of the story's thesis gesture; Act 2's
  Next-tap is the other half. If a build makes the visitor click to spawn, it has broken the
  argument, not just the design.
- **The prompt is the audio gesture.** Web Audio unlocks on the send (the browser-required user
  gesture); the cacophony grows with the terminal count. Before the send: silence.
- **Plausible-but-opaque, parking on unanswerable demands.** Each terminal streams
  authentic-looking agent chatter that never quite says what it did, and ends held: `awaiting
  instructions`, `Postgres or SQLite? (y/n)`, `force-push to main? [y/N]`. The chatter corpus is
  SITE-SIDE FICTIONAL CONTENT (the Cohoot precedent) *derived from* the evidence base — the D-group
  gripes (terminal sprawl, babysitting, done-vs-in-flight unknowable) and A/B texture in
  [vibe-coding-gripes-2026.md](../../docs/research/vibe-coding-gripes-2026.md) — it DRAMATIZES the
  evidence, it never cites statistics (asserted claims belong to grounded copy under
  `check:web-grounding`, not to the storm).
- **The HUD gamifies the descent.** `AGENTS: n ▲` rises like a score — your rising score IS the
  drowning. Retro-arcade CRT styling: scanlines/bloom via ONE canvas grain pass, not per-terminal
  filters.
- **Peak ≈ 10–12 windows: overwhelm, not browser-melt.** The cap is a hard ceiling; the feel at
  peak is "I cannot read this anymore," never jank. Cheap DOM: the terminals are styled divs with
  scripted text streams — no xterm, no WebGL, no heavy deps.
- **The exits stay live.** The persistent skip control (`data-experience-skip`) and the
  reduced-motion / no-WebGL static-calm fallback (`data-experience-fallback`) ship IN THIS
  increment's markup — the upstream guard refused the merge without them until ADR-0311 D2 retired
  its rung; keeping them is now discipline plus the owner's decision 6, not a machine floor.
  `prefers-reduced-motion` visitors are never played the storm at all. The entry page also declares
  **`data-experience-entry`** (the adoption marker that ARMS the judge — as built, it SKIPs until a
  `src/pages/` page carries it, then fails closed; all THREE markers land together or the wall never
  stands watch — and today it stands watch only when invoked by hand).
- **Interim coherence.** Until `storm-to-forest-inflection` lands, the storm's calm affordance and
  the skip both resolve to the static calm fallback + the existing site pages — coherent, just not
  yet transformative.

BUILD SHAPE: work happens in the `storytree-web` repo on its own rail; the `frontend-builder` role
drives, using the web repo's own dev/preview to iterate. Whatever unit tests the web repo's own
toolchain can hold (e.g. the spawn-schedule cap logic as a plain function) are encouraged but are
NOT parent-spine proof — the honest verdict here is the witnessed one.

## UAT (operator-attested)

Human-witnessed legs on the live/preview site (an agent may stage; a human renders the verdict):

> **ATTESTED — all four legs witnessed by the owner (HuaMick), 2026-07-02**, on the local preview
> (`npm run preview`, :4321) at `796d65a`, squash-merged to web main as `3e53f14` and live since;
> the record is an owner comment on storytree-web PR #18 (agent-relayed per ADR-0044 §4). Leg 4's
> machine floor was additionally held by `check:web-experience`, ARMED + OK against the parent's
> `web/` pin at that time; ADR-0311 D2 has since retired that rung (see
> [`experience-rollout-guardrails`](experience-rollout-guardrails.md)).

1. **The boot.** _(witness: human)_ Fresh visit: ONE CRT terminal, already logged into a coding
   agent, suggested prompt chips + a type-in line, silence. Nothing else moves.
2. **The send.** _(witness: human)_ Send one prompt (chip or typed). Audio unlocks with the
   gesture; the agent visibly "thinks"; the first sub-agent terminals spawn AS terminals —
   readable as the agent's doing, not the site's.
3. **The descent.** _(witness: human)_ Terminals multiply and tile toward ~10–12 and STOP there;
   the HUD counts up; the soundscape thickens; every terminal ends parked on an unanswerable
   demand. The felt read at peak: illegible, demanding, yours-to-check — without a single further
   visitor input.
4. **The floor holds.** _(witness: human)_ CRT grain present; page stays responsive at peak on an
   ordinary laptop; `prefers-reduced-motion` visit gets the static calm view instead of the storm;
   the skip control is visible and present throughout. *(Marker presence + the no-WebGL wall are
   the upstream machine gate — this leg witnesses the lived versions.)*
