# The island carries its flowers and its story tree — 2026-08-20

On 2026-08-16 the owner fenced the land work to a research track with the words *"this should just
be a research pass on a single island, we still dont have flowers etc, isolate this away from the
main app until we ready"*. The "etc" was never enumerated and the flowers were never built. The
[2026-08-19 island](../chapter2-live-island-2026-08-19/README.md) made the gap concrete: it drew
ground and vegetation and **nothing else**.

This pass closes two of the seven items ADR-0392 D3 names — **item 4, the UAT flowers**, and
**item 5, the hero story tree** — and it takes its own art calls under ADR-0392 D2 rather than
bringing them to the owner. Every one of those calls is recorded here and, more durably, at the
point in the source where it is made.

## What is on the island now

**Read `panel-what-they-add.png` first.** Four panels at the size the map is actually delivered:
the 2026-08-19 island as a control, the island with both new components, and each component alone.

- **Ten UAT flowers**, one per criterion, 1:1 (ADR-0226 D4). The ten are the real story's own ten
  criterion ids, transcribed from `stories/context-traversal-capture/story.md` — the count and the
  seeds are the real island's, so the flowers stand where the real island puts them.
- **The hero story tree**, standing on the land with a visible bole, at the render angle by
  construction rather than by reconciliation.

**`panel-verdict-forms.png` is the one that tests the vocabulary.** ADR-0226 D4 puts the UAT
verdict in the flower's FORM rather than in a glow or a colour, so the only real test is whether
the three read apart *as silhouettes*. They do: a bloomed daisy is white petals round a golden
disc, a closed bud is a sage teardrop on a bare stalk, and a wilted head is a pale fan hanging off
a bowed stem. The panel shows a mixed island and then the pathological control — every criterion in
one state at a time, three islands that must be immediately different from one another.

## The tree-angle fork, and how it was decided

