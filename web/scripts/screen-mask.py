# Builds public/a/screen-mask.png from the white screen area of assets/web/phone-hand.webp,
# so real app screenshots can be masked into the clay phone exactly (notch and corners included).
import sys
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
W, H = im.size
px = im.load()
m = Image.new('L', (W, H), 0)
mp = m.load()
for y in range(H):
    for x in range(W):
        r, g, b, a = px[x, y]
        if a > 240 and r > 238 and g > 238 and b > 238:
            mp[x, y] = 255
m = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1))
bbox = m.getbbox()
# CSS masks read the alpha channel, so the mask is white with alpha = screen coverage
rgba = Image.new('RGBA', (W, H), (255, 255, 255, 0))
rgba.putalpha(m)
rgba.resize((W // 2, H // 2)).save(out)
print('screen bbox', bbox, 'of', W, H)
