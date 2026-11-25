#!/usr/bin/env python3
"""Makes Clashy's four duel/Royale result animations as pure vector Lottie (bodymovin v5, 60 fps, transparent).

No raster images, no stock files: every shape, path and keyframe is computed here, with fixed random seeds, so the
output is the same on every run.

All four are 300 x 300 and sit over the 170 px clay result tile exactly like the old confetti did
(<Lottie size={300} style={{ left: -65, top: -70 }} />), so the tile's centre is (150, 155) in Lottie space and its
edges are x 65..235, y 70..240 with a 36 px corner radius. The effects live on the tile's rim and outside it, so the
clay character stays readable; flashes over the tile are brief.

  result-win.json         gold flash and shockwave, a spinning-coin burst with gravity, a gold rim glow and slow
                          light rays; then a 2 s seamless idle loop (glow breathes, rays sway, sparkles twinkle)
  result-lose.json        the tile dims, a red rim contracts inward (the opposite of the win's shockwave) and a few
                          grey crumbs chip off the bottom edge and fall; holds on the dimmed last frame
  result-liquidated.json  KO hit: white-to-red flash, a shake, a red starburst at the impact point, glass cracks that
                          draw out from it, shards that fly off and fall; the cracks stay on the last frame
  result-dead-heat.json   mirrored: a lavender orb (you) and a pink orb (rival) arrive from each side, each draws half
                          of the rim, white glints where the halves meet; then a 2 s loop of matched pulses

Markers (read by src/ui/lottie.tsx): "loop" (tm, dr) = the segment to loop after the intro; "still" (tm) = the frame
shown, not played, when the viewer asks for reduced motion.

  python3 app/scripts/make-result-lottie.py      -> app/assets/lottie/result-*.json
"""
import json, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'lottie')
FR, W, H = 60, 300, 300
CX, CY, TILE, RAD = 150, 155, 170, 36  # the clay tile under the animation
COIN = 28  # the shared coin's diameter


def hexc(h, a=1):
    h = h.lstrip('#')
    return [round(int(h[i:i + 2], 16) / 255, 4) for i in (0, 2, 4)] + [a]


GOLD, GOLD_DEEP, GOLD_RIM, GOLD_LIGHT = hexc('#FFC94A'), hexc('#E89B0C'), hexc('#B87508'), hexc('#FFF1B8')
WHITE, RED, RED_DEEP, RED_DARK = hexc('#FFFFFF'), hexc('#FF453A'), hexc('#C4271D'), hexc('#7A1812')
LAV, PINK, BLACK = hexc('#AB9FF2'), hexc('#F0468C'), hexc('#000000')
GREY, GREY_LIGHT = hexc('#4A4A55'), hexc('#7A7A86')

LINEAR = {'o': {'x': [0.0], 'y': [0.0]}, 'i': {'x': [1.0], 'y': [1.0]}}
EASE = {'o': {'x': [0.42], 'y': [0.0]}, 'i': {'x': [0.58], 'y': [1.0]}}
OUT_ = {'o': {'x': [0.16], 'y': [1.0]}, 'i': {'x': [0.3], 'y': [1.0]}}   # fast start, soft landing
IN_ = {'o': {'x': [0.55], 'y': [0.0]}, 'i': {'x': [0.9], 'y': [0.6]}}    # slow start, accelerates
BACK = {'o': {'x': [0.34], 'y': [1.56]}, 'i': {'x': [0.64], 'y': [1.0]}}  # overshoot


def r2(v):
    if isinstance(v, (list, tuple)):
        return [r2(x) for x in v]
    if isinstance(v, dict):
        return {k: r2(x) for k, x in v.items()}
    if isinstance(v, float):  # pixels and degrees to 0.1, colours and easing (0..1) to 0.001
        return round(v, 1) if abs(v) > 2 else round(v, 3)
    return v


def S(v):
    return {'a': 0, 'k': v}


