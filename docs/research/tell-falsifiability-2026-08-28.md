# TELL — the falsifiability record

**Date:** 2026-08-28 · **Increment:** `website-refresh-arc-pitch-overlays` · **Branch:** `claude/web-tell`

This project keeps hitting one fault class: **an instrument that cannot fail.** A camera check that
computed its expectation from a hand-copied duplicate of its own subject; a frame timer that measured
submission rather than execution; a quality check that would have green-lit a tree whose textures
never loaded. Every one of them was green, and every one of them was measuring nothing.

TELL adds two instruments — a unit suite over the site's copy, and a widening of the parent gate's
`check:web-grounding` rung. Neither is trustworthy on the strength of a green run. So each was run
against a deliberately broken state and **observed to refuse**. This file is that record.

---

## 1. `web/src/scripts/act2-tell.test.ts` — the copy suite

Method: mutate the real module, run the real suite, restore, `diff` to confirm the restore. Each
mutant is the actual defect the test exists to catch, not a synthetic tripwire.

| # | Mutation (the real defect) | Result | Test that caught it |
|---|---|---|---|
| 1 | Replace `{proven}` with the literal `21` — the count goes stale the first time the snapshot job republishes | **1 fail** / 15 pass | `every count in the copy moves when the corpus moves` |
| 2 | Make the self clause a constant instead of reading `selfIsGreen` — the page keeps saying "it is not green" after the story goes green | **1 fail** / 15 pass | `the self beat says the site is not green ONLY while the site is not green` |
| 3 | Drop `grounds` from the green claim | **1 fail** / 15 pass | `the beats that assert something about the product carry grounding` |
| 4 | Replace the derived dwell with a flat `3000` — editing copy silently under-times a line | **2 fail** / 14 pass | `a beat holds long enough to read…` + `TEETH: lengthening a line lengthens its beat` |
| 5 | Stop dropping the `self` beat when its island is absent — the sentence points at empty sea | **1 fail** / 15 pass | `the self beat is DROPPED when its island has left the corpus` |

All five restored byte-identical afterwards (`diff -q`, clean).

**What this does NOT prove.** The suite is over the SCRIPT and the STATE MACHINE. It does not run a
browser, so it cannot tell you the overlay renders, the lenses apply, or the camera lands. That was
established separately (§3) and is not claimed here.

---

## 2. `check:web-grounding` — the widened rung

The rung binds public claims to the live decision log. Its extractor matched only the
`data-grounds="…"` ATTRIBUTE form, so TELL's claims — held as `grounds: ['ADR-0040']` data in a
script that writes the attribute at runtime — were invisible to it.

**The green that meant nothing, measured:** before widening, the rung reported
`OK: 2 grounding reference(s) across 1 claim(s)` on a site that had just acquired four more claims.
After: `OK: 6 grounding reference(s) across 5 claim(s)`.

Run against the **live store**, mutating a real TELL beat's `grounds`:

| Mutation | Result |
|---|---|
| `grounds: ['ADR-9998']` (no such decision) | **exit 1** — `✗ web/src/scripts/act2-tell.ts: ADR-9998 — references ADR-9998, which is not in the decision log` |
| `grounds: ['ADR-0014']` (a genuinely superseded decision) | **exit 1** — `✗ … ADR-0014 — references ADR-0014, which is SUPERSEDED — repoint the claim to the current decision` |
| `grounds: ['asset:some-artifact']` (unvalidatable scheme) | **exit 1** — `✗ … unsupported reference scheme` |

Restored clean. Note the third: an unrecognised scheme is FLAGGED, not skipped — which is what stops
the widening becoming a way to launder a citation past the rung.

### The false BLOCK the widening exposed, pointing the other way

Both patterns are lexical, and the rung did not strip comments. So a source comment *documenting the
mechanism* — the string `` `data-grounds="…"` `` inside a `//` line explaining how the rung works —
was extracted as a live citation of an id called `…` and **blocked the gate**, naming a file whose
page-visible copy was entirely fine. This was not hypothetical: it happened on this branch, and it
was the pre-existing ATTRIBUTE regex that did it, not the new script one.

