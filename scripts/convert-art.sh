#!/bin/zsh
# Converts raw ChatGPT PNGs (clashy-web-*.png, clashy-mobile-*.png, clashy-desktop-*.png) in $1 into
#   assets/web, assets/mobile and assets/desktop as WebP (+ the 1024 app icon PNG).
# Clay set (v6): objects and characters are transparent; banners, onboarding, splash and scenes sit on black.
# web/ is owned by the landing rebuild, so this script never writes there.
set -e
RAW=${1:?raw dir}
ROOT=${0:A:h:h}
W=$ROOT/assets/web; M=$ROOT/assets/mobile; D=$ROOT/assets/desktop
mkdir -p $W $M $D
q() { cwebp -quiet -q 88 -alpha_q 95 "$@" }
# fit an image onto a transparent canvas of exactly WxH (keeps aspect, centres it)
fit() { python3 -I -c "import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert('RGBA');W,H=int(sys.argv[3]),int(sys.argv[4])
s=min(W/im.width,H/im.height);im=im.resize((round(im.width*s),round(im.height*s)),Image.LANCZOS)
c=Image.new('RGBA',(W,H),(0,0,0,0));c.paste(im,((W-im.width)//2,(H-im.height)//2),im);c.save(sys.argv[2])" "$@" }
# crop to an exact aspect from the centre, then resize to WxH (for opaque scenes)
cropfit() { python3 -I -c "import sys;from PIL import Image;im=Image.open(sys.argv[1]);W,H=int(sys.argv[3]),int(sys.argv[4]);w,h=im.size
if w/h>W/H: nw=round(h*W/H);im=im.crop(((w-nw)//2,0,(w-nw)//2+nw,h))
else: nh=round(w*H/W);im=im.crop((0,(h-nh)//2,w,(h-nh)//2+nh))
im.resize((W,H),Image.LANCZOS).save(sys.argv[2])" "$@" }
T=/tmp/clashy-conv-$$.png
for f in $RAW/clashy-web-*.png(N); do
  n=${${f:t:r}#clashy-web-}
  case $n in
    hero-duo) fit $f $T 2000 1400; q $T -o $W/$n.webp ;;
    phone-hand) fit $f $T 1400 1800; q $T -o $W/$n.webp ;;
    coins-pile|clan-banner) fit $f $T 1600 1000; q $T -o $W/$n.webp ;;
    og) q $f -o $W/og.webp ;;
    hero-scene|faceoff|arena) q $f -o $W/$n.webp ;;
    *) fit $f $T 1024 1024; q $T -o $W/$n.webp ;;
  esac
done
for f in $RAW/clashy-mobile-*.png(N); do
  n=${${f:t:r}#clashy-mobile-}
  case $n in
    app-icon)
      sips -z 1024 1024 $f --out $M/app-icon-1024.png >/dev/null
      q $M/app-icon-1024.png -o $M/app-icon.webp ;;
    banner-*) cropfit $f $T 1600 900; q $T -o $M/$n.webp ;;
    onboard-*|onboarding|splash) cropfit $f $T 1024 1536; q $T -o $M/$n.webp ;;
    profile-banner) q -resize 1536 0 $f -o $M/$n.webp ;;
    *) fit $f $T 1024 1024; q $T -o $M/$n.webp ;;
  esac
done
for f in $RAW/clashy-desktop-*.png(N); do
  n=${${f:t:r}#clashy-desktop-}
  case $n in
    hero-home) cropfit $f $T 2400 600; q $T -o $D/$n.webp ;;
    *) fit $f $T 512 512; q $T -o $D/$n.webp ;;
  esac
done
mkdir -p $M/fx
for f in $RAW/clashy-fx-*.png(N); do
  n=${${f:t:r}#clashy-}
  case $n in
    fx-round) fit $f $T 1600 600 ;;
    fx-heart|fx-heart-broken) fit $f $T 512 512 ;;
    *) fit $f $T 1024 1024 ;;
  esac
  q $T -o $M/fx/$n.webp
done
rm -f $T
du -sh $W $M $D
