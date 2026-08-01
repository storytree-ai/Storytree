"""Build the crown-dome inpaint masks for the young rungs, minus the retained body.

Subtracting the retained silhouette is what makes the freeze structural: the model is only ever
shown empty canvas to fill, so no pixel of the mature tree can be repainted.
"""
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, "work")
from ablate import load_mask, dilate
from domemask import dome, save_mask

# stage -> (rx, ry, dy)
DOMES = {
    0: (17, 13, -6),
    1: (24, 17, -5),
    2: (33, 23, -1),
    3: (46, 30, 4),
}


def build(stage, outdir="work"):
    rx, ry, dy = DOMES[stage]
    src = f"work/ablated/ablated-{stage:02d}.png"
    im, k, env, c = dome(src, rx, ry, dy)
    env = env & ~k
    p = save_mask(env, f"{outdir}/dome-{stage:02d}.png")
    ys = np.where(env.any(axis=1))[0]
    xs = np.where(env.any(axis=0))[0]
    return p, dict(stage=stage, rx=rx, ry=ry, dy=dy, centre=c, px=int(env.sum()),
                   rows=[int(ys.min()), int(ys.max())], cols=[int(xs.min()), int(xs.max())])


if __name__ == "__main__":
    vis = []
    for s in [int(x) for x in sys.argv[1:]] or list(DOMES):
        p, info = build(s)
        print(info)
        a = np.array(Image.open(f"work/ablated/ablated-{s:02d}.png").convert("RGBA"))
        m = np.array(Image.open(p).convert("L")) > 128
        v = a.copy()
        v[m] = (255, 90, 90, 130)
        vp = f"work/dome-{s:02d}-vis.png"
        Image.fromarray(v, "RGBA").save(vp)
        vis.append(vp)
    sys.path.insert(0, "work")
    from imglib import sheet
    sheet(vis, len(vis), scale=2).save("work/dome-vis.png")
