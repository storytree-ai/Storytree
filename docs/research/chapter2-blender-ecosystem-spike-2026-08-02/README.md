# Have we been reinventing the wheel? — the Blender tree-generator ecosystem, tested

**Date:** 2026-08-02 · **Blender:** 5.2.0 LTS · **Cost:** $0 · **Vendor calls:** 0 · **Owner-raised**

The owner saw Sapling Tree Gen on YouTube and asked whether we hand-rolled a space-colonisation
skeleton for ADR-0280
D1 without looking at what Blender's ecosystem already offers. **The challenge was fair and is
partly upheld.** This is the test, not an argument.

**Nothing here is owner-attested,** and the LOOK verdict remains the owner's (ADR-0070).

## The short answer

The ecosystem is real and we had never looked at it. But it supplies a better mature **form
library**, not a better **growth track** — and the hero tree's job is a growth track. Our skeleton
stays, now for a measured reason rather than for want of checking.

| | growth track | mature form at 128 px | cost to us |
|---|---|---|---|
| **ours** (space colonisation) | every frame a plausible tree of its age | limbs read through the crown | already built |
| **sapling** default tree | bare pole for frames 2–9, then a hat | trunk far too heavy, canopy only on top | 5 integration defects, all fixed |
| **sapling** `small_maple` | trunkless sprawling shrub throughout | fuller crown, but interior is twig NOISE | + a trunk-radius calibration |

`growth-3way.png` and `mature-3way.png` are the evidence, composited on the island's own plate
(a transparent contact sheet hid two failures in a previous increment, so judgement happens on the
plate).

## What is actually out there

Three tree generators sit in the official `extensions.blender.org` repo, all GPL, all free:

- **`sapling_tree_gen`** — Weber & Penn 1995 parametric trees. Bundled with Blender until 4.1,
  an installable extension since 4.2, which is why it was not in this install. Nine species presets.
- **`space_colonization_tree_generator`** — 443 lines, the very algorithm we hand-rolled. It emits a
  skeleton mesh and records no per-node birth, so it does not carry the one property our track needs.
- **`easy_tree`** — geometry-nodes scene dressing, mature form only.

**The Grove** (paid, not installed) is the only tool that addresses our actual problem: it
*simulates* growth year by year rather than generating a finished tree. €99 Starter / €199 Indie /
€799 Studio, perpetual, Blender 5 supported, upgrades at 30%. Owner spend call — see below.

## The hybrid, and why it was worth building anyway

Sapling generates a MATURE tree only. Re-running it with smaller parameters to get younger stages
reshuffles the tree, so frame *k* would not be frame *k+1* with branches removed — precisely the
morph failure ADR-0280 D1's strict-prefix invariant exists to prevent. So the division of labour has
to be: **Sapling owns the mature form, we own growth.**

That is now wired as `blender_tree.py --skeleton sapling [--sap-preset <species>]`. It reads
Sapling's armature as a parent graph, chain-resamples it to a uniform segment length, and synthesises
a birth wave outward from the root; every downstream stage — pipe-model girth, cloud canopy, cel
bands, camera, pacing, the whole raster back half — is shared and unchanged. Exactly one variable
differs between the rows of the contact sheet.

`--skeleton space-colonisation` is the default and is byte-unchanged: it still reports
`nodes=405 iters=27 lobes=22 span=3.1362 tz=1.4080` and the identical `RETIME` vector.

## Why a borrowed mature form makes a poor growth track

**A prefix of a mature skeleton is not a juvenile.** It is the mature tree with pieces missing, and
what the early frames look like is decided by whatever the mature form happens to carry low down —
which is not a thing the generator was asked to control. Measured across the nine presets
(`probe_presets.py`), the height of the lowest lateral as a fraction of apex height:

```
japanese_maple 0.05 · white_birch 0.08 · callistemon 0.10 · small_maple 0.10
small_pine 0.14 · weeping_willow -0.06 · douglas_fir 0.28 · quaking_aspen 0.37
```

The default tree sits at 0.37 — bare for the first 37% of its height, which is the pole in row 3.
Picking `small_maple` (0.10) fixes the ramp numerically: true height runs
0.199 → 0.266 → 0.321 → … → 1.000, close to our own 0.185 → … → 1.000. But it trades the pole for
the opposite failure — a wide, trunkless shrub whose interior fills with sub-pixel twig speckle.

Our space colonisation avoids both because birth is not synthesised at all: the skeleton was *grown*
over 27 iterations and each node records the iteration it appeared, so every prefix is a tree that
genuinely existed at that age. That property is cheap for us and unavailable from a finished mesh.

## Five integration defects, because the cost is part of the answer

Worth recording: four of these produced a *plausible wrong result* rather than an error.

1. **Preset files are dict literals**, not `op.<prop> = <value>` operator-preset scripts. Parsing for
   `op.` assignments yields `{}` and every preset silently renders the DEFAULT tree.
2. **`bpy.types.CURVE_OT_tree_add.bl_rna.properties` lists only the 14 generic operator keys** and
   none of the add-on's own. Filtering kwargs against it discards every real property — same silent
   failure as (1), and the reason the first preset survey returned nine identical trees. The fix asks
   the operator instead: call it, drop whatever it rejects.
3. **`read_factory_settings` unregisters the add-on**, so enabling before it leaves the operator gone.
4. **Per-edge resampling only adds nodes.** Fine for a 158-bone tree, ruinous for `small_maple`'s
   7456. Resampling per CHAIN both splits a 13-unit trunk bone and merges runs of tiny twig bones.
5. **The pipe model is calibrated to tip COUNT.** `small_maple`'s ~20× tips drove the mature trunk
   radius to 0.77 on a 2.82-tall tree — a bole 55% as wide as the tree is tall. Now auto-calibrated
   against the space-colonisation trunk (0.1159); exactly 1.0 for our own skeleton.

## What is honestly still open

- The comparison holds skeleton-adjacent constants fixed — 22 cloud seats, blade gates, `LEAF_LEN` —
  and those were tuned around our node density. A real adoption would re-tune them, and
  `small_maple`'s blobby crown is partly that, not purely the skeleton. The structural findings
  (no juvenile inside a mature form; twig noise; integration cost) survive re-tuning; the crown
  quality comparison does not fully.
- Only `sapling` was integrated. `easy_tree` and the space-colonisation extension were read, not run.
- Geometry nodes + `Trim Curve` — the bundled, native prefix-growth route — was **not** tested. It is
  the one remaining ecosystem thread that could plausibly beat us, and it needs no third-party code.
- **Species variety is the finding we did NOT go looking for.** The forest needs many trees, not one.
  Nine presets × seeds through our own raster back half is a cheap answer to a question we have not
  yet asked, and it does not depend on solving growth.

**Not claimed.** No owner LOOK, no adoption, no ADR change, no arc closure. ADR-0280 D1 stands, and
now stands on a measurement.
