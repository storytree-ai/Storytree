# Studio 2D map — before/after capture of the `mapped` land colour (tan → clay)

## What changed
`apps/studio/src/index.css`, `.hex-territory.st-mapped` block — the four hex-top/hex-side custom
properties that colour a `mapped`-status island's GROUND tiles:

| var | before (tan) | after (clay) |
|---|---|---|
| `--hex-top-0` | `#b3946a` | `#b7684e` |
| `--hex-top-1` | `#a68557` | `#a95539` |
| `--hex-top-2` | `#bda278` | `#c1795e` |
| `--hex-side`  | `#85683f` | `#883d24` |

## How the BEFORE arm was produced
The dev server was left running throughout (Vite hot-reloads `src/index.css`, so no restart was
needed between arms). For the BEFORE arm the four values above were reverted with
`git apply -R` against a saved patch of the working tree's existing `index.css` diff, captured,
then restored with `git apply` from the same saved patch. Verified byte-identical:
`git diff apps/studio/src/index.css` before revert and after restore produced the exact same
patch (`diff <before-patch> <after-patch>` → empty). `apps/studio/src/index.css` is otherwise
untouched — every other line in the file's working-tree diff (this branch already carries an
unrelated forest-world-r3f `harness/` change set, see caveat below) was never touched by this
capture run. No source file besides that one CSS file was edited, and it was edited only inside
the two bracketing `git apply` calls, never left in the reverted state.

## Server / store / URL
- Dev server: `apps/studio`'s own `dev` script (`node --import tsx node_modules/vite/bin/vite.js`)
  run directly (not through `pnpm --filter studio dev --`, which mis-forwards `--` into vite's own
  argv on this pnpm version and gets the port ignored — ran the vite binary directly instead),
  bound to `127.0.0.1:5301` (`--port 5301 --strictPort`). An unrelated orphaned vite from a
  long-gone session was confirmed still listening on 5211 and left untouched; 5301 was free.
- Confirmed serving THIS worktree, not the 5211 orphan: `curl -s localhost:5301/src/index.css`
  showed `b7684e` present (AFTER) / absent (BEFORE) at the right moments, and
  `curl -s localhost:5301/api/health` reported `code.head = 1693f33e…` matching this worktree's
  HEAD.
- Store backend: **live Postgres** (the studio default, `STORYTREE_STUDIO_STORE` unset →
  `store: "pg"`, `db: "ok"` per `/api/health`). `pnpm db:up` was already up at session start
  (`RUNNABLE / ALWAYS`).
- Route captured: `http://127.0.0.1:5301/#/tree` (the main product map) for the overview/close
  pair, and `http://127.0.0.1:5301/?semanticGrowth=demo#/tree` (the query-gated
  `SemanticGrowthDemo` witness stage, see below) for the supplementary `*-demo-land.png` pair.
- Both dev-server processes (5301) were killed before finishing; `ss -ltnp` confirms port 5301 is
  free again.

## Viewport / zoom / scroll
- Viewport: **1600×1000**, `deviceScaleFactor: 1`, headless Playwright Chromium.
- `studio-2d-*-overview.png`: the app's own default FIT view on a fresh `#/tree` load — no pan, no
  zoom interaction. Captured via `captureSettledScreenshot` (reused from
  `apps/desktop/e2e/harness.mjs`, the same settled-attestation helper
  `capture:comparative` uses), so it's provably taken once
  `window.__storytreeMotionSettled` reports `settled: true` (see the `.settled.json` sidecar next
  to each PNG — `activeStructuralAnimations: 0`, `act2Regrowing: false`).
- `studio-2d-*-close.png`: from the same fresh fit view, the mouse was moved to a **fixed screen
  point** `(765, 355)` (a cluster of islands in the fit view — the `studio` / `studio-cloud` /
  `uat-attestation` / `library-tech-tree-overlay` / `context-traversal-*` neighbourhood) and 14
  identical `page.mouse.wheel(0, -120)` notches were dispatched (same target, same count, same
  order, 30ms apart) — the SAME sequence for both arms, on a freshly reloaded page each time (never
  reusing a page across the revert), then re-waited on the settled signal before capture.
