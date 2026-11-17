#!/usr/bin/env python3
"""Makes Clashy's Lottie micro-animations from our own clay art (no stock Lottie files).

Each file embeds small cutouts from assets/gen-nov17/alpha as image layers and animates them with squash and
stretch, plus vector particles in the brand palette:
  coin-drop.json   a gold coin falls into the Stash jar, the jar squashes and bounces (saving)
  heart-pop.json   a heart pops with a ring and six dots (liking a post)
  confetti.json    a confetti burst in indigo, pink, gold and mint (winning)
  flame.json       the streak flame flickers (streak, loops)

  python3 app/scripts/make-lottie.py      → app/assets/lottie/*.json
"""
import base64, io, json, math, os, random
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', '..', 'assets', 'gen-nov17', 'alpha')
OUT = os.path.join(HERE, '..', 'assets', 'lottie')
INDIGO, PINK, GOLD, MINT = [0.357, 0.424, 1, 1], [0.941, 0.275, 0.549, 1], [1, 0.788, 0.29, 1], [0.239, 0.863, 0.592, 1]
EASE_OUT = {'o': {'x': [0.2], 'y': [0]}, 'i': {'x': [0.2], 'y': [1]}}
EASE = {'o': {'x': [0.42], 'y': [0]}, 'i': {'x': [0.58], 'y': [1]}}


def asset(name, size):
    im = Image.open(os.path.join(ART, f'{name}.png')).convert('RGBA')
    im.thumbnail((size, size))
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return {'id': name, 'w': im.width, 'h': im.height, 'u': '', 'p': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(), 'e': 1}


def kf(frames, ease=EASE):
    """[(t, value), ...] -> animated property (values are lists)."""
    out = []
    for i, (t, v) in enumerate(frames):
        k = {'t': t, 's': v if isinstance(v, list) else [v]}
        if i < len(frames) - 1:
            k.update(ease)
        out.append(k)
    return {'a': 1, 'k': out}


def static(v):
    return {'a': 0, 'k': v}


def transform(p, s=None, r=None, o=None, a=(0, 0)):
    return {'p': p if isinstance(p, dict) else static(list(p) + [0]), 'a': static(list(a) + [0]),
            's': s or static([100, 100, 100]), 'r': r or static(0), 'o': o or static(100)}


def image_layer(ind, ref, w, h, ks, op):
    return {'ddd': 0, 'ind': ind, 'ty': 2, 'nm': ref, 'refId': ref, 'sr': 1, 'ks': ks, 'ao': 0, 'ip': 0, 'op': op, 'st': 0, 'bm': 0}


def shape_layer(ind, nm, shapes, ks, op, ip=0):
    return {'ddd': 0, 'ind': ind, 'ty': 4, 'nm': nm, 'sr': 1, 'ks': ks, 'ao': 0, 'shapes': shapes, 'ip': ip, 'op': op, 'st': 0, 'bm': 0}


def ellipse(size, color):
    return {'ty': 'gr', 'it': [
        {'ty': 'el', 'p': static([0, 0]), 's': static([size, size]), 'd': 1},
        {'ty': 'fl', 'c': static(color), 'o': static(100), 'r': 1},
        {'ty': 'tr', 'p': static([0, 0]), 'a': static([0, 0]), 's': static([100, 100]), 'r': static(0), 'o': static(100)},
    ]}


def rect(w, h, color, radius=3):
    return {'ty': 'gr', 'it': [
        {'ty': 'rc', 'p': static([0, 0]), 's': static([w, h]), 'r': static(radius), 'd': 1},
        {'ty': 'fl', 'c': static(color), 'o': static(100), 'r': 1},
        {'ty': 'tr', 'p': static([0, 0]), 'a': static([0, 0]), 's': static([100, 100]), 'r': static(0), 'o': static(100)},
    ]}


def heart(color):
    # a heart from two cubic halves, centred on 0,0, 80 px wide
    v = [[0, 30], [-40, -6], [-20, -30], [0, -14], [20, -30], [40, -6]]
    o = [[-14, -8], [0, -16], [10, 0], [0, 0], [16, 0], [0, 16]]
    i = [[14, -8], [0, 16], [-16, 0], [0, 0], [-10, 0], [0, -16]]
    return {'ty': 'gr', 'it': [
        {'ty': 'sh', 'ks': static({'i': i, 'o': o, 'v': v, 'c': True})},
        {'ty': 'fl', 'c': static(color), 'o': static(100), 'r': 1},
        {'ty': 'tr', 'p': static([0, 0]), 'a': static([0, 0]), 's': static([100, 100]), 'r': static(0), 'o': static(100)},
    ]}


def doc(name, w, h, op, layers, assets=()):
    return {'v': '5.7.4', 'fr': 60, 'ip': 0, 'op': op, 'w': w, 'h': h, 'nm': name, 'ddd': 0, 'assets': list(assets), 'layers': layers}


