#!/bin/zsh
# Copies the shared Clashy art (../assets) into the landing as web-sized PNGs.
# Same filenames as assets/mobile, so a new art pass (e.g. the clay set) upgrades the site with one run.
set -e
HERE="${0:A:h}/.."; SRC="$HERE/../assets/mobile"; OUT="$HERE/public/a"
mkdir -p "$OUT"
conv() { sips -s format png -Z "$2" "$SRC/$1.webp" --out "$OUT/$1.png" >/dev/null; }
jpg() { sips -s format jpeg -s formatOptions 78 -Z "$2" "$SRC/$1.webp" --out "$OUT/$1.jpg" >/dev/null; }  # opaque art only
rm -f "$OUT"/*
for f in banner-duel banner-line banner-war banner-royale banner-bounty; do jpg $f 1100; done
for f in win-trophy vs crown ko-burst ko-skull confetti radar tile-duel tile-line tile-war tile-royale tile-bounty; do conv $f 420; done
for f in $(cd "$SRC" && ls avatar-*.webp crest-*.webp rank-*.webp medal-*.webp sticker-*.webp | sed 's/\.webp$//'); do conv $f 160; done
# landing-only clay pieces from assets/web
WEBSRC="$HERE/../assets/web"
for f in hero-duo coins-pile clan-banner; do sips -s format png -Z 1100 "$WEBSRC/$f.webp" --out "$OUT/$f.png" >/dev/null; done
sips -s format png -Z 900 "$WEBSRC/phone-hand.webp" --out "$OUT/phone-hand.png" >/dev/null
python3 "$HERE/scripts/screen-mask.py" "$WEBSRC/phone-hand.webp" "$OUT/screen-mask.png"
cp "$HERE/../assets/brand/wordmark.svg" "$OUT/wordmark.svg"
echo "synced $(ls "$OUT" | wc -l | tr -d ' ') files into public/a ($(du -sh "$OUT" | cut -f1))"
