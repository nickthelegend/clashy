# Tonight's deploy: clashy.fun public beta (devnet)

These are the exact steps to go from a parked domain to `clashy.fun` (landing) plus `play.clashy.fun` (app), with the
program on Solana devnet and the MagicBlock devnet Ephemeral Rollup. Practice money only. Steps marked **Nick** need
his accounts. The rest is me.

## 0. What Nick provides (about 30 min)

1. **A server.**
   - Linux x86, 2 vCPU, 4 GB RAM, Ubuntu 24.04, with Docker and Docker Compose.
   - Either the VPS that already runs our relay, or a new small VM.
   - I need SSH access as a non-root user in the `docker` group.
2. **DNS at Hostinger.** In hPanel → Domains → clashy.fun → DNS, replace the parking records with:

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | A | `@` | the server's IPv4 | 300 |
   | A | `play` | the server's IPv4 | 300 |
   | CNAME | `www` | `clashy.fun` | 300 |

   Delete any parking A or AAAA records for `@`. Caddy gets the HTTPS certificates by itself once DNS resolves.
3. **Devnet SOL, about 21 in total.**
   - About 19 for the deployer `6XdpT4cYBZBMMNXnxzoRYWMxtQk3FuooB98bAp79nYbe`. The program is 1,318,744 bytes, so it
     locks 9.18 SOL of rent for as long as it exists. `deploy.sh` also wants room for the upload buffer (another
     9.18 SOL, refunded when the deploy ends) plus 0.2 SOL for fees and setup.
   - About 2 for the sponsor (its address comes in step 2).
   - Get it from faucet.solana.com, signed in with GitHub; repeat the requests as the limit allows.
4. **Privy dashboard** → the Clashy app → Allowed origins: add `https://clashy.fun` and `https://play.clashy.fun`.

## 1. Build (on the Mac)

```bash
cd chain && anchor build
```

The web app's API addresses are fixed at build time:

```bash
cd app && EXPO_PUBLIC_CLASHY_SPONSOR=https://play.clashy.fun/relay EXPO_PUBLIC_CLASHY_SOCIAL=https://play.clashy.fun/social \
  npx expo export -p web --output-dir dist
```

```bash
cd landing && npm run build
```

## 2. Keys (on the Mac, in `chain/.keys/`, which is gitignored; never printed)

The deployer `devnet-deployer.json` is the admin and upgrade key. It stays on the Mac and never goes to a server.
Generate the other three roles; each command prints only the public key:

```bash
cd chain/.keys && for k in sponsor crank treasury; do solana-keygen new --no-bip39-passphrase -s -o devnet-$k.json >/dev/null && solana-keygen pubkey devnet-$k.json; done
```

```bash
chmod 600 chain/.keys/devnet-*.json
```

Only the sponsor and crank keys go to the server, over SSH. The treasury stays off it; only its public key is used.

```bash
ssh <server> 'mkdir -p ~/clashy/chain/.keys && chmod 700 ~/clashy/chain/.keys'
```

```bash
scp chain/.keys/devnet-sponsor.json chain/.keys/devnet-crank.json <server>:~/clashy/chain/.keys/
```

```bash
ssh <server> 'chmod 600 ~/clashy/chain/.keys/*.json'
```

## 3. Program to devnet (from the Mac, once funded)

```bash
cd chain && CLASHY_AUTHORITY=.keys/devnet-deployer.json CLASHY_CRANK=.keys/devnet-crank.json CLASHY_SPONSOR=.keys/devnet-sponsor.json   CLASHY_TREASURY=$(solana-keygen pubkey .keys/devnet-treasury.json) CLASHY_ER=<MagicBlock devnet ER url> CLASHY_ER_VALIDATOR=<its validator>   bash scripts/deploy.sh devnet
```

`deploy.sh` checks the balance first, deploys, and runs first-time setup: the config (VRF required, on MagicBlock's base
queue), the price feeds delegated to the rollup, and devnet USDC. It refuses mainnet without `CLASHY_MAINNET_GO=yes`,
which only Nick sets. The explorer link of the deploy transaction goes into the Blitz submission.

## 4. Environment (on the server)

```bash
cp deploy/testnet.env.example deploy/testnet.env
```

Fill it in:

| Key | Value |
|---|---|
| `CLASHY_DOMAIN` | `play.clashy.fun` |
| `CLASHY_APP_ORIGIN` | `https://play.clashy.fun` |
| `CLASHY_BASE` | `https://api.devnet.solana.com` |
| `CLASHY_ER` | MagicBlock's devnet rollup for our region |
| `CLASHY_ER_VALIDATOR` | that rollup's validator identity |
| Key paths | the sponsor and crank files copied in step 2 |
| Privy app id and secret | copied from `chain/.env` on the Mac |
| `CLASHY_SOCIAL_SECRET`, `CLASHY_INDEXER_SECRET` | `openssl rand -hex 32` each |

Then lock the file down:

```bash
chmod 600 deploy/testnet.env
```

## 5. Up

```bash
bash deploy/up.sh testnet
```

This builds the images, starts Caddy, web, relay, crank and social, and runs the preflight. The preflight must pass
every check before anyone outside us gets the link.

## 6. Check

| Check | Expected |
|---|---|
| `curl -s https://play.clashy.fun/relay/info` | devnet, program id, sponsor balance |
| `curl -s https://play.clashy.fun/social/health` | ok |
| Phone at 375 px | Sign in with email, play 3 games, open Practice, send a DM, open a squad |
| Browser console | No errors |
| Sponsor balance | Alert below 0.5 SOL (devnet); the relay already refuses work when it is too low |

## 7. Rollback

```bash
docker compose --env-file deploy/testnet.env --profile prod down
```

Then put the Hostinger parking records back. The program on devnet can stay; it holds only test tokens.

## Not tonight

These wait for phase 2, after the lawyer, the audit fixes and Nick's go:
- mainnet
- real USDC
- deposits and withdrawals
- cash prizes
