# Camera projection probe — 2026-08-01

**Question.** Round 3's review found that all eight hero-tree tracks are front elevation while the app's
island plate is a low top-down / 2.5D isometric view, and the owner called that a blocker to fix before
any hosted LOOK. Can PixelLab produce a low-top-down tree, and if not, what else can?

**Spend.** 11 generations (pool 29 → 18).

## Result 1 — the camera cannot be prompted. Three routes, three failures.

| route | call | result |
|---|---|---|
| the `view` parameter | `create_image_pixflux`, `view: "low top-down"`, `isometric: true`, plus an explicit prose description of a top-down camera, `text_guidance_scale: 11` | plain **side elevation** — [`reject-view-param-low-top-down.png`](reject-view-param-low-top-down.png) |
| in-context generation | `create_map_object` with the real padded island plate as `background_image`, oval mask `fraction: 0.22`, `view: "high top-down"` | **pure terrain, no tree at all** — [`reject-map-object-22pct-terrain.png`](reject-map-object-22pct-terrain.png) |
| the isometric tool | `create_isometric_tile` | wrong tool — caps at 64 px and generates ground tiles ("grass on top of dirt"), not hero objects |

The tool schema itself calls `view` "weakly guiding", and the model's side-elevation tree prior wins.
Experiment 15 hit the same wall from the other direction: it sent `view: "top-down"` to
`create_1_direction_object` and got side elevation back.

**A generation top-up would not have fixed this.** It would buy more side-elevation trees.

Aerial *vocabulary* fails the same way. Two further fresh generations — one using "AERIAL BIRD-EYE
VIEW … as if photographed from a drone", one describing only what is visible with no camera word at
all ("a rounded canopy mass seen from directly overhead … only a short stub of trunk at its centre") —
both returned tall, saturated, near-spherical trees well outside the plate's palette. See panels 4 and
5 of [`camera-probe-strip.png`](camera-probe-strip.png).

## Result 2 — the camera CAN be given as a shape

Panels 2 and 3 of [`camera-probe-strip.png`](camera-probe-strip.png) are the answer. Feed the model a
**deterministic PIL vertical squash of an existing good frame as `init_image`**, and it redraws that
flattened silhouette as clean pixel art *at the flattened projection* instead of reverting to
elevation — wide canopy mass, short foreshortened trunk, roots radiating outward across the ground
plane, palette held.

PixelLab will not obey a camera **word**. It will follow a camera **shape**.

## Result 3 — the naive recipe breaks at the young end, and that is a prompt bug

[`projection-redraw-arc.png`](projection-redraw-arc.png) runs the recipe across five frames of
exp-16 (00, 06, 11, 15, 18) with one generic "the same tree, redrawn…" prompt at
`init_image_strength: 150`. Top row is the squash input, bottom row the redraw.

- Frames **15 and 18** (mature): works well. Better projection read than the source.
- Frame **11**: acceptable.
- Frame **00** (a two-leaf seedling): **destroyed** — the model invented a small *tree* with a trunk
  and two canopy tufts, deleting exp-16's single best feature.
- Frame **06** (a leafy whip): **destroyed** — a symmetric plant resembling neither the input nor a
  growth stage.

Adjacent redraws also drift: frame 06's redraw and frame 11's redraw are different plants. Redrawing
frames independently reproduces Experiment 14's "nine different trees" failure.

### The fix, verified

[`young-frame-fix.png`](young-frame-fix.png) — row 1 is frame 00, row 2 frame 06; columns are squash
input, generic prompt, stage-aware prompt.

Never say "tree" for a young stage. Name the actual stage and explicitly forbid the stages it is not,
and raise preservation where the model's prior is most likely to take over:

> a **TINY SEEDLING SPROUT** exactly as shown and no larger: two small rounded seed leaves on one short
> thin stem, with fine pale roots spreading outward on flat ground. It is **NOT a tree**, has **NO
> trunk, NO branches and NO canopy**. Redrawn as clean storybook pixel art seen from a high angle
> looking down …

Both young frames survive intact under that prompt, cleaned up and with the roots splayed.

**Full recipe:** PIL-squash to ~0.62 vertical → feed as `init_image` → stage-aware prompt naming the
growth stage and forbidding the others → `init_image_strength` ≈ 150 mature, ≈ 230 young.

## What this changes

1. **Ship the free half now.** The PIL squash alone is ordinary author-time normalization, not a
   runtime position correction, and it needs no generations. [`projection-strip.png`](projection-strip.png)
   shows exp-16's mature frame on the real plate at 1.00 / 0.82 / 0.68 / 0.55. That is the
   owner-tunable projection control the round-3 comparison lab ships, defaulting to 0.82.
2. **The redraw is a next-round technique, not this one.** A full flattened-projection candidate needs
   ~19–25 generations for the track plus reserve for per-frame fixes and verification — call it ~40 —
   and it needs a continuity pass (a chained ladder, or interpolation between redrawn keys) so
   independent redraws do not flicker. 18 generations remain, so attempting it now would produce
   exactly the half-finished flickering track this arc keeps rejecting.
3. **Nothing here is attested.** The projection judgement is a LOOK call and it is the owner's.

## Provenance

All jobs `create_image_pixflux` / `create_map_object`, author-time only (ADR-0274 D2 / ADR-0219). No
vendor call, credential or clock enters the repo, the build or the browser.

| label | job id | seed | notes |
|---|---|---|---|
| view-param probe | `9511b111-34ab-43a4-b930-b09d111faaf2` | 31901 | side elevation, rejected |
| map-object 22 % | `044132a7-7120-41fd-bbbc-d4eee2d47e3c` | — | terrain only, rejected (`create_map_object` exposes no seed) |
| map-object (first try) | `973cb2c2-fc39-4957-8112-b000c2ca04da` | — | failed, uncharged: dimensions must be divisible by 8 — the raw 155×191 plate is rejected, the padded 156×192 plate works |
| prior @ strength 200 | `3c6e92b2-071e-4c89-8029-ead3bfcce5f9` | 31910 | accepted |
| prior @ strength 120 | `b0a4e381-5937-4da6-abef-2b14bca51030` | 31911 | accepted |
| aerial vocabulary | `878b8c9d-268c-4c49-9ea0-0b136a1f3da2` | 31912 | rejected |
| overhead-only description | `2783b411-00e1-421f-a4c7-67ac068441df` | 31913 | rejected |
| arc redraw f00 / f06 / f11 / f15 / f18 | `8bdda0dc-…` / `17360b9a-…` / `7e47226a-…` / `547e0e72-…` / `3e9a3ff4-…` | 31920/26/31/35/38 | f11/f15/f18 accepted, f00/f06 rejected |
| stage-aware f00 / f06 | `21b4f97b-5cee-4999-8b28-3b7d9a8c8d9f` / `aa8e14c7-57d4-4869-bb96-f98391f06ed1` | 31950 / 31951 | accepted — the fix |
