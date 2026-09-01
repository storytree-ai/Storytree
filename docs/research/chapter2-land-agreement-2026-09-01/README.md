# The reproducibility rule, inside the tool — and what it still cannot see

**Date:** 2026-09-01 · **Increment:** `land-cost-instrument-arc-inc-03` (arc end-state item 3)
**Instrument:** `packages/forest-world-r3f/harness/run-agreement.ts` (pure, 17 tests)
**Driver:** `land-floor-measure.mjs`, now taking two whole sweeps by default
**Box:** `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 2060/PCIe/SSE2, OpenGL 4.5.0)`

---

## What changed

The rule was **remembered by the session**: two runs taken and diffed by hand, which inc-01's own
driver header admitted. It is now enforced by the tool.

- The driver takes **two whole sweeps** by default and diffs them row by row.
- Rows that disagree are **DROPPED and said to be dropped** — never averaged. Averaging two
  readings 500% apart produces a number describing neither.
- **A single run exits 4** and is labelled `SINGLE RUN — … NOT a pass and NOT a tolerance that was
  met: it is the absence of the question having been asked.`
- **Byte-identical rows are flagged as a suspicion**, not a triumph: for a GPU clock over
  independent sweeps that is near-impossible, and the likely cause is that the second sweep never
  ran. A verdict scoring equality highest would rank its own worst failure mode top.

**The tolerance is derived, never authored.** Two runs of one configuration should agree within the
noise they themselves measured, so the bar is the wider of their own within-run spreads — the same
"wider of the two" rule `frame-budget.ts` already uses for a delta's noise floor. This
neighbourhood has already paid for an authored one: an earlier `hardware-floor.mjs` scored rungs
against `16.7 * 1.35`, and its own comment records 1.35 as *"a number picked to make the answer come
out"*. A test asserts no multiplicative fudge exists anywhere in the judging code.

---

## ⚠ The finding: the rule works, and it does not reach far enough

Three invocations on the same RTX 2060 on one afternoon. **Every pair reproduced tightly inside its
own invocation. The third sat ~12% below the first two.**

| row | invocation 1 (inc-01) | invocation 2 | invocation 3 |
|---|---|---|---|
| `flat@one@8` | 0.1644 / 0.1645 | 0.1644 / 0.1644 | **0.1460 / 0.1460** |
| `grass@one@8` | 0.5862 / 0.5861 | 0.5863 / 0.5862 | **0.5178 / 0.5179** |
| `grass-amplified@one@8` | 4.2216 / 4.2196 | 4.2241 / 4.2218 | **3.7205 / 3.7211** |
| `flat@forest@8` | 0.2505 / 0.2499 | 0.2500 / 0.2499 | — |
| `grass@forest@8` delta | **+0.4205** | **+0.4212** | — |

**The cause is the device's clock state, not the shader.** The control moved by the same fraction as
the treatment, so what survives is the RATIO:

| | invocation 1 | invocation 3 |
|---|---|---|
| `grass / flat` | 3.57 | 3.55 |
| layer delta as a multiple of the control | 2.57x | 2.55x |

So **an absolute ms figure carries the box's clock state with it and must be quoted with the
invocation that produced it; a ratio against the control travels.**

**`forest@8` was the most stable figure of all** — its delta was 0.4205, 0.4212, 0.4212 across every
invocation that measured it. The larger scene appears to hold the GPU in a steadier clock state than
the tiny one-island one, which is worth knowing when choosing a view to quote.

`inc-01`'s evidence sheet has been **corrected in place** with a dated note rather than left
standing at four significant figures.

**The headline is unaffected.** The stack comes to 16.5–19.2% of a frame depending on the
invocation, and the conclusion — that cost rules out none of the owner's four options — holds at
either end.

---

## Two limitations, stated rather than discovered later

**1. This compares runs WITHIN one invocation.** That is where the 170–530% failure lived, and it is
what the arc's end-state asked for. It says nothing about the same box an hour later — see above.
Closing that would mean a committed baseline the tool checks against, which is a different
instrument and is not chartered.

**2. Agreement is not a strength claim on its own.** Because the bar is the runs' own noise, a NOISY
run clears it trivially — measured on the Adreno dev box, a control whose within-run spread was
1.48 ms "reproduced" a between-run gap of 11.3%. That is the two rungs composing correctly rather
than a hole: a run loose enough to agree with anything is also too loose to RESOLVE anything, so the
cost rung reports UNRESOLVED and nothing is quoted either way. What this rung removes is the
opposite case — a TIGHT run whose second sweep lands somewhere else entirely, which looks
authoritative and is the shape the 170–530% rows had.

**Pooling makes the floor stricter as runs are added**, and that is deliberate: `spread` is
max−min, so more samples reveal the range a single reading could land in more honestly. A
consequence worth expecting is that a noisy box will decline to quote a cost a quieter one
resolves — visible in `invocation-2-report.txt`, where `one@8` went UNRESOLVED on one outlying
sample while `forest@8` resolved and matched inc-01 exactly.

---

## Verification

`run-agreement.test.ts` — 17 tests, including the two committed RTX 2060 runs as fixtures, so the
rule is checked against the data it will judge.

`check:mutation-diff` skips `harness/` (it mutates only a project's `src/`), so seven mutants were
seeded by hand: inverted agreement comparison, single run treated as agreed, tolerance from the
smallest spread, gap over the first two runs only, identical-suspicion disabled, `sharedKeys` made
a union, and the percentage taken over the larger median. **All seven killed, no survivors**, file
restored byte-identical.
