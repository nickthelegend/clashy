#!/usr/bin/env python3
"""Turns the fake checkerboard GPT Image paints behind 'transparent' objects into real alpha.

The background is every low-saturation, light pixel connected to the image border (a BFS flood fill).
Inside it, the checker squares become fully transparent and the soft contact shadow under the object
is kept as a semi-transparent dark shadow, so objects sit cleanly on Clashy's black UI.

  python3 to-alpha.py out/stash-jar.png alpha/stash-jar.png
"""
import sys
from collections import deque

import numpy as np
from PIL import Image


def to_alpha(src: str, dst: str) -> None:
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.int16)
    h, w, _ = im.shape
    mx, mn = im.max(2), im.min(2)
    lum = im.mean(2)
    bgish = ((mx - mn) < 16) & (lum > 150)
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bgish[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bgish[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and bgish[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    # the checker's two greys sit around 235-255; anything darker inside the background is shadow
    shadow = np.clip((228.0 - lum) / 110.0, 0, 0.75)
    alpha = np.where(seen, shadow, 1.0)
    rgb = np.where(seen[..., None], 0, im)  # shadow pixels are black at partial alpha
    out = np.dstack([rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)])
    Image.fromarray(out, 'RGBA').save(dst)


if __name__ == '__main__':
    to_alpha(sys.argv[1], sys.argv[2])
