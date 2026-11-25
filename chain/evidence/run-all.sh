#!/bin/bash
# Runs every on-chain suite on the local MagicBlock stack and keeps a TAP summary.
cd "$(dirname "$0")/.."
for t in magicblock clashy perps brief void; do
  echo "== $t"
  npx tsx --test --test-reporter=tap --test-concurrency=1 tests/$t.test.ts > .localnet/suite-$t.log 2>&1
  grep -E "^(not ok|ok)|^    (not )?ok|^# (pass|fail)|^  (cranked|duel on|royale|settled|void refunded|  cranked)" .localnet/suite-$t.log
done
