# Is `blender_land.py`'s render deterministic, or a function of system load?

**Date:** 2026-08-16 · **Blender:** 5.2.0 LTS, headless, CPU Cycles, fixed seed · **Arc:**
`chapter2-code-generated-organic-art-arc` · **Increment:** `blender-land-render-determinism-verified`

**Verdict: DETERMINISTIC.** Nothing on this arc is load-dependent, and no committed evidence is a
measurement of the box. The two numbers that raised the alarm are both real, both correct, and were
produced by a **`--samples` difference between two lanes** — 32 against 48 — which the provenance
mechanism does not compare and was never built to.

---

## The accusation

A bare 50-degree land measured **34,968 px / 60 colours**, against the camera-elevation sweep's
committed `panel-50` at **34,970 px / 59 colours**, on the same `blender_land.py` source digest
`15927bf5`. Two numbers, one code state. The named suspect was Cycles **adaptive sampling** left on —
the same load-dependent non-determinism that WAS found and fixed in the decor renderer, where 2 of 11
pieces drifted but only under concurrent work. If that were the cause here, every px and colour count
this arc has published about the land would measure what else the box was doing.

## What was measured

Three scripts, each printing the numbers quoted below. `runs/` is gitignored — see that file.

| | |
|---|---|
| `determinism.py` | six renders of the full 22-piece set under varied thread counts and load, compared on decoded rasters, plus a cross-session comparison |
| `adaptive_probe.py` | is adaptive sampling on, does it change anything, and if so is the change thread-dependent |
| `explain_delta.py` | reproduces both disputed numbers and attributes each half |

Two method clauses that the increment called out, both of which would have given a wrong answer if
skipped, and one this pass added:

- **Decoded rasters, never file hashes.** Confirmed live: across two runs whose rasters are *pixel
  identical*, **0 of 22** piece files had identical bytes. A file-hash check would have reported
  100% drift with zero drift present.
- **Under real concurrent load.** Measured, not assumed: sibling lanes were building throughout (two
  live `gate-run` processes observed on a 12-logical-core box), the whole-box CPU counter read
  **97–100%** on every single row, and one row adds six deliberate spinners on top. The same 22-piece
  set took **16.2 s** on its fastest row and **64.9 s** on its slowest — a **4× wall-clock spread**
  under contention — and produced identical pixels at both ends. A render that takes four times as
  long and returns the same bytes is not reading the clock.
- **Vary the thread count too** (added here). Load reaches Cycles by changing how work is
  partitioned; `--threads` moves that variable directly and for free, which matters with siblings
  running. Thread-invariance is what makes the load result something other than luck.

## Result 1 — the render is deterministic

Every decoded raster identical, 22 pieces per row:

| run | threads | extra load | seconds | pieces differing vs `base1` |
|---|---|---|---|---|
| `base1` | auto (12) | sibling lanes | 16.2 | — |
| `base2` | auto (12) | sibling lanes | 22.0 | **0** |
| `t1` | 1 | sibling lanes | 18.3 | **0** |
| `t2` | 2 | sibling lanes | 32.6 | **0** |
| `t7` | 7 | sibling lanes | 52.1 | **0** |
| `load` | auto (12) | + 6 spinners | 64.9 | **0** |

**And the row this session could not fake.** The dressing lane committed its `pieces-land` from a
**different worktree** (`agent-a1d851b5b498c6145`), in a different session, on a different day, under
whatever that box was doing — at `--samples 48`. Rendering 48 here and comparing:

> **22 pieces, 0 differing.**

That is determinism across everything a same-session matrix holds fixed by construction: process,
machine state, working tree, and the load of an entirely different day.

## Result 2 — adaptive sampling IS on, and it is inert here

The suspicion was half right, and the half it got right is worth keeping. `blender_land.py`'s
`render()` sets engine, device, samples, denoising, seed and film — and **never mentions
`use_adaptive_sampling`**, so it inherits the Cycles default, measured as `True` (threshold 0.01,
`adaptive_min_samples` 0). Both sibling generators set it to `False` explicitly:

| generator | adaptive sampling |
|---|---|
| `blender_decor.py` | `use_adaptive_sampling = False`, explicitly |
| `blender_grass.py` | `use_adaptive_sampling = False`, explicitly |
| **`blender_land.py`** | **never mentions it — inherits `True`** |

So it looks like an oversight rather than a choice. But enabled is not load-bearing, and the two
questions have different answers:

