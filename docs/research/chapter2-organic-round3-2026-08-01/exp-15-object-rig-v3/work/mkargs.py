"""Compose PixelLab tool-arg JSON files with base64 image payloads embedded.

usage: python mkargs.py <spec.json> <out.json>
spec keys ending in "__b64file" become <keyWithoutSuffix> = base64 of that file.
spec key "style_images__files" becomes style_images = [{base64, format:'png'}, ...].
"""
import base64
import json
import sys


def b64(p):
    with open(p, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


spec = json.load(open(sys.argv[1], encoding="utf-8"))
out = {}
for k, v in spec.items():
    if k == "style_images__files":
        out["style_images"] = [{"type": "base64", "base64": b64(p), "format": "png"} for p in v]
    elif k.endswith("__b64file"):
        out[k[: -len("__b64file")]] = b64(v)
    else:
        out[k] = v
with open(sys.argv[2], "w", encoding="utf-8") as f:
    json.dump(out, f)
print(sys.argv[2], "written")
