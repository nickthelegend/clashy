#!/bin/zsh
# Converts the raw ChatGPT PNGs (clashy-web-*.png, clashy-mobile-*.png) in $1 into
#   assets/web/*.webp and assets/mobile/*.webp (+ the 1024 app icon PNG) at full quality, and
#   web/public/art/* at the sizes the website uses.
# The "bold sticker" set (v5) is mostly transparent PNG; scenes, splash and onboarding sit on black.
set -e
RAW=${1:?raw dir}
ROOT=${0:A:h:h}
W=$ROOT/assets/web; M=$ROOT/assets/mobile; D=$ROOT/assets/desktop; P=$ROOT/web/public/art
mkdir -p $W $M $D $P
q() { cwebp -quiet -q 88 -alpha_q 95 "$@" }
for f in $RAW/clashy-web-*.png(N); do
  n=${${f:t:r}#clashy-web-}
  case $n in
    og)
      q $f -o $W/og.webp
      sips -s format jpeg -s formatOptions 86 --resampleWidth 1200 $f --out /tmp/clashy-og-$$.jpg >/dev/null
      sips -c 630 1200 /tmp/clashy-og-$$.jpg --out $P/og.jpg >/dev/null; rm -f /tmp/clashy-og-$$.jpg ;;
    hero-scene|faceoff|arena)
      q $f -o $W/$n.webp
      q -resize 1600 0 $f -o $P/$n.webp ;;
    *)
      q -resize 1024 0 $f -o $W/$n.webp
      sz=480; [[ $n == swords ]] && sz=1000
      q -resize $sz 0 $f -o $P/$n.webp ;;
  esac
done
for f in $RAW/clashy-mobile-*.png(N); do
  n=${${f:t:r}#clashy-mobile-}
  case $n in
    app-icon)
      sips -z 1024 1024 $f --out $M/app-icon-1024.png >/dev/null
      q $M/app-icon-1024.png -o $M/app-icon.webp
      q -resize 128 128 $M/app-icon-1024.png -o $P/icon-128.webp
      sips -z 64 64 $M/app-icon-1024.png --out $P/icon-64.png >/dev/null ;;
    profile-banner) q -resize 1536 0 $f -o $M/$n.webp ;;
    banner-*)
      # 16:9 mode banners: centre-crop to 16:9 if needed, then 1600x900
      python3 -I -c "import sys;from PIL import Image;im=Image.open(sys.argv[1]);w,h=im.size;th=round(w*9/16)
if th<=h: im=im.crop((0,(h-th)//2,w,(h-th)//2+th))
else:
  tw=round(h*16/9); im=im.crop(((w-tw)//2,0,(w-tw)//2+tw,h))
im.resize((1600,900),Image.LANCZOS).save(sys.argv[2])" $f /tmp/clashy-banner-$$.png
      q /tmp/clashy-banner-$$.png -o $M/$n.webp; rm -f /tmp/clashy-banner-$$.png ;;
    *) q -resize 1024 0 $f -o $M/$n.webp ;;
  esac
  case $n in
    avatar-*) q -resize 192 0 $f -o $P/av-${n#avatar-}.webp ;;
    crest-*|badge-*|medal-*|sticker-*) q -resize 200 0 $f -o $P/$n.webp ;;
    crown|ko-burst|empty-*) q -resize 400 0 $f -o $P/$n.webp ;;
    onboarding|splash|matchmaking|tile-*) q -resize 640 0 $f -o $P/m-$n.webp ;;
  esac
done
for f in $RAW/clashy-desktop-*.png(N); do
  n=${${f:t:r}#clashy-desktop-}
  case $n in
    hero-home)
      # composed as one horizontal band across the middle third: crop to 4:1, then 2400x600
      python3 -I -c "import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert('RGB');w,h=im.size;bh=w//4;t=(h-bh)//2
im.crop((0,t,w,t+bh)).resize((2400,600),Image.LANCZOS).save(sys.argv[2])" $f /tmp/clashy-hero-$$.png
      q /tmp/clashy-hero-$$.png -o $D/$n.webp; rm -f /tmp/clashy-hero-$$.png ;;
    *) q -resize 512 0 $f -o $D/$n.webp ;;
  esac
done
du -sh $W $M $D $P
