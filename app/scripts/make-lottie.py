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


"""Onboarding scenes (Nov 19): one looping 9:16 scene per welcome slide, 3 s at 60 fps, built from the same clay
cutouts. Every loop ends where it starts, so it plays forever without a jump."""
OW, OH, OP = 360, 640, 180


def bob(x, y, amp=8, phase=0, period=OP):
    """A slow float: up and down around (x, y), back to the start at the end of the loop."""
    pts = []
    for k in range(5):
        t = int(period * k / 4)
        pts.append((t, [x, y + amp * math.sin(phase + math.pi * k / 2), 0]))
    return kf(pts)


def pop_in(t0, peak=112, size=100):
    """Scale from 0 with an overshoot, holding at size until the loop ends, then shrinking back to 0 to loop."""
    return kf([(0, [0, 0, 100]), (t0, [0, 0, 100]), (t0 + 10, [peak, peak, 100]), (t0 + 18, [size, size, 100]),
               (OP - 14, [size, size, 100]), (OP - 2, [0, 0, 100]), (OP, [0, 0, 100])], EASE_OUT)


def burst(ind0, cx, cy, t0, colors, n=8, r=110):
    out = []
    for k in range(n):
        ang = 2 * math.pi * k / n + 0.3
        out.append(shape_layer(ind0 + k, f'p{ind0 + k}', [ellipse(9 if k % 2 else 13, colors[k % len(colors)])], transform(
            kf([(t0, [cx, cy, 0]), (t0 + 26, [cx + math.cos(ang) * r, cy + math.sin(ang) * r * 0.8, 0])], EASE_OUT),
            s=kf([(t0, [60, 60, 100]), (t0 + 30, [0, 0, 100])])), OP, ip=t0))
    return out


def onboard_spend():
    card, coin, jar = asset('spend-card', 250), asset('roundup-coin', 120), asset('stash-jar', 230)
    card_ks = transform(kf([(0, [180, 200, 0]), (20, [180, 190, 0]), (32, [180, 214, 0]), (44, [180, 196, 0]), (OP, [180, 200, 0])]), a=(card['w'] / 2, card['h'] / 2),
                        r=kf([(0, [-8]), (26, [-2]), (40, [-10]), (OP, [-8])]))
    # the change: a coin pops off the card and arcs into the jar
    coin_ks = transform(kf([(30, [200, 220, 0]), (52, [250, 300, 0]), (74, [190, 440, 0])], EASE), a=(coin['w'] / 2, coin['h'] / 2),
                        s=kf([(30, [0, 0, 100]), (38, [110, 110, 100]), (66, [96, 96, 100]), (74, [55, 55, 100])]),
                        r=kf([(30, [0]), (74, [360])]), o=kf([(30, [100]), (72, [100]), (76, [0])]))
    jar_ks = transform((180, 560), a=(jar['w'] / 2, jar['h']),
                       s=kf([(0, [100, 100, 100]), (74, [100, 100, 100]), (80, [112, 86, 100]), (88, [95, 107, 100]), (96, [102, 98, 100]), (104, [100, 100, 100]), (OP, [100, 100, 100])]))
    return doc('onboard-spend', OW, OH, OP, [
        *burst(20, 180, 450, 76, [GOLD, MINT, INDIGO, PINK]),
        image_layer(1, 'roundup-coin', coin['w'], coin['h'], coin_ks, 78),
        image_layer(2, 'spend-card', card['w'], card['h'], card_ks, OP),
        image_layer(3, 'stash-jar', jar['w'], jar['h'], jar_ks, OP),
    ], [card, coin, jar])


