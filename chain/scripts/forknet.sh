#!/usr/bin/env bash
# A mainnet fork for real-trade rehearsal: solana-test-validator cloning, from mainnet, the Phoenix
# program, Phoenix's SOL/USDC market (its live order book at fork time), the market's vaults and
# the USDC mint. Trades against it fill against real resting mainnet orders, with no real funds.
#
#   :8911  fork RPC (faucet :9911)
#
# FORK_RESET=1 re-snapshots the order book from mainnet.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$HERE/.forknet"
PORT=8911
MAINNET="${MAINNET_RPC:-https://api.mainnet-beta.solana.com}"
PHOENIX=PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY
MARKET=4DoNfFBfF7UokCC2FQzriy7yHK6DY6NVdYpuekQ5pRgg   # Phoenix SOL/USDC
USDC=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1; }

if [ "${FORK_RESET:-}" = "1" ]; then
  lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2; rm -rf "$DIR"
fi
if up $PORT; then echo "fork already up on :$PORT"; exit 0; fi
mkdir -p "$DIR"

# the market's vaults are PDAs [b"vault", market, mint]
VAULTS=$(cd "$HERE" && node -e "
const {PublicKey}=require('@solana/web3.js');
const m=new PublicKey('$MARKET'),p=new PublicKey('$PHOENIX');
for (const mint of ['So11111111111111111111111111111111111111112','$USDC'])
  console.log(PublicKey.findProgramAddressSync([Buffer.from('vault'),m.toBuffer(),new PublicKey(mint).toBuffer()],p)[0].toBase58());")

ARGS=(--url "$MAINNET" --clone-upgradeable-program "$PHOENIX" --clone "$MARKET" --clone "$USDC")
for v in $VAULTS; do ARGS+=(--clone "$v"); done
echo "forking mainnet: Phoenix, SOL/USDC market $MARKET, vaults $VAULTS, USDC"
solana-test-validator --ledger "$DIR/ledger" --rpc-port $PORT --faucet-port 9911 --gossip-port 8920 \
  --dynamic-port-range 8921-8960 --limit-ledger-size 20000000 "${ARGS[@]}" >"$DIR/fork.log" 2>&1 &
for _ in $(seq 1 90); do
  curl -fsS "http://127.0.0.1:$PORT" -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q ok && { echo "fork ready on :$PORT"; exit 0; }
  sleep 2
done
echo "!! fork never became healthy; see $DIR/fork.log" >&2; exit 1
