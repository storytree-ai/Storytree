"""Compose a model return into a ladder rung, with a HARD FREEZE and a TONE-MATCHED palette snap.

1. HARD FREEZE — the model's output is accepted only inside the mask AND only where the rung
   was empty. Every retained pixel stays byte-identical to the mature pose no matter what the
   model returned; the vendor's "outside the mask is preserved" promise is enforced, not trusted.

2. TONE-MATCHED PALETTE SNAP — the first attempt snapped each generated pixel to its nearest
   colour in the mature palette. Measured result: the model draws young foliage much lighter
   than the mature crown, so nearest-colour kept it light and the ladder popped in tone at the
   rung where generated foliage met ablated foliage (reject cc089370). This maps the generated
   region's LUMA RANKING onto the mature crown's own luma DISTRIBUTION instead: shading
   structure is preserved, tonal statistics become the mature tree's by construction.
"""
import sys
import numpy as np
from PIL import Image

LUMA = np.array([0.299, 0.587, 0.114])


def palettes(mature_png, alpha_t=8):
    a = np.array(Image.open(mature_png).convert("RGBA"))
    m = a[:, :, 3] >= alpha_t
    px = a[:, :, :3][m].astype(int)
    g, r, b = px[:, 1], px[:, 0], px[:, 2]
    green = (g > r + 8) & (g > b + 8)
    return px[green], px[~green]


def tone_match(src_rgb, ref_px):
    """Rank-match src luma onto the reference population's luma, emitting reference COLOURS."""
    if len(src_rgb) == 0:
        return src_rgb
    ref_l = (ref_px * LUMA).sum(axis=1)
    order = np.argsort(ref_l, kind="stable")
    ref_sorted = ref_px[order]
    src_l = (src_rgb * LUMA).sum(axis=1)
    rank = np.argsort(np.argsort(src_l, kind="stable"), kind="stable")
    q = rank / max(len(src_rgb) - 1, 1)
    idx = np.clip((q * (len(ref_sorted) - 1)).round().astype(int), 0, len(ref_sorted) - 1)
    return ref_sorted[idx]


def compose(rung_png, model_png, mask_png, mature_png, out_png, alpha_t=8):
    base = np.array(Image.open(rung_png).convert("RGBA"))
    new = np.array(Image.open(model_png).convert("RGBA"))
    mask = np.array(Image.open(mask_png).convert("L")) >= 128
    pal_leaf, pal_wood = palettes(mature_png)
    keep = base[:, :, 3] >= alpha_t
    accept = mask & ~keep & (new[:, :, 3] >= alpha_t)
    out = base.copy()
    px = new[:, :, :3][accept].astype(int)
    added_leaf = added_wood = 0
    if len(px):
        g, r, b = px[:, 1], px[:, 0], px[:, 2]
        isleaf = (g > r + 6) & (g > b + 6)
        res = np.zeros_like(px)
        if isleaf.any():
            res[isleaf] = tone_match(px[isleaf], pal_leaf)
            added_leaf = int(isleaf.sum())
        if (~isleaf).any():
            res[~isleaf] = tone_match(px[~isleaf], pal_wood)
            added_wood = int((~isleaf).sum())
        out[:, :, :3][accept] = res.astype(np.uint8)
        out[:, :, 3][accept] = 255
    t = out[:, :, 3] < alpha_t
    out[:, :, 3][t] = 0
    out[:, :, :3][t] = 0
    Image.fromarray(out, "RGBA").save(out_png)
    mature = np.array(Image.open(mature_png).convert("RGBA"))
    mpal = set(map(tuple, mature[:, :, :3][mature[:, :, 3] >= alpha_t].reshape(-1, 3)))
    opq = out[:, :, 3] >= alpha_t
    newcols = set(map(tuple, out[:, :, :3][opq].reshape(-1, 3))) - mpal
    frozen_changed = int((base[keep] != out[keep]).any(axis=1).sum())
    return {
        "added_px": int(accept.sum()),
        "added_leaf": added_leaf,
        "added_wood": added_wood,
        "model_px_rejected_outside_mask": int(((new[:, :, 3] >= alpha_t) & ~(mask & ~keep)).sum()),
        "frozen_pixels_changed": frozen_changed,
        "colours_not_in_mature_palette": len(newcols),
    }


if __name__ == "__main__":
    print(compose(*sys.argv[1:6]))
