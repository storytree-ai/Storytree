# The research compositor's painter order and `caps` authority, fixed together

`python verify.py` → **31/31 green** → `order-and-caps-report.json`. No Blender render in this pass;
every piece is a committed PNG. Camera **50 deg** (the research track's named parameter — the app's
`LAND_CAMERA_ELEVATION_DEG` is **20** and is neither read nor touched).

Two diagnosed-and-unfixed defects, both in
`chapter2-grass-reads-as-signal-2026-08-16/compose_core.py`, both invalidating the same committed
provenance. Taken apart they pay that re-render twice and leave sibling evidence dangling in
between, so they are taken together.

---

## 1. What moved

### Painter order — the depth key (PR #1383's diagnosis, applied; not re-derived)

`compose_land` sorts ONE draw list on `(y, class)`. A **cell's** key is its centroid; a
**placement's** key was its own ground point. Any placement in the back half of its own cell
therefore sorted **before** that cell, and `fill_polygon` is a hard write — the cell's own top face
erased the thing standing on it.

The key is now `max(own ground y, the cell's centroid y)`. It is a **reordering, not a move**: every
placement is still projected and blitted from its own untouched `g` and `h`.

| geometry | placements | delivering nothing, OLD key | delivering nothing, SHIPPED | occluded by their OWN cell | vegetation px | island px |
|---|---:|---:|---:|---:|---:|---:|
| **fixture** (`fork-spike-island`) | 112 | 51 (**45.5%**) | 8 (**7.1%**) | 31 → **0** | 292 → **510** | 34 968 both ways |
| **fixture driven all-`healthy`** | 145 | 67 (**46.2%**) | 12 (**8.3%**) | 41 → **0** | 384 → **676** | 34 968 both ways |
| **real corpus** (`context-traversal-capture`) | 180 | 94 (**52.2%**) | 31 (**17.2%**) | — | 524 → **911** | 30 481 both ways |

The third row is **new**: PR #1382's real-corpus island delegates to this compositor and inherited
the defect, and it had never been measured on its own geometry. (#1383's "healthy" row is the
FIXTURE driven all-healthy, which is a different island.) It is measured with the story's **own**
contract counts and its **own** UAT criteria, at the instrument's scatter seed.

The signed prediction that made the attribution trustworthy still holds when the old key is
reinstated: above the cell centroid **78.3%** deliver nothing, below it **3.8%**.

### `caps` authority — the walls (PR #1381's incidental finding, applied)

`compose_land(caps=...)` recoloured the CELLS from its argument while `C.boundary_walls` read the
module global `C.CAPS`. An island driven all-`healthy` through the argument alone kept its ORIGINAL
statuses' walls, at exit 0, with nothing to see.

`caps` is now authoritative on **every** path that reads capability status. Measured on the island
BODY, through `caps=` alone:

| | charcoal `unhealthy` **wall** px | `unhealthy` **cell** px |
|---|---:|---:|
| argument not authoritative (the defect) | **904** | 0 |
| **as shipped** | **0** | 0 |
| one genuinely `unhealthy` capability (the guard made to FIRE) | **904** | 3 391 |

The wall token and the cell tokens of `unhealthy` share **no** delivered colour at any shade level
the pipeline emits, which is checked in the same run — so a wall count is a count of walls.

**The health read this under-counted, restated.** `grass-report.json`'s `healthRead` — *"driving the
whole island to each status changes 21 066 delivered px = 60.2%"* — was a cells-only recolour. With
the walls following the argument it is **27 475 px = 78.6%**: an under-count of **6 409 delivered
px, 18.4 percentage points**.

### One thing that is NOT the walls defect, reported rather than hidden

92 px of the **silhouette rim** snap to an `unhealthy` palette entry on an all-healthy island. That
is the closed-palette snap of the island OUTLINE against the dark board, carried by no capability,
and `C.back_half` authorises it in its own docstring (the rim darkens from the local colour and
re-snaps, so *"a tint assertion has to be made on the cell BODIES"*). Every assertion above is
therefore made on the body, with the rim counted separately rather than dropped.

---

## 2. Two switches, and why there is no fourth compositor

Each defect can be reintroduced for the duration of one composite:
`compose_core.DECOR_SORTS_AFTER_ITS_CELL` and
`compose_core.CAPS_ARGUMENT_IS_AUTHORITATIVE_FOR_WALLS`. Both default `True`, both are set inside a
`try/finally`, and `verify.py` asserts both are back at `True` before it exits.

