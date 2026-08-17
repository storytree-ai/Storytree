#!/usr/bin/env python3
"""GROUND MICRO-RELIEF — high frequency carried by the LIGHT, never by the pigment.

The owner, 2026-08-17: *"This many shubs looks rather ugly, feels like there must be a way to do
something nicer in blender that has high frequency without looking off."*

THE ONE CONSTRAINT THAT PICKS THIS TECHNIQUE. High frequency assembled from MORE DISCRETE MARKS reads
as noise at this delivered scale. So the frequency has to come from something that is not object
count, and the ground itself is the only surface large enough to carry it. This module perturbs the
GROUND HEIGHT by a small, deterministic, band-limited field and shades it with the SAME key sun the
land pieces and the hero tree already share. Nothing here picks a colour: the delivered value is the
flat green token times a light multiplier, exactly as the shadow's is.

    relief = 1 - RELIEF_CAST * (1 - lambert / lambert_flat)

WHY IT IS A MULTIPLIER AND NOT A SECOND TOKEN. The owner rejected three hash-picked greens plus a tan
wheat subset as noise, and the flattening that removed them took the delivered luma range p2-p98 from
78.9 to 58.2. If relief re-entered as per-cell COLOUR it would rebuild precisely what was removed. It
enters as geometry, at the same seam the shadow does — multiplied into the supersampled canvas BEFORE
`back_half`, so it is quantised and palette-snapped with the land rather than pasted over it.

WHY IT ONLY DARKENS. `shadow.extended_palette` closes the palette by MULTIPLYING every delivered
colour by each authored light level, and the ADR-0367 D5 status guard is calibrated on darkening. A
relief term that also brightened would need palette entries above the token and would move pixels in
a direction the guard has never been measured against. So the reference is re-based: the facets
facing the sun sit at full light (the flat token, unchanged) and everything else darkens away from
it. The cost is that relief lowers MEAN luma, and that is measured and reported rather than hidden.

WHY THERE IS NO TERRACE-LIP TERM, WHICH THE INCREMENT ASKED FOR. A lip drawn at every cell-to-cell
join is the interior mesh seam the owner removed on 2026-08-16 at a cost of 1 892 delivered px,
wearing a shading model instead of a stroke. The only lips that are NOT that seam are the ones at a
genuine height STEP — and `shadow.JOIN_AO` already draws exactly those, driven by height excess and
identically zero across a flat join. Adding a second term over the same geometry would double-count
it. This is a decision, recorded, not an omission.

Runs under system Python with numpy. No Blender: relief is a shading field over ground the committed
pieces already describe.
"""
import math

import numpy as np

# =====================================================================================================
# 1. THE AUTHORED PARAMETERS — one decision each
# =====================================================================================================
#: The noise is BAND-LIMITED and the band is the whole decision. The island is ~246 ground units
#: across and delivers 258 px, so ground units and delivered pixels are within 5% of each other: a
#: wavelength in units is a wavelength in delivered pixels. Two octaves per option, the second at half
#: the wavelength and 40% of the amplitude.
#:
#: `coarse` — 14 / 7 units. Undulation the eye reads as ground.
#: `fine`   — 7 / 3.5 units. The highest frequency that still spans more than one delivered pixel per
#:            half-cycle. BELOW this the field is per-pixel noise, which is the thing being avoided,
#:            so it is the floor of the technique rather than a setting to keep turning.
BANDS = {
    "coarse": ((14.0, 1.00), (7.0, 0.40)),
    "fine": ((7.0, 1.00), (3.5, 0.40)),
}

#: Peak height perturbation in GROUND units, before the per-octave weights. The island's tallest
#: terrace step is 7.6 units, so 0.55 is 7.2% of one step — micro-relief by the arithmetic and not
#: only by the name. Raising it would start asserting terrain the mesh does not have.
RELIEF_AMPLITUDE = 0.55

