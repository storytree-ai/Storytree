# A theme cannot ship without clearing the separation floor — 2026-08-28

**Increment:** `themes-clear-the-separation-floor` on `adopt-the-land-into-the-shipped-map-arc`.
**Decision:** ADR-0461 D3 — *"Themes are permitted, and every theme is held to the SAME separation
floor. A theme may move every hue on the map; it may not let one state read as another."*

---

## 0. What this landing is, in one paragraph

The map draws a capability's state as a named land — `forest`, `heath`, `fallow`, `wheatfield`,
`swamp`, `scree`. All six names are the owner's as of 2026-08-28. A **theme** is a set of
substitutions keyed on those six names: source says `forest`, the theme says what `forest` looks
like. This landing builds that resolution layer, and the **floor** that no theme may cross —
a theme may move every hue and may move the land itself, but it may not let one state read as
another. The floor is checked in two halves (pure and pixel), both bars are read off controls
measured in the same run, and it is proved able to REFUSE by two themes authored to fail, one per
half.

**The risk it removes, stated as what goes wrong without it.** Before ADR-0461 an art change could
only be wrong about APPEARANCE. After it, a theme can be wrong about MEANING across a whole palette
at once — every state on the map, in one edit — and nothing else in this repo would notice, because
every other instrument is pinned to the shipped tokens.

---

## 1. What a theme is, and what it is not

A theme resolves each of the six **terrain names** to a colour family and to the land itself
(`stretch`, `bearing`, `lattice`). Three things it deliberately cannot do:

- **It cannot change which state gets which land.** ADR-0461 D1 binds a state to a terrain; a theme
  only substitutes what that terrain looks like. A theme keyed on states could quietly re-map
  meaning while wearing an art change's clothes.
- **It cannot be partial.** A missing terrain is refused, not defaulted — a state falling through to
  the shipped land is a state drawn in another theme's clothes.
- **It cannot split ADR-0462's shared colour class.** `proposed` and `building` wear one token
  (five colours over six states). A theme giving them two makes SIX colour classes, and
  `status-vocabulary.ts` enumerates exactly the five `LAND_COLOURS` names — so a sixth is
  unreachable by the instrument. ⚠ **The refusal is not a judgment that splitting is wrong; it is
  that the floor cannot MEASURE it, and an unmeasurable theme must not pass a floor.** Lifting it
  means widening that module and re-deciding ADR-0462. This is the one place the layer is narrower
  than the owner's *"grant more flexibility to start off with"*, and it is narrow on purpose: it
  fences a case the instrument goes blind on, never a case that merely looks unusual.

---

## 2. The floor is two halves, because the two questions need two instruments

**PURE** — `harness/land-theme.ts`, provable under `bun test`, no browser:

- **Colour:** `status-vocabulary.ts`'s `vocabularySeparation`, called with the THEME's token table.
  That function already took the table as an argument precisely because this is the shape a
  per-theme floor needs. No second colour-distance function was written, and none should be.
- **Land:** every colour-blind pair a theme creates must be assigned distinct terrain geometry.
  ⚠⚠ **NECESSARY, NOT SUFFICIENT, and saying so is not a hedge.** These are the numbers that were
  *written down*, not what a reader *sees*. A theme could differentiate two lands by a figure that
  survives no rasteriser.

**PIXEL** — `harness/theme-measure.mjs`, a measure driver over the delivered frame:
`terrain-separation.ts`'s `pairVerdict` over rendered regions, per theme. `readTerrain` needs
delivered pixels, so this half cannot be a pure rung and does not pretend to be.

### The bars are read off controls, never picked

| half | the bar | the control |
|---|---|---|
| colour | one lighting step on the two families being compared | measured inside the same `vocabularySeparation` call |
| land (pure) | **0.7655 octaves**, from **`heath`/`swamp`** | the SHIPPED vocabulary's own weakest link between any two of its lands, computed in the same run |
| land (pixel) | the worse of the two lands' own within-island spread | measured on sub-regions of the same frame, under the same light |