`extractGroundingRefs` now strips comments first (reusing the closure rung's string- and
template-literal-aware `stripComments`). ⚠ **A repair can narrow a blindness rather than remove it**,
so the failure cases in the table above were RE-RUN after the fix: a superseded citation in real code
still reds with exit 1. Comment-stripping removed the false positive without removing the teeth. Two
unit tests pin both directions — a documenting comment is not a claim, and a commented-OUT claim is
correctly no longer validated (a claim nobody can read is not a claim).

---

## 3. The browser run — what the unit tests structurally cannot see

Driven with Playwright against the BUILT site (`astro build` → static server), 1600×900, real
Chromium. The route is the page's own one-click `[data-experience-skip]`.

Confirmed by reading computed styles and attributes, not by looking at pictures:

- All ten beats fire in order with the copy the script declares, `0` page errors.
- The counts render from the map's own payload: `35` / `21`, matching `data-forest-counts`.
- `proven` lens: non-green islands at computed opacity `0.34`, green at `1`.
- `trails` lens: islands at `0.62` (emphasis, not reveal — see below).
- `self` lens: camera at `viewBox="1087.9 2690.93 1671.8 940.39"`; the island's world rect is
  `(2036,3174)–(2280,3261)`, centre `(2158, 3217)`, which is the declared anchor `(0.64, 0.56)` of
  that box to within a pixel.
- `handoff`: the view returns to the resting composition `-122.4 2240.61 3482.8 1959.08`, byte-equal
  to where GROW settled it.
- Both exits end the sequence and clear every lens: the skip control, and a reader drag on the map.

### Four defects this run found that no unit test would have

1. **The camera flew to the wrong place, smoothly and silently.** `getBBox()` reports an element's
   OWN user space, and `sceneToSvg` wraps the scene in `<g transform="translate(1782.5 3876.8)">`.
   `website-experience` came back at y −702 in a world starting at 0; `clampViewBox` then pinned the
   target to the overscroll corner. Nothing threw. The fix maps through `getScreenCTM()`
   (`islandWorldRect`), and the numbers above are the confirmation.
2. **The site's first sentence played into a black screen.** `mountForestLand` is called when the
   land is UNHIDDEN, not when it is visible; the land's computed opacity was `0.007` on the frame
   TELL mounted and reached `1` at ~1.9 s. "This is storytree." was over before there was a forest to
   say it over. Fixed with a measured `MS_LEAD_IN`, now pinned by a test.
3. **The loop diagram never left.** The figure was additive-only, so it hung under the three beats
   after its own — and, worse, the rendered state was no longer a pure function of the beat index,
   which is the one property this module claims to have kept from the retired sequencer.
4. **Improving a sentence made its beat too fast to read.** The loop beat's dwell was derived from
   its prose; shortening that line from fifteen words to five dropped the beat to 2.16 s while the
   diagram beside it needs 1.52 s merely to assemble, so the reader met the finished picture for
   about half a second. The failure direction is what makes it nasty — the beat got FASTER because
   the copy got BETTER, and nothing about the edit looked like a timing change. `beatDwellMs` now
   takes the figure into account and floors the beat; the fix was mutated (`return body`) and the new
   test observed to fail.
5. **The trails lens did nothing, and restyled the resting frame.** GROW already opts this surface
   into `.tw-trails`, so the `display: inline` rule was a no-op that READ like a reveal; and the
   accompanying stroke rules were unscoped, so they silently changed the composition the owner has a
   look pending on. Now scoped to the lens, and the module's comment says "emphasises" rather than
   "reveals".

---

## What remains unproven, and is the owner's

**How it LOOKS and READS is an operator-attested verdict (ADR-0070 stage 2) and is not signed here.**
The sequence runs ~57 s end to end (2.1 s lead-in, ten beats, a fade); the pace is one constant (`MS_PER_WORD`) precisely so that
changing his mind about it is one number. Nothing above says the copy is good — only that it is true
of the map it is spoken over, and that it stays true when the map moves.