#: How much the relief term is allowed to darken at its deepest, before the palette quantises it.
#: SIZED TO REACH ITS OWN RUNGS, the same discipline `shadow.TERRAIN_CAST` and friends follow: at the
#: relief ladder below the rung boundaries sit at 0.9775 and 0.9325, so a term that could not reach
#: 0.9325 would compose and then vanish in the snap.
RELIEF_CAST = 0.115

#: The relief ladder is SHALLOWER AND FINER than the shadow's, and that is the finding rather than a
#: preference. A shadow is one low-frequency gradient and can afford deep rungs (its deepest is 0.80);
#: relief is high-frequency and a rung that deep would deliver as dark speckle — the noise the owner
#: rejected, in luminance instead of hue. Two rungs, floor 0.90.
RELIEF_FLOOR = 0.90
RELIEF_STOPS = 2

#: The lattice seed. Fixed, so the relief is a property of the island rather than of the run.
RELIEF_SEED = 0x48465250      # "HFRP"

_M32 = 0xFFFFFFFF


# =====================================================================================================
# 2. THE NOISE — one avalanche-finalised hash, for the reason the dispersion pass had to find out
# =====================================================================================================
def _fmix32(h):
    """Murmur3's finaliser, vectorised. AVALANCHE IS THE WHOLE POINT AND IT IS NOT A STYLE CHOICE.

    `chapter2-plant-dispersion-2026-08-17` measured what a linear hash costs on this track: `scatter`
    drew a plant's x and y from two CRC32s over messages differing in one character, CRC32 is affine
    over GF(2), and every plant on the island ended up standing on its cell's bounding-box diagonal
    (corr +0.9997 against a null of 0). A relief field built the same way would put its ridges on one
    diagonal across the whole island — the identical failure, at a scale where it would read as a
    corduroy texture and be blamed on the technique.
    """
    h = h.astype(np.uint64) & _M32
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & _M32
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & _M32
    h ^= h >> 16
    return h


def _lattice(ix, iy, salt):
    """A 0..1 value at integer lattice point (ix, iy)."""
    h = ((ix.astype(np.int64) & _M32) * 0x1F1F1F1F) & _M32
    h ^= ((iy.astype(np.int64) & _M32) * 0x27D4EB2D) & _M32
    h ^= (RELIEF_SEED + salt * 0x9E3779B1) & _M32
    return _fmix32(h).astype(np.float32) / float(_M32)


def _smoothstep(t):
    return t * t * (3.0 - 2.0 * t)


def value_noise(gx, gy, wavelength, salt):
    """Smooth value noise on a square lattice of side `wavelength`, in 0..1, mean ~0.5.

    Bilinear with a smoothstep fade rather than gradient noise: the field only ever feeds a first
    derivative, and a C1 value field is enough for a shading normal while being one tenth of the code.
    """
    fx = gx / wavelength
    fy = gy / wavelength
    ix = np.floor(fx).astype(np.int64)
    iy = np.floor(fy).astype(np.int64)
    tx = _smoothstep(fx - ix)
    ty = _smoothstep(fy - iy)
    v00 = _lattice(ix, iy, salt)
    v10 = _lattice(ix + 1, iy, salt)
    v01 = _lattice(ix, iy + 1, salt)
    v11 = _lattice(ix + 1, iy + 1, salt)
    return ((v00 * (1 - tx) + v10 * tx) * (1 - ty)
            + (v01 * (1 - tx) + v11 * tx) * ty).astype(np.float32)


def height_field(gx, gy, band):
    """The relief height perturbation in GROUND units, centred on zero."""
    octaves = BANDS[band]
    total = np.zeros_like(gx, dtype=np.float32)
    norm = 0.0
    for k, (wl, w) in enumerate(octaves):
        total = total + w * (value_noise(gx, gy, wl, k) - 0.5) * 2.0
        norm += w
    return (total / norm) * RELIEF_AMPLITUDE