def coin_drop():
    jar, coin = asset('stash-jar', 220), asset('roundup-coin', 110)
    W = H = 300
    op = 72
    jar_ks = transform(
        (150, 200), a=(jar['w'] / 2, jar['h']),
        s=kf([(0, [100, 100, 100]), (30, [100, 100, 100]), (36, [112, 86, 100]), (44, [94, 108, 100]), (52, [103, 97, 100]), (60, [100, 100, 100])]),
    )
    jar_ks['p'] = static([150, 200 + jar['h'] / 2, 0])
    coin_ks = transform(
        kf([(0, [150, -60, 0]), (30, [150, 150, 0])], EASE_OUT | {'o': {'x': [0.5], 'y': [0]}, 'i': {'x': [0.9], 'y': [1]}}), a=(coin['w'] / 2, coin['h'] / 2),
        s=kf([(0, [100, 100, 100]), (24, [92, 112, 100]), (30, [60, 60, 100])]),
        o=kf([(0, [100]), (28, [100]), (32, [0])]),
        r=kf([(0, [0]), (30, [180])]),
    )
    sparkles = []
    for k in range(5):
        ang = -math.pi / 2 + (k - 2) * 0.45
        dx, dy = math.cos(ang) * 90, math.sin(ang) * 70
        sparkles.append(shape_layer(10 + k, f'spark{k}', [ellipse(10, [GOLD, MINT, PINK, INDIGO, GOLD][k])], transform(
            kf([(32, [150, 160, 0]), (50, [150 + dx, 160 + dy, 0])], EASE_OUT), s=kf([(32, [100, 100, 100]), (54, [0, 0, 100])]),
        ), op, ip=32))
    return doc('coin-drop', W, H, op, [image_layer(1, 'roundup-coin', coin['w'], coin['h'], coin_ks, 32), *sparkles, image_layer(2, 'stash-jar', jar['w'], jar['h'], jar_ks, op)], [jar, coin])


def heart_pop():
    W = H = 160
    op = 48
    layers = [shape_layer(1, 'heart', [heart(PINK)], transform((80, 84), s=kf([(0, [0, 0, 100]), (10, [125, 125, 100]), (18, [92, 92, 100]), (26, [100, 100, 100])], EASE_OUT)), op)]
    ring = {'ty': 'gr', 'it': [
        {'ty': 'el', 'p': static([0, 0]), 's': kf([(0, [20, 20]), (22, [150, 150])], EASE_OUT), 'd': 1},
        {'ty': 'st', 'c': static(PINK), 'o': kf([(0, [90]), (22, [0])]), 'w': kf([(0, [10]), (22, [1])]), 'lc': 2, 'lj': 2},
        {'ty': 'tr', 'p': static([0, 0]), 'a': static([0, 0]), 's': static([100, 100]), 'r': static(0), 'o': static(100)},
    ]}
    layers.append(shape_layer(2, 'ring', [ring], transform((80, 84)), op))
    for k in range(6):
        ang = k * math.pi / 3
        layers.append(shape_layer(3 + k, f'dot{k}', [ellipse(12, [PINK, GOLD, INDIGO, MINT, PINK, GOLD][k])], transform(
            kf([(4, [80, 84, 0]), (24, [80 + math.cos(ang) * 62, 84 + math.sin(ang) * 62, 0])], EASE_OUT), s=kf([(4, [100, 100, 100]), (30, [0, 0, 100])]),
        ), op, ip=4))
    return doc('heart-pop', W, H, op, layers)


def confetti():
    random.seed(7)
    W, H = 360, 360
    op = 96
    layers = []
    for k in range(28):
        ang = random.uniform(-math.pi, 0)
        speed = random.uniform(110, 190)
        x1, y1 = 180 + math.cos(ang) * speed, 200 + math.sin(ang) * speed
        color = [INDIGO, PINK, GOLD, MINT][k % 4]
        piece = rect(random.choice([10, 14]), random.choice([18, 22]), color) if k % 3 else ellipse(12, color)
        layers.append(shape_layer(k + 1, f'c{k}', [piece], transform(
            kf([(0, [180, 210, 0]), (26, [x1, y1, 0]), (op - 6, [x1 + random.uniform(-30, 30), y1 + 170, 0])], EASE_OUT),
            r=kf([(0, [0]), (op - 6, [random.choice([-1, 1]) * random.uniform(240, 600)])]),
            o=kf([(0, [100]), (op - 24, [100]), (op - 6, [0])]),
        ), op))
    return doc('confetti', W, H, op, layers)


def flame():
    f = asset('streak-flame', 200)
    W = H = 220
    op = 60
    ks = transform((110, 110 + f['h'] / 2), a=(f['w'] / 2, f['h']),
                   s=kf([(0, [100, 100, 100]), (15, [96, 106, 100]), (30, [103, 97, 100]), (45, [97, 104, 100]), (60, [100, 100, 100])]),
                   r=kf([(0, [0]), (15, [-2]), (30, [1.5]), (45, [-1]), (60, [0])]))
    return doc('flame', W, H, op, [image_layer(1, 'streak-flame', f['w'], f['h'], ks, op)], [f])


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, make in [('coin-drop', coin_drop), ('heart-pop', heart_pop), ('confetti', confetti), ('flame', flame)]:
        path = os.path.join(OUT, f'{name}.json')
        with open(path, 'w') as fh:
            json.dump(make(), fh, separators=(',', ':'))
        print(f'{name}.json {os.path.getsize(path) // 1024} KB')