def onboard_invest():
    jar = asset('stash-jar', 220)
    stocks = [asset(n, 128) for n in ('stock-chip', 'stock-index', 'stock-phone', 'stock-car')]
    spots = [(92, 170), (270, 150), (80, 330), (282, 315)]
    layers = []
    for k, (a, (x, y)) in enumerate(zip(stocks, spots)):
        t0 = 10 + k * 16
        # each stock rises out of the jar to its spot, then floats
        p = kf([(0, [180, 470, 0]), (t0, [180, 470, 0]), (t0 + 22, [x, y, 0]), (t0 + 52, [x, y - 8, 0]), (t0 + 82, [x, y + 6, 0]), (OP - 14, [x, y, 0]), (OP, [180, 470, 0])], EASE)
        layers.append(image_layer(1 + k, a['id'], a['w'], a['h'], transform(p, a=(a['w'] / 2, a['h'] / 2), s=pop_in(t0, 118), r=kf([(0, [0]), (t0 + 22, [(-1) ** k * 8]), (OP, [0])])), OP))
    jar_ks = transform((180, 600), a=(jar['w'] / 2, jar['h']),
                       s=kf([(0, [100, 100, 100]), (8, [106, 94, 100]), (18, [97, 104, 100]), (60, [104, 96, 100]), (72, [100, 100, 100]), (OP, [100, 100, 100])]))
    return doc('onboard-invest', OW, OH, OP, [*layers, *burst(30, 180, 430, 64, [MINT, GOLD, INDIGO]), image_layer(9, 'stash-jar', jar['w'], jar['h'], jar_ks, OP)], [*stocks, jar])


def onboard_squad():
    mega, chat, cup, pod = asset('megaphone', 190), asset('chat-bubbles', 170), asset('cup-big', 170), asset('podium', 260)
    mega_ks = transform(bob(110, 170, 7), a=(mega['w'] / 2, mega['h'] / 2),
                        r=kf([(0, [-10]), (8, [-2]), (16, [-12]), (24, [-4]), (32, [-10]), (OP, [-10])]),
                        s=kf([(0, [100, 100, 100]), (6, [108, 94, 100]), (14, [97, 104, 100]), (24, [100, 100, 100]), (OP, [100, 100, 100])]))
    chat_ks = transform(bob(262, 250, 9, phase=1.2), a=(chat['w'] / 2, chat['h'] / 2), s=pop_in(20, 120))
    cup_ks = transform(kf([(0, [180, 560, 0]), (60, [180, 560, 0]), (84, [180, 392, 0]), (120, [180, 384, 0]), (OP - 12, [180, 392, 0]), (OP, [180, 560, 0])], EASE_OUT),
                       a=(cup['w'] / 2, cup['h'] / 2), s=pop_in(60, 116), r=kf([(60, [0]), (84, [-6]), (100, [4]), (116, [0])]))
    pod_ks = transform((180, 560), a=(pod['w'] / 2, pod['h'] / 2))
    return doc('onboard-squad', OW, OH, OP, [
        *burst(40, 180, 380, 86, [GOLD, PINK, INDIGO, MINT], n=10, r=130),
        image_layer(1, 'cup-big', cup['w'], cup['h'], cup_ks, OP),
        image_layer(2, 'megaphone', mega['w'], mega['h'], mega_ks, OP),
        image_layer(3, 'chat-bubbles', chat['w'], chat['h'], chat_ks, OP),
        image_layer(4, 'podium', pod['w'], pod['h'], pod_ks, OP),
    ], [mega, chat, cup, pod])


def app_asset(name, size):
    """A cutout from app/assets/art (webp with alpha), embedded like asset()."""
    im = Image.open(os.path.join(HERE, '..', 'assets', 'art', f'{name}.webp')).convert('RGBA')
    im = im.crop(im.getbbox())
    im.thumbnail((size, size))
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return {'id': name, 'w': im.width, 'h': im.height, 'u': '', 'p': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(), 'e': 1}


