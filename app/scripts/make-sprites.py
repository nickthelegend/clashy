#!/usr/bin/env python3
"""Cut ChatGPT sprite sheets (3 x 2 grids of frames on a white background) into Clashy sprite strips.

  python3 -I app/scripts/make-sprites.py         # every character's sheets in app/assets/sprites/src
  python3 -I app/scripts/make-sprites.py bo      # one character (all its sheets are cut together)

For each sheet `src/<name>.png` it writes:
  app/assets/sprites/<name>.webp          one row of frames, CELL x CELL each, real alpha (what the app plays)
  app/assets/sprites/preview/<name>.webp  an animated preview at the sheet's frame rate (for review only)
and updates app/assets/sprites/sprites.json (frame count and frame rate per sprite).

How a frame is cut:
  1. Split the sheet into its 3 x 2 cells.
  2. Background: flood-fill near-white from the cell's border, so the cream belly and white highlights inside the
     character stay opaque; the edge is feathered by one pixel. Small slivers at the cell border (a prop from the
     neighbouring frame) are dropped.
  3. Size: a character is drawn at one size in all its animations. ChatGPT draws each sheet at its own size (up to
     30 % apart), so each sheet is measured by the area of the character's body colour, which barely changes with the
     pose, and one scale per character makes every frame of every animation fit.
  4. Align: every frame is placed so its feet sit on one baseline and the centre of its feet (the lowest 18 % of the
     character) sits on one vertical line. A punch or a jump moves the body, not the feet, so the sprite doesn't drift.
     Frames whose feet leave the ground on purpose (a jump, a knockout fall) keep their height from the sheet: those
     sprites list "keep_y" in SPEC.
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'sprites'
SRC = ROOT / 'src'
CELL = 320          # output frame size (px)
PAD = 0.06          # margin around the character inside a frame
COLS, ROWS = 3, 2
# each character's body colour as a PIL hue range (0-255): the mascot is indigo #5B6CFF, LASER is red
BODY_HUE = {'bo': (160, 185), 'laser': (245, 12)}

# name -> fps, loop mode ("loop": 1..6 then 1.., "pingpong": 1..6..2, "once": play once and hold the last frame),
# keep_y: keep each frame's height from the sheet (jumps, falls).
SPEC = {
    'bo-idle': {'fps': 8, 'mode': 'pingpong'},
    'bo-punch': {'fps': 12, 'mode': 'once'},
    'bo-hit': {'fps': 12, 'mode': 'once'},
    'bo-ko': {'fps': 10, 'mode': 'once', 'keep_y': True},
    'bo-win': {'fps': 10, 'mode': 'loop', 'keep_y': True},
    'bo-lose': {'fps': 8, 'mode': 'once'},
    'laser-idle': {'fps': 8, 'mode': 'pingpong'},
    'laser-attack': {'fps': 12, 'mode': 'once'},
    'laser-hit': {'fps': 12, 'mode': 'once'},
    'laser-ko': {'fps': 10, 'mode': 'once', 'keep_y': True},
    'laser-win': {'fps': 10, 'mode': 'loop', 'keep_y': True},
    'laser-lose': {'fps': 8, 'mode': 'once'},
    # Nov 26: the game moments (made with the Codex CLI's image tool from the same references)
    'bo-think': {'fps': 6, 'mode': 'pingpong'},
    'bo-long': {'fps': 12, 'mode': 'once', 'keep_y': True},
    'bo-short': {'fps': 12, 'mode': 'once', 'keep_y': True},
    'bo-rocket': {'fps': 8, 'mode': 'pingpong', 'keep_y': True},
    'bo-cashout': {'fps': 10, 'mode': 'once'},
    'bo-flip': {'fps': 8, 'mode': 'loop'},
    'bo-dice': {'fps': 10, 'mode': 'once'},
    'bo-streak': {'fps': 8, 'mode': 'pingpong'},
    'bo-oops': {'fps': 10, 'mode': 'once'},
    'bo-shrug': {'fps': 8, 'mode': 'once'},
    'bo-trophy': {'fps': 8, 'mode': 'loop'},
    'bo-wave': {'fps': 8, 'mode': 'pingpong'},
    'laser-faceoff': {'fps': 8, 'mode': 'once'},
    'laser-bored': {'fps': 5, 'mode': 'loop'},
    'laser-panic': {'fps': 8, 'mode': 'pingpong'},
    'laser-taunt': {'fps': 8, 'mode': 'pingpong'},
    'laser-melt': {'fps': 8, 'mode': 'once', 'keep_y': True},
    'laser-rage': {'fps': 10, 'mode': 'once'},
}


def alpha_from_border(rgb: np.ndarray, thresh: int = 26) -> np.ndarray:
    """Opaque everywhere except near-white pixels connected to the border."""
    h, w, _ = rgb.shape
    white = (255 - rgb.astype(np.int16)).max(axis=2) <= thresh
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if white[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if white[y, x] and not bg[y, x]:
                bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and white[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    a = np.where(bg, 0, 255).astype(np.uint8)
    # drop specks: keep only components touching the biggest blob's bbox would be costly; a light open is enough
    img = Image.fromarray(a).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    return np.array(img.filter(ImageFilter.GaussianBlur(0.8)))


def drop_border_fragments(a: np.ndarray) -> np.ndarray:
    """A prop that crosses into a neighbouring cell leaves a sliver at this cell's edge: drop any opaque piece that
    touches the cell border and is under 3 % of the cell's opaque area (a flood that stops once a piece is big)."""
    solid = a > 128
    limit = max(50, int(0.03 * solid.sum()))
    h, w = solid.shape
    seen = np.zeros_like(solid)
    out = a.copy()
    border = [(y, x) for x in range(w) for y in (0, h - 1)] + [(y, x) for y in range(h) for x in (0, w - 1)]
    for sy, sx in border:
        if not solid[sy, sx] or seen[sy, sx]:
            continue
        piece, q, big = [(sy, sx)], deque([(sy, sx)]), False
        seen[sy, sx] = True
        while q:
            y, x = q.popleft()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx)); piece.append((ny, nx))
            if len(piece) > limit:
                big = True; break
        if not big:
            ys, xs = zip(*piece); out[list(ys), list(xs)] = 0
    return out


