---
id: "act1-terminal-storm"
tier: capability
story: website-experience
title: "Act 1 — one prompt breeds the diegetic terminal storm"
outcome: "On the live home page, one visitor gesture breeds the storm: a single retro CRT terminal already logged into a coding agent takes ONE prompt (suggested chip or typed — the gesture unlocks audio); the agent thinks, then spawns sub-agents that BECOME new terminals (diegetic multiplication), tiling and overlapping toward a ~10–12 window peak, each streaming plausible-but-opaque activity and parking on an unanswerable demand, under an arcade HUD `AGENTS: n ▲` — plain DOM/CSS + canvas grain + Web Audio, no WebGL bytes."
status: proposed
proof_mode: operator-attested
depends_on: [experience-rollout-guardrails]
decisions: [134]
# OPERATOR-ATTESTED (ADR-0070) — web-repo work. The storm lands in storytree-web (a separate public
# repo, its own CD; branch off ITS origin/main), which is NOT a pnpm workspace member, so the parent
# spine cannot observe a red→green inside it — and the storm's real risk is FEEL (pacing, overwhelm,
# audio, the diegetic reading), which no machine can honestly judge. Its machine floor is owned
# upstream by `experience-rollout-guardrails` (`check:web-experience`: the skip + fallback markers
# present, no static R3F reachability from Act 1; ARMED by `data-experience-entry` on the entry
# page — this cap ships all three markers together) — do NOT duplicate those assertions here. NO
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

## As built (web main `3e53f14`)

Real `file:line` into the pinned `web/` tree (paths relative to the submodule root):

- **The entry page carries all THREE markers physically in its own source** (learning: the
  upstream gate greps the entry page's text, then walks imports — a refactor that moves one marker
  into a child component un-arms or reds `check:web-experience`): `data-experience-entry` on the
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

## Guidance

THE DRAMATURGY (ADR-0134 §1, owner decisions 2026-07-02 — the spec of the feel):

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
  increment's markup — the upstream gate refuses the merge without them. `prefers-reduced-motion`
  visitors are never played the storm at all. The entry page also declares
  **`data-experience-entry`** (the adoption marker that ARMS `check:web-experience` — as built,
  the gate SKIPs until a `src/pages/` page carries it, then fails closed; all THREE markers land
  together or the wall never stands watch).
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
> machine floor is additionally held by `check:web-experience`, ARMED + OK against the parent's
> `web/` pin.

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
