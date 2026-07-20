# Cosy-island style bible — the D2-safe reference for the palette/light lift

The bridge's **step 2** (ADR-0219 decision 2): *lock a style bible* read FROM the concept before any
re-authoring. This file is that lock for `cosy-island-concept.png` (owner-generated with nano-banana,
2026-07-20). It captures the concept's **palette, light, projection and composition** so the next
increment can lift the live island toward the cosy target with a named spec instead of a vibe.

**The D2 fence (ADR-0217 D2 / ADR-0219 decision 1).** These values are *read from* the concept by eye
and by pixel-sampling the committed PNG — they are **not** the concept parsed into code. The concept
image is never consumed by our build or runtime; it informs a KIT once. The hexes below are targets a
human tunes against a render, not literals to inline.

## The palette (sampled from the concept)

Dominant colours by area (median-cut over the whole PNG): ~70% is the dusty-blush hex ground, then a
muted sage green, then warm timber brown. **The entire concept is warm — there is not one cool grey in
it.** That is the single biggest palette finding: the live scene's coolest tokens (the retired stone
greys `#8a909a`/`#c3c8d0`, and the bright lime grass) read as foreign against this concept.

| Role | Concept (sampled) | Current live token | Gap toward cosy |
|---|---|---|---|
| Hex ground | `#e8d6cf` blush, lit facet `#f0ddd4`, seam `#e3d0c7` | `--hex-empty #f2e4dd`, `--board-2 #f3e0d6` | Ground is close; concept is a touch **dustier/warmer pink** — nudge toward `#e8d6cf` |
| Island grass | **`#737a54`–`#8c8663` muted sage** | `--hex-top-0/1/2 #a9c87f / #9fc174 / #b2cf8b` | **Biggest gap.** Live grass is bright lime; concept grass is **desaturated warm sage** — the key move |
| Beach rim | `#e4d3c6` warm cream | `--coast-sand #ecdcb4` | Concept rim is **pinker/creamier**, less yellow — soften `--coast-sand` toward `#e4d3c6` |
| Timber (frame/trunk/gazebo) | `#7c5c3f` frame, `#816950` trunk, `#6a563c` gazebo | `--tree-trunk #7d5f44`, `--trail-bed #c2a677` | Already a warm-brown family — **consistent**, keep |
| Roof shingle | `#9c7b53` warm tan | (buildings baked behind `?factoryart`) | Warm tan target for baked building palettes |
| Stone path | `#bcad8c` warm pale tan | (path not yet a scene element) | **No cool grey** — any path stays warm tan |
| Daisy (proven flower) | cream petal + gold centre | `--flower-petal-proven #fbf3e0`, `--flower-center-proven #eab94e` | **Already concept-tuned** (inc 7) — the flower family is the proof the palette can get there |
| Autumn tree crown | `#85583a` shadow → `#ae754e` lit | (middle tree is HELD, owner weighing a pond) | Warm autumn browns — **do not touch the tree this increment** |
| Lavender | dusty muted purple (under-sampled; ≈`#9a8fb0`) | — | A soft warm-purple accent if a lavender bed is ever added |

The inc-7 `--flower-*` block is the useful anchor: it was already tuned to this concept and the owner
attested it, so the lift is "make the island read like the flowers already do" — soft, warm, low
saturation.

## Light

A single **warm key light from the upper-left** — the cottage's front-left roof face, the gazebo's left
roof, and the tree's upper-left are the lit sides; soft contact shadows pool **down and to the right**
of each object. This matches the factory's shared sun `KIT_LIGHT_ANGLE` (135°) — the concept confirms
the baked-art light direction rather than changing it. There are **no hard cast shadows**; shadows are
soft, short, low-contrast ellipses (the existing `shadow` kind is the right vehicle). Overall contrast
is **low** — nothing is near-black or pure white; the darkest timber is `#6a563c`, the lightest ground
`#f7eee7`.

## Projection

The concept draws a **flat, near-top-down hex ground** with **gently isometric hero objects** (cottage,
gazebo and tree show two faces + a roof at roughly 30°). This is exactly the relationship ADR-0218
finding 3 already accepted and the owner already liked: the ground is flat 2.5D, the standing objects
are iso solids, and the two are allowed to diverge. **The concept validates the current split — no
projection change is implied.** It also holds ADR-0219 decision 4: this is a 2.5D isometric picture, not
a 3D scene.

## Composition — the heart of the cosy read

The concept is a **garden of a FEW well-placed hero objects with generous breathing room**: one
cottage, one big tree, one gazebo, one lavender bed, a couple of grass tufts, one daisy cluster, a stone
path threading them — on open sage grass. It reads as *a place someone tends*, not a field of markers.

This is where the live island diverges most, and it is **larger than a palette lift can settle**: the
live island scatters one UAT flower per criterion (~6/island) plus parcel flora plus conifers, which
inc 7 already flagged still "reads a little busy." Reaching the concept's few-hero-objects composition
means **rethinking what a UAT marker is** — the design conversation the arc has cut to its own thread
(nano-banana + concept-art pipeline), not this increment. The style bible records the target;
the composition rework is downstream of it.

## What this bible does NOT decide

- **The LOOK verdict.** Whether any lifted render actually reads cosy is the owner's, ADR-0070 stage 2 —
  never self-signed. This bible is the *spec* a render is judged against, not the judgement.
- **The middle tree.** HELD — the owner is weighing replacing it with a pond. No tree-crown or
  tree-shape change belongs to the palette lift.
- **Generative authoring.** Producing NEW assets with nano-banana (ADR-0219 decision 1) needs the
  owner's API key and is a later increment. This bible is drawn from the EXISTING concept image only, so
  the first cosy render needs no SDK.
- **The composition rework.** Fewer, larger hero objects and the UAT-marker rethink are a separate
  design thread (above).

## The lift this bible enables (grounded-art inc 9, next)

Ranked by impact on the cosy read, all inside the colour-is-class fence (ADR-0093) behind a
default-off flag:

1. **Desaturate + warm the grass** from lime toward sage (`#737a54`–`#8c8663`) — the single biggest move.
2. **Dust the hex ground** a touch warmer/pinker toward `#e8d6cf`, soften the beach rim toward `#e4d3c6`.
3. **Purge cool greys** from any island-facing token — the concept has none; everything is warm.
4. **Keep the flower family as-is** (already attested) and let the rest of the island move to meet it.

Then render ONE real island and hand the owner a hosted URL for the stage-2 look verdict.
