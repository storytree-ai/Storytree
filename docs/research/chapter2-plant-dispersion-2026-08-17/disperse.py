#!/usr/bin/env python3
"""THE POSITIONER LANDED IN `scatter.py` — this module is now a NAMED ALIAS, not a second copy.

    PR #1388 (this pass) diagnosed the CRC32 affine collapse and built the fix HERE, in its own
    lane copy, deliberately leaving `scatter.py` untouched so the before/after comparison had a
    stable "before" to measure against. That left every committed composite on the arc still
    carrying the defect, which is what the increment
    `crc32-dispersion-fix-propagated-and-evidence-rerendered` existed to close.

    IT IS CLOSED. The avalanche hash, the area-weighted cell choice, the best-candidate blue noise
    and the tree-well scoring rule now live in
    `chapter2-grass-reads-as-signal-2026-08-16/scatter.py` as the DEFAULT positioner, and every
    compositor on this arc reaches them by calling `scatter_island` exactly as it always did.

WHY THIS FILE STILL EXISTS, given the whole point was to stop having two copies. Two reasons, and
neither is sentiment:

  * this pass's committed evidence (`plants-dispersed.png`, `dispersion-report.json`,
    `verify-refusal-report.json`) names `disperse.scatter_dispersed`, and its README reasons about
    it by that name. Renaming the entry point would invalidate prose that is otherwise still true.
  * `verify.py` and `verify_refusal.py` here ARE the dispersion floor. They must keep running, and
    they must run against the SHIPPED positioner rather than a private one — which is exactly what
    they now do, because every name below is the shipped object itself.

THERE IS NO SECOND IMPLEMENTATION. Every name is bound to `scatter`'s own object, so a divergence
is not merely discouraged, it is unrepresentable: `scatter_dispersed is scatter.scatter_island` is
asserted in `verify.py`. The narrative that used to live in this docstring — the affine-CRC32
diagnosis, why moving the axis token to the front does not work, why bending determinism for the
best-candidate choice does not break it, and the cross-parcel gap — moved with the code and is the
module docstring of `scatter.py`.

THE "BEFORE" SIDE IS STILL REACHABLE, and that matters more than it sounds: `scatter.LEGACY_AFFINE`
reproduces the pre-fix placement bit-for-bit, so `verify_refusal.py` P1 still feeds the floor the
REAL shipped defect rather than an invented one, and this pass's before/after picture can still be
regenerated from source.
"""
import importlib.util
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
#: The ONE copy of the positioner and the count rules. Imported, never transcribed.
SCATTER_PATH = os.path.join(REPO, "docs", "research",
                            "chapter2-grass-reads-as-signal-2026-08-16", "scatter.py")


def _load_scatter():
    spec = importlib.util.spec_from_file_location("_grass_scatter", SCATTER_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


S = _load_scatter()

#: Every name below is `scatter`'s own object. Rebinding one here changes nothing inside
#: `scatter_island`, which resolves its helpers in ITS module globals — so a perturbation harness
#: must patch `S.<name>`, never `disperse.<name>`. `verify_refusal.py` does exactly that.
#: The legacy positioner is deliberately NOT re-exported here. A caller that wants the pre-fix
#: placement must reach for `disperse.S.LEGACY_AFFINE` and say so out loud — `verify.py` rung 10
#: holds a named allowlist of every file permitted to, so an alias on the convenient module would
#: be a second, unlisted door to exactly the defect this pass closed.
CANDIDATES = S.CANDIDATES
SPREAD = S.SPREAD
_fmix32 = S._fmix32
_hash = S._hash
_u = S._u
_uv = S._uv
_area = S._area
_prefix_areas = S._prefix_areas
_pick_by_area = S._pick_by_area
_candidate = S._candidate
_counts = S.counts_for

#: The dispersed positioner, under the name this pass's evidence and README use for it.
scatter_dispersed = S.scatter_island