def K(frames, ease=EASE):
    """[(t, value[, ease]), ...] -> animated property; ease applies to the segment that starts at that key."""
    out = []
    for i, f in enumerate(frames):
        t, v = f[0], f[1]
        k = {'t': t, 's': v if isinstance(v, list) else [v]}
        if i < len(frames) - 1:
            k.update(f[2] if len(f) > 2 else ease)
        out.append(k)
    return {'a': 1, 'k': out}


def tr(p=(0, 0), a=(0, 0), s=None, r=None, o=None):
    return {'ty': 'tr', 'p': p if isinstance(p, dict) else S(list(p)), 'a': S(list(a)),
            's': s or S([100, 100]), 'r': r or S(0), 'o': o or S(100), 'sk': S(0), 'sa': S(0)}


def gr(items, t=None, nm='g'):
    return {'ty': 'gr', 'nm': nm, 'it': items + [t or tr()]}


def fill(c, o=100):
    return {'ty': 'fl', 'c': c if isinstance(c, dict) else S(c), 'o': o if isinstance(o, dict) else S(o), 'r': 1}


def stroke(c, w, o=100):
    return {'ty': 'st', 'c': c if isinstance(c, dict) else S(c), 'o': o if isinstance(o, dict) else S(o),
            'w': w if isinstance(w, dict) else S(w), 'lc': 2, 'lj': 2}


def ell(d, p=(0, 0)):
    return {'ty': 'el', 'p': S(list(p)), 's': d if isinstance(d, dict) else S([d, d] if not isinstance(d, list) else d), 'd': 1}


def rrect(w, h, r, p=(0, 0)):
    return {'ty': 'rc', 'p': S(list(p)), 's': S([w, h]), 'r': S(r), 'd': 1}


def path(v, closed=True, ins=None, outs=None):
    z = [[0, 0]] * len(v)
    return {'ty': 'sh', 'ks': S({'v': v, 'i': ins or z, 'o': outs or z, 'c': closed})}


def trim(s, e, o=S(0)):
    return {'ty': 'tm', 's': s if isinstance(s, dict) else S(s), 'e': e if isinstance(e, dict) else S(e), 'o': o, 'm': 1}


def radial(stops, alphas, center, radius, o=100):
    """stops [(pos, color)], alphas [(pos, alpha 0..1)]; a radial gradient fill."""
    k = []
    for p, c in stops:
        k += [p] + c[:3]
    for p, a in alphas:
        k += [p, a]
    return {'ty': 'gf', 'o': S(o), 'r': 1, 'g': {'p': len(stops), 'k': S(k)}, 's': S(list(center)),
            'e': S([center[0] + radius, center[1]]), 't': 2, 'h': S(0), 'a': S(0)}


def ks(p=(0, 0), a=(0, 0), s=None, r=None, o=None):
    return {'p': p if isinstance(p, dict) else S(list(p) + [0]), 'a': S(list(a) + [0]),
            's': s or S([100, 100, 100]), 'r': r or S(0), 'o': o or S(100)}


class Doc:
    def __init__(self, name, op):
        self.name, self.op, self.layers, self.markers, self.assets = name, op, [], [], []

    def add(self, nm, shapes, k=None, ip=0, op=None, parent=None):
        """Layers are added top-most first."""
        L = {'ddd': 0, 'ind': len(self.layers) + 1, 'ty': 4, 'nm': nm, 'sr': 1, 'ks': k or ks(), 'ao': 0,
             'shapes': shapes, 'ip': ip, 'op': op or self.op, 'st': 0, 'bm': 0}
        if parent:
            L['parent'] = parent
        self.layers.append(L)
        return L['ind']

    def precomp(self, ref, size, k, ip, op):
        """A layer that places a shared drawing (self.assets) - one copy of the shapes, many transforms."""
        self.layers.append({'ddd': 0, 'ind': len(self.layers) + 1, 'ty': 0, 'nm': ref, 'refId': ref, 'sr': 1, 'ks': k, 'ao': 0,
                            'w': size, 'h': size, 'ip': ip, 'op': op, 'st': 0, 'bm': 0})

    def null(self, nm, k):
        self.layers.append({'ddd': 0, 'ind': len(self.layers) + 1, 'ty': 3, 'nm': nm, 'sr': 1, 'ks': k, 'ao': 0,
                            'ip': 0, 'op': self.op, 'st': 0, 'bm': 0})
        return self.layers[-1]['ind']

    def json(self):
        return r2({'v': '5.7.4', 'fr': FR, 'ip': 0, 'op': self.op, 'w': W, 'h': H, 'nm': self.name, 'ddd': 0,
                   'assets': self.assets, 'layers': self.layers, 'markers': self.markers})


