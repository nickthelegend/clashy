#!/bin/zsh
# Nov 17 clay loops (Higgsfield Kling 3.0, image-to-video, 5 s, no sound). Start and end frame are the same
# image, so each clip loops seamlessly like the existing assets/video/*-loop.mp4. Two jobs in flight.
cd "${0:A:h}"
mkdir -p vlogs
LOOK="Soft clay stop-motion feel, matte play-dough material, the object keeps its exact shape, colours and face. Static camera, no zoom, no cuts. The pure black background stays pure black and empty. Gentle, cute, premium motion that returns exactly to the first frame so the clip loops seamlessly."

run() { # name aspect prompt
  local name=$1 aspect=$2 prompt=$3 try
  grep -q '"completed"' "vlogs/$name.json" 2>/dev/null && return 0
  for try in {1..30}; do
    higgsfield generate create kling3_0 --prompt "$prompt. $LOOK" --start-image "frames/$name.png" --end-image "frames/$name.png" \
      --aspect_ratio "$aspect" --duration 5 --sound off --mode std --wait --wait-timeout 20m --json > "vlogs/$name.json" 2> "vlogs/$name.err"
    grep -q rate_limit_reached "vlogs/$name.err" 2>/dev/null || break
    sleep 30
  done
  echo "$name: $(grep -o '"status": *"[a-z_]*"' "vlogs/$name.json" | head -1)"
}

JOBS=(
"stash-jar|1:1|the savings jar gives a happy little bounce as three gold coins drop into it one by one, and the green sprout on the lid sways"
"roundup-coin|1:1|the gold coin hops up, does one slow spin and lands back softly, the little puffs drift"
"streak-flame|1:1|the clay flame flickers and dances gently and blinks its eyes, sitting on the calendar"
"limit-shield|1:1|the shield sways calmly, the gold padlock gives one small click and the shield smiles"
"market-clock|1:1|the alarm clock's two bells jiggle as if ringing softly, the hands tick forward a little, then it settles"
"chat-bubbles|1:1|the two speech bubbles bob up and down in turn like they are chatting, the star twinkles"
"spend-card|1:1|the card taps the payment terminal, the terminal's buttons light up and the card lifts back up"
"goal-target|1:1|a gold coin flies in and lands in the bullseye with a soft wobble of the target, then the coin fades out"
"stocks|1:1|the chip, the car, the phone and the basket of buildings each give a small happy bounce one after another"
"onboard-spend|9:16|the card taps the terminal, gold coins arc across into the savings jar, the sprout sways"
"onboard-invest|9:16|the jar tips and pours coins, the little stock figures on their podiums bounce and their green arrows pulse upward"
"onboard-squad|9:16|the four friends cheer and bob in their round badges, the coins in the jar glint"
"clan-banner|16:9|warm windows twinkle on and off across the little clay city and the flag on the top waves gently"
"journey-hero|16:9|each piece along the path gives a small bounce from left to right: the card, the jar, the stock figures and the crossed swords whose star sparkles"
)
for j in "${JOBS[@]}"; do
  IFS='|' read -r name aspect prompt <<< "$j"
  while (( $(jobs -r | wc -l) >= 2 )); do sleep 3; done
  run "$name" "$aspect" "$prompt" &
done
wait
python3 - <<'EOF'
import glob, json, os, urllib.request
def urls(o):
    if isinstance(o, str) and o.startswith('http'): yield o
    elif isinstance(o, dict):
        for v in o.values(): yield from urls(v)
    elif isinstance(o, list):
        for v in o: yield from urls(v)
os.makedirs('vout', exist_ok=True)
for f in sorted(glob.glob('vlogs/*.json')):
    n = os.path.basename(f)[:-5]
    try: d = json.load(open(f))
    except Exception: print('failed', n); continue
    j = d[0] if isinstance(d, list) else d
    mp4 = [u for u in urls(j) if '.mp4' in u]
    if j.get('status') == 'completed' and mp4:
        urllib.request.urlretrieve(mp4[0], f'vout/{n}.mp4'); print('ok', n)
    else: print('failed', n, j.get('status'))
EOF
