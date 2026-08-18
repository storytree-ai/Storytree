# A render's sample count is recoverable from its provenance (2026-08-19)

`chapter2-code-generated-organic-art-arc` · increment
`render-sample-count-is-recoverable-from-provenance`

    python scan_fidelity.py --print     # rebuild fidelity-report.json from the committed corpus
    python verify.py                    # 27 checks: the refusal fires, and reds nothing honest

## The problem, and the one sentence that states it

`provenance.py`'s code state is a SOURCE digest and deliberately not the flags, because a fork sheet
varies `--chamfer` or `--normals` on purpose. That is right. What it missed is that **flags are not
one kind**: `--chamfer` varies the SUBJECT of a comparison, `--samples` varies the FIDELITY OF THE
MEASUREMENT of it. A digest blind to the first is correct; blind to the second it cost PR #1379 a
whole lane, chasing 34,970 delivered land px against 34,968 on one digest `15927bf5` as suspected
non-determinism. The renderer was deterministic. One side was rendered at 32 Cycles samples and the
other at 48.

## Two premises this pass had to correct before it could build anything

**The sweep's sample count WAS committed.** The increment said the sweep "gitignores its piece
directories, so the evidence that would disambiguate is not committed at all". False —
`chapter2-camera-elevation-sweep-2026-08-15/sweep-report.json` has carried `landSamples: 32` and
`treeRender.samples: 72` since the day it was written. **The defect is REACHABILITY, not absence:**
the artifact that describes a picture is its `.provenance.json` sidecar, and the sidecar neither
carries the number nor points at the file that does. Eight sidecars describe those panels and not one
of them states the fidelity. A reader holding `panel-50.png` has no path to 32.

**And the inference they are pushed into is WRONG, not merely weak.** Those panels declare
`blender_land.py@15927bf5`. A reader resolving that digest against the committed corpus finds only
48-sample directories, from two other passes. They land on 48, confidently, and the truth was one
unlinked file away. That is the failure mode in its sharpest form: not a missing number, but an
available wrong one.

## What the committed corpus actually looks like

Every figure below is read from `fidelity-report.json`, which `scan_fidelity.py` regenerates from
committed files only (`git ls-files`) — never from a working copy, because "recoverable from
committed provenance" is the claim under test.

| what | count |
|---|---:|
| committed render directories scanned | 56 |
| distinct code states across them | 8 |
| committed sidecars | 67 |
| input records across those sidecars | 283 |
| input records carrying their own fidelity | 0 |
| input records whose fidelity the reader must INFER | 279 |
| code states measured at more than one fidelity | 0 |

Two readings matter. **The renderers were never the problem** — every `blender_*.py` has been writing
`samples` into `render-meta.json` all along, and `pixelise.py` propagates it into
`registration.json`. The number was being recorded and thrown away at the door. And **no committed
picture mixes fidelities**: 0 splits over 8 code states, so nothing on disk needs re-rendering and no
committed provenance is invalidated.

## The mechanism: DISCLOSE always, REFUSE within one code state

Both, and the split is decided on the evidence rather than on taste.

**DISCLOSE is the primary fix, because the failure was cross-PASS and no composer can reach it.**
#1379 compared two pictures composed a day apart. A composer's guard sees one picture, so it could
never have refused that comparison — no scoping of a refusal reaches it. What was missing was the
number, written where a reader trips over it. So `declared_fidelity()` reads what the render
directories already declare, `input_records`/`piece_inputs` stamp it per input, and `write_sidecar`
hoists a `fidelity` block with an explicit `mixed` flag to the TOP of every new sidecar.

**REFUSE is the secondary rung, and it is scoped to one code state.** `require_one_code_state` now
calls `require_one_fidelity` after it has established the cells agree on a digest — i.e. one
generator, one source, one SUBJECT, whose delivered pixel counts are directly comparable. Measuring
those two ways is never legitimate, so it is refused with its own verbatim `REFUSAL_FIDELITY`.

### What counts as a fidelity — and the afternoon this pass got it wrong

