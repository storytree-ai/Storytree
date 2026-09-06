# The wheat field on the in-progress islands — 2026-09-06

Increment `paint-every-land-type-arc-inc-01` on `paint-every-land-type-arc`. Taken on the Mint box's
RTX 2060 (`report.txt` line 1 names the renderer; `software=false`), on the map as it ships after
PR #1843: one tree per capability (ADR-0518), the island at 318 units² per capability (ADR-0520),
the forest's spacing derived from island size (ADR-0521), every object casting its silhouette at
depth 0.55 (PR #1841).

**The owner, 2026-09-05, verbatim:** *"i'd like to start experimenting with painting on the other
land types, for unhealthy and wheatfields rather then have a whole separate base for it, i suspect
this will make it look more natural."*

## What this row does

The in-progress islands (`building`/`proposed`, one authored token, ADR-0462) drew a flat yellow
beside green islands wearing the six-layer painted stack — ADR-0492 D3's deploy gate. This row
widens ADR-0492 D1's gate BY TOKEN: the yellow rows get layer 1's own structure with a second
palette, entering as a mix INTO the island's yellow through the seam the grass uses (ADR-0490 D5),
never a cover over it. The layers above (sand, path, rock, detail) and the deep shadow rung follow
the painted gate, so a wheat island wears the whole stack the green does.

**Structure transcribed, colour re-derived — stated because ADR-0490 D2's anti-A/B rule is about
the structure.** Every shape constant is `land-grass.ts`'s by import (`build_land.py:836-868`,
`mat_attribute()`, never the `mat_procedural()` decoy): the three octaves, the two float mixes, the
hue-drift noise and its 0.38–0.62 remap, the 0.28 / 0.50 / 0.74 stop positions, linear
interpolation, one transfer. The six stop COLOURS are derived with no free constant: each wheat
stop is an authored anchor scaled per channel, in linear space, by the green stop's ratio to the
green token `#8cb85e` (`src/land-wheat.ts`, `rebaseStop`). The wheat therefore darkens, warms and
lightens in exactly the proportions the approved grass does relative to its green.

## The ladder — how yellow it is (the owner's pick)

Four authored anchors, none picked by eye here, ordered by the 2026-08-27 separation instrument's
distance from the nearest proof state (ascending — the pale straw sits nearest the in-progress
yellow, the mustard furthest, the 1.8x the arc's intent quotes):

| rung | anchor | source |
| --- | --- | --- |
| `straw` | `#d9d18a` | bleached straw, `chapter2-ground-cover-2026-08-27/README.md` §4 |
| `wheat` | `#d6b271` | the app's own wheat token (`harness/palette-band.ts`) |
| `light-straw` | `#c6c06a` | light straw, exactly on the 2026-08-27 instrument's bar |
| `mustard` | `#b0b040` | `YELLOW_GRASS`, the mustard the 2026-08-27 search authored |

Every rung wears the grass's strength (0.85 — the arc's premise is that the treatment transfers),
the same rows, the same stack, the same shadow. The anchor is the one moving part.

