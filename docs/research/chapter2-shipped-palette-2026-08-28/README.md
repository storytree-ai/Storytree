# The shipped map was reporting states in colours no decision authorised

2026-08-28 · increment `the-shipped-canvas-third-status-palette` on
`adopt-the-land-into-the-shipped-map-arc`

`packages/forest-world-r3f/src/ForestWorldCanvas.tsx` — the component the public site's chapter 2
began opening on earlier today — carried its own six-colour lookup, its own comment calling it "a
spike palette, not art direction". It disagreed with every land-colour decision this project has
made, on **all six states**, and it painted the story tree's crowns from the same lookup.

The land's colour IS a capability's proof state (ADR-0392 D5 / ADR-0398 D7, as amended by
ADR-0461). A palette no decision authorises is therefore not a cosmetic lag: it is the map
**reporting states nobody decided**.

| state | the map used to say | the map now says (ground) | crown |
|---|---|---|---|
| `healthy` | `#4f9d5d` | `#8cb85e` | `#2f6b3f` |
| `mapped` | `#5d8fa8` — **a blue** | `#b7684e` — ADR-0470's tilled clay | `#7d5f3b` |
| `proposed` | `#c2b280` | `#d8c069` | `#b06a24` |
| `building` | `#7f8fd1` — its own periwinkle | `#d8c069` — ADR-0462 merged it into `proposed` | `#6b7280` |
| `unhealthy` | `#8a5a44` — **a brown** | `#57544a` — the decided charred near-black | `#9f2d22` |
| `unknown` | `#9a9a9a` | `#9ca3af` | `#6b7280` |

## The pictures

Both arms are the **real** `ForestWorldCanvas`, mounted from `src/`, one uniformly-coloured island
per state with its story tree drawn. No prop was added to the shipped component to fake a
before/after: the same page (`harness/palette.html`) was photographed twice against two states of
the file **on disk** — the working tree, and `git show HEAD:` — with the rollback restored and
digest-checked on the way out.

| | overview — 480x320 stage, 0.94 px/unit | zoomed — 1200x800 stage, 2.35 px/unit |
|---|---|---|
| **before** | `before-overview.png` | `before-zoom.png` |
| **after** | `after-overview.png` | `after-zoom.png` |

What to look at in `after-zoom.png`, because it is the argument for the whole unit: `proposed` and
`building` now share one yellow **ground** while their **crowns** stay different — amber and slate.
That is the pair a straight find-and-replace would have flattened, and it is why the fix was a
split of one lookup into two rather than a swap of six values.

## Why it was a split, not a find-and-replace

