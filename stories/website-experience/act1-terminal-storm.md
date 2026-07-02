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

> **Proof status (honest) — `proposed`, operator-attested (ADR-0070).** A felt overwhelm cannot be
> machine-driven or self-attested; an agent can never self-exempt a surface to `healthy` (ADR-0044).
> The machine-checkable floor (skip/fallback markers, the no-WebGL wall) is deliberately homed
> upstream in `check:web-experience`; what remains here is exactly the human-judgement surface.

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
