"""Grow a hero tree stage by stage by inpainting INTO the real island plate.

Stage k: image = plate with the stage k-1 tree already inpainted (the running composite).
         mask  = ellipse centred on the socket, fixed bottom, growing top+width,
                 MINUS the bottom FREEZE_H px of the tree already drawn (so the root
                 contact is pixel-frozen and cannot drift or detach).
Each return is saved raw; the transparent tree track is derived later by differencing
the composite against the untouched plate.

usage: python ladder.py <stagespec.json> [--from <n>]
"""
import json, os, re, subprocess, sys, time
from PIL import Image, ImageDraw
import lib

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(os.path.dirname(HERE), "raw")
CLI = r"C:/Users/mickh/AppData/Local/Temp/claude/C--code-storytree/495dc188-faf3-4e1e-9dd0-6764531fd3a2/scratchpad/pixellab.mjs"

# --- crop frame: a 96x128 window of the padded plate around the tree socket -------------
CROP = (52, 50, 148, 178)          # in padded-plate coords -> 96x128
SOCKET = (99 - CROP[0], 150 - CROP[1])   # (47, 100) in crop coords
BOTTOM_Y = 158 - CROP[1]                 # 108
FREEZE_H = 12


def cli(*a):
    p = subprocess.run(["node", CLI, *a], capture_output=True, text=True)
    return p.stdout + p.stderr


def submit(tool, argsjson, tries=12):
    for _ in range(tries):
        out = cli("call", tool, argsjson)
        m = re.search(r"(?:^id: |job_id[\"' :=]+)([0-9a-f-]{36})", out, re.M)
        if m:
            return m.group(1), out
        if "rate limit" in out:
            time.sleep(25); continue
        return None, out
    return None, "rate-limited out"


def poll(job, label, timeout=480):
    getf = os.path.join(HERE, f"get-{label}.json")
    json.dump({"job_id": job}, open(getf, "w"))
    t0 = time.time()
    while time.time() - t0 < timeout:
        out = cli("call", "get_image", getf, "--out", RAW, "--label", f"{label}-{job[:8]}")
        saved = re.findall(r"^SAVED (.+)$", out, re.M)
        if saved:
            return "OK", saved[0], out
        if "status: failed" in out or re.search(r"^error:", out, re.M):
            return "FAIL", None, out
        time.sleep(8)
    return "TIMEOUT", None, ""


def build_mask(size, rx, top, frozen_tree):
    W, H = size
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).ellipse([SOCKET[0] - rx, top, SOCKET[0] + rx, BOTTOM_Y], fill=255)
    if frozen_tree is not None:
        b = lib.alpha_bounds(frozen_tree)
        if b:
            fp = frozen_tree.load(); mp = m.load()
            y_from = b[3] - FREEZE_H + 1
            for y in range(max(0, y_from), H):
                for x in range(W):
                    if fp[x, y][3] > 8:
                        mp[x, y] = 0
    return m


def main():
    spec = json.load(open(sys.argv[1]))
    start = 0
    if "--from" in sys.argv:
        start = int(sys.argv[sys.argv.index("--from") + 1])
    plate_full = Image.open(os.path.join(HERE, "plate-pad.png")).convert("RGBA")
    base = plate_full.crop(CROP)
    base.save(os.path.join(HERE, "base-crop.png"))
    log_path = os.path.join(HERE, "ladder-log.json")
    log = json.load(open(log_path)) if os.path.exists(log_path) else {}

    # running composite = last accepted stage composite, else the bare crop
    running = base.copy()
    if start > 0:
        prev = os.path.join(HERE, f"comp-{start-1:02d}.png")
        running = Image.open(prev).convert("RGBA")

    for st in spec["stages"][start:]:
        k = st["k"]; label = f"s{k:02d}"
        prev_tree = None
        pt = os.path.join(HERE, f"tree-{k-1:02d}.png")
        if k > 0 and os.path.exists(pt):
            prev_tree = Image.open(pt).convert("RGBA")
        mk = build_mask(running.size, st["rx"], st["top"], prev_tree)
        mk.save(os.path.join(HERE, f"mask-{label}.png"))
        args = {
            "description": st["description"],
            "image_base64": lib.b64_png(running),
            "mask_image_base64": lib.b64_png(mk.convert("RGB")),
            "crop_to_mask": True,
            "seed": st["seed"],
        }
        af = os.path.join(HERE, f"args-{label}.json")
        json.dump(args, open(af, "w"))
        job, out = submit("inpaint_image", af)
        if not job:
            print(f"{label} SUBMIT FAIL {out[:400]}", flush=True); return
        print(f"{label} JOB {job}", flush=True)
        state, path, out = poll(job, label)
        if state != "OK":
            print(f"{label} {state}\n{out[:400]}", flush=True); return
        comp = Image.open(path).convert("RGBA")
        comp.save(os.path.join(HERE, f"comp-{k:02d}.png"))
        tree, n = lib.diff_extract(comp, base, tol=st.get("tol", 34))
        tree.save(os.path.join(HERE, f"tree-{k:02d}.png"))
        b = lib.alpha_bounds(tree)
        a = lib.root_anchor(tree)
        print(f"{label} OK job={job} diffpx={n} bbox={b} anchor={a}", flush=True)
        log[label] = {"job": job, "seed": st["seed"], "description": st["description"],
                      "rx": st["rx"], "top": st["top"], "raw": os.path.basename(path),
                      "diff_px": n, "bbox": b, "anchor": a}
        json.dump(log, open(log_path, "w"), indent=1)
        running = comp


if __name__ == "__main__":
    main()
