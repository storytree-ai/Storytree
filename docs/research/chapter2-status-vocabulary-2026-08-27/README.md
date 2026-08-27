# Five colours over six states — the land's colour vocabulary, before and after

Increment `four-status-colours-not-six` on `adopt-the-land-into-the-shipped-map-arc`.
Decision: **ADR-0462**, born accepted (owner-directed 2026-08-27, ADR-0110).

**The deliverable is the two sheets.** `status-combined-2px.png` is the overview zoom the map is
actually read at; `status-combined-8px.png` is the zoom the owner singled out. Six states across,
BEFORE above and AFTER below, whole islands at delivered size, nothing resampled.

---

## 1. What the owner settled

> "get rid of building and unknown they dont need colors because i have yet to see them ever get
> rendered. forgot about mapped which should be brown."

and then, on being shown that both **are** rendered:

> "if something is building just color it yellow because its basicly the same as proposed, theres
> no value add, we can already see if wisps are working on it or not. Now that you mention it I
> have seen grey capabilities for no data or error and I dont mind that, so maybe error or some
> other edge case can color grey which can be the 'unknown' label"

| colour | states | token | was |
|---|---|---|---|
| yellow | `proposed` **and** `building` | `#d8c069` | `proposed` `#d8c069`, `building` `#dcab52` |
| brown | `mapped` | `#b3946a` | unchanged |
| green | `healthy` | `#8cb85e` | unchanged |
| black | `unhealthy` | `#57544a` | unchanged |
| grey | `unknown` | `#9ca3af` | *no colour at all* — it kept the base grass `#a9c87f` |

**The two states move in opposite directions and it is easy to get backwards.** `building` MERGES
into `proposed`'s yellow — it does not lose a colour and fall through to something. `unknown`
GAINS one.

---

## 2. The measurement, on pixels a browser delivered

`harness/status.html` + `harness/status-measure.mjs`, 24 panels, `getImageData` off the canvas
(never a screenshot — two earlier pictures on this arc were confounded exactly that way).

Renderer: **ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)** — a
software rasteriser. `EXT_disjoint_timer_query_webgl2` absent. Recorded rather than assumed, per
this arc's 2026-08-27 finding that every earlier figure came off software without saying so. The
figures below are palette arithmetic and delivered-colour counts, both of which are exact on any
renderer; nothing here is a contrast or grain figure, so nothing here is renderer-sensitive.

### 2a. Can a reader be told the wrong thing?

Each colour's own ground token, delivered at every rung of the lighting ladder, handed to the
reader model ported from the author-time compositor (`shadow-ladder.ts`, held to three
independently recorded configurations).

| | misreads | which |
|---|---:|---|
| **before** | 6 | `brown@1→yellow` · `green@1→grey` · `grey@0.78→green` · `grey@0.8→green` · `yellow@0.78→brown` · `yellow@0.8→brown` |
| **after** | 2 | `yellow@0.78→brown` · `yellow@0.8→brown` |

Three of the four removed were the `healthy`/`unknown` pair trading places in both directions —
**doubt painted as proof** at two rungs of four, which ADR-0367 D5 names as the worst available
direction to be wrong, and proof painted as doubt at the third.

What is left is one pair on two rungs: unproven greenfield read as inherited brownfield at the two
darkest lighting steps. It is the **entire remaining scope** of the sibling row
`pull-the-four-land-colours-apart-in-hue`, which this change narrows rather than absorbs.

### 2b. Colour separation, cross-rung

The closest two colours come across the **whole** ladder — not at matched light — because that is
the question ADR-0414 D4 asks: can lighting slide one parcel onto another's colour? The bar is
read off a control in the same run, never picked: **one lighting step on a single token.**