That is deliberate. A guard that cannot reintroduce the defect it guards against reports zero for
free — the arc has already been burned once by a check that consulted the palette it was checking.
The alternative is a **fourth** copy of a ~700-line compositor carrying the old rules, which is
exactly what this track has been told not to create. **Three copies exist today**
(`chapter2-land-interior-fork-2026-08-15/compose.py`, `compose_core.py`, and
`chapter2-island-place-dressing-2026-08-16/compose_dressed.py`), plus `attribute.py`'s mirror which
is held byte-identical on every run. Nothing detects the fork.

`attribute.py:130` **calls** `D.decor_depth_key` and rebinds `C.CAPS` the same way rather than
restating either rule, because `assert_mirror` compares its canvas to `compose_land`'s byte for
byte and a second implementation is a second thing that can drift.

---

## 3. Committed provenance this edit invalidated — established BEFORE editing, re-rendered here

Editing `compose_core.py` **moves no recorded digest**. `provenance.write_sidecar` records the
producer's own file digest and each input directory's Blender `codeState`; the compositor is a
silent, unrecorded dependency of every sidecar below. So the invalidation is not a digest mismatch
the instrument would catch — it is that the committed **pixels** stop being what the code produces,
with every sidecar still declaring itself current. (Related, and not this increment's:
`render-sample-count-is-recoverable-from-provenance`.)

| pass | producer | verdict | action |
|---|---|---|---|
| `chapter2-grass-reads-as-signal-2026-08-16` | `compose_grass.py` | **invalidated** — decor on every panel, and the health read passes `caps=` | re-rendered: 6 PNGs + `grass-report.json` |
| ” | `verify.py`, `verify_refusal.py` | re-run | **19/19**, **7/7** |
| `chapter2-grass-defects-2026-08-16` | `diagnose.py`, `picture.py` | **invalidated** — decor | re-rendered: 2 PNGs + `diagnose-report.json`, 3 guards fired |
| `chapter2-grass-delivery-loss-2026-08-17` | `delivery.py`, `picture.py` | **invalidated** — it measured the defect | re-rendered: 1 PNG + `delivery-report.json`, 4 guards fired |
| `chapter2-healthy-island-2026-08-16` | `compose_healthy.py`, `verify.py` | **partly invalidated** — only `island-detail-6x.png` carries decor | re-rendered; other 4 PNGs byte-identical; **47/47** |
| `chapter2-one-surface-and-shadow-2026-08-17` | `compose_shadow.py` | **NOT invalidated** — calls `compose_land([])` with no decor and no `caps=` | re-ran to prove it: every PNG byte-identical |
| `chapter2-island-place-dressing-2026-08-16` | `compose_dressed.py` | **NOT invalidated** — its own copy of the draw list, which does not import `compose_core` | untouched — see the gap below |

### A provenance instrument finding, found while establishing that list

`provenance.producer.sha256` is **not reproducible across checkouts**. Re-running the untouched
`compose_shadow.py` rewrote its sidecars with a different producer digest: the committed value is
the **CRLF** hash of a file this repo stores **LF** (`.gitattributes` sets `eol=lf`). The digest
therefore records the working-copy line endings of whoever rendered, not the source. That churn was
reverted here rather than committed. It belongs with the sibling provenance increment; it is
reported, not fixed.

---

## 4. What this does NOT change — the record, corrected

★ **The shipped app does not have this defect, and both surfaces are now CHECKED, not assumed.**

- **SVG (`packages/forest-world`)** — `buildScene` emits `ground-mesh` as one layer and all flora in
  a later `flora-layer`. The layer ORDER is test-enforced
  (`scene.test.ts`: `['empties-layer','coast-layer','ground-mesh','trails-layer','flora-layer','hits-layer']`),
  so no flora drawable can sort ahead of the ground it stands on.
- **`packages/forest-world-r3f`** — PR #1383's open caveat, now **closed**. It is a
  react-three-fiber `<Canvas>`: a depth-buffered 3D scene where occlusion is resolved per fragment
  by z, so there is **no draw-list sort to get wrong**. No `renderOrder`, `depthWrite`, `depthTest`
  or `sortObjects` appears anywhere in it, and it carries no flora layer yet (it is the
  placeholder-mesh spike).

The rule to carry **if** the raster pipeline is ever promoted into app code: *a drawable that STANDS
ON a surface sorts after that surface, never on its own ground point alone.*

★ **No ADR change is required.** ADR-0226 D2's `grassCount` survives delivery at 93% on the fixture
once the order is right. Nothing routes to the vocabulary question on this basis, and nothing routes
to story-author.

