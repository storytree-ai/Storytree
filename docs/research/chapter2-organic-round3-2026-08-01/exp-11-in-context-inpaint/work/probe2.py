"""Probe runner supporting create_map_object AND inpaint_image."""
import json, os, re, subprocess, sys, time
from PIL import Image
import lib, mask as M

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(os.path.dirname(HERE), "raw")
CLI = r"C:/Users/mickh/AppData/Local/Temp/claude/C--code-storytree/495dc188-faf3-4e1e-9dd0-6764531fd3a2/scratchpad/pixellab.mjs"


def cli(*a):
    p = subprocess.run(["node", CLI, *a], capture_output=True, text=True)
    return p.stdout + p.stderr


def submit(tool, argsjson, tries=10):
    for _ in range(tries):
        out = cli("call", tool, argsjson)
        m = re.search(r"(?:^id: |job_id[\"' :=]+)([0-9a-f-]{36})", out, re.M)
        if m:
            return m.group(1), out
        if "rate limit" in out:
            time.sleep(25); continue
        return None, out
    return None, "rate-limited out"


def poll(getter, key, job, label, timeout=480):
    getf = os.path.join(HERE, f"get-{label}.json")
    json.dump({key: job}, open(getf, "w"))
    t0 = time.time()
    while time.time() - t0 < timeout:
        out = cli("call", getter, getf, "--out", RAW, "--label", f"{label}-{job[:8]}")
        saved = re.findall(r"^SAVED (.+)$", out, re.M)
        if saved or "status: completed" in out:
            return "OK", saved, out
        if "status: failed" in out or re.search(r"^error:", out, re.M):
            return "FAIL", [], out
        time.sleep(9)
    return "TIMEOUT", [], ""


def run(spec):
    tool = spec.get("tool", "create_map_object")
    bgim = Image.open(spec.get("bg", os.path.join(HERE, "plate-pad.png"))).convert("RGBA")
    label = spec["label"]
    if spec.get("mask", True):
        mk = M.ellipse_mask(bgim.size, spec["rx"], spec["top"], spec.get("cx", M.ROOT_X), spec.get("bottom", M.BOTTOM_Y))
        mk.save(os.path.join(HERE, f"mask-{label}.png"))
    if tool == "create_map_object":
        args = {
            "description": spec["description"],
            "view": spec.get("view", "low top-down"),
            "outline": spec.get("outline", "single color outline"),
            "shading": spec.get("shading", "detailed shading"),
            "detail": spec.get("detail", "high detail"),
            "background_image": lib.bg_arg(bgim),
        }
        if spec.get("mask", True):
            args["inpainting"] = lib.mask_arg(mk.convert("RGB"))
        elif spec.get("fraction"):
            args["inpainting"] = json.dumps({"type": "oval", "fraction": spec["fraction"]})
        getter, key = "get_map_object", "object_id"
    else:
        args = {
            "description": spec["description"],
            "image_base64": lib.b64_png(bgim),
            "mask_image_base64": lib.b64_png(mk.convert("RGB")),
            "crop_to_mask": spec.get("crop_to_mask", True),
        }
        if spec.get("seed") is not None:
            args["seed"] = spec["seed"]
        getter, key = "get_image", "job_id"
    af = os.path.join(HERE, f"args-{label}.json")
    json.dump(args, open(af, "w"))
    job, out = submit(tool, af)
    if not job:
        print(f"{label}: SUBMIT FAIL\n{out[:600]}", flush=True)
        return
    print(f"{label}: JOB {job}", flush=True)
    st, saved, out = poll(getter, key, job, label)
    print(f"{label}: {st} {saved}", flush=True)
    if st != "OK":
        print(out[:600], flush=True)


if __name__ == "__main__":
    for spec in json.load(open(sys.argv[1])):
        print("=== ", spec["label"], "|", spec.get("tool", "create_map_object"), "|", spec["description"][:60], flush=True)
        run(spec)
