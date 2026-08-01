"""
normalize.py — author-time crop + anchor normalisation and MEASUREMENT.

For each raw model return:
  * find the alpha bbox and the ROOT CONTACT (bottom-most alpha row; its x-span centre)
  * translate on the fixed 192x192 canvas so the contact row lands on ANCHOR_Y and the
    contact centre on ANCHOR_X (the round-1 registration, 96,188)
  * report the PRE-normalisation contact (how far the model moved the root on its own)
    and the POST-normalisation residual (what actually ships)
  * report 8-connected alpha component counts: >1 component == a detached crown

usage: normalize.py <outdir> <raw...>
"""
import json
import os
import sys
from collections import deque
from PIL import Image

ALPHA_T = 32
ANCHOR_X, ANCHOR_Y = 96, 188
CANVAS = 192


CONTACT_BAND = 10
SPECK_MAX = 12


def despeck(im, maxsz):
    """Erase alpha components smaller than maxsz px (stray model flecks). Returns the
    number of pixels erased -- reported, never silently swallowed."""
    w, h = im.size
    a = im.getchannel('A').load()
    px = im.load()
    m = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            if a[x, y] >= ALPHA_T:
                m[y * w + x] = 1
    seen = bytearray(w * h)
    erased = 0
    for s0 in range(w * h):
        if m[s0] and not seen[s0]:
            q = deque([s0]); seen[s0] = 1; comp = [s0]
            while q:
                p0 = q.popleft(); y, x = divmod(p0, w)
                for dy in (-1, 0, 1):
                    yy = y + dy
                    if yy < 0 or yy >= h:
                        continue
                    for dx in (-1, 0, 1):
                        xx = x + dx
                        if 0 <= xx < w:
                            k = yy * w + xx
                            if m[k] and not seen[k]:
                                seen[k] = 1; q.append(k); comp.append(k)
            if len(comp) < maxsz:
                for p0 in comp:
                    y, x = divmod(p0, w)
                    px[x, y] = (0, 0, 0, 0)
                erased += len(comp)
    return erased


def contact(im):
    """Contact row  = the bottom-most alpha row.
    Contact centre = the alpha-WEIGHTED x-centroid over the bottom CONTACT_BAND rows.
    The span midpoint of the single bottom row was tried first and rejected: one stray
    root spur swings it 25-30 px, which shows up as a horizontal snap between frames."""
    w, h = im.size
    a = im.getchannel("A").load()
    rows = [y for y in range(h) if any(a[x, y] >= ALPHA_T for x in range(w))]
    if not rows:
        return None
    yb = max(rows)
    sx = n = 0
    for y in range(max(0, yb - CONTACT_BAND + 1), yb + 1):
        for x in range(w):
            if a[x, y] >= ALPHA_T:
                sx += x
                n += 1
    xs = [x for x in range(w) if a[x, yb] >= ALPHA_T]
    return yb, min(xs), max(xs), sx / n


def comps(im):
    w, h = im.size
    a = im.getchannel("A").load()
    m = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            if a[x, y] >= ALPHA_T:
                m[y * w + x] = 1
    seen = bytearray(w * h)
    sizes = []
    for s in range(w * h):
        if m[s] and not seen[s]:
            q = deque([s]); seen[s] = 1; n = 0
            while q:
                p = q.popleft(); n += 1
                y, x = divmod(p, w)
                for dy in (-1, 0, 1):
                    yy = y + dy
                    if yy < 0 or yy >= h:
                        continue
                    for dx in (-1, 0, 1):
                        xx = x + dx
                        if 0 <= xx < w:
                            k = yy * w + xx
                            if m[k] and not seen[k]:
                                seen[k] = 1; q.append(k)
            sizes.append(n)
    sizes.sort(reverse=True)
    return sizes


def main():
    outdir = sys.argv[1]
    paths = sys.argv[2:]
    os.makedirs(outdir, exist_ok=True)
    rows = []
    total_bytes = 0
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGBA")
        # despeckle BEFORE measuring: a 2 px fleck below the roots was the bottom-most
        # alpha row on frame 02 and dragged the contact row 1 px down.
        speck = despeck(im, SPECK_MAX)
        pre = contact(im)
        dx = int(round(ANCHOR_X - pre[3]))
        dy = ANCHOR_Y - pre[0]
        out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
        out.paste(im, (dx, dy), im)
        post = contact(out)
        bb = out.getchannel("A").getbbox()
        cs = comps(out)
        fp = "%s/frame-%02d.png" % (outdir, i)
        out.save(fp, optimize=True)
        nb = os.path.getsize(fp)
        total_bytes += nb
        rows.append({
            "frame": i, "source": os.path.basename(p),
            "pre_contact_row": pre[0], "pre_contact_centre_x": pre[3],
            "shift_px": [dx, dy],
            "contact_row": post[0], "contact_centre_x": post[3],
            "contact_span": [post[1], post[2]],
            "drift_x_px": round(post[3] - ANCHOR_X, 1),
            "drift_y_px": post[0] - ANCHOR_Y,
            "alpha_bbox": list(bb), "alpha_px": sum(cs),
            "components": len(cs), "component_sizes": cs[:6], "despeckled_px": speck,
            "encoded_bytes": nb,
        })
        print("f%02d pre=(row %d, cx %.1f) shift=(%+d,%+d) -> contact row %d cx %.1f "
              "drift=(%+.1f,%+d) bbox=%s alpha=%d comps=%d %s bytes=%d"
              % (i, pre[0], pre[3], dx, dy, post[0], post[3],
                 post[3] - ANCHOR_X, post[0] - ANCHOR_Y, bb, sum(cs), len(cs), cs[:4], nb))
        if speck:
            print("     despeckled %d px of stray flecks (< %d px components)" % (speck, SPECK_MAX))
    mx = max(abs(r["drift_x_px"]) for r in rows)
    my = max(abs(r["drift_y_px"]) for r in rows)
    print("MAX |drift_x| = %.1f px   MAX |drift_y| = %d px   total encoded = %d bytes"
          % (mx, my, total_bytes))
    json.dump({"anchor": [ANCHOR_X, ANCHOR_Y], "canvas": [CANVAS, CANVAS],
               "alpha_threshold": ALPHA_T, "max_abs_drift_x_px": mx,
               "max_abs_drift_y_px": my, "total_encoded_bytes": total_bytes,
               "frames": rows}, open("work/registration.json", "w"), indent=2)


main()