⚠ **The house test of an honest bar: where would a number picked to PASS have sat?** The pair under
judgment (`fallow`/`wheatfield`) sits at **2.83 octaves**, so a number chosen to let it through
would sit just under 2.83. The bar is **0.77** and is set by a completely different pair that
colour already separates and that nobody was trying to make pass. A test asserts
`floor.from !== 'fallow/wheatfield'` — the bar may not be set by the pair it judges.

⚠ **Why an absolute pixel figure was not an option.** `grain-picture-is-renderer-specific` measured
24.5% of grained pixels landing on a different ladder rung between SwiftShader and an RTX 2060. A
committed pixel threshold is one machine's threshold and reds on every other.

⚠ **Where the shipped theme's own land verdict is weak, said plainly.** The bar is derived from the
shipped table, so for the SHIPPED theme the control and the subject are the same artifact and the
check is a self-comparison — the blindness
`self-comparison-invariance-suites-are-blind-by-construction` describes. It is meaningful for a
CANDIDATE theme, which is what it exists for, and the shipped table is pinned separately by a
committed digest so that moving it is a visible two-place edit.

---

## 3. ⚠⚠ PROVING THE FLOOR CAN FAIL

This factory has caught four instruments in two days that were structurally incapable of failing.
A floor that passes everything it is shown is indistinguishable from no floor, and the difference
is invisible in a green run. Three independent kinds of evidence are recorded here.

### 3a. Two themes authored to be refused, committed, and drawn

`REFUSED_THEMES` in `land-theme.ts`. They are never offered, and each breaks **exactly one half** —
because if both broke the same half, a floor that had silently lost the other would still refuse
both and read as healthy.

| theme | colour half | land half | verdict |
|---|---|---|---|
| `dusk-flats` — the scrub and the standing water pulled together until the lit ladder slides one onto the other | **REFUSED**, `brown/black` at **0.089×** its bar, **3 foreign colour reads** | passes (its land is untouched) | REFUSED |
| `levelled-fields` — high summer's palette, with `fallow` given `wheatfield`'s own land | passes cleanly (0 foreign reads) | **REFUSED**, `fallow/wheatfield` at **0.00 octaves** | REFUSED |

`dusk-flats` breaks the way a real theme would — not by giving two states one hex, which nobody
authors by accident, but by low contrast. That is ADR-0414 D4's failure exactly: two tints
separated mainly by brightness collide as soon as the shader's 0.78..1.00 ladder spans the gap.

### 3b. A palette this project actually shipped is refused

`ADR0462_STATUS_TOKENS` — the live palette on 2026-08-27, the day before the tilled clay replaced
`mapped`'s tan — is REFUSED by the colour half: `yellow/brown` at **0.395×** its bar with **2**
foreign reads. A floor whose only failing input was invented for it is much weaker evidence than
one that refuses something we drew.

### 3c. Hand-run mutations

⚠⚠ **THE AUTOMATIC RUNG COVERS NONE OF THIS, AND THAT IS MEASURED RATHER THAN PREDICTED.**
`pnpm gate`'s `check:mutation-diff` skips `harness/**` — the harness sits outside any workspace
project's `src/`. On PR #1687's branch it printed `SKIP — this branch changes no mutable source
under a workspace project's src/ — 5 changed .ts file(s) sit outside any project's src/`. So every
mutation below was applied by hand, run, watched go red, and reverted.

<!-- MUTATIONS -->

---

## 4. The themes

<!-- THEMES -->

---

## 5. The pixel half

<!-- PIXEL -->

---

## 6. What this landing does NOT settle

- **How many themes exist, and whether a viewer can switch them.** ADR-0461 D5 leaves both open.
  The three here exist so the mechanism has something to be true of; they are not a product
  decision.
- **Adoption into the shipped map.** `packages/forest-world-r3f/src` is untouched. Adoption remains
  a separate, deliberate event (ADR-0380 D6 / ADR-0406 D2), and this is harness work.
- **Whether the map READS WELL under a theme.** The floor is a backstop against a theme that has
  stopped REPORTING, not a fence on how the map looks. The owner's eye remains the arbiter of the
  second, per his 2026-08-27 steer: *"its a taste thing that needs a human eye, so I rather grant
  more flexibility to start off with."* A session reading that as licence to skip the floor has
  inverted it.
