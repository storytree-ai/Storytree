# Round 4 — is code-only art competitive?

**Arc:** `chapter2-code-generated-organic-art-arc` · **Date:** 2026-08-01
**Question:** can art produced entirely by our own code stand next to the PixelLab tracks the owner
already likes — and does it answer anything PixelLab structurally cannot?

**Answer: yes on both, with one technique and two honest failures.**

---

## 0. Provenance — read this first

The round-4 workflow **died before its writeup, review and synthesis phases**. What it completed was
the expensive half: four model-free generators, 700–818 lines each. Only `code-pixel-rasteriser` had
rendered its frames.

The remaining three were rendered afterwards by running the generators as committed, unmodified, at
their documented reproduce lines. That is local CPU only — no model, no vendor call, no cost. The
`code-sdf-volume` track was run at **default parameters**; its docstring says the developmental clock
`a(t)` is "chosen at runtime", so its failure below may be miscalibration rather than a dead
technique. Nobody has evidence either way, and this document does not claim otherwise.

**No generative model produced any pixel in this directory.** Verified by inspection: the only
imports across all four generators are `math`, `hashlib`, `json`, `os`, `sys`, `argparse`, `numpy`
and `PIL`. There is no network call, no credential, and no vendor hostname in any generator.

The one thing taken from elsewhere is a **palette**: three of the four sample or subset the 32
colours exp-16 shipped (themselves tuned against the real SVG island plate). That is declared in each
generator's header and is a deliberate design choice, not undisclosed borrowing.

`code-vs-model.png` is the five-track comparison at frames 00 / 04 / 09 / 14 / 18.

---

## 1. The result

| track | technique | topology | camera | surface | verdict |
|---|---|---|---|---|---|
| **code-pixel-rasteriser** | procedural skeleton → pixel rasteriser | continuous | **none** | **competitive with exp-16** | **the result** |
| code-your-own-call | space colonisation + pipe model | **strict prefix** | **20° calibrated** | weak (lobes read as grapes) | best bones |
| code-lsystem-svg | parametric L-system → SVG | continuous | none | reads as vector clipart | the control |
| code-sdf-volume | SDF/metaball sphere-trace | — | 14° | never resolves as a tree | failed |

### The hypothesis was confirmed

The brief's hypothesis was that *code art reads cheap because it reads as **vector**, not because it
is procedural*. Rows 2 and 3 of the comparison are the controlled test: near-identical procedural
skeletons, one emitted through SVG, one through a pixel rasteriser.

The SVG one reads as clipart — smooth gradients, flat leaf blobs, no material. The rasterised one
lands within touching distance of exp-16, the owner's favourite. **The finish, not the method, is what
made previous procedural art look cheap.** ADR-0264's rig — the decision reversed by ADR-0273 on
exactly this complaint — was rendered through layered SVG.

### Two honest failures

- **`code-sdf-volume` never resolves into a tree.** At default parameters it renders a brown pot-like
  mass with a green cap; the trunk/canopy distinction never emerges. Its ground-contact shadow *does*
  work and is the only real cast shadow in the pool. Possibly miscalibrated (see §0).
- **`code-lsystem-svg` grows out of frame** by frame 14; the mature crown is clipped by the canvas.
  Its topology continuity is nonetheless the cleanest in the pool.

### One partial

`code-your-own-call` has the best structural guarantees in the pool and the weakest surface. Its
pacing is wrong — a spindly whip for the first three of five sampled stages, then most of the growth
in the last two frames (its own retiming places 18 of 19 frames in `u ∈ [0, 0.615]` and the last at
`u = 1.0`). Its mature canopy lobes read as a grape cluster rather than foliage.

---

## 2. What code answers that PixelLab structurally cannot

### The camera — the owner's declared blocker

Round 3 §5 item 1: all eight PixelLab tracks were front elevation against a low top-down plate. The
owner directed on 2026-08-01 that this is **a blocker to fix before any owner LOOK**.

The camera-projection probe recorded in arc increment #1062 then established that **PixelLab will not
obey a camera word** — the `view` parameter with isometric and aerial vocabulary, and in-context
`create_map_object`, all return side elevation or bare terrain. A generation top-up would not have
fixed it. The workaround (deterministic squash fed back as an `init_image`) needs ~40 generations;
18 remain.

In code the camera is a declared scalar. `code-your-own-call/frames/registration.json`:

```json
"camera_elevation_deg": 20.0
```

with the ground plane compressed to `sin 20° = 0.342`, calibrated against `forest-world`'s own tree
shadow ellipse (`rx=0.78R, ry=0.20R` ⇒ 0.256) rather than chosen by taste. Changing it costs one
re-run and no money.

### Topology continuity, without freezing the tree

Round 3 §5 item 4: three of eight tracks won per-frame connectedness by freezing the tree — the
rejected "slowly revealed static image" family. Round 3 concluded it *"did not establish that
connectedness and growth can be had together"*.

Code establishes it by construction. `code-your-own-call` grows the skeleton **once** and records each
node's birth iteration, so the tree at any age is a strict **prefix** of the mature tree — topology
cannot mutate between frames, and nothing is frozen to achieve it. `code-lsystem-svg` reaches the same
end differently: branch order carries a continuous maturity multiplying its length, so a new order
emerges from zero length rather than popping in, and every random-looking quantity is keyed on the
branch's *identity* rather than a draw counter, so adding a branch cannot reshuffle the tree.

### Cost and iteration

The PixelLab pool stands at 18 of 2000 and needs an owner-held top-up. Every track here re-renders
from a seed for free, deterministically, byte-identical on re-run.

---

## 3. What code has NOT answered

1. **The best-looking code track has no camera model at all.** `code-pixel-rasteriser` contains no
   projection — it is front elevation, exactly like every PixelLab track. Its quality and the camera
   fix live in *different* experiments. Combining them is unproven work, not a merge.
2. **Palette is borrowed, not art-directed.** Three tracks subset exp-16's colours. No code track has
   yet been independently directed against the island plate.
3. **Nothing here is attested.** This is a LOOK verdict and no owner has looked at the code tracks.
   Every judgement in this document is the author's.
4. **No code track has been composited on the real island** at the real camera, which is where every
   round-3 track lost points it had won on transparency.
5. **The SDF failure is undiagnosed** (see §0).

---

## 4. Reproduce

```
python code-pixel-rasteriser/tree_gen.py
python code-lsystem-svg/gen.py --all
python code-sdf-volume/gen_tree.py --out frames
python code-your-own-call/gen.py --out frames
```

Each writes 19 frames at 128×128 RGBA8 with a ground-contact anchor and a `registration.json`.
Deterministic from `SEED = 20260801`.

`work/` intermediates (~19 MB of probes, sheets and per-variant renders) were not committed; the
generators reproduce them.
