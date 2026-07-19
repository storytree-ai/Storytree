---
id: "storm-to-forest-inflection"
tier: capability
story: website-experience
title: "The inflection — one calm tap transforms the storm into soil and wakes the 3D land"
outcome: "At peak overload the storm dims and ONE calm storytree affordance appears amid the noise; a single click TRANSFORMS rather than navigates — the terminals fall silent, collapse, and their fragments drop into the ground as soil — while the R3F bundle lazy-loads behind the exhale (ssr:false, dynamic import only), and silence resolves into the calm, EMPTY 3D land the walkthrough will grow on."
status: proposed
proof_mode: operator-attested
depends_on: [act1-terminal-storm, web-experience-sync]
decisions: [216, 123]
# OPERATOR-ATTESTED (ADR-0070) — web-repo work; the transform is a felt, choreographed moment no
# machine can honestly judge. Its machine floor lives upstream: `check:web-experience` holds the
# lazy-load wall (the R3F island is reachable from Act 1 ONLY behind a dynamic import — a static
# chain reds the gate), and the extended `check:web-engine` holds that the R3F island it mounts is
# the byte-fresh synced artifact. NO `proof:` block — witnessed, not `--real`-built. This is also
# the FIRST mount of the R3F island on the public site (client-only, non-SSR, ADR-0123 §3): the
# island mount is deliberately FOLDED INTO this capability rather than split out, because the
# inflection IS the moment the island enters the experience — an island mounted anywhere else would
# violate the no-WebGL-in-Act-1 wall.
---

# The inflection — one calm tap transforms the storm into soil and wakes the 3D land

**Outcome —** At peak overload the storm dims and ONE calm storytree affordance appears amid the
noise; a single click **TRANSFORMS rather than navigates** — the terminals fall silent, collapse,
and their fragments drop into the ground as **soil** — while the **R3F bundle lazy-loads behind the
exhale** (`ssr:false`, dynamic import only), and silence resolves into the calm, **EMPTY** 3D land
the walkthrough will grow on.

**Depends on —** [`act1-terminal-storm`](act1-terminal-storm.md) — there is no peak to transform
without the storm; [`web-experience-sync`](web-experience-sync.md) — the R3F island it lazy-loads
must already be on the site as the synced artifact.

> **Proof status (honest) — BUILT + OWNER-ATTESTED, LIVE (2026-07-02); the authored status stays
> `proposed`.** Built by the `frontend-builder` in `storytree-web` (branch
> `claude/storm-to-forest-inflection`, witnessed @ `2869504` on PR #19 with a 10/10 parent-side
> Playwright behaviour witness), then **attested by the owner — HuaMick, 2026-07-02** (agent-relayed
> scribe per ADR-0044 §4; the declared-witness `operator-attested` verdict of ADR-0082): UAT legs
> 1–4 below witnessed on the local preview (:4321) at that SHA — the dim + the ONE calm affordance
> at peak, the click that transforms in place (audio decaying rather than cutting, terminals
> collapsing, phosphor fragments falling as soil, the land fading up as one continuous moment),
> DevTools confirming the R3F chunks were first fetched AT the click, and the empty navigable land
> with the interim CTA. The attestation is recorded as an owner comment on storytree-web PR #19,
> squash-merged → web main `6546486`: **the inflection is live behind the storm's calm card** (CD
> green; markers + no eager R3F verified on the live site). The parent pins `web/` @ `6546486`;
> `check:web-experience` / `check:web-engine` / `check:web-grounding` witnessed OK against the
> pinned tree. The feel was human-judged end to end; nothing here is self-signed (ADR-0070).

## As built (web main `6546486`)

Real `file:line` into the pinned `web/` tree (paths relative to the submodule root):

- **The calm card's button became the transform** (`src/pages/index.astro:141`,
  `data-storm-transform`): the engine binds it (`src/scripts/act1-storm.ts:321`), while the
  pre-paint inline script keeps owning skip / `Escape` / the classic-view exit
  (`data-storm-disarm`) — the way out works even if the engine module never loads. All three
  `data-experience-*` markers stay physically in the entry page's own source (entry `:74`, skip
  `:78`, fallback `:178`) — the upstream gate greps the page text, so a refactor that moves one
  into a child component un-arms or reds it.
  *(Correction 2026-07-03, web main `281b1e6`: Act 1's owner-directed finale rework replaced the
  calm card with the diegetic finale terminal `#storm-finale` — `data-storm-transform` now lives
  on its primary option (`src/pages/index.astro:153`, engine binding re-homed) alongside an
  external ghost exit. This cap's transform choreography is UNCHANGED; only the trigger's host
  moved. See `act1-terminal-storm` "As built — the finale rework".)*
- **One click starts the load AND the exhale together** (`src/scripts/act1-storm.ts:486`):
  `import('./inflection')` is the ONLY route to R3F — the dynamic-import seam
  `check:web-experience` sanctions, no prefetch, so the first fetch happens AT the click (UAT 3);
  `StormAudio.quell()` decays the soundscape over ~1.6s rather than cutting (`:491`; `:213` —
  `halt()` stays the hard stop); terminals CRT-power-off in a 62 ms stagger (`COLLAPSE_STAGGER`,
  `:28`); up to 88 seeded WAAPI phosphor fragments fall from the collapsing terminals into a
  scaleY soil mound (`FRAG_CAP`, `:29`).
