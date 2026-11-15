"""Turns the raw app captures into small web assets.

- .capture/*.webm clips -> public/v/<name>.mp4 (H.264, trimmed to the marked action, 30 fps, no audio)
  plus public/v/<name>.webp poster (first frame of the action).
- .capture/*.png stills -> public/shots/<name>.webp (600 px wide, quality 82).
- public/a/*.png|jpg art -> .webp next to it (alpha kept), originals removed.
Run: python3 scripts/optimize.py
"""
import json
import pathlib
import subprocess

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / '.capture'
V = ROOT / 'public' / 'v'
SHOTS = ROOT / 'public' / 'shots'
ART = ROOT / 'public' / 'a'
V.mkdir(parents=True, exist_ok=True)
SHOTS.mkdir(parents=True, exist_ok=True)


def run(*args):
    subprocess.run(args, check=True, capture_output=True)


def clips():
    marks = json.loads((RAW / 'marks.json').read_text())
    for name, m in marks.items():
        src = RAW / f'{name}.webm'
        if not src.exists():
            continue
        start, dur = max(0.0, m['start']), max(1.0, m['end'] - m['start'])
        out = V / f'{name}.mp4'
        run('ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{start:.2f}', '-i', str(src), '-t', f'{dur:.2f}',
            '-an', '-vf', 'crop=iw/2:ih/2:0:0,scale=540:-2,fps=30',  # Playwright pins the 390x844 viewport in the top-left of the 780x1688 frame '-c:v', 'libx264', '-preset', 'slow', '-crf', '33',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(out))
        poster = V / f'{name}.png'
        run('ffmpeg', '-y', '-loglevel', 'error', '-ss', '0.4', '-i', str(out), '-frames:v', '1', str(poster))
        Image.open(poster).save(V / f'{name}.webp', 'WEBP', quality=78, method=6)
        poster.unlink()
        print('clip', name, f'{out.stat().st_size // 1024} KB')


def stills():
    for src in sorted(RAW.glob('*.png')):
        im = Image.open(src).convert('RGB')
        w = 600
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        out = SHOTS / f'{src.stem}.webp'
        im.save(out, 'WEBP', quality=82, method=6)
    # hand-sized captures from shots.cjs (390x687) are already in public/shots as png
    for src in sorted(SHOTS.glob('*.png')):
        im = Image.open(src).convert('RGB')
        w = 600
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        im.save(SHOTS / f'{src.stem}.webp', 'WEBP', quality=82, method=6)
        src.unlink()
    print('stills', len(list(SHOTS.glob('*.webp'))))


def art():
    n = 0
    for src in sorted(list(ART.glob('*.png')) + list(ART.glob('*.jpg'))):
        if src.name == 'screen-mask.png':
            continue  # used as a CSS mask; keep PNG
        im = Image.open(src)
        im.save(src.with_suffix('.webp'), 'WEBP', quality=84, method=6)
        src.unlink()
        n += 1
    print('art', n)


if __name__ == '__main__':
    import sys
    what = sys.argv[1:] or ['clips', 'stills', 'art']
    if 'clips' in what:
        clips()
    if 'stills' in what:
        stills()
    if 'art' in what:
        art()