| samples | adaptive on vs off | thread-invariant while active |
|---|---|---|
| 32 (the sweep's land leg) | **0 px differ** | — |
| 48 (the dressing/grass lanes) | **0 px differ** | — |
| 512 | 3,304 px differ | **0 px differ** (auto vs 1 thread) |

**At every sample count this arc has actually rendered at, forcing the flag off moves no pixel.** It
wakes up at higher counts — and even awake it is thread-invariant, so it changes *which* picture you
get, never *as a function of load*. Headless Cycles schedules its sample batches by sample count, not
by wall clock; the viewport's time-adaptive path is what makes adaptive sampling load-dependent, and
background rendering does not take it.

**This is why the flag was left alone.** Editing `blender_land.py` changes its source digest and
invalidates the interior fork's committed provenance — a real cost the provenance mechanism exists to
impose. Paying it to change zero pixels would be the trade backwards. It stays a **latent
inconsistency**: worth closing the next time that file is edited for another reason, and worth
knowing about before anyone raises the sample count.

## Result 3 — what actually produced two numbers from one digest

Same island, same compositor entry point, same code state, two piece sets differing only in
`--samples`:

| piece set | samples | code state | landPx | landColours |
|---|---|---|---|---|
| fresh render | 32 | `15927bf5` | **34,970** | 59 |
| fresh render | 48 | `15927bf5` | **34,968** | 59 |
| committed `pieces-land` | 48 | `15927bf5` | **34,968** | 59 |
| …through the dressing lane's own `compose_land` | 48 | `15927bf5` | 34,968 | **60** |

Both published numbers reproduce exactly, and the split has two independent causes:

- **The two pixels are `--samples`.** `sweep_render.py` pins `LAND_SAMPLES = "32"`; the dressing and
  grass lanes rendered at 48. More samples move the antialiased edge coverage, and the majority
  downsample in the back half then resolves two boundary pixels differently.
- **The one colour is the compositor.** The sweep's land leg counts through the fork's bare
  `C.compose('flat', 'cell')`; the dressing lane counts through its own `compose_land`. Both report
  the **identical `solid` mask** — so landPx agrees between them — and only the colour set differs.

## The real finding: `code_state` excludes flags, and one flag moves delivered pixels

This is the part worth carrying off this pass.

`_own_code_state()` is the **source digest**, deliberately — its own docstring says *"NOT the flags"*,
because the chamfer sweep varies `--chamfer` on purpose and a fork picture is *supposed* to vary its
flags. What it must never vary is the code underneath. That reasoning is sound and is not what failed.

What failed is that **`--samples` is not that kind of flag.** `--chamfer` varies the subject;
`--samples` varies the *fidelity of the measurement of* the subject. Two lanes can therefore both
declare `15927bf5` truthfully, render at 32 and 48, publish px counts that disagree, and leave a
reader with a phantom code change to hunt — which is exactly what happened.

And it is worse than "recorded but unchecked", in two steps:

- **Unchecked.** `render-meta.json` does carry the generator's `argv` verbatim — but
  `provenance.require_one_code_state` groups inputs by `sha256` alone, so a composite mixing a
  32-sample piece set with a 48-sample one passes the guard that exists to catch precisely this shape
  of mistake. The mechanism has the data and does not look at it.
- **Not carried at all, on the delivered picture.** `panel-50.png.provenance.json` records
  `codeState: 15927bf5` and a `command.argv` — but that argv is **`compose_sweep.py`'s**, not the
  generator's. The sample count lives only in `pieces-50/render-meta.json`, which the sweep's own
  `.gitignore` excludes. So for the committed `panel-50`, *the sample count is not recoverable from
  any committed artifact* — it survives only as the constant `LAND_SAMPLES = "32"` inside
  `sweep_render.py`. That is how the same digest could front two numbers with nothing on the page to
  explain it.

**Not fixed here, and deliberately.** `provenance.py` is shared by every committed lane on this arc,
and tightening its refusal could red verify scripts on pictures that are individually correct. The
gap is named for the driving session to route.

## What this means for already-committed evidence

**No committed picture is wrong, and none is load-dependent.** Each lane is internally consistent —
it rendered every one of its own pieces at one sample count:

| lane | samples | status |
|---|---|---|
| `chapter2-camera-elevation-sweep-2026-08-15` | 32 | internally consistent |
| `chapter2-island-place-dressing-2026-08-16` | 48 | internally consistent |
| `chapter2-grass-reads-as-signal-2026-08-16` | 48 | internally consistent |
| `chapter2-hex-lines-and-flat-green-2026-08-16` | 48 (shares the above pieces) | internally consistent |

What is **not** valid is comparing land px counts **across** the 32-sample lane and the 48-sample
lanes as though a difference meant something about the art. That comparison has a floor of about two
pixels that is pure sampling, and it is the only comparison this pass invalidates. Every owner-facing
decision made *within* a lane — the camera elevation pick, the grass and base forks, the line fork —
stands untouched.

## Recommendations

1. **Pin `--samples` per generator, or compare it in the guard.** Either makes the class impossible
   rather than reported. The guard already holds `argv`; the cheaper half is to have
   `require_one_code_state` refuse on a disagreeing `samples` alongside a disagreeing digest.
2. **Put the generator's `--samples` on the delivered picture's sidecar.** `write_sidecar` already
   takes the composer's `argv`; the piece sets' own `samples` belongs beside the `codeState` it
   qualifies, so a reader holding only the committed picture can tell what produced it.
3. **Close the adaptive-sampling inconsistency opportunistically** — next time `blender_land.py` is
   edited for another reason, so the provenance break is paid for something. Do not pay it for this.
4. **Never compare land px across lanes without checking `render-meta.json`'s `argv` first.**

## Reproduce

```
python determinism.py       # the 6-run matrix + the cross-session row
python adaptive_probe.py    # the sample ladder + thread invariance
python explain_delta.py     # both disputed numbers, attributed
```

Reports: `determinism-report.json`, `adaptive-probe-report.json`, `delta-report.json`.
