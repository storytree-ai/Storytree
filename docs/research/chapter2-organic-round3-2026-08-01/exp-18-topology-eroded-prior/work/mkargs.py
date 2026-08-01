"""mkargs.py — write a pixflux img2img args JSON with base64 init/colour images inlined."""
import base64
import json
import sys

out, desc_file, init_png, strength, seed = sys.argv[1:6]
color_png = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] != "-" else None
tgs = float(sys.argv[7]) if len(sys.argv) > 7 else 8.0

args = {
    "description": open(desc_file, encoding="utf-8").read().strip(),
    "init_image_base64": base64.b64encode(open(init_png, "rb").read()).decode(),
    "init_image_strength": int(strength),
    "no_background": True,
    "view": "low top-down",
    "outline": "selective outline",
    "shading": "basic shading",
    "detail": "medium detail",
    "text_guidance_scale": tgs,
    "seed": int(seed),
}
if color_png:
    args["color_image_base64"] = base64.b64encode(open(color_png, "rb").read()).decode()
json.dump(args, open(out, "w"))
print(out, "init=", init_png, "strength=", strength, "seed=", seed, "colour=", color_png)