# ---------- shared pieces ----------

def rim_glow(color, light, scale=0):
    """A soft glow that hugs the rounded tile: stacked strokes, brightest and thinnest on the inside."""
    rings = [(TILE + 3, 2.5, light, 100), (TILE + 9, 7, color, 42), (TILE + 17, 11, color, 24), (TILE + 27, 15, color, 14),
             (TILE + 39, 19, color, 8), (TILE + 53, 23, color, 4.5), (TILE + 69, 27, color, 2.5)]
    return [gr([rrect(d, d, RAD + (d - TILE) / 2), stroke(c, w, o)], nm=f'rim{d}') for d, w, c, o in rings]


def star4(size, inner=0.2):
    """A four-point twinkle with concave sides."""
    v, ins, outs = [], [], []
    for k in range(4):
        a = -math.pi / 2 + k * math.pi / 2
        v.append([math.cos(a) * size, math.sin(a) * size])
        ins.append([0, 0]); outs.append([0, 0])
        b = a + math.pi / 4
        v.append([math.cos(b) * size * inner, math.sin(b) * size * inner])
        ins.append([0, 0]); outs.append([0, 0])
    return path(v)


def spiky(n, ro, ri, jitter, rnd):
    v = []
    for k in range(n * 2):
        a = -math.pi / 2 + k * math.pi / n + rnd.uniform(-0.08, 0.08)
        r = (ro if k % 2 == 0 else ri) * rnd.uniform(1 - jitter, 1 + jitter * 0.4)
        v.append([math.cos(a) * r, math.sin(a) * r])
    return path(v)


def ballistic(p0, v0, g, t0, t1, every=4, drag=0.985):
    """Positions of a particle under gravity, sampled every few frames (linear between samples)."""
    x, y = p0; vx, vy = v0
    out, t = [], t0
    while True:
        out.append((t, [x, y, 0], LINEAR))
        if t >= t1:
            break
        for _ in range(every):
            x += vx; y += vy; vy += g; vx *= drag; vy *= drag
        t += every
    return out


def ring_wave(d0, d1, w0, w1, color, t0, t1, o0=90, center=(CX, CY), rounded=True):
    """Expanding (or contracting) outline of the tile shape (or a circle)."""
    if rounded:
        sz = K([(t0, [d0, d0], OUT_), (t1, [d1, d1])])
        shape = {'ty': 'rc', 'p': S([0, 0]), 's': sz, 'r': K([(t0, RAD * d0 / TILE, OUT_), (t1, RAD * d1 / TILE)]), 'd': 1}
    else:
        shape = ell(K([(t0, [d0, d0], OUT_), (t1, [d1, d1])]))
    return gr([shape, stroke(color, K([(t0, w0, OUT_), (t1, w1)]), K([(t0, 0, LINEAR), (t0 + 2, o0), (t1, 0)]))], tr(center))


# ---------- WIN ----------

def coin(dia):
    """A vector gold coin: rim, face, inner ring, struck star, shine."""
    f = dia / 2
    return [
        gr([ell([dia * 0.34, dia * 0.16], (-f * 0.32, -f * 0.42)), fill(WHITE, 75)], tr(r=S(-30)), 'shine'),
        gr([star4(f * 0.42, 0.42), fill(GOLD_DEEP)], nm='mark'),
        gr([ell(dia * 0.62), stroke(GOLD_LIGHT, max(1.2, dia * 0.05), 85)], nm='ring'),
        gr([ell(dia * 0.86, (0, -dia * 0.02)), fill(GOLD)], nm='face'),
        gr([ell(dia), fill(GOLD_RIM)], nm='rim'),
    ]


