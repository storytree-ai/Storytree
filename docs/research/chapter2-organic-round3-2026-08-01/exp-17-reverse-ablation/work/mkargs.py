"""Build a PixelLab args JSON, inlining local PNGs as base64 for *_base64 fields.

Usage: python mkargs.py out.json '<json with @file refs>'
Any string value of the form "@<path>" is replaced by that file's base64.
"""
import base64
import json
import sys
from pathlib import Path


def resolve(v):
    if isinstance(v, str) and v.startswith("@"):
        return base64.b64encode(Path(v[1:]).read_bytes()).decode("ascii")
    if isinstance(v, dict):
        return {k: resolve(x) for k, x in v.items()}
    if isinstance(v, list):
        return [resolve(x) for x in v]
    return v


out = Path(sys.argv[1])
spec = sys.argv[2]
if spec.startswith("file:"):
    spec = Path(spec[5:]).read_text(encoding="utf-8")
data = resolve(json.loads(spec))
out.write_text(json.dumps(data), encoding="utf-8")
print(f"{out} {out.stat().st_size} bytes")