The increment posed one engineering fork and required an answer. The signed hero-tree track (v9,
PR #1159, owner ceiling verdict 2026-08-14) is a **raster sprite** baked by `blender_tree.py` at a
hardcoded `ELEV_DEG = 20.0`, while the live island renders at 50°. A sprite baked at one angle
standing on land drawn at another reads wrong, and `assertSpriteRenderMatchesLandCamera` exists to
refuse exactly that. Three options were named: re-render the track at the render angle, build a
live-rendered tree, or hold the island at 20°.

**The choice is the second, and the full argument lives at the top of
`packages/forest-world-r3f/harness/tree-descriptors.ts`.** In short, in the order the reasons bind:

1. **A raster cannot stand here without breaking the palette fence.** This harness's palette is
   closed BY CONSTRUCTION — every delivered colour is `authored token × authored level` — and
   `capture.mjs` refuses any pixel outside it. The v9 track's pixels are snapped to exp-16's
   committed 31-colour palette, which shares no entry with the land's. Admitting them means
   widening the closure to a second, SNAP-derived palette, and a snap is the weaker construction:
   it is the one that already repainted an `unknown` island's rim `healthy` green over 2564 px.
2. **The re-render is cheap; what it delivers is the problem.** `--only 18 --elev 50` renders just
   the mature frame — frames 0 and 18 are pinned at every angle, so the SIGNED mature state is
   angle-invariant — and Blender 5.2 is on this box. Compute was never the objection. The objection
   is that it arrives as a 128-px billboard at ONE GROUND UNIT = ONE DELIVERED PIXEL, the exact
   budget this experiment exists to escape, pasted over an island whose every other mark rasterises
   at the display's resolution. On the zoom rungs this page already publishes, the tree would be the
   one thing turning to pixel mush while the plants stayed plants.
3. **It would not make the camera a parameter — it would make it a chore.** The owner's own framing
   is that going 3D makes the camera a parameter. A baked frame answers ONE angle; the parked
   `shared-camera-angle-rises-to-birds-eye` increment would need another render, and so would every
   angle after it. Live geometry answers all of them for free.
4. **And it re-tunes nothing.** The tree is READ, not authored: lobe count, centres, radii and
   per-lobe jitter all come from `buildTree`'s own output, keyed by the story id exactly as the
   surface keyed them. The nine versions of Blender crown tuning are untouched and unspent.

**What this does NOT deliver, stated plainly.** ADR-0392 D3 item 5 names "the hero story tree", and
the increment brief means the SIGNED BLENDER TRACK by it. This delivers the island's OWN declared
tree as live geometry. The island is no longer treeless and its tree is at the render angle by
construction — but the v9 silhouette is not what stands there. If the terminal look wants that
specific silhouette, the follow-on is to port v9's skeleton into the live generator;
`blender_tree.py` computes it in pure numpy and runs under `--no-render`, so the port is a data
export plus a generator, not a re-authoring. That is real work and it is named rather than
pretended away.

## The art calls, and the one that was withdrawn

ADR-0392 D2 gives these to the driving session and requires them to be recorded with their reasons.
Each lives at the point in the source where it is made; this is the index.

| Call | Where | What, and why |
| --- | --- | --- |
| **The bloom faces the light** | `flower-geometry.ts` | A daisy's head is a disc, and a disc in 3D has one dishonest answer (face the CAMERA — a billboard, which is what ADR-0380 D6 fence 4 refuses) and one that reads as a smear at this camera (face straight UP). It faces the LIGHT, which is what a real daisy does. The tilt is **derived from `LIGHT_DIR_AUTHORED`**, not chosen, so it cannot drift away from the light — and a test asserts the two still agree. |
| **A failing head bows past vertical** | `flower-geometry.ts` | Past 90° the disc's normal turns downward, which is what nodding IS. How far past was rendered rather than reasoned: the first value (118°) put the head almost exactly edge-on to the delivered camera and the wilted flower read as a flat bar that could have been debris. 105° leaves about 40% of the hanging fan visible instead of 20%. The constant is camera-free; the delivered camera informed the CHOICE, which is the honest way round. |
| **A petal has thickness** | `flower-geometry.ts` | A zero-thickness sheet has ONE normal, so on a four-rung banded material it lands wholly on one rung and the bloom reads as a flat cut-out star. A little volume carries the normal round a curve and picks up two rungs, which is what makes eight petals read as eight petals. |
| **The two stalk leaves sit out of the stalk's plane** | `flower-geometry.ts` | The surface alternates them left and right ACROSS the stalk, which in a planar drawing is the only axis it has. In a solid, two leaves in one plane read as fins on a rudder. Deterministic in the authored side, never random. |
| **The stalk tapers toward the head** | `flower-geometry.ts` | The surface draws ONE stroke width, because a stroke has one width. A swept tube of constant radius reads as a wire rather than as a stem. The taper is proportional (35% over the stalk's length), so it scales with the stalk rather than being a second size to keep in step. The smallest call on this list, recorded because the list claims to be complete. |
| **The proven glow is DROPPED** | `palette-band.ts` | `--flower-glow-proven` is drawn at opacity 0.10/0.16 over whatever is behind it, and a blend of two palette entries is a colour on NEITHER — the one thing a constructed palette cannot represent. Dropped rather than approximated; the bloom says "proven" with its petals, which is what ADR-0226 D4 asked of it. |
| **The crown's `-hi` blobs are grown but not painted lighter** | `palette-band.ts` | The SVG's three lighter `crown-hi` circles are the flat renderer STANDING IN for a light it does not have. A live crown has one, and `LIGHT_DIR` comes from up-left-forward — where those blobs already sit. Grow both groups (their silhouette is authored and real), paint them one token, and the highlight is said ONCE. `--crown-<status>-hi` is therefore not transcribed at all: an authored token nothing can emit would enlarge the closed palette with an entry that never delivers. |
| **~~Crown depth spread~~ — MADE, MEASURED, WITHDRAWN** | `tree-geometry.ts` | See below. |

### The withdrawn call is the one worth reading

The SVG crown is eight overlapping circles in a plane, which *looked* like it had to mean a
cardboard cut-out in 3D. The first version gave each lobe a seeded depth offset of up to 0.62 of the
crown's widest radius, keyed on the story id — enough, on the arithmetic, to make the crown "roughly
as deep as it is wide".

**The render said otherwise: the tree came out a floating balloon with no visible bole.** The reason
is a fact about this projection the arithmetic never touched — at an elevation camera, moving a lobe
toward the viewer by `dz` also moves it DOWN the screen by `dz·sin(elev)`. At 50° a 19.8-unit push
drops a lobe 15.2 screen units, and the crown's lowest blob sits only 16.4 above the tree's ground
contact. The offsets did not add depth; they dragged the crown's near side down over the whole trunk.

It is **withdrawn rather than tuned, because the premise was wrong**. The authored lobes are
SPHERES, of radii 11 to 32. A union of spheres whose CENTRES share a plane is already a volume: this
crown is **64 units deep against 76 wide before anything is offset at all**. There was no cut-out to
fix, and the offsets cost something real — they moved the authored crown around in screen space,
which is precisely the re-authoring this increment says is off the table.

Two tests hold the corrected version rather than prose: the crown's z extent must be **exactly**
twice its widest lobe's radius (true only if every centre sits at z = 0), and the crown must leave
the bole exposed above the tree's own ground contact.

## Findings the next session should have

**1. A pending island is nearly indistinguishable from a flowerless one at delivered size.** Ten
sage-green buds (`#7f9d5c`) against light-green ground (`#8cb85e`) carry very little contrast, so
the "all pending" control reads much like the bare control. This is the AUTHORED vocabulary
behaving as authored — a bud is deliberately calm and unopened, and *the absence of bloom is the
signal* (ADR-0045: only a signed pass opens). It is reported rather than fixed, because raising a
bud's contrast until it reads is changing what the vocabulary asserts, and that is an ADR-0226
question, not an art call (ADR-0367 D5).

**2. A UAT flower does NOT recolour with the parcel it happens to stand on**, and the mixed panel
shows a white daisy standing in the charcoal `unhealthy` parcel. That is correct: the flower is the
STORY's criterion, not the capability's, and its colour is a material rather than a channel
(ADR-0226 D4 puts the verdict in the form). The palette instrument agrees by construction — flower
tokens attribute to no status family, and `capture.mjs` now subtracts the family-less tokens before
auditing foreign-status reads, so a daisy no longer reads as a defect.

**3. The tree reads STUBBIER at 50° than the same tree does at 20°**, and this is correct camera
behaviour rather than a defect: heights foreshorten by `cos(elev)` while a lobe's radius does not
foreshorten at all, so raising the camera shortens the bole against a crown that keeps its width.
It is named because it is exactly the kind of true-but-surprising change that gets mistaken for a
regression.

**4. The live crown wears the same union-of-spheres silhouette the owner called "circular swirls"
on the vegetation**, because that is what `buildTree` authors. If the open mound-vs-foliage fork
lands on `foliage`, the same question arrives for the hero tree — and answering it would be a
`packages/forest-world` change to `buildTree`, not a harness one. Surfaced, not decided.

**5. There is still no shadow.** ADR-0392 D3 item 2 names it, and it is
`shadow-ladder-is-admissible-and-affordable`'s increment. The scene's contact-shadow ellipses are
READ by both new extractors and deliberately discarded, so the moment a shadow ladder exists they
are already available rather than needing to be rediscovered.

## Numbers

- **11,250,412** opaque delivered pixels across **21** canvases, **0 off-palette**, **44** distinct
  delivered colours against **156** authored entries (up from 104 — the flower family, the crown
  tokens and the shared bole are all newly declared, which is what keeps the fence a fence rather
  than a fence with an exception).
- 13 hexes · 11 capabilities · all healthy · **10 UAT criteria** · vegetation density is
  `2 + tests × 1.9` (ADR-0226 D2).
- The tree: 8 authored crown lobes, **91.6 world units** tall, crown **76 wide × 64 deep**, 1,024
  triangles in the crown and 70 in the bole.
- **116 checks** in the package, up from 81.

⚠ The frame timings in `capture-report.json` remain **RELATIVE ONLY** — headless Chromium here is
SwiftShader (software). The ADR-0380 D2 hardware-floor question is still unanswered and still needs
the owner's own machine.

## Fixture honesty

`island-fixture.ts` is shaped after `context-traversal-capture` (the arc's chosen research surface)
but is NOT the live corpus — a harness page must render with no database. Two things are now the
real story's rather than invented: the **count** of UAT criteria (ten) and their **ids**, which
matter because the scatter seeds each marker's placement on `hash(storyId:marker:criterionId)`, so
invented ids would put the flowers where the real island never puts them.

Their default **state** is `proven` throughout. That is the same claim the fixture already makes for
the ground — this is the all-healthy research surface, and under ADR-0040 green comes from a signed
verdict — and it is deliberately not a mixed default: a page that shipped failing flowers as its
resting state would be the art asserting a proof state the work does not hold. The mixed and
single-state spreads are labelled where they appear, exactly like the foreign-status capability.

Test COUNTS remain the real spread's shape rather than the real numbers, as before.

## Scope

Every file is in `packages/forest-world-r3f/harness/`, outside the tree `pnpm sync:web-engine`
mirrors into the public website repo; `packages/forest-world-r3f/src` is byte-identical to `main`,
and `scope-fence.test.ts` holds that as a property — the four new modules are named in its sweep.
`packages/forest-world/src` is untouched: the flowers and the tree the island draws are the ones
`buildScene` already emitted, read rather than added to. ADOPTING the live path into the app remains
a separate event and the owner's call (ADR-0380 D6).

## Files

- `panel-what-they-add.png` — **read first.** The 2026-08-19 control, both components, and each alone.
- `panel-verdict-forms.png` — **the vocabulary's own test.** Mixed, then one state at a time.
- `panel-delivered.png` — the whole island, life size, both delivery conventions.
- `panel-zoom.png` — where the two conventions part.
- `panel-swirls-fork.png` — the still-open mound-vs-foliage owner call, unchanged by this pass.
- `panel-bare-and-mixed.png` — the bare-land control, and one unhealthy capability.
- `live-island.png` — the whole page.
- `capture-report.json` — measured numbers, including the WebGL renderer string.

## Reproducing

```bash
pnpm --filter @storytree/forest-world-r3f dev
```

Then `http://localhost:5184/island.html`. The capture is:

```bash
ST_HARNESS_URL=http://localhost:5184/island.html ST_OUT_DIR=docs/research/chapter2-island-flowers-and-tree-2026-08-20 ST_FULL_PAGE_NAME=live-island.png ST_PANEL_NAMES=delivered,zoom,swirls-fork,bare-and-mixed,what-they-add,verdict-forms pnpm --filter @storytree/forest-world-r3f run capture
```

⚠ If port 5184 is already held by another worktree's harness, Vite refuses to start — but the
existing server still answers `/island.html` with **HTTP 200** via SPA fallback, serving a DIFFERENT
page. This pass hit that (5184 and 5187 were both held) and ran on 5193. Check the served `<title>`
before trusting a capture, or run on a free port with `--port <n> --strictPort`.