- **The land resolves only when BOTH the import and the settle beat are done**
  (`Promise.all([islandReady, beat])`, `src/scripts/act1-storm.ts:570`; `SETTLE_BEAT` 2800 ms,
  `:30`): a fast network waits for the choreography, a slow one gets the graceful resting-soil
  posture — then the `is-resolved` fade-up + focus handoff (`:579`–`:583`). An import rejection
  logs one console line and gracefully disarms to the calm view.
- **The mounted island is the synced artifact, filtered EMPTY** (`src/scripts/inflection.tsx`):
  `mountForestLand(container) → { unmount() }` (`:98`, handle `:88` — `halt()` tears the island
  down with the timers and fragments) renders a hand-authored one-territory `'proposed'`
  `SceneInput` (`:51`) through the synced `src/lib/forest-world-r3f/` copies (`@generated` ×4:
  `index.ts`, `world-to-3d.ts`, `ForestWorldCanvas.tsx`, `act2-director.ts`) and filters
  descriptors to `hex-ground` only (`:100`; witnessed log `hex-ground 19 · story-tree 0 · …`,
  `:105`) — the land resolves empty of story nodes because ground REQUIRES a territory and a
  territory always emits a tree; the emptiness is a surface filter. *(How the walkthrough grows
  the land was re-decided 2026-07-03 — ADR-0145: the walk happens on the real 2.5D map, not this
  R3F island; the island stays this cap's attested landing moment, and the landing→2.5D-walk
  handoff is `act2-guided-walkthrough`'s design seam.)*
- **The empty land carries the interim CTA** (`src/pages/index.astro:161`–`168`): how-it-works /
  get-involved links + the classic-front-page exit via the existing disarm — a mid-arc visitor is
  never stranded (owner decision 6).
- **The first site-side R3F sync + deps landed with this cap** (commit `bb6884a`): `three` /
  `@react-three/fiber` / `@react-three/drei` / `zod`, with `react` + `react-dom` promoted to
  runtime dependencies (`package.json:19`–`25`); the public build compiles the `.tsx` island via
  `vite.esbuild { jsx: 'automatic', jsxImportSource: 'react' }` (`astro.config.mjs:52`) — Astro's
  base tsconfig `jsx: "preserve"` otherwise silently degrades to the classic transform and the
  chunk throws at runtime while the build stays green; the walkthrough inherits this setting.

## Guidance

THE CHOREOGRAPHY ([ADR-0216](../../docs/decisions/0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md) D3–D4 — the spec of the moment):

- **The affordance appears AT peak, not before.** The storm must be fully felt first; the dimming +
  the single calm affordance are the reward for having been buried. One affordance only — amid ten
  screaming terminals there is exactly one quiet thing to do, and it is obvious.
- **Transform, not navigate.** The click never changes URL context mid-gesture (no page swap the
  visitor perceives): terminals fall silent (audio decays, not cuts), collapse, and their fragments
  fall INTO the ground — the noise literally becomes the soil/seed of the calm world that fades up.
  The continuity is the argument: the calm world is built out of the same stuff, re-ordered.
- **The exhale buys the load.** The R3F bundle starts loading on the click (dynamic `import()` —
  the sanctioned seam `check:web-experience` recognises); the collapse/quiet beat is long enough to
  hide a realistic fetch on an ordinary connection, with a graceful still-loading posture (the
  soil rests) if the network is slower. Optionally prefetch on peak-reached; never load in Act 1.
- **It resolves EMPTY.** The land after the transform carries no story nodes — beat 1 of Act 2
  plants the first. Until `act2-guided-walkthrough` lands, the empty calm land carries the interim
  CTA/links (increment coherence, owner decision 6) so a visitor who arrives mid-arc is never
  stranded.
- **The island is the synced artifact.** The mounted canvas imports ONLY from the synced
  `web/src/lib/forest-world-r3f/` + `web/src/lib/forest-world/` copies (`@generated`) — never a
  re-implementation. The no-WebGL / reduced-motion fallback path bypasses the storm AND the
  transform entirely (straight to the static calm view — the same destination, bought statically).

BUILD SHAPE: `storytree-web` repo work on its own rail, `frontend-builder` driving; the collapse
animation is DOM/CSS (it animates Act 1's own elements), the fade-up is the island's first render.

## UAT (operator-attested)

> **ATTESTED — all four legs witnessed by the owner (HuaMick), 2026-07-02**, on the local preview
> (fresh `npm run build` + `npx astro preview --host 127.0.0.1`, :4321) at `2869504`, squash-merged
> to web main as `6546486` and live since; the record is an owner comment on storytree-web PR #19
> (agent-relayed per ADR-0044 §4). Leg 3's machine floor is additionally held by
> `check:web-experience` (the lazy-load wall) and the 10/10 Playwright behaviour witness (zero R3F
> pre-click; chunks first fetched at the click), both OK against the parent's `web/` pin.

1. **The dimming and the one calm thing.** _(witness: human)_ At peak, the storm dims and exactly
   one calm storytree affordance appears; it reads as the obvious way out, not another demand.
2. **The transform.** _(witness: human)_ One click: terminals silence and collapse, fragments drop
   into the ground as soil, the calm land fades up — perceived as one continuous transformation in
   place, not a navigation; audio resolves to quiet rather than cutting.
3. **The load hides in the exhale.** _(witness: human)_ On an ordinary connection the 3D land is
   ready as the quiet resolves (or a graceful resting-soil posture covers a slow fetch); DevTools
   confirms the R3F chunks were first fetched at the click, never during Act 1.
4. **The empty land is coherent.** _(witness: human)_ The resolved land is calm, empty of story
   nodes, navigable (drei MapControls), and — until Act 2 lands — carries the interim CTA/links so
   the increment leaves the live site whole.
