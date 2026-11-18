# Clashy in Docker

Clashy's backend runs as five containers:

| Container | What it does | Port | Memory cap |
|---|---|---|---|
| `relay` | Sponsor relay, market-data cache, price history | :8790 | 320 MB |
| `crank` | Live prices to the rollup and Solana | — | 320 MB |
| `social` | DMs, follows, notifications | :8791 | 160 MB |
| `web` | nginx serving the Expo web build | :8080 | 64 MB |
| `chain` (optional) | Solana test validator, MagicBlock Ephemeral Rollup, MagicBlock VRF oracle | :8999, :7799 | 4 GB |

`caddy` (HTTPS) is added for production. How the pieces fit: [docs/SYSTEM-DESIGN.md](../docs/SYSTEM-DESIGN.md).

## Before the first run

```bash
cd chain && anchor build            # target/idl and target/types go into the images; target/deploy is mounted
cd app && npx expo export -p web --output-dir dist   # the web container serves app/dist
```

Keys are never copied into an image:
- The local stack reads `chain/.keys`, mounted read-only.
- Devnet and mainnet read the files `CLASHY_SPONSOR` and `CLASHY_AUTHORITY` point at.
- Privy secrets come from `chain/.env` (gitignored).

## Mac with Apple Silicon (development)

Anza ships no Linux arm64 validator build. So the chain runs natively, and the services run in Docker against it:

```bash
colima start --cpu 2 --memory 3 --mount "$PWD:w"     # once (Docker Desktop works too)
bash chain/scripts/localnet.sh                       # base :8999, rollup :7799, VRF oracle
docker compose up -d                                 # relay, crank, social, web
docker compose ps
curl localhost:8791/health && curl localhost:8790/info
```

Stop your native `scripts/sponsor.ts` and `scripts/crank.ts` first, because they use the same ports and feeds.

## x86 Linux server (everything, including the chain)

```bash
CHAIN_HOST=chain docker compose --profile chain up -d
```

## Production (devnet or mainnet, one VM)

Write `.env` next to `docker-compose.yml`:

```
CLASHY_DOMAIN=play.clashy.fun
CLASHY_ENV=devnet
CLASHY_LOCAL=0
CLASHY_APP_ORIGIN=https://play.clashy.fun
CLASHY_SOCIAL_SECRET=<64 random characters>
CLASHY_TRUST_PROXY=1
CLASHY_BASE=https://api.devnet.solana.com
CLASHY_ER=https://devnet-eu.magicblock.app
```

Then:
- Put `CLASHY_ER_VALIDATOR`, `CLASHY_SPONSOR`, `CLASHY_AUTHORITY`, `CLASHY_TREASURY` and the
  Privy keys in `chain/.env`.
- Build the app with `EXPO_PUBLIC_CLASHY_SPONSOR=https://<domain>/relay` and
  `EXPO_PUBLIC_CLASHY_SOCIAL=https://<domain>/social`.
- Run `docker compose --profile prod up -d`.

## Checks

```bash
cd server && npm test                                  # 3 end-to-end tests, real signatures
node server/test/load.ts http://127.0.0.1:8791 100 30   # 100 players for 30 s
```

**Measured Nov 19** (100 players for 30 s):

| Measure | Result |
|---|---|
| Throughput | 86 req/s |
| Latency | p50 2.9 ms, p95 8.1 ms, p99 17.9 ms |
| Errors | 0 |
| Social container memory | 34 MB |
