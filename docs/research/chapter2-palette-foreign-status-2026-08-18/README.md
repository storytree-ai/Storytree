# No colour the land emits reads as a foreign status

**Date:** 2026-08-18 · **Camera:** 50° (a named parameter, inherited) · **Surface:** PR #1382's healthy
island — `context-traversal-capture` · **Blender renders:** 0 · **Cost:** $0

PR #1385 built a semantic-confusability guard for a shadow, and on the way its ABSOLUTE form
condemned the shipped art before any shadow was applied:

> *21 of the 78 colours the land may already emit read as a status OTHER than the one that authored
> them, at full light* — `healthy`'s dark WALL band reads `unhealthy`; `unknown`'s whole SIDE family
> reads `healthy`.

That pass correctly narrowed its own guard to a DELTA (the shadow must not CHANGE what a pixel says,
delivered 0 of 12 457) and left the finding standing. The increment
`land-palette-emits-no-colour-that-reads-as-a-foreign-status` asks the question that leaves open:
**is it a real misread, or an artefact of the reader?**

**Nothing here is owner-attested.** Whether the proposed separation looks right is the owner's look and
this page has no standing to make it (ADR-0070 stage 2).

## The answer, in six lines

1. **The reader was wrong in BOTH directions, and the defect is real.** The 21 over-counts: nine of
   them name a token the app can never draw. It also under-counts, because it never asked the question
   at matched condition.
2. **At MATCHED FACE and MATCHED LIGHT — no reader table, no asymmetry, no threshold — `healthy` and
   `unknown` are 3.37 dE apart.** The palette's own shade rung is **13.98**. Every other rendered pair
   is 14.19 or better. The defect is ONE PAIR, not the palette.
3. **THE INVERSION, which is the whole finding in one comparison:** the smallest distance between two
   *texture variants of one status* — a difference that MEANS NOTHING, picked by `hash() % 3` — is
   **6.48 dE**. The smallest distance between two *different statuses* — the capability's proof state
   — is **3.37 dE**. The land draws the meaningless difference **1.9× louder** than the meaningful one.
