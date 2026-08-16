#!/usr/bin/env python3
"""THE SEAM CONTROL — the one variable this pass moves, and the accounting that makes it honest.

The owner said, of the island: *"maybe remove the hex lines, first, feels noisy, also can we just
stick with green for these experiments"*. That phrase does not distinguish the island's TWO grids —
the 17 claimed hex TILES and the 214 relaxed interior MESH CELLS — and the two are not
interchangeable, because ADR-0367 D5's per-capability status tint rides on the cells.

So before anything is deleted, this module answers the mechanical question: WHICH grid actually puts
lines on the delivered raster? It answers by TOTAL ACCOUNTING rather than by looking, and that
distinction is the whole point of the file.

HOW THE ACCOUNTING WORKS
------------------------
`compose.py`'s `fill_polygon(canvas, alpha, poly_px, rgb, seam_rgb=None)` is the ONLY thing in the
compositor that strokes a line: when `seam_rgb` is not None it draws the polygon's own ring at
`width = max(1, round(0.7 * SS))`. Every line on the island therefore passes through this one
function, and a wrapper around it sees all of them.

The wrapper does not guess what each stroked polygon IS. It matches the ring against a set of
EXPECTED rings recomputed from the island's own geometry:

  * the coast ring,
  * the 214 mesh-cell rings, each at the height `C.height_of` will draw it at,
  * the 17 HEX rings, registered at every height a cell is drawn at plus ground zero.

A stroke that matches none of the three is `other`, and `other` is a REFUSAL rather than a bucket —
an unclassified line would mean the inventory is incomplete and every count downstream is a floor
rather than a total. Because the accounting is total, "no hex tile is stroked" is not an eyeball
verdict or a shape heuristic that might have missed one: it is what is left when every stroke on the
canvas has been matched to a cell or the coast.

The hex rings are registered as a REAL detector, not a stub, precisely so the negative result means
something. `verify_refusal.py` feeds it a synthetic hex polygon and shows it fires and is
suppressible — a detector only ever observed finding nothing is indistinguishable from one that is
not wired up, which is the same trap the prior pass's `verify_refusal.py` was built for.

THE ANGLE IS A NAMED PARAMETER, INHERITED AND NEVER RESTATED
------------------------------------------------------------
This pass composes at `grass.PASS_ELEVATION_DEG` (50 degrees, the owner's signed research angle),
imported from the prior pass rather than written down again here. `LAND_CAMERA_ELEVATION_DEG` in
`packages/forest-world/src/camera.ts` is the app's shipped constant, is still 20, and is NOT touched
by this pass — it is `frontend-visual-judgment-arc`'s live dogfood fixture (owner, 2026-08-15).
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

#: The four seam classes this pass can address. `other` exists to be REFUSED, never rendered.
CLASSES = ("coast", "cell", "hex", "other")

#: The delivered fork, one variable at a time. Each entry is the set of seam classes left DRAWN.
#: `as-is` and `hex-off` are expected to be pixel-identical, and `cells-off` and `both-off` likewise
#: — that expected identity IS the finding, and `compose_lines.py` asserts it on the decoded raster
#: rather than stating it. A panel is never faked: all four are composed independently.
PANELS = (
    ("as-is", {"coast", "cell", "hex"}, "the island exactly as it ships"),
    ("hex-off", {"coast", "cell"}, "hex-tile seams removed"),
    ("cells-off", {"coast", "hex"}, "interior-cell seams removed"),
    ("both-off", {"coast"}, "both removed"),
)

#: A fifth composite, outside the owner's four, because the coast seam is the OTHER thing in the
#: island that is literally a stroked line and the brief's phrase does not exclude it. Rendered so
#: the owner can see what "all the lines" would mean, and reported separately so it cannot be
#: mistaken for one of the four.
COAST_OFF = ("all-off", set(), "every seam removed, coast edge included")


def _ring(poly_px, nd=2):
    """A ring's identity, rotation- and direction-INSENSITIVE.

    `fill_polygon` receives whatever vertex order the caller assembled, so matching on the raw list
    would miss a ring that is the same closed shape entered at a different vertex. Rounding to `nd`
    decimals absorbs float noise from the projection without merging genuinely distinct rings: the
    island's closest distinct vertices are far more than 0.01px apart at supersampled scale.
    """
    pts = [(round(float(x), nd), round(float(y), nd)) for x, y in poly_px]
    if len(pts) < 3:
        return ("degenerate", tuple(pts))
    # canonical rotation: start at the lexicographically smallest vertex, and pick the direction
    # whose successor is smaller, so a ring and its reverse hash identically.
    n = len(pts)
    i = min(range(n), key=lambda k: pts[k])
    fwd = tuple(pts[(i + k) % n] for k in range(n))
    bwd = tuple(pts[(i - k) % n] for k in range(n))
    return min(fwd, bwd)


class SeamControl:
    """Wraps `C.fill_polygon` to (a) inventory every stroked ring and (b) suppress chosen classes.

    Suppression is done by dropping `seam_rgb` to None on the way through — the polygon's FILL is
    untouched, so a suppressed panel differs from the baseline in the seam pixels and in nothing
    else. That is what makes the fork one variable: no cell moves, no colour is re-authored, no
    geometry is re-emitted.
    """

    def __init__(self, C, island, hex_lattice):
        self.C = C
        self._real = C.fill_polygon
        self.expected = {}
        self.drawn = set(CLASSES) - {"other"}
        self.log = []
        self._build_expected(island, hex_lattice)

    # ------------------------------------------------------------------ expected rings
    def _build_expected(self, island, hex_lattice):
        C = self.C
        SS = C.SS

        def px(poly, height):
            return [(C.project(gx, gy, height)[0] * SS, C.project(gx, gy, height)[1] * SS)
                    for gx, gy in poly]

        self.expected[_ring(px(C.COAST, 0.0))] = "coast"

        cells = island["variantB"]["cells"]
        heights = set()
        for c in cells:
            h = C.height_of(c, "cell")
            heights.add(round(float(h), 6))
            self.expected[_ring(px(c["poly"], h))] = "cell"

        # THE DETECTOR. A hex tile is not in the draw list, so there is no height to read off it;
        # registering every height a cell is drawn at (plus ground zero) means a hex stroked at any
        # elevation the compositor actually uses would be caught rather than falling through to
        # `other`. Registered second so a genuine cell ring is never relabelled as a hex.
        self.hex_rings = 0
        for t in hex_lattice["tiles"]:
            for h in sorted(heights | {0.0}):
                r = _ring(px(t["poly"], h))
                if r not in self.expected:
                    self.expected[r] = "hex"
                    self.hex_rings += 1

    # ------------------------------------------------------------------ the wrapper
    def classify(self, poly_px):
        return self.expected.get(_ring(poly_px), "other")

    def fill_polygon(self, canvas, alpha, poly_px, rgb, seam_rgb=None):
        if seam_rgb is None:
            # An unstroked fill draws no line and is not this pass's subject. Passed straight
            # through and NOT logged as a stroke, so the stroke inventory stays a stroke inventory.
            return self._real(canvas, alpha, poly_px, rgb, None)
        cls = self.classify(poly_px)
        self.log.append(cls)
        if cls not in self.drawn:
            seam_rgb = None
        return self._real(canvas, alpha, poly_px, rgb, seam_rgb)

    # ------------------------------------------------------------------ lifecycle
    def install(self):
        self.C.fill_polygon = self.fill_polygon
        return self

    def restore(self):
        self.C.fill_polygon = self._real

    def reset(self, drawn):
        self.log = []
        self.drawn = set(drawn)
        return self

    def inventory(self):
        return {c: self.log.count(c) for c in CLASSES}


def load_hex_lattice():
    """The lattice emitted by `emit_hexlines.ts` from the app's own `hexCorners`."""
    path = os.path.join(HERE, "hex-lattice.json")
    if not os.path.exists(path):
        raise SystemExit(
            "hex-lattice.json is missing — run:\n"
            "  npx tsx docs/research/chapter2-hex-lines-and-flat-green-2026-08-16/emit_hexlines.ts")
    with open(path) as fh:
        return json.load(fh)