# =====================================================================================================
# 3. THE SHADING — Lambert against the key sun the rest of the scene already uses
# =====================================================================================================
def light_vector(SH, sin_flat):
    """The key sun as a 3-vector in GROUND space, derived from `shadow`'s own two constants.

    Re-derived from `shadow` rather than restated, so relief cannot end up lit from a different
    direction than the shadow beside it — which is the failure the shadow pass spent a whole section
    ruling out with two independent instruments.
    """
    toward, _falls = SH.light_ground_direction(sin_flat)
    el = math.radians(SH.KEY_ELEVATION_DEG)
    return (toward[0] * math.cos(el), toward[1] * math.cos(el), math.sin(el))


def multiplier(SH, C, cells, band, cast=None):
    """The delivered relief multiplier, one value per SUPERSAMPLED canvas pixel.

    Returns `(field, stats)`. `field` is 1.0 everywhere that is not a cell top face, so relief never
    reaches a wall (a wall is a vertical face and its normal is not the ground's), the coast sand, or
    the silhouette rim.

    The multiplier is CONTINUOUS. The rungs are not applied here and never should be: the palette
    closed over the relief ladder is what quantises it, at the same moment and by the same `snap` the
    land's own colours go through. A field pre-quantised here and then snapped again would be two
    quantisers in series, and the second would silently decide the first's rungs were wrong.
    """
    cast = RELIEF_CAST if cast is None else cast
    idx = SH.cell_index_raster(C, cells)
    heights = np.array([C.height_of(c, "cell") for c in cells], dtype=np.float32)
    hz = np.where(idx >= 0, heights[np.clip(idx, 0, len(cells) - 1)], 0.0)

    # Every land pixel's own ground point, recovered by inverting `project` at the height of the cell
    # that owns it — `shadow.build`'s inverse, reused so the two fields are sampled on one geometry.
    py, px = np.mgrid[0:C.CANVAS_H * C.SS, 0:C.CANVAS_W * C.SS]
    gxp = (px / C.SS - C.ORIGIN[0]).astype(np.float32)
    gyp = ((py / C.SS - C.ORIGIN[1] + hz * C.COS) / C.SIN).astype(np.float32)

    # The surface gradient, by central difference at half a ground unit. Differencing the ANALYTIC
    # field at the pixel's own ground point rather than differencing a rasterised copy keeps the
    # normal independent of the canvas resolution.
    d = 0.5
    zx = (height_field(gxp + d, gyp, band) - height_field(gxp - d, gyp, band)) / (2 * d)
    zy = (height_field(gxp, gyp + d, band) - height_field(gxp, gyp - d, band)) / (2 * d)

    lx, ly, lz = light_vector(SH, C.SIN)
    denom = np.sqrt(1.0 + zx * zx + zy * zy)
    lambert = (-zx * lx - zy * ly + lz) / denom

    # RE-BASED ON THE BRIGHTEST FACET, not on the flat plane. A relief field that darkened relative to
    # flat would darken the whole island by its own mean; re-basing keeps the sunlit facets on the
    # token the owner already approved and spends the range downward only.
    peak = float(np.max(lambert)) or 1.0
    rel = np.clip(lambert / peak, 0.0, 1.0)

    field = 1.0 - cast * (1.0 - rel)
    field = np.clip(field, RELIEF_FLOOR, 1.0).astype(np.float32)
    land = idx >= 0
    field = np.where(land, field, 1.0).astype(np.float32)

    stats = {
        "band": band,
        "wavelengthsGroundUnits": [wl for wl, _w in BANDS[band]],
        "amplitudeGroundUnits": RELIEF_AMPLITUDE,
        "cast": cast,
        "landSupersampledPx": int(np.count_nonzero(land)),
        "minMultiplier": round(float(field[land].min()), 4) if land.any() else 1.0,
        "meanMultiplier": round(float(field[land].mean()), 4) if land.any() else 1.0,
        "pctLandDarkenedOver1pct": round(100.0 * float(np.count_nonzero(field[land] < 0.99))
                                         / max(1, int(np.count_nonzero(land))), 2),
    }
    return field, stats