| pair | before | after | bar | |
|---|---:|---:|---:|---|
| yellow / brown | 8.25 | **8.27** | 20.92 | UNDER |
| brown / black | 18.42 | 18.42 | 16.59 | clears |
| brown / grey | 20.52 | 19.68 | 17.42 | clears |
| yellow / green | 23.72 | 23.72 | 20.92 | clears |
| **green / grey** | **3.33** | **24.55** | 17.80 | clears |
| **black / grey** | 45.22 | **24.93** | 17.42 | clears |
| brown / green | 25.24 | 25.24 | 17.80 | clears |
| yellow / grey | 19.50 | 27.41 | 20.92 | clears |
| green / black | 29.94 | 29.94 | 17.80 | clears |
| yellow / black | 40.81 | 47.34 | 20.92 | clears |

- **worst pair of distinct colours: 3.33 → 8.27**, a 2.5x improvement in the map's weakest link.
- **pairs under the bar: 3 → 1.**

Distances are in the quantiser's own luma-weighted space (`W_LUMA` 0.30 / 0.59 / 0.11), never
CIELAB — the same space as this track's published 3.33 / 4.32 / 13.98.

### 2c. The merge, proved on delivered pixels

Both yellow panels are drawn and hashed. This is the assertion no source-reading test can make:

```
AFTER  2px  proposed 6f804830868df881 == building 6f804830868df881
BEFORE 2px  proposed 6f804830868df881 != building 63be9a270f90d45d
AFTER  8px  proposed f01950ef2c0c4ee7 == building f01950ef2c0c4ee7
BEFORE 8px  proposed f01950ef2c0c4ee7 != building a38fb7cf61a1e78f
```

The BEFORE inequality is load-bearing: without it the AFTER identity would also be satisfied by a
page that ignored its `palette` prop and drew the live table in both rows — which would make the
whole before/after comparison a picture of one thing twice.

`status-live-proposed-8px.png` and `status-live-building-8px.png` are committed here and are
byte-identical files.

Palette **CLOSED on all 24 panels** — zero off-palette pixels, both vocabularies.

---

## 3. ⚠ The design constraint, and what checking it actually found

The increment's own text named the risk: `unhealthy` is a dark **warm** near-neutral (`#57544a`,
hue 46, saturation 8%) and `unknown` was about to become a grey, so the two could end up differing
only in brightness. Three candidate greys were measured rather than argued about, and the result
was **not** what the increment predicted.

| candidate | grey↔black | reads wrong as | verdict |
|---|---:|---|---|
| base sage `#808763` — the colour the owner had been seeing and calling grey | 17.66 | `healthy@0.78→grey`, `mapped@0.78→grey` | **fails, but not on grey/black** |
| warm grey `#7a7668` — a pure brightness variant of the charred token | 7.90 | — | fails the bar |
| warm grey `#6d6a5f` | 1.01 | `grey@0.78→black`, `grey@0.8→black` | fails, on grey/black exactly |
| **cool slate `#9ca3af`** | **43.53** | *nothing* | **chosen** |

Two things worth carrying:

1. **The stated fear is real but it only bites on a DARK grey.** The ladder spans 0.78–1.00, so a
   pure-brightness collision needs the two tokens within ~28% of each other in luma. `#57544a`
   sits at luma 84; a grey has to come down near it before lighting can reach across. `#6d6a5f`
   does and slides onto black at two rungs.
2. **The naive answer fails somewhere else entirely.** Growing the grey out of the warm base sage
   clears grey/black comfortably and then lands `healthy` and `mapped` on `unknown` at their dark
   rungs — proof read as doubt. Had the constraint been checked only on the pair the increment
   named, that candidate would have passed.

The mechanism, as a number: `chromaticSeparation` rescales one token to the other's luma and
measures what is left, so it is exactly zero for a pure brightness variant. It **predicts** the
cross-rung result — residual 0.10 → 7.90 apart, residual 0.68 → 1.01 apart, residual 12.54 →
43.53 apart. It is reported as the diagnostic and never as the verdict; the reader model is the
verdict, which is `shadow-ladder.ts`'s own stance about luma.

All four arms are pinned in `harness/status-vocabulary.test.ts`, so the bar is one that has been
seen to fail.

---

## 4. ⚠ Consequences elsewhere, measured not assumed