⚠ **The SIZE finding is untouched and stays open.** Median **3** delivered px per surviving
placement, before AND after, on both fixture rows. Fixing the order does not make a tuft bigger.

---

## 5. Proof — every guard, and where each one can fail

```text
== inherited from PR #1383, all four made to FIRE on every --fire run ==
   a footprint blit displaced by 7px is caught          REFUSED
   a 60-unit grass well is counted as a cull            36 culled
   sinking every placement 40 units below its cell      94 of 112 OCCLUDED
   a single placement alone still competes with land    delivered, 2 px

== the reordering is a reordering ==
   assert_projection_unchanged   held to every placement's INTEGER supersampled blit origin, not to
                                 float bit-identity — the first version fired on 1e-13 of float
                                 reassociation. Kept ARMED now that the repair lives in the
                                 compositor by `assert_data_route_agrees`: the old down-field data
                                 transform and the shipped depth key must deliver byte-identical
                                 rasters, and the run refuses if they do not.
   the island's delivered area   byte-stable on all three geometries (34 968 / 34 968 / 30 481)

== this pass's own ==
   the caps guard fires BOTH ways        0 px on all-healthy; 904 wall px when a capability really is
   the wall/cell colour sets are disjoint  so a wall count cannot be a cell count in disguise
   a placement naming a cell this composite was not handed is REFUSED (the new bounds check)
   determinism   re-composing reproduces the DECODED raster exactly — compared as arrays, never as
                 file bytes (0 of 22 files matched by bytes across two pixel-identical runs)
   the fence     every path in the working tree is under docs/research/**
```

---

## 6. The guard is **NOT** wired to a `check:*` rung — stated plainly (PR #1383's gap 2)

The regression guard is `verify.py`. It is **not** wired, and will not be until the track comes out
from behind the fence. Two structural reasons, neither of them an omission:

1. Wiring it means editing `package.json` and `packages/cli/src/gate-order.ts` — **outside
   `docs/research/**`**, and therefore outside the owner's 2026-08-16 directive for this track.
2. It costs ~6 min of numpy compositing and needs a Python toolchain the gate does not otherwise
   require. Because `docs/**` is a root path in the affected-scope classifier (which fails wide),
   **every** branch would pay it.

**What would wire it:** a `check:research-compositor` script running `verify.py` and asserting its
exit code, added to the gate plan. **The assertion it would carry:** on the shipped piece set at
most **10%** of placements may deliver zero px and at most **8** may be occluded by the fill of
their own cell; and an all-healthy island composed through `caps=` alone carries **zero**
`unhealthy` px in its body. Reintroducing either defect moves those by an order of magnitude on the
first run.

---

## 7. Honest gaps

1. **The real-corpus island's residual loss is 17.2%, not 7.1%.** The fix recovers two thirds of its
   loss (52.2% → 17.2%) but leaves more than twice the fixture's residual. This pass does not
   attribute the difference. The two islands are not the same shape — the fixture is **214 cells /
   10 capabilities** carrying 112 placements, the real one **162 cells / 11 capabilities** carrying
   180 — so the real island packs more decor onto fewer, smaller cells, and the residual classes are
   out-voted / co-credited (the raster's own quantisation floor) rather than occluded-by-own-cell.
   That points at the SIZE question, not at a second ordering bug, but it is a hypothesis and not a
   measurement. Nobody should quote 7.1% as the track's delivery rate: **the real surface is at
   17.2%.**
2. **`compose_dressed.py:253` still carries the old key.** It is a fourth site with its own copy of
   the draw list, not named in either increment, and fixing it would invalidate a third pass's
   committed evidence for no measurement this pass needs. It is a known, unfixed instance of the
   same defect.
3. **Two of the grass-defects pass's negative findings are no longer zero**, because they were
   negative over a raster missing 46% of its placements: "colours bleeding through" is now
   **6 px** (was 0) and decor below the grass luma floor is now **3 px** (was 0), all six from two
   `wilt` pieces. Both are still tiny and "black grass" is still NOT confirmed — 0 decor px in the
   black band, minimum decor luma 68.4 against land's darkest at 40.9, and the 936 px of black on
   the island is `unhealthy` WALL, unchanged. But a negative finding measured on an incomplete
   raster is a weaker object than it read as, and that is worth saying out loud.
4. **`require_one_code_state` still groups by source digest alone**, so it cannot flag a mixed set
   on any other axis — including the one this pass exercised, where the compositor moved and no
   recorded digest did. Sibling increment.