`FIDELITY_KEYS` is `samples` and `shadow_samples`: Cycles PATH counts, which change how well a fixed
subject is estimated and nothing about what is drawn. `supersample` and `supersample_res` were in
that tuple for an afternoon, on the plausible reading that "the scale the measurement is taken at" is
a fidelity.

**It is not, and a pass that landed on `main` mid-session proved it.**
`chapter2-scale-ladder-2026-08-18` composes ONE sheet from four rungs of `blender_land.py@15927bf5`
at supersample 3/6/12/24 — an island at 1x/2x/4x/8x, which is that pass's entire subject. With those
keys included, this guard **refused that sheet.** The supersample factor sets the delivered
resolution, so varying it changes what the artifact IS. That is the failure the increment named in
advance — *a guard that refuses a fork its own variable is worse than the gap it closes* — and it was
caught by merging `origin/main` before landing rather than by reasoning. `verify.py` now composes
those four real rungs as a permanent check.

**A blanket refusal would have been wrong**, and the scoping is not decorative:

- A `--normals` fork (14 committed directories at one digest) varies its flags on purpose and must
  keep composing. It does — the source digest stays blind to flags, exactly as designed.
- The scale ladder's four rungs compose, per the correction above.
- A two-generator composite (land + decor) is two subjects whose sample counts are free to differ.
  That set never reaches the fidelity rung at all: the code-state rung refuses it first, which is why
  the multi-generator composers on this arc already call the guard once per generator
  (`compose_core.require_one_state_per_generator`). The new rung inherits that grouping and needs no
  grouping of its own.
- A directory declaring no fidelity is UNATTRIBUTED, never suspect — `provenance.py`'s standing rule
  that nothing polices the past. Every artifact rendered before this existed still composes.

`_own_code_state()` is untouched. The fidelity sits BESIDE it and is never folded into the digest,
so no fork comparison on this arc changes.

## Proof that the guard fires

A guard observed only passing is indistinguishable from one that cannot fail, so `verify.py` plants a
mixed set — one code state, `samples` 32 against 48, nothing else varied — and asserts the refusal
fires with its exact text and names both cells. The setup is guarded against proving nothing: it
refuses to continue unless both cells declare the SAME code state and BOTH declare a fidelity.

**The ablation is what makes that evidence rather than ceremony.** With `require_one_fidelity`
replaced by a no-op, the identical fixture composes in silence — which is precisely the world before
this change. So the refusal is caused by this rung and not by the code-state rung firing for another
reason.

Then the other direction, on real committed directories: the `--normals` fork composes, the scale
ladder's four supersample rungs compose, each generator group composes, an undeclared cell composes,
and all 8 committed code states are re-run through the production guard without a refusal.

Fixtures are planted under the system temp directory and never in the repo — a check whose own output
is committed into the tree it then scans grew a field geometrically on this arc once already.

## What changed on disk

- `blender-hero-v1/provenance.py` — `FIDELITY_KEYS`, `REFUSAL_FIDELITY`, `declared_fidelity`,
  `fidelity_key`, `require_one_fidelity`, `fidelity_summary`; `input_records` and `write_sidecar`
  stamp it; `require_one_code_state` runs the rung inside the agreed state.
- `chapter2-land-interior-fork-2026-08-15/compose.py` — `piece_inputs` stamps it, which is how the
  other eleven passes on the arc pick it up without an edit each.
- `chapter2-camera-elevation-sweep-2026-08-15/.gitignore` — `pieces-*/` was excluding a ~2 KB
  declaration along with ~3.6 MB of PNG. The PNGs stay out; `render-meta.json` is kept.
- this directory — the scan, the report, and the harness.

**No pixel moved.** Nothing was re-rendered and `verify.py` asserts the branch's diff contains no
`.png`. Every sidecar already committed keeps its exact bytes; the disclosure appears in sidecars
written from now on, which is the same "nothing polices the past" rule `provenance.py` has always had.

## What this does NOT do

The 279 already-committed input records stay un-attributed. Backfilling them would mean writing a
fidelity into a record from a number recovered by inference — the same inference this pass just
proved lands on the wrong answer for the sweep. Re-composing them honestly needs the piece
directories, and the sweep's are not committed. The corpus becomes attributed as pictures are
legitimately re-composed, and `fidelity-report.json` measures that drift down.
