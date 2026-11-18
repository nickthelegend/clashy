#!/usr/bin/env bash
# Start the local MagicBlock stack (validators run in the background), then stay up and stream their logs.
set -euo pipefail
cd /app/chain
[ -f target/deploy/clashy.so ] || { echo "Setup required: build the program first (chain: anchor build) so target/deploy/clashy.so exists" >&2; exit 1; }
bash scripts/localnet.sh
exec tail -n 20 -F .localnet/*.log
