#!/bin/zsh
# Round 2 (Nov 17): spends the last Higgsfield credits on Weekly Cup, inbox, podium, calls, clubhouse and reward art,
# then loops the six best. Images first, then real alpha, then black start frames, then Kling loops.
cd "${0:A:h}"
zsh gen-images2.sh
for f in cup-big inbox-bell podium megaphone clubhouse gift level-star calendar-week break-moon invite-hands; do
  [ -f out/$f.png ] && python3 to-alpha.py out/$f.png alpha/$f.png
done
python3 - <<'PY'
from PIL import Image
for n in ['cup-big','inbox-bell','megaphone','gift','podium','clubhouse']:
    try:
        im=Image.open('alpha/'+n+'.png'); im.thumbnail((737,737))
        bg=Image.new('RGBA',(1024,1024),(0,0,0,255)); bg.alpha_composite(im,((1024-im.width)//2,(1024-im.height)//2)); bg.convert('RGB').save('frames/'+n+'.png')
    except FileNotFoundError: print('missing', n)
PY
zsh gen-loops2.sh
