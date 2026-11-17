#!/bin/zsh
# Nov 17 art round (Higgsfield GPT Image 2): Stash, stocks, streaks, limits and the spend→save→invest journey,
# in the soft-clay style of docs/ART-3D.md. Text-only style (a reference image makes GPT Image 2 copy it).
# The Pro plan runs 4 jobs at once, so this keeps 3 in flight. Finished jobs (logs/<name>.json) are skipped.
cd "${0:A:h}"
mkdir -p out logs
export STYLE="premium soft clay 3D render, like hand-made matte play-dough or plasticine: soft rounded chunky forms, a visible subtle thumb-press and fingerprint texture, matte surface (no gloss, no shine), gentle soft studio light from the upper left, a soft contact shadow under the subject. Cute but premium, like Apple Memoji clay or Headspace polish. Palette: indigo #5B6CFF, hot pink #F0468C, warm gold #FFC94A, fresh mint green #3DDC97, plus soft cream and white. No outlines, no sticker border, no comic style, no halftone, no text, no letters, no logos. Original design, not from any existing game or brand."

run() { # kind name aspect prompt
  local kind=$1 name=$2 aspect=$3 prompt=$4
  grep -q '"completed"' "logs/$name.json" 2>/dev/null && return 0
  local try
  for try in {1..30}; do
  if [[ $kind == obj ]]; then
    higgsfield generate create gpt_image_2 --prompt "$prompt. Single centered object, transparent background (real alpha). $STYLE" \
      --background transparent --resolution 1k --quality high --aspect_ratio 1:1 --wait --json > "logs/$name.json" 2> "logs/$name.err"
  else
    higgsfield generate create gpt_image_2 --prompt "$prompt. Plain pure black background. $STYLE" \
      --background opaque --resolution 2k --quality high --aspect_ratio "$aspect" --wait --json > "logs/$name.json" 2> "logs/$name.err"
  fi
  grep -q rate_limit_reached "logs/$name.err" 2>/dev/null || break
  sleep 20
  done
  echo "$name: $(grep -o '"status": *"[a-z_]*"' "logs/$name.json" | head -1)"
}
export -f run 2>/dev/null

JOBS=(
"obj|cup-big|1:1|a big chunky gold clay trophy cup with two handles, a pink star on the front and tiny sparkles around it, sitting on an indigo clay base"
"obj|inbox-bell|1:1|a chunky clay notification bell in gold with a tiny friendly face and a small hot pink dot on its top right"
"obj|podium|1:1|a chunky three-step clay podium in indigo, pink and gold with the numbers shaped as soft clay bumps, no text, a small gold star on the top step"
"obj|megaphone|1:1|a chunky clay megaphone in hot pink with a tiny friendly face, two little sound wave arcs coming out"
"obj|clubhouse|1:1|a small cosy clay clubhouse with a round door, warm lit window and an indigo flag with a gold lightning bolt on the roof"
"obj|gift|1:1|a chunky clay gift box in indigo with a gold ribbon bow and a tiny friendly face"
"obj|level-star|1:1|a chunky gold clay star badge with a tiny friendly face and a small mint up arrow above it"
"obj|calendar-week|1:1|a chunky cream clay calendar card showing a row of seven little rounded squares, five with mint check marks, a tiny friendly face at the top"
"obj|break-moon|1:1|a calm sleepy clay crescent moon in soft indigo resting on a small cream clay pillow, eyes closed, peaceful"
"obj|invite-hands|1:1|two chunky clay hands, one indigo and one hot pink, doing a friendly high five with a small gold star burst"
)
for j in "${JOBS[@]}"; do
  IFS='|' read -r kind name aspect prompt <<< "$j"
  while (( $(jobs -r | wc -l) >= 2 )); do sleep 2; done
  run "$kind" "$name" "$aspect" "$prompt" &
done
wait
python3 fetch.py
