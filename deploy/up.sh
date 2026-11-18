#!/usr/bin/env bash
# Start Clashy for testnet or mainnet on one VM: build, start the stack behind Caddy, then run the preflight.
#   bash deploy/up.sh testnet      (needs deploy/testnet.env, from deploy/testnet.env.example)
#   bash deploy/up.sh mainnet
set -euo pipefail
cd "$(dirname "$0")/.."
T=${1:?usage: deploy/up.sh testnet|mainnet}
F="deploy/$T.env"
[ -f "$F" ] || { echo "Setup required: copy deploy/$T.env.example to $F and fill it in" >&2; exit 1; }
[ "$(stat -f %Lp "$F" 2>/dev/null || stat -c %a "$F")" = "600" ] || { echo "chmod 600 $F first: it holds secrets" >&2; exit 1; }
export CLASHY_DEPLOY_ENV="$F"
docker compose --env-file "$F" build
docker compose --env-file "$F" --profile prod up -d
docker compose --env-file "$F" run --rm --no-deps -e CLASHY_SOCIAL=http://social:8791 -e CLASHY_RELAY=http://relay:8790 relay npx tsx scripts/preflight.ts "$T"