One `STATUS_COLOUR` map painted the ground AND the crowns, and the two legitimately differ. The
harness already keeps a separate crown table (`palette-band.ts`'s `TREE_TOKENS`) for exactly this
reason, so the distinction was adopted rather than invented. The sharpest case is `building`: the
authoring surface writes no `--crown-building-*` pair at all, so a building crown falls through the
cascade to `unknown`'s slate while its ground wears `proposed`'s yellow. One table cannot hold
both facts.

## The guard

`pnpm check:palette-transcription` — see [GUARD.md](GUARD.md) for what it compares, why it is a
gate rung rather than only a test, and the transcript of the four mutations it was made to refuse.
The short version: this was the **third** transcription of the same colours to drift, and the fix
without a guard just resets a clock.

## The measurement, and the two wrong answers it gave first

`harness/palette-measure.ts` (`pnpm --filter @storytree/forest-world-r3f measure-palette`) takes
the pictures and refuses three ways. `palette-measure.json` carries every number.

1. **The two arms must photograph different scenes** — per-panel screenshot digests, all twelve.
   If the rollback did not take, the whole page is a picture of one thing twice.
2. **The paired chromaticity verdict.** For each state, the AFTER panel's modal land colour must
   be chromatically closer to the decided ground colour than the BEFORE panel's is, and BEFORE
   closer to the retired spike colour than AFTER is. **Paired, with the BEFORE arm as the control**
   — no absolute threshold is picked by the driver. Chromaticity rather than RGB because the
   canvas has a real light on it and a delivered pixel is never the material hex.
3. **The two zooms must deliver different resolutions**, read off the projection matrix each
   panel's own GL context received — `x2.50`, measured, not asserted from the stage sizes.

Measured on the RTX 2060 through ANGLE (not SwiftShader — the driver refuses a software context
when `ST_PALETTE_GPU=1` is asked for):

```
   state     zoom      modal land b→a      →decided b/a        →spike b/a          verdict
   healthy   overview  #318042→#759a49     0.1589→0.0091       0.0627→0.1043       ok
   mapped    overview  #407289→#964a33     0.3080→0.0468       0.0282→0.3265       ok
   proposed  overview  #a2966a→#b3a258     0.0369→0.0051       0.0029→0.0364       ok
   building  overview  #6473ab→#b3a258     0.1791→0.0051       0.0061→0.1714       ok
   unhealthy overview  #683a28→#36332b     0.1692→0.0099       0.0515→0.1092       ok
   unknown   overview  #7e7e7e→#818792     0.0179→0.0013       0.0000→0.0191       ok
   ... and the same six at the zoomed stage
```

### It can fail — shown, not claimed

`GROUND_COLOUR`'s `mapped` was reverted to the spike blue `#5d8fa8` and the driver re-run against
an otherwise-correct tree. It refused, and it refused **only that state** — the other five stayed
`ok`, so the verdict discriminates per state rather than falling over wholesale:

```
   mapped    overview  #407289→#407289     0.3080→0.3080       0.0282→0.0282       XX not closer to decided not away from spike
   mapped    zoom      #407289→#407289     0.3080→0.3080       0.0282→0.0282       XX not closer to decided not away from spike
```

### ⚠ Two measurements this driver got WRONG on the way, recorded because they are the interesting part

Both produced confident tables. Neither was noticed by anything but re-reading the numbers.

- **Averaging chromaticity over the whole panel failed on three states, for a reason that was the
  driver's fault and not the fix's.** The mean mixes GROUND with CROWN, and the crown is exactly
  what this increment moved onto a second, deliberately different table — `unhealthy`'s new crown
  is a strong red over a charred ground, so the panel average moved *away* from the decided ground
  colour while the ground itself moved onto it. The judged figure is now the **modal** land colour,
  which on an island of many parcels carrying one small tree is the lit parcel top by a wide
  margin (85% of land pixels, recorded per panel).
- **Excluding "background-ish" pixels within 30 RGB units deleted a whole state's land.** The sea
  is `#101418`; ADR-0470's charred `unhealthy` ground delivers around `#36332b`, and its shaded
  faces fall inside 30 units of the water. The panel came back 0.08% land and reported its red
  crown as the modal ground colour. The radius is now 8 — the sea is a flat clear colour with no
  light on it, so it is exactly one value and needs no generosity — and the driver refuses any
  panel under 2% land rather than measuring a handful of rim pixels.

And a fourth thing the conversion found. Unlike its thirteen sibling drivers this one is `.ts`
rather than `.mjs`, because `tsx` and `bun` are transpile-only and an untypechecked instrument can
print confident numbers from code that does not compile. Converting it surfaced **eleven
implicit-`any` indexings of the per-panel report** — every one of them in the arithmetic that
produces the verdict — plus an unchecked 2D context and a possibly-out-of-range pixel channel.
None would have crashed; all would have produced a table.

A third, earlier version excluded only the *page's* stage colour and not the canvas's own scene
background, and reported `#101418` — the ocean — as the modal land colour in all twelve panels,
identical in both arms. The sea colour is now **parsed out of the file under test** rather than
typed into the driver, for the same reason everything else in this increment is: a hardcoded copy
of a colour that lives somewhere else is how this defect happened in the first place.

## One thing worth the owner's eye, which is not a defect

`unhealthy` land delivers at `#36332b` against a `#101418` sea — about 53 RGB units apart, where
`healthy` sits 163 away. The charred near-black is doing exactly what ADR-0470 decided, and on
this canvas, with this light, it reads as a *dark* island rather than a *black* one. The studio's
flat SVG has no light on it and so does not show this. It is legible in `after-zoom.png`; whether
it is legible enough at whole-forest zoom, where an island is a few pixels across, is a question
for the crowd work rather than for this increment.
