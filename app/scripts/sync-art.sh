#!/bin/zsh
# Copy the latest generated art (assets/mobile, assets/brand) into the app. Same filenames = whole app upgrades.
set -e
HERE="${0:A:h}/.."
SRC="$HERE/../assets"
cp "$SRC"/mobile/*.webp "$HERE/assets/art/"
cp "$SRC"/desktop/*.webp "$HERE/assets/art/"
mkdir -p "$HERE/assets/art/fx" && cp "$SRC"/mobile/fx/*.webp "$HERE/assets/art/fx/"
cp "$SRC/brand/wordmark@2x.png" "$HERE/assets/art/wordmark.png"
cp "$SRC/mobile/app-icon-1024.png" "$HERE/assets/images/icon.png"
sips -s format png "$SRC/mobile/splash.webp" --out "$HERE/assets/images/splash.png" >/dev/null
echo "synced $(ls "$SRC"/mobile/*.webp | wc -l | tr -d ' ') images"