def measure(name: str) -> dict:
    """Cut a sheet's six frames and measure them (pixels of the source sheet)."""
    sheet = Image.open(SRC / f'{name}.png').convert('RGB')
    W, H = sheet.size
    cw, ch = W // COLS, H // ROWS
    frames = []
    for r in range(ROWS):
        for c in range(COLS):
            cell = np.array(sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)))
            a = drop_border_fragments(alpha_from_border(cell))
            ys, xs = np.nonzero(a > 128)
            if len(ys) == 0:
                raise SystemExit(f'{name}: cell {r},{c} is empty')
            top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
            foot = ys >= bottom - 0.18 * (bottom - top)
            hsv = np.array(Image.fromarray(cell).convert('HSV')).astype(np.int16)
            lo, hi = BODY_HUE[name.split('-')[0]]
            hue = hsv[..., 0]
            body = (a > 128) & (hsv[..., 1] > 90) & (hsv[..., 2] > 60) & (((hue >= lo) & (hue <= hi)) if lo <= hi else ((hue >= lo) | (hue <= hi)))
            frames.append({'rgba': np.dstack([cell, a]), 'top': top, 'bottom': bottom, 'left': left, 'right': right,
                           'foot_x': xs[foot].mean(), 'body': int(body.sum())})
    spec = SPEC.get(name, {'fps': 10, 'mode': 'loop'})
    if spec.get('keep_y'):
        # jumps and falls: keep ChatGPT's placement inside the cell (the cell centre is the anchor)
        for f in frames:
            f['foot_x'] = cw / 2
    ground = max(f['bottom'] for f in frames) if spec.get('keep_y') else None
    reach = max(max(f['foot_x'] - f['left'], f['right'] - f['foot_x']) for f in frames)
    height = max((ground if ground is not None else f['bottom']) - f['top'] for f in frames)
    # the character's size on this sheet: the area of its body colour, which barely changes with the pose
    ref = float(np.sqrt(np.median([f['body'] for f in frames])))
    return {'name': name, 'spec': spec, 'frames': frames, 'ground': ground, 'reach': reach, 'height': height, 'ref': ref}


