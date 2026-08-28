# The palette guard, and the proof that it can refuse

`pnpm check:palette-transcription` — added 2026-08-28 with the correction it was written to
prevent recurring. This file is the evidence that it is an instrument rather than a green light.

## What it compares

The status palette is written down in **three** places, and until this rung existed nothing
compared any pair of them. The canonical surface said so in as many words:

> THE MIRROR: `packages/forest-world-r3f/harness/palette-band.ts` `STATUS_TOKENS` transcribes
> these six blocks verbatim for the live-render experiment. **Nothing mechanical compares the two
> copies** — if you retune a token here, move it there in the same landing.
> — `apps/studio/src/index.css`, above `.hex-territory.st-proposed`

| # | copy | role |
|---|---|---|
| 1 | `apps/studio/src/index.css` — `.hex-territory.st-<status>` and `--crown-<status>-lo` | **canonical**; where ADR-0462 and ADR-0470 were authored |
| 2 | `packages/forest-world-r3f/harness/palette-band.ts` — `STATUS_TOKENS` / `TREE_TOKENS` | a declared transcription of (1) |
| 3 | `packages/forest-world-r3f/src/ForestWorldCanvas.tsx` — `GROUND_COLOUR` / `CROWN_COLOUR` | what the **shipped** map draws, and since 2026-08-28 what a visitor to the public site's chapter 2 sees |

Each is compared against **(1)**, never in a chain, so a landing that moved two copies and forgot
the third is reported against the decision rather than against whichever copy moved first.

## Why it is a gate rung and not only a test

There is a `node:test` suite beside it (`harness/palette-transcription.test.ts`) running the same
comparison over the same parsers. It is not sufficient on its own, and the reason is mechanical:

`pnpm gate` narrows both `-r` legs to the packages a branch AFFECTS plus their dependents
(ADR-0304 D1), and **`apps/studio` does not depend on `@storytree/forest-world-r3f`**. So a branch
that retunes the canonical surface — which is what every decision about this vocabulary has done —
runs no test in that package at all. The suite catches a canvas drifting from the CSS; only a
declared `check:*` step, which runs on every gate regardless of scope, catches a CSS drifting from
the canvas. **The canonical copy is the one that moves.**

It is pure filesystem reading and string parsing: no browser, no store, no network, single-digit
milliseconds. It has no skip branch, so CI runs it as an ordinary step.

## PROOF THAT IT CAN FAIL

Six instruments were caught on this arc in two days that could not fail. Four mutations were run
against the working rung, each reverted before the next, with a confirming green at the end.
Transcript, unedited:

```
### M1 — canvas mapped ground reverted to the old blue
[palette-transcription] REFUSED — the status palette does not say one thing.
  mapped.ground (canvas): apps/studio/src/index.css says #b7684e, src/ForestWorldCanvas.tsx says #5d8fa8
--- exit: 1

### M2 — canvas crown given the GROUND colour (the straight-swap bug this unit exists to avoid)
[palette-transcription] REFUSED — the status palette does not say one thing.
  building.crown (canvas): apps/studio/src/index.css says #6b7280, src/ForestWorldCanvas.tsx says #d8c069
--- exit: 1

### M3 — the CSS retuned alone (the drift only a gate rung can see)
[palette-transcription] REFUSED — the status palette does not say one thing.
  unhealthy.top[0]: apps/studio/src/index.css says #57544b, harness/palette-band.ts says #57544a
  unhealthy.ground (canvas): apps/studio/src/index.css says #57544b, src/ForestWorldCanvas.tsx says #57544a
--- exit: 1

### M4 — palette-band's flank half-applied
[palette-transcription] REFUSED — the status palette does not say one thing.
  mapped.side: apps/studio/src/index.css says #883d24, harness/palette-band.ts says #85683f
--- exit: 1

### CONFIRMING GREEN after every revert
[palette-transcription] PASS — apps/studio/src/index.css, harness/palette-band.ts and src/ForestWorldCanvas.tsx agree on all six states, ground and crown.
--- exit: 0
```

And the strongest arm, run before the fix landed at all — the rung against the **actual** pre-fix
`ForestWorldCanvas.tsx`, restored from `git show HEAD:`:

```
  A SOURCE COULD NOT BE READ AS A PALETTE (this is not agreement — it is silence):
    src/ForestWorldCanvas.tsx GROUND_COLOUR yielded no entry for healthy, mapped, proposed, building, unhealthy, unknown
    src/ForestWorldCanvas.tsx CROWN_COLOUR yielded no entry for healthy, mapped, proposed, building, unhealthy, unknown
  ... twelve token disagreements, all six states, ground and crown
```

⚠ Note what that last run actually proves and what it does not. It refused on the
**binding-absent** arm — the pre-fix file held one `STATUS_COLOUR` map, not the two the guard reads
— so it is evidence that a renamed binding is caught, *not* that a wrong colour is. That is why the
mutations above exist, and why the suite carries the pre-fix palette as DATA
(`SPIKE_STATUS_COLOUR` in `harness/shipped-baseline.ts`) and asserts the comparison refuses every
one of its six values. A refusal that arrives for the wrong reason is still a refusal that could
stop arriving.

## The refusals are permanent, not a transcript

The eight tests in `harness/palette-transcription.test.ts` carry them, so they survive anyone
touching the parser:

- the three copies agree today, ground and crown, on all six states
- every parser found all six — **an empty parse is silence, not agreement**
- the two hard CSS cases are *read*, not assumed: `proposed`/`building` share one rule block, and
  `building` has no crown rule and resolves through the unqualified `.story-tree .crown-lo circle`
  default
- comments are stripped first — the CSS still quotes the retired tan `#b3946a` in prose, and the
  test asserts it is quoted (so the check does not go vacuous) *and* that it does not survive
  stripping
- **CAN FAIL** — the actual pre-fix palette is refused on every one of its six states, naming both
  values
- **CAN FAIL** — a crown handed its own ground colour: exactly the one token is reported, which is
  the bug a straight find-and-replace would have shipped
- **CAN FAIL** — the CSS retuned alone
- **CAN FAIL** — a family half-applied (the flank left behind when the top moved)
- **CAN FAIL** — a status *deleted* from a copy is a disagreement, never a narrowing
- **CAN FAIL** — a source that parsed to nothing is a fault, reported separately from the token
  comparison

That last pair is the vacuity this guard was most at risk of. The six statuses come from
`DECIDED_STATUSES`, hand-authored **upstream** of all three subjects — never derived from them. An
expectation computed from the thing it checks vanishes at exactly the moment the thing it guards
does, and the check then passes for the reason it exists to catch.
