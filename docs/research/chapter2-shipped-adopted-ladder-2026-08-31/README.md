# The refined shade ladder is adopted — and this is it under the props

2026-08-31 · `adopt-the-land-into-the-shipped-map-arc` · increment `adopt-the-refined-shade-ladder`
· branch `claude/nervous-sutherland-acf7df`

**In one sentence.** The owner adopted the nine-rung shade ladder on 2026-08-30 ("Adopt it."); it
now ships. Everything the candidate measurement promised held when it was re-asked against the
ladder the map actually wears — reference rung, shadow rung and reading margin all unchanged, zero
foreign-status reads, palette closure doubled rather than opened — and the one thing nobody had
seen is here: the refined ground **under the bought kit props**, which crossed after that
measurement was taken.

Predecessor evidence: `chapter2-shipped-refined-ladder-2026-08-30/` (the candidate, on bare
ground) and `chapter2-shipped-kit-2026-08-30/` (the props).

---

## 0. What the owner is being asked to look at

Two pictures, differing in exactly one thing — **the ladder** — with the props, the frame, the
light and the island identical:

| picture | what it is |
| --- | --- |
| `shipped-dressed-shadow-8px.png` | the map as it wore the **four-rung** ladder |
| `shipped-dressed-dense-8px.png` | the map as it wears the **nine-rung** ladder — SHIPPED |

and the same pair at `-2px` (the overview a laptop opens on), plus the bare-ground pair
(`shipped-bare-{shadow,dense}-{2,8}px.png`) so the ground can be read without the props on top.

**What to look for.** The four-rung ground reads as a **speckle at band edges** — the grain can
only express itself where the lighting happens to sit near a rung boundary, so it clumps into
hard-edged blotches. The nine-rung ground reads as a **continuous mottle**, which is what the
approved Cycles render has. That is the whole point of the change, and it is the largest visible
step on this arc since the ladder itself arrived.

⚠ **A crossing that works has still not delivered the look** (the owner's own standard, settled on
`oq-the-map-this-arc-is-improving-is-mounted-nowhere-which-ma`). He adopted this while saying the
result is "still quite far away from how good our target texture looks". Nothing here claims
otherwise. What remains of the six-component treatment is the **coast clip** and the **stepped
skirt**; the island outline in these pictures is still the raw hex union.

---

## 1. THE FENCE HELD, AND IT WAS RE-ASKED RATHER THAN INHERITED

The land's colour is a capability's proof state (ADR-0392 D5 / ADR-0398 D7), so the only way this
change could do real harm is by making a parcel read as a status it does not hold. It does not —
measured on **both** palettes, because the shipped ground wears five tokens and the harness island
wears a wider vocabulary, and a ladder change touches both.

| | four rungs | nine rungs |
| --- | ---: | ---: |
| reference rung (whichever rung flat ground lands on) | 0.90 | **0.90** |
| derived shadow rung | 0.77 | **0.77** |
| tightest reading margin, shipped ground palette | 0.93 | **0.93** |
| dishonest (token, rung) readings, shipped ground palette | 0 | **0** |
| foreign colour reads, harness land vocabulary | 0 | **0** |
| authored closure, shipped tokens incl. shadow rung | 25 | **50** |
| authored closure, all 56 land tokens | 224 lit / 279 shadowed | **503 / 557** |
| off-palette delivered pixels, both zooms | 0 | **0** |

**The closure DOUBLED without opening**, and that is the shape of this adoption in one line: it
buys texture by enumerating more authored colours, where the alternative on the table — the grain's
off-palette colour half — buys it by leaving the closure altogether. `56 x 9 = 504` against a
measured 503 lit entries, so exactly one pair of tokens shares a colour somewhere on the ladder,
the same near-injectivity the four-rung ladder had at `56 x 4 = 224`.

⚠ **Why 0.025 and not 0.02**, restated because it is the one thing that would silently break this:
the reader's reference is *whichever rung flat ground lands on*, and flat ground's half-lambert is
0.9105. A 0.02 grid contains 0.90 and still moves the reference to 0.92, which makes its darkest
rungs misreport. 0.025 keeps the reference on 0.90. `landLadderHonest()` refuses a misreporting
ladder and every comparison arm is held to it.

---

## 2. FIVE THINGS THE ADOPTION CHANGED THAT NOBODY HAD LISTED