def render(m: dict, k: float) -> dict:
    """Place every frame at scale k (output px per sheet px) on the shared feet anchor. Standing animations use a CELL
    frame; a jump or fall that needs more room gets a bigger square frame, with the feet anchor at the same distance
    from its bottom centre, so the app can lay every animation on one baseline at one scale."""
    spec, frames, ground = m['spec'], m['frames'], m['ground']
    need = max(2 * m['reach'] * k, m['height'] * k) / (1 - 2 * PAD)
    size = max(CELL, int(np.ceil(need / 8) * 8))
    base_y = size - CELL * PAD
    strip = Image.new('RGBA', (size * len(frames), size), (0, 0, 0, 0))
    out_frames = []
    for i, f in enumerate(frames):
        im = Image.fromarray(f['rgba'], 'RGBA')
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        anchor_y = (ground if ground is not None else f['bottom']) * k
        x = round(size / 2 - f['foot_x'] * k)
        y = round(base_y - anchor_y)
        fr = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        fr.paste(im, (x, y), im)
        strip.alpha_composite(fr, (i * size, 0))
        out_frames.append(fr)
    name = m['name']
    strip.save(ROOT / f'{name}.webp', 'WEBP', quality=88, method=6)
    order = list(range(len(out_frames)))
    if spec['mode'] == 'pingpong':
        order += list(range(len(out_frames) - 2, 0, -1))
    (ROOT / 'preview').mkdir(exist_ok=True)
    prev = []
    for i in order:
        bg = Image.new('RGBA', (size, size), (14, 14, 19, 255))
        bg.alpha_composite(out_frames[i])
        prev.append(bg.convert('RGB'))
    hold = [1000 // spec['fps']] * len(prev)
    if spec['mode'] == 'once':
        hold[-1] = 900
    prev[0].save(ROOT / 'preview' / f'{name}.webp', save_all=True, append_images=prev[1:], duration=hold, loop=0, quality=80)
    return {'frames': len(out_frames), 'size': size, 'fps': spec['fps'], 'mode': spec['mode']}


def cut_character(names: list[str]) -> dict:
    """One character's sheets together, so the character is the same size in every animation."""
    ms = [measure(n) for n in names]
    for m in ms:
        if m['ref'] < 20:
            raise SystemExit(f"{m['name']}: almost no body colour found; check BODY_HUE")
        m['norm'] = m['ref']                   # sheet px per unit of body size
    usable = CELL * (1 - 2 * PAD)
    # body size in output px: the idle stance fills its CELL frame; wider or taller animations (a punch, a fall) get
    # bigger frames at the same scale
    base = [m for m in ms if m['name'].endswith('-idle')] or ms
    target = min(min(usable / (2 * m['reach'] / m['norm']), usable / (m['height'] / m['norm'])) for m in base)
    return {m['name']: render(m, target / m['norm']) for m in ms}


def main():
    chars = sys.argv[1:] or sorted({p.stem.split('-')[0] for p in SRC.glob('*.png')})
    meta_path = ROOT / 'sprites.json'
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    for ch in chars:
        names = sorted(p.stem for p in SRC.glob(f'{ch}-*.png'))
        for n, info in cut_character(names).items():
            meta[n] = info
            print(f'{n}: {info}')
    meta_path.write_text(json.dumps(dict(sorted(meta.items())), indent=2) + '\n')


if __name__ == '__main__':
    main()