def win():
    d = Doc('result-win', 240)
    LOOP0, LOOP1 = 120, 240
    d.markers = [{'tm': LOOP0, 'cm': 'loop', 'dr': LOOP1 - LOOP0}, {'tm': LOOP0, 'cm': 'still', 'dr': 0}]
    rnd = random.Random(11)
    # one vector coin, drawn once and placed by every coin layer
    d.assets.append({'id': 'coin', 'layers': [{'ddd': 0, 'ind': 1, 'ty': 4, 'nm': 'coin', 'sr': 1, 'ks': ks((20, 20)), 'ao': 0,
                                               'shapes': coin(COIN), 'ip': 0, 'op': d.op, 'st': 0, 'bm': 0}]})

    # twinkles (top): a few pop during the burst, then three twinkle per loop
    tw = [(140, 70, 12, 26), (243, 112, 9, 34), (58, 222, 10, 30), (232, 238, 8, 22), (72, 86, 7, 40), (190, 40, 9, 14)]
    for i, (x, y, sz, t0) in enumerate(tw):
        sc = [(t0, [0, 0], BACK), (t0 + 10, [100, 100], EASE), (t0 + 26, [0, 0])]
        # loop twinkles: staggered so the loop always has something alive; start and end at 0 for a seamless wrap
        lt = LOOP0 + 6 + i * 16
        sc += [(lt, [0, 0], BACK), (lt + 12, [100, 100], EASE), (lt + 30, [0, 0])]
        d.add(f'twinkle{i}', [gr([star4(sz), fill(GOLD_LIGHT)]), gr([ell(sz * 0.5), fill(WHITE)])],
              ks((x, y), s=K([(f[0], f[1] + [100], f[2]) if len(f) > 2 else (f[0], f[1] + [100]) for f in sc]),
                 r=K([(0, 0, LINEAR), (LOOP1, 90)])))

    # coins: burst from the rim, spin (scale-x flip), arc under gravity, fade
    for i in range(18):
        side = -1 if i % 2 else 1
        ang = -math.pi / 2 + side * rnd.uniform(0.15, 1.35)
        ux, uy = math.cos(ang), math.sin(ang)
        rx, ry = CX + ux * 78, CY + uy * 78
        spd = rnd.uniform(2.2, 3.6)
        t0 = 5 + (i * 5) % 22
        life = rnd.randint(62, 80)
        pts = ballistic((rx, ry), (ux * spd, uy * spd - 1.6), 0.13, t0, t0 + life, every=6)
        k = rnd.choice([20, 22, 24, 26, 28]) / COIN * 100  # size as a % of the shared 28 px coin
        spin = rnd.choice([12, 14, 16])
        sc = [(t0, [0, 0, 100], BACK)] + [(t0 + 9 + j * spin, [k if j % 2 == 0 else k * 0.12, k, 100]) for j in range(life // spin + 1)]
        d.precomp('coin', 40, ks(K(pts), a=(20, 20), s=K(sc), r=K([(t0, rnd.uniform(-30, 30), LINEAR), (t0 + life, rnd.uniform(-90, 90))]),
                                o=K([(t0, 100), (t0 + life - 16, 100), (t0 + life, 0)])), t0, t0 + life + 1)

    # gold shockwave from the tile edge, and a white flash over the tile
    d.add('shock', [ring_wave(TILE, TILE + 120, 10, 1, GOLD_LIGHT, 2, 34),
                    ring_wave(TILE, TILE + 70, 5, 1, WHITE, 0, 22, 70)], ip=0, op=40)
    d.add('flash', [gr([rrect(TILE, TILE, RAD), fill(GOLD_LIGHT)])], ks((CX, CY), o=K([(0, 0, LINEAR), (3, 55, OUT_), (22, 0)])), op=24)

    # rim glow: blooms in, then breathes through the loop (same value at both ends of the loop)
    d.add('glow', rim_glow(GOLD, GOLD_LIGHT), ks((CX, CY), s=K([(0, [92, 92, 100], BACK), (18, [100, 100, 100]), (LOOP0, [100, 100, 100], EASE),
                                                                    (180, [103, 103, 100], EASE), (LOOP1, [100, 100, 100])]),
                                                   o=K([(0, 0), (10, 100), (60, 85), (LOOP0, 85), (180, 100), (LOOP1, 85)])))

    # light rays outside the tile: 13 slim wedges (long/short, none pointing down at the title) with a gold-to-clear radial fill; they sway in the loop
    v_all = []
    for k in range(16):
        if k in (3, 4, 5):  # 67.5..112.5 deg points down at the title
            continue
        a = k * math.pi / 8
        r1, r2_ = 110, (150 if k % 2 == 0 else 134)
        w1, w2 = 0.018, (0.05 if k % 2 == 0 else 0.035)
        v_all.append(path([[math.cos(a - w1) * r1, math.sin(a - w1) * r1], [math.cos(a - w2) * r2_, math.sin(a - w2) * r2_],
                           [math.cos(a + w2) * r2_, math.sin(a + w2) * r2_], [math.cos(a + w1) * r1, math.sin(a + w1) * r1]]))
    rays = gr(v_all + [radial([(0, GOLD), (1, GOLD_DEEP)], [(0, 0), (0.73, 0.42), (0.86, 0.18), (1, 0)], (0, 0), 152)])
    d.add('rays', [rays], ks((CX, CY), r=K([(0, -18, OUT_), (LOOP0, 0, EASE), (180, 6, EASE), (LOOP1, 0)]),
                             s=K([(4, [60, 60, 100], OUT_), (40, [100, 100, 100])]), o=K([(4, 0), (30, 100)])))
    return d


# ---------- LOSE ----------

def lose():
    d = Doc('result-lose', 110)
    d.markers = [{'tm': 109, 'cm': 'still', 'dr': 0}]
    rnd = random.Random(5)
    # crumbs chip off the bottom edge and fall (grey, a couple in muted red); not gory, just "it crumbled"
    for i in range(16):
        # off the two bottom corners, drifting outward, so nothing falls across the "You lost" title under the tile
        side = 1 if i % 2 else -1
        phi = math.radians(rnd.uniform(0, 55))
        x = CX + side * (TILE / 2 - RAD + RAD * math.cos(phi))
        y = CY + TILE / 2 - RAD + RAD * math.sin(phi)
        t0 = 12 + rnd.randint(0, 34)
        life = rnd.randint(40, 52)
        pts = ballistic((x, y), (side * rnd.uniform(0.8, 1.7), rnd.uniform(-0.9, 0.3)), 0.1, t0, t0 + life, every=4, drag=0.99)
        sz = rnd.uniform(6.5, 12)
        v = [[math.cos(a) * sz * rnd.uniform(0.6, 1), math.sin(a) * sz * rnd.uniform(0.6, 1)] for a in
             sorted(rnd.uniform(0, 2 * math.pi) for _ in range(5))]
        col = [GREY_LIGHT, hexc('#5E5E6A'), hexc('#9A9AA6'), hexc('#A8453E')][i % 4]
        d.add(f'crumb{i}', [gr([path(v), stroke(WHITE, 0.8, 22), fill(col)], tr(s=K([(t0, [40, 40], BACK), (t0 + 6, [100, 100])])))],
              ks(K(pts), r=K([(t0, 0, LINEAR), (t0 + life, rnd.uniform(-160, 160))]),
                 o=K([(t0, 100), (t0 + life - 16, 90), (t0 + life, 0)])), ip=t0, op=t0 + life + 1)
    # dust puffs at the corners where it crumbles
    for i, (x, t0) in enumerate([(CX - 74, 22), (CX + 74, 26)]):
        d.add(f'puff{i}', [gr([ell(40), radial([(0, GREY_LIGHT), (1, GREY)], [(0, 0.5), (1, 0)], (0, 0), 20)])],
              ks((x, 232), s=K([(t0, [30, 30, 100], OUT_), (t0 + 44, [150, 110, 100])]), o=K([(t0, 0), (t0 + 6, 60), (t0 + 44, 0)])),
              ip=t0, op=t0 + 41)
    # the rim contracts inward (win expands, lose implodes)
    d.add('sink', [ring_wave(TILE + 70, TILE - 6, 1.5, 6, RED, 0, 30, 0)], op=40)
    d.layers[-1]['shapes'][0]['it'][1]['o'] = K([(0, 0), (8, 70), (30, 0)])
    # the tile dims, the red rim settles low and stays
    d.add('dim', [gr([rrect(TILE, TILE, RAD), fill(BLACK)])], ks((CX, CY), o=K([(10, 0), (70, 30)])))
    d.add('rim', rim_glow(RED, hexc('#FF8A80')), ks(K([(6, [CX, CY, 0], EASE), (80, [CX, CY + 5, 0])]),
                                                 s=K([(6, [106, 106, 100], OUT_), (40, [100, 100, 100]), (90, [98.5, 98.5, 100])]),
                                                 o=K([(4, 0), (22, 70), (90, 24)])))
    return d


# ---------- LIQUIDATED ----------

def crack_paths(rnd, ix, iy):
    """Glass cracks from the impact point, kept inside the tile, plus a spider-web ring."""
    lo_x, hi_x, lo_y, hi_y = CX - TILE / 2 + 10, CX + TILE / 2 - 10, CY - TILE / 2 + 10, CY + TILE / 2 - 10
    branches, ring_pts = [], []
    n = 7
    for k in range(n):
        a = k * 2 * math.pi / n + rnd.uniform(-0.25, 0.25)
        pts = [[0, 0]]
        x = y = 0.0
        length = rnd.uniform(70, 120)
        travelled = 0
        while travelled < length:
            seg = rnd.uniform(11, 20)
            a += rnd.uniform(-0.42, 0.42)
            nx, ny = x + math.cos(a) * seg, y + math.sin(a) * seg
            if not (lo_x < ix + nx < hi_x and lo_y < iy + ny < hi_y):
                break
            x, y = nx, ny
            pts.append([x, y])
            travelled += seg
        branches.append(pts)
        if len(pts) > 2:
            ring_pts.append(pts[2] if math.hypot(*pts[2]) < 40 else pts[1])
        # a short side branch
        if len(pts) > 3 and rnd.random() < 0.75:
            bx, by = pts[2]
            b = a + rnd.choice([-1, 1]) * rnd.uniform(0.6, 1.0)
            side = [[bx, by]]
            for _ in range(rnd.randint(1, 3)):
                b += rnd.uniform(-0.3, 0.3)
                bx, by = bx + math.cos(b) * rnd.uniform(9, 15), by + math.sin(b) * rnd.uniform(9, 15)
                if not (lo_x < ix + bx < hi_x and lo_y < iy + by < hi_y):
                    break
                side.append([bx, by])
            if len(side) > 1:
                branches.append(side)
    ring_pts.sort(key=lambda p: math.atan2(p[1], p[0]))
    return branches, ring_pts


def liquidated():
    d = Doc('result-liquidated', 120)
    d.markers = [{'tm': 119, 'cm': 'still', 'dr': 0}]
    rnd = random.Random(23)
    IX, IY = 176, 128  # impact point, upper right of the tile centre
    shake = d.null('shake', ks(K([(0, [0, 0, 0], LINEAR), (2, [9, -7, 0], LINEAR), (5, [-8, 6, 0], LINEAR), (8, [6, 4, 0], LINEAR),
                                   (11, [-5, -3, 0], LINEAR), (14, [3, 2, 0], LINEAR), (18, [-1, 0, 0], LINEAR), (22, [0, 0, 0])])))

    # shards (top): glassy triangles in red, white and dark red fly off the impact and fall
    for i in range(14):
        a = rnd.uniform(-math.pi - 0.2, 0.45)  # up and out of the impact, not down across the title
        spd = rnd.uniform(3.2, 6.5)
        t0 = 2 + rnd.randint(0, 4)
        life = rnd.randint(36, 52)
        pts = ballistic((IX + math.cos(a) * 10, IY + math.sin(a) * 10), (math.cos(a) * spd, math.sin(a) * spd - 1.5), 0.13, t0, t0 + life)
        sz = rnd.uniform(7, 15)
        tri = [[0, -sz], [sz * rnd.uniform(0.5, 0.9), sz * rnd.uniform(0.3, 0.7)], [-sz * rnd.uniform(0.4, 0.8), sz * rnd.uniform(0.2, 0.6)]]
        col, op_ = [(RED, 100), (WHITE, 85), (RED_DARK, 100), (hexc('#FF8A80'), 100)][i % 4]
        d.add(f'shard{i}', [gr([path(tri), stroke(WHITE, 0.8, 35), fill(col, op_)])],
              ks(K(pts), r=K([(t0, rnd.uniform(0, 90), LINEAR), (t0 + life, rnd.uniform(-420, 420))]),
                 s=K([(t0, [40, 40, 100], OUT_), (t0 + 8, [100, 100, 100]), (t0 + life, [70, 70, 100])]),
                 o=K([(t0, 100), (t0 + life - 14, 100), (t0 + life, 0)])), ip=t0, op=t0 + life + 1, parent=shake)

    # KO starburst at the impact
    d.add('burst', [gr([spiky(7, 30, 13, 0.25, rnd), fill(WHITE)]), gr([spiky(11, 66, 30, 0.3, rnd), fill(RED)])],
          ks((IX, IY), s=K([(1, [0, 0, 100], OUT_), (6, [118, 118, 100], EASE), (14, [92, 92, 100], IN_), (24, [0, 0, 100])]),
             r=K([(1, -12), (24, 14)]), o=K([(1, 100), (16, 100), (24, 0)])), op=26, parent=shake)

    # cracks draw out from the impact (white over a red bloom), then stay
    branches, ring = crack_paths(rnd, IX, IY)
    crack_shapes = [path(b, closed=False) for b in branches]
    ring_shape = path(ring, closed=True)
    draw = trim(0, K([(3, 0, OUT_), (14, 100)]))
    draw_ring = trim(0, K([(9, 0, OUT_), (20, 100)]))
    d.add('cracks', [
        gr([ring_shape, draw_ring, stroke(WHITE, 1.6, 90)], nm='web'),
        gr(crack_shapes + [draw, stroke(WHITE, 2.2, 100)], nm='lines'),
        gr([ring_shape, draw_ring, stroke(RED, 5, 40)], nm='webGlow'),
        gr(crack_shapes + [trim(0, K([(3, 0, OUT_), (14, 100)])), stroke(RED, 7, K([(3, 70), (40, 35)]))], nm='glow'),
        gr([ell(9), fill(WHITE)], tr((0, 0)), 'pit'),
    ], ks((IX, IY), o=K([(0, 100), (60, 100), (119, 88)])), parent=shake)

    # shockwaves from the impact
    d.add('shock', [ring_wave(20, 300, 9, 1, RED, 2, 28, 95, center=(IX, IY), rounded=False),
                    ring_wave(10, 200, 4, 1, WHITE, 1, 20, 85, center=(IX, IY), rounded=False)], op=30, parent=shake)

    # the hit flash over the whole tile: white, then red, then gone
    d.add('flash', [gr([rrect(TILE, TILE, RAD), fill(K([(0, WHITE, LINEAR), (5, RED)]))])],
          ks((CX, CY), o=K([(0, 92, LINEAR), (5, 55, OUT_), (28, 0)])), op=30, parent=shake)

    # red rim: hard on impact, settles to a low warning glow
    d.add('rim', rim_glow(RED, hexc('#FF8A80')), ks((CX, CY), s=K([(0, [112, 112, 100], OUT_), (18, [100, 100, 100])]),
                                                 o=K([(0, 100), (40, 60), (119, 30)])), parent=shake)
    return d


# ---------- DEAD HEAT ----------

def rr_half(side, d=TILE + 8):
    """Half of the tile's rounded outline: 'right' runs top-centre -> right -> bottom-centre, 'left' the mirror.
    Corner arcs as cubic beziers (kappa 0.5523)."""
    h, r, k = d / 2, RAD + 4, 0.5523
    s = 1 if side == 'right' else -1
    v = [[0, -h], [s * (h - r), -h], [s * h, -h + r], [s * h, 0], [s * h, h - r], [s * (h - r), h], [0, h]]
    o = [[0, 0], [s * r * k, 0], [0, 0], [0, 0], [0, r * k], [0, 0], [0, 0]]
    i = [[0, 0], [0, 0], [0, -r * k], [0, 0], [0, 0], [s * r * k, 0], [0, 0]]
    return path(v, closed=False, ins=i, outs=o)


def dead_heat():
    d = Doc('result-dead-heat', 210)
    LOOP0, LOOP1 = 90, 210
    d.markers = [{'tm': LOOP0, 'cm': 'loop', 'dr': LOOP1 - LOOP0}, {'tm': LOOP0, 'cm': 'still', 'dr': 0}]
    beats = [LOOP0, LOOP0 + 60]  # one pulse a second, both sides in lockstep

    # glints where the halves meet (top and bottom centre)
    for j, gy in enumerate([CY - TILE / 2 - 4, CY + TILE / 2 + 4]):
        sc = [(48, [0, 0, 100], BACK), (56, [100, 100, 100], EASE), (74, [0, 0, 100])]
        for b in beats:
            sc += [(b, [0, 0, 100], BACK), (b + 8, [80, 80, 100], EASE), (b + 26, [0, 0, 100])]
        d.add(f'glint{j}', [gr([star4(11, 0.18), fill(WHITE)]), gr([ell(16), fill(WHITE, 25)])], ks((CX, gy), s=K(sc), r=S(0)))

    for side, col, sgn in (('left', LAV, -1), ('right', PINK, 1)):
        ex = CX + sgn * (TILE / 2 + 4)
        # orb: flies in from its side, lands on the tile edge, then beats
        osc = [(0, [60, 60, 100], OUT_), (24, [100, 100, 100], BACK), (30, [150, 150, 100], EASE), (44, [100, 100, 100])]
        for b in beats:
            osc += [(b, [100, 100, 100], OUT_), (b + 8, [140, 140, 100], EASE), (b + 30, [100, 100, 100])]
        osc.append((LOOP1, [100, 100, 100]))
        d.add(f'orb-{side}', [gr([ell(10), fill(WHITE)]), gr([ell(16), fill(col)]), gr([ell(28), fill(col, 30)]), gr([ell(44), fill(col, 12)])],
              ks(K([(0, [CX + sgn * 170, CY, 0], OUT_), (24, [ex, CY, 0])]), s=K(osc)))
        # its half of the rim draws outward from the landing point, then glows
        half = rr_half(side)
        draw = trim(K([(24, 50, OUT_), (50, 0)]), K([(24, 50, OUT_), (50, 100)]))
        d.add(f'half-{side}', [gr([half, draw, stroke(WHITE, 2, 90)]), gr([half, draw, stroke(col, 6, 85)]),
                               gr([half, draw, stroke(col, 14, 22)])],
              ks((CX, CY), o=K([(24, 100)] + sum([[(b, 100), (b + 10, 100), (b + 40, 82)] for b in beats], []) + [(LOOP1, 100)])))
        # matched ripples: each half sends a wave outward on every beat
        for n, b in enumerate([50] + beats):
            d.add(f'ripple-{side}{n}', [gr([half, stroke(col, K([(b, 5, OUT_), (b + 40, 1)]), K([(b, 70), (b + 40, 0)]))])],
                  ks((CX, CY), s=K([(b, [100, 100, 100], OUT_), (b + 40, [124, 124, 100])])), ip=b, op=b + 41)
    return d


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for make in (win, lose, liquidated, dead_heat):
        doc = make()
        path_ = os.path.join(OUT, f'{doc.name}.json')
        with open(path_, 'w') as fh:
            json.dump(doc.json(), fh, separators=(',', ':'))
        print(f'{doc.name}.json  {os.path.getsize(path_) / 1024:.1f} KB  {doc.op} frames @ {FR} fps  {len(doc.layers)} layers')
