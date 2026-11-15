#!/bin/zsh
# Converts the raw ChatGPT PNGs (clashy-web-*.png, clashy-mobile-*.png) in $1 into
#   assets/web/*.webp, assets/mobile/*.webp (+ the 1024 app icon PNG) at full quality, and
#   web/public/art/* at the sizes the website uses.
set -e
RAW=${1:?raw dir}
ROOT=${0:A:h:h}
W=$ROOT/assets/web; M=$ROOT/assets/mobile; P=$ROOT/web/public/art
mkdir -p $W $M $P
for f in $RAW/clashy-web-*.png(N); do
  n=${${f:t:r}#clashy-web-}
  if [[ $n == og ]]; then
    cwebp -quiet -q 86 $f -o $W/og.webp
    # 1200x630 social card for the site
    sips -s format jpeg -s formatOptions 86 --resampleWidth 1200 $f --out /tmp/clashy-og-$$.jpg >/dev/null
    sips -c 630 1200 /tmp/clashy-og-$$.jpg --out $P/og.jpg >/dev/null; rm -f /tmp/clashy-og-$$.jpg
  else
    cwebp -quiet -q 88 -alpha_q 95 -resize 1024 0 $f -o $W/$n.webp
    sz=420; [[ $n == swords ]] && sz=1120
    cwebp -quiet -q 85 -alpha_q 90 -resize $sz 0 $f -o $P/$n.webp
  fi
done
for f in $RAW/clashy-mobile-*.png(N); do
  n=${${f:t:r}#clashy-mobile-}
  case $n in
    app-icon)
      sips -z 1024 1024 $f --out $M/app-icon-1024.png >/dev/null
      cwebp -quiet -q 90 $M/app-icon-1024.png -o $M/app-icon.webp
      cwebp -quiet -q 88 -resize 128 128 $M/app-icon-1024.png -o $P/icon-128.webp
      sips -z 64 64 $M/app-icon-1024.png --out $P/icon-64.png >/dev/null ;;
    splash|onboarding|tile-*) cwebp -quiet -q 86 $f -o $M/$n.webp ;;
    *) cwebp -quiet -q 88 -alpha_q 95 -resize 1024 0 $f -o $M/$n.webp ;;
  esac
  case $n in
    avatar-*) cwebp -quiet -q 85 -alpha_q 90 -resize 192 0 $f -o $P/av-${n#avatar-}.webp ;;
    crest-*) cwebp -quiet -q 85 -alpha_q 90 -resize 160 0 $f -o $P/$n.webp ;;
    crown) cwebp -quiet -q 85 -alpha_q 90 -resize 400 0 $f -o $P/crown.webp ;;
    onboarding|tile-*) cwebp -quiet -q 82 -resize 600 0 $f -o $P/m-$n.webp ;;
  esac
done
du -sh $W $M $P