4. **The shipped app is NOT exempt.** Its emitted set is *smaller* (4 colours per status against the
   research pipeline's 13, and no shade ladder at all) and the same two families sit **4.32 dE** apart
   inside it, at full light. `substrate.ts:237` picks which pair gets drawn by hash: **2 of 9**
   variant combinations collide.
5. **But nothing is misdrawn today.** No capability in the live corpus renders `unknown` (0 of 244),
   so no island draws that pair — and on the delivered raster **0 of 13 827** exact-fill pixels read
   as anything but `healthy`. PR #1385's 13.6% came from a LOOSE mask; the strict one reads zero.
6. **The fix is already owner-directed and it costs NEGATIVE palette entries.** Collapsing to one top
   token per status — the "flat green / one surface" the owner asked for on 2026-08-16, which #1385
   already executed as data — takes the worst pair from **3.37 → 17.84 dE** and the palette from
   **86 → 50 entries**. Every other move priced on this arc ADDED entries (shadow +374, micro-relief
   +619). This is the first that pays for itself.

⚠ **AND IT DOES NOT DO WHAT THE ARC EXPECTED.** The increment was sequenced ahead of
`shadow-ladder-is-admissible-and-affordable` because separating the bands *"may raise the
confusability ceilings"*. **It does not — it lowers headroom slightly.** See §6.

## The pictures

| file | what it is |
|---|---|
| **`matched-condition.png`** | **THE DELIVERABLE.** Every rendered pair at the condition where they are closest, shipped against collapsed. If you cannot see the join, the land cannot tell you the status. |
| **`the-inversion.png`** | **THE ONE-NUMBER STATEMENT.** The distinction that means nothing, beside the one that carries the proof state, at the same scale. |
| **`island-read.png`** | **THE DELIVERED SURFACE.** Every fill pixel that reads foreign, under the shipped reader and the corrected one. Both are empty, and that is the result. |

## 1. The reader, reproduced and then varied one axis at a time

`foreign-status-report.json` → `theReaderVaried`

Row A is PR #1385's shipped call. `measure_palette.py` REFUSES to write anything if it does not land
on 21 of 78 — if the token table moves, this pass stops rather than publishing a new number under the
old one's name.

| row | reader table | statuses | cross-reads |
|---|---|---|---:|
| **A** | tops + sides | all 6 | **21 of 78 (26.9%)** |
| **B** | fills only (ADR-0367 D5's own table) | all 6 | 16 of 54 (29.6%) |
| **C** | tops + sides | 4 rendered | 12 of 52 (23.1%) |
| **D** | fills only | 4 rendered | **9 of 36 (25.0%)** |

**Two corrections to PR #1385's own wording fall out of this table.**

*First,* that pass says the fill-only table gives a count that is *"lower but still not zero"*. The
COUNT is lower (16 vs 21); the **RATE is HIGHER** (29.6% vs 26.9%). Narrowing to the fills that
ADR-0367 D5 is actually about does not make the picture more forgiving.

*Second,* the fold matters more than the table. `worldStatus.ts` folds `unhealthy → mapped` (ADR-0296)
and `building → proposed` (ADR-0038), so **9 of the 21 name a token pair the app can never draw** —
either the colour is never emitted or the status it is "mistaken for" is never rendered. That decides
the two headline instances differently:

- *"`healthy`'s dark WALL band reads `unhealthy`"* — **DISSOLVES.** `unhealthy` is not in the rendered
  vocabulary, so nothing can be mistaken for it.
- *"`unknown`'s whole SIDE family reads `healthy`"* — **SURVIVES**, both ends reachable. And §4 makes
  it worse than the increment's phrasing, not better.

**Margins are reported per entry, and they settle artefact-versus-real case by case.** A
nearest-neighbour classifier over a sparse table always returns *something*: `unknown`'s side band at
0.9 wins for `healthy` by **0.6%**, which is a tie between two distant swatches. But `unknown`'s top
band at 0.78 wins by **82.4%** at 13.7 dE against its own family's 32.6 — that is the colour sitting
inside another family's neighbourhood, and no reader correction removes it.

**The SYMMETRIC reader removes the asymmetry a second, independent way** and agrees: classify every
emitted colour against every OTHER emitted colour rather than against a table of lit swatches, and
9 of 36 fills are still nearest to a colour another status drew.

## 2. The test this pass stands on

`report → matchedCondition` · `matched-condition.png`

Every objection available against the readers above is unavailable here. **Compare two statuses only
where the land renders them on the SAME FACE under the SAME LIGHT.** No reader table, so nothing can
be wrong with it. No shaded-versus-unshaded comparison, so *"you darkened one side"* cannot be said.
No threshold inside the measurement. It is the distance between two pixels a viewer can see beside
each other on one island, at one moment.

| pair | as shipped | collapsed to one token |
|---|---:|---:|
| **healthy \| unknown** | **3.37** | 17.84 |
| mapped \| proposed | 14.19 | 30.74 |
| proposed \| unknown | 20.54 | 21.41 |
| mapped \| unknown | 22.59 | 31.91 |
| healthy \| proposed | 24.99 | 32.94 |
| healthy \| mapped | 25.64 | 27.43 |

**THE BAR IS DERIVED, NOT CHOSEN.** It is the smallest luminance step the land itself authors as *"the
same status, different light"* — one adjacent pair of shade rungs on one fill token, **13.98 dE**. So
the rule reads in one sentence: **two statuses must be further apart, where the land renders them
alike, than one status is from itself one shade rung away. Status must outweigh light.** That is
ADR-0367 D5 as a number, and it is the sentence the shadow-ladder increment has to satisfy, which is
why the bar is derived here rather than invented there.

`healthy | unknown` misses it by **4.1×**. Every other pair clears it — `mapped | proposed` by 1.5%.

**A smaller defect found while deriving the bar, reported so it is not mistaken for a choice:**
`KEY_SHADE` holds `chamfer_dark = 0.78` beside `wall_dark = 0.80`, and `build_palette` gives the SIDE
family every level, so the side ladder contains four pairs ~2.3 dE apart — two palette entries no
reader can separate, occupying two slots. Harmless today (same status at both ends) and the reason
the bar is taken from the FILL ladder. `shallowest_shade_rung` REFUSES to be asked for the other one.

## 3. THE INVERSION

`report → theInversion` · `the-inversion.png`

The variants exist for 2D texture variety. `substrate.ts:237` picks one by
`hash(\`cell:${key}:${i}\`) % 3`; nothing reads it, nothing derives from it. So the distance between
two variants of ONE status is the size of a difference a viewer is meant to ignore.

| | dE |
|---|---:|
| MEANINGLESS — two texture variants of one status, same face, same light | **6.48** |
| MEANINGFUL — two different statuses, same face, same light | **3.37** |

**The land draws the meaningless distinction 1.9× louder than the one carrying the capability's proof
state.** That needs no reader table, no fold, and no argument about what a viewer knows.

## 4. The shipped app is not exempt — and `unknown` is worse than "doubt"

`report → theShippedApp`

The increment asked for this explicitly: *"do not assume the app is exempt just because the grass
defect was research-only."* The two paths emit different sets.

| | research pipeline | shipped app |
|---|---|---|
| path | `emit_island.ts` → `blender_land.py` → closed-palette snap | `substrate.ts` → `scene.ts` → `index.css` |
| colours per status | 13 (token × `KEY_SHADE` band) | **4** (`--hex-top-0/1/2` + `--hex-side`) |
| shade ladder | yes | **none** |
| worst matched pair | 3.37 dE | **4.32 dE** (`#9ac570` vs `#9fc174`) |

**The app's set is smaller and it still collides**, at full light, with no shading, no Blender and no
quantiser anywhere near it. `healthy`'s top-2 and `unknown`'s top-1 are the same colour to a reader.
Which pair gets drawn is a hash: **2 of the 9** variant combinations collide.

**AND `unknown` IS NOT A STATUS.** `schema.ts` enumerates six and `unknown` is not among them; neither
is it in `WorkStatus`. `TreeView.tsx` stamps `st-${cap.status ?? 'unknown'}`, and `index.css` defines
`.hex-territory.st-<status>` blocks for five statuses and **none for unknown**, saying so itself:
*"`unknown` alone keeps the base family"*. So `unknown` is the **NULL-STATUS FALLBACK**, rendered in
the base grass family.

That CONFIRMS the increment's phrasing rather than softening it. A cell wearing the base family
asserts nothing about a capability. A cell wearing `healthy` green carries a **signed pass**, which
ADR-0040 makes the only source of green there is. **Absence of information rendered as proof** is the
exact failure ADR-0040 exists to prevent, reached through the palette instead of through the fold.

## 5. What is actually drawn today — the part that narrows it

`report → corpusExposure`, `theIsland`

Read from the healthy-island pass's committed whole-corpus census (46 stories, 244 capabilities,
folded through the app's own `provenStatus`), because two statuses can only be confused if some island
draws both.

- **`unknown` is present on ZERO stories.** Every capability in the corpus carries a status, so the
  null-fallback class is never reached. **No island draws the 3.37 dE pair today.** It is a latent
  defect one null status away, not an active misdraw.
- Statuses actually co-drawn: `healthy|proposed` on 12 stories, `healthy|mapped` on 5,
  `mapped|proposed` on 2. All clear the bar — `mapped|proposed` **by 1.5%**.
- **On the delivered raster: 0 of 13 827 fill pixels read foreign**, under all four readers, with
  three distinct fill colours delivered. Measured on `SURFACE_BARE` — seams off, **no hero tree**
  (it occludes cells and once cost this track a full re-measure) and **no plants** (body statistics
  must come from a plant-less canvas).

**THE ENTIRE SYMPTOM IS THE MASK, and here is the number.** Same island, same readers, one variable:

| mask | shipped reader (A) | folded fills (D) |
|---|---:|---:|
| **STRICT** — delivered colour IS an emitted top token (13 827 px) | **0.0%** | **0.0%** |
| **LOOSE** — every delivered land pixel (30 477 px) | **31.1%** | 43.1% |

The strict mask is EXACT rather than geometric: a pixel enters it only when its delivered colour IS
one of the top tokens the island's own status emits, so nothing straddling a boundary and nothing
overpainted by a wall can get in. **Every pixel of the 31.1% is a wall, a chamfer band or the coast —
surfaces that are not a status assertion at all.**

**Where the 13.6% sits.** PR #1385's `cell_bodies` is a GEOMETRIC top-face mask (`top_face_mask` ∩
solid ∩ 4-neighbours) — looser than the exact mask here and tighter than every-land-pixel, so it falls
between these two rows. That pass's own third correction already names why a geometric mask
over-reports: a wall is painter-ordered AFTER the cell behind it and legitimately covers part of that
cell's projected top face, and `mode_down` is a majority vote over each supersample block. Both
mechanisms change which SURFACE won the pixel, not what a fill says. **This pass bounds the effect
rather than reproducing that figure** — the two surfaces differ (this is the as-shipped 3-variant
island; that was the collapsed one-surface baseline), and an attempt to run `cell_bodies` directly on
this island was abandoned rather than forced: `top_face_mask` reaches `compose.height_of`, which reads
module-global `CAP_LEVEL` bound to the interior-fork island at import, and rebinding another pass's
globals to make a number appear is how this track has produced false findings before.

⚠ **What this island cannot answer: it carries ONE status.** A same-island confusion needs two.

## 6. The ceilings — and the arc's expectation is WRONG

`report → theCeilings`, measured through `shadow.safe_depth`, imported, so the row is comparable to
the arc's own series.

**Read the direction:** the ceiling is the DEEPEST multiplier at which a fill still reads as itself, so
a LOWER number is MORE headroom, and a ladder is admissible on a mixed island when its deepest rung
sits below the MAXIMUM of the ceilings present.

| configuration | healthy | mapped | proposed | **unknown** | binding |
|---|---:|---:|---:|---:|---:|
| as PR #1385 measured | 0.74 | 0.76 | 0.88 | **0.91** | 0.91 |
| folded to 4 rendered | 0.67 | ≤0.30 | 0.88 | **0.91** | 0.91 |
| **collapsed to one token** | 0.72 | ≤0.30 | 0.90 | **0.94** | **0.94** |

**The arc recorded that separating the cross-reading bands "may raise the confusability ceilings and
therefore change what a shadow costs". It does not.** The fold does not touch the binding ceiling at
all, and the collapse moves it the WRONG way — 0.91 → 0.94 — because this instrument rewards a family
for owning a darker sibling to fall back on, and the collapse takes those siblings away. **The 0.80
ladder stays inadmissible on a mixed island under every configuration measured.**

**The reason is structural and it is the useful part for the next increment:** the four rendered
statuses are ordered along **LUMINANCE**, and a shadow is a luminance operation, so darkening one walks
it toward the next. Separating them by **HUE or CHROMA** is what would move these numbers. That is an
owner art call; this pass prices it and does not spend it. As evidence that it is reachable,
`verify_refusal.py` P4 pushes `unknown` off the green ramp onto a slate — which is what the app's own
`--st-unknown: #6b7280` text-grade token already is — and the SHIPPED 3-variant table then PASSES
(14.19 dE). **That is a control proving a fix exists, not a proposal.**

## 7. The price

`report → thePrice`

| move | palette entries | cost |
|---|---:|---:|
| shipped land palette | 86 | — |
| **collapse to one top token per status** | **50** | **−36** |
| shadow ladder (PR #1385) | 506 | +374 |
| micro-relief (PR #1389) | 1125 | +619 |

**A RE-ANCHORING costs ZERO entries** — the palette's size is |tokens| × |levels| and changing a
token's value changes no count. **The collapse costs NEGATIVE entries.** This is the first move priced
on this arc that pays for itself, and the surface it needs is already owner-directed.

## 8. What is FENCED, and the app-side change this implies

`docs/research/**` only. `substrate.ts`, `index.css` and everything under `packages/forest-world` are
READ and never written — the owner isolated this track from the app on 2026-08-16 (*"isolate this away
from the main app until we ready"*), and that has not been lifted. `verify.py` §1 asserts it
mechanically, and §2 asserts the no-vendored-copy promise in its DURABLE form (this directory declares
no token table, no palette builder, no `safe_depth` and no compositor) rather than as a branch diff — a
branch-diff fence tests the branch, not the promise.

**The app-side change this measures out is therefore WRITTEN DOWN, not made:**

> Give `.hex-territory.st-unknown` its own block, OR collapse the per-status top variants to one, OR
> both. The second is what the owner has already directed for the research surface and costs −36
> palette entries; the first is the smaller edit and is the one that fixes the SHIPPED app, since the
> app has no variant collapse in flight.

Parked as an increment on `chapter2-code-generated-organic-art-arc`.

## Proof

```text
python measure_palette.py            # 3 pictures + report + sidecars   (~4 min: the compositor mount)
python measure_palette.py --no-island   # palette + app only            (~2 s)
python verify.py [--fast]            # the checks; --fast skips the determinism re-compose
python verify_refusal.py             # 12 guards, every one made to FIRE  (~15 s)
```

**`verify.py` fails loudly on its own errors.** Two prior harnesses on this arc reported false passes
for exactly that reason (#1382's five `FileNotFoundError`s; #1385's `exec`'d composer with `__file__`
undefined), so every check runs inside a wrapper that counts an exception as a FAILURE, with its
traceback, never as a pass or a silent skip. **Determinism is asserted on the DECODED raster**, never a
file hash — across two pixel-identical runs on this track, 0 of 22 files had identical bytes.

**`verify_refusal.py` proves the gate by making it fire**, and its `fires()` helper distinguishes DID
NOT FIRE from PROBE BROKE so the two can never look alike. The load-bearing ones: the gate REFUSES the
shipped table naming both statuses, both colours and the bar (**and the dE it prints is recomputed
independently**, so it is not a canned string); it ADMITS the collapsed table, so P1 is a verdict and
not a `raise`; a DIFFERENT pair made to collide is refused too, so it is not keyed on one pair; and a
moved token table makes the driver REFUSE TO REPORT, writing nothing, rather than publish a new number
under PR #1385's name.

⚠ The monkey-patch rule this arc learned expensively: the probes patch the CANONICAL `compose` module
object, never an alias, because a callee resolves its helpers in the canonical module's globals.

## What this does not settle

1. **There is no owner LOOK.** Whether any separation reads right is exactly the judgment this page
   must not make.
2. **The collapse is measured, not proposed as the fix for the app.** It fixes the research surface
   (which is where the owner directed it) and it fixes the palette; the app has no variant collapse in
   flight, so the app-side remedy is the `st-unknown` block or a re-anchoring, and which is an art call.
3. **The luminance ordering is named and not addressed.** Fixing the ceilings needs hue/chroma
   separation across all four statuses, which is a bigger art change than this increment's question.
4. **One island, one seed, one camera, one status.** The palette findings are closed-form and
   island-independent; the raster figures are this island's.
5. **`mapped | proposed` clears the bar by 1.5%** and is drawn on 2 stories today. Whether a 1.5%
   margin is a margin is not decided here.
6. **Wheat is excluded from every table**, and that is not a convenience: five of the six statuses
   share the identical wheat hex, so a wheat cell reports no status by colour at all. That is an
   ABSENT assertion rather than a confusable one — a different defect, already surfaced by PR #1385 §7
   as a story-author question.
