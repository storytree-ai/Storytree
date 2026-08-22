---
id: "compositor-pan-transform"
tier: capability
story: studio
arc: studio-map-responsiveness-arc
title: "A forest drag moves the already-rasterised map on the compositor"
outcome: "A forest drag moves the already-rasterised map on the compositor, so the <g class='world-camera'> transform is written once at the end of a gesture rather than once per frame."
status: proposed
proof_mode: integration-test
depends_on: [coalesced-camera-pan]
decisions: [272]
# BROWNFIELD R1: TreeView already coalesces the drag to one camera commit per display frame (stage 1),
# and that ONE commit per frame is the whole remaining cost — it writes `transform` on the
# `.world-camera` <g>, which invalidates the paint artifact for all ~18.8k elements beneath it
# (ADR-0272: 275 ms/frame, ~99.8% of it paint+raster; the script that sets the attribute is 0.1 ms).
# AUTHOR_TEST adds the integration proof that the per-frame write lands on a compositor-only wrapper
# and the <g> is frozen for the gesture's duration; it fails at HEAD because no wrapper exists and the
# <g>'s transform still moves on every flushed frame. IMPLEMENT then changes only the existing
# TreeView pan hot path and adds one CSS rule — no scene graph, no new package, no visual change.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/components/TreeView.compositorPan.test.tsx", "apps/studio/src/components/TreeView.pan.test.tsx", "packages/cli/src/node-build.test.ts"]
    sourceGlobs: ["apps/studio/src/components/TreeView.tsx", "apps/studio/src/index.css"]
  real:
    testFile: "apps/studio/src/components/TreeView.compositorPan.test.tsx"
    sourceFile: "apps/studio/src/components/TreeView.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/TreeView.compositorPan.test.tsx", "apps/studio/src/components/TreeView.pan.test.tsx", "packages/cli/src/node-build.test.ts"]
      sourceGlobs: ["apps/studio/src/components/TreeView.tsx", "apps/studio/src/index.css"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # Studio component tests are Vitest + jsdom; the default node:test command cannot run this file.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/TreeView.compositorPan.test.tsx"
---

# A forest drag moves the already-rasterised map on the compositor

**Outcome —** A forest drag moves the already-rasterised map on the compositor, so the
`<g class="world-camera">` transform is written once at the end of a gesture rather than once per
frame.

## Why this is one capability

The operator has one journey: drag the zoomed-out forest and have it track the pointer. Stage 1
([`coalesced-camera-pan`](coalesced-camera-pan.md)) bounded how OFTEN the camera commits — at most
once per display frame. This unit changes WHERE that per-frame write lands, and it is the same
gesture, the same precondition (a post-slop drag on the forest viewport) and the same observable (the
camera the operator sees, one write per frame). The outcome states in one sentence without
conjunctions; the walkthrough is one continuous pointerdown → moves → pointerup.

The two halves — moving the live write onto a compositor-only wrapper, and folding it back into `cam`
at the end — cannot be split, because either alone is a defect rather than a smaller increment. A
wrapper that never folds back slides real content off one edge and blank in at the other (the `<svg>`
is viewport-sized: `width/height: 100%`), which is the one genuine design decision ADR-0272 left to
this increment. A fold-back with no wrapper is just today's shipped path. They share the precondition
and the observable, so they are one unit.

**This one HAS a real within-story edge, unlike its four arc siblings.** `coalesced-camera-pan`,
`map-route-retention`, `map-payload-cache` and `map-server-memo` each recorded a
same-file-adjacency-is-not-an-edge call: they neighbour other capabilities' code in `TreeView.tsx` or
`App.tsx` without consuming what those capabilities deliver. That call does not hold here. This
capability's live per-frame write executes INSIDE stage 1's delivered machinery — the
`requestAnimationFrame` callback that `queuePan` schedules, guarded by its generation counter, drained
by `commitPendingPan`, and force-landed by `flushPendingPan` on pointer-up. It consumes stage 1's
frame boundary as its own scheduling contract and edits those exact functions; without stage 1 there
is no once-per-frame boundary to paint on and no trailing-edge flush to commit from. Run the test the
other way for the pair (`cross-story-dependency` applied within the story): stage 1 needs nothing this
unit delivers — it landed and proves green with no wrapper present. One direction only; the graph
stays acyclic.

This is a bounded increment of the existing `studio` story. The proof-bound source stays
`apps/studio/src/components/TreeView.tsx` plus the studio's own `apps/studio/src/index.css`, both
owned by the `studio` surface. It adds no package import, so no cross-story edge: the existing
`studio → app-surface` edge already covers the `WorldSceneView` / memoized `SceneView` it consumes,
and that seam is untouched here.

## Guidance

**The mechanism is DECIDED (ADR-0272 decision 2, owner-picked option (a): commit-on-release). Write it
down; do not re-open it.**

- **Start from the measured cost, not from a new theory.** ADR-0272 measured one shipped pan frame at
  the settled `fit:'contain'` camera: script 0.1 ms, style+layout 0.3 ms, paint+raster+composite
  ~274 ms — 275 ms total, 3.6 fps, with 18,060 of 18,793 elements in the viewport and nothing to cull.
  Writing `transform` on an SVG `<g>` invalidates the paint artifact for the whole subtree, and an SVG
  child gets no composited layer of its own, so there is no layer to slide. The measured remedy is a
  CSS transform on an **HTML** wrapper: 16.7 ms — the vsync floor — with every element still present
  and no visual change. Do not re-derive this and do not re-measure it to start; it is the spec.
- **The wrapper.** Add a new absolutely-positioned HTML `<div className="world-pan-layer">` INSIDE
  `.world-viewport`, wrapping the existing `<svg className="world-scene …">`. Its CSS rule belongs in
  `apps/studio/src/index.css` alongside `.world-viewport` / `.world-scene` (the viewport is
  `position: absolute; inset: 0; overflow: hidden`, and the scene is `width/height: 100%` — the
  wrapper must not disturb either measurement, because the camera measures the frame's real box).
- **The live write is IMPERATIVE — no React state, no re-render.** During a drag, the accumulated
  delta is written to that div's CSS `transform` (`translate3d`) from the existing stage-1 rAF
  callback, via a ref. No `setCam`, no `setState`, no `<g>` attribute write while the gesture is live.
  One write per frame, exactly as today — what changes is the target, not the cadence.
- **The fold-back.** On pointer-up — and whenever the accumulated live offset crosses a bounded
  distance threshold, so a long drag can never expose an unbounded blank band at the trailing edge —
  the accumulated delta folds back into `cam` through the existing `panBy` / `setCam` path, and the
  wrapper returns to identity. The threshold is what makes commit-on-release safe against the
  viewport-sized `<svg>`; without it, a long drag slides real content off one edge and blank in at the
  other.
- **The fold-back and the wrapper reset MUST happen in the same visual frame.** Reset the wrapper from
  a `useLayoutEffect` keyed on `cam`, **subtracting the offset that was handed to `setCam`** — not
  assigning zero. Movement can arrive between the commit and React's paint; subtracting preserves it,
  assigning zero DROPS it. Doing the reset in a separate frame flashes a jump. This is the one place
  where a plausible-looking implementation is silently wrong, so it is stated as a rule rather than
  left to taste.
- **The composed camera is the contract.** What the operator sees is the `<g>` transform ∘ the
  wrapper transform. At every instant of a gesture that composition must be **arithmetically
  identical** to what today's shipped `<g>`-only path would produce for the same pointer sequence.
  This is the property the proof is built around: not "it looks the same", but "the composed numbers
  are the same numbers".
- **Every exit from a gesture has a defined settlement.** Pointer CANCEL settles the already-PAINTED
  live offset and discards only the un-painted pending delta — those pixels were shown to the
  operator, and snapping them back is a visible jump, which is why cancel does not simply mirror
  stage 1's `cancelPendingPan`. Unmount just cancels the frame (no commit into a dead component). A
  wheel-zoom settles any live offset FIRST: `onWheel` anchors on `svgRef.getBoundingClientRect()`, and
  a translated wrapper moves that rect, so zooming over a live offset would anchor to the wrong point.
- **Scope layer promotion to the gesture.** `will-change` / layer promotion is taken for the duration
  of the drag and released after, not held permanently. ADR-0272 measured `will-change` on
  `.world-camera` as a partial, permanently-costly half-measure (133 ms) and on the `<svg>` root as
  actively worse (333 ms) — a held promotion is not the win, the wrapper is.
- **The `<g>`'s `transition: transform .35s ease` branch is DEAD — do not mistake it for a live
  easing path you must preserve.** `animate` is `useState(false)` and `setAnimate(true)` appears zero
  times (ADR-0272 confirmed the computed transition is `none 0s` live). It therefore cannot mask a
  jump at commit either — the commit's correctness rests entirely on the same-frame reset above.
  Equally, the new `.world-pan-layer` must carry **no** transition of its own.
- **Correct the stale attribution comment that is in scope, and only that one.**
  `TreeView.tsx` (~line 2277) calls the O(nodes) React walk "the felt pan lag". Measured, the walk is
  ~3% of a gesture frame (283 ms with React vs 275 ms for the bare attribute write); what the owner
  feels is the rasterisation. Fix the attribution in passing — keep the memo, it is real work and
  still required. Its twin in `packages/app-surface/src/SceneView.tsx` says the same thing and is
  **outside this unit's write scope**; it is named below as a follow-up rather than silently dropped.
- **Use a real component seam, not a benchmark claim.** Author
  `apps/studio/src/components/TreeView.compositorPan.test.tsx` (Vitest + jsdom) with the real
  `TreeView`, the existing `AppDataContext` / mocked-tree mount shape from `TreeViewShell.test.tsx`
  and `TreeView.pan.test.tsx`, and a controllable fake rAF. jsdom can prove the MECHANISM (which
  element's transform moves, and when) and the ARITHMETIC (the composed camera equals the `<g>`-only
  reference). It cannot honestly prove FPS, paint time, or a felt improvement — none of those is
  asserted here; the "feels fast" verdict is the owner's ADR-0070 stage-2 attestation and is not part
  of this unit's green.
- **Test titles carry every contract id below**, each as ONE plain string literal with the declared id
  LEADING it — never a concatenation and never a locally-invented id. The coverage scan is a static
  AST scan (ADR-0126), so a title assembled with `+` reads as UNCOVERED even when the id is the first
  thing in it.
- **There is ZERO slack on either `check:coverage` axis — all four contracts must be named
  substantively, in the same PR as this spec.** Measured 2026-07-31 against the real corpus: the
  `uncovered` axis is already AT its ceiling (119/119) and the `unbound` axis is at 1/1 (the
  long-standing `backend-chat-reset-route`). That makes this capability's landing a two-sided squeeze,
  and both sides are ADR-0252 D3 zero-drain ceilings whose remedy is a drain, NEVER a raise:
  (a) while `TreeView.compositorPan.test.tsx` does not exist, this capability counts on the `unbound`
  axis and takes it to 2 — RED; (b) the moment the file exists it leaves `unbound` (back to 1, green)
  and joins `uncovered`, where every contract NOT named by a substantive test is +1 over a ceiling that
  has no room — so a hollow `assert(true)`, a `.skip`, or a missing title reds the other axis instead.
  The only green landing is the spec and a test file that substantively names ALL FOUR ids, together.
  This is not a hypothetical: stage 3 signed a PASS while printing `coverage 0/9`, six of its nine
  contracts having no test at all — which is why this contract list is deliberately tight and every
  one of the four is provable from this single file.
- **The real-build catalog needs NO companion edit — this obligation is retired.** *(This read: keep
  `packages/cli/src/node-build.test.ts`'s exact, alphabetical REAL-buildable capability catalog in
  lockstep, adding `compositor-pan-transform` between `compose-build-command` and
  `context-traversal-capture`, and it was declared and skipped on stages 2 and 3. Both halves are now
  false. ADR-0341 D4 replaced that hardcoded catalogue with one DERIVED from the specs on disk — the test
  states outright that adding a node must never mean editing that file, so authoring this spec IS the
  registration and there is no list to append to. And the named neighbour `compose-build-command` was
  retired by ADR-0404 with the forest-map Build button, so it is no longer in the catalogue to sort
  against. The file stays in BOTH `scope.testGlobs` and `real.scope.testGlobs`, which is unaffected.
  Corrected in place per ADR-0139.)*

**Must not regress — name each of these in the proof, do not assume them:**

- Stage 1's coalescer: `queuePan` / `commitPendingPan` / `flushPendingPan` / `cancelPendingPan` and
  the `panFrameGenerationRef` guard that stops a cancelled rAF consuming a newer gesture's movement.
- `DRAG_SLOP`, the LAZY pointer capture taken in `onPointerMove` (never on `onPointerDown` — capturing
  on press retargets the eventual click in the Electron build), and `suppressClickRef` click
  suppression.
- The `atFitRef` resize contract: the flag retires only when a camera move actually lands, so a
  cancelled queued drag still lets a later resize re-fit an untouched view.
- Keyboard pan and wheel-zoom semantics, including `onWheel`'s `getBoundingClientRect` anchoring.
- The `StudioWorldChrome` memo boundary (stage 1's contract 4) — a camera-only update must still not
  re-invoke its body.
- `SceneView`'s `React.memo` in `@storytree/app-surface`: **keep it WRAPPED.** ADR-0272 corrects its
  "felt pan lag" attribution and explicitly keeps the memo load-bearing.
- `sceneTapSelect` click selection. It hit-tests with `document.elementFromPoint` in CLIENT
  coordinates, which respects CSS transforms — so it should survive a translated wrapper. That is a
  reasoned expectation, not a proven one: this capability **ASSERTS** it (contract 4) rather than
  assuming it.

## Integration test

1. Mount the real `TreeView` with a loaded representative map, install a controllable
   `requestAnimationFrame` / `cancelAnimationFrame` fake, and capture the `<g class="world-camera">`
   transform and the `.world-pan-layer` transform as the two observables.
2. Drive a pointerdown and enough pointermoves to cross `DRAG_SLOP`, then a burst of moves, and flush
   one frame. Assert the `<g>` transform is UNCHANGED from its pre-gesture value while the pan
   layer's CSS transform carries the cumulative delta, and that exactly one write per flushed frame
   reaches it. Repeat with a later burst to prove the next frame is independently coalesced onto the
   layer.
3. Release the pointer. Assert the `<g>` now holds the composed value, the pan layer is back to
   identity, and the composed camera (`<g>` ∘ layer) at every sampled instant of the gesture equals
   the value today's `<g>`-only arithmetic would produce for the same pointer sequence — compute the
   reference from `panBy` over the same deltas rather than hard-coding numbers.
4. Drive a drag long enough to cross the bounded distance threshold mid-gesture. Assert the fold-back
   fires without the pointer being released, that no movement is lost and none is double-counted
   (composed total still equals the reference), and that the gesture continues cleanly afterwards.
5. Exercise every exit: pointer CANCEL settles the already-painted live offset and discards only the
   un-painted pending delta; unmount with pending work applies no post-unmount state update; a
   wheel-zoom over a live offset settles it first and anchors on the un-translated rect. Assert
   `atFitRef` semantics and scale survive each.
6. With the pan layer carrying a non-zero offset mid-gesture, drive a click through the viewport and
   assert `sceneTapSelect` resolves the SAME node it resolves with no offset present, and that a
   moved drag is still suppressed from registering as a click.
7. Retain stage 1's own guarantees from this same mount: a burst still schedules at most one pending
   frame, and a camera-only update still does not re-invoke the memoized `StudioWorldChrome` body.
8. Run the generic real-build catalog regression and assert its exact buildable-capability catalog
   names `compositor-pan-transform`.

## Contracts

1. **`compositor-pan-freezes-the-world-camera-during-a-gesture`**
   - **asserts —** while a post-slop drag is live, the `<g class="world-camera">` transform does not
     change, and each flushed frame writes the cumulative latest delta exactly once to the
     `.world-pan-layer` CSS transform instead — with no React state update and no re-render of the
     scene for that frame.
2. **`compositor-pan-commits-the-composed-camera-on-release`**
   - **asserts —** on pointer-up the accumulated delta folds into `cam` so the `<g>` carries the
     composed value and the pan layer is back to identity in the same visual frame, and the composed
     camera (`<g>` ∘ layer) is arithmetically identical at every sampled instant to what the
     `<g>`-only path would produce for the same pointer sequence; scale and `atFitRef` semantics are
     preserved.
3. **`compositor-pan-folds-back-mid-gesture-and-settles-every-exit`**
   - **asserts —** crossing the bounded live-offset threshold folds back mid-gesture with no movement
     lost and none double-counted, and every exit settles safely: cancel keeps the already-painted
     offset while discarding the un-painted pending delta, unmount applies no post-unmount update, and
     a wheel-zoom settles the live offset before anchoring on `getBoundingClientRect`.
4. **`compositor-pan-preserves-click-selection-under-a-live-offset`**
   - **asserts —** with the pan layer carrying a non-zero offset, `sceneTapSelect`'s
     `document.elementFromPoint` hit-test in client coordinates resolves the same node as with no
     offset, `DRAG_SLOP` still lets a jittered press select, and a moved drag is still suppressed from
     registering as a click.

## Explicitly outside this increment

- **Density, LOD, culling, or aggregation.** ADR-0272 decision 3 DE-SEQUENCES it: flora is 62.8% of
  the map and deleting all of it reaches only 133 ms (7.6 fps); deleting flora *and* every ground cell
  (82% of the map) reaches only 33 ms. A 16.7 ms budget affords ~2,800 elements, so ~85% of the map
  would have to disappear to fix pan by density alone. It is not retired as an idea, but it may only
  return against its own fresh evidence, for a cost it can actually pay down — and it is not this.
- **Zoom-gesture rasterisation.** ADR-0272 names it unfixed and unmeasured: scaling a rasterised layer
  is blurry, so a wheel gesture still wants a re-raster. The same commit-on-settle trick may apply,
  but it was not measured and is not claimed here. This unit only requires that a wheel-zoom settles a
  live pan offset safely (contract 3).
- **The one expensive frame at each end.** A compositor-only pan still pays one full raster when the
  layer is built (measured warm-up frames of 100–380 ms). The honest shape is 60 fps during the drag
  with an expensive frame at each end; removing those is not in this unit and no contract claims it.
- **Any change to `packages/forest-world/src`** — it trips the CI-only web-engine drift gate — and any
  flora, scene-graph, geometry or look change. ADR-0238 decision 2 (flora monotonicity in `testCount`)
  must stay true by construction: this unit proposes no change to flora quantity.
- **The twin stale comment in `packages/app-surface/src/SceneView.tsx`** (the `React.memo` doc comment
  that calls the React walk "the felt pan lag"). ADR-0272 asks for it to be corrected in passing, but
  it is in another package and outside this unit's declared write scope; the `TreeView.tsx` twin IS in
  scope and IS corrected here. Recorded as a follow-up rather than dropped.
- **Renderer replacement, canvas/WebGL, or an R3F swap.** ADR-0272 decision 5: the map remains SVG,
  and ADR-0069's swap trigger (b) gains a precondition — it cannot even be EVALUATED until this
  decision ships, because the same 18,793 SVG elements pan at the vsync floor once the transform moves
  off the `<g>`.
- **Any FPS, browser-paint, or frame-budget claim, and any visual attestation.** jsdom proves the
  mechanism and the arithmetic; it cannot prove "feels fast". That is the owner's ADR-0070 stage-2
  operator-attested verdict and is not part of this capability's machine green.
- Route retention, payload caching, server memoization, and boot de-serialisation — the arc's earlier
  stages, each already authored and landed as its own capability.
