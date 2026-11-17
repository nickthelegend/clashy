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
"cup-big|1:1|the trophy gives a proud little hop and the sparkles around it twinkle"
"inbox-bell|1:1|the bell swings side to side ringing softly and the pink dot pulses"
"megaphone|1:1|the megaphone gives two happy shouts, its sound wave arcs pulse outward"
"gift|1:1|the gift box bounces and its bow wiggles as if it wants to be opened"
"podium|1:1|the gold star on the top step spins once and the podium gives a small bounce"
"clubhouse|1:1|the window light flickers warmly and the flag on the roof waves gently"
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