None of these stops it. Two are gains, one is a cost, and all five were found by re-asking rather
than by assuming the candidate measurement transferred.

**(a) The knife-edge products go 3 → 8.** These are `(channel x level)` products that land on an
exact half, where JavaScript's `Math.round` goes up and a GPU's float-to-unorm8 conversion goes
down. A 0.025 grid puts far more products on a half than a 0.02/0.10/0.10 one does, and five of the
eight are on `healthy`'s green — the commonest colour on the map. **It costs nothing**, because the
material was already built never to let the GPU multiply a colour: the ramp is rounded once in
TypeScript and uploaded finished. But a design that had not made that call would have shipped a
visible regression here, and the rule is now much more live than when it was written.

**(b) The tie-down rule became provable.** `nearestLevelIndex` resolves an exact tie toward the
darker rung. On the four-rung ladder a two-million-point sweep found **zero** exact ties — 0.85
looks like the midpoint of 0.8 and 0.9 and is not one in binary floating point — so the rule was
documented, relied on by the shader, and unobservable, and its mutant was genuinely equivalent. The
nine-rung ladder has **two**: 0.8125 and 0.9375, both dyadic. A rule no test could reach is now
pinned on the ladder the map wears.

**(c) Raising the floor from 0.78 to 0.80 removed a whole class of misread.** The darkest lit rung
is where two colour families are compressed closest together, so it is where the reader gets fooled.
Dropping it took the pre-ADR-0462 palette's recorded six misreads to a different five, ADR-0462's
own two to one, and the rejected "naive grey" counterfactual's one to **none**. Several separation
figures improved for the same reason and no other: `healthy`/`unknown` 24.58 → 25.40, grey/black
24.93 → 27.75.

**(d) The ladder's steps are now EVEN.** The four-rung ladder's first gap was a fifth of the others,
so "further apart than one shade rung" was a claim that was true or false depending which rung you
meant — the reports printed all three gaps so nobody could quote the flattering one. Every gap is
now 0.025. ⚠ The other half of that: a 0.025 step moves a token much less than a 0.10 one, so every
ratio quoted against "one shade rung" is now quoted against a quieter reference. The bar got easier
to clear, and a reader has to know that before reading any of those ratios as an improvement.

**(e) ⚠ THE COST: a prop constant stopped working, and it is recorded rather than repaired.** Making
the steps even removed the old 0.02 first step, and the PROCEDURAL prop vocabulary's cottage-wall
`batter: 0.2` was calibrated on exactly it — slope 0.2 gives half-lambert 0.8015, which used to snap
one rung above the 0.78 floor and now lands on the 0.80 floor itself. It takes 0.3 to buy a rung
now. Left alone deliberately: retuning a batter is an art change the owner signs (ADR-0392 D1), and
this is the procedural arm ADR-0475 replaced with the bought kit. **Nothing that ships is affected**
— the kit's props wear `MeshStandardMaterial` and are never quantised onto this ladder.

⚠ Related and NOT a defect: "a roof is the island's only full-strength surface" is no longer true as
stated. No surface here ever faced the light dead-on; a pitched roof's best dot is ~0.937, and the
four-rung ladder rounded that to 1.00 and called it full strength. On nine rungs it lands on 0.975,
three rungs above flat ground where it used to be one. The finer ladder tells the truth and gives
props MORE resolvable contrast, not less.

---

## 3. THE FRAME — RTX 2060, Mint box, two runs

⚠ **Run 1 is not the published run and is committed beside this as `adopted-ladder-run1.json`.** It
came back 10–12% high on every arm with a 5.4 ms spread on one row — the idle-clock artefact this
box is known for. Run 2 is `adopted-ladder.json` and it reproduces four published controls, which
is what licenses reading its new rows against the earlier tables at all:

| control | published | run 2 |
| --- | ---: | ---: |
| `flat` @8 | 0.0448 | 0.0442 |
| `banded` @8 | 0.0218 | 0.0216 |
| `grain-normal` @8 | 0.0909 | 0.0899 |
| `shadow` @8 | 0.0934 | 0.0918 |

**The ladder of arms**, median of 7 interleaved repeats over 300-render batches, 1 draw call and
1,640 triangles in every arm:

| arm | @2 px ms | @8 px ms | @2 px % of 60Hz | @8 px % of 60Hz |
| --- | ---: | ---: | ---: | ---: |
| flat | 0.0037 | 0.0442 | 0.02 | 0.27 |
| relief | 0.0039 | 0.0442 | 0.02 | 0.26 |
| banded | 0.0023 | 0.0216 | 0.01 | 0.13 |
| grain-normal | 0.0078 | 0.0899 | 0.05 | 0.54 |
| shadow | 0.0079 | 0.0918 | 0.05 | 0.55 |
| grain-both (reference, off-palette) | 0.0092 | 0.1066 | 0.06 | 0.64 |
| **dense — SHIPPED** | **0.0534** | **0.1126** | **0.32** | **0.68** |

**How much of the frame the ladder moves** — reproduced to the decimal from the candidate run, which
is the control saying the arms draw what they drew:

| step | @2 px | @8 px |
| --- | ---: | ---: |
| `banded → grain-normal` | 15.9% | 15.8% |
| `grain-normal → shadow` | 1.9% | 1.9% |
| **`shadow → dense`** | **45.3%** | **45.2%** |

### ⚠⚠ 3a. THE OVERVIEW ZOOM COSTS 6.8x, AND THE COST IS PER-DRAW RATHER THAN PER-FRAGMENT

At 8 px/unit the refined ladder costs 1.23x the ladder it replaces (0.1126 against 0.0918) — the
frame there is dominated by the grain's normal half, which evaluates the noise field four times for
a central difference, so a bigger quantiser is a small share of it. **At 2 px/unit it costs 6.8x**
(0.0534 against 0.0079), and that reproduced across both runs with a spread of 0.0038, so it is not
the idle clock.

**It does not scale with pixel count, and that is measured rather than inferred.** The 8 px frame
carries exactly 16x the land pixels of the 2 px one. Every other arm scales roughly with that —
`shadow` goes 0.0079 → 0.0918, a factor of 11.6. `dense` goes 0.0534 → 0.1126, a factor of **2.1**.
A cost that barely moves when the fragment count grows sixteenfold is a per-DRAW cost, not a
per-fragment one, and the thing that doubled per draw is the uniform array the ramp is uploaded in:
`vec3[30]` to `vec3[60]`.

**It is affordable and it is not free.** 0.32% of a 60 Hz frame for the whole ground at the overview
zoom, on one island. What it means is that the refinement's cost lands where the map is *cheapest*
rather than where it is busiest, so the arithmetic for a crowded forest view — many islands, each
its own draw — is different from the arithmetic for one island close up. **Nobody has measured a
crowd on this ladder**, and end-state item 2 asks for the cost at both zooms rather than for both
scene sizes. Recorded as the next thing to measure, not as a blocker.

---

## 4. WHAT THIS CORRECTS IN THE PUBLISHED RECORD (ADR-0139)

- `chapter2-shipped-refined-ladder-2026-08-30/README.md` §4 says the refinement costs **0.60% of a
  60 Hz frame against 0.56%**. Measured here, on the same box with both runs agreeing on
  `dense` @8 to four decimals: **0.68% against 0.55%**. The candidate figure was taken before the
  bought kit crossed and changed the map's own light, and it did not reproduce. The changed-frame
  percentages and the colour closure from that note *did* reproduce exactly.
- Every figure in `chapter2-shipped-{banded,grain,shadow}-2026-08-30/` is about the **four-rung**
  ladder and remains true of it. Those arms are now pinned to `LEGACY_SHADE_LEVELS` in the
  comparison page, so their medians stay reproducible and `shadow → dense` cannot quietly become a
  comparison of a thing with itself.

---

## 5. HOW TO REPRODUCE

```bash
ssh mint 'cd ~/code/Storytree && git fetch -q origin <branch> && git reset -q --hard origin/<branch> && pnpm install --frozen-lockfile'
ssh mint 'cd ~/code/Storytree/packages/forest-world-r3f && (nohup npx vite harness --port 5241 --strictPort >/tmp/v.log 2>&1 &)'
ssh mint 'cd ~/code/Storytree/packages/forest-world-r3f && DISPLAY=:0 ST_LAND_URL=http://localhost:5241/shipped-land.html ST_LAND_OUT=/tmp/out pnpm run measure-shipped-land'
```

⚠ Take **two** runs and read the spread before believing either — this box idles its GPU at 300 MHz
and roughly one run in three comes back uniformly high with an outlier row. Run 2 reproducing the
published control medians is what licenses reading it.