`sheet-8px.png` — the green island (unchanged), the in-progress island flat (today), the four rungs.
`crop-8px.png` — the same six at 2x. `sheet-forest-fit.png` — the REAL forest fitted, today then
the four rungs (the studio's own layout for the live corpus, `chapter2-forest-spacing-2026-09-06/
scenes/spacing-0.json`; ⚠ that export carries **25 healthy and 10 in-progress** islands as at
2026-09-05, not the 21/14 the 2026-08-28 public snapshot recorded — the corpus moved).

**The pick: `mustard` ships (`SHIPPED_WHEAT_ANCHOR`).** Read off the crop: the two pale rungs'
warm half goes peach (`straw` `#fabe9b`, `wheat` `#f7a27f` at the warm light stop) and the island
reads as a sandy clay — nearer `mapped`'s family than a field; `light-straw` reads as a muddy
khaki; the mustard is the only rung that stays YELLOW under the recipe's darkening — a golden
field with olive patches, and beside the green island it reads at a glance as a different,
dry ground rather than a tint of the token. It is also the boldest rung, which is what ADR-0503
asks for. Scaling back is one edit along rungs already rendered.

**Two findings the ladder surfaced, both intrinsic to the derivation and reported rather than
argued away:**

1. **Every rung is darker and duller than the flat yellow.** The recipe's ramps sit BELOW the
   token (the green's dark stop is 0.20–0.26 of its token, the mid stop ~0.5), and the wheat
   inherits that ratio. The green islands underwent the same darkening on 2026-09-03 and it is the
   approved look; on the yellow it costs the flat token's brightness. If the owner wants a PALER
   field, the lever is not the anchor but the stop luma — a second, one-number ladder, not built
   here.
2. **The pale anchors' warm ramp turns peach.** The green's cool→warm drift is a 28° hue turn
   toward yellow; transcribed onto a colour that is already yellow, the same turn heads for
   orange-red, and on a pale anchor with little green in it that is peach. The mustard has enough
   green to absorb it (its warm light stop is `#cba049`, a gold).

## The numbers (`report.txt`)

One in-progress island at 8 px/unit; every rung moves **172,103–172,249 px of 215,230 land px**
(80%) past ADR-0490 D6's 20/255 bar against today. Rung-to-rung the anchors are closer than the
bar: `straw→wheat` 33 px visible, `wheat→light-straw` 0, `light-straw→mustard` 20,119 — the
ladder's steps are TINTS of roughly 10–20 channel units, visible as a whole-island hue shift and
mostly under the per-pixel bar. Colour families (5-bit, ≥0.5%): flat yellow **20** → 51 / 54 /
55 / **55** (the green island reads 63 on this run; the approved render 23 through this page's
census at its own resolution). The green island: **0 px touched** between today and shipped.

The real forest fitted: 8,010–8,037 px of 36,615 land px move on every rung (the in-progress
islands' share); families 43 → 42.

**The reader model, printed** (`margins.json`; ceiling walked on a **0.0005 grid** — quote the
step; the same walk returns 0.008 / 0.009 / 0.0095 at 0.002 / 0.001 / 0.0005):

| rung | ceiling @ 0.0005 | worst margin at 0.85 | worst pixel reads as | shares over the ladder |
| --- | --- | --- | --- | --- |
| straw | 0.0135 | −30.75 at `building@0.77` | `mapped` | building 59% · unknown 37% · mapped 4% |
| wheat | 0.0090 | −48.50 | `mapped` | building 49% · mapped 37% · unknown 14% |
| light-straw | 0.0105 | −40.04 | `mapped` | building 49% · mapped 22% · healthy 17% · unknown 13% |
| **mustard** | **0.0085** | **−54.37** | `unhealthy` | building 30% · mapped 34% · healthy 32% · unhealthy 5% |

The shipped GREEN on the same instrument at its 0.85: **−33.48** at `healthy@0.77`. The unpainted
yellow's own tightest margin: 0.93. The shadow on the yellow: margin **3.0** at the derived rung
0.78 (what shipped) → **−39.9** at the deep rung 0.55 (what the painted islands wear now).
Reported, not a fence (ADR-0503 D1, ADR-0506, ADR-0489 D3/D4): the table holds the FLAT six
tokens, so "reads as healthy" means nearer the flat green than the flat yellow, which a viewer
comparing two PAINTED islands never does. The picture decides, and on the picture the mustard
island reads as a yellow island beside a green one.

## Cost — measured and REPORTED (ADR-0517 D4)

- **GPU frame**, 60 frames on the GPU's own clock: the real forest fitted **0.411 ms today →
  0.415 ms shipped**; one in-progress island 2.688 → 0.389 ms, which is the first-row effect
  `the-forest-ground-is-one-draw-call` records (the first batch after a scene change is
  inflated), not a saving. The wheat evaluates NO octave of its own — `st_paintColour` reads the
  fields the grass already evaluates once per fragment — so the cost cannot move with the pick.
- **The mount-time stamp** is the same field on every arm: 26 ms one island, 699 ms the forest.
- Triangle delta zero on every arm (fragment-stage layer).

## What did NOT change

The green islands' delivered look (0 px, asserted by the driver); every token but the two yellow
rows; the light, the ladder, the recipe's structure; one draw call for the ground.

## Files

`<arm>-{green,yellow,forest}.png` (14 frames, 2560×1600) · `sheet-8px.png` · `crop-8px.png` ·
`sheet-forest-fit.png` · `measurements.json` · `reference.json` · `margins.json` ·
`frame-cost.json` · `report.txt`.

Page: `harness/shipped-wheat.html` (`shipped-wheat-scene.ts`); driver
`shipped-wheat-measure.mjs` (`pnpm --filter @storytree/forest-world-r3f measure-shipped-wheat`,
`DISPLAY=:0` on the Mint box, the harness served from THIS worktree on its own port). Instrument:
`harness/wheat-status-reading.ts`. Sheets: `contact-sheet.mjs` and `crop-sheet.mjs --x 880 --y 540
--w 800 --h 480 --scale 2` (⚠ captions may not contain `=` or an em dash).
