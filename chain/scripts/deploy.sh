#!/usr/bin/env bash
# Deploys the Clashy program to devnet or mainnet and runs first-time setup (config with VRF required and
# MagicBlock's base VRF queue, three price feeds delegated to the rollup, Solana base feeds).
#
#   CLASHY_AUTHORITY=/path/to/admin.json   admin + crank keypair (file path; never printed)
#   CLASHY_TREASURY=<pubkey>               wallet that receives the rake
#   CLASHY_ER=<url>                        MagicBlock Ephemeral Rollup RPC for that cluster
#   CLASHY_ER_VALIDATOR=<pubkey>           that rollup's validator identity
#   CLASHY_SPONSOR=/path/to/sponsor.json   fee + rent sponsor keypair for the relay (file path; never printed; needs SOL)
#   chain/.env with CLASHY_PRIVY_APP_ID and CLASHY_PRIVY_APP_SECRET   off the local stack the relay requires Privy sign-in
#   CLASHY_USDC_MINT=<pubkey>              optional: defaults to Circle's USDC (devnet 4zMM…ncDU, mainnet EPjF…Dt1v)
#   bash scripts/deploy.sh devnet
#
# Mainnet moves real money and also needs CLASHY_MAINNET_GO=yes, which only Nick sets.
# After setup, run the crank as a service with the same environment: npx tsx scripts/crank.ts
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"
CLUSTER="${1:-}"
case "$CLUSTER" in
  devnet)  URL="${CLASHY_BASE:-https://api.devnet.solana.com}"
           export CLASHY_USDC_MINT="${CLASHY_USDC_MINT:-4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU}" ;;
  mainnet) URL="${CLASHY_BASE:-https://api.mainnet-beta.solana.com}"
           if [ "${CLASHY_MAINNET_GO:-}" != "yes" ]; then
             echo "Refusing mainnet: it moves real money. Set CLASHY_MAINNET_GO=yes only with Nick's go-ahead." >&2; exit 1
           fi
           export CLASHY_USDC_MINT="${CLASHY_USDC_MINT:-EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v}" ;;
  *) echo "usage: bash scripts/deploy.sh devnet|mainnet" >&2; exit 1 ;;
esac

missing=()
for v in CLASHY_AUTHORITY CLASHY_TREASURY CLASHY_ER CLASHY_ER_VALIDATOR CLASHY_SPONSOR; do
  [ -n "${!v:-}" ] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Setup required: set ${missing[*]} (see the header of this script)." >&2; exit 1
fi
[ -f "$CLASHY_AUTHORITY" ] || { echo "Setup required: CLASHY_AUTHORITY is not a file" >&2; exit 1; }
[ -f "$CLASHY_SPONSOR" ] || { echo "Setup required: CLASHY_SPONSOR is not a file" >&2; exit 1; }
grep -q '^CLASHY_PRIVY_APP_SECRET=.' .env 2>/dev/null || { echo "Setup required: chain/.env needs CLASHY_PRIVY_APP_ID and CLASHY_PRIVY_APP_SECRET (the relay requires Privy sign-in off the local stack)" >&2; exit 1; }

SO=target/deploy/clashy.so
[ -s "$SO" ] || { echo "Build first: anchor build" >&2; exit 1; }
SIZE=$(stat -f%z "$SO" 2>/dev/null || stat -c%s "$SO")
ADMIN=$(solana-keygen pubkey "$CLASHY_AUTHORITY")
HAVE=$(solana balance "$ADMIN" --url "$URL" --lamports | awk '{print $1}')
# a deploy holds the program twice for a moment (buffer + program data), plus fees and setup accounts
RENT=$(solana rent "$SIZE" --url "$URL" --lamports | awk '/Rent-exempt minimum/ {print $3}')
NEED=$(( RENT * 2 + 200000000 ))
echo "cluster $CLUSTER · program $(solana-keygen pubkey target/deploy/clashy-keypair.json) · $SIZE bytes"
echo "admin $ADMIN has $HAVE lamports; the deploy needs about $NEED"
if [ "$HAVE" -lt "$NEED" ]; then
  echo "Not enough SOL on $ADMIN for the deploy (have $HAVE, need about $NEED lamports)." >&2; exit 1
fi

solana program deploy "$SO" --program-id target/deploy/clashy-keypair.json \
  --keypair "$CLASHY_AUTHORITY" --upgrade-authority "$CLASHY_AUTHORITY" --url "$URL"

CLASHY_BASE="$URL" npx tsx scripts/crank.ts --setup-only
cat <<EOF

Deployed and set up on $CLUSTER. Next:
  1. Run the crank and the sponsor relay as services with this environment:
       CLASHY_BASE=$URL npx tsx scripts/crank.ts
       CLASHY_BASE=$URL CLASHY_APP_ORIGIN=<app origin> npx tsx scripts/sponsor.ts   (the sponsor wallet needs SOL)
  2. Point the app at it: EXPO_PUBLIC_CLASHY_BASE=$URL EXPO_PUBLIC_CLASHY_ER=$CLASHY_ER
     EXPO_PUBLIC_CLASHY_ER_VALIDATOR=$CLASHY_ER_VALIDATOR EXPO_PUBLIC_CLASHY_NET=$CLUSTER
     EXPO_PUBLIC_CLASHY_USDC_MINT=$CLASHY_USDC_MINT EXPO_PUBLIC_CLASHY_SPONSOR=<relay url> EXPO_PUBLIC_PRIVY_APP_ID=<app id>
EOF
