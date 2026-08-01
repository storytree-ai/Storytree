# Path growth — exp-13 treatment: **the trail arrives first and the land grows to meet it**

Pure app-native. **This treatment generates no asset at all** — no PixelLab call, no
`create_path_tiles`, no dirt texture. Everything below is existing, unit-tested engine code plus
three lines of wiring the Chapter-2 witness never wrote, and one genuinely missing piece I found
while checking (§4).

## 1. The beat

Today the Chapter-2 witness pops a finished island onto a map whose dirt trail is already fully
drawn. Nothing ever *reaches* anywhere.

The treatment: when the story's plot is claimed, **the trail draws on first, growing outward from the
arriving island along its real `depends_on` edges — and only once it has run does the coast surface,
the ground assemble, and the tree start to grow.** The path is the invitation; the land answers it.
It puts the causal arrow the right way round for a dependency graph: the connection exists before the
thing at the end of it does.

## 2. The machinery it rides — named, with line references

Everything in this section is already built, pure and tested.

**Plan (pure, deterministic, unit-tested):**
`packages/app-surface/src/trailReveal.ts`

- `arrivalGrowPlan(network: TrailNetwork, arrivalIds: ReadonlySet<string>): TrailRevealPlan | null`
  (line 150). Walks only the **direct incident** edges of the arriving island(s), roots each chain at
  the arriving end, and emits one `RevealSegment { id, delayMs, fromEnd, dir, revealedUsage }` per
  segment. `fromEnd` is what makes growth always run *away* from the new island even when the stored
  `from → to` chain is walked backwards. A segment reached from two arriving edges keeps the earlier
  draw-on (line 171).
- `REVEAL_STAGGER_MS = 350` (line 24) — `delayMs = chainIndex * 350`.
- Its honesty invariant is structural: the plan is a subset of the network's real edges, never
  invented. Tests: `packages/app-surface/src/trailReveal.test.ts`.

**Presentation model (the seam the witness has to set):**
`packages/app-surface/src/WorldSceneView.tsx`

- `WorldPresentationModel.reveal: TrailRevealPlan | null` (line 20) and
  `WorldPresentationModelInput.reveal?: TrailRevealPlan | null` (line 41).
- `normalizeWorldPresentationModel` passes it through: `reveal: input.reveal ?? null` (line 70).
- The scene context carries it to the renderer: `reveal: model.reveal` (line 110).

**Renderer (already consumes it):**
`packages/app-surface/src/SceneView.tsx`

- `revealClass()` (line 294) stamps ` is-growing` on any `trail-fill` / `trail-ghost` /
  `trail-casing` / `trail-shadow` path in the plan.
- The trail pass sets `props.mask = url(#trail-m-<segId>)` (line 807) and steps the stroke width from
  `seg.revealedUsage` (line 810), so a shared trunk widens as more revealed edges use it.
- The ADR-0242 selection lane masks itself with the same id (line 682), so a lit lane grows with the
  road under it instead of sliding over a half-drawn one.

**Mask + animation (studio CSS + defs):**
`apps/studio/src/components/TreeView.tsx` lines 2676–2698 render one
`<mask id="trail-m-<segId>" maskUnits="userSpaceOnUse">` per plan segment, containing the segment's
own path at `pathLength={1}`, class `trail-reveal-mask` (+ ` from-end`), with
`style={{ animationDelay: seg.delayMs + 'ms', strokeWidth: trailFillWidth(seg.revealedUsage) + 8 }}`.
`apps/studio/src/index.css` lines 1829–1860 drive it: `stroke-dasharray: 1; stroke-dashoffset: 1;
animation: trail-reveal-grow 0.35s ease-out both`, with `.from-end` starting at `-1`, and a
`prefers-reduced-motion` branch that sets `animation: none; stroke-dashoffset: 0` — i.e. the trail
lands already drawn, no special-casing needed.

**The island's own arrival staging** (`apps/studio/src/index.css` lines 5184–5200) already assumes
this order: coast `arrive-ground 0.55s ease-out 1.05s both`, ground at `1.25s`, flora
`arrive-pop 0.6s cubic-bezier(0.34,1.45,0.5,1) 1.5s both`. The trail masks start at `0ms`. **The CSS
already stages path-before-land** — it has simply never had a `reveal` plan to run.

## 3. The wiring, exactly

In `apps/studio/src/components/SemanticGrowthDemo.tsx`:

- Line 283 already derives the real network for the neighbour plan:
  `const neighbourPlan = neighbourHighlightPlan(baseWorld.trails, DEMO_STORY_ID);`
  So `baseWorld.trails` — the composed world's **real** `TrailNetwork` — is already in scope. Add:

  ```ts
  const arrivalIds = new Set([DEMO_STORY_ID]);
  const growPlan = arrivalGrowPlan(baseWorld.trails, arrivalIds);
  ```

- `narrativeModel()` (line ~370) currently builds
  `normalizeWorldPresentationModel({ scene, neighbours, lanes, laneMotion: 'draw' })` and **never
  passes `reveal`**. That is the whole defect. The treatment adds it — but only on the frames inside
  the growth window:

  ```ts
  normalizeWorldPresentationModel({
    scene: narrativeScene(story, claims),
    neighbours: neighbourPlan,
    lanes: primaryLanes,
    laneMotion: 'draw',
    reveal: growing ? growPlan : null,   // <- the missing line
    arrivalIds: growing ? [DEMO_STORY_ID] : [],
  });
  ```

