"""Build a PixelLab args JSON with data: URLs embedded from local PNGs.

usage: python mkargs.py <out.json> <template.json>
template values of the form "@file:<relpath>" are replaced by a data: URL.
"""
import sys, json, base64, os
B = os.path.dirname(os.path.abspath(__file__))

def dataurl(p):
    p = p if os.path.isabs(p) else os.path.join(B, p)
    with open(p, 'rb') as f:
        return 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

def walk(v):
    if isinstance(v, str) and v.startswith('@file:'):
        return dataurl(v[6:])
    if isinstance(v, list):
        return [walk(x) for x in v]
    if isinstance(v, dict):
        return {k: walk(x) for k, x in v.items()}
    return v

out, tpl = sys.argv[1], sys.argv[2]
with open(tpl, 'r', encoding='utf-8') as f:
    data = json.load(f)
data = walk(data)
with open(out, 'w', encoding='utf-8') as f:
    json.dump(data, f)
print(out, os.path.getsize(out), 'bytes')
