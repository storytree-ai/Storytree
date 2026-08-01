"""Write an inpaint_image args file for one stage of the ladder.

usage: python mkargs.py <stage> <seed> <crop_to_mask 0|1> [<out-suffix>] [<prompt-key>]
"""
import base64
import json
import sys
sys.path.insert(0, '.')
from plan import LADDER, PROMPTS

stage, seed, crop = sys.argv[1], int(sys.argv[2]), sys.argv[3] == '1'
suffix = sys.argv[4] if len(sys.argv) > 4 else ''
pkey = sys.argv[5] if len(sys.argv) > 5 else stage

row = next(r for r in LADDER if r[0] == stage)
_, mx, my, mw, mh, _young = row
img = base64.b64encode(open('input-%s.png' % stage, 'rb').read()).decode()
args = {
    'description': PROMPTS[pkey],
    'image_base64': img,
    'mask_x': mx, 'mask_y': my, 'mask_width': mw, 'mask_height': mh,
    'crop_to_mask': crop,
    'seed': seed,
}
path = 'args/inp-%s%s.json' % (stage, suffix)
json.dump(args, open(path, 'w'))
print(path, 'mask', (mx, my, mw, mh), 'crop', crop, 'seed', seed, 'prompt', pkey)