- **The progress window.** The organic-pose block at line ~497 already declares the clock:
  `nativeIsland: { …, settledAtProgress: 0.18 }`, hero tree `progressWindow: { start: 0.18, end: 1 }`,
  plant `{ start: 0.52, end: 1 }`. This treatment claims the space **before** all of it:

  | progress | beat |
  |---|---|
  | `0.00 – 0.04` | empty plot. Nothing. |
  | **`0.04 – 0.18`** | **`reveal = growPlan`.** The incident trails draw on from the arriving island, staggered 350 ms per chain position. |
  | `0.18` | `reveal → null`. The masks drop; the strokes stay drawn (the documented end-of-arrival behaviour, `index.css` line 1686 ff). The island's native growth settles — the land has arrived at the path. |
  | `0.18 – 1.00` | the hero-tree pose track runs, unchanged. |
  | `0.52 – 1.00` | the plant track runs, unchanged. |

  So the ONLY numeric change to the existing witness is that the window `[0.04, 0.18)` — currently
  dead air before `settledAtProgress` — is now the path-growth beat. `settledAtProgress` itself does
  not move, and neither pose track's window changes.

- **One arithmetic constraint, stated rather than hand-waved.** The mask animation runs on the CSS
  clock, not on progress: a chain of `k` segments finishes at `k × 350 ms + 350 ms`. The window
  `[0.04, 0.18)` is 14 % of the witness's total sweep `D`, so path growth completes before the land
  settles only when `0.14 · D ≥ (k + 1) × 350 ms`. For the demo's one-hop route (`k` = 2–4 segments)
  that means `D ≥ 7.5 s` at `k` = 2 and `D ≥ 12.5 s` at `k` = 4. If the witness sweeps faster than
  that, do **not** change `REVEAL_STAGGER_MS` (it is shared with the live map) — map the plan on the
  way in, which is a pure transform of a plain data structure:

  ```ts
  const scaled = { ...growPlan, segments: growPlan.segments.map(s => ({ ...s, delayMs: s.delayMs * f })) };
  ```

  and rebuild `byId` from `scaled.segments`. No engine change.

## 4. A correction to the brief's §3 — the witness needs one more thing

The brief says the machinery is fully built and the witness "simply never wires it up". That is true
of `reveal` — and true of the **studio map**. It is **not** the whole story for the Chapter-2 witness,
and setting `reveal` alone would silently no-op there. I checked:

- `SceneView.tsx` only ever *references* `url(#trail-m-<id>)` (lines 682, 807). It never defines the
  mask.
- The `<mask>` elements are defined **only** in `apps/studio/src/components/TreeView.tsx` (line 2682)
  — studio-local, not in the shared `app-surface` package.
- The Chapter-2 witness does not go through `TreeView`'s SVG. `SemanticGrowthWorldView.tsx` builds
  its own `<svg viewBox={viewBox}>` (line 369) wrapping `<WorldSceneView>` and emits **no `<defs>`**.

A missing mask reference in SVG renders the element unmasked, so the trail would simply appear
fully drawn from frame one — the exact bug we are trying to fix, now with dead wiring behind it and
nothing red to show for it.

**So the treatment is two changes, not one:**

1. `SemanticGrowthDemo.tsx` — pass `reveal` (and `arrivalIds`) inside the `[0.04, 0.18)` window.
2. `SemanticGrowthWorldView.tsx` — emit the per-segment `<defs><mask id="trail-m-…">` block when
   `model.reveal` is non-null, composed **verbatim** from `TreeView.tsx` lines 2676–2698 (same
   `pathLength={1}`, same `trail-reveal-mask` / `from-end` classes, same inline `animationDelay` and
   `strokeWidth`), so both surfaces animate off one CSS rule. It needs each segment's `d`, which the
   witness has: the scene's trail-segment paths carry `id` + `d` already (`SceneView.tsx` line 682
   reads exactly those fields off `children`).

That second piece is the honest red→green unit for this beat: a test asserting that a witness frame
with a non-null `reveal` renders a `<mask id="trail-m-…">` for every plan segment fails today.

## 5. Why this treatment and not another

Round 3 wanted the treatments varied. Mine deliberately takes the **before** slot: trail first, land
second. It is the cheapest to prove (all logic already unit-tested), it costs zero generations —
worth something with the shared round pool down to 148 — and it is the only variant that tests
whether the *ordering* alone changes how the arrival reads, with no new art to confound the verdict.
`create_path_tiles` is left unpulled on purpose: a generated dirt-tile texture is a separate,
orthogonal question, and mixing it in here would make an ordering result unattributable.

**Risk I would flag to the owner:** with the tree track already occupying `[0.18, 1.0]` and the plant
`[0.52, 1.0]`, adding a beat before 0.18 makes the whole sweep busier at the front. If the sweep feels
crowded, the fix is to move `settledAtProgress` from `0.18` to `~0.24` and start the tree there too —
one number in `SemanticGrowthDemo.tsx`, not a re-timing of anything shared.