**The shadow got DEEPER, for free.** `SHADOW_RUNG` is derived on import as the deepest level at
which no rendered status reads as another. It moved **0.84 → 0.81** and the binding status moved
from `unknown` to `proposed` — because the status that used to bind was the one sitting four
degrees of hue from `healthy`, and it is no longer there. Nothing about the shadow was retuned.

**The closed palette SHRANK for the first time.** 240 → 224 lit entries, 300 → 280 shadowed:
`building`'s four authored tokens left `landTokens()`. The identity `after − before ===
landTokens().length` still holds and is still the assertion; the literals are the witness.

**The port's provenance had to be pinned before the palette could move.** `shadow-ladder.ts`
proves it is the same instrument as the compositor's `shadow.py` by reproducing three recorded
ceiling configurations. Those figures were measured against the old tokens. Read live, the
reproduction would have quietly become a recomputation of today's numbers asserted against
yesterday's — passing while proving nothing. `LEGACY_STATUS_TOKENS` is the frozen table those
three tests now read, plus the BEFORE arm of the comparison above.

**A scenery claim inverted, and was corrected in place.** `ground-cover.ts`'s `YELLOW_GRASS`
docstring argued that the map "already draws a MEANINGFUL difference 4.1x quieter" than the
`#b0b040` cover sits from any status (13.62 against a worst meaningful pair of 3.33). The worst
meaningful pair is now **14.23** (`proposed`/`mapped`, matched condition), so the comparison runs
the other way: the cover is marginally *closer* to a proof state than two genuinely different
states are to each other. Nothing about the cover moved; the denominator did. Its relative bar
(the shipped wheat's own 7.675) is untouched and it still clears it by 1.8x. **Improving the
status vocabulary raises the standard scenery is judged by** — which is the trade
`oq-how-does-the-map-report-a-capability-s-state-once-the-gro` exists to price.

**`unknown`'s flank is `#70757e`, one hex off the app's `--st-unknown` `#6b7280`.** `#6b7280` is
already a CROWN token — it is what a `building` story's tree falls through to, as well as an
`unknown` one's — so giving it to the ground family too would put one hex in two token sets and
leave `statusFamilyOf`'s first-match search naming `building` for four of `unknown`'s own rungs.
`#70757e` is the same slate at the flank ratio every other family uses.

---

## 5. What this does NOT settle

- **`oq-how-does-the-map-report-a-capability-s-state-once-the-gro` is still open** and is still
  the arc's critical path. Fewer states need less colour room, so the question gets *cheaper*; it
  does not get answered. Do not record it as settled.
- **`pull-the-four-land-colours-apart-in-hue` is not absorbed.** It narrows to exactly one pair,
  `proposed`/`mapped`, measured at 8.27 against a 20.92 bar.
- **Adoption.** Nothing here reaches `packages/forest-world-r3f/src` (ADR-0380 D6 / ADR-0406 D2).
  The CSS half ships; the harness half is still the experiment surface.
- **The mirror is still discipline, not a mechanism.** Nothing compares
  `apps/studio/src/index.css` against `palette-band.ts`'s transcription of it. `apps/studio` does
  not depend on `@storytree/forest-world-r3f`, so a check living in either package would be blind
  to a change in the other under the affected-scope classifier — and a check that runs only half
  the time is the vacuous-green fault class. Named here rather than half-built.

---

## Reproducing

```
pnpm --filter @storytree/forest-world-r3f exec vite harness --port 5203 --strictPort
ST_STATUS_URL=http://localhost:5203/status.html pnpm --filter @storytree/forest-world-r3f measure-status
python docs/research/chapter2-status-vocabulary-2026-08-27/combine.py
```

⚠ `vite.config.ts` pins `strictPort: 5184` for every worktree, so the default port may be a
sibling's tree. `status-measure.mjs` REFUSES 5184 unless `ST_STATUS_ALLOW_DEFAULT_PORT` is set,
and refuses any page whose title is not this branch's.

`ST_STATUS_GPU=1` asks for real hardware (`--use-gl=angle --use-angle=gl`); the run REFUSES if the
context still comes up software, because a software result attributed to a GPU is worse than no
result.