- Reproducibility check: `readCameraTransform` (also reused from `harness.mjs`) was read after
  every fit and every zoom, for both arms. The AFTER and BEFORE runs produced **byte-identical**
  camera transforms:
  - overview: `translate(516.6473988439307 40) scale(0.2396216500262743)` (both arms)
  - close: `translate(-178.11858958982498 -841.2119757872106) scale(0.9099628172041939)` (both arms)

  So the two arms are looking at the exact same world-space window, not merely "close enough".

## Island / story captured
The overview/close pair is the **whole live corpus's map** (35 non-retired stories currently), not
a single island — the fit view always frames everything. The close pair centres on the
`studio`/`context-traversal-*` neighbourhood named above.

## ⚠️ The most important finding: the live corpus currently has ZERO `mapped`-status islands
Before capturing, I queried the live-served `#/tree` DOM (`.hex-territory` elements, which stamp
the FOLDED per-island status TreeView/SceneView compute) and separately the raw `/api/tree`
payload:

- Raw authored story statuses (`/api/tree`, 46 stories total): `{"proposed": 35, "retired": 11}`
  — **zero** authored `healthy`, `unhealthy`, `building`, or **`mapped`**.
- Folded/presented statuses actually painted on the map (`.hex-territory` elements, 105 = 35
  islands × 3 status-stamped groups each — tile/coast/flora, per the CSS's own comment): 63
  elements `st-healthy` (21 islands, promoted from authored `proposed` by a signed pass —
  `provenStatus`/ADR-0040), 42 elements `st-proposed` (14 islands). **Zero** `st-mapped`,
  `st-unhealthy`, `st-unknown`, or `st-building` islands.

`mapped` (the brownfield colour this change retunes) is deliberately reserved for genuine
inherited-brownfield provenance (ADR-0395: only an AUTHORED `mapped` status falls through to
brown; everything else folds to green or amber) — and nothing in today's live corpus is authored
that way. **Consequence: on the actual live map, right now, the two overview images and the two
close images are colour-identical except for one unrelated live element (below) — there is no
brown pixel in either arm, because there is no `mapped` island to colour.** This is not a capture
failure; it's an honest fact about the current corpus, verified two ways (DOM query + raw API),
and it means these four screenshots prove the CSS is unreachable-by-the-corpus-today rather than
proving what the new colour looks like in place. See the demo-land pair below for what actually
exercises the changed rule.

I also checked whether any CAPABILITY-grain parcel (`.parcel.st-mapped`, 148 present in the live
DOM) renders the mapped colour independently of its parent island's status — it does not. Ground
tiles read `--hex-top-0`/`--hex-top-1`/`--hex-top-2`/`--hex-side` via CSS custom-property
inheritance from the nearest ancestor that SETS them, which is only the story-level
`.hex-territory.st-<status>` wrapper (there is no `.parcel.st-<status>` rule redefining those
vars). I confirmed this by reading `getComputedStyle` on a `.relaxed-cell` inside a
`.parcel.st-mapped` capability nested in a `.hex-territory.st-proposed` island: its computed
`--hex-top-0` was `#d8c069` (proposed's yellow), not either brown. So a capability's own `mapped`
status is real data (it drives that capability's PARCEL-FLORA fill separately, per
`.parcel-flora.theme-x.st-mapped` rules) but never paints ground — only the island's own folded
status does.

## Mapped-next-to-proposed adjacency: **not available**
No island in the live corpus has `mapped` status at all (see above), so there is no live
mapped-next-to-proposed pairing to capture, and I did not invent one. I did not produce a
`*-adjacent-*` pair.

## Supplementary pair: the `?semanticGrowth=demo` witness stage (`*-demo-land.png`)
Because the live corpus can't show the new colour at all, I also captured the studio's own
existing **`?semanticGrowth=demo`** query-gated witness stage
(`apps/studio/src/components/SemanticGrowthDemo.tsx`, `stories/app-surface/semantic-growth-studio-demo.md`)
— a real, already-shipped six-frame walk of the map's growth vocabulary, built through the SAME
`buildWorld`/`buildRelaxedCells`/`worldToScene` pipeline the live map uses, over a deterministic
fixture (not live corpus data). Its frame 2, **"land"**, is explicitly described in the component's
own header comment as *"the plot is claimed ('mapped' ground); no story markers yet"* — i.e. it is
the one place in the shipped app that deliberately exercises `.hex-territory.st-mapped` on demand.

- URL: `http://127.0.0.1:5301/?semanticGrowth=demo#/tree`
- Procedure: load, wait for the SVG to attach + ~1.2s for entrance motion, click the **Next**
  button once (frame 1 "empty" → frame 2 "land"), wait ~1.5s + confirm no running SVG animations,
  screenshot. Identical procedure for both arms.
- Result: `studio-2d-after-demo-land.png` shows the new tilled-clay ground; `studio-2d-before-demo-land.png`
  shows the old warm tan — this IS a real, visible before/after of the CSS change, just not on
  live data. A second, fixed "companion" island (status `healthy`, green) is also visible in both,
  connected by a trail — but it is NOT `proposed`, so this still does not give the
  mapped-next-to-proposed adjacency the task asked for; it's the closest available real
  demonstration of the new colour, not a substitute for that specific pairing.

## Confirmed: nothing else differs between an arm and its pair, with one named exception
`PIL.ImageChops.difference` bounding boxes between each after/before pair:
- overview: diff bbox `(794, 334, 803, 345)` — a ~9×11px region
- close: diff bbox `(888, 381, 911, 418)` — a ~23×37px region

Both regions, on inspection (cropped/enlarged), are the **same small purple/blue pulsing dot** —
a live-work "claim wisp" marker (ADR-0142/ADR-0200: an orbiting indicator for an in-progress
session claim on a nearby story) sitting on a trail near the `media` island. Its ring phase/size
differs slightly between the two captures because it is an **infinite, continuously-looping CSS
pulse** — `window.__storytreeMotionSettled` deliberately does not block capture on infinite
looping motion (only finite structural animations), so two captures taken at different wall-clock
moments (necessarily: the BEFORE arm's whole page load + zoom sequence happens after the AFTER
arm's) catch that pulse at different phases. This is NOT a CSS-driven difference and is not
related to the `st-mapped` change — it's live, external, session-claim data that happened to be
present in the corpus at capture time. No other pixel differs in either pair outside those exact
regions — confirmed by the bounding-box check above (an empty/near-empty bbox elsewhere would show
as `None`; here the bbox is tightly bounded to the wisp).

The `demo-land` pair (fixture-driven, no live claim data, no `__storytreeMotionSettled` wait) was
not diffed the same way since it is expected to differ everywhere the ground colour changed (that
IS the point of that pair) — but I did not check it for OTHER stray differences beyond the ground;
a spot visual check (both images above) shows the tree, trail, companion island, and button bar in
identical positions.

## Files
- `studio-2d-after-overview.png` / `.settled.json` — live map, fit view, AFTER (current working tree).
- `studio-2d-after-close.png` / `.settled.json` — live map, zoomed to the fixed target/steps above, AFTER.
- `studio-2d-before-overview.png` / `.settled.json` — live map, fit view, BEFORE (four hexes reverted).
- `studio-2d-before-close.png` / `.settled.json` — live map, same zoom, BEFORE.
- `studio-2d-after-demo-land.png` / `studio-2d-before-demo-land.png` — supplementary: the
  `?semanticGrowth=demo` "land" witness frame, AFTER/BEFORE — the only pair that actually shows the
  colour change, since it's synthetic-fixture data rather than live corpus data.

## Housekeeping
- `apps/studio/src/index.css` was left in the exact state it was found in (verified via a diff of
  its patch before vs after this run — byte-identical).
- Temporary capture scripts (`apps/studio/scripts/tmp-explore-map*.mjs`,
  `apps/studio/scripts/tmp-capture-2d.mjs`) were deleted before finishing.
- Both dev-server instances this run started (port 5301) were stopped; the pre-existing orphan on
  5211 was left alone (out of scope, not created by this run).
- `git status --porcelain` at the end shows this `docs/research/chapter2-land-clay-2026-08-28/`
  directory as new/untracked (expected — I was asked to create it), plus a set of files this run
  did **not** touch: `packages/forest-world-r3f/harness/{IslandView.tsx,clay-measure.mjs,clay.html,clay.tsx}`
  and `packages/forest-world-r3f/package.json`, and a sibling set of files already present under
  this SAME parent research directory (`docs/research/chapter2-land-clay-2026-08-28/README.md`,
  `clay-*.png`, `clay-measure.json`, `combine.py`). Those were already present/being written by
  another concurrent session sharing this worktree when this task started (timestamps ~16:38–16:40,
  before this task's first capture) — not created, edited, or touched by this capture run.
