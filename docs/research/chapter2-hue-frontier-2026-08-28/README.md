# How much room the land's five colours actually have

**2026-08-28 · increment `pull-the-four-land-colours-apart-in-hue` on
`adopt-the-land-into-the-shipped-map-arc`**

## The answer

**A brown-only edit is enough.** ADR-0462 left exactly one colour pair under its bar — `proposed`'s
yellow at its two darkest lighting steps reading as `mapped`'s brown, 8.27 against a 20.92 bar, two
foreign colour reads. Re-authoring `mapped`'s family alone fixes it, and this run says which brown.

**The colour, and the rule that picked it.** *Minimal movement from the authored colour at which
brown stops being the vocabulary's weakest link* — not "clears by N%", which is a margin nobody
could justify, but a statement about the vocabulary: the tightest pair must no longer involve brown
at all.

| | authored | picked |
|---|---|---|
| `--hex-top-0` | `#b3946a` | **`#b7684e`** |
| `--hex-top-1` | `#a68557` | **`#a95539`** |
| `--hex-top-2` | `#bda278` | **`#c1795e`** |
| `--hex-side` | `#85683f` | **`#883d24`** |

hue −20°, saturation ×1.40, value ×1.02 — a tilled clay in place of the tan. Moved 38.2 in the
arc's own luma-weighted space; 29 of 7,337 candidates satisfy the rule and this is the closest to
what was already authored.

| | today | with the picked brown |
|---|---|---|
| tightest pair | **yellow/brown 0.395x** | yellow/green 1.134x |
| yellow vs brown | 8.27 / 20.92 | **24.36 / 20.92 = 1.165x** |
| foreign colour reads | `yellow@0.78->brown`, `yellow@0.8->brown` | **none** |

After the move the binding pair is yellow/green at 1.134x — where it already sat, untouched by any
of this. That is the vocabulary's own ceiling, not a new problem.

## ⚠ What is NOT landed here, and why

**The token swap itself.** This PR lands the search, not the change. Applying those four hexes moves
**18 pinned findings** across `shadow-ladder.test.ts`, `status-vocabulary.test.ts` and
`ground-cover`, and — the reason it is a separate unit rather than a bigger diff —
**`SHADOW_RUNG` is DERIVED from `STATUS_TOKENS` at import time**
(`shadow-ladder.ts:270`, the deepest ladder level at which every status still reads as itself). It
throws rather than falling back if no level is admissible. So re-authoring a land colour re-derives
the lighting ladder every land render uses, and the eighteen tests are not renumbering: each is a
measured finding that has to be **re-measured**.

It also lands on `apps/studio/src/index.css`, whose `.hex-territory.st-mapped` block is where these
hexes are canonical — the harness table is transcribed from it. Nothing mechanically couples them,
so both move together or they drift silently.

And ADR-0070 makes the appearance the owner's verdict. The next session should stage the comparison
rather than merge on the numbers alone.

## Two ways this search went wrong before it went right

Both are cheap to repeat and neither announces itself. Both are pinned by tests.

**1. Rank pairs by RATIO, not by distance.** `colourPairs` returns rows sorted by *distance*, so the
obvious `rows[0]` reads as "the worst pair". It is not — every pair is read against its own bar, and
a large distance under a large bar is tighter than a small distance under a small one. Ranking by
distance produced **1,196 "clearing" candidates** on the first run, every one of them a dusty pink,
every one scored on a pair that was not the binding one.

**2. Search wide before concluding nothing exists.** Corrected for (1), a sweep of hue −14…+6 /
sat ×0.95…×1.35 / val ×0.62…×1.02 returned **zero** clearing candidates and peaked at **0.966** —
which reads exactly like *"the palette has no room for a browner brown"*, and was one assertion away
from being written down as a finding. Widening to hue −20…+8 / sat ×0.9…×1.4 / val ×0.6…×1.04
returns **207**. The conclusion was a property of the search box.

`sweepFamily` therefore returns **every** candidate including its failures: a frontier that stops
short can be told apart from one that was never searched, and a filtered frontier can express
neither.

## ⚠ The ratchet is real, and on this vocabulary it is INERT

`status-vocabulary.ts` reads every pair against a control in the same run — `largestRungStep`, the
biggest distance one lighting rung moves a single token. That is the right shape and it is why no
absolute number appears in that file. But the bar is computed *from* the families being compared, so
desaturating a family shrinks its own rung step and lowers the bar it must clear.

`hue-frontier.ts` closes that with a ratchet: per pair, `max(today's bar, the candidate's own bar)`
— a candidate may raise a bar, never lower one.

**Measured, it changes zero verdicts here.** It reports a tighter ratio than a candidate's own bars
would on most of them, but never turns a pass into a fail, because the pair that binds is
yellow/brown and *its* bar is yellow's own rung step, which no edit to brown can move. Moving a
number and deciding an outcome are different claims, and this report is entitled to the weaker one.
It is kept as a guard for the next family someone sweeps, not claimed as a save.

## What is here

- `packages/forest-world-r3f/harness/hue-frontier.ts` — the warp, the ratchet, the sweep. Pure,
  browser-free, no distance re-derived: every figure comes from `status-vocabulary.ts`'s existing
  measures.
- `hue-frontier.test.ts` — including the two corrections above pinned as tests, and the picked
  colour asserted by hex.
