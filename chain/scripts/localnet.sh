#!/usr/bin/env bash
# Starts the local MagicBlock stack Clashy is tested against, then deploys the program.
#
#   :8999  base L1  mb-test-validator (solana-test-validator with the delegation program DELeGG…),
#                   plus MagicBlock's committor program ComtrB2K… (fetched once from devnet)
#   :7799  rollup   ephemeral-validator pointed at the base layer
#
# CLASHY_RESET=1 starts both from genesis (they share one ledger dir, so they are always reset together).
# Ledgers live in chain/.localnet on the SSD, not in /tmp on the boot disk.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
BASE_PORT=8999
ER_PORT=7799
HOST=127.0.0.1
DIR="$HERE/.localnet"
mkdir -p "$DIR"
up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }
wait_rpc() {
  for _ in $(seq 1 120); do
    curl -fsS "http://$HOST:$1" -X POST -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q ok && return 0
    sleep 2
  done
  echo "!! $2 never became healthy on :$1 (logs in $DIR)" >&2
  return 1
}

if [ "${CLASHY_RESET:-}" = "1" ]; then
  for p in "$BASE_PORT" "$ER_PORT"; do lsof -nP -iTCP:"$p" -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true; done
  sleep 2
  rm -rf "$DIR/ledger" "$DIR/er"
fi

COMMITTOR=ComtrB2KEaWgXsW1dhr1xYL4Ht4Bjj3gXnnL6KMdABq
COMMITTOR_SO="$DIR/programs/$COMMITTOR.so"
if [ ! -s "$COMMITTOR_SO" ]; then
  mkdir -p "$DIR/programs"
  solana program dump "$COMMITTOR" "$COMMITTOR_SO" --url https://api.devnet.solana.com >/dev/null 2>&1 \
    && echo "fetched committor $COMMITTOR" || { rm -f "$COMMITTOR_SO"; echo "!! could not fetch the committor program" >&2; }
fi
EXTRA=()
[ -s "$COMMITTOR_SO" ] && EXTRA=(--bpf-program "$COMMITTOR" "$COMMITTOR_SO")

if up "$BASE_PORT"; then echo "base already up on :$BASE_PORT"; else
  echo "starting base on :$BASE_PORT"
  mb-test-validator --rpc-port "$BASE_PORT" --ledger "$DIR/ledger" --faucet-port 9898 \
    --limit-ledger-size 50000000 ${EXTRA[@]+"${EXTRA[@]}"} >"$DIR/base.log" 2>&1 &
  wait_rpc "$BASE_PORT" base
fi

# Fund the local authority and deploy the program (idempotent: upgrades if already there).
URL="http://$HOST:$BASE_PORT"
AUTH=.keys/local-authority.json
solana airdrop 50 "$(solana-keygen pubkey $AUTH)" --url "$URL" >/dev/null 2>&1 || true
solana program deploy target/deploy/clashy.so --program-id target/deploy/clashy-keypair.json \
  --keypair "$AUTH" --upgrade-authority "$AUTH" --url "$URL" >/dev/null && echo "deployed clashy $(solana-keygen pubkey target/deploy/clashy-keypair.json)"

if up "$ER_PORT"; then echo "rollup already up on :$ER_PORT"; else
  echo "starting rollup on :$ER_PORT"
  ephemeral-validator --no-tui --storage "$DIR/er" --listen "$HOST:$ER_PORT" \
    --remotes "http://$HOST:$BASE_PORT" --remotes "ws://$HOST:$((BASE_PORT + 1))" >"$DIR/er.log" 2>&1 &
  wait_rpc "$ER_PORT" rollup
fi
echo "base :$BASE_PORT  rollup :$ER_PORT  ready"
