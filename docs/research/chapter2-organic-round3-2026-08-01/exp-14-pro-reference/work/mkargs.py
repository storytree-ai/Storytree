"""Build a create_image_pro args.json with base64 labelled references + style lock.

usage: python mkargs.py <out.json> <seed> <descfile> <stylepath> <styleCopyCsv> [refpath::usage ...]
"""
import base64
import json
import sys


def b64(p: str) -> str:
    with open(p, 'rb') as fh:
        return base64.b64encode(fh.read()).decode('ascii')


out, seed, descfile, stylepath, stylecopy = sys.argv[1:6]
refs = sys.argv[6:]

with open(descfile, 'r', encoding='utf-8') as fh:
    desc = fh.read().strip()

args = {
    'description': desc,
    'width': 168,
    'height': 168,
    'no_background': True,
    'seed': int(seed),
}
if refs:
    args['reference_images'] = json.dumps(
        [{'base64': b64(r.split('::')[0]), 'usage': r.split('::')[1]} for r in refs]
    )
if stylepath != '-':
    args['style_image_base64'] = b64(stylepath)
    if stylecopy != '-':
        args['style_copy'] = stylecopy.split(',')

with open(out, 'w', encoding='utf-8') as fh:
    json.dump(args, fh)
print(f'wrote {out} desc={len(desc)}ch refs={len(refs)} style={stylepath} copy={stylecopy} seed={seed}')
