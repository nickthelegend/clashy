#!/bin/zsh
# Converts the raw ChatGPT PNGs (clashy-web-*.png, clashy-mobile-*.png) in $1 into
#   assets/web/*.webp and assets/mobile/*.webp (+ the 1024 app icon PNG) at full quality, and
#   web/public/art/* at the sizes the website uses.
# The "duel light" set is rendered on pure black, so nothing needs an alpha channel; the site
# blends objects into dark cards with mix-blend-mode: screen.
set -e
RAW=${1:?raw dir}
ROOT=${0:A:h:h}
W=$ROOT/assets/web; M=$ROOT/assets/mobile; P=$ROOT/web/public/art
mkdir -p $W $M $P
for f in $RAW/clashy-web-*.png(N); do
  n=${${f:t:r}#clashy-web-}
  case $n in
    og)
      cwebp -quiet -q 86 $f -o $W/og.webp
      sips -s format jpeg -s formatOptions 86 --resampleWidth 1200 $f --out /tmp/clashy-og-$$.jpg >/dev/null
      sips -c 630 1200 /tmp/clashy-og-$$.jpg --out $P/og.jpg >/dev/null; rm -f /tmp/clashy-og-$$.jpg ;;
    hero-scene|faceoff|arena)
      cwebp -quiet -q 88 $f -o $W/$n.webp
      cwebp -quiet -q 84 -resize 1600 0 $f -o $P/$n.webp ;;
    *)
      cwebp -quiet -q 88 -resize 1024 0 $f -o $W/$n.webp
      sz=480; [[ $n == swords ]] && sz=1100
      cwebp -quiet -q 85 -resize $sz 0 $f -o $P/$n.webp ;;
  esac
done
for f in $RAW/clashy-mobile-*.png(N); do
  n=${${f:t:r}#clashy-mobile-}
  case $n in
    app-icon)
      sips -z 1024 1024 $f --out $M/app-icon-1024.png >/dev/null
      cwebp -quiet -q 90 $M/app-icon-1024.png -o $M/app-icon.webp
      cwebp -quiet -q 88 -resize 128 128 $M/app-icon-1024.png -o $P/icon-128.webp
      sips -z 64 64 $M/app-icon-1024.png --out $P/icon-64.png >/dev/null ;;
    *) cwebp -quiet -q 88 -resize 1024 0 $f -o $M/$n.webp ;;
  esac
  case $n in
    avatar-*) cwebp -quiet -q 85 -resize 192 0 $f -o $P/av-${n#avatar-}.webp ;;
    crest-*|badge-*) cwebp -quiet -q 85 -resize 200 0 $f -o $P/$n.webp ;;
    crown|ko-burst|empty-*) cwebp -quiet -q 85 -resize 400 0 $f -o $P/$n.webp ;;
    onboarding|splash|matchmaking|tile-*) cwebp -quiet -q 82 -resize 640 0 $f -o $P/m-$n.webp ;;
  esac
done
du -sh $W $M $P
