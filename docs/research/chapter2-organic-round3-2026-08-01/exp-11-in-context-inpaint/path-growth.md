# exp-11 path growth — in-context generated dirt-path art riding the existing arrival masks

**Treatment in one line:** inpaint a worn dirt-path segment *into the real plate* the same way the
hero tree was inpainted, lift it as a transparent ribbon, and ride it along the **already built and
already tested** `arrivalGrowPlan` per-segment masks as a textured fill — so the app keeps every
clock, every stagger and every reduced-motion branch, and the generated art contributes appearance
only.

---

## 1. The machinery this rides — all of it already exists

The brief's §3 finding is confirmed by reading the code. Nothing below needs building.

| what | where | state |
|---|---|---|
| `arrivalGrowPlan(network, arrivalIds)` — roots at the ARRIVING island(s), walks their **direct incident** trail edges outward, folds shared segments (earliest draw-on wins), returns `TrailRevealPlan { focusId, segments, byId }` | `packages/app-surface/src/trailReveal.ts` | pure, deterministic, unit-tested in `trailReveal.test.ts` |
| `REVEAL_STAGGER_MS = 350` — per-chain-position stagger (`delayMs = chainIndex * 350`) | same file | exported constant |
| `RevealSegment { id, delayMs, fromEnd, dir, revealedUsage }` — `fromEnd` flips growth to the path's geometric END so a chain walked against its drawn direction still grows *away* from the new island | same file | in the tested plan shape |
| `WorldPresentationModel.reveal: TrailRevealPlan \| null` | `packages/app-surface/src/SceneView.tsx` (field declared ~L61) | wired |
| `revealClass()` → stamps `is-growing` on `trail-fill` / `trail-ghost`; the segment paths get `mask="url(#trail-m-<id>)"` and `strokeWidth = trailFillWidth(seg.revealedUsage) + widen` | `SceneView.tsx` (~L294, ~L682, ~L805-810) | wired |
| one `<mask id="trail-m-<segId>" maskUnits="userSpaceOnUse">` per plan segment, holding `<path d={s.d} pathLength={1} className="trail-reveal-mask[ from-end]" style={{animationDelay: seg.delayMs, strokeWidth: trailFillWidth(seg.revealedUsage)+8}}/>` | `apps/studio/src/components/TreeView.tsx` (~L2676) | wired, fed by `growPlan` (~L2374) into `reveal:` (~L2449) |
| `.trail-reveal-mask` — white stroke, `stroke-dasharray: 1`, `stroke-dashoffset: 1` (`-1` for `.from-end`), `animation: trail-reveal-grow 0.35s ease-out both`; `@media (prefers-reduced-motion: reduce)` sets `animation: none; stroke-dashoffset: 0` | `apps/studio/src/index.css` (~L1829-1878) | wired, incl. the reduced-motion branch |

**The one missing wire.** `apps/studio/src/components/SemanticGrowthDemo.tsx` builds its presentation
model with `neighbours: neighbourPlan`, `lanes: primaryLanes`, `laneMotion: 'draw'` (~L376-378) —
that is only the ADR-0242 **lit selection lane** highlight. It never sets `reveal`. So in the
Chapter-2 witness the underlying dirt trail is fully drawn from frame one and the "the path grows
out from the newly placed island" beat never plays. **This is a one-field wiring gap, not a missing
engine.**

## 2. The generated asset

One `inpaint_image` call (job `1e376ebb-2d7c-4aa4-a01f-8e95af2210a1`, seed **31130**) against a
96×80 window of the padded plate — crop box `(0,104)–(96,184)`, which contains the plate's own
existing thin trail stub and its background hex field. The mask was a 15-px-wide line along the
stub's own axis, `(0,68) → (52,8)`.

Prompt, verbatim:

> a worn dirt footpath trodden into the ground: a narrow strip of bare packed brown earth with a few
> small pebbles and slightly darker crumbly edges, running diagonally from the lower left to the
> upper right. Nothing else - no grass tufts, no fence, no plants, no shadow.

Measured: the return differs from the untouched crop only inside the mask; the extracted ribbon
bounds are **(0,5)–(56,73)** on a 96×80 canvas, 3 562 B encoded, trimmed to 57×69.

| file | what |
|---|---|
| `path/dirt-path-ribbon.png` | the extracted transparent ribbon, 96×80, in the plate's coordinate frame |
| `path/dirt-path-ribbon-trimmed.png` | the same, trimmed to its alpha bounds (57×69) |
| `path/dirt-texture-tile-16.png` | a **directionless** 16×16 swatch, sampled from the ribbon's interior (6 938 interior pixels, deterministic stride) |
| `path/dirt-texture-tile-32-seamless.png` | the swatch mirrored to 32×32 so it tiles with no edge seam |
| `path/path-sheet.png` | untouched crop \| model return \| extracted ribbon |
| `path/path-assets.png` | the seamless tile at 8× beside the trimmed ribbon |
| `path/path-provenance.json` | job id, seed, crop box, canvas, bounds, bytes |

