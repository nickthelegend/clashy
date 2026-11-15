#!/bin/zsh
# Copies the clay art the landing page uses from assets/ into landing/public/art (sized for the web).
set -e
ROOT=${0:A:h:h}; A=$ROOT/assets; P=$ROOT/landing/public/art
mkdir -p $P
q() { cwebp -quiet -q 84 -alpha_q 92 "$@" }
w() { [[ -f $1 ]] && dwebp -quiet "$1" -o /tmp/clashy-sync.png && q -resize $3 0 /tmp/clashy-sync.png -o "$2" || echo "missing $1" }
for f in $A/mobile/avatar-*.webp(N); do n=${${f:t:r}#avatar-}; w $f $P/av-$n.webp 192; done
for f in $A/mobile/{tile,crest,rank,badge,medal,sticker,empty}-*.webp(N); do w $f $P/${f:t} 240; done
for n in crown ko-burst win-trophy confetti; do w $A/mobile/$n.webp $P/$n.webp 320; done
for f in $A/mobile/banner-*.webp(N); do w $f $P/${f:t} 900; done
for n in hero-duo clan-banner coins-pile; do w $A/web/$n.webp $P/$n.webp 1200; done
w $A/web/phone-hand.webp $P/phone-hand.webp 900
w $A/web/og.webp $P/og.webp 1200
[[ -f $A/mobile/app-icon-1024.png ]] && sips -z 64 64 $A/mobile/app-icon-1024.png --out $P/icon-64.png >/dev/null
# clay video loops (web copies: H.264 + webp poster)
mkdir -p $ROOT/landing/public/video
for f in $A/video/web/*.(mp4|webp)(N); do cp $f $ROOT/landing/public/video/; done
rm -f /tmp/clashy-sync.png
ls $P | wc -l
