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
"obj|roundup-coin|1:1|a gold clay coin with a tiny friendly face and a small mint-green up arrow on it, hopping upward with two tiny motion puffs"
"obj|stock-chip|1:1|a chunky clay computer microchip with little legs and a tiny friendly face, indigo body with gold pins"
"obj|stock-car|1:1|a chunky rounded clay electric car with a tiny friendly face on the front, hot pink body"
"obj|stock-phone|1:1|a chunky rounded clay smartphone with a tiny friendly face on its screen, cream body"
"obj|stock-index|1:1|a small clay basket holding three tiny rounded skyscrapers in indigo, pink and gold, the basket has a tiny friendly face"
"obj|stock-search|1:1|a chunky clay magnifying glass with a tiny friendly face in the lens, gold handle and mint lens"
"obj|streak-flame|1:1|a chunky clay flame with a tiny friendly face, orange and gold, sitting on a small cream clay calendar page"
"obj|goal-target|1:1|a round clay target in indigo and cream with a gold clay coin in the bullseye and a tiny friendly face"
"obj|limit-shield|1:1|a chunky clay shield in indigo with a small gold padlock on it and a calm tiny friendly face"
"obj|market-clock|1:1|a chunky clay alarm clock with two bells on top and a tiny friendly face, cream and indigo"
"obj|spend-card|1:1|a chunky clay debit card with a tiny friendly face, indigo with a gold chip, tapping a small cream clay payment terminal"
"obj|chat-bubbles|1:1|two chunky clay speech bubbles, one indigo and one hot pink, overlapping, each with a tiny friendly face"
"scene|onboard-spend|2:3|a cute clay debit card with a tiny face taps a little payment terminal; the small change rounds up and a stream of gold clay coins flows into a smiling indigo savings jar with a mint sprout on the lid"
"scene|onboard-invest|2:3|a smiling indigo clay savings jar pours gold coins into a row of cute clay tokens standing on little podiums: a microchip, an electric car and a smartphone, each with a tiny face and a small mint-green up arrow"
"scene|onboard-squad|2:3|four cute rounded clay characters with big round eyes and rosy cheeks, each framed in a round indigo badge with a gold rim, cheering around a gold trophy and a savings jar full of coins"
"scene|clan-banner|16:9|a cozy clay night city of tiny rounded buildings with warm lit windows, a small indigo flag with a gold lightning bolt on the tallest roof, soft purple sky glow at the horizon"
"scene|journey-hero|16:9|a left-to-right clay journey on a soft path: a debit card with a face, then an indigo savings jar full of gold coins, then cute tokens (microchip, car, phone) on podiums with mint up arrows, then two crossed clay swords with a gold star"
)
for j in "${JOBS[@]}"; do
  IFS='|' read -r kind name aspect prompt <<< "$j"
  while (( $(jobs -r | wc -l) >= 2 )); do sleep 2; done
  run "$kind" "$name" "$aspect" "$prompt" &
done
wait
python3 fetch.py
