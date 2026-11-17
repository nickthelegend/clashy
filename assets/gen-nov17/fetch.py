#!/usr/bin/env python3
"""Download every completed Higgsfield job in logs/*.json to out/<name>.<ext> (full-size file, not the _min preview)."""
import glob, json, os, sys, urllib.request

def urls(o):
    if isinstance(o, str) and o.startswith('http'):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from urls(v)
    elif isinstance(o, list):
        for v in o:
            yield from urls(v)

os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('out', exist_ok=True)
pending = []
for f in sorted(glob.glob('logs/*.json')):
    n = os.path.basename(f)[:-5]
    try:
        d = json.load(open(f))
    except Exception:
        pending.append(n)
        continue
    j = d[0] if isinstance(d, list) else d
    if j.get('status') != 'completed':
        pending.append(n)
        continue
    media = [u for u in urls(j) if any(x in u for x in ('.png', '.jpg', '.webp', '.mp4'))]
    full = [u for u in media if '_min' not in u and 'thumb' not in u] or media
    if not full:
        pending.append(n)
        continue
    u = full[0]
    ext = os.path.splitext(u.split('?')[0])[1]
    dst = f'out/{n}{ext}'
    if not os.path.exists(dst):
        urllib.request.urlretrieve(u, dst)
    print('ok', dst)
print('pending:', ' '.join(pending))
