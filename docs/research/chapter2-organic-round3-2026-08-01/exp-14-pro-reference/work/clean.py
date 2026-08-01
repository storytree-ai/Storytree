"""Author-time cleanup: keep only the largest alpha-connected component (drops stray sprigs,
detached debris, floating specks). Reports what it removed so the README can state it."""
import sys
from collections import deque

import numpy as np
from PIL import Image

TH = 8


def components(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and lab[sy, sx] == 0:
                n += 1
                q = deque([(sy, sx)])
                lab[sy, sx] = n
                while q:
                    y, x = q.popleft()
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = y + dy, x + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and lab[ny, nx] == 0:
                                lab[ny, nx] = n
                                q.append((ny, nx))
    return lab, n


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    a = np.array(Image.open(src).convert('RGBA'))
    mask = a[..., 3] > TH
    lab, n = components(mask)
    sizes = [(int((lab == i).sum()), i) for i in range(1, n + 1)]
    sizes.sort(reverse=True)
    keep = sizes[0][1]
    removed = [s for s, _ in sizes[1:]]
    out = a.copy()
    out[..., 3] = np.where(lab == keep, a[..., 3], 0)
    Image.fromarray(out).save(dst)
    print(f'{src} -> {dst} components={n} kept={sizes[0][0]}px removed={removed}')
