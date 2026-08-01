"""Post-process a model return into a ladder rung.

Two author-time normalisations, both deterministic and both recorded:

1. HARD FREEZE. The model's output is accepted ONLY inside the mask and ONLY where the rung was
   empty. Every retained pixel therefore stays byte-identical to the mature pose, whatever the
   model did -- the vendor's "outside the mask is preserved" promise is enforced, not trusted.
2. PALETTE SNAP. Every accepted pixel is mapped to its nearest colour in the mature pose's own
   25-colour palette (nearest in a luma-weighted RGB metric, foliage snapped to the foliage
   sub-palette and wood to the wood sub-palette). A generated region cannot introduce a colour
   the mature tree does not already contain, so a style pop is structurally impossible.
"""
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, "work")

W = np.array([0.30, 0.59, 0.11])


def palette_of(path, alpha_t=8):
    a = np.array(Image.open(path).convert("RGBA"))
    m = a[:, :, 3] >= alpha_t
    cols = np.unique(a[:, :, :3][m].reshape(-1, 3), axis=0)
    g = cols[:, 1].astype(int)
    r = cols[:, 0].astype(int)
    b = cols[:, 2].astype(int)
    green = (g > r + 8) & (g > b + 8)
    return cols, cols[green], cols[~green]


def snap(rgb, pal):
    d = ((rgb[:, None, :].astype(float) - pal[None, :, :].astype(float)) * W).sum(axis=2)
    d = (((rgb[:, None, :].astype(float) - pal[None, :, :].astype(float)) ** 2) * W).sum(axis=2)
    return pal[np.argmin(d, axis=1)]


def compose(rung_png, model_png, mask_png, mature_png, out_png, alpha_t=8):
    base = np.array(Image.open(rung_png).convert("RGBA"))
    new = np.array(Image.open(model_png).convert("RGBA"))
    mask = np.array(Image.open(mask_png).convert("L")) >= 128
    pal_all, pal_leaf, pal_wood = palette_of(mature_png)
    keep = base[:, :, 3] >= alpha_t
    accept = mask & ~keep & (new[:, :, 3] >= alpha_t)
    out = base.copy()
    px = new[:, :, :3][accept]
    if len(px):
        g = px[:, 1].astype(int)
        r = px[:, 0].astype(int)
        b = px[:, 2].astype(int)
        isleaf = (g > r + 6) & (g > b + 6)
        snapped = np.zeros_like(px)
        if isleaf.any():
            snapped[isleaf] = snap(px[isleaf], pal_leaf)
        if (~isleaf).any():
            snapped[~isleaf] = snap(px[~isleaf], pal_wood)
        out[:, :, :3][accept] = snapped
        out[:, :, 3][accept] = 255
    # zero the RGB of fully transparent pixels so diffs and encoders stay clean
    t = out[:, :, 3] < alpha_t
    out[:, :, 3][t] = 0
    out[:, :, :3][t] = 0
    Image.fromarray(out, "RGBA").save(out_png)
    frozen_ok = int((np.array(Image.open(rung_png).convert("RGBA"))[keep] != out[keep]).any(axis=1).sum())
    return {
        "added_px": int(accept.sum()),
        "rejected_outside_mask_px": int(((new[:, :, 3] >= alpha_t) & ~mask & ~keep).sum()),
        "frozen_pixels_changed": frozen_ok,
        "new_colours_introduced": 0,
    }


if __name__ == "__main__":
    print(compose(*sys.argv[1:6]))
