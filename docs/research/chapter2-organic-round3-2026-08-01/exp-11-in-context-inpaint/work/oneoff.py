"""Two targeted one-off inpaint calls: the stage-4 re-roll and the dirt-path segment."""
import json, os, re, subprocess, sys, time
from PIL import Image, ImageDraw
import lib

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(os.path.dirname(HERE), "raw")
CLI = r"C:/Users/mickh/AppData/Local/Temp/claude/C--code-storytree/495dc188-faf3-4e1e-9dd0-6764531fd3a2/scratchpad/pixellab.mjs"


def cli(*a):
    p = subprocess.run(["node", CLI, *a], capture_output=True, text=True)
    return p.stdout + p.stderr


def go(label, image, mask, description, seed):
    args = {"description": description, "image_base64": lib.b64_png(image),
            "mask_image_base64": lib.b64_png(mask.convert("RGB")),
            "crop_to_mask": True, "seed": seed}
    af = os.path.join(HERE, f"args-{label}.json"); json.dump(args, open(af, "w"))
    mask.save(os.path.join(HERE, f"mask-{label}.png"))
    for _ in range(12):
        out = cli("call", "inpaint_image", af)
        m = re.search(r"job_id[\"' :=]+([0-9a-f-]{36})|^id: ([0-9a-f-]{36})", out, re.M)
        if m:
            job = m.group(1) or m.group(2); break
        if "rate limit" in out:
            time.sleep(25); continue
        print(label, "SUBMIT FAIL", out[:500]); return None
    else:
        print(label, "rate-limited out"); return None
    print(label, "JOB", job, flush=True)
    gf = os.path.join(HERE, f"get-{label}.json"); json.dump({"job_id": job}, open(gf, "w"))
    t0 = time.time()
    while time.time() - t0 < 480:
        out = cli("call", "get_image", gf, "--out", RAW, "--label", f"{label}-{job[:8]}")
        s = re.findall(r"^SAVED (.+)$", out, re.M)
        if s:
            print(label, "OK", s[0], flush=True); return job, s[0]
        if "status: failed" in out or re.search(r"^error:", out, re.M):
            print(label, "FAIL", out[:400]); return None
        time.sleep(8)
    print(label, "TIMEOUT"); return None


def stage4():
    base = Image.open(os.path.join(HERE, "base-crop.png")).convert("RGBA")
    running = Image.open(os.path.join(HERE, "comp-03.png")).convert("RGBA")
    # feed back a CLEAN running plate: untouched crop + only the extracted stage-3 tree
    clean = base.copy(); clean.alpha_composite(Image.open(os.path.join(HERE, "cut-03.png")).convert("RGBA"))
    clean.save(os.path.join(HERE, "clean-03.png"))
    prev = Image.open(os.path.join(HERE, "cut-03.png")).convert("RGBA")
    m = Image.new("L", clean.size, 0)
    ImageDraw.Draw(m).ellipse([47 - 25, 50, 47 + 25, 108], fill=255)
    b = lib.alpha_bounds(prev); fp = prev.load(); mp = m.load()
    for y in range(max(0, b[3] - 11), clean.height):
        for x in range(clean.width):
            if fp[x, y][3] > 8:
                mp[x, y] = 0
    desc = ("one single small tree standing on the tan hexagonal ground: a brown trunk that starts "
            "at the ground and runs unbroken upward into a small rounded dark green leafy canopy. "
            "Keep the tan hexagonal ground and the sand coast exactly as they are - do not paint the "
            "ground white or grey, do not add a second tree, no shadow, no soil patch.")
    return go("s04r", clean, m, desc, 31120)


def path():
    plate = Image.open(os.path.join(HERE, "plate-pad.png")).convert("RGBA")
    crop = plate.crop((0, 104, 96, 184))
    crop.save(os.path.join(HERE, "path-crop.png"))
    m = Image.new("L", crop.size, 0)
    d = ImageDraw.Draw(m)
    d.line([(0, 68), (52, 8)], fill=255, width=15)
    desc = ("a worn dirt footpath trodden into the ground: a narrow strip of bare packed brown earth "
            "with a few small pebbles and slightly darker crumbly edges, running diagonally from the "
            "lower left to the upper right. Nothing else - no grass tufts, no fence, no plants, no shadow.")
    return go("path1", crop, m, desc, 31130)


if __name__ == "__main__":
    for name in sys.argv[1:]:
        {"stage4": stage4, "path": path}[name]()