**Honest read of the art.** At 1:1 the ribbon reads more like a **wooden plank than a dirt path** —
two hard parallel edges, a lighter centre stripe and pebble marks that scan as grain. The cause is
mine, not the model's: I gave it a constant-width straight-line mask, so it drew a constant-width
straight object. The *directionless swatch* derived from its interior is the more useful asset and
does read as packed earth. The mirrored 32×32 tile carries faint symmetry seams on its centre axes.

## 3. The proposed treatment

**A. Wire the missing field.** In `SemanticGrowthDemo.tsx`, compute
`arrivalGrowPlan(world.trails, arrivalIds)` for the islands placed by the current step and pass it
as `reveal`. Everything downstream — the per-segment `trail-m-<id>` masks, the 350 ms chain stagger,
the `fromEnd` direction flip, the `revealedUsage` width step-up, the reduced-motion settle — then
plays with no new code. That alone recovers the missing beat.

**B. Texture the fill from the generated art, not from a flat colour.** Add one
`<pattern id="dirt-trodden" patternUnits="userSpaceOnUse" width="32" height="32">` in the same
`<defs>` block that already holds the reveal masks, whose single `<image>` is
`dirt-texture-tile-32-seamless.png`, and paint `.trail-fill` with `stroke="url(#dirt-trodden)"`
instead of `var(--trail-fill)`. Because the tile is directionless, it needs no per-segment rotation
and no per-angle authoring — the same fill is correct for every trail heading. The reveal mask still
owns the growth; the texture is only what the mask reveals. This is appearance-only by construction
(ADR-0274 D3: the app owns timing, the asset owns look).

**C. The timing variation this experiment contributes: the path arrives BEFORE the tree settles.**
Round-3 experiments are each meant to vary the path beat. Mine: on island arrival, start the trail
draw-on at t=0 and start the hero-tree growth track only at
`max(seg.delayMs) + 350 ms` — the ground reaches the island, *then* the island grows. It reads as
cause and effect ("the forest connected to this place, and then it took root") rather than two
unrelated animations sharing a frame. The number is already in the plan: `TrailRevealPlan.segments`
is sorted by `delayMs`, so `plan.segments.at(-1).delayMs + REVEAL_STAGGER_MS` is the tree's start
offset. No new constant.

**D. Let trodden-ness read semantically, using a field that already exists.** `RevealSegment` carries
`revealedUsage` and `SceneView` already steps `strokeWidth` from it. Step the pattern's **opacity**
from the same number (a spur at usage 1 is faint, freshly scuffed earth; a trunk carrying 3+ edges
is opaque, well-worn). The honesty invariant in `trailReveal.ts` §5 holds — the plan is always a
subset of real edges, so a heavily-worn path can only mean a heavily-used dependency.

## 4. What this treatment does NOT need

- No new engine, no new timing constant, no new plan shape, no change to `trailReveal.ts`.
- No `create_path_tiles` call. That tool (18 connectable configs) is the right answer if the trails
  ever become **tile-grid** art; today they are SVG strokes with per-segment masks, so a stroke
  texture is a far smaller change than a tile set. If the owner wants the crisper look, the same
  socket-inpaint recipe with a *wobbly, tapered* mask instead of my constant-width line would give a
  much more convincing worn-path ribbon for one more generation call.
- No asset-owned clock: every millisecond stays in `index.css` and `trailReveal.ts`.

## 5. Risks I can already name

1. **SVG `<pattern>` on a stroke does not follow the stroke's direction** — for a directionless
   texture that is the point, but any future *directional* path art (ruts, footprints) would need
   per-segment `patternTransform` rotation, which means one pattern node per segment.
2. **Pattern fills and the existing `mix-blend-mode: multiply` cave apron** may interact; the cave
   apron (`.cave-apron`) sits over the trail where a route dives under an island.
3. The plate's own trail stroke is currently a *minimalist single faded-brown line* (owner feedback
   2026-07-06, recorded in `index.css` above `.trail-net path`). Replacing that flat colour with a
   pebbly texture is a **look change the owner has to attest**, not a mechanical improvement — it
   moves the trail back toward the "layered striped ribbon" the minimalist pass deliberately
   collapsed. Ship it behind the existing flat fill as an option, and let the owner pick.