def squad_war():
    """Two squads' crests charge in from each side, clash in the middle on a VS burst, shake, and reset (3 s loop)."""
    W, H, op = 400, 240, 180
    a, b, vs, ko = app_asset('crest-wolf', 150), app_asset('crest-flame', 150), app_asset('vs', 120), app_asset('ko-burst', 230)
    hit = 46
    def side(x0, x1, sign):
        return kf([(0, [x0, 120, 0]), (hit - 8, [x1 - sign * 18, 120, 0]), (hit, [x1, 118, 0]), (hit + 6, [x1 - sign * 26, 122, 0]),
                   (hit + 14, [x1 - sign * 8, 119, 0]), (hit + 20, [x1 - sign * 14, 120, 0]), (op - 20, [x1 - sign * 14, 120, 0]), (op, [x0, 120, 0])], EASE)
    def tilt(sign):
        return kf([(0, [sign * -14]), (hit, [sign * 8]), (hit + 8, [sign * -6]), (hit + 16, [0]), (op - 20, [0]), (op, [sign * -14])])
    def squash():
        return kf([(0, [100, 100, 100]), (hit, [100, 100, 100]), (hit + 4, [86, 112, 100]), (hit + 12, [104, 96, 100]), (hit + 20, [100, 100, 100]), (op, [100, 100, 100])])
    left = transform(side(-80, 128, 1), a=(a['w'] / 2, a['h'] / 2), r=tilt(1), s=squash())
    right = transform(side(W + 80, 272, -1), a=(b['w'] / 2, b['h'] / 2), r=tilt(-1), s=squash())
    burst_ks = transform((200, 120), a=(ko['w'] / 2, ko['h'] / 2),
                         s=kf([(0, [0, 0, 100]), (hit - 2, [0, 0, 100]), (hit + 8, [118, 118, 100]), (hit + 30, [96, 96, 100]), (op - 22, [96, 96, 100]), (op - 8, [0, 0, 100]), (op, [0, 0, 100])], EASE_OUT),
                         r=kf([(hit, [0]), (op, [40])]), o=kf([(0, [0]), (hit - 2, [0]), (hit + 2, [100]), (op - 14, [100]), (op - 6, [0]), (op, [0])]))
    vs_ks = transform((200, 120), a=(vs['w'] / 2, vs['h'] / 2),
                      s=kf([(0, [0, 0, 100]), (hit + 2, [0, 0, 100]), (hit + 12, [130, 130, 100]), (hit + 22, [100, 100, 100]), (hit + 60, [108, 108, 100]), (hit + 100, [100, 100, 100]), (op - 12, [100, 100, 100]), (op - 2, [0, 0, 100]), (op, [0, 0, 100])], EASE_OUT),
                      r=kf([(hit + 2, [-20]), (hit + 22, [0])]))
    sparks = []
    for k in range(12):
        ang = 2 * math.pi * k / 12
        col = [INDIGO, PINK, GOLD][k % 3]
        sparks.append(shape_layer(20 + k, f's{k}', [ellipse(12 if k % 2 else 8, col)], transform(
            kf([(hit, [200, 120, 0]), (hit + 28, [200 + math.cos(ang) * 150, 120 + math.sin(ang) * 95, 0])], EASE_OUT),
            s=kf([(hit, [100, 100, 100]), (hit + 34, [0, 0, 100])])), op, ip=hit))
    return doc('squad-war', W, H, op, [
        image_layer(1, 'vs', vs['w'], vs['h'], vs_ks, op),
        *sparks,
        image_layer(2, 'crest-wolf', a['w'], a['h'], left, op),
        image_layer(3, 'crest-flame', b['w'], b['h'], right, op),
        image_layer(4, 'ko-burst', ko['w'], ko['h'], burst_ks, op),
    ], [vs, a, b, ko])


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, make in [('coin-drop', coin_drop), ('heart-pop', heart_pop), ('confetti', confetti), ('flame', flame),
                       ('onboard-spend', onboard_spend), ('onboard-invest', onboard_invest), ('onboard-squad', onboard_squad), ('squad-war', squad_war)]:
        path = os.path.join(OUT, f'{name}.json')
        with open(path, 'w') as fh:
            json.dump(make(), fh, separators=(',', ':'))
        print(f'{name}.json {os.path.getsize(path) // 1024} KB')
