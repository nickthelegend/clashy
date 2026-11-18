#!/usr/bin/env bash
# Starts the local MagicBlock stack Clashy is tested against, then deploys the program.
#
#   :8999  base L1  mb-test-validator (solana-test-validator with the delegation program DELeGG…),
#                   plus MagicBlock's committor program ComtrB2K… (fetched once from devnet)
#   :7799  rollup   ephemeral-validator pointed at the base layer
#          vrf      MagicBlock's vrf-oracle answering their local test queue
#          usdc     mainnet USDC's mint address, loaded with a local mint authority (test USDC)
#          stocks   a mainnet snapshot of five xStocks and their Orca Whirlpool USDC pools, plus the Whirlpool
#                   and Token-2022 programs (scripts/fork-stocks.ts), so the Stash buys real tokenized stocks
#
# CLASHY_RESET=1 starts both from genesis (they share one ledger dir, so they are always reset together).
# The old ledger is kept, renamed to .localnet/ledger-<time>, never deleted by this script.
# Ledgers live in chain/.localnet on the SSD, not in /tmp on the boot disk.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
BASE_PORT=8999
ER_PORT=7799
HOST=${CLASHY_BIND:-127.0.0.1}
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
  pkill -f "vrf-oracle --rpc-url http://$HOST:$BASE_PORT" 2>/dev/null || true
  sleep 2
  STAMP=$(date +%Y%m%d-%H%M%S)
  [ -d "$DIR/ledger" ] && mv "$DIR/ledger" "$DIR/ledger-$STAMP"
  [ -d "$DIR/er" ] && mv "$DIR/er" "$DIR/er-$STAMP"
  echo "old ledgers kept as $DIR/ledger-$STAMP and $DIR/er-$STAMP"
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
# The stake currency: mainnet USDC's address with a local mint authority (a fork-style stand-in; see scripts/usdc-mint.ts).
USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
npx tsx scripts/usdc-mint.ts "$DIR/usdc-mint.json"
EXTRA+=(--account "$USDC_MINT" "$DIR/usdc-mint.json")
# Tokenized stocks from mainnet (snapshot once; rerun scripts/fork-stocks.ts and reset to refresh it).
FORK="$DIR/fork"
[ -s "$FORK/stocks.json" ] || npx tsx scripts/fork-stocks.ts
for f in "$FORK"/accounts/*.json; do EXTRA+=(--account "$(basename "$f" .json)" "$f"); done
for so in "$FORK"/programs/*.so; do EXTRA+=(--bpf-program "$(basename "$so" .so)" "$so"); done
# The sponsor pays every fee and rent so players only ever hold USDC. Made once, never printed.
SPONSOR=.keys/local-sponsor.json
[ -s "$SPONSOR" ] || solana-keygen new --no-bip39-passphrase --silent --outfile "$SPONSOR" >/dev/null 2>&1

if up "$BASE_PORT"; then echo "base already up on :$BASE_PORT"; else
  echo "starting base on :$BASE_PORT"
  mb-test-validator --rpc-port "$BASE_PORT" --ledger "$DIR/ledger" --faucet-port 9898 \
    --limit-ledger-size 5000000 ${EXTRA[@]+"${EXTRA[@]}"} >"$DIR/base.log" 2>&1 &
  wait_rpc "$BASE_PORT" base
fi

# Fund the local authority and deploy the program (idempotent: upgrades if already there).
URL="http://$HOST:$BASE_PORT"
AUTH=.keys/local-authority.json
solana airdrop 50 "$(solana-keygen pubkey $AUTH)" --url "$URL" >/dev/null 2>&1 || true
solana airdrop 100 "$(solana-keygen pubkey $SPONSOR)" --url "$URL" >/dev/null 2>&1 || true
solana program deploy target/deploy/clashy.so --program-id target/deploy/clashy-keypair.json \
  --keypair "$AUTH" --upgrade-authority "$AUTH" --url "$URL" >/dev/null && echo "deployed clashy $(solana-keygen pubkey target/deploy/clashy-keypair.json)"

if up "$ER_PORT"; then echo "rollup already up on :$ER_PORT"; else
  echo "starting rollup on :$ER_PORT"
  ephemeral-validator --no-tui --storage "$DIR/er" --listen "$HOST:$ER_PORT" \
    --remotes "http://$HOST:$BASE_PORT" --remotes "ws://$HOST:$((BASE_PORT + 1))" >"$DIR/er.log" 2>&1 &
  wait_rpc "$ER_PORT" rollup
fi
# MagicBlock's VRF oracle (ships with their validator CLI): answers randomness requests on their test queue
# GKE6d7…, which the local config points coin rolls at. Devnet and mainnet use MagicBlock's hosted oracles.
if pgrep -f "vrf-oracle --rpc-url http://$HOST:$BASE_PORT" >/dev/null 2>&1; then echo "vrf-oracle already up"; else
  echo "starting vrf-oracle"
  RUST_LOG=info vrf-oracle --rpc-url "http://$HOST:$BASE_PORT" --websocket-url "ws://$HOST:$((BASE_PORT + 1))" >"$DIR/vrf-oracle.log" 2>&1 &
fi
echo "base :$BASE_PORT  rollup :$ER_PORT  vrf-oracle  ready"
